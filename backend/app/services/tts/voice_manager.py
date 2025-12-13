import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voice import PodcastVoice, Voice
from app.services.tts.neuphonic_service import NeuphonicsService


class VoiceManager:
    """Manages voices for podcasts."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.tts = NeuphonicsService()

    async def sync_neuphonic_voices(self) -> list[Voice]:
        """
        Sync available Neuphonic voices to the local database.
        Returns list of synced voices.
        """
        neuphonic_voices = await self.tts.list_voices()
        synced = []

        for nv in neuphonic_voices:
            # Check if voice already exists
            result = await self.session.execute(
                select(Voice).where(Voice.neuphonic_voice_id == nv["id"])
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Update existing
                existing.name = nv["name"]
                existing.voice_metadata = {"tags": nv.get("tags", [])}
                synced.append(existing)
            else:
                # Create new
                voice = Voice(
                    name=nv["name"],
                    neuphonic_voice_id=nv["id"],
                    is_cloned=nv.get("is_cloned", False),
                    voice_metadata={"tags": nv.get("tags", [])},
                )
                self.session.add(voice)
                synced.append(voice)

        await self.session.flush()
        return synced

    async def list_voices(self) -> list[Voice]:
        """List all voices in the database."""
        result = await self.session.execute(
            select(Voice).order_by(Voice.name)
        )
        return list(result.scalars().all())

    async def get_voice(self, voice_id: uuid.UUID) -> Voice | None:
        """Get a voice by ID."""
        result = await self.session.execute(
            select(Voice).where(Voice.id == voice_id)
        )
        return result.scalar_one_or_none()

    async def get_voice_by_neuphonic_id(self, neuphonic_id: str) -> Voice | None:
        """Get a voice by Neuphonic ID."""
        result = await self.session.execute(
            select(Voice).where(Voice.neuphonic_voice_id == neuphonic_id)
        )
        return result.scalar_one_or_none()

    async def assign_voice_to_podcast(
        self,
        podcast_id: uuid.UUID,
        voice_id: uuid.UUID,
        role: str,
        speaker_name: str,
    ) -> PodcastVoice:
        """Assign a voice to a podcast with a specific role."""
        # Check if assignment already exists
        result = await self.session.execute(
            select(PodcastVoice).where(
                PodcastVoice.podcast_id == podcast_id,
                PodcastVoice.role == role,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.voice_id = voice_id
            existing.speaker_name = speaker_name
            return existing

        assignment = PodcastVoice(
            podcast_id=podcast_id,
            voice_id=voice_id,
            role=role,
            speaker_name=speaker_name,
        )
        self.session.add(assignment)
        await self.session.flush()
        return assignment

    async def get_podcast_voices(
        self, podcast_id: uuid.UUID
    ) -> list[PodcastVoice]:
        """Get all voice assignments for a podcast."""
        result = await self.session.execute(
            select(PodcastVoice).where(PodcastVoice.podcast_id == podcast_id)
        )
        return list(result.scalars().all())

    async def get_voice_for_speaker(
        self,
        podcast_id: uuid.UUID,
        speaker_name: str,
    ) -> Voice | None:
        """Get the assigned voice for a speaker in a podcast."""
        result = await self.session.execute(
            select(PodcastVoice).where(
                PodcastVoice.podcast_id == podcast_id,
                PodcastVoice.speaker_name == speaker_name,
            )
        )
        assignment = result.scalar_one_or_none()

        if assignment:
            return await self.get_voice(assignment.voice_id)
        return None
