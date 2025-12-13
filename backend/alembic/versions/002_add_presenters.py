"""Add presenter personalities and listener models

Revision ID: 002
Revises: 001
Create Date: 2025-12-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create presenters table
    op.create_table(
        "presenters",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column(
            "traits", sa.ARRAY(sa.String()), nullable=False, server_default="{}"
        ),
        sa.Column("voice_id", sa.UUID(), nullable=True),
        sa.Column(
            "presenter_metadata",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
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
        sa.ForeignKeyConstraint(["voice_id"], ["voices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. Create presenter_knowledge_bases table
    op.create_table(
        "presenter_knowledge_bases",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("presenter_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["presenter_id"], ["presenters.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 3. Create presenter_documents table
    op.create_table(
        "presenter_documents",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
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
        sa.ForeignKeyConstraint(
            ["knowledge_base_id"], ["presenter_knowledge_bases.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 4. Create presenter_chunks table with vector embedding
    op.create_table(
        "presenter_chunks",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("document_id", sa.UUID(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=True),
        sa.Column(
            "chunk_metadata",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"], ["presenter_documents.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 5. Create vector index for presenter chunks
    op.create_index(
        "ix_presenter_chunks_embedding",
        "presenter_chunks",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_with={"lists": 100},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # 6. Create podcast_presenters junction table
    op.create_table(
        "podcast_presenters",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("podcast_id", sa.UUID(), nullable=False),
        sa.Column("presenter_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["podcast_id"], ["podcasts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["presenter_id"], ["presenters.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 7. Create listeners table (simple auth)
    op.create_table(
        "listeners",
        sa.Column(
            "id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "listener_metadata",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 8. Migrate existing podcast_voices to presenters
    # Create presenters from existing unique voice assignments
    op.execute(
        """
        INSERT INTO presenters (name, voice_id, presenter_metadata, created_at, updated_at)
        SELECT DISTINCT
            COALESCE(pv.speaker_name, v.name),
            pv.voice_id,
            jsonb_build_object('migrated_from', 'podcast_voices'),
            NOW(),
            NOW()
        FROM podcast_voices pv
        JOIN voices v ON pv.voice_id = v.id
        ON CONFLICT DO NOTHING
    """
    )

    # Create podcast_presenters from existing assignments
    # Match by voice_id to link to the created presenters
    op.execute(
        """
        INSERT INTO podcast_presenters (podcast_id, presenter_id, role, display_name, created_at)
        SELECT
            pv.podcast_id,
            p.id,
            pv.role,
            pv.speaker_name,
            NOW()
        FROM podcast_voices pv
        JOIN presenters p ON p.voice_id = pv.voice_id
        WHERE p.presenter_metadata->>'migrated_from' = 'podcast_voices'
    """
    )


def downgrade() -> None:
    op.drop_table("listeners")
    op.drop_table("podcast_presenters")
    op.drop_index("ix_presenter_chunks_embedding", table_name="presenter_chunks")
    op.drop_table("presenter_chunks")
    op.drop_table("presenter_documents")
    op.drop_table("presenter_knowledge_bases")
    op.drop_table("presenters")
