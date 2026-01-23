"""
Tests for eCTD submission package operations.
"""
import pytest
from datetime import datetime, date
from uuid import uuid4
from shadow_service.models_ectd import (
    ModuleStructure, ModuleStructureList,
    SubmissionPackage, SubmissionPackageCreate, SubmissionPackageList,
    PackageStatusUpdate, PackageDelivered,
    PackageStatus, PackageType,
    PackageDocument, PackageDocumentCreate, PackageDocumentList,
    DocumentStatus, DocumentStatusUpdate, ECTDOperation,
    ModuleCompletion, ModuleCompletionList,
    ValidationRule, ValidationRuleList, ValidationSeverity,
    ValidationResult, ValidationResultList, ValidationResultCreate,
    DeliveryRecord, DeliveryRecordList, DeliveryRecordCreate,
    DeliveryStatus, DeliveryStatusUpdate
)


class TestModuleStructureModels:
    """Test ModuleStructure Pydantic models."""

    def test_module_structure_full(self):
        module = ModuleStructure(
            id=uuid4(),
            module_code="m2.5",
            module_name="Clinical Overview",
            parent_module_code="m2",
            module_level=2,
            is_regional=False,
            content_type="narrative",
            is_required=True,
            allowed_file_types=["pdf"],
            fda_specific=False,
            ema_specific=False,
            pmda_specific=False,
            description="Provides critical assessment of clinical data",
            guidance_reference="ICH M4E(R2)"
        )
        assert module.module_code == "m2.5"
        assert module.is_required is True

    def test_module_structure_regional(self):
        module = ModuleStructure(
            id=uuid4(),
            module_code="m1.2",
            module_name="Cover Letter",
            parent_module_code="m1",
            module_level=2,
            is_regional=True,
            fda_specific=True,
            allowed_file_types=["pdf"]
        )
        assert module.is_regional is True
        assert module.fda_specific is True


class TestSubmissionPackageModels:
    """Test SubmissionPackage Pydantic models."""

    def test_package_create_valid(self):
        data = SubmissionPackageCreate(
            package_code="PKG-NDA-001-0000",
            package_name="DrugX NDA Initial Submission",
            submission_id=uuid4(),
            sequence_number=0,
            agency_code="FDA",
            package_type=PackageType.ORIGINAL,
            program_id=uuid4()
        )
        assert data.package_code == "PKG-NDA-001-0000"
        assert data.package_type == PackageType.ORIGINAL

    def test_package_create_minimal(self):
        data = SubmissionPackageCreate(
            package_code="PKG-001",
            package_name="Test Package",
            agency_code="FDA"
        )
        assert data.package_type == PackageType.ORIGINAL
        assert data.sequence_number is None

    def test_package_full(self):
        pkg = SubmissionPackage(
            id=uuid4(),
            package_code="PKG-NDA-001-0000",
            package_name="DrugX NDA",
            sequence_number=0,
            agency_code="FDA",
            package_type=PackageType.ORIGINAL,
            status=PackageStatus.READY,
            is_validated=True,
            validated_at=datetime.utcnow(),
            validated_by="qa_validator",
            manifest_sha256="abc123...",
            document_count=150,
            error_count=0,
            created_at=datetime.utcnow(),
            created_by="pkg_admin"
        )
        assert pkg.status == PackageStatus.READY
        assert pkg.is_validated is True

    def test_package_status_update(self):
        data = PackageStatusUpdate(status=PackageStatus.VALIDATING)
        assert data.status == PackageStatus.VALIDATING

    def test_package_delivered(self):
        data = PackageDelivered(
            delivery_method="ESG",
            delivery_confirmation="ESG-2024-001234"
        )
        assert data.delivery_method == "ESG"


