"""
Pydantic models for regulatory timeline and milestone operations.
"""
from datetime import datetime, date
from typing import Optional, List, Any, Dict
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field


class SubmissionStatus(str, Enum):
    PLANNING = "PLANNING"
    DRAFTING = "DRAFTING"
    REVIEW = "REVIEW"
    READY = "READY"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    QUESTIONS_RECEIVED = "QUESTIONS_RECEIVED"
    APPROVED = "APPROVED"
    REFUSED = "REFUSED"
    WITHDRAWN = "WITHDRAWN"


class MilestoneStatus(str, Enum):
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    DELAYED = "DELAYED"
    CANCELLED = "CANCELLED"
    BLOCKED = "BLOCKED"


class CorrespondenceDirection(str, Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"


class IRStatus(str, Enum):
    RECEIVED = "RECEIVED"
    IN_PROGRESS = "IN_PROGRESS"
    DRAFT_COMPLETE = "DRAFT_COMPLETE"
    UNDER_REVIEW = "UNDER_REVIEW"
    SUBMITTED = "SUBMITTED"


# --- Submission Types ---

class SubmissionType(BaseModel):
    id: UUID
    type_code: str
    type_name: str
    agency_code: str
    description: Optional[str] = None
    typical_duration_days: Optional[int] = None
    is_active: bool = True


# --- Submissions ---

class Submission(BaseModel):
    id: UUID
    submission_code: str
    submission_name: str
    submission_type_id: UUID
    type_code: Optional[str] = None
    type_name: Optional[str] = None
    agency_code: Optional[str] = None
    program_id: UUID
    program_code: Optional[str] = None
    program_name: Optional[str] = None
    status: SubmissionStatus
    primary_snapshot_id: Optional[UUID] = None
    target_date: Optional[date] = None
    submission_date: Optional[date] = None
    acceptance_date: Optional[date] = None
    pdufa_date: Optional[date] = None
    approval_date: Optional[date] = None
    notes: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime] = None


class SubmissionCreate(BaseModel):
    submission_code: str = Field(..., min_length=1, max_length=50)
    submission_name: str = Field(..., min_length=1, max_length=300)
    submission_type_id: UUID
    program_id: UUID
    status: Optional[SubmissionStatus] = SubmissionStatus.PLANNING
    primary_snapshot_id: Optional[UUID] = None
    target_date: Optional[date] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SubmissionStatusUpdate(BaseModel):
    status: SubmissionStatus


class SubmissionDatesUpdate(BaseModel):
    submission_date: Optional[date] = None
    acceptance_date: Optional[date] = None
    pdufa_date: Optional[date] = None
    approval_date: Optional[date] = None


# --- Milestones ---

class Milestone(BaseModel):
    id: UUID
    submission_id: UUID
    milestone_code: str
    milestone_name: str
    description: Optional[str] = None
    status: MilestoneStatus
    planned_date: Optional[date] = None
    actual_date: Optional[date] = None
    deadline: Optional[date] = None
    days_until_deadline: Optional[int] = None
    owner: Optional[str] = None
    linked_snapshot_id: Optional[UUID] = None
    linked_export_id: Optional[UUID] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by: str


class MilestoneCreate(BaseModel):
    submission_id: UUID
    milestone_code: str = Field(..., min_length=1, max_length=50)
    milestone_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[MilestoneStatus] = MilestoneStatus.PLANNED
    planned_date: Optional[date] = None
    deadline: Optional[date] = None
    owner: Optional[str] = None
    notes: Optional[str] = None


class MilestoneStatusUpdate(BaseModel):
    status: MilestoneStatus
    actual_date: Optional[date] = None


class UpcomingDeadline(BaseModel):
    id: UUID
    submission_id: UUID
    submission_code: str
    milestone_code: str
    milestone_name: str
    deadline: date
    days_until_deadline: int
    status: MilestoneStatus
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None


# --- Agency Correspondence ---

class AgencyCorrespondence(BaseModel):
    id: UUID
    submission_id: UUID
    correspondence_type: str
    reference_number: Optional[str] = None
    subject: str
    direction: CorrespondenceDirection
    correspondence_date: date
    due_date: Optional[date] = None
    response_date: Optional[date] = None
    document_refs: List[str] = []
    summary: Optional[str] = None
    action_items: Optional[str] = None
    created_at: datetime
    created_by: str


class AgencyCorrespondenceCreate(BaseModel):
    submission_id: UUID
    correspondence_type: str = Field(..., min_length=1, max_length=100)
    reference_number: Optional[str] = None
    subject: str = Field(..., min_length=1, max_length=500)
    direction: CorrespondenceDirection
    correspondence_date: date
    due_date: Optional[date] = None
    document_refs: Optional[List[str]] = None
    summary: Optional[str] = None
    action_items: Optional[str] = None


class PendingResponse(BaseModel):
    id: UUID
    submission_id: UUID
    submission_code: str
    correspondence_type: str
    reference_number: Optional[str] = None
    subject: str
    due_date: date
    days_until_due: int
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None


# --- Information Requests ---

class InformationRequest(BaseModel):
    id: UUID
    submission_id: UUID
    submission_code: Optional[str] = None
    program_code: Optional[str] = None
    ir_number: str
    ir_type: str
    status: IRStatus
    received_date: date
    due_date: Optional[date] = None
    submitted_date: Optional[date] = None
    question_count: int = 0
    answered_count: int = 0
    days_until_due: Optional[int] = None
    questions: List[Dict[str, Any]] = []
    notes: Optional[str] = None
    created_at: datetime
    created_by: str


class InformationRequestCreate(BaseModel):
    submission_id: UUID
    ir_number: str = Field(..., min_length=1, max_length=50)
    ir_type: str = Field(..., min_length=1, max_length=100)
    status: Optional[IRStatus] = IRStatus.RECEIVED
    received_date: date
    due_date: Optional[date] = None
    question_count: Optional[int] = 0
    questions: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None


class IRStatusUpdate(BaseModel):
    status: IRStatus
    submitted_date: Optional[date] = None
    answered_count: Optional[int] = None


# --- Timeline / Overview ---

class TimelineEvent(BaseModel):
    event_type: str  # MILESTONE, CORRESPONDENCE, IR
    event_id: UUID
    event_name: str
    event_date: Optional[date] = None
    status: Optional[str] = None
    reference_number: Optional[str] = None


class ProgramRegulatoryOverview(BaseModel):
    program_id: UUID
    program_code: str
    program_name: str
    submission_count: int = 0
    active_submissions: int = 0
    approved_count: int = 0
    next_deadline: Optional[date] = None
    open_ir_count: int = 0


# --- List Response Models ---

class SubmissionList(BaseModel):
    items: List[Submission]
    count: int


class MilestoneList(BaseModel):
    items: List[Milestone]
    count: int


class UpcomingDeadlineList(BaseModel):
    items: List[UpcomingDeadline]
    count: int


class CorrespondenceList(BaseModel):
    items: List[AgencyCorrespondence]
    count: int


class PendingResponseList(BaseModel):
    items: List[PendingResponse]
    count: int


class InformationRequestList(BaseModel):
    items: List[InformationRequest]
    count: int


class TimelineEventList(BaseModel):
    submission_id: UUID
    items: List[TimelineEvent]
