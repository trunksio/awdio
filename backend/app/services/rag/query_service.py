import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBase
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import VectorStore


@dataclass
class RAGContext:
    """Context retrieved from RAG for answering a question."""

    chunks: list[dict]
    combined_context: str
    sources: list[str]


class RAGQueryService:
    """Retrieval-Augmented Generation query service."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.embedding_service = EmbeddingService()
        self.vector_store = VectorStore(session)

    async def retrieve_context(
        self,
        question: str,
        podcast_id: uuid.UUID,
        top_k: int = 5,
        similarity_threshold: float = 0.3,
    ) -> RAGContext:
        """
        Retrieve relevant context for a question from the podcast's knowledge base.

        Args:
            question: The user's question
            podcast_id: The podcast to search within
            top_k: Maximum number of chunks to retrieve
            similarity_threshold: Minimum similarity score (0-1)

        Returns:
            RAGContext with relevant chunks and combined context
        """
        # Get all knowledge bases for this podcast
        result = await self.session.execute(
            select(KnowledgeBase).where(KnowledgeBase.podcast_id == podcast_id)
        )
        knowledge_bases = result.scalars().all()

        if not knowledge_bases:
            return RAGContext(chunks=[], combined_context="", sources=[])

        # Embed the question
        question_embedding = await self.embedding_service.embed_text(question)

        # Search across all knowledge bases
        all_chunks = []
        for kb in knowledge_bases:
            chunks = await self.vector_store.similarity_search(
                query_embedding=question_embedding,
                knowledge_base_id=kb.id,
                top_k=top_k,
                threshold=similarity_threshold,
            )
            all_chunks.extend(chunks)

        # Sort by similarity and take top_k
        all_chunks.sort(key=lambda x: x["similarity"], reverse=True)
        top_chunks = all_chunks[:top_k]

        # Combine context
        context_parts = []
        sources = set()

        for chunk in top_chunks:
            context_parts.append(chunk["content"])
            sources.add(chunk["filename"])

        combined_context = "\n\n---\n\n".join(context_parts)

        return RAGContext(
            chunks=top_chunks,
            combined_context=combined_context,
            sources=list(sources),
        )

    async def retrieve_context_for_segment(
        self,
        segment_text: str,
        podcast_id: uuid.UUID,
        top_k: int = 3,
    ) -> RAGContext:
        """
        Retrieve context relevant to a specific segment.
        Useful for providing additional context during playback.
        """
        return await self.retrieve_context(
            question=segment_text,
            podcast_id=podcast_id,
            top_k=top_k,
            similarity_threshold=0.4,
        )
