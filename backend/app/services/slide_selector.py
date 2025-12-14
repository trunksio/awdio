"""Service for AI-driven slide/visual selection during Q&A."""

import asyncio
import uuid
from dataclasses import dataclass
from typing import Literal

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.awdio import Slide, AwdioKBImage, AwdioKnowledgeBase
from app.models.presenter import PresenterKBImage, PresenterKnowledgeBase


@dataclass
class SlideSelectionResult:
    """Result of slide selection (for backward compatibility)."""

    slide_id: uuid.UUID
    slide_index: int
    slide_path: str
    confidence: float
    reason: str


@dataclass
class VisualSelectionResult:
    """Result of visual selection - can be a slide or KB image."""

    visual_type: Literal["slide", "kb_image"]
    visual_id: uuid.UUID
    visual_path: str
    thumbnail_path: str | None
    confidence: float
    reason: str
    source: Literal["deck", "presenter_kb", "awdio_kb"]
    # For slides, include the index
    slide_index: int | None = None


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

    async def select_visual_for_answer(
        self,
        question: str,
        answer: str,
        slide_deck_id: uuid.UUID | None,
        presenter_id: uuid.UUID | None,
        awdio_id: uuid.UUID,
        current_slide_index: int = 0,
    ) -> VisualSelectionResult | None:
        """
        Select the best visual (slide or KB image) for a Q&A answer.

        Searches in parallel across:
        - Current slide deck slides
        - Presenter KB images (if presenter_id provided)
        - Awdio KB images

        Returns the best match above the confidence threshold.
        """
        # Generate embedding for the Q&A content
        query_text = f"Question: {question}\nAnswer: {answer}"
        query_embedding = await self._get_embedding(query_text)

        # Run all searches in parallel
        async def noop():
            return None

        slide_task = (
            self._search_slides(query_embedding, slide_deck_id, current_slide_index, question)
            if slide_deck_id else noop()
        )
        presenter_task = (
            self._search_presenter_kb_images(query_embedding, presenter_id)
            if presenter_id else noop()
        )
        awdio_task = self._search_awdio_kb_images(query_embedding, awdio_id)

        slide_result, presenter_result, awdio_result = await asyncio.gather(
            slide_task, presenter_task, awdio_task
        )

        # Find best result above threshold
        candidates = []
        if slide_result:
            candidates.append(slide_result)
        if presenter_result:
            candidates.append(presenter_result)
        if awdio_result:
            candidates.append(awdio_result)

        if not candidates:
            return None

        # Return the highest confidence result
        best = max(candidates, key=lambda r: r.confidence)
        if best.confidence >= self.confidence_threshold:
            return best

        return None

    async def _search_slides(
        self,
        query_embedding: list[float],
        slide_deck_id: uuid.UUID,
        current_slide_index: int,
        question: str,
    ) -> VisualSelectionResult | None:
        """Search slides in the current deck."""
        result = await self.session.execute(
            select(Slide)
            .where(Slide.slide_deck_id == slide_deck_id)
            .order_by(Slide.slide_index)
        )
        slides = result.scalars().all()

        if not slides:
            return None

        best_match = None
        best_score = 0.0

        for slide in slides:
            if slide.embedding is None or (hasattr(slide.embedding, '__len__') and len(slide.embedding) == 0):
                continue

            slide_embedding = list(slide.embedding) if hasattr(slide.embedding, 'tolist') else slide.embedding
            score = self._cosine_similarity(query_embedding, slide_embedding)

            # Slight boost for nearby slides
            distance = abs(slide.slide_index - current_slide_index)
            if distance <= 2:
                score *= 1.05

            # Keyword matching boost
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

        if best_match:
            # Prefer presentation_path if available, fall back to image_path
            visual_path = best_match.presentation_path or best_match.image_path
            return VisualSelectionResult(
                visual_type="slide",
                visual_id=best_match.id,
                visual_path=visual_path,
                thumbnail_path=best_match.thumbnail_path,
                confidence=best_score,
                reason=self._generate_reason(best_match, question),
                source="deck",
                slide_index=best_match.slide_index,
            )

        return None

    async def _search_presenter_kb_images(
        self,
        query_embedding: list[float],
        presenter_id: uuid.UUID,
    ) -> VisualSelectionResult | None:
        """Search images in presenter's knowledge bases."""
        # Get all presenter KB images
        result = await self.session.execute(
            select(PresenterKBImage)
            .join(PresenterKnowledgeBase)
            .where(PresenterKnowledgeBase.presenter_id == presenter_id)
        )
        images = result.scalars().all()

        if not images:
            return None

        best_match = None
        best_score = 0.0

        for image in images:
            if image.embedding is None:
                continue

            image_embedding = list(image.embedding) if hasattr(image.embedding, 'tolist') else image.embedding
            score = self._cosine_similarity(query_embedding, image_embedding)

            if score > best_score:
                best_score = score
                best_match = image

        if best_match:
            # Prefer presentation_path if available, fall back to image_path
            visual_path = best_match.presentation_path or best_match.image_path
            return VisualSelectionResult(
                visual_type="kb_image",
                visual_id=best_match.id,
                visual_path=visual_path,
                thumbnail_path=best_match.thumbnail_path,
                confidence=best_score,
                reason=self._generate_kb_image_reason(best_match),
                source="presenter_kb",
            )

        return None

    async def _search_awdio_kb_images(
        self,
        query_embedding: list[float],
        awdio_id: uuid.UUID,
    ) -> VisualSelectionResult | None:
        """Search images in awdio's knowledge bases."""
        # Get all awdio KB images
        result = await self.session.execute(
            select(AwdioKBImage)
            .join(AwdioKnowledgeBase)
            .where(AwdioKnowledgeBase.awdio_id == awdio_id)
        )
        images = result.scalars().all()

        if not images:
            return None

        best_match = None
        best_score = 0.0

        for image in images:
            if image.embedding is None:
                continue

            image_embedding = list(image.embedding) if hasattr(image.embedding, 'tolist') else image.embedding
            score = self._cosine_similarity(query_embedding, image_embedding)

            if score > best_score:
                best_score = score
                best_match = image

        if best_match:
            # Prefer presentation_path if available, fall back to image_path
            visual_path = best_match.presentation_path or best_match.image_path
            return VisualSelectionResult(
                visual_type="kb_image",
                visual_id=best_match.id,
                visual_path=visual_path,
                thumbnail_path=best_match.thumbnail_path,
                confidence=best_score,
                reason=self._generate_kb_image_reason(best_match),
                source="awdio_kb",
            )

        return None

    def _generate_kb_image_reason(self, image: PresenterKBImage | AwdioKBImage) -> str:
        """Generate a human-readable reason for KB image selection."""
        parts = []

        if image.title:
            parts.append(f"Related to '{image.title}'")

        if image.description:
            # Take first 50 chars of description
            desc = image.description[:50] + "..." if len(image.description) > 50 else image.description
            parts.append(desc)

        if not parts:
            parts.append("High semantic similarity")

        return "; ".join(parts)
