"""JWT token creation and validation."""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.auth.models import User
from app.config import settings


def create_access_token(user: User) -> str:
    """Create a short-lived access token for a user."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "name": user.name,
        "is_admin": user.is_admin,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: uuid.UUID, token_id: uuid.UUID) -> str:
    """Create a long-lived refresh token."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "jti": str(token_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        return None


def hash_token(token: str) -> str:
    """Hash a token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def get_token_expiry(days: int = 0, minutes: int = 0) -> datetime:
    """Get expiry datetime from now."""
    return datetime.now(timezone.utc) + timedelta(days=days, minutes=minutes)
