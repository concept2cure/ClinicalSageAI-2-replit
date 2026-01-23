"""Shadow Interrogation Service - Core engine.

This module implements the Shadow Interrogation Loop:
1. Load fragment (current version)
2. Load linked truth datapoints
3. Compute drift between claims and truth
4. Retrieve similar regulatory precedents via pgvector
5. Determine risk status
6. Write append-only audit log
7. Return structured feedback payload

All operations are designed for 21 CFR Part 11 compliance:
- Immutable audit trail
- Full attribution via session settings
- Deterministic, reproducible drift computation
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import asyncpg

from ..config import get_settings


# =============================================================================
# SQL Queries (localized for this service)
# =============================================================================

SQL_GET_FRAGMENT_CURRENT = """
SELECT 
    fc.fragment_id,
    fc.ectd_section_path,
    fc.ectd_section_root,
    fc.jurisdiction,
    fc.current_version_id,
    fc.content_prose,
    fc.embedding,
    fc.objectivity_score,
    fc.confidence_rating,
    fc.is_verified_against_truth,
    fc.truth_link_count,
    fc.primary_endpoint_links,
    fc.latest_risk_status,
    fc.latest_drift_magnitude,
    fc.last_interrogated_at
FROM prose.v_fragment_current fc
WHERE fc.fragment_id = $1
"""

SQL_GET_TRUTH_LINKS_WITH_METRICS = """
SELECT
    ftl.id AS link_id,
    ftl.claim_kind,
    ftl.claim_span,
    ftl.extracted_claim_value,
    ct.id AS truth_id,
    ct.nct_id,
    ct.substance_id,
    ct.metric_name,
    ct.metric_value_float,
    ct.metric_value_text,
    ct.is_primary_endpoint,
    ct.source_document_ref,
    ct.source_document_hash
FROM prose.fragment_truth_links ftl
JOIN truth.clinical_truth_store ct ON ct.id = ftl.truth_id
WHERE ftl.fragment_id = $1
"""

SQL_RETRIEVE_PRECEDENTS = """
SELECT
    id,
    agency_code,
    failure_mode,
    historical_question,
    source_ref,
    therapeutic_area,
    submission_type,
    (1 - (precedent_vector <=> $1::vector)) AS similarity
FROM adversarial.regulatory_adversarial_precedents
WHERE precedent_vector IS NOT NULL
  AND ($2::text IS NULL OR agency_code = $2)
ORDER BY precedent_vector <=> $1::vector
LIMIT $3
"""

SQL_INSERT_AUDIT_LOG = """
INSERT INTO audit.concomitant_audit_logs (
    fragment_id,
    agent_identity,
    risk_status,
    feedback_payload,
    drift_magnitude,
    request_id,
    interrogated_version_id
)
VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
RETURNING id, created_at
"""


# =============================================================================
# Drift Computation
# =============================================================================

def _clamp01(x: float) -> float:
    """Clamp value to [0, 1] range."""
    return max(0.0, min(1.0, x))


def _compute_link_drift(
    extracted: Optional[Dict[str, Any]], 
    truth_row: Dict[str, Any]
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute drift between extracted claim value and truth datapoint.
    
    Drift computation methods:
    - Numeric: relative error |claimed - truth| / |truth|
    - Text: exact match (0.0) or mismatch (0.35)
    - Missing extraction: baseline 0.05 (linked but unverified)
    - Missing truth link: high baseline 0.40
    
    Args:
        extracted: Extracted claim value from prose (may be None)
        truth_row: Truth datapoint record
    
    Returns:
        Tuple of (drift_magnitude, details_dict)
    """
    details: Dict[str, Any] = {
        "truth_id": str(truth_row.get("truth_id")),
        "metric_name": truth_row.get("metric_name"),
        "truth_float": truth_row.get("metric_value_float"),
        "truth_text": truth_row.get("metric_value_text"),
        "extracted": extracted,
        "method": None,
    }

    if not extracted:
        details["method"] = "baseline_linked"
        return 0.05, details

    # Numeric comparison
    if "value_float" in extracted and truth_row.get("metric_value_float") is not None:
        try:
            claimed = float(extracted["value_float"])
            truth = float(truth_row["metric_value_float"])
            denom = max(abs(truth), 1e-9)
            rel_err = abs(claimed - truth) / denom
            drift = _clamp01(rel_err)
            details["method"] = "relative_error"
            details["claimed_float"] = claimed
            details["rel_error"] = rel_err
            return drift, details
        except Exception:
            details["method"] = "numeric_parse_failed"
            return 0.25, details

    # Text comparison
    if "value_text" in extracted and truth_row.get("metric_value_text") is not None:
        claimed_text = str(extracted["value_text"]).strip().lower()
        truth_text = str(truth_row["metric_value_text"]).strip().lower()
        details["method"] = "text_exact_match"
        if claimed_text == truth_text:
            return 0.0, details
        return 0.35, details

    details["method"] = "extracted_present_but_not_comparable"
    return 0.15, details


