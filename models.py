from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TruthCreate(BaseModel):
    nct_id: str = Field(..., description="ClinicalTrials.gov ID, e.g. NCT01234567")
    substance_id: str | None = Field(None, description="ISO 11238 / UNII")
    metric_name: str = Field(..., description="e.g., Cmax, p_value, AE_Rate")
    metric_value_float: float | None = None
    metric_value_text: str | None = None
    is_primary_endpoint: bool = False
    source_document_ref: str | None = None
    source_document_hash: str | None = None


class TruthCreated(BaseModel):
    id: str


class FragmentCreate(BaseModel):
    ectd_section_path: str
    jurisdiction: str = "Global"
    content_prose: str | None = None

    objectivity_score: float | None = Field(None, ge=0, le=1)
    confidence_rating: str | None = Field(None, description="Conclusive|Interpretive|Ambiguous")
    is_verified_against_truth: bool = False

    regulatory_precedent_id: str | None = None
    burden_of_proof_justification: str | None = None


class FragmentUpdate(BaseModel):
    ectd_section_path: str | None = None
    jurisdiction: str | None = None
    content_prose: str | None = None

    objectivity_score: float | None = Field(None, ge=0, le=1)
    confidence_rating: str | None = None
    is_verified_against_truth: bool | None = None

    regulatory_precedent_id: str | None = None
    burden_of_proof_justification: str | None = None


class FragmentCreated(BaseModel):
    id: str
    version_id: int


class TruthLinkCreate(BaseModel):
    truth_ids: list[str] = Field(..., min_length=1)
    claim_kind: str = "supports"
    claim_span: dict[str, Any] | None = None
    extracted_claim_value: dict[str, Any] | None = None


class TruthLinkResult(BaseModel):
    inserted_link_ids: list[str]
    skipped_existing: int


class PrecedentCreate(BaseModel):
    agency_code: str
    failure_mode: str
    historical_question: str
    source_ref: str | None = None


class PrecedentCreated(BaseModel):
    id: str


RiskStatus = Literal["DATA_DRIFT", "IR_PREDICTED", "ALIGNED"]


class InterrogateRequest(BaseModel):
    version_id: int | None = None
    top_k: int | None = Field(None, ge=1, le=50)
    agency_code: str | None = None
    include_debug: bool = False


class PrecedentHit(BaseModel):
    id: str
    agency_code: str
    failure_mode: str
    historical_question: str
    source_ref: str | None = None
    distance: float


class TruthLinkSummary(BaseModel):
    truth_id: str
    metric_name: str
    metric_value_float: float | None = None
    metric_value_text: str | None = None
    is_primary_endpoint: bool
    claim_kind: str
    extracted_claim_value: dict[str, Any] | None = None
    per_link_drift: float | None = None


class InterrogateResponse(BaseModel):
    audit_log_id: str
    fragment_id: str
    version_id: int
    risk_status: RiskStatus
    drift_magnitude: float | None = None

    predicted_questions: list[str]
    precedent_hits: list[PrecedentHit]

    truth_links: list[TruthLinkSummary]
    notes: list[str] = []
    debug: dict[str, Any] | None = None
