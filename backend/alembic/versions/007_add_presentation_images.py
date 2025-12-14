"""Add presentation_path for optimized display images.

Revision ID: 007
Revises: 006
Create Date: 2025-12-14

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add presentation_path to slides table
    op.add_column(
        "slides",
        sa.Column("presentation_path", sa.String(500), nullable=True),
    )

    # Add presentation_path to presenter_kb_images table
    op.add_column(
        "presenter_kb_images",
        sa.Column("presentation_path", sa.String(500), nullable=True),
    )

    # Add presentation_path to awdio_kb_images table
    op.add_column(
        "awdio_kb_images",
        sa.Column("presentation_path", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("awdio_kb_images", "presentation_path")
    op.drop_column("presenter_kb_images", "presentation_path")
    op.drop_column("slides", "presentation_path")
