"""Analytics API endpoints."""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, get_optional_user
from app.auth.models import User
from app.database import get_db
from app.models.analytics import AnalyticsDailySummary, AnalyticsEvent, AnalyticsSession

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ============================================
# Schemas
# ============================================


class TrackEventRequest(BaseModel):
    """Request to track an analytics event."""

    resource_type: str = Field(..., pattern="^(awdio|podcast|quiz|survey)$")
    resource_id: str
    session_id: str | None = None
    event_type: str = Field(
        ...,
        pattern="^(view_start|view_complete|segment_view|qa_start|qa_complete|pause|resume)$",
    )
    event_data: dict[str, Any] = Field(default_factory=dict)
    viewer_session_id: str
    listener_id: str | None = None
    source: str = Field(default="direct", pattern="^(direct|embed|api)$")
    referrer: str | None = None


class AnalyticsSummary(BaseModel):
    """Summary analytics for a resource."""

    resource_type: str
    resource_id: str
    total_views: int
    unique_viewers: int
    completions: int
    completion_rate: float
    avg_duration_ms: int | None
    qa_interactions: int
    embed_views: int
    direct_views: int


class DailyMetric(BaseModel):
    """Daily metric data point."""

    date: str
    views: int
    unique_viewers: int
    completions: int
    qa_interactions: int


class AnalyticsDetail(BaseModel):
    """Detailed analytics for a resource."""

    summary: AnalyticsSummary
    daily_metrics: list[DailyMetric]
    recent_sessions: list[dict[str, Any]]


class DashboardSummary(BaseModel):
    """Overall dashboard summary."""

    total_views: int
    total_unique_viewers: int
    total_completions: int
    total_qa_interactions: int
    views_today: int
    views_this_week: int
    top_resources: list[dict[str, Any]]


# ============================================
# Event Tracking (Public)
# ============================================


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def track_event(
    request: Request,
    body: TrackEventRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> dict[str, str]:
    """
    Track an analytics event.

    This endpoint is called from the frontend to track user interactions.
    It can be called without authentication for embed views.
    """
    # Hash IP for privacy
    client_ip = request.client.host if request.client else None
    ip_hash = None
    if client_ip:
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    # Parse UUIDs
    try:
        resource_uuid = uuid.UUID(body.resource_id)
        session_uuid = uuid.UUID(body.session_id) if body.session_id else None
        listener_uuid = uuid.UUID(body.listener_id) if body.listener_id else None
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format",
        )

    # Create event
    event = AnalyticsEvent(
        resource_type=body.resource_type,
        resource_id=resource_uuid,
        session_id=session_uuid,
        event_type=body.event_type,
        event_data=body.event_data,
        viewer_session_id=body.viewer_session_id,
        listener_id=listener_uuid,
        user_id=user.id if user else None,
        source=body.source,
        referrer=body.referrer,
        user_agent=request.headers.get("user-agent"),
        ip_hash=ip_hash,
    )
    db.add(event)

    # Update or create analytics session
    await _update_analytics_session(db, body, user, event)

    await db.commit()

    return {"status": "tracked", "event_id": str(event.id)}


async def _update_analytics_session(
    db: AsyncSession,
    body: TrackEventRequest,
    user: User | None,
    event: AnalyticsEvent,
) -> None:
    """Update or create an analytics session based on the event."""
    # Find existing session
    result = await db.execute(
        select(AnalyticsSession).where(
            AnalyticsSession.viewer_session_id == body.viewer_session_id
        )
    )
    session = result.scalar_one_or_none()

    resource_uuid = uuid.UUID(body.resource_id)
    session_uuid = uuid.UUID(body.session_id) if body.session_id else None
    listener_uuid = uuid.UUID(body.listener_id) if body.listener_id else None

    if not session:
        # Create new session on view_start
        if body.event_type == "view_start":
            session = AnalyticsSession(
                resource_type=body.resource_type,
                resource_id=resource_uuid,
                session_id=session_uuid,
                viewer_session_id=body.viewer_session_id,
                listener_id=listener_uuid,
                user_id=user.id if user else None,
                source=body.source,
                started_at=datetime.now(timezone.utc),
                total_segments=body.event_data.get("total_segments"),
            )
            db.add(session)
    else:
        # Update existing session
        now = datetime.now(timezone.utc)

        if body.event_type == "segment_view":
            segment_index = body.event_data.get("segment_index", 0)
            session.segments_viewed += 1
            session.max_segment_reached = max(session.max_segment_reached, segment_index)
            if session.total_segments and session.total_segments > 0:
                session.completion_percentage = min(
                    100.0, (session.max_segment_reached + 1) / session.total_segments * 100
                )

        elif body.event_type == "view_complete":
            session.completed = True
            session.completion_percentage = 100.0
            session.ended_at = now
            if session.started_at:
                session.duration_ms = int((now - session.started_at).total_seconds() * 1000)

        elif body.event_type == "qa_start" or body.event_type == "qa_complete":
            session.qa_interactions += 1

        elif body.event_type == "pause":
            session.pause_count += 1

        session.updated_at = now


