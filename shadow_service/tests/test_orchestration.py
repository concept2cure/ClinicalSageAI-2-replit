"""Tests for the Orchestration Kernel — Phase 4.2.

Covers:
 1. Model validation (Pydantic)
 2. SQL query structure (no DB required)
 3. Runner logic with mocked DB (idempotency, dependency gating, claim lock, A8 bridge)
 4. Router endpoint wiring (FastAPI TestClient)
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

# =============================================================================
# 1) Model validation tests
# =============================================================================


class TestOrchestrationModels:
    """Pydantic model validation — no DB needed."""

    def test_start_workflow_request_minimal(self):
        from shadow_service.models_orchestration import StartWorkflowRequest

        req = StartWorkflowRequest(
            program_id=uuid4(),
            template_code="ind_intake",
        )
        assert req.priority == 0
        assert req.context == {}
        assert req.idempotency_key is None

    def test_start_workflow_request_full(self):
        from shadow_service.models_orchestration import StartWorkflowRequest

        pid = uuid4()
        req = StartWorkflowRequest(
            program_id=pid,
            template_code="ind_intake",
            idempotency_key="run-001",
            context={"nct_id": "NCT12345"},
            priority=5,
        )
        assert req.program_id == pid
        assert req.idempotency_key == "run-001"
        assert req.priority == 5

    def test_claim_step_request(self):
        from shadow_service.models_orchestration import ClaimStepRequest

        req = ClaimStepRequest(worker_id="worker-alpha")
        assert req.worker_id == "worker-alpha"

    def test_complete_step_request(self):
        from shadow_service.models_orchestration import CompleteStepRequest

        req = CompleteStepRequest(output={"extracted_claims": 42})
        assert req.output["extracted_claims"] == 42

    def test_fail_step_request(self):
        from shadow_service.models_orchestration import FailStepRequest

        req = FailStepRequest(error="timeout after 600s")
        assert "timeout" in req.error

    def test_workflow_run_response(self):
        from shadow_service.models_orchestration import WorkflowRunResponse
        from datetime import datetime

        resp = WorkflowRunResponse(
            id=uuid4(),
            program_id=uuid4(),
            workflow_template_id=uuid4(),
            status="running",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        assert resp.status == "running"
        assert resp.priority == 0

    def test_step_run_response(self):
        from shadow_service.models_orchestration import StepRunResponse

        resp = StepRunResponse(
            id=uuid4(),
            workflow_run_id=uuid4(),
            step_template_id=uuid4(),
            program_id=uuid4(),
            status="queued",
        )
        assert resp.attempt == 1
        assert resp.batch_id is None

    def test_step_queue_response(self):
        from shadow_service.models_orchestration import StepQueueResponse

        resp = StepQueueResponse(items=[], count=0)
        assert resp.count == 0

    def test_workflow_run_detail_with_steps(self):
        from shadow_service.models_orchestration import (
            WorkflowRunDetail,
            StepRunResponse,
        )
        from datetime import datetime

        now = datetime.utcnow()
        detail = WorkflowRunDetail(
            id=uuid4(),
            program_id=uuid4(),
            workflow_template_id=uuid4(),
            status="running",
            created_at=now,
            updated_at=now,
            steps=[
                StepRunResponse(
                    id=uuid4(),
                    workflow_run_id=uuid4(),
                    step_template_id=uuid4(),
                    program_id=uuid4(),
                    status="completed",
                )
            ],
        )
        assert len(detail.steps) == 1


# =============================================================================
# 2) SQL query structure tests (string checks, no DB)
# =============================================================================


class TestOrchestrationSQL:
    """Verify SQL query strings are valid parameterized queries."""

    def test_insert_workflow_run_has_params(self):
        from shadow_service.sql_orchestration import INSERT_WORKFLOW_RUN

        assert "$1" in INSERT_WORKFLOW_RUN  # program_id
        assert "$6" in INSERT_WORKFLOW_RUN  # created_by
        assert "RETURNING" in INSERT_WORKFLOW_RUN

    def test_claim_step_run_uses_advisory_lock(self):
        from shadow_service.sql_orchestration import CLAIM_STEP_RUN

        assert "$1" in CLAIM_STEP_RUN  # step_run_id
        assert "$2" in CLAIM_STEP_RUN  # worker_id
        assert "locked_at IS NULL" in CLAIM_STEP_RUN
        assert "status = 'queued'" in CLAIM_STEP_RUN

    def test_runnable_steps_checks_deps(self):
        from shadow_service.sql_orchestration import SELECT_RUNNABLE_STEPS

        assert "NOT EXISTS" in SELECT_RUNNABLE_STEPS
        assert "step_dependencies" in SELECT_RUNNABLE_STEPS
        assert "finish_to_start" in SELECT_RUNNABLE_STEPS

    def test_complete_step_run_has_output(self):
        from shadow_service.sql_orchestration import COMPLETE_STEP_RUN

        assert "output = $2" in COMPLETE_STEP_RUN
        assert "status = 'running'" in COMPLETE_STEP_RUN
        assert "completed_at = NOW()" in COMPLETE_STEP_RUN

    def test_fail_step_run_has_error(self):
        from shadow_service.sql_orchestration import FAIL_STEP_RUN

        assert "error = $2" in FAIL_STEP_RUN
        assert "status = 'running'" in FAIL_STEP_RUN

    def test_set_rls_context(self):
        from shadow_service.sql_orchestration import SET_PROGRAM_CONTEXT

        assert "set_config" in SET_PROGRAM_CONTEXT
        assert "app.current_program_id" in SET_PROGRAM_CONTEXT

    def test_insert_event_immutable_log(self):
        from shadow_service.sql_orchestration import INSERT_STEP_RUN_EVENT

        assert "$7" in INSERT_STEP_RUN_EVENT  # actor
        assert "step_run_events" in INSERT_STEP_RUN_EVENT

    def test_claimable_steps_filter(self):
        from shadow_service.sql_orchestration import SELECT_CLAIMABLE_STEPS

        assert "status = 'queued'" in SELECT_CLAIMABLE_STEPS
        assert "locked_at IS NULL" in SELECT_CLAIMABLE_STEPS

    def test_batch_id_update(self):
        from shadow_service.sql_orchestration import UPDATE_STEP_RUN_BATCH_ID

        assert "batch_id = $2" in UPDATE_STEP_RUN_BATCH_ID


# =============================================================================
# 3) Runner logic tests (mocked DB)
# =============================================================================


def _make_record(data: dict):
    """Create a mock that behaves like asyncpg.Record."""
    mock = MagicMock()
    mock.__getitem__ = lambda self, key: data[key]
    mock.__contains__ = lambda self, key: key in data
    mock.keys = lambda: data.keys()
    mock.items = lambda: data.items()
    mock.values = lambda: data.values()
    # Support dict() conversion
    mock.__iter__ = lambda self: iter(data)
    # Make dict(mock) work
    type(mock).__iter__ = lambda self: iter(data)
    type(mock).__getitem__ = lambda self, key: data[key]
    return mock


class TestRunnerStartWorkflow:
    """Test start_workflow with mocked DB connections."""

    @pytest.mark.asyncio
    async def test_start_workflow_no_template_raises(self):
        """Starting a workflow with invalid template code raises ValueError."""
        from shadow_service import orchestration_runner as runner

        program_id = uuid4()

        async def mock_fetchrow(query, *args):
            # Template lookup returns None (not found)
            return None

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_conn.fetchrow = mock_fetchrow

        # Create a proper async context manager for transaction
        txn_ctx = AsyncMock()
        txn_ctx.__aenter__ = AsyncMock(return_value=None)
        txn_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_conn.transaction = MagicMock(return_value=txn_ctx)

        with patch.object(runner.db, "acquire_connection", new_callable=AsyncMock, return_value=mock_conn):
            with patch.object(runner.db, "release_connection", new_callable=AsyncMock):
                with pytest.raises(ValueError, match="No active workflow template"):
                    await runner.start_workflow(
                        program_id=program_id,
                        template_code="nonexistent",
                    )

    @pytest.mark.asyncio
    async def test_start_workflow_idempotent_returns_existing(self):
        """Duplicate idempotency_key returns existing run without error."""
        from shadow_service import orchestration_runner as runner
        import asyncpg

        program_id = uuid4()
        template_id = uuid4()
        existing_run_id = uuid4()

        template_record = _make_record({"id": template_id})
        existing_record = _make_record({
            "id": existing_run_id,
            "program_id": program_id,
            "workflow_template_id": template_id,
            "idempotency_key": "dup-key",
            "status": "running",
            "started_at": None,
            "completed_at": None,
            "current_step_id": None,
            "context": {},
            "error": None,
            "priority": 0,
            "created_at": None,
            "updated_at": None,
            "created_by": "system",
        })

        call_count = 0

        async def mock_fetchrow(query, *args):
            nonlocal call_count
            call_count += 1
            # Call 1: template lookup
            if "workflow_templates" in query and "code" in query:
                return template_record
            # Call 2: INSERT → UniqueViolation
            if "INSERT INTO orchestration.workflow_runs" in query:
                raise asyncpg.UniqueViolationError("")
            # Call 3: existing run lookup (idempotency)
            if "idempotency_key" in query and "SELECT" in query:
                return existing_record
            return None

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value=None)
        mock_conn.fetchrow = mock_fetchrow

        txn_ctx = AsyncMock()
        txn_ctx.__aenter__ = AsyncMock(return_value=None)
        txn_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_conn.transaction = MagicMock(return_value=txn_ctx)

        with patch.object(runner.db, "acquire_connection", new_callable=AsyncMock, return_value=mock_conn):
            with patch.object(runner.db, "release_connection", new_callable=AsyncMock):
                result = await runner.start_workflow(
                    program_id=program_id,
                    template_code="ind_intake",
                    idempotency_key="dup-key",
                )
                assert result["id"] == existing_run_id


class TestRunnerClaimStep:
    """Test claim_step — worker lock safety."""

    @pytest.mark.asyncio
    async def test_claim_returns_none_if_already_claimed(self):
        """Second claim attempt returns None."""
        from shadow_service import orchestration_runner as runner

        program_id = uuid4()
        step_run_id = uuid4()

        call_count = 0

        async def mock_fetchrow(query, *args):
            nonlocal call_count
            call_count += 1
            if "set_config" in query:
                return None
            # CLAIM returns None (already claimed)
            return None

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = mock_fetchrow
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(), __aexit__=AsyncMock()
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn):
            with patch.object(runner.db, "release_connection", new_callable=AsyncMock):
                result = await runner.claim_step(
                    step_run_id=step_run_id,
                    worker_id="worker-1",
                    program_id=program_id,
                )
                assert result is None


class TestRunnerAdvance:
    """Test dependency gating logic."""

    @pytest.mark.asyncio
    async def test_advance_queues_runnable_steps(self):
        """advance_workflow queues steps whose deps are satisfied."""
        from shadow_service import orchestration_runner as runner

        program_id = uuid4()
        run_id = uuid4()
        step_id = uuid4()

        runnable = [_make_record({
            "id": step_id,
            "workflow_run_id": run_id,
            "step_template_id": uuid4(),
            "program_id": program_id,
            "status": "pending",
            "attempt": 1,
            "step_code": "ingest_protocol",
            "step_name": "Ingest Protocol",
            "step_type": "task",
        })]

        call_count = 0

        async def mock_fetchrow(query, *args):
            nonlocal call_count
            call_count += 1
            if "set_config" in query:
                return None
            if "UPDATE" in query and "queued" in query:
                return _make_record({"id": step_id})
            if "step_run_events" in query:
                return _make_record({"id": uuid4()})
            if "workflow_runs" in query and "UPDATE" in query:
                return None
            return None

        async def mock_fetch(query, *args):
            if "status = 'pending'" in query and "NOT EXISTS" in query:
                return runnable
            # All step runs for workflow completion check
            return [_make_record({"status": "queued", "id": step_id})]

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.fetchrow = mock_fetchrow
        mock_conn.fetch = mock_fetch
        mock_conn.transaction = MagicMock(return_value=AsyncMock(
            __aenter__=AsyncMock(), __aexit__=AsyncMock()
        ))

        with patch.object(runner.db, "acquire_connection", return_value=mock_conn):
            with patch.object(runner.db, "release_connection", new_callable=AsyncMock):
                queued = await runner.advance_workflow(run_id, program_id)
                assert len(queued) == 1
                assert queued[0]["step_code"] == "ingest_protocol"


# =============================================================================
# 4) Router endpoint tests (FastAPI TestClient)
# =============================================================================


class TestOrchestrationRouter:
    """Test router endpoints with mocked runner."""

    def _get_client(self):
        from fastapi.testclient import TestClient
        from shadow_service.router_orchestration import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        return TestClient(app)

    def test_start_workflow_404_on_bad_template(self):
        """POST /orchestration/runs/start with bad template returns 404."""
        from shadow_service import orchestration_runner as runner

        with patch.object(
            runner,
            "start_workflow",
            new_callable=AsyncMock,
            side_effect=ValueError("No active workflow template found"),
        ):
            client = self._get_client()
            resp = client.post(
                "/orchestration/runs/start",
                json={
                    "program_id": str(uuid4()),
                    "template_code": "nonexistent",
                },
            )
            assert resp.status_code == 404

    def test_claim_step_409_already_claimed(self):
        """POST /orchestration/steps/{id}/claim returns 409 when already claimed."""
        from shadow_service import orchestration_runner as runner

        with patch.object(
            runner,
            "claim_step",
            new_callable=AsyncMock,
            return_value=None,
        ):
            client = self._get_client()
            step_id = uuid4()
            resp = client.post(
                f"/orchestration/steps/{step_id}/claim",
                json={"worker_id": "w1"},
                headers={"X-Program-ID": str(uuid4())},
            )
            assert resp.status_code == 409

    def test_complete_step_409_not_running(self):
        """POST /orchestration/steps/{id}/complete returns 409 when not running."""
        from shadow_service import orchestration_runner as runner

        with patch.object(
            runner,
            "complete_step",
            new_callable=AsyncMock,
            return_value=None,
        ):
            client = self._get_client()
            step_id = uuid4()
            resp = client.post(
                f"/orchestration/steps/{step_id}/complete",
                json={"output": {}},
                headers={"X-Program-ID": str(uuid4())},
            )
            assert resp.status_code == 409

    def test_fail_step_409_not_running(self):
        """POST /orchestration/steps/{id}/fail returns 409 when not running."""
        from shadow_service import orchestration_runner as runner

        with patch.object(
            runner,
            "fail_step",
            new_callable=AsyncMock,
            return_value=None,
        ):
            client = self._get_client()
            step_id = uuid4()
            resp = client.post(
                f"/orchestration/steps/{step_id}/fail",
                json={"error": "some error"},
                headers={"X-Program-ID": str(uuid4())},
            )
            assert resp.status_code == 409

    def test_get_step_queue_empty(self):
        """GET /orchestration/steps/queue returns empty list."""
        from shadow_service import orchestration_runner as runner

        with patch.object(
            runner,
            "get_step_queue",
            new_callable=AsyncMock,
            return_value=[],
        ):
            client = self._get_client()
            resp = client.get(
                "/orchestration/steps/queue",
                params={"program_id": str(uuid4())},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["count"] == 0
            assert data["items"] == []

    def test_batch_complete_404_no_step(self):
        """POST /orchestration/batch/complete returns 404 when no step linked."""
        from shadow_service import orchestration_runner as runner

        with patch.object(
            runner,
            "on_batch_complete",
            new_callable=AsyncMock,
            return_value=None,
        ):
            client = self._get_client()
            resp = client.post(
                "/orchestration/batch/complete",
                json={
                    "batch_id": str(uuid4()),
                    "program_id": str(uuid4()),
                    "output": {},
                },
            )
            assert resp.status_code == 404
