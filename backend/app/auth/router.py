"""Authentication API routes."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_token_expiry,
    hash_token,
)
from app.auth.models import RefreshToken, ResourceShare, User
from app.auth.oauth import OAuthUserInfo, get_oauth_provider
from app.auth.schemas import (
    AuthCodeExchange,
    OAuthLoginResponse,
    RefreshTokenRequest,
    ShareCreate,
    ShareListResponse,
    ShareResponse,
    TokenResponse,
    UserApprovalUpdate,
    UserListResponse,
    UserResponse,
)
from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limiter for auth endpoints
limiter = Limiter(key_func=get_remote_address)

# Store OAuth states temporarily (in production, use Redis)
_oauth_states: dict[str, datetime] = {}

# Store temporary auth codes for token exchange (code -> user_id, expires)
# In production, use Redis with TTL
_auth_codes: dict[str, tuple[uuid.UUID, datetime]] = {}


def _cleanup_expired_states():
    """Remove expired OAuth states and auth codes."""
    now = datetime.now(timezone.utc)

    # Clean OAuth states (10 minute expiry)
    expired_states = [
        state
        for state, created in _oauth_states.items()
        if (now - created).total_seconds() > 600
    ]
    for state in expired_states:
        _oauth_states.pop(state, None)

    # Clean auth codes (5 minute expiry)
    expired_codes = [
        code
        for code, (_, expires) in _auth_codes.items()
        if now > expires
    ]
    for code in expired_codes:
        _auth_codes.pop(code, None)


@router.get("/login/{provider}")
@limiter.limit("10/minute")
async def oauth_login(request: Request, provider: str) -> OAuthLoginResponse:
    """
    Get OAuth authorization URL.

    Returns a URL to redirect the user to for OAuth login.
    The frontend should redirect the user to this URL.
    """
    if provider not in ("google", "github"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider: {provider}",
        )

    _cleanup_expired_states()

    oauth = get_oauth_provider(provider)
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = datetime.now(timezone.utc)

    authorization_url = oauth.get_authorization_url(state)

    return OAuthLoginResponse(authorization_url=authorization_url, state=state)


@router.get("/callback/{provider}")
@limiter.limit("10/minute")
async def oauth_callback(
    request: Request,
    provider: str,
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """
    Handle OAuth callback.

    This endpoint receives the callback from the OAuth provider,
    exchanges the code for tokens, creates/updates the user,
    and redirects to the frontend with tokens.
    """
    if provider not in ("google", "github"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider: {provider}",
        )

    # Validate state
    _cleanup_expired_states()
    if state not in _oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state",
        )
    _oauth_states.pop(state)

    # Exchange code for tokens
    oauth = get_oauth_provider(provider)
    try:
        tokens = await oauth.exchange_code(code)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange OAuth code: {e}",
        )

    # Get user info
    access_token = tokens.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No access token in OAuth response",
        )

    try:
        user_info = await oauth.get_user_info(access_token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to get user info: {e}",
        )

    # Find or create user
    user = await _get_or_create_user(db, user_info)

    # Check if user is approved
    if not user.is_approved:
        # Redirect to pending approval page
        redirect_url = f"{settings.frontend_url}/auth/pending"
        return RedirectResponse(url=redirect_url)

    # Generate a temporary auth code (one-time use, short-lived)
    # The frontend will exchange this for tokens via POST request
    auth_code = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    # Store auth code -> user_id mapping
    _auth_codes[auth_code] = (user.id, expires_at)

    # Redirect to frontend with only the auth code (not tokens)
    redirect_url = f"{settings.frontend_url}/auth/callback/{provider}?code={auth_code}"
    return RedirectResponse(url=redirect_url)


async def _get_or_create_user(db: AsyncSession, user_info: OAuthUserInfo) -> User:
    """Get existing user or create new one from OAuth info."""
    # Try to find by OAuth provider + ID
    result = await db.execute(
        select(User).where(
            User.oauth_provider == user_info.provider,
            User.oauth_id == user_info.oauth_id,
        )
    )
    user = result.scalar_one_or_none()

    if user:
        # Update user info
        user.email = user_info.email
        user.name = user_info.name
        user.avatar_url = user_info.avatar_url
        user.last_login_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(user)
        return user

    # Try to find by email (for linking accounts)
    result = await db.execute(select(User).where(User.email == user_info.email))
    existing_by_email = result.scalar_one_or_none()

    if existing_by_email:
        # Update OAuth info for existing email account
        existing_by_email.oauth_provider = user_info.provider
        existing_by_email.oauth_id = user_info.oauth_id
        existing_by_email.avatar_url = user_info.avatar_url
        existing_by_email.last_login_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing_by_email)
        return existing_by_email

    # Create new user
    # First user becomes admin and is auto-approved
    result = await db.execute(select(User).limit(1))
    is_first_user = result.scalar_one_or_none() is None

    user = User(
        email=user_info.email,
        name=user_info.name,
        avatar_url=user_info.avatar_url,
        oauth_provider=user_info.provider,
        oauth_id=user_info.oauth_id,
        is_admin=is_first_user,
        is_approved=is_first_user,  # First user auto-approved, others need approval
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/exchange", response_model=TokenResponse)
@limiter.limit("10/minute")
async def exchange_auth_code(
    request: Request,
    body: AuthCodeExchange,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Exchange a one-time auth code for access and refresh tokens.

    This endpoint is called by the frontend after the OAuth callback redirect.
    The auth code is single-use and expires after 5 minutes.
    """
    _cleanup_expired_states()

    # Look up the auth code
    if body.code not in _auth_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired auth code",
        )

    user_id, expires_at = _auth_codes.pop(body.code)  # Single use - remove immediately

    # Check expiry
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auth code has expired",
        )

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    # Double-check approval status
    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending approval",
        )

    # Create tokens
    jwt_access_token = create_access_token(user)
    refresh_token_id = uuid.uuid4()
    jwt_refresh_token = create_refresh_token(user.id, refresh_token_id)

    # Store refresh token
    refresh_token_record = RefreshToken(
        id=refresh_token_id,
        user_id=user.id,
        token_hash=hash_token(jwt_refresh_token),
        expires_at=get_token_expiry(days=settings.refresh_token_expire_days),
    )
    db.add(refresh_token_record)
    await db.commit()

    return TokenResponse(
        access_token=jwt_access_token,
        refresh_token=jwt_refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh_tokens(
    request: Request,
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Refresh access token using refresh token.

    Returns new access and refresh tokens (token rotation).
    """
    # Decode refresh token
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    try:
        user_id = uuid.UUID(payload["sub"])
        token_id = uuid.UUID(payload["jti"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Find refresh token in database
    token_hash = hash_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.id == token_id,
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
    )
    refresh_token_record = result.scalar_one_or_none()

    if not refresh_token_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found or revoked",
        )

    # Check expiry
    if refresh_token_record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    # Get user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Revoke old refresh token (token rotation)
    refresh_token_record.revoked_at = datetime.now(timezone.utc)

    # Create new tokens
    new_access_token = create_access_token(user)
    new_refresh_token_id = uuid.uuid4()
    new_refresh_token = create_refresh_token(user.id, new_refresh_token_id)

    # Store new refresh token
    new_refresh_token_record = RefreshToken(
        id=new_refresh_token_id,
        user_id=user.id,
        token_hash=hash_token(new_refresh_token),
        device_info=refresh_token_record.device_info,
        expires_at=get_token_expiry(days=settings.refresh_token_expire_days),
    )
    db.add(new_refresh_token_record)
    await db.commit()

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Logout user by revoking all refresh tokens.
    """
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    tokens = result.scalars().all()

    now = datetime.now(timezone.utc)
    for token in tokens:
        token.revoked_at = now

    await db.commit()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> User:
    """Get current user info."""
    return user


@router.post("/share", response_model=ShareResponse)
async def create_share(
    data: ShareCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShareResponse:
    """
    Share a resource with another user.

    Only the owner of a resource can share it.
    """
    # Find target user
    result = await db.execute(
        select(User).where(User.email == data.shared_with_email)
    )
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User not found: {data.shared_with_email}",
        )

    if target_user.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot share with yourself",
        )

    # Verify user owns the resource (this needs to check the actual resource)
    # For now, trust that the endpoint is called correctly
    # TODO: Add resource ownership verification

    # Check if share already exists
    result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.shared_with_id == target_user.id,
            ResourceShare.resource_type == data.resource_type,
            ResourceShare.resource_id == data.resource_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update permission level
        existing.permission_level = data.permission_level
        await db.commit()
        await db.refresh(existing)
        return ShareResponse(
            id=existing.id,
            owner_id=existing.owner_id,
            shared_with_id=existing.shared_with_id,
            shared_with_email=target_user.email,
            shared_with_name=target_user.name,
            resource_type=existing.resource_type,
            resource_id=existing.resource_id,
            permission_level=existing.permission_level,
            created_at=existing.created_at,
            expires_at=existing.expires_at,
        )

    # Create new share
    share = ResourceShare(
        owner_id=user.id,
        shared_with_id=target_user.id,
        resource_type=data.resource_type,
        resource_id=data.resource_id,
        permission_level=data.permission_level,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return ShareResponse(
        id=share.id,
        owner_id=share.owner_id,
        shared_with_id=share.shared_with_id,
        shared_with_email=target_user.email,
        shared_with_name=target_user.name,
        resource_type=share.resource_type,
        resource_id=share.resource_id,
        permission_level=share.permission_level,
        created_at=share.created_at,
        expires_at=share.expires_at,
    )


@router.delete("/share/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(
    share_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Revoke a share.

    Can be done by the owner or the recipient.
    """
    result = await db.execute(select(ResourceShare).where(ResourceShare.id == share_id))
    share = result.scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found",
        )

    # Check permission (owner or recipient can revoke)
    if share.owner_id != user.id and share.shared_with_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to revoke this share",
        )

    await db.delete(share)
    await db.commit()


@router.get("/shares", response_model=ShareListResponse)
async def list_shares(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShareListResponse:
    """
    List all shares for the current user.

    Returns both shares the user owns and shares received.
    """
    # Get owned shares
    owned_result = await db.execute(
        select(ResourceShare, User)
        .join(User, ResourceShare.shared_with_id == User.id)
        .where(ResourceShare.owner_id == user.id)
    )
    owned_shares = []
    for share, target_user in owned_result:
        owned_shares.append(
            ShareResponse(
                id=share.id,
                owner_id=share.owner_id,
                shared_with_id=share.shared_with_id,
                shared_with_email=target_user.email,
                shared_with_name=target_user.name,
                resource_type=share.resource_type,
                resource_id=share.resource_id,
                permission_level=share.permission_level,
                created_at=share.created_at,
                expires_at=share.expires_at,
            )
        )

    # Get received shares
    received_result = await db.execute(
        select(ResourceShare, User)
        .join(User, ResourceShare.owner_id == User.id)
        .where(ResourceShare.shared_with_id == user.id)
    )
    received_shares = []
    for share, owner in received_result:
        received_shares.append(
            ShareResponse(
                id=share.id,
                owner_id=share.owner_id,
                shared_with_id=share.shared_with_id,
                shared_with_email=owner.email,
                shared_with_name=owner.name,
                resource_type=share.resource_type,
                resource_id=share.resource_id,
                permission_level=share.permission_level,
                created_at=share.created_at,
                expires_at=share.expires_at,
            )
        )

    return ShareListResponse(owned=owned_shares, received=received_shares)


# ============================================
# Admin User Management
# ============================================


@router.get("/users", response_model=list[UserListResponse])
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """
    List all users (admin only).
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


@router.patch("/users/{user_id}/approve", response_model=UserListResponse)
async def approve_user(
    user_id: uuid.UUID,
    data: UserApprovalUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Approve or revoke a user's access (admin only).
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Don't allow removing own approval
    if target_user.id == user.id and not data.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke your own access",
        )

    target_user.is_approved = data.is_approved
    await db.commit()
    await db.refresh(target_user)

    return target_user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a user (admin only).
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    # Don't allow self-deletion
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    await db.delete(target_user)
    await db.commit()
