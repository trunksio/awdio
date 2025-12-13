import uuid
from dataclasses import dataclass, field

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


@dataclass
class CombinedRAGContext:
    """Context from both podcast and presenter knowledge bases."""

    chunks: list[dict]
    combined_context: str
    podcast_sources: list[str] = field(default_factory=list)
    presenter_sources: dict[str, list[str]] = field(default_factory=dict)

    @property
    def all_sources(self) -> list[str]:
        """Get all sources combined."""
        sources = list(self.podcast_sources)
        for presenter_name, presenter_srcs in self.presenter_sources.items():
            sources.extend([f"{presenter_name}: {s}" for s in presenter_srcs])
        return sources


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
            # Mark source type for podcast chunks
            for chunk in chunks:
                chunk["source_type"] = "podcast"
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

    async def retrieve_combined_context(
        self,
        question: str,
        podcast_id: uuid.UUID,
        presenter_ids: list[uuid.UUID],
        top_k: int = 8,
        similarity_threshold: float = 0.3,
    ) -> CombinedRAGContext:
        """
        Retrieve context from both podcast and presenter knowledge bases.
        Results are merged and sorted by relevance score.

        Args:
            question: The user's question
            podcast_id: The podcast to search within
            presenter_ids: List of presenter IDs to search across
            top_k: Maximum total chunks to return (combined from all sources)
            similarity_threshold: Minimum similarity score (0-1)

        Returns:
            CombinedRAGContext with merged results sorted by relevance
        """
        # Embed the question once
        question_embedding = await self.embedding_service.embed_text(question)

        all_chunks = []

        # 1. Search podcast knowledge bases
        result = await self.session.execute(
            select(KnowledgeBase).where(KnowledgeBase.podcast_id == podcast_id)
        )
        knowledge_bases = result.scalars().all()

        for kb in knowledge_bases:
            chunks = await self.vector_store.similarity_search(
                query_embedding=question_embedding,
                knowledge_base_id=kb.id,
                top_k=top_k,
                threshold=similarity_threshold,
            )
            for chunk in chunks:
                chunk["source_type"] = "podcast"
            all_chunks.extend(chunks)

        # 2. Search presenter knowledge bases (if any)
        if presenter_ids:
            presenter_chunks = await self.vector_store.multi_presenter_similarity_search(
                query_embedding=question_embedding,
                presenter_ids=presenter_ids,
                top_k=top_k,
                threshold=similarity_threshold,
            )
            all_chunks.extend(presenter_chunks)

        # 3. Sort all results by similarity and take top_k
        all_chunks.sort(key=lambda x: x["similarity"], reverse=True)
        top_chunks = all_chunks[:top_k]

        # 4. Build combined context with source attribution
        context_parts = []
        podcast_sources = set()
        presenter_sources: dict[str, set[str]] = {}

        for chunk in top_chunks:
            context_parts.append(chunk["content"])

            if chunk.get("source_type") == "presenter":
                presenter_name = chunk.get("presenter_name", "Unknown")
                if presenter_name not in presenter_sources:
                    presenter_sources[presenter_name] = set()
                presenter_sources[presenter_name].add(chunk["filename"])
            else:
                podcast_sources.add(chunk["filename"])

        combined_context = "\n\n---\n\n".join(context_parts)

        return CombinedRAGContext(
            chunks=top_chunks,
            combined_context=combined_context,
            podcast_sources=list(podcast_sources),
            presenter_sources={k: list(v) for k, v in presenter_sources.items()},
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
