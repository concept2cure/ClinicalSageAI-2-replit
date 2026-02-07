"""Pydantic models for Phase 6.6 — Predicate Intelligence.

Defines request/response schemas for:
  - Predicate candidates (with toxicity scoring)
  - SE Matrix rows (with evidence-linked cells)
  - Defense previews (Shadow 510(k) Reviewer output)
  - Evidence cells (smart rendering primitives)
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# Enums
# ═══════════════════════════════════════════════════════════════════════════════

class CandidateStatus(str, Enum):
    ACTIVE = "active"
    DISMISSED = "dismissed"
    SELECTED = "selected"
    ARCHIVED = "archived"


class RouteType(str, Enum):
    CONSERVATIVE = "conservative"
    AGGRESSIVE = "aggressive"
    BALANCED = "balanced"


class EquivalenceStatus(str, Enum):
    EQUIVALENT = "EQUIVALENT"
    DISCUSSION_REQUIRED = "DISCUSSION_REQUIRED"
    NOT_EQUIVALENT = "NOT_EQUIVALENT"
    TOXIC = "TOXIC"
    PENDING = "PENDING"


class DiffSeverity(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SECategory(str, Enum):
    INTENDED_USE = "intended_use"
    TECHNOLOGY = "technology"
    MATERIAL = "material"
    PERFORMANCE = "performance"
    DESIGN = "design"
    SOFTWARE = "software"
    ENERGY = "energy"
    BIOCOMPATIBILITY = "biocompatibility"
    GENERAL = "general"


class EnforcementEventType(str, Enum):
    CLASS_I_RECALL = "class_i_recall"
    CLASS_II_RECALL = "class_ii_recall"
    CLASS_III_RECALL = "class_iii_recall"
    SAFETY_COMMUNICATION = "safety_communication"
    WARNING_LETTER = "warning_letter"
    OBSERVATION_483 = "483_observation"
    MDR_REPORT = "mdr_report"
    FIELD_CORRECTION = "field_correction"


class QuestionSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence Cell — the smart rendering primitive
# ═══════════════════════════════════════════════════════════════════════════════

class EvidenceCell(BaseModel):
    """A typed cell that links a display value to evidence sources + confidence."""
    value: str
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    cell_hash: str = ""

    class Config:
        json_schema_extra = {
            "example": {
                "value": "Titanium alloy (Ti-6Al-4V)",
                "evidence_ids": ["DC-001", "MAT-003"],
                "confidence": 0.95,
                "cell_hash": "a3f2b7...",
            }
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Predicate Candidate
# ═══════════════════════════════════════════════════════════════════════════════

class PredicateCandidate(BaseModel):
    id: UUID
    program_id: UUID
    k_number: str
    device_name: str
    manufacturer: Optional[str] = None
    clearance_date: Optional[date] = None
    product_code: Optional[str] = None
    regulation_number: Optional[str] = None
    similarity_score: float = 0.0
    toxicity_score: float = 0.0
    has_class_i_recall: bool = False
    has_class_ii_recall: bool = False
    has_safety_comm: bool = False
    mdr_event_count: int = 0
    golden_bridge_path: list[dict[str, Any]] = Field(default_factory=list)
    route_type: Optional[RouteType] = None
    recommended: bool = False
    evidence_links: list[str] = Field(default_factory=list)
    selection_rationale: Optional[str] = None
    status: CandidateStatus = CandidateStatus.ACTIVE
    created_at: datetime
    updated_at: datetime


class PredicateCandidateCreate(BaseModel):
    """Request body for adding a predicate candidate."""
    k_number: str
    device_name: str
    manufacturer: Optional[str] = None
    clearance_date: Optional[date] = None
    product_code: Optional[str] = None
    regulation_number: Optional[str] = None
    similarity_score: float = 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# FDA Enforcement
# ═══════════════════════════════════════════════════════════════════════════════

class FDAEnforcementEvent(BaseModel):
    id: UUID
    k_number: Optional[str] = None
    recall_number: Optional[str] = None
    product_code: Optional[str] = None
    event_type: EnforcementEventType
    event_date: Optional[date] = None
    classification: Optional[str] = None
    reason: Optional[str] = None
    source_url: Optional[str] = None
    raw_data: dict[str, Any] = Field(default_factory=dict)
    fetched_at: datetime


# ═══════════════════════════════════════════════════════════════════════════════
# SE Matrix Row
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixRow(BaseModel):
    id: UUID
    program_id: UUID
    candidate_id: Optional[UUID] = None
    sort_order: int = 0
    characteristic: str
    category: SECategory = SECategory.GENERAL
    subject_value: str
    subject_evidence_ids: list[str] = Field(default_factory=list)
    subject_confidence: float = 0.0
    predicate_value: str
    predicate_evidence_ids: list[str] = Field(default_factory=list)
    predicate_confidence: float = 0.0
    equivalence_status: EquivalenceStatus = EquivalenceStatus.PENDING
    diff_explanation: Optional[str] = None
    diff_severity: DiffSeverity = DiffSeverity.NONE
    created_at: datetime
    updated_at: datetime


class SEMatrixRowCreate(BaseModel):
    """Request body for adding an SE matrix row."""
    candidate_id: UUID
    sort_order: int = 0
    characteristic: str
    category: SECategory = SECategory.GENERAL
    subject_value: str
    subject_evidence_ids: list[str] = Field(default_factory=list)
    subject_confidence: float = 0.0
    predicate_value: str
    predicate_evidence_ids: list[str] = Field(default_factory=list)
    predicate_confidence: float = 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# Anticipated FDA Question (sub-model for defense preview)
# ═══════════════════════════════════════════════════════════════════════════════

class AnticipatedQuestion(BaseModel):
    question: str
    citation: str = ""
    severity: QuestionSeverity = QuestionSeverity.MEDIUM
    category: SECategory = SECategory.GENERAL
    suggested_response: Optional[str] = None
    suggested_evidences: list[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# Defense Preview — Shadow 510(k) Reviewer output
# ═══════════════════════════════════════════════════════════════════════════════

class DefensePreview(BaseModel):
    id: UUID
    program_id: UUID
    candidate_id: Optional[UUID] = None
    readiness_score: float = Field(default=0.0, ge=0.0, le=100.0)
    anticipated_questions: list[AnticipatedQuestion] = Field(default_factory=list)
    internal_contradictions: list[dict[str, Any]] = Field(default_factory=list)
    evidence_gaps: list[dict[str, Any]] = Field(default_factory=list)
    toxic_warnings: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: datetime


# ═══════════════════════════════════════════════════════════════════════════════
# Aggregate Responses
# ═══════════════════════════════════════════════════════════════════════════════

class PredicateSearchResult(BaseModel):
    """Full predicate intelligence response."""
    conservative_route: list[PredicateCandidate] = Field(default_factory=list)
    aggressive_route: list[PredicateCandidate] = Field(default_factory=list)
    all_candidates: list[PredicateCandidate] = Field(default_factory=list)
    toxic_count: int = 0
    safe_count: int = 0
    risk_analysis: str = ""


class Generate510kPreviewResponse(BaseModel):
    """Response from POST /generate-510k-preview."""
    docx_url: Optional[str] = None
    defense_analysis: DefensePreview
    readiness_score: float = 0.0
    toxic_warnings: list[dict[str, Any]] = Field(default_factory=list)
    se_matrix: list[SEMatrixRow] = Field(default_factory=list)


class PredicateRadarPoint(BaseModel):
    """Single point for the Predicate Radar scatter plot UI."""
    k_number: str
    device_name: str
    similarity: float
    toxicity: float
    recommended: bool = False
    route_type: Optional[RouteType] = None
    has_recall: bool = False
