"""Tests for Shadow Interrogation Service.

These tests require a database connection.
Mark with @pytest.mark.db_required if they need the database.
"""

import json
import pytest
from uuid import UUID, uuid4

# Import models for type checking
from shadow_service.models import (
    TruthCreate,
    FragmentCreate,
    TruthLinkCreate,
    PrecedentCreate,
    RiskStatus,
    ClaimKind,
    ConfidenceRating,
)


class TestModels:
    """Test Pydantic models."""
    
    def test_truth_create_float_value(self):
        """Test creating truth with float value."""
        data = TruthCreate(
            nct_id="NCT01234567",
            metric_name="Cmax",
            metric_value_float=125.5,
        )
        assert data.nct_id == "NCT01234567"
        assert data.metric_value_float == 125.5
    
    def test_truth_create_text_value(self):
        """Test creating truth with text value."""
        data = TruthCreate(
            nct_id="NCT01234567",
            metric_name="Response",
            metric_value_text="Complete",
        )
        assert data.metric_value_text == "Complete"
    
    def test_fragment_create(self):
        """Test creating fragment."""
        data = FragmentCreate(
            ectd_section_path="m2.7.3-efficacy-summary",
            jurisdiction="FDA",
            content_prose="The primary endpoint was met.",
            objectivity_score=0.9,
            confidence_rating=ConfidenceRating.CONCLUSIVE,
        )
        assert data.ectd_section_path == "m2.7.3-efficacy-summary"
        assert data.confidence_rating == ConfidenceRating.CONCLUSIVE
    
    def test_fragment_objectivity_bounds(self):
        """Test objectivity score bounds."""
        # Valid score
        data = FragmentCreate(
            ectd_section_path="m2.7.3",
            objectivity_score=0.5,
        )
        assert data.objectivity_score == 0.5
        
        # Invalid scores should raise
        with pytest.raises(ValueError):
            FragmentCreate(
                ectd_section_path="m2.7.3",
                objectivity_score=1.5,  # > 1.0
            )
        
        with pytest.raises(ValueError):
            FragmentCreate(
                ectd_section_path="m2.7.3",
                objectivity_score=-0.1,  # < 0.0
            )
    
    def test_truth_link_create(self):
        """Test creating truth link."""
        data = TruthLinkCreate(
            truth_ids=[uuid4(), uuid4()],
            claim_kind=ClaimKind.EFFICACY,
            extracted_claim_value={"value": 125.5, "unit": "ng/mL"},
        )
        assert len(data.truth_ids) == 2
        assert data.claim_kind == ClaimKind.EFFICACY
    
    def test_precedent_create(self):
        """Test creating precedent."""
        data = PrecedentCreate(
            agency_code="FDA",
            failure_mode="Clinical Gap",
            historical_question="Please provide additional data...",
            therapeutic_area="Oncology",
            submission_type="NDA",
        )
        assert data.agency_code == "FDA"
        assert data.failure_mode == "Clinical Gap"


class TestRiskStatus:
    """Test risk status enum."""
    
    def test_status_values(self):
        """Test all status values exist."""
        assert RiskStatus.ALIGNED.value == "ALIGNED"
        assert RiskStatus.DATA_DRIFT.value == "DATA_DRIFT"
        assert RiskStatus.IR_PREDICTED.value == "IR_PREDICTED"
        assert RiskStatus.MANUAL_REVIEW.value == "MANUAL_REVIEW"


class TestClaimKind:
    """Test claim kind enum."""
    
    def test_claim_kinds(self):
        """Test all claim kinds exist."""
        expected = ["supports", "contradicts", "context", "safety", "efficacy", "pk", "pd", "cmc"]
        for kind in expected:
            assert ClaimKind(kind).value == kind


@pytest.mark.db_required
class TestDatabaseIntegration:
    """Integration tests requiring database connection.
    
    These tests are marked with db_required and will be skipped
    if the database is not available.
    """
    
    @pytest.fixture
    def sample_truth_data(self) -> dict:
        """Sample truth datapoint."""
        return {
            "nct_id": f"NCT_TEST_{uuid4().hex[:8]}",
            "substance_id": "UNII_TEST_001",
            "metric_name": "Cmax",
            "metric_value_float": 125.5,
            "is_primary_endpoint": True,
            "source_document_ref": "CSR Section 11.4.1",
        }
    
    @pytest.fixture
    def sample_fragment_data(self) -> dict:
        """Sample fragment data."""
        return {
            "ectd_section_path": f"m2.7.3-test-{uuid4().hex[:8]}",
            "jurisdiction": "FDA",
            "content_prose": "The primary endpoint demonstrated a Cmax of 125.5 ng/mL.",
            "objectivity_score": 0.95,
            "confidence_rating": "Conclusive",
        }
    
    # These tests would run against the actual database
    # Skipped by default unless explicitly enabled
    
    def test_placeholder(self):
        """Placeholder test."""
        # Real database tests would go here
        pass
