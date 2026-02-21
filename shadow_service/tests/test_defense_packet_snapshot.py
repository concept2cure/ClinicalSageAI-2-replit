"""Phase 6.6.D1 — Golden JSON + CSV Snapshot Tests.

Ensures the defense packet builder output structure is stable across changes.
Golden files are auto-generated on first run, then compared on subsequent runs.

Test categories:
  1. Golden JSON: build packet, strip volatile fields, compare structure/values
  2. Golden CSV: export tasks to CSV, compare column headers + row count
  3. Spec alias parity: EvidenceTask / DefensePacket / DefensePacketOpsStatus
"""

from __future__ import annotations

import csv
import io
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import pytest

# ── Shared helpers / lockfile ──
LOCK_PATH = Path(__file__).parent.parent / "shadow_service" / "predicate_intel" / "risk_codes.lock.json"
with open(LOCK_PATH) as f:
    LOCK_DATA = json.load(f)
ALL_24_CODES = LOCK_DATA["risk_codes"]
SIGNIFICANT_CODES = LOCK_DATA["significant_risk_codes"]

# ── Builder + models ──
from shadow_service.predicate_intel.defense_packet import (
    RISK_TO_TASK,
    REVIEWER_QUESTIONS,
    PACKET_VERSION,
    CSV_COLUMNS,
    build_defense_packet_from_manifest,
    packet_tasks_to_csv,
    check_submission_gate,
)
from shadow_service.predicate_intel.manifest import (
    compute_risk_vocab_hash,
    compute_subject_hash,
    compute_manifest_hash,
    GENERATOR_VERSION,
)
from shadow_service.scoring.risk_code_map import (
    RISK_CODE_MAP_VERSION,
    ALL_RISK_CODES,
)
from shadow_service.models_defense_packet import (
    # Original names (backward compat)
    EvidenceTaskFull,
    DefensePacketFull,
    PacketOpsStatus,
    EvidenceSeverity,
    EvidenceCategory,
    EvidenceTaskState,
    ReviewerQuestionSeed,
    SubmissionGateResult,
    # Spec D1 aliases
    EvidenceTask,
    DefensePacket,
    DefensePacketOpsStatus,
)

# ── Golden file paths ──
GOLDEN_DIR = Path(__file__).parent / "golden"
GOLDEN_JSON_PATH = GOLDEN_DIR / "defense_packet_d1.golden.json"
GOLDEN_CSV_PATH = GOLDEN_DIR / "defense_packet_d1.golden.csv"


# ═══════════════════════════════════════════════════════════════════════════════
# Fixture: deterministic manifest with ALL 24 codes
# ═══════════════════════════════════════════════════════════════════════════════

def _make_full_manifest() -> Dict[str, Any]:
    """Build a test manifest that triggers ALL 24 risk codes.
    Deterministic: same inputs every time.
    """
    rows = [
        {
            "characteristic": f"char_{i}",
            "triggered_risk_codes": [code],
        }
        for i, code in enumerate(ALL_24_CODES)
    ]

    subject = {"device_name": "SnapshotDevice", "product_code": "SNP"}
    subject_hash = compute_subject_hash(subject)

    manifest = {
        "subject_hash": subject_hash,
        "program_id": "prog-snapshot",
        "product_code": "SNP",
        "predicate_k_number": "K999999",
        "generator_version": GENERATOR_VERSION,
        "risk_code_map_version": str(RISK_CODE_MAP_VERSION),
        "risk_vocab_hash": compute_risk_vocab_hash(),
        "manifest_hash": "",
        "generated_at": "2026-01-01T00:00:00Z",
        "risk_codes_used": ALL_24_CODES,
        "evidence_task_ids": [],
        "defense_readiness_score": 42,
        "top_risks": ALL_24_CODES[:5],
        "se_matrix": {"rows": rows},
    }
    manifest["manifest_hash"] = compute_manifest_hash(manifest)
    return manifest, subject_hash


