"""Comprehensive tests for Shadow Interrogation MVP.

Tests cover:
1. Unit tests for drift computation
2. Integration tests for interrogation flow
3. Version-aware interrogation
4. Batch interrogation
5. Heatmap generation
6. Snapshot gate checks

Run with: pytest -v tests/test_shadow_interrogation_mvp.py
"""

import json
import pytest
from datetime import datetime, timedelta
from uuid import UUID, uuid4
from unittest.mock import AsyncMock, MagicMock, patch

from shadow_service.models import (
    RiskStatus,
    RiskColor,
    GateDecision,
    ClaimKind,
    ConfidenceRating,
    SnapshotStatus,
    InterrogationRequest,
    InterrogationResponse,
    PrecedentMatch,
    FragmentRiskSummary,
)
from shadow_service.shadow_agent import ShadowAgent


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def shadow_agent() -> ShadowAgent:
    """Create Shadow Agent for testing."""
    return ShadowAgent(top_k=5, drift_threshold=0.1)


@pytest.fixture
def sample_fragment() -> dict:
    """Sample fragment record from database."""
    return {
        "id": uuid4(),
        "ectd_section_path": "m2.7.3-efficacy-summary",
        "jurisdiction": "FDA",
        "content_prose": "The primary endpoint (Cmax) was 125.5 ng/mL, meeting the predefined threshold.",
        "embedding": "[0.1, 0.2, 0.3]",  # Simplified
        "objectivity_score": 0.92,
        "confidence_rating": "Conclusive",
        "is_verified_against_truth": True,
        "version_id": 1,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }


@pytest.fixture
def sample_truth_links() -> list[dict]:
    """Sample truth links with varying drift."""
    return [
        {
            "truth_id": uuid4(),
            "fragment_id": uuid4(),
            "claim_kind": "efficacy",
            "claim_span": "Cmax was 125.5 ng/mL",
            "extracted_claim_value": json.dumps({"value": 125.5, "unit": "ng/mL"}),
            "metric_name": "Cmax",
            "metric_value_float": 125.5,  # Exact match
            "metric_value_text": None,
            "nct_id": "NCT01234567",
            "is_primary_endpoint": True,
        },
        {
            "truth_id": uuid4(),
            "fragment_id": uuid4(),
            "claim_kind": "efficacy",
            "claim_span": "Response rate was 68%",
            "extracted_claim_value": json.dumps({"value": 0.68, "unit": "%"}),
            "metric_name": "ORR",
            "metric_value_float": 0.65,  # 4.6% drift
            "metric_value_text": None,
            "nct_id": "NCT01234567",
            "is_primary_endpoint": False,
        },
    ]


@pytest.fixture
def drifted_truth_links() -> list[dict]:
    """Truth links with significant drift."""
    return [
        {
            "truth_id": uuid4(),
            "fragment_id": uuid4(),
            "claim_kind": "efficacy",
            "claim_span": "Median OS was 18.5 months",
            "extracted_claim_value": json.dumps({"value": 18.5, "unit": "months"}),
            "metric_name": "median_os",
            "metric_value_float": 14.2,  # 30% drift
            "metric_value_text": None,
            "nct_id": "NCT01234567",
            "is_primary_endpoint": True,
        },
    ]


@pytest.fixture
def sample_precedents() -> list[dict]:
    """Sample precedent matches."""
    return [
        {
            "id": uuid4(),
            "agency_code": "FDA",
            "failure_mode": "Clinical Gap",
            "historical_question": "Please provide additional data supporting the claimed efficacy rate.",
            "source_ref": "FDA-2023-001",
            "similarity": 0.92,
        },
        {
            "id": uuid4(),
            "agency_code": "FDA",
            "failure_mode": "Data Integrity",
            "historical_question": "Clarify the discrepancy between CSR and submission values.",
            "source_ref": "FDA-2022-042",
            "similarity": 0.87,
        },
    ]


# =============================================================================
# Unit Tests: Drift Computation
# =============================================================================

