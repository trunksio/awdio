import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.knowledge_base import KnowledgeBase
from app.models.podcast import Episode, Podcast, Script, ScriptSegment
from app.schemas.podcast import (
    EpisodeCreate,
    EpisodeResponse,
    ManifestResponse,
    PodcastCreate,
    PodcastResponse,
    ScriptGenerateRequest,
    ScriptResponse,
    ScriptSegmentResponse,
    SynthesizeRequest,
)
from app.services.script_generator import ScriptGenerator
from app.services.tts import SynthesisService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/podcasts", tags=["podcasts"])


@router.get("", response_model=list[PodcastResponse])
async def list_podcasts(db: AsyncSession = Depends(get_db)) -> list[Podcast]:
    """List all podcasts."""
    result = await db.execute(select(Podcast).order_by(Podcast.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=PodcastResponse, status_code=201)
async def create_podcast(
    data: PodcastCreate,
    db: AsyncSession = Depends(get_db),
) -> Podcast:
    """Create a new podcast."""
    podcast = Podcast(title=data.title, description=data.description)
    db.add(podcast)
    await db.commit()
    await db.refresh(podcast)
    return podcast


@router.get("/{podcast_id}", response_model=PodcastResponse)
async def get_podcast(
    podcast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Podcast:
    """Get a podcast by ID."""
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")
    return podcast


@router.delete("/{podcast_id}", status_code=204)
async def delete_podcast(
    podcast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a podcast."""
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")
    await db.delete(podcast)
    await db.commit()


# Episodes
@router.get("/{podcast_id}/episodes", response_model=list[EpisodeResponse])
async def list_episodes(
    podcast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[Episode]:
    """List episodes for a podcast."""
    result = await db.execute(
        select(Episode)
        .where(Episode.podcast_id == podcast_id)
        .order_by(Episode.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{podcast_id}/episodes", response_model=EpisodeResponse, status_code=201)
async def create_episode(
    podcast_id: uuid.UUID,
    data: EpisodeCreate,
    db: AsyncSession = Depends(get_db),
) -> Episode:
    """Create a new episode."""
    # Verify podcast exists
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Podcast not found")

    episode = Episode(
        podcast_id=podcast_id,
        title=data.title,
        description=data.description,
    )
    db.add(episode)
    await db.commit()
    await db.refresh(episode)
    return episode


@router.get("/{podcast_id}/episodes/{episode_id}", response_model=EpisodeResponse)
async def get_episode(
    podcast_id: uuid.UUID,
    episode_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Episode:
    """Get an episode by ID."""
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id, Episode.podcast_id == podcast_id
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode


# Scripts
@router.get("/{podcast_id}/episodes/{episode_id}/script", response_model=ScriptResponse)
async def get_script(
    podcast_id: uuid.UUID,
    episode_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Script:
    """Get the script for an episode."""
    result = await db.execute(
        select(Script)
        .options(selectinload(Script.segments))
        .where(Script.episode_id == episode_id)
    )
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@router.post(
    "/{podcast_id}/episodes/{episode_id}/script/generate",
    response_model=ScriptResponse,
)
async def generate_script(
    podcast_id: uuid.UUID,
    episode_id: uuid.UUID,
    data: ScriptGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> Script:
    """Generate a script for an episode using the podcast's knowledge base."""
    # Get episode
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id, Episode.podcast_id == podcast_id
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # Get knowledge base content
    kb_result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.podcast_id == podcast_id)
    )
    knowledge_bases = kb_result.scalars().all()

    if not knowledge_bases:
        raise HTTPException(
            status_code=400,
            detail="No knowledge base found. Upload documents first.",
        )

    # Gather content from all documents in all knowledge bases
    from app.models.knowledge_base import Chunk, Document

    chunks_result = await db.execute(
        select(Chunk)
        .join(Document)
        .join(KnowledgeBase)
        .where(KnowledgeBase.podcast_id == podcast_id)
        .order_by(Document.id, Chunk.chunk_index)
        .limit(50)  # Limit to avoid token limits
    )
    chunks = chunks_result.scalars().all()

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="No processed documents found. Upload and process documents first.",
        )

    source_content = "\n\n".join(chunk.content for chunk in chunks)

    # Generate script
    generator = ScriptGenerator()
    speakers = [s.model_dump() for s in data.speakers]

    segments = await generator.generate_script(
        source_content=source_content,
        speakers=speakers,
        target_duration_minutes=data.target_duration_minutes,
        tone=data.tone,
        additional_instructions=data.additional_instructions,
    )

    # Check for existing script
    existing = await db.execute(
        select(Script).where(Script.episode_id == episode_id)
    )
    old_script = existing.scalar_one_or_none()
    if old_script:
        await db.delete(old_script)
        await db.flush()

    # Create script record
    script = Script(
        episode_id=episode_id,
        title=episode.title,
        status="generated",
        generation_prompt=str(data.model_dump()),
        raw_content=str(segments),
    )
    db.add(script)
    await db.flush()

    # Estimate ~150 words per minute, ~5 chars per word
    chars_per_ms = 150 * 5 / 60000

    # Create segments
    for i, seg in enumerate(segments):
        content = seg.get("content", "")
        duration_estimate = int(len(content) / chars_per_ms) if content else 0

        segment = ScriptSegment(
            script_id=script.id,
            segment_index=i,
            speaker_name=seg.get("speaker", f"Speaker {i}"),
            content=content,
            duration_estimate_ms=duration_estimate,
        )
        db.add(segment)

    await db.commit()

    # Reload with segments
    result = await db.execute(
        select(Script)
        .options(selectinload(Script.segments))
        .where(Script.id == script.id)
    )
    return result.scalar_one()


# Synthesis
@router.post(
    "/{podcast_id}/episodes/{episode_id}/synthesize",
    response_model=ManifestResponse,
)
async def synthesize_episode(
    podcast_id: uuid.UUID,
    episode_id: uuid.UUID,
    data: SynthesizeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Synthesize audio for all segments in an episode's script."""
    # Verify episode exists and belongs to podcast
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id, Episode.podcast_id == podcast_id
        )
    )
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    synthesis = SynthesisService(db)

    try:
        manifest = await synthesis.synthesize_episode(
            episode_id=episode_id,
            speed=data.speed,
        )
        await db.commit()
        return manifest
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@router.get(
    "/{podcast_id}/episodes/{episode_id}/manifest",
    response_model=ManifestResponse,
)
async def get_episode_manifest(
    podcast_id: uuid.UUID,
    episode_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the audio manifest for an episode."""
    synthesis = SynthesisService(db)
    manifest = await synthesis.get_episode_manifest(episode_id)

    if not manifest:
        raise HTTPException(
            status_code=404,
            detail="Manifest not found. Synthesize the episode first.",
        )

    return manifest
