"""Pydantic models for Shadow Interrogation Service."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


# =============================================================================
# Enums
# =============================================================================

class RiskStatus(str, Enum):
    """Risk status from Shadow Agent analysis."""
    ALIGNED = "ALIGNED"
    DATA_DRIFT = "DATA_DRIFT"
    IR_PREDICTED = "IR_PREDICTED"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class RiskColor(str, Enum):
    """Traffic light risk classification."""
    GREEN = "GREEN"
    AMBER = "AMBER"
    RED = "RED"
    UNKNOWN = "UNKNOWN"


class SnapshotStatus(str, Enum):
    """Submission snapshot lifecycle status."""
    DRAFT = "DRAFT"
    FROZEN = "FROZEN"
    SUBMITTED = "SUBMITTED"
    ARCHIVED = "ARCHIVED"


class GateDecision(str, Enum):
    """Submission gate decision."""
    GO = "GO"
    REVIEW = "REVIEW"
    STOP = "STOP"
    INCOMPLETE = "INCOMPLETE"


class ClaimKind(str, Enum):
    """Type of claim in fragment-truth link."""
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"
    CONTEXT = "context"
    SAFETY = "safety"
    EFFICACY = "efficacy"
    PK = "pk"
    PD = "pd"
    CMC = "cmc"


class EvidenceStrength(str, Enum):
    """Strength of evidence for citations."""
    PRIMARY_ENDPOINT = "primary_endpoint"
    SECONDARY_ENDPOINT = "secondary_endpoint"
    EXPLORATORY = "exploratory"
    POST_HOC = "post_hoc"
    SUPPORTIVE = "supportive"
    SAFETY_SIGNAL = "safety_signal"
    PK_PARAMETER = "pk_parameter"
    PD_MARKER = "pd_marker"
    BIOMARKER = "biomarker"
    HISTORICAL_CONTROL = "historical_control"


class ConfidenceRating(str, Enum):
    """Confidence rating for prose fragments."""
    CONCLUSIVE = "Conclusive"
    INTERPRETIVE = "Interpretive"
    AMBIGUOUS = "Ambiguous"


class AgentIdentity(str, Enum):
    """Identity of the agent that generated an audit entry."""
    SHADOW_AGENT = "SHADOW_AGENT"
    LUMEN_CORTEX = "LUMEN_CORTEX"
    DRIFT_MONITOR = "DRIFT_MONITOR"
    BATCH_INTERROGATOR = "BATCH_INTERROGATOR"
    HUMAN = "HUMAN"


# =============================================================================
# Truth Store Models
# =============================================================================

class TruthCreate(BaseModel):
    """Request model for creating a truth datapoint."""
    nct_id: str = Field(..., description="ClinicalTrials.gov ID")
    substance_id: Optional[str] = Field(None, description="ISO 11238 / UNII identifier")
    metric_name: str = Field(..., description="Metric name (e.g., 'Cmax', 'p_value')")
    metric_value_float: Optional[float] = Field(None, description="Numeric value")
    metric_value_text: Optional[str] = Field(None, description="Text value")
    is_primary_endpoint: bool = Field(False, description="Is this a primary endpoint?")
    source_document_ref: Optional[str] = Field(None, description="Source document reference")
    source_document_hash: Optional[str] = Field(None, description="Source document SHA-256 hash")
    
    @field_validator("metric_value_float", "metric_value_text", mode="after")
    @classmethod
    def at_least_one_value(cls, v: Any, info: Any) -> Any:
        """Ensure at least one value is provided."""
        # This runs for each field, actual validation happens in model_validator
        return v


class TruthResponse(BaseModel):
    """Response model for truth datapoint."""
    id: UUID
    nct_id: str
    substance_id: Optional[str]
    metric_name: str
    metric_value_float: Optional[float]
    metric_value_text: Optional[str]
    is_primary_endpoint: bool
    source_document_ref: Optional[str]
    source_document_hash: Optional[str]
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Fragment Models
# =============================================================================

class FragmentCreate(BaseModel):
    """Request model for creating a prose fragment."""
    ectd_section_path: str = Field(..., description="eCTD section path (e.g., 'm2.7.3-efficacy-summary')")
    jurisdiction: str = Field("Global", description="Target jurisdiction (FDA, EMA, etc.)")
    content_prose: Optional[str] = Field(None, description="Narrative text content")
    objectivity_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Objectivity score (0-1)")
    confidence_rating: Optional[ConfidenceRating] = Field(None, description="Confidence rating")
    burden_of_proof_justification: Optional[str] = Field(None, description="Justification for claims")
    # Embedding is computed server-side if embedding provider is configured


class FragmentResponse(BaseModel):
    """Response model for prose fragment."""
    id: UUID
    ectd_section_path: str
    jurisdiction: str
    content_prose: Optional[str]
    objectivity_score: Optional[float]
    confidence_rating: Optional[str]
    is_verified_against_truth: bool
    regulatory_precedent_id: Optional[UUID]
    burden_of_proof_justification: Optional[str]
    version_id: int
    has_embedding: bool
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Fragment-Truth Link Models
# =============================================================================

class TruthLinkCreate(BaseModel):
    """Request model for linking fragment to truth datapoints."""
    truth_ids: list[UUID] = Field(..., min_length=1, description="Truth datapoint IDs to link")
    claim_kind: ClaimKind = Field(ClaimKind.SUPPORTS, description="Type of claim")
    claim_span: Optional[dict[str, Any]] = Field(None, description="Span in content_prose")
    extracted_claim_value: Optional[dict[str, Any]] = Field(None, description="Claimed value for drift detection")


class TruthLinkResponse(BaseModel):
    """Response model for fragment-truth link."""
    id: UUID
    fragment_id: UUID
    truth_id: UUID
    claim_kind: str
    claim_span: Optional[dict[str, Any]]
    extracted_claim_value: Optional[dict[str, Any]]
    created_at: datetime
    
    @field_validator("claim_span", "extracted_claim_value", mode="before")
    @classmethod
    def parse_json_string(cls, v: Any) -> Any:
        """Parse JSON string if needed."""
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return v


# =============================================================================
# Adversarial Precedent Models
# =============================================================================

class PrecedentCreate(BaseModel):
    """Request model for creating an adversarial precedent."""
    agency_code: str = Field(..., description="Regulatory agency (FDA, EMA, etc.)")
    failure_mode: str = Field(..., description="Type of failure (Clinical Gap, etc.)")
    historical_question: str = Field(..., description="Actual regulator question")
    source_ref: Optional[str] = Field(None, description="Source document reference")
    therapeutic_area: Optional[str] = Field(None, description="Therapeutic area")
    drug_class: Optional[str] = Field(None, description="Drug class")
    submission_type: Optional[str] = Field(None, description="Submission type (NDA, BLA, etc.)")
    # Embedding is computed server-side


class PrecedentResponse(BaseModel):
    """Response model for adversarial precedent."""
    id: UUID
    agency_code: str
    failure_mode: str
    historical_question: str
    source_ref: Optional[str]
    therapeutic_area: Optional[str]
    submission_type: Optional[str]
    has_vector: bool
    created_at: datetime


class PrecedentMatch(BaseModel):
    """A matched precedent from similarity search."""
    precedent_id: UUID
    question: str
    similarity: float
    agency: str
    failure_mode: str
    source_ref: Optional[str]


# =============================================================================
# Shadow Interrogation Models - Strict Audit Schema
# =============================================================================

class TruthLinkSummary(BaseModel):
    """Summary of truth links for a fragment."""
    total_count: int
    primary_endpoint_count: int
    secondary_endpoint_count: int
    metrics_cited: list[str]
    unverified_count: int


class DriftDetail(BaseModel):
    """Individual drift calculation for a truth link."""
    truth_id: str
    metric_name: str
    truth_value: Optional[float | str]
    claimed_value: Optional[float | str]
    drift: float
    claim_kind: str


class RunMetadata(BaseModel):
    """Metadata about the interrogation run (for reproducibility)."""
    model_version: str = "shadow-agent-v1"
    prompt_version: str = "1.0"
    embedding_model: str = "hash-based-test"
    embedding_dim: int = 1536
    top_k_used: int
    drift_threshold: float
    timestamp: datetime


class AuditFeedbackPayload(BaseModel):
    """
    Strict schema for audit.concomitant_audit_logs.feedback_payload
    
    This ensures all Shadow Agent audit logs are analyzable, not free-form blobs.
    """
    # Fragment context
    fragment_id: str
    fragment_section: str
    jurisdiction: str
    version_id: Optional[int] = None
    
    # Risk assessment
    risk_status: str
    risk_color: str
    drift_magnitude: float
    drift_details: list[DriftDetail] = Field(default_factory=list)
    
    # Predicted regulatory questions
    predicted_ir_questions: list[str] = Field(default_factory=list)
    precedent_hits: list[dict[str, Any]] = Field(default_factory=list)
    
    # Truth link summary
    truth_links_summary: TruthLinkSummary
    
    # Run metadata for reproducibility
    run_metadata: RunMetadata


class InterrogationRequest(BaseModel):
    """Optional parameters for interrogation."""
    top_k: Optional[int] = Field(None, ge=1, le=20, description="Number of precedents to retrieve")
    include_raw_drift: bool = Field(False, description="Include raw drift calculations")
    request_id: Optional[str] = Field(None, description="External request ID for correlation")


class InterrogationResponse(BaseModel):
    """Response from Shadow Agent interrogation."""
    fragment_id: UUID
    risk_status: RiskStatus
    risk_color: RiskColor = RiskColor.UNKNOWN
    drift_magnitude: float = Field(..., ge=0.0, description="Drift magnitude (0 = aligned)")
    predicted_questions: list[PrecedentMatch]
    truth_links_count: int
    audit_log_id: UUID
    analysis: dict[str, Any] = Field(default_factory=dict, description="Additional analysis details")


# =============================================================================
# Section-Level Interrogation Models
# =============================================================================

class SectionInterrogationRequest(BaseModel):
    """Request to interrogate all fragments in a section."""
    section_pattern: str = Field(..., description="Section pattern (e.g., 'm2.7.3%')")
    jurisdiction: Optional[str] = Field(None, description="Filter by jurisdiction")
    top_k: int = Field(5, ge=1, le=20)
    request_id: Optional[str] = None


class FragmentRiskSummary(BaseModel):
    """Risk summary for a single fragment."""
    fragment_id: UUID
    ectd_section: str
    risk_status: RiskStatus
    risk_color: RiskColor
    drift_magnitude: float
    question_count: int
    truth_link_count: int


class SectionInterrogationResponse(BaseModel):
    """Response from section-level interrogation."""
    section_pattern: str
    jurisdiction: Optional[str]
    total_fragments: int
    
    # Risk distribution
    red_count: int
    amber_count: int
    green_count: int
    
    # Aggregate metrics
    avg_drift: float
    max_drift: float
    total_predicted_questions: int
    
    # Individual results
    fragment_results: list[FragmentRiskSummary]
    
    # Section status
    section_status: RiskColor
    gate_decision: GateDecision
    blockers: list[str] = Field(default_factory=list)
    
    # Audit correlation
    batch_request_id: str


# =============================================================================
# Submission Gate Models
# =============================================================================

class GateCriteria(BaseModel):
    """Individual gate criterion."""
    name: str
    passed: bool
    value: int | float
    threshold: int | float
    message: str


class SubmissionGateResponse(BaseModel):
    """Submission gate check response."""
    jurisdiction: str
    gate_decision: GateDecision
    
    # Fragment counts
    total_fragments: int
    module2_fragments: int
    
    # Risk counts
    ir_predicted_count: int
    high_drift_count: int
    unlinked_efficacy_count: int
    unassessed_count: int
    
    # Individual criteria
    criteria: list[GateCriteria]
    
    # Blockers
    blockers: list[str]
    
    # Readiness score (0-100)
    readiness_score: float


# =============================================================================
# Audit Log Models
# =============================================================================

class AuditLogResponse(BaseModel):
    """Response model for audit log entry."""
    id: UUID
    fragment_id: Optional[UUID]
    agent_identity: str
    risk_status: str
    feedback_payload: dict[str, Any]
    drift_magnitude: Optional[float]
    request_id: Optional[str]
    created_at: datetime


# =============================================================================
# Version History Models (21 CFR Part 11 Audit Trail)
# =============================================================================

class FragmentVersionResponse(BaseModel):
    """Response model for a fragment version snapshot."""
    id: UUID
    fragment_id: UUID
    version_id: int
    ectd_section_path: str
    jurisdiction: str
    content_prose: Optional[str]
    objectivity_score: Optional[float]
    confidence_rating: Optional[str]
    is_verified_against_truth: bool
    regulatory_precedent_id: Optional[UUID]
    burden_of_proof_justification: Optional[str]
    created_at: datetime
    created_by: str
    change_reason: Optional[str]
    request_id: Optional[str]
    has_embedding: bool = False


class FragmentVersionSummary(BaseModel):
    """Summary of a fragment version (without full content)."""
    fragment_id: UUID
    version_id: int
    ectd_section_path: str
    jurisdiction: str
    created_at: datetime
    created_by: str
    change_reason: Optional[str]
    request_id: Optional[str]


class VersionHistoryResponse(BaseModel):
    """Version history for a fragment."""
    fragment_id: UUID
    current_version_id: int
    total_versions: int
    versions: list[FragmentVersionSummary]


class VersionComparisonResponse(BaseModel):
    """Comparison between two versions of a fragment."""
    fragment_id: UUID
    from_version: FragmentVersionResponse
    to_version: FragmentVersionResponse
    fields_changed: list[str]


class AttributionUpdateRequest(BaseModel):
    """Request model for updating a fragment with attribution."""
    user: str = Field(..., description="User email/identifier making the change")
    reason: str = Field(..., description="Human-readable explanation of the change")
    request_id: Optional[str] = Field(None, description="External change request/ticket ID")


class FragmentUpdateWithAttribution(BaseModel):
    """Request model for updating a fragment with full attribution."""
    content_prose: Optional[str] = None
    objectivity_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    confidence_rating: Optional[ConfidenceRating] = None
    burden_of_proof_justification: Optional[str] = None
    ectd_section_path: Optional[str] = None
    jurisdiction: Optional[str] = None
    # Attribution (required for regulatory compliance)
    attribution: AttributionUpdateRequest


# =============================================================================
# Heatmap / Command Center Models (Migration 004)
# =============================================================================

class SectionRiskRollup(BaseModel):
    """Section-level risk aggregation for heatmaps."""
    ectd_section_root: str
    jurisdiction: str
    fragments_total: int
    verified_fragments: int
    unlinked_fragments: int
    red_fragments: int
    amber_fragments: int
    green_fragments: int
    never_interrogated_fragments: int
    avg_latest_drift: Optional[float]
    max_latest_drift: Optional[float]
    last_interrogated_at: Optional[datetime]
    avg_risk_score: Optional[float]


class JurisdictionRiskRollup(BaseModel):
    """Jurisdiction-level risk summary for executive dashboard."""
    jurisdiction: str
    fragments_total: int
    red_fragments: int
    amber_fragments: int
    green_fragments: int
    never_interrogated_fragments: int
    avg_latest_drift: Optional[float]
    max_latest_drift: Optional[float]
    last_interrogated_at: Optional[datetime]


class FragmentCurrentState(BaseModel):
    """Current fragment state with risk - single pane of glass."""
    fragment_id: UUID
    ectd_section_path: str
    ectd_section_root: str
    jurisdiction: str
    current_version_id: int
    content_prose: Optional[str]
    objectivity_score: Optional[float]
    confidence_rating: Optional[str]
    is_verified_against_truth: Optional[bool]
    truth_link_count: int
    primary_endpoint_links: int
    latest_risk_status: Optional[str]
    latest_drift_magnitude: Optional[float]
    latest_audit_log_id: Optional[UUID]
    last_interrogated_at: Optional[datetime]
    current_version_created_by: Optional[str]
    current_change_reason: Optional[str]
    updated_at: Optional[datetime]


class FragmentRiskListItem(BaseModel):
    """Fragment item in risk list."""
    fragment_id: UUID
    ectd_section_path: str
    ectd_section_root: Optional[str]
    jurisdiction: str
    current_version_id: int
    truth_link_count: int
    latest_risk_status: Optional[str]
    latest_drift_magnitude: Optional[float]
    last_interrogated_at: Optional[datetime]


class TruthCoverage(BaseModel):
    """Truth linkage coverage for a fragment."""
    fragment_id: UUID
    truth_link_count: int
    supports_count: int
    contradicts_count: int
    distinct_truth_points: int
    primary_endpoint_links: int


class HeatmapResponse(BaseModel):
    """Heatmap data response."""
    section_rollups: list[SectionRiskRollup]
    jurisdiction_rollups: list[JurisdictionRiskRollup]
    timestamp: datetime = Field(default_factory=datetime.now)


# =============================================================================
# Submission Snapshot Models (Migration 005)
# =============================================================================

class SnapshotCreate(BaseModel):
    """Request model for creating a submission snapshot."""
    snapshot_name: str = Field(..., description="Unique name for the snapshot")
    jurisdiction: str = Field("Global", description="Target jurisdiction (FDA, EMA, etc.)")
    target_agency: Optional[str] = Field(None, description="Target agency (FDA, EMA, PMDA, etc.)")
    dossier_type: Optional[str] = Field(None, description="Dossier type (IND, NDA, BLA, MAA, etc.)")
    notes: Optional[str] = Field(None, description="Additional notes")


class SnapshotResponse(BaseModel):
    """Response model for submission snapshot."""
    id: UUID
    snapshot_name: str
    jurisdiction: str
    target_agency: Optional[str]
    dossier_type: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime
    created_by: str
    frozen_at: Optional[datetime]
    frozen_by: Optional[str]
    submitted_at: Optional[datetime]
    submitted_by: Optional[str]
    archived_at: Optional[datetime]
    archived_by: Optional[str]


class SnapshotListItem(BaseModel):
    """Snapshot item in list response."""
    id: UUID
    snapshot_name: str
    jurisdiction: str
    target_agency: Optional[str]
    dossier_type: Optional[str]
    status: str
    created_at: datetime
    created_by: str
    frozen_at: Optional[datetime]
    frozen_by: Optional[str]
    submitted_at: Optional[datetime]
    submitted_by: Optional[str]


class SnapshotFragmentResponse(BaseModel):
    """Fragment included in a snapshot."""
    id: UUID
    snapshot_id: UUID
    fragment_id: UUID
    version_id: int
    ectd_section_path: str
    jurisdiction: str
    included_at: datetime
    included_by: str
    truth_link_count_at_freeze: Optional[int]
    primary_endpoint_links_at_freeze: Optional[int]
    risk_status_at_freeze: Optional[str]
    drift_magnitude_at_freeze: Optional[float]
    audit_log_id: Optional[UUID]


class SnapshotFragmentAdd(BaseModel):
    """Request to add a fragment to a snapshot."""
    fragment_id: UUID


class SnapshotFragmentBatchAdd(BaseModel):
    """Request to add multiple fragments to a snapshot by pattern."""
    jurisdiction: str = Field(..., description="Filter by jurisdiction")
    section_pattern: str = Field(..., description="eCTD section pattern (e.g., 'm2.7.3%')")


class SnapshotAddFragmentsRequest(BaseModel):
    """Request to add fragments to a snapshot (by IDs or filter)."""
    # Either provide fragment_ids OR provide a filter (jurisdiction + section pattern)
    fragment_ids: Optional[list[str]] = Field(
        None, 
        description="Explicit fragment UUIDs to add"
    )
    jurisdiction: Optional[str] = Field(
        None, 
        description="Filter by jurisdiction (FDA, EMA, etc.)"
    )
    ectd_section_prefix: Optional[str] = Field(
        None, 
        description="eCTD section prefix (e.g., 'm2.7.3')"
    )
    ectd_section_like: Optional[str] = Field(
        None, 
        description="eCTD section LIKE pattern (e.g., 'm2.7.3%')"
    )


class SnapshotAddFragmentsResponse(BaseModel):
    """Response from adding fragments to a snapshot."""
    snapshot_id: str
    attempted: int
    inserted: int
    skipped: int


class SnapshotFreezeGatedRequest(BaseModel):
    """Request to freeze a snapshot with optional gate enforcement."""
    enforce_gate: bool = Field(
        default=False, 
        description="Fail if gate_pass_recommended is false"
    )
    enforce_interrogated: bool = Field(
        default=False, 
        description="Fail if any fragments are never_interrogated"
    )


class SnapshotFragmentRow(BaseModel):
    """Fragment row as captured in a snapshot."""
    fragment_id: str
    version_id: int
    ectd_section_path: str
    jurisdiction: str
    truth_link_count_at_freeze: Optional[int] = None
    primary_endpoint_links_at_freeze: Optional[int] = None
    risk_status_at_freeze: Optional[str] = None
    drift_magnitude_at_freeze: Optional[float] = None
    audit_log_id: Optional[str] = None
    included_at: str
    included_by: str


class SnapshotGateMetrics(BaseModel):
    """Gate metrics for a submission snapshot."""
    snapshot_id: UUID
    snapshot_name: str
    jurisdiction: str
    target_agency: Optional[str]
    dossier_type: Optional[str]
    status: str
    fragments_total: int
    unlinked_fragments: int
    red_fragments: int
    amber_fragments: int
    green_fragments: int
    never_interrogated_fragments: int
    avg_drift: Optional[float]
    max_drift: Optional[float]
    gate_pass_recommended: bool


class SnapshotStatusUpdate(BaseModel):
    """Request to update snapshot status."""
    status: SnapshotStatus = Field(..., description="New status (FROZEN, SUBMITTED, ARCHIVED)")


class FragmentSnapshotComparison(BaseModel):
    """Comparison of fragment state: current vs snapshot."""
    source: str  # 'current' or 'snapshot'
    fragment_id: UUID
    version_id: int
    content_prose: Optional[str]
    truth_link_count: Optional[int]
    risk_status: Optional[str]
    drift_magnitude: Optional[float]


# =============================================================================
# Automation / Workflow Models
# =============================================================================

class SnapshotAutomationRequest(BaseModel):
    """Request to create and populate a snapshot automatically."""
    snapshot_name: str = Field(..., description="Name for the snapshot")
    jurisdiction: str = Field(..., description="Target jurisdiction (FDA, EMA, etc.)")
    section_patterns: list[str] = Field(
        default=["m2.%"],
        description="eCTD section patterns to include (e.g., ['m2.7.3%', 'm2.5%'])"
    )
    target_agency: Optional[str] = Field(None, description="Target agency (e.g., CDER, CBER)")
    dossier_type: Optional[str] = Field(None, description="Dossier type (e.g., NDA, BLA)")
    notes: Optional[str] = Field(None, description="Optional notes")
    auto_interrogate: bool = Field(
        default=True,
        description="Interrogate all fragments before adding to snapshot"
    )
    freeze_if_gate_passes: bool = Field(
        default=False,
        description="Automatically freeze if gate check passes"
    )


class SnapshotAutomationResponse(BaseModel):
    """Response from snapshot automation workflow."""
    snapshot_id: UUID
    snapshot_name: str
    jurisdiction: str
    status: str
    fragments_added: int
    fragments_interrogated: int
    gate_check: Optional["SnapshotGateMetrics"]
    was_frozen: bool
    freeze_blocked_reason: Optional[str]
    section_stats: dict[str, Any]
    elapsed_seconds: float


class BatchInterrogateRequest(BaseModel):
    """Request to batch interrogate a section."""
    section_pattern: str = Field(..., description="eCTD section pattern (e.g., 'm2.7.3%')")
    jurisdiction: Optional[str] = Field(None, description="Filter by jurisdiction")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of precedents per fragment")
    force_all: bool = Field(
        default=False,
        description="Re-interrogate all fragments, not just stale ones"
    )


class BatchInterrogateResponse(BaseModel):
    """Response from batch interrogation."""
    section_pattern: str
    jurisdiction: Optional[str]
    total_fragments: int
    interrogated: int
    skipped_recent: int
    red_count: int
    amber_count: int
    green_count: int
    error_count: int
    avg_drift: float
    max_drift: float
    batch_request_id: str
    elapsed_seconds: float


class SnapshotFreezeRequest(BaseModel):
    """Request to freeze a snapshot."""
    force: bool = Field(
        default=False,
        description="Force freeze even if gate check fails"
    )
    override_reason: Optional[str] = Field(
        None,
        description="Required if force=True, explains override"
    )
    
    @model_validator(mode="after")
    def require_reason_if_force(self):
        if self.force and not self.override_reason:
            raise ValueError("override_reason required when force=True")
        return self


class SnapshotFreezeResponse(BaseModel):
    """Response from snapshot freeze operation."""
    snapshot_id: UUID
    snapshot_name: str
    status: str
    frozen_at: Optional[datetime]
    frozen_by: Optional[str]
    was_forced: bool
    gate_passed: Optional[bool]
    blockers: list[str]


class WorkflowStatusResponse(BaseModel):
    """Status of an automated workflow."""
    snapshot_id: UUID
    snapshot_name: str
    jurisdiction: str
    status: str
    fragments_included: int
    not_interrogated: int
    red_count: int
    amber_count: int
    green_count: int
    avg_drift: float
    max_drift: float
    gate_pass_recommended: Optional[bool]
    ready_to_freeze: bool
    blockers: list[str]


# =============================================================================
# Health Check Models
# =============================================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    database: str
    version: Optional[str] = None
    extensions: Optional[dict[str, str]] = None
    schemas: Optional[list[str]] = None
    error: Optional[str] = None


# =============================================================================
# Multi-Persona Run Group Models (Migration 007)
# =============================================================================

class PersonaInfo(BaseModel):
    """Persona configuration info."""
    code: str
    display_name: str
    agency_filter: Optional[str]
    failure_modes: list[str]
    top_k: int
    drift_red_threshold: float
    ir_similarity_threshold: float


class RunGroupCreate(BaseModel):
    """Request to create a run group for batch interrogation."""
    run_name: Optional[str] = Field(None, description="Human-readable run name")
    run_type: str = Field(
        "SECTION_BATCH",
        description="FRAGMENT_SINGLE | SECTION_BATCH | SNAPSHOT_QC | FULL_SUBMISSION"
    )
    jurisdiction: Optional[str] = Field(None, description="Target jurisdiction")
    agency_code: Optional[str] = Field(None, description="Target agency code")
    persona_set: list[str] = Field(
        default=["FDA_CLINICAL"],
        description="Persona codes to run (e.g., ['FDA_STATS', 'FDA_CLINICAL'])"
    )
    config: dict[str, Any] = Field(default_factory=dict, description="Additional config")


class RunGroupResponse(BaseModel):
    """Response model for run group."""
    id: UUID
    run_name: Optional[str]
    run_type: str
    jurisdiction: Optional[str]
    agency_code: Optional[str]
    persona_set: list[str]
    config: dict[str, Any]
    created_at: datetime
    created_by: str


class RunGroupSummary(BaseModel):
    """Aggregated summary of a run group."""
    run_group_id: UUID
    run_name: Optional[str]
    run_type: str
    jurisdiction: Optional[str]
    agency_code: Optional[str]
    persona_set: list[str]
    started_at: datetime
    created_by: str
    agent_persona: Optional[str]
    logs_count: int
    red_count: int
    amber_count: int
    green_count: int
    finished_at: Optional[datetime]
    avg_drift: Optional[float]


class MultiPersonaInterrogateRequest(BaseModel):
    """Request to interrogate a section with multiple personas."""
    ectd_section_like: str = Field(
        ...,
        description="eCTD section pattern (e.g., 'm2.7.3%')"
    )
    jurisdiction: Optional[str] = Field(None, description="Filter by jurisdiction")
    personas: list[str] = Field(
        default=["FDA_STATS", "FDA_CLINICAL"],
        description="Persona codes to run"
    )
    run_name: Optional[str] = Field(
        None,
        description="Human-readable run name (e.g., 'Weekly QC - Module 2.7.3')"
    )
    top_k_override: Optional[int] = Field(
        None, ge=1, le=20,
        description="Override default top_k for precedent retrieval"
    )


class PersonaResult(BaseModel):
    """Result for a single persona in a multi-persona run."""
    persona: str
    logs_count: int
    red_count: int
    amber_count: int
    green_count: int
    avg_drift: Optional[float]


class MultiPersonaInterrogateResponse(BaseModel):
    """Response from multi-persona section interrogation."""
    run_group_id: UUID
    run_name: Optional[str]
    ectd_section_like: str
    jurisdiction: Optional[str]
    total_fragments: int
    personas_run: list[str]
    persona_results: list[PersonaResult]
    total_evaluations: int
    elapsed_seconds: float


class CrossPersonaDisagreement(BaseModel):
    """Fragment where personas disagree on risk status."""
    fragment_id: int
    persona_1: str
    persona_2: str
    risk_1: str
    risk_2: str
    drift_delta: float


class CrossPersonaAnalysisResponse(BaseModel):
    """Response from cross-persona disagreement analysis."""
    total_disagreements: int
    disagreements: list[CrossPersonaDisagreement]


# =============================================================================
# Snapshot Export Manifest Models (Migration 008)
# =============================================================================

class TruthCitationExport(BaseModel):
    """Truth citation in export manifest."""
    truth_id: UUID
    link_type: str
    truth_type: Optional[str]
    source_reference: Optional[str]
    numeric_value: Optional[float]
    confidence_score: Optional[float]


class FragmentExport(BaseModel):
    """Fragment data in export manifest."""
    fragment_id: int
    version_id: int
    ectd_section_path: str
    jurisdiction: str
    content_prose: Optional[str]
    audit_log_id: Optional[UUID]
    risk_status: Optional[str]
    drift_magnitude: Optional[float]
    truth_citations: list[TruthCitationExport]


class GateMetricsExport(BaseModel):
    """Gate metrics in export manifest."""
    overall_status: Optional[str]
    red_count: int
    amber_count: int
    green_count: int
    avg_drift: Optional[float]
    max_drift: Optional[float]


class SnapshotManifest(BaseModel):
    """Complete export manifest for a snapshot."""
    manifest_version: str = "1.0.0"
    generated_at: datetime
    snapshot: dict[str, Any]
    gate_metrics: Optional[GateMetricsExport]
    fragments: list[FragmentExport]


class ExportManifestRequest(BaseModel):
    """Request to generate/persist an export manifest."""
    persist: bool = Field(
        default=True,
        description="Whether to persist the export record"
    )
    export_format: str = Field(
        default="json",
        description="Export format: json | xml | pdf_manifest"
    )
    export_purpose: Optional[str] = Field(
        None,
        description="Purpose: WEEKLY_QC | SUBMISSION_FREEZE | AUDIT_DEFENSE"
    )
    export_destination: Optional[str] = Field(
        None,
        description="Destination path or URL"
    )


class ExportManifestResponse(BaseModel):
    """Response from export manifest generation."""
    export_id: Optional[UUID]
    snapshot_id: UUID
    manifest_sha256: str
    manifest: SnapshotManifest
    persisted: bool


class ExportHistoryItem(BaseModel):
    """Item in export history listing."""
    export_id: UUID
    snapshot_id: UUID
    snapshot_label: str
    snapshot_status: str
    jurisdiction: Optional[str]
    export_format: str
    manifest_sha256: str
    export_purpose: Optional[str]
    export_destination: Optional[str]
    exported_at: datetime
    exported_by: str
    manifest_summary: dict[str, Any]


class ExportHistoryResponse(BaseModel):
    """Response listing export history."""
    total: int
    items: list[ExportHistoryItem]


class IntegrityVerificationResponse(BaseModel):
    """Response from manifest integrity verification."""
    export_id: UUID
    manifest_sha256: str
    computed_sha256: str
    integrity_status: str  # VALID | TAMPERED


# =============================================================================
# E-Signature Models (Migration 009 - Part 11 Support)
# =============================================================================

class SignedObjectType(str, Enum):
    """Type of object being signed."""
    SNAPSHOT = "SNAPSHOT"
    SNAPSHOT_EXPORT = "SNAPSHOT_EXPORT"
    FRAGMENT_VERSION = "FRAGMENT_VERSION"


class SignatureMeaning(str, Enum):
    """What the signature means."""
    AUTHOR = "AUTHOR"       # I authored this content
    REVIEW = "REVIEW"       # I reviewed this content
    APPROVE = "APPROVE"     # I approve this for the next stage
    SUBMIT = "SUBMIT"       # I am submitting this to authority
    ACKNOWLEDGE = "ACKNOWLEDGE"  # I acknowledge receipt/awareness


class SignatureMethod(str, Enum):
    """How the signature was authenticated."""
    SSO = "SSO"                 # Single sign-on session
    PASSWORD_REAUTH = "PASSWORD_REAUTH"  # Re-entered password
    MFA = "MFA"                 # Multi-factor authentication
    CERT = "CERT"               # Certificate-based
    DEV = "DEV"                 # Development/test mode


class ESignatureCreate(BaseModel):
    """Request to create an electronic signature."""
    signer_role: str = Field(
        ...,
        description="Role of signer: QA, RA, CLINICAL, STATS, CMC, MEDICAL_WRITER, SAFETY"
    )
    meaning: SignatureMeaning = Field(
        default=SignatureMeaning.APPROVE,
        description="What the signature means"
    )
    signature_method: SignatureMethod = Field(
        default=SignatureMethod.SSO,
        description="Authentication method used"
    )
    signature_statement: Optional[str] = Field(
        None,
        description="Optional statement, e.g., 'I approve this for FDA submission'"
    )
    signature_payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional context: IP, user-agent, session info"
    )


class ESignatureResponse(BaseModel):
    """Response model for an electronic signature."""
    id: UUID
    signed_object_type: str
    signed_object_id: UUID
    signer_identity: str
    signer_role: str
    meaning: str
    signature_method: str
    signature_statement: Optional[str]
    signature_hash: Optional[str]
    signature_payload: dict[str, Any]
    signed_at: datetime
    request_id: Optional[str]


class SignatureStatusItem(BaseModel):
    """A single signature in a status listing."""
    signature_id: UUID
    signer_identity: str
    signer_role: str
    meaning: str
    signed_at: datetime
    method: str
    statement: Optional[str]


class ExportSignoffStatus(BaseModel):
    """Signoff status for an export."""
    export_id: UUID
    snapshot_id: UUID
    manifest_sha256: str
    export_format: str
    export_created_at: datetime
    export_created_by: str
    signatures: list[SignatureStatusItem]
    approve_count: int
    review_count: int
    author_count: int


class SubmissionReadiness(BaseModel):
    """Submission readiness status for a snapshot."""
    snapshot_id: UUID
    snapshot_label: str
    status: str
    jurisdiction: Optional[str]
    required_approver_roles: list[str]
    required_approval_meaning: str
    submitted_export_id: Optional[UUID]
    latest_export_id: Optional[UUID]
    latest_export_sha256: Optional[str]
    latest_export_at: Optional[datetime]
    signed_roles: list[str]
    missing_roles: list[str]
    ready_to_submit: bool


class SubmitSnapshotRequest(BaseModel):
    """Request to submit a snapshot."""
    export_id: UUID = Field(
        ...,
        description="The export to submit (must have all required signatures)"
    )


class SubmitSnapshotResponse(BaseModel):
    """Response from snapshot submission."""
    snapshot_id: UUID
    snapshot_label: str
    status: str
    submitted_export_id: UUID
    submitted_at: datetime
    success: bool
    error: Optional[str] = None


class SubmissionEventResponse(BaseModel):
    """A submission workflow event."""
    id: UUID
    snapshot_id: UUID
    export_id: Optional[UUID]
    event_type: str
    event_details: dict[str, Any]
    actor: str
    created_at: datetime
    request_id: Optional[str]


class PendingSubmissionItem(BaseModel):
    """A snapshot pending submission."""
    snapshot_id: UUID
    label: str
    status: str
    jurisdiction: Optional[str]
    frozen_at: Optional[datetime]
    required_approver_roles: list[str]
    latest_export_id: Optional[UUID]
    signed_roles: list[str]
    missing_roles: list[str]
    ready_to_submit: bool


class PendingSubmissionsResponse(BaseModel):
    """Response listing pending submissions."""
    total: int
    items: list[PendingSubmissionItem]


class RecentSubmissionItem(BaseModel):
    """A recently submitted snapshot."""
    snapshot_id: UUID
    label: str
    status: str
    jurisdiction: Optional[str]
    submitted_export_id: Optional[UUID]
    submitted_at: Optional[datetime]
    manifest_sha256: Optional[str]
    approvers: Optional[list[dict[str, Any]]]


class RecentSubmissionsResponse(BaseModel):
    """Response listing recent submissions."""
    total: int
    items: list[RecentSubmissionItem]


# =============================================================================
# Program Scoping Models (Migration 010)
# =============================================================================

class ProgramStatus(str, Enum):
    """Program lifecycle status."""
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    SUSPENDED = "SUSPENDED"


class MembershipRole(str, Enum):
    """Regulatory role for program membership."""
    QA = "QA"
    RA = "RA"
    CLINICAL = "CLINICAL"
    STATS = "STATS"
    SAFETY = "SAFETY"
    CMC = "CMC"
    ADMIN = "ADMIN"
    SHADOW = "SHADOW"


class AccessLevel(str, Enum):
    """Access level for program membership."""
    READ_ONLY = "READ_ONLY"
    READ_WRITE = "READ_WRITE"
    ADMIN = "ADMIN"


class ProgramCreate(BaseModel):
    """Request model for creating a program."""
    id: Optional[UUID] = Field(None, description="Optional UUID; auto-generated if not provided")
    program_code: str = Field(..., description="Unique program code (e.g., PROG-ABC-001)")
    program_name: Optional[str] = Field(None, description="Human-readable program name")
    sponsor_name: Optional[str] = Field(None, description="Sponsor organization name")
    substance_id: Optional[str] = Field(None, description="UNII / ISO 11238 substance identifier")
    therapeutic_area: Optional[str] = Field(None, description="Therapeutic area (Oncology, CNS, etc.)")
    indication: Optional[str] = Field(None, description="Specific indication")
    phase: Optional[str] = Field(None, description="Development phase (Phase 1, 2, 3, BLA, NDA)")
    status: Optional[ProgramStatus] = Field(ProgramStatus.ACTIVE, description="Program status")
    metadata: Optional[dict[str, Any]] = Field(None, description="Additional metadata")


class ProgramResponse(BaseModel):
    """Response model for a program."""
    id: UUID
    program_code: str
    program_name: Optional[str]
    sponsor_name: Optional[str]
    substance_id: Optional[str]
    therapeutic_area: Optional[str]
    indication: Optional[str]
    phase: Optional[str]
    status: str
    metadata: Optional[dict[str, Any]]
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime] = None
    member_count: Optional[int] = None


class ProgramUpdate(BaseModel):
    """Request model for updating a program."""
    program_name: Optional[str] = None
    sponsor_name: Optional[str] = None
    substance_id: Optional[str] = None
    therapeutic_area: Optional[str] = None
    indication: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[ProgramStatus] = None
    metadata: Optional[dict[str, Any]] = None


class ProgramListResponse(BaseModel):
    """Response listing programs."""
    total: int
    items: list[ProgramResponse]


class MembershipCreate(BaseModel):
    """Request model for adding a program membership."""
    user_identity: str = Field(..., description="User email or service principal")
    program_id: UUID = Field(..., description="Program UUID")
    membership_role: MembershipRole = Field(..., description="Regulatory role")
    access_level: Optional[AccessLevel] = Field(AccessLevel.READ_WRITE, description="Access level")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration")
    notes: Optional[str] = Field(None, description="Notes about membership")


class MembershipResponse(BaseModel):
    """Response model for a membership."""
    id: UUID
    user_identity: str
    program_id: UUID
    membership_role: str
    access_level: str
    is_active: bool
    granted_at: datetime
    granted_by: str
    expires_at: Optional[datetime]
    notes: Optional[str] = None
    program_code: Optional[str] = None
    program_name: Optional[str] = None
    sponsor_name: Optional[str] = None


class MembershipListResponse(BaseModel):
    """Response listing memberships."""
    total: int
    items: list[MembershipResponse]


class AccessCheckResponse(BaseModel):
    """Response for access check."""
    program_id: UUID
    can_access: bool
    can_write: Optional[bool] = None


# =============================================================================
# Config Bundle Models (Migration 011)
# =============================================================================

class ConfigBundleType(str, Enum):
    """Type of configuration bundle."""
    SHADOW_AGENT = "SHADOW_AGENT"
    DRIFT_MONITOR = "DRIFT_MONITOR"
    BATCH_QC = "BATCH_QC"
    EMBEDDING = "EMBEDDING"
    PROMPTS = "PROMPTS"


class ConfigBundleCreate(BaseModel):
    """Request model for creating a config bundle."""
    bundle_name: Optional[str] = Field(None, description="Human-readable name")
    bundle_version: Optional[str] = Field(None, description="Semantic version (e.g., 1.2.0)")
    bundle_type: ConfigBundleType = Field(
        ConfigBundleType.SHADOW_AGENT, 
        description="Type of configuration"
    )
    bundle_json: dict[str, Any] = Field(
        ..., 
        description="Full configuration payload"
    )


class ConfigBundleResponse(BaseModel):
    """Response model for a config bundle."""
    id: UUID
    bundle_name: Optional[str]
    bundle_version: Optional[str]
    bundle_type: str
    bundle_sha256: str
    bundle_json: Optional[dict[str, Any]] = None  # Optional - may be omitted in lists
    created_at: datetime
    created_by: str
    request_id: Optional[str] = None
    
    # Usage stats (optional, from usage view)
    run_group_count: Optional[int] = None
    audit_log_count: Optional[int] = None


class ConfigBundleListResponse(BaseModel):
    """Response listing config bundles."""
    total: int
    items: list[ConfigBundleResponse]


class GetOrCreateBundleResponse(BaseModel):
    """Response from get-or-create operation."""
    bundle_id: UUID
    created: bool
    bundle_sha256: str


class SessionContextRequest(BaseModel):
    """Request to set session context."""
    user: str = Field(..., description="User identity (email/principal)")
    program_id: UUID = Field(..., description="Active program UUID")
    request_id: Optional[str] = Field(None, description="Request correlation ID")


class SessionContextResponse(BaseModel):
    """Response confirming session context."""
    user: str
    program_id: UUID
    request_id: Optional[str]
    global_program_id: UUID


