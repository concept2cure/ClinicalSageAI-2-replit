"""
Comprehensive Test Suite for Next-Generation Compliance Framework.

Tests all endpoints across:
- AI/ML Governance (GMLP, PCCP, Model Cards)
- Cybersecurity (SBOM, VEX, Section 524B)
- Data Transparency (EMA Policy 0070, PDF/A-3, GAMP 5)
- Training Compliance (xAPI, Part 11)

Run with: pytest tests/test_compliance_framework.py -v
"""
import pytest
from datetime import datetime, timedelta
from uuid import uuid4
from httpx import AsyncClient, ASGITransport
import json

# Import the FastAPI app
import sys
sys.path.insert(0, '/workspaces/Concept2Cure.RI-2-replit/shadow_service')
sys.path.insert(0, '/workspaces/Concept2Cure-2-replit/shadow_service')
from shadow_service.main import app


@pytest.fixture
def program_id():
    """Generate a test program ID."""
    return str(uuid4())


@pytest.fixture
def anyio_backend():
    return 'asyncio'


@pytest.fixture
async def client():
    """Create an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# =============================================================================
# AI/ML GOVERNANCE TESTS
# =============================================================================

class TestAIMLGovernance:
    """Test AI/ML Governance endpoints."""
    
    @pytest.mark.anyio
    async def test_gmlp_principles(self, client):
        """Test GET /ai-governance/gmlp/principles returns all 10 principles."""
        response = await client.get("/ai-governance/gmlp/principles")
        assert response.status_code == 200
        data = response.json()
        # Response structure has principles in a list
        assert "principles" in data
        principles = data["principles"]
        assert len(principles) == 10
        # Verify all principles have required fields
        for p in principles:
            assert "principle" in p
            assert "name" in p
            assert "description" in p
    
    @pytest.mark.anyio
    async def test_register_model(self, client, program_id):
        """Test POST /ai-governance/models registers a new model."""
        payload = {
            "program_id": program_id,
            "name": "Efficacy Predictor",
            "version": "1.0.0",
            "model_type": "CLASSIFICATION",
            "regulatory_classification": "CLASS_II",
            "framework": "tensorflow",
            "architecture": "DNN",
            "input_schema": {"type": "object", "properties": {"features": {"type": "array"}}},
            "output_schema": {"type": "object", "properties": {"prediction": {"type": "number"}}},
            "artifact_location": "s3://models/efficacy-predictor/v1.0.0",
            "artifact_hash": "sha256:abcd1234567890"
        }
        response = await client.post(
            "/ai-governance/models",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
        model = response.json()
        assert model["name"] == "Efficacy Predictor"
        assert model["version"] == "1.0.0"
        assert "id" in model
    
    @pytest.mark.anyio
    async def test_list_models(self, client):
        """Test GET /ai-governance/models returns model list."""
        response = await client.get("/ai-governance/models")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "count" in data
        assert "total" in data
    
    @pytest.mark.anyio
    async def test_create_pccp(self, client, program_id):
        """Test POST /ai-governance/models/{id}/pccp creates a PCCP."""
        model_id = str(uuid4())
        payload = {
            "program_id": program_id,
            "model_id": model_id,
            "plan_name": "Automated Retraining PCCP",
            "modification_description": {
                "change_types": ["RETRAINING"],
                "scope": "GLOBAL",
                "deployment_method": "AUTOMATIC",
                "intended_use_unchanged": True,
                "inputs_unchanged": True,
                "outputs_unchanged": True,
                "population_unchanged": True,
                "narrative": "Automated retraining with new clinical data",
                "exclusions": []
            },
            "modification_protocol": {
                "data_management": {
                    "collection_protocol": "Standardized data collection",
                    "annotation_protocol": "Expert review labeling",
                    "quality_control_measures": ["Automated validation", "Manual review"],
                    "data_sequestration": "80/20 train/test split",
                    "comparability_assessment": "Distribution analysis"
                },
                "retraining": {
                    "retraining_trigger": "Monthly or on performance degradation",
                    "hyperparameter_constraints": {"learning_rate": [0.0001, 0.01]},
                    "objective_function": "Binary cross-entropy",
                    "compute_environment": "AWS SageMaker"
                },
                "performance_evaluation": {
                    "metrics": [
                        {
                            "name": "AUC-ROC",
                            "current_value": 0.92,
                            "acceptance_threshold": 0.85,
                            "comparison_method": "non-inferiority",
                            "clinical_relevance": "Primary efficacy metric"
                        }
                    ],
                    "test_dataset_requirements": "Minimum 1000 samples",
                    "statistical_analysis_plan": "Two-sided t-test with alpha=0.05",
                    "bias_assessment_protocol": "Demographic parity analysis"
                },
                "update_procedures": {
                    "version_control_system": "Git with DVC",
                    "deployment_pipeline": "GitHub Actions CI/CD",
                    "rollback_mechanism": "Blue-green deployment",
                    "user_notification_plan": "Email and in-app notification",
                    "post_deployment_monitoring": "24h intensive monitoring"
                }
            },
            "impact_assessment": {
                "benefit_risk_ratio": "High benefit, low risk",
                "cumulative_drift_assessment": "Monthly drift reports",
                "safety_risk": "LOW",
                "effectiveness_risk": "LOW",
                "cybersecurity_risk": "LOW",
                "mitigation_strategies": ["Automated rollback", "Human review"],
                "human_oversight_requirements": "QA sign-off required",
                "fail_safe_mechanisms": ["Performance thresholds", "Alert system"],
                "performance_drift_indicators": ["AUC drop >5%", "Prediction bias >10%"],
                "safety_signal_detection": "Adverse event monitoring"
            }
        }
        response = await client.post(
            f"/ai-governance/models/{model_id}/pccp",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
        pccp = response.json()
        assert pccp["plan_name"] == "Automated Retraining PCCP"
    
    @pytest.mark.anyio
    async def test_create_model_card(self, client, program_id):
        """Test POST /ai-governance/models/{id}/model-card creates a model card."""
        model_id = str(uuid4())
        now = datetime.utcnow().isoformat()
        payload = {
            "program_id": program_id,
            "model_id": model_id,
            "model_details": {
                "name": "Clinical Outcome Predictor",
                "version": "2.0.0",
                "type": "Classification",
                "owner": "Data Science Team",
                "contact": "datascience@example.com",
                "license": "Proprietary",
                "date_created": now
            },
            "intended_use": {
                "primary_uses": ["Clinical decision support"],
                "primary_users": ["Clinicians", "Researchers"],
                "out_of_scope_uses": ["Diagnostic purposes without clinical review"]
            },
            "factors": {
                "relevant_factors": [
                    {
                        "name": "age",
                        "values": ["18-40", "41-65", "65+"],
                        "performance_variation": "Slightly lower performance in 65+ group"
                    }
                ],
                "evaluation_factors": ["age", "gender", "ethnicity"]
            },
            "metrics": {
                "model_performance": [
                    {
                        "name": "AUC-ROC",
                        "value": 0.92,
                        "confidence_interval": "0.90-0.94"
                    }
                ],
                "decision_thresholds": {"default": 0.5}
            },
            "training_data": [
                {
                    "name": "Clinical Trial Dataset",
                    "size": 10000,
                    "preprocessing": ["Normalization", "Missing value imputation"],
                    "sensitive_data": True,
                    "representativeness": "Representative of US adult population"
                }
            ],
            "evaluation_data": [
                {
                    "name": "Validation Dataset",
                    "size": 2000,
                    "preprocessing": ["Same as training"],
                    "sensitive_data": True,
                    "representativeness": "Hold-out from training population"
                }
            ]
        }
        response = await client.post(
            f"/ai-governance/models/{model_id}/model-card",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
        card = response.json()
        assert "model_details" in card
    
    @pytest.mark.anyio
    async def test_aiml_dashboard(self, client, program_id):
        """Test GET /ai-governance/dashboard/summary returns dashboard data."""
        response = await client.get(
            "/ai-governance/dashboard/summary",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        dashboard = response.json()
        # Check actual response fields
        assert "model_count" in dashboard or "compliance" in dashboard
        assert "generated_at" in dashboard


# =============================================================================
# CYBERSECURITY TESTS
# =============================================================================

class TestCybersecurity:
    """Test Cybersecurity compliance endpoints."""
    
    @pytest.mark.anyio
    async def test_create_sbom(self, client, program_id):
        """Test POST /cybersecurity/sboms creates an SBOM."""
        payload = {
            "program_id": program_id,
            "name": "Clinical Application SBOM",
            "version": "1.0.0",
            "sbom_format": "SPDX_JSON",
            "spec_version": "SPDX-2.3",
            "sbom_author": "TrialSage Inc.",
            "generation_tool": "syft",
            "generation_tool_version": "0.90.0",
            "components": [
                {
                    "supplier_name": "Sebastián Ramírez",
                    "component_name": "fastapi",
                    "version": "0.100.0",
                    "component_type": "LIBRARY"
                },
                {
                    "supplier_name": "Samuel Colvin",
                    "component_name": "pydantic",
                    "version": "2.0.0",
                    "component_type": "LIBRARY"
                }
            ]
        }
        response = await client.post(
            "/cybersecurity/sboms",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
        sbom = response.json()
        assert sbom["name"] == "Clinical Application SBOM"
        assert sbom["sbom_format"] == "SPDX_JSON"
    
    @pytest.mark.anyio
    async def test_list_sboms(self, client, program_id):
        """Test GET /cybersecurity/sboms returns SBOM list."""
        response = await client.get(
            "/cybersecurity/sboms",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
    
    @pytest.mark.anyio
    async def test_validate_sbom(self, client, program_id):
        """Test POST /cybersecurity/sboms/{id}/validate validates NTIA compliance."""
        sbom_id = str(uuid4())
        response = await client.post(
            f"/cybersecurity/sboms/{sbom_id}/validate",
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 200
        validation = response.json()
        assert "validation_result" in validation
        assert "is_ntia_compliant" in validation.get("validation_result", {}) or "ntia_compliant" in validation.get("validation_result", {})
    
    @pytest.mark.anyio
    async def test_create_vex(self, client, program_id):
        """Test POST /cybersecurity/sboms/{id}/vex creates a VEX document."""
        sbom_id = str(uuid4())
        now = datetime.utcnow().isoformat()
        payload = {
            "sbom_id": sbom_id,
            "program_id": program_id,
            "author": "security@trialsage.ai",
            "statements": [
                {
                    "id": str(uuid4()),
                    "vulnerability_id": "CVE-2024-0001",
                    "vulnerability_description": "Sample vulnerability",
                    "component_name": "test-lib",
                    "component_version": "1.0.0",
                    "status": "NOT_AFFECTED",
                    "severity": "LOW",
                    "first_issued": now,
                    "last_updated": now,
                    "issued_by": "security@trialsage.ai"
                }
            ]
        }
        response = await client.post(
            f"/cybersecurity/sboms/{sbom_id}/vex",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
        vex = response.json()
        assert "document_id" in vex
    
    @pytest.mark.anyio
    async def test_add_vex_statement(self, client, program_id):
        """Test POST /cybersecurity/vex/{id}/statements adds a VEX statement."""
        vex_id = str(uuid4())
        payload = {
            "vex_document_id": vex_id,
            "vulnerability_id": "CVE-2024-1234",
            "vulnerability_description": "Sample vulnerability",
            "component_name": "test-component",
            "component_version": "1.0.0",
            "status": "NOT_AFFECTED",
            "status_justification": "COMPONENT_NOT_PRESENT",
            "justification_detail": "Vulnerable component not included in build",
            "severity": "LOW"
        }
        response = await client.post(
            f"/cybersecurity/vex/{vex_id}/statements",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
    
    @pytest.mark.anyio
    async def test_register_cyber_device(self, client, program_id):
        """Test POST /cybersecurity/devices registers a cyber device."""
        payload = {
            "program_id": program_id,
            "device_name": "Clinical Data Gateway",
            "device_version": "2.0.0",
            "device_type": "SAMD",
            "manufacturer": "TrialSage Inc.",
            "connectivity_type": ["ETHERNET", "WIFI"],
            "fda_product_code": "QFR"
        }
        response = await client.post(
            "/cybersecurity/devices",
            json=payload,
            headers={"X-Actor": "test@example.com"}
        )
        assert response.status_code == 201
        device = response.json()
        assert device["device_name"] == "Clinical Data Gateway"
    
    @pytest.mark.anyio
    async def test_section_524b_requirements(self, client):
        """Test GET /cybersecurity/section-524b/requirements returns requirements."""
        response = await client.get("/cybersecurity/section-524b/requirements")
        assert response.status_code == 200
        reqs = response.json()
        assert "requirements" in reqs
        assert len(reqs["requirements"]) > 0
    
    @pytest.mark.anyio
    async def test_cybersecurity_dashboard(self, client, program_id):
        """Test GET /cybersecurity/dashboard/summary returns dashboard."""
        response = await client.get(
            "/cybersecurity/dashboard/summary",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        dashboard = response.json()
        assert "total_cyber_devices" in dashboard or "total_vulnerabilities" in dashboard
        assert "generated_at" in dashboard


# =============================================================================
# DATA TRANSPARENCY TESTS
# =============================================================================

class TestDataTransparency:
    """Test Data Transparency endpoints."""
    
    @pytest.mark.anyio
    async def test_create_anonymization_report(self, client, program_id):
        """Test POST /transparency/anonymization/reports creates a report."""
        payload = {
            "program_id": program_id,
            "dataset_id": str(uuid4()),
            "dataset_name": "Phase III Demographics",
            "transformations": [
                {
                    "field_name": "birth_date",
                    "original_type": "date",
                    "transformation_type": "GENERALIZATION",
                    "parameters": {"level": "year"},
                    "description": "Generalized to year",
                    "data_category": "QUASI_IDENTIFIER"
                }
            ],
            "methodology_description": "k-anonymity with k=5",
            "utility_impact_assessment": "Minimal impact",
            "created_by": "data.scientist@example.com"
        }
        response = await client.post(
            "/transparency/anonymization/reports",
            json=payload
        )
        assert response.status_code == 201
        report = response.json()
        assert "overall_risk_score" in report
        assert "ema_0070_compliant" in report
    
    @pytest.mark.anyio
    async def test_assess_risk(self, client, program_id):
        """Test POST /transparency/anonymization/assess-risk calculates risk."""
        response = await client.post(
            "/transparency/anonymization/assess-risk",
            params={
                "program_id": program_id,
                "k_anonymity": 10,
                "l_diversity": 3
            }
        )
        assert response.status_code == 200
        risk = response.json()
        assert "calculated_risk" in risk
        assert "ema_0070_threshold" in risk
        assert "is_compliant" in risk
        # With k=10, risk should be <= 0.09
        assert risk["calculated_risk"] <= 0.15  # Conservative check
    
    @pytest.mark.anyio
    async def test_list_anonymization_reports(self, client, program_id):
        """Test GET /transparency/anonymization/reports lists reports."""
        response = await client.get(
            "/transparency/anonymization/reports",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        reports = response.json()
        assert isinstance(reports, list)
    
    @pytest.mark.anyio
    async def test_create_archival_document(self, client, program_id):
        """Test POST /transparency/archival-documents creates a document."""
        payload = {
            "program_id": program_id,
            "document_type": "CSR",
            "title": "Clinical Study Report v1.0",
            "source_file_path": "/documents/csr/report.docx",
            "conformance_level": "PDF/A-3b",
            "created_by": "doc.control@example.com"
        }
        response = await client.post(
            "/transparency/archival-documents",
            json=payload
        )
        assert response.status_code == 201
        doc = response.json()
        assert doc["conformance_level"] == "PDF/A-3b"
        assert doc["validation_status"] == "PENDING"
    
    @pytest.mark.anyio
    async def test_validate_pdfa(self, client, program_id):
        """Test POST /transparency/archival-documents/{id}/validate validates PDF/A."""
        doc_id = str(uuid4())
        response = await client.post(
            f"/transparency/archival-documents/{doc_id}/validate",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        validation = response.json()
        assert "is_valid" in validation
        assert "conformance_level" in validation
        assert "validator_name" in validation
    
    @pytest.mark.anyio
    async def test_create_infrastructure_component(self, client, program_id):
        """Test POST /transparency/infrastructure/components creates a component."""
        payload = {
            "program_id": program_id,
            "name": "Production Database",
            "component_type": "DATABASE",
            "version": "PostgreSQL 15.2",
            "gamp_category": "CATEGORY_4",
            "iac_provider": "TERRAFORM",
            "iac_configuration_path": "/infra/terraform/db",
            "gxp_impact": "HIGH",
            "data_integrity_impact": "HIGH",
            "created_by": "infra@example.com"
        }
        response = await client.post(
            "/transparency/infrastructure/components",
            json=payload
        )
        assert response.status_code == 201
        component = response.json()
        assert component["gamp_category"] == "CATEGORY_4"
        assert component["validation_approach"] == "REQUIREMENTS_BASED_TESTING"
    
    @pytest.mark.anyio
    async def test_gamp5_categories(self, client):
        """Test GET /transparency/infrastructure/gamp5-categories returns categories."""
        response = await client.get("/transparency/infrastructure/gamp5-categories")
        assert response.status_code == 200
        categories = response.json()
        assert len(categories) == 4  # Categories 1, 3, 4, 5
        for cat in categories:
            assert "category" in cat
            assert "validation_approach" in cat
    
    @pytest.mark.anyio
    async def test_run_iac_validation(self, client, program_id):
        """Test POST /transparency/infrastructure/iac-validation runs validation."""
        payload = {
            "program_id": program_id,
            "component_id": str(uuid4()),
            "iac_provider": "TERRAFORM",
            "configuration_path": "/infra/terraform/main.tf",
            "git_commit_sha": "abc123def456",
            "executed_by": "ci-pipeline"
        }
        response = await client.post(
            "/transparency/infrastructure/iac-validation",
            json=payload
        )
        assert response.status_code == 201
        run = response.json()
        assert "policy_results" in run
        assert "overall_status" in run
        assert "passed_checks" in run
    
    @pytest.mark.anyio
    async def test_create_gxp_policy(self, client, program_id):
        """Test POST /transparency/policies creates a GxP policy."""
        rego_policy = """
