"""Tests for Phase 6.6.D1 — Defense Packet Builder + Evidence Ops.

Tests:
  1. Determinism: same input → same packet JSON (except generated_at)
  2. Stable ordering: tasks sorted by severity desc / category / task_id
  3. Staleness detection: vocab hash, map version, subject, predicate
  4. Coverage: every triggered risk code → ≥1 task
  5. Submission gating: HIGH open blocks, WAIVED allows, SIGNIFICANT needs refs
  6. RISK_TO_TASK completeness: all 24 codes mapped
  7. CSV export: stable columns, correct ordering
  8. Reviewer questions: non-LLM, present for SIGNIFICANT codes
  9. Evidence ops models: validation, waiver rules, completions
"""

from __future__ import annotations

import csv
import io
import json
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict

import pytest

# ── Import the lockfile to get canonical 24 codes ──
LOCK_PATH = Path(__file__).parent.parent / "shadow_service" / "predicate_intel" / "risk_codes.lock.json"
with open(LOCK_PATH) as f:
    LOCK_DATA = json.load(f)
ALL_24_CODES = LOCK_DATA["risk_codes"]
SIGNIFICANT_CODES = LOCK_DATA["significant_risk_codes"]

# ── Import builder + models ──
from shadow_service.predicate_intel.defense_packet import (
    RISK_TO_TASK,
    REVIEWER_QUESTIONS,
    PACKET_VERSION,
    CSV_COLUMNS,
    _stable_task_id,
    _sha256_hex,
    build_defense_packet_from_manifest,
    is_packet_stale,
    check_submission_gate,
    packet_tasks_to_csv,
    STALE_RISK_CODE_MAP_CHANGED,
    STALE_RISK_VOCAB_CHANGED,
    STALE_SUBJECT_CHANGED,
    STALE_PREDICATE_CHANGED,
    STALE_PREDICATE_DATA_REFRESHED,
)
from shadow_service.predicate_intel.risk_vocab import load_risk_vocab_hash
from shadow_service.predicate_intel.manifest import (
    compute_risk_vocab_hash,
    compute_subject_hash,
    compute_manifest_hash,
    GENERATOR_VERSION,
)
from shadow_service.scoring.risk_code_map import (
    RISK_CODE_MAP_VERSION,
    RISK_CODE_TO_CATEGORY,
    RISK_CODE_TO_ARTIFACTS,
    RISK_CODE_SEVERITY_DEFAULT,
    RISK_CODE_LABELS,
    RISK_CODE_DISCUSSION_TEMPLATE,
    ALL_RISK_CODES,
    SIGNIFICANT_RISK_CODES as SIG_CODES_SET,
)
from shadow_service.models_defense_packet import (
    EvidenceSeverity,
    EvidenceTaskState,
    PacketOpsStatus,
    EvidenceCategory,
    EvidenceRef,
    EvidenceTaskCompletion,
    EvidenceTaskFull,
    DefensePacketFull,
    ReviewerQuestionSeed,
    SubmissionGateResult,
    DefensePacketRenderStatus,
    DefensePacketDBStatus,
    DefensePacketStatus,
    DefensePacketRecord,
    CreateDefensePacketRequest,
    CreateDefensePacketResponse,
    DefensePacketDiffSummary,
    StalenessCheckResult,
    VALID_STATUS_TRANSITIONS,
    is_valid_transition,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

def _make_manifest(
    risk_codes: list[str] | None = None,
    rows: list[dict] | None = None,
    readiness: int = 65,
    predicate_k: str = "K123456",
) -> Dict[str, Any]:
    """Create a test manifest dict."""
    if risk_codes is None:
        risk_codes = ["IU_MISMATCH", "MATERIAL_CHANGE"]
    if rows is None:
        rows = [
            {
                "characteristic": "IntendedUse",
                "triggered_risk_codes": ["IU_MISMATCH"],
            },
            {
                "characteristic": "Materials",
                "triggered_risk_codes": ["MATERIAL_CHANGE"],
            },
        ]

    subject = {"device_name": "TestDevice", "product_code": "ABC"}
    subject_hash = compute_subject_hash(subject)

    manifest = {
        "subject_hash": subject_hash,
        "program_id": "prog-001",
        "product_code": "ABC",
        "predicate_k_number": predicate_k,
        "generator_version": GENERATOR_VERSION,
        "risk_code_map_version": str(RISK_CODE_MAP_VERSION),
        "risk_vocab_hash": compute_risk_vocab_hash(),
        "manifest_hash": "",
        "generated_at": "2026-02-11T00:00:00Z",
        "risk_codes_used": risk_codes,
        "evidence_task_ids": [],
        "defense_readiness_score": readiness,
        "top_risks": risk_codes[:5],
        "se_matrix": {"rows": rows},
    }
    manifest["manifest_hash"] = compute_manifest_hash(manifest)
    return manifest


# ═══════════════════════════════════════════════════════════════════════════════
# Class 1: RISK_TO_TASK Completeness
# ═══════════════════════════════════════════════════════════════════════════════

class TestRiskToTaskCompleteness:
    """Verify all 24 canonical risk codes are mapped to tasks."""

    def test_all_24_codes_in_risk_to_task(self):
        """Every code from risk_codes.lock.json must be in RISK_TO_TASK."""
        for code in ALL_24_CODES:
            assert code in RISK_TO_TASK, f"Missing RISK_TO_TASK entry for {code}"

    def test_risk_to_task_count(self):
        assert len(RISK_TO_TASK) == 24

    def test_each_entry_has_correct_shape(self):
        for code, entry in RISK_TO_TASK.items():
            assert len(entry) == 6, f"{code}: expected 6-tuple, got {len(entry)}"
            cat, sev, title, why, criteria, artifacts = entry
            assert isinstance(cat, EvidenceCategory), f"{code}: bad category type"
            assert isinstance(sev, EvidenceSeverity), f"{code}: bad severity type"
            assert isinstance(title, str) and len(title) > 5, f"{code}: bad title"
            assert isinstance(why, str) and len(why) > 10, f"{code}: bad why_it_matters"
            assert isinstance(criteria, list) and len(criteria) >= 1, f"{code}: no acceptance_criteria"
            assert isinstance(artifacts, list) and len(artifacts) >= 1, f"{code}: no recommended_artifacts"

    def test_severity_matches_canonical_map(self):
        """RISK_TO_TASK severity must match RISK_CODE_SEVERITY_DEFAULT (canonical)."""
        sev_map = {"HIGH": EvidenceSeverity.HIGH, "MEDIUM": EvidenceSeverity.MEDIUM, "LOW": EvidenceSeverity.LOW}
        for code, entry in RISK_TO_TASK.items():
            expected_sev = sev_map[RISK_CODE_SEVERITY_DEFAULT[code]]
            assert entry[1] == expected_sev, (
                f"{code}: RISK_TO_TASK severity={entry[1].value} but "
                f"canonical severity={RISK_CODE_SEVERITY_DEFAULT[code]}"
            )

    def test_category_matches_primary_canonical(self):
        """RISK_TO_TASK primary category must match first category in RISK_CODE_TO_CATEGORY."""
        cat_map = {v.value: v for v in EvidenceCategory}
        for code, entry in RISK_TO_TASK.items():
            canonical_cats = RISK_CODE_TO_CATEGORY.get(code, [])
            if canonical_cats:
                expected_cat = cat_map.get(canonical_cats[0])
                assert entry[0] == expected_cat, (
                    f"{code}: RISK_TO_TASK category={entry[0].value} but "
                    f"canonical primary={canonical_cats[0]}"
                )

    def test_artifacts_overlap_with_canonical(self):
        """RISK_TO_TASK artifacts should overlap with RISK_CODE_TO_ARTIFACTS."""
        for code, entry in RISK_TO_TASK.items():
            canonical = set(RISK_CODE_TO_ARTIFACTS.get(code, []))
            task_artifacts = set(entry[5])
            overlap = canonical & task_artifacts
            assert len(overlap) > 0, (
                f"{code}: No artifact overlap between RISK_TO_TASK and RISK_CODE_TO_ARTIFACTS"
            )


# ═══════════════════════════════════════════════════════════════════════════════
# Class 2: Determinism
# ═══════════════════════════════════════════════════════════════════════════════

class TestDeterminism:
    """Same inputs → same packet (except generated_at)."""

    def test_same_inputs_same_packet_id(self):
        manifest = _make_manifest()
        subject_hash = manifest["subject_hash"]

        p1 = build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC",
            manifest=manifest, subject_hash=subject_hash,
        )
        p2 = build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC",
            manifest=manifest, subject_hash=subject_hash,
        )

        assert p1.packet_id == p2.packet_id
        assert p1.manifest_hash == p2.manifest_hash
        assert p1.packet_id == manifest["manifest_hash"]

    def test_same_inputs_same_tasks(self):
        manifest = _make_manifest()
        sh = manifest["subject_hash"]

        p1 = build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC", manifest=manifest, subject_hash=sh,
        )
        p2 = build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC", manifest=manifest, subject_hash=sh,
        )

        assert len(p1.tasks) == len(p2.tasks)
        for t1, t2 in zip(p1.tasks, p2.tasks):
            assert t1.task_id == t2.task_id
            assert t1.severity == t2.severity
            assert t1.category == t2.category
            assert t1.title == t2.title

    def test_different_inputs_different_packet_id(self):
        m1 = _make_manifest(risk_codes=["IU_MISMATCH"])
        m2 = _make_manifest(risk_codes=["MATERIAL_CHANGE"])
        sh1 = m1["subject_hash"]
        sh2 = m2["subject_hash"]

        p1 = build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC", manifest=m1, subject_hash=sh1,
        )
        p2 = build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC", manifest=m2, subject_hash=sh2,
        )

        assert p1.packet_id != p2.packet_id

    def test_generated_at_excluded_from_hash(self):
        """generated_at doesn't affect manifest_hash → packet_id is stable."""
        m1 = _make_manifest()
        m2 = deepcopy(m1)
        m2["generated_at"] = "2099-12-31T23:59:59Z"
        # Recompute hash — generated_at is excluded
        m2["manifest_hash"] = compute_manifest_hash(m2)
        assert m1["manifest_hash"] == m2["manifest_hash"]

    def test_stable_task_id_deterministic(self):
        id1 = _stable_task_id("BenchTesting", "ENERGY_SOURCE_CHANGE", "abc123", "K123456")
        id2 = _stable_task_id("BenchTesting", "ENERGY_SOURCE_CHANGE", "abc123", "K123456")
        assert id1 == id2
        assert len(id1) == 12