class TestDriftComputation:
    """Test drift calculation logic."""
    
    def test_no_links_returns_zero_drift(self, shadow_agent):
        """Empty links should return zero drift."""
        result = shadow_agent._compute_drift([])
        assert result["magnitude"] == 0.0
        assert result["details"] == []
    
    def test_exact_match_returns_zero_drift(self, shadow_agent, sample_truth_links):
        """Exact numeric match should have zero drift."""
        # First link has exact match (125.5 vs 125.5)
        links = [sample_truth_links[0]]
        result = shadow_agent._compute_drift(links)
        assert result["magnitude"] == 0.0
        assert len(result["details"]) == 1
        assert result["details"][0]["drift"] == 0.0
    
    def test_numeric_drift_calculation(self, shadow_agent):
        """Test relative numeric drift calculation."""
        links = [{
            "truth_id": uuid4(),
            "claim_kind": "efficacy",
            "extracted_claim_value": json.dumps({"value": 100}),
            "metric_name": "test_metric",
            "metric_value_float": 80,  # 25% drift: |100-80|/80 = 0.25
            "metric_value_text": None,
        }]
        result = shadow_agent._compute_drift(links)
        assert 0.24 <= result["magnitude"] <= 0.26  # Account for floating point
    
    def test_text_drift_exact_match(self, shadow_agent):
        """Text exact match (case insensitive) should have zero drift."""
        links = [{
            "truth_id": uuid4(),
            "claim_kind": "efficacy",
            "extracted_claim_value": json.dumps({"value": "Complete Response"}),
            "metric_name": "response",
            "metric_value_float": None,
            "metric_value_text": "complete response",  # Case differs
        }]
        result = shadow_agent._compute_drift(links)
        assert result["magnitude"] == 0.0
    
    def test_text_drift_mismatch(self, shadow_agent):
        """Text mismatch should have drift = 1.0."""
        links = [{
            "truth_id": uuid4(),
            "claim_kind": "efficacy",
            "extracted_claim_value": json.dumps({"value": "Complete Response"}),
            "metric_name": "response",
            "metric_value_float": None,
            "metric_value_text": "Partial Response",  # Different value
        }]
        result = shadow_agent._compute_drift(links)
        assert result["magnitude"] == 1.0
    
    def test_aggregate_drift_multiple_links(self, shadow_agent, sample_truth_links):
        """Multiple links should average their drift."""
        result = shadow_agent._compute_drift(sample_truth_links)
        # First link: 0 drift (exact match)
        # Second link: |0.68-0.65|/0.65 ≈ 0.046 drift
        # Average ≈ 0.023
        assert 0.02 <= result["magnitude"] <= 0.05
        assert len(result["details"]) == 2
    
    def test_significant_drift_detection(self, shadow_agent, drifted_truth_links):
        """Significant drift should be detected."""
        result = shadow_agent._compute_drift(drifted_truth_links)
        # |18.5 - 14.2| / 14.2 ≈ 0.303
        assert result["magnitude"] > shadow_agent.drift_threshold
        assert result["magnitude"] > 0.3


class TestRiskClassification:
    """Test risk status determination."""
    
    def test_aligned_when_no_drift(self, shadow_agent):
        """No drift + no precedents = ALIGNED."""
        status = RiskStatus.ALIGNED
        color = shadow_agent._risk_color_from_status(status, 0.0)
        assert color == RiskColor.GREEN
    
    def test_amber_when_drift_above_threshold(self, shadow_agent):
        """Drift above threshold = AMBER."""
        status = RiskStatus.DATA_DRIFT
        color = shadow_agent._risk_color_from_status(status, 0.15)
        assert color == RiskColor.AMBER
    
    def test_red_when_ir_predicted(self, shadow_agent):
        """IR predicted = RED."""
        status = RiskStatus.IR_PREDICTED
        color = shadow_agent._risk_color_from_status(status, 0.0)
        assert color == RiskColor.RED


# =============================================================================
# Integration Tests: Full Interrogation Flow
# =============================================================================

