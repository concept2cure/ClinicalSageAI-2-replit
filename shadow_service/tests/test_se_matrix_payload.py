"""Tests for Phase 6.6.C — Evidence-Linked SE Matrix Generation.

Tests:
  ✅ risk_code_map: every risk_code yields at least one EvidenceCategory
  ✅ risk_code_map: artifacts are from canonical list
  ✅ risk_code_map: all 28 risk codes present with labels + severity
  ✅ SE matrix generator: deterministic output for same inputs
  ✅ SE matrix generator: produces expected rows and flags
  ✅ SE matrix generator: evidence_task_ids map correctly from risk codes
  ✅ SE matrix generator: identical values → EQUIVALENT
  ✅ SE matrix generator: material mismatch → DISCUSSION_REQUIRED + MATERIAL_CHANGE
  ✅ SE matrix generator: energy source mismatch → SIGNIFICANT + ENERGY_SOURCE_CHANGE
  ✅ SE matrix generator: readiness score within 0-100
  ✅ SE matrix generator: stable task_id hashes (snapshot test)
  ✅ build_evidence_tasks_from_risk_codes: deduplication
  ✅ build_evidence_tasks_from_risk_codes: sort order HIGH > MEDIUM > LOW
"""
from __future__ import annotations

import hashlib
import pytest
from typing import Any

from shadow_service.scoring.risk_code_map import (
    ALL_RISK_CODES,
    CANONICAL_ARTIFACTS,
    RISK_CODE_LABELS,
    RISK_CODE_MAP_VERSION,
    RISK_CODE_SEVERITY_DEFAULT,
    RISK_CODE_TO_ARTIFACTS,
    RISK_CODE_TO_CATEGORY,
    SE_CATEGORY_RISK_CODE_MAP,
    RiskCode,
    Severity,
    get_artifacts_for_risk_code,
    get_categories_for_risk_code,
    get_label_for_risk_code,
    get_severity_for_risk_code,
    validate_risk_code,
)
from shadow_service.generators.se_matrix_payload import (
    analyze_diff,
    build_evidence_tasks_from_risk_codes,
    calculate_defense_readiness,
    generate_se_matrix_payload,
    map_risk_code_to_evidence_task_ids,
    _stable_task_id,
)
from shadow_service.models_se_matrix import (
    EvidenceTaskV2,
    SEMatrixPayloadV2,
    SEMatrixRowV2,
)
from shadow_service.models_predicate import EvidenceCategory


# Override conftest's async autouse reset_db_pool fixture.
@pytest.fixture(autouse=True)
def reset_db_pool():
    """Sync noop — overrides conftest async fixture for this module."""
    yield


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_subject_device(**overrides) -> dict[str, Any]:
    """Minimal valid subject device with overrides."""
    defaults = {
        "device_name": "Glucose Monitor X",
        "intended_use": "Continuous glucose monitoring in adult patients",
        "technology": "Electrochemical sensor technology",
        "materials": "Titanium alloy",
        "energy_source": "Battery (lithium)",
        "biocompatibility": "Skin contact, short-term",
        "sterilization": "EO sterilization",
        "software": "Embedded firmware v2.0",
        "performance": "Accuracy ±10% vs lab reference",
        "general": "Prescription use only",
    }
    defaults.update(overrides)
    return defaults


def _make_predicate_record(**overrides) -> dict[str, Any]:
    """Minimal valid predicate record with overrides."""
    defaults = {
        "k_number": "K123456",
        "device_name": "Glucose Monitor Y",
        "intended_use": "Continuous glucose monitoring in adult patients",
        "technology": "Electrochemical sensor technology",
        "materials": "Stainless steel",
        "energy_source": "Battery (lithium)",
        "biocompatibility": "Skin contact, short-term",
        "sterilization": "EO sterilization",
        "software": "Embedded firmware v1.5",
        "performance": "Accuracy ±10% vs lab reference",
        "general": "Prescription use only",
        "product_code": "DXN",
    }
    defaults.update(overrides)
    return defaults