# ============================================
# Analytics Queries (Authenticated)
# ============================================


@router.get("/awdios/{awdio_id}", response_model=AnalyticsDetail)
async def get_awdio_analytics(
    awdio_id: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalyticsDetail:
    """Get analytics for a specific awdio."""
    return await _get_resource_analytics(db, "awdio", awdio_id, days)


@router.get("/podcasts/{podcast_id}", response_model=AnalyticsDetail)
async def get_podcast_analytics(
    podcast_id: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalyticsDetail:
    """Get analytics for a specific podcast."""
    return await _get_resource_analytics(db, "podcast", podcast_id, days)


async def _get_resource_analytics(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    days: int,
) -> AnalyticsDetail:
    """Get detailed analytics for a resource."""
    try:
        resource_uuid = uuid.UUID(resource_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource ID",
        )

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Get summary metrics from sessions
    sessions_result = await db.execute(
        select(
            func.count(AnalyticsSession.id).label("total_views"),
            func.count(func.distinct(AnalyticsSession.viewer_session_id)).label("unique_viewers"),
            func.sum(func.cast(AnalyticsSession.completed, sa.Integer)).label("completions"),
            func.avg(AnalyticsSession.duration_ms).label("avg_duration"),
            func.sum(AnalyticsSession.qa_interactions).label("qa_interactions"),
            func.sum(func.cast(AnalyticsSession.source == "embed", sa.Integer)).label("embed_views"),
            func.sum(func.cast(AnalyticsSession.source == "direct", sa.Integer)).label("direct_views"),
        ).where(
            AnalyticsSession.resource_type == resource_type,
            AnalyticsSession.resource_id == resource_uuid,
            AnalyticsSession.started_at >= cutoff,
        )
    )
    stats = sessions_result.one()

    total_views = stats.total_views or 0
    completions = int(stats.completions or 0)
    completion_rate = (completions / total_views * 100) if total_views > 0 else 0.0

    summary = AnalyticsSummary(
        resource_type=resource_type,
        resource_id=resource_id,
        total_views=total_views,
        unique_viewers=stats.unique_viewers or 0,
        completions=completions,
        completion_rate=round(completion_rate, 1),
        avg_duration_ms=int(stats.avg_duration) if stats.avg_duration else None,
        qa_interactions=int(stats.qa_interactions or 0),
        embed_views=int(stats.embed_views or 0),
        direct_views=int(stats.direct_views or 0),
    )

    # Get daily metrics
    daily_result = await db.execute(
        select(AnalyticsDailySummary)
        .where(
            AnalyticsDailySummary.resource_type == resource_type,
            AnalyticsDailySummary.resource_id == resource_uuid,
            AnalyticsDailySummary.date >= cutoff,
        )
        .order_by(AnalyticsDailySummary.date)
    )
    daily_summaries = daily_result.scalars().all()

    daily_metrics = [
        DailyMetric(
            date=d.date.strftime("%Y-%m-%d"),
            views=d.view_count,
            unique_viewers=d.unique_viewers,
            completions=d.completions,
            qa_interactions=d.qa_interactions,
        )
        for d in daily_summaries
    ]

    # Get recent sessions
    recent_result = await db.execute(
        select(AnalyticsSession)
        .where(
            AnalyticsSession.resource_type == resource_type,
            AnalyticsSession.resource_id == resource_uuid,
        )
        .order_by(AnalyticsSession.started_at.desc())
        .limit(10)
    )
    recent_sessions = [
        {
            "id": str(s.id),
            "started_at": s.started_at.isoformat(),
            "source": s.source,
            "completed": s.completed,
            "completion_percentage": s.completion_percentage,
            "duration_ms": s.duration_ms,
            "qa_interactions": s.qa_interactions,
        }
        for s in recent_result.scalars().all()
    ]

    return AnalyticsDetail(
        summary=summary,
        daily_metrics=daily_metrics,
        recent_sessions=recent_sessions,
    )


@router.get("/dashboard", response_model=DashboardSummary)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardSummary:
    """Get overall analytics dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    # Overall totals
    total_result = await db.execute(
        select(
            func.count(AnalyticsSession.id).label("total_views"),
            func.count(func.distinct(AnalyticsSession.viewer_session_id)).label("unique_viewers"),
            func.sum(func.cast(AnalyticsSession.completed, sa.Integer)).label("completions"),
            func.sum(AnalyticsSession.qa_interactions).label("qa_interactions"),
        )
    )
    totals = total_result.one()

    # Views today
    today_result = await db.execute(
        select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= today_start
        )
    )
    views_today = today_result.scalar() or 0

    # Views this week
    week_result = await db.execute(
        select(func.count(AnalyticsSession.id)).where(
            AnalyticsSession.started_at >= week_start
        )
    )
    views_this_week = week_result.scalar() or 0

    # Top resources by views
    top_result = await db.execute(
        select(
            AnalyticsSession.resource_type,
            AnalyticsSession.resource_id,
            func.count(AnalyticsSession.id).label("view_count"),
        )
        .group_by(AnalyticsSession.resource_type, AnalyticsSession.resource_id)
        .order_by(func.count(AnalyticsSession.id).desc())
        .limit(5)
    )
    top_resources = [
        {
            "resource_type": r.resource_type,
            "resource_id": str(r.resource_id),
            "view_count": r.view_count,
        }
        for r in top_result.all()
    ]

    return DashboardSummary(
        total_views=totals.total_views or 0,
        total_unique_viewers=totals.unique_viewers or 0,
        total_completions=int(totals.completions or 0),
        total_qa_interactions=int(totals.qa_interactions or 0),
        views_today=views_today,
        views_this_week=views_this_week,
        top_resources=top_resources,
    )


# ============================================
# Daily Summary Generation (Admin/Cron)
# ============================================


@router.post("/generate-daily-summary")
async def generate_daily_summary(
    date: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Generate daily summary for a specific date.

    Admin only. Can be called by cron job to generate yesterday's summary.
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    # Default to yesterday
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Use YYYY-MM-DD",
            )
    else:
        target_date = (datetime.now(timezone.utc) - timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    next_date = target_date + timedelta(days=1)

    # Get all unique resource combinations for the day
    resources_result = await db.execute(
        select(
            AnalyticsSession.resource_type,
            AnalyticsSession.resource_id,
        )
        .where(
            AnalyticsSession.started_at >= target_date,
            AnalyticsSession.started_at < next_date,
        )
        .distinct()
    )
    resources = resources_result.all()

    summaries_created = 0

    for resource_type, resource_id in resources:
        # Calculate metrics for this resource on this date
        metrics_result = await db.execute(
            select(
                func.count(AnalyticsSession.id).label("view_count"),
                func.count(func.distinct(AnalyticsSession.viewer_session_id)).label("unique_viewers"),
                func.sum(func.cast(AnalyticsSession.source == "embed", sa.Integer)).label("embed_views"),
                func.sum(func.cast(AnalyticsSession.source == "direct", sa.Integer)).label("direct_views"),
                func.sum(func.cast(AnalyticsSession.completed, sa.Integer)).label("completions"),
                func.avg(AnalyticsSession.completion_percentage).label("avg_completion"),
                func.avg(AnalyticsSession.duration_ms).label("avg_duration"),
                func.sum(AnalyticsSession.qa_interactions).label("qa_interactions"),
                func.sum(AnalyticsSession.pause_count).label("pause_count"),
            ).where(
                AnalyticsSession.resource_type == resource_type,
                AnalyticsSession.resource_id == resource_id,
                AnalyticsSession.started_at >= target_date,
                AnalyticsSession.started_at < next_date,
            )
        )
        metrics = metrics_result.one()

        # Upsert daily summary
        existing_result = await db.execute(
            select(AnalyticsDailySummary).where(
                AnalyticsDailySummary.resource_type == resource_type,
                AnalyticsDailySummary.resource_id == resource_id,
                AnalyticsDailySummary.date == target_date,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing:
            # Update existing
            existing.view_count = metrics.view_count or 0
            existing.unique_viewers = metrics.unique_viewers or 0
            existing.embed_views = int(metrics.embed_views or 0)
            existing.direct_views = int(metrics.direct_views or 0)
            existing.completions = int(metrics.completions or 0)
            existing.avg_completion_percentage = float(metrics.avg_completion or 0)
            existing.avg_duration_ms = int(metrics.avg_duration) if metrics.avg_duration else None
            existing.qa_interactions = int(metrics.qa_interactions or 0)
            existing.total_pause_count = int(metrics.pause_count or 0)
        else:
            # Create new
            summary = AnalyticsDailySummary(
                resource_type=resource_type,
                resource_id=resource_id,
                date=target_date,
                view_count=metrics.view_count or 0,
                unique_viewers=metrics.unique_viewers or 0,
                embed_views=int(metrics.embed_views or 0),
                direct_views=int(metrics.direct_views or 0),
                completions=int(metrics.completions or 0),
                avg_completion_percentage=float(metrics.avg_completion or 0),
                avg_duration_ms=int(metrics.avg_duration) if metrics.avg_duration else None,
                qa_interactions=int(metrics.qa_interactions or 0),
                total_pause_count=int(metrics.pause_count or 0),
            )
            db.add(summary)
            summaries_created += 1

    await db.commit()

    return {
        "status": "success",
        "date": target_date.strftime("%Y-%m-%d"),
        "resources_processed": len(resources),
        "summaries_created": summaries_created,
    }
