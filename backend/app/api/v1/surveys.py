"""Survey API endpoints."""

import csv
import hashlib
import io
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user, get_optional_user
from app.auth.models import User
from app.database import get_db
from app.models.survey import Survey, SurveyAnswer, SurveyQuestion, SurveySubmission

router = APIRouter(prefix="/surveys", tags=["surveys"])


# ============================================
# Helpers
# ============================================


def build_question_response(q: SurveyQuestion) -> "QuestionResponse":
    """Build a QuestionResponse from a SurveyQuestion model."""
    return QuestionResponse(
        id=str(q.id),
        survey_id=str(q.survey_id),
        question_text=q.question_text,
        description=q.description,
        question_type=q.question_type,
        options=q.options,
        min_value=q.min_value,
        max_value=q.max_value,
        min_label=q.min_label,
        max_label=q.max_label,
        is_required=q.is_required,
        order_index=q.order_index,
        audio_path=q.audio_path,
        audio_duration_ms=q.audio_duration_ms,
    )


def build_survey_response(
    survey: Survey,
    question_count: int = 0,
    submission_count: int = 0,
) -> "SurveyResponse":
    """Build a SurveyResponse from a Survey model."""
    return SurveyResponse(
        id=str(survey.id),
        owner_id=str(survey.owner_id),
        title=survey.title,
        description=survey.description,
        is_anonymous=survey.is_anonymous,
        collect_pii_at_end=survey.collect_pii_at_end,
        allow_voice_input=survey.allow_voice_input,
        presenter_id=str(survey.presenter_id) if survey.presenter_id else None,
        status=survey.status,
        synthesis_status=survey.synthesis_status,
        published_at=survey.published_at,
        closes_at=survey.closes_at,
        created_at=survey.created_at,
        updated_at=survey.updated_at,
        question_count=question_count,
        submission_count=submission_count,
    )


# ============================================
# Schemas
# ============================================


class QuestionOptionSchema(BaseModel):
    """Option for a choice question."""

    value: str
    label: str


class QuestionCreate(BaseModel):
    """Create a survey question."""

    question_text: str
    description: str | None = None
    question_type: str = Field(
        ...,
        pattern="^(single_choice|multiple_choice|rating|scale|open_text|true_false)$",
    )
    options: list[QuestionOptionSchema] | None = None
    min_value: int | None = None
    max_value: int | None = None
    min_label: str | None = None
    max_label: str | None = None
    is_required: bool = False
    order_index: int = 0


class QuestionUpdate(BaseModel):
    """Update a survey question."""

    question_text: str | None = None
    description: str | None = None
    question_type: str | None = None
    options: list[QuestionOptionSchema] | None = None
    min_value: int | None = None
    max_value: int | None = None
    min_label: str | None = None
    max_label: str | None = None
    is_required: bool | None = None
    order_index: int | None = None


class QuestionResponse(BaseModel):
    """Question response schema."""

    id: str
    survey_id: str
    question_text: str
    description: str | None
    question_type: str
    options: list[dict[str, Any]] | None
    min_value: int | None
    max_value: int | None
    min_label: str | None
    max_label: str | None
    is_required: bool
    order_index: int
    audio_path: str | None = None
    audio_duration_ms: int | None = None


class SurveyCreate(BaseModel):
    """Create a survey."""

    title: str
    description: str | None = None
    is_anonymous: bool = True
    collect_pii_at_end: bool = False
    allow_voice_input: bool = True
    presenter_id: str | None = None


class SurveyUpdate(BaseModel):
    """Update a survey."""

    title: str | None = None
    description: str | None = None
    is_anonymous: bool | None = None
    collect_pii_at_end: bool | None = None
    allow_voice_input: bool | None = None
    presenter_id: str | None = None
    status: str | None = None
    closes_at: datetime | None = None


