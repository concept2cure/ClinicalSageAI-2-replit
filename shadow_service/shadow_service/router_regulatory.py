"""
FastAPI router for regulatory timeline and milestone endpoints.
"""
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Query, HTTPException
from .models_regulatory import (
    Submission, SubmissionList, SubmissionCreate, SubmissionStatusUpdate, SubmissionDatesUpdate,
    Milestone, MilestoneList, MilestoneCreate, MilestoneStatusUpdate, UpcomingDeadlineList,
    AgencyCorrespondence, CorrespondenceList, AgencyCorrespondenceCreate, PendingResponseList,
    InformationRequest, InformationRequestList, InformationRequestCreate, IRStatusUpdate,
    TimelineEventList, ProgramRegulatoryOverview,
    SubmissionStatus
)

router = APIRouter(prefix="/regulatory", tags=["Regulatory Timeline"])


# =============================================================================
# Submissions
# =============================================================================

@router.get("/submissions", response_model=SubmissionList)
async def list_submissions(
    program_id: Optional[UUID] = Query(None, description="Filter by program"),
    status: Optional[str] = Query(None, description="Filter by status")
):
    """List all regulatory submissions."""
    # TODO: Execute SQL_LIST_SUBMISSIONS
    return SubmissionList(items=[], count=0)


@router.get("/submissions/{submission_id}", response_model=Submission)
async def get_submission(submission_id: UUID):
    """Get a specific submission by ID."""
    # TODO: Execute SQL_GET_SUBMISSION
    raise HTTPException(status_code=404, detail="Submission not found")


@router.post("/submissions", response_model=Submission, status_code=201)
async def create_submission(data: SubmissionCreate):
    """Create a new regulatory submission."""
    # TODO: Execute SQL_CREATE_SUBMISSION
    raise HTTPException(status_code=501, detail="Not implemented")


@router.patch("/submissions/{submission_id}/status", response_model=Submission)
async def update_submission_status(submission_id: UUID, data: SubmissionStatusUpdate):
    """Update submission status."""
    # TODO: Execute SQL_UPDATE_SUBMISSION_STATUS
    raise HTTPException(status_code=501, detail="Not implemented")


@router.patch("/submissions/{submission_id}/dates", response_model=Submission)
async def update_submission_dates(submission_id: UUID, data: SubmissionDatesUpdate):
    """Update key submission dates (PDUFA, acceptance, etc.)."""
    # TODO: Execute SQL_UPDATE_SUBMISSION_DATES
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/submissions/{submission_id}/timeline", response_model=TimelineEventList)
async def get_submission_timeline(submission_id: UUID):
    """Get complete timeline of events for a submission."""
    # TODO: Execute SQL_GET_SUBMISSION_TIMELINE
    return TimelineEventList(submission_id=submission_id, items=[])


# =============================================================================
# Milestones
# =============================================================================

@router.get("/submissions/{submission_id}/milestones", response_model=MilestoneList)
async def list_milestones(submission_id: UUID):
    """List all milestones for a submission."""
    # TODO: Execute SQL_LIST_MILESTONES
    return MilestoneList(items=[], count=0)


@router.get("/milestones/{milestone_id}", response_model=Milestone)
async def get_milestone(milestone_id: UUID):
    """Get a specific milestone by ID."""
    # TODO: Execute SQL_GET_MILESTONE
    raise HTTPException(status_code=404, detail="Milestone not found")


@router.post("/milestones", response_model=Milestone, status_code=201)
async def create_milestone(data: MilestoneCreate):
    """Create a new milestone."""
    # TODO: Execute SQL_CREATE_MILESTONE
    raise HTTPException(status_code=501, detail="Not implemented")


@router.patch("/milestones/{milestone_id}/status", response_model=Milestone)
async def update_milestone_status(milestone_id: UUID, data: MilestoneStatusUpdate):
    """Update milestone status."""
    # TODO: Execute SQL_UPDATE_MILESTONE_STATUS
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/deadlines", response_model=UpcomingDeadlineList)
async def get_upcoming_deadlines(
    days_ahead: int = Query(30, ge=1, le=365, description="Days to look ahead"),
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get upcoming milestone deadlines across all submissions."""
    # TODO: Execute SQL_GET_UPCOMING_DEADLINES
    return UpcomingDeadlineList(items=[], count=0)


# =============================================================================
# Agency Correspondence
# =============================================================================

@router.get("/submissions/{submission_id}/correspondence", response_model=CorrespondenceList)
async def list_correspondence(submission_id: UUID):
    """List all agency correspondence for a submission."""
    # TODO: Execute SQL_LIST_CORRESPONDENCE
    return CorrespondenceList(items=[], count=0)


@router.post("/correspondence", response_model=AgencyCorrespondence, status_code=201)
async def create_correspondence(data: AgencyCorrespondenceCreate):
    """Record new agency correspondence."""
    # TODO: Execute SQL_CREATE_CORRESPONDENCE
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/pending-responses", response_model=PendingResponseList)
async def get_pending_responses(
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get all pending responses to agency correspondence."""
    # TODO: Execute SQL_GET_PENDING_RESPONSES
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
    # TODO: Execute SQL_LIST_INFORMATION_REQUESTS
    return InformationRequestList(items=[], count=0)


@router.get("/information-requests/{ir_id}", response_model=InformationRequest)
async def get_information_request(ir_id: UUID):
    """Get a specific information request."""
    # TODO: Execute SQL_GET_INFORMATION_REQUEST
    raise HTTPException(status_code=404, detail="Information request not found")


@router.post("/information-requests", response_model=InformationRequest, status_code=201)
async def create_information_request(data: InformationRequestCreate):
    """Create a new information request."""
    # TODO: Execute SQL_CREATE_INFORMATION_REQUEST
    raise HTTPException(status_code=501, detail="Not implemented")


@router.patch("/information-requests/{ir_id}/status", response_model=InformationRequest)
async def update_ir_status(ir_id: UUID, data: IRStatusUpdate):
    """Update information request status."""
    # TODO: Execute SQL_UPDATE_IR_STATUS
    raise HTTPException(status_code=501, detail="Not implemented")


# =============================================================================
# Program Overview
# =============================================================================

@router.get("/overview", response_model=ProgramRegulatoryOverview)
async def get_program_regulatory_overview(
    program_id: Optional[UUID] = Query(None, description="Filter by program")
):
    """Get regulatory overview for a program or all programs."""
    # TODO: Execute SQL_GET_PROGRAM_REGULATORY_OVERVIEW
    raise HTTPException(status_code=501, detail="Not implemented")