# ═══════════════════════════════════════════════════════════════════════════════
# Class 3: Task Ordering
# ═══════════════════════════════════════════════════════════════════════════════

class TestTaskOrdering:
    """Tasks must be sorted: severity desc, category, task_id."""

    def test_high_before_medium_before_low(self):
        manifest = _make_manifest(
            risk_codes=["IU_MISMATCH", "TECH_DIFFERENCE", "LABELING_IFU_GAP"],
            rows=[
                {"characteristic": "IntendedUse", "triggered_risk_codes": ["IU_MISMATCH"]},
                {"characteristic": "Technology", "triggered_risk_codes": ["TECH_DIFFERENCE"]},
                {"characteristic": "Labeling", "triggered_risk_codes": ["LABELING_IFU_GAP"]},
            ],
        )
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

        severities = [t.severity for t in pkt.tasks]
        assert severities[0] == EvidenceSeverity.HIGH
        assert severities[-1] == EvidenceSeverity.LOW

    def test_same_severity_sorted_by_category(self):
        """Within same severity tier, tasks should be sorted by category."""
        manifest = _make_manifest(
            risk_codes=["STANDARDS_GAP", "TECH_DIFFERENCE", "STERILIZATION_METHOD_CHANGE"],
            rows=[
                {"characteristic": "Standards", "triggered_risk_codes": ["STANDARDS_GAP"]},
                {"characteristic": "Technology", "triggered_risk_codes": ["TECH_DIFFERENCE"]},
                {"characteristic": "Sterilization", "triggered_risk_codes": ["STERILIZATION_METHOD_CHANGE"]},
            ],
        )
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

        # All three are MEDIUM severity
        medium_tasks = [t for t in pkt.tasks if t.severity == EvidenceSeverity.MEDIUM]
        categories = [t.category.value for t in medium_tasks]
        assert categories == sorted(categories), f"Not sorted by category: {categories}"

    def test_all_lists_are_sorted(self):
        """triggered_risk_codes, se_matrix_rows, etc. must be sorted."""
        manifest = _make_manifest()
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

        for task in pkt.tasks:
            assert task.triggered_risk_codes == sorted(task.triggered_risk_codes)
            assert task.se_matrix_rows == sorted(task.se_matrix_rows)
            assert task.recommended_artifacts == sorted(task.recommended_artifacts)
            assert task.artifact_targets == sorted(task.artifact_targets)


