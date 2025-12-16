"""Authentication API routes."""

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
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
    OAuthLoginResponse,
    RefreshTokenRequest,
    ShareCreate,
    ShareListResponse,
    ShareResponse,
    TokenResponse,
    UserResponse,
)
from app.config import settings
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# Store OAuth states temporarily (in production, use Redis)
_oauth_states: dict[str, datetime] = {}


def _cleanup_expired_states():
    """Remove expired OAuth states."""
    now = datetime.now(timezone.utc)
    expired = [
        state
        for state, created in _oauth_states.items()
        if (now - created).total_seconds() > 600  # 10 minutes
    ]
    for state in expired:
        _oauth_states.pop(state, None)


@router.get("/login/{provider}")
async def oauth_login(provider: str) -> OAuthLoginResponse:
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
async def oauth_callback(
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

    # Redirect to frontend with tokens
    redirect_url = (
        f"{settings.frontend_url}/auth/callback?"
        f"access_token={jwt_access_token}&"
        f"refresh_token={jwt_refresh_token}"
    )
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
    # First user becomes admin
    result = await db.execute(select(User).limit(1))
    is_first_user = result.scalar_one_or_none() is None

    user = User(
        email=user_info.email,
        name=user_info.name,
        avatar_url=user_info.avatar_url,
        oauth_provider=user_info.provider,
        oauth_id=user_info.oauth_id,
        is_admin=is_first_user,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Refresh access token using refresh token.

    Returns new access and refresh tokens (token rotation).
    """
    # Decode refresh token
    payload = decode_token(request.refresh_token)
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
    token_hash = hash_token(request.refresh_token)
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
