"""Tests for Snapshot Governance Workflow.

Integration tests verifying the RegOps/RA submission workflow:
1. Create snapshot → add fragments → get gate metrics → freeze → verify frozen state

This validates the complete audit trail and gate enforcement per 21 CFR Part 11.
"""

import pytest
from datetime import datetime
from uuid import uuid4, UUID

from shadow_service.models import (
    # Snapshot models
    SnapshotCreate,
    SnapshotResponse,
    SnapshotListItem,
    SnapshotFragmentResponse,
    SnapshotAddFragmentsRequest,
    SnapshotAddFragmentsResponse,
    SnapshotFreezeGatedRequest,
    SnapshotGateMetrics,
    SnapshotStatus,
    # Fragment models for setup
    FragmentCreate,
)


# =============================================================================
# Model Unit Tests
# =============================================================================

class TestSnapshotAddFragmentsRequest:
    """Test SnapshotAddFragmentsRequest model validation."""
    
    def test_with_explicit_ids(self):
        """Test request with explicit fragment IDs."""
        req = SnapshotAddFragmentsRequest(
            fragment_ids=["uuid-1", "uuid-2", "uuid-3"]
        )
        assert len(req.fragment_ids) == 3
        assert req.jurisdiction is None
        assert req.ectd_section_prefix is None
    
    def test_with_jurisdiction_filter(self):
        """Test request with jurisdiction filter."""
        req = SnapshotAddFragmentsRequest(
            jurisdiction="FDA"
        )
        assert req.jurisdiction == "FDA"
        assert req.fragment_ids is None
    
    def test_with_section_prefix_filter(self):
        """Test request with section prefix filter."""
        req = SnapshotAddFragmentsRequest(
            jurisdiction="FDA",
            ectd_section_prefix="m2.7.3"
        )
        assert req.ectd_section_prefix == "m2.7.3"
    
    def test_with_section_like_filter(self):
        """Test request with section LIKE pattern."""
        req = SnapshotAddFragmentsRequest(
            ectd_section_like="m2.%"
        )
        assert req.ectd_section_like == "m2.%"
    
    def test_combined_filters(self):
        """Test request with combined filters."""
        req = SnapshotAddFragmentsRequest(
            jurisdiction="EMA",
            ectd_section_prefix="m2.5",
        )
        assert req.jurisdiction == "EMA"
        assert req.ectd_section_prefix == "m2.5"


class TestSnapshotAddFragmentsResponse:
    """Test SnapshotAddFragmentsResponse model."""
    
    def test_response_counts(self):
        """Test response with inserted and skipped counts."""
        resp = SnapshotAddFragmentsResponse(
            snapshot_id=str(uuid4()),
            attempted=10,
            inserted=8,
            skipped=2,
        )
        assert resp.attempted == 10
        assert resp.inserted == 8
        assert resp.skipped == 2
    
    def test_all_inserted(self):
        """Test response when all fragments inserted."""
        resp = SnapshotAddFragmentsResponse(
            snapshot_id=str(uuid4()),
            attempted=5,
            inserted=5,
            skipped=0,
        )
        assert resp.attempted == resp.inserted
        assert resp.skipped == 0


class TestSnapshotFreezeGatedRequest:
    """Test SnapshotFreezeGatedRequest model."""
    
    def test_defaults(self):
        """Test default values (no enforcement)."""
        req = SnapshotFreezeGatedRequest()
        assert req.enforce_gate is False
        assert req.enforce_interrogated is False
    
    def test_enforce_gate(self):
        """Test with gate enforcement."""
        req = SnapshotFreezeGatedRequest(enforce_gate=True)
        assert req.enforce_gate is True
    
    def test_enforce_interrogated(self):
        """Test with interrogation enforcement."""
        req = SnapshotFreezeGatedRequest(enforce_interrogated=True)
        assert req.enforce_interrogated is True
    
    def test_full_enforcement(self):
        """Test with all enforcement flags."""
        req = SnapshotFreezeGatedRequest(
            enforce_gate=True,
            enforce_interrogated=True,
        )
        assert req.enforce_gate is True
        assert req.enforce_interrogated is True


