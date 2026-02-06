"""Tests for Phase 5.2 — Event Bridge: Orchestration → Evidence Provenance.

Covers:
 1. Bridge helper: _extract_uuids (UUID parsing from step output)
 2. on_step_completed (provenance creation + claim scoring + source links)
 3. on_step_failed (provenance creation for failures)
 4. on_batch_completed (provenance + scoring + source links)
 5. Orchestration runner integration (bridge called after step complete/fail)
 6. Fire-and-forget resilience (bridge errors don't block orchestration)
 7. E2E flow: create run → complete step → provenance appears → claim verify
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


# =============================================================================
# 1) _extract_uuids tests
# =============================================================================


class TestExtractUUIDs:
    """Test UUID extraction from step/batch output."""

    def test_extract_from_list_of_strings(self):
        from shadow_service.event_bridge import _extract_uuids

        uid1, uid2 = uuid4(), uuid4()
        output = {"claim_ids": [str(uid1), str(uid2)]}
        result = _extract_uuids(output, "claim_ids")
        assert result == [uid1, uid2]

    def test_extract_from_single_string(self):
        from shadow_service.event_bridge import _extract_uuids

        uid = uuid4()
        output = {"claim_ids": str(uid)}
        result = _extract_uuids(output, "claim_ids")
        assert result == [uid]

    def test_extract_from_list_of_dicts(self):
        from shadow_service.event_bridge import _extract_uuids

        uid1, uid2 = uuid4(), uuid4()
        output = {"source_ids": [{"id": str(uid1)}, {"id": str(uid2)}]}
        result = _extract_uuids(output, "source_ids")
        assert result == [uid1, uid2]

    def test_extract_missing_key_returns_empty(self):
        from shadow_service.event_bridge import _extract_uuids

        output = {"something_else": "value"}
        result = _extract_uuids(output, "claim_ids")
        assert result == []

    def test_extract_none_value_returns_empty(self):
        from shadow_service.event_bridge import _extract_uuids

        output = {"claim_ids": None}
        result = _extract_uuids(output, "claim_ids")
        assert result == []

    def test_extract_invalid_uuids_skipped(self):
        from shadow_service.event_bridge import _extract_uuids

        uid = uuid4()
        output = {"claim_ids": [str(uid), "not-a-uuid", "also-bad"]}
        result = _extract_uuids(output, "claim_ids")
        assert result == [uid]

    def test_extract_from_uuid_objects(self):
        from shadow_service.event_bridge import _extract_uuids

        uid = uuid4()
        output = {"claim_ids": [uid]}
        result = _extract_uuids(output, "claim_ids")
        assert result == [uid]

    def test_extract_empty_list(self):
        from shadow_service.event_bridge import _extract_uuids

        output = {"claim_ids": []}
        result = _extract_uuids(output, "claim_ids")
        assert result == []


# =============================================================================
# 2) on_step_completed tests
# =============================================================================


class TestOnStepCompleted:
    """Bridge: step completion → evidence provenance."""

    @pytest.mark.asyncio
    async def test_creates_step_provenance(self):
        from shadow_service import event_bridge as bridge

        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()
        prov_id = uuid4()

        mock_prov = {"id": prov_id, "event_type": "step_completed"}

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, return_value=mock_prov,
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock,
        ):
            result = await bridge.on_step_completed(
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                output={"result": "ok"},
                actor="test",
                request_id="req-1",
            )

            assert str(prov_id) in result["provenance_ids"]
            assert len(result["errors"]) == 0
            bridge.evidence_runner.create_provenance.assert_awaited_once()
            args = bridge.evidence_runner.create_provenance.call_args
            assert args.kwargs["event_type"] == "step_completed"
            assert args.kwargs["step_run_id"] == step_id
            assert args.kwargs["workflow_run_id"] == wf_id

    @pytest.mark.asyncio
    async def test_links_claims_and_scores(self):
        from shadow_service import event_bridge as bridge

        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()
        claim_id = uuid4()

        prov_counter = iter([uuid4() for _ in range(5)])
        async def mock_create_prov(**kwargs):
            return {"id": next(prov_counter), "event_type": kwargs.get("event_type")}

        mock_score = {
            "claim_id": str(claim_id),
            "computed_confidence": 0.85,
            "source_count": 2,
        }

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=mock_create_prov,
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock, return_value=mock_score,
        ):
            result = await bridge.on_step_completed(
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                output={"claim_ids": [str(claim_id)]},
                actor="test",
                request_id="req-2",
            )

            # Step provenance + claim provenance = 2 calls
            assert bridge.evidence_runner.create_provenance.await_count == 2
            assert len(result["claims_scored"]) == 1
            assert result["claims_scored"][0]["confidence"] == 0.85
            bridge.evidence_runner.score_claim.assert_awaited_once_with(claim_id, pid)

    @pytest.mark.asyncio
    async def test_links_sources(self):
        from shadow_service import event_bridge as bridge

        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()
        source_id = uuid4()

        prov_counter = iter([uuid4() for _ in range(5)])
        async def mock_create_prov(**kwargs):
            return {"id": next(prov_counter), "event_type": kwargs.get("event_type")}

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=mock_create_prov,
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock,
        ):
            result = await bridge.on_step_completed(
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                output={"source_ids": [str(source_id)]},
            )

            # Step provenance + source provenance = 2 calls
            assert bridge.evidence_runner.create_provenance.await_count == 2
            assert str(source_id) in result["sources_linked"]

    @pytest.mark.asyncio
    async def test_no_claims_no_scoring(self):
        from shadow_service import event_bridge as bridge

        prov_id = uuid4()

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, return_value={"id": prov_id},
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock,
        ):
            result = await bridge.on_step_completed(
                step_run_id=uuid4(),
                workflow_run_id=uuid4(),
                program_id=uuid4(),
                output={"result": "done"},
            )

            assert len(result["claims_scored"]) == 0
            bridge.evidence_runner.score_claim.assert_not_awaited()


# =============================================================================
# 3) on_step_failed tests
# =============================================================================


class TestOnStepFailed:
    """Bridge: step failure → evidence provenance."""

    @pytest.mark.asyncio
    async def test_creates_failure_provenance(self):
        from shadow_service import event_bridge as bridge

        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()
        prov_id = uuid4()

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, return_value={"id": prov_id},
        ):
            result = await bridge.on_step_failed(
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                error="Step timed out",
                actor="test",
                request_id="req-3",
            )

            assert str(prov_id) in result["provenance_ids"]
            args = bridge.evidence_runner.create_provenance.call_args
            assert args.kwargs["event_type"] == "step_failed"
            assert "timed out" in args.kwargs["metadata"]["error"]

    @pytest.mark.asyncio
    async def test_caps_error_length(self):
        from shadow_service import event_bridge as bridge

        long_error = "x" * 1000

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, return_value={"id": uuid4()},
        ):
            await bridge.on_step_failed(
                step_run_id=uuid4(),
                workflow_run_id=uuid4(),
                program_id=uuid4(),
                error=long_error,
            )

            args = bridge.evidence_runner.create_provenance.call_args
            assert len(args.kwargs["metadata"]["error"]) <= 500

    @pytest.mark.asyncio
    async def test_failure_provenance_error_is_non_blocking(self):
        from shadow_service import event_bridge as bridge

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=RuntimeError("DB down"),
        ):
            result = await bridge.on_step_failed(
                step_run_id=uuid4(),
                workflow_run_id=uuid4(),
                program_id=uuid4(),
                error="test error",
            )

            # Should not raise — captures error
            assert len(result["errors"]) == 1
            assert "DB down" in result["errors"][0]


# =============================================================================
# 4) on_batch_completed tests
# =============================================================================


class TestOnBatchCompleted:
    """Bridge: A8 batch completion → provenance + scoring."""

    @pytest.mark.asyncio
    async def test_creates_batch_provenance(self):
        from shadow_service import event_bridge as bridge

        batch_id = uuid4()
        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()
        prov_id = uuid4()

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, return_value={"id": prov_id},
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock,
        ):
            result = await bridge.on_batch_completed(
                batch_id=batch_id,
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                output={"reviewed": 42},
                actor="a8_worker",
                request_id="req-4",
            )

            assert str(prov_id) in result["provenance_ids"]
            args = bridge.evidence_runner.create_provenance.call_args
            assert args.kwargs["event_type"] == "batch_completed"
            assert args.kwargs["batch_id"] == batch_id

    @pytest.mark.asyncio
    async def test_batch_with_claims_triggers_scoring(self):
        from shadow_service import event_bridge as bridge

        batch_id = uuid4()
        claim_id = uuid4()
        pid = uuid4()

        prov_counter = iter([uuid4() for _ in range(5)])
        async def mock_create_prov(**kwargs):
            return {"id": next(prov_counter), "event_type": kwargs.get("event_type")}

        mock_score = {"claim_id": str(claim_id), "computed_confidence": 0.72}

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=mock_create_prov,
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock, return_value=mock_score,
        ):
            result = await bridge.on_batch_completed(
                batch_id=batch_id,
                step_run_id=uuid4(),
                workflow_run_id=uuid4(),
                program_id=pid,
                output={"claim_ids": [str(claim_id)]},
            )

            assert len(result["claims_scored"]) == 1
            assert result["claims_scored"][0]["confidence"] == 0.72
            bridge.evidence_runner.score_claim.assert_awaited_once()


# =============================================================================
# 5) Orchestration runner integration tests
# =============================================================================


class TestOrchestratorBridgeIntegration:
    """Verify orchestration_runner calls _fire_bridge_event after completion."""

    @pytest.mark.asyncio
    async def test_complete_step_fires_bridge(self):
        """complete_step calls on_step_completed via _fire_bridge_event."""
        from shadow_service import orchestration_runner as runner

        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()

        completed_row = FakeRecord({
            "id": step_id,
            "workflow_run_id": wf_id,
            "step_template_id": uuid4(),
            "program_id": pid,
            "status": "completed",
            "attempt": 1,
            "output": "{}",
            "completed_at": datetime.utcnow(),
        })

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=completed_row)
        mock_conn.execute = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(runner, "_fire_bridge_event", new_callable=AsyncMock) as mock_bridge:

            result = await runner.complete_step(
                step_run_id=step_id,
                output={"result": "done"},
                program_id=pid,
                actor="test",
                request_id="req-5",
            )

            assert result is not None
            mock_bridge.assert_awaited_once_with(
                "on_step_completed",
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                output={"result": "done"},
                actor="test",
                request_id="req-5",
            )

    @pytest.mark.asyncio
    async def test_fail_step_fires_bridge(self):
        """fail_step calls on_step_failed via _fire_bridge_event."""
        from shadow_service import orchestration_runner as runner

        step_id = uuid4()
        wf_id = uuid4()
        pid = uuid4()

        failed_row = FakeRecord({
            "id": step_id,
            "workflow_run_id": wf_id,
            "step_template_id": uuid4(),
            "program_id": pid,
            "status": "failed",
            "attempt": 1,
            "error": "boom",
            "completed_at": datetime.utcnow(),
        })

        step_detail = FakeRecord({
            "id": step_id,
            "workflow_run_id": wf_id,
            "step_template_id": uuid4(),
            "program_id": pid,
            "attempt": 1,
            "input": None,
        })

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=[
            failed_row,       # FAIL_STEP_RUN
            None,             # INSERT_STEP_RUN_EVENT
            step_detail,      # SELECT_STEP_RUN_BY_ID
            FakeRecord({"retry_policy": None}),  # step template retry_policy
        ])
        mock_conn.execute = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(runner, "_fire_bridge_event", new_callable=AsyncMock) as mock_bridge:

            result = await runner.fail_step(
                step_run_id=step_id,
                error="boom",
                program_id=pid,
                actor="test",
                request_id="req-6",
            )

            assert result is not None
            mock_bridge.assert_awaited_once_with(
                "on_step_failed",
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=pid,
                error="boom",
                actor="test",
                request_id="req-6",
            )

    @pytest.mark.asyncio
    async def test_complete_step_none_skips_bridge(self):
        """complete_step returns None (step not running) → no bridge call."""
        from shadow_service import orchestration_runner as runner

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)
        mock_conn.execute = AsyncMock()
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(return_value=None),
            __aexit__=AsyncMock(return_value=False),
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn), \
             patch.object(runner.db, "release_connection", new_callable=AsyncMock), \
             patch.object(runner, "_fire_bridge_event", new_callable=AsyncMock) as mock_bridge:

            result = await runner.complete_step(
                step_run_id=uuid4(),
                output={},
                program_id=uuid4(),
            )

            assert result is None
            mock_bridge.assert_not_awaited()


# =============================================================================
# 6) Fire-and-forget resilience tests
# =============================================================================


class TestBridgeResilience:
    """Bridge failures must never block orchestration."""

    @pytest.mark.asyncio
    async def test_fire_bridge_event_swallows_exceptions(self):
        """_fire_bridge_event logs but doesn't raise on bridge error."""
        from shadow_service.orchestration_runner import _fire_bridge_event

        with patch(
            "shadow_service.event_bridge.on_step_completed",
            new_callable=AsyncMock,
            side_effect=RuntimeError("Evidence DB down"),
        ):
            # Should NOT raise
            await _fire_bridge_event(
                "on_step_completed",
                step_run_id=uuid4(),
                workflow_run_id=uuid4(),
                program_id=uuid4(),
                output={},
            )

    @pytest.mark.asyncio
    async def test_fire_bridge_event_handles_import_error(self):
        """_fire_bridge_event handles missing handler gracefully."""
        from shadow_service.orchestration_runner import _fire_bridge_event

        # Patching a non-existent handler name exercises the getattr fallback
        await _fire_bridge_event(
            "nonexistent_handler",
            step_run_id=uuid4(),
            workflow_run_id=uuid4(),
            program_id=uuid4(),
            output={},
        )

    @pytest.mark.asyncio
    async def test_bridge_claim_error_captured_not_raised(self):
        """If scoring one claim fails, other claims still get processed."""
        from shadow_service import event_bridge as bridge

        claim_ok = uuid4()
        claim_fail = uuid4()

        call_count = 0
        async def mock_create_prov(**kwargs):
            return {"id": uuid4(), "event_type": kwargs.get("event_type")}

        async def mock_score(claim_id, program_id):
            if claim_id == claim_fail:
                raise RuntimeError("Score DB error")
            return {"claim_id": str(claim_id), "computed_confidence": 0.9}

        with patch.object(
            bridge.evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=mock_create_prov,
        ), patch.object(
            bridge.evidence_runner, "score_claim",
            new_callable=AsyncMock, side_effect=mock_score,
        ):
            result = await bridge.on_step_completed(
                step_run_id=uuid4(),
                workflow_run_id=uuid4(),
                program_id=uuid4(),
                output={"claim_ids": [str(claim_ok), str(claim_fail)]},
            )

            # One success, one error
            assert len(result["claims_scored"]) == 1
            assert len(result["errors"]) == 1