class TestPackageDocumentModels:
    """Test PackageDocument Pydantic models."""

    def test_document_create_valid(self):
        data = PackageDocumentCreate(
            package_id=uuid4(),
            module_code="m2.5",
            document_title="Clinical Overview",
            file_name="clinical-overview.pdf",
            file_type="pdf",
            source_type="fragment",
            source_fragment_id=uuid4(),
            content_sha256="sha256hash...",
            file_size_bytes=2048576,
            page_count=45,
            ectd_operation=ECTDOperation.NEW
        )
        assert data.module_code == "m2.5"
        assert data.ectd_operation == ECTDOperation.NEW

    def test_document_create_minimal(self):
        data = PackageDocumentCreate(
            package_id=uuid4(),
            module_code="m3.2.S",
            document_title="Drug Substance",
            file_name="drug-substance.pdf",
            file_type="pdf",
            source_type="upload"
        )
        assert data.status == DocumentStatus.PENDING
        assert data.ectd_operation == ECTDOperation.NEW

    def test_document_full(self):
        doc = PackageDocument(
            id=uuid4(),
            package_id=uuid4(),
            module_code="m2.5",
            module_name="Clinical Overview",
            module_level=2,
            document_title="Clinical Overview",
            file_name="clinical-overview.pdf",
            file_type="pdf",
            source_type="fragment",
            source_fragment_id=uuid4(),
            content_sha256="abc123...",
            file_size_bytes=1024000,
            page_count=30,
            ectd_operation=ECTDOperation.NEW,
            ectd_leaf_id="leaf-001",
            status=DocumentStatus.READY,
            sequence_order=1,
            created_at=datetime.utcnow(),
            created_by="doc_admin"
        )
        assert doc.status == DocumentStatus.READY

    def test_document_status_update(self):
        data = DocumentStatusUpdate(status=DocumentStatus.VALIDATING)
        assert data.status == DocumentStatus.VALIDATING


class TestModuleCompletionModels:
    """Test module completion models."""

    def test_module_completion(self):
        mc = ModuleCompletion(
            module_code="m2.5",
            module_name="Clinical Overview",
            module_level=2,
            is_required=True,
            document_count=1,
            completion_status="POPULATED"
        )
        assert mc.completion_status == "POPULATED"

    def test_module_completion_missing(self):
        mc = ModuleCompletion(
            module_code="m2.7",
            module_name="Clinical Summary",
            module_level=2,
            is_required=True,
            document_count=0,
            completion_status="MISSING"
        )
        assert mc.completion_status == "MISSING"

    def test_module_completion_list(self):
        pkg_id = uuid4()
        items = [
            ModuleCompletion(
                module_code="m2.5",
                module_name="Clinical Overview",
                module_level=2,
                is_required=True,
                document_count=1,
                completion_status="POPULATED"
            ),
            ModuleCompletion(
                module_code="m2.7",
                module_name="Clinical Summary",
                module_level=2,
                is_required=True,
                document_count=0,
                completion_status="MISSING"
            )
        ]
        lst = ModuleCompletionList(
            package_id=pkg_id,
            items=items,
            missing_required_count=1
        )
        assert lst.missing_required_count == 1


class TestValidationModels:
    """Test validation rule and result models."""

    def test_validation_rule(self):
        rule = ValidationRule(
            id=uuid4(),
            rule_code="ECTD-PDF-001",
            rule_name="PDF/A Compliance",
            agency_code="FDA",
            module_code=None,
            rule_type="format",
            severity=ValidationSeverity.ERROR,
            error_message="Document must be PDF/A-1a or PDF/A-2a compliant",
            guidance_reference="FDA eCTD Specifications v4.0",
            is_active=True
        )
        assert rule.severity == ValidationSeverity.ERROR

    def test_validation_result_create_pass(self):
        data = ValidationResultCreate(
            package_id=uuid4(),
            document_id=uuid4(),
            rule_id=uuid4(),
            passed=True,
            severity=ValidationSeverity.INFO,
            message="PDF/A compliance verified"
        )
        assert data.passed is True

    def test_validation_result_create_fail(self):
        data = ValidationResultCreate(
            package_id=uuid4(),
            document_id=uuid4(),
            rule_id=uuid4(),
            passed=False,
            severity=ValidationSeverity.ERROR,
            message="Document is not PDF/A compliant",
            details={"actual_format": "PDF 1.7", "expected": "PDF/A-1a or PDF/A-2a"}
        )
        assert data.passed is False
        assert data.details is not None

    def test_validation_result_full(self):
        result = ValidationResult(
            id=uuid4(),
            package_id=uuid4(),
            document_id=uuid4(),
            rule_id=uuid4(),
            rule_code="ECTD-PDF-001",
            rule_name="PDF/A Compliance",
            passed=False,
            severity=ValidationSeverity.ERROR,
            message="Not compliant",
            validated_at=datetime.utcnow(),
            document_title="Clinical Overview",
            module_code="m2.5"
        )
        assert result.passed is False

    def test_validation_result_list(self):
        pkg_id = uuid4()
        results = [
            ValidationResult(
                id=uuid4(),
                package_id=pkg_id,
                rule_id=uuid4(),
                passed=True,
                severity=ValidationSeverity.INFO,
                message="OK",
                validated_at=datetime.utcnow()
            ),
            ValidationResult(
                id=uuid4(),
                package_id=pkg_id,
                rule_id=uuid4(),
                passed=False,
                severity=ValidationSeverity.WARNING,
                message="Warning",
                validated_at=datetime.utcnow()
            )
        ]
        lst = ValidationResultList(
            package_id=pkg_id,
            items=results,
            error_count=0,
            warning_count=1,
            passed=True
        )
        assert lst.warning_count == 1
        assert lst.passed is True