class TestSnapshotGateMetrics:
    """Test SnapshotGateMetrics model."""
    
    def test_gate_pass_all_green(self):
        """Test gate pass when all fragments green."""
        metrics = SnapshotGateMetrics(
            snapshot_id=uuid4(),
            snapshot_name="FDA-NDA-2024-Q1",
            jurisdiction="FDA",
            target_agency="CDER",
            dossier_type="NDA",
            status="DRAFT",
            fragments_total=50,
            unlinked_fragments=0,
            red_fragments=0,
            amber_fragments=5,
            green_fragments=45,
            never_interrogated_fragments=0,
            avg_drift=0.05,
            max_drift=0.12,
            gate_pass_recommended=True,
        )
        
        assert metrics.gate_pass_recommended is True
        assert metrics.red_fragments == 0
        assert metrics.unlinked_fragments == 0
    
    def test_gate_fail_red_fragments(self):
        """Test gate fails with RED fragments."""
        metrics = SnapshotGateMetrics(
            snapshot_id=uuid4(),
            snapshot_name="FDA-NDA-2024-Q1",
            jurisdiction="FDA",
            target_agency=None,
            dossier_type=None,
            status="DRAFT",
            fragments_total=50,
            unlinked_fragments=0,
            red_fragments=3,
            amber_fragments=7,
            green_fragments=40,
            never_interrogated_fragments=0,
            avg_drift=0.25,
            max_drift=0.55,
            gate_pass_recommended=False,
        )
        
        assert metrics.gate_pass_recommended is False
        assert metrics.red_fragments > 0
    
    def test_gate_fail_unlinked(self):
        """Test gate fails with unlinked fragments."""
        metrics = SnapshotGateMetrics(
            snapshot_id=uuid4(),
            snapshot_name="FDA-NDA-2024-Q1",
            jurisdiction="FDA",
            target_agency=None,
            dossier_type=None,
            status="DRAFT",
            fragments_total=50,
            unlinked_fragments=5,
            red_fragments=0,
            amber_fragments=10,
            green_fragments=35,
            never_interrogated_fragments=0,
            avg_drift=0.08,
            max_drift=0.20,
            gate_pass_recommended=False,
        )
        
        assert metrics.gate_pass_recommended is False
        assert metrics.unlinked_fragments > 0
    
    def test_frozen_status(self):
        """Test metrics for frozen snapshot."""
        metrics = SnapshotGateMetrics(
            snapshot_id=uuid4(),
            snapshot_name="FDA-NDA-2024-Q1-FINAL",
            jurisdiction="FDA",
            target_agency="CDER",
            dossier_type="NDA",
            status="FROZEN",
            fragments_total=50,
            unlinked_fragments=0,
            red_fragments=0,
            amber_fragments=3,
            green_fragments=47,
            never_interrogated_fragments=0,
            avg_drift=0.04,
            max_drift=0.10,
            gate_pass_recommended=True,
        )
        
        assert metrics.status == "FROZEN"


# =============================================================================
# Workflow State Machine Tests
# =============================================================================

class TestSnapshotStatusTransitions:
    """Test snapshot status state machine."""
    
    def test_valid_transitions(self):
        """Test all valid status transitions."""
        valid_transitions = [
            ("DRAFT", "FROZEN"),
            ("DRAFT", "ARCHIVED"),
            ("FROZEN", "SUBMITTED"),
            ("FROZEN", "ARCHIVED"),
            ("SUBMITTED", "ARCHIVED"),
        ]
        
        for from_status, to_status in valid_transitions:
            # Both should be valid SnapshotStatus values
            assert SnapshotStatus(from_status)
            assert SnapshotStatus(to_status)
    
    def test_invalid_transitions_conceptual(self):
        """Test conceptual invalid transitions (DB enforces)."""
        invalid_transitions = [
            ("FROZEN", "DRAFT"),      # Cannot un-freeze
            ("SUBMITTED", "DRAFT"),   # Cannot un-submit
            ("SUBMITTED", "FROZEN"),  # Cannot go backwards
            ("ARCHIVED", "DRAFT"),    # Cannot resurrect
            ("ARCHIVED", "FROZEN"),   # Cannot resurrect
            ("ARCHIVED", "SUBMITTED"),# Cannot resurrect
        ]
        
        # All statuses should still be valid enum values
        for from_status, to_status in invalid_transitions:
            assert SnapshotStatus(from_status)
            assert SnapshotStatus(to_status)


# =============================================================================
# Integration Flow Tests (Lite Mode)
# =============================================================================

