import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Voice(Base):
    __tablename__ = "voices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    neuphonic_voice_id: Mapped[str | None] = mapped_column(String(255))
    is_cloned: Mapped[bool] = mapped_column(Boolean, default=False)
    clone_audio_path: Mapped[str | None] = mapped_column(String(500))
    voice_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PodcastVoice(Base):
    __tablename__ = "podcast_voices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    podcast_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("podcasts.id", ondelete="CASCADE")
    )
    voice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voices.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    speaker_name: Mapped[str | None] = mapped_column(String(255))

    # Relationships
    podcast: Mapped["Podcast"] = relationship("Podcast", back_populates="voices")
    voice: Mapped["Voice"] = relationship("Voice")


# Forward reference
from app.models.podcast import Podcast  # noqa: E402