# ═══════════════════════════════════════════════════════════════════════════════
# Class 4: Staleness Detection
# ═══════════════════════════════════════════════════════════════════════════════

class TestStaleness:
    """Staleness detection for defense packets."""

    def _build_packet(self) -> DefensePacketFull:
        manifest = _make_manifest()
        return build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

    def test_not_stale_when_current(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(pkt)
        assert reasons == []

    def test_stale_when_vocab_hash_changed(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(pkt, current_vocab_hash="changed_hash_abc123")
        assert STALE_RISK_VOCAB_CHANGED in reasons

    def test_stale_when_map_version_changed(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(pkt, current_map_version="99.0.0")
        assert STALE_RISK_CODE_MAP_CHANGED in reasons

    def test_stale_when_subject_changed(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(pkt, current_subject_hash="different_hash")
        assert STALE_SUBJECT_CHANGED in reasons

    def test_stale_when_predicate_changed(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(
            pkt,
            current_predicate_k="K999999",
            packet_predicate_k="K000001",
        )
        assert STALE_PREDICATE_CHANGED in reasons

    def test_stale_when_predicate_refreshed(self):
        pkt = self._build_packet()
        future_ts = datetime.now(timezone.utc) + timedelta(hours=1)
        reasons = is_packet_stale(pkt, predicate_refresh_timestamp=future_ts)
        assert STALE_PREDICATE_DATA_REFRESHED in reasons

    def test_multiple_stale_reasons(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(
            pkt,
            current_vocab_hash="changed",
            current_map_version="99.0.0",
            current_subject_hash="different",
        )
        assert len(reasons) >= 3
        assert STALE_RISK_VOCAB_CHANGED in reasons
        assert STALE_RISK_CODE_MAP_CHANGED in reasons
        assert STALE_SUBJECT_CHANGED in reasons

    def test_stale_reasons_are_sorted(self):
        pkt = self._build_packet()
        reasons = is_packet_stale(
            pkt,
            current_vocab_hash="x",
            current_map_version="y",
            current_subject_hash="z",
        )
        assert reasons == sorted(reasons)


# ═══════════════════════════════════════════════════════════════════════════════
# Class 5: Task Coverage
# ═══════════════════════════════════════════════════════════════════════════════

class TestTaskCoverage:
    """Every triggered risk code must yield ≥1 evidence task."""

    def test_every_code_yields_task(self):
        """Build packet with all 24 codes → each produces at least 1 task."""
        rows = [
            {"characteristic": f"Row_{code}", "triggered_risk_codes": [code]}
            for code in ALL_24_CODES
        ]
        manifest = _make_manifest(risk_codes=ALL_24_CODES, rows=rows)
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

        task_codes = set()
        for task in pkt.tasks:
            task_codes.update(task.triggered_risk_codes)

        for code in ALL_24_CODES:
            assert code in task_codes, f"No task generated for risk code {code}"

    def test_task_count_matches_unique_codes(self):
        """Each code gets exactly 1 merged task (since task_id includes code)."""
        rows = [
            {"characteristic": f"Row_{code}", "triggered_risk_codes": [code]}
            for code in ALL_24_CODES
        ]
        manifest = _make_manifest(risk_codes=ALL_24_CODES, rows=rows)
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )
        # Each code should produce exactly 1 task (deduped by task_id)
        assert len(pkt.tasks) == 24

    def test_duplicate_row_triggers_merge(self):
        """Same code from multiple rows → single task with merged rows."""
        rows = [
            {"characteristic": "Row_A", "triggered_risk_codes": ["IU_MISMATCH"]},
            {"characteristic": "Row_B", "triggered_risk_codes": ["IU_MISMATCH"]},
        ]
        manifest = _make_manifest(risk_codes=["IU_MISMATCH"], rows=rows)
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

        iu_tasks = [t for t in pkt.tasks if "IU_MISMATCH" in t.triggered_risk_codes]
        assert len(iu_tasks) == 1
        assert "Row_A" in iu_tasks[0].se_matrix_rows
        assert "Row_B" in iu_tasks[0].se_matrix_rows


# ═══════════════════════════════════════════════════════════════════════════════
# Class 6: Submission Gating
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubmissionGating:
    """Submission gate blocks when HIGH tasks are incomplete."""

    def _build_packet_with_codes(self, codes: list[str]) -> DefensePacketFull:
        rows = [
            {"characteristic": f"Row_{c}", "triggered_risk_codes": [c]}
            for c in codes
        ]
        manifest = _make_manifest(risk_codes=codes, rows=rows)
        return build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

    def test_blocked_when_high_tasks_open(self):
        """Packet with HIGH tasks OPEN → BLOCKED."""
        pkt = self._build_packet_with_codes(["IU_MISMATCH", "ENERGY_SOURCE_CHANGE"])
        gate = check_submission_gate(pkt)
        assert not gate.allowed
        assert len(gate.blocking_task_ids) > 0
        assert "Packaging blocked" in gate.reason

    def test_allowed_when_no_high_tasks(self):
        """Packet with only LOW tasks → allowed."""
        pkt = self._build_packet_with_codes(["LABELING_IFU_GAP", "PACKAGING_SYSTEM_CHANGE"])
        # These are LOW severity — no blocking
        gate = check_submission_gate(pkt)
        # May still have SIGNIFICANT blocking; but these codes are not significant
        has_sig = any(
            code in SIG_CODES_SET
            for t in pkt.tasks
            for code in t.triggered_risk_codes
        )
        if not has_sig:
            assert gate.allowed

    def test_blocked_significant_without_refs(self):
        """SIGNIFICANT risk code without evidence refs → blocked."""
        pkt = self._build_packet_with_codes(["IU_MISMATCH"])  # IU_MISMATCH is SIGNIFICANT
        gate = check_submission_gate(pkt)
        assert not gate.allowed
        # IU_MISMATCH is both HIGH and SIGNIFICANT
        assert len(gate.blocking_task_ids) > 0 or len(gate.blocking_risk_codes) > 0

    def test_gate_result_has_next_actions(self):
        pkt = self._build_packet_with_codes(["IU_MISMATCH"])
        gate = check_submission_gate(pkt)
        if not gate.allowed:
            assert len(gate.recommended_next_actions) > 0

    def test_gate_override_available_when_blocked(self):
        pkt = self._build_packet_with_codes(["IU_MISMATCH"])
        gate = check_submission_gate(pkt)
        if not gate.allowed:
            assert gate.override_available

    def test_gate_result_structure(self):
        pkt = self._build_packet_with_codes(["IU_MISMATCH"])
        gate = check_submission_gate(pkt)
        assert isinstance(gate, SubmissionGateResult)
        assert isinstance(gate.blocking_task_ids, list)
        assert isinstance(gate.blocking_risk_codes, list)
        assert isinstance(gate.missing_evidence_refs, list)


# ═══════════════════════════════════════════════════════════════════════════════
# Class 7: CSV Export
# ═══════════════════════════════════════════════════════════════════════════════

class TestCSVExport:
    """CSV export produces stable, enterprise-friendly output."""

    def _build_packet(self) -> DefensePacketFull:
        manifest = _make_manifest()
        return build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

    def test_csv_has_correct_header(self):
        pkt = self._build_packet()
        csv_str = packet_tasks_to_csv(pkt)
        reader = csv.reader(io.StringIO(csv_str))
        header = next(reader)
        assert header == CSV_COLUMNS

    def test_csv_row_count_matches_tasks(self):
        pkt = self._build_packet()
        csv_str = packet_tasks_to_csv(pkt)
        reader = csv.reader(io.StringIO(csv_str))
        rows = list(reader)
        assert len(rows) == len(pkt.tasks) + 1  # +1 for header

    def test_csv_is_stable(self):
        """Same packet → same CSV output."""
        pkt = self._build_packet()
        csv1 = packet_tasks_to_csv(pkt)
        csv2 = packet_tasks_to_csv(pkt)
        assert csv1 == csv2

    def test_csv_task_id_column(self):
        pkt = self._build_packet()
        csv_str = packet_tasks_to_csv(pkt)
        reader = csv.reader(io.StringIO(csv_str))
        next(reader)  # skip header
        for row in reader:
            assert len(row[0]) >= 8  # task_id min length


# ═══════════════════════════════════════════════════════════════════════════════
# Class 8: Reviewer Questions
# ═══════════════════════════════════════════════════════════════════════════════

class TestReviewerQuestions:
    """Non-LLM reviewer questions are deterministic and present for key codes."""

    def test_all_significant_codes_have_questions(self):
        """SIGNIFICANT risk codes must have at least 1 reviewer question."""
        for code in SIGNIFICANT_CODES:
            assert code in REVIEWER_QUESTIONS, f"Missing reviewer questions for SIGNIFICANT code {code}"
            assert len(REVIEWER_QUESTIONS[code]) >= 1

    def test_all_high_severity_have_questions(self):
        """HIGH severity codes should have reviewer questions."""
        for code in ALL_24_CODES:
            if RISK_CODE_SEVERITY_DEFAULT.get(code) == "HIGH":
                assert code in REVIEWER_QUESTIONS, f"Missing reviewer questions for HIGH code {code}"

    def test_reviewer_questions_in_built_packet(self):
        """Built packet tasks include anticipated_questions."""
        manifest = _make_manifest(risk_codes=["IU_MISMATCH"])
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

        iu_tasks = [t for t in pkt.tasks if "IU_MISMATCH" in t.triggered_risk_codes]
        assert len(iu_tasks) >= 1
        assert len(iu_tasks[0].anticipated_questions) >= 1
        q = iu_tasks[0].anticipated_questions[0]
        assert isinstance(q, ReviewerQuestionSeed)
        assert len(q.question) > 10

    def test_question_has_recommended_sections(self):
        """Each question should have recommended sections and artifacts."""
        for code, questions in REVIEWER_QUESTIONS.items():
            for q in questions:
                assert "question" in q and len(q["question"]) > 10
                assert "recommended_sections" in q and len(q["recommended_sections"]) >= 1
                assert "recommended_artifacts" in q and len(q["recommended_artifacts"]) >= 1

    def test_all_24_codes_have_questions(self):
        """Every one of the 24 codes has at least 1 reviewer question."""
        for code in ALL_24_CODES:
            assert code in REVIEWER_QUESTIONS, f"Missing reviewer questions for {code}"


# ═══════════════════════════════════════════════════════════════════════════════
# Class 9: Evidence Ops Models
# ═══════════════════════════════════════════════════════════════════════════════

class TestEvidenceOpsModels:
    """Pydantic model validation for evidence ops types."""

    def test_evidence_severity_enum(self):
        assert EvidenceSeverity.HIGH.value == "High"
        assert EvidenceSeverity.MEDIUM.value == "Medium"
        assert EvidenceSeverity.LOW.value == "Low"

    def test_evidence_task_state_enum(self):
        assert EvidenceTaskState.OPEN.value == "OPEN"
        assert EvidenceTaskState.WAIVED.value == "WAIVED"

    def test_packet_ops_status_enum(self):
        assert PacketOpsStatus.BLOCKED.value == "BLOCKED"
        assert PacketOpsStatus.READY.value == "READY"

    def test_evidence_category_enum(self):
        assert len(EvidenceCategory) == 10
        assert EvidenceCategory.BenchTesting.value == "BenchTesting"

    def test_evidence_ref_model(self):
        ref = EvidenceRef(ref_type="TRUTH_PLACEHOLDER", ref_id="TMP::abc123")
        assert ref.ref_type == "TRUTH_PLACEHOLDER"
        assert ref.ref_id == "TMP::abc123"

    def test_completion_waiver_validation(self):
        """Waived state requires waiver_reason."""
        with pytest.raises(Exception):
            EvidenceTaskCompletion(state=EvidenceTaskState.WAIVED, waiver_reason=None)

    def test_completion_waiver_valid(self):
        c = EvidenceTaskCompletion(
            state=EvidenceTaskState.WAIVED,
            waiver_reason="Approved by VP Regulatory",
        )
        assert c.state == EvidenceTaskState.WAIVED

    def test_evidence_task_full_list_sorting(self):
        """Lists in EvidenceTaskFull are auto-sorted."""
        task = EvidenceTaskFull(
            task_id="abcd1234abcd",
            severity=EvidenceSeverity.HIGH,
            category=EvidenceCategory.BenchTesting,
            triggered_risk_codes=["MATERIAL_CHANGE", "ENERGY_SOURCE_CHANGE"],
            se_matrix_rows=["Zulu", "Alpha"],
            title="Test task",
            why_it_matters="Test reason",
            acceptance_criteria=["c1"],
            recommended_artifacts=["Bench Test Report", "FMEA / Hazard Analysis"],
            artifact_targets=["Z_TARGET", "A_TARGET"],
        )
        assert task.triggered_risk_codes == ["ENERGY_SOURCE_CHANGE", "MATERIAL_CHANGE"]
        assert task.se_matrix_rows == ["Alpha", "Zulu"]
        assert task.artifact_targets == ["A_TARGET", "Z_TARGET"]

    def test_submission_gate_result(self):
        gate = SubmissionGateResult(
            allowed=False,
            blocking_task_ids=["t1"],
            reason="Packaging blocked: 1 HIGH task(s) not completed",
        )
        assert not gate.allowed
        assert gate.override_available is False  # default

    def test_defense_packet_full_lists_sorted(self):
        """DefensePacketFull auto-sorts top_risks and stale_reasons."""
        pkt = DefensePacketFull(
            packet_id="test",
            manifest_hash="test",
            subject_hash="test",
            program_id="p1",
            product_code="X",
            generated_at=datetime.now(timezone.utc),
            risk_code_map_version="2.0.0",
            risk_vocab_hash="abc",
            readiness_score=50.0,
            top_risks=["MATERIAL_CHANGE", "IU_MISMATCH"],
            stale_reasons=["RISK_VOCAB_CHANGED", "RISK_CODE_MAP_CHANGED"],
        )
        assert pkt.top_risks == sorted(pkt.top_risks)
        assert pkt.stale_reasons == sorted(pkt.stale_reasons)


# ═══════════════════════════════════════════════════════════════════════════════
# Class 10: Backward Compatibility (existing DB models still work)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBackwardCompatibility:
    """Verify existing DB persistence models are not broken."""

    def test_defense_packet_status_alias(self):
        """DefensePacketStatus alias maps to ops lifecycle."""
        status: DefensePacketStatus = PacketOpsStatus.CREATED
        assert status == PacketOpsStatus.CREATED

    def test_render_status_literal(self):
        """DefensePacketRenderStatus still accepts valid values."""
        s: DefensePacketRenderStatus = "RENDERING"
        assert s == "RENDERING"

    def test_db_status_alias_literal(self):
        """DefensePacketDBStatus still accepts render pipeline values."""
        s: DefensePacketDBStatus = "RENDERED"
        assert s == "RENDERED"

    def test_valid_transitions_unchanged(self):
        assert is_valid_transition("CREATED", "RENDERING")
        assert is_valid_transition("RENDERING", "RENDERED")
        assert is_valid_transition("RENDERED", "STALE")
        assert is_valid_transition("STALE", "CREATED")
        assert not is_valid_transition("FAILED", "CREATED")

    def test_defense_packet_record_model(self):
        r = DefensePacketRecord(
            id="uuid-1",
            program_id="p1",
            subject_hash="sh",
            predicate_k_number="K123",
            risk_code_map_version="2.0.0",
            risk_vocab_hash="abc",
            generator_version="6.6.C2",
            defense_readiness_score=50,
            manifest_hash="mh",
        )
        assert r.id == "uuid-1"
        assert r.status == "CREATED"

    def test_create_request_model(self):
        req = CreateDefensePacketRequest(
            program_id="p1",
            selected_predicate_k_number="K123",
        )
        assert req.render is True

    def test_staleness_check_result(self):
        r = StalenessCheckResult(is_stale=True, reasons=["test"])
        assert r.is_stale

    def test_diff_summary(self):
        d = DefensePacketDiffSummary(
            previous_manifest_hash="a",
            current_manifest_hash="b",
            readiness_score_delta=5,
        )
        assert d.readiness_score_delta == 5


# ═══════════════════════════════════════════════════════════════════════════════
# Class 11: Risk Vocab Helper
# ═══════════════════════════════════════════════════════════════════════════════

class TestRiskVocabHelper:
    """risk_vocab.py hash helper."""

    def test_load_risk_vocab_hash_returns_string(self):
        h = load_risk_vocab_hash()
        assert isinstance(h, str)
        assert len(h) == 64  # full sha256 hex

    def test_load_risk_vocab_hash_deterministic(self):
        h1 = load_risk_vocab_hash()
        h2 = load_risk_vocab_hash()
        assert h1 == h2

    def test_matches_manifest_compute(self):
        """risk_vocab.py hash should match (or be compatible with) manifest hash."""
        full_hash = load_risk_vocab_hash()
        short_hash = compute_risk_vocab_hash()  # manifest.py returns truncated
        assert full_hash.startswith(short_hash)


# ═══════════════════════════════════════════════════════════════════════════════
# Class 12: Packet Fields Validation
# ═══════════════════════════════════════════════════════════════════════════════

class TestPacketFields:
    """Verify built packet has all required fields populated correctly."""

    def _build(self) -> DefensePacketFull:
        manifest = _make_manifest()
        return build_defense_packet_from_manifest(
            program_id="prog-001", product_code="ABC",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )

    def test_packet_version(self):
        pkt = self._build()
        assert pkt.packet_version == PACKET_VERSION

    def test_risk_code_map_version_matches_lockfile(self):
        pkt = self._build()
        assert pkt.risk_code_map_version == str(RISK_CODE_MAP_VERSION)

    def test_risk_vocab_hash_populated(self):
        pkt = self._build()
        assert len(pkt.risk_vocab_hash) > 0

    def test_readiness_score_in_range(self):
        pkt = self._build()
        assert 0 <= pkt.readiness_score <= 100

    def test_status_blocked_when_high_present(self):
        """IU_MISMATCH is HIGH → packet starts as BLOCKED."""
        pkt = self._build()
        high_tasks = [t for t in pkt.tasks if t.severity == EvidenceSeverity.HIGH]
        if high_tasks:
            assert pkt.status == PacketOpsStatus.BLOCKED

    def test_top_risks_max_8(self):
        rows = [
            {"characteristic": f"Row_{c}", "triggered_risk_codes": [c]}
            for c in ALL_24_CODES
        ]
        manifest = _make_manifest(risk_codes=ALL_24_CODES, rows=rows)
        pkt = build_defense_packet_from_manifest(
            program_id="p1", product_code="X",
            manifest=manifest, subject_hash=manifest["subject_hash"],
        )
        assert len(pkt.top_risks) <= 8

    def test_tasks_have_truth_machine_placeholders(self):
        pkt = self._build()
        for task in pkt.tasks:
            assert task.truth_machine_placeholder_id is not None
            assert task.truth_machine_placeholder_id.startswith("TMP::")

    def test_tasks_have_artifact_targets(self):
        pkt = self._build()
        for task in pkt.tasks:
            assert len(task.artifact_targets) >= 1
            manifest_target = [t for t in task.artifact_targets if t.startswith("MANIFEST::")]
            assert len(manifest_target) >= 1

    def test_all_tasks_start_open(self):
        pkt = self._build()
        for task in pkt.tasks:
            assert task.completion.state == EvidenceTaskState.OPEN
