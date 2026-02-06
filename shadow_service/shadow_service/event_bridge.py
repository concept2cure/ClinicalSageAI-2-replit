"""Phase 5.2 — Event Bridge: Orchestration → Evidence Provenance.

Translates orchestration lifecycle events into evidence.provenance records,
making every workflow step and batch execution forensically traceable back
to the claims and sources it produced.

Integration points:
  - orchestration_runner.complete_step  →  on_step_completed
  - orchestration_runner.fail_step      →  on_step_failed
  - orchestration_runner.on_batch_complete → on_batch_completed

Design principles:
  - Fire-and-forget: bridge failures logged but never block orchestration
  - Idempotent: duplicate calls produce duplicate provenance (append-only)
  - Decoupled: evidence_runner is the only dependency
"""

import json
import logging
from typing import Any, Optional
from uuid import UUID

from . import evidence_runner

logger = logging.getLogger(__name__)


# =============================================================================
# Event handlers — called by orchestration_runner
# =============================================================================

async def on_step_completed(
    step_run_id: UUID,
    workflow_run_id: UUID,
    program_id: UUID,
    output: dict[str, Any],
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Bridge: step completion → evidence provenance.

    1. Creates provenance record for the step event
    2. If output contains claim_ids → creates per-claim provenance
    3. If output contains source_ids → creates per-source provenance
    4. Re-scores any referenced claims (confidence refresh)

    Returns summary: { provenance_ids, claims_scored, errors }
    """
    result = {
        "provenance_ids": [],
        "claims_scored": [],
        "sources_linked": [],
        "errors": [],
    }

    try:
        # 1. Step-level provenance (always)
        prov = await evidence_runner.create_provenance(
            program_id=program_id,
            event_type="step_completed",
            workflow_run_id=workflow_run_id,
            step_run_id=step_run_id,
            actor=actor,
            request_id=request_id,
            metadata={
                "output_keys": list(output.keys()),
                "trigger": "event_bridge",
            },
        )
        result["provenance_ids"].append(str(prov["id"]))

        # 2. Per-claim provenance + scoring refresh
        claim_ids = _extract_uuids(output, "claim_ids")
        for cid in claim_ids:
            try:
                cprov = await evidence_runner.create_provenance(
                    program_id=program_id,
                    event_type="claim_produced",
                    claim_id=cid,
                    workflow_run_id=workflow_run_id,
                    step_run_id=step_run_id,
                    actor=actor,
                    request_id=request_id,
                    metadata={"trigger": "step_completed"},
                )
                result["provenance_ids"].append(str(cprov["id"]))

                # Re-score the claim
                score = await evidence_runner.score_claim(cid, program_id)
                result["claims_scored"].append({
                    "claim_id": str(cid),
                    "confidence": score.get("computed_confidence", 0.0),
                })
            except Exception as e:
                logger.warning("Bridge: error linking claim %s: %s", cid, e)
                result["errors"].append(f"claim:{cid}:{e}")

        # 3. Per-source provenance
        source_ids = _extract_uuids(output, "source_ids")
        for sid in source_ids:
            try:
                sprov = await evidence_runner.create_provenance(
                    program_id=program_id,
                    event_type="source_captured",
                    source_id=sid,
                    workflow_run_id=workflow_run_id,
                    step_run_id=step_run_id,
                    actor=actor,
                    request_id=request_id,
                    metadata={"trigger": "step_completed"},
                )
                result["provenance_ids"].append(str(sprov["id"]))
                result["sources_linked"].append(str(sid))
            except Exception as e:
                logger.warning("Bridge: error linking source %s: %s", sid, e)
                result["errors"].append(f"source:{sid}:{e}")

    except Exception as e:
        logger.error("Bridge: on_step_completed failed: %s", e, exc_info=True)
        result["errors"].append(f"step_provenance:{e}")

    logger.info(
        "Bridge: step_completed step=%s wf=%s → %d provenance, %d scored",
        step_run_id, workflow_run_id,
        len(result["provenance_ids"]), len(result["claims_scored"]),
    )
    return result


async def on_step_failed(
    step_run_id: UUID,
    workflow_run_id: UUID,
    program_id: UUID,
    error: str,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Bridge: step failure → evidence provenance (forensic record)."""
    result = {"provenance_ids": [], "errors": []}

    try:
        prov = await evidence_runner.create_provenance(
            program_id=program_id,
            event_type="step_failed",
            workflow_run_id=workflow_run_id,
            step_run_id=step_run_id,
            actor=actor,
            request_id=request_id,
            metadata={
                "error": error[:500],  # cap error length for metadata
                "trigger": "event_bridge",
            },
        )
        result["provenance_ids"].append(str(prov["id"]))
    except Exception as e:
        logger.error("Bridge: on_step_failed failed: %s", e, exc_info=True)
        result["errors"].append(f"step_failed_provenance:{e}")

    logger.info("Bridge: step_failed step=%s wf=%s", step_run_id, workflow_run_id)
    return result


async def on_batch_completed(
    batch_id: UUID,
    step_run_id: UUID,
    workflow_run_id: UUID,
    program_id: UUID,
    output: dict[str, Any],
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Bridge: A8 batch completion → evidence provenance + claim scoring refresh.

    1. Creates batch-level provenance
    2. Links claims/sources from output
    3. Re-scores all referenced claims
    """
    result = {
        "provenance_ids": [],
        "claims_scored": [],
        "sources_linked": [],
        "errors": [],
    }

    try:
        # 1. Batch-level provenance
        prov = await evidence_runner.create_provenance(
            program_id=program_id,
            event_type="batch_completed",
            workflow_run_id=workflow_run_id,
            step_run_id=step_run_id,
            batch_id=batch_id,
            actor=actor,
            request_id=request_id,
            metadata={
                "output_keys": list(output.keys()),
                "trigger": "a8_batch_complete",
            },
        )
        result["provenance_ids"].append(str(prov["id"]))

        # 2. Per-claim provenance + scoring
        claim_ids = _extract_uuids(output, "claim_ids")
        for cid in claim_ids:
            try:
                cprov = await evidence_runner.create_provenance(
                    program_id=program_id,
                    event_type="claim_produced",
                    claim_id=cid,
                    workflow_run_id=workflow_run_id,
                    step_run_id=step_run_id,
                    batch_id=batch_id,
                    actor=actor,
                    request_id=request_id,
                    metadata={"trigger": "batch_completed"},
                )
                result["provenance_ids"].append(str(cprov["id"]))

                score = await evidence_runner.score_claim(cid, program_id)
                result["claims_scored"].append({
                    "claim_id": str(cid),
                    "confidence": score.get("computed_confidence", 0.0),
                })
            except Exception as e:
                logger.warning("Bridge: batch claim error %s: %s", cid, e)
                result["errors"].append(f"claim:{cid}:{e}")

        # 3. Per-source provenance
        source_ids = _extract_uuids(output, "source_ids")
        for sid in source_ids:
            try:
                sprov = await evidence_runner.create_provenance(
                    program_id=program_id,
                    event_type="source_captured",
                    source_id=sid,
                    workflow_run_id=workflow_run_id,
                    step_run_id=step_run_id,
                    batch_id=batch_id,
                    actor=actor,
                    request_id=request_id,
                    metadata={"trigger": "batch_completed"},
                )
                result["provenance_ids"].append(str(sprov["id"]))
                result["sources_linked"].append(str(sid))
            except Exception as e:
                logger.warning("Bridge: batch source error %s: %s", sid, e)
                result["errors"].append(f"source:{sid}:{e}")

    except Exception as e:
        logger.error("Bridge: on_batch_completed failed: %s", e, exc_info=True)
        result["errors"].append(f"batch_provenance:{e}")

    logger.info(
        "Bridge: batch_completed batch=%s step=%s → %d provenance, %d scored",
        batch_id, step_run_id,
        len(result["provenance_ids"]), len(result["claims_scored"]),
    )
    return result


# =============================================================================
# Helpers
# =============================================================================

def _extract_uuids(output: dict[str, Any], key: str) -> list[UUID]:
    """Safely extract a list of UUIDs from step/batch output.

    Handles: list of UUID strings, list of dicts with 'id' key, single UUID string.
    """
    raw = output.get(key)
    if raw is None:
        return []

    uuids: list[UUID] = []

    if isinstance(raw, str):
        # Single UUID string
        try:
            uuids.append(UUID(raw))
        except ValueError:
            pass
    elif isinstance(raw, list):
        for item in raw:
            try:
                if isinstance(item, str):
                    uuids.append(UUID(item))
                elif isinstance(item, dict) and "id" in item:
                    uuids.append(UUID(str(item["id"])))
                elif isinstance(item, UUID):
                    uuids.append(item)
            except (ValueError, TypeError):
                continue

    return uuids
