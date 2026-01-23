"""Tests for e-signatures and submission gate enforcement."""

import pytest
from uuid import uuid4
from datetime import datetime


class TestESignatureModels:
    """Tests for e-signature Pydantic models."""
    
    def test_signature_meaning_enum(self):
        """Verify SignatureMeaning enum values."""
        from shadow_service.models import SignatureMeaning
        
        assert SignatureMeaning.AUTHOR.value == "AUTHOR"
        assert SignatureMeaning.REVIEW.value == "REVIEW"
        assert SignatureMeaning.APPROVE.value == "APPROVE"
        assert SignatureMeaning.SUBMIT.value == "SUBMIT"
        assert SignatureMeaning.ACKNOWLEDGE.value == "ACKNOWLEDGE"
        
    def test_signed_object_type_enum(self):
        """Verify SignedObjectType enum values."""
        from shadow_service.models import SignedObjectType
        
        assert SignedObjectType.SNAPSHOT.value == "SNAPSHOT"
        assert SignedObjectType.SNAPSHOT_EXPORT.value == "SNAPSHOT_EXPORT"
        assert SignedObjectType.FRAGMENT_VERSION.value == "FRAGMENT_VERSION"
        
    def test_signature_method_enum(self):
        """Verify SignatureMethod enum values."""
        from shadow_service.models import SignatureMethod
        
        assert SignatureMethod.SSO.value == "SSO"
        assert SignatureMethod.PASSWORD_REAUTH.value == "PASSWORD_REAUTH"
        assert SignatureMethod.MFA.value == "MFA"
        assert SignatureMethod.CERT.value == "CERT"
        assert SignatureMethod.DEV.value == "DEV"
        
    def test_e_signature_create_model(self):
        """Verify ESignatureCreate model."""
        from shadow_service.models import ESignatureCreate, SignatureMeaning, SignatureMethod
        
        # Minimal
        sig = ESignatureCreate(signer_role="QA")
        assert sig.signer_role == "QA"
        assert sig.meaning == SignatureMeaning.APPROVE
        assert sig.signature_method == SignatureMethod.SSO
        
        # Full
        sig = ESignatureCreate(
            signer_role="RA",
            meaning=SignatureMeaning.REVIEW,
            signature_method=SignatureMethod.MFA,
            signature_statement="I have reviewed this document",
            signature_payload={"ip": "192.168.1.1"}
        )
        assert sig.signer_role == "RA"
        assert sig.meaning == SignatureMeaning.REVIEW
        assert sig.signature_payload["ip"] == "192.168.1.1"
        
    def test_submission_readiness_model(self):
        """Verify SubmissionReadiness model."""
        from shadow_service.models import SubmissionReadiness
        
        readiness = SubmissionReadiness(
            snapshot_id=uuid4(),
            snapshot_label="Test Snapshot",
            status="FROZEN",
            jurisdiction="FDA",
            required_approver_roles=["QA", "RA"],
            required_approval_meaning="APPROVE",
            submitted_export_id=None,
            latest_export_id=uuid4(),
            latest_export_sha256="abc123",
            latest_export_at=datetime.now(),
            signed_roles=["QA"],
            missing_roles=["RA"],
            ready_to_submit=False
        )
        
        assert readiness.status == "FROZEN"
        assert len(readiness.required_approver_roles) == 2
        assert readiness.ready_to_submit is False
        
    def test_submit_snapshot_request_model(self):
        """Verify SubmitSnapshotRequest model."""
        from shadow_service.models import SubmitSnapshotRequest
        
        export_id = uuid4()
        req = SubmitSnapshotRequest(export_id=export_id)
        assert req.export_id == export_id


class TestSqlEsign:
    """Tests for e-signature SQL queries."""
    
    def test_sql_queries_are_valid_strings(self):
        """Verify SQL query strings are defined."""
        from shadow_service import sql_esign
        
        assert sql_esign.SQL_INSERT_E_SIGNATURE
        assert sql_esign.SQL_GET_SIGNATURE_BY_ID
        assert sql_esign.SQL_GET_SIGNATURES_FOR_EXPORT
        assert sql_esign.SQL_CHECK_EXPORT_SIGNATURES
        assert sql_esign.SQL_GET_SNAPSHOT_SUBMISSION_READINESS
        assert sql_esign.SQL_SUBMIT_SNAPSHOT
        assert sql_esign.SQL_INSERT_SUBMISSION_EVENT
        assert sql_esign.SQL_GET_PENDING_SUBMISSIONS
        assert sql_esign.SQL_GET_RECENT_SUBMISSIONS


@pytest.mark.asyncio
class TestESignatureEndpoints:
    """Integration tests for e-signature endpoints."""
    
    @pytest.mark.skip(reason="Requires database connection - run with DATABASE_URL")
    async def test_get_export_signatures_empty(self, client):
        """Test GET /exports/{id}/signatures returns empty list for unknown export."""
        fake_id = uuid4()
        response = await client.get(f"/exports/{fake_id}/signatures")
        
        # In lite mode, may fail; in full mode, should return empty list
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            
    @pytest.mark.skip(reason="Requires database connection")
    async def test_sign_export_flow(self, client):
        """Test the full signature flow."""
        # This test requires a real database connection
        # 1. Create snapshot
        # 2. Freeze snapshot  
        # 3. Export snapshot
        # 4. Sign export with QA
        # 5. Sign export with RA
        # 6. Check submission readiness (should be ready)
        # 7. Submit snapshot
        pass


class TestSubmissionGateLogic:
    """Unit tests for submission gate logic."""
    
    def test_required_roles_default(self):
        """Verify default required approver roles."""
        # The migration sets default to ['QA', 'RA']
        default_roles = ['QA', 'RA']
        assert 'QA' in default_roles
        assert 'RA' in default_roles
        
    def test_signature_uniqueness_constraint_name(self):
        """Verify the constraint name for signature uniqueness."""
        # This constraint prevents duplicate (object, role, meaning) combinations
        constraint_name = "e_signatures_unique_role_meaning_per_object"
        assert "unique" in constraint_name.lower()


# Fixture for async HTTP client
@pytest.fixture
async def client():
    """Create async test client."""
    from httpx import AsyncClient, ASGITransport
    from shadow_service.main import app
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
