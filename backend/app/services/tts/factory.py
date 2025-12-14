"""TTS Provider Factory for multi-provider support."""

from typing import ClassVar

from app.services.tts.base import TTSProvider


class TTSFactory:
    """Factory for creating and caching TTS provider instances.

    Usage:
        # Get a provider by name
        tts = TTSFactory.get_provider("elevenlabs")
        audio = await tts.synthesize("Hello world", voice_id)

        # Get provider for a specific voice (from database)
        tts = TTSFactory.get_provider(voice.tts_provider)
    """

    _providers: ClassVar[dict[str, TTSProvider]] = {}

    @classmethod
    def get_provider(cls, provider_name: str) -> TTSProvider:
        """
        Get a TTS provider instance by name.

        Args:
            provider_name: Provider identifier ("neuphonic" or "elevenlabs")

        Returns:
            TTSProvider instance (cached)

        Raises:
            ValueError: If provider_name is not recognized
        """
        if provider_name not in cls._providers:
            cls._providers[provider_name] = cls._create_provider(provider_name)
        return cls._providers[provider_name]

    @classmethod
    def _create_provider(cls, provider_name: str) -> TTSProvider:
        """Create a new provider instance."""
        if provider_name == "neuphonic":
            from app.services.tts.neuphonic_service import NeuphonicsService

            return NeuphonicsService()
        elif provider_name == "elevenlabs":
            from app.services.tts.elevenlabs_service import ElevenLabsService

            return ElevenLabsService()
        else:
            raise ValueError(
                f"Unknown TTS provider: {provider_name}. "
                f"Supported providers: neuphonic, elevenlabs"
            )

    @classmethod
    def clear_cache(cls) -> None:
        """Clear cached provider instances. Useful for testing."""
        cls._providers.clear()

    @classmethod
    def supported_providers(cls) -> list[str]:
        """Return list of supported provider names."""
        return ["neuphonic", "elevenlabs"]
