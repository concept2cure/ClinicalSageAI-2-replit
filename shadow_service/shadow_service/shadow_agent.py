"""Shadow Agent - Adversarial interrogation logic."""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from .config import get_settings
from .db import fetch, fetchrow, fetchval
from .models import (
    AgentIdentity,
    AuditFeedbackPayload,
    DriftDetail,
    FragmentRiskSummary,
    GateCriteria,
    GateDecision,
    InterrogationResponse,
    PrecedentMatch,
    RiskColor,
    RiskStatus,
    RunMetadata,
    SectionInterrogationResponse,
    SubmissionGateResponse,
    TruthLinkSummary,
)
from . import sql

logger = logging.getLogger(__name__)


class ShadowAgent:
    """
    Shadow Agent performs adversarial interrogation of prose fragments.
    
    It:
    1. Retrieves the fragment and its linked truth datapoints
    2. Computes drift between claimed values and actual truth values
    3. Searches for similar historical regulatory questions
    4. Logs the result to the audit table
    """
    
    def __init__(self, top_k: int = 5, drift_threshold: float = 0.1):
        """Initialize Shadow Agent."""
        self.top_k = top_k
        self.drift_threshold = drift_threshold
        self.agent_identity = AgentIdentity.SHADOW_AGENT.value
    
    async def interrogate(
        self,
        fragment_id: UUID,
        request_id: Optional[str] = None,
        top_k: Optional[int] = None,
    ) -> InterrogationResponse:
        """
        Perform adversarial interrogation on a fragment.
        
        Args:
            fragment_id: UUID of the fragment to interrogate
            request_id: Optional external request ID for correlation
            top_k: Override default number of precedents to retrieve
        
        Returns:
            InterrogationResponse with risk assessment and predicted questions
        """
        k = top_k or self.top_k
        
        # 1. Load fragment with embedding
        fragment = await fetchrow(sql.SELECT_FRAGMENT_WITH_EMBEDDING, fragment_id)
        if not fragment:
            raise ValueError(f"Fragment not found: {fragment_id}")
        
        # 2. Load linked truth datapoints
        links = await fetch(sql.SELECT_LINKS_BY_FRAGMENT, fragment_id)
        
        # 3. Compute drift
        drift_result = self._compute_drift(links)
        drift_magnitude = drift_result["magnitude"]
        drift_details = drift_result["details"]
        
        # 4. Determine initial risk status based on drift
        if drift_magnitude > self.drift_threshold:
            risk_status = RiskStatus.DATA_DRIFT
        else:
            risk_status = RiskStatus.ALIGNED
        
        # 5. Search for similar precedents (if fragment has embedding)
        predicted_questions: list[PrecedentMatch] = []
        if fragment["embedding"] is not None:
            embedding_str = fragment["embedding"]
            precedents = await fetch(
                sql.SEARCH_PRECEDENTS_BY_VECTOR,
                embedding_str,
                k,
            )
            
            for p in precedents:
                predicted_questions.append(PrecedentMatch(
                    precedent_id=p["id"],
                    question=p["historical_question"],
                    similarity=float(p["similarity"]),
                    agency=p["agency_code"],
                    failure_mode=p["failure_mode"],
                    source_ref=p["source_ref"],
                ))
            
            # If we have high-similarity precedent matches, flag as IR_PREDICTED
            if predicted_questions and predicted_questions[0].similarity > 0.85:
                risk_status = RiskStatus.IR_PREDICTED
        
        # 6. Build analysis payload
        analysis: dict[str, Any] = {
            "drift_details": drift_details,
            "fragment_section": fragment["ectd_section_path"],
            "jurisdiction": fragment["jurisdiction"],
            "has_embedding": fragment["embedding"] is not None,
            "objectivity_score": fragment["objectivity_score"],
            "confidence_rating": fragment["confidence_rating"],
        }
        
        # 7. Create audit log entry
        feedback_payload = {
            "risk_status": risk_status.value,
            "drift_magnitude": drift_magnitude,
            "drift_details": drift_details,
            "predicted_questions": [
                {
                    "question": pq.question[:200],  # Truncate for storage
                    "similarity": pq.similarity,
                    "precedent_id": str(pq.precedent_id),
                    "agency": pq.agency,
                }
                for pq in predicted_questions[:5]  # Limit stored questions
            ],
            "truth_links_count": len(links),
            "fragment_section": fragment["ectd_section_path"],
            "interrogated_version_id": fragment.get("version_id"),
        }
        
        audit_record = await fetchrow(
            sql.INSERT_AUDIT_LOG,
            fragment_id,
            self.agent_identity,
            risk_status.value,
            json.dumps(feedback_payload),
            drift_magnitude,
            request_id,
            fragment.get("version_id"),  # interrogated_version_id
        )
        
        logger.info(
            "Shadow interrogation completed",
            extra={
                "fragment_id": str(fragment_id),
                "risk_status": risk_status.value,
                "drift_magnitude": drift_magnitude,
                "precedent_count": len(predicted_questions),
                "audit_log_id": str(audit_record["id"]),
            },
        )
        
        return InterrogationResponse(
            fragment_id=fragment_id,
            risk_status=risk_status,
            drift_magnitude=drift_magnitude,
            predicted_questions=predicted_questions,
            truth_links_count=len(links),
            audit_log_id=audit_record["id"],
            analysis=analysis,
        )
    
    def _compute_drift(self, links: list) -> dict[str, Any]:
        """
        Compute drift between prose claims and truth values.
        
        Returns dict with:
            - magnitude: float (0 = aligned, higher = more drift)
            - details: list of individual drift calculations
        """
        if not links:
            return {"magnitude": 0.0, "details": []}
        
        details = []
        total_drift = 0.0
        count = 0
        
        for link in links:
            extracted = link.get("extracted_claim_value")
            if extracted is None:
                continue
            
            # Parse extracted claim if it's a string
            if isinstance(extracted, str):
                try:
                    extracted = json.loads(extracted)
                except json.JSONDecodeError:
                    continue
            
            # Get actual truth value
            truth_float = link.get("metric_value_float")
            truth_text = link.get("metric_value_text")
            
            claimed_value = extracted.get("value")
            if claimed_value is None:
                continue
            
            # Compute drift based on value type
            drift = 0.0
            if truth_float is not None and isinstance(claimed_value, (int, float)):
                # Numeric drift: relative difference
                if truth_float != 0:
                    drift = abs(claimed_value - truth_float) / abs(truth_float)
                elif claimed_value != 0:
                    drift = 1.0  # Claimed non-zero when truth is zero
            elif truth_text is not None and isinstance(claimed_value, str):
                # Text drift: binary match/mismatch
                drift = 0.0 if claimed_value.lower() == truth_text.lower() else 1.0
            
            details.append({
                "truth_id": str(link["truth_id"]),
                "metric_name": link["metric_name"],
                "truth_value": truth_float or truth_text,
                "claimed_value": claimed_value,
                "drift": drift,
                "claim_kind": link["claim_kind"],
            })
            
            total_drift += drift
            count += 1
        
        magnitude = total_drift / count if count > 0 else 0.0
        
        return {
            "magnitude": round(magnitude, 4),
            "details": details,
        }
    
    def _risk_color_from_status(self, status: RiskStatus, drift: float) -> RiskColor:
        """Determine risk color from status and drift magnitude."""
        if status == RiskStatus.IR_PREDICTED:
            return RiskColor.RED
        elif status == RiskStatus.DATA_DRIFT or drift > self.drift_threshold:
            return RiskColor.AMBER
        elif status == RiskStatus.ALIGNED:
            return RiskColor.GREEN
        return RiskColor.UNKNOWN
    
    async def interrogate_section(
        self,
        section_pattern: str,
        jurisdiction: Optional[str] = None,
        top_k: Optional[int] = None,
        request_id: Optional[str] = None,
    ) -> SectionInterrogationResponse:
        """
        Interrogate all fragments matching a section pattern.
        
        Args:
            section_pattern: SQL LIKE pattern (e.g., 'm2.7.3%')
            jurisdiction: Optional jurisdiction filter
            top_k: Number of precedents per fragment
            request_id: External request ID for correlation
        
        Returns:
            SectionInterrogationResponse with aggregate risk assessment
        """
        k = top_k or self.top_k
        batch_id = request_id or str(uuid4())
        
        # Get all fragments in section
        fragments = await fetch(
            sql.SELECT_FRAGMENTS_BY_SECTION,
            section_pattern,
            jurisdiction,
        )
        
        if not fragments:
            return SectionInterrogationResponse(
                section_pattern=section_pattern,
                jurisdiction=jurisdiction,
                total_fragments=0,
                red_count=0,
                amber_count=0,
                green_count=0,
                avg_drift=0.0,
                max_drift=0.0,
                total_predicted_questions=0,
                fragment_results=[],
                section_status=RiskColor.UNKNOWN,
                gate_decision=GateDecision.INCOMPLETE,
                blockers=["No fragments found for section"],
                batch_request_id=batch_id,
            )
        
        # Interrogate each fragment
        results: list[FragmentRiskSummary] = []
        all_questions = 0
        total_drift = 0.0
        max_drift = 0.0
        red_count = 0
        amber_count = 0
        green_count = 0
        
        for frag in fragments:
            try:
                response = await self.interrogate(
                    fragment_id=frag["id"],
                    request_id=batch_id,
                    top_k=k,
                )
                
                risk_color = self._risk_color_from_status(
                    response.risk_status, response.drift_magnitude
                )
                
                results.append(FragmentRiskSummary(
                    fragment_id=frag["id"],
                    ectd_section=frag["ectd_section_path"],
                    risk_status=response.risk_status,
                    risk_color=risk_color,
                    drift_magnitude=response.drift_magnitude,
                    question_count=len(response.predicted_questions),
                    truth_link_count=response.truth_links_count,
                ))
                
                all_questions += len(response.predicted_questions)
                total_drift += response.drift_magnitude
                max_drift = max(max_drift, response.drift_magnitude)
                
                if risk_color == RiskColor.RED:
                    red_count += 1
                elif risk_color == RiskColor.AMBER:
                    amber_count += 1
                else:
                    green_count += 1
                    
            except Exception as e:
                logger.error(f"Error interrogating fragment {frag['id']}: {e}")
                results.append(FragmentRiskSummary(
                    fragment_id=frag["id"],
                    ectd_section=frag["ectd_section_path"],
                    risk_status=RiskStatus.ERROR,
                    risk_color=RiskColor.UNKNOWN,
                    drift_magnitude=0.0,
                    question_count=0,
                    truth_link_count=0,
                ))
        
        # Determine overall section status
        if red_count > 0:
            section_status = RiskColor.RED
            gate_decision = GateDecision.STOP
        elif amber_count > 0:
            section_status = RiskColor.AMBER
            gate_decision = GateDecision.REVIEW
        elif green_count > 0:
            section_status = RiskColor.GREEN
            gate_decision = GateDecision.GO
        else:
            section_status = RiskColor.UNKNOWN
            gate_decision = GateDecision.INCOMPLETE
        
        # Build blockers list
        blockers = []
        if red_count > 0:
            blockers.append(f"{red_count} fragments flagged for predicted IRs")
        if amber_count > 0:
            blockers.append(f"{amber_count} fragments have data drift")
        
        avg_drift = total_drift / len(results) if results else 0.0
        
        logger.info(
            "Section interrogation completed",
            extra={
                "section_pattern": section_pattern,
                "jurisdiction": jurisdiction,
                "total_fragments": len(results),
                "red_count": red_count,
                "amber_count": amber_count,
                "green_count": green_count,
                "batch_request_id": batch_id,
            },
        )
        
        return SectionInterrogationResponse(
            section_pattern=section_pattern,
            jurisdiction=jurisdiction,
            total_fragments=len(results),
            red_count=red_count,
            amber_count=amber_count,
            green_count=green_count,
            avg_drift=round(avg_drift, 4),
            max_drift=round(max_drift, 4),
            total_predicted_questions=all_questions,
            fragment_results=results,
            section_status=section_status,
            gate_decision=gate_decision,
            blockers=blockers,
            batch_request_id=batch_id,
        )
    
    async def check_submission_gate(
        self,
        jurisdiction: Optional[str] = None,
    ) -> SubmissionGateResponse:
        """
        Check submission gate readiness.
        
        Args:
            jurisdiction: Optional jurisdiction filter (FDA, EMA, etc.)
        
        Returns:
            SubmissionGateResponse with gate decision and criteria
        """
        # Run gate check query
        gate_data = await fetchrow(sql.SELECT_GATE_CHECK_BASIC, jurisdiction)
        
        if not gate_data:
            return SubmissionGateResponse(
                jurisdiction=jurisdiction or "ALL",
                gate_decision=GateDecision.INCOMPLETE,
                total_fragments=0,
                module2_fragments=0,
                ir_predicted_count=0,
                high_drift_count=0,
                unlinked_efficacy_count=0,
                unassessed_count=0,
                criteria=[],
                blockers=["No data available"],
                readiness_score=0.0,
            )
        
        total = gate_data["total_fragments"] or 0
        module2 = gate_data["module2_fragments"] or 0
        ir_predicted = gate_data["ir_predicted_count"] or 0
        high_drift = gate_data["high_drift_count"] or 0
        unlinked = gate_data["unlinked_efficacy_count"] or 0
        unassessed = gate_data["unassessed_count"] or 0
        
        # Define criteria
        criteria = []
        blockers = []
        
        # Criterion 1: No IR-predicted fragments
        c1_passed = ir_predicted == 0
        criteria.append(GateCriteria(
            name="no_ir_predictions",
            passed=c1_passed,
            value=ir_predicted,
            threshold=0,
            message="Fragments with predicted IR queries" if not c1_passed else "No IR predictions",
        ))
        if not c1_passed:
            blockers.append(f"{ir_predicted} fragment(s) have predicted regulatory questions")
        
        # Criterion 2: High drift < 5%
        drift_threshold = max(1, int(total * 0.05))
        c2_passed = high_drift <= drift_threshold
        criteria.append(GateCriteria(
            name="low_drift_rate",
            passed=c2_passed,
            value=high_drift,
            threshold=drift_threshold,
            message="High drift fragments within threshold" if c2_passed else "Too many high-drift fragments",
        ))
        if not c2_passed:
            blockers.append(f"{high_drift} fragment(s) exceed drift threshold")
        
        # Criterion 3: Efficacy sections linked to truth
        c3_passed = unlinked == 0
        criteria.append(GateCriteria(
            name="efficacy_linked",
            passed=c3_passed,
            value=unlinked,
            threshold=0,
            message="All efficacy sections linked" if c3_passed else "Unlinked efficacy sections",
        ))
        if not c3_passed:
            blockers.append(f"{unlinked} efficacy fragment(s) not linked to truth data")
        
        # Criterion 4: All fragments assessed
        assessment_threshold = max(1, int(total * 0.1))  # Allow 10% unassessed
        c4_passed = unassessed <= assessment_threshold
        criteria.append(GateCriteria(
            name="coverage",
            passed=c4_passed,
            value=unassessed,
            threshold=assessment_threshold,
            message="Adequate coverage" if c4_passed else "Too many unassessed fragments",
        ))
        if not c4_passed:
            blockers.append(f"{unassessed} fragment(s) have not been assessed")
        
        # Determine gate decision
        critical_fail = not c1_passed or not c3_passed
        minor_fail = not c2_passed or not c4_passed
        
        if critical_fail:
            gate_decision = GateDecision.STOP
        elif minor_fail:
            gate_decision = GateDecision.REVIEW
        else:
            gate_decision = GateDecision.GO
        
        # Calculate readiness score (0-100)
        passed_count = sum(1 for c in criteria if c.passed)
        readiness_score = (passed_count / len(criteria)) * 100 if criteria else 0.0
        
        return SubmissionGateResponse(
            jurisdiction=jurisdiction or "ALL",
            gate_decision=gate_decision,
            total_fragments=total,
            module2_fragments=module2,
            ir_predicted_count=ir_predicted,
            high_drift_count=high_drift,
            unlinked_efficacy_count=unlinked,
            unassessed_count=unassessed,
            criteria=criteria,
            blockers=blockers,
            readiness_score=readiness_score,
        )


# Singleton instance
_shadow_agent: Optional[ShadowAgent] = None


def get_shadow_agent() -> ShadowAgent:
    """Get or create Shadow Agent instance."""
    global _shadow_agent
    if _shadow_agent is None:
        settings = get_settings()
        _shadow_agent = ShadowAgent(
            top_k=settings.top_k_precedents,
            drift_threshold=settings.drift_threshold,
        )
    return _shadow_agent