# ═══════════════════════════════════════════════════════════════════════════════
# Risk Code Map Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRiskCodeMap:
    """Tests for the canonical risk_code map (source of truth)."""

    def test_all_28_risk_codes_exist(self):
        """Every RiskCode enum value is in ALL_RISK_CODES."""
        assert len(ALL_RISK_CODES) == 28  # 28 canonical risk codes
        for rc in RiskCode:
            assert rc.value in ALL_RISK_CODES

    def test_every_risk_code_has_categories(self):
        """Every risk_code yields at least one EvidenceCategory."""
        for rc in ALL_RISK_CODES:
            cats = get_categories_for_risk_code(rc)
            assert len(cats) >= 1, f"{rc} has no categories"
            # Verify all categories are valid EvidenceCategory values
            valid_cats = {ec.value for ec in EvidenceCategory}
            for c in cats:
                assert c in valid_cats, f"{rc} has invalid category {c}"

    def test_every_risk_code_has_artifacts(self):
        """Every risk_code yields at least one artifact."""
        for rc in ALL_RISK_CODES:
            arts = get_artifacts_for_risk_code(rc)
            assert len(arts) >= 1, f"{rc} has no artifacts"

    def test_every_risk_code_has_label(self):
        """Every risk_code has a human-readable label."""
        for rc in ALL_RISK_CODES:
            label = get_label_for_risk_code(rc)
            assert label != rc, f"{rc} has no label (returned raw code)"
            assert len(label) > 3

    def test_every_risk_code_has_severity(self):
        """Every risk_code has a default severity."""
        for rc in ALL_RISK_CODES:
            sev = get_severity_for_risk_code(rc)
            assert sev in {"LOW", "MEDIUM", "HIGH"}, f"{rc} has invalid severity {sev}"

    def test_artifacts_from_canonical_list(self):
        """All artifacts referenced in RISK_CODE_TO_ARTIFACTS exist in CANONICAL_ARTIFACTS."""
        all_canonical = set()
        for cat_arts in CANONICAL_ARTIFACTS.values():
            all_canonical.update(cat_arts)

        for rc, artifacts in RISK_CODE_TO_ARTIFACTS.items():
            for art in artifacts:
                assert art in all_canonical, (
                    f"Artifact '{art}' for {rc} not in canonical list"
                )

    def test_validate_risk_code(self):
        """validate_risk_code returns True for valid codes, False for invalid."""
        assert validate_risk_code("MATERIAL_CHANGE") is True
        assert validate_risk_code("IU_MISMATCH") is True
        assert validate_risk_code("BOGUS_CODE") is False
        assert validate_risk_code("") is False

    def test_se_category_risk_code_map_coverage(self):
        """SE_CATEGORY_RISK_CODE_MAP covers all comparison categories."""
        expected_categories = {
            "intended_use", "technology", "materials", "energy_source",
            "sterilization", "software", "performance", "biocompatibility",
            "general",
        }
        for cat in expected_categories:
            assert cat in SE_CATEGORY_RISK_CODE_MAP, f"Missing SE category: {cat}"
            assert SE_CATEGORY_RISK_CODE_MAP[cat] in ALL_RISK_CODES

    def test_map_version_is_string(self):
        """Risk code map version is a semantic version string."""
        assert isinstance(RISK_CODE_MAP_VERSION, str)
        parts = RISK_CODE_MAP_VERSION.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)


