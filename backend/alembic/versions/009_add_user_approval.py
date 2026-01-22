"""Add user approval status.

Revision ID: 009
Revises: 008
Create Date: 2024-12-16

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add is_approved column to users table
    # Default to False for new users, but set existing users (and first user/admin) to True
    op.add_column(
        "users",
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Approve all existing users (they were already allowed in)
    op.execute("UPDATE users SET is_approved = true")

    # Also ensure admins are always approved
    op.execute("UPDATE users SET is_approved = true WHERE is_admin = true")


def downgrade() -> None:
    op.drop_column("users", "is_approved")
