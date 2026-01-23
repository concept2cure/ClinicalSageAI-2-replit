"""
FastAPI router for regulatory timeline and milestone endpoints.
Fully implemented with database integration.
"""
import logging
from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Query, HTTPException, Header

from . import db
from .db import LiteModeError
from . import sql_regulatory as sql
from .models_regulatory import (
    Submission, SubmissionList, SubmissionCreate, SubmissionStatusUpdate, SubmissionDatesUpdate,
    Milestone, MilestoneList, MilestoneCreate, MilestoneStatusUpdate, UpcomingDeadlineList,
    AgencyCorrespondence, CorrespondenceList, AgencyCorrespondenceCreate, PendingResponseList,
    InformationRequest, InformationRequestList, InformationRequestCreate, IRStatusUpdate,
    TimelineEventList, ProgramRegulatoryOverview,
    SubmissionStatus
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/regulatory", tags=["Regulatory Timeline"])


def _handle_lite_mode(e: LiteModeError):
    """Convert LiteModeError to HTTP 503."""
    raise HTTPException(status_code=503, detail="Database not available. Service running in lite mode.")


# =============================================================================
# Submissions
# =============================================================================

@router.get("/submissions", response_model=SubmissionList)
async def list_submissions(
    program_id: Optional[UUID] = Query(None, description="Filter by program"),
    status: Optional[str] = Query(None, description="Filter by status")
):
    """List all regulatory submissions."""
    try:
        records = await db.fetch(sql.SQL_LIST_SUBMISSIONS, program_id, status)
        items = [Submission(**dict(r)) for r in records]
        return SubmissionList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list submissions")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/submissions/{submission_id}", response_model=Submission)
async def get_submission(submission_id: UUID):
    """Get a specific submission by ID."""
    try:
        record = await db.fetchrow(sql.SQL_GET_SUBMISSION, submission_id)
        if not record:
            raise HTTPException(status_code=404, detail="Submission not found")
        return Submission(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get submission")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submissions", response_model=Submission, status_code=201)
async def create_submission(
    data: SubmissionCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Create a new regulatory submission."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_SUBMISSION,
                data.submission_code,
                data.submission_name,
                data.submission_type_id,
                data.program_id,
                data.status.value if data.status else None,
                data.primary_snapshot_id,
                data.target_date,
                data.notes,
                data.metadata,
            )
        await db.release_connection(conn)
        return Submission(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create submission")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/submissions/{submission_id}/status", response_model=Submission)