def _build_packet() -> DefensePacketFull:
    """Build a full 24-code packet with deterministic inputs."""
    manifest, subject_hash = _make_full_manifest()
    return build_defense_packet_from_manifest(
        program_id="prog-snapshot",
        product_code="SNP",
        manifest=manifest,
        subject_hash=subject_hash,
        subject_device_name="SnapshotDevice",
    )


def _normalize_packet_json(packet: DefensePacketFull) -> dict:
    """Strip volatile fields (generated_at) for stable comparison."""
    d = json.loads(packet.model_dump_json())
    d.pop("generated_at", None)
    return d


def _write_golden_json(data: dict) -> None:
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    GOLDEN_JSON_PATH.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def _write_golden_csv(csv_text: str) -> None:
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    # Write as bytes to preserve exact \r\n from csv.writer
    GOLDEN_CSV_PATH.write_bytes(csv_text.encode("utf-8"))


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Golden JSON Snapshot
# ═══════════════════════════════════════════════════════════════════════════════

class TestGoldenJSONSnapshot:
    """Build a full 24-code packet and compare against golden JSON."""

    def _build(self) -> DefensePacketFull:
        return _build_packet()

    def test_golden_json_structure_match(self):
        """If golden exists, output must match. If not, create it."""
        packet = self._build()
        normalized = _normalize_packet_json(packet)

        if not GOLDEN_JSON_PATH.exists():
            _write_golden_json(normalized)
            pytest.skip("Golden JSON created — re-run to verify")

        golden = json.loads(GOLDEN_JSON_PATH.read_text())
        assert normalized == golden, (
            "Defense packet JSON does not match golden snapshot.\n"
            "If this is intentional, delete the golden file and re-run."
        )

    def test_golden_json_top_level_keys(self):
        """Top-level keys must be exactly the 14 spec fields."""
        packet = self._build()
        normalized = _normalize_packet_json(packet)
        expected_keys = {
            "packet_version",
            "packet_id",
            "manifest_hash",
            "subject_hash",
            "program_id",
            "product_code",
            "risk_code_map_version",
            "risk_vocab_hash",
            "readiness_score",
            "status",
            "stale_reasons",
            "top_risks",
            "tasks",
        }
        # generated_at is stripped, so 13 keys remain
        assert set(normalized.keys()) == expected_keys

    def test_golden_json_packet_version(self):
        packet = self._build()
        assert packet.packet_version == "6.6.D1"

    def test_golden_json_all_24_codes_covered(self):
        """Every one of the 24 risk codes appears in at least one task."""
        packet = self._build()
        all_triggered = set()
        for t in packet.tasks:
            all_triggered.update(t.triggered_risk_codes)
        for code in ALL_24_CODES:
            assert code in all_triggered, f"Risk code {code} not covered by any task"

    def test_golden_json_task_count_stable(self):
        """Same input always produces same task count."""
        p1 = self._build()
        p2 = self._build()
        assert len(p1.tasks) == len(p2.tasks)

    def test_golden_json_packet_id_is_manifest_hash(self):
        packet = self._build()
        assert packet.packet_id == packet.manifest_hash

    def test_golden_json_deterministic(self):
        """Two builds produce identical JSON (except generated_at)."""
        n1 = _normalize_packet_json(self._build())
        n2 = _normalize_packet_json(self._build())
        assert n1 == n2

    def test_golden_json_tasks_sorted(self):
        """Tasks sorted: severity desc (High > Medium > Low), then category, then task_id."""
        packet = self._build()
        sev_order = {"High": 0, "Medium": 1, "Low": 2}
        sort_key = [(sev_order[t.severity.value], t.category.value, t.task_id) for t in packet.tasks]
        assert sort_key == sorted(sort_key)

    def test_golden_json_readiness_score_in_range(self):
        packet = self._build()
        assert 0 <= packet.readiness_score <= 100

    def test_golden_json_status_is_blocked(self):
        """Full 24-code build starts BLOCKED (HIGH-severity tasks are OPEN)."""
        packet = self._build()
        assert packet.status == PacketOpsStatus.BLOCKED


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Golden CSV Snapshot
# ═══════════════════════════════════════════════════════════════════════════════

