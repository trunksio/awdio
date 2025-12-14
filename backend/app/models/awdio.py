import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Awdio(Base):
    """An Awdio - interactive webinar with slides and narration."""

    __tablename__ = "awdios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    # "draft", "published", "archived"

    presenter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presenters.id", ondelete="SET NULL")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    presenter: Mapped["Presenter | None"] = relationship("Presenter")
    slide_decks: Mapped[list["SlideDeck"]] = relationship(
        "SlideDeck", back_populates="awdio", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["AwdioSession"]] = relationship(
        "AwdioSession", back_populates="awdio", cascade="all, delete-orphan"
    )
    knowledge_bases: Mapped[list["AwdioKnowledgeBase"]] = relationship(
        "AwdioKnowledgeBase", back_populates="awdio", cascade="all, delete-orphan"
    )


class SlideDeck(Base):
    """A collection of slides for an awdio presentation."""

    __tablename__ = "slide_decks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    awdio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("awdios.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    awdio: Mapped["Awdio"] = relationship("Awdio", back_populates="slide_decks")
    slides: Mapped[list["Slide"]] = relationship(
        "Slide", back_populates="slide_deck", cascade="all, delete-orphan"
    )


class Slide(Base):
    """Individual slide with metadata for AI-driven selection during Q&A."""

    __tablename__ = "slides"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slide_deck_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("slide_decks.id", ondelete="CASCADE")
    )
    slide_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # Order in deck (0-based)

    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    # MinIO path to full-resolution image
    thumbnail_path: Mapped[str | None] = mapped_column(String(500))
    # MinIO path to thumbnail

    # User-provided speaker notes (preferred for narration)
    speaker_notes: Mapped[str | None] = mapped_column(Text)
    # Original speaker notes from the presentation

    # AI metadata for slide selection during Q&A
    title: Mapped[str | None] = mapped_column(String(255))
    # Extracted or user-provided title
    description: Mapped[str | None] = mapped_column(Text)
    # Detailed description of slide content (AI-generated from image)
    keywords: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    # Tags for quick matching
    transcript_summary: Mapped[str | None] = mapped_column(Text)
    # Summary of narration for this slide (populated after script generation)

    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    # Vector embedding for semantic search during Q&A

    slide_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    # Extensible metadata: OCR text, detected objects, etc.

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    slide_deck: Mapped["SlideDeck"] = relationship("SlideDeck", back_populates="slides")
    narration_segments: Mapped[list["NarrationSegment"]] = relationship(
        "NarrationSegment", back_populates="slide"
    )


class AwdioSession(Base):
    """A session of an awdio (like an episode for podcasts)."""

    __tablename__ = "awdio_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    awdio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("awdios.id", ondelete="CASCADE")
    )
    slide_deck_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("slide_decks.id", ondelete="SET NULL")
    )
    # Which slide deck to use for this session

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    # "draft", "scripted", "synthesized", "published"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    awdio: Mapped["Awdio"] = relationship("Awdio", back_populates="sessions")
    slide_deck: Mapped["SlideDeck | None"] = relationship("SlideDeck")
    narration_script: Mapped["NarrationScript | None"] = relationship(
        "NarrationScript",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )
    manifest: Mapped["SessionManifest | None"] = relationship(
        "SessionManifest",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
    )


class NarrationScript(Base):
    """Script for an awdio session with narration tied to slides."""

    __tablename__ = "narration_scripts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("awdio_sessions.id", ondelete="CASCADE"),
        unique=True,
    )

    status: Mapped[str] = mapped_column(String(50), default="draft")
    # "draft", "generated", "synthesizing", "synthesized"
    generation_prompt: Mapped[str | None] = mapped_column(Text)
    raw_content: Mapped[str | None] = mapped_column(Text)
    # Full raw script content

    script_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    synthesis_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    synthesis_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    session: Mapped["AwdioSession"] = relationship(
        "AwdioSession", back_populates="narration_script"
    )
    segments: Mapped[list["NarrationSegment"]] = relationship(
        "NarrationSegment", back_populates="script", cascade="all, delete-orphan"
    )


class NarrationSegment(Base):
    """Narration segment tied to a specific slide."""

    __tablename__ = "narration_segments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    script_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("narration_scripts.id", ondelete="CASCADE")
    )
    slide_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("slides.id", ondelete="CASCADE")
    )
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # Order within the session

    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Narration text
    speaker_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Presenter name (usually single presenter for awdios)

    duration_estimate_ms: Mapped[int | None] = mapped_column(Integer)
    audio_path: Mapped[str | None] = mapped_column(String(500))
    # MinIO path after synthesis
    audio_duration_ms: Mapped[int | None] = mapped_column(Integer)

    slide_start_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    # When to show this slide (0 = start of segment)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    script: Mapped["NarrationScript"] = relationship(
        "NarrationScript", back_populates="segments"
    )
    slide: Mapped["Slide"] = relationship("Slide", back_populates="narration_segments")


class SessionManifest(Base):
    """Playback manifest for an awdio session."""

    __tablename__ = "session_manifests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("awdio_sessions.id", ondelete="CASCADE"),
        unique=True,
    )

    total_duration_ms: Mapped[int | None] = mapped_column(Integer)
    segment_count: Mapped[int | None] = mapped_column(Integer)
    manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Contains:
    # {
    #   "segments": [
    #     {
    #       "index": 0,
    #       "slide_id": "uuid",
    #       "slide_index": 0,
    #       "slide_path": "...",
    #       "audio_path": "...",
    #       "duration_ms": 15000,
    #       "text": "...",
    #     }
    #   ],
    #   "total_duration_ms": 600000,
    #   "generated_at": "..."
    # }

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    session: Mapped["AwdioSession"] = relationship(
        "AwdioSession", back_populates="manifest"
    )


class AwdioKnowledgeBase(Base):
    """Knowledge base attached to an awdio for Q&A context."""

    __tablename__ = "awdio_knowledge_bases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    awdio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("awdios.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    awdio: Mapped["Awdio"] = relationship("Awdio", back_populates="knowledge_bases")
    documents: Mapped[list["AwdioDocument"]] = relationship(
        "AwdioDocument", back_populates="knowledge_base", cascade="all, delete-orphan"
    )


class AwdioDocument(Base):
    """Document in an awdio's knowledge base."""

    __tablename__ = "awdio_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("awdio_knowledge_bases.id", ondelete="CASCADE"),
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(50))
    processed: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    knowledge_base: Mapped["AwdioKnowledgeBase"] = relationship(
        "AwdioKnowledgeBase", back_populates="documents"
    )
    chunks: Mapped[list["AwdioChunk"]] = relationship(
        "AwdioChunk", back_populates="document", cascade="all, delete-orphan"
    )


class AwdioChunk(Base):
    """Chunk from an awdio document with vector embedding."""

    __tablename__ = "awdio_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("awdio_documents.id", ondelete="CASCADE")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    chunk_index: Mapped[int | None] = mapped_column(Integer)
    chunk_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    # Relationships
    document: Mapped["AwdioDocument"] = relationship(
        "AwdioDocument", back_populates="chunks"
    )


# Forward references to avoid circular imports
from app.models.presenter import Presenter  # noqa: E402, F401
