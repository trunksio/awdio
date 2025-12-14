import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.awdio import (
    Awdio,
    AwdioChunk,
    AwdioDocument,
    AwdioKnowledgeBase,
    AwdioSession,
    NarrationScript,
    NarrationSegment,
    SessionManifest,
    Slide,
    SlideDeck,
)
from app.schemas.awdio import (
    AwdioCreate,
    AwdioDocumentResponse,
    AwdioKnowledgeBaseCreate,
    AwdioKnowledgeBaseResponse,
    AwdioResponse,
    AwdioUpdate,
    NarrationScriptResponse,
    SessionCreate,
    SessionManifestResponse,
    SessionResponse,
    SlideDeckCreate,
    SlideDeckResponse,
    SlideReorderRequest,
    SlideResponse,
    SlideUpdate,
)
from app.services.storage_service import StorageService

router = APIRouter(prefix="/awdios", tags=["awdios"])


# ============================================
# Awdio CRUD
# ============================================


@router.get("", response_model=list[AwdioResponse])
async def list_awdios(db: AsyncSession = Depends(get_db)) -> list[Awdio]:
    """List all awdios."""
    result = await db.execute(select(Awdio).order_by(Awdio.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=AwdioResponse, status_code=201)
async def create_awdio(
    data: AwdioCreate,
    db: AsyncSession = Depends(get_db),
) -> Awdio:
    """Create a new awdio."""
    awdio = Awdio(
        title=data.title,
        description=data.description,
        presenter_id=data.presenter_id,
    )
    db.add(awdio)
    await db.commit()
    await db.refresh(awdio)
    return awdio


@router.get("/{awdio_id}", response_model=AwdioResponse)
async def get_awdio(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Awdio:
    """Get an awdio by ID."""
    result = await db.execute(select(Awdio).where(Awdio.id == awdio_id))
    awdio = result.scalar_one_or_none()
    if not awdio:
        raise HTTPException(status_code=404, detail="Awdio not found")
    return awdio


@router.put("/{awdio_id}", response_model=AwdioResponse)
async def update_awdio(
    awdio_id: uuid.UUID,
    data: AwdioUpdate,
    db: AsyncSession = Depends(get_db),
) -> Awdio:
    """Update an awdio."""
    result = await db.execute(select(Awdio).where(Awdio.id == awdio_id))
    awdio = result.scalar_one_or_none()
    if not awdio:
        raise HTTPException(status_code=404, detail="Awdio not found")

    if data.title is not None:
        awdio.title = data.title
    if data.description is not None:
        awdio.description = data.description
    if data.presenter_id is not None:
        awdio.presenter_id = data.presenter_id
    if data.status is not None:
        awdio.status = data.status

    await db.commit()
    await db.refresh(awdio)
    return awdio


@router.delete("/{awdio_id}", status_code=204)
async def delete_awdio(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an awdio."""
    result = await db.execute(select(Awdio).where(Awdio.id == awdio_id))
    awdio = result.scalar_one_or_none()
    if not awdio:
        raise HTTPException(status_code=404, detail="Awdio not found")
    await db.delete(awdio)
    await db.commit()


# ============================================
# Slide Decks
# ============================================


@router.get("/{awdio_id}/slide-decks", response_model=list[SlideDeckResponse])
async def list_slide_decks(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List slide decks for an awdio."""
    result = await db.execute(
        select(SlideDeck, func.count(Slide.id).label("slide_count"))
        .outerjoin(Slide)
        .where(SlideDeck.awdio_id == awdio_id)
        .group_by(SlideDeck.id)
        .order_by(SlideDeck.created_at.desc())
    )

    items = []
    for row in result.all():
        deck = row[0]
        items.append(
            {
                "id": deck.id,
                "awdio_id": deck.awdio_id,
                "name": deck.name,
                "description": deck.description,
                "version": deck.version,
                "created_at": deck.created_at,
                "updated_at": deck.updated_at,
                "slide_count": row[1],
            }
        )
    return items


@router.post("/{awdio_id}/slide-decks", response_model=SlideDeckResponse, status_code=201)
async def create_slide_deck(
    awdio_id: uuid.UUID,
    data: SlideDeckCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new slide deck."""
    # Verify awdio exists
    result = await db.execute(select(Awdio).where(Awdio.id == awdio_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Awdio not found")

    deck = SlideDeck(
        awdio_id=awdio_id,
        name=data.name,
        description=data.description,
    )
    db.add(deck)
    await db.commit()
    await db.refresh(deck)

    return {
        "id": deck.id,
        "awdio_id": deck.awdio_id,
        "name": deck.name,
        "description": deck.description,
        "version": deck.version,
        "created_at": deck.created_at,
        "updated_at": deck.updated_at,
        "slide_count": 0,
    }


@router.get("/{awdio_id}/slide-decks/{deck_id}", response_model=SlideDeckResponse)
async def get_slide_deck(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a slide deck by ID."""
    result = await db.execute(
        select(SlideDeck, func.count(Slide.id).label("slide_count"))
        .outerjoin(Slide)
        .where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
        .group_by(SlideDeck.id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Slide deck not found")

    deck = row[0]
    return {
        "id": deck.id,
        "awdio_id": deck.awdio_id,
        "name": deck.name,
        "description": deck.description,
        "version": deck.version,
        "created_at": deck.created_at,
        "updated_at": deck.updated_at,
        "slide_count": row[1],
    }


@router.delete("/{awdio_id}/slide-decks/{deck_id}", status_code=204)
async def delete_slide_deck(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a slide deck and all its slides."""
    result = await db.execute(
        select(SlideDeck).where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
    )
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Slide deck not found")

    # Delete slide files from storage
    storage = StorageService()
    slides_result = await db.execute(
        select(Slide).where(Slide.slide_deck_id == deck_id)
    )
    for slide in slides_result.scalars().all():
        if slide.image_path:
            object_name = slide.image_path.split("/", 1)[1] if "/" in slide.image_path else slide.image_path
            await storage.delete_file(object_name)
        if slide.thumbnail_path:
            thumb_name = slide.thumbnail_path.split("/", 1)[1] if "/" in slide.thumbnail_path else slide.thumbnail_path
            await storage.delete_file(thumb_name)

    await db.delete(deck)
    await db.commit()


# ============================================
# Slides
# ============================================


@router.get("/{awdio_id}/slide-decks/{deck_id}/slides", response_model=list[SlideResponse])
async def list_slides(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[Slide]:
    """List slides in a deck, ordered by slide_index."""
    # Verify deck exists and belongs to awdio
    deck_result = await db.execute(
        select(SlideDeck).where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
    )
    if not deck_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Slide deck not found")

    result = await db.execute(
        select(Slide)
        .where(Slide.slide_deck_id == deck_id)
        .order_by(Slide.slide_index)
    )
    return list(result.scalars().all())


@router.post(
    "/{awdio_id}/slide-decks/{deck_id}/slides",
    response_model=SlideResponse,
    status_code=201,
)
async def upload_slide(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    db: AsyncSession = Depends(get_db),
) -> Slide:
    """Upload a single slide image."""
    # Verify deck exists and belongs to awdio
    deck_result = await db.execute(
        select(SlideDeck).where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
    )
    if not deck_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Slide deck not found")

    # Validate file type
    filename = file.filename or "slide.png"
    suffix = Path(filename).suffix.lower()
    if suffix not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {suffix}. Supported: .png, .jpg, .jpeg, .gif, .webp",
        )

    # Get next slide index
    count_result = await db.execute(
        select(func.count(Slide.id)).where(Slide.slide_deck_id == deck_id)
    )
    next_index = count_result.scalar() or 0

    # Create slide record first to get ID
    slide = Slide(
        slide_deck_id=deck_id,
        slide_index=next_index,
        image_path="",  # Will be updated after upload
        keywords=[],
        slide_metadata={},
    )
    db.add(slide)
    await db.flush()

    # Upload to storage
    content = await file.read()
    storage = StorageService()
    image_path = await storage.upload_slide(
        content,
        awdio_id,
        deck_id,
        slide.id,
        filename,
    )

    slide.image_path = image_path
    await db.commit()
    await db.refresh(slide)
    return slide


@router.post(
    "/{awdio_id}/slide-decks/{deck_id}/slides/bulk",
    response_model=list[SlideResponse],
    status_code=201,
)
async def upload_slides_bulk(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    files: Annotated[list[UploadFile], File(...)],
    db: AsyncSession = Depends(get_db),
) -> list[Slide]:
    """Upload multiple slide images at once."""
    # Verify deck exists and belongs to awdio
    deck_result = await db.execute(
        select(SlideDeck).where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
    )
    if not deck_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Slide deck not found")

    # Get current slide count for indexing
    count_result = await db.execute(
        select(func.count(Slide.id)).where(Slide.slide_deck_id == deck_id)
    )
    next_index = count_result.scalar() or 0

    storage = StorageService()
    slides = []

    for i, file in enumerate(files):
        filename = file.filename or f"slide_{i}.png"
        suffix = Path(filename).suffix.lower()
        if suffix not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
            continue  # Skip unsupported files

        # Create slide record
        slide = Slide(
            slide_deck_id=deck_id,
            slide_index=next_index + i,
            image_path="",
            keywords=[],
            slide_metadata={},
        )
        db.add(slide)
        await db.flush()

        # Upload to storage
        content = await file.read()
        image_path = await storage.upload_slide(
            content,
            awdio_id,
            deck_id,
            slide.id,
            filename,
        )

        slide.image_path = image_path
        slides.append(slide)

    await db.commit()
    for slide in slides:
        await db.refresh(slide)

    return slides


@router.get(
    "/{awdio_id}/slide-decks/{deck_id}/slides/{slide_id}",
    response_model=SlideResponse,
)
async def get_slide(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    slide_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Slide:
    """Get a slide by ID."""
    result = await db.execute(
        select(Slide)
        .join(SlideDeck)
        .where(
            Slide.id == slide_id,
            Slide.slide_deck_id == deck_id,
            SlideDeck.awdio_id == awdio_id,
        )
    )
    slide = result.scalar_one_or_none()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    return slide


@router.put(
    "/{awdio_id}/slide-decks/{deck_id}/slides/{slide_id}",
    response_model=SlideResponse,
)
async def update_slide(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    slide_id: uuid.UUID,
    data: SlideUpdate,
    db: AsyncSession = Depends(get_db),
) -> Slide:
    """Update slide metadata."""
    result = await db.execute(
        select(Slide)
        .join(SlideDeck)
        .where(
            Slide.id == slide_id,
            Slide.slide_deck_id == deck_id,
            SlideDeck.awdio_id == awdio_id,
        )
    )
    slide = result.scalar_one_or_none()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    if data.title is not None:
        slide.title = data.title
    if data.description is not None:
        slide.description = data.description
    if data.keywords is not None:
        slide.keywords = data.keywords

    await db.commit()
    await db.refresh(slide)
    return slide


@router.delete(
    "/{awdio_id}/slide-decks/{deck_id}/slides/{slide_id}",
    status_code=204,
)
async def delete_slide(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    slide_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a slide and reindex remaining slides."""
    result = await db.execute(
        select(Slide)
        .join(SlideDeck)
        .where(
            Slide.id == slide_id,
            Slide.slide_deck_id == deck_id,
            SlideDeck.awdio_id == awdio_id,
        )
    )
    slide = result.scalar_one_or_none()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    deleted_index = slide.slide_index

    # Delete from storage
    storage = StorageService()
    if slide.image_path:
        object_name = slide.image_path.split("/", 1)[1] if "/" in slide.image_path else slide.image_path
        await storage.delete_file(object_name)
    if slide.thumbnail_path:
        thumb_name = slide.thumbnail_path.split("/", 1)[1] if "/" in slide.thumbnail_path else slide.thumbnail_path
        await storage.delete_file(thumb_name)

    await db.delete(slide)

    # Reindex slides after the deleted one
    later_slides = await db.execute(
        select(Slide)
        .where(Slide.slide_deck_id == deck_id, Slide.slide_index > deleted_index)
        .order_by(Slide.slide_index)
    )
    for later_slide in later_slides.scalars().all():
        later_slide.slide_index -= 1

    await db.commit()


@router.post(
    "/{awdio_id}/slide-decks/{deck_id}/slides/{slide_id}/process",
    response_model=SlideResponse,
)
async def process_slide(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    slide_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Slide:
    """Process a slide: generate thumbnail, extract metadata, and create embedding."""
    result = await db.execute(
        select(Slide)
        .join(SlideDeck)
        .where(
            Slide.id == slide_id,
            Slide.slide_deck_id == deck_id,
            SlideDeck.awdio_id == awdio_id,
        )
    )
    slide = result.scalar_one_or_none()
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    # Download the slide image from storage
    storage = StorageService()
    object_name = slide.image_path.split("/", 1)[1] if "/" in slide.image_path else slide.image_path
    image_content = await storage.download_file(object_name)

    # Process the slide
    from app.services.slide_processor import SlideProcessor

    processor = SlideProcessor()
    result_data = await processor.process_slide(
        image_content, awdio_id, deck_id, slide_id
    )

    # Update slide with processed data
    slide.thumbnail_path = result_data["thumbnail_path"]
    slide.title = result_data["title"]
    slide.description = result_data["description"]
    slide.keywords = result_data["keywords"]
    slide.embedding = result_data["embedding"]

    await db.commit()
    await db.refresh(slide)
    return slide


@router.get(
    "/{awdio_id}/slide-decks/{deck_id}/process-all",
)
async def process_all_slides_stream(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Process all slides with SSE progress streaming."""
    from fastapi.responses import StreamingResponse
    from app.services.slide_processor import SlideProcessor

    # Verify deck exists
    deck_result = await db.execute(
        select(SlideDeck).where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
    )
    if not deck_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Slide deck not found")

    # Get all slides
    slides_result = await db.execute(
        select(Slide).where(Slide.slide_deck_id == deck_id).order_by(Slide.slide_index)
    )
    slides = list(slides_result.scalars().all())

    async def generate_events():
        import json

        if not slides:
            yield f"data: {json.dumps({'type': 'complete', 'total': 0})}\n\n"
            return

        total = len(slides)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"

        processor = SlideProcessor()
        storage = StorageService()

        for idx, slide in enumerate(slides):
            try:
                # Send processing status
                yield f"data: {json.dumps({'type': 'processing', 'index': idx, 'total': total, 'slide_id': str(slide.id)})}\n\n"

                # Download and process the slide
                object_name = slide.image_path.split("/", 1)[1] if "/" in slide.image_path else slide.image_path
                image_content = await storage.download_file(object_name)

                result_data = await processor.process_slide(
                    image_content, awdio_id, deck_id, slide.id
                )

                # Update slide in DB
                slide.thumbnail_path = result_data["thumbnail_path"]
                slide.title = result_data["title"]
                slide.description = result_data["description"]
                slide.keywords = result_data["keywords"]
                slide.embedding = result_data["embedding"]
                await db.commit()
                await db.refresh(slide)

                # Send completed slide data
                slide_data = {
                    "type": "slide_complete",
                    "index": idx,
                    "total": total,
                    "slide": {
                        "id": str(slide.id),
                        "slide_index": slide.slide_index,
                        "title": slide.title,
                        "description": slide.description,
                        "keywords": slide.keywords,
                        "thumbnail_path": slide.thumbnail_path,
                    }
                }
                yield f"data: {json.dumps(slide_data)}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'index': idx, 'slide_id': str(slide.id), 'error': str(e)})}\n\n"

        yield f"data: {json.dumps({'type': 'complete', 'total': total})}\n\n"

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post(
    "/{awdio_id}/slide-decks/{deck_id}/slides/reorder",
    response_model=list[SlideResponse],
)
async def reorder_slides(
    awdio_id: uuid.UUID,
    deck_id: uuid.UUID,
    data: SlideReorderRequest,
    db: AsyncSession = Depends(get_db),
) -> list[Slide]:
    """Reorder slides by providing the new order of slide IDs."""
    # Verify deck exists
    deck_result = await db.execute(
        select(SlideDeck).where(SlideDeck.id == deck_id, SlideDeck.awdio_id == awdio_id)
    )
    if not deck_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Slide deck not found")

    # Get all slides in the deck
    slides_result = await db.execute(
        select(Slide).where(Slide.slide_deck_id == deck_id)
    )
    slides = {slide.id: slide for slide in slides_result.scalars().all()}

    # Verify all IDs are valid
    if set(data.slide_ids) != set(slides.keys()):
        raise HTTPException(
            status_code=400,
            detail="slide_ids must contain exactly all slide IDs in the deck",
        )

    # Update indices
    for new_index, slide_id in enumerate(data.slide_ids):
        slides[slide_id].slide_index = new_index

    await db.commit()

    # Return reordered slides
    result = await db.execute(
        select(Slide)
        .where(Slide.slide_deck_id == deck_id)
        .order_by(Slide.slide_index)
    )
    return list(result.scalars().all())


# ============================================
# Sessions
# ============================================


@router.get("/{awdio_id}/sessions", response_model=list[SessionResponse])
async def list_sessions(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[AwdioSession]:
    """List sessions for an awdio."""
    result = await db.execute(
        select(AwdioSession)
        .where(AwdioSession.awdio_id == awdio_id)
        .order_by(AwdioSession.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/{awdio_id}/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    awdio_id: uuid.UUID,
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
) -> AwdioSession:
    """Create a new session."""
    # Verify awdio exists
    result = await db.execute(select(Awdio).where(Awdio.id == awdio_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Awdio not found")

    # Verify slide deck exists if provided
    if data.slide_deck_id:
        deck_result = await db.execute(
            select(SlideDeck).where(
                SlideDeck.id == data.slide_deck_id, SlideDeck.awdio_id == awdio_id
            )
        )
        if not deck_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Slide deck not found")

    session = AwdioSession(
        awdio_id=awdio_id,
        slide_deck_id=data.slide_deck_id,
        title=data.title,
        description=data.description,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/{awdio_id}/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> AwdioSession:
    """Get a session by ID."""
    result = await db.execute(
        select(AwdioSession).where(
            AwdioSession.id == session_id, AwdioSession.awdio_id == awdio_id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{awdio_id}/sessions/{session_id}", status_code=204)
async def delete_session(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a session."""
    result = await db.execute(
        select(AwdioSession).where(
            AwdioSession.id == session_id, AwdioSession.awdio_id == awdio_id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()


@router.get(
    "/{awdio_id}/sessions/{session_id}/script",
    response_model=NarrationScriptResponse,
)
async def get_session_script(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> NarrationScript:
    """Get the narration script for a session."""
    result = await db.execute(
        select(NarrationScript)
        .options(selectinload(NarrationScript.segments))
        .join(AwdioSession)
        .where(
            NarrationScript.session_id == session_id,
            AwdioSession.awdio_id == awdio_id,
        )
    )
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@router.get(
    "/{awdio_id}/sessions/{session_id}/manifest",
    response_model=SessionManifestResponse,
)
async def get_session_manifest(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SessionManifest:
    """Get the playback manifest for a session."""
    result = await db.execute(
        select(SessionManifest)
        .join(AwdioSession)
        .where(
            SessionManifest.session_id == session_id,
            AwdioSession.awdio_id == awdio_id,
        )
    )
    manifest = result.scalar_one_or_none()
    if not manifest:
        raise HTTPException(
            status_code=404,
            detail="Manifest not found. Synthesize the session first.",
        )
    return manifest


@router.post(
    "/{awdio_id}/sessions/{session_id}/script/generate",
    response_model=NarrationScriptResponse,
)
async def generate_session_script(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> NarrationScript:
    """Generate a narration script for an awdio session."""
    # Get session with slide deck
    session_result = await db.execute(
        select(AwdioSession)
        .options(selectinload(AwdioSession.slide_deck))
        .where(AwdioSession.id == session_id, AwdioSession.awdio_id == awdio_id)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.slide_deck_id:
        raise HTTPException(status_code=400, detail="Session has no slide deck assigned")

    # Get slides
    slides_result = await db.execute(
        select(Slide)
        .where(Slide.slide_deck_id == session.slide_deck_id)
        .order_by(Slide.slide_index)
    )
    slides = list(slides_result.scalars().all())

    if not slides:
        raise HTTPException(status_code=400, detail="Slide deck has no slides")

    # Get awdio and presenter info
    awdio_result = await db.execute(
        select(Awdio).options(selectinload(Awdio.presenter)).where(Awdio.id == awdio_id)
    )
    awdio = awdio_result.scalar_one()

    presenter_name = awdio.presenter.name if awdio.presenter else "Presenter"

    # Get additional context from knowledge base
    additional_context = ""
    kb_result = await db.execute(
        select(AwdioChunk)
        .join(AwdioDocument)
        .join(AwdioKnowledgeBase)
        .where(AwdioKnowledgeBase.awdio_id == awdio_id)
        .limit(20)
    )
    chunks = kb_result.scalars().all()
    if chunks:
        additional_context = "\n\n".join(c.content for c in chunks)

    # Prepare slide info for generator
    # Speaker notes take priority over AI-generated description
    slide_info = [
        {
            "slide_index": s.slide_index,
            "title": s.title,
            "description": s.description,
            "speaker_notes": s.speaker_notes,
            "keywords": s.keywords,
        }
        for s in slides
    ]

    # Generate narration
    from app.services.narration_generator import NarrationGenerator

    generator = NarrationGenerator()
    segments = await generator.generate_narration_script(
        slides=slide_info,
        presenter_name=presenter_name,
        additional_context=additional_context,
    )

    # Delete existing script if any
    existing = await db.execute(
        select(NarrationScript).where(NarrationScript.session_id == session_id)
    )
    old_script = existing.scalar_one_or_none()
    if old_script:
        await db.delete(old_script)
        await db.flush()

    # Create script record
    script = NarrationScript(
        session_id=session_id,
        status="generated",
        generation_prompt=f"Generated for {len(slides)} slides",
        raw_content=str(segments),
        script_metadata={"presenter_name": presenter_name},
    )
    db.add(script)
    await db.flush()

    # Estimate duration (~150 words per minute, ~5 chars per word)
    chars_per_ms = 150 * 5 / 60000

    # Create segment records
    slide_map = {s.slide_index: s for s in slides}
    for seg in segments:
        slide_index = seg.get("slide_index", 0)
        slide = slide_map.get(slide_index)
        if not slide:
            continue

        content = seg.get("content", "")
        transition = seg.get("transition_text", "")
        full_content = f"{content} {transition}".strip()

        duration_estimate = int(len(full_content) / chars_per_ms) if full_content else 0

        narration_segment = NarrationSegment(
            script_id=script.id,
            slide_id=slide.id,
            segment_index=slide_index,
            content=full_content,
            speaker_name=presenter_name,
            duration_estimate_ms=duration_estimate,
            slide_start_offset_ms=0,
        )
        db.add(narration_segment)

    # Update session status
    session.status = "scripted"

    await db.commit()

    # Reload with segments
    result = await db.execute(
        select(NarrationScript)
        .options(selectinload(NarrationScript.segments))
        .where(NarrationScript.id == script.id)
    )
    return result.scalar_one()


@router.post(
    "/{awdio_id}/sessions/{session_id}/synthesize",
    response_model=SessionManifestResponse,
)
async def synthesize_session(
    awdio_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> SessionManifest:
    """Synthesize audio for all segments in a session's narration script."""
    # Verify session exists
    session_result = await db.execute(
        select(AwdioSession).where(
            AwdioSession.id == session_id, AwdioSession.awdio_id == awdio_id
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get script with segments
    script_result = await db.execute(
        select(NarrationScript)
        .options(selectinload(NarrationScript.segments))
        .where(NarrationScript.session_id == session_id)
    )
    script = script_result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found. Generate script first.")

    # Get awdio presenter for voice
    awdio_result = await db.execute(
        select(Awdio).options(selectinload(Awdio.presenter)).where(Awdio.id == awdio_id)
    )
    awdio = awdio_result.scalar_one()

    # Get voice ID from presenter or use default
    voice_id = None
    if awdio.presenter and awdio.presenter.voice_id:
        from app.models.voice import Voice

        voice_result = await db.execute(
            select(Voice).where(Voice.id == awdio.presenter.voice_id)
        )
        voice = voice_result.scalar_one_or_none()
        if voice:
            voice_id = voice.neuphonic_voice_id

    # If no voice configured, use a default
    if not voice_id:
        voice_id = "e564ba7e-aa8d-46a2-96a8-8dffedade48f"  # Default voice

    # Synthesize each segment
    from app.services.tts import NeuphonicsService

    tts = NeuphonicsService()
    storage = StorageService()

    # Update script status
    from datetime import datetime, timezone

    script.status = "synthesizing"
    script.synthesis_started_at = datetime.now(timezone.utc)
    await db.flush()

    # Get slide info for manifest
    slide_ids = [seg.slide_id for seg in script.segments]
    slides_result = await db.execute(select(Slide).where(Slide.id.in_(slide_ids)))
    slides_map = {s.id: s for s in slides_result.scalars().all()}

    manifest_segments = []
    total_duration_ms = 0

    for segment in sorted(script.segments, key=lambda s: s.segment_index):
        try:
            # Synthesize audio
            audio_content = await tts.synthesize(
                text=segment.content,
                voice_id=voice_id,
                speed=1.0,
            )

            # Upload to storage (NeuphonicsService returns WAV)
            audio_path = await storage.upload_awdio_audio(
                audio_content,
                awdio_id,
                session_id,
                segment.segment_index,
                format="wav",
            )

            # Get audio duration (WAV at 22050 Hz, 16-bit mono = 44100 bytes/sec)
            # Subtract ~44 bytes for WAV header
            audio_duration_ms = int((len(audio_content) - 44) / 44100 * 1000)

            # Update segment
            segment.audio_path = audio_path
            segment.audio_duration_ms = audio_duration_ms

            # Build manifest segment
            slide = slides_map.get(segment.slide_id)
            manifest_segments.append({
                "index": segment.segment_index,
                "slide_id": str(segment.slide_id),
                "slide_index": slide.slide_index if slide else segment.segment_index,
                "slide_path": slide.image_path if slide else "",
                "thumbnail_path": slide.thumbnail_path if slide else None,
                "audio_path": audio_path,
                "duration_ms": audio_duration_ms,
                "text": segment.content,
            })
            total_duration_ms += audio_duration_ms

        except Exception as e:
            script.status = "error"
            await db.commit()
            raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")

    # Update script status
    script.status = "synthesized"
    script.synthesis_completed_at = datetime.now(timezone.utc)

    # Update session status
    session.status = "synthesized"

    # Create or update manifest
    existing_manifest = await db.execute(
        select(SessionManifest).where(SessionManifest.session_id == session_id)
    )
    manifest = existing_manifest.scalar_one_or_none()

    manifest_data = {
        "segments": manifest_segments,
        "total_duration_ms": total_duration_ms,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    if manifest:
        manifest.manifest = manifest_data
        manifest.total_duration_ms = total_duration_ms
        manifest.segment_count = len(manifest_segments)
    else:
        manifest = SessionManifest(
            session_id=session_id,
            total_duration_ms=total_duration_ms,
            segment_count=len(manifest_segments),
            manifest=manifest_data,
        )
        db.add(manifest)

    await db.commit()
    await db.refresh(manifest)
    return manifest


# ============================================
# Knowledge Bases (Awdio-specific)
# ============================================


@router.get("/{awdio_id}/knowledge-bases", response_model=list[AwdioKnowledgeBaseResponse])
async def list_awdio_knowledge_bases(
    awdio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List knowledge bases for an awdio."""
    result = await db.execute(
        select(AwdioKnowledgeBase, func.count(AwdioDocument.id).label("document_count"))
        .outerjoin(AwdioDocument)
        .where(AwdioKnowledgeBase.awdio_id == awdio_id)
        .group_by(AwdioKnowledgeBase.id)
        .order_by(AwdioKnowledgeBase.created_at.desc())
    )

    items = []
    for row in result.all():
        kb = row[0]
        items.append(
            {
                "id": kb.id,
                "awdio_id": kb.awdio_id,
                "name": kb.name,
                "description": kb.description,
                "created_at": kb.created_at,
                "document_count": row[1],
            }
        )
    return items


@router.post(
    "/{awdio_id}/knowledge-bases",
    response_model=AwdioKnowledgeBaseResponse,
    status_code=201,
)
async def create_awdio_knowledge_base(
    awdio_id: uuid.UUID,
    data: AwdioKnowledgeBaseCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new knowledge base for an awdio."""
    # Verify awdio exists
    result = await db.execute(select(Awdio).where(Awdio.id == awdio_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Awdio not found")

    kb = AwdioKnowledgeBase(
        awdio_id=awdio_id,
        name=data.name,
        description=data.description,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)

    return {
        "id": kb.id,
        "awdio_id": kb.awdio_id,
        "name": kb.name,
        "description": kb.description,
        "created_at": kb.created_at,
        "document_count": 0,
    }


@router.delete("/{awdio_id}/knowledge-bases/{kb_id}", status_code=204)
async def delete_awdio_knowledge_base(
    awdio_id: uuid.UUID,
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a knowledge base."""
    result = await db.execute(
        select(AwdioKnowledgeBase).where(
            AwdioKnowledgeBase.id == kb_id, AwdioKnowledgeBase.awdio_id == awdio_id
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    await db.delete(kb)
    await db.commit()


@router.get(
    "/{awdio_id}/knowledge-bases/{kb_id}/documents",
    response_model=list[AwdioDocumentResponse],
)
async def list_awdio_documents(
    awdio_id: uuid.UUID,
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List documents in an awdio knowledge base."""
    result = await db.execute(
        select(AwdioDocument, func.count(AwdioChunk.id).label("chunk_count"))
        .outerjoin(AwdioChunk)
        .where(AwdioDocument.knowledge_base_id == kb_id)
        .group_by(AwdioDocument.id)
        .order_by(AwdioDocument.created_at.desc())
    )

    items = []
    for row in result.all():
        doc = row[0]
        items.append(
            {
                "id": doc.id,
                "knowledge_base_id": doc.knowledge_base_id,
                "filename": doc.filename,
                "file_path": doc.file_path,
                "file_type": doc.file_type,
                "processed": doc.processed,
                "created_at": doc.created_at,
                "chunk_count": row[1],
            }
        )
    return items


@router.post(
    "/{awdio_id}/knowledge-bases/{kb_id}/documents",
    response_model=AwdioDocumentResponse,
    status_code=201,
)
async def upload_awdio_document(
    awdio_id: uuid.UUID,
    kb_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload and process a document for an awdio knowledge base."""
    # Verify knowledge base exists
    result = await db.execute(
        select(AwdioKnowledgeBase).where(
            AwdioKnowledgeBase.id == kb_id, AwdioKnowledgeBase.awdio_id == awdio_id
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Validate file type
    filename = file.filename or "document.txt"
    suffix = Path(filename).suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt", ".md"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {suffix}. Supported: .pdf, .docx, .txt, .md",
        )

    # Read file content
    content = await file.read()

    # Upload to storage
    storage = StorageService()
    file_path = await storage.upload_awdio_document(content, filename, awdio_id, kb_id)

    # Create document record
    doc = AwdioDocument(
        knowledge_base_id=kb_id,
        filename=filename,
        file_path=file_path,
        file_type=suffix.lstrip("."),
        processed=False,
    )
    db.add(doc)
    await db.flush()

    # Process document
    from app.services.document_processor import DocumentProcessor
    from app.services.embedding_service import EmbeddingService

    processor = DocumentProcessor()
    try:
        text, chunks = await processor.process_document(content, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process document: {e}")

    # Generate embeddings
    embedding_service = EmbeddingService()
    chunk_texts = [c["content"] for c in chunks]
    embeddings = await embedding_service.embed_texts(chunk_texts)

    # Store chunks with embeddings
    for i, (chunk_data, embedding) in enumerate(zip(chunks, embeddings)):
        chunk = AwdioChunk(
            document_id=doc.id,
            content=chunk_data["content"],
            embedding=embedding,
            chunk_index=i,
            chunk_metadata=chunk_data.get("metadata", {}),
        )
        db.add(chunk)

    # Mark as processed
    doc.processed = True
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "knowledge_base_id": doc.knowledge_base_id,
        "filename": doc.filename,
        "file_path": doc.file_path,
        "file_type": doc.file_type,
        "processed": doc.processed,
        "created_at": doc.created_at,
        "chunk_count": len(chunks),
    }


@router.delete(
    "/{awdio_id}/knowledge-bases/{kb_id}/documents/{doc_id}",
    status_code=204,
)
async def delete_awdio_document(
    awdio_id: uuid.UUID,
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a document from an awdio knowledge base."""
    result = await db.execute(
        select(AwdioDocument)
        .join(AwdioKnowledgeBase)
        .where(
            AwdioDocument.id == doc_id,
            AwdioDocument.knowledge_base_id == kb_id,
            AwdioKnowledgeBase.awdio_id == awdio_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from storage
    storage = StorageService()
    object_name = doc.file_path.split("/", 1)[1] if "/" in doc.file_path else doc.file_path
    await storage.delete_file(object_name)

    await db.delete(doc)
    await db.commit()
