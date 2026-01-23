"""Tests for Shadow Interrogation Service - Automation Endpoints.

These tests verify the workflow automation features:
- Batch interrogation
- Snapshot automation
- Gate-controlled freezing
"""

import pytest
from datetime import datetime
from uuid import uuid4

from shadow_service.models import (
    SnapshotAutomationRequest,
    SnapshotAutomationResponse,
    BatchInterrogateRequest,
    BatchInterrogateResponse,
    SnapshotFreezeRequest,
    SnapshotFreezeResponse,
    WorkflowStatusResponse,
    SnapshotGateMetrics,
)


class TestAutomationModels:
    """Test automation request/response models."""
    
    def test_snapshot_automation_request_defaults(self):
        """Test SnapshotAutomationRequest with defaults."""
        req = SnapshotAutomationRequest(
            snapshot_name="FDA-NDA-2024-Q1",
            jurisdiction="FDA",
        )
        
        assert req.snapshot_name == "FDA-NDA-2024-Q1"
        assert req.jurisdiction == "FDA"
        assert req.section_patterns == ["m2.%"]  # Default
        assert req.auto_interrogate is True
        assert req.freeze_if_gate_passes is False
    
    def test_snapshot_automation_request_custom_patterns(self):
        """Test SnapshotAutomationRequest with custom patterns."""
        req = SnapshotAutomationRequest(
            snapshot_name="EMA-Module2-Only",
            jurisdiction="EMA",
            section_patterns=["m2.5%", "m2.7%"],
            target_agency="EMA",
            dossier_type="MAA",
            auto_interrogate=True,
            freeze_if_gate_passes=True,
        )
        
        assert req.section_patterns == ["m2.5%", "m2.7%"]
        assert req.target_agency == "EMA"
        assert req.dossier_type == "MAA"
        assert req.freeze_if_gate_passes is True
    
    def test_batch_interrogate_request_defaults(self):
        """Test BatchInterrogateRequest with defaults."""
        req = BatchInterrogateRequest(
            section_pattern="m2.7.3%",
        )
        
        assert req.section_pattern == "m2.7.3%"
        assert req.jurisdiction is None
        assert req.top_k == 5
        assert req.force_all is False
    
    def test_batch_interrogate_request_force_all(self):
        """Test BatchInterrogateRequest with force_all."""
        req = BatchInterrogateRequest(
            section_pattern="m2.%",
            jurisdiction="FDA",
            top_k=10,
            force_all=True,
        )
        
        assert req.force_all is True
        assert req.top_k == 10
    
    def test_snapshot_freeze_request_defaults(self):
        """Test SnapshotFreezeRequest with defaults."""
        req = SnapshotFreezeRequest()
        
        assert req.force is False
        assert req.override_reason is None
    
    def test_snapshot_freeze_request_force_requires_reason(self):
        """Test that force=True requires override_reason."""
        with pytest.raises(ValueError, match="override_reason required"):
            SnapshotFreezeRequest(force=True)
    
    def test_snapshot_freeze_request_force_with_reason(self):
        """Test SnapshotFreezeRequest with force and reason."""
        req = SnapshotFreezeRequest(
            force=True,
            override_reason="Approved by Reg Affairs Director per QA waiver #123",
        )
        
        assert req.force is True
        assert "waiver" in req.override_reason


class TestWorkflowStatusResponse:
    """Test WorkflowStatusResponse model."""
    
    def test_workflow_status_ready_to_freeze(self):
        """Test workflow status when ready to freeze."""
        status = WorkflowStatusResponse(
            snapshot_id=uuid4(),
            snapshot_name="Test-Snapshot",
            jurisdiction="FDA",
            status="DRAFT",
            fragments_included=50,
            not_interrogated=0,
            red_count=0,
            amber_count=5,
            green_count=45,
            avg_drift=0.05,
            max_drift=0.12,
            gate_pass_recommended=True,
            ready_to_freeze=True,
            blockers=[],
        )
        
        assert status.ready_to_freeze is True
        assert len(status.blockers) == 0
    
    def test_workflow_status_not_ready(self):
        """Test workflow status when NOT ready to freeze."""
        status = WorkflowStatusResponse(
            snapshot_id=uuid4(),
            snapshot_name="Test-Snapshot",
            jurisdiction="FDA",
            status="DRAFT",
            fragments_included=50,
            not_interrogated=10,
            red_count=2,
            amber_count=8,
            green_count=30,
            avg_drift=0.15,
            max_drift=0.45,
            gate_pass_recommended=False,
            ready_to_freeze=False,
            blockers=[
                "2 RED fragments need remediation",
                "10 fragments not yet interrogated",
            ],
        )
        
        assert status.ready_to_freeze is False
        assert len(status.blockers) == 2
        assert "RED fragments" in status.blockers[0]


