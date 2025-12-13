import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PodcastCreate(BaseModel):
    title: str
    description: str | None = None


class PodcastResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class EpisodeCreate(BaseModel):
    title: str
    description: str | None = None


class EpisodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    podcast_id: uuid.UUID
    title: str
    description: str | None
    status: str
    created_at: datetime


class SpeakerConfig(BaseModel):
    name: str
    role: str = "speaker"
    description: str = ""


class ScriptGenerateRequest(BaseModel):
    speakers: list[SpeakerConfig]
    target_duration_minutes: int = 10
    tone: str = "conversational and engaging"
    additional_instructions: str = ""


class ScriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    segment_index: int
    speaker_name: str
    content: str
    duration_estimate_ms: int | None
    audio_path: str | None
    audio_duration_ms: int | None


class ScriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    episode_id: uuid.UUID
    title: str | None
    status: str
    generation_prompt: str | None
    raw_content: str | None
    created_at: datetime
    updated_at: datetime
    segments: list[ScriptSegmentResponse] = []


class SynthesizeRequest(BaseModel):
    speed: float = 1.0


class ManifestSegmentResponse(BaseModel):
    index: int
    speaker: str
    audio_path: str
    duration_ms: int
    text: str


class ManifestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    episode_id: uuid.UUID
    total_duration_ms: int | None
    segment_count: int | None
    manifest: dict
    created_at: datetime