class SurveyResponse(BaseModel):
    """Survey response schema."""

    id: str
    owner_id: str
    title: str
    description: str | None
    is_anonymous: bool
    collect_pii_at_end: bool
    allow_voice_input: bool
    presenter_id: str | None
    status: str
    synthesis_status: str | None = None
    published_at: datetime | None
    closes_at: datetime | None
    created_at: datetime
    updated_at: datetime
    question_count: int = 0
    submission_count: int = 0


class SurveyWithQuestions(SurveyResponse):
    """Survey with questions included."""

    questions: list[QuestionResponse]


class StartSubmissionRequest(BaseModel):
    """Request to start a survey submission."""

    listener_id: str | None = None
    source: str = Field(default="direct", pattern="^(direct|embed)$")


class SubmissionResponse(BaseModel):
    """Submission response schema."""

    id: str
    survey_id: str
    anonymous_id: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    source: str


class AnswerRequest(BaseModel):
    """Request to submit an answer."""

    question_id: str
    answer_value: dict[str, Any]
    voice_transcript: str | None = None


class PIIRequest(BaseModel):
    """Request to submit PII data."""

    name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    additional: dict[str, Any] | None = None


class ReorderQuestionsRequest(BaseModel):
    """Request to reorder questions."""

    question_ids: list[str]


# ============================================
# Survey CRUD (Admin)
# ============================================


@router.get("", response_model=list[SurveyResponse])
async def list_surveys(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SurveyResponse]:
    """List surveys owned by the current user."""
    result = await db.execute(
        select(Survey)
        .where(Survey.owner_id == user.id)
        .order_by(Survey.created_at.desc())
    )
    surveys = result.scalars().all()

    responses = []
    for survey in surveys:
        # Get counts
        q_count = await db.execute(
            select(func.count(SurveyQuestion.id)).where(
                SurveyQuestion.survey_id == survey.id
            )
        )
        s_count = await db.execute(
            select(func.count(SurveySubmission.id)).where(
                SurveySubmission.survey_id == survey.id
            )
        )

        responses.append(
            build_survey_response(survey, q_count.scalar() or 0, s_count.scalar() or 0)
        )

    return responses


