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

    # App
    debug: bool = True
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
