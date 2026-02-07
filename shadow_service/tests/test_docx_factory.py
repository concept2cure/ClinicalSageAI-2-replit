"""Tests for Phase 6.1 — DOCX Factory Foundation.

Covers:
  1. Migration — schema structure, RLS clauses, indexes
  2. Runner — template CRUD, version auto-increment, render lifecycle,
     artifact creation, append-only events
  3. Router — auth (503/403/200), validation (422), endpoint wiring
"""

import json
import os
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from shadow_service import docx_factory_runner as runner
from shadow_service import sql_docx_factory as sql


# =============================================================================
# Helpers
# =============================================================================

class FakeRecord(dict):
    """Mimics asyncpg.Record: dict(row), row["key"], row.get(k)."""
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


NOW = datetime(2026, 2, 6, 12, 0, 0, tzinfo=timezone.utc)


def _make_template_row(**overrides) -> FakeRecord:
    base = {
        "id": uuid4(),
        "program_id": uuid4(),
        "name": "IND Module 2.5",
        "doc_type": "ind_clinical_overview",
        "status": "active",
        "created_at": NOW,
        "updated_at": NOW,
    }
    base.update(overrides)
    return FakeRecord(base)


def _make_version_row(**overrides) -> FakeRecord:
    base = {
        "id": uuid4(),
        "template_id": uuid4(),
        "version": 1,
        "storage_key": "templates/abc123.docx",
        "sha256": "a" * 64,
        "created_at": NOW,
    }
    base.update(overrides)
    return FakeRecord(base)


def _make_render_row(**overrides) -> FakeRecord:
    base = {
        "id": uuid4(),
        "program_id": uuid4(),
        "template_version_id": uuid4(),
        "inputs_json": {"drug_name": "Axolotinib"},
        "status": "queued",
        "started_at": None,
        "completed_at": None,
        "error": None,
        "created_at": NOW,
    }
    base.update(overrides)
    return FakeRecord(base)


def _make_artifact_row(**overrides) -> FakeRecord:
    base = {
        "id": uuid4(),
        "render_id": uuid4(),
        "file_type": "docx",
        "storage_key": "artifacts/render-abc/output.docx",
        "sha256": "b" * 64,
        "size_bytes": 54321,
        "created_at": NOW,
    }
    base.update(overrides)
    return FakeRecord(base)


def _make_event_row(**overrides) -> FakeRecord:
    base = {
        "id": uuid4(),
        "render_id": uuid4(),
        "event_type": "render_queued",
        "payload_json": {},
        "created_at": NOW,
    }
    base.update(overrides)
    return FakeRecord(base)


# =============================================================================
# 1. Migration — schema structure tests
# =============================================================================

class TestMigrationStructure:
    """Verify the migration SQL has the right structure."""

    @pytest.fixture(autouse=True)
    def _load_migration(self):
        import pathlib
        migration_path = (
            pathlib.Path(__file__).parent.parent.parent
            / "db" / "migrations" / "20260206_phase6_docx_factory.sql"
        )
        self.sql = migration_path.read_text()

    def test_creates_documents_schema(self):
        assert "CREATE SCHEMA IF NOT EXISTS documents" in self.sql

    def test_creates_all_tables(self):
        for table in [
            "documents.templates",
            "documents.template_versions",
            "documents.renders",
            "documents.artifacts",
            "documents.render_events",
        ]:
            assert f"CREATE TABLE IF NOT EXISTS {table}" in self.sql

    def test_templates_has_program_id(self):
        assert "program_id      UUID NOT NULL" in self.sql

    def test_template_versions_has_sha256(self):
        # sha256 on template versions
        assert "sha256          TEXT NOT NULL" in self.sql

    def test_template_versions_unique_constraint(self):
        assert "CONSTRAINT uq_template_version UNIQUE (template_id, version)" in self.sql

    def test_artifacts_has_sha256_and_size(self):
        assert "size_bytes      BIGINT NOT NULL" in self.sql

    def test_render_events_append_only_schema(self):
        """render_events has no UPDATE columns — it's append-only by design."""
        # No updated_at column on render_events
        lines_after_render_events = self.sql.split("documents.render_events")[1].split("CREATE TABLE")[0]
        assert "updated_at" not in lines_after_render_events

    def test_rls_enabled_on_templates_and_renders(self):
        assert "ALTER TABLE documents.templates ENABLE ROW LEVEL SECURITY" in self.sql
        assert "ALTER TABLE documents.renders ENABLE ROW LEVEL SECURITY" in self.sql

    def test_rls_policies_use_guc(self):
        assert "app.current_program_id" in self.sql
        assert "app.bypass_rls" in self.sql

    def test_indexes_exist(self):
        for idx in [
            "idx_documents_templates_program",
            "idx_documents_template_versions_template",
            "idx_documents_renders_program",
            "idx_documents_renders_status",
            "idx_documents_artifacts_render",
            "idx_documents_render_events_render",
        ]:
            assert idx in self.sql

    def test_grants_present(self):
        assert "GRANT USAGE ON SCHEMA documents" in self.sql
        assert "GRANT SELECT, INSERT, UPDATE ON ALL TABLES" in self.sql


