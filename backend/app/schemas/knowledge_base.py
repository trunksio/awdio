import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class KnowledgeBaseCreate(BaseModel):
    name: str
    description: str | None = None


class KnowledgeBaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    podcast_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    document_count: int = 0


class DocumentCreate(BaseModel):
    filename: str


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    filename: str
    file_path: str
    file_type: str | None
    processed: bool
    created_at: datetime
    chunk_count: int = 0


class ChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    chunk_index: int | None
    similarity: float | None = None