@pytest.mark.db_required
class TestInterrogationFlow:
    """Integration tests for full interrogation flow."""
    
    @pytest.mark.asyncio
    async def test_interrogate_aligned_fragment(
        self, shadow_agent, sample_fragment, sample_truth_links
    ):
        """Test interrogation of well-aligned fragment."""
        with patch.object(shadow_agent, '_compute_drift') as mock_drift:
            mock_drift.return_value = {"magnitude": 0.0, "details": []}
            
            # Mock database calls
            with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
                with patch('shadow_service.shadow_agent.fetch') as mock_fetch:
                    mock_fetchrow.side_effect = [
                        sample_fragment,  # SELECT_FRAGMENT_WITH_EMBEDDING
                        {"id": uuid4()},  # INSERT_AUDIT_LOG
                    ]
                    mock_fetch.side_effect = [
                        sample_truth_links,  # SELECT_LINKS_BY_FRAGMENT
                        [],  # SEARCH_PRECEDENTS_BY_VECTOR
                    ]
                    
                    response = await shadow_agent.interrogate(
                        fragment_id=sample_fragment["id"],
                        request_id="test-001",
                    )
                    
                    assert response.risk_status == RiskStatus.ALIGNED
                    assert response.drift_magnitude == 0.0
                    assert len(response.predicted_questions) == 0
    
    @pytest.mark.asyncio
    async def test_interrogate_with_drift(
        self, shadow_agent, sample_fragment, drifted_truth_links
    ):
        """Test interrogation detects data drift."""
        with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
            with patch('shadow_service.shadow_agent.fetch') as mock_fetch:
                mock_fetchrow.side_effect = [
                    sample_fragment,
                    {"id": uuid4()},
                ]
                mock_fetch.side_effect = [
                    drifted_truth_links,
                    [],
                ]
                
                response = await shadow_agent.interrogate(
                    fragment_id=sample_fragment["id"],
                )
                
                assert response.risk_status == RiskStatus.DATA_DRIFT
                assert response.drift_magnitude > 0.1
    
    @pytest.mark.asyncio
    async def test_interrogate_predicts_ir(
        self, shadow_agent, sample_fragment, sample_truth_links, sample_precedents
    ):
        """Test high-similarity precedent triggers IR prediction."""
        with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
            with patch('shadow_service.shadow_agent.fetch') as mock_fetch:
                mock_fetchrow.side_effect = [
                    sample_fragment,
                    {"id": uuid4()},
                ]
                mock_fetch.side_effect = [
                    sample_truth_links,
                    sample_precedents,  # High similarity precedents
                ]
                
                response = await shadow_agent.interrogate(
                    fragment_id=sample_fragment["id"],
                )
                
                assert response.risk_status == RiskStatus.IR_PREDICTED
                assert len(response.predicted_questions) > 0
                assert response.predicted_questions[0].similarity > 0.85


# =============================================================================
# Section Interrogation Tests
# =============================================================================

@pytest.mark.db_required
class TestSectionInterrogation:
    """Test batch section interrogation."""
    
    @pytest.mark.asyncio
    async def test_section_interrogation_aggregates_results(self, shadow_agent):
        """Test section interrogation aggregates fragment results."""
        fragments = [
            {
                "id": uuid4(),
                "ectd_section_path": "m2.7.3-efficacy-001",
                "jurisdiction": "FDA",
                "content_prose": "Test content 1",
                "embedding": "[0.1, 0.2]",
                "objectivity_score": 0.9,
                "confidence_rating": "Conclusive",
                "version_id": 1,
            },
            {
                "id": uuid4(),
                "ectd_section_path": "m2.7.3-efficacy-002",
                "jurisdiction": "FDA",
                "content_prose": "Test content 2",
                "embedding": "[0.2, 0.3]",
                "objectivity_score": 0.85,
                "confidence_rating": "Interpretive",
                "version_id": 1,
            },
        ]
        
        with patch('shadow_service.shadow_agent.fetch') as mock_fetch:
            mock_fetch.return_value = fragments
            
            # Mock individual interrogations
            with patch.object(shadow_agent, 'interrogate') as mock_interrogate:
                mock_interrogate.side_effect = [
                    InterrogationResponse(
                        fragment_id=fragments[0]["id"],
                        risk_status=RiskStatus.ALIGNED,
                        drift_magnitude=0.0,
                        predicted_questions=[],
                        truth_links_count=2,
                        audit_log_id=uuid4(),
                        analysis={},
                    ),
                    InterrogationResponse(
                        fragment_id=fragments[1]["id"],
                        risk_status=RiskStatus.DATA_DRIFT,
                        drift_magnitude=0.15,
                        predicted_questions=[],
                        truth_links_count=1,
                        audit_log_id=uuid4(),
                        analysis={},
                    ),
                ]
                
                response = await shadow_agent.interrogate_section(
                    section_pattern="m2.7.3%",
                    jurisdiction="FDA",
                )
                
                assert response.total_fragments == 2
                assert response.green_count == 1
                assert response.amber_count == 1
                assert response.red_count == 0
                assert response.section_status == RiskColor.AMBER
                assert response.gate_decision == GateDecision.REVIEW


