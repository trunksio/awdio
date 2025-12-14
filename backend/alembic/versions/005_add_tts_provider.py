"""Add TTS provider fields to voices table

Revision ID: 005
Revises: 004
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add tts_provider column with default "neuphonic" for existing voices
    op.add_column(
        'voices',
        sa.Column('tts_provider', sa.String(50), nullable=False, server_default='neuphonic')
    )

    # Add provider_voice_id column
    op.add_column(
        'voices',
        sa.Column('provider_voice_id', sa.String(255), nullable=True)
    )

    # Migrate existing neuphonic_voice_id to provider_voice_id
    op.execute("""
        UPDATE voices
        SET provider_voice_id = neuphonic_voice_id
        WHERE neuphonic_voice_id IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('voices', 'provider_voice_id')
    op.drop_column('voices', 'tts_provider')
