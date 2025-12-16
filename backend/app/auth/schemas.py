"""Pydantic schemas for authentication."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr
    name: str
    avatar_url: str | None = None


class UserResponse(UserBase):
    """User response schema."""

    id: UUID
    oauth_provider: str
    is_admin: bool
    created_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response after successful authentication."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token."""

    refresh_token: str


class ShareCreate(BaseModel):
    """Create a resource share."""

    shared_with_email: EmailStr
    resource_type: str  # podcast, awdio, presenter, quiz, survey
    resource_id: UUID
    permission_level: str = "view"  # view, edit, admin


class ShareResponse(BaseModel):
    """Resource share response."""

    id: UUID
    owner_id: UUID
    shared_with_id: UUID
    shared_with_email: str
    shared_with_name: str
    resource_type: str
    resource_id: UUID
    permission_level: str
    created_at: datetime
    expires_at: datetime | None = None

    class Config:
        from_attributes = True


class ShareListResponse(BaseModel):
    """List of shares for a user."""

    owned: list[ShareResponse] = []
    received: list[ShareResponse] = []


class OAuthLoginResponse(BaseModel):
    """Response with OAuth redirect URL."""

    authorization_url: str
    state: str
