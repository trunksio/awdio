"""Add authentication tables and owner_id to resources.

Revision ID: 008
Revises: 007
Create Date: 2025-12-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("oauth_provider", sa.String(50), nullable=False),
        sa.Column("oauth_id", sa.String(255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("user_metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_oauth", "users", ["oauth_provider", "oauth_id"], unique=True)

    # Create refresh_tokens table
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("device_info", sa.String(255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_user", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_hash", "refresh_tokens", ["token_hash"])

    # Create resource_shares table
    op.create_table(
        "resource_shares",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("shared_with_id", sa.UUID(), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("permission_level", sa.String(20), nullable=False, server_default="view"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shared_with_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resource_shares_resource", "resource_shares", ["resource_type", "resource_id"])
    op.create_index("ix_resource_shares_shared_with", "resource_shares", ["shared_with_id"])
    op.create_index("uq_resource_share", "resource_shares", ["shared_with_id", "resource_type", "resource_id"], unique=True)

    # Add owner_id to podcasts (nullable - will be set by migration script)
    op.add_column(
        "podcasts",
        sa.Column("owner_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key("fk_podcasts_owner", "podcasts", "users", ["owner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_podcasts_owner", "podcasts", ["owner_id"])

    # Add owner_id to awdios
    op.add_column(
        "awdios",
        sa.Column("owner_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key("fk_awdios_owner", "awdios", "users", ["owner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_awdios_owner", "awdios", ["owner_id"])

    # Add owner_id to presenters
    op.add_column(
        "presenters",
        sa.Column("owner_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key("fk_presenters_owner", "presenters", "users", ["owner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_presenters_owner", "presenters", ["owner_id"])

    # Add owner_id to voices (nullable - system voices have no owner)
    op.add_column(
        "voices",
        sa.Column("owner_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key("fk_voices_owner", "voices", "users", ["owner_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_voices_owner", "voices", ["owner_id"])


def downgrade() -> None:
    # Remove owner_id from voices
    op.drop_index("ix_voices_owner", table_name="voices")
    op.drop_constraint("fk_voices_owner", "voices", type_="foreignkey")
    op.drop_column("voices", "owner_id")

    # Remove owner_id from presenters
    op.drop_index("ix_presenters_owner", table_name="presenters")
    op.drop_constraint("fk_presenters_owner", "presenters", type_="foreignkey")
    op.drop_column("presenters", "owner_id")

    # Remove owner_id from awdios
    op.drop_index("ix_awdios_owner", table_name="awdios")
    op.drop_constraint("fk_awdios_owner", "awdios", type_="foreignkey")
    op.drop_column("awdios", "owner_id")

    # Remove owner_id from podcasts
    op.drop_index("ix_podcasts_owner", table_name="podcasts")
    op.drop_constraint("fk_podcasts_owner", "podcasts", type_="foreignkey")
    op.drop_column("podcasts", "owner_id")

    # Drop resource_shares table
    op.drop_index("uq_resource_share", table_name="resource_shares")
    op.drop_index("ix_resource_shares_shared_with", table_name="resource_shares")
    op.drop_index("ix_resource_shares_resource", table_name="resource_shares")
    op.drop_table("resource_shares")

    # Drop refresh_tokens table
    op.drop_index("ix_refresh_tokens_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    # Drop users table
    op.drop_index("ix_users_oauth", table_name="users")
    op.drop_table("users")
