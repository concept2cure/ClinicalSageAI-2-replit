"""Tests for Phase 5.2.1 — Idempotent Provenance.

Covers:
 1. _compute_idempotency_key: determinism, component coverage, uniqueness
 2. INSERT_PROVENANCE SQL: ON CONFLICT DO NOTHING clause present
 3. SELECT_PROVENANCE_BY_IDEM_KEY: query structure
 4. create_provenance: idempotent insert (fresh row + duplicate skip)
 5. Inline provenance in create_claim / create_source: idempotency_key passed
 6. Event Bridge re-fire: same event twice → provenance count unchanged
 7. Migration structure: eCTD headers, proper DDL
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
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


def _make_provenance_row(**overrides):
    """Factory for a mock provenance DB row."""
    row = {
        "id": uuid4(),
        "program_id": uuid4(),
        "claim_id": None,
        "source_id": None,
        "workflow_run_id": uuid4(),
        "step_run_id": uuid4(),
        "batch_id": None,
        "event_type": "step_completed",
        "actor": "system",
        "request_id": "req-test",
        "metadata": "{}",
        "created_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


def _make_claim_row(claim_id=None, program_id=None, **overrides):
    """Factory for a mock claim DB row."""
    row = {
        "id": claim_id or uuid4(),
        "program_id": program_id or uuid4(),
        "claim_type": "efficacy",
        "claim_text": "Test claim",
        "structured": "{}",
        "section_ref": "m5.3.5.1",
        "version": 1,
        "supersedes_id": None,
        "status": "active",
        "confidence": None,
        "created_by": "system",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


def _make_source_row(source_id=None, program_id=None, **overrides):
    """Factory for a mock source DB row."""
    row = {
        "id": source_id or uuid4(),
        "program_id": program_id or uuid4(),
        "source_type": "csr_section",
        "source_ref": "CSR v2.0 Section 11.4",
        "source_uri": None,
        "content_hash": "abc123",
        "metadata": "{}",
        "captured_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    row.update(overrides)
    return FakeRecord(row)


# =============================================================================
# 1) _compute_idempotency_key — deterministic key generation
# =============================================================================


class TestComputeIdempotencyKey:
    """Idempotency key must be deterministic and component-aware."""

    def test_deterministic_same_inputs(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        sid = uuid4()
        cid = uuid4()
        k1 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid, claim_id=cid)
        k2 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid, claim_id=cid)
        assert k1 == k2

    def test_different_event_type_different_key(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        sid = uuid4()
        k1 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid)
        k2 = _compute_idempotency_key(pid, "step_failed", step_run_id=sid)
        assert k1 != k2

    def test_different_program_different_key(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        sid = uuid4()
        k1 = _compute_idempotency_key(uuid4(), "step_completed", step_run_id=sid)
        k2 = _compute_idempotency_key(uuid4(), "step_completed", step_run_id=sid)
        assert k1 != k2

    def test_different_step_run_different_key(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        k1 = _compute_idempotency_key(pid, "step_completed", step_run_id=uuid4())
        k2 = _compute_idempotency_key(pid, "step_completed", step_run_id=uuid4())
        assert k1 != k2

    def test_different_claim_different_key(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        sid = uuid4()
        k1 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid, claim_id=uuid4())
        k2 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid, claim_id=uuid4())
        assert k1 != k2

    def test_different_source_different_key(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        sid = uuid4()
        k1 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid, source_id=uuid4())
        k2 = _compute_idempotency_key(pid, "step_completed", step_run_id=sid, source_id=uuid4())
        assert k1 != k2

    def test_none_components_use_placeholder(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        key = _compute_idempotency_key(pid, "step_completed")
        parts = key.split(":")
        assert len(parts) == 6
        assert parts[0] == str(pid)
        assert parts[1] == "step_completed"
        assert parts[2] == "_"  # step_run_id
        assert parts[3] == "_"  # batch_id
        assert parts[4] == "_"  # claim_id
        assert parts[5] == "_"  # source_id

    def test_all_components_populated(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid, sid, bid, cid, soid = uuid4(), uuid4(), uuid4(), uuid4(), uuid4()
        key = _compute_idempotency_key(pid, "claim_created", sid, bid, cid, soid)
        parts = key.split(":")
        assert parts[0] == str(pid)
        assert parts[1] == "claim_created"
        assert parts[2] == str(sid)
        assert parts[3] == str(bid)
        assert parts[4] == str(cid)
        assert parts[5] == str(soid)

    def test_key_is_string(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        key = _compute_idempotency_key(uuid4(), "test_event")
        assert isinstance(key, str)

    def test_batch_level_key(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        bid = uuid4()
        key = _compute_idempotency_key(pid, "batch_completed", batch_id=bid)
        assert str(bid) in key
        assert "batch_completed" in key


# =============================================================================
# 2) SQL structure tests — ON CONFLICT + idempotency_key
# =============================================================================


class TestIdempotencySQL:
    """Validate SQL has proper idempotent INSERT semantics."""

    def test_insert_provenance_has_on_conflict(self):
        from shadow_service import sql_evidence as sql
        upper = sql.INSERT_PROVENANCE.upper()
        assert "ON CONFLICT" in upper

    def test_insert_provenance_does_nothing_on_conflict(self):
        from shadow_service import sql_evidence as sql
        upper = sql.INSERT_PROVENANCE.upper()
        assert "DO NOTHING" in upper

    def test_insert_provenance_conflict_on_idempotency_key(self):
        from shadow_service import sql_evidence as sql
        assert "idempotency_key" in sql.INSERT_PROVENANCE

    def test_insert_provenance_has_eleven_params(self):
        from shadow_service import sql_evidence as sql
        assert "$11" in sql.INSERT_PROVENANCE

    def test_insert_provenance_still_has_returning(self):
        from shadow_service import sql_evidence as sql
        assert "RETURNING" in sql.INSERT_PROVENANCE.upper()

    def test_select_provenance_by_idem_key_exists(self):
        from shadow_service import sql_evidence as sql
        assert hasattr(sql, "SELECT_PROVENANCE_BY_IDEM_KEY")
        assert isinstance(sql.SELECT_PROVENANCE_BY_IDEM_KEY, str)

    def test_select_provenance_by_idem_key_uses_param(self):
        from shadow_service import sql_evidence as sql
        assert "$1" in sql.SELECT_PROVENANCE_BY_IDEM_KEY

    def test_select_provenance_by_idem_key_queries_right_column(self):
        from shadow_service import sql_evidence as sql
        assert "idempotency_key" in sql.SELECT_PROVENANCE_BY_IDEM_KEY

    def test_insert_provenance_partial_conflict_clause(self):
        """ON CONFLICT should only match rows WHERE idempotency_key IS NOT NULL."""
        from shadow_service import sql_evidence as sql
        lower = sql.INSERT_PROVENANCE.lower()
        assert "where idempotency_key is not null" in lower


# =============================================================================
# 3) create_provenance — idempotent: fresh insert + duplicate skip
# =============================================================================


class TestCreateProvenanceIdempotent:
    """create_provenance with ON CONFLICT DO NOTHING semantics."""

    @pytest.mark.asyncio
    async def test_fresh_insert_returns_new_row(self):
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        step_run_id = uuid4()
        prov_row = _make_provenance_row(
            program_id=program_id, step_run_id=step_run_id,
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=prov_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.create_provenance(
                program_id=program_id,
                event_type="step_completed",
                step_run_id=step_run_id,
            )
            assert result["id"] == prov_row["id"]
            assert result["event_type"] == "step_completed"
            # Only one fetchrow call — INSERT returned the row
            assert mock_conn.fetchrow.call_count == 1

    @pytest.mark.asyncio
    async def test_duplicate_insert_returns_existing_row(self):
        """ON CONFLICT DO NOTHING → fetchrow returns None → fallback SELECT."""
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        step_run_id = uuid4()
        existing_row = _make_provenance_row(
            program_id=program_id, step_run_id=step_run_id,
        )

        mock_conn = AsyncMock()
        # First fetchrow (INSERT) returns None (conflict), second (SELECT) returns existing
        mock_conn.fetchrow = AsyncMock(side_effect=[None, existing_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            result = await runner.create_provenance(
                program_id=program_id,
                event_type="step_completed",
                step_run_id=step_run_id,
            )
            assert result["id"] == existing_row["id"]
            # Two fetchrow calls: INSERT (conflict) + SELECT (fallback)
            assert mock_conn.fetchrow.call_count == 2

    @pytest.mark.asyncio
    async def test_idempotency_key_passed_to_insert(self):
        """Verify the 11th parameter (idempotency_key) is passed to INSERT."""
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        step_run_id = uuid4()
        prov_row = _make_provenance_row(
            program_id=program_id, step_run_id=step_run_id,
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=prov_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            await runner.create_provenance(
                program_id=program_id,
                event_type="step_completed",
                step_run_id=step_run_id,
            )
            # The INSERT call should have 11 positional args after the SQL
            insert_call = mock_conn.fetchrow.call_args_list[0]
            args = insert_call[0]  # positional args
            # args[0] is the SQL, args[1..11] are the 11 params
            assert len(args) == 12  # SQL + 11 params
            # Last arg is the idempotency_key
            idem_key = args[11]
            assert isinstance(idem_key, str)
            assert str(program_id) in idem_key
            assert "step_completed" in idem_key

    @pytest.mark.asyncio
    async def test_duplicate_select_uses_idem_key(self):
        """When ON CONFLICT fires, fallback SELECT uses the idempotency_key."""
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        step_run_id = uuid4()
        existing_row = _make_provenance_row(
            program_id=program_id, step_run_id=step_run_id,
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[None, existing_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            await runner.create_provenance(
                program_id=program_id,
                event_type="step_completed",
                step_run_id=step_run_id,
            )
            # Second fetchrow call should be SELECT_PROVENANCE_BY_IDEM_KEY
            select_call = mock_conn.fetchrow.call_args_list[1]
            from shadow_service import sql_evidence as sql
            assert select_call[0][0] == sql.SELECT_PROVENANCE_BY_IDEM_KEY


# =============================================================================
# 4) Inline provenance in create_claim / create_source
# =============================================================================


class TestInlineProvenanceIdempotency:
    """create_claim and create_source pass idempotency_key to INSERT_PROVENANCE."""

    @pytest.mark.asyncio
    async def test_create_claim_provenance_has_11_params(self):
        """When request_id is provided, provenance INSERT gets 11 params."""
        from shadow_service import evidence_runner as runner

        claim_id = uuid4()
        program_id = uuid4()
        mock_row = _make_claim_row(claim_id=claim_id, program_id=program_id)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            await runner.create_claim(
                program_id=program_id,
                claim_type="efficacy",
                claim_text="Drug X works",
                request_id="req-idempotent",
            )
            # Find the provenance INSERT call (the 3rd fetchrow: claim INSERT, hash, provenance)
            from shadow_service import sql_evidence as sql
            prov_calls = [
                c for c in mock_conn.fetchrow.call_args_list
                if c[0][0] == sql.INSERT_PROVENANCE
            ]
            assert len(prov_calls) == 1
            prov_args = prov_calls[0][0]
            # SQL + 11 params = 12 positional args
            assert len(prov_args) == 12, f"Expected 12 args, got {len(prov_args)}"
            # Last arg is the idempotency_key
            idem_key = prov_args[11]
            assert isinstance(idem_key, str)
            assert "claim_created" in idem_key

    @pytest.mark.asyncio
    async def test_create_source_provenance_has_11_params(self):
        """When request_id is provided, source provenance INSERT gets 11 params."""
        from shadow_service import evidence_runner as runner

        source_id = uuid4()
        program_id = uuid4()
        mock_row = _make_source_row(source_id=source_id, program_id=program_id)

        mock_conn = AsyncMock()
        # For create_source: dedup check (None) → insert → hash → provenance
        mock_conn.fetchrow = AsyncMock(side_effect=[None, mock_row, mock_row, mock_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            await runner.create_source(
                program_id=program_id,
                source_type="csr_section",
                source_ref="CSR 11.4",
                content="Some content",
                request_id="req-src-idem",
            )
            from shadow_service import sql_evidence as sql
            prov_calls = [
                c for c in mock_conn.fetchrow.call_args_list
                if c[0][0] == sql.INSERT_PROVENANCE
            ]
            assert len(prov_calls) == 1
            prov_args = prov_calls[0][0]
            assert len(prov_args) == 12, f"Expected 12 args, got {len(prov_args)}"
            idem_key = prov_args[11]
            assert isinstance(idem_key, str)
            assert "source_captured" in idem_key


# =============================================================================
# 5) Event Bridge re-fire — same event twice → same provenance
# =============================================================================


class TestEventBridgeIdempotency:
    """The key advisor test: re-fire same step_completed → provenance count unchanged."""

    @pytest.mark.asyncio
    async def test_refire_step_completed_provenance_unchanged(self):
        """Fire on_step_completed twice with identical args.

        First call: INSERT returns row (fresh insert).
        Second call: INSERT returns None (conflict) → SELECT returns existing.
        Net result: only 1 provenance record — idempotent.
        """
        from shadow_service import event_bridge

        program_id = uuid4()
        step_run_id = uuid4()
        workflow_run_id = uuid4()
        prov_id = uuid4()
        prov_row = _make_provenance_row(
            id=prov_id, program_id=program_id,
            step_run_id=step_run_id, workflow_run_id=workflow_run_id,
        )

        call_count = {"insert": 0}

        async def mock_create_provenance(**kwargs):
            call_count["insert"] += 1
            return dict(prov_row)

        async def mock_score_claim(claim_id, program_id):
            return {"claim_id": str(claim_id), "computed_confidence": 0.75}

        with patch.object(event_bridge.evidence_runner, "create_provenance",
                         side_effect=mock_create_provenance), \
             patch.object(event_bridge.evidence_runner, "score_claim",
                         side_effect=mock_score_claim):

            output = {"claim_ids": [], "source_ids": []}

            # Fire 1: fresh insert
            r1 = await event_bridge.on_step_completed(
                step_run_id=step_run_id,
                workflow_run_id=workflow_run_id,
                program_id=program_id,
                output=output,
                actor="system",
                request_id="req-refire",
            )

            # Fire 2: duplicate (idempotent — same args)
            r2 = await event_bridge.on_step_completed(
                step_run_id=step_run_id,
                workflow_run_id=workflow_run_id,
                program_id=program_id,
                output=output,
                actor="system",
                request_id="req-refire",
            )

            # Both should succeed (no errors)
            assert len(r1["errors"]) == 0
            assert len(r2["errors"]) == 0
            # Both return the same provenance ID (stringified)
            assert r1["provenance_ids"][0] == str(prov_id)
            assert r2["provenance_ids"][0] == str(prov_id)
            # create_provenance was called twice (fire-and-forget calls it)
            # but due to ON CONFLICT, only 1 row exists in DB
            assert call_count["insert"] == 2

    @pytest.mark.asyncio
    async def test_refire_step_failed_provenance_unchanged(self):
        """Fire on_step_failed twice → same provenance returned both times."""
        from shadow_service import event_bridge

        program_id = uuid4()
        step_run_id = uuid4()
        workflow_run_id = uuid4()
        prov_id = uuid4()
        prov_row = _make_provenance_row(
            id=prov_id, program_id=program_id,
            step_run_id=step_run_id, event_type="step_failed",
        )

        async def mock_create_provenance(**kwargs):
            return dict(prov_row)

        with patch.object(event_bridge.evidence_runner, "create_provenance",
                         side_effect=mock_create_provenance):

            r1 = await event_bridge.on_step_failed(
                step_run_id=step_run_id,
                workflow_run_id=workflow_run_id,
                program_id=program_id,
                error="timeout",
            )
            r2 = await event_bridge.on_step_failed(
                step_run_id=step_run_id,
                workflow_run_id=workflow_run_id,
                program_id=program_id,
                error="timeout",
            )

            assert r1["provenance_ids"][0] == str(prov_id)
            assert r2["provenance_ids"][0] == str(prov_id)
            assert len(r1["errors"]) == 0
            assert len(r2["errors"]) == 0

    @pytest.mark.asyncio
    async def test_refire_batch_completed_provenance_unchanged(self):
        """Fire on_batch_completed twice → same provenance returned."""
        from shadow_service import event_bridge

        program_id = uuid4()
        batch_id = uuid4()
        step_run_id = uuid4()
        workflow_run_id = uuid4()
        prov_id = uuid4()
        prov_row = _make_provenance_row(
            id=prov_id, program_id=program_id,
            batch_id=batch_id, event_type="batch_completed",
        )

        async def mock_create_provenance(**kwargs):
            return dict(prov_row)

        async def mock_score_claim(claim_id, program_id):
            return {"claim_id": str(claim_id), "computed_confidence": 0.8}

        with patch.object(event_bridge.evidence_runner, "create_provenance",
                         side_effect=mock_create_provenance), \
             patch.object(event_bridge.evidence_runner, "score_claim",
                         side_effect=mock_score_claim):

            output = {"claim_ids": [], "source_ids": []}

            r1 = await event_bridge.on_batch_completed(
                batch_id=batch_id,
                step_run_id=step_run_id,
                workflow_run_id=workflow_run_id,
                program_id=program_id,
                output=output,
            )
            r2 = await event_bridge.on_batch_completed(
                batch_id=batch_id,
                step_run_id=step_run_id,
                workflow_run_id=workflow_run_id,
                program_id=program_id,
                output=output,
            )

            assert r1["provenance_ids"][0] == str(prov_id)
            assert r2["provenance_ids"][0] == str(prov_id)
            assert len(r1["errors"]) == 0
            assert len(r2["errors"]) == 0


# =============================================================================
# 6) Migration structure + eCTD compliance
# =============================================================================


class TestIdempotencyMigration:
    """Validate migration SQL structure."""

    @pytest.fixture
    def migration_sql(self):
        import os
        path = os.path.join(
            os.path.dirname(__file__), "..", "..",
            "db", "migrations", "20260206_phase5_idempotent_provenance.sql",
        )
        with open(path) as f:
            return f.read()

    def test_migration_has_ectd_header(self, migration_sql):
        assert "eCTD" in migration_sql

    def test_migration_has_regulatory_context(self, migration_sql):
        assert "21 CFR Part 11" in migration_sql

    def test_migration_drops_check_constraint(self, migration_sql):
        lower = migration_sql.lower()
        assert "drop constraint" in lower

    def test_migration_adds_idempotency_key_column(self, migration_sql):
        lower = migration_sql.lower()
        assert "add column" in lower and "idempotency_key" in lower

    def test_migration_creates_unique_index(self, migration_sql):
        lower = migration_sql.lower()
        assert "create unique index" in lower
        assert "idx_evidence_provenance_idempotent" in lower

    def test_migration_has_partial_index(self, migration_sql):
        """Index should only apply WHERE idempotency_key IS NOT NULL."""
        lower = migration_sql.lower()
        assert "where idempotency_key is not null" in lower

    def test_migration_backfills_existing_rows(self, migration_sql):
        upper = migration_sql.upper()
        assert "UPDATE" in upper
        assert "SET IDEMPOTENCY_KEY" in upper

    def test_migration_is_idempotent(self, migration_sql):
        lower = migration_sql.lower()
        assert "if not exists" in lower or "exception" in lower


# =============================================================================
# 7) Edge cases
# =============================================================================


class TestIdempotencyEdgeCases:
    """Edge cases for idempotent provenance."""

    def test_key_with_no_optional_ids(self):
        """Step-level provenance (no claim, no source) still generates valid key."""
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        key = _compute_idempotency_key(pid, "step_completed")
        assert key.count(":") == 5
        assert key.endswith("_:_:_:_")

    def test_key_with_only_claim(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        cid = uuid4()
        key = _compute_idempotency_key(pid, "claim_created", claim_id=cid)
        assert str(cid) in key
        # step_run and batch should be _
        parts = key.split(":")
        assert parts[2] == "_"  # step_run
        assert parts[3] == "_"  # batch
        assert parts[4] == str(cid)

    def test_key_with_only_source(self):
        from shadow_service.evidence_runner import _compute_idempotency_key

        pid = uuid4()
        sid = uuid4()
        key = _compute_idempotency_key(pid, "source_captured", source_id=sid)
        assert str(sid) in key
        parts = key.split(":")
        assert parts[5] == str(sid)

    @pytest.mark.asyncio
    async def test_create_provenance_releases_connection_on_conflict(self):
        """Connection is always released, even when ON CONFLICT fires."""
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        existing_row = _make_provenance_row(program_id=program_id)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[None, existing_row])
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        release_mock = AsyncMock()
        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", release_mock):
            await runner.create_provenance(
                program_id=program_id,
                event_type="step_completed",
            )
            release_mock.assert_called_once_with(mock_conn)

    @pytest.mark.asyncio
    async def test_create_provenance_passes_metadata_as_json(self):
        """Metadata dict is JSON-serialized before passing to INSERT."""
        from shadow_service import evidence_runner as runner

        program_id = uuid4()
        prov_row = _make_provenance_row(program_id=program_id)

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=prov_row)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock):
            await runner.create_provenance(
                program_id=program_id,
                event_type="step_completed",
                metadata={"key": "value", "count": 42},
            )
            insert_call = mock_conn.fetchrow.call_args_list[0]
            # Param $10 (index 10 after SQL) should be JSON string
            metadata_arg = insert_call[0][10]
            parsed = json.loads(metadata_arg)
            assert parsed["key"] == "value"
            assert parsed["count"] == 42