class TestGoldenCSVSnapshot:
    """Export 24-code packet to CSV and compare against golden CSV."""

    def _build_csv(self) -> str:
        packet = _build_packet()
        return packet_tasks_to_csv(packet)

    def test_golden_csv_structure_match(self):
        """If golden exists, CSV must match. If not, create it."""
        csv_text = self._build_csv()

        if not GOLDEN_CSV_PATH.exists():
            _write_golden_csv(csv_text)
            pytest.skip("Golden CSV created — re-run to verify")

        golden = GOLDEN_CSV_PATH.read_bytes().decode("utf-8")
        assert csv_text == golden, (
            "Defense packet CSV does not match golden snapshot.\n"
            "If this is intentional, delete the golden file and re-run."
        )

    def test_csv_column_headers(self):
        csv_text = self._build_csv()
        reader = csv.DictReader(io.StringIO(csv_text))
        assert reader.fieldnames is not None
        assert list(reader.fieldnames) == CSV_COLUMNS

    def test_csv_row_count_matches_tasks(self):
        packet = _build_packet()
        csv_text = packet_tasks_to_csv(packet)
        reader = csv.DictReader(io.StringIO(csv_text))
        rows = list(reader)
        assert len(rows) == len(packet.tasks)

    def test_csv_deterministic(self):
        csv1 = self._build_csv()
        csv2 = self._build_csv()
        assert csv1 == csv2

    def test_csv_all_task_ids_present(self):
        packet = _build_packet()
        csv_text = packet_tasks_to_csv(packet)
        reader = csv.DictReader(io.StringIO(csv_text))
        csv_task_ids = {row["task_id"] for row in reader}
        packet_task_ids = {t.task_id for t in packet.tasks}
        assert csv_task_ids == packet_task_ids

    def test_csv_severity_values_valid(self):
        csv_text = self._build_csv()
        reader = csv.DictReader(io.StringIO(csv_text))
        valid_severities = {"High", "Medium", "Low"}
        for row in reader:
            assert row["severity"] in valid_severities, f"Invalid severity: {row['severity']}"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Spec D1 Alias Parity
# ═══════════════════════════════════════════════════════════════════════════════

class TestSpecD1Aliases:
    """Verify spec-aligned aliases point to the same classes."""

    def test_evidence_task_is_evidence_task_full(self):
        assert EvidenceTask is EvidenceTaskFull

    def test_defense_packet_is_defense_packet_full(self):
        assert DefensePacket is DefensePacketFull

    def test_defense_packet_ops_status_is_packet_ops_status(self):
        assert DefensePacketOpsStatus is PacketOpsStatus

    def test_evidence_task_alias_creates_instance(self):
        """EvidenceTask alias can instantiate just like EvidenceTaskFull."""
        task = EvidenceTask(
            task_id="ET_SNAP_00001",
            severity=EvidenceSeverity.HIGH,
            category=EvidenceCategory.RiskManagement,
            title="Test",
            why_it_matters="Test",
        )
        assert isinstance(task, EvidenceTaskFull)
        assert task.task_id == "ET_SNAP_00001"

    def test_defense_packet_alias_creates_instance(self):
        """DefensePacket alias can instantiate just like DefensePacketFull."""
        packet = DefensePacket(
            packet_version="6.6.D1",
            packet_id="test-hash",
            manifest_hash="test-hash",
            subject_hash="sub-hash",
            program_id="prog-alias",
            product_code="ALS",
            generated_at=datetime.now(tz=timezone.utc),
            risk_code_map_version="1",
            risk_vocab_hash="vh",
            readiness_score=50,
        )
        assert isinstance(packet, DefensePacketFull)
        assert packet.program_id == "prog-alias"

    def test_packet_ops_status_alias_values(self):
        """DefensePacketOpsStatus has all 6 spec-required values."""
        expected = {"CREATED", "IN_PROGRESS", "READY", "BLOCKED", "STALE", "FAILED"}
        actual = {e.value for e in DefensePacketOpsStatus}
        assert actual == expected

    def test_packet_version_is_d1(self):
        """PACKET_VERSION is 6.6.D1 per spec."""
        assert PACKET_VERSION == "6.6.D1"
