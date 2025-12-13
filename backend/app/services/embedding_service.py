from openai import AsyncOpenAI

from app.config import settings


class EmbeddingService:
    """Generates embeddings using OpenAI's API."""

    def __init__(self, model: str = "text-embedding-3-small"):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model
        self.dimensions = 1536  # Default for text-embedding-3-small

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        response = await self.client.embeddings.create(
            model=self.model,
            input=text,
            dimensions=self.dimensions,
        )
        return response.data[0].embedding

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts (batched)."""
        if not texts:
            return []

        # OpenAI allows up to 2048 inputs per request
        batch_size = 100
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await self.client.embeddings.create(
                model=self.model,
                input=batch,
                dimensions=self.dimensions,
            )
            # Sort by index to maintain order
            sorted_data = sorted(response.data, key=lambda x: x.index)
            all_embeddings.extend([d.embedding for d in sorted_data])

        return all_embeddings
