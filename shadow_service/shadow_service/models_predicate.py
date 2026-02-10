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
    MATERIALS = "materials"
    PERFORMANCE = "performance"
    DESIGN = "design"
    SOFTWARE = "software"
    ENERGY = "energy"
    ENERGY_SOURCE = "energy_source"
    BIOCOMPATIBILITY = "biocompatibility"
    STERILIZATION = "sterilization"
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


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.B — Predicate Suggestion Engine (v1)
# ═══════════════════════════════════════════════════════════════════════════════

class StrategyRecommendation(str, Enum):
    CONSERVATIVE = "CONSERVATIVE"
    BALANCED = "BALANCED"
    AGGRESSIVE = "AGGRESSIVE"
    AVOID = "AVOID"


class PredicateFlag(str, Enum):
    OLD_PREDICATE = "OLD_PREDICATE"           # age > 8 years
    LOW_TEXT_MATCH = "LOW_TEXT_MATCH"          # fts rank below threshold
    MISSING_SUMMARY_TEXT = "MISSING_SUMMARY_TEXT"  # txt_content is null
    VERY_NEW = "VERY_NEW"                     # cleared < 6 months ago


class ObjectionTrigger(str, Enum):
    """Typed triggers for anticipated reviewer objections."""
    INTENDED_USE_DRIFT = "INTENDED_USE_DRIFT"
    MATERIAL_CHANGE = "MATERIAL_CHANGE"
    ENERGY_SOURCE_CHANGE = "ENERGY_SOURCE_CHANGE"
    STERILIZATION_CHANGE = "STERILIZATION_CHANGE"
    SOFTWARE_CYBER_GAP = "SOFTWARE_CYBER_GAP"
    TISSUE_CONTACT_DRIFT = "TISSUE_CONTACT_DRIFT"
    DURATION_MISMATCH = "DURATION_MISMATCH"
    OLD_PREDICATE_GAP = "OLD_PREDICATE_GAP"
    MISSING_SUMMARY = "MISSING_SUMMARY"


class EvidenceType(str, Enum):
    """Suggested evidence types for objection resolution."""
    BENCH = "bench"
    BIOCOMP = "biocomp"
    CLINICAL = "clinical"
    SW_LIFECYCLE = "sw_lifecycle"
    CYBERSECURITY = "cybersecurity"
    STERILIZATION_VALIDATION = "sterilization_validation"
    RISK_ANALYSIS = "risk_analysis"
    PERFORMANCE_DATA = "performance_data"


class AnticipatedObjection(BaseModel):
    """A structured reviewer objection with actionable fix."""
    question: str
    severity: str = Field(description="High / Med / Low")
    trigger: ObjectionTrigger
    recommended_fix: str = Field(description="One-liner actionable fix")
    suggested_evidence_types: list[str] = Field(default_factory=list)


class MatchSnippet(BaseModel):
    """A short excerpt from predicate text that matched the subject."""
    text: str = Field(description="Short excerpt (≤200 chars)")
    source: str = Field("txt_content", description="Field the snippet came from")


class PredicateSuggestRequest(BaseModel):
    """Input for POST /predicate/suggest — the subject device to find predicates for.

    Required: product_code, device_name, intended_use, technology_description.
    Strongly recommended: materials, energy_source, tissue_contact, duration, software_present.
    """
    program_id: str
    # ── Required (B0) ──
    product_code: str
    device_name: str
    intended_use: str
    technology_description: str
    # ── Strongly recommended (B0) ──
    materials: Optional[list[str]] = None
    energy_source: Optional[str] = None
    tissue_contact: Optional[str] = None  # none / intact_skin / breached / blood / implant
    duration: Optional[str] = None        # transient / short / long (ISO 10993 buckets)
    software_present: Optional[bool] = None
    # ── Legacy compat ──
    device_description: Optional[str] = None  # fallback if technology_description empty
    software_flag: Optional[bool] = None      # alias for software_present


class ScoreBreakdown(BaseModel):
    """Transparent scoring weights — trust builder for regulatory teams."""
    fts_score: float = Field(0.0, description="Postgres full-text rank (0–1)")
    name_match: float = Field(0.0, description="Device name token overlap (0–1)")
    recency_boost: float = Field(0.0, description="Recency bonus (0–1)")
    completeness_bonus: float = Field(0.0, description="Has summary text + URL (0–1)")
    weights: dict[str, float] = Field(
        default_factory=lambda: {
            "fts": 0.65, "name": 0.20, "recency": 0.10, "completeness": 0.05,
        }
    )


class PredicateSuggestion(BaseModel):
    """A single predicate suggestion with full Shadow Reviewer Scorecard."""
    k_number: str
    device_name: str
    applicant: Optional[str] = None
    product_code: str
    decision_date: Optional[date] = None
    summary_url: Optional[str] = None
    # ── Scoring (B2) ──
    similarity_score: float = Field(ge=0.0, le=1.0)
    defense_readiness_score: float = Field(
        0.0, ge=0.0, le=100.0,
        description="DRS: evidence completeness metric (0–100)",
    )
    strategy_recommendation: StrategyRecommendation
    risk_flags: list[PredicateFlag] = Field(default_factory=list)
    reasoning: str
    score_breakdown: ScoreBreakdown
    # ── Match evidence (B1) ──
    matched_terms: list[str] = Field(default_factory=list)
    match_snippets: list[MatchSnippet] = Field(
        default_factory=list,
        description="Top 3 short excerpts from predicate text",
    )
    # ── Objections (B3) ──
    anticipated_objections: list[AnticipatedObjection] = Field(
        default_factory=list,
        description="Predicted reviewer objections with fixes",
    )
    # ── Legacy compat ──
    recency_years: Optional[float] = None
    flags: list[PredicateFlag] = Field(default_factory=list)
    reviewer_heat: int = Field(0, ge=0, le=100, description="Triage signal 0-100")
    next_evidence: list[str] = Field(
        default_factory=list,
        description="Rule-based hints for evidence to gather",
    )


class PredicateSuggestResponse(BaseModel):
    """Response from POST /predicate/suggest — top 5 predicates with full scorecards."""
    suggestions: list[PredicateSuggestion]
    generated_at: datetime
    subject_hash: str = Field(description="SHA-256 of normalized input for dedup/caching")
    product_code: str
    total_candidates_scanned: int = 0
    weights_version: str = Field("v2.0", description="Scoring algorithm version")
    cached: bool = Field(False, description="True if served from cache")
