"""ElevenLabs TTS provider implementation."""

import asyncio
import io
import wave
from typing import AsyncGenerator

from elevenlabs import ElevenLabs, VoiceSettings

from app.config import settings
from app.services.tts.base import TTSProvider, VoiceInfo


class ElevenLabsService(TTSProvider):
    """ElevenLabs TTS API wrapper for audio synthesis.

    Supports ElevenLabs v3 features including:
    - Voice clones (Instant Voice Clones recommended for v3)
    - Audio tags for emotional control: [whispers], [excited], [sad], etc.
    - Stability settings for natural speech variation
    """

    def __init__(self):
        self.client = ElevenLabs(api_key=settings.elevenlabs_api_key)
        self._sample_rate = 22050  # Match Neuphonic for consistency

    @property
    def provider_name(self) -> str:
        return "elevenlabs"

    async def list_voices(self) -> list[VoiceInfo]:
        """Get available voices from ElevenLabs, including cloned voices."""
        try:
            # Run in executor since SDK is synchronous
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, self.client.voices.get_all
            )

            voices = []
            for voice in response.voices:
                # Determine if voice is cloned
                is_cloned = voice.category in ["cloned", "professional"]

                # Build labels from voice attributes
                labels = {}
                if voice.labels:
                    labels = dict(voice.labels)

                voices.append(
                    VoiceInfo(
                        provider_voice_id=voice.voice_id,
                        name=voice.name,
                        provider=self.provider_name,
                        is_cloned=is_cloned,
                        labels=labels,
                        description=voice.description,
                    )
                )
            return voices
        except Exception as e:
            raise RuntimeError(f"Failed to list ElevenLabs voices: {e}")

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        style: float = 0.0,
        use_speaker_boost: bool = True,
        output_format: str = "wav",
        **kwargs,
    ) -> bytes:
        """
        Synthesize text to audio using ElevenLabs.

        Args:
            text: The text to synthesize. Supports audio tags like:
                  [whispers]text[/whispers], [excited]text[/excited], etc.
            voice_id: The ElevenLabs voice ID
            speed: Speech speed multiplier (not directly supported, use SSML)
            stability: Voice consistency (0-1). Lower = more expressive variation
            similarity_boost: Voice clarity (0-1). Higher = clearer but less natural
            style: Style exaggeration (0-1). Higher = more dramatic
            use_speaker_boost: Boost voice clarity for lower quality source audio
            output_format: "wav" or "mp3"

        Returns:
            Audio bytes in requested format
        """
        # Normalize text
        text = self.normalize_text(text)

        print(f"[ElevenLabs TTS] Synthesizing text ({len(text)} chars) with voice_id: {voice_id}, format: {output_format}")
        print(f"[ElevenLabs TTS] Text preview: {text[:100]}...")

        try:
            # Configure voice settings
            voice_settings = VoiceSettings(
                stability=stability,
                similarity_boost=similarity_boost,
                style=style,
                use_speaker_boost=use_speaker_boost,
            )

            # Determine ElevenLabs format string
            el_format = "pcm_22050"
            if output_format == "mp3":
                el_format = "mp3_44100_128"

            # Run synthesis in executor since SDK is synchronous
            loop = asyncio.get_event_loop()

            def do_synthesis():
                audio_generator = self.client.text_to_speech.convert(
                    voice_id=voice_id,
                    text=text,
                    model_id="eleven_multilingual_v2",  # Best for natural speech
                    voice_settings=voice_settings,
                    output_format=el_format,
                )
                # Collect all chunks
                return b"".join(audio_generator)

            audio_data = await loop.run_in_executor(None, do_synthesis)

            if not audio_data:
                raise ValueError("No audio data received from ElevenLabs")

            # If WAV requested (and we got PCM), wrap it
            if output_format == "wav" and el_format == "pcm_22050":
                return self._pcm_to_wav(audio_data, self._sample_rate)
            
            # Otherwise return raw bytes (MP3 or whatever was requested)
            return audio_data

        except Exception as e:
            raise RuntimeError(f"Failed to synthesize audio with ElevenLabs: {e}")

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
        stability: float = 0.5,
        similarity_boost: float = 0.75,
        **kwargs,
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream synthesized audio chunks.

        Args:
            text: The text to synthesize (supports audio tags)
            voice_id: The ElevenLabs voice ID
            speed: Speech speed multiplier
            stability: Voice consistency (0-1)
            similarity_boost: Voice clarity (0-1)

        Yields:
            Audio chunks as PCM bytes (16-bit, 22050 Hz)
        """
        # Normalize text
        text = self.normalize_text(text)

        try:
            voice_settings = VoiceSettings(
                stability=stability,
                similarity_boost=similarity_boost,
            )

            # Run in executor since SDK is synchronous
            loop = asyncio.get_event_loop()

            def get_stream():
                return self.client.text_to_speech.convert_as_stream(
                    voice_id=voice_id,
                    text=text,
                    model_id="eleven_multilingual_v2",
                    voice_settings=voice_settings,
                    output_format="pcm_22050",
                )

            stream = await loop.run_in_executor(None, get_stream)

            # Yield chunks with async breaks
            for chunk in stream:
                if chunk:
                    yield chunk
                    await asyncio.sleep(0)  # Yield control

        except Exception as e:
            raise RuntimeError(f"Failed to stream audio from ElevenLabs: {e}")

    async def get_voice_info(self, voice_id: str) -> VoiceInfo | None:
        """Get information about a specific voice."""
        try:
            loop = asyncio.get_event_loop()
            voice = await loop.run_in_executor(
                None, lambda: self.client.voices.get(voice_id)
            )

            is_cloned = voice.category in ["cloned", "professional"]
            labels = dict(voice.labels) if voice.labels else {}

            return VoiceInfo(
                provider_voice_id=voice.voice_id,
                name=voice.name,
                provider=self.provider_name,
                is_cloned=is_cloned,
                labels=labels,
                description=voice.description,
            )
        except Exception:
            return None

    async def clone_voice(
        self,
        name: str,
        audio_files: list[bytes],
        description: str | None = None,
    ) -> VoiceInfo:
        """
        Create an instant voice clone from audio samples.

        Args:
            name: Name for the cloned voice
            audio_files: List of audio file bytes (WAV/MP3 samples)
            description: Optional description of the voice

        Returns:
            VoiceInfo for the newly created voice
        """
        try:
            loop = asyncio.get_event_loop()

            def do_clone():
                # Create file-like objects for the API
                files = []
                for i, audio_data in enumerate(audio_files):
                    file_obj = io.BytesIO(audio_data)
                    file_obj.name = f"sample_{i}.wav"
                    files.append(file_obj)

                return self.client.clone.create(
                    name=name,
                    description=description or f"Cloned voice: {name}",
                    files=files,
                )

            voice = await loop.run_in_executor(None, do_clone)

            return VoiceInfo(
                provider_voice_id=voice.voice_id,
                name=voice.name,
                provider=self.provider_name,
                is_cloned=True,
                labels={},
                description=description,
            )
        except Exception as e:
            raise RuntimeError(f"Failed to clone voice: {e}")
