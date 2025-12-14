"""Neuphonic TTS provider implementation."""

import asyncio
import io
import wave
from typing import AsyncGenerator

from pyneuphonic import Neuphonic, TTSConfig

from app.config import settings
from app.services.tts.base import TTSProvider, VoiceInfo


class NeuphonicsService(TTSProvider):
    """Neuphonic TTS API wrapper for audio synthesis."""

    def __init__(self):
        self.client = Neuphonic(api_key=settings.neuphonic_api_key)
        self._sample_rate = 22050

    @property
    def provider_name(self) -> str:
        return "neuphonic"

    async def list_voices(self) -> list[VoiceInfo]:
        """Get available voices from Neuphonic."""
        try:
            response = self.client.voices.list()

            # Handle different response structures
            if hasattr(response, "data"):
                data = response.data
                if hasattr(data, "voices"):
                    voice_list = data.voices
                elif isinstance(data, dict) and "voices" in data:
                    voice_list = data["voices"]
                elif isinstance(data, list):
                    voice_list = data
                else:
                    voice_list = []
            elif isinstance(response, dict) and "voices" in response:
                voice_list = response["voices"]
            elif isinstance(response, list):
                voice_list = response
            else:
                voice_list = []

            voices = []
            for voice in voice_list:
                # Handle both object and dict formats
                if isinstance(voice, dict):
                    voices.append(
                        VoiceInfo(
                            provider_voice_id=voice.get("id", ""),
                            name=voice.get("name", ""),
                            provider=self.provider_name,
                            is_cloned=voice.get("is_cloned", False),
                            labels={"tags": voice.get("tags", [])},
                        )
                    )
                else:
                    voices.append(
                        VoiceInfo(
                            provider_voice_id=getattr(voice, "id", ""),
                            name=getattr(voice, "name", ""),
                            provider=self.provider_name,
                            is_cloned=getattr(voice, "is_cloned", False),
                            labels={"tags": getattr(voice, "tags", [])},
                        )
                    )
            return voices
        except Exception as e:
            raise RuntimeError(f"Failed to list voices: {e}")

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        **kwargs,
    ) -> bytes:
        """
        Synthesize text to audio using Neuphonic.

        Args:
            text: The text to synthesize
            voice_id: The Neuphonic voice ID
            speed: Speech speed multiplier (0.5-2.0)

        Returns:
            Audio bytes in WAV format
        """
        # Normalize text to avoid API issues with fancy unicode characters
        text = self.normalize_text(text)

        print(f"[Neuphonic TTS] Synthesizing text ({len(text)} chars) with voice_id: {voice_id}")
        print(f"[Neuphonic TTS] Text preview: {text[:100]}...")
        try:
            # Use the SSE client for synchronous synthesis
            sse = self.client.tts.SSEClient()

            # Collect audio chunks
            audio_chunks = []

            config = TTSConfig(
                voice=voice_id,
                speed=speed,
                sampling_rate=self._sample_rate,
            )

            response = sse.send(text, tts_config=config)

            for item in response:
                if item.data.audio:
                    audio_chunks.append(item.data.audio)

            if not audio_chunks:
                raise ValueError("No audio data received from Neuphonic")

            # Combine chunks into single PCM audio
            pcm_audio = b"".join(audio_chunks)

            # Wrap PCM data with WAV headers
            wav_audio = self._pcm_to_wav(pcm_audio, self._sample_rate)
            return wav_audio

        except Exception as e:
            raise RuntimeError(f"Failed to synthesize audio: {e}")

    def _pcm_to_wav(
        self,
        pcm_data: bytes,
        sample_rate: int = 22050,
        num_channels: int = 1,
        sample_width: int = 2,  # 16-bit audio
    ) -> bytes:
        """Convert raw PCM data to WAV format with proper headers."""
        wav_buffer = io.BytesIO()

        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(num_channels)
            wav_file.setsampwidth(sample_width)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_data)

        wav_buffer.seek(0)
        return wav_buffer.read()

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
            voice_id: The Neuphonic voice ID
            speed: Speech speed multiplier

        Yields:
            Audio chunks as bytes
        """
        # Normalize text to avoid API issues with fancy unicode characters
        text = self.normalize_text(text)

        try:
            sse = self.client.tts.SSEClient()

            config = TTSConfig(
                voice=voice_id,
                speed=speed,
            )

            response = sse.send(text, tts_config=config)

            for item in response:
                if item.data.audio:
                    yield item.data.audio
                    await asyncio.sleep(0)  # Yield control

        except Exception as e:
            raise RuntimeError(f"Failed to stream audio: {e}")

    async def get_voice_info(self, voice_id: str) -> VoiceInfo | None:
        """Get information about a specific voice."""
        voices = await self.list_voices()
        for voice in voices:
            if voice.provider_voice_id == voice_id:
                return voice
        return None
