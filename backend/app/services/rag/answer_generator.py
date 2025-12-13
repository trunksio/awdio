from dataclasses import dataclass
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.config import settings
from app.services.rag.query_service import RAGContext


ANSWER_SYSTEM_PROMPT = """You are a helpful podcast assistant. When a listener interrupts the podcast with a question, you provide clear, concise, and accurate answers based on the available context.

Guidelines:
- Be conversational and friendly, as if you're part of the podcast
- Keep answers concise (2-4 sentences typically)
- If the context doesn't contain enough information, acknowledge that honestly
- Reference specific details from the context when relevant
- Don't make up information not present in the context
- End with something that naturally leads back to the podcast content"""


@dataclass
class GeneratedAnswer:
    """A generated answer to a user question."""

    text: str
    sources: list[str]
    confidence: float  # Based on context relevance


class AnswerGenerator:
    """Generates answers to user questions using GPT-4o and RAG context."""

    def __init__(self, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model

    async def generate_answer(
        self,
        question: str,
        context: RAGContext,
        current_topic: str = "",
        speaker_name: str = "Assistant",
    ) -> GeneratedAnswer:
        """
        Generate an answer to a user's question.

        Args:
            question: The user's question
            context: RAG context with relevant chunks
            current_topic: What the podcast was discussing (for context)
            speaker_name: Name to use for the response

        Returns:
            GeneratedAnswer with the response text and metadata
        """
        if not context.combined_context:
            return GeneratedAnswer(
                text="I don't have enough information in my knowledge base to answer that question accurately. Let's continue with the podcast.",
                sources=[],
                confidence=0.0,
            )

        # Calculate confidence based on similarity scores
        if context.chunks:
            avg_similarity = sum(c["similarity"] for c in context.chunks) / len(
                context.chunks
            )
            confidence = min(avg_similarity, 1.0)
        else:
            confidence = 0.0

        user_prompt = f"""The listener asked: "{question}"

Context from the knowledge base:
{context.combined_context}

{f"The podcast was discussing: {current_topic}" if current_topic else ""}

Please provide a helpful, conversational answer as {speaker_name}. Keep it concise (2-4 sentences)."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=300,
        )

        answer_text = response.choices[0].message.content or ""

        return GeneratedAnswer(
            text=answer_text,
            sources=context.sources,
            confidence=confidence,
        )

    async def generate_answer_streaming(
        self,
        question: str,
        context: RAGContext,
        current_topic: str = "",
        speaker_name: str = "Assistant",
    ) -> AsyncGenerator[str, None]:
        """
        Stream the answer generation token by token.

        Yields:
            Text chunks as they are generated
        """
        if not context.combined_context:
            yield "I don't have enough information to answer that question. Let's continue with the podcast."
            return

        user_prompt = f"""The listener asked: "{question}"

Context from the knowledge base:
{context.combined_context}

{f"The podcast was discussing: {current_topic}" if current_topic else ""}

Please provide a helpful, conversational answer as {speaker_name}. Keep it concise (2-4 sentences)."""

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=300,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
