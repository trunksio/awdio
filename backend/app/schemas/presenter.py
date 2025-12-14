import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# Presenter schemas
class PresenterCreate(BaseModel):
    name: str
    bio: str | None = None
    traits: list[str] = []
    voice_id: uuid.UUID | None = None


class PresenterUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    traits: list[str] | None = None
    voice_id: uuid.UUID | None = None


class PresenterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    bio: str | None
    traits: list[str]
    voice_id: uuid.UUID | None
    presenter_metadata: dict
    created_at: datetime
    updated_at: datetime


# PresenterKnowledgeBase schemas
class PresenterKnowledgeBaseCreate(BaseModel):
    name: str
    description: str | None = None


class PresenterKnowledgeBaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    presenter_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime


# PresenterDocument schemas
class PresenterDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    filename: str
    file_path: str
    file_type: str | None
    processed: bool
    created_at: datetime


# PresenterKBImage schemas
class PresenterKBImageResponse(BaseModel):
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


# PodcastPresenter schemas
class PodcastPresenterCreate(BaseModel):
    presenter_id: uuid.UUID
    role: str = "host"
    display_name: str | None = None


class PodcastPresenterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    podcast_id: uuid.UUID
    presenter_id: uuid.UUID
    role: str
    display_name: str | None
    created_at: datetime


class PodcastPresenterWithDetails(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    podcast_id: uuid.UUID
    presenter_id: uuid.UUID
    role: str
    display_name: str | None
    created_at: datetime
    presenter: PresenterResponse


# Listener schemas
class ListenerCreate(BaseModel):
    name: str


class ListenerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    listener_metadata: dict
    first_seen_at: datetime
    last_seen_at: datetime