@router.post("", response_model=SurveyResponse, status_code=status.HTTP_201_CREATED)
async def create_survey(
    body: SurveyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyResponse:
    """Create a new survey."""
    presenter_uuid = None
    if body.presenter_id:
        try:
            presenter_uuid = uuid.UUID(body.presenter_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid presenter ID",
            )

    survey = Survey(
        owner_id=user.id,
        title=body.title,
        description=body.description,
        is_anonymous=body.is_anonymous,
        collect_pii_at_end=body.collect_pii_at_end,
        allow_voice_input=body.allow_voice_input,
        presenter_id=presenter_uuid,
    )
    db.add(survey)
    await db.commit()
    await db.refresh(survey)

    return build_survey_response(survey, 0, 0)


@router.get("/{survey_id}", response_model=SurveyWithQuestions)
async def get_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyWithQuestions:
    """Get a survey with its questions."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    # Get submission count
    s_count = await db.execute(
        select(func.count(SurveySubmission.id)).where(
            SurveySubmission.survey_id == survey.id
        )
    )

    questions = [
        build_question_response(q)
        for q in sorted(survey.questions, key=lambda x: x.order_index)
    ]

    base = build_survey_response(survey, len(questions), s_count.scalar() or 0)
    return SurveyWithQuestions(**base.model_dump(), questions=questions)


@router.put("/{survey_id}", response_model=SurveyResponse)
async def update_survey(
    survey_id: str,
    body: SurveyUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyResponse:
    """Update a survey."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    update_data = body.model_dump(exclude_unset=True)

    if "presenter_id" in update_data and update_data["presenter_id"]:
        try:
            update_data["presenter_id"] = uuid.UUID(update_data["presenter_id"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid presenter ID",
            )

    for key, value in update_data.items():
        setattr(survey, key, value)

    survey.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(survey)

    # Get counts
    q_count = await db.execute(
        select(func.count(SurveyQuestion.id)).where(
            SurveyQuestion.survey_id == survey.id
        )
    )
    s_count = await db.execute(
        select(func.count(SurveySubmission.id)).where(
            SurveySubmission.survey_id == survey.id
        )
    )

    return build_survey_response(survey, q_count.scalar() or 0, s_count.scalar() or 0)


@router.delete("/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a survey."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    await db.delete(survey)
    await db.commit()


# ============================================
# Publishing
# ============================================


@router.post("/{survey_id}/publish", response_model=SurveyResponse)
async def publish_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyResponse:
    """Publish a survey, making it available for responses."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    if len(survey.questions) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish a survey with no questions",
        )

    survey.status = "published"
    survey.published_at = datetime.now(timezone.utc)
    survey.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(survey)

    # Get counts
    s_count = await db.execute(
        select(func.count(SurveySubmission.id)).where(
            SurveySubmission.survey_id == survey.id
        )
    )

    return build_survey_response(survey, len(survey.questions), s_count.scalar() or 0)


@router.post("/{survey_id}/close", response_model=SurveyResponse)
async def close_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SurveyResponse:
    """Close a survey, preventing new responses."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    survey.status = "closed"
    survey.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(survey)

    # Get counts
    q_count = await db.execute(
        select(func.count(SurveyQuestion.id)).where(
            SurveyQuestion.survey_id == survey.id
        )
    )
    s_count = await db.execute(
        select(func.count(SurveySubmission.id)).where(
            SurveySubmission.survey_id == survey.id
        )
    )

    return build_survey_response(survey, q_count.scalar() or 0, s_count.scalar() or 0)


# ============================================
# Audio Synthesis
# ============================================


class SynthesisResponse(BaseModel):
    """Response from synthesis operation."""

    survey_id: str
    synthesis_status: str
    questions_synthesized: int
    total_duration_ms: int


@router.post("/{survey_id}/synthesize", response_model=SynthesisResponse)
async def synthesize_survey(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SynthesisResponse:
    """Synthesize audio for all survey questions using the assigned presenter."""
    from app.models.voice import Voice
    from app.services.storage_service import StorageService
    from app.services.tts import TTSFactory

    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions), selectinload(Survey.presenter))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    if len(survey.questions) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot synthesize a survey with no questions",
        )

    if not survey.presenter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please assign a presenter to this survey before synthesizing",
        )

    # Get voice from presenter
    voice = None
    if survey.presenter.voice_id:
        voice_result = await db.execute(
            select(Voice).where(Voice.id == survey.presenter.voice_id)
        )
        voice = voice_result.scalar_one_or_none()

    if not voice:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Presenter '{survey.presenter.name}' has no voice assigned",
        )

    voice_id = voice.effective_voice_id
    if not voice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Voice '{voice.name}' has no provider voice ID configured",
        )

    # Update status
    survey.synthesis_status = "synthesizing"
    await db.flush()

    # Synthesize each question
    tts = TTSFactory.get_provider(voice.tts_provider)
    storage = StorageService()

    total_duration_ms = 0
    questions_synthesized = 0

    for question in sorted(survey.questions, key=lambda q: q.order_index):
        try:
            # Synthesize audio
            audio_content = await tts.synthesize(
                text=question.question_text,
                voice_id=voice_id,
                speed=1.0,
            )

            # Upload to storage
            audio_path = await storage.upload_survey_audio(
                audio_content,
                survey.id,
                question.id,
                format="wav",
            )

            # Calculate duration (WAV at 22050 Hz, 16-bit mono = 44100 bytes/sec)
            audio_duration_ms = int((len(audio_content) - 44) / 44100 * 1000)

            # Update question
            question.audio_path = audio_path
            question.audio_duration_ms = audio_duration_ms

            total_duration_ms += audio_duration_ms
            questions_synthesized += 1

        except Exception as e:
            survey.synthesis_status = "error"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Synthesis failed for question '{question.question_text[:50]}...': {str(e)}",
            )

    survey.synthesis_status = "synthesized"
    await db.commit()

    return SynthesisResponse(
        survey_id=str(survey.id),
        synthesis_status="synthesized",
        questions_synthesized=questions_synthesized,
        total_duration_ms=total_duration_ms,
    )


