import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Presenter(Base):
    """A presenter personality that can host podcasts."""

    __tablename__ = "presenters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    traits: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    # e.g., ["conversational", "technical expert", "witty", "empathetic"]

    voice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voices.id", ondelete="SET NULL")
    )
    presenter_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    # Future: speaking_style, catchphrases, interaction_history_summary

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    voice: Mapped["Voice | None"] = relationship("Voice")
    knowledge_bases: Mapped[list["PresenterKnowledgeBase"]] = relationship(
        "PresenterKnowledgeBase",
        back_populates="presenter",
        cascade="all, delete-orphan",
    )
    podcast_assignments: Mapped[list["PodcastPresenter"]] = relationship(
        "PodcastPresenter", back_populates="presenter", cascade="all, delete-orphan"
    )


class PresenterKnowledgeBase(Base):
    """Knowledge base attached to a specific presenter (personal expertise)."""

    __tablename__ = "presenter_knowledge_bases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    presenter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presenters.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    presenter: Mapped["Presenter"] = relationship(
        "Presenter", back_populates="knowledge_bases"
    )
    documents: Mapped[list["PresenterDocument"]] = relationship(
        "PresenterDocument",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
    )
    images: Mapped[list["PresenterKBImage"]] = relationship(
        "PresenterKBImage",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
    )


class PresenterDocument(Base):
    """Document in a presenter's knowledge base."""

    __tablename__ = "presenter_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presenter_knowledge_bases.id", ondelete="CASCADE"),
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(50))
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    knowledge_base: Mapped["PresenterKnowledgeBase"] = relationship(
        "PresenterKnowledgeBase", back_populates="documents"
    )
    chunks: Mapped[list["PresenterChunk"]] = relationship(
        "PresenterChunk", back_populates="document", cascade="all, delete-orphan"
    )


class PresenterChunk(Base):
    """Chunk from a presenter document with vector embedding."""

    __tablename__ = "presenter_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presenter_documents.id", ondelete="CASCADE")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    chunk_index: Mapped[int | None] = mapped_column(Integer)
    chunk_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    # Relationships
    document: Mapped["PresenterDocument"] = relationship(
        "PresenterDocument", back_populates="chunks"
    )


class PresenterKBImage(Base):
    """Image in a presenter's knowledge base with associated text for semantic search."""

    __tablename__ = "presenter_kb_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presenter_knowledge_bases.id", ondelete="CASCADE"),
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    # MinIO path to full-resolution image
    thumbnail_path: Mapped[str | None] = mapped_column(String(500))
    # MinIO path to thumbnail
    presentation_path: Mapped[str | None] = mapped_column(String(500))
    # MinIO path to optimized presentation image (1920x1080 max, JPEG)

    title: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    associated_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Text content for embedding generation (user-provided context)

    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    # Vector embedding for semantic search during Q&A

    image_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    knowledge_base: Mapped["PresenterKnowledgeBase"] = relationship(
        "PresenterKnowledgeBase", back_populates="images"
    )


class PodcastPresenter(Base):
    """Assignment of a presenter to a podcast with a specific role."""

    __tablename__ = "podcast_presenters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    podcast_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("podcasts.id", ondelete="CASCADE")
    )
    presenter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presenters.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g., "host", "expert", "cohost", "guest"
    display_name: Mapped[str | None] = mapped_column(String(255))
    # Override name for this podcast if needed

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="presenters")
    presenter: Mapped["Presenter"] = relationship(
        "Presenter", back_populates="podcast_assignments"
    )


# Import at end to avoid circular imports
from app.models.podcast import Podcast  # noqa: E402, F401
from app.models.voice import Voice  # noqa: E402, F401
