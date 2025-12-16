"""OAuth provider configuration and helpers."""

from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass
class OAuthUserInfo:
    """User info from OAuth provider."""

    provider: str
    oauth_id: str
    email: str
    name: str
    avatar_url: str | None


class OAuthProvider:
    """Base OAuth provider interface."""

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    def get_authorization_url(self, state: str) -> str:
        """Get the OAuth authorization URL."""
        raise NotImplementedError

    async def exchange_code(self, code: str) -> dict:
        """Exchange authorization code for tokens."""
        raise NotImplementedError

    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        """Get user info from the provider."""
        raise NotImplementedError


class GoogleOAuthProvider(OAuthProvider):
    """Google OAuth provider."""

    AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

    def get_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.AUTHORIZE_URL}?{query}"

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.redirect_uri,
                },
            )
            response.raise_for_status()
            return response.json()

    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            data = response.json()
            return OAuthUserInfo(
                provider="google",
                oauth_id=data["id"],
                email=data["email"],
                name=data.get("name", data["email"]),
                avatar_url=data.get("picture"),
            )


class GitHubOAuthProvider(OAuthProvider):
    """GitHub OAuth provider."""

    AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    USERINFO_URL = "https://api.github.com/user"
    EMAILS_URL = "https://api.github.com/user/emails"

    def get_authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "user:email read:user",
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.AUTHORIZE_URL}?{query}"

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                },
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()

    async def get_user_info(self, access_token: str) -> OAuthUserInfo:
        async with httpx.AsyncClient() as client:
            # Get user profile
            response = await client.get(
                self.USERINFO_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

            # Get primary email if not public
            email = data.get("email")
            if not email:
                emails_response = await client.get(
                    self.EMAILS_URL,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json",
                    },
                )
                emails_response.raise_for_status()
                emails = emails_response.json()
                primary = next((e for e in emails if e.get("primary")), emails[0])
                email = primary["email"]

            return OAuthUserInfo(
                provider="github",
                oauth_id=str(data["id"]),
                email=email,
                name=data.get("name") or data.get("login", email),
                avatar_url=data.get("avatar_url"),
            )


def get_oauth_provider(provider: str) -> OAuthProvider:
    """Get the OAuth provider instance."""
    if provider == "google":
        return GoogleOAuthProvider(
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            redirect_uri=settings.google_redirect_uri,
        )
    elif provider == "github":
        return GitHubOAuthProvider(
            client_id=settings.github_client_id,
            client_secret=settings.github_client_secret,
            redirect_uri=settings.github_redirect_uri,
        )
    else:
        raise ValueError(f"Unknown OAuth provider: {provider}")
