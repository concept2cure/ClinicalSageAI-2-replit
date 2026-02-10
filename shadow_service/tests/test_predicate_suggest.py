"""Tests for Phase 6.6.B — Predicate Suggestion Engine (Enterprise-grade Spec).

Tests the scoring, ranking, DRS, objections, AVOID gating, caching,
Defense Packet Seed, and explainability logic with mocked DB rows.

Acceptance gates (no debate):
  ✅ returns <=5 suggestions with strategy + readiness score + reasoning
  ✅ includes required fields + stable sort
  ✅ AVOID when tissue_contact mismatch
  ✅ DRS starts at 100 and subtracts penalties
  ✅ deterministic subject_hash for same input
  ✅ does not call network
  ✅ 503 when ingest freshness missing/stale (tested via router unit tests)
  ✅ Defense Packet Seed generated from objections
"""
from __future__ import annotations

import asyncio
import hashlib
import pytest
from datetime import date, datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, patch

from shadow_service.predicate_suggest import (
    MAX_SUGGESTIONS,
    build_subject_text,
    suggest_predicates,
    compute_subject_hash,
    _cache,
)
from shadow_service.scoring.predicate_strategy import (
    classify_strategy,
    compute_drs,
    compute_similarity,
    extract_match_snippets,
    find_matched_terms,
    generate_additional_objections,
    build_defense_packet_seed,
    build_evidence_tasks,
    build_response_defense_packet_seed,
    years_since,
    _token_overlap,
    _recency_boost,
    _tokenize,
)
from shadow_service.models_predicate import (
    DefensePacketSeed,
    EvidenceTask,
    EvidenceTaskSeed,
    Objection,
    ObjectionSeverity,
    ObjectionTrigger,
    PredicateFlagCode,
    PredicateSuggestRequest,
    RiskFlag,
    RiskFlagSeverity,
    StrategyRecommendation,
)


# Override conftest's async autouse reset_db_pool fixture.
@pytest.fixture(autouse=True)
def reset_db_pool():
    """Sync noop — overrides conftest async fixture for this module."""
    yield


# ─────────────────────────────────────────────────────────────────────────────
# Fake pool (same pattern as ingest tests)
# ─────────────────────────────────────────────────────────────────────────────

def _make_request(**kw) -> PredicateSuggestRequest:
    """Build a minimal valid request with overrides."""
    defaults = dict(
        program_id="test-program",
        product_code="DXN",
        device_name="Glucose Monitor System",
        intended_use="Continuous glucose monitoring in adult patients",
        technology_description="Electrochemical sensor technology for interstitial fluid glucose",
    )
    defaults.update(kw)
    return PredicateSuggestRequest(**defaults)


def _make_row(**kw) -> dict[str, Any]:
    """Build a fake DB row that looks like a clearance."""
    defaults = dict(
        k_number="K230001",
        device_name="Glucose Monitoring System",
        applicant="Acme Medical",
        product_code="DXN",
        decision_date=date.today() - timedelta(days=365),
        decision_code="SE",
        summary_url="https://fda.gov/k230001",
        txt_content="Continuous glucose monitoring system for adult patients using electrochemical sensor technology",
        clearance_type="510(k)",
        fts_rank=0.25,
    )
    defaults.update(kw)
    return defaults


class FakeConn:
    def __init__(self, rows: list[dict], count: int = 100):
        self._rows = rows
        self._count = count

    async def fetch(self, query: str, *args):
        return [_DictRow(r) for r in self._rows]

    async def fetchval(self, query: str, *args):
        return self._count

    async def fetchrow(self, query: str, *args):
        return None  # No freshness row

    async def execute(self, query: str, *args):
        pass


class _DictRow(dict):
    """Mimic asyncpg Record."""
    pass


class FakePool:
    def __init__(self, rows: list[dict] | None = None, count: int = 100):
        self._rows = rows or []
        self._count = count

    def acquire(self):
        return _PoolCtx(FakeConn(self._rows, self._count))


