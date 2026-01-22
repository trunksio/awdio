"""Analytics models for tracking views, completions, and interactions."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnalyticsEvent(Base):
    """Individual analytics events (view_start, qa_complete, etc.)."""

    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # What was viewed
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)  # awdio, podcast, quiz, survey
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # awdio/podcast session

    # Event details
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # view_start, view_complete, qa_start, etc.
    event_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)  # Additional event-specific data

    # Viewer tracking
    viewer_session_id: Mapped[str] = mapped_column(String(100), nullable=False)  # Client-generated session ID
    listener_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # If identified
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Context
    source: Mapped[str] = mapped_column(String(50), default="direct")  # direct, embed, api
    referrer: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Hashed for privacy

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_analytics_events_resource", "resource_type", "resource_id"),
        Index("ix_analytics_events_type", "event_type"),
        Index("ix_analytics_events_created", "created_at"),
        Index("ix_analytics_events_viewer", "viewer_session_id"),
    )


class AnalyticsSession(Base):
    """Aggregated viewer sessions for a resource."""

    __tablename__ = "analytics_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # What was viewed
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Viewer tracking
    viewer_session_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    listener_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Session metrics
    source: Mapped[str] = mapped_column(String(50), default="direct")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Progress tracking
    segments_viewed: Mapped[int] = mapped_column(Integer, default=0)
    total_segments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_segment_reached: Mapped[int] = mapped_column(Integer, default=0)
    completion_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Interaction metrics
    qa_interactions: Mapped[int] = mapped_column(Integer, default=0)
    pause_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_analytics_sessions_resource", "resource_type", "resource_id"),
        Index("ix_analytics_sessions_started", "started_at"),
    )


class AnalyticsDailySummary(Base):
    """Daily rollups for reporting."""

    __tablename__ = "analytics_daily_summaries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # What was summarized
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # Date only (time = 00:00:00)

    # View metrics
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_viewers: Mapped[int] = mapped_column(Integer, default=0)
    embed_views: Mapped[int] = mapped_column(Integer, default=0)
    direct_views: Mapped[int] = mapped_column(Integer, default=0)

    # Completion metrics
    completions: Mapped[int] = mapped_column(Integer, default=0)
    avg_completion_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    avg_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Interaction metrics
    qa_interactions: Mapped[int] = mapped_column(Integer, default=0)
    total_pause_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_analytics_daily_resource_date", "resource_type", "resource_id", "date", unique=True),
        Index("ix_analytics_daily_date", "date"),
    )
