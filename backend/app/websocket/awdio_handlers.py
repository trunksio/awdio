"""WebSocket handlers for Awdio Q&A with slide selection."""

import base64
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.awdio import (
    Awdio,
    AwdioSession,
    NarrationScript,
    NarrationSegment,
    Slide,
    SlideDeck,
)
from app.models.presenter import Presenter
from app.services.narration_generator import NarrationGenerator
from app.services.rag import RAGQueryService
from app.services.slide_selector import SlideSelector
from app.services.tts import NeuphonicsService, VoiceManager
from app.websocket.awdio_manager import AwdioConnectionManager


class AwdioInterruptionHandler:
    """Handles voice interruption and Q&A flow for Awdio sessions with slide selection."""

    def __init__(
        self,
        session: AsyncSession,
        manager: AwdioConnectionManager,
        connection_id: str,
    ):
        self.session = session
        self.manager = manager
        self.connection_id = connection_id
        self.rag_query = RAGQueryService(session)
        self.narration_generator = NarrationGenerator()
        self.slide_selector = SlideSelector(session)
        self.tts = NeuphonicsService()
        self.voice_manager = VoiceManager(session)

    async def handle_message(self, message: dict[str, Any]) -> None:
        """Route incoming WebSocket messages to appropriate handlers."""
        msg_type = message.get("type")

        handlers = {
            "segment_update": self._handle_segment_update,
            "slide_update": self._handle_slide_update,
            "start_interruption": self._handle_start_interruption,
            "question": self._handle_question,
            "cancel_interruption": self._handle_cancel_interruption,
            "ping": self._handle_ping,
        }

        handler = handlers.get(msg_type)
        if handler:
            await handler(message)
        else:
            await self._send_error(f"Unknown message type: {msg_type}")

    async def _handle_segment_update(self, message: dict[str, Any]) -> None:
        """Update current segment index."""
        segment_index = message.get("segment_index", 0)
        self.manager.update_segment(self.connection_id, segment_index)

    async def _handle_slide_update(self, message: dict[str, Any]) -> None:
        """Update current slide index."""
        slide_index = message.get("slide_index", 0)
        self.manager.update_slide(self.connection_id, slide_index)

    async def _handle_start_interruption(self, message: dict[str, Any]) -> None:
        """Handle the start of a voice interruption."""
        self.manager.set_interrupted(self.connection_id, True)
        await self.manager.send_json(
            self.connection_id,
            {"type": "interruption_started", "status": "listening"},
        )

    async def _handle_question(self, message: dict[str, Any]) -> None:
        """Handle a transcribed question and generate answer with optional slide selection."""
        question = message.get("question", "").strip()
        if not question:
            await self._send_error("No question provided")
            return

        conn = self.manager.get_connection(self.connection_id)
        if not conn:
            return

        try:
            # Acknowledge question received
            await self.manager.send_json(
                self.connection_id,
                {"type": "question_received", "question": question},
            )

            # Get awdio and presenter info
            awdio = await self._get_awdio(conn.awdio_id)
            if not awdio:
                await self._send_error("Awdio not found")
                return

            presenter = await self._get_presenter(awdio.presenter_id) if awdio.presenter_id else None
            presenter_name = presenter.name if presenter else "Presenter"

            # Get presenter voice
            voice = None
            if presenter and presenter.voice_id:
                voice = await self.voice_manager.get_voice(presenter.voice_id)

            # Immediately send acknowledgment audio
            if voice:
                ack_text = self._get_question_acknowledgment(presenter_name)
                print(f"[Awdio Q&A] Sending acknowledgment: {ack_text}")

                try:
                    ack_audio = await self.tts.synthesize(
                        text=ack_text,
                        voice_id=voice.neuphonic_voice_id,
                        speed=1.0,
                    )
                    ack_b64 = base64.b64encode(ack_audio).decode("utf-8")
                    await self.manager.send_json(
                        self.connection_id,
                        {
                            "type": "acknowledgment_audio",
                            "text": ack_text,
                            "audio": ack_b64,
                            "format": "wav",
                        },
                    )
                except Exception as e:
                    print(f"[Awdio Q&A] Failed to send acknowledgment: {e}")

            # Get current context
            current_slide_info = await self._get_current_slide_info(
                conn.session_id,
                conn.current_segment_index,
            )

            # Retrieve context from knowledge base
            # TODO: Use awdio-specific knowledge base query when implemented
            context = ""

            # Generate answer
            answer_result = await self.narration_generator.generate_qa_answer(
                question=question,
                context=context,
                current_slide_info=current_slide_info,
                presenter_name=presenter_name,
            )

            # Check if we should show a slide
            selected_slide = None
            if conn.slide_deck_id:
                selected_slide = await self.slide_selector.select_slide(
                    question=question,
                    answer_context=answer_result.get("answer", ""),
                    slide_deck_id=conn.slide_deck_id,
                    current_slide_index=conn.current_slide_index,
                )

            # If we selected a different slide, notify the client
            if selected_slide and selected_slide.slide_index != conn.current_slide_index:
                # Extract the object path for the slide
                slide_path = selected_slide.slide_path.split("/", 1)[-1] if "/" in selected_slide.slide_path else selected_slide.slide_path

                await self.manager.send_json(
                    self.connection_id,
                    {
                        "type": "qa_slide_select",
                        "slide_id": str(selected_slide.slide_id),
                        "slide_index": selected_slide.slide_index,
                        "slide_path": slide_path,
                        "reason": selected_slide.reason,
                        "confidence": selected_slide.confidence,
                    },
                )

            # Send answer text
            await self.manager.send_json(
                self.connection_id,
                {
                    "type": "answer_text",
                    "text": answer_result.get("answer", ""),
                    "sources": [],
                    "confidence": 0.8,
                },
            )

            # Synthesize and send answer audio
            if voice:
                await self.manager.send_json(
                    self.connection_id,
                    {"type": "synthesizing_audio"},
                )

                audio_data = await self.tts.synthesize(
                    text=answer_result.get("answer", ""),
                    voice_id=voice.neuphonic_voice_id,
                    speed=1.0,
                )

                audio_b64 = base64.b64encode(audio_data).decode("utf-8")
                await self.manager.send_json(
                    self.connection_id,
                    {
                        "type": "answer_audio",
                        "audio": audio_b64,
                        "format": "wav",
                    },
                )

                # If we showed a different slide, send return signal
                if selected_slide and selected_slide.slide_index != conn.current_slide_index:
                    return_slide_index = conn.interrupted_slide_index if conn.interrupted_slide_index is not None else conn.current_slide_index

                    await self.manager.send_json(
                        self.connection_id,
                        {
                            "type": "qa_slide_clear",
                            "return_to_slide_index": return_slide_index,
                        },
                    )

                # Generate bridge back to content
                next_segment_text = await self._get_next_segment_text(
                    conn.session_id, conn.current_segment_index
                )

                if next_segment_text:
                    bridge_text = self._get_simple_bridge(presenter_name)

                    bridge_audio = await self.tts.synthesize(
                        text=bridge_text,
                        voice_id=voice.neuphonic_voice_id,
                        speed=1.0,
                    )

                    bridge_b64 = base64.b64encode(bridge_audio).decode("utf-8")
                    await self.manager.send_json(
                        self.connection_id,
                        {
                            "type": "bridge_audio",
                            "text": bridge_text,
                            "audio": bridge_b64,
                            "format": "wav",
                        },
                    )

            # Signal ready to resume
            await self.manager.send_json(
                self.connection_id,
                {
                    "type": "ready_to_resume",
                    "resume_slide_index": conn.interrupted_slide_index or conn.current_slide_index,
                },
            )

            self.manager.set_interrupted(self.connection_id, False)

        except Exception as e:
            import traceback
            error_msg = f"Failed to process question: {type(e).__name__}: {str(e)}"
            print(f"[Awdio Q&A] Error: {error_msg}")
            print(traceback.format_exc())
            await self._send_error(error_msg)
            self.manager.set_interrupted(self.connection_id, False)

    async def _handle_cancel_interruption(self, message: dict[str, Any]) -> None:
        """Cancel an ongoing interruption."""
        self.manager.set_interrupted(self.connection_id, False)
        await self.manager.send_json(
            self.connection_id,
            {"type": "interruption_cancelled"},
        )

    async def _handle_ping(self, message: dict[str, Any]) -> None:
        """Respond to ping with pong."""
        await self.manager.send_json(self.connection_id, {"type": "pong"})

    async def _send_error(self, error: str) -> None:
        """Send an error message."""
        await self.manager.send_json(
            self.connection_id,
            {"type": "error", "error": error},
        )

    async def _get_awdio(self, awdio_id: uuid.UUID) -> Awdio | None:
        """Get awdio by ID."""
        result = await self.session.execute(
            select(Awdio).where(Awdio.id == awdio_id)
        )
        return result.scalar_one_or_none()

    async def _get_presenter(self, presenter_id: uuid.UUID) -> Presenter | None:
        """Get presenter by ID."""
        result = await self.session.execute(
            select(Presenter).where(Presenter.id == presenter_id)
        )
        return result.scalar_one_or_none()

    async def _get_awdio_session(self, session_id: uuid.UUID) -> AwdioSession | None:
        """Get awdio session by ID."""
        result = await self.session.execute(
            select(AwdioSession).where(AwdioSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def _get_current_slide_info(
        self, session_id: uuid.UUID, segment_index: int
    ) -> dict[str, Any]:
        """Get information about the current slide being shown."""
        result = await self.session.execute(
            select(NarrationScript)
            .options(selectinload(NarrationScript.segments))
            .where(NarrationScript.session_id == session_id)
        )
        script = result.scalar_one_or_none()

        if not script or not script.segments:
            return {}

        segments = sorted(script.segments, key=lambda s: s.segment_index)
        if segment_index < len(segments):
            seg = segments[segment_index]
            # Get the slide to retrieve slide_index
            slide_result = await self.session.execute(
                select(Slide).where(Slide.id == seg.slide_id)
            )
            slide = slide_result.scalar_one_or_none()
            return {
                "slide_index": slide.slide_index if slide else 0,
                "content": seg.content,
            }

        return {}

    async def _get_next_segment_text(
        self, session_id: uuid.UUID, current_index: int
    ) -> str:
        """Get the next segment's text."""
        result = await self.session.execute(
            select(NarrationScript)
            .options(selectinload(NarrationScript.segments))
            .where(NarrationScript.session_id == session_id)
        )
        script = result.scalar_one_or_none()

        if not script or not script.segments:
            return ""

        segments = sorted(script.segments, key=lambda s: s.segment_index)
        next_index = current_index + 1

        if next_index < len(segments):
            return segments[next_index].content

        return ""

    def _get_question_acknowledgment(self, presenter_name: str) -> str:
        """Get a short acknowledgment phrase."""
        import random

        acknowledgments = [
            f"Great question! Let me explain.",
            f"Ah, good point! Here's what I can tell you.",
            f"That's a common question. Let me clarify.",
            f"I'm glad you asked. Here's my take on that.",
            f"Let me address that for you.",
        ]
        return random.choice(acknowledgments)

    def _get_simple_bridge(self, presenter_name: str) -> str:
        """Get a simple bridge phrase to return to content."""
        import random

        bridges = [
            "Now, let's continue with the presentation.",
            "Alright, back to where we were.",
            "Now, let me continue.",
            "Great, let's move on.",
            "Okay, continuing from where we left off.",
        ]
        return random.choice(bridges)