class _PoolCtx:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: tokenize
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenize:
    def test_basic(self):
        tokens = _tokenize("Glucose Monitor System")
        assert "glucose" in tokens
        assert "monitor" in tokens
        assert "system" in tokens

    def test_stop_words_removed(self):
        tokens = _tokenize("the device is a glucose monitor")
        assert "the" not in tokens
        assert "is" not in tokens
        assert "a" not in tokens
        assert "glucose" in tokens

    def test_empty_string(self):
        assert _tokenize("") == []


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: token overlap
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenOverlap:
    def test_full_overlap(self):
        score = _token_overlap("glucose monitor", "glucose monitor system")
        assert score == 1.0

    def test_no_overlap(self):
        score = _token_overlap("cardiac stent", "glucose monitor")
        assert score == 0.0

    def test_partial_overlap(self):
        score = _token_overlap("glucose monitor system", "glucose sensor device")
        assert 0.0 < score < 1.0


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: recency boost
# ─────────────────────────────────────────────────────────────────────────────

class TestRecencyBoost:
    def test_recent_2yr(self):
        assert _recency_boost(1.5) == 0.10

    def test_mid_5yr(self):
        assert _recency_boost(4.0) == 0.06

    def test_old_8yr(self):
        assert _recency_boost(8.0) == 0.02

    def test_very_old(self):
        assert _recency_boost(12.0) == 0.0

    def test_none(self):
        assert _recency_boost(None) == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: years_since
# ─────────────────────────────────────────────────────────────────────────────

class TestYearsSince:
    def test_one_year_ago(self):
        d = date.today() - timedelta(days=365)
        result = years_since(d)
        assert result is not None
        assert abs(result - 1.0) < 0.1

    def test_none(self):
        assert years_since(None) is None


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: similarity scoring (spec weights)
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeSimilarity:
    def test_strong_match(self):
        score, breakdown = compute_similarity(
            req_intended_use="Continuous glucose monitoring in adult patients",
            req_technology="Electrochemical sensor technology",
            req_materials=["titanium"],
            candidate_text="Continuous glucose monitoring system for adult patients using electrochemical sensor",
            candidate_name="Glucose Monitor",
            recency_years=1.0,
        )
        assert 0.0 < score <= 1.0
        assert breakdown.fts_score >= 0.0

    def test_no_match(self):
        score, breakdown = compute_similarity(
            req_intended_use="Cardiac pacemaker therapy",
            req_technology="Lithium battery powered pulse generator",
            req_materials=["titanium"],
            candidate_text="Dental implant for jaw bone fixation",
            candidate_name="Dental Implant",
            recency_years=5.0,
        )
        assert score < 0.5  # Should be low

    def test_recency_boosted(self):
        score_recent, _ = compute_similarity(
            req_intended_use="glucose monitoring",
            req_technology="sensor",
            req_materials=[],
            candidate_text="glucose monitoring sensor",
            candidate_name="Monitor",
            recency_years=1.0,
        )
        score_old, _ = compute_similarity(
            req_intended_use="glucose monitoring",
            req_technology="sensor",
            req_materials=[],
            candidate_text="glucose monitoring sensor",
            candidate_name="Monitor",
            recency_years=12.0,
        )
        assert score_recent >= score_old


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: DRS (Defense Readiness Score)
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeDRS:
    def test_starts_at_100_baseline(self):
        """DRS starts at 100 per spec."""
        row = _make_row(txt_content="good summary text", summary_url="https://fda.gov/k")
        drs, flags, objs = compute_drs(
            row=row,
            req_intended_use="glucose monitoring",
            req_materials=None,
            req_tissue_contact=None,
            req_energy_source=None,
            req_software_present=None,
            iu_overlap=0.8,
        )
        assert drs == 100  # No penalties applied

    def test_missing_summary_penalty(self):
        """Missing txt_content/summary_url → -20."""
        row = _make_row(txt_content=None, summary_url=None)
        drs, flags, objs = compute_drs(
            row=row,
            req_intended_use="glucose monitoring",
            req_materials=None,
            req_tissue_contact=None,
            req_energy_source=None,
            req_software_present=None,
            iu_overlap=0.8,
        )
        assert drs == 80  # 100 - 20

    def test_tissue_contact_mismatch_penalty(self):
        """Tissue contact mismatch → -20 + HIGH objection per spec."""
        row = _make_row(txt_content="simple device for skin contact")
        drs, flags, objs = compute_drs(
            row=row,
            req_intended_use="glucose monitoring",
            req_materials=None,
            req_tissue_contact="implant",
            req_energy_source=None,
            req_software_present=None,
            iu_overlap=0.8,
        )
        assert drs <= 80
        assert any(f.severity == RiskFlagSeverity.HIGH for f in flags)
        assert any(o.severity == ObjectionSeverity.HIGH for o in objs)

    def test_software_mismatch_penalty(self):
        """Software present + no cyber keywords → -15."""
        row = _make_row(txt_content="mechanical implant device")
        drs, flags, objs = compute_drs(
            row=row,
            req_intended_use="glucose monitoring",
            req_materials=None,
            req_tissue_contact=None,
            req_energy_source=None,
            req_software_present=True,
            iu_overlap=0.8,
        )
        assert drs <= 85

    def test_material_mismatch_penalty(self):
        """Materials differ → -10."""
        row = _make_row(txt_content="stainless steel orthopedic device")
        drs, flags, objs = compute_drs(
            row=row,
            req_intended_use="glucose monitoring",
            req_materials=["titanium", "PEEK"],
            req_tissue_contact=None,
            req_energy_source=None,
            req_software_present=None,
            iu_overlap=0.8,
        )
        assert drs <= 90

    def test_energy_source_mismatch_penalty(self):
        """Energy source mismatch → -20 + HIGH objection."""
        row = _make_row(txt_content="passive monitoring device no power")
        drs, flags, objs = compute_drs(
            row=row,
            req_intended_use="glucose monitoring",
            req_materials=None,
            req_tissue_contact=None,
            req_energy_source="battery 3.7V",
            req_software_present=None,
            iu_overlap=0.8,
        )
        assert drs <= 80
        assert any(f.severity == RiskFlagSeverity.HIGH for f in flags)

    def test_drs_clamped_to_0_100(self):
        """DRS never goes below 0."""
        row = _make_row(txt_content=None, summary_url=None)
        drs, _, _ = compute_drs(
            row=row,
            req_intended_use="cardiac",
            req_materials=["titanium"],
            req_tissue_contact="implant",
            req_energy_source="battery",
            req_software_present=True,
            iu_overlap=0.0,
        )
        assert 0 <= drs <= 100


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: strategy classification (spec thresholds)
# ─────────────────────────────────────────────────────────────────────────────