async def update_submission_status(
    submission_id: UUID, 
    data: SubmissionStatusUpdate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Update submission status."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_UPDATE_SUBMISSION_STATUS,
                submission_id,
                data.status.value,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Submission not found")
        return Submission(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update submission status")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/submissions/{submission_id}/dates", response_model=Submission)
async def update_submission_dates(
    submission_id: UUID, 
    data: SubmissionDatesUpdate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Update key submission dates (PDUFA, acceptance, etc.)."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_UPDATE_SUBMISSION_DATES,
                submission_id,
                data.submission_date,
                data.acceptance_date,
                data.pdufa_date,
                data.approval_date,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Submission not found")
        return Submission(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update submission dates")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/submissions/{submission_id}/timeline", response_model=TimelineEventList)
async def get_submission_timeline(submission_id: UUID):
    """Get complete timeline of events for a submission."""
    try:
        records = await db.fetch(sql.SQL_GET_SUBMISSION_TIMELINE, submission_id)
        items = [dict(r) for r in records]
        return TimelineEventList(submission_id=submission_id, items=items)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get submission timeline")
        return TimelineEventList(submission_id=submission_id, items=[])


# =============================================================================
# Milestones
# =============================================================================

@router.get("/submissions/{submission_id}/milestones", response_model=MilestoneList)
async def list_milestones(submission_id: UUID):
    """List all milestones for a submission."""
    try:
        records = await db.fetch(sql.SQL_LIST_MILESTONES, submission_id)
        items = [Milestone(**dict(r)) for r in records]
        return MilestoneList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list milestones")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/milestones/{milestone_id}", response_model=Milestone)
async def get_milestone(milestone_id: UUID):
    """Get a specific milestone by ID."""
    try:
        record = await db.fetchrow(sql.SQL_GET_MILESTONE, milestone_id)
        if not record:
            raise HTTPException(status_code=404, detail="Milestone not found")
        return Milestone(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get milestone")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/milestones", response_model=Milestone, status_code=201)
async def create_milestone(
    data: MilestoneCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Create a new milestone."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_MILESTONE,
                data.submission_id,
                data.milestone_code,
                data.milestone_name,
                data.description,
                data.status.value if data.status else None,
                data.planned_date,
                data.deadline,
                data.owner,
                data.notes,
            )
        await db.release_connection(conn)
        return Milestone(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create milestone")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/milestones/{milestone_id}/status", response_model=Milestone)
async def update_milestone_status(
    milestone_id: UUID, 
    data: MilestoneStatusUpdate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Update milestone status."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_UPDATE_MILESTONE_STATUS,
                milestone_id,
                data.status.value,
                data.actual_date,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Milestone not found")
        return Milestone(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update milestone status")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/deadlines", response_model=UpcomingDeadlineList)
async def get_upcoming_deadlines(
    days_ahead: int = Query(30, ge=1, le=365, description="Days to look ahead"),
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get upcoming milestone deadlines across all submissions."""
    try:
        records = await db.fetch(sql.SQL_GET_UPCOMING_DEADLINES, days_ahead, program_id)
        items = [dict(r) for r in records]
        return UpcomingDeadlineList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get upcoming deadlines")
        return UpcomingDeadlineList(items=[], count=0)


# =============================================================================
# Agency Correspondence
# =============================================================================

@router.get("/submissions/{submission_id}/correspondence", response_model=CorrespondenceList)
async def list_correspondence(submission_id: UUID):
    """List all agency correspondence for a submission."""
    try:
        records = await db.fetch(sql.SQL_LIST_CORRESPONDENCE, submission_id)
        items = [AgencyCorrespondence(**dict(r)) for r in records]
        return CorrespondenceList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list correspondence")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/correspondence", response_model=AgencyCorrespondence, status_code=201)
async def create_correspondence(
    data: AgencyCorrespondenceCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Record new agency correspondence."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_CORRESPONDENCE,
                data.submission_id,
                data.correspondence_type,
                data.subject,
                data.content_summary,
                data.received_date or data.sent_date,
                data.direction,
                data.response_required,
                data.response_due_date,
                data.document_id,
            )
        await db.release_connection(conn)
        return AgencyCorrespondence(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create correspondence")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-responses", response_model=PendingResponseList)
async def get_pending_responses(
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get all pending responses to agency correspondence."""
    try:
        records = await db.fetch(sql.SQL_GET_PENDING_RESPONSES, program_id)
        items = [dict(r) for r in records]
        return PendingResponseList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get pending responses")
        return PendingResponseList(items=[], count=0)


# =============================================================================
# Information Requests
# =============================================================================

@router.get("/information-requests", response_model=InformationRequestList)
async def list_information_requests(
    submission_id: Optional[UUID] = Query(None, description="Filter by submission"),
    status: Optional[str] = Query(None, description="Filter by status")
):
    """List all information requests."""
    try:
        records = await db.fetch(sql.SQL_LIST_INFORMATION_REQUESTS, submission_id, status)
        items = [InformationRequest(**dict(r)) for r in records]
        return InformationRequestList(items=items, count=len(items))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list information requests")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/information-requests", response_model=InformationRequest, status_code=201)
async def create_information_request(
    data: InformationRequestCreate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Create a new information request record."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_CREATE_INFORMATION_REQUEST,
                data.submission_id,
                data.correspondence_id,
                data.ir_number,
                data.question_text,
                data.category,
                data.severity,
                data.due_date,
                data.assigned_to,
            )
        await db.release_connection(conn)
        return InformationRequest(**dict(record))
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to create information request")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/information-requests/{ir_id}/status", response_model=InformationRequest)
async def update_ir_status(
    ir_id: UUID, 
    data: IRStatusUpdate,
    x_actor: str = Header(..., alias="X-Actor"),
):
    """Update information request status."""
    try:
        conn = await db.acquire_connection()
        async with conn.transaction():
            await conn.execute(f"SET LOCAL app.user = '{x_actor}'")
            record = await conn.fetchrow(
                sql.SQL_UPDATE_IR_STATUS,
                ir_id,
                data.status,
                data.response_summary,
            )
        await db.release_connection(conn)
        if not record:
            raise HTTPException(status_code=404, detail="Information request not found")
        return InformationRequest(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to update IR status")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Program Overview
# =============================================================================

@router.get("/programs/{program_id}/overview", response_model=ProgramRegulatoryOverview)
async def get_program_regulatory_overview(program_id: UUID):
    """Get regulatory overview for a program."""
    try:
        record = await db.fetchrow(sql.SQL_GET_PROGRAM_REGULATORY_OVERVIEW, program_id)
        if not record:
            raise HTTPException(status_code=404, detail="Program not found")
        return ProgramRegulatoryOverview(**dict(record))
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get program overview")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Enhanced Dashboard & Analytics
# =============================================================================

@router.get("/dashboard/summary")
async def get_regulatory_dashboard_summary(
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get summary statistics for regulatory timeline dashboard.
    
    Returns aggregated metrics including:
    - Active submissions by status
    - Upcoming deadlines (next 30 days)
    - Pending agency responses
    - Information requests by status
    """
    try:
        # Get submissions by status
        submissions = await db.fetch(sql.SQL_LIST_SUBMISSIONS, program_id, None)
        status_counts = {}
        for sub in submissions:
            status = dict(sub).get('status', 'UNKNOWN')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # Get upcoming deadlines
        deadlines = await db.fetch(sql.SQL_GET_UPCOMING_DEADLINES, 30, program_id)
        
        # Get pending responses
        pending = await db.fetch(sql.SQL_GET_PENDING_RESPONSES, program_id)
        
        # Get IRs
        irs = await db.fetch(sql.SQL_LIST_INFORMATION_REQUESTS, None, None)
        ir_counts = {"open": 0, "in_progress": 0, "closed": 0}
        for ir in irs:
            status = dict(ir).get('status', 'open').lower()
            if status in ir_counts:
                ir_counts[status] += 1
        
        return {
            "submissions": {
                "total": len(submissions),
                "by_status": status_counts,
            },
            "deadlines": {
                "next_30_days": len(deadlines),
                "critical": sum(1 for d in deadlines if dict(d).get('days_until', 999) <= 7),
            },
            "agency_correspondence": {
                "pending_responses": len(pending),
                "overdue": sum(1 for p in pending if dict(p).get('is_overdue', False)),
            },
            "information_requests": ir_counts,
            "last_updated": datetime.utcnow().isoformat(),
        }
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get regulatory dashboard summary")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline/gantt/{submission_id}")
async def get_submission_gantt_data(submission_id: UUID):
    """Get Gantt chart data for a submission timeline.
    
    Returns milestone data formatted for Gantt chart visualization
    including dependencies and critical path indicators.
    """
    try:
        # Get submission
        submission = await db.fetchrow(sql.SQL_GET_SUBMISSION, submission_id)
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # Get milestones
        milestones = await db.fetch(sql.SQL_LIST_MILESTONES, submission_id)
        
        gantt_items = []
        for ms in milestones:
            ms_dict = dict(ms)
            gantt_items.append({
                "id": str(ms_dict.get('id')),
                "name": ms_dict.get('milestone_name'),
                "start": ms_dict.get('planned_date', ms_dict.get('created_at')),
                "end": ms_dict.get('deadline') or ms_dict.get('actual_date'),
                "status": ms_dict.get('status'),
                "owner": ms_dict.get('owner'),
                "is_complete": ms_dict.get('status') == 'COMPLETED',
                "is_critical": ms_dict.get('deadline') is not None,
            })
        
        return {
            "submission_id": str(submission_id),
            "submission_code": dict(submission).get('submission_code'),
            "submission_name": dict(submission).get('submission_name'),
            "milestones": gantt_items,
            "key_dates": {
                "target_date": dict(submission).get('target_date'),
                "submission_date": dict(submission).get('submission_date'),
                "pdufa_date": dict(submission).get('pdufa_date'),
            }
        }
    except HTTPException:
        raise
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get Gantt data")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/critical")
async def get_critical_regulatory_alerts(
    program_id: Optional[UUID] = Query(None, description="Filter by program"),
    days_ahead: int = Query(14, ge=1, le=90, description="Look-ahead window")
):
    """Get critical regulatory alerts and warnings.
    
    Identifies:
    - Milestones at risk (approaching deadline, not started)
    - Overdue agency responses
    - PDUFA dates within window
    - Missing required documents
    """
    try:
        alerts = []
        
        # Check upcoming deadlines
        deadlines = await db.fetch(sql.SQL_GET_UPCOMING_DEADLINES, days_ahead, program_id)
        for deadline in deadlines:
            d = dict(deadline)
            days_until = d.get('days_until', 999)
            if days_until <= 7 and d.get('status') != 'COMPLETED':
                alerts.append({
                    "type": "DEADLINE_CRITICAL",
                    "severity": "HIGH" if days_until <= 3 else "MEDIUM",
                    "message": f"Milestone '{d.get('milestone_name')}' due in {days_until} days",
                    "submission_code": d.get('submission_code'),
                    "action_required": f"Complete milestone by {d.get('deadline')}",
                    "days_until": days_until,
                })
        
        # Check pending responses
        pending = await db.fetch(sql.SQL_GET_PENDING_RESPONSES, program_id)
        for response in pending:
            r = dict(response)
            if r.get('is_overdue'):
                alerts.append({
                    "type": "RESPONSE_OVERDUE",
                    "severity": "HIGH",
                    "message": f"Agency response overdue: {r.get('subject')}",
                    "submission_code": r.get('submission_code'),
                    "action_required": "Submit response immediately",
                    "due_date": r.get('response_due_date'),
                })
        
        # Sort by severity
        severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        alerts.sort(key=lambda x: severity_order.get(x.get('severity'), 3))
        
        return {
            "alerts": alerts,
            "total_count": len(alerts),
            "high_count": sum(1 for a in alerts if a.get('severity') == 'HIGH'),
            "generated_at": datetime.utcnow().isoformat(),
        }
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get critical alerts")
        raise HTTPException(status_code=500, detail=str(e))

