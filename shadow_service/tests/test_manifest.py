"""Tests for Phase 6.6.C2 — Regulatory Intelligence Manifest Builder.

Tests:
  ✅ compute_risk_vocab_hash — deterministic, truncated to 12 chars
  ✅ compute_subject_hash — deterministic, canonical JSON, key-order independent
  ✅ compute_manifest_hash — excludes generated_at, full SHA-256
  ✅ _canonical_json — sorted keys, no whitespace
  ✅ canonical_sort — canonical enum declaration order
  ✅ extract_top_risks — severity ordering, max_count cap
  ✅ build_manifest — full round-trip with all fields
  ✅ build_manifest — hash stability across calls
  ✅ build_manifest — different timestamps yield same manifest_hash
  ✅ load_lock_file — loads and validates structure
  ✅ validate_lock_file_codes — lock file matches Python enum
  ✅ _hardened_task_id — deterministic, content-addressable
  ✅ generate_se_matrix_with_manifest — returns manifest + payload + tasks
"""
from __future__ import annotations

import json
import re

import pytest

from shadow_service.predicate_intel.manifest import (
    CANONICAL_RISK_CODE_ORDER,
    GENERATOR_VERSION,
    _canonical_json,
    _sha256_hex,
    _sha256_short,
    build_manifest,
    canonical_sort,
    compute_manifest_hash,
    compute_risk_vocab_hash,
    compute_subject_hash,
    extract_top_risks,
    load_lock_file,
    validate_lock_file_codes,
)
from shadow_service.generators.se_matrix_payload import (
    _hardened_task_id,
)
from shadow_service.scoring.risk_code_map import (
    RISK_CODE_SEVERITY_DEFAULT,
    RiskCode,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def sample_subject_device() -> dict:
    return {
        "device_name": "SmartPump X2",
        "intended_use": "Continuous infusion therapy",
        "technology": "Microprocessor-controlled syringe pump",
    }


@pytest.fixture
def sample_subject_device_reordered() -> dict:
    """Same data as sample_subject_device, different key order."""
    return {
        "technology": "Microprocessor-controlled syringe pump",
        "device_name": "SmartPump X2",
        "intended_use": "Continuous infusion therapy",
    }


@pytest.fixture
def sample_risk_codes() -> list[str]:
    return ["IU_MISMATCH", "MATERIAL_CHANGE", "SOFTWARE_PRESENT_NEW"]


@pytest.fixture
def sample_evidence_task_ids() -> list[str]:
    return ["task_abc123", "task_def456"]


@pytest.fixture
def sample_manifest_kwargs(
    sample_subject_device,
    sample_risk_codes,
    sample_evidence_task_ids,
) -> dict:
    return {
        "program_id": "prog-001",
        "product_code": "QEI",
        "subject_device": sample_subject_device,
        "predicate_k_number": "K123456",
        "risk_codes_used": sample_risk_codes,
        "evidence_task_ids": sample_evidence_task_ids,
        "defense_readiness_score": 72,
        "top_risks": ["IU_MISMATCH"],
        "generated_at": "2025-01-24T12:00:00Z",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Helper function tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSha256Helpers:
    def test_sha256_hex_deterministic(self):
        h1 = _sha256_hex(b"hello")
        h2 = _sha256_hex(b"hello")
        assert h1 == h2
        assert len(h1) == 64  # Full SHA-256 has 64 hex chars

    def test_sha256_short_truncates(self):
        full = _sha256_hex(b"hello")
        short = _sha256_short(b"hello", 12)
        assert short == full[:12]
        assert len(short) == 12

    def test_sha256_short_default_length(self):
        short = _sha256_short(b"test")
        assert len(short) == 12

    def test_different_inputs_different_hashes(self):
        h1 = _sha256_hex(b"hello")
        h2 = _sha256_hex(b"world")
        assert h1 != h2


class TestCanonicalJson:
    def test_sorted_keys(self):
        result = _canonical_json({"b": 2, "a": 1})
        assert result == '{"a":1,"b":2}'

    def test_no_whitespace(self):
        result = _canonical_json({"key": "value"})
        assert " " not in result
        assert "\n" not in result

    def test_nested_objects_sorted(self):
        result = _canonical_json({"z": {"b": 2, "a": 1}, "a": 0})
        assert result == '{"a":0,"z":{"a":1,"b":2}}'

    def test_empty_dict(self):
        assert _canonical_json({}) == "{}"


# ═══════════════════════════════════════════════════════════════════════════════
# Hash function tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestComputeRiskVocabHash:
    def test_deterministic(self):
        h1 = compute_risk_vocab_hash()
        h2 = compute_risk_vocab_hash()
        assert h1 == h2

    def test_truncated_to_12(self):
        h = compute_risk_vocab_hash()
        assert len(h) == 12

    def test_hex_chars_only(self):
        h = compute_risk_vocab_hash()
        assert re.fullmatch(r"[0-9a-f]+", h)


class TestComputeSubjectHash:
    def test_deterministic(self, sample_subject_device):
        h1 = compute_subject_hash(sample_subject_device)
        h2 = compute_subject_hash(sample_subject_device)
        assert h1 == h2

    def test_key_order_independent(self, sample_subject_device, sample_subject_device_reordered):
        h1 = compute_subject_hash(sample_subject_device)
        h2 = compute_subject_hash(sample_subject_device_reordered)
        assert h1 == h2

    def test_truncated_to_12(self, sample_subject_device):
        h = compute_subject_hash(sample_subject_device)
        assert len(h) == 12

    def test_different_devices_different_hashes(self, sample_subject_device):
        other = {**sample_subject_device, "device_name": "OtherPump Y3"}
        h1 = compute_subject_hash(sample_subject_device)
        h2 = compute_subject_hash(other)
        assert h1 != h2

    def test_empty_device(self):
        h = compute_subject_hash({})
        assert len(h) == 12


class TestComputeManifestHash:
    def test_excludes_generated_at(self):
        base = {"a": 1, "generated_at": "2025-01-01T00:00:00Z"}
        h1 = compute_manifest_hash(base)
        changed = {**base, "generated_at": "2099-12-31T23:59:59Z"}
        h2 = compute_manifest_hash(changed)
        assert h1 == h2

    def test_excludes_manifest_hash_placeholder(self):
        """manifest_hash placeholder must not leak into digest (circular ref)."""
        base = {"a": 1, "manifest_hash": ""}
        h1 = compute_manifest_hash(base)
        without = {"a": 1}
        h2 = compute_manifest_hash(without)
        assert h1 == h2

    def test_full_sha256_length(self):
        h = compute_manifest_hash({"key": "value"})
        assert len(h) == 64

    def test_different_content_different_hash(self):
        h1 = compute_manifest_hash({"a": 1})
        h2 = compute_manifest_hash({"a": 2})
        assert h1 != h2


# ═══════════════════════════════════════════════════════════════════════════════
# Canonical ordering tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCanonicalSort:
    def test_sorts_in_enum_order(self):
        codes = ["SOFTWARE_PRESENT_NEW", "IU_MISMATCH", "MATERIAL_CHANGE"]
        sorted_codes = canonical_sort(codes)
        assert sorted_codes == ["IU_MISMATCH", "MATERIAL_CHANGE", "SOFTWARE_PRESENT_NEW"]

    def test_already_sorted_unchanged(self):
        codes = ["IU_MISMATCH", "INDICATIONS_EXPANDED", "TECH_DIFFERENCE"]
        assert canonical_sort(codes) == codes

    def test_empty_list(self):
        assert canonical_sort([]) == []

    def test_single_element(self):
        assert canonical_sort(["TECH_DIFFERENCE"]) == ["TECH_DIFFERENCE"]

    def test_all_24_codes_sorted(self):
        # Reverse then sort — should restore canonical order
        codes = list(reversed(CANONICAL_RISK_CODE_ORDER))
        assert canonical_sort(codes) == CANONICAL_RISK_CODE_ORDER

    def test_unknown_codes_go_to_end(self):
        codes = ["UNKNOWN_CODE", "IU_MISMATCH"]
        result = canonical_sort(codes)
        assert result[-1] == "UNKNOWN_CODE"
        assert result[0] == "IU_MISMATCH"


class TestExtractTopRisks:
    def test_returns_max_count(self):
        codes = CANONICAL_RISK_CODE_ORDER[:10]
        result = extract_top_risks(codes, RISK_CODE_SEVERITY_DEFAULT, max_count=5)
        assert len(result) <= 5

    def test_high_severity_first(self):
        codes = ["LABELING_IFU_GAP", "IU_MISMATCH", "MATERIAL_CHANGE"]
        # IU_MISMATCH is HIGH, others are MEDIUM
        result = extract_top_risks(codes, RISK_CODE_SEVERITY_DEFAULT, max_count=5)
        assert result[0] == "IU_MISMATCH"

    def test_empty_input(self):
        assert extract_top_risks([], RISK_CODE_SEVERITY_DEFAULT) == []

    def test_fewer_than_max(self):
        codes = ["IU_MISMATCH", "TECH_DIFFERENCE"]
        result = extract_top_risks(codes, RISK_CODE_SEVERITY_DEFAULT, max_count=5)
        assert len(result) == 2

    def test_deterministic(self):
        codes = ["SOFTWARE_PRESENT_NEW", "IU_MISMATCH", "CLINICAL_EVIDENCE_GAP"]
        r1 = extract_top_risks(codes, RISK_CODE_SEVERITY_DEFAULT, max_count=3)
        r2 = extract_top_risks(codes, RISK_CODE_SEVERITY_DEFAULT, max_count=3)
        assert r1 == r2


# ═══════════════════════════════════════════════════════════════════════════════
# Build manifest tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestBuildManifest:
    def test_returns_all_fields(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        required_fields = {
            "subject_hash", "program_id", "product_code", "predicate_k_number",
            "generator_version", "risk_code_map_version", "risk_vocab_hash",
            "manifest_hash", "generated_at", "risk_codes_used",
            "evidence_task_ids", "defense_readiness_score", "top_risks",
        }
        assert set(m.keys()) == required_fields

    def test_manifest_hash_is_populated(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        assert m["manifest_hash"]
        assert len(m["manifest_hash"]) == 64

    def test_subject_hash_is_populated(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        assert m["subject_hash"]
        assert len(m["subject_hash"]) == 12

    def test_risk_vocab_hash_is_populated(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        assert m["risk_vocab_hash"]
        assert len(m["risk_vocab_hash"]) == 12

    def test_generator_version_matches(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        assert m["generator_version"] == GENERATOR_VERSION

    def test_hash_stability(self, sample_manifest_kwargs):
        m1 = build_manifest(**sample_manifest_kwargs)
        m2 = build_manifest(**sample_manifest_kwargs)
        assert m1["manifest_hash"] == m2["manifest_hash"]
        assert m1["subject_hash"] == m2["subject_hash"]
        assert m1["risk_vocab_hash"] == m2["risk_vocab_hash"]

    def test_different_timestamps_same_manifest_hash(self, sample_manifest_kwargs):
        kwargs1 = {**sample_manifest_kwargs, "generated_at": "2025-01-01T00:00:00Z"}
        kwargs2 = {**sample_manifest_kwargs, "generated_at": "2099-12-31T23:59:59Z"}
        m1 = build_manifest(**kwargs1)
        m2 = build_manifest(**kwargs2)
        assert m1["manifest_hash"] == m2["manifest_hash"]

    def test_different_device_different_manifest_hash(self, sample_manifest_kwargs):
        m1 = build_manifest(**sample_manifest_kwargs)
        kwargs2 = {
            **sample_manifest_kwargs,
            "subject_device": {"device_name": "OtherPump"},
        }
        m2 = build_manifest(**kwargs2)
        assert m1["manifest_hash"] != m2["manifest_hash"]

    def test_preserves_input_values(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        assert m["program_id"] == "prog-001"
        assert m["product_code"] == "QEI"
        assert m["predicate_k_number"] == "K123456"
        assert m["defense_readiness_score"] == 72
        assert m["risk_codes_used"] == ["IU_MISMATCH", "MATERIAL_CHANGE", "SOFTWARE_PRESENT_NEW"]
        assert m["evidence_task_ids"] == ["task_abc123", "task_def456"]
        assert m["top_risks"] == ["IU_MISMATCH"]

    def test_generated_at_preserved(self, sample_manifest_kwargs):
        m = build_manifest(**sample_manifest_kwargs)
        assert m["generated_at"] == "2025-01-24T12:00:00Z"


# ═══════════════════════════════════════════════════════════════════════════════
# Lock file tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLockFile:
    def test_load_lock_file(self):
        lock = load_lock_file()
        assert "version" in lock
        assert "risk_codes" in lock
        assert "significant_risk_codes" in lock

    def test_lock_file_version(self):
        lock = load_lock_file()
        assert lock["version"] == "2.0.0"

    def test_lock_file_has_24_codes(self):
        lock = load_lock_file()
        assert len(lock["risk_codes"]) == 24

    def test_lock_file_has_4_significant(self):
        lock = load_lock_file()
        assert len(lock["significant_risk_codes"]) == 4

    def test_lock_file_significant_subset_of_codes(self):
        lock = load_lock_file()
        risk_set = set(lock["risk_codes"])
        for sig in lock["significant_risk_codes"]:
            assert sig in risk_set

    def test_validate_lock_file_codes_passes(self):
        """Lock file risk codes must match Python RiskCode enum exactly."""
        assert validate_lock_file_codes() is True

    def test_lock_file_matches_canonical_order(self):
        lock = load_lock_file()
        assert lock["risk_codes"] == CANONICAL_RISK_CODE_ORDER

    def test_no_duplicates_in_lock_file(self):
        lock = load_lock_file()
        assert len(lock["risk_codes"]) == len(set(lock["risk_codes"]))

    def test_no_duplicates_in_significant(self):
        lock = load_lock_file()
        assert len(lock["significant_risk_codes"]) == len(set(lock["significant_risk_codes"]))


# ═══════════════════════════════════════════════════════════════════════════════
# Canonical risk code order
# ═══════════════════════════════════════════════════════════════════════════════

class TestCanonicalRiskCodeOrder:
    def test_has_24_entries(self):
        assert len(CANONICAL_RISK_CODE_ORDER) == 24

    def test_matches_enum(self):
        enum_values = [rc.value for rc in RiskCode]
        assert CANONICAL_RISK_CODE_ORDER == enum_values

    def test_no_duplicates(self):
        assert len(set(CANONICAL_RISK_CODE_ORDER)) == 24


# ═══════════════════════════════════════════════════════════════════════════════
# Hardened task ID test
# ═══════════════════════════════════════════════════════════════════════════════

class TestHardenedTaskId:
    def test_deterministic(self):
        tid1 = _hardened_task_id("subj123", "materials", "biocompatibility", ["MATERIAL_CHANGE"])
        tid2 = _hardened_task_id("subj123", "materials", "biocompatibility", ["MATERIAL_CHANGE"])
        assert tid1 == tid2

    def test_length_12(self):
        tid = _hardened_task_id("subj_hash", "char", "cat", ["IU_MISMATCH"])
        assert len(tid) == 12

    def test_hex_only(self):
        tid = _hardened_task_id("s", "c", "k", ["IU_MISMATCH"])
        assert re.fullmatch(r"[0-9a-f]+", tid)

    def test_different_inputs_different_ids(self):
        tid1 = _hardened_task_id("subj1", "materials", "cat", ["MATERIAL_CHANGE"])
        tid2 = _hardened_task_id("subj2", "materials", "cat", ["MATERIAL_CHANGE"])
        assert tid1 != tid2

    def test_risk_code_order_independent(self):
        tid1 = _hardened_task_id("s", "c", "k", ["MATERIAL_CHANGE", "IU_MISMATCH"])
        tid2 = _hardened_task_id("s", "c", "k", ["IU_MISMATCH", "MATERIAL_CHANGE"])
        assert tid1 == tid2  # Sorted internally

    def test_empty_risk_codes(self):
        tid = _hardened_task_id("s", "c", "k", [])
        assert len(tid) == 12


# ═══════════════════════════════════════════════════════════════════════════════
# Integration: generate_se_matrix_with_manifest
# ═══════════════════════════════════════════════════════════════════════════════

class TestGenerateSEMatrixWithManifest:
    """Integration test for the manifest-bearing generator."""

    def _call(self) -> dict:
        from shadow_service.generators.se_matrix_payload import (
            generate_se_matrix_with_manifest,
        )
        return generate_se_matrix_with_manifest(
            program_id="test-prog-001",
            product_code="QEI",
            subject_device={
                "device_name": "TestPump",
                "intended_use": "Therapeutic infusion",
                "technology": "Syringe pump",
                "materials": "Stainless steel",
                "energy_source": "AC power",
                "performance": "Flow rate 0.1-1200 mL/hr",
                "biocompatibility": "ISO 10993 compliant",
                "sterilization": "EtO sterilized",
                "software": "Class C IEC 62304",
                "general": "FDA 510(k) cleared",
            },
            predicate_record={
                "k_number": "K990123",
                "device_name": "LegacyPump V1",
                "intended_use": "Therapeutic infusion",
                "technology": "Peristaltic pump",
                "materials": "Polycarbonate",
                "energy_source": "AC power",
                "performance": "Flow rate 1-999 mL/hr",
                "biocompatibility": "ISO 10993 compliant",
                "sterilization": "Autoclave",
                "software": "N/A",
                "general": "FDA 510(k) cleared",
            },
        )

    def test_returns_manifest_payload_evidence(self):
        result = self._call()
        assert "manifest" in result
        assert "payload" in result
        assert "evidence_tasks" in result

    def test_manifest_has_all_required_fields(self):
        m = self._call()["manifest"]
        for key in (
            "subject_hash", "program_id", "product_code", "predicate_k_number",
            "generator_version", "risk_code_map_version", "risk_vocab_hash",
            "manifest_hash", "generated_at", "risk_codes_used",
            "evidence_task_ids", "defense_readiness_score", "top_risks",
        ):
            assert key in m, f"Missing manifest key: {key}"

    def test_manifest_hash_is_stable(self):
        r1 = self._call()
        r2 = self._call()
        # Same inputs → same manifest_hash (ignoring generated_at)
        # Note: generated_at differs, but manifest_hash excludes it
        assert r1["manifest"]["manifest_hash"] == r2["manifest"]["manifest_hash"]

    def test_manifest_risk_codes_used_canonical_sorted(self):
        codes = self._call()["manifest"]["risk_codes_used"]
        assert codes == canonical_sort(codes)

    def test_evidence_task_ids_are_hardened(self):
        """Evidence task IDs must be 12-char hex hashes (hardened formula)."""
        task_ids = self._call()["manifest"]["evidence_task_ids"]
        for tid in task_ids:
            assert len(tid) == 12, f"Task ID {tid!r} not 12 chars"
            assert re.fullmatch(r"[0-9a-f]+", tid), f"Task ID {tid!r} not hex"

    def test_top_risks_max_5(self):
        top = self._call()["manifest"]["top_risks"]
        assert len(top) <= 5

    def test_defense_readiness_score_bounded(self):
        score = self._call()["manifest"]["defense_readiness_score"]
        assert 0 <= score <= 100

    def test_payload_is_dict(self):
        p = self._call()["payload"]
        assert isinstance(p, dict)
        assert "comparison_rows" in p
        assert "evidence_tasks" in p

    def test_evidence_tasks_is_list(self):
        tasks = self._call()["evidence_tasks"]
        assert isinstance(tasks, list)

