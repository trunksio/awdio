from openai import AsyncOpenAI

from app.config import settings


class BridgeGenerator:
    """Generates transition phrases to resume podcast after Q&A interruption."""

    def __init__(self, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model

    async def generate_bridge(
        self,
        question_asked: str,
        answer_given: str,
        next_segment_text: str,
        speaker_name: str,
    ) -> str:
        """
        Generate a bridge sentence to transition back to podcast content.

        Args:
            question_asked: The question that was asked
            answer_given: The answer that was provided
            next_segment_text: The upcoming segment content
            speaker_name: The speaker who will deliver the bridge

        Returns:
            A short bridge sentence
        """
        prompt = f"""Generate a brief (1 sentence) transition phrase for {speaker_name} to smoothly return to the podcast after answering a listener's question.

The listener asked: "{question_asked}"
The answer was: "{answer_given}"
The next segment is about: "{next_segment_text[:200]}..."

The bridge should:
- Be natural and conversational
- Acknowledge we're returning to the main content
- Be very brief (1 short sentence)
- Not repeat what was just said

Just output the transition phrase, nothing else."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=50,
        )

        bridge = response.choices[0].message.content or ""
        # Clean up any quotes that might be around the response
        bridge = bridge.strip().strip('"').strip("'")

        return bridge

    def get_simple_bridge(self, speaker_name: str) -> str:
        """Get a simple pre-written bridge phrase."""
        bridges = [
            "Now, back to what we were discussing.",
            "Alright, let's continue where we left off.",
            "Great question! Now, let's get back to it.",
            "Now then, where were we?",
            "Okay, let's pick up where we left off.",
        ]
        import random
        return random.choice(bridges)

    def get_question_acknowledgment(self, host_name: str, responder_name: str) -> str:
        """
        Get a quick acknowledgment phrase when a question is received.
        This plays immediately to fill the gap while the answer is being generated.

        Args:
            host_name: The host who acknowledges the question
            responder_name: The host who will answer
        """
        import random
        acknowledgments = [
            f"Ooh, great question! {responder_name}, what do you think?",
            f"Interesting! Hey {responder_name}, you know about this, right?",
            f"Good one! {responder_name}, take it away.",
            f"Nice question! {responder_name}, what's your take on that?",
            f"Ah, I love that question. {responder_name}?",
            f"Hmm, that's a good one. {responder_name}, you want to field this?",
        ]
        return random.choice(acknowledgments)