# =============================================================================
# 7) E2E flow: create run → complete step → provenance → verify
# =============================================================================


class TestE2EBridgeFlow:
    """End-to-end: orchestration event → bridge → provenance → verify."""

    @pytest.mark.asyncio
    async def test_e2e_step_complete_to_provenance_to_verify(self):
        """Full flow:
        1. Create a claim (produces claim_id + hash ledger)
        2. complete_step with claim_id in output
        3. Bridge fires → creates provenance linking step→claim
        4. verify_claim_integrity → valid + hash match
        """
        from shadow_service import event_bridge as bridge
        from shadow_service import evidence_runner

        # -- Setup: mock claim + hash
        claim_id = uuid4()
        program_id = uuid4()
        step_id = uuid4()
        wf_id = uuid4()

        # Track all provenance created
        provenance_records = []

        async def mock_create_prov(**kwargs):
            record = {"id": uuid4(), **kwargs}
            provenance_records.append(record)
            return record

        # Mock score
        mock_score = {
            "claim_id": str(claim_id),
            "computed_confidence": 0.75,
            "source_count": 1,
        }

        # Mock verify
        mock_verify = {
            "valid": True,
            "claim_id": str(claim_id),
            "computed_hash": "abc123",
            "ledger_hash": "abc123",
            "match": True,
        }

        with patch.object(
            evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=mock_create_prov,
        ), patch.object(
            evidence_runner, "score_claim",
            new_callable=AsyncMock, return_value=mock_score,
        ), patch.object(
            evidence_runner, "verify_claim_integrity",
            new_callable=AsyncMock, return_value=mock_verify,
        ):
            # Step 1: Bridge fires on step completion with claim in output
            result = await bridge.on_step_completed(
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=program_id,
                output={"claim_ids": [str(claim_id)]},
                actor="e2e-test",
                request_id="e2e-req-1",
            )

            # Step 2: Verify provenance was created
            assert len(provenance_records) == 2  # step + claim
            step_prov = provenance_records[0]
            claim_prov = provenance_records[1]
            assert step_prov["event_type"] == "step_completed"
            assert step_prov["step_run_id"] == step_id
            assert claim_prov["event_type"] == "claim_produced"
            assert claim_prov["claim_id"] == claim_id
            assert claim_prov["step_run_id"] == step_id

            # Step 3: Verify claim was scored
            assert len(result["claims_scored"]) == 1
            assert result["claims_scored"][0]["confidence"] == 0.75

            # Step 4: Verify claim integrity
            verify_result = await evidence_runner.verify_claim_integrity(
                claim_id, program_id,
            )
            assert verify_result["valid"] is True
            assert verify_result["match"] is True

    @pytest.mark.asyncio
    async def test_e2e_batch_complete_to_provenance(self):
        """Full flow for batch completion path."""
        from shadow_service import event_bridge as bridge
        from shadow_service import evidence_runner

        claim_id = uuid4()
        source_id = uuid4()
        batch_id = uuid4()
        step_id = uuid4()
        wf_id = uuid4()
        program_id = uuid4()

        provenance_records = []
        async def mock_create_prov(**kwargs):
            record = {"id": uuid4(), **kwargs}
            provenance_records.append(record)
            return record

        with patch.object(
            evidence_runner, "create_provenance",
            new_callable=AsyncMock, side_effect=mock_create_prov,
        ), patch.object(
            evidence_runner, "score_claim",
            new_callable=AsyncMock,
            return_value={"claim_id": str(claim_id), "computed_confidence": 0.6},
        ):
            result = await bridge.on_batch_completed(
                batch_id=batch_id,
                step_run_id=step_id,
                workflow_run_id=wf_id,
                program_id=program_id,
                output={
                    "claim_ids": [str(claim_id)],
                    "source_ids": [str(source_id)],
                },
                actor="a8_worker",
                request_id="batch-req-1",
            )

            # batch + claim + source = 3 provenance records
            assert len(provenance_records) == 3
            assert provenance_records[0]["event_type"] == "batch_completed"
            assert provenance_records[0]["batch_id"] == batch_id
            assert provenance_records[1]["event_type"] == "claim_produced"
            assert provenance_records[2]["event_type"] == "source_captured"

            assert len(result["claims_scored"]) == 1
            assert str(source_id) in result["sources_linked"]
            assert len(result["errors"]) == 0