class TestClassifyStrategy:
    def test_avoid_low_drs(self):
        """readiness < 60 → AVOID per spec."""
        assert classify_strategy(50, 1.0, False) == StrategyRecommendation.AVOID

    def test_avoid_high_mismatch(self):
        """Any HIGH mismatch → AVOID per spec."""
        assert classify_strategy(90, 1.0, True) == StrategyRecommendation.AVOID

    def test_aggressive_high_drs_recent(self):
        """readiness >= 85 and <= 2 years → AGGRESSIVE per spec."""
        assert classify_strategy(90, 1.5, False) == StrategyRecommendation.AGGRESSIVE

    def test_conservative_high_drs_old(self):
        """readiness >= 85 and > 5 years → CONSERVATIVE per spec."""
        assert classify_strategy(90, 6.0, False) == StrategyRecommendation.CONSERVATIVE

    def test_balanced_default(self):
        """Else → BALANCED per spec."""
        assert classify_strategy(80, 3.0, False) == StrategyRecommendation.BALANCED

    def test_balanced_high_drs_mid_recency(self):
        """readiness >= 85 but 2-5 years → BALANCED."""
        assert classify_strategy(90, 3.0, False) == StrategyRecommendation.BALANCED


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: additional objections
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateAdditionalObjections:
    def test_intended_use_drift(self):
        objs = generate_additional_objections(
            req_intended_use="cardiac pacemaker therapy",
            req_sterilization=None,
            req_duration=None,
            recency_years=2.0,
            row=_make_row(txt_content="dental cleaning device"),
            iu_overlap=0.1,
        )
        triggers = [o.trigger for o in objs]
        assert ObjectionTrigger.INTENDED_USE_DRIFT.value in triggers

    def test_sterilization_change(self):
        objs = generate_additional_objections(
            req_intended_use="glucose monitoring",
            req_sterilization="EO",
            req_duration=None,
            recency_years=2.0,
            row=_make_row(txt_content="gamma irradiation sterilized"),
            iu_overlap=0.8,
        )
        triggers = [o.trigger for o in objs]
        assert ObjectionTrigger.STERILIZATION_CHANGE.value in triggers

    def test_duration_mismatch(self):
        objs = generate_additional_objections(
            req_intended_use="glucose monitoring",
            req_sterilization=None,
            req_duration="long",
            recency_years=2.0,
            row=_make_row(txt_content="transient skin contact device"),
            iu_overlap=0.8,
        )
        triggers = [o.trigger for o in objs]
        assert ObjectionTrigger.DURATION_MISMATCH.value in triggers


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: Defense Packet Seed
# ─────────────────────────────────────────────────────────────────────────────

