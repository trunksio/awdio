"""
Service for processing knowledge base images:
- Image upload to MinIO
- Thumbnail generation
- Embedding generation from associated text
"""

import io
import uuid
from pathlib import Path
from typing import Literal

from PIL import Image
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.services.embedding_service import EmbeddingService
from app.services.storage_service import StorageService
from app.models.presenter import PresenterKBImage, PresenterKnowledgeBase
from app.models.awdio import AwdioKBImage, AwdioKnowledgeBase


class KBImageProcessor:
    """Processes and manages knowledge base images for presenters and awdios."""

    THUMBNAIL_SIZE = (320, 180)  # 16:9 aspect ratio thumbnail
    PRESENTATION_MAX_SIZE = (1920, 1080)  # Max size for presentation display
    PRESENTATION_QUALITY = 85  # JPEG quality for presentation images
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

    def __init__(self):
        self.storage = StorageService()
        self.embedding_service = EmbeddingService()

    def _get_content_type(self, suffix: str) -> str:
        """Get MIME type for image files."""
        image_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        return image_types.get(suffix, "image/png")

    async def _generate_thumbnail(self, image_content: bytes) -> bytes:
        """Generate a thumbnail from image content."""
        img = Image.open(io.BytesIO(image_content))

        # Convert to RGB if necessary
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Calculate thumbnail size maintaining aspect ratio
        img.thumbnail(self.THUMBNAIL_SIZE, Image.Resampling.LANCZOS)

        # Create a new image with exact thumbnail dimensions
        thumb = Image.new("RGB", self.THUMBNAIL_SIZE, (0, 0, 0))
        offset = (
            (self.THUMBNAIL_SIZE[0] - img.width) // 2,
            (self.THUMBNAIL_SIZE[1] - img.height) // 2,
        )
        thumb.paste(img, offset)

        # Save to bytes
        output = io.BytesIO()
        thumb.save(output, format="PNG", optimize=True)
        return output.getvalue()

    async def _generate_presentation_image(self, image_content: bytes) -> bytes:
        """
        Generate a presentation-optimized image.

        - Resizes to max 1920x1080 while maintaining aspect ratio
        - Converts to JPEG at 85% quality for good balance of quality and size
        - Typically reduces a 6MB PNG to 200-400KB JPEG
        """
        img = Image.open(io.BytesIO(image_content))

        # Convert to RGB if necessary (JPEG doesn't support alpha)
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Only resize if larger than max size
        if img.width > self.PRESENTATION_MAX_SIZE[0] or img.height > self.PRESENTATION_MAX_SIZE[1]:
            img.thumbnail(self.PRESENTATION_MAX_SIZE, Image.Resampling.LANCZOS)

        # Save as JPEG with good quality
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=self.PRESENTATION_QUALITY, optimize=True)
        return output.getvalue()

    async def upload_presenter_image(
        self,
        db: AsyncSession,
        knowledge_base_id: uuid.UUID,
        file: UploadFile,
        title: str | None,
        description: str | None,
        associated_text: str,
    ) -> PresenterKBImage:
        """
        Upload an image to a presenter's knowledge base.

        Args:
            db: Database session
            knowledge_base_id: ID of the presenter knowledge base
            file: The uploaded image file
            title: Optional title for the image
            description: Optional description
            associated_text: Text content for embedding generation

        Returns:
            The created PresenterKBImage record
        """
        # Validate file extension
        filename = file.filename or "image.png"
        suffix = Path(filename).suffix.lower()
        if suffix not in self.ALLOWED_EXTENSIONS:
            raise ValueError(f"Invalid file type: {suffix}. Allowed: {self.ALLOWED_EXTENSIONS}")

        # Get the knowledge base to find the presenter_id
        kb = await db.get(PresenterKnowledgeBase, knowledge_base_id)
        if not kb:
            raise ValueError(f"Knowledge base not found: {knowledge_base_id}")

        # Read file content
        file_content = await file.read()

        # Generate image ID
        image_id = uuid.uuid4()

        # Upload image to MinIO
        object_name = f"presenters/{kb.presenter_id}/kb-images/{knowledge_base_id}/{image_id}{suffix}"
        content_type = self._get_content_type(suffix)
        image_path = await self.storage.upload_file(file_content, object_name, content_type)

        # Generate and upload thumbnail
        thumbnail_bytes = await self._generate_thumbnail(file_content)
        thumb_object_name = f"presenters/{kb.presenter_id}/kb-images/{knowledge_base_id}/{image_id}_thumb.png"
        thumbnail_path = await self.storage.upload_file(thumbnail_bytes, thumb_object_name, "image/png")

        # Generate and upload presentation-optimized image
        presentation_bytes = await self._generate_presentation_image(file_content)
        pres_object_name = f"presenters/{kb.presenter_id}/kb-images/{knowledge_base_id}/{image_id}_pres.jpg"
        presentation_path = await self.storage.upload_file(presentation_bytes, pres_object_name, "image/jpeg")

        # Generate embedding from associated text
        embedding = await self.embedding_service.embed_text(associated_text)

        # Create database record
        kb_image = PresenterKBImage(
            id=image_id,
            knowledge_base_id=knowledge_base_id,
            filename=filename,
            image_path=image_path,
            thumbnail_path=thumbnail_path,
            presentation_path=presentation_path,
            title=title,
            description=description,
            associated_text=associated_text,
            embedding=embedding,
            image_metadata={
                "original_size": len(file_content),
                "presentation_size": len(presentation_bytes),
                "content_type": content_type,
            },
        )

        db.add(kb_image)
        await db.commit()
        await db.refresh(kb_image)

        return kb_image

    async def upload_awdio_image(
        self,
        db: AsyncSession,
        knowledge_base_id: uuid.UUID,
        file: UploadFile,
        title: str | None,
        description: str | None,
        associated_text: str,
    ) -> AwdioKBImage:
        """
        Upload an image to an awdio's knowledge base.

        Args:
            db: Database session
            knowledge_base_id: ID of the awdio knowledge base
            file: The uploaded image file
            title: Optional title for the image
            description: Optional description
            associated_text: Text content for embedding generation

        Returns:
            The created AwdioKBImage record
        """
        # Validate file extension
        filename = file.filename or "image.png"
        suffix = Path(filename).suffix.lower()
        if suffix not in self.ALLOWED_EXTENSIONS:
            raise ValueError(f"Invalid file type: {suffix}. Allowed: {self.ALLOWED_EXTENSIONS}")

        # Get the knowledge base to find the awdio_id
        kb = await db.get(AwdioKnowledgeBase, knowledge_base_id)
        if not kb:
            raise ValueError(f"Knowledge base not found: {knowledge_base_id}")

        # Read file content
        file_content = await file.read()

        # Generate image ID
        image_id = uuid.uuid4()

        # Upload image to MinIO
        object_name = f"awdios/{kb.awdio_id}/kb-images/{knowledge_base_id}/{image_id}{suffix}"
        content_type = self._get_content_type(suffix)
        image_path = await self.storage.upload_file(file_content, object_name, content_type)

        # Generate and upload thumbnail
        thumbnail_bytes = await self._generate_thumbnail(file_content)
        thumb_object_name = f"awdios/{kb.awdio_id}/kb-images/{knowledge_base_id}/{image_id}_thumb.png"
        thumbnail_path = await self.storage.upload_file(thumbnail_bytes, thumb_object_name, "image/png")

        # Generate and upload presentation-optimized image
        presentation_bytes = await self._generate_presentation_image(file_content)
        pres_object_name = f"awdios/{kb.awdio_id}/kb-images/{knowledge_base_id}/{image_id}_pres.jpg"
        presentation_path = await self.storage.upload_file(presentation_bytes, pres_object_name, "image/jpeg")

        # Generate embedding from associated text
        embedding = await self.embedding_service.embed_text(associated_text)

        # Create database record
        kb_image = AwdioKBImage(
            id=image_id,
            knowledge_base_id=knowledge_base_id,
            filename=filename,
            image_path=image_path,
            thumbnail_path=thumbnail_path,
            presentation_path=presentation_path,
            title=title,
            description=description,
            associated_text=associated_text,
            embedding=embedding,
            image_metadata={
                "original_size": len(file_content),
                "presentation_size": len(presentation_bytes),
                "content_type": content_type,
            },
        )

        db.add(kb_image)
        await db.commit()
        await db.refresh(kb_image)

        return kb_image

    async def delete_presenter_image(
        self,
        db: AsyncSession,
        image_id: uuid.UUID,
    ) -> bool:
        """Delete a presenter KB image and its associated files."""
        image = await db.get(PresenterKBImage, image_id)
        if not image:
            return False

        # Delete files from MinIO
        if image.image_path:
            # Extract object_name from path (remove bucket prefix)
            object_name = image.image_path.split("/", 1)[1] if "/" in image.image_path else image.image_path
            await self.storage.delete_file(object_name)

        if image.thumbnail_path:
            object_name = image.thumbnail_path.split("/", 1)[1] if "/" in image.thumbnail_path else image.thumbnail_path
            await self.storage.delete_file(object_name)

        if image.presentation_path:
            object_name = image.presentation_path.split("/", 1)[1] if "/" in image.presentation_path else image.presentation_path
            await self.storage.delete_file(object_name)

        # Delete database record
        await db.delete(image)
        await db.commit()

        return True

    async def delete_awdio_image(
        self,
        db: AsyncSession,
        image_id: uuid.UUID,
    ) -> bool:
        """Delete an awdio KB image and its associated files."""
        image = await db.get(AwdioKBImage, image_id)
        if not image:
            return False

        # Delete files from MinIO
        if image.image_path:
            object_name = image.image_path.split("/", 1)[1] if "/" in image.image_path else image.image_path
            await self.storage.delete_file(object_name)

        if image.thumbnail_path:
            object_name = image.thumbnail_path.split("/", 1)[1] if "/" in image.thumbnail_path else image.thumbnail_path
            await self.storage.delete_file(object_name)

        if image.presentation_path:
            object_name = image.presentation_path.split("/", 1)[1] if "/" in image.presentation_path else image.presentation_path
            await self.storage.delete_file(object_name)

        # Delete database record
        await db.delete(image)
        await db.commit()

        return True

    async def list_presenter_images(
        self,
        db: AsyncSession,
        knowledge_base_id: uuid.UUID,
    ) -> list[PresenterKBImage]:
        """List all images in a presenter knowledge base."""
        result = await db.execute(
            select(PresenterKBImage)
            .where(PresenterKBImage.knowledge_base_id == knowledge_base_id)
            .order_by(PresenterKBImage.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_awdio_images(
        self,
        db: AsyncSession,
        knowledge_base_id: uuid.UUID,
    ) -> list[AwdioKBImage]:
        """List all images in an awdio knowledge base."""
        result = await db.execute(
            select(AwdioKBImage)
            .where(AwdioKBImage.knowledge_base_id == knowledge_base_id)
            .order_by(AwdioKBImage.created_at.desc())
        )
        return list(result.scalars().all())