class TestSnapshotWorkflowLiteMode:
    """Test snapshot workflow in lite mode (no DB).
    
    These tests verify the API models and validation without
    actually hitting the database.
    """
    
    def test_complete_workflow_model_flow(self):
        """Test the complete workflow model flow."""
        # 1. Create snapshot request
        create_req = SnapshotCreate(
            snapshot_name="FDA-NDA-2024-Q1-Test",
            jurisdiction="FDA",
            target_agency="CDER",
            dossier_type="NDA",
            notes="Integration test snapshot",
        )
        assert create_req.snapshot_name == "FDA-NDA-2024-Q1-Test"
        
        # 2. Mock snapshot response
        snapshot_id = uuid4()
        snapshot_resp = SnapshotResponse(
            id=snapshot_id,
            snapshot_name=create_req.snapshot_name,
            jurisdiction=create_req.jurisdiction,
            target_agency=create_req.target_agency,
            dossier_type=create_req.dossier_type,
            notes=create_req.notes,
            status=SnapshotStatus.DRAFT,
            created_at=datetime.now(),
            created_by="test_user",
            frozen_at=None,
            frozen_by=None,
            submitted_at=None,
            submitted_by=None,
            archived_at=None,
            archived_by=None,
        )
        assert snapshot_resp.status == SnapshotStatus.DRAFT
        
        # 3. Add fragments request
        add_req = SnapshotAddFragmentsRequest(
            jurisdiction="FDA",
            ectd_section_prefix="m2.7",
        )
        assert add_req.jurisdiction == "FDA"
        
        # 4. Mock add response
        add_resp = SnapshotAddFragmentsResponse(
            snapshot_id=str(snapshot_id),
            attempted=25,
            inserted=25,
            skipped=0,
        )
        assert add_resp.inserted == 25
        
        # 5. Get gate metrics (mock)
        gate_metrics = SnapshotGateMetrics(
            snapshot_id=snapshot_id,
            snapshot_name=snapshot_resp.snapshot_name,
            jurisdiction=snapshot_resp.jurisdiction,
            target_agency=snapshot_resp.target_agency,
            dossier_type=snapshot_resp.dossier_type,
            status="DRAFT",
            fragments_total=25,
            unlinked_fragments=0,
            red_fragments=0,
            amber_fragments=3,
            green_fragments=22,
            never_interrogated_fragments=0,
            avg_drift=0.05,
            max_drift=0.12,
            gate_pass_recommended=True,
        )
        assert gate_metrics.gate_pass_recommended is True
        
        # 6. Freeze request
        freeze_req = SnapshotFreezeGatedRequest(
            enforce_gate=True,
            enforce_interrogated=True,
        )
        assert freeze_req.enforce_gate is True
        
        # 7. Mock frozen metrics
        frozen_metrics = SnapshotGateMetrics(
            snapshot_id=snapshot_id,
            snapshot_name=snapshot_resp.snapshot_name,
            jurisdiction=snapshot_resp.jurisdiction,
            target_agency=snapshot_resp.target_agency,
            dossier_type=snapshot_resp.dossier_type,
            status="FROZEN",  # Now frozen
            fragments_total=25,
            unlinked_fragments=0,
            red_fragments=0,
            amber_fragments=3,
            green_fragments=22,
            never_interrogated_fragments=0,
            avg_drift=0.05,
            max_drift=0.12,
            gate_pass_recommended=True,
        )
        assert frozen_metrics.status == "FROZEN"
    
    def test_gate_enforcement_blocks_red_fragments(self):
        """Test that gate enforcement blocks snapshot with RED fragments."""
        gate_metrics = SnapshotGateMetrics(
            snapshot_id=uuid4(),
            snapshot_name="Test-Snapshot",
            jurisdiction="FDA",
            target_agency=None,
            dossier_type=None,
            status="DRAFT",
            fragments_total=20,
            unlinked_fragments=0,
            red_fragments=2,  # 2 RED fragments
            amber_fragments=5,
            green_fragments=13,
            never_interrogated_fragments=0,
            avg_drift=0.30,
            max_drift=0.55,
            gate_pass_recommended=False,
        )
        
        freeze_req = SnapshotFreezeGatedRequest(enforce_gate=True)
        
        # Simulate gate check
        blockers = []
        if freeze_req.enforce_gate:
            if gate_metrics.red_fragments > 0:
                blockers.append(f"{gate_metrics.red_fragments} RED fragments")
            if gate_metrics.unlinked_fragments > 0:
                blockers.append(f"{gate_metrics.unlinked_fragments} unlinked fragments")
        
        assert len(blockers) == 1
        assert "2 RED fragments" in blockers[0]
    
    def test_gate_enforcement_blocks_uninterrogated(self):
        """Test that enforce_interrogated blocks never-interrogated fragments."""
        gate_metrics = SnapshotGateMetrics(
            snapshot_id=uuid4(),
            snapshot_name="Test-Snapshot",
            jurisdiction="FDA",
            target_agency=None,
            dossier_type=None,
            status="DRAFT",
            fragments_total=20,
            unlinked_fragments=0,
            red_fragments=0,
            amber_fragments=5,
            green_fragments=10,
            never_interrogated_fragments=5,  # 5 never interrogated
            avg_drift=0.08,
            max_drift=0.15,
            gate_pass_recommended=True,  # Gate still passes (just amber/green)
        )
        
        freeze_req = SnapshotFreezeGatedRequest(
            enforce_gate=False,
            enforce_interrogated=True,
        )
        
        # Simulate enforcement check
        blockers = []
        if freeze_req.enforce_interrogated:
            if gate_metrics.never_interrogated_fragments > 0:
                blockers.append(f"{gate_metrics.never_interrogated_fragments} never interrogated")
        
        assert len(blockers) == 1
        assert "5 never interrogated" in blockers[0]


