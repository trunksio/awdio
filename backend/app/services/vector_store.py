import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import Chunk


class VectorStore:
    """Vector similarity search using pg_vector."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def add_chunks(
        self,
        document_id: uuid.UUID,
        chunks: list[dict],
        embeddings: list[list[float]],
    ) -> list[Chunk]:
        """Add chunks with embeddings to the vector store."""
        chunk_models = []

        for chunk_data, embedding in zip(chunks, embeddings):
            chunk = Chunk(
                document_id=document_id,
                content=chunk_data["content"],
                embedding=embedding,
                chunk_index=chunk_data["chunk_index"],
                chunk_metadata={
                    "start_char": chunk_data.get("start_char"),
                    "end_char": chunk_data.get("end_char"),
                },
            )
            self.session.add(chunk)
            chunk_models.append(chunk)

        await self.session.flush()
        return chunk_models

    async def similarity_search(
        self,
        query_embedding: list[float],
        knowledge_base_id: uuid.UUID,
        top_k: int = 5,
        threshold: float | None = None,
    ) -> list[dict]:
        """Find most similar chunks to the query embedding."""
        # Build the query with cosine distance
        # pg_vector uses <=> for cosine distance (1 - cosine_similarity)
        embedding_str = str(query_embedding)
        kb_id_str = str(knowledge_base_id)

        # Use text() with bindparam for proper parameter binding
        query = text("""
            SELECT
                c.id,
                c.content,
                c.chunk_index,
                c.chunk_metadata,
                c.document_id,
                d.filename,
                1 - (c.embedding <=> CAST(:emb AS vector)) as similarity
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            JOIN knowledge_bases kb ON d.knowledge_base_id = kb.id
            WHERE kb.id = CAST(:kb_id AS uuid)
            ORDER BY c.embedding <=> CAST(:emb AS vector)
            LIMIT :lim
        """).bindparams(
            bindparam("emb", value=embedding_str),
            bindparam("kb_id", value=kb_id_str),
            bindparam("lim", value=top_k),
        )

        result = await self.session.execute(query)

        rows = result.fetchall()
        results = []

        for row in rows:
            similarity = float(row.similarity)
            if threshold is None or similarity >= threshold:
                results.append({
                    "id": row.id,
                    "content": row.content,
                    "chunk_index": row.chunk_index,
                    "metadata": row.chunk_metadata,
                    "document_id": row.document_id,
                    "filename": row.filename,
                    "similarity": similarity,
                })

        return results

    async def delete_document_chunks(self, document_id: uuid.UUID) -> int:
        """Delete all chunks for a document. Returns count deleted."""
        result = await self.session.execute(
            select(Chunk).where(Chunk.document_id == document_id)
        )
        chunks = result.scalars().all()
        count = len(chunks)

        for chunk in chunks:
            await self.session.delete(chunk)

        await self.session.flush()
        return count
