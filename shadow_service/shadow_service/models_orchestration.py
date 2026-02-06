"""Pydantic models for the Orchestration Kernel API."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# Workflow Templates (read-only from API)
# =============================================================================

class WorkflowTemplateSummary(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    version: int
    category: Optional[str] = None
    is_active: bool
    created_at: datetime


class StepTemplateSummary(BaseModel):
    id: UUID
    workflow_template_id: UUID
    code: str
    name: str
    step_type: str
    ordinal: int
    timeout_seconds: Optional[int] = None
    retry_policy: Optional[dict[str, Any]] = None
    config: Optional[dict[str, Any]] = None


class StepDependency(BaseModel):
    id: UUID
    step_id: UUID
    depends_on_step_id: UUID
    dependency_type: str = "finish_to_start"


class WorkflowTemplateDetail(WorkflowTemplateSummary):
    steps: list[StepTemplateSummary] = []
    dependencies: list[StepDependency] = []


# =============================================================================
# Workflow Runs
# =============================================================================

class StartWorkflowRequest(BaseModel):
    """POST /orchestration/runs/start"""
    program_id: UUID
    template_code: str = Field(..., description="Workflow template code (latest active version)")
    idempotency_key: Optional[str] = Field(None, description="Deduplicate duplicate starts")
    context: dict[str, Any] = Field(default_factory=dict, description="Initial context payload")
    priority: int = Field(default=0, description="Higher = more urgent")


class WorkflowRunResponse(BaseModel):
    id: UUID
    program_id: UUID
    workflow_template_id: UUID
    idempotency_key: Optional[str] = None
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_step_id: Optional[UUID] = None
    context: dict[str, Any] = {}
    error: Optional[str] = None
    priority: int = 0
    created_at: datetime
    updated_at: datetime
    created_by: str = "system"


class WorkflowRunList(BaseModel):
    runs: list[WorkflowRunResponse]
    total: int


class WorkflowRunDetail(WorkflowRunResponse):
    steps: list["StepRunResponse"] = []


# =============================================================================
# Step Runs
# =============================================================================

class StepRunResponse(BaseModel):
    id: UUID
    workflow_run_id: UUID
    step_template_id: UUID
    program_id: UUID
    step_code: Optional[str] = None
    step_name: Optional[str] = None
    step_type: Optional[str] = None
    status: str
    attempt: int = 1
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    input: dict[str, Any] = {}
    output: dict[str, Any] = {}
    error: Optional[str] = None
    batch_id: Optional[UUID] = None
    worker_id: Optional[str] = None
    locked_at: Optional[datetime] = None
    heartbeat_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ClaimStepRequest(BaseModel):
    """POST /orchestration/steps/{step_run_id}/claim"""
    worker_id: str = Field(..., description="Unique identifier for the claiming worker")


class CompleteStepRequest(BaseModel):
    """POST /orchestration/steps/{step_run_id}/complete"""
    output: dict[str, Any] = Field(default_factory=dict, description="Step output payload")


class FailStepRequest(BaseModel):
    """POST /orchestration/steps/{step_run_id}/fail"""
    error: str = Field(..., description="Error description")


class StepQueueItem(BaseModel):
    id: UUID
    workflow_run_id: UUID
    step_template_id: UUID
    program_id: UUID
    step_code: str
    step_name: str
    step_type: str
    status: str
    attempt: int = 1
    queued_at: Optional[datetime] = None


class StepQueueResponse(BaseModel):
    items: list[StepQueueItem]
    count: int


# =============================================================================
# Step Run Events
# =============================================================================

class StepRunEventResponse(BaseModel):
    id: UUID
    step_run_id: UUID
    program_id: UUID
    event_type: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    payload: dict[str, Any] = {}
    actor: str = "system"
    created_at: datetime


# Update forward references
WorkflowRunDetail.model_rebuild()
