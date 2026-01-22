"""Add analytics tables.

Revision ID: 010
Revises: 009
Create Date: 2024-12-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create analytics_events table
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("event_data", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("viewer_session_id", sa.String(100), nullable=False),
        sa.Column("listener_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="direct"),
        sa.Column("referrer", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("ip_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_analytics_events_resource", "analytics_events", ["resource_type", "resource_id"])
    op.create_index("ix_analytics_events_type", "analytics_events", ["event_type"])
    op.create_index("ix_analytics_events_created", "analytics_events", ["created_at"])
    op.create_index("ix_analytics_events_viewer", "analytics_events", ["viewer_session_id"])

    # Create analytics_sessions table
    op.create_table(
        "analytics_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("viewer_session_id", sa.String(100), nullable=False, unique=True),
        sa.Column("listener_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="direct"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("segments_viewed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_segments", sa.Integer(), nullable=True),
        sa.Column("max_segment_reached", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_percentage", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("qa_interactions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pause_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_analytics_sessions_resource", "analytics_sessions", ["resource_type", "resource_id"])
    op.create_index("ix_analytics_sessions_started", "analytics_sessions", ["started_at"])

    # Create analytics_daily_summaries table
    op.create_table(
        "analytics_daily_summaries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unique_viewers", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embed_views", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("direct_views", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_completion_percentage", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("avg_duration_ms", sa.Integer(), nullable=True),
        sa.Column("qa_interactions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_pause_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_analytics_daily_resource_date",
        "analytics_daily_summaries",
        ["resource_type", "resource_id", "date"],
        unique=True,
    )
    op.create_index("ix_analytics_daily_date", "analytics_daily_summaries", ["date"])


def downgrade() -> None:
    op.drop_table("analytics_daily_summaries")
    op.drop_table("analytics_sessions")
    op.drop_table("analytics_events")
