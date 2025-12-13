import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.knowledge_base import Chunk, Document, KnowledgeBase
from app.models.podcast import Podcast
from app.schemas.knowledge_base import (
    DocumentResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
)
from app.services.document_processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService
from app.services.storage_service import StorageService
from app.services.vector_store import VectorStore

router = APIRouter(prefix="/podcasts/{podcast_id}/knowledge-bases", tags=["knowledge-bases"])


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_knowledge_bases(
    podcast_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List knowledge bases for a podcast."""
    result = await db.execute(
        select(
            KnowledgeBase,
            func.count(Document.id).label("document_count"),
        )
        .outerjoin(Document)
        .where(KnowledgeBase.podcast_id == podcast_id)
        .group_by(KnowledgeBase.id)
        .order_by(KnowledgeBase.created_at.desc())
    )

    items = []
    for row in result.all():
        kb = row[0]
        items.append({
            "id": kb.id,
            "podcast_id": kb.podcast_id,
            "name": kb.name,
            "description": kb.description,
            "created_at": kb.created_at,
            "document_count": row[1],
        })
    return items


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
async def create_knowledge_base(
    podcast_id: uuid.UUID,
    data: KnowledgeBaseCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new knowledge base."""
    # Verify podcast exists
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Podcast not found")

    kb = KnowledgeBase(
        podcast_id=podcast_id,
        name=data.name,
        description=data.description,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)

    return {
        "id": kb.id,
        "podcast_id": kb.podcast_id,
        "name": kb.name,
        "description": kb.description,
        "created_at": kb.created_at,
        "document_count": 0,
    }


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(
    podcast_id: uuid.UUID,
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a knowledge base by ID."""
    result = await db.execute(
        select(
            KnowledgeBase,
            func.count(Document.id).label("document_count"),
        )
        .outerjoin(Document)
        .where(KnowledgeBase.id == kb_id, KnowledgeBase.podcast_id == podcast_id)
        .group_by(KnowledgeBase.id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    kb = row[0]
    return {
        "id": kb.id,
        "podcast_id": kb.podcast_id,
        "name": kb.name,
        "description": kb.description,
        "created_at": kb.created_at,
        "document_count": row[1],
    }


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(
    podcast_id: uuid.UUID,
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a knowledge base."""
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id, KnowledgeBase.podcast_id == podcast_id
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    await db.delete(kb)
    await db.commit()


# Documents
@router.get("/{kb_id}/documents", response_model=list[DocumentResponse])
async def list_documents(
    podcast_id: uuid.UUID,
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List documents in a knowledge base."""
    result = await db.execute(
        select(
            Document,
            func.count(Chunk.id).label("chunk_count"),
        )
        .outerjoin(Chunk)
        .where(Document.knowledge_base_id == kb_id)
        .group_by(Document.id)
        .order_by(Document.created_at.desc())
    )

    items = []
    for row in result.all():
        doc = row[0]
        items.append({
            "id": doc.id,
            "knowledge_base_id": doc.knowledge_base_id,
            "filename": doc.filename,
            "file_path": doc.file_path,
            "file_type": doc.file_type,
            "processed": doc.processed,
            "created_at": doc.created_at,
            "chunk_count": row[1],
        })
    return items


@router.post("/{kb_id}/documents", response_model=DocumentResponse, status_code=201)
async def upload_document(
    podcast_id: uuid.UUID,
    kb_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload and process a document."""
    # Verify knowledge base exists
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.id == kb_id, KnowledgeBase.podcast_id == podcast_id
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
    file_path = await storage.upload_document(content, filename, podcast_id, kb_id)

    # Create document record
    doc = Document(
        knowledge_base_id=kb_id,
        filename=filename,
        file_path=file_path,
        file_type=suffix.lstrip("."),
        processed=False,
    )
    db.add(doc)
    await db.flush()

    # Process document
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
    vector_store = VectorStore(db)
    await vector_store.add_chunks(doc.id, chunks, embeddings)

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


@router.delete("/{kb_id}/documents/{doc_id}", status_code=204)
async def delete_document(
    podcast_id: uuid.UUID,
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a document."""
    result = await db.execute(
        select(Document).where(
            Document.id == doc_id, Document.knowledge_base_id == kb_id
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from storage
    storage = StorageService()
    # Extract object name from full path
    object_name = doc.file_path.split("/", 1)[1] if "/" in doc.file_path else doc.file_path
    await storage.delete_file(object_name)

    await db.delete(doc)
    await db.commit()