def _risk_from_drift_and_similarity(
    drift: float, 
    top_similarity: Optional[float],
    drift_threshold: float,
    ir_threshold: float,
) -> str:
    """
    Determine risk status from drift magnitude and precedent similarity.
    
    Risk classification:
    - DATA_DRIFT: drift >= threshold (prose doesn't match truth)
    - IR_PREDICTED: high precedent similarity (likely to get regulatory questions)
    - ALIGNED: low drift, no concerning precedents
    
    Args:
        drift: Computed drift magnitude [0, 1]
        top_similarity: Highest precedent similarity score (or None)
        drift_threshold: Threshold for DATA_DRIFT status
        ir_threshold: Threshold for IR_PREDICTED status
    
    Returns:
        Risk status string
    """
    if drift >= drift_threshold:
        return "DATA_DRIFT"
    if top_similarity is not None and top_similarity >= ir_threshold:
        return "IR_PREDICTED"
    return "ALIGNED"


# =============================================================================
# Shadow Interrogation Service
# =============================================================================

class ShadowInterrogationService:
    """
    Shadow Agent interrogation engine.
    
    Performs adversarial risk assessment of prose fragments by:
    - Grounding against linked truth datapoints
    - Computing drift between claims and evidence
    - Predicting regulatory questions from historical precedents
    - Generating actionable feedback
    
    All interrogations produce append-only audit records for compliance.
    """
    
    def __init__(
        self,
        drift_threshold: float = 0.20,
        ir_threshold: float = 0.78,
        top_k: int = 5,
    ):
        self.drift_threshold = drift_threshold
        self.ir_threshold = ir_threshold
        self.top_k = top_k
        self.agent_identity = "SHADOW_AGENT"
    
    async def interrogate(
        self,
        conn: asyncpg.Connection,
        *,
        fragment_id: str,
        actor: str,
        request_id: str,
        agency_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Perform full shadow interrogation on a fragment.
        
        Args:
            conn: Database connection
            fragment_id: UUID of fragment to interrogate
            actor: User/system performing the interrogation
            request_id: External request ID for correlation
            agency_filter: Optional agency code to filter precedents
        
        Returns:
            Complete interrogation result with risk assessment
        
        Raises:
            ValueError: If fragment not found
        """
        # 1) Load fragment (current version view)
        frag = await conn.fetchrow(SQL_GET_FRAGMENT_CURRENT, fragment_id)
        if not frag:
            raise ValueError(f"Fragment not found: {fragment_id}")
        
        frag_d = dict(frag)
        
        # 2) Load linked truth rows
        truth_rows = await conn.fetch(SQL_GET_TRUTH_LINKS_WITH_METRICS, fragment_id)
        truth_list = [dict(r) for r in truth_rows]
        
        # 3) Compute drift
        per_link: List[Dict[str, Any]] = []
        if len(truth_list) == 0:
            # Unlinked prose is risky by definition
            drift = 0.40
            drift_details = {"method": "unlinked_default", "per_link": []}
        else:
            drifts = []
            for row in truth_list:
                extracted = row.get("extracted_claim_value")
                # asyncpg returns JSONB as dict; be defensive
                if isinstance(extracted, str):
                    try:
                        extracted = json.loads(extracted)
                    except Exception:
                        extracted = None
                
                d, info = _compute_link_drift(extracted, row)
                drifts.append(d)
                per_link.append(info)
            
            # Average drift (MVP); later weight by primary endpoints
            drift = sum(drifts) / max(len(drifts), 1)
            drift_details = {"method": "mean_per_link", "per_link": per_link}
        
        drift = float(_clamp01(drift))
        
        # 4) Retrieve precedents by similarity (if embedding exists)
        predicted_questions: List[Dict[str, Any]] = []
        top_similarity: Optional[float] = None
        
        embedding = frag_d.get("embedding")
        if embedding is not None:
            rows = await conn.fetch(
                SQL_RETRIEVE_PRECEDENTS,
                str(embedding),
                agency_filter,
                self.top_k,
            )
            for r in rows:
                rd = dict(r)
                sim = rd.get("similarity")
                if sim is not None:
                    sim = float(sim)
                    top_similarity = sim if top_similarity is None else max(top_similarity, sim)
                
                predicted_questions.append({
                    "precedent_id": str(rd["id"]),
                    "agency_code": rd["agency_code"],
                    "failure_mode": rd["failure_mode"],
                    "historical_question": rd["historical_question"],
                    "source_ref": rd.get("source_ref"),
                    "similarity": sim,
                })
        
        # 5) Determine risk status
        risk_status = _risk_from_drift_and_similarity(
            drift=drift,
            top_similarity=top_similarity,
            drift_threshold=self.drift_threshold,
            ir_threshold=self.ir_threshold,
        )
        
        # 6) Build structured feedback payload
        now = datetime.now(timezone.utc).isoformat()
        version_id = frag_d.get("current_version_id") or frag_d.get("version_id") or 1
        
        truth_summary = {
            "truth_link_count": len(truth_list),
            "primary_endpoint_links": sum(
                1 for r in truth_list if r.get("is_primary_endpoint") is True
            ),
            "unlinked": len(truth_list) == 0,
        }
        
        feedback_payload = {
            "run_at": now,
            "request_id": request_id,
            "actor": actor,
            "fragment": {
                "fragment_id": fragment_id,
                "version_id": version_id,
                "ectd_section_path": frag_d.get("ectd_section_path"),
                "ectd_section_root": frag_d.get("ectd_section_root"),
                "jurisdiction": frag_d.get("jurisdiction"),
            },
            "truth": {
                "summary": truth_summary,
                "drift": {
                    "drift_magnitude": drift,
                    "details": drift_details,
                },
            },
            "adversarial": {
                "agency_filter": agency_filter,
                "top_similarity": top_similarity,
                "predicted_questions": predicted_questions,
            },
            "recommendations": {
                "actions": self._generate_recommendations(
                    risk_status=risk_status,
                    drift=drift,
                    truth_summary=truth_summary,
                    predicted_questions=predicted_questions,
                ),
            },
        }
        
        # 7) Append-only audit log insert
        audit_row = await conn.fetchrow(
            SQL_INSERT_AUDIT_LOG,
            fragment_id,
            self.agent_identity,
            risk_status,
            json.dumps(feedback_payload),
            drift,
            request_id,
            version_id,
        )
        
        return {
            "fragment_id": fragment_id,
            "version_id": int(version_id),
            "jurisdiction": frag_d.get("jurisdiction"),
            "ectd_section_path": frag_d.get("ectd_section_path"),
            "risk_status": risk_status,
            "drift_magnitude": drift,
            "predicted_questions": predicted_questions,
            "truth_link_summary": truth_summary,
            "audit_log_id": str(audit_row["id"]),
            "audited_at": (
                audit_row["created_at"].isoformat() 
                if hasattr(audit_row["created_at"], "isoformat") 
                else str(audit_row["created_at"])
            ),
            "feedback_payload": feedback_payload,
        }
    
    def _generate_recommendations(
        self,
        risk_status: str,
        drift: float,
        truth_summary: Dict[str, Any],
        predicted_questions: List[Dict[str, Any]],
    ) -> List[str]:
        """Generate actionable recommendations based on risk assessment."""
        actions = []
        
        if truth_summary.get("unlinked"):
            actions.append(
                "CRITICAL: Link every conclusion sentence to one or more truth datapoints."
            )
        
        if drift > 0.1:
            actions.append(
                f"Review claimed values against source data. Drift magnitude: {drift:.2%}"
            )
        
        if risk_status == "DATA_DRIFT":
            actions.append(
                "Resolve data discrepancies before submission. "
                "Update prose to match verified truth values or document justification."
            )
        
        if risk_status == "IR_PREDICTED" and predicted_questions:
            actions.append(
                f"Prepare proactive responses for {len(predicted_questions)} predicted regulatory questions."
            )
            top_q = predicted_questions[0] if predicted_questions else None
            if top_q:
                actions.append(
                    f"Priority question ({top_q.get('agency_code')}, {top_q.get('failure_mode')}): "
                    f"\"{top_q.get('historical_question', '')[:100]}...\""
                )
        
        if not actions:
            actions.append(
                "Fragment is well-grounded. "
                "Maintain truth linkage and continue monitoring for drift."
            )
        
        return actions


# =============================================================================
# Convenience function
# =============================================================================

async def interrogate_fragment(
    conn: asyncpg.Connection,
    *,
    fragment_id: str,
    actor: str,
    request_id: str,
    agency_filter: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convenience function to interrogate a fragment.
    
    Uses default settings from config.
    """
    settings = get_settings()
    service = ShadowInterrogationService(
        drift_threshold=settings.drift_threshold,
        ir_threshold=settings.ir_similarity_threshold,
        top_k=settings.top_k_precedents,
    )
    return await service.interrogate(
        conn,
        fragment_id=fragment_id,
        actor=actor,
        request_id=request_id,
        agency_filter=agency_filter,
    )
