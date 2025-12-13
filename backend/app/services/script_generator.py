import json
from typing import Any

from openai import AsyncOpenAI

from app.config import settings

SCRIPT_SYSTEM_PROMPT = """You are an expert podcast script writer. Your task is to transform source material into engaging, conversational podcast scripts with multiple speakers.

Guidelines:
- Create natural, flowing dialogue between speakers
- Include appropriate transitions and conversational markers
- Each speaker should have a distinct voice/perspective
- Break complex topics into digestible segments
- Include occasional humor or personality where appropriate
- Ensure the content is accurate to the source material

You MUST output your response as a JSON object with a "segments" key containing an array of dialogue segments.
Each segment must have:
- "speaker": The name of the speaker
- "content": What they say (dialogue only, no stage directions)

Example output format:
{
  "segments": [
    {"speaker": "Alice", "content": "Welcome to today's episode! We're diving into something really fascinating."},
    {"speaker": "Bob", "content": "That's right, Alice. I've been looking forward to discussing this topic."}
  ]
}"""


class ScriptGenerator:
    """Generates multi-speaker podcast scripts using GPT-4o."""

    def __init__(self, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model

    async def generate_script(
        self,
        source_content: str,
        speakers: list[dict],
        target_duration_minutes: int = 10,
        tone: str = "conversational and engaging",
        additional_instructions: str = "",
    ) -> list[dict]:
        """
        Generate a podcast script from source content.

        Args:
            source_content: The text content to base the script on
            speakers: List of speaker configs, e.g. [{"name": "Alice", "role": "host"}, {"name": "Bob", "role": "expert"}]
            target_duration_minutes: Target length of the podcast
            tone: Desired tone of the conversation
            additional_instructions: Any extra instructions for the script

        Returns:
            List of script segments with speaker and content
        """
        speaker_descriptions = "\n".join(
            f"- {s['name']}: {s.get('role', 'speaker')} - {s.get('description', '')}"
            for s in speakers
        )

        user_prompt = f"""Create a podcast script based on the following source material.

## Configuration
- Number of speakers: {len(speakers)}
- Target duration: approximately {target_duration_minutes} minutes
- Tone: {tone}

## Speakers
{speaker_descriptions}

## Source Material
{source_content[:15000]}

## Additional Instructions
{additional_instructions if additional_instructions else "None"}

Generate a JSON object with a "segments" array. Each segment should be one speaker's turn.
Aim for approximately {target_duration_minutes * 150} words total (roughly 150 words per minute of audio).
Make the conversation feel natural and engaging. Include at least 6-10 dialogue exchanges."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SCRIPT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=4000,
        )

        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from LLM")

        # Parse the JSON response
        result = json.loads(content)

        # Handle various response formats
        if isinstance(result, dict):
            # Try common keys for the segments array
            segments = (
                result.get("segments")
                or result.get("script")
                or result.get("dialogue")
                or result.get("conversation")
                or []
            )
        elif isinstance(result, list):
            segments = result
        else:
            segments = []

        if not segments:
            raise ValueError(f"No segments found in response. Got keys: {list(result.keys()) if isinstance(result, dict) else type(result)}")

        return segments

    async def generate_answer(
        self,
        question: str,
        context: str,
        current_topic: str = "",
    ) -> str:
        """
        Generate an answer to a user's question based on context.

        Args:
            question: The user's question
            context: Relevant context from RAG
            current_topic: What the podcast was discussing when interrupted

        Returns:
            The answer text
        """
        system_prompt = """You are a helpful podcast assistant. When a listener interrupts with a question,
provide a clear, concise answer based on the available context. Be conversational and helpful.
If you don't have enough information to answer fully, acknowledge that."""

        user_prompt = f"""The listener asked: "{question}"

Context from the knowledge base:
{context}

{"Current topic being discussed: " + current_topic if current_topic else ""}

Provide a helpful, conversational answer. Keep it concise (2-4 sentences typically)."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=500,
        )

        return response.choices[0].message.content or ""

    async def generate_bridge(
        self,
        previous_topic: str,
        next_content: str,
        speaker_name: str,
    ) -> str:
        """
        Generate a bridge sentence to transition back to the main content.

        Args:
            previous_topic: What was being discussed before the interruption
            next_content: The next segment that will play
            speaker_name: The name of the speaker who should deliver the bridge

        Returns:
            A short bridge sentence
        """
        prompt = f"""Generate a brief (1-2 sentences) transition phrase for {speaker_name} to smoothly
return to the main podcast content after answering a listener's question.

The podcast was discussing: {previous_topic}
The next segment is: {next_content[:200]}...

The bridge should feel natural and help the listener re-engage with the main content."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=100,
        )

        return response.choices[0].message.content or ""
