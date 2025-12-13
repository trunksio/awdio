import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Podcast(Base):
    __tablename__ = "podcasts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    knowledge_bases: Mapped[list["KnowledgeBase"]] = relationship(
        "KnowledgeBase", back_populates="podcast", cascade="all, delete-orphan"
    )
    episodes: Mapped[list["Episode"]] = relationship(
        "Episode", back_populates="podcast", cascade="all, delete-orphan"
    )
    voices: Mapped[list["PodcastVoice"]] = relationship(
        "PodcastVoice", back_populates="podcast", cascade="all, delete-orphan"
    )


class Episode(Base):
    __tablename__ = "episodes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    podcast_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("podcasts.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="episodes")
    script: Mapped["Script | None"] = relationship(
        "Script", back_populates="episode", uselist=False, cascade="all, delete-orphan"
    )
    manifest: Mapped["EpisodeManifest | None"] = relationship(
        "EpisodeManifest", back_populates="episode", uselist=False, cascade="all, delete-orphan"
    )


class Script(Base):
    __tablename__ = "scripts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), unique=True
    )
    title: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), default="draft")
    generation_prompt: Mapped[str | None] = mapped_column(Text)
    raw_content: Mapped[str | None] = mapped_column(Text)
    script_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    synthesis_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synthesis_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    episode: Mapped["Episode"] = relationship("Episode", back_populates="script")
    segments: Mapped[list["ScriptSegment"]] = relationship(
        "ScriptSegment", back_populates="script", cascade="all, delete-orphan"
    )


class ScriptSegment(Base):
    __tablename__ = "script_segments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    script_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scripts.id", ondelete="CASCADE")
    )
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker_name: Mapped[str] = mapped_column(String(255), nullable=False)
    voice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voices.id", ondelete="SET NULL")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    duration_estimate_ms: Mapped[int | None] = mapped_column(Integer)
    audio_path: Mapped[str | None] = mapped_column(String(500))
    audio_duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    script: Mapped["Script"] = relationship("Script", back_populates="segments")
    voice: Mapped["Voice | None"] = relationship("Voice")


class EpisodeManifest(Base):
    __tablename__ = "episode_manifests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    episode_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), unique=True
    )
    total_duration_ms: Mapped[int | None] = mapped_column(Integer)
    segment_count: Mapped[int | None] = mapped_column(Integer)
    manifest: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    episode: Mapped["Episode"] = relationship("Episode", back_populates="manifest")


# Forward references for type hints
from app.models.knowledge_base import KnowledgeBase  # noqa: E402
from app.models.voice import PodcastVoice, Voice  # noqa: E402
