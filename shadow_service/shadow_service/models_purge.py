"""
Pydantic models for purge workflow and governance operations.
"""
from datetime import datetime
from typing import Optional, List, Any, Dict
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field


class PurgeRequestStatus(str, Enum):
    REQUESTED = "REQUESTED"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SCHEDULED = "SCHEDULED"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class PurgeActionType(str, Enum):
    ARCHIVE = "ARCHIVE"           # Soft archive: status change, data preserved
    TOMBSTONE = "TOMBSTONE"       # Cryptographic tombstone: hash preserved, content redacted
    FULL_PURGE = "FULL_PURGE"     # Full deletion (only for non-regulated data)


class PurgeObjectType(str, Enum):
    SNAPSHOT = "SNAPSHOT"
    SNAPSHOT_EXPORT = "SNAPSHOT_EXPORT"
    FRAGMENT = "FRAGMENT"
    TRUTH_DATAPOINT = "TRUTH_DATAPOINT"
    PRECEDENT = "PRECEDENT"
    AUDIT_LOG_BUNDLE = "AUDIT_LOG_BUNDLE"
    CONFIG_BUNDLE = "CONFIG_BUNDLE"


class ApproverRole(str, Enum):
    QA = "QA"
    LEGAL = "LEGAL"
    SECURITY = "SECURITY"
    DATA_OWNER = "DATA_OWNER"
    ADMIN = "ADMIN"


class ApprovalDecision(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"


# =============================================================================
# Purge Request Models
# =============================================================================

class PurgeRequest(BaseModel):
    """Full purge request record."""
    id: UUID
    request_number: int
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None
    object_type: PurgeObjectType
    object_id: UUID
    object_label: Optional[str] = None
    requested_action: PurgeActionType
    reason: str
    requested_by: str
    requested_at: datetime
    status: PurgeRequestStatus
    retention_until_at_request: Optional[datetime] = None
    legal_hold_state_at_request: Optional[bool] = None
    required_approvals: List[str]
    execution_plan: Dict[str, Any] = Field(default_factory=dict)
    scheduled_execution_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    executed_by: Optional[str] = None
    execution_result: Optional[Dict[str, Any]] = None
    tombstone_id: Optional[UUID] = None
    content_hash_preserved: Optional[str] = None
    failure_reason: Optional[str] = None
    retry_count: int = 0
    request_id: Optional[str] = None
    created_at: datetime


class PurgeRequestCreate(BaseModel):
    """Create a new purge request."""
    program_id: Optional[UUID] = None
    object_type: PurgeObjectType
    object_id: UUID
    object_label: Optional[str] = None
    requested_action: PurgeActionType
    reason: str = Field(..., min_length=10, max_length=2000)
    required_approvals: List[ApproverRole] = Field(
        default=[ApproverRole.QA, ApproverRole.LEGAL],
        description="Roles required to approve this request"
    )
    scheduled_execution_at: Optional[datetime] = None


class PurgeRequestSummary(BaseModel):
    """Summary view of a purge request."""
    id: UUID
    request_number: int
    program_code: Optional[str] = None
    object_type: PurgeObjectType
    object_id: UUID
    object_label: Optional[str] = None
    requested_action: PurgeActionType
    status: PurgeRequestStatus
    requested_by: str
    requested_at: datetime
    approval_count: int = 0
    rejection_count: int = 0
    required_count: int = 0


# =============================================================================
# Approval Models
# =============================================================================

class PurgeApproval(BaseModel):
    """Full approval record."""
    id: UUID
    purge_request_id: UUID
    approver_role: ApproverRole
    approver_identity: str
    approver_email: Optional[str] = None
    decision: ApprovalDecision
    decision_reason: Optional[str] = None
    decided_at: datetime
    request_id: Optional[str] = None


class PurgeApprovalCreate(BaseModel):
    """Submit an approval decision."""
    approver_role: ApproverRole
    decision: ApprovalDecision
    decision_reason: Optional[str] = Field(None, max_length=1000)


class ApprovalStatus(BaseModel):
    """Status of a single approval requirement."""
    required_role: str
    status: str  # PENDING, APPROVE, REJECT
    approver: Optional[str] = None
    decided_at: Optional[datetime] = None


# =============================================================================
# Tombstone Models
# =============================================================================

class Tombstone(BaseModel):
    """Cryptographic tombstone record."""
    id: UUID
    purge_request_id: UUID
    original_schema: str
    original_table: str
    original_id: UUID
    content_hash: str
    metadata_hash: str
    record_existed_from: datetime
    record_existed_to: datetime
    tombstoned_at: datetime
    tombstoned_by: str
    tombstone_reason: str
    related_tombstone_ids: Optional[List[UUID]] = None
    request_id: Optional[str] = None


# =============================================================================
# Execution Models
# =============================================================================

class ExecutionCheck(BaseModel):
    """Result of execution eligibility check."""
    can_execute: bool
    reason: str


class ExecutionRequest(BaseModel):
    """Request to execute a purge."""
    force: bool = Field(
        default=False,
        description="Force execution even if warnings (requires ADMIN role)"
    )
    execution_notes: Optional[str] = None


class ExecutionResult(BaseModel):
    """Result of purge execution."""
    success: bool
    request_id: UUID
    action_taken: PurgeActionType
    tombstone_id: Optional[UUID] = None
    content_hash: Optional[str] = None
    execution_time_ms: int
    details: Dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# List Response Models
# =============================================================================

class PurgeRequestList(BaseModel):
    """List of purge requests."""
    items: List[PurgeRequestSummary]
    count: int
    total: int


class PurgeApprovalList(BaseModel):
    """List of approvals for a request."""
    items: List[PurgeApproval]
    count: int


class ApprovalStatusList(BaseModel):
    """Approval status summary for a request."""
    request_id: UUID
    statuses: List[ApprovalStatus]
    all_approved: bool
    has_rejection: bool


# =============================================================================
# Audit Trail Models
# =============================================================================

class PurgeAuditEntry(BaseModel):
    """Audit trail entry for a purge request."""
    request_id: UUID
    request_number: int
    object_type: PurgeObjectType
    object_id: UUID
    object_label: Optional[str] = None
    requested_action: PurgeActionType
    reason: str
    status: PurgeRequestStatus
    requested_by: str
    requested_at: datetime
    executed_at: Optional[datetime] = None
    executed_by: Optional[str] = None
    tombstone_hash: Optional[str] = None
    tombstoned_at: Optional[datetime] = None
    approval_chain: Optional[List[Dict[str, Any]]] = None


class PurgeAuditTrail(BaseModel):
    """Full audit trail response."""
    items: List[PurgeAuditEntry]
    count: int
    date_range_start: Optional[datetime] = None
    date_range_end: Optional[datetime] = None


# =============================================================================
# Dashboard / Summary Models  
# =============================================================================

class PurgeWorkflowStats(BaseModel):
    """Statistics for purge workflow dashboard."""
    total_requests: int
    pending_approval: int
    approved_awaiting_execution: int
    completed: int
    rejected: int
    failed: int
    avg_approval_time_hours: Optional[float] = None
    oldest_pending_days: Optional[int] = None
