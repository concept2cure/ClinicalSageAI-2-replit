"""Tests for Phase 6.6.B — Predicate Suggestion Engine.

Tests the scoring, ranking, and explainability logic with mocked DB rows
(same pattern as test_ingest_fda_510k.py — sync wrappers, fake pool, no
pytest-asyncio dependency).
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
    _classify_strategy,
    _compute_flags,
    _compute_reviewer_heat,
    _name_overlap,
    _normalize_fts,
    _recency_boost,
    _tokenize,
    _years_since,
)
from shadow_service.models_predicate import (
    PredicateFlag,
    PredicateSuggestRequest,
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

def _fake_clearance_row(
    k_number: str = "K241234",
    device_name: str = "Flux Compensator",
    applicant: str = "Acme Devices Inc.",
    product_code: str = "QEI",
    decision_date: date | None = None,
    fts_rank: float = 0.15,
    txt_content: str | None = "Intended for percutaneous spinal fusion",
    summary_url: str | None = "https://fda.gov/k/K241234",
) -> dict[str, Any]:
    if decision_date is None:
        decision_date = date.today() - timedelta(days=365 * 3)
    return {
        "k_number": k_number,
        "device_name": device_name,
        "applicant": applicant,
        "product_code": product_code,
        "decision_date": decision_date,
        "decision_code": "SE",
        "summary_url": summary_url,
        "txt_content": txt_content,
        "clearance_type": "Traditional",
        "fts_rank": fts_rank,
    }


class FakePool:
    """Minimal asyncpg pool mock that returns pre-loaded rows."""

    def __init__(self, rows: list[dict] | None = None, total_count: int = 42) -> None:
        self._rows = rows or []
        self._total = total_count

    def acquire(self):
        return _FakeCtx(self)


class _FakeCtx:
    def __init__(self, pool: FakePool):
        self.pool = pool

    async def __aenter__(self):
        return _FakeConn(self.pool)

    async def __aexit__(self, *a):
        pass


class _FakeConn:
    def __init__(self, pool: FakePool):
        self.pool = pool

    async def fetch(self, query: str, *args: Any) -> list:
        return self.pool._rows

    async def fetchval(self, query: str, *args: Any) -> Any:
        return self.pool._total


def _make_request(**overrides) -> PredicateSuggestRequest:
    defaults = {
        "program_id": "prog-001",
        "product_code": "QEI",
        "device_description": "Spinal fusion interbody cage titanium",
    }
    defaults.update(overrides)
    return PredicateSuggestRequest(**defaults)


# ─────────────────────────────────────────────────────────────────────────────
# Unit tests — scoring helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenize:
    def test_basic(self):
        assert "spinal" in _tokenize("Spinal fusion device")

    def test_removes_stop_words(self):
        tokens = _tokenize("a device for the spine")
        assert "a" not in tokens
        assert "the" not in tokens
        assert "device" in tokens
        assert "spine" in tokens


class TestNormalizeFts:
    def test_zero(self):
        assert _normalize_fts(0.0) == 0.0

    def test_negative(self):
        assert _normalize_fts(-1.0) == 0.0

    def test_high(self):
        assert _normalize_fts(0.3) == 1.0

    def test_mid(self):
        val = _normalize_fts(0.15)
        assert 0.4 < val < 0.6


class TestNameOverlap:
    def test_perfect(self):
        assert _name_overlap("fusion cage", "fusion cage") > 0.5

    def test_none(self):
        assert _name_overlap("xyz", "abc") == 0.0

    def test_partial(self):
        score = _name_overlap("spinal fusion device", "fusion cage device")
        assert 0.3 < score < 1.0

    def test_empty(self):
        assert _name_overlap("", "device") == 0.0


class TestRecencyBoost:
    def test_very_recent(self):
        assert _recency_boost(0.5) == 1.0

    def test_old(self):
        assert _recency_boost(10.0) == 0.0

    def test_mid(self):
        val = _recency_boost(5.0)
        assert 0.1 < val < 0.9

    def test_none(self):
        assert _recency_boost(None) == 0.0


class TestClassifyStrategy:
    def test_aggressive(self):
        assert _classify_strategy(1.0) == StrategyRecommendation.AGGRESSIVE

    def test_balanced(self):
        assert _classify_strategy(4.0) == StrategyRecommendation.BALANCED

    def test_conservative(self):
        assert _classify_strategy(8.0) == StrategyRecommendation.CONSERVATIVE

    def test_none(self):
        assert _classify_strategy(None) == StrategyRecommendation.BALANCED


class TestComputeFlags:
    def test_old_predicate(self):
        flags = _compute_flags(9.0, 0.5, True, date.today() - timedelta(days=3300))
        assert PredicateFlag.OLD_PREDICATE in flags

    def test_low_text_match(self):
        flags = _compute_flags(3.0, 0.05, True, date.today() - timedelta(days=1000))
        assert PredicateFlag.LOW_TEXT_MATCH in flags

    def test_missing_summary(self):
        flags = _compute_flags(3.0, 0.5, False, date.today() - timedelta(days=1000))
        assert PredicateFlag.MISSING_SUMMARY_TEXT in flags

    def test_very_new(self):
        flags = _compute_flags(0.1, 0.5, True, date.today() - timedelta(days=30))
        assert PredicateFlag.VERY_NEW in flags

    def test_clean(self):
        flags = _compute_flags(3.0, 0.5, True, date.today() - timedelta(days=1000))
        assert flags == []


class TestReviewerHeat:
    def test_perfect_predicate(self):
        heat = _compute_reviewer_heat(3.0, 0.5, True, date.today() - timedelta(days=1000))
        assert heat == 0

    def test_old_no_text_low_match(self):
        heat = _compute_reviewer_heat(9.0, 0.03, False, date.today() - timedelta(days=3300))
        assert heat >= 70


# ─────────────────────────────────────────────────────────────────────────────
# Integration tests — full suggest_predicates pipeline
# ─────────────────────────────────────────────────────────────────────────────

def test_suggest_returns_max_5():
    """Even with 20 DB rows, only top 5 are returned."""

    async def _run():
        rows = [_fake_clearance_row(f"K24{i:04d}", fts_rank=0.3 - i * 0.01) for i in range(10)]
        pool = FakePool(rows=rows, total_count=100)
        req = _make_request()
        resp = await suggest_predicates(pool, req)
        assert len(resp.suggestions) <= MAX_SUGGESTIONS
        assert resp.total_candidates_scanned == 100

    asyncio.run(_run())


def test_suggest_sorted_by_score_desc():
    """Suggestions are sorted by similarity_score descending."""

    async def _run():
        rows = [
            _fake_clearance_row("K240001", fts_rank=0.05),
            _fake_clearance_row("K240002", fts_rank=0.25),
            _fake_clearance_row("K240003", fts_rank=0.15),
        ]
        pool = FakePool(rows=rows)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        scores = [s.similarity_score for s in resp.suggestions]
        assert scores == sorted(scores, reverse=True)

    asyncio.run(_run())


def test_suggest_strategy_populated():
    """Every suggestion has a strategy_recommendation."""

    async def _run():
        rows = [_fake_clearance_row("K240001")]
        pool = FakePool(rows=rows)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        for s in resp.suggestions:
            assert s.strategy_recommendation in (
                StrategyRecommendation.AGGRESSIVE,
                StrategyRecommendation.BALANCED,
                StrategyRecommendation.CONSERVATIVE,
            )

    asyncio.run(_run())


def test_suggest_reasoning_nonempty():
    """Reasoning is non-empty and deterministic for same input."""

    async def _run():
        rows = [_fake_clearance_row("K240001")]
        pool = FakePool(rows=rows)
        req = _make_request()

        resp1 = await suggest_predicates(pool, req)
        resp2 = await suggest_predicates(pool, req)

        assert resp1.suggestions[0].reasoning
        assert resp1.suggestions[0].reasoning == resp2.suggestions[0].reasoning

    asyncio.run(_run())


def test_suggest_flags_old_predicate():
    """Old predicate (>8y) gets OLD_PREDICATE flag."""

    async def _run():
        old_date = date.today() - timedelta(days=365 * 9)
        rows = [_fake_clearance_row("K160001", decision_date=old_date)]
        pool = FakePool(rows=rows)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        assert PredicateFlag.OLD_PREDICATE in resp.suggestions[0].flags

    asyncio.run(_run())


def test_suggest_flags_missing_text():
    """Predicate without txt_content gets MISSING_SUMMARY_TEXT flag."""

    async def _run():
        rows = [_fake_clearance_row("K240001", txt_content=None, summary_url=None)]
        pool = FakePool(rows=rows)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        assert PredicateFlag.MISSING_SUMMARY_TEXT in resp.suggestions[0].flags

    asyncio.run(_run())


def test_suggest_subject_hash_stable():
    """Same input produces same subject_hash."""

    async def _run():
        pool = FakePool(rows=[_fake_clearance_row("K240001")])
        req = _make_request()
        resp1 = await suggest_predicates(pool, req)
        resp2 = await suggest_predicates(pool, req)

        assert resp1.subject_hash == resp2.subject_hash
        assert len(resp1.subject_hash) == 64  # SHA-256

    asyncio.run(_run())


def test_suggest_score_breakdown_present():
    """Every suggestion has a full score_breakdown."""

    async def _run():
        rows = [_fake_clearance_row("K240001")]
        pool = FakePool(rows=rows)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        bd = resp.suggestions[0].score_breakdown
        assert bd.fts_score >= 0
        assert bd.name_match >= 0
        assert bd.recency_boost >= 0
        assert bd.completeness_bonus >= 0
        assert "fts" in bd.weights

    asyncio.run(_run())


def test_suggest_reviewer_heat_range():
    """reviewer_heat is 0–100."""

    async def _run():
        rows = [_fake_clearance_row("K240001")]
        pool = FakePool(rows=rows)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        for s in resp.suggestions:
            assert 0 <= s.reviewer_heat <= 100

    asyncio.run(_run())


def test_suggest_empty_db():
    """Returns empty suggestions when DB has no matches."""

    async def _run():
        pool = FakePool(rows=[], total_count=0)
        req = _make_request()
        resp = await suggest_predicates(pool, req)

        assert resp.suggestions == []
        assert resp.total_candidates_scanned == 0

    asyncio.run(_run())


def test_build_subject_text():
    """Subject text includes all provided fields."""
    req = _make_request(
        intended_use="spinal stabilization",
        materials=["titanium", "PEEK"],
        energy_source="none",
    )
    text = build_subject_text(req)
    assert "spinal stabilization" in text
    assert "titanium" in text
    assert "PEEK" in text
    assert "none" in text


def test_suggest_matched_terms():
    """matched_terms shows which subject tokens matched the predicate."""

    async def _run():
        rows = [_fake_clearance_row(
            "K240001",
            device_name="Spinal Fusion Cage",
            txt_content="titanium interbody fusion cage for spinal stabilization",
        )]
        pool = FakePool(rows=rows)
        req = _make_request(device_description="spinal fusion interbody cage titanium")
        resp = await suggest_predicates(pool, req)

        terms = resp.suggestions[0].matched_terms
        assert len(terms) > 0
        # At least some overlap terms should appear
        assert any(t in ["spinal", "fusion", "cage", "titanium"] for t in terms)

    asyncio.run(_run())
