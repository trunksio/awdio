import asyncio
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.podcast import Episode, EpisodeManifest, Script, ScriptSegment
from app.models.voice import Voice
from app.services.storage_service import StorageService
from app.services.tts.neuphonic_service import NeuphonicsService
from app.services.tts.voice_manager import VoiceManager


class SynthesisService:
    """Orchestrates audio synthesis for podcast episodes."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.tts = NeuphonicsService()
        self.storage = StorageService()
        self.voice_manager = VoiceManager(session)

    async def synthesize_episode(
        self,
        episode_id: uuid.UUID,
        speed: float = 1.0,
    ) -> EpisodeManifest:
        """
        Synthesize all segments for an episode.

        Args:
            episode_id: The episode to synthesize
            speed: Speech speed multiplier (0.5-2.0)

        Returns:
            The generated episode manifest
        """
        # Load episode with script and segments
        result = await self.session.execute(
            select(Episode)
            .options(
                selectinload(Episode.script).selectinload(Script.segments),
                selectinload(Episode.podcast),
            )
            .where(Episode.id == episode_id)
        )
        episode = result.scalar_one_or_none()

        if not episode:
            raise ValueError(f"Episode {episode_id} not found")

        if not episode.script:
            raise ValueError(f"Episode {episode_id} has no script")

        if not episode.script.segments:
            raise ValueError(f"Episode {episode_id} script has no segments")

        # Mark synthesis as started
        episode.script.synthesis_started_at = datetime.utcnow()
        episode.script.status = "synthesizing"
        await self.session.flush()

        # Get voice assignments for this podcast
        podcast_id = episode.podcast_id
        segments = sorted(episode.script.segments, key=lambda s: s.segment_index)

        # Build speaker -> voice mapping
        speaker_voices = await self._resolve_speaker_voices(podcast_id, segments)

        # Synthesize each segment
        synthesized_segments = []
        for segment in segments:
            audio_data = await self._synthesize_segment(
                segment, speaker_voices, speed
            )

            # Store audio in MinIO
            audio_path = await self.storage.upload_audio(
                audio_data,
                podcast_id,
                episode_id,
                segment.segment_index,
                format="wav",
            )

            # Estimate duration (rough: ~150 words per minute at speed 1.0)
            word_count = len(segment.content.split())
            duration_ms = int((word_count / 150) * 60 * 1000 / speed)

            # Update segment with audio info
            segment.audio_path = audio_path
            segment.audio_duration_ms = duration_ms

            synthesized_segments.append({
                "index": segment.segment_index,
                "speaker": segment.speaker_name,
                "audio_path": audio_path,
                "duration_ms": duration_ms,
                "text": segment.content,
            })

        # Mark synthesis as completed
        episode.script.synthesis_completed_at = datetime.utcnow()
        episode.script.status = "synthesized"

        # Generate manifest
        total_duration_ms = sum(s["duration_ms"] for s in synthesized_segments)
        manifest = await self._create_manifest(
            episode_id, synthesized_segments, total_duration_ms
        )

        await self.session.flush()
        return manifest

    async def _resolve_speaker_voices(
        self,
        podcast_id: uuid.UUID,
        segments: list[ScriptSegment],
    ) -> dict[str, Voice]:
        """
        Resolve voice assignments for all speakers in the segments.
        Returns a mapping of speaker_name -> Voice.
        """
        speaker_names = set(s.speaker_name for s in segments)
        speaker_voices: dict[str, Voice] = {}

        for speaker_name in speaker_names:
            # First check if there's an explicit assignment
            voice = await self.voice_manager.get_voice_for_speaker(
                podcast_id, speaker_name
            )

            if not voice:
                # Auto-assign a voice
                voice = await self._auto_assign_voice(
                    podcast_id, speaker_name, list(speaker_voices.values())
                )

            speaker_voices[speaker_name] = voice

        return speaker_voices

    async def _auto_assign_voice(
        self,
        podcast_id: uuid.UUID,
        speaker_name: str,
        already_assigned: list[Voice],
    ) -> Voice:
        """
        Automatically assign a voice to a speaker.
        Tries to pick a voice not already used.
        """
        voices = await self.voice_manager.list_voices()

        if not voices:
            raise ValueError("No voices available. Run voice sync first.")

        # Filter out already assigned voices
        assigned_ids = {v.id for v in already_assigned}
        available = [v for v in voices if v.id not in assigned_ids]

        if not available:
            # All voices used, just pick the first one
            voice = voices[0]
        else:
            voice = available[0]

        # Create the assignment
        await self.voice_manager.assign_voice_to_podcast(
            podcast_id=podcast_id,
            voice_id=voice.id,
            role="auto",
            speaker_name=speaker_name,
        )

        return voice

    async def _synthesize_segment(
        self,
        segment: ScriptSegment,
        speaker_voices: dict[str, Voice],
        speed: float,
    ) -> bytes:
        """Synthesize a single segment's audio."""
        voice = speaker_voices.get(segment.speaker_name)

        if not voice:
            raise ValueError(f"No voice found for speaker: {segment.speaker_name}")

        audio_data = await self.tts.synthesize(
            text=segment.content,
            voice_id=voice.neuphonic_voice_id,
            speed=speed,
        )

        return audio_data

    async def _create_manifest(
        self,
        episode_id: uuid.UUID,
        segments: list[dict],
        total_duration_ms: int,
    ) -> EpisodeManifest:
        """Create or update the episode manifest."""
        # Check for existing manifest
        result = await self.session.execute(
            select(EpisodeManifest).where(EpisodeManifest.episode_id == episode_id)
        )
        manifest = result.scalar_one_or_none()

        manifest_data = {
            "segments": segments,
            "total_duration_ms": total_duration_ms,
            "generated_at": datetime.utcnow().isoformat(),
        }

        if manifest:
            manifest.manifest = manifest_data
            manifest.total_duration_ms = total_duration_ms
            manifest.segment_count = len(segments)
        else:
            manifest = EpisodeManifest(
                episode_id=episode_id,
                manifest=manifest_data,
                total_duration_ms=total_duration_ms,
                segment_count=len(segments),
            )
            self.session.add(manifest)

        return manifest

    async def synthesize_single_segment(
        self,
        text: str,
        voice_id: uuid.UUID,
        speed: float = 1.0,
    ) -> bytes:
        """
        Synthesize a single piece of text with a specific voice.
        Useful for Q&A answers and bridges.
        """
        voice = await self.voice_manager.get_voice(voice_id)
        if not voice:
            raise ValueError(f"Voice {voice_id} not found")

        return await self.tts.synthesize(
            text=text,
            voice_id=voice.neuphonic_voice_id,
            speed=speed,
        )

    async def get_episode_manifest(
        self, episode_id: uuid.UUID
    ) -> EpisodeManifest | None:
        """Get the manifest for an episode."""
        result = await self.session.execute(
            select(EpisodeManifest).where(EpisodeManifest.episode_id == episode_id)
        )
        return result.scalar_one_or_none()