class TestSnapshotAutomationResponse:
    """Test SnapshotAutomationResponse model."""
    
    def test_automation_response_success(self):
        """Test successful automation response."""
        response = SnapshotAutomationResponse(
            snapshot_id=uuid4(),
            snapshot_name="FDA-2024-Q1",
            jurisdiction="FDA",
            status="DRAFT",
            fragments_added=100,
            fragments_interrogated=100,
            gate_check=None,
            was_frozen=False,
            freeze_blocked_reason=None,
            section_stats={"m2.%": {"fragments_added": 100}},
            elapsed_seconds=5.5,
        )
        
        assert response.fragments_added == 100
        assert response.was_frozen is False
    
    def test_automation_response_auto_frozen(self):
        """Test automation response when auto-frozen."""
        response = SnapshotAutomationResponse(
            snapshot_id=uuid4(),
            snapshot_name="FDA-2024-Q1",
            jurisdiction="FDA",
            status="FROZEN",
            fragments_added=50,
            fragments_interrogated=50,
            gate_check=SnapshotGateMetrics(
                snapshot_id=uuid4(),
                snapshot_name="FDA-2024-Q1",
                jurisdiction="FDA",
                target_agency="CDER",
                dossier_type="NDA",
                status="FROZEN",
                fragments_total=50,
                unlinked_fragments=0,
                red_fragments=0,
                amber_fragments=5,
                green_fragments=45,
                never_interrogated_fragments=0,
                avg_drift=0.05,
                max_drift=0.12,
                gate_pass_recommended=True,
            ),
            was_frozen=True,
            freeze_blocked_reason=None,
            section_stats={"m2.%": {"fragments_added": 50}},
            elapsed_seconds=12.3,
        )
        
        assert response.was_frozen is True
        assert response.status == "FROZEN"
        assert response.gate_check.gate_pass_recommended is True


class TestBatchInterrogateResponse:
    """Test BatchInterrogateResponse model."""
    
    def test_batch_response_all_green(self):
        """Test batch response when all fragments are aligned."""
        response = BatchInterrogateResponse(
            section_pattern="m2.7.3%",
            jurisdiction="FDA",
            total_fragments=20,
            interrogated=20,
            skipped_recent=0,
            red_count=0,
            amber_count=0,
            green_count=20,
            error_count=0,
            avg_drift=0.02,
            max_drift=0.08,
            batch_request_id="batch-123",
            elapsed_seconds=3.5,
        )
        
        assert response.red_count == 0
        assert response.green_count == 20
        assert response.error_count == 0
    
    def test_batch_response_with_skipped(self):
        """Test batch response with recently-assessed fragments skipped."""
        response = BatchInterrogateResponse(
            section_pattern="m2.%",
            jurisdiction="FDA",
            total_fragments=100,
            interrogated=30,
            skipped_recent=70,
            red_count=2,
            amber_count=8,
            green_count=20,
            error_count=0,
            avg_drift=0.12,
            max_drift=0.35,
            batch_request_id="batch-456",
            elapsed_seconds=8.2,
        )
        
        assert response.skipped_recent == 70
        assert response.interrogated + response.skipped_recent == response.total_fragments


class TestSnapshotFreezeResponse:
    """Test SnapshotFreezeResponse model."""
    
    def test_freeze_response_success(self):
        """Test successful freeze response."""
        response = SnapshotFreezeResponse(
            snapshot_id=uuid4(),
            snapshot_name="FDA-2024-Q1",
            status="FROZEN",
            frozen_at=datetime.now(),
            frozen_by="reg.writer@company.com",
            was_forced=False,
            gate_passed=True,
            blockers=[],
        )
        
        assert response.status == "FROZEN"
        assert response.was_forced is False
        assert response.gate_passed is True
    
    def test_freeze_response_blocked(self):
        """Test freeze response when gate fails."""
        response = SnapshotFreezeResponse(
            snapshot_id=uuid4(),
            snapshot_name="FDA-2024-Q1",
            status="DRAFT",
            frozen_at=None,
            frozen_by=None,
            was_forced=False,
            gate_passed=False,
            blockers=[
                "3 RED (DATA_DRIFT) fragments",
                "5 unlinked fragments",
            ],
        )
        
        assert response.status == "DRAFT"
        assert response.gate_passed is False
        assert len(response.blockers) == 2
    
    def test_freeze_response_forced(self):
        """Test freeze response when force-frozen."""
        response = SnapshotFreezeResponse(
            snapshot_id=uuid4(),
            snapshot_name="FDA-2024-Q1",
            status="FROZEN",
            frozen_at=datetime.now(),
            frozen_by="director@company.com",
            was_forced=True,
            gate_passed=False,
            blockers=[
                "2 RED fragments (overridden)",
            ],
        )
        
        assert response.status == "FROZEN"
        assert response.was_forced is True
        assert response.gate_passed is False  # Still records that gate failed