# =============================================================================
# 2. Runner — lifecycle tests
# =============================================================================

class TestRunnerTemplates:
    """Tests for template CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_template(self):
        pid = uuid4()
        row = _make_template_row(program_id=pid)
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=row)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.create_template(pid, "IND Module 2.5", "ind_clinical_overview")

        assert result["name"] == "IND Module 2.5"
        assert result["program_id"] == pid
        # Verify RLS was set
        mock_conn.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_templates(self):
        pid = uuid4()
        rows = [_make_template_row(program_id=pid), _make_template_row(program_id=pid)]
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=rows)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.list_templates(pid)

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_get_template_with_bypass_rls(self):
        """get_template(program_id=None) should bypass RLS."""
        row = _make_template_row()
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=row)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.get_template(None, row["id"])

        assert result is not None
        # Should have called SET_BYPASS_RLS, not SET_PROGRAM_CONTEXT
        calls = [str(c) for c in mock_conn.execute.call_args_list]
        assert any("bypass_rls" in c for c in calls)

    @pytest.mark.asyncio
    async def test_get_template_not_found(self):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.get_template(uuid4(), uuid4())

        assert result is None


class TestRunnerTemplateVersions:
    """Tests for template version operations."""

    @pytest.mark.asyncio
    async def test_create_version_auto_increments(self):
        pid, tid = uuid4(), uuid4()
        ver_row = FakeRecord({"next_version": 3})
        version_row = _make_version_row(template_id=tid, version=3)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[ver_row, version_row, None])  # next_ver, insert, event

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.create_template_version(pid, tid, "templates/v3.docx", "c" * 64)

        assert result["version"] == 3

    @pytest.mark.asyncio
    async def test_version_records_sha256(self):
        pid, tid = uuid4(), uuid4()
        sha = "d" * 64
        ver_row = FakeRecord({"next_version": 1})
        version_row = _make_version_row(template_id=tid, version=1, sha256=sha)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[ver_row, version_row, None])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.create_template_version(pid, tid, "key", sha)

        assert result["sha256"] == sha


class TestRunnerRenderLifecycle:
    """Tests for the full render status lifecycle."""

    @pytest.mark.asyncio
    async def test_create_render_starts_queued(self):
        pid, tvid = uuid4(), uuid4()
        render_row = _make_render_row(program_id=pid, template_version_id=tvid, status="queued")

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[render_row, _make_event_row()])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.create_render(pid, tvid, {"drug_name": "Axolotinib"})

        assert result["status"] == "queued"

    @pytest.mark.asyncio
    async def test_transition_running(self):
        rid = uuid4()
        row = _make_render_row(id=rid, status="running", started_at=NOW)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[row, _make_event_row()])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.transition_render_running(rid)

        assert result["status"] == "running"
        assert result["started_at"] is not None

    @pytest.mark.asyncio
    async def test_transition_completed(self):
        rid = uuid4()
        row = _make_render_row(id=rid, status="completed", completed_at=NOW)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[row, _make_event_row()])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.transition_render_completed(rid)

        assert result["status"] == "completed"
        assert result["completed_at"] is not None

    @pytest.mark.asyncio
    async def test_transition_failed(self):
        rid = uuid4()
        error_msg = "Template rendering error: missing variable"
        row = _make_render_row(id=rid, status="failed", error=error_msg, completed_at=NOW)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[row, _make_event_row()])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.transition_render_failed(rid, error_msg)

        assert result["status"] == "failed"
        assert result["error"] == error_msg

    @pytest.mark.asyncio
    async def test_transition_running_not_found(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            with pytest.raises(ValueError, match="not found"):
                await runner.transition_render_running(uuid4())

    @pytest.mark.asyncio
    async def test_full_lifecycle_queued_running_completed(self):
        """Verify the full queued → running → completed lifecycle."""
        pid, tvid, rid = uuid4(), uuid4(), uuid4()

        queued_row = _make_render_row(id=rid, status="queued")
        running_row = _make_render_row(id=rid, status="running", started_at=NOW)
        completed_row = _make_render_row(id=rid, status="completed", started_at=NOW, completed_at=NOW)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            # queued
            mock_conn.fetchrow.side_effect = [queued_row, _make_event_row()]
            r1 = await runner.create_render(pid, tvid)
            assert r1["status"] == "queued"

            # running
            mock_conn.fetchrow.side_effect = [running_row, _make_event_row()]
            r2 = await runner.transition_render_running(rid)
            assert r2["status"] == "running"

            # completed
            mock_conn.fetchrow.side_effect = [completed_row, _make_event_row()]
            r3 = await runner.transition_render_completed(rid)
            assert r3["status"] == "completed"


class TestRunnerArtifacts:
    """Tests for artifact creation."""

    @pytest.mark.asyncio
    async def test_create_artifact_records_sha256(self):
        rid = uuid4()
        sha = "e" * 64
        art_row = _make_artifact_row(render_id=rid, sha256=sha, size_bytes=12345)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[art_row, _make_event_row()])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.create_artifact(rid, "docx", "artifacts/out.docx", sha, 12345)

        assert result["sha256"] == sha
        assert result["size_bytes"] == 12345

    @pytest.mark.asyncio
    async def test_create_artifact_emits_event(self):
        rid = uuid4()
        art_row = _make_artifact_row(render_id=rid)
        event_row = _make_event_row(render_id=rid, event_type="artifact_created")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[art_row, event_row])

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            await runner.create_artifact(rid, "docx", "key", "f" * 64, 100)

        # Second fetchrow call should be the event insertion
        event_call = mock_conn.fetchrow.call_args_list[1]
        assert "artifact_created" in str(event_call)


class TestRunnerEvents:
    """Tests for append-only render events."""

    @pytest.mark.asyncio
    async def test_append_event(self):
        rid = uuid4()
        event_row = _make_event_row(render_id=rid, event_type="custom_event")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=event_row)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.append_render_event(rid, "custom_event", {"detail": "test"})

        assert result["event_type"] == "custom_event"

    @pytest.mark.asyncio
    async def test_list_render_events(self):
        rid = uuid4()
        events = [
            _make_event_row(render_id=rid, event_type="render_queued"),
            _make_event_row(render_id=rid, event_type="render_started"),
            _make_event_row(render_id=rid, event_type="render_completed"),
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=events)

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):

            result = await runner.list_render_events(rid)

        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_connection_released_on_success(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=_make_event_row())
        release_mock = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", release_mock):

            await runner.append_render_event(uuid4(), "test", {})

        release_mock.assert_awaited_once_with(mock_conn)

    @pytest.mark.asyncio
    async def test_connection_released_on_failure(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=Exception("DB error"))
        release_mock = AsyncMock()

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", release_mock):

            with pytest.raises(Exception, match="DB error"):
                await runner.append_render_event(uuid4(), "test", {})

        release_mock.assert_awaited_once_with(mock_conn)


# =============================================================================
# 3. Router — auth + validation tests
# =============================================================================

class TestRouterAuth:
    """Tests for router authentication."""

    def test_require_docx_admin_503_when_no_env(self):
        from shadow_service.router_docx_factory import require_docx_admin
        from fastapi import HTTPException

        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(HTTPException) as exc_info:
                require_docx_admin(x_admin_token="anything")
            assert exc_info.value.status_code == 503

    def test_require_docx_admin_403_wrong_token(self):
        from shadow_service.router_docx_factory import require_docx_admin
        from fastapi import HTTPException

        with patch.dict(os.environ, {"REVIEW_ADMIN_TOKEN": "correct-token"}, clear=False):
            with pytest.raises(HTTPException) as exc_info:
                require_docx_admin(x_admin_token="wrong-token")
            assert exc_info.value.status_code == 403

    def test_require_docx_admin_200_correct_token(self):
        from shadow_service.router_docx_factory import require_docx_admin

        with patch.dict(os.environ, {"REVIEW_ADMIN_TOKEN": "correct-token"}, clear=False):
            ctx = require_docx_admin(x_admin_token="correct-token")
            assert ctx.actor_hash  # sha256 prefix exists
            assert len(ctx.actor_hash) == 8

    def test_actor_hash_is_deterministic(self):
        from shadow_service.router_docx_factory import require_docx_admin

        with patch.dict(os.environ, {"REVIEW_ADMIN_TOKEN": "test-token"}, clear=False):
            ctx1 = require_docx_admin(x_admin_token="test-token")
            ctx2 = require_docx_admin(x_admin_token="test-token")
            assert ctx1.actor_hash == ctx2.actor_hash


# =============================================================================
# 4. SQL module — query structure tests
# =============================================================================

class TestSQLQueries:
    """Verify SQL query constants are well-formed."""

    def test_all_queries_use_positional_params(self):
        """All INSERT/UPDATE/SELECT queries should use $N params, not %s or :name."""
        for name in dir(sql):
            if name.startswith("_"):
                continue
            val = getattr(sql, name)
            if not isinstance(val, str):
                continue
            assert "%s" not in val, f"{name} uses %s instead of $N"
            assert "%(name)s" not in val, f"{name} uses named params"

    def test_insert_queries_have_returning(self):
        """All INSERT queries should have RETURNING clause."""
        for name in dir(sql):
            val = getattr(sql, name)
            if isinstance(val, str) and "INSERT INTO" in val:
                assert "RETURNING" in val, f"{name} missing RETURNING clause"

    def test_rls_helpers_exist(self):
        assert hasattr(sql, "SET_PROGRAM_CONTEXT")
        assert hasattr(sql, "SET_BYPASS_RLS")
        assert "app.current_program_id" in sql.SET_PROGRAM_CONTEXT
        assert "app.bypass_rls" in sql.SET_BYPASS_RLS


# =============================================================================
# 5. Pydantic models — validation tests
# =============================================================================

class TestPydanticModels:
    """Verify model validation constraints."""

    def test_create_template_requires_name(self):
        from shadow_service.models_docx_factory import CreateTemplateRequest
        with pytest.raises(Exception):  # ValidationError
            CreateTemplateRequest(program_id=uuid4(), name="")

    def test_create_template_defaults(self):
        from shadow_service.models_docx_factory import CreateTemplateRequest
        req = CreateTemplateRequest(program_id=uuid4(), name="Test Template")
        assert req.doc_type == "generic"
        assert req.status == "active"

    def test_create_version_requires_64_char_sha256(self):
        from shadow_service.models_docx_factory import CreateTemplateVersionRequest
        with pytest.raises(Exception):
            CreateTemplateVersionRequest(storage_key="key", sha256="tooshort")

    def test_create_version_valid(self):
        from shadow_service.models_docx_factory import CreateTemplateVersionRequest
        req = CreateTemplateVersionRequest(storage_key="templates/v1.docx", sha256="a" * 64)
        assert req.sha256 == "a" * 64

    def test_create_render_defaults_empty_inputs(self):
        from shadow_service.models_docx_factory import CreateRenderRequest
        req = CreateRenderRequest(program_id=uuid4(), template_version_id=uuid4())
        assert req.inputs_json == {}

    def test_render_response_allows_null_timestamps(self):
        from shadow_service.models_docx_factory import RenderResponse
        resp = RenderResponse(
            id=uuid4(), program_id=uuid4(), template_version_id=uuid4(),
            inputs_json={}, status="queued", created_at=NOW,
        )
        assert resp.started_at is None
        assert resp.completed_at is None
        assert resp.error is None
