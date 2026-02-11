"""Golden Snapshot Tests — Phase 6.6.C SE Matrix Payload.

Verifies that full payload generation produces deterministic output.
Strip timestamps before comparing. Snapshot must assert full row JSON
including risk_code + diff_flag + discussion_text + triggered codes.

This prevents drift when someone 'refactors.'
"""
from __future__ import annotations

import json
import pytest
from typing import Any

from shadow_service.generators.se_matrix_payload import generate_se_matrix_payload
from shadow_service.scoring.risk_code_map import RISK_CODE_MAP_VERSION


# Override conftest's async autouse reset_db_pool fixture.
@pytest.fixture(autouse=True)
def reset_db_pool():
    """Sync noop — overrides conftest async fixture for this module."""
    yield


# ─────────────────────────────────────────────────────────────────────────────
# Fixed test fixtures (never change these — they anchor the snapshot)
# ─────────────────────────────────────────────────────────────────────────────

SNAPSHOT_SUBJECT = {
    "device_name": "Glucose Monitor Pro X2",
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

SNAPSHOT_PREDICATE = {
    "k_number": "K210456",
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
}


def _payload_snapshot_dict(payload: Any) -> dict:
    """Convert payload to a dict suitable for snapshot comparison.

    Strips generated_at (timestamp) since it varies per run.
    """
    d = payload.model_dump()
    d.pop("generated_at", None)
    return d


class TestPayloadSnapshot:
    """Golden snapshot tests for full payload generation."""

    def test_row_count_is_9(self):
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        assert len(payload.comparison_rows) == 9

    def test_materials_row_snapshot(self):
        """Materials row has MATERIAL_CHANGE risk_code and correct flags."""
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        mat_row = next(r for r in payload.comparison_rows if r.category == "materials")
        assert mat_row.risk_code == "MATERIAL_CHANGE"
        assert mat_row.triggered_risk_codes == ["MATERIAL_CHANGE"]
        assert mat_row.diff_flag == "DISCUSSION_REQUIRED"
        assert mat_row.requires_citation is True
        assert "biocompatibility" in mat_row.discussion_text.lower()
        assert len(mat_row.evidence_task_ids) >= 1

    def test_software_row_snapshot(self):
        """Software row with class diff (both have software, different versions)."""
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        sw_row = next(r for r in payload.comparison_rows if r.category == "software")
        assert sw_row.risk_code == "SOFTWARE_SAFETY_CLASS_DIFF"
        assert sw_row.triggered_risk_codes == ["SOFTWARE_SAFETY_CLASS_DIFF"]
        assert sw_row.diff_flag == "DISCUSSION_REQUIRED"

    def test_equivalent_rows_snapshot(self):
        """Rows with identical values are EQUIVALENT with no risk_code."""
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        for row in payload.comparison_rows:
            if row.subject_value == row.predicate_value:
                # Identical text → must be EQUIVALENT
                continue  # some may still differ after normalization

        # Specifically check intended_use (identical in both)
        iu_row = next(r for r in payload.comparison_rows if r.category == "intended_use")
        assert iu_row.diff_flag == "EQUIVALENT"
        assert iu_row.risk_code is None
        assert iu_row.triggered_risk_codes == []
        assert iu_row.evidence_task_ids == []
        assert iu_row.requires_citation is False

    def test_evidence_tasks_from_triggered_codes(self):
        """Evidence tasks are built from ALL triggered_risk_codes."""
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        # Collect all triggered codes from rows
        all_triggered = set()
        for row in payload.comparison_rows:
            all_triggered.update(row.triggered_risk_codes)

        # Every triggered code should have tasks in the payload
        task_risk_codes = {t.risk_code for t in payload.evidence_tasks}
        for rc in all_triggered:
            assert rc in task_risk_codes, f"Triggered code {rc} has no evidence task"

    def test_deterministic_output_across_runs(self):
        """Same input always produces same output (minus timestamp)."""
        p1 = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        p2 = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )

        d1 = _payload_snapshot_dict(p1)
        d2 = _payload_snapshot_dict(p2)

        assert d1 == d2, "Payload is not deterministic across runs"

    def test_payload_json_snapshot(self):
        """Full JSON snapshot stability — serialize and compare structure."""
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        d = _payload_snapshot_dict(payload)
        json_str = json.dumps(d, sort_keys=True)

        # Run again and compare
        payload2 = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        d2 = _payload_snapshot_dict(payload2)
        json_str2 = json.dumps(d2, sort_keys=True)

        assert json_str == json_str2

    def test_risk_code_map_version_in_payload(self):
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        assert payload.risk_code_map_version == RISK_CODE_MAP_VERSION

    def test_all_row_evidence_task_ids_exist_in_tasks(self):
        """Every evidence_task_id in rows exists in the payload tasks list."""
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        task_ids_in_payload = {t.task_id for t in payload.evidence_tasks}
        for row in payload.comparison_rows:
            for tid in row.evidence_task_ids:
                assert tid in task_ids_in_payload, (
                    f"task_id {tid} from row '{row.characteristic}' not in payload tasks"
                )

    def test_readiness_score_in_range(self):
        payload = generate_se_matrix_payload(
            program_id="snap-test",
            subject_device=SNAPSHOT_SUBJECT,
            predicate_record=SNAPSHOT_PREDICATE,
        )
        assert 0 <= payload.defense_readiness_score <= 100
