"""FastAPI router for Orchestration Kernel endpoints.

Endpoints:
  POST  /orchestration/runs/start               — start a workflow
  GET   /orchestration/runs?program_id=...       — list runs for a program
  GET   /orchestration/runs/{run_id}             — get run detail + steps
  GET   /orchestration/steps/queue?program_id=.. — claimable steps
  POST  /orchestration/steps/{step_run_id}/claim — claim a step
  POST  /orchestration/steps/{step_run_id}/complete — complete a step
  POST  /orchestration/steps/{step_run_id}/fail  — fail a step
  GET   /orchestration/steps/{step_run_id}/events — event trail
  POST  /orchestration/batch/complete            — A8 batch callback

Auth: All endpoints require X-Admin-Token matching REVIEW_ADMIN_TOKEN env var.
      Reuses the same A8 ops token — no second secret.
"""

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, Query

from .db import LiteModeError
from .models_orchestration import (
    StartWorkflowRequest,
    WorkflowRunResponse,
    WorkflowRunDetail,
    WorkflowRunList,
    StepRunResponse,
    ClaimStepRequest,
    CompleteStepRequest,
    FailStepRequest,
    StepQueueItem,
    StepQueueResponse,
    StepRunEventResponse,
)
from . import orchestration_runner as runner

logger = logging.getLogger(__name__)


# =============================================================================
# Admin Auth Guard — mirrors lumen_cortex/reviewer/api.py A8 pattern
# =============================================================================

@dataclass
class OrchestrationAdminContext:
    """Context carried through every orchestration request for audit."""
    request_id: str
    admin_actor: str          # sha256(token)[:8] — never the raw secret
    timestamp: str            # ISO-8601 UTC


def _hash_token_prefix(token: str) -> str:
    """First 8 hex chars of sha256(token) — safe for logs & audit columns."""
    return hashlib.sha256(token.encode()).hexdigest()[:8]


def require_orchestration_admin(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Fail-closed admin gate — reuses REVIEW_ADMIN_TOKEN.

    * env missing  → 503  (ops endpoints disabled until configured)
    * token wrong  → 403
    """
    expected = os.getenv("REVIEW_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="REVIEW_ADMIN_TOKEN not configured — orchestration endpoints disabled",
        )
    if x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


def get_orchestration_context(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> OrchestrationAdminContext:
    """Build audit context from request headers."""
    return OrchestrationAdminContext(
        request_id=x_request_id or str(uuid4()),
        admin_actor=_hash_token_prefix(x_admin_token) if x_admin_token else "no-token",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


router = APIRouter(
    prefix="/orchestration",
    tags=["Orchestration"],
    dependencies=[Depends(require_orchestration_admin)],
)


def _handle_lite_mode(e: LiteModeError):
    raise HTTPException(
        status_code=503,
        detail="Database not available. Service running in lite mode.",
    )


# =============================================================================
# Workflow Runs
# =============================================================================

@router.post("/runs/start", response_model=WorkflowRunResponse, status_code=201)
async def start_workflow(
    body: StartWorkflowRequest,
    ctx: OrchestrationAdminContext = Depends(get_orchestration_context),
    x_actor: Optional[str] = Header(None, alias="X-Actor"),
):
    """Start a new workflow run from a template."""
    actor = x_actor or ctx.admin_actor
    try:
        result = await runner.start_workflow(
            program_id=body.program_id,
            template_code=body.template_code,
            idempotency_key=body.idempotency_key,
            context=body.context,
            priority=body.priority,
            actor=actor,
            request_id=ctx.request_id,
        )
        return WorkflowRunResponse(**result)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Failed to start workflow [req=%s]", ctx.request_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs", response_model=WorkflowRunList)
async def list_runs(
    program_id: UUID = Query(..., description="Filter by program"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List workflow runs for a program."""
    try:
        runs = await runner.list_workflow_runs(program_id, limit, offset)
        return WorkflowRunList(
            runs=[WorkflowRunResponse(**r) for r in runs],
            total=len(runs),
        )
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to list workflow runs")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{run_id}", response_model=WorkflowRunDetail)
async def get_run(
    run_id: UUID,
    program_id: UUID = Query(..., description="Required for RLS"),
):
    """Get a workflow run with all its step runs."""
    try:
        result = await runner.get_workflow_run(run_id, program_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Workflow run not found")
        steps = [StepRunResponse(**s) for s in result.pop("steps", [])]
        return WorkflowRunDetail(**result, steps=steps)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get workflow run")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Step Queue
# =============================================================================

@router.get("/steps/queue", response_model=StepQueueResponse)
async def get_step_queue(
    program_id: UUID = Query(..., description="Filter by program"),
):
    """List claimable (queued) steps for a program."""
    try:
        items = await runner.get_step_queue(program_id)
        return StepQueueResponse(
            items=[StepQueueItem(**i) for i in items],
            count=len(items),
        )
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get step queue")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Step Lifecycle
# =============================================================================

@router.post("/steps/{step_run_id}/claim", response_model=StepRunResponse)
async def claim_step(
    step_run_id: UUID,
    body: ClaimStepRequest,
    ctx: OrchestrationAdminContext = Depends(get_orchestration_context),
    x_program_id: UUID = Header(..., alias="X-Program-ID"),
    x_actor: Optional[str] = Header(None, alias="X-Actor"),
):
    """Claim a queued step for processing."""
    actor = x_actor or ctx.admin_actor
    try:
        result = await runner.claim_step(
            step_run_id=step_run_id,
            worker_id=body.worker_id,
            program_id=x_program_id,
            actor=actor,
            request_id=ctx.request_id,
        )
        if result is None:
            raise HTTPException(
                status_code=409,
                detail="Step not claimable — already claimed or not in queued status",
            )
        return StepRunResponse(**result)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to claim step")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/steps/{step_run_id}/complete", response_model=StepRunResponse)
