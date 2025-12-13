import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.tts import VoiceManager

router = APIRouter(prefix="/voices", tags=["voices"])


class VoiceResponse(BaseModel):
    id: uuid.UUID
    name: str
    neuphonic_voice_id: str
    is_cloned: bool
    voice_metadata: dict

    class Config:
        from_attributes = True


class VoiceAssignmentRequest(BaseModel):
    voice_id: uuid.UUID
    role: str = "speaker"
    speaker_name: str


class VoiceAssignmentResponse(BaseModel):
    id: uuid.UUID
    podcast_id: uuid.UUID
    voice_id: uuid.UUID
    role: str
    speaker_name: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[VoiceResponse])
async def list_voices(
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all available voices."""
    manager = VoiceManager(db)
    voices = await manager.list_voices()
    return voices


@router.post("/sync", response_model=list[VoiceResponse])
async def sync_voices(
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Sync voices from Neuphonic to the local database."""
    manager = VoiceManager(db)
    try:
        voices = await manager.sync_neuphonic_voices()
        await db.commit()
        return voices
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{voice_id}", response_model=VoiceResponse)
async def get_voice(
    voice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get a specific voice by ID."""
    manager = VoiceManager(db)
    voice = await manager.get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return voice


@router.post("/podcasts/{podcast_id}/assign", response_model=VoiceAssignmentResponse)
async def assign_voice_to_podcast(
    podcast_id: uuid.UUID,
    request: VoiceAssignmentRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Assign a voice to a podcast for a specific speaker."""
    manager = VoiceManager(db)

    # Verify voice exists
    voice = await manager.get_voice(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")

    try:
        assignment = await manager.assign_voice_to_podcast(
            podcast_id=podcast_id,
            voice_id=request.voice_id,
            role=request.role,
            speaker_name=request.speaker_name,
        )
        await db.commit()
        return assignment
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/podcasts/{podcast_id}/assignments", response_model=list[VoiceAssignmentResponse])
async def get_podcast_voice_assignments(
    podcast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get all voice assignments for a podcast."""
    manager = VoiceManager(db)
    assignments = await manager.get_podcast_voices(podcast_id)
    return assignments