@router.post(
    "/{survey_id}/questions/{question_id}/synthesize",
    response_model=QuestionResponse,
)
async def synthesize_question(
    survey_id: str,
    question_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuestionResponse:
    """Synthesize audio for a single survey question."""
    from app.models.voice import Voice
    from app.services.storage_service import StorageService
    from app.services.tts import TTSFactory

    try:
        survey_uuid = uuid.UUID(survey_id)
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.presenter))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    if not survey.presenter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please assign a presenter to this survey before synthesizing",
        )

    result = await db.execute(
        select(SurveyQuestion).where(
            SurveyQuestion.id == question_uuid,
            SurveyQuestion.survey_id == survey_uuid,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Question not found"
        )

    # Get voice from presenter
    voice = None
    if survey.presenter.voice_id:
        voice_result = await db.execute(
            select(Voice).where(Voice.id == survey.presenter.voice_id)
        )
        voice = voice_result.scalar_one_or_none()

    if not voice:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Presenter '{survey.presenter.name}' has no voice assigned",
        )

    voice_id = voice.effective_voice_id
    if not voice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Voice '{voice.name}' has no provider voice ID configured",
        )

    # Synthesize audio
    tts = TTSFactory.get_provider(voice.tts_provider)
    storage = StorageService()

    try:
        audio_content = await tts.synthesize(
            text=question.question_text,
            voice_id=voice_id,
            speed=1.0,
        )

        audio_path = await storage.upload_survey_audio(
            audio_content,
            survey.id,
            question.id,
            format="wav",
        )

        audio_duration_ms = int((len(audio_content) - 44) / 44100 * 1000)

        question.audio_path = audio_path
        question.audio_duration_ms = audio_duration_ms

        await db.commit()
        await db.refresh(question)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {str(e)}",
        )

    return build_question_response(question)


# ============================================
# Questions
# ============================================


@router.post(
    "/{survey_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_question(
    survey_id: str,
    body: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuestionResponse:
    """Add a question to a survey."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    # Validate options for choice questions
    if body.question_type in ("single_choice", "multiple_choice"):
        if not body.options or len(body.options) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Choice questions must have at least 2 options",
            )

    # Validate scale/rating questions
    if body.question_type in ("rating", "scale"):
        if body.min_value is None or body.max_value is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rating/scale questions must have min_value and max_value",
            )

    options_data = None
    if body.options:
        options_data = [opt.model_dump() for opt in body.options]

    question = SurveyQuestion(
        survey_id=survey.id,
        question_text=body.question_text,
        description=body.description,
        question_type=body.question_type,
        options=options_data,
        min_value=body.min_value,
        max_value=body.max_value,
        min_label=body.min_label,
        max_label=body.max_label,
        is_required=body.is_required,
        order_index=body.order_index,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)

    return build_question_response(question)


@router.put("/{survey_id}/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    survey_id: str,
    question_id: str,
    body: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuestionResponse:
    """Update a question."""
    try:
        survey_uuid = uuid.UUID(survey_id)
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format"
        )

    # Verify ownership
    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    result = await db.execute(
        select(SurveyQuestion).where(
            SurveyQuestion.id == question_uuid,
            SurveyQuestion.survey_id == survey_uuid,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Question not found"
        )

    update_data = body.model_dump(exclude_unset=True)

    if "options" in update_data and update_data["options"]:
        update_data["options"] = [opt.model_dump() if hasattr(opt, 'model_dump') else opt for opt in update_data["options"]]

    for key, value in update_data.items():
        setattr(question, key, value)

    await db.commit()
    await db.refresh(question)

    return build_question_response(question)


@router.delete(
    "/{survey_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_question(
    survey_id: str,
    question_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a question from a survey."""
    try:
        survey_uuid = uuid.UUID(survey_id)
        question_uuid = uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format"
        )

    # Verify ownership
    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    result = await db.execute(
        select(SurveyQuestion).where(
            SurveyQuestion.id == question_uuid,
            SurveyQuestion.survey_id == survey_uuid,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Question not found"
        )

    await db.delete(question)
    await db.commit()


@router.post("/{survey_id}/questions/reorder", response_model=list[QuestionResponse])
async def reorder_questions(
    survey_id: str,
    body: ReorderQuestionsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[QuestionResponse]:
    """Reorder questions in a survey."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    # Verify ownership
    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    # Update order indices
    for index, qid in enumerate(body.question_ids):
        try:
            question_uuid = uuid.UUID(qid)
        except ValueError:
            continue

        for question in survey.questions:
            if question.id == question_uuid:
                question.order_index = index
                break

    await db.commit()

    # Return updated questions
    result = await db.execute(
        select(SurveyQuestion)
        .where(SurveyQuestion.survey_id == survey_uuid)
        .order_by(SurveyQuestion.order_index)
    )
    questions = result.scalars().all()

    return [build_question_response(q) for q in questions]


# ============================================
# Public Survey Taking
# ============================================


@router.get("/take/{survey_id}", response_model=SurveyWithQuestions)
async def get_survey_for_taking(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
) -> SurveyWithQuestions:
    """Get a published survey for taking (public endpoint)."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_uuid, Survey.status == "published")
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found or not published",
        )

    # Check if closed by date
    if survey.closes_at and survey.closes_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This survey has closed",
        )

    questions = [
        build_question_response(q)
        for q in sorted(survey.questions, key=lambda x: x.order_index)
    ]

    base = build_survey_response(survey, len(questions), 0)  # Don't expose submission count to public
    return SurveyWithQuestions(**base.model_dump(), questions=questions)


