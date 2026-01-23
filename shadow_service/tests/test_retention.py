"""
Tests for retention, legal hold, and archive operations.
"""
import pytest
from datetime import datetime, date, timedelta
from uuid import uuid4
from shadow_service.models_retention import (
    RetentionPolicy, RetentionPolicyCreate, RetentionPolicyList,
    RetentionBasis,
    LegalHold, LegalHoldCreate, LegalHoldRelease, LegalHoldList,
    ArchiveManifest, ArchiveManifestList,
    ChainVerificationResult, ChainVerificationList,
    HoldCheckResult
)


class TestRetentionPolicyModels:
    """Test RetentionPolicy Pydantic models."""

    def test_retention_policy_create_valid(self):
        data = RetentionPolicyCreate(
            policy_code="RET-001",
            policy_name="Clinical Trial Data Retention",
            description="Retain CTD for 15 years post approval",
            target_schema="prose",
            target_table="smart_fragments",
            retention_years=15,
            retention_basis=RetentionBasis.APPROVAL_DATE,
            archive_eligible=True,
            archive_destination="s3://archive-bucket/ctd/",
            destruction_allowed=False,
            destruction_approval_required=True
        )
        assert data.policy_code == "RET-001"
        assert data.retention_years == 15
        assert data.retention_basis == RetentionBasis.APPROVAL_DATE

    def test_retention_policy_create_minimal(self):
        data = RetentionPolicyCreate(
            policy_code="RET-002",
            policy_name="Default Retention",
            target_schema="audit",
            target_table="event_log",
            retention_years=7,
            retention_basis=RetentionBasis.RECORD_DATE
        )
        assert data.archive_eligible is True  # default
        assert data.destruction_allowed is False  # default

    def test_retention_policy_full(self):
        policy = RetentionPolicy(
            id=uuid4(),
            policy_code="RET-001",
            policy_name="Test Policy",
            target_schema="prose",
            target_table="smart_fragments",
            retention_years=15,
            retention_basis=RetentionBasis.APPROVAL_DATE,
            archive_eligible=True,
            destruction_allowed=False,
            destruction_approval_required=True,
            is_active=True,
            created_at=datetime.utcnow(),
            created_by="test_user"
        )
        assert policy.is_active is True


class TestLegalHoldModels:
    """Test LegalHold Pydantic models."""

    def test_legal_hold_create_valid(self):
        data = LegalHoldCreate(
            hold_code="LH-2024-001",
            hold_name="FDA Inspection Hold",
            description="Data freeze for FDA BIMO inspection",
            legal_matter_reference="CASE-2024-12345",
            custodian="legal@company.com",
            scope_schema="prose",
            scope_table="smart_fragments",
            program_id=uuid4()
        )
        assert data.hold_code == "LH-2024-001"
        assert data.custodian == "legal@company.com"

    def test_legal_hold_full(self):
        hold = LegalHold(
            id=uuid4(),
            hold_code="LH-2024-001",
            hold_name="Litigation Hold",
            custodian="legal@company.com",
            hold_start=datetime.utcnow(),
            is_active=True,
            created_at=datetime.utcnow(),
            created_by="legal_admin"
        )
        assert hold.is_active is True
        assert hold.hold_end is None

    def test_legal_hold_release(self):
        release = LegalHoldRelease(
            release_reason="Matter resolved, no further litigation expected"
        )
        assert len(release.release_reason) > 0


class TestArchiveManifestModels:
    """Test ArchiveManifest Pydantic models."""

    def test_archive_manifest_full(self):
        prev_id = uuid4()
        manifest = ArchiveManifest(
            id=uuid4(),
            sequence_number=42,
            entity_type="smart_fragment",
            entity_id=uuid4(),
            entity_label="Section 2.5 Clinical Overview",
            archive_reason="End of retention period",
            content_sha256="abc123def456...",
            manifest_sha256="xyz789...",
            archive_location="s3://archive/2024/manifest-42.json",
            archived_at=datetime.utcnow(),
            archived_by="archive_service",
            previous_manifest_id=prev_id,
            previous_manifest_hash="prev_hash_xyz"
        )
        assert manifest.sequence_number == 42
        assert manifest.previous_manifest_id == prev_id

    def test_chain_verification_result(self):
        result = ChainVerificationResult(
            sequence_number=10,
            manifest_id=uuid4(),
            manifest_sha256="hash_10",
            previous_manifest_hash="hash_9",
            actual_prev_hash="hash_9",
            chain_valid=True
        )
        assert result.chain_valid is True

    def test_chain_verification_invalid(self):
        result = ChainVerificationResult(
            sequence_number=11,
            manifest_id=uuid4(),
            manifest_sha256="hash_11",
            previous_manifest_hash="hash_10_expected",
            actual_prev_hash="hash_10_actual_different",
            chain_valid=False
        )
        assert result.chain_valid is False


class TestHoldCheckResult:
    """Test hold check functionality."""

    def test_hold_check_under_hold(self):
        result = HoldCheckResult(
            schema_name="prose",
            table_name="smart_fragments",
            program_id=uuid4(),
            is_under_hold=True
        )
        assert result.is_under_hold is True

    def test_hold_check_not_under_hold(self):
        result = HoldCheckResult(
            schema_name="audit",
            table_name="event_log",
            is_under_hold=False
        )
        assert result.is_under_hold is False


class TestRetentionListModels:
    """Test list response models."""

    def test_policy_list_empty(self):
        lst = RetentionPolicyList(items=[], count=0)
        assert lst.count == 0

    def test_legal_hold_list_with_items(self):
        hold = LegalHold(
            id=uuid4(),
            hold_code="LH-001",
            hold_name="Test Hold",
            custodian="test@test.com",
            hold_start=datetime.utcnow(),
            is_active=True,
            created_at=datetime.utcnow(),
            created_by="test"
        )
        lst = LegalHoldList(items=[hold], count=1)
        assert lst.count == 1
        assert lst.items[0].hold_code == "LH-001"

    def test_chain_verification_list_all_valid(self):
        items = [
            ChainVerificationResult(
                sequence_number=i,
                manifest_id=uuid4(),
                manifest_sha256=f"hash_{i}",
                chain_valid=True
            )
            for i in range(5)
        ]
        lst = ChainVerificationList(items=items, all_valid=True)
        assert lst.all_valid is True
        assert len(lst.items) == 5
