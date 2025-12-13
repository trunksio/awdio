"""Initial schema

Revision ID: 001
Revises:
Create Date: 2025-12-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create voices table first (no dependencies)
    op.create_table(
        "voices",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("neuphonic_voice_id", sa.String(255), nullable=True),
        sa.Column("is_cloned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("clone_audio_path", sa.String(500), nullable=True),
        sa.Column("voice_metadata", sa.dialects.postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create podcasts table
    op.create_table(
        "podcasts",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create episodes table
    op.create_table(
        "episodes",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("podcast_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create scripts table
    op.create_table(
        "scripts",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("episode_id", sa.UUID(), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("generation_prompt", sa.Text(), nullable=True),
        sa.Column("raw_content", sa.Text(), nullable=True),
        sa.Column("script_metadata", sa.dialects.postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("synthesis_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("synthesis_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create script_segments table
    op.create_table(
        "script_segments",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("script_id", sa.UUID(), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("speaker_name", sa.String(255), nullable=False),
        sa.Column("voice_id", sa.UUID(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("duration_estimate_ms", sa.Integer(), nullable=True),
        sa.Column("audio_path", sa.String(500), nullable=True),
        sa.Column("audio_duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["script_id"], ["scripts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voice_id"], ["voices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create episode_manifests table
    op.create_table(
        "episode_manifests",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("episode_id", sa.UUID(), nullable=False, unique=True),
        sa.Column("total_duration_ms", sa.Integer(), nullable=True),
        sa.Column("segment_count", sa.Integer(), nullable=True),
        sa.Column("manifest", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create knowledge_bases table
    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("podcast_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create documents table
    op.create_table(
        "documents",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("knowledge_base_id", sa.UUID(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=True),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create chunks table with vector embedding
    op.create_table(
        "chunks",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", sa.UUID(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=True),
        sa.Column("chunk_metadata", sa.dialects.postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create vector index for similarity search
    op.create_index(
        "ix_chunks_embedding",
        "chunks",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_with={"lists": 100},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # Create podcast_voices junction table
    op.create_table(
        "podcast_voices",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("podcast_id", sa.UUID(), nullable=False),
        sa.Column("voice_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(100), nullable=False),
        sa.Column("speaker_name", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voice_id"], ["voices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("podcast_voices")
    op.drop_index("ix_chunks_embedding", table_name="chunks")
    op.drop_table("chunks")
    op.drop_table("documents")
    op.drop_table("knowledge_bases")
    op.drop_table("episode_manifests")
    op.drop_table("script_segments")
    op.drop_table("scripts")
    op.drop_table("episodes")
    op.drop_table("podcasts")
    op.drop_table("voices")
    op.execute("DROP EXTENSION IF EXISTS vector")
