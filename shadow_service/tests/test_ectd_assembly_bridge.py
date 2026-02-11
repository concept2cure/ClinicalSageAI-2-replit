"""Phase 6.6.H — eCTD Assembly Bridge Tests.

Tests the complete Phase 6.6.H implementation:
  1. AJV bundle validation (valid data passes, invalid data fails)
  2. Runtime eCTD bundle validation (Python jsonschema)
  3. Contract snapshot in ZIP (snapshot.json + .sha256)
  4. Sequence Builder v0 (0000/ folder layout)
  5. Leaf Registry (manifest of every leaf)
  6. Gateway packaging (deterministic ZIP, verify-after-build)
  7. Runtime hard-stop enforcement (persist + download blocked on invalid)

Run: pytest shadow_service/tests/test_ectd_assembly_bridge.py -v
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import tempfile
import zipfile
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures — shared test data
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_LEAF_MAP = {
    "version": "1.0.0",
    "leaves": [
        {
            "leaf_id": "m4-2-1-se-matrix",
            "title": "Substantial Equivalence Matrix",
            "module": 4,
            "section": "4.2.1",
            "artifact_path": "proof-pack/outputs/se_matrix_payload.json",
            "mime_type": "application/json",
        },
        {
            "leaf_id": "m4-2-2-defense-packet",
            "title": "510(k) Defense Packet Seed",
            "module": 4,
            "section": "4.2.2",
            "artifact_path": "proof-pack/outputs/defense_packet_seed.json",
            "mime_type": "application/json",
        },
        {
            "leaf_id": "m5-1-1-toxicity-profile",
            "title": "Predicate Toxicity Profile",
            "module": 5,
            "section": "5.1.1",
            "artifact_path": "proof-pack/outputs/toxicity_profile.json",
            "mime_type": "application/json",
        },
        {
            "leaf_id": "m1-1-1-cover-letter",
            "title": "Cover Letter (Placeholder)",
            "module": 1,
            "section": "1.1",
            "artifact_path": "proof-pack/ectd-stubs/m1/cover-letter.placeholder",
            "mime_type": "application/octet-stream",
        },
    ],
}

SAMPLE_SEQUENCE_PLAN = {
    "version": "1.0.0",
    "sequence_number": "0000",
    "sequence_type": "initial",
    "submission_type": "510k",
    "lifecycle_operations": [
        {"leaf_id": "m4-2-1-se-matrix", "operation": "new"},
        {"leaf_id": "m4-2-2-defense-packet", "operation": "new"},
        {"leaf_id": "m5-1-1-toxicity-profile", "operation": "new"},
        {"leaf_id": "m1-1-1-cover-letter", "operation": "new"},
    ],
}

SAMPLE_M1_INDEX = {
    "version": "1.0.0",
    "module": 1,
    "region": "us",
    "entries": [
        {
            "section": "1.1",
            "title": "Cover Letter",
            "leaf_id": "m1-1-1-cover-letter",
            "artifact_path": "proof-pack/ectd-stubs/m1/cover-letter.placeholder",
            "required": True,
            "placeholder": True,
        },
    ],
}

SAMPLE_CONTRACT = {
    "risk_vocab_hash": "a1b2c3d4" * 8,
    "risk_codes_lock_hash": "a1b2c3d4" * 8,
    "schema_hash": "e5f6g7h8" * 8,
    "generator_version": "6.6.H-test",
}

SAMPLE_ARTIFACTS = {
    "m4-2-1-se-matrix": b'{"matrix": "test"}',
    "m4-2-2-defense-packet": b'{"defense": "test"}',
    "m5-1-1-toxicity-profile": b'{"toxicity": "test"}',
}


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Bundle Validation (Python jsonschema)
# ═══════════════════════════════════════════════════════════════════════════════


class TestBundleValidation:
    """Tests for contract_hashes.validate_ectd_bundle()."""

    def test_valid_bundle_passes_validation(self):
        """Valid bundle data passes AJV-equivalent Python validation."""
        from shadow_service.contract_hashes import validate_ectd_bundle
        valid, errors = validate_ectd_bundle()
        # Should pass since the real bundle data file exists and is valid
        assert valid is True, f"Expected valid but got errors: {errors}"
        assert errors == []

    def test_missing_bundle_data_fails(self):
        """Missing bundle data file returns invalid."""
        from shadow_service.contract_hashes import validate_ectd_bundle, BUNDLE_DATA_PATH
        with patch.object(Path, "exists", return_value=False):
            # Patch only the BUNDLE_DATA_PATH.exists
            import shadow_service.contract_hashes as ch
            original = ch.BUNDLE_DATA_PATH
            ch.BUNDLE_DATA_PATH = Path("/nonexistent/bundle.json")
            try:
                valid, errors = validate_ectd_bundle()
                assert valid is False
                assert any("missing" in e.lower() or "not found" in e.lower() or "nonexistent" in e.lower() for e in errors)
            finally:
                ch.BUNDLE_DATA_PATH = original

    def test_invalid_bundle_data_fails(self):
        """Bundle data with missing required field fails validation."""
        from shadow_service.contract_hashes import validate_ectd_bundle
        import shadow_service.contract_hashes as ch

        # Create a temp file with invalid bundle data (missing 'version')
        invalid_data = {"bundle_hash": "abc", "schemas": {}}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(invalid_data, f)
            temp_path = f.name

        original = ch.BUNDLE_DATA_PATH
        ch.BUNDLE_DATA_PATH = Path(temp_path)
        try:
            valid, errors = validate_ectd_bundle()
            assert valid is False
            assert len(errors) > 0
        finally:
            ch.BUNDLE_DATA_PATH = original
            os.unlink(temp_path)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Contract Snapshot in ZIP
# ═══════════════════════════════════════════════════════════════════════════════


class TestContractSnapshotInZip:
    """Tests for proof_pack_zip.py — contract_snapshot.json + .sha256."""

    def test_contract_snapshot_files_in_zip(self):
        """ZIP contains contract_snapshot.json and contract_snapshot.sha256."""
        from shadow_service.proof_pack_zip import ProofPackZipBuilder

        builder = ProofPackZipBuilder(
            manifest_json={"test": "manifest"},
            payload_json={"test": "payload"},
            audit_events=[],
            contract_snapshot=SAMPLE_CONTRACT,
        )
        zip_bytes, checksums, artifact_index, _ = builder.build()

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            names = zf.namelist()
            assert "proof-pack/contracts/contract_snapshot.json" in names
            assert "proof-pack/contracts/contract_snapshot.sha256" in names

            # Verify snapshot content is canonical JSON
            snapshot_data = zf.read("proof-pack/contracts/contract_snapshot.json")
            snapshot = json.loads(snapshot_data)
            assert snapshot == SAMPLE_CONTRACT

            # Verify .sha256 contains the hash of contract_snapshot.json
            hash_line = zf.read("proof-pack/contracts/contract_snapshot.sha256").decode("utf-8")
            expected_hash = hashlib.sha256(snapshot_data).hexdigest()
            assert hash_line.startswith(expected_hash)
            assert "contract_snapshot.json" in hash_line

    def test_contract_hashes_json_still_present(self):
        """contract_hashes.json is still written alongside the new files."""
        from shadow_service.proof_pack_zip import ProofPackZipBuilder

        builder = ProofPackZipBuilder(
            manifest_json={"test": "m"},
            payload_json={"test": "p"},
            audit_events=[],
            contract_snapshot=SAMPLE_CONTRACT,
        )
        zip_bytes, _, _, _ = builder.build()

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert "proof-pack/contracts/contract_hashes.json" in zf.namelist()


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Sequence Builder v0
# ═══════════════════════════════════════════════════════════════════════════════


class TestSequenceBuilder:
    """Tests for ectd_sequence_builder.build_sequence_0000()."""

    def test_builds_sequence_folder_layout(self):
        """Sequence builder creates expected folder structure."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000

        files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            m1_index=SAMPLE_M1_INDEX,
        )

        assert len(files) > 0
        paths = set(files.keys())

        # Must have index.xml
        assert "sequence/0000/index.xml" in paths

        # Must have module directories
        m4_files = [p for p in paths if p.startswith("sequence/0000/m4/")]
        m5_files = [p for p in paths if p.startswith("sequence/0000/m5/")]
        m1_files = [p for p in paths if p.startswith("sequence/0000/m1/")]
        assert len(m4_files) >= 2  # SE matrix + defense packet
        assert len(m5_files) >= 1  # toxicity profile
        assert len(m1_files) >= 1  # cover letter

    def test_index_xml_is_well_formed(self):
        """index.xml contains valid XML structure."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000

        files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
        )

        index_xml = files["sequence/0000/index.xml"].decode("utf-8")
        assert '<?xml version="1.0"' in index_xml
        assert "<ectd:ectd" in index_xml
        assert "<submission" in index_xml
        assert "<sequence-number>0000</sequence-number>" in index_xml
        assert 'type="510k"' in index_xml

    def test_index_xml_uses_per_leaf_operations(self):
        """Each leaf in index.xml gets its per-leaf operation, not sequence_type."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000
        import xml.etree.ElementTree as ET

        # Create a sequence plan with mixed operations to verify per-leaf behavior
        mixed_plan = {
            "version": "1.0.0",
            "sequence_number": "0001",
            "sequence_type": "supplement",
            "submission_type": "510k",
            "lifecycle_operations": [
                {"leaf_id": "m4-2-1-se-matrix", "operation": "replace"},
                {"leaf_id": "m4-2-2-defense-packet", "operation": "new"},
                {"leaf_id": "m5-1-1-toxicity-profile", "operation": "append"},
                {"leaf_id": "m1-1-1-cover-letter", "operation": "delete"},
            ],
        }

        files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=mixed_plan,
        )

        index_xml = files["sequence/0001/index.xml"].decode("utf-8")

        # Parse XML — strip the namespace for easier querying
        root = ET.fromstring(index_xml)
        ns = {"xlink": "http://www.w3.org/1999/xlink"}
        leaves = root.findall(".//{urn:hl7-org:v3}leaf", namespaces=None)
        # ElementTree doesn't auto-resolve the default ns; use string find instead
        leaf_ops = {}
        for line in index_xml.splitlines():
            if "<leaf " in line:
                # Extract ID and operation via string parsing
                import re
                id_match = re.search(r'ID="([^"]+)"', line)
                op_match = re.search(r'operation="([^"]+)"', line)
                if id_match and op_match:
                    leaf_ops[id_match.group(1)] = op_match.group(1)

        # Verify each leaf has the correct per-leaf operation (NOT "supplement")
        assert leaf_ops["m4-2-1-se-matrix"] == "replace"
        assert leaf_ops["m4-2-2-defense-packet"] == "new"
        assert leaf_ops["m5-1-1-toxicity-profile"] == "append"
        assert leaf_ops["m1-1-1-cover-letter"] == "delete"

        # None should have sequence_type="supplement" (unless it was the per-leaf op)
        assert "supplement" not in leaf_ops.values(), \
            "Leaf operations should be per-leaf, not sequence_type fallback"

    def test_placeholder_stubs_for_missing_artifacts(self):
        """Leaves without artifact bytes get placeholder stubs."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000

        files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts={},  # No actual content
        )

        # All leaves should still have files (placeholders)
        for path, data in files.items():
            if path.endswith(".xml") or path.endswith(".json") and "contract" in path:
                continue
            content = json.loads(data)
            if "placeholder" in content:
                assert content["placeholder"] is True

    def test_actual_artifacts_included(self):
        """When artifacts are provided, they are used instead of placeholders."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000

        files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
        )

        # m4-2-1-se-matrix should use the actual content
        m4_files = {p: d for p, d in files.items() if "4-2-1" in p}
        assert len(m4_files) == 1
        path, data = list(m4_files.items())[0]
        content = json.loads(data)
        assert content == {"matrix": "test"}

    def test_contract_snapshot_embedded(self):
        """Contract snapshot is stored in the sequence directory."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000

        files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            contract_snapshot=SAMPLE_CONTRACT,
        )

        assert "sequence/0000/contract_snapshot.json" in files
        content = json.loads(files["sequence/0000/contract_snapshot.json"])
        assert content == SAMPLE_CONTRACT


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Leaf Registry
# ═══════════════════════════════════════════════════════════════════════════════


class TestLeafRegistry:
    """Tests for leaf_registry module."""

    def test_builds_registry_manifest(self):
        """Registry manifest contains all leaves with expected fields."""
        from shadow_service.leaf_registry import build_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
        )

        assert registry["version"] == "1.0.0"
        assert registry["sequence_number"] == "0000"
        assert registry["submission_type"] == "510k"
        assert registry["total_leaves"] == len(SAMPLE_LEAF_MAP["leaves"])
        assert len(registry["leaves"]) == len(SAMPLE_LEAF_MAP["leaves"])

    def test_leaf_entries_have_required_fields(self):
        """Each leaf entry has all required fields."""
        from shadow_service.leaf_registry import build_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
        )

        required_fields = {
            "leaf_id", "title", "module", "section", "artifact_path",
            "checksum_sha256", "size_bytes", "lifecycle_operation",
            "mime_type", "has_content",
        }
        for leaf in registry["leaves"]:
            assert required_fields.issubset(leaf.keys()), f"Missing fields in {leaf['leaf_id']}"

    def test_checksums_computed_for_artifacts(self):
        """Leaves with artifacts have correct checksums."""
        from shadow_service.leaf_registry import build_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
        )

        for leaf in registry["leaves"]:
            if leaf["has_content"]:
                assert leaf["checksum_sha256"] is not None
                assert len(leaf["checksum_sha256"]) == 64
                assert leaf["size_bytes"] > 0

    def test_lifecycle_operations_mapped(self):
        """Each leaf gets its lifecycle operation from sequence_plan."""
        from shadow_service.leaf_registry import build_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
        )

        for leaf in registry["leaves"]:
            assert leaf["lifecycle_operation"] == "new"

    def test_leaves_sorted_by_module_section(self):
        """Registry leaves are sorted deterministically."""
        from shadow_service.leaf_registry import build_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
        )

        modules = [leaf["module"] for leaf in registry["leaves"]]
        assert modules == sorted(modules)

    def test_verify_valid_registry(self):
        """verify_leaf_registry passes for consistent data."""
        from shadow_service.leaf_registry import build_leaf_registry, verify_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
        )

        ok, errors = verify_leaf_registry(registry, SAMPLE_ARTIFACTS)
        assert ok is True, f"Unexpected errors: {errors}"

    def test_verify_detects_checksum_mismatch(self):
        """verify_leaf_registry catches tampered artifacts."""
        from shadow_service.leaf_registry import build_leaf_registry, verify_leaf_registry

        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
        )

        # Tamper with an artifact
        tampered = dict(SAMPLE_ARTIFACTS)
        tampered["m4-2-1-se-matrix"] = b'{"matrix": "TAMPERED"}'

        ok, errors = verify_leaf_registry(registry, tampered)
        assert ok is False
        assert any("checksum mismatch" in e for e in errors)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Gateway Packaging
# ═══════════════════════════════════════════════════════════════════════════════


class TestGatewayPackaging:
    """Tests for ectd_gateway.GatewayPackageBuilder."""

    def test_builds_deterministic_zip(self):
        """Gateway ZIP is deterministic (same inputs → same checksums)."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder1 = GatewayPackageBuilder()
        builder1.add_file("a.txt", b"hello")
        builder1.add_file("b.txt", b"world")
        _, manifest1 = builder1.build()

        builder2 = GatewayPackageBuilder()
        builder2.add_file("b.txt", b"world")  # different order
        builder2.add_file("a.txt", b"hello")
        _, manifest2 = builder2.build()

        # Same entries regardless of insertion order
        entries1 = {e["path"]: e["sha256"] for e in manifest1["entries"]}
        entries2 = {e["path"]: e["sha256"] for e in manifest2["entries"]}
        assert entries1 == entries2

    def test_rejects_absolute_paths(self):
        """Absolute paths are rejected."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        with pytest.raises(ValueError, match="Unsafe path"):
            builder.add_file("/etc/passwd", b"nope")

    def test_rejects_path_traversal(self):
        """Path traversal attempts are rejected."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        with pytest.raises(ValueError, match="Unsafe path"):
            builder.add_file("../../../etc/passwd", b"nope")

    def test_verify_passes_for_valid_zip(self):
        """verify() passes for a correctly built ZIP."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        builder.add_file("test.json", b'{"key": "value"}')
        builder.add_contract_snapshot(SAMPLE_CONTRACT)
        zip_bytes, manifest = builder.build()

        ok, errors = GatewayPackageBuilder.verify(zip_bytes, manifest)
        assert ok is True, f"Unexpected errors: {errors}"

    def test_verify_detects_hash_mismatch(self):
        """verify() catches a modified manifest hash."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        builder.add_file("test.json", b'{"key": "value"}')
        zip_bytes, manifest = builder.build()

        # Tamper with manifest hash
        manifest["zip_hash"] = "0" * 64

        ok, errors = GatewayPackageBuilder.verify(zip_bytes, manifest)
        assert ok is False
        assert any("ZIP hash mismatch" in e for e in errors)

    def test_add_sequence_files(self):
        """Sequence files are added correctly."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        seq_files = {
            "sequence/0000/index.xml": b"<xml/>",
            "sequence/0000/m4/4-2-1/se_matrix.json": b'{"test": true}',
        }
        builder.add_sequence_files(seq_files)
        zip_bytes, manifest = builder.build()

        paths = {e["path"] for e in manifest["entries"]}
        assert "sequence/0000/index.xml" in paths
        assert "sequence/0000/m4/4-2-1/se_matrix.json" in paths

    def test_add_leaf_registry(self):
        """Leaf registry is added as leaf_registry.json."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        builder.add_leaf_registry({"version": "1.0.0", "leaves": []})
        zip_bytes, manifest = builder.build()

        paths = {e["path"] for e in manifest["entries"]}
        assert "leaf_registry.json" in paths

    def test_contract_snapshot_with_hash(self):
        """Contract snapshot adds both .json and .sha256."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        builder = GatewayPackageBuilder()
        builder.add_contract_snapshot(SAMPLE_CONTRACT)
        zip_bytes, manifest = builder.build()

        paths = {e["path"] for e in manifest["entries"]}
        assert "contract_snapshot.json" in paths
        assert "contract_snapshot.sha256" in paths

    def test_full_pipeline_sequence_through_gateway(self):
        """E2E: Sequence builder → Leaf registry → Gateway → Verify."""
        from shadow_service.ectd_sequence_builder import build_sequence_0000
        from shadow_service.leaf_registry import build_leaf_registry
        from shadow_service.ectd_gateway import GatewayPackageBuilder

        # 1. Build sequence
        seq_files = build_sequence_0000(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            m1_index=SAMPLE_M1_INDEX,
            contract_snapshot=SAMPLE_CONTRACT,
            artifacts=SAMPLE_ARTIFACTS,
        )

        # 2. Build leaf registry
        registry = build_leaf_registry(
            leaf_map=SAMPLE_LEAF_MAP,
            sequence_plan=SAMPLE_SEQUENCE_PLAN,
            artifacts=SAMPLE_ARTIFACTS,
            contract_snapshot=SAMPLE_CONTRACT,
        )

        # 3. Package through gateway
        builder = GatewayPackageBuilder()
        builder.add_sequence_files(seq_files)
        builder.add_leaf_registry(registry)
        builder.add_contract_snapshot(SAMPLE_CONTRACT)
        zip_bytes, manifest = builder.build()

        # 4. Verify
        ok, errors = GatewayPackageBuilder.verify(zip_bytes, manifest)
        assert ok is True, f"E2E pipeline verify failed: {errors}"

        # 5. Check manifest completeness
        assert manifest["total_entries"] > 5  # seq files + registry + contract + checksums
        assert manifest["zip_hash"]
        assert len(manifest["zip_hash"]) == 64

    def test_size_limit_enforcement(self):
        """Gateway rejects entries exceeding size limits."""
        from shadow_service.ectd_gateway import GatewayPackageBuilder, MAX_SINGLE_ENTRY_BYTES

        builder = GatewayPackageBuilder()
        # Try to add an entry that's too large
        with pytest.raises(ValueError, match="bytes"):
            builder.add_file("big.bin", b"x" * (MAX_SINGLE_ENTRY_BYTES + 1))


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Runtime Hard-Stop Integration
# ═══════════════════════════════════════════════════════════════════════════════


class TestRuntimeHardStop:
    """Tests that invalid bundle blocks persist and download."""

    def test_valid_bundle_does_not_block(self):
        """Valid bundle data does not trigger the hard-stop gate."""
        from shadow_service.contract_hashes import validate_ectd_bundle
        valid, errors = validate_ectd_bundle()
        assert valid is True
        assert errors == []

    def test_invalid_bundle_blocks_download(self):
        """Invalid bundle data causes validate_ectd_bundle() to return errors.

        The endpoint uses this result to return HTTP 409 and emit
        PROOF_PACK_SCHEMA_INVALID audit event.
        """
        import shadow_service.contract_hashes as ch
        from shadow_service.contract_hashes import validate_ectd_bundle

        # Create invalid bundle data file
        invalid = {"schemas": {}, "bundle_hash": "bad"}  # missing version, leaf_map, etc.
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(invalid, f)
            temp_path = f.name

        original = ch.BUNDLE_DATA_PATH
        ch.BUNDLE_DATA_PATH = Path(temp_path)
        try:
            valid, errors = validate_ectd_bundle()
            assert valid is False
            assert len(errors) > 0
            # Errors should mention missing required fields
            error_text = " ".join(errors)
            assert "required" in error_text.lower() or "version" in error_text.lower() or "mismatch" in error_text.lower()
        finally:
            ch.BUNDLE_DATA_PATH = original
            os.unlink(temp_path)
