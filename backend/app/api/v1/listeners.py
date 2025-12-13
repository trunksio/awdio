import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.listener import Listener
from app.schemas.presenter import ListenerCreate, ListenerResponse

router = APIRouter(prefix="/listeners", tags=["listeners"])


@router.post("/register", response_model=ListenerResponse, status_code=201)
async def register_listener(
    data: ListenerCreate,
    db: AsyncSession = Depends(get_db),
) -> Listener:
    """Register a new listener (simple auth - just a name)."""
    listener = Listener(name=data.name)
    db.add(listener)
    await db.commit()
    await db.refresh(listener)
    return listener


@router.get("/{listener_id}", response_model=ListenerResponse)
async def get_listener(
    listener_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Listener:
    """Get a listener by ID."""
    result = await db.execute(select(Listener).where(Listener.id == listener_id))
    listener = result.scalar_one_or_none()
    if not listener:
        raise HTTPException(status_code=404, detail="Listener not found")
    return listener


@router.patch("/{listener_id}", response_model=ListenerResponse)
async def update_listener(
    listener_id: uuid.UUID,
    data: ListenerCreate,
    db: AsyncSession = Depends(get_db),
) -> Listener:
    """Update listener's last seen time (and optionally name)."""
    result = await db.execute(select(Listener).where(Listener.id == listener_id))
    listener = result.scalar_one_or_none()
    if not listener:
        raise HTTPException(status_code=404, detail="Listener not found")

    if data.name:
        listener.name = data.name
    # last_seen_at will auto-update via onupdate

    await db.commit()
    await db.refresh(listener)
    return listener
