import io
import uuid
from pathlib import Path

from minio import Minio
from minio.error import S3Error

from app.config import settings


class StorageService:
    """Handles file storage operations with MinIO (S3-compatible)."""

    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket = settings.minio_bucket

    async def ensure_bucket(self) -> None:
        """Ensure the bucket exists, create if it doesn't."""
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    async def upload_file(
        self,
        file_content: bytes,
        object_name: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Upload a file to storage.

        Args:
            file_content: The file bytes
            object_name: The path/name in the bucket
            content_type: MIME type of the file

        Returns:
            The full path to the stored file
        """
        await self.ensure_bucket()

        self.client.put_object(
            self.bucket,
            object_name,
            io.BytesIO(file_content),
            length=len(file_content),
            content_type=content_type,
        )

        return f"{self.bucket}/{object_name}"

    async def upload_document(
        self,
        file_content: bytes,
        filename: str,
        podcast_id: uuid.UUID,
        knowledge_base_id: uuid.UUID,
    ) -> str:
        """Upload a document file."""
        suffix = Path(filename).suffix
        object_name = f"podcasts/{podcast_id}/knowledge_bases/{knowledge_base_id}/documents/{uuid.uuid4()}{suffix}"

        content_type = self._get_content_type(filename)
        return await self.upload_file(file_content, object_name, content_type)

    async def upload_audio(
        self,
        audio_content: bytes,
        podcast_id: uuid.UUID,
        episode_id: uuid.UUID,
        segment_index: int,
        format: str = "mp3",
    ) -> str:
        """Upload an audio segment file."""
        object_name = f"podcasts/{podcast_id}/episodes/{episode_id}/segments/{segment_index:04d}.{format}"
        content_type = f"audio/{format}"
        return await self.upload_file(audio_content, object_name, content_type)

    async def download_file(self, object_name: str) -> bytes:
        """Download a file from storage."""
        try:
            response = self.client.get_object(self.bucket, object_name)
            return response.read()
        finally:
            response.close()
            response.release_conn()

    async def delete_file(self, object_name: str) -> bool:
        """Delete a file from storage."""
        try:
            self.client.remove_object(self.bucket, object_name)
            return True
        except S3Error:
            return False

    async def get_presigned_url(
        self,
        object_name: str,
        expires_hours: int = 1,
    ) -> str:
        """Get a presigned URL for temporary access to a file."""
        from datetime import timedelta

        return self.client.presigned_get_object(
            self.bucket,
            object_name,
            expires=timedelta(hours=expires_hours),
        )

    async def list_files(self, prefix: str = "") -> list[str]:
        """List files in the bucket with an optional prefix."""
        objects = self.client.list_objects(self.bucket, prefix=prefix, recursive=True)
        return [obj.object_name for obj in objects]

    def _get_content_type(self, filename: str) -> str:
        """Get MIME type from filename."""
        suffix = Path(filename).suffix.lower()
        content_types = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
            ".md": "text/markdown",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
        }
        return content_types.get(suffix, "application/octet-stream")
