import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# Awdio schemas
class AwdioCreate(BaseModel):
    title: str
    description: str | None = None
    presenter_id: uuid.UUID | None = None


class AwdioUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    presenter_id: uuid.UUID | None = None
    status: str | None = None


class AwdioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    status: str
    presenter_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# SlideDeck schemas
class SlideDeckCreate(BaseModel):
    name: str
    description: str | None = None


class SlideDeckResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    awdio_id: uuid.UUID
    name: str
    description: str | None
    version: int
    created_at: datetime
    updated_at: datetime
    slide_count: int = 0


# Slide schemas
class SlideUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    speaker_notes: str | None = None


class SlideResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slide_deck_id: uuid.UUID
    slide_index: int
    image_path: str
    thumbnail_path: str | None
    speaker_notes: str | None
    title: str | None
    description: str | None
    keywords: list[str]
    transcript_summary: str | None
    slide_metadata: dict
    created_at: datetime


class SlideBulkNotesUpdate(BaseModel):
    """Update speaker notes for multiple slides at once."""
    notes: list[dict]  # List of {slide_index: int, speaker_notes: str}


class SlideReorderRequest(BaseModel):
    slide_ids: list[uuid.UUID]


# Session schemas
class SessionCreate(BaseModel):
    title: str
    description: str | None = None
    slide_deck_id: uuid.UUID | None = None


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    awdio_id: uuid.UUID
    slide_deck_id: uuid.UUID | None
    title: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# NarrationScript schemas
class NarrationScriptGenerateRequest(BaseModel):
    presenter_name: str = "Presenter"
    tone: str = "professional and engaging"
    additional_instructions: str = ""


class NarrationSegmentUpdate(BaseModel):
    content: str


class NarrationSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    script_id: uuid.UUID
    slide_id: uuid.UUID
    segment_index: int
    content: str
    speaker_name: str
    duration_estimate_ms: int | None
    audio_path: str | None
    audio_duration_ms: int | None
    slide_start_offset_ms: int


class NarrationScriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    status: str
    generation_prompt: str | None
    raw_content: str | None
    script_metadata: dict
    synthesis_started_at: datetime | None
    synthesis_completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    segments: list[NarrationSegmentResponse] = []


# Session manifest schemas
class SessionManifestSegment(BaseModel):
    index: int
    slide_id: str
    slide_index: int
    slide_path: str
    thumbnail_path: str | None
    audio_path: str
    duration_ms: int
    text: str


class SessionManifestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    total_duration_ms: int | None
    segment_count: int | None
    manifest: dict
    created_at: datetime


class SynthesizeRequest(BaseModel):
    speed: float = 1.0


# Knowledge base schemas (for awdio-specific KB)
class AwdioKnowledgeBaseCreate(BaseModel):
    name: str
    description: str | None = None


class AwdioKnowledgeBaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    awdio_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    document_count: int = 0


class AwdioDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    filename: str
    file_path: str
    file_type: str | None
    processed: bool
    created_at: datetime
    chunk_count: int = 0


class AwdioKBImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    filename: str
    image_path: str
    thumbnail_path: str | None
    title: str | None
    description: str | None
    associated_text: str
    image_metadata: dict
    created_at: datetime
