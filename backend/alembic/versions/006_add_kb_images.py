"""Add KB images tables for presenter and awdio knowledge bases

Revision ID: 006
Revises: 005
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create presenter_kb_images table
    op.create_table(
        'presenter_kb_images',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('knowledge_base_id', sa.UUID(), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('image_path', sa.String(500), nullable=False),
        sa.Column('thumbnail_path', sa.String(500), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('associated_text', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=True),
        sa.Column('image_metadata', sa.dialects.postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['knowledge_base_id'], ['presenter_knowledge_bases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create index for vector similarity search on presenter images
    op.execute("""
        CREATE INDEX ix_presenter_kb_images_embedding
        ON presenter_kb_images
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)

    # Create awdio_kb_images table
    op.create_table(
        'awdio_kb_images',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('knowledge_base_id', sa.UUID(), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('image_path', sa.String(500), nullable=False),
        sa.Column('thumbnail_path', sa.String(500), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('associated_text', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=True),
        sa.Column('image_metadata', sa.dialects.postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['knowledge_base_id'], ['awdio_knowledge_bases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create index for vector similarity search on awdio images
    op.execute("""
        CREATE INDEX ix_awdio_kb_images_embedding
        ON awdio_kb_images
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)


def downgrade() -> None:
    op.drop_index('ix_awdio_kb_images_embedding', table_name='awdio_kb_images')
    op.drop_table('awdio_kb_images')
    op.drop_index('ix_presenter_kb_images_embedding', table_name='presenter_kb_images')
    op.drop_table('presenter_kb_images')
