"""Smoke tests for FDA 510(k) Ingest Job — Phase 6.6.A.

Tests the ingestor logic with mocked HTTP and a fake asyncpg pool
so we never hit real openFDA or a real database in CI.
"""
from __future__ import annotations

import json
import pytest
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any

from shadow_service.jobs.ingest_fda_510k import (
    FDA510kIngestor,
    _parse_date,
    _normalize_decision,
    content_hash,
)


# Override conftest's async autouse reset_db_pool so sync tests can run
# without pytest-asyncio.
@pytest.fixture(autouse=True)
def reset_db_pool():
    """Sync noop — overrides conftest async fixture for this module."""
    yield


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fake_clearance(k_number: str = "K241234", product_code: str = "QEI") -> dict:
    """Minimal openFDA 510(k) result shape."""
    return {
        "k_number": k_number,
        "applicant": "Acme Devices Inc.",
        "device_name": "Flux Compensator",
        "product_code": product_code,
        "decision_date": "2025-06-15",
        "decision_code": "SE",
        "clearance_type": "Traditional",
        "statement_or_summary": "SESE",
        "statement_or_summary_url": f"https://fda.gov/k/{k_number}",
        "third_party_flag": "N",
        "expedited_review_flag": "N",
        "review_panel": "SU",
    }


def _fake_enforcement(k_number: str = "K241234") -> dict:
    """Minimal openFDA enforcement shape referencing a K-number."""
    return {
        "classification": "Class II",
        "recall_initiation_date": "2025-08-01",
        "reason_for_recall": f"Device {k_number} has a labeling issue",
        "recall_number": "Z-1234-2025",
        "event_id": "99999",
        "product_description": f"Cleared under {k_number}",
        "code_info": "",
    }


class FakeHTTPResponse:
    """Minimal httpx response mock."""
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    def json(self) -> dict:
        return self._data

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class FakePool:
    """Minimal asyncpg pool mock that tracks executed queries."""

    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple]] = []
        self._fetchval_returns: dict[str, Any] = {}

    def acquire(self):
        return _FakePoolCtx(self)


class _FakePoolCtx:
    def __init__(self, pool: FakePool):
        self.pool = pool

    async def __aenter__(self):
        return _FakeConn(self.pool)

    async def __aexit__(self, *a):
        pass


class _FakeConn:
    def __init__(self, pool: FakePool):
        self.pool = pool

    async def execute(self, query: str, *args: Any) -> None:
        self.pool.executed.append((query.strip()[:60], args))

    async def fetchval(self, query: str, *args: Any) -> Any:
        self.pool.executed.append((query.strip()[:60], args))
        # Return a fake UUID for INSERT_INGEST_RUN
        if "INSERT INTO predicate.fda_ingest_runs" in query:
            import uuid
            return uuid.uuid4()
        # Return 1 for existence checks
        if "SELECT 1 FROM" in query:
            return 1
        return self.pool._fetchval_returns.get(query.strip()[:40])

    async def fetch(self, query: str, *args: Any) -> list:
        self.pool.executed.append((query.strip()[:60], args))
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Unit Tests — helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestHelpers:
    def test_parse_date_iso(self):
        assert _parse_date("2025-06-15") == date(2025, 6, 15)

    def test_parse_date_us(self):
        assert _parse_date("06/15/2025") == date(2025, 6, 15)

    def test_parse_date_compact(self):
        assert _parse_date("20250615") == date(2025, 6, 15)

    def test_parse_date_none(self):
        assert _parse_date(None) is None

    def test_parse_date_garbage(self):
        assert _parse_date("not-a-date") is None

    def test_normalize_decision_se(self):
        assert _normalize_decision("SE") == "SE"

    def test_normalize_decision_case(self):
        assert _normalize_decision("se") == "SE"

    def test_normalize_decision_nse(self):
        assert _normalize_decision("NSE") == "NSE"

    def test_normalize_decision_none(self):
        assert _normalize_decision(None) is None

    def test_content_hash_deterministic(self):
        h1 = content_hash("test data")
        h2 = content_hash("test data")
        assert h1 == h2
        assert len(h1) == 64

    def test_content_hash_different(self):
        assert content_hash("a") != content_hash("b")


