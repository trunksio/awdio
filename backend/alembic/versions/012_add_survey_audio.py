"""Add audio support to survey questions.

Revision ID: 012
Revises: 011
Create Date: 2024-12-16

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add audio fields to survey_questions
    op.add_column(
        "survey_questions",
        sa.Column("audio_path", sa.Text(), nullable=True),
    )
    op.add_column(
        "survey_questions",
        sa.Column("audio_duration_ms", sa.Integer(), nullable=True),
    )

    # Add synthesis status to surveys
    op.add_column(
        "surveys",
        sa.Column(
            "synthesis_status",
            sa.String(length=50),
            nullable=True,
            server_default="pending",
        ),
    )


def downgrade() -> None:
    op.drop_column("surveys", "synthesis_status")
    op.drop_column("survey_questions", "audio_duration_ms")
    op.drop_column("survey_questions", "audio_path")