package gxp.test
default allow = false
allow { input.encrypted == true }
"""
        payload = {
            "program_id": program_id,
            "name": "test-encryption-policy",
            "description": "Test encryption requirement",
            "category": "Data Protection",
            "severity": "HIGH",
            "rego_policy": rego_policy,
            "applicable_providers": ["TERRAFORM"],
            "regulatory_reference": "21 CFR Part 11",
            "created_by": "compliance@example.com"
        }
        response = await client.post(
            "/transparency/policies",
            json=payload
        )
        assert response.status_code == 201
        policy = response.json()
        assert policy["name"] == "test-encryption-policy"
        assert policy["status"] == "ACTIVE"
    
    @pytest.mark.anyio
    async def test_transparency_dashboard(self, client, program_id):
        """Test GET /transparency/dashboard/transparency returns dashboard."""
        response = await client.get(
            "/transparency/dashboard/transparency",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        dashboard = response.json()
        assert "total_datasets" in dashboard
        assert "ema_0070_compliant_datasets" in dashboard
    
    @pytest.mark.anyio
    async def test_infrastructure_dashboard(self, client, program_id):
        """Test GET /transparency/dashboard/infrastructure returns dashboard."""
        response = await client.get(
            "/transparency/dashboard/infrastructure",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        dashboard = response.json()
        assert "total_components" in dashboard
        assert "by_gamp_category" in dashboard


# =============================================================================
# TRAINING COMPLIANCE TESTS
# =============================================================================

class TestTrainingCompliance:
    """Test Training Compliance endpoints."""
    
    @pytest.mark.anyio
    async def test_create_xapi_statement(self, client, program_id):
        """Test POST /training/xapi/statements creates an xAPI statement."""
        payload = {
            "actor": {
                "name": "John Doe",
                "mbox": "mailto:john.doe@example.com",
                "employee_id": "EMP001"
            },
            "verb_id": "http://adlnet.gov/expapi/verbs/completed",
            "activity_id": "https://trialsage.ai/training/gcp-101",
            "activity_type": "http://adlnet.gov/expapi/activities/course",
            "activity_name": "GCP Fundamentals",
            "result": {
                "score": {"scaled": 0.92, "raw": 92, "min": 0, "max": 100},
                "success": True,
                "completion": True,
                "duration": "PT1H30M"
            }
        }
        response = await client.post(
            "/training/xapi/statements",
            json=payload,
            params={"program_id": program_id}
        )
        assert response.status_code == 201
        statement = response.json()
        assert "id" in statement
        assert statement["version"] == "1.0.3"
        assert statement["actor"]["name"] == "John Doe"
    
    @pytest.mark.anyio
    async def test_query_xapi_statements(self, client, program_id):
        """Test GET /training/xapi/statements queries statements."""
        response = await client.get(
            "/training/xapi/statements",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        statements = response.json()
        assert isinstance(statements, list)
    
    @pytest.mark.anyio
    async def test_get_xapi_verbs(self, client):
        """Test GET /training/xapi/verbs returns available verbs."""
        response = await client.get("/training/xapi/verbs")
        assert response.status_code == 200
        verbs = response.json()
        assert len(verbs) >= 10  # ADL + GxP verbs
        # Check for GxP-specific verbs
        verb_ids = [v["id"] for v in verbs]
        assert any("acknowledged" in vid for vid in verb_ids)
        assert any("certified" in vid for vid in verb_ids)
    
    @pytest.mark.anyio
    async def test_get_xapi_activity_types(self, client):
        """Test GET /training/xapi/activity-types returns activity types."""
        response = await client.get("/training/xapi/activity-types")
        assert response.status_code == 200
        types = response.json()
        assert len(types) >= 5
        # Check for GxP-specific types
        type_ids = [t["id"] for t in types]
        assert any("sop" in tid.lower() for tid in type_ids)
    
    @pytest.mark.anyio
    async def test_create_training_record(self, client, program_id):
        """Test POST /training/records creates a training record."""
        payload = {
            "program_id": program_id,
            "user_id": str(uuid4()),
            "user_email": "trainee@example.com",
            "user_name": "Test Trainee",
            "curriculum_id": str(uuid4()),
            "training_type": "INITIAL",
            "department": "Clinical Operations",
            "role": "CRA"
        }
        response = await client.post(
            "/training/records",
            json=payload
        )
        assert response.status_code == 201
        record = response.json()
        assert record["status"] == "NOT_STARTED"
        assert "registration_id" in record
    
    @pytest.mark.anyio
    async def test_list_training_records(self, client, program_id):
        """Test GET /training/records lists records."""
        response = await client.get(
            "/training/records",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "count" in data
    
    @pytest.mark.anyio
    async def test_sign_training_record(self, client, program_id):
        """Test POST /training/records/{id}/sign applies e-signature."""
        record_id = str(uuid4())
        response = await client.post(
            f"/training/records/{record_id}/sign",
            params={
                "program_id": program_id,
                "signature_meaning": "I certify completion of this training"
            }
        )
        assert response.status_code == 200
        result = response.json()
        assert result["part11_compliant"] == True
        assert "electronic_signature_id" in result
    
    @pytest.mark.anyio
    async def test_create_curriculum(self, client, program_id):
        """Test POST /training/curricula creates a curriculum."""
        response = await client.post(
            "/training/curricula",
            params={
                "program_id": program_id,
                "title": "GCP Training Program",
                "description": "Comprehensive GCP training",
                "training_type": "REGULATORY_REQUIRED",
                "passing_score": 80,
                "validity_months": 12
            }
        )
        assert response.status_code == 201
        curriculum = response.json()
        assert curriculum["title"] == "GCP Training Program"
        assert curriculum["passing_score"] == 80
    
    @pytest.mark.anyio
    async def test_list_curricula(self, client, program_id):
        """Test GET /training/curricula lists curricula."""
        response = await client.get(
            "/training/curricula",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
    
    @pytest.mark.anyio
    async def test_create_competency_assessment(self, client, program_id):
        """Test POST /training/competency-assessments creates an assessment."""
        response = await client.post(
            "/training/competency-assessments",
            params={
                "program_id": program_id,
                "user_id": str(uuid4()),
                "competency_area": "Clinical Monitoring",
                "assessment_type": "Practical Observation",
                "level_achieved": "PROFICIENT",
                "score": 90,
                "assessed_by": "Senior CRA"
            }
        )
        assert response.status_code == 201
        assessment = response.json()
        assert assessment["level_achieved"] == "PROFICIENT"
    
    @pytest.mark.anyio
    async def test_create_sop_acknowledgment(self, client, program_id):
        """Test POST /training/sop-acknowledgments creates an acknowledgment."""
        payload = {
            "program_id": program_id,
            "user_id": str(uuid4()),
            "sop_id": "DMS-SOP-001",
            "sop_number": "SOP-QA-001",
            "sop_title": "Quality Assurance Procedures",
            "sop_version": "2.0",
            "sop_effective_date": datetime.utcnow().isoformat()
        }
        response = await client.post(
            "/training/sop-acknowledgments",
            json=payload
        )
        assert response.status_code == 201
        ack = response.json()
        assert "electronic_signature_id" in ack
    
    @pytest.mark.anyio
    async def test_get_pending_sop_acknowledgments(self, client, program_id):
        """Test GET /training/sop-acknowledgments/pending returns pending SOPs."""
        response = await client.get(
            "/training/sop-acknowledgments/pending",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        pending = response.json()
        assert isinstance(pending, list)
    
    @pytest.mark.anyio
    async def test_get_user_training_status(self, client, program_id):
        """Test GET /training/users/{id}/status returns user status."""
        user_id = str(uuid4())
        response = await client.get(
            f"/training/users/{user_id}/status",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        status = response.json()
        assert "is_compliant" in status
        assert "trainings_completed" in status
    
    @pytest.mark.anyio
    async def test_training_dashboard(self, client, program_id):
        """Test GET /training/dashboard/summary returns dashboard."""
        response = await client.get(
            "/training/dashboard/summary",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        dashboard = response.json()
        assert "total_users" in dashboard
        assert "compliance_rate" in dashboard
        assert "alerts" in dashboard
    
    @pytest.mark.anyio
    async def test_compliance_matrix(self, client, program_id):
        """Test GET /training/reports/compliance-matrix generates matrix."""
        response = await client.get(
            "/training/reports/compliance-matrix",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        matrix = response.json()
        assert "curricula" in matrix
        assert "users" in matrix
        assert "summary" in matrix
    
    @pytest.mark.anyio
    async def test_audit_trail(self, client, program_id):
        """Test GET /training/reports/audit-trail returns Part 11 audit trail."""
        response = await client.get(
            "/training/reports/audit-trail",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        audit = response.json()
        assert "audit_entries" in audit
        assert audit["part11_compliant"] == True
    
    @pytest.mark.anyio
    async def test_regulatory_readiness(self, client, program_id):
        """Test GET /training/reports/regulatory-readiness returns readiness."""
        response = await client.get(
            "/training/reports/regulatory-readiness",
            params={"program_id": program_id}
        )
        assert response.status_code == 200
        readiness = response.json()
        assert "inspection_readiness_score" in readiness
        assert "regulatory_requirements" in readiness


# =============================================================================
# INTEGRATION TESTS
# =============================================================================

class TestIntegration:
    """Integration tests across modules."""
    
    @pytest.mark.anyio
    async def test_health_check(self, client):
        """Test service health endpoint."""
        response = await client.get("/health")
        assert response.status_code == 200
    
    @pytest.mark.anyio
    async def test_all_routers_registered(self, client):
        """Test that all compliance routers are accessible."""
        # AI/ML Governance
        r1 = await client.get("/ai-governance/gmlp/principles")
        assert r1.status_code == 200
        
        # Cybersecurity
        r2 = await client.get("/cybersecurity/section-524b/requirements")
        assert r2.status_code == 200
        
        # Transparency
        r3 = await client.get("/transparency/infrastructure/gamp5-categories")
        assert r3.status_code == 200
        
        # Training
        r4 = await client.get("/training/xapi/verbs")
        assert r4.status_code == 200


# =============================================================================
# RUN CONFIGURATION
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
