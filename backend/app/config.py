import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://awdio:awdio_dev@localhost:5432/awdio"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "awdio"
    minio_secure: bool = False

    # OpenAI
    openai_api_key: str = ""

    # Neuphonic
    neuphonic_api_key: str = ""

    # ElevenLabs
    elevenlabs_api_key: str = ""

    # App
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:3000"]

    # JWT Authentication
    jwt_secret_key: str = secrets.token_urlsafe(32)  # Generate random key if not set
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # OAuth - Google
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:3000/auth/callback/google"

    # OAuth - GitHub
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:3000/auth/callback/github"

    # Frontend URL (for redirects)
    frontend_url: str = "http://localhost:3000"


settings = Settings()