class TestDeliveryModels:
    """Test delivery record models."""

    def test_delivery_record_create(self):
        data = DeliveryRecordCreate(
            package_id=uuid4(),
            delivery_method="ESG",
            delivery_destination="FDA Center for Drug Evaluation"
        )
        assert data.delivery_method == "ESG"

    def test_delivery_status_update_success(self):
        data = DeliveryStatusUpdate(
            status=DeliveryStatus.COMPLETED,
            confirmation_number="ESG-2024-001234",
            agency_receipt_number="FDA-REC-2024-56789",
            transfer_size_bytes=500000000,
            transfer_duration_seconds=3600
        )
        assert data.status == DeliveryStatus.COMPLETED

    def test_delivery_status_update_failure(self):
        data = DeliveryStatusUpdate(
            status=DeliveryStatus.FAILED,
            error_message="Connection timeout after 3 retries"
        )
        assert data.status == DeliveryStatus.FAILED
        assert data.error_message is not None

    def test_delivery_record_full(self):
        record = DeliveryRecord(
            id=uuid4(),
            package_id=uuid4(),
            package_code="PKG-NDA-001-0000",
            delivery_method="ESG",
            delivery_destination="FDA CDER",
            status=DeliveryStatus.COMPLETED,
            initiated_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
            confirmation_number="ESG-123",
            agency_receipt_number="FDA-456",
            acknowledgment_received=True,
            acknowledgment_at=datetime.utcnow(),
            transfer_size_bytes=500000000,
            transfer_duration_seconds=1800,
            delivered_by="delivery_service"
        )
        assert record.status == DeliveryStatus.COMPLETED
        assert record.acknowledgment_received is True


class TestECTDListModels:
    """Test list response models."""

    def test_module_structure_list(self):
        module = ModuleStructure(
            id=uuid4(),
            module_code="m1",
            module_name="Administrative Information",
            module_level=1,
            allowed_file_types=["pdf"]
        )
        lst = ModuleStructureList(items=[module], count=1)
        assert lst.count == 1

    def test_package_list_empty(self):
        lst = SubmissionPackageList(items=[], count=0)
        assert lst.count == 0

    def test_document_list_with_items(self):
        doc = PackageDocument(
            id=uuid4(),
            package_id=uuid4(),
            module_code="m2.5",
            document_title="Test",
            file_name="test.pdf",
            file_type="pdf",
            source_type="upload",
            ectd_operation=ECTDOperation.NEW,
            status=DocumentStatus.READY,
            sequence_order=1,
            created_at=datetime.utcnow(),
            created_by="test"
        )
        lst = PackageDocumentList(items=[doc], count=1)
        assert lst.count == 1

    def test_delivery_record_list(self):
        record = DeliveryRecord(
            id=uuid4(),
            package_id=uuid4(),
            delivery_method="ESG",
            delivery_destination="FDA",
            status=DeliveryStatus.INITIATED,
            initiated_at=datetime.utcnow(),
            delivered_by="system"
        )
        lst = DeliveryRecordList(items=[record], count=1)
        assert lst.count == 1