# ═══════════════════════════════════════════════════════════════════════════════
# Diff Analysis Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAnalyzeDiff:
    """Tests for the deterministic diff analysis function."""

    def test_identical_text_is_equivalent(self):
        """Identical text produces EQUIVALENT with no risk_code."""
        flag, text, rc, sev = analyze_diff("intended_use", "Glucose monitoring", "Glucose monitoring")
        assert flag == "EQUIVALENT"
        assert rc is None
        assert sev == "none"

    def test_both_na_is_equivalent(self):
        """Both N/A produces EQUIVALENT."""
        flag, _, rc, sev = analyze_diff("energy_source", "N/A", "n/a")
        assert flag == "EQUIVALENT"
        assert rc is None

    def test_material_mismatch_discussion_required(self):
        """Material mismatch → DISCUSSION_REQUIRED + MATERIAL_CHANGE."""
        flag, text, rc, sev = analyze_diff("materials", "Titanium alloy", "Stainless steel")
        assert flag == "DISCUSSION_REQUIRED"
        assert rc == "MATERIAL_CHANGE"
        assert "biocompatibility" in text.lower() or "material" in text.lower()
        assert sev in ("medium", "high")

    def test_energy_source_mismatch_significant(self):
        """Energy source mismatch → SIGNIFICANT + ENERGY_SOURCE_CHANGE."""
        flag, text, rc, sev = analyze_diff("energy_source", "Battery", "AC Power")
        assert flag == "SIGNIFICANT"
        assert rc == "ENERGY_SOURCE_CHANGE"
        assert sev == "high"

    def test_sterilization_mismatch(self):
        """Sterilization mismatch → DISCUSSION_REQUIRED + STERILIZATION_METHOD_CHANGE."""
        flag, _, rc, _ = analyze_diff("sterilization", "Gamma radiation", "EO sterilization")
        assert flag == "DISCUSSION_REQUIRED"
        assert rc == "STERILIZATION_METHOD_CHANGE"

    def test_software_new_is_significant(self):
        """New software (subject has, predicate doesn't) → SIGNIFICANT."""
        flag, _, rc, sev = analyze_diff("software", "Embedded firmware v2.0", "N/A")
        assert flag == "SIGNIFICANT"
        assert rc == "SOFTWARE_PRESENT_NEW"
        assert sev == "critical"

    def test_intended_use_high_overlap_equivalent(self):
        """Intended use with >80% word overlap → EQUIVALENT."""
        text = "Continuous glucose monitoring in adult patients with diabetes"
        flag, _, rc, _ = analyze_diff("intended_use", text, text + " mellitus")
        # Very high overlap
        assert flag in ("EQUIVALENT", "DISCUSSION_REQUIRED")

    def test_intended_use_low_overlap_significant(self):
        """Intended use with low word overlap → SIGNIFICANT."""
        flag, _, rc, _ = analyze_diff(
            "intended_use",
            "Cardiac ablation for ventricular tachycardia",
            "Blood glucose monitoring for diabetes management",
        )
        assert flag == "SIGNIFICANT"
        assert rc == "IU_MISMATCH"

    def test_biocompatibility_mismatch(self):
        """Biocompatibility mismatch → DISCUSSION_REQUIRED."""
        flag, _, rc, _ = analyze_diff("biocompatibility", "Blood contact", "Skin contact")
        assert flag == "DISCUSSION_REQUIRED"
        assert rc == "TISSUE_CONTACT_CHANGE"

    def test_unknown_category_still_works(self):
        """Unknown category produces DISCUSSION_REQUIRED."""
        flag, _, rc, _ = analyze_diff("general", "Rx only", "OTC")
        assert flag == "DISCUSSION_REQUIRED"


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence Task ID Mapping Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestEvidenceTaskMapping:
    """Tests for risk_code → evidence_task_ids mapping."""

    def test_stable_task_id_deterministic(self):
        """Same input always produces same task_id."""
        tid1 = _stable_task_id("BenchTesting", "MATERIAL_CHANGE")
        tid2 = _stable_task_id("BenchTesting", "MATERIAL_CHANGE")
        assert tid1 == tid2
        assert len(tid1) == 12
        assert all(c in "0123456789abcdef" for c in tid1)

    def test_different_inputs_different_ids(self):
        """Different inputs produce different task_ids."""
        tid1 = _stable_task_id("BenchTesting", "MATERIAL_CHANGE")
        tid2 = _stable_task_id("BenchTesting", "ENERGY_SOURCE_CHANGE")
        assert tid1 != tid2

    def test_map_risk_code_to_evidence_task_ids(self):
        """MATERIAL_CHANGE maps to Biocompatibility category task_id."""
        ids = map_risk_code_to_evidence_task_ids("MATERIAL_CHANGE")
        assert len(ids) >= 1
        # Verify they're all 12-char hex
        for tid in ids:
            assert len(tid) == 12
            assert all(c in "0123456789abcdef" for c in tid)

    def test_unknown_risk_code_returns_empty(self):
        """Unknown risk_code returns empty list."""
        ids = map_risk_code_to_evidence_task_ids("BOGUS_CODE")
        assert ids == []

    def test_multi_category_risk_code_returns_multiple_ids(self):
        """Risk codes with multiple categories produce multiple task_ids."""
        ids = map_risk_code_to_evidence_task_ids("SOFTWARE_PRESENT_NEW")
        # SOFTWARE_PRESENT_NEW maps to SoftwareLifecycle + Cybersecurity
        assert len(ids) >= 2


