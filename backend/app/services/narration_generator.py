"""
Service for generating narration scripts for awdio presentations.
Generates narration for each slide based on slide content and knowledge base.
"""

import json
from typing import Any

from openai import AsyncOpenAI

from app.config import settings

NARRATION_SYSTEM_PROMPT = """You are an expert presentation narrator. Your task is to create engaging, clear narration for each slide in a presentation.

Guidelines:
- If speaker notes are provided for a slide, use them as the primary content (you can polish the language slightly but preserve the key points and wording)
- For slides without speaker notes, create narration based on the title, AI description, and keywords
- Make the narration flow naturally from slide to slide
- Include smooth transitions between slides
- Explain complex concepts in accessible terms
- Keep the audience engaged with varied pacing
- Each slide's narration should be self-contained but connected to the overall flow

You MUST output your response as a JSON object with a "segments" key containing an array of narration segments.
Each segment must have:
- "slide_index": The 0-based index of the slide (integer)
- "content": The narration text for that slide
- "transition_text": Optional text to transition to the next slide (can be empty string)

Example output format:
{
  "segments": [
    {"slide_index": 0, "content": "Welcome to our presentation on...", "transition_text": "Let's begin by looking at..."},
    {"slide_index": 1, "content": "As we can see here...", "transition_text": "Moving on to..."}
  ]
}"""


class NarrationGenerator:
    """Generates narration scripts for awdio presentations."""

    def __init__(self, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model

    async def generate_narration_script(
        self,
        slides: list[dict[str, Any]],
        presenter_name: str = "Presenter",
        tone: str = "professional and engaging",
        additional_context: str = "",
        additional_instructions: str = "",
    ) -> list[dict]:
        """
        Generate a narration script for a presentation.

        Args:
            slides: List of slide info dicts with keys: slide_index, title, description, keywords
            presenter_name: Name of the presenter
            tone: Desired tone of the narration
            additional_context: Additional context from knowledge base
            additional_instructions: Any extra instructions

        Returns:
            List of narration segments with slide_index and content
        """
        # Build slide descriptions
        slide_descriptions = []
        for slide in slides:
            desc_parts = [f"Slide {slide['slide_index'] + 1}:"]
            if slide.get("title"):
                desc_parts.append(f"  Title: {slide['title']}")
            if slide.get("description"):
                desc_parts.append(f"  Content: {slide['description']}")
            if slide.get("keywords"):
                desc_parts.append(f"  Keywords: {', '.join(slide['keywords'])}")
            slide_descriptions.append("\n".join(desc_parts))

        slides_text = "\n\n".join(slide_descriptions)

        user_prompt = f"""Create a narration script for the following presentation.

## Configuration
- Presenter: {presenter_name}
- Number of slides: {len(slides)}
- Tone: {tone}

## Slide Content
{slides_text}

## Additional Context
{additional_context[:5000] if additional_context else "None provided"}

## Additional Instructions
{additional_instructions if additional_instructions else "None"}

Generate a JSON object with a "segments" array. Each segment should contain the narration for one slide.
The narration should explain the slide content clearly and maintain audience engagement.
Include smooth transitions between slides where appropriate.
Aim for approximately 30-60 seconds of narration per slide (about 75-150 words)."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": NARRATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=4000,
        )

        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from LLM")

        result = json.loads(content)

        if isinstance(result, dict):
            segments = result.get("segments") or result.get("narration") or []
        elif isinstance(result, list):
            segments = result
        else:
            segments = []

        if not segments:
            raise ValueError(f"No segments found in response")

        # Ensure all segments have the required fields
        processed_segments = []
        for seg in segments:
            processed_segments.append({
                "slide_index": seg.get("slide_index", 0),
                "content": seg.get("content", ""),
                "transition_text": seg.get("transition_text", ""),
            })

        return processed_segments

    async def generate_qa_answer(
        self,
        question: str,
        context: str,
        current_slide_info: dict[str, Any] | None = None,
        presenter_name: str = "Presenter",
    ) -> dict[str, str]:
        """
        Generate an answer to a Q&A question during a presentation.

        Args:
            question: The audience's question
            context: Relevant context from RAG
            current_slide_info: Info about the current slide
            presenter_name: Name of the presenter

        Returns:
            Dict with 'answer' and 'suggested_slide_index' (or -1 if no slide suggestion)
        """
        slide_context = ""
        if current_slide_info:
            slide_context = f"""
Current slide being shown:
- Title: {current_slide_info.get('title', 'Unknown')}
- Content: {current_slide_info.get('description', 'No description')}"""

        system_prompt = f"""You are {presenter_name}, a knowledgeable presenter answering audience questions.
Answer questions clearly and concisely based on the provided context.
Be conversational and helpful. If you don't have enough information, acknowledge that.

Respond in JSON format with:
- "answer": Your answer to the question
- "should_show_slide": true/false - whether a specific slide should be shown
- "suggested_slide_keywords": Array of keywords to find a relevant slide (if applicable)"""

        user_prompt = f"""An audience member asks: "{question}"
{slide_context}

Context from knowledge base:
{context[:3000]}

Provide a helpful, conversational answer (2-4 sentences typically)."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=500,
        )

        content = response.choices[0].message.content or "{}"
        result = json.loads(content)

        return {
            "answer": result.get("answer", "I'm sorry, I don't have enough information to answer that."),
            "should_show_slide": result.get("should_show_slide", False),
            "suggested_slide_keywords": result.get("suggested_slide_keywords", []),
        }

    async def generate_return_transition(
        self,
        interrupted_slide_info: dict[str, Any],
        next_slide_info: dict[str, Any] | None,
        presenter_name: str = "Presenter",
    ) -> str:
        """
        Generate a transition phrase to return to the presentation after Q&A.

        Args:
            interrupted_slide_info: Info about the slide where we were interrupted
            next_slide_info: Info about the next slide (if any)
            presenter_name: Name of the presenter

        Returns:
            A short transition phrase
        """
        current_title = interrupted_slide_info.get("title", "the current topic")
        next_title = next_slide_info.get("title", "our next topic") if next_slide_info else None

        prompt = f"""Generate a brief (1 sentence) transition phrase for {presenter_name} to smoothly
return to the presentation after answering a question.

We were discussing: {current_title}
{"Next we'll cover: " + next_title if next_title else "We'll continue with: " + current_title}

The transition should feel natural and help the audience re-engage."""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=100,
        )

        return response.choices[0].message.content or f"Now, let's continue with {current_title}."
