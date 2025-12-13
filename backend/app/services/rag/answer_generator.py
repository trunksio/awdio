from dataclasses import dataclass
from typing import AsyncGenerator, Union

from openai import AsyncOpenAI

from app.config import settings
from app.services.rag.query_service import CombinedRAGContext, RAGContext


ANSWER_SYSTEM_PROMPT = """You are a helpful podcast assistant. When a listener interrupts the podcast with a question, you provide clear, concise, and accurate answers based on the available context.

Guidelines:
- Be conversational and friendly, as if you're part of the podcast
- Keep answers concise (2-4 sentences typically)
- If the context doesn't contain enough information, acknowledge that honestly
- Reference specific details from the context when relevant
- Don't make up information not present in the context
- End with something that naturally leads back to the podcast content"""


def build_presenter_system_prompt(
    presenter_name: str,
    presenter_traits: list[str],
    listener_name: str | None = None,
) -> str:
    """Build a personalized system prompt for a presenter."""
    traits_desc = ", ".join(presenter_traits) if presenter_traits else "friendly and knowledgeable"

    prompt = f"""You are {presenter_name}, a podcast presenter. Your personality traits are: {traits_desc}.

When answering questions from listeners, you stay in character with these traits. You provide clear, accurate answers based on the available context while maintaining your unique voice and personality.

Guidelines:
- Stay in character as {presenter_name} with your distinct personality
- Be conversational and engaging, as if you're speaking on the podcast
- Keep answers concise (2-4 sentences typically)
- If the context doesn't contain enough information, acknowledge that honestly in your own voice
- Reference specific details from the context when relevant
- Don't make up information not present in the context
- End with something that naturally leads back to the podcast discussion"""

    if listener_name:
        prompt += f"""

The listener's name is {listener_name}. You may use their name occasionally for personalization, but don't overuse it as that sounds unnatural. Once per answer at most, and only when it feels natural."""

    return prompt


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

    async def generate_presenter_answer(
        self,
        question: str,
        context: Union[RAGContext, CombinedRAGContext],
        presenter_name: str,
        presenter_traits: list[str],
        listener_name: str | None = None,
        current_topic: str = "",
    ) -> GeneratedAnswer:
        """
        Generate an answer as a specific presenter with personality traits.

        Args:
            question: The user's question
            context: RAG context (either simple or combined)
            presenter_name: Name of the presenter answering
            presenter_traits: List of personality traits for the presenter
            listener_name: Optional name of the listener for personalization
            current_topic: What the podcast was discussing (for context)

        Returns:
            GeneratedAnswer with the response text and metadata
        """
        if not context.combined_context:
            fallback = f"Hmm, I'm not sure I have enough information to answer that one properly. Let's get back to what we were discussing."
            return GeneratedAnswer(
                text=fallback,
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

        # Build personalized system prompt
        system_prompt = build_presenter_system_prompt(
            presenter_name=presenter_name,
            presenter_traits=presenter_traits,
            listener_name=listener_name,
        )

        user_prompt = f"""The listener asked: "{question}"

Context from your knowledge and the podcast topic:
{context.combined_context}

{f"The podcast was discussing: {current_topic}" if current_topic else ""}

Please provide a helpful answer in your voice as {presenter_name}. Keep it concise (2-4 sentences)."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=300,
        )

        answer_text = response.choices[0].message.content or ""

        # Get sources - handle both RAGContext and CombinedRAGContext
        if hasattr(context, "all_sources"):
            sources = context.all_sources
        else:
            sources = context.sources

        return GeneratedAnswer(
            text=answer_text,
            sources=sources,
            confidence=confidence,
        )
