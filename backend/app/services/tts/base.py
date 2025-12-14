"""Abstract base class for TTS providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator


@dataclass
class VoiceInfo:
    """Voice information from a TTS provider."""

    provider_voice_id: str
    name: str
    provider: str
    is_cloned: bool = False
    labels: dict | None = None
    description: str | None = None


class TTSProvider(ABC):
    """Abstract base class for text-to-speech providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier (e.g., 'neuphonic', 'elevenlabs')."""
        pass

    @abstractmethod
    async def list_voices(self) -> list[VoiceInfo]:
        """List available voices from the provider."""
        pass

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        **kwargs,
    ) -> bytes:
        """
        Synthesize text to audio bytes (WAV format).

        Args:
            text: The text to synthesize
            voice_id: The provider-specific voice ID
            speed: Playback speed (0.5-2.0)
            **kwargs: Provider-specific options

        Returns:
            WAV audio bytes
        """
        pass

    @abstractmethod
    async def synthesize_streaming(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        **kwargs,
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream synthesized audio chunks.

        Args:
            text: The text to synthesize
            voice_id: The provider-specific voice ID
            speed: Playback speed (0.5-2.0)
            **kwargs: Provider-specific options

        Yields:
            Audio chunks (format depends on provider)
        """
        pass

    def normalize_text(self, text: str) -> str:
        """
        Normalize text for TTS - replace problematic characters.

        Override in subclasses for provider-specific normalization.
        """
        # Common replacements for fancy unicode characters
        replacements = {
            "\u2018": "'",  # Left single quotation mark
            "\u2019": "'",  # Right single quotation mark
            "\u201c": '"',  # Left double quotation mark
            "\u201d": '"',  # Right double quotation mark
            "\u2013": "-",  # En dash
            "\u2014": "-",  # Em dash
            "\u2026": "...",  # Ellipsis
        }
        for old, new in replacements.items():
            text = text.replace(old, new)
        return text
