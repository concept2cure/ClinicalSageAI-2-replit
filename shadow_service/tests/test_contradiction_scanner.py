"""Tests for Phase 5.3.A — Contradiction Scanner.

Covers:
 1. SQL structure — contradiction scan CRUD queries
 2. Scanner runner — run_scan lifecycle (success + failure paths)
 3. Scanner runner — get_scan + list_scans
 4. Router integration — POST/GET contradiction-scans endpoints
 5. Migration structure — eCTD headers, DDL
 6. Edge cases — empty program, section-scoped scans, error recording
"""

import json
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import UUID, uuid4
from datetime import datetime


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


def _make_scan_row(**overrides):
    """Factory for a mock contradiction_scans DB row."""
    row = {
        "id": uuid4(),
        "program_id": uuid4(),
        "scan_type": "full",
        "section_ref": None,
        "status": "completed",
        "total_claims": 5,
        "contradictions_found": 2,
        "results": json.dumps([
            {"entity_field": "AE:count", "claim_count": 3, "distinct_values": ["0", "2"], "claim_ids": [], "severity": "medium"},
            {"entity_field": "AE:serious_count", "claim_count": 2, "distinct_values": ["0", "1"], "claim_ids": [], "severity": "medium"},
        ]),
        "triggered_by": "manual",
        "actor": "system",
        "error_message": None,
        "started_at": datetime.utcnow(),
        "completed_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


# =============================================================================
# 1) SQL structure tests
# =============================================================================


class TestContradictionScanSQL:
    """Validate SQL strings for contradiction scans."""

    def test_insert_scan_is_string(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.INSERT_CONTRADICTION_SCAN, str)
        assert len(sql.INSERT_CONTRADICTION_SCAN.strip()) > 20

    def test_insert_scan_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.INSERT_CONTRADICTION_SCAN.upper()

    def test_insert_scan_has_nine_params(self):
        from shadow_service import sql_evidence as sql
        assert "$9" in sql.INSERT_CONTRADICTION_SCAN

    def test_update_complete_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.UPDATE_CONTRADICTION_SCAN_COMPLETE.upper()

    def test_update_complete_sets_completed(self):
        from shadow_service import sql_evidence as sql
        lower = sql.UPDATE_CONTRADICTION_SCAN_COMPLETE.lower()
        assert "'completed'" in lower
        assert "completed_at" in lower

    def test_update_failed_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.UPDATE_CONTRADICTION_SCAN_FAILED.upper()

    def test_update_failed_sets_error(self):
        from shadow_service import sql_evidence as sql
        lower = sql.UPDATE_CONTRADICTION_SCAN_FAILED.lower()
        assert "'failed'" in lower
        assert "error_message" in lower

    def test_select_by_program_has_ordering(self):
        from shadow_service import sql_evidence as sql
        upper = sql.SELECT_CONTRADICTION_SCANS_BY_PROGRAM.upper()
        assert "ORDER BY" in upper
        assert "DESC" in upper

    def test_select_by_program_has_pagination(self):
        from shadow_service import sql_evidence as sql
        assert "LIMIT" in sql.SELECT_CONTRADICTION_SCANS_BY_PROGRAM.upper()
        assert "OFFSET" in sql.SELECT_CONTRADICTION_SCANS_BY_PROGRAM.upper()

    def test_select_by_id_exists(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.SELECT_CONTRADICTION_SCAN_BY_ID, str)
        assert "$1" in sql.SELECT_CONTRADICTION_SCAN_BY_ID


# =============================================================================
# 2) Scanner runner — run_scan lifecycle
# =============================================================================


class TestRunScan:
    """Test run_scan end-to-end with mocked DB."""

    @pytest.mark.asyncio
    async def test_run_scan_success(self):
        """Full lifecycle: create → detect → complete."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        scan_id = uuid4()
        running_row = _make_scan_row(
            id=scan_id, program_id=program_id, status="running",
            total_claims=0, contradictions_found=0, results="[]",
        )
        completed_row = _make_scan_row(
            id=scan_id, program_id=program_id, status="completed",
            total_claims=5, contradictions_found=2,
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        mock_contradictions = [
            {"entity_field": "AE:count", "claim_count": 3, "distinct_values": ["0", "2"],
             "claim_ids": ["a", "b", "c"], "severity": "medium"},
            {"entity_field": "AE:serious", "claim_count": 2, "distinct_values": ["0", "1"],
             "claim_ids": ["d", "e"], "severity": "medium"},
        ]

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=mock_contradictions):
            result = await scanner.run_scan(program_id=program_id)
            assert result["id"] == scan_id
            assert result["status"] == "completed"
            assert result["contradictions_found"] == 2

    @pytest.mark.asyncio
    async def test_run_scan_with_section_filter(self):
        """Scan scoped to a specific section."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        scan_id = uuid4()
        running_row = _make_scan_row(id=scan_id, status="running", section_ref="m5.3.5.1")
        completed_row = _make_scan_row(id=scan_id, status="completed", section_ref="m5.3.5.1")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=[]):
            result = await scanner.run_scan(
                program_id=program_id, scan_type="section",
                section_ref="m5.3.5.1",
            )
            # detect_contradictions called with section_ref
            scanner.evidence_runner.detect_contradictions.assert_called_once_with(
                program_id, "m5.3.5.1",
            )

    @pytest.mark.asyncio
    async def test_run_scan_failure_records_error(self):
        """When detection fails, scan status → 'failed' with error message."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        scan_id = uuid4()
        running_row = _make_scan_row(id=scan_id, status="running")
        failed_row = _make_scan_row(id=scan_id, status="failed", error_message="DB timeout")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, failed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, side_effect=RuntimeError("DB timeout")):
            result = await scanner.run_scan(program_id=program_id)
            assert result["status"] == "failed"
            assert "DB timeout" in result["error_message"]

    @pytest.mark.asyncio
    async def test_run_scan_creates_running_record_first(self):
        """The first INSERT should be status='running'."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        running_row = _make_scan_row(status="running")
        completed_row = _make_scan_row(status="completed")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=[]):
            await scanner.run_scan(program_id=program_id)
            # First fetchrow call is INSERT_CONTRADICTION_SCAN
            from shadow_service import sql_evidence as sql
            first_call = mock_conn.fetchrow.call_args_list[0]
            assert first_call[0][0] == sql.INSERT_CONTRADICTION_SCAN
            # Status param should be "running"
            assert first_call[0][4] == "running"

    @pytest.mark.asyncio
    async def test_run_scan_counts_total_claims(self):
        """Total claims = sum of claim_count across contradiction groups."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        running_row = _make_scan_row(status="running")
        completed_row = _make_scan_row(status="completed", total_claims=7, contradictions_found=2)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        mock_contradictions = [
            {"entity_field": "AE:count", "claim_count": 3, "distinct_values": ["0", "2"],
             "claim_ids": [], "severity": "medium"},
            {"entity_field": "PK:cmax", "claim_count": 4, "distinct_values": ["10", "20"],
             "claim_ids": [], "severity": "medium"},
        ]

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=mock_contradictions):
            await scanner.run_scan(program_id=program_id)
            # UPDATE call should pass total_claims=7, contradictions_found=2
            from shadow_service import sql_evidence as sql
            update_call = mock_conn.fetchrow.call_args_list[1]
            assert update_call[0][0] == sql.UPDATE_CONTRADICTION_SCAN_COMPLETE
            assert update_call[0][2] == 7   # total_claims
            assert update_call[0][3] == 2   # contradictions_found

    @pytest.mark.asyncio
    async def test_run_scan_connection_always_released(self):
        """Connection is released even when scan fails."""
        from shadow_service import contradiction_scanner as scanner

        running_row = _make_scan_row(status="running")
        failed_row = _make_scan_row(status="failed")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, failed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        release_mock = AsyncMock()
        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", release_mock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, side_effect=RuntimeError("fail")):
            await scanner.run_scan(program_id=uuid4())
            release_mock.assert_called_once_with(mock_conn)


# =============================================================================
# 3) Scanner runner — get_scan + list_scans
# =============================================================================


class TestGetAndListScans:
    """Test scan retrieval functions."""

    @pytest.mark.asyncio
    async def test_get_scan_returns_dict(self):
        from shadow_service import contradiction_scanner as scanner

        scan_id = uuid4()
        program_id = uuid4()
        row = _make_scan_row(id=scan_id, program_id=program_id)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=row)
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.get_scan(scan_id, program_id)
            assert result["id"] == scan_id

    @pytest.mark.asyncio
    async def test_get_scan_not_found_returns_none(self):
        from shadow_service import contradiction_scanner as scanner

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.get_scan(uuid4(), uuid4())
            assert result is None

    @pytest.mark.asyncio
    async def test_list_scans_returns_list(self):
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        rows = [_make_scan_row(program_id=program_id) for _ in range(3)]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=rows)
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.list_scans(program_id)
            assert len(result) == 3

    @pytest.mark.asyncio
    async def test_list_scans_empty_program(self):
        from shadow_service import contradiction_scanner as scanner

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.list_scans(uuid4())
            assert result == []

    @pytest.mark.asyncio
    async def test_list_scans_passes_pagination(self):
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            await scanner.list_scans(program_id, limit=10, offset=5)
            from shadow_service import sql_evidence as sql
            mock_conn.fetch.assert_called_once_with(
                sql.SELECT_CONTRADICTION_SCANS_BY_PROGRAM,
                program_id, 10, 5,
            )


# =============================================================================
# 4) Router integration — scan endpoints
# =============================================================================


class TestScanEndpoints:
    """Test the contradiction-scans router endpoints."""

    def _get_client(self):
        """Create a TestClient for the evidence router."""
        os.environ["REVIEW_ADMIN_TOKEN"] = "test-token-scanner"
        from fastapi import FastAPI
        from shadow_service.router_evidence import router

        app = FastAPI()
        app.include_router(router)
        from fastapi.testclient import TestClient
        return TestClient(app)

    def test_post_contradiction_scan(self):
        """POST /evidence/contradiction-scans triggers a scan."""
        from shadow_service import contradiction_scanner as scanner

        scan_result = {
            "id": str(uuid4()),
            "program_id": str(uuid4()),
            "status": "completed",
            "total_claims": 5,
            "contradictions_found": 2,
            "results": "[]",
        }

        client = self._get_client()
        with patch.object(scanner, "run_scan",
                         new_callable=AsyncMock, return_value=scan_result):
            resp = client.post(
                "/evidence/contradiction-scans",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "test-token-scanner"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "completed"

    def test_post_scan_with_section(self):
        """POST /evidence/contradiction-scans with section_ref."""
        from shadow_service import contradiction_scanner as scanner

        scan_result = {"id": str(uuid4()), "status": "completed"}

        client = self._get_client()
        with patch.object(scanner, "run_scan",
                         new_callable=AsyncMock, return_value=scan_result):
            resp = client.post(
                "/evidence/contradiction-scans",
                params={
                    "program_id": str(uuid4()),
                    "scan_type": "section",
                    "section_ref": "m5.3.5.1",
                },
                headers={"X-Admin-Token": "test-token-scanner"},
            )
            assert resp.status_code == 200
            # Verify run_scan was called with section params
            call_kwargs = scanner.run_scan.call_args[1]
            assert call_kwargs["scan_type"] == "section"
            assert call_kwargs["section_ref"] == "m5.3.5.1"

    def test_post_scan_requires_auth(self):
        """POST /evidence/contradiction-scans without auth → 403."""
        client = self._get_client()
        resp = client.post(
            "/evidence/contradiction-scans",
            params={"program_id": str(uuid4())},
        )
        assert resp.status_code == 403

    def test_get_list_scans(self):
        """GET /evidence/contradiction-scans returns scan list."""
        from shadow_service import contradiction_scanner as scanner

        scans = [{"id": str(uuid4()), "status": "completed"} for _ in range(2)]

        client = self._get_client()
        with patch.object(scanner, "list_scans",
                         new_callable=AsyncMock, return_value=scans):
            resp = client.get(
                "/evidence/contradiction-scans",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "test-token-scanner"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 2
            assert len(data["scans"]) == 2

    def test_get_scan_by_id(self):
        """GET /evidence/contradiction-scans/{scan_id} returns specific scan."""
        from shadow_service import contradiction_scanner as scanner

        scan_id = uuid4()
        scan_data = {"id": str(scan_id), "status": "completed", "contradictions_found": 3}

        client = self._get_client()
        with patch.object(scanner, "get_scan",
                         new_callable=AsyncMock, return_value=scan_data):
            resp = client.get(
                f"/evidence/contradiction-scans/{scan_id}",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "test-token-scanner"},
            )
            assert resp.status_code == 200
            assert resp.json()["contradictions_found"] == 3

    def test_get_scan_not_found(self):
        """GET /evidence/contradiction-scans/{scan_id} → 404 when not found."""
        from shadow_service import contradiction_scanner as scanner

        client = self._get_client()
        with patch.object(scanner, "get_scan",
                         new_callable=AsyncMock, return_value=None):
            resp = client.get(
                f"/evidence/contradiction-scans/{uuid4()}",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "test-token-scanner"},
            )
            assert resp.status_code == 404


# =============================================================================
# 5) Migration structure
# =============================================================================


class TestScannerMigration:
    """Validate migration SQL structure and eCTD compliance."""

    @pytest.fixture
    def migration_sql(self):
        import os
        path = os.path.join(
            os.path.dirname(__file__), "..", "..",
            "db", "migrations", "20260206_phase5_contradiction_scanner.sql",
        )
        with open(path) as f:
            return f.read()

    def test_migration_has_ectd_header(self, migration_sql):
        assert "eCTD" in migration_sql

    def test_migration_has_regulatory_context(self, migration_sql):
        assert "21 CFR Part 11" in migration_sql

    def test_migration_creates_table(self, migration_sql):
        lower = migration_sql.lower()
        assert "create table" in lower
        assert "contradiction_scans" in lower

    def test_migration_has_program_id(self, migration_sql):
        assert "program_id" in migration_sql

    def test_migration_has_status_check(self, migration_sql):
        lower = migration_sql.lower()
        assert "'running'" in lower
        assert "'completed'" in lower
        assert "'failed'" in lower

    def test_migration_has_results_jsonb(self, migration_sql):
        upper = migration_sql.upper()
        assert "JSONB" in upper

    def test_migration_has_indexes(self, migration_sql):
        lower = migration_sql.lower()
        assert "create index" in lower
        assert "idx_contradiction_scans_program_status" in lower

    def test_migration_has_rls_policy(self, migration_sql):
        lower = migration_sql.lower()
        assert "row level security" in lower or "enable row level security" in lower

    def test_migration_is_idempotent(self, migration_sql):
        lower = migration_sql.lower()
        assert "if not exists" in lower


# =============================================================================
# 6) Edge cases
# =============================================================================


class TestScannerEdgeCases:
    """Edge cases for the contradiction scanner."""

    @pytest.mark.asyncio
    async def test_scan_zero_contradictions(self):
        """Scan completes with zero contradictions found."""
        from shadow_service import contradiction_scanner as scanner

        running_row = _make_scan_row(status="running")
        completed_row = _make_scan_row(
            status="completed", total_claims=0, contradictions_found=0,
            results="[]",
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=[]):
            result = await scanner.run_scan(program_id=uuid4())
            assert result["status"] == "completed"
            assert result["contradictions_found"] == 0

    @pytest.mark.asyncio
    async def test_scan_triggered_by_a8(self):
        """Scan triggered by A8 nightly records triggered_by='a8_nightly'."""
        from shadow_service import contradiction_scanner as scanner

        running_row = _make_scan_row(status="running", triggered_by="a8_nightly")
        completed_row = _make_scan_row(status="completed", triggered_by="a8_nightly")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=[]):
            await scanner.run_scan(
                program_id=uuid4(), triggered_by="a8_nightly",
            )
            from shadow_service import sql_evidence as sql
            insert_call = mock_conn.fetchrow.call_args_list[0]
            # triggered_by is $8
            assert insert_call[0][8] == "a8_nightly"

    @pytest.mark.asyncio
    async def test_scan_rls_set_before_queries(self):
        """RLS context is set at the start of scan."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        running_row = _make_scan_row(status="running")
        completed_row = _make_scan_row(status="completed")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=[]):
            await scanner.run_scan(program_id=program_id)
            from shadow_service import sql_evidence as sql
            mock_conn.execute.assert_called_with(
                sql.SET_PROGRAM_CONTEXT, str(program_id),
            )

    @pytest.mark.asyncio
    async def test_scan_results_serialized_as_json(self):
        """Results passed to UPDATE are JSON-serialized."""
        from shadow_service import contradiction_scanner as scanner

        running_row = _make_scan_row(status="running")
        completed_row = _make_scan_row(status="completed")
        contradiction = {
            "entity_field": "AE:count", "claim_count": 2,
            "distinct_values": ["0", "5"], "claim_ids": [], "severity": "medium",
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[running_row, completed_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(scanner.evidence_runner, "detect_contradictions",
                         new_callable=AsyncMock, return_value=[contradiction]):
            await scanner.run_scan(program_id=uuid4())
            from shadow_service import sql_evidence as sql
            update_call = mock_conn.fetchrow.call_args_list[1]
            results_arg = update_call[0][4]  # $4 is results JSON
            parsed = json.loads(results_arg)
            assert len(parsed) == 1
            assert parsed[0]["entity_field"] == "AE:count"


# =============================================================================
# 7) Health Summary — aggregated dashboard data
# =============================================================================


class TestHealthSummary:
    """Test health_summary() aggregation logic."""

    def _make_claims_rows(self):
        return [
            FakeRecord({"status": "active", "cnt": 12}),
            FakeRecord({"status": "superseded", "cnt": 3}),
        ]

    def _make_scans_rows(self):
        return [
            FakeRecord({"status": "completed", "cnt": 5}),
            FakeRecord({"status": "failed", "cnt": 1}),
        ]

    @pytest.mark.asyncio
    async def test_health_summary_with_scan(self):
        """Returns full summary when a completed scan exists."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        scan_row = _make_scan_row(
            program_id=program_id,
            total_claims=8,
            contradictions_found=2,
            results=json.dumps([
                {"entity": "AE", "field": "count", "claim_count": 3, "values": ["0", "2"]},
                {"entity": "PK", "field": "cmax", "claim_count": 2, "values": ["10", "20"]},
            ]),
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[
            scan_row,                                   # SELECT_LATEST_COMPLETED_SCAN
            FakeRecord({"cnt": 7}),                     # COUNT_SOURCES
            FakeRecord({"cnt": 15}),                    # COUNT_PROVENANCE_ENTRIES
        ])
        mock_conn.fetch = AsyncMock(side_effect=[
            self._make_claims_rows(),                   # COUNT_CLAIMS_BY_STATUS
            self._make_scans_rows(),                    # COUNT_SCANS_BY_STATUS
        ])
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.health_summary(program_id)

        assert result["program_id"] == str(program_id)
        assert result["latest_scan"] is not None
        assert "results" not in result["latest_scan"]   # stripped from summary
        assert result["claims"] == {"active": 12, "superseded": 3}
        assert result["sources_count"] == 7
        assert result["provenance_count"] == 15
        assert result["scans"] == {"completed": 5, "failed": 1}
        assert len(result["top_contradictions"]) == 2
        assert result["top_contradictions"][0]["entity"] == "AE"

    @pytest.mark.asyncio
    async def test_health_summary_no_scans(self):
        """Returns clean empty state when no scans exist."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[
            None,                                       # No completed scan
            FakeRecord({"cnt": 0}),                     # COUNT_SOURCES
            FakeRecord({"cnt": 0}),                     # COUNT_PROVENANCE_ENTRIES
        ])
        mock_conn.fetch = AsyncMock(side_effect=[
            [],                                         # No claims
            [],                                         # No scans
        ])
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.health_summary(program_id)

        assert result["latest_scan"] is None
        assert result["claims"] == {}
        assert result["sources_count"] == 0
        assert result["provenance_count"] == 0
        assert result["scans"] == {}
        assert result["top_contradictions"] == []

    @pytest.mark.asyncio
    async def test_health_summary_caps_contradictions_at_five(self):
        """Only the top 5 contradictions are returned."""
        from shadow_service import contradiction_scanner as scanner

        program_id = uuid4()
        ten_contradictions = [
            {"entity": f"E{i}", "field": "f", "claim_count": 10 - i, "values": ["a", "b"]}
            for i in range(10)
        ]
        scan_row = _make_scan_row(
            program_id=program_id,
            results=json.dumps(ten_contradictions),
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[
            scan_row,
            FakeRecord({"cnt": 0}),
            FakeRecord({"cnt": 0}),
        ])
        mock_conn.fetch = AsyncMock(side_effect=[[], []])
        mock_conn.execute = AsyncMock()

        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", new_callable=AsyncMock):
            result = await scanner.health_summary(program_id)

        assert len(result["top_contradictions"]) == 5

    @pytest.mark.asyncio
    async def test_health_summary_connection_always_released(self):
        """Connection is released even when health_summary fails."""
        from shadow_service import contradiction_scanner as scanner

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=RuntimeError("DB down"))

        release_mock = AsyncMock()
        with patch.object(scanner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(scanner.db, "release_connection", release_mock):
            with pytest.raises(RuntimeError, match="DB down"):
                await scanner.health_summary(uuid4())
            release_mock.assert_called_once_with(mock_conn)


# =============================================================================
# 8) Health Summary SQL structure
# =============================================================================


class TestHealthSummarySQL:
    """Validate SQL query strings for health summary."""

    def test_latest_scan_query_exists(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.SELECT_LATEST_COMPLETED_SCAN, str)
        assert "completed" in sql.SELECT_LATEST_COMPLETED_SCAN.lower()
        assert "LIMIT" in sql.SELECT_LATEST_COMPLETED_SCAN.upper()

    def test_count_claims_by_status_exists(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.COUNT_CLAIMS_BY_STATUS, str)
        assert "GROUP BY" in sql.COUNT_CLAIMS_BY_STATUS.upper()
        assert "status" in sql.COUNT_CLAIMS_BY_STATUS.lower()

    def test_count_sources_exists(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.COUNT_SOURCES, str)
        assert "count" in sql.COUNT_SOURCES.lower()

    def test_count_provenance_exists(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.COUNT_PROVENANCE_ENTRIES, str)
        assert "count" in sql.COUNT_PROVENANCE_ENTRIES.lower()

    def test_count_scans_by_status_exists(self):
        from shadow_service import sql_evidence as sql
        assert isinstance(sql.COUNT_SCANS_BY_STATUS, str)
        assert "GROUP BY" in sql.COUNT_SCANS_BY_STATUS.upper()


# =============================================================================
# 9) Health Summary endpoint
# =============================================================================


class TestHealthSummaryEndpoint:
    """Test the GET /evidence/health-summary router endpoint."""

    def _get_client(self):
        os.environ["REVIEW_ADMIN_TOKEN"] = "test-token-scanner"
        from fastapi import FastAPI
        from shadow_service.router_evidence import router

        app = FastAPI()
        app.include_router(router)
        from fastapi.testclient import TestClient
        return TestClient(app)

    def test_get_health_summary_success(self):
        """GET /evidence/health-summary returns aggregated data."""
        from shadow_service import contradiction_scanner as scanner

        summary = {
            "program_id": str(uuid4()),
            "latest_scan": None,
            "claims": {"active": 5},
            "sources_count": 3,
            "provenance_count": 10,
            "scans": {"completed": 2},
            "top_contradictions": [],
        }

        client = self._get_client()
        with patch.object(scanner, "health_summary",
                         new_callable=AsyncMock, return_value=summary):
            resp = client.get(
                "/evidence/health-summary",
                params={"program_id": str(uuid4())},
                headers={"X-Admin-Token": "test-token-scanner"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["claims"] == {"active": 5}
            assert data["sources_count"] == 3
            assert data["top_contradictions"] == []

    def test_get_health_summary_requires_program_id(self):
        """GET /evidence/health-summary without program_id → 422."""
        client = self._get_client()
        resp = client.get(
            "/evidence/health-summary",
            headers={"X-Admin-Token": "test-token-scanner"},
        )
        assert resp.status_code == 422
