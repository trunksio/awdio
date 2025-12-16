"""Authentication models for users, tokens, and resource sharing."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """A user account authenticated via OAuth."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # OAuth provider info
    oauth_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    oauth_id: Mapped[str] = mapped_column(String(255), nullable=False)

    # Role
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Extensible metadata
    user_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    owned_shares: Mapped[list["ResourceShare"]] = relationship(
        back_populates="owner",
        foreign_keys="ResourceShare.owner_id",
        cascade="all, delete-orphan",
    )
    received_shares: Mapped[list["ResourceShare"]] = relationship(
        back_populates="shared_with",
        foreign_keys="ResourceShare.shared_with_id",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_users_oauth", "oauth_provider", "oauth_id", unique=True),
    )


class RefreshToken(Base):
    """Refresh token for JWT authentication."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    device_info: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamps
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

    __table_args__ = (
        Index("ix_refresh_tokens_user", "user_id"),
        Index("ix_refresh_tokens_hash", "token_hash"),
    )


class ResourceShare(Base):
    """Sharing a resource with another user."""

    __tablename__ = "resource_shares"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    shared_with_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Resource reference
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # Permission level: view, edit, admin
    permission_level: Mapped[str] = mapped_column(
        String(20), nullable=False, default="view"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    owner: Mapped["User"] = relationship(
        back_populates="owned_shares", foreign_keys=[owner_id]
    )
    shared_with: Mapped["User"] = relationship(
        back_populates="received_shares", foreign_keys=[shared_with_id]
    )

    __table_args__ = (
        Index("ix_resource_shares_resource", "resource_type", "resource_id"),
        Index("ix_resource_shares_shared_with", "shared_with_id"),
        Index(
            "uq_resource_share",
            "shared_with_id",
            "resource_type",
            "resource_id",
            unique=True,
        ),
    )