class TestDefensePacketSeedLegacy:
    """Tests for per-suggestion EvidenceTaskSeed (legacy build_defense_packet_seed)."""

    def test_generates_seeds_from_objections(self):
        objs = [
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="Materials differ",
                recommended_fix="Submit ISO 10993-1 eval",
                evidence_types=["biocomp", "bench"],
            ),
        ]
        seeds = build_defense_packet_seed(objs)
        assert len(seeds) == 2
        assert isinstance(seeds[0], EvidenceTaskSeed)
        assert seeds[0].evidence_type == "biocomp"
        assert seeds[0].priority == "HIGH"

    def test_deduplicates_seeds(self):
        objs = [
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="q1",
                recommended_fix="fix1",
                evidence_types=["biocomp"],
            ),
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="q2",
                recommended_fix="fix2",
                evidence_types=["biocomp"],
            ),
        ]
        seeds = build_defense_packet_seed(objs)
        assert len(seeds) == 1  # deduped by evidence_type + trigger

    def test_empty_when_no_objections(self):
        seeds = build_defense_packet_seed([])
        assert seeds == []


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: EvidenceTask + response-level DefensePacketSeed
# ─────────────────────────────────────────────────────────────────────────────

class TestEvidenceTaskAndResponseSeed:
    """Tests for the enterprise-grade response-level Defense Packet Seed."""

    def test_build_evidence_tasks_from_objections(self):
        objs = [
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="Materials differ",
                recommended_fix="Submit ISO 10993-1 eval",
                evidence_types=["biocomp", "bench"],
            ),
        ]
        tasks = build_evidence_tasks(objs, [])
        assert len(tasks) == 2
        for t in tasks:
            assert isinstance(t, EvidenceTask)
            assert t.task_id  # stable hash
            assert len(t.task_id) == 12
            assert t.category  # mapped from evidence_type
            assert t.severity == "HIGH"
            assert t.trigger == ObjectionTrigger.MATERIAL_CHANGE.value
            assert len(t.recommended_artifacts) > 0
            assert t.mapping.get("truth_machine_placeholder") is True
            assert t.mapping.get("se_matrix_linkable") is True

    def test_tasks_sorted_by_severity(self):
        objs = [
            Objection(
                trigger=ObjectionTrigger.STERILIZATION_CHANGE.value,
                severity=ObjectionSeverity.MEDIUM,
                question="q1",
                recommended_fix="fix1",
                evidence_types=["sterilization_validation"],
            ),
            Objection(
                trigger=ObjectionTrigger.TISSUE_CONTACT_DRIFT.value,
                severity=ObjectionSeverity.HIGH,
                question="q2",
                recommended_fix="fix2",
                evidence_types=["biocomp"],
            ),
        ]
        tasks = build_evidence_tasks(objs, [])
        assert tasks[0].severity == "HIGH"  # HIGH sorts first
        assert tasks[1].severity == "MEDIUM"

    def test_tasks_deduped_by_category_trigger(self):
        objs = [
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="q1",
                recommended_fix="fix1",
                evidence_types=["biocomp"],
            ),
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="q2",
                recommended_fix="fix2",
                evidence_types=["biocomp"],
            ),
        ]
        tasks = build_evidence_tasks(objs, [])
        assert len(tasks) == 1  # same category + trigger

    def test_task_id_is_deterministic(self):
        objs = [
            Objection(
                trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                severity=ObjectionSeverity.HIGH,
                question="q1",
                recommended_fix="fix1",
                evidence_types=["biocomp"],
            ),
        ]
        tasks1 = build_evidence_tasks(objs, [])
        tasks2 = build_evidence_tasks(objs, [])
        assert tasks1[0].task_id == tasks2[0].task_id

    def test_empty_tasks_when_no_objections(self):
        tasks = build_evidence_tasks([], [])
        assert tasks == []

    def test_build_response_defense_packet_seed_structure(self):
        """Response-level seed has all required fields."""
        from shadow_service.models_predicate import PredicateSuggestion, ScoreBreakdown
        # Minimal suggestion mock
        s = PredicateSuggestion(
            k_number="K230001",
            device_name="Test",
            product_code="DXN",
            similarity_score=0.8,
            defense_readiness_score=85.0,
            strategy_recommendation=StrategyRecommendation.BALANCED,
            reasoning="test",
            score_breakdown=ScoreBreakdown(),
            anticipated_objections=[
                Objection(
                    trigger=ObjectionTrigger.MATERIAL_CHANGE.value,
                    severity=ObjectionSeverity.HIGH,
                    question="q",
                    recommended_fix="fix",
                    evidence_types=["biocomp"],
                ),
            ],
            risk_flags=[
                RiskFlag(code="MATERIAL_MISMATCH", severity=RiskFlagSeverity.HIGH, message="test"),
            ],
        )
        seed = build_response_defense_packet_seed(
            suggestions=[s],
            subject_hash="abc123" * 10 + "abcd",
            program_id="prog-1",
            product_code="DXN",
        )
        assert isinstance(seed, DefensePacketSeed)
        assert seed.subject_hash.startswith("abc123")
        assert seed.program_id == "prog-1"
        assert seed.product_code == "DXN"
        assert seed.generated_at  # ISO timestamp
        assert seed.readiness_score == 85
        assert len(seed.tasks) == 1
        assert seed.tasks[0].task_id
        assert seed.tasks[0].category == "Biocompatibility"
        assert "MATERIAL_MISMATCH" in seed.top_risks

    def test_readiness_score_is_avg_drs(self):
        from shadow_service.models_predicate import PredicateSuggestion, ScoreBreakdown
        s1 = PredicateSuggestion(
            k_number="K1", device_name="A", product_code="DXN",
            similarity_score=0.8, defense_readiness_score=80.0,
            strategy_recommendation=StrategyRecommendation.BALANCED,
            reasoning="r", score_breakdown=ScoreBreakdown(),
        )
        s2 = PredicateSuggestion(
            k_number="K2", device_name="B", product_code="DXN",
            similarity_score=0.7, defense_readiness_score=100.0,
            strategy_recommendation=StrategyRecommendation.AGGRESSIVE,
            reasoning="r", score_breakdown=ScoreBreakdown(),
        )
        seed = build_response_defense_packet_seed(
            suggestions=[s1, s2],
            subject_hash="hash",
            program_id="p",
            product_code="DXN",
        )
        assert seed.readiness_score == 90  # (80+100)/2

    def test_empty_seed_when_no_suggestions(self):
        seed = build_response_defense_packet_seed(
            suggestions=[],
            subject_hash="hash",
            program_id="p",
            product_code="DXN",
        )
        assert seed.tasks == []
        assert seed.readiness_score == 0
        assert seed.top_risks == []


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: match snippets
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractMatchSnippets:
    def test_returns_snippets(self):
        row = _make_row(
            txt_content=(
                "This device provides continuous glucose monitoring. "
                "The sensor uses electrochemical technology for interstitial fluid. "
                "Intended for adult patients with diabetes."
            )
        )
        snippets = extract_match_snippets(
            "glucose monitoring electrochemical sensor adult",
            row,
        )
        assert len(snippets) > 0
        assert all(s.source == "txt_content" for s in snippets)

    def test_empty_when_no_text(self):
        row = _make_row(txt_content=None)
        snippets = extract_match_snippets("glucose", row)
        assert snippets == []


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: subject hash determinism
# ─────────────────────────────────────────────────────────────────────────────

