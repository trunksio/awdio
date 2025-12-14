"""Service for AI-driven slide selection during Q&A."""

import uuid
from dataclasses import dataclass

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.awdio import Slide


@dataclass
class SlideSelectionResult:
    """Result of slide selection."""

    slide_id: uuid.UUID
    slide_index: int
    slide_path: str
    confidence: float
    reason: str


class SlideSelector:
    """Selects relevant slides based on Q&A content using embeddings."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.openai = AsyncOpenAI(api_key=settings.openai_api_key)
        self.embedding_model = "text-embedding-3-small"
        self.confidence_threshold = 0.65

    async def select_slide(
        self,
        question: str,
        answer_context: str,
        slide_deck_id: uuid.UUID,
        current_slide_index: int,
    ) -> SlideSelectionResult | None:
        """
        Select a relevant slide based on Q&A content.

        Returns SlideSelectionResult if a relevant slide is found with high confidence,
        otherwise returns None (meaning verbal-only response).
        """
        # Get all slides in the deck
        result = await self.session.execute(
            select(Slide)
            .where(Slide.slide_deck_id == slide_deck_id)
            .order_by(Slide.slide_index)
        )
        slides = result.scalars().all()

        if not slides:
            return None

        # Generate embedding for the Q&A content
        query_text = f"Question: {question}\nContext: {answer_context}"
        query_embedding = await self._get_embedding(query_text)

        # Find best matching slide
        best_match = None
        best_score = 0.0

        for slide in slides:
            # Check if embedding exists (handle numpy arrays properly)
            if slide.embedding is None or (hasattr(slide.embedding, '__len__') and len(slide.embedding) == 0):
                continue

            # Convert embedding to list if it's a numpy array
            slide_embedding = list(slide.embedding) if hasattr(slide.embedding, 'tolist') else slide.embedding
            score = self._cosine_similarity(query_embedding, slide_embedding)

            # Slight boost for nearby slides (context continuity)
            distance = abs(slide.slide_index - current_slide_index)
            if distance <= 2:
                score *= 1.05

            # Check keyword matches for additional boost
            if slide.keywords:
                question_lower = question.lower()
                matching_keywords = sum(
                    1 for kw in slide.keywords
                    if kw.lower() in question_lower
                )
                if matching_keywords > 0:
                    score *= 1.0 + (0.1 * matching_keywords)

            if score > best_score:
                best_score = score
                best_match = slide

        # Only return if above confidence threshold
        if best_match and best_score >= self.confidence_threshold:
            return SlideSelectionResult(
                slide_id=best_match.id,
                slide_index=best_match.slide_index,
                slide_path=best_match.image_path,
                confidence=best_score,
                reason=self._generate_reason(best_match, question),
            )

        return None

    async def select_slide_by_keywords(
        self,
        keywords: list[str],
        slide_deck_id: uuid.UUID,
    ) -> SlideSelectionResult | None:
        """Select a slide based on keyword matching only."""
        result = await self.session.execute(
            select(Slide)
            .where(Slide.slide_deck_id == slide_deck_id)
            .order_by(Slide.slide_index)
        )
        slides = result.scalars().all()

        best_match = None
        best_score = 0

        for slide in slides:
            if not slide.keywords:
                continue

            slide_keywords = {kw.lower() for kw in slide.keywords}
            query_keywords = {kw.lower() for kw in keywords}

            matches = len(slide_keywords & query_keywords)
            if matches > best_score:
                best_score = matches
                best_match = slide

        if best_match and best_score > 0:
            return SlideSelectionResult(
                slide_id=best_match.id,
                slide_index=best_match.slide_index,
                slide_path=best_match.image_path,
                confidence=min(1.0, best_score * 0.3),
                reason=f"Matches keywords: {', '.join(keywords[:3])}",
            )

        return None

    async def _get_embedding(self, text: str) -> list[float]:
        """Generate embedding for text."""
        response = await self.openai.embeddings.create(
            model=self.embedding_model,
            input=text,
        )
        return response.data[0].embedding

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        import math

        dot_product = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot_product / (norm_a * norm_b)

    def _generate_reason(self, slide: Slide, question: str) -> str:
        """Generate a human-readable reason for slide selection."""
        parts = []

        if slide.title:
            parts.append(f"Related to '{slide.title}'")

        if slide.keywords:
            question_lower = question.lower()
            matching = [kw for kw in slide.keywords if kw.lower() in question_lower]
            if matching:
                parts.append(f"Keywords: {', '.join(matching[:2])}")

        if not parts:
            parts.append("High semantic similarity")

        return "; ".join(parts)
