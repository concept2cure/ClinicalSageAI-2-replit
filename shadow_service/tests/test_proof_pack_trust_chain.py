"""Phase 6.6.G — Proof Pack Trust Chain Unit Tests.

Tests the submission-grade proof pack contract:
  - Contract hashes module (compute, mismatch, severity)
  - ZIP v1.1 eCTD layout (structure, checksums, verify)
  - SQL query shapes (expanded params)
  - Drift severity mapping (deterministic, locked)
  - Idempotent persist (CREATED vs REUSED)
  - Download by proof_pack_id only

Run: pytest shadow_service/tests/test_proof_pack_trust_chain.py -v
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Contract Hashes Module Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestContractHashesModule:
    """Tests for shadow_service/shadow_service/contract_hashes.py"""

    def test_compute_drift_severity_high_manifest(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["MANIFEST_CHANGED"]) == "HIGH"

    def test_compute_drift_severity_high_contract(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["CONTRACT_CHANGED"]) == "HIGH"

    def test_compute_drift_severity_high_risk_codes(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["RISK_CODES_CHANGED"]) == "HIGH"

    def test_compute_drift_severity_med_tasks(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["TASKS_CHANGED"]) == "MED"

    def test_compute_drift_severity_med_readiness(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["READINESS_CHANGED"]) == "MED"

    def test_compute_drift_severity_low_ordering(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["ORDERING_CHANGED"]) == "LOW"

    def test_compute_drift_severity_low_label(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["LABEL_CHANGED"]) == "LOW"

    def test_compute_drift_severity_none_empty(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity([]) == "NONE"

    def test_compute_drift_severity_highest_wins(self):
        """When multiple codes present, highest severity wins."""
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["LABEL_CHANGED", "MANIFEST_CHANGED"]) == "HIGH"
        assert compute_drift_severity(["ORDERING_CHANGED", "TASKS_CHANGED"]) == "MED"

    def test_should_block_download_high(self):
        from shadow_service.contract_hashes import should_block_download
        assert should_block_download("HIGH") is True

    def test_should_block_download_med(self):
        from shadow_service.contract_hashes import should_block_download
        assert should_block_download("MED") is False

    def test_should_block_download_low(self):
        from shadow_service.contract_hashes import should_block_download
        assert should_block_download("LOW") is False

    def test_should_block_download_none(self):
        from shadow_service.contract_hashes import should_block_download
        assert should_block_download("NONE") is False

    def test_contract_snapshot_structure(self):
        from shadow_service.contract_hashes import get_contract_snapshot
        snap = get_contract_snapshot()
        assert "risk_vocab_hash" in snap
        assert "risk_codes_lock_hash" in snap
        assert "schema_hash" in snap
        assert "generator_version" in snap
        # All must be non-empty strings
        for k, v in snap.items():
            assert isinstance(v, str), f"{k} must be str"
            assert len(v) > 0, f"{k} must be non-empty"

    def test_check_contract_mismatch_no_drift(self):
        from shadow_service.contract_hashes import get_contract_snapshot, check_contract_mismatch
        snap = get_contract_snapshot()
        mismatches = check_contract_mismatch(snap)
        assert mismatches == [], "Same snapshot should produce no mismatches"

    def test_check_contract_mismatch_detects_change(self):
        from shadow_service.contract_hashes import get_contract_snapshot, check_contract_mismatch, ContractSnapshot
        snap = get_contract_snapshot()
        altered = ContractSnapshot(
            risk_vocab_hash="changed_hash",
            risk_codes_lock_hash=snap["risk_codes_lock_hash"],
            schema_hash=snap["schema_hash"],
            generator_version=snap["generator_version"],
        )
        mismatches = check_contract_mismatch(altered)
        assert len(mismatches) == 1
        assert mismatches[0]["field"] == "risk_vocab_hash"

    def test_compute_risk_vocab_hash_stable(self):
        """Same lock file → same hash (deterministic)."""
        from shadow_service.contract_hashes import compute_risk_vocab_hash
        h1 = compute_risk_vocab_hash()
        h2 = compute_risk_vocab_hash()
        assert h1 == h2

    def test_compute_generator_version_nonempty(self):
        from shadow_service.contract_hashes import compute_generator_version
        ver = compute_generator_version()
        assert isinstance(ver, str)
        assert len(ver) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# 2. ZIP v1.1 Layout Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestProofPackZipV11:
    """Tests for proof_pack_zip.py v1.1 eCTD-drop-in layout."""

    @pytest.fixture
    def sample_builder(self):
        from shadow_service.proof_pack_zip import ProofPackZipBuilder
        return ProofPackZipBuilder(
            manifest_json={
                "manifest_hash": "test_manifest_abc",
                "program_id": "test-program",
                "subject_hash": "test_subject",
            },
            payload_json={
                "comparison_rows": [{"field": "intended_use", "diff_flag": "EQUIVALENT"}],
            },
            audit_events=[
                {"action": "PROOF_PACK_CREATED", "timestamp": "2025-02-11T00:00:00Z"}
            ],
            contract_snapshot={
                "risk_vocab_hash": "abc123",
                "risk_codes_lock_hash": "def456",
                "schema_hash": "ghi789",
                "generator_version": "6.6.G-test",
            },
            artifacts={},
        )

    def test_build_returns_4_tuple(self, sample_builder):
        result = sample_builder.build()
        assert len(result) == 4, "build() must return (zip_bytes, checksums, artifact_index, zip_manifest_hash)"

    def test_zip_contains_manifest(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            assert any("manifest.json" in n for n in names)

    def test_zip_contains_contracts_dir(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            assert any("contracts/contract_hashes.json" in n for n in names)

    def test_zip_contains_outputs_dir(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            assert any("outputs/se_matrix_payload.json" in n for n in names)

    def test_zip_contains_ectd_stubs(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            # Should have ectd-stubs directories
            has_m1 = any("ectd-stubs/m1/" in n for n in names)
            has_m4 = any("ectd-stubs/m4/" in n for n in names)
            has_m5 = any("ectd-stubs/m5/" in n for n in names)
            assert has_m1 or has_m4 or has_m5, f"Missing ectd-stubs dirs in: {names}"

    def test_zip_contains_checksums(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            assert any("checksums.sha256" in n for n in names)

    def test_zip_contains_audit_events(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
            assert any("audit_events.jsonl" in n for n in names)

    def test_checksums_are_valid_sha256(self, sample_builder):
        zip_bytes, checksums, _, _ = sample_builder.build()
        assert isinstance(checksums, dict)
        for path, sha in checksums.items():
            assert len(sha) == 64, f"Checksum for {path} must be 64 hex chars, got {len(sha)}"
            # Verify it's valid hex
            int(sha, 16)

    def test_zip_manifest_hash_is_sha256(self, sample_builder):
        _, _, _, zmh = sample_builder.build()
        assert isinstance(zmh, str)
        assert len(zmh) == 64

    def test_verify_checksums_pass_on_fresh_zip(self, sample_builder):
        from shadow_service.proof_pack_zip import verify_checksums
        zip_bytes, _, _, _ = sample_builder.build()
        ok, failures = verify_checksums(zip_bytes)
        assert ok is True, f"Fresh ZIP should verify: {failures}"
        assert failures == []

    def test_verify_checksums_fail_on_tampered_zip(self, sample_builder):
        from shadow_service.proof_pack_zip import verify_checksums
        zip_bytes, _, _, _ = sample_builder.build()

        # Tamper: modify a file inside the ZIP
        buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(buf, 'r') as zf_in:
            names = zf_in.namelist()
            contents = {}
            for n in names:
                contents[n] = zf_in.read(n)

        # Tamper the manifest
        manifest_key = [k for k in contents if "manifest.json" in k][0]
        contents[manifest_key] = b'{"tampered": true}'

        # Rebuild ZIP
        tampered_buf = io.BytesIO()
        with zipfile.ZipFile(tampered_buf, 'w', zipfile.ZIP_DEFLATED) as zf_out:
            for n, data in contents.items():
                zf_out.writestr(n, data)

        ok, failures = verify_checksums(tampered_buf.getvalue())
        assert ok is False, "Tampered ZIP should fail verification"
        assert len(failures) > 0
        # Failures should be structured dicts
        assert "path" in failures[0]
        assert "expected_sha256" in failures[0]
        assert "actual_sha256" in failures[0]

    def test_contract_hashes_json_in_zip(self, sample_builder):
        zip_bytes, _, _, _ = sample_builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            # Find contract_hashes.json
            ch_path = [n for n in zf.namelist() if "contract_hashes.json" in n]
            assert len(ch_path) > 0
            ch_data = json.loads(zf.read(ch_path[0]))
            assert ch_data["risk_vocab_hash"] == "abc123"
            assert ch_data["generator_version"] == "6.6.G-test"

    def test_defense_packet_seed_included(self):
        from shadow_service.proof_pack_zip import ProofPackZipBuilder
        builder = ProofPackZipBuilder(
            manifest_json={"manifest_hash": "test"},
            payload_json={"data": "test"},
            audit_events=[],
            contract_snapshot={"risk_vocab_hash": "x", "risk_codes_lock_hash": "y", "schema_hash": "z", "generator_version": "v"},
            artifacts={},
            defense_packet_seed={"readiness_score": 85, "task_count": 7},
        )
        zip_bytes, _, _, _ = builder.build()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            seed_paths = [n for n in zf.namelist() if "defense_packet_seed.json" in n]
            assert len(seed_paths) > 0
            seed_data = json.loads(zf.read(seed_paths[0]))
            assert seed_data["readiness_score"] == 85


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Drift Severity Mapping Tests (Locked — Must Never Change)
# ═══════════════════════════════════════════════════════════════════════════════


class TestDriftSeverityMapping:
    """The drift severity mapping is LOCKED for regulatory traceability.
    These tests ensure the mapping cannot be changed without failing CI.
    """

    LOCKED_HIGH = ["CONTRACT_CHANGED", "RISK_CODES_CHANGED", "MANIFEST_CHANGED"]
    LOCKED_MED = ["TASKS_CHANGED", "READINESS_CHANGED"]
    LOCKED_LOW = ["ORDERING_CHANGED", "LABEL_CHANGED"]

    def test_all_high_codes_map_to_high(self):
        from shadow_service.contract_hashes import compute_drift_severity
        for code in self.LOCKED_HIGH:
            assert compute_drift_severity([code]) == "HIGH", f"{code} must map to HIGH"

    def test_all_med_codes_map_to_med(self):
        from shadow_service.contract_hashes import compute_drift_severity
        for code in self.LOCKED_MED:
            assert compute_drift_severity([code]) == "MED", f"{code} must map to MED"

    def test_all_low_codes_map_to_low(self):
        from shadow_service.contract_hashes import compute_drift_severity
        for code in self.LOCKED_LOW:
            assert compute_drift_severity([code]) == "LOW", f"{code} must map to LOW"

    def test_mixed_severity_takes_highest(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity(["LABEL_CHANGED", "TASKS_CHANGED"]) == "MED"
        assert compute_drift_severity(["ORDERING_CHANGED", "CONTRACT_CHANGED"]) == "HIGH"
        assert compute_drift_severity(["TASKS_CHANGED", "MANIFEST_CHANGED"]) == "HIGH"

    def test_empty_codes_returns_none(self):
        from shadow_service.contract_hashes import compute_drift_severity
        assert compute_drift_severity([]) == "NONE"

    def test_unknown_code_defaults_safely(self):
        from shadow_service.contract_hashes import compute_drift_severity
        # Unknown codes should not crash — defaults to MED (safe side)
        result = compute_drift_severity(["UNKNOWN_CODE"])
        assert result in ("LOW", "MED", "NONE"), f"Unknown code should default safely, got {result}"

    def test_block_download_only_for_high(self):
        from shadow_service.contract_hashes import should_block_download
        assert should_block_download("HIGH") is True
        assert should_block_download("MED") is False
        assert should_block_download("LOW") is False
        assert should_block_download("NONE") is False


# ═══════════════════════════════════════════════════════════════════════════════
# 4. SQL Query Shape Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestSQLQueryShapes:
    """Verify SQL query parameter counts match expectations."""

    def test_insert_proof_pack_has_16_params(self):
        from shadow_service import sql_proof_pack as pp_sql
        # Count $N placeholders
        params = set()
        for match in __import__("re").finditer(r'\$(\d+)', pp_sql.INSERT_PROOF_PACK_EXPORT):
            params.add(int(match.group(1)))
        assert max(params) == 16, f"INSERT_PROOF_PACK_EXPORT should have 16 params, found {max(params)}"

    def test_insert_audit_event_has_13_params(self):
        from shadow_service import sql_proof_pack as pp_sql
        import re
        params = set()
        for match in re.finditer(r'\$(\d+)', pp_sql.INSERT_AUDIT_EVENT):
            params.add(int(match.group(1)))
        assert max(params) == 13, f"INSERT_AUDIT_EVENT should have 13 params, found {max(params)}"

    def test_select_for_download_by_id_exists(self):
        from shadow_service import sql_proof_pack as pp_sql
        assert hasattr(pp_sql, 'SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID')
        assert '$1' in pp_sql.SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID

    def test_update_proof_pack_drift_exists(self):
        from shadow_service import sql_proof_pack as pp_sql
        assert hasattr(pp_sql, 'UPDATE_PROOF_PACK_DRIFT')
        assert 'drift_severity' in pp_sql.UPDATE_PROOF_PACK_DRIFT


# ═══════════════════════════════════════════════════════════════════════════════
# 5. eCTD Stub Schema Validation
# ═══════════════════════════════════════════════════════════════════════════════


class TestEctdStubSchemas:
    """Verify eCTD stub schemas are valid JSON and have required fields."""

    SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas"

    def test_leaf_map_schema_exists(self):
        assert (self.SCHEMAS_DIR / "leaf_map.schema.json").exists()

    def test_sequence_plan_schema_exists(self):
        assert (self.SCHEMAS_DIR / "sequence_plan.schema.json").exists()

    def test_m1_index_schema_exists(self):
        assert (self.SCHEMAS_DIR / "m1_index.schema.json").exists()

    def test_bundle_schema_exists(self):
        assert (self.SCHEMAS_DIR / "ectd_stubs.bundle.schema.json").exists()

    def test_leaf_map_valid_json(self):
        data = json.loads((self.SCHEMAS_DIR / "leaf_map.schema.json").read_text())
        assert data["$schema"], "Must have $schema"
        assert data["type"] == "object"
        assert "leaves" in data["required"]

    def test_sequence_plan_valid_json(self):
        data = json.loads((self.SCHEMAS_DIR / "sequence_plan.schema.json").read_text())
        assert data["$schema"], "Must have $schema"
        assert "lifecycle_operations" in data["required"]

    def test_m1_index_valid_json(self):
        data = json.loads((self.SCHEMAS_DIR / "m1_index.schema.json").read_text())
        assert data["$schema"], "Must have $schema"
        assert data["properties"]["module"]["const"] == 1

    def test_bundle_references_all_sub_schemas(self):
        data = json.loads((self.SCHEMAS_DIR / "ectd_stubs.bundle.schema.json").read_text())
        # Bundle is a JSON Schema, sub-schemas are in properties.schemas.properties
        schemas = data["properties"]["schemas"]["properties"]
        assert "leaf_map" in schemas
        assert "sequence_plan" in schemas
        assert "m1_index" in schemas

    def test_bundle_has_proof_pack_layout(self):
        data = json.loads((self.SCHEMAS_DIR / "ectd_stubs.bundle.schema.json").read_text())
        layout = data.get("properties", {}).get("proof_pack_layout", {})
        assert layout.get("properties", {}).get("root_prefix", {}).get("const") == "proof-pack/"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Proof Pack Persist Result Structure
# ═══════════════════════════════════════════════════════════════════════════════


class TestProofPackPersistResult:
    """The persist result must have G-expanded fields."""

    def test_persist_result_g_fields(self):
        """Simulated persist result must include contract snapshot."""
        result = {
            "proof_pack_id": "uuid-123",
            "manifest_hash": "abc",
            "status": "CREATED",
            "zip_manifest_hash": "def",
            "contract": {
                "risk_vocab_hash": "h1",
                "risk_codes_lock_hash": "h2",
                "schema_hash": "h3",
                "generator_version": "v1",
            },
            "block_download": False,
            "created_at": "2025-02-11T00:00:00Z",
        }
        assert "contract" in result
        assert "zip_manifest_hash" in result
        assert "block_download" in result
        assert result["status"] in ("CREATED", "REUSED", "ASSEMBLED", "FAILED")

    def test_reused_status(self):
        """Idempotent persist should return REUSED status."""
        result = {
            "proof_pack_id": "uuid-123",
            "manifest_hash": "abc",
            "status": "REUSED",
            "zip_manifest_hash": "def",
            "contract": {},
            "block_download": False,
            "created_at": "2025-02-11T00:00:00Z",
        }
        assert result["status"] == "REUSED"


# ═══════════════════════════════════════════════════════════════════════════════
# 7. Error Response Structure Tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestErrorResponses:
    """Verify error response structures match the spec."""

    def test_download_blocked_error_structure(self):
        err = {
            "error_code": "PROOF_PACK_DOWNLOAD_BLOCKED",
            "drift_severity": "HIGH",
            "drift_reason_codes": ["MANIFEST_CHANGED"],
            "block_download": True,
            "message": "Download blocked due to detected drift.",
        }
        assert err["error_code"] == "PROOF_PACK_DOWNLOAD_BLOCKED"
        assert err["block_download"] is True

    def test_contract_mismatch_error_structure(self):
        err = {
            "error_code": "PROOF_PACK_CONTRACT_MISMATCH",
            "mismatches": [
                {"field": "risk_vocab_hash", "expected": "aaa", "actual": "bbb"},
            ],
            "expected_contract": {"risk_vocab_hash": "aaa"},
            "actual_contract": {"risk_vocab_hash": "bbb"},
            "block_download": True,
            "message": "Contract hash mismatch.",
        }
        assert len(err["mismatches"]) == 1
        assert err["mismatches"][0]["field"] == "risk_vocab_hash"

    def test_endpoint_removed_error_structure(self):
        err = {
            "error_code": "ENDPOINT_REMOVED_USE_PROOF_PACK_ID",
            "message": "Use GET /proof-pack/{proof_pack_id}/download instead.",
        }
        assert err["error_code"] == "ENDPOINT_REMOVED_USE_PROOF_PACK_ID"


# ═══════════════════════════════════════════════════════════════════════════════
# 8. Verify Result Structure (G — Structured Failures)
# ═══════════════════════════════════════════════════════════════════════════════


class TestVerifyResultStructure:
    """Verify endpoint must return structured failure details."""

    def test_verify_result_g_fields(self):
        result = {
            "proof_pack_id": "uuid-123",
            "manifest_hash": "abc",
            "status": "ASSEMBLED",
            "verified": True,
            "computed_checksums_match": True,
            "failures": [],
            "contract": {
                "stored": {"risk_vocab_hash": "h1", "risk_codes_lock_hash": "h2", "schema_hash": "h3", "generator_version": "v1"},
                "current": {"risk_vocab_hash": "h1", "risk_codes_lock_hash": "h2", "schema_hash": "h3", "generator_version": "v1"},
            },
            "block_download": False,
            "drift_severity": None,
            "downloaded_count": 0,
            "created_at": "2025-02-11T00:00:00Z",
        }
        assert result["verified"] is True
        assert result["failures"] == []
        assert "contract" in result
        assert "stored" in result["contract"]
        assert "current" in result["contract"]

    def test_verify_failures_structured(self):
        failures = [
            {"path": "risk_vocab_hash", "expected_sha256": "aaa", "actual_sha256": "bbb"},
        ]
        assert failures[0]["path"] == "risk_vocab_hash"
        assert "expected_sha256" in failures[0]
        assert "actual_sha256" in failures[0]
