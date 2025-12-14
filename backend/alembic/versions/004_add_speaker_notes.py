"""Add speaker_notes column to slides

Revision ID: 004
Revises: 003
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add speaker_notes column to slides table
    op.add_column('slides', sa.Column('speaker_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('slides', 'speaker_notes')
