"""Survey models for collecting user feedback and responses."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Float
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Survey(Base):
    """A survey for collecting responses."""

    __tablename__ = "surveys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Survey settings
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=True)
    collect_pii_at_end: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_voice_input: Mapped[bool] = mapped_column(Boolean, default=True)

    # Presenter for voice interactions (optional)
    presenter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("presenters.id"), nullable=True
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50), default="draft"
    )  # draft, published, closed

    # Synthesis status for question audio
    synthesis_status: Mapped[str | None] = mapped_column(
        String(50), default="pending"
    )  # pending, synthesizing, synthesized, error

    # Publishing
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    owner = relationship("User", back_populates="surveys")
    presenter = relationship("Presenter", back_populates="surveys")
    questions = relationship(
        "SurveyQuestion", back_populates="survey", cascade="all, delete-orphan",
        order_by="SurveyQuestion.order_index"
    )
    submissions = relationship(
        "SurveySubmission", back_populates="survey", cascade="all, delete-orphan"
    )


class SurveyQuestion(Base):
    """A question within a survey."""

    __tablename__ = "survey_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )

    # Question content
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Question type: single_choice, multiple_choice, rating, scale, open_text, true_false
    question_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Options for choice questions (stored as JSON array)
    # Format: [{"value": "a", "label": "Option A"}, ...]
    options: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)

    # For rating/scale questions
    min_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Validation
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)

    # Ordering
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    # For quiz reuse: correct answer (null for surveys)
    correct_answer: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=0)  # For quizzes

    # Audio for presenter reading the question
    audio_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    survey = relationship("Survey", back_populates="questions")
    answers = relationship(
        "SurveyAnswer", back_populates="question", cascade="all, delete-orphan"
    )


class SurveySubmission(Base):
    """A submission/response session for a survey."""

    __tablename__ = "survey_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )

    # Anonymous identifier (for tracking without PII)
    anonymous_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # Optional user linkage (if not anonymous)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    listener_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listeners.id"), nullable=True
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50), default="in_progress"
    )  # in_progress, completed, abandoned

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Optional PII collected at end (encrypted in production)
    pii_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Metadata
    source: Mapped[str] = mapped_column(String(50), default="direct")  # direct, embed
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # For quiz reuse
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Relationships
    survey = relationship("Survey", back_populates="submissions")
    user = relationship("User", back_populates="survey_submissions")
    listener = relationship("Listener", back_populates="survey_submissions")
    answers = relationship(
        "SurveyAnswer", back_populates="submission", cascade="all, delete-orphan"
    )


class SurveyAnswer(Base):
    """An individual answer to a survey question."""

    __tablename__ = "survey_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("survey_submissions.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("survey_questions.id", ondelete="CASCADE"), nullable=False
    )

    # The answer value (format depends on question type)
    # single_choice: {"value": "a"}
    # multiple_choice: {"values": ["a", "b"]}
    # rating/scale: {"value": 4}
    # open_text: {"text": "..."}
    # true_false: {"value": true}
    answer_value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    # Voice transcript if answered via voice
    voice_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)

    # For quiz reuse
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    points_earned: Mapped[int] = mapped_column(Integer, default=0)

    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    submission = relationship("SurveySubmission", back_populates="answers")
    question = relationship("SurveyQuestion", back_populates="answers")
