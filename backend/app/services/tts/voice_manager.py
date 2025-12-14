import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voice import PodcastVoice, Voice
from app.services.tts.factory import TTSFactory


class VoiceManager:
    """Manages voices for podcasts with multi-provider support."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def sync_voices(self, provider: str = "neuphonic") -> list[Voice]:
        """
        Sync available voices from a TTS provider to the local database.

        Args:
            provider: TTS provider name ("neuphonic" or "elevenlabs")

        Returns:
            List of synced Voice records
        """
        tts = TTSFactory.get_provider(provider)
        provider_voices = await tts.list_voices()
        synced = []

        for pv in provider_voices:
            # Check if voice already exists by provider + provider_voice_id
            result = await self.session.execute(
                select(Voice).where(
                    and_(
                        Voice.tts_provider == provider,
                        Voice.provider_voice_id == pv.provider_voice_id,
                    )
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Update existing voice
                existing.name = pv.name
                existing.is_cloned = pv.is_cloned
                existing.voice_metadata = pv.labels or {}
                synced.append(existing)
            else:
                # Create new voice
                voice = Voice(
                    name=pv.name,
                    tts_provider=provider,
                    provider_voice_id=pv.provider_voice_id,
                    # Also set legacy field for neuphonic backward compatibility
                    neuphonic_voice_id=pv.provider_voice_id if provider == "neuphonic" else None,
                    is_cloned=pv.is_cloned,
                    voice_metadata=pv.labels or {},
                )
                self.session.add(voice)
                synced.append(voice)

        await self.session.flush()
        return synced

    async def sync_neuphonic_voices(self) -> list[Voice]:
        """
        Sync available Neuphonic voices to the local database.
        Returns list of synced voices.

        Deprecated: Use sync_voices("neuphonic") instead.
        """
        return await self.sync_voices("neuphonic")

    async def sync_elevenlabs_voices(self) -> list[Voice]:
        """
        Sync available ElevenLabs voices to the local database.
        Returns list of synced voices.
        """
        return await self.sync_voices("elevenlabs")

    async def list_voices(self, provider: str | None = None) -> list[Voice]:
        """
        List voices in the database.

        Args:
            provider: Optional provider filter ("neuphonic" or "elevenlabs")
        """
        query = select(Voice).order_by(Voice.tts_provider, Voice.name)
        if provider:
            query = query.where(Voice.tts_provider == provider)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_voice(self, voice_id: uuid.UUID) -> Voice | None:
        """Get a voice by ID."""
        result = await self.session.execute(
            select(Voice).where(Voice.id == voice_id)
        )
        return result.scalar_one_or_none()

    async def get_voice_by_provider_id(
        self, provider: str, provider_voice_id: str
    ) -> Voice | None:
        """Get a voice by provider and provider voice ID."""
        result = await self.session.execute(
            select(Voice).where(
                and_(
                    Voice.tts_provider == provider,
                    Voice.provider_voice_id == provider_voice_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_voice_by_neuphonic_id(self, neuphonic_id: str) -> Voice | None:
        """
        Get a voice by Neuphonic ID.

        Deprecated: Use get_voice_by_provider_id("neuphonic", voice_id) instead.
        """
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