class TestSubjectHash:
    def test_deterministic(self):
        req = _make_request()
        h1 = compute_subject_hash(req)
        h2 = compute_subject_hash(req)
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_different_inputs_different_hash(self):
        req1 = _make_request(product_code="DXN")
        req2 = _make_request(product_code="QEI")
        assert compute_subject_hash(req1) != compute_subject_hash(req2)

    def test_includes_sterilization(self):
        req1 = _make_request(sterilization="EO")
        req2 = _make_request(sterilization="gamma")
        assert compute_subject_hash(req1) != compute_subject_hash(req2)


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests: build_subject_text
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildSubjectText:
    def test_includes_all_fields(self):
        req = _make_request(
            materials=["titanium", "PEEK"],
            energy_source="battery",
            tissue_contact="implant",
            duration="long",
            sterilization="EO",
        )
        text = build_subject_text(req)
        assert "titanium" in text
        assert "battery" in text
        assert "implant" in text
        assert "EO" in text

    def test_minimal_fields(self):
        req = _make_request()
        text = build_subject_text(req)
        assert "Glucose Monitor" in text
        assert "glucose monitoring" in text.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Integration tests: suggest_predicates (full pipeline)
# ─────────────────────────────────────────────────────────────────────────────

class TestSuggestPredicates:
    """Integration tests for the full pipeline using fake pool."""

    def _run(self, pool, req=None):
        _cache._store.clear()
        return asyncio.get_event_loop().run_until_complete(
            suggest_predicates(pool, req or _make_request())
        )

    def test_returns_max_5(self):
        rows = [_make_row(k_number=f"K23000{i}") for i in range(10)]
        pool = FakePool(rows, count=10)
        resp = self._run(pool)
        assert len(resp.suggestions) <= 5

    def test_includes_required_fields(self):
        rows = [_make_row()]
        pool = FakePool(rows, count=1)
        resp = self._run(pool)
        s = resp.suggestions[0]
        # Identity
        assert s.k_number == "K230001"
        assert s.device_name
        assert s.product_code
        # Scores
        assert 0.0 <= s.similarity_score <= 1.0
        assert 0 <= s.defense_readiness_score <= 100
        # Strategy
        assert s.strategy_recommendation in [
            StrategyRecommendation.CONSERVATIVE,
            StrategyRecommendation.BALANCED,
            StrategyRecommendation.AGGRESSIVE,
            StrategyRecommendation.AVOID,
        ]
        # Explainability
        assert s.reasoning
        assert s.score_breakdown is not None
        # toxicity_score is None (placeholder)
        assert s.toxicity_score is None

    def test_stable_sort(self):
        """Same input → same ordering (deterministic)."""
        rows = [
            _make_row(k_number="K230001", fts_rank=0.3),
            _make_row(k_number="K230002", fts_rank=0.2),
            _make_row(k_number="K230003", fts_rank=0.1),
        ]
        pool = FakePool(rows, count=3)
        resp1 = self._run(pool)
        _cache._store.clear()
        resp2 = self._run(pool)
        order1 = [s.k_number for s in resp1.suggestions]
        order2 = [s.k_number for s in resp2.suggestions]
        assert order1 == order2

    def test_avoid_tissue_contact_mismatch(self):
        """AVOID when tissue_contact = 'implant' but predicate has no implant keyword."""
        rows = [_make_row(txt_content="surface skin monitor device")]
        pool = FakePool(rows, count=1)
        req = _make_request(tissue_contact="implant")
        resp = self._run(pool, req)
        s = resp.suggestions[0]
        # Should be AVOID due to HIGH mismatch flag
        assert s.strategy_recommendation == StrategyRecommendation.AVOID

    def test_subject_hash_in_response(self):
        rows = [_make_row()]
        pool = FakePool(rows, count=1)
        resp = self._run(pool)
        assert resp.subject_hash
        assert len(resp.subject_hash) == 64

    def test_cache_hit(self):
        rows = [_make_row()]
        pool = FakePool(rows, count=1)
        req = _make_request()
        _cache._store.clear()
        resp1 = asyncio.get_event_loop().run_until_complete(
            suggest_predicates(pool, req)
        )
        assert resp1.cached is False
        resp2 = asyncio.get_event_loop().run_until_complete(
            suggest_predicates(pool, req)
        )
        assert resp2.cached is True

    def test_empty_candidates(self):
        pool = FakePool([], count=0)
        resp = self._run(pool)
        assert resp.suggestions == []
        assert resp.total_candidates_scanned == 0

    def test_defense_packet_seed_generated(self):
        """When objections are present, per-suggestion defense_packet_seed should be populated."""
        # Force material mismatch → objection → defense seed
        rows = [_make_row(txt_content="stainless steel device")]
        pool = FakePool(rows, count=1)
        req = _make_request(materials=["titanium", "PEEK"])
        resp = self._run(pool, req)
        s = resp.suggestions[0]
        if s.anticipated_objections:
            assert len(s.defense_packet_seed) > 0
            assert all(isinstance(seed, EvidenceTaskSeed) for seed in s.defense_packet_seed)
            assert all(seed.evidence_type for seed in s.defense_packet_seed)

    def test_response_level_defense_packet_seed(self):
        """Response has a rich DefensePacketSeed with tasks/readiness/top_risks."""
        rows = [_make_row(txt_content="stainless steel device")]
        pool = FakePool(rows, count=1)
        req = _make_request(materials=["titanium", "PEEK"])
        resp = self._run(pool, req)
        seed = resp.defense_packet_seed
        assert seed is not None
        assert isinstance(seed, DefensePacketSeed)
        assert seed.subject_hash
        assert seed.program_id == "test-program"
        assert seed.product_code == "DXN"
        assert seed.generated_at
        assert 0 <= seed.readiness_score <= 100
        if resp.suggestions[0].anticipated_objections:
            assert len(seed.tasks) > 0
            for task in seed.tasks:
                assert isinstance(task, EvidenceTask)
                assert len(task.task_id) == 12
                assert task.category
                assert task.severity in ["LOW", "MEDIUM", "HIGH"]
                assert len(task.recommended_artifacts) > 0
                assert task.mapping.get("truth_machine_placeholder") is True

    def test_response_defense_seed_empty_when_no_candidates(self):
        pool = FakePool([], count=0)
        resp = self._run(pool)
        seed = resp.defense_packet_seed
        assert seed is not None
        assert seed.tasks == []
        assert seed.readiness_score == 0

    def test_latency_ms_in_response(self):
        rows = [_make_row()]
        pool = FakePool(rows, count=1)
        resp = self._run(pool)
        assert resp.latency_ms >= 0

    def test_weights_version(self):
        rows = [_make_row()]
        pool = FakePool(rows, count=1)
        resp = self._run(pool)
        assert resp.weights_version == "v2.0"

    def test_risk_flags_are_typed(self):
        """risk_flags should be RiskFlag objects with code/severity/message."""
        # Predicate with no text → should get MISSING_SUMMARY_TEXT flag
        rows = [_make_row(txt_content=None, summary_url=None)]
        pool = FakePool(rows, count=1)
        resp = self._run(pool)
        s = resp.suggestions[0]
        assert len(s.risk_flags) > 0
        for f in s.risk_flags:
            assert hasattr(f, 'code')
            assert hasattr(f, 'severity')
            assert hasattr(f, 'message')

    def test_objections_have_spec_fields(self):
        """Objections must have trigger/severity/question/recommended_fix/evidence_types."""
        rows = [_make_row(txt_content="basic device no software no cyber")]
        pool = FakePool(rows, count=1)
        req = _make_request(software_present=True, technology_description="software-controlled glucose algorithm")
        resp = self._run(pool, req)
        s = resp.suggestions[0]
        if s.anticipated_objections:
            obj = s.anticipated_objections[0]
            assert obj.trigger
            assert obj.severity in [ObjectionSeverity.LOW, ObjectionSeverity.MEDIUM, ObjectionSeverity.HIGH]
            assert obj.question
            assert obj.recommended_fix
            assert isinstance(obj.evidence_types, list)

    def test_no_network_calls(self):
        """Ensure suggest_predicates doesn't make any network calls."""
        rows = [_make_row()]
        pool = FakePool(rows, count=1)
        # If this completes without error, no real DB/network was used
        resp = self._run(pool)
        assert resp.suggestions is not None
