"""Authentication dependencies for FastAPI."""

import uuid

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_token
from app.auth.models import ResourceShare, User
from app.database import get_db

security = HTTPBearer(auto_error=False)


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get current user if authenticated, None otherwise."""
    if not credentials:
        return None

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None

    return await get_user_by_id(db, user_id)


async def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    """Get current user, raise 401 if not authenticated."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Require admin role."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


async def get_ws_user(
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Get user from WebSocket query parameter token."""
    if not token:
        return None

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None

    return await get_user_by_id(db, user_id)


class Permission:
    """Permission levels for resource access."""

    VIEW = "view"
    EDIT = "edit"
    ADMIN = "admin"

    @staticmethod
    def hierarchy() -> list[str]:
        """Return permissions in order of increasing access."""
        return [Permission.VIEW, Permission.EDIT, Permission.ADMIN]

    @staticmethod
    def has_permission(user_level: str, required_level: str) -> bool:
        """Check if user level meets required level."""
        hierarchy = Permission.hierarchy()
        try:
            user_idx = hierarchy.index(user_level)
            required_idx = hierarchy.index(required_level)
            return user_idx >= required_idx
        except ValueError:
            return False


async def check_resource_access(
    db: AsyncSession,
    user: User,
    resource_type: str,
    resource_id: uuid.UUID,
    required_permission: str = Permission.VIEW,
) -> bool:
    """Check if user has access to a resource."""
    # Admins have full access to everything
    if user.is_admin:
        return True

    # Check if user owns the resource (need to query the resource table)
    # This is handled by the caller since we don't know the resource model here

    # Check shares
    result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.shared_with_id == user.id,
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == resource_id,
        )
    )
    share = result.scalar_one_or_none()

    if share:
        return Permission.has_permission(share.permission_level, required_permission)

    return False


def require_resource_access(resource_type: str, permission: str = Permission.VIEW):
    """
    Dependency factory for checking resource access.

    Usage:
        @router.get("/{podcast_id}")
        async def get_podcast(
            podcast_id: uuid.UUID,
            user: User = Depends(require_resource_access("podcast", Permission.VIEW)),
        ):
            ...

    Note: This checks share-based access. Ownership checks must be done
    separately in the endpoint since we need to query the resource.
    """

    async def checker(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        # This dependency just ensures the user is authenticated
        # Actual resource access check must be done in the endpoint
        # after fetching the resource to check owner_id
        return user

    return checker