async def complete_step(
    step_run_id: UUID,
    body: CompleteStepRequest,
    ctx: OrchestrationAdminContext = Depends(get_orchestration_context),
    x_program_id: UUID = Header(..., alias="X-Program-ID"),
    x_actor: Optional[str] = Header(None, alias="X-Actor"),
):
    """Mark a running step as completed."""
    actor = x_actor or ctx.admin_actor
    try:
        result = await runner.complete_step(
            step_run_id=step_run_id,
            output=body.output,
            program_id=x_program_id,
            actor=actor,
            request_id=ctx.request_id,
        )
        if result is None:
            raise HTTPException(
                status_code=409,
                detail="Step not completable — not in running status",
            )
        return StepRunResponse(**result)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to complete step")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/steps/{step_run_id}/fail", response_model=StepRunResponse)
async def fail_step(
    step_run_id: UUID,
    body: FailStepRequest,
    ctx: OrchestrationAdminContext = Depends(get_orchestration_context),
    x_program_id: UUID = Header(..., alias="X-Program-ID"),
    x_actor: Optional[str] = Header(None, alias="X-Actor"),
):
    """Mark a running step as failed (may trigger retry)."""
    actor = x_actor or ctx.admin_actor
    try:
        result = await runner.fail_step(
            step_run_id=step_run_id,
            error=body.error,
            program_id=x_program_id,
            actor=actor,
            request_id=ctx.request_id,
        )
        if result is None:
            raise HTTPException(
                status_code=409,
                detail="Step not failable — not in running status",
            )
        return StepRunResponse(**result)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to fail step")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Step Events
# =============================================================================

@router.get(
    "/steps/{step_run_id}/events",
    response_model=list[StepRunEventResponse],
)
async def get_step_events(
    step_run_id: UUID,
    x_program_id: UUID = Header(..., alias="X-Program-ID"),
):
    """Get the event trail for a step run."""
    try:
        events = await runner.get_step_events(step_run_id, x_program_id)
        return [StepRunEventResponse(**e) for e in events]
    except LiteModeError as e:
        _handle_lite_mode(e)
    except Exception as e:
        logger.exception("Failed to get step events")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# A8 Batch Bridge Callback
# =============================================================================

from pydantic import BaseModel
from typing import Any


class BatchCompleteCallback(BaseModel):
    """Callback payload when an A8 batch completes."""
    batch_id: UUID
    program_id: UUID
    output: dict[str, Any] = {}


@router.post("/batch/complete", response_model=StepRunResponse)
async def batch_complete(
    body: BatchCompleteCallback,
    ctx: OrchestrationAdminContext = Depends(get_orchestration_context),
    x_actor: Optional[str] = Header(None, alias="X-Actor"),
):
    """Callback endpoint for A8 batch worker completion."""
    actor = x_actor or ctx.admin_actor
    try:
        result = await runner.on_batch_complete(
            batch_id=body.batch_id,
            program_id=body.program_id,
            output=body.output,
            actor=actor,
            request_id=ctx.request_id,
        )
        if result is None:
            raise HTTPException(
                status_code=404,
                detail="No running step found for this batch_id",
            )
        return StepRunResponse(**result)
    except LiteModeError as e:
        _handle_lite_mode(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to process batch complete")
        raise HTTPException(status_code=500, detail=str(e))
