"""Tests for Phase 5.3.C — Nightly A8 Contradiction Scan.

Covers:
 1. run_nightly_scans — full lifecycle (multiple programs, mixed results)
 2. run_nightly_scans — empty program list (no active programs)
 3. run_nightly_scans — partial failures (some scans fail, others succeed)
 4. run_nightly_scans — connection handling (release on success/failure)
 5. CLI entrypoint — exit code logic
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4


# =============================================================================
# Helper: asyncpg.Record-like object
# =============================================================================

class FakeRecord(dict):
    """Mimics asyncpg.Record: supports dict(row), row["key"], and row.get(k)."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


# =============================================================================
# Import module under test
# =============================================================================

from shadow_service.contradiction_scanner import run_nightly_scans
from shadow_service import contradiction_scanner as scanner


# =============================================================================
# Tests: run_nightly_scans
# =============================================================================

class TestRunNightlyScans:
    """Tests for the nightly batch scan function."""

    @pytest.mark.asyncio
    async def test_scans_all_active_programs(self):
        """Should run a scan for each active program."""
        pid1, pid2 = uuid4(), uuid4()
        program_rows = [FakeRecord({"id": pid1}), FakeRecord({"id": pid2})]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=program_rows)

        scan_result = {
            "id": uuid4(),
            "status": "completed",
            "contradictions_found": 2,
        }

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner, "run_scan", new_callable=AsyncMock, return_value=scan_result) as mock_run:

            summary = await run_nightly_scans()

            assert summary["total_programs"] == 2
            assert summary["succeeded"] == 2
            assert summary["failed"] == 0
            assert len(summary["results"]) == 2

            # Verify run_scan called with correct args
            calls = mock_run.call_args_list
            assert len(calls) == 2
            for call in calls:
                assert call.kwargs["scan_type"] == "full"
                assert call.kwargs["triggered_by"] == "a8_nightly"
                assert call.kwargs["actor"] == "system"

    @pytest.mark.asyncio
    async def test_no_active_programs(self):
        """Should return zero counts when no programs are active."""
        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):

            summary = await run_nightly_scans()

        assert summary["total_programs"] == 0
        assert summary["succeeded"] == 0
        assert summary["failed"] == 0
        assert summary["results"] == []

    @pytest.mark.asyncio
    async def test_partial_failure(self):
        """Should continue scanning after individual failures."""
        pid1, pid2, pid3 = uuid4(), uuid4(), uuid4()
        program_rows = [
            FakeRecord({"id": pid1}),
            FakeRecord({"id": pid2}),
            FakeRecord({"id": pid3}),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=program_rows)

        # First succeeds, second fails, third succeeds
        success_result = {"id": uuid4(), "status": "completed", "contradictions_found": 0}
        fail_result = {"id": uuid4(), "status": "failed", "contradictions_found": 0}

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(
                 scanner, "run_scan", new_callable=AsyncMock,
                 side_effect=[success_result, fail_result, success_result],
             ):

            summary = await run_nightly_scans()

        assert summary["total_programs"] == 3
        assert summary["succeeded"] == 2
        assert summary["failed"] == 1

    @pytest.mark.asyncio
    async def test_exception_during_scan_is_caught(self):
        """Should handle exceptions from run_scan gracefully."""
        pid1 = uuid4()
        program_rows = [FakeRecord({"id": pid1})]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=program_rows)

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(
                 scanner, "run_scan", new_callable=AsyncMock,
                 side_effect=Exception("DB connection lost"),
             ):

            summary = await run_nightly_scans()

        assert summary["total_programs"] == 1
        assert summary["succeeded"] == 0
        assert summary["failed"] == 1
        assert summary["results"][0]["status"] == "error"
        assert "DB connection lost" in summary["results"][0]["error"]

    @pytest.mark.asyncio
    async def test_connection_released_after_program_fetch(self):
        """Connection should be released after fetching program IDs."""
        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        release_mock = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", release_mock):

            await run_nightly_scans()

        release_mock.assert_awaited_once_with(mock_conn)

    @pytest.mark.asyncio
    async def test_result_contains_program_and_scan_ids(self):
        """Each result entry should contain program_id and scan_id."""
        pid = uuid4()
        scan_id = uuid4()
        program_rows = [FakeRecord({"id": pid})]
        scan_result = {"id": scan_id, "status": "completed", "contradictions_found": 3}

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=program_rows)

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner, "run_scan", new_callable=AsyncMock, return_value=scan_result):

            summary = await run_nightly_scans()

        result = summary["results"][0]
        assert result["program_id"] == str(pid)
        assert result["scan_id"] == str(scan_id)
        assert result["status"] == "completed"
        assert result["contradictions_found"] == 3


# =============================================================================
# Tests: CLI exit code logic
# =============================================================================

class TestNightlyScanCLI:
    """Tests for the CLI entrypoint exit code logic."""

    @pytest.mark.asyncio
    async def test_exit_0_on_all_success(self):
        """Should return 0 when all scans succeed."""
        from shadow_service.nightly_scan import main

        summary = {"total_programs": 2, "succeeded": 2, "failed": 0, "results": []}

        with patch.object(scanner, "run_nightly_scans", new_callable=AsyncMock, return_value=summary):
            exit_code = await main()

        assert exit_code == 0

    @pytest.mark.asyncio
    async def test_exit_1_on_any_failure(self):
        """Should return 1 when any scan fails."""
        from shadow_service.nightly_scan import main

        summary = {"total_programs": 3, "succeeded": 2, "failed": 1, "results": []}

        with patch.object(scanner, "run_nightly_scans", new_callable=AsyncMock, return_value=summary):
            exit_code = await main()

        assert exit_code == 1

    @pytest.mark.asyncio
    async def test_exit_0_on_no_programs(self):
        """Should return 0 when no active programs exist."""
        from shadow_service.nightly_scan import main

        summary = {"total_programs": 0, "succeeded": 0, "failed": 0, "results": []}

        with patch.object(scanner, "run_nightly_scans", new_callable=AsyncMock, return_value=summary):
            exit_code = await main()

        assert exit_code == 0