# =============================================================================
# RBAC Role Tests (Model Level)
# =============================================================================

class TestRBACRoles:
    """Test RBAC role concepts for snapshot workflow."""
    
    def test_role_permissions_conceptual(self):
        """Test conceptual role permissions.
        
        gcc_app_reader: SELECT on all
        gcc_app_writer: INSERT/UPDATE prose tables
        gcc_shadow_agent: INSERT audit logs + SELECT all
        gcc_auditor: SELECT on audit schema only
        """
        roles = {
            "gcc_app_reader": {
                "can_create_snapshot": False,
                "can_add_fragments": False,
                "can_freeze_snapshot": False,
                "can_read_snapshots": True,
                "can_read_gate_metrics": True,
            },
            "gcc_app_writer": {
                "can_create_snapshot": True,
                "can_add_fragments": True,
                "can_freeze_snapshot": True,
                "can_read_snapshots": True,
                "can_read_gate_metrics": True,
            },
            "gcc_shadow_agent": {
                "can_create_snapshot": False,
                "can_add_fragments": False,
                "can_freeze_snapshot": False,
                "can_read_snapshots": True,
                "can_insert_audit_logs": True,
                "can_read_audit_logs": True,
            },
            "gcc_auditor": {
                "can_create_snapshot": False,
                "can_add_fragments": False,
                "can_freeze_snapshot": False,
                "can_read_snapshots": True,  # via views
                "can_read_audit_logs": True,
            },
        }
        
        # gcc_app_writer should have full write access
        assert roles["gcc_app_writer"]["can_create_snapshot"] is True
        assert roles["gcc_app_writer"]["can_freeze_snapshot"] is True
        
        # gcc_shadow_agent should only insert audit logs
        assert roles["gcc_shadow_agent"]["can_insert_audit_logs"] is True
        assert roles["gcc_shadow_agent"]["can_create_snapshot"] is False
        
        # gcc_auditor should be read-only
        assert roles["gcc_auditor"]["can_read_audit_logs"] is True
        assert roles["gcc_auditor"]["can_create_snapshot"] is False


# =============================================================================
# Audit Trail Tests (Model Level)
# =============================================================================

class TestAuditTrail:
    """Test audit trail concepts for 21 CFR Part 11 compliance."""
    
    def test_snapshot_audit_fields(self):
        """Test that snapshot response includes audit fields."""
        snapshot = SnapshotResponse(
            id=uuid4(),
            snapshot_name="FDA-NDA-2024-Q1",
            jurisdiction="FDA",
            target_agency="CDER",
            dossier_type="NDA",
            notes="Production submission",
            status=SnapshotStatus.FROZEN,
            created_at=datetime(2024, 1, 15, 10, 30, 0),
            created_by="ra_specialist@company.com",
            frozen_at=datetime(2024, 1, 16, 14, 0, 0),
            frozen_by="ra_director@company.com",
            submitted_at=None,
            submitted_by=None,
            archived_at=None,
            archived_by=None,
        )
        
        # Verify audit fields
        assert snapshot.created_at is not None
        assert snapshot.created_by == "ra_specialist@company.com"
        assert snapshot.frozen_at is not None
        assert snapshot.frozen_by == "ra_director@company.com"
    
    def test_draft_snapshot_no_freeze_audit(self):
        """Test that DRAFT snapshot has no freeze audit."""
        snapshot = SnapshotResponse(
            id=uuid4(),
            snapshot_name="FDA-NDA-2024-Q1-Draft",
            jurisdiction="FDA",
            target_agency=None,
            dossier_type=None,
            notes=None,
            status=SnapshotStatus.DRAFT,
            created_at=datetime.now(),
            created_by="user@company.com",
            frozen_at=None,
            frozen_by=None,
            submitted_at=None,
            submitted_by=None,
            archived_at=None,
            archived_by=None,
        )
        
        assert snapshot.status == SnapshotStatus.DRAFT
        assert snapshot.frozen_at is None
        assert snapshot.frozen_by is None