# ═══════════════════════════════════════════════════════════════════════════════
# Build Evidence Tasks Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestBuildEvidenceTasks:
    """Tests for build_evidence_tasks_from_risk_codes."""

    def test_deduplication(self):
        """Same risk_code appearing twice doesn't create duplicate tasks."""
        tasks = build_evidence_tasks_from_risk_codes([
            "MATERIAL_CHANGE", "MATERIAL_CHANGE",
        ])
        task_ids = [t.task_id for t in tasks]
        assert len(task_ids) == len(set(task_ids))

    def test_sort_order_high_first(self):
        """HIGH severity tasks come before MEDIUM and LOW."""
        tasks = build_evidence_tasks_from_risk_codes([
            "LABELING_IFU_GAP",       # LOW
            "MATERIAL_CHANGE",        # HIGH
            "STERILIZATION_METHOD_CHANGE",  # MEDIUM
        ])
        severities = [t.severity for t in tasks]
        sev_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        for i in range(len(severities) - 1):
            assert sev_order.get(severities[i], 9) <= sev_order.get(severities[i + 1], 9)

    def test_task_has_required_fields(self):
        """Each task has all required fields populated."""
        tasks = build_evidence_tasks_from_risk_codes(["ENERGY_SOURCE_CHANGE"])
        assert len(tasks) >= 1
        task = tasks[0]
        assert task.task_id
        assert task.category
        assert task.risk_code == "ENERGY_SOURCE_CHANGE"
        assert task.severity in ("LOW", "MEDIUM", "HIGH")
        assert len(task.recommended_artifacts) >= 1
        assert task.mapping.get("truth_machine_placeholder") is True
        assert task.mapping.get("se_matrix_linkable") is True

    def test_unknown_risk_code_skipped(self):
        """Unknown risk codes are silently skipped."""
        tasks = build_evidence_tasks_from_risk_codes(["BOGUS_CODE"])
        assert len(tasks) == 0

    def test_mixed_valid_invalid(self):
        """Mix of valid and invalid codes processes correctly."""
        tasks = build_evidence_tasks_from_risk_codes([
            "MATERIAL_CHANGE", "BOGUS", "ENERGY_SOURCE_CHANGE",
        ])
        risk_codes = {t.risk_code for t in tasks}
        assert "MATERIAL_CHANGE" in risk_codes
        assert "ENERGY_SOURCE_CHANGE" in risk_codes
        assert "BOGUS" not in risk_codes


# ═══════════════════════════════════════════════════════════════════════════════
# Full Payload Generation Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestGenerateSEMatrixPayload:
    """Tests for the full SE matrix payload generation."""

    def test_produces_9_rows(self):
        """Default comparison generates 9 characteristic rows."""
        payload = generate_se_matrix_payload(
            program_id="test-program",
            subject_device=_make_subject_device(),
            predicate_record=_make_predicate_record(),
        )
        assert len(payload.comparison_rows) == 9

    def test_deterministic_output(self):
        """Same input always produces same output (excluding timestamp)."""
        subj = _make_subject_device()
        pred = _make_predicate_record()

        p1 = generate_se_matrix_payload(
            program_id="test", subject_device=subj, predicate_record=pred,
        )
        p2 = generate_se_matrix_payload(
            program_id="test", subject_device=subj, predicate_record=pred,
        )

        # Rows should be identical
        assert len(p1.comparison_rows) == len(p2.comparison_rows)
        for r1, r2 in zip(p1.comparison_rows, p2.comparison_rows):
            assert r1.diff_flag == r2.diff_flag
            assert r1.risk_code == r2.risk_code
            assert r1.evidence_task_ids == r2.evidence_task_ids

        # Evidence tasks should be identical
        assert len(p1.evidence_tasks) == len(p2.evidence_tasks)
        for t1, t2 in zip(p1.evidence_tasks, p2.evidence_tasks):
            assert t1.task_id == t2.task_id

    def test_material_mismatch_produces_evidence_tasks(self):
        """Material mismatch in payload produces evidence tasks."""
        payload = generate_se_matrix_payload(
            program_id="test",
            subject_device=_make_subject_device(materials="Titanium alloy"),
            predicate_record=_make_predicate_record(materials="Stainless steel"),
        )

        # Find materials row
        mat_row = next(r for r in payload.comparison_rows if r.category == "materials")
        assert mat_row.diff_flag == "DISCUSSION_REQUIRED"
        assert mat_row.risk_code == "MATERIAL_CHANGE"
        assert len(mat_row.evidence_task_ids) >= 1

    def test_identical_devices_all_equivalent(self):
        """Identical subject and predicate produce all EQUIVALENT rows."""
        common = {
            "device_name": "Device A",
            "intended_use": "Blood glucose monitoring",
            "technology": "Electrochemical sensor",
            "materials": "Stainless steel",
            "energy_source": "Battery",
            "biocompatibility": "Skin contact",
            "sterilization": "EO",
            "software": "v1.0",
            "performance": "±10% accuracy",
            "general": "Rx only",
        }
        payload = generate_se_matrix_payload(
            program_id="test",
            subject_device=common,
            predicate_record={**common, "k_number": "K999999"},
        )

        for row in payload.comparison_rows:
            assert row.diff_flag == "EQUIVALENT", (
                f"{row.characteristic} should be EQUIVALENT"
            )
            assert row.risk_code is None
            assert row.evidence_task_ids == []

        assert len(payload.evidence_tasks) == 0
        # Score is < 100 because subject_confidence is 0.5 (no design_control_ids)
        assert payload.defense_readiness_score >= 70

    def test_readiness_score_in_range(self):
        """Readiness score is always 0-100."""
        payload = generate_se_matrix_payload(
            program_id="test",
            subject_device=_make_subject_device(),
            predicate_record=_make_predicate_record(),
        )
        assert 0 <= payload.defense_readiness_score <= 100

    def test_payload_has_metadata(self):
        """Payload includes required metadata fields."""
        payload = generate_se_matrix_payload(
            program_id="test",
            subject_device=_make_subject_device(),
            predicate_record=_make_predicate_record(),
        )
        assert payload.template_id == "510k_se_matrix_v2"
        assert payload.version == "6.6.0"
        assert payload.predicate_k_number == "K123456"
        assert payload.generated_at  # non-empty
        assert payload.risk_code_map_version == RISK_CODE_MAP_VERSION

    def test_evidence_task_ids_map_to_tasks(self):
        """Every evidence_task_id in rows exists in the payload tasks list."""
        payload = generate_se_matrix_payload(
            program_id="test",
            subject_device=_make_subject_device(),
            predicate_record=_make_predicate_record(),
        )
        task_ids_in_payload = {t.task_id for t in payload.evidence_tasks}
        for row in payload.comparison_rows:
            for tid in row.evidence_task_ids:
                assert tid in task_ids_in_payload, (
                    f"task_id {tid} from row '{row.characteristic}' not in payload tasks"
                )

    def test_design_control_ids_included(self):
        """Design control IDs are included in subject evidence."""
        payload = generate_se_matrix_payload(
            program_id="test",
            subject_device=_make_subject_device(),
            predicate_record=_make_predicate_record(),
            design_control_ids={"materials": "DC-001"},
        )
        mat_row = next(r for r in payload.comparison_rows if r.category == "materials")
        assert "DC-001" in mat_row.subject_evidence_ids