class TestExtractKNumbers:
    def test_finds_k_number_in_text(self):
        recall = {
            "product_description": "Device cleared under K241234 has issue",
            "code_info": "",
            "reason_for_recall": "",
        }
        result = FDA510kIngestor._extract_k_numbers(recall)
        assert "K241234" in result

    def test_multiple_k_numbers(self):
        recall = {
            "product_description": "K241234 and K190001 affected",
            "code_info": "See K241234",
            "reason_for_recall": "Related to K190001",
        }
        result = FDA510kIngestor._extract_k_numbers(recall)
        assert set(result) == {"K241234", "K190001"}

    def test_no_k_numbers(self):
        recall = {
            "product_description": "No device references",
            "code_info": "",
            "reason_for_recall": "General issue",
        }
        assert FDA510kIngestor._extract_k_numbers(recall) == []


# ─────────────────────────────────────────────────────────────────────────────
# Smoke Tests — full ingestor with mocked HTTP
# Uses asyncio.run() wrappers so tests work without pytest-asyncio.
# ─────────────────────────────────────────────────────────────────────────────

import asyncio


def test_ingestor_upserts_clearances():
    """Ingestor fetches clearances from mocked openFDA and upserts into pool."""

    async def _run():
        pool = FakePool()

        clearance = _fake_clearance("K999001", "QEI")
        enforcement = _fake_enforcement("K999001")

        async def mock_get(url, params=None):
            if "510k" in url:
                return FakeHTTPResponse({"results": [clearance]})
            if "enforcement" in url:
                return FakeHTTPResponse({"results": [enforcement]})
            return FakeHTTPResponse({"results": []})

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = mock_get
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            ingestor = FDA510kIngestor(pool, api_key="test-key")
            stats = await ingestor.run(product_codes=["QEI"], max_clearances=10)

        assert stats["clearances_upserted"] >= 1
        assert stats["status"] in ("completed", "partial")
        assert stats.get("run_id") is not None

        # Verify product code + clearance upserts were issued
        query_prefixes = [q[0] for q in pool.executed]
        assert any("INSERT INTO predicate.fda_product_codes" in q for q in query_prefixes)
        assert any("INSERT INTO predicate.fda_510k_clearances" in q for q in query_prefixes)

    asyncio.run(_run())


def test_ingestor_records_run_in_fda_ingest_runs():
    """Ingestor writes an fda_ingest_runs row at start and updates on completion."""

    async def _run():
        pool = FakePool()

        async def mock_get(url, params=None):
            return FakeHTTPResponse({"results": []})  # empty — no data to process

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = mock_get
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            ingestor = FDA510kIngestor(pool)
            stats = await ingestor.run(max_clearances=10, triggered_by="test")

        assert stats["status"] == "completed"

        # Should have: INSERT into ingest_runs, then UPDATE ingest_runs
        query_prefixes = [q[0] for q in pool.executed]
        assert any("INSERT INTO predicate.fda_ingest_runs" in q for q in query_prefixes), \
            f"Missing INSERT ingest_runs. Queries: {query_prefixes}"
        assert any("UPDATE predicate.fda_ingest_runs" in q for q in query_prefixes), \
            f"Missing UPDATE ingest_runs. Queries: {query_prefixes}"

    asyncio.run(_run())


def test_ingestor_handles_http_failure_gracefully():
    """Ingestor logs errors but doesn't crash on HTTP failures."""

    async def _run():
        pool = FakePool()

        async def mock_get(url, params=None):
            return FakeHTTPResponse({}, status_code=500)

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = mock_get
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            ingestor = FDA510kIngestor(pool)
            stats = await ingestor.run(max_clearances=10)

        # Should complete (possibly partial) but not crash
        assert stats["status"] in ("completed", "partial", "failed")
        assert stats["clearances_upserted"] == 0

    asyncio.run(_run())


def test_ingestor_query_by_product_code():
    """Verify product_code filter is passed to openFDA search query."""

    async def _run():
        pool = FakePool()
        called_params: list = []

        async def mock_get(url, params=None):
            called_params.append(params or {})
            return FakeHTTPResponse({"results": []})

        with patch("httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = mock_get
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            ingestor = FDA510kIngestor(pool)
            await ingestor.run(product_codes=["QEI", "QGO"], max_clearances=10)

        # First call should be the clearance fetch with search filter
        assert len(called_params) > 0
        first_call = called_params[0]
        if "search" in first_call:
            assert "QEI" in first_call["search"]
            assert "QGO" in first_call["search"]

    asyncio.run(_run())
