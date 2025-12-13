import base64
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.podcast import Episode, Script
from app.models.presenter import PodcastPresenter, Presenter
from app.services.rag import AnswerGenerator, BridgeGenerator, RAGQueryService
from app.services.tts import NeuphonicsService, VoiceManager
from app.websocket.connection_manager import ConnectionManager


class InterruptionHandler:
    """Handles voice interruption and Q&A flow."""

    def __init__(
        self,
        session: AsyncSession,
        manager: ConnectionManager,
        connection_id: str,
    ):
        self.session = session
        self.manager = manager
        self.connection_id = connection_id
        self.rag_query = RAGQueryService(session)
        self.answer_generator = AnswerGenerator()
        self.bridge_generator = BridgeGenerator()
        self.tts = NeuphonicsService()
        self.voice_manager = VoiceManager(session)

    async def handle_message(self, message: dict[str, Any]) -> None:
        """Route incoming WebSocket messages to appropriate handlers."""
        msg_type = message.get("type")

        handlers = {
            "segment_update": self._handle_segment_update,
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

    async def _handle_start_interruption(self, message: dict[str, Any]) -> None:
        """Handle the start of a voice interruption."""
        self.manager.set_interrupted(self.connection_id, True)
        await self.manager.send_json(
            self.connection_id,
            {"type": "interruption_started", "status": "listening"},
        )

    async def _handle_question(self, message: dict[str, Any]) -> None:
        """Handle a transcribed question and generate answer."""
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

            # Get presenters for the conversation (try presenters first, fallback to voices)
            host_presenter, responder_presenter = await self._get_conversation_presenters(conn.podcast_id)

            # Get voices (from presenters or fallback)
            host_voice = None
            responder_voice = None

            if host_presenter and host_presenter.voice_id:
                host_voice = await self.voice_manager.get_voice(host_presenter.voice_id)
            if responder_presenter and responder_presenter.voice_id:
                responder_voice = await self.voice_manager.get_voice(responder_presenter.voice_id)

            # Fallback to podcast_voices if no presenters
            if not host_voice or not responder_voice:
                fallback_host, fallback_responder = await self._get_conversation_voices(conn.podcast_id)
                host_voice = host_voice or fallback_host
                responder_voice = responder_voice or fallback_responder

            # Get presenter names
            host_name = host_presenter.name if host_presenter else "Host"
            responder_name = responder_presenter.name if responder_presenter else "Expert"

            # IMMEDIATELY send acknowledgment audio to fill the gap
            if host_voice and responder_voice:
                ack_text = self.bridge_generator.get_question_acknowledgment(
                    host_name=host_name,
                    responder_name=responder_name
                )
                print(f"[Q&A] Sending acknowledgment: {ack_text}")

                try:
                    ack_audio = await self.tts.synthesize(
                        text=ack_text,
                        voice_id=host_voice.neuphonic_voice_id,
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
                    print(f"[Q&A] Failed to send acknowledgment: {e}")
                    # Continue without acknowledgment

            # Now generate the actual answer (this takes time)
            current_topic = await self._get_current_topic(
                conn.episode_id, conn.current_segment_index
            )

            # Get presenter IDs for combined RAG query
            presenter_ids = []
            if host_presenter:
                presenter_ids.append(host_presenter.id)
            if responder_presenter and responder_presenter.id != (host_presenter.id if host_presenter else None):
                presenter_ids.append(responder_presenter.id)

            # Use combined RAG (podcast KB + presenter KBs)
            context = await self.rag_query.retrieve_combined_context(
                question=question,
                podcast_id=conn.podcast_id,
                presenter_ids=presenter_ids,
                top_k=8,
            )

            # Generate answer with presenter personality
            if responder_presenter:
                answer = await self.answer_generator.generate_presenter_answer(
                    question=question,
                    context=context,
                    presenter_name=responder_name,
                    presenter_traits=responder_presenter.traits or [],
                    listener_name=conn.listener_name,
                    current_topic=current_topic,
                )
            else:
                # Fallback to generic answer
                answer = await self.answer_generator.generate_answer(
                    question=question,
                    context=context,
                    current_topic=current_topic,
                    speaker_name=responder_name,
                )

            # Send answer text
            await self.manager.send_json(
                self.connection_id,
                {
                    "type": "answer_text",
                    "text": answer.text,
                    "sources": answer.sources,
                    "confidence": answer.confidence,
                },
            )

            # Synthesize and send answer audio
            voice = responder_voice or host_voice
            if voice:
                await self.manager.send_json(
                    self.connection_id,
                    {"type": "synthesizing_audio"},
                )

                audio_data = await self.tts.synthesize(
                    text=answer.text,
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

                # Generate and send bridge (back to podcast)
                next_segment_text = await self._get_next_segment_text(
                    conn.episode_id, conn.current_segment_index
                )

                if next_segment_text:
                    # Use host voice for bridge back to content
                    bridge_voice = host_voice or voice
                    bridge_text = self.bridge_generator.get_simple_bridge(host_name)

                    bridge_audio = await self.tts.synthesize(
                        text=bridge_text,
                        voice_id=bridge_voice.neuphonic_voice_id,
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
                {"type": "ready_to_resume"},
            )

            self.manager.set_interrupted(self.connection_id, False)

        except Exception as e:
            import traceback
            error_msg = f"Failed to process question: {type(e).__name__}: {str(e)}"
            print(f"Question handler error: {error_msg}")
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

    async def _get_current_topic(
        self, episode_id: uuid.UUID, segment_index: int
    ) -> str:
        """Get the current topic being discussed."""
        result = await self.session.execute(
            select(Script)
            .options(selectinload(Script.segments))
            .where(Script.episode_id == episode_id)
        )
        script = result.scalar_one_or_none()

        if not script or not script.segments:
            return ""

        segments = sorted(script.segments, key=lambda s: s.segment_index)
        if segment_index < len(segments):
            return segments[segment_index].content

        return ""

    async def _get_next_segment_text(
        self, episode_id: uuid.UUID, current_index: int
    ) -> str:
        """Get the next segment's text."""
        result = await self.session.execute(
            select(Script)
            .options(selectinload(Script.segments))
            .where(Script.episode_id == episode_id)
        )
        script = result.scalar_one_or_none()

        if not script or not script.segments:
            return ""

        segments = sorted(script.segments, key=lambda s: s.segment_index)
        next_index = current_index + 1

        if next_index < len(segments):
            return segments[next_index].content

        return ""

    async def _get_qa_voice(self, podcast_id: uuid.UUID):
        """Get a voice to use for Q&A responses."""
        # First try to get a designated Q&A voice
        assignments = await self.voice_manager.get_podcast_voices(podcast_id)

        for assignment in assignments:
            if assignment.role == "qa" or assignment.role == "assistant":
                return await self.voice_manager.get_voice(assignment.voice_id)

        # Fall back to first available voice
        voices = await self.voice_manager.list_voices()
        if voices:
            return voices[0]

        return None

    async def _get_conversation_voices(self, podcast_id: uuid.UUID):
        """
        Get two voices for the Q&A conversation.
        Returns (host_voice, responder_voice) - host acknowledges, responder answers.
        """
        assignments = await self.voice_manager.get_podcast_voices(podcast_id)
        voices = await self.voice_manager.list_voices()

        host_voice = None
        responder_voice = None

        # Try to find assigned voices
        for assignment in assignments:
            voice = await self.voice_manager.get_voice(assignment.voice_id)
            if assignment.role == "host" and not host_voice:
                host_voice = voice
            elif assignment.role in ("qa", "assistant", "expert", "cohost") and not responder_voice:
                responder_voice = voice

        # Fall back to available voices if not enough assigned
        if voices:
            if not host_voice:
                host_voice = voices[0]
            if not responder_voice:
                # Use a different voice if available
                responder_voice = voices[1] if len(voices) > 1 else voices[0]

        return host_voice, responder_voice

    async def _get_conversation_presenters(
        self, podcast_id: uuid.UUID
    ) -> tuple[Presenter | None, Presenter | None]:
        """
        Get two presenters for the Q&A conversation.
        Returns (host_presenter, responder_presenter) - host acknowledges, responder answers.
        """
        result = await self.session.execute(
            select(PodcastPresenter)
            .options(selectinload(PodcastPresenter.presenter))
            .where(PodcastPresenter.podcast_id == podcast_id)
        )
        assignments = result.scalars().all()

        host_presenter = None
        responder_presenter = None

        for assignment in assignments:
            if assignment.role == "host" and not host_presenter:
                host_presenter = assignment.presenter
            elif assignment.role in ("expert", "cohost", "guest") and not responder_presenter:
                responder_presenter = assignment.presenter

        # If no specific responder found, use the first non-host presenter
        if not responder_presenter:
            for assignment in assignments:
                if assignment.presenter != host_presenter:
                    responder_presenter = assignment.presenter
                    break

        # If still no responder, use host as both (single presenter podcast)
        if not responder_presenter and host_presenter:
            responder_presenter = host_presenter

        return host_presenter, responder_presenter
