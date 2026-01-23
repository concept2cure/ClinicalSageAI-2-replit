"""
Pydantic models for drift monitoring operations.
"""
from datetime import datetime, date
from typing import Optional, List, Any, Dict
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field


class JobType(str, Enum):
    SCHEDULED = "SCHEDULED"
    ON_DEMAND = "ON_DEMAND"
    TRIGGERED = "TRIGGERED"


class JobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AlertSeverity(str, Enum):
    RED = "RED"
    AMBER = "AMBER"
    GREEN = "GREEN"


class AlertStatus(str, Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


# --- Drift Jobs ---

class DriftJob(BaseModel):
    id: UUID
    job_number: int
    job_type: JobType
    job_name: str
    description: Optional[str] = None
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None
    section_filter: Optional[str] = None
    jurisdiction_filter: Optional[str] = None
    schedule_cron: Optional[str] = None
    next_run_at: Optional[datetime] = None
    drift_threshold_red: float
    drift_threshold_amber: float
    config_bundle_id: Optional[UUID] = None
    is_active: bool
    created_at: datetime
    created_by: str
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[JobStatus] = None


class DriftJobCreate(BaseModel):
    job_type: JobType = JobType.SCHEDULED
    job_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    program_id: Optional[UUID] = None
    section_filter: Optional[str] = None
    jurisdiction_filter: Optional[str] = None
    schedule_cron: Optional[str] = None
    next_run_at: Optional[datetime] = None
    drift_threshold_red: float = Field(0.35, ge=0.0, le=1.0)
    drift_threshold_amber: float = Field(0.20, ge=0.0, le=1.0)
    config_bundle_id: Optional[UUID] = None


class DriftJobStatusUpdate(BaseModel):
    last_run_status: JobStatus
    next_run_at: Optional[datetime] = None


# --- Drift Runs ---

class DriftRun(BaseModel):
    id: UUID
    job_id: UUID
    run_number: int
    status: JobStatus
    config_bundle_id: Optional[UUID] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    fragments_checked: int = 0
    red_count: int = 0
    amber_count: int = 0
    green_count: int = 0
    error_message: Optional[str] = None
    triggered_by: str


class DriftRunCreate(BaseModel):
    job_id: UUID
    config_bundle_id: Optional[UUID] = None


class DriftRunComplete(BaseModel):
    status: JobStatus
    fragments_checked: int = 0
    red_count: int = 0
    amber_count: int = 0
    green_count: int = 0
    error_message: Optional[str] = None


# --- Drift Alerts ---

class DriftAlert(BaseModel):
    id: UUID
    run_id: UUID
    fragment_id: UUID
    fragment_version_id: Optional[UUID] = None
    severity: AlertSeverity
    drift_score: float
    similarity_score: Optional[float] = None
    alert_title: str
    alert_message: Optional[str] = None
    affected_truth_ids: List[UUID] = []
    program_id: Optional[UUID] = None
    program_code: Optional[str] = None
    ectd_section_path: Optional[str] = None
    jurisdiction: Optional[str] = None
    status: AlertStatus
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    acknowledgment_notes: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime


class DriftAlertCreate(BaseModel):
    run_id: UUID
    fragment_id: UUID
    fragment_version_id: Optional[UUID] = None
    severity: AlertSeverity
    drift_score: float = Field(..., ge=0.0, le=1.0)
    similarity_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    alert_title: str = Field(..., min_length=1, max_length=300)
    alert_message: Optional[str] = None
    affected_truth_ids: List[UUID] = []
    program_id: Optional[UUID] = None


class AlertAcknowledge(BaseModel):
    acknowledgment_notes: Optional[str] = None


class AlertResolve(BaseModel):
    resolution_notes: str = Field(..., min_length=1, max_length=2000)


# --- Drift History / Trends ---

class DriftHistoryPoint(BaseModel):
    id: UUID
    run_id: UUID
    drift_score: float
    similarity_score: Optional[float] = None
    risk_color: str
    measured_at: datetime


class SectionDriftTrend(BaseModel):
    day: date
    avg_drift: float
    max_drift: float
    red_count: int


class AlertSummaryItem(BaseModel):
    severity: str
    count: int
    oldest: datetime


# --- List Response Models ---

class DriftJobList(BaseModel):
    items: List[DriftJob]
    count: int


class DriftRunList(BaseModel):
    items: List[DriftRun]
    count: int


class DriftAlertList(BaseModel):
    items: List[DriftAlert]
    count: int


class AlertSummary(BaseModel):
    items: List[AlertSummaryItem]
    total_open: int


class DriftHistoryList(BaseModel):
    fragment_id: UUID
    items: List[DriftHistoryPoint]


class SectionTrendList(BaseModel):
    section_path: str
    items: List[SectionDriftTrend]