# =============================================================================
# Submission Gate Tests
# =============================================================================

@pytest.mark.db_required
class TestSubmissionGate:
    """Test submission gate logic."""
    
    @pytest.mark.asyncio
    async def test_gate_go_when_all_clear(self, shadow_agent):
        """Gate should be GO when all criteria pass."""
        gate_data = {
            "total_fragments": 100,
            "module2_fragments": 50,
            "ir_predicted_count": 0,
            "high_drift_count": 0,
            "unlinked_efficacy_count": 0,
            "unassessed_count": 5,  # Under 10% threshold
        }
        
        with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
            mock_fetchrow.return_value = gate_data
            
            response = await shadow_agent.check_submission_gate(jurisdiction="FDA")
            
            assert response.gate_decision == GateDecision.GO
            assert response.readiness_score == 100.0
            assert len(response.blockers) == 0
    
    @pytest.mark.asyncio
    async def test_gate_stop_when_ir_predicted(self, shadow_agent):
        """Gate should STOP when IR predictions exist."""
        gate_data = {
            "total_fragments": 100,
            "module2_fragments": 50,
            "ir_predicted_count": 2,  # STOP condition
            "high_drift_count": 0,
            "unlinked_efficacy_count": 0,
            "unassessed_count": 0,
        }
        
        with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
            mock_fetchrow.return_value = gate_data
            
            response = await shadow_agent.check_submission_gate(jurisdiction="FDA")
            
            assert response.gate_decision == GateDecision.STOP
            assert any("IR" in b or "regulatory" in b.lower() for b in response.blockers)
    
    @pytest.mark.asyncio
    async def test_gate_review_when_drift(self, shadow_agent):
        """Gate should REVIEW when high drift fragments exist."""
        gate_data = {
            "total_fragments": 100,
            "module2_fragments": 50,
            "ir_predicted_count": 0,
            "high_drift_count": 10,  # 10% drift
            "unlinked_efficacy_count": 0,
            "unassessed_count": 0,
        }
        
        with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
            mock_fetchrow.return_value = gate_data
            
            response = await shadow_agent.check_submission_gate(jurisdiction="FDA")
            
            assert response.gate_decision == GateDecision.REVIEW
            assert any("drift" in b.lower() for b in response.blockers)


# =============================================================================
# Heatmap Query Tests
# =============================================================================

class TestHeatmapQueries:
    """Test heatmap view queries."""
    
    def test_section_rollup_query_structure(self):
        """Verify section rollup query produces expected fields."""
        from shadow_service.sql_interrogation import SELECT_HEATMAP_SECTIONS
        
        # Query should reference the view
        assert "v_section_risk_rollup" in SELECT_HEATMAP_SECTIONS
        # Should include key fields
        assert "ectd_section_root" in SELECT_HEATMAP_SECTIONS
        assert "jurisdiction" in SELECT_HEATMAP_SECTIONS
        assert "red_fragments" in SELECT_HEATMAP_SECTIONS
        assert "avg_risk_score" in SELECT_HEATMAP_SECTIONS
    
    def test_jurisdiction_rollup_query_structure(self):
        """Verify jurisdiction rollup query structure."""
        from shadow_service.sql_interrogation import SELECT_HEATMAP_JURISDICTIONS
        
        assert "v_jurisdiction_risk_rollup" in SELECT_HEATMAP_JURISDICTIONS
        assert "fragments_total" in SELECT_HEATMAP_JURISDICTIONS
    
    def test_top_risky_fragments_query_structure(self):
        """Verify risky fragments query structure."""
        from shadow_service.sql_interrogation import SELECT_TOP_RISKY_FRAGMENTS
        
        assert "v_fragment_current" in SELECT_TOP_RISKY_FRAGMENTS
        assert "DATA_DRIFT" in SELECT_TOP_RISKY_FRAGMENTS
        assert "IR_PREDICTED" in SELECT_TOP_RISKY_FRAGMENTS