@router.post("/take/{survey_id}/start", response_model=SubmissionResponse)
async def start_submission(
    survey_id: str,
    request: Request,
    body: StartSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> SubmissionResponse:
    """Start a new survey submission (public endpoint)."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey).where(Survey.id == survey_uuid, Survey.status == "published")
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found or not published",
        )

    # Check if closed
    if survey.closes_at and survey.closes_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This survey has closed",
        )

    # Generate anonymous ID
    anonymous_id = str(uuid.uuid4())[:16]

    # Hash IP for privacy
    client_ip = request.client.host if request.client else None
    ip_hash = None
    if client_ip:
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    listener_uuid = None
    if body.listener_id:
        try:
            listener_uuid = uuid.UUID(body.listener_id)
        except ValueError:
            pass

    submission = SurveySubmission(
        survey_id=survey.id,
        anonymous_id=anonymous_id,
        user_id=user.id if user and not survey.is_anonymous else None,
        listener_id=listener_uuid,
        source=body.source,
        user_agent=request.headers.get("user-agent"),
        ip_hash=ip_hash,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    return SubmissionResponse(
        id=str(submission.id),
        survey_id=str(submission.survey_id),
        anonymous_id=submission.anonymous_id,
        status=submission.status,
        started_at=submission.started_at,
        completed_at=submission.completed_at,
        source=submission.source,
    )


@router.post("/take/{survey_id}/submissions/{submission_id}/answer")
async def submit_answer(
    survey_id: str,
    submission_id: str,
    body: AnswerRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Submit an answer to a question (public endpoint)."""
    try:
        survey_uuid = uuid.UUID(survey_id)
        submission_uuid = uuid.UUID(submission_id)
        question_uuid = uuid.UUID(body.question_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format"
        )

    # Verify submission
    result = await db.execute(
        select(SurveySubmission).where(
            SurveySubmission.id == submission_uuid,
            SurveySubmission.survey_id == survey_uuid,
            SurveySubmission.status == "in_progress",
        )
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found or already completed",
        )

    # Verify question belongs to survey
    result = await db.execute(
        select(SurveyQuestion).where(
            SurveyQuestion.id == question_uuid,
            SurveyQuestion.survey_id == survey_uuid,
        )
    )
    question = result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Question not found"
        )

    # Check if answer already exists
    result = await db.execute(
        select(SurveyAnswer).where(
            SurveyAnswer.submission_id == submission_uuid,
            SurveyAnswer.question_id == question_uuid,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing answer
        existing.answer_value = body.answer_value
        existing.voice_transcript = body.voice_transcript
        existing.answered_at = datetime.now(timezone.utc)
    else:
        # Create new answer
        answer = SurveyAnswer(
            submission_id=submission.id,
            question_id=question.id,
            answer_value=body.answer_value,
            voice_transcript=body.voice_transcript,
        )
        db.add(answer)

    await db.commit()

    return {"status": "saved"}


@router.post("/take/{survey_id}/submissions/{submission_id}/complete")
async def complete_submission(
    survey_id: str,
    submission_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Complete a survey submission (public endpoint)."""
    try:
        survey_uuid = uuid.UUID(survey_id)
        submission_uuid = uuid.UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format"
        )

    # Get submission with survey
    result = await db.execute(
        select(SurveySubmission)
        .options(selectinload(SurveySubmission.answers))
        .where(
            SurveySubmission.id == submission_uuid,
            SurveySubmission.survey_id == survey_uuid,
            SurveySubmission.status == "in_progress",
        )
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found or already completed",
        )

    # Get required questions
    result = await db.execute(
        select(SurveyQuestion).where(
            SurveyQuestion.survey_id == survey_uuid,
            SurveyQuestion.is_required == True,
        )
    )
    required_questions = result.scalars().all()

    # Check all required questions are answered
    answered_ids = {a.question_id for a in submission.answers}
    missing = [q for q in required_questions if q.id not in answered_ids]

    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required answers for {len(missing)} question(s)",
        )

    submission.status = "completed"
    submission.completed_at = datetime.now(timezone.utc)
    await db.commit()

    # Get survey to check if PII collection is enabled
    result = await db.execute(select(Survey).where(Survey.id == survey_uuid))
    survey = result.scalar_one()

    return {
        "status": "completed",
        "collect_pii": survey.collect_pii_at_end,
        "submission_id": str(submission.id),
    }


@router.post("/take/{survey_id}/submissions/{submission_id}/pii")
async def submit_pii(
    survey_id: str,
    submission_id: str,
    body: PIIRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Submit optional PII data after completion (public endpoint)."""
    try:
        survey_uuid = uuid.UUID(survey_id)
        submission_uuid = uuid.UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format"
        )

    result = await db.execute(
        select(SurveySubmission).where(
            SurveySubmission.id == submission_uuid,
            SurveySubmission.survey_id == survey_uuid,
            SurveySubmission.status == "completed",
        )
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found or not completed",
        )

    # Store PII data
    pii_data = {}
    if body.name:
        pii_data["name"] = body.name
    if body.email:
        pii_data["email"] = body.email
    if body.phone:
        pii_data["phone"] = body.phone
    if body.company:
        pii_data["company"] = body.company
    if body.additional:
        pii_data["additional"] = body.additional

    submission.pii_data = pii_data
    await db.commit()

    return {"status": "saved"}


# ============================================
# Results & Export (Admin)
# ============================================


@router.get("/{survey_id}/results")
async def get_survey_results(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get aggregated survey results."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    # Get submission stats
    total_result = await db.execute(
        select(func.count(SurveySubmission.id)).where(
            SurveySubmission.survey_id == survey_uuid
        )
    )
    total_submissions = total_result.scalar() or 0

    completed_result = await db.execute(
        select(func.count(SurveySubmission.id)).where(
            SurveySubmission.survey_id == survey_uuid,
            SurveySubmission.status == "completed",
        )
    )
    completed_submissions = completed_result.scalar() or 0

    # Get answers for each question
    question_results = []
    for question in sorted(survey.questions, key=lambda x: x.order_index):
        result = await db.execute(
            select(SurveyAnswer).where(SurveyAnswer.question_id == question.id)
        )
        answers = result.scalars().all()

        # Aggregate based on question type
        aggregated: dict[str, Any] = {
            "question_id": str(question.id),
            "question_text": question.question_text,
            "question_type": question.question_type,
            "total_responses": len(answers),
        }

        if question.question_type in ("single_choice", "multiple_choice", "true_false"):
            # Count responses for each option
            option_counts: dict[str, int] = {}
            for answer in answers:
                if question.question_type == "multiple_choice":
                    values = answer.answer_value.get("values", [])
                else:
                    values = [answer.answer_value.get("value")]

                for v in values:
                    if v:
                        option_counts[str(v)] = option_counts.get(str(v), 0) + 1

            aggregated["option_counts"] = option_counts

        elif question.question_type in ("rating", "scale"):
            # Calculate average and distribution
            values = [a.answer_value.get("value") for a in answers if a.answer_value.get("value") is not None]
            if values:
                aggregated["average"] = sum(values) / len(values)
                aggregated["min"] = min(values)
                aggregated["max"] = max(values)
                # Distribution
                distribution: dict[int, int] = {}
                for v in values:
                    distribution[v] = distribution.get(v, 0) + 1
                aggregated["distribution"] = distribution

        elif question.question_type == "open_text":
            # Just return recent responses
            aggregated["recent_responses"] = [
                a.answer_value.get("text", "")
                for a in answers[:10]
            ]

        question_results.append(aggregated)

    return {
        "survey_id": str(survey.id),
        "title": survey.title,
        "total_submissions": total_submissions,
        "completed_submissions": completed_submissions,
        "completion_rate": (
            round(completed_submissions / total_submissions * 100, 1)
            if total_submissions > 0
            else 0
        ),
        "questions": question_results,
    }


@router.get("/{survey_id}/export")
async def export_survey_results(
    survey_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Export survey results as CSV."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid survey ID"
        )

    result = await db.execute(
        select(Survey)
        .options(selectinload(Survey.questions))
        .where(Survey.id == survey_uuid, Survey.owner_id == user.id)
    )
    survey = result.scalar_one_or_none()

    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found"
        )

    # Get all submissions with answers
    result = await db.execute(
        select(SurveySubmission)
        .options(selectinload(SurveySubmission.answers))
        .where(
            SurveySubmission.survey_id == survey_uuid,
            SurveySubmission.status == "completed",
        )
        .order_by(SurveySubmission.completed_at)
    )
    submissions = result.scalars().all()

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    questions = sorted(survey.questions, key=lambda x: x.order_index)
    header = ["Submission ID", "Started At", "Completed At", "Source"]

    # Add PII columns if collected
    if survey.collect_pii_at_end:
        header.extend(["Name", "Email", "Phone", "Company"])

    # Add question columns
    for q in questions:
        header.append(q.question_text[:50])  # Truncate long questions

    writer.writerow(header)

    # Data rows
    for submission in submissions:
        row = [
            str(submission.id),
            submission.started_at.isoformat() if submission.started_at else "",
            submission.completed_at.isoformat() if submission.completed_at else "",
            submission.source,
        ]

        # PII data
        if survey.collect_pii_at_end:
            pii = submission.pii_data or {}
            row.extend([
                pii.get("name", ""),
                pii.get("email", ""),
                pii.get("phone", ""),
                pii.get("company", ""),
            ])

        # Answers
        answer_map = {a.question_id: a for a in submission.answers}
        for q in questions:
            answer = answer_map.get(q.id)
            if answer:
                value = answer.answer_value
                if q.question_type == "multiple_choice":
                    row.append(", ".join(value.get("values", [])))
                elif q.question_type == "open_text":
                    row.append(value.get("text", ""))
                else:
                    row.append(str(value.get("value", "")))
            else:
                row.append("")

        writer.writerow(row)

    output.seek(0)

    filename = f"survey_{survey.title[:20].replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
