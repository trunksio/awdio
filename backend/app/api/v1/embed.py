"""
Embed API - Read-only access to published awdio content.

These endpoints are designed for iframe embedding and do not require authentication.
Only published content is accessible through these endpoints.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.awdio import (
    Awdio,
    AwdioSession,
    SessionManifest,
)
from app.models.presenter import Presenter

router = APIRouter(prefix="/embed", tags=["embed"])


# ============================================
# Embed Schemas (simplified for public access)
# ============================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime


class EmbedPresenterResponse(BaseModel):
    """Minimal presenter info for embed."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    avatar_url: str | None


class EmbedAwdioResponse(BaseModel):
    """Minimal awdio info for embed."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    presenter: EmbedPresenterResponse | None = None


class EmbedSessionResponse(BaseModel):
    """Session info for embed."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None


class EmbedManifestResponse(BaseModel):
    """Manifest for embed playback."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    total_duration_ms: int | None
    segment_count: int | None
    manifest: dict


class EmbedAwdioFullResponse(BaseModel):
    """Complete awdio with session for embed playback."""
    awdio: EmbedAwdioResponse
    session: EmbedSessionResponse
    manifest: EmbedManifestResponse


# ============================================
# Embed Endpoints
# ============================================


@router.get("/awdios/{awdio_id}")
async def get_embed_awdio(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> EmbedAwdioResponse:
    """Get awdio info for embedding. Only returns published awdios."""
    result = await db.execute(
        select(Awdio)
        .options(selectinload(Awdio.presenter))
        .where(Awdio.id == awdio_id, Awdio.status == "published")
    )
    awdio = result.scalar_one_or_none()
    if not awdio:
        raise HTTPException(
            status_code=404,
            detail="Awdio not found or not published",
        )

    presenter_data = None
    if awdio.presenter:
        presenter_data = EmbedPresenterResponse(
            id=awdio.presenter.id,
            name=awdio.presenter.name,
            avatar_url=None,  # Presenters don't have avatars (unlike users)
        )

    return EmbedAwdioResponse(
        id=awdio.id,
        title=awdio.title,
        description=awdio.description,
        presenter=presenter_data,
    )


@router.get("/awdios/{awdio_id}/sessions")
async def list_embed_sessions(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[EmbedSessionResponse]:
    """List published sessions for an awdio."""
    # Verify awdio is published
    awdio_result = await db.execute(
        select(Awdio).where(Awdio.id == awdio_id, Awdio.status == "published")
    )
    if not awdio_result.scalar_one_or_none():
        raise HTTPException(
            status_code=404,
            detail="Awdio not found or not published",
        )

    # Get published sessions
    result = await db.execute(
        select(AwdioSession).where(
            AwdioSession.awdio_id == awdio_id,
            AwdioSession.status == "published",
        )
    )
    sessions = result.scalars().all()

    return [
        EmbedSessionResponse(
            id=s.id,
            title=s.title,
            description=s.description,
        )
        for s in sessions
    ]


@router.get("/awdios/{awdio_id}/sessions/{session_id}")
async def get_embed_session(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> EmbedAwdioFullResponse:
    """Get complete awdio and session info for embed playback."""
    # Get awdio with presenter
    awdio_result = await db.execute(
        select(Awdio)
        .options(selectinload(Awdio.presenter))
        .where(Awdio.id == awdio_id, Awdio.status == "published")
    )
    awdio = awdio_result.scalar_one_or_none()
    if not awdio:
        raise HTTPException(
            status_code=404,
            detail="Awdio not found or not published",
        )

    # Get session
    session_result = await db.execute(
        select(AwdioSession).where(
            AwdioSession.id == session_id,
            AwdioSession.awdio_id == awdio_id,
            AwdioSession.status == "published",
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found or not published",
        )

    # Get manifest
    manifest_result = await db.execute(
        select(SessionManifest).where(SessionManifest.session_id == session_id)
    )
    manifest = manifest_result.scalar_one_or_none()
    if not manifest:
        raise HTTPException(
            status_code=404,
            detail="Session manifest not found",
        )

    # Build response
    presenter_data = None
    if awdio.presenter:
        presenter_data = EmbedPresenterResponse(
            id=awdio.presenter.id,
            name=awdio.presenter.name,
            avatar_url=None,  # Presenters don't have avatars (unlike users)
        )

    return EmbedAwdioFullResponse(
        awdio=EmbedAwdioResponse(
            id=awdio.id,
            title=awdio.title,
            description=awdio.description,
            presenter=presenter_data,
        ),
        session=EmbedSessionResponse(
            id=session.id,
            title=session.title,
            description=session.description,
        ),
        manifest=EmbedManifestResponse(
            id=manifest.id,
            session_id=manifest.session_id,
            total_duration_ms=manifest.total_duration_ms,
            segment_count=manifest.segment_count,
            manifest=manifest.manifest,
        ),
    )


@router.get("/awdios/{awdio_id}/sessions/{session_id}/manifest")
async def get_embed_manifest(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> EmbedManifestResponse:
    """Get playback manifest for embed. Only for published sessions."""
    # Verify awdio is published
    awdio_result = await db.execute(
        select(Awdio).where(Awdio.id == awdio_id, Awdio.status == "published")
    )
    if not awdio_result.scalar_one_or_none():
        raise HTTPException(
            status_code=404,
            detail="Awdio not found or not published",
        )

    # Verify session is published
    session_result = await db.execute(
        select(AwdioSession).where(
            AwdioSession.id == session_id,
            AwdioSession.awdio_id == awdio_id,
            AwdioSession.status == "published",
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(
            status_code=404,
            detail="Session not found or not published",
        )

    # Get manifest
    manifest_result = await db.execute(
        select(SessionManifest).where(SessionManifest.session_id == session_id)
    )
    manifest = manifest_result.scalar_one_or_none()
    if not manifest:
        raise HTTPException(
            status_code=404,
            detail="Session manifest not found",
        )

    return EmbedManifestResponse(
        id=manifest.id,
        session_id=manifest.session_id,
        total_duration_ms=manifest.total_duration_ms,
        segment_count=manifest.segment_count,
        manifest=manifest.manifest,
    )
