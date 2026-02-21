"""Tests for Phase 6.6.D — Defense Packet Models, Staleness, and Diff Engine.

Tests:
    ✅ DefensePacketRenderStatus — valid literal values
  ✅ VALID_STATUS_TRANSITIONS — covers all lifecycle edges
  ✅ is_valid_transition — happy path transitions
  ✅ is_valid_transition — rejects invalid transitions
  ✅ is_valid_transition — terminal states are dead ends
  ✅ DefensePacketRecord — round-trips with all fields
  ✅ CreateDefensePacketRequest — defaults
  ✅ CreateDefensePacketResponse — includes diff_summary
  ✅ DefensePacketDiffSummary — all fields present
  ✅ StalenessCheckResult — stale and fresh cases
  ✅ diff_packets — identical packets yield zero delta
  ✅ diff_packets — detects risk code changes
  ✅ diff_packets — detects task count changes
  ✅ diff_packets — detects readiness score delta
  ✅ diff_packets — detects top_risks change
  ✅ diff_packets — handles JSON string fields
  ✅ check_staleness — fresh packet (no changes)
  ✅ check_staleness — stale on risk_vocab_hash change
  ✅ check_staleness — stale on risk_code_map_version change
  ✅ check_staleness — stale on generator_version change
  ✅ check_staleness — multiple reasons
  ✅ SQL queries — INSERT has correct param count
  ✅ SQL queries — SELECT queries valid SQL
  ✅ SQL queries — UPDATE queries valid SQL
  ✅ SQL queries — MARK_PROGRAM_PACKETS_STALE bulk
  ✅ _build_response — builds from packet dict
  ✅ _build_response — handles JSON string fields
  ✅ _extract_list — handles str, list, None, dict
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import pytest

from shadow_service.models_defense_packet import (
    CreateDefensePacketRequest,
    CreateDefensePacketResponse,
    DefensePacketDiffSummary,
    DefensePacketRecord,
    StalenessCheckResult,
    VALID_STATUS_TRANSITIONS,
    is_valid_transition,
)
from shadow_service.defense_packet_repository import (
    _build_response,
    _extract_list,
    check_staleness,
    diff_packets,
)
from shadow_service import sql_defense_packets as sql_dp


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def sample_packet_dict() -> dict[str, Any]:
    """A sample defense packet dict mimicking a DB row."""
    return {
        "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "program_id": "11111111-2222-3333-4444-555555555555",
        "subject_hash": "abc123def456",
        "predicate_k_number": "K201234",
        "risk_code_map_version": "2.0.0",
        "risk_vocab_hash": "deadbeef0123",
        "generator_version": "6.6.C2",
        "defense_readiness_score": 72,
        "top_risks": ["RISK_SE_CHAR_MISMATCH", "RISK_MISSING_CLINICAL"],
        "tasks": [
            {"task_id": "t_001", "risk_code": "RISK_SE_CHAR_MISMATCH"},
            {"task_id": "t_002", "risk_code": "RISK_MISSING_CLINICAL"},
        ],
        "se_payload": {"rows": [], "summary": {}},
        "subject_device": {"device_name": "Test Device"},
        "risk_codes_used": ["RISK_SE_CHAR_MISMATCH", "RISK_MISSING_CLINICAL", "RISK_NEW_MATERIAL"],
        "product_code": "QAS",
        "manifest_hash": "sha256:fullhash1234567890",
        "status": "RENDERED",
        "staleness_reason": None,
        "render_job_id": "rj_abc123_1234567890",
        "error_code": None,
        "error_detail": None,
        "created_by_user_id": "user-001",
        "previous_packet_id": None,
        "created_at": "2025-06-01T00:00:00Z",
        "updated_at": "2025-06-01T00:01:00Z",
        "rendered_at": "2025-06-01T00:01:00Z",
    }


@pytest.fixture
def second_packet_dict(sample_packet_dict: dict) -> dict[str, Any]:
    """A second packet with slight changes for diff testing."""
    pkt = dict(sample_packet_dict)
    pkt["id"] = "ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj"
    pkt["manifest_hash"] = "sha256:fullhash9876543210"
    pkt["defense_readiness_score"] = 85
    pkt["risk_codes_used"] = [
        "RISK_SE_CHAR_MISMATCH",
        "RISK_MISSING_CLINICAL",
        "RISK_NEW_MATERIAL",
        "RISK_PREDICATE_RECALL",
    ]
    pkt["top_risks"] = ["RISK_SE_CHAR_MISMATCH", "RISK_PREDICATE_RECALL"]
    pkt["tasks"] = [
        {"task_id": "t_001", "risk_code": "RISK_SE_CHAR_MISMATCH"},
        {"task_id": "t_002", "risk_code": "RISK_MISSING_CLINICAL"},
        {"task_id": "t_003", "risk_code": "RISK_PREDICATE_RECALL"},
    ]
    pkt["previous_packet_id"] = sample_packet_dict["id"]
    return pkt


# ═══════════════════════════════════════════════════════════════════════════════
# Status & Transition Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatusTransitions:
    """Defense packet lifecycle transition validation."""

    def test_valid_statuses_in_transitions(self):
        """All 5 statuses appear as keys."""
        expected = {"CREATED", "RENDERING", "RENDERED", "FAILED", "STALE"}
        assert set(VALID_STATUS_TRANSITIONS.keys()) == expected

    def test_created_transitions(self):
        """CREATED can -> RENDERING or FAILED."""
        assert VALID_STATUS_TRANSITIONS["CREATED"] == {"RENDERING", "FAILED"}

    def test_rendering_transitions(self):
        """RENDERING can -> RENDERED or FAILED."""
        assert VALID_STATUS_TRANSITIONS["RENDERING"] == {"RENDERED", "FAILED"}

    def test_rendered_transitions(self):
        """RENDERED can -> STALE."""
        assert VALID_STATUS_TRANSITIONS["RENDERED"] == {"STALE"}

    def test_failed_is_terminal(self):
        """FAILED has no outgoing transitions."""
        assert VALID_STATUS_TRANSITIONS["FAILED"] == set()

    def test_stale_allows_reactivation(self):
        """STALE can -> CREATED (re-generation creates new packet)."""
        assert VALID_STATUS_TRANSITIONS["STALE"] == {"CREATED"}

    def test_is_valid_transition_happy_path(self):
        """Valid transitions return True."""
        assert is_valid_transition("CREATED", "RENDERING") is True
        assert is_valid_transition("CREATED", "FAILED") is True
        assert is_valid_transition("RENDERING", "RENDERED") is True
        assert is_valid_transition("RENDERING", "FAILED") is True
        assert is_valid_transition("RENDERED", "STALE") is True

    def test_is_valid_transition_rejects_backward(self):
        """Backward transitions are invalid."""
        assert is_valid_transition("RENDERING", "CREATED") is False
        assert is_valid_transition("RENDERED", "RENDERING") is False
        assert is_valid_transition("RENDERED", "CREATED") is False

    def test_is_valid_transition_rejects_terminal(self):
        """Terminal states have limited or no outgoing transitions."""
        assert is_valid_transition("FAILED", "CREATED") is False
        assert is_valid_transition("FAILED", "RENDERING") is False
        # STALE can go back to CREATED (re-generation), but not RENDERED
        assert is_valid_transition("STALE", "CREATED") is True
        assert is_valid_transition("STALE", "RENDERED") is False

    def test_is_valid_transition_rejects_unknown(self):
        """Unknown states return False."""
        assert is_valid_transition("BOGUS", "RENDERING") is False
        assert is_valid_transition("CREATED", "BOGUS") is False

    def test_is_valid_transition_self_loop_rejected(self):
        """Self-loop transitions are not valid (not in any target set)."""
        for status in VALID_STATUS_TRANSITIONS:
            assert is_valid_transition(status, status) is False, f"{status} → {status} should be invalid"


# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Model Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestPydanticModels:
    """Pydantic model instantiation and validation."""

    def test_defense_packet_record_round_trip(self, sample_packet_dict):
        """DefensePacketRecord can be constructed from a dict."""
        record = DefensePacketRecord(**sample_packet_dict)
        assert record.id == sample_packet_dict["id"]
        assert record.manifest_hash == sample_packet_dict["manifest_hash"]
        assert record.status == "RENDERED"
        assert record.defense_readiness_score == 72

    def test_create_request_defaults(self):
        """CreateDefensePacketRequest has sensible defaults."""
        req = CreateDefensePacketRequest(
            program_id="11111111-2222-3333-4444-555555555555",
            product_code="QAS",
            subject_device={"name": "Test"},
            selected_predicate_k_number="K201234",
        )
        assert req.render is True
        assert req.created_by_user_id == "system"

    def test_create_response_with_diff(self):
        """CreateDefensePacketResponse includes diff_summary."""
        diff_dict = {
            "previous_manifest_hash": "sha256:old",
            "current_manifest_hash": "sha256:xxx",
            "readiness_score_delta": 10,
            "risk_codes_added": ["RISK_B"],
            "risk_codes_removed": [],
            "evidence_tasks_added": 2,
            "evidence_tasks_removed": 0,
            "top_risks_changed": True,
        }
        resp = CreateDefensePacketResponse(
            defense_packet_id="abc",
            manifest_hash="sha256:xxx",
            defense_readiness_score=80,
            top_risks=["RISK_A"],
            risk_codes_used=["RISK_A"],
            tasks=[],
            render_job_id="rj_xxx",
            status="RENDERING",
            subject_hash="aaa",
            previous_packet_id="prev-id",
            diff_summary=diff_dict,
        )
        assert resp.diff_summary is not None
        assert resp.diff_summary["readiness_score_delta"] == 10
        assert resp.diff_summary["risk_codes_added"] == ["RISK_B"]

    def test_create_response_without_diff(self):
        """CreateDefensePacketResponse with diff_summary=None."""
        resp = CreateDefensePacketResponse(
            defense_packet_id="abc",
            manifest_hash="sha256:xxx",
            defense_readiness_score=80,
            top_risks=[],
            risk_codes_used=[],
            tasks=[],
            render_job_id=None,
            status="CREATED",
            subject_hash="aaa",
            previous_packet_id=None,
            diff_summary=None,
        )
        assert resp.diff_summary is None
        assert resp.render_job_id is None

    def test_staleness_check_result_fresh(self):
        """StalenessCheckResult can represent a fresh state."""
        result = StalenessCheckResult(
            is_stale=False,
            reasons=[],
            current_risk_vocab_hash="aaa",
            current_risk_code_map_version="2.0.0",
            packet_risk_vocab_hash="aaa",
            packet_risk_code_map_version="2.0.0",
        )
        assert result.is_stale is False
        assert len(result.reasons) == 0

    def test_staleness_check_result_stale(self):
        """StalenessCheckResult can represent a stale state with reasons."""
        result = StalenessCheckResult(
            is_stale=True,
            reasons=["risk_vocab_hash changed: aaa → bbb"],
            current_risk_vocab_hash="bbb",
            current_risk_code_map_version="2.0.0",
            packet_risk_vocab_hash="aaa",
            packet_risk_code_map_version="2.0.0",
        )
        assert result.is_stale is True
        assert "risk_vocab_hash changed" in result.reasons[0]

    def test_diff_summary_all_fields(self):
        """DefensePacketDiffSummary includes all fields."""
        diff = DefensePacketDiffSummary(
            previous_manifest_hash="sha256:old",
            current_manifest_hash="sha256:new",
            readiness_score_delta=-5,
            risk_codes_added=[],
            risk_codes_removed=["RISK_A"],
            evidence_tasks_added=0,
            evidence_tasks_removed=1,
            top_risks_changed=True,
        )
        assert diff.readiness_score_delta == -5
        assert diff.risk_codes_removed == ["RISK_A"]
        assert diff.top_risks_changed is True


# ═══════════════════════════════════════════════════════════════════════════════
# Diff Engine Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDiffEngine:
    """Diff engine — pure function tests."""

    def test_identical_packets_zero_delta(self, sample_packet_dict):
        """Diffing a packet with itself yields zero delta."""
        d = diff_packets(sample_packet_dict, sample_packet_dict)
        assert d["readiness_score_delta"] == 0
        assert d["risk_codes_added"] == []
        assert d["risk_codes_removed"] == []
        assert d["evidence_tasks_added"] == 0
        assert d["evidence_tasks_removed"] == 0
        assert d["top_risks_changed"] is False

    def test_detects_risk_code_additions(self, sample_packet_dict, second_packet_dict):
        """Detects new risk codes added."""
        d = diff_packets(sample_packet_dict, second_packet_dict)
        assert "RISK_PREDICATE_RECALL" in d["risk_codes_added"]
        assert d["risk_codes_removed"] == []

    def test_detects_risk_code_removals(self, second_packet_dict, sample_packet_dict):
        """Detects risk codes removed (reverse diff)."""
        d = diff_packets(second_packet_dict, sample_packet_dict)
        assert "RISK_PREDICATE_RECALL" in d["risk_codes_removed"]

    def test_detects_readiness_score_delta(self, sample_packet_dict, second_packet_dict):
        """Detects readiness score change."""
        d = diff_packets(sample_packet_dict, second_packet_dict)
        assert d["readiness_score_delta"] == 13  # 85 - 72

    def test_detects_top_risks_change(self, sample_packet_dict, second_packet_dict):
        """Detects when top_risks differ."""
        d = diff_packets(sample_packet_dict, second_packet_dict)
        assert d["top_risks_changed"] is True

    def test_detects_task_count_increase(self, sample_packet_dict, second_packet_dict):
        """Detects evidence tasks added."""
        d = diff_packets(sample_packet_dict, second_packet_dict)
        assert d["evidence_tasks_added"] == 1  # 3 - 2

    def test_handles_json_string_fields(self, sample_packet_dict):
        """Handles fields stored as JSON strings instead of native lists."""
        pkt1 = dict(sample_packet_dict)
        pkt2 = dict(sample_packet_dict)
        pkt1["risk_codes_used"] = json.dumps(pkt1["risk_codes_used"])
        pkt2["risk_codes_used"] = json.dumps(pkt2["risk_codes_used"])
        pkt2["tasks"] = json.dumps(pkt2["tasks"])

        d = diff_packets(pkt1, pkt2)
        assert d["readiness_score_delta"] == 0
        assert d["risk_codes_added"] == []
        assert d["risk_codes_removed"] == []

    def test_diff_output_keys(self, sample_packet_dict, second_packet_dict):
        """Diff output has all required keys."""
        d = diff_packets(sample_packet_dict, second_packet_dict)
        expected_keys = {
            "previous_manifest_hash",
            "current_manifest_hash",
            "readiness_score_delta",
            "risk_codes_added",
            "risk_codes_removed",
            "evidence_tasks_added",
            "evidence_tasks_removed",
            "top_risks_changed",
        }
        assert set(d.keys()) == expected_keys

    def test_diff_manifest_hashes(self, sample_packet_dict, second_packet_dict):
        """Diff includes both manifest hashes."""
        d = diff_packets(sample_packet_dict, second_packet_dict)
        assert d["previous_manifest_hash"] == sample_packet_dict["manifest_hash"]
        assert d["current_manifest_hash"] == second_packet_dict["manifest_hash"]

    def test_diff_negative_readiness_delta(self):
        """Diff correctly computes negative readiness delta."""
        pkt1 = {"defense_readiness_score": 90, "risk_codes_used": [], "tasks": [], "top_risks": [], "manifest_hash": "a"}
        pkt2 = {"defense_readiness_score": 60, "risk_codes_used": [], "tasks": [], "top_risks": [], "manifest_hash": "b"}
        d = diff_packets(pkt1, pkt2)
        assert d["readiness_score_delta"] == -30


# ═══════════════════════════════════════════════════════════════════════════════
# Staleness Detection Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestStalenessDetection:
    """Staleness detection — pure function tests."""

    def test_fresh_packet_not_stale(self):
        """Packet using current upstream state is not stale."""
        from shadow_service.predicate_intel.manifest import (
            GENERATOR_VERSION,
            compute_risk_vocab_hash,
        )
        from shadow_service.scoring.risk_code_map import RISK_CODE_MAP_VERSION

        packet = {
            "risk_vocab_hash": compute_risk_vocab_hash(),
            "risk_code_map_version": RISK_CODE_MAP_VERSION,
            "generator_version": GENERATOR_VERSION,
        }
        result = check_staleness(packet)
        assert result.is_stale is False
        assert len(result.reasons) == 0

    def test_stale_on_risk_vocab_change(self):
        """Packet with old risk_vocab_hash is stale."""
        from shadow_service.predicate_intel.manifest import GENERATOR_VERSION
        from shadow_service.scoring.risk_code_map import RISK_CODE_MAP_VERSION

        packet = {
            "risk_vocab_hash": "old_hash_value",
            "risk_code_map_version": RISK_CODE_MAP_VERSION,
            "generator_version": GENERATOR_VERSION,
        }
        result = check_staleness(packet)
        assert result.is_stale is True
        assert any("risk_vocab_hash" in r for r in result.reasons)

    def test_stale_on_risk_code_map_version_change(self):
        """Packet with old risk_code_map_version is stale."""
        from shadow_service.predicate_intel.manifest import (
            GENERATOR_VERSION,
            compute_risk_vocab_hash,
        )

        packet = {
            "risk_vocab_hash": compute_risk_vocab_hash(),
            "risk_code_map_version": "0.0.1",
            "generator_version": GENERATOR_VERSION,
        }
        result = check_staleness(packet)
        assert result.is_stale is True
        assert any("risk_code_map_version" in r for r in result.reasons)

    def test_stale_on_generator_version_change(self):
        """Packet with old generator_version is stale."""
        from shadow_service.predicate_intel.manifest import compute_risk_vocab_hash
        from shadow_service.scoring.risk_code_map import RISK_CODE_MAP_VERSION

        packet = {
            "risk_vocab_hash": compute_risk_vocab_hash(),
            "risk_code_map_version": RISK_CODE_MAP_VERSION,
            "generator_version": "0.0.0",
        }
        result = check_staleness(packet)
        assert result.is_stale is True
        assert any("generator_version" in r for r in result.reasons)

    def test_stale_multiple_reasons(self):
        """Packet can be stale for multiple simultaneous reasons."""
        packet = {
            "risk_vocab_hash": "old_vocab",
            "risk_code_map_version": "old_map",
            "generator_version": "old_gen",
        }
        result = check_staleness(packet)
        assert result.is_stale is True
        assert len(result.reasons) == 3

    def test_staleness_result_hashes(self):
        """StalenessCheckResult includes both current and packet hashes."""
        from shadow_service.predicate_intel.manifest import compute_risk_vocab_hash
        from shadow_service.scoring.risk_code_map import RISK_CODE_MAP_VERSION

        packet = {
            "risk_vocab_hash": "old_hash",
            "risk_code_map_version": RISK_CODE_MAP_VERSION,
            "generator_version": "6.6.C2",
        }
        result = check_staleness(packet)
        assert result.current_risk_vocab_hash == compute_risk_vocab_hash()
        assert result.packet_risk_vocab_hash == "old_hash"
        assert result.current_risk_code_map_version == RISK_CODE_MAP_VERSION
        assert result.packet_risk_code_map_version == RISK_CODE_MAP_VERSION

    def test_staleness_missing_fields_defaults(self):
        """Missing fields in packet default to empty strings → always stale."""
        result = check_staleness({})
        assert result.is_stale is True
        assert len(result.reasons) >= 1


# ═══════════════════════════════════════════════════════════════════════════════
# SQL Query Structural Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSQLQueries:
    """SQL query structural validation (no DB required)."""

    def test_insert_has_18_params(self):
        """INSERT_DEFENSE_PACKET uses $1 through $18."""
        for i in range(1, 19):
            assert f"${i}" in sql_dp.INSERT_DEFENSE_PACKET

    def test_insert_returns_star(self):
        """INSERT returns all columns."""
        assert "RETURNING *" in sql_dp.INSERT_DEFENSE_PACKET

    def test_select_by_id_uses_param(self):
        """SELECT_PACKET_BY_ID uses $1."""
        assert "$1" in sql_dp.SELECT_PACKET_BY_ID
        assert "predicate.defense_packets" in sql_dp.SELECT_PACKET_BY_ID

    def test_select_by_manifest_hash(self):
        """SELECT_PACKET_BY_MANIFEST_HASH uses $1."""
        assert "$1" in sql_dp.SELECT_PACKET_BY_MANIFEST_HASH
        assert "manifest_hash" in sql_dp.SELECT_PACKET_BY_MANIFEST_HASH

    def test_select_by_program(self):
        """SELECT_PACKETS_BY_PROGRAM returns ordered results."""
        assert "ORDER BY" in sql_dp.SELECT_PACKETS_BY_PROGRAM
        assert "DESC" in sql_dp.SELECT_PACKETS_BY_PROGRAM

    def test_select_latest_for_subject(self):
        """SELECT_LATEST_PACKET_FOR_SUBJECT limits to 1."""
        assert "LIMIT 1" in sql_dp.SELECT_LATEST_PACKET_FOR_SUBJECT
        assert "$1" in sql_dp.SELECT_LATEST_PACKET_FOR_SUBJECT
        assert "$2" in sql_dp.SELECT_LATEST_PACKET_FOR_SUBJECT

    def test_update_status_uses_params(self):
        """UPDATE_PACKET_STATUS uses $1 (id) and $2 (status)."""
        assert "$1" in sql_dp.UPDATE_PACKET_STATUS
        assert "$2" in sql_dp.UPDATE_PACKET_STATUS
        assert "RETURNING *" in sql_dp.UPDATE_PACKET_STATUS

    def test_update_rendering(self):
        """UPDATE_PACKET_RENDERING sets render_job_id."""
        assert "render_job_id" in sql_dp.UPDATE_PACKET_RENDERING
        assert "RENDERING" in sql_dp.UPDATE_PACKET_RENDERING

    def test_update_rendered(self):
        """UPDATE_PACKET_RENDERED sets status to RENDERED and render_job_id."""
        assert "RENDERED" in sql_dp.UPDATE_PACKET_RENDERED
        assert "render_job_id" in sql_dp.UPDATE_PACKET_RENDERED
        assert "RETURNING *" in sql_dp.UPDATE_PACKET_RENDERED

    def test_update_failed(self):
        """UPDATE_PACKET_FAILED sets error_code and error_detail."""
        assert "error_code" in sql_dp.UPDATE_PACKET_FAILED
        assert "error_detail" in sql_dp.UPDATE_PACKET_FAILED
        assert "FAILED" in sql_dp.UPDATE_PACKET_FAILED

    def test_update_stale(self):
        """UPDATE_PACKET_STALE sets staleness_reason."""
        assert "staleness_reason" in sql_dp.UPDATE_PACKET_STALE
        assert "STALE" in sql_dp.UPDATE_PACKET_STALE

    def test_mark_program_packets_stale(self):
        """MARK_PROGRAM_PACKETS_STALE bulk-marks by program_id."""
        assert "program_id" in sql_dp.MARK_PROGRAM_PACKETS_STALE
        assert "STALE" in sql_dp.MARK_PROGRAM_PACKETS_STALE
        assert "RETURNING" in sql_dp.MARK_PROGRAM_PACKETS_STALE

    def test_all_queries_reference_predicate_schema(self):
        """All queries reference predicate.defense_packets table."""
        queries = [
            sql_dp.INSERT_DEFENSE_PACKET,
            sql_dp.SELECT_PACKET_BY_ID,
            sql_dp.SELECT_PACKET_BY_MANIFEST_HASH,
            sql_dp.SELECT_PACKETS_BY_PROGRAM,
            sql_dp.SELECT_LATEST_PACKET_FOR_SUBJECT,
            sql_dp.UPDATE_PACKET_STATUS,
            sql_dp.MARK_PROGRAM_PACKETS_STALE,
        ]
        for q in queries:
            assert "predicate.defense_packets" in q

    def test_select_by_status(self):
        """SELECT_PACKETS_BY_STATUS uses status param."""
        assert "$1" in sql_dp.SELECT_PACKETS_BY_STATUS
        assert "ORDER BY" in sql_dp.SELECT_PACKETS_BY_STATUS

    def test_select_active_for_program(self):
        """SELECT_ACTIVE_PACKETS_FOR_PROGRAM excludes FAILED and STALE."""
        assert "FAILED" in sql_dp.SELECT_ACTIVE_PACKETS_FOR_PROGRAM
        assert "STALE" in sql_dp.SELECT_ACTIVE_PACKETS_FOR_PROGRAM
        assert "$1" in sql_dp.SELECT_ACTIVE_PACKETS_FOR_PROGRAM


# ═══════════════════════════════════════════════════════════════════════════════
# Build Response Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestBuildResponse:
    """_build_response helper tests."""

    def test_builds_from_packet_dict(self, sample_packet_dict):
        """_build_response extracts expected fields."""
        resp = _build_response(sample_packet_dict, diff_summary=None)
        assert resp["defense_packet_id"] == sample_packet_dict["id"]
        assert resp["manifest_hash"] == sample_packet_dict["manifest_hash"]
        assert resp["status"] == "RENDERED"
        assert resp["diff_summary"] is None

    def test_includes_diff_summary(self, sample_packet_dict):
        """_build_response includes diff_summary when provided."""
        diff = {"readiness_score_delta": 5}
        resp = _build_response(sample_packet_dict, diff_summary=diff)
        assert resp["diff_summary"]["readiness_score_delta"] == 5

    def test_handles_json_string_tasks(self, sample_packet_dict):
        """_build_response deserializes JSON-string tasks."""
        pkt = dict(sample_packet_dict)
        pkt["tasks"] = json.dumps(pkt["tasks"])
        resp = _build_response(pkt, diff_summary=None)
        assert isinstance(resp["tasks"], list)
        assert len(resp["tasks"]) == 2

    def test_handles_json_string_top_risks(self, sample_packet_dict):
        """_build_response deserializes JSON-string top_risks."""
        pkt = dict(sample_packet_dict)
        pkt["top_risks"] = json.dumps(pkt["top_risks"])
        resp = _build_response(pkt, diff_summary=None)
        assert isinstance(resp["top_risks"], list)

    def test_handles_json_string_risk_codes_used(self, sample_packet_dict):
        """_build_response deserializes JSON-string risk_codes_used."""
        pkt = dict(sample_packet_dict)
        pkt["risk_codes_used"] = json.dumps(pkt["risk_codes_used"])
        resp = _build_response(pkt, diff_summary=None)
        assert isinstance(resp["risk_codes_used"], list)

    def test_response_keys(self, sample_packet_dict):
        """Response has all expected keys."""
        resp = _build_response(sample_packet_dict, diff_summary=None)
        expected_keys = {
            "defense_packet_id",
            "manifest_hash",
            "defense_readiness_score",
            "top_risks",
            "risk_codes_used",
            "tasks",
            "render_job_id",
            "status",
            "subject_hash",
            "previous_packet_id",
            "diff_summary",
        }
        assert set(resp.keys()) == expected_keys

    def test_previous_packet_id_stringified(self, sample_packet_dict):
        """previous_packet_id is returned as string when present."""
        pkt = dict(sample_packet_dict)
        pkt["previous_packet_id"] = "aaaaaaaa-bbbb-cccc-dddd-111111111111"
        resp = _build_response(pkt, diff_summary=None)
        assert resp["previous_packet_id"] == "aaaaaaaa-bbbb-cccc-dddd-111111111111"


# ═══════════════════════════════════════════════════════════════════════════════
# _extract_list Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtractList:
    """_extract_list helper tests."""

    def test_extracts_native_list(self):
        """Returns list as-is."""
        assert _extract_list({"k": [1, 2, 3]}, "k") == [1, 2, 3]

    def test_extracts_json_string(self):
        """Parses JSON string."""
        assert _extract_list({"k": '["a","b"]'}, "k") == ["a", "b"]

    def test_missing_key_returns_empty(self):
        """Missing key returns empty list."""
        assert _extract_list({}, "k") == []

    def test_none_value_returns_empty(self):
        """None value returns empty list."""
        assert _extract_list({"k": None}, "k") == []

    def test_dict_value_returns_empty(self):
        """Dict value (not a list) returns empty list."""
        assert _extract_list({"k": {"a": 1}}, "k") == []

    def test_invalid_json_returns_empty(self):
        """Invalid JSON string returns empty list."""
        assert _extract_list({"k": "not-valid-json"}, "k") == []

    def test_empty_list(self):
        """Empty list returns empty list."""
        assert _extract_list({"k": []}, "k") == []

    def test_empty_json_array(self):
        """Empty JSON array string returns empty list."""
        assert _extract_list({"k": "[]"}, "k") == []
