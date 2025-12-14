"""
Service for processing slide images:
- Thumbnail generation
- AI-powered description and keyword extraction
- Embedding generation for Q&A matching
"""

import base64
import io
import uuid
from typing import Any

from PIL import Image
from openai import AsyncOpenAI

from app.config import settings
from app.services.embedding_service import EmbeddingService
from app.services.storage_service import StorageService


class SlideProcessor:
    """Processes slide images for metadata extraction and embedding generation."""

    THUMBNAIL_SIZE = (320, 180)  # 16:9 aspect ratio thumbnail
    PRESENTATION_MAX_SIZE = (1920, 1080)  # Max size for presentation display
    PRESENTATION_QUALITY = 85  # JPEG quality for presentation images
    VISION_MODEL = "gpt-4o"

    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.embedding_service = EmbeddingService()
        self.storage = StorageService()

    async def generate_thumbnail(
        self,
        image_content: bytes,
        awdio_id: uuid.UUID,
        slide_deck_id: uuid.UUID,
        slide_id: uuid.UUID,
    ) -> str:
        """Generate and upload a thumbnail for a slide image."""
        # Load image
        img = Image.open(io.BytesIO(image_content))

        # Convert to RGB if necessary (handles PNG with alpha, etc.)
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

        # Create a new image with exact thumbnail dimensions (center the resized image)
        thumb = Image.new("RGB", self.THUMBNAIL_SIZE, (0, 0, 0))
        offset = (
            (self.THUMBNAIL_SIZE[0] - img.width) // 2,
            (self.THUMBNAIL_SIZE[1] - img.height) // 2,
        )
        thumb.paste(img, offset)

        # Save to bytes
        output = io.BytesIO()
        thumb.save(output, format="PNG", optimize=True)
        thumb_bytes = output.getvalue()

        # Upload to storage
        thumbnail_path = await self.storage.upload_slide_thumbnail(
            thumb_bytes, awdio_id, slide_deck_id, slide_id
        )

        return thumbnail_path

    async def generate_presentation_image(
        self,
        image_content: bytes,
        awdio_id: uuid.UUID,
        slide_deck_id: uuid.UUID,
        slide_id: uuid.UUID,
    ) -> str:
        """
        Generate and upload a presentation-optimized image.

        - Resizes to max 1920x1080 while maintaining aspect ratio
        - Converts to JPEG at 85% quality for good balance of quality and size
        """
        # Load image
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
        pres_bytes = output.getvalue()

        # Upload to storage
        object_name = f"awdios/{awdio_id}/slides/{slide_deck_id}/{slide_id}_pres.jpg"
        presentation_path = await self.storage.upload_file(pres_bytes, object_name, "image/jpeg")

        return presentation_path

    async def analyze_slide(
        self, image_content: bytes
    ) -> dict[str, Any]:
        """
        Use GPT-4 Vision to analyze a slide and extract:
        - title: Detected title on the slide
        - description: Description of the slide content
        - keywords: List of relevant keywords/tags
        """
        # Encode image to base64
        base64_image = base64.b64encode(image_content).decode("utf-8")

        # Determine image type from content
        if image_content[:8] == b"\x89PNG\r\n\x1a\n":
            media_type = "image/png"
        elif image_content[:2] == b"\xff\xd8":
            media_type = "image/jpeg"
        elif image_content[:6] in (b"GIF87a", b"GIF89a"):
            media_type = "image/gif"
        elif image_content[:4] == b"RIFF" and image_content[8:12] == b"WEBP":
            media_type = "image/webp"
        else:
            media_type = "image/png"  # Default

        response = await self.openai_client.chat.completions.create(
            model=self.VISION_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": """You are a slide analysis assistant. Analyze the given slide image and extract:
1. title: The main title or heading visible on the slide (or infer one if not explicit)
2. description: A concise description of what the slide contains and its key points (2-3 sentences)
3. keywords: A list of 5-10 relevant keywords/tags that describe the slide content

Respond in JSON format:
{
  "title": "...",
  "description": "...",
  "keywords": ["keyword1", "keyword2", ...]
}""",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{base64_image}",
                                "detail": "high",
                            },
                        },
                        {
                            "type": "text",
                            "text": "Analyze this slide and extract the title, description, and keywords.",
                        },
                    ],
                },
            ],
            max_tokens=1000,
            response_format={"type": "json_object"},
        )

        import json

        result = json.loads(response.choices[0].message.content or "{}")

        return {
            "title": result.get("title", ""),
            "description": result.get("description", ""),
            "keywords": result.get("keywords", []),
        }

    async def generate_slide_embedding(
        self,
        title: str | None,
        description: str | None,
        keywords: list[str],
    ) -> list[float]:
        """Generate an embedding for a slide based on its metadata."""
        # Combine all text for embedding
        parts = []
        if title:
            parts.append(f"Title: {title}")
        if description:
            parts.append(f"Description: {description}")
        if keywords:
            parts.append(f"Keywords: {', '.join(keywords)}")

        text = "\n".join(parts) if parts else "Empty slide"

        return await self.embedding_service.embed_text(text)

    async def process_slide(
        self,
        image_content: bytes,
        awdio_id: uuid.UUID,
        slide_deck_id: uuid.UUID,
        slide_id: uuid.UUID,
    ) -> dict[str, Any]:
        """
        Fully process a slide:
        1. Generate thumbnail
        2. Generate presentation-optimized image
        3. Analyze with vision model
        4. Generate embedding

        Returns dict with: thumbnail_path, presentation_path, title, description, keywords, embedding
        """
        # Generate thumbnail
        thumbnail_path = await self.generate_thumbnail(
            image_content, awdio_id, slide_deck_id, slide_id
        )

        # Generate presentation-optimized image
        presentation_path = await self.generate_presentation_image(
            image_content, awdio_id, slide_deck_id, slide_id
        )

        # Analyze slide content
        analysis = await self.analyze_slide(image_content)

        # Generate embedding
        embedding = await self.generate_slide_embedding(
            analysis.get("title"),
            analysis.get("description"),
            analysis.get("keywords", []),
        )

        return {
            "thumbnail_path": thumbnail_path,
            "presentation_path": presentation_path,
            "title": analysis.get("title"),
            "description": analysis.get("description"),
            "keywords": analysis.get("keywords", []),
            "embedding": embedding,
        }