# =============================================================================
# Snapshot Integration Tests
# =============================================================================

class TestSnapshotIntegration:
    """Test snapshot-related queries."""
    
    def test_snapshot_comparison_query_structure(self):
        """Verify snapshot comparison query structure."""
        from shadow_service.sql_interrogation import SELECT_SNAPSHOT_FRAGMENT_COMPARISON
        
        # Should join snapshot fragments with current state
        assert "submission_snapshot_fragments" in SELECT_SNAPSHOT_FRAGMENT_COMPARISON
        assert "v_fragment_current" in SELECT_SNAPSHOT_FRAGMENT_COMPARISON
        
        # Should include frozen vs current comparison fields
        assert "frozen_version_id" in SELECT_SNAPSHOT_FRAGMENT_COMPARISON
        assert "current_version_id" in SELECT_SNAPSHOT_FRAGMENT_COMPARISON
        assert "risk_status_at_freeze" in SELECT_SNAPSHOT_FRAGMENT_COMPARISON
        assert "current_risk_status" in SELECT_SNAPSHOT_FRAGMENT_COMPARISON
    
    def test_snapshot_gate_query_structure(self):
        """Verify snapshot gate metrics query."""
        from shadow_service.sql_interrogation import SELECT_SNAPSHOT_GATE_DETAILED
        
        assert "v_snapshot_gate_metrics" in SELECT_SNAPSHOT_GATE_DETAILED
        assert "gate_pass_recommended" in SELECT_SNAPSHOT_GATE_DETAILED


# =============================================================================
# Version-Aware Interrogation Tests
# =============================================================================

class TestVersionAwareInterrogation:
    """Test version-specific interrogation."""
    
    def test_versioned_fragment_query_structure(self):
        """Verify version-aware query structure."""
        from shadow_service.sql_interrogation import SELECT_FRAGMENT_VERSION
        
        assert "smart_fragment_versions" in SELECT_FRAGMENT_VERSION
        assert "version_id = $2" in SELECT_FRAGMENT_VERSION
    
    def test_audit_log_versioned_query_structure(self):
        """Verify audit log captures version info."""
        from shadow_service.sql_interrogation import INSERT_AUDIT_LOG_VERSIONED
        
        assert "interrogated_version_id" in INSERT_AUDIT_LOG_VERSIONED


# =============================================================================
# Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Test error handling in interrogation."""
    
    @pytest.mark.asyncio
    async def test_interrogate_nonexistent_fragment(self, shadow_agent):
        """Should raise error for non-existent fragment."""
        with patch('shadow_service.shadow_agent.fetchrow') as mock_fetchrow:
            mock_fetchrow.return_value = None
            
            with pytest.raises(ValueError, match="Fragment not found"):
                await shadow_agent.interrogate(fragment_id=uuid4())
    
    @pytest.mark.asyncio
    async def test_section_interrogation_empty_section(self, shadow_agent):
        """Should handle empty section gracefully."""
        with patch('shadow_service.shadow_agent.fetch') as mock_fetch:
            mock_fetch.return_value = []
            
            response = await shadow_agent.interrogate_section(
                section_pattern="m9.9.9%",  # Non-existent section
            )
            
            assert response.total_fragments == 0
            assert response.section_status == RiskColor.UNKNOWN
            assert response.gate_decision == GateDecision.INCOMPLETE


# =============================================================================
# Run configuration
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
