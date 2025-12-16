"""Permission checking utilities for resource access control."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import Permission
from app.auth.models import ResourceShare, User


async def get_resource_share(
    db: AsyncSession,
    user_id: uuid.UUID,
    resource_type: str,
    resource_id: uuid.UUID,
) -> ResourceShare | None:
    """Get a share record for a user and resource."""
    result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.shared_with_id == user_id,
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == resource_id,
        )
    )
    return result.scalar_one_or_none()


async def can_access_resource(
    db: AsyncSession,
    user: User,
    resource: Any,  # Resource with owner_id attribute
    resource_type: str,
    required_permission: str = Permission.VIEW,
) -> bool:
    """
    Check if a user can access a resource.

    Args:
        db: Database session
        user: The user requesting access
        resource: The resource object (must have owner_id attribute)
        resource_type: Type of resource (podcast, awdio, presenter, etc.)
        required_permission: Minimum permission level required

    Returns:
        True if user has access, False otherwise
    """
    # Admins have full access
    if user.is_admin:
        return True

    # Check ownership
    owner_id = getattr(resource, "owner_id", None)
    if owner_id and owner_id == user.id:
        return True

    # Check shares
    share = await get_resource_share(db, user.id, resource_type, resource.id)
    if share:
        return Permission.has_permission(share.permission_level, required_permission)

    return False


async def require_access(
    db: AsyncSession,
    user: User,
    resource: Any,
    resource_type: str,
    required_permission: str = Permission.VIEW,
) -> None:
    """
    Require access to a resource, raising 403 if not authorized.

    Args:
        db: Database session
        user: The user requesting access
        resource: The resource object
        resource_type: Type of resource
        required_permission: Minimum permission level required

    Raises:
        HTTPException: 403 if access denied
    """
    from fastapi import HTTPException, status

    if not await can_access_resource(
        db, user, resource, resource_type, required_permission
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to {resource_type}",
        )


async def get_user_resources(
    db: AsyncSession,
    user: User,
    resource_type: str,
    resource_model: Any,
) -> list[Any]:
    """
    Get all resources of a type that a user can access.

    Args:
        db: Database session
        user: The user
        resource_type: Type of resource
        resource_model: SQLAlchemy model class

    Returns:
        List of resources (owned + shared)
    """
    # Get owned resources
    owned_query = select(resource_model)
    if hasattr(resource_model, "owner_id"):
        owned_query = owned_query.where(resource_model.owner_id == user.id)

    owned_result = await db.execute(owned_query)
    owned = list(owned_result.scalars().all())

    # Get shared resources
    shares_result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.shared_with_id == user.id,
            ResourceShare.resource_type == resource_type,
        )
    )
    shares = shares_result.scalars().all()
    shared_ids = [s.resource_id for s in shares]

    if shared_ids:
        shared_result = await db.execute(
            select(resource_model).where(resource_model.id.in_(shared_ids))
        )
        shared = list(shared_result.scalars().all())
    else:
        shared = []

    # Combine and deduplicate
    all_resources = {r.id: r for r in owned}
    for r in shared:
        if r.id not in all_resources:
            all_resources[r.id] = r

    return list(all_resources.values())