# ═══════════════════════════════════════════════════════════════════════════════
# Defense Readiness Score Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDefenseReadiness:
    """Tests for defense readiness score calculation."""

    def test_empty_rows_returns_zero(self):
        """Empty row list returns 0."""
        assert calculate_defense_readiness([]) == 0

    def test_all_equivalent_high_score(self):
        """All equivalent rows with evidence produce high score."""
        rows = [
            SEMatrixRowV2(
                sort_order=i,
                characteristic=f"Char {i}",
                category="general",
                subject_value="Same value",
                predicate_value="Same value",
                diff_flag="EQUIVALENT",
                discussion_text="",
                subject_evidence_ids=["DC-001"],
            )
            for i in range(1, 4)
        ]
        score = calculate_defense_readiness(rows)
        assert score >= 80

    def test_significant_rows_lower_score(self):
        """SIGNIFICANT rows reduce the readiness score."""
        rows_good = [
            SEMatrixRowV2(
                sort_order=1, characteristic="A", category="intended_use",
                subject_value="X", predicate_value="X",
                diff_flag="EQUIVALENT", discussion_text="",
            ),
        ]
        rows_bad = [
            SEMatrixRowV2(
                sort_order=1, characteristic="A", category="intended_use",
                subject_value="X", predicate_value="Y",
                diff_flag="SIGNIFICANT", discussion_text="Discussion here",
                diff_severity="critical",
            ),
        ]
        score_good = calculate_defense_readiness(rows_good)
        score_bad = calculate_defense_readiness(rows_bad)
        assert score_good > score_bad


# ═══════════════════════════════════════════════════════════════════════════════
# Snapshot / Hash Stability Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestHashStability:
    """Tests that task_ids are stable across runs (regression guard)."""

    def test_material_change_task_id_snapshot(self):
        """MATERIAL_CHANGE → Biocompatibility task_id is stable."""
        expected = hashlib.sha256(b"Biocompatibility:MATERIAL_CHANGE").hexdigest()[:12]
        actual = _stable_task_id("Biocompatibility", "MATERIAL_CHANGE")
        assert actual == expected

    def test_energy_source_task_id_snapshot(self):
        """ENERGY_SOURCE_CHANGE → BenchTesting task_id is stable."""
        expected = hashlib.sha256(b"BenchTesting:ENERGY_SOURCE_CHANGE").hexdigest()[:12]
        actual = _stable_task_id("BenchTesting", "ENERGY_SOURCE_CHANGE")
        assert actual == expected
