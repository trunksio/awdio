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
from app.services.embedding_service import EmbeddingService
from app.services.narration_generator import NarrationGenerator
from app.services.rag import RAGQueryService
from app.services.slide_selector import SlideSelector
from app.services.tts import TTSFactory, VoiceManager
from app.services.vector_store import VectorStore
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
        self.voice_manager = VoiceManager(session)
        self.embedding_service = EmbeddingService()
        self.vector_store = VectorStore(session)

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
                    tts = TTSFactory.get_provider(voice.tts_provider)
                    ack_audio = await tts.synthesize(
                        text=ack_text,
                        voice_id=voice.effective_voice_id,
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

            # Retrieve context from knowledge bases
            context = await self._retrieve_qa_context(
                question=question,
                presenter_id=awdio.presenter_id,
                awdio_id=conn.awdio_id,
                presenter=presenter,
            )

            # Generate answer
            answer_result = await self.narration_generator.generate_qa_answer(
                question=question,
                context=context,
                current_slide_info=current_slide_info,
                presenter_name=presenter_name,
            )

            # Check if we should show a slide or KB image
            selected_visual = await self.slide_selector.select_visual_for_answer(
                question=question,
                answer=answer_result.get("answer", ""),
                slide_deck_id=conn.slide_deck_id,
                presenter_id=awdio.presenter_id,
                awdio_id=conn.awdio_id,
                current_slide_index=conn.current_slide_index,
            )

            # If we selected a visual, notify the client
            should_show_visual = False
            if selected_visual:
                # For slides, only show if it's a different slide
                if selected_visual.visual_type == "slide":
                    should_show_visual = selected_visual.slide_index != conn.current_slide_index
                else:
                    # For KB images, always show
                    should_show_visual = True

            if selected_visual and should_show_visual:
                # Extract the object path for the visual
                visual_path = selected_visual.visual_path.split("/", 1)[-1] if "/" in selected_visual.visual_path else selected_visual.visual_path
                thumbnail_path = None
                if selected_visual.thumbnail_path:
                    thumbnail_path = selected_visual.thumbnail_path.split("/", 1)[-1] if "/" in selected_visual.thumbnail_path else selected_visual.thumbnail_path

                await self.manager.send_json(
                    self.connection_id,
                    {
                        "type": "qa_visual_select",
                        "visual_type": selected_visual.visual_type,
                        "visual_id": str(selected_visual.visual_id),
                        "visual_path": visual_path,
                        "thumbnail_path": thumbnail_path,
                        "source": selected_visual.source,
                        "slide_index": selected_visual.slide_index,  # None for KB images
                        "reason": selected_visual.reason,
                        "confidence": selected_visual.confidence,
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

                tts = TTSFactory.get_provider(voice.tts_provider)
                
                # Use MP3 for ElevenLabs to keep payload size down for long answers
                output_format = "wav"
                if voice.tts_provider == "elevenlabs":
                    output_format = "mp3"
                
                audio_data = await tts.synthesize(
                    text=answer_result.get("answer", ""),
                    voice_id=voice.effective_voice_id,
                    speed=1.0,
                    output_format=output_format,
                )

                # Chunk audio if it's too large (e.g., > 600KB) to prevent WebSocket disconnects
                # This is critical for WAV files (Neuphonic) which can easily exceed 1MB
                MAX_CHUNK_SIZE = 600 * 1024
                
                if len(audio_data) > MAX_CHUNK_SIZE and output_format == "wav":
                    print(f"[Awdio Q&A] Audio too large ({len(audio_data)} bytes), chunking...")
                    chunks = self._chunk_wav_audio(audio_data, MAX_CHUNK_SIZE)
                    for i, chunk in enumerate(chunks):
                        chunk_b64 = base64.b64encode(chunk).decode("utf-8")
                        await self.manager.send_json(
                            self.connection_id,
                            {
                                "type": "answer_audio",
                                "audio": chunk_b64,
                                "format": output_format,
                                "chunk_index": i,
                                "total_chunks": len(chunks),
                            },
                        )
                else:
                    audio_b64 = base64.b64encode(audio_data).decode("utf-8")
                    await self.manager.send_json(
                        self.connection_id,
                        {
                            "type": "answer_audio",
                            "audio": audio_b64,
                            "format": output_format,
                        },
                    )

                # If we showed a visual, send clear signal
                if selected_visual and should_show_visual:
                    return_slide_index = conn.interrupted_slide_index if conn.interrupted_slide_index is not None else conn.current_slide_index

                    await self.manager.send_json(
                        self.connection_id,
                        {
                            "type": "qa_visual_clear",
                            "return_to_slide_index": return_slide_index,
                        },
                    )

                # Generate bridge back to content
                next_segment_text = await self._get_next_segment_text(
                    conn.session_id, conn.current_segment_index
                )

                if next_segment_text:
                    bridge_text = self._get_simple_bridge(presenter_name)

                    tts = TTSFactory.get_provider(voice.tts_provider)
                    bridge_audio = await tts.synthesize(
                        text=bridge_text,
                        voice_id=voice.effective_voice_id,
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

    async def _retrieve_qa_context(
        self,
        question: str,
        presenter_id: uuid.UUID | None,
        awdio_id: uuid.UUID,
        presenter: Presenter | None,
    ) -> str:
        """
        Retrieve relevant context from knowledge bases for Q&A.

        Searches both presenter KB and awdio KB, and includes presenter info.
        """
        context_parts = []

        # 1. Include presenter information (helps with name recognition)
        if presenter:
            presenter_info = f"About the presenter:\n- Name: {presenter.name}"
            if presenter.bio:
                presenter_info += f"\n- Bio: {presenter.bio}"
            if presenter.traits:
                presenter_info += f"\n- Key traits: {', '.join(presenter.traits)}"
            context_parts.append(presenter_info)

        try:
            # Generate embedding for the question
            question_embedding = await self.embedding_service.embed_text(question)

            all_chunks = []

            # 2. Search presenter's knowledge base
            if presenter_id:
                presenter_chunks = await self.vector_store.presenter_similarity_search(
                    query_embedding=question_embedding,
                    presenter_id=presenter_id,
                    top_k=5,
                    threshold=0.3,
                )
                all_chunks.extend(presenter_chunks)

            # 3. Search awdio's knowledge base
            awdio_chunks = await self.vector_store.awdio_similarity_search(
                query_embedding=question_embedding,
                awdio_id=awdio_id,
                top_k=5,
                threshold=0.3,
            )
            all_chunks.extend(awdio_chunks)

            # 4. Search presenter's KB images (associated_text)
            if presenter_id:
                presenter_images = await self._search_presenter_kb_images_for_context(
                    query_embedding=question_embedding,
                    presenter_id=presenter_id,
                )
                for img in presenter_images:
                    all_chunks.append({
                        "content": img.get("associated_text", ""),
                        "similarity": img.get("similarity", 0),
                        "filename": img.get("title") or img.get("filename", "image"),
                        "source_type": "presenter_image",
                    })

            # 5. Search awdio's KB images (associated_text)
            awdio_images = await self._search_awdio_kb_images_for_context(
                query_embedding=question_embedding,
                awdio_id=awdio_id,
            )
            for img in awdio_images:
                all_chunks.append({
                    "content": img.get("associated_text", ""),
                    "similarity": img.get("similarity", 0),
                    "filename": img.get("title") or img.get("filename", "image"),
                    "source_type": "awdio_image",
                })

            # Sort by similarity and take top results
            all_chunks.sort(key=lambda x: x["similarity"], reverse=True)
            top_chunks = all_chunks[:5]

            # Add chunk contents to context
            if top_chunks:
                kb_context = "Relevant information from knowledge base:\n"
                for chunk in top_chunks:
                    source = chunk.get("filename", "unknown source")
                    kb_context += f"\n[From {source}]:\n{chunk['content']}\n"
                context_parts.append(kb_context)

        except Exception as e:
            print(f"[Awdio Q&A] Failed to retrieve KB context: {e}")

        return "\n\n".join(context_parts)

    async def _search_presenter_kb_images_for_context(
        self,
        query_embedding: list[float],
        presenter_id: uuid.UUID,
        top_k: int = 3,
        threshold: float = 0.3,
    ) -> list[dict]:
        """Search presenter KB images by their associated_text embeddings."""
        from sqlalchemy import text, bindparam

        embedding_str = str(query_embedding)
        presenter_id_str = str(presenter_id)

        query = text("""
            SELECT
                pki.id,
                pki.filename,
                pki.title,
                pki.description,
                pki.associated_text,
                1 - (pki.embedding <=> CAST(:emb AS vector)) as similarity
            FROM presenter_kb_images pki
            JOIN presenter_knowledge_bases pkb ON pki.knowledge_base_id = pkb.id
            WHERE pkb.presenter_id = CAST(:presenter_id AS uuid)
              AND pki.embedding IS NOT NULL
            ORDER BY pki.embedding <=> CAST(:emb AS vector)
            LIMIT :lim
        """).bindparams(
            bindparam("emb", value=embedding_str),
            bindparam("presenter_id", value=presenter_id_str),
            bindparam("lim", value=top_k),
        )

        result = await self.session.execute(query)
        rows = result.fetchall()
        results = []

        for row in rows:
            similarity = float(row.similarity)
            if similarity >= threshold:
                results.append({
                    "id": row.id,
                    "filename": row.filename,
                    "title": row.title,
                    "description": row.description,
                    "associated_text": row.associated_text,
                    "similarity": similarity,
                })

        return results

    async def _search_awdio_kb_images_for_context(
        self,
        query_embedding: list[float],
        awdio_id: uuid.UUID,
        top_k: int = 3,
        threshold: float = 0.3,
    ) -> list[dict]:
        """Search awdio KB images by their associated_text embeddings."""
        from sqlalchemy import text, bindparam

        embedding_str = str(query_embedding)
        awdio_id_str = str(awdio_id)

        query = text("""
            SELECT
                aki.id,
                aki.filename,
                aki.title,
                aki.description,
                aki.associated_text,
                1 - (aki.embedding <=> CAST(:emb AS vector)) as similarity
            FROM awdio_kb_images aki
            JOIN awdio_knowledge_bases akb ON aki.knowledge_base_id = akb.id
            WHERE akb.awdio_id = CAST(:awdio_id AS uuid)
              AND aki.embedding IS NOT NULL
            ORDER BY aki.embedding <=> CAST(:emb AS vector)
            LIMIT :lim
        """).bindparams(
            bindparam("emb", value=embedding_str),
            bindparam("awdio_id", value=awdio_id_str),
            bindparam("lim", value=top_k),
        )

        result = await self.session.execute(query)
        rows = result.fetchall()
        results = []

        for row in rows:
            similarity = float(row.similarity)
            if similarity >= threshold:
                results.append({
                    "id": row.id,
                    "filename": row.filename,
                    "title": row.title,
                    "description": row.description,
                    "associated_text": row.associated_text,
                    "similarity": similarity,
                })

        return results

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

    def _chunk_wav_audio(self, wav_bytes: bytes, max_chunk_size: int) -> list[bytes]:
        """
        Split a single WAV file into multiple valid WAV files.
        Each chunk will have a proper header so it can be played independently.
        """
        import io
        import wave
        import math

        try:
            with wave.open(io.BytesIO(wav_bytes), "rb") as wav_in:
                params = wav_in.getparams()
                
                # Calculate frames per chunk
                # Header is ~44 bytes, so chunk size is mostly data
                # bytes_per_frame = nchannels * sampwidth
                bytes_per_frame = params.nchannels * params.sampwidth
                if bytes_per_frame == 0:
                     return [wav_bytes] # safety check

                frames_per_chunk = math.floor((max_chunk_size - 100) / bytes_per_frame)
                
                chunks = []
                while True:
                    frames = wav_in.readframes(frames_per_chunk)
                    if not frames:
                        break
                        
                    # Create new valid WAV for this chunk
                    out_buf = io.BytesIO()
                    with wave.open(out_buf, "wb") as wav_out:
                        wav_out.setparams(params)
                        wav_out.writeframes(frames)
                    
                    out_buf.seek(0)
                    chunks.append(out_buf.read())
                    
                return chunks
        except Exception as e:
            print(f"Error chunking WAV: {e}")
            # Fallback: just return the original if we can't parse it
            return [wav_bytes]
