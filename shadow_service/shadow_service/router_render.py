"""Phase 7.0 — Document Render Router.

FastAPI router for the document rendering pipeline.
Mounts at /render prefix.

Phase 7.0C: Tenant-safe auth with program_id ownership enforcement.
Phase 7.0D: Rate limiting, concurrency caps, idempotency, TTL cleanup.

Endpoints:
  POST /render/jobs                         — Create + execute a render job
  GET  /render/jobs/:render_job_id          — Get render job status
  GET  /render/jobs/:render_job_id/download — Download rendered artifact
  GET  /render/proof-pack/:proof_pack_id    — List render jobs for a proof pack
  POST /render/cleanup                      — TTL cleanup of expired FAILED jobs
"""

from __future__ import annotations

import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from starlette.responses import Response as StarletteResponse

from . import db
from . import sql_render_jobs as rj_sql
from . import sql_proof_pack as pp_sql
from .models_render import (
    ArtifactType,
    RenderRequest,
    RenderResult,
    RenderStatus,
    compute_inputs_hash,
)
from .contract_hashes import get_contract_snapshot, validate_ectd_bundle

# Auto-register all renderers
from . import renderers  # noqa: F401
from .render_runner import create_and_execute_render, cleanup_expired_jobs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/render", tags=["Document Rendering (Phase 7.0)"])


# ═══════════════════════════════════════════════════════════════════════════════
# Auth (reuse predicate admin pattern)
# ═══════════════════════════════════════════════════════════════════════════════

def _validate_uuid(value: str, name: str = "id") -> str:
    """Validate that a string is a well-formed UUID. Returns canonical form."""
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Invalid {name} format")


async def require_render_auth(
    x_admin_token: str = Header(None, alias="X-Admin-Token"),
):
    """Require admin token for render operations.

    Uses constant-time comparison to prevent timing attacks.
    Refuses to start if REVIEW_ADMIN_TOKEN is not configured.
    Phase 7.0C: reads from Settings.review_admin_token (properly declared field).
    """
    from .config import get_settings
    settings = get_settings()
    expected = settings.review_admin_token
    if not expected:
        logger.error("REVIEW_ADMIN_TOKEN not configured — render endpoints disabled")
        raise HTTPException(status_code=503, detail="Service not configured")
    if not x_admin_token or not hmac.compare_digest(
        x_admin_token.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ═══════════════════════════════════════════════════════════════════════════════
# POST /render/jobs — Create + Execute Render Job
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/jobs", dependencies=[Depends(require_render_auth)])
async def create_render_job(
    body: RenderRequest,
):
    """Create and immediately execute a document render job.

    Validates contract state before rendering. Returns 409 if proof pack
    has block_download=true or eCTD bundle is invalid.
    """
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # ── Runtime eCTD bundle validation (hard-stop, same as proof-pack endpoints) ──
    bundle_valid, bundle_errors = validate_ectd_bundle()
    if not bundle_valid:
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": "RENDER_SCHEMA_INVALID",
                "validation_errors": bundle_errors,
                "message": "eCTD bundle data does not validate. Render blocked.",
            },
        )

    # ── Validate + verify proof pack exists and is not blocked ──
    proof_pack_id = _validate_uuid(body.proof_pack_id, "proof_pack_id")
    pp_row = await pool.fetchrow(pp_sql.SELECT_PROOF_PACK_BY_ID, proof_pack_id)
    if not pp_row:
        raise HTTPException(status_code=404, detail="Proof pack not found")

    proof_pack_program_id = str(pp_row.get("program_id", ""))
    requested_program_id = str(body.program_id or "")
    if requested_program_id and proof_pack_program_id and requested_program_id != proof_pack_program_id:
        raise HTTPException(
            status_code=403,
            detail="Program mismatch for proof pack",
        )

    if pp_row.get("block_download"):
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": "RENDER_BLOCKED",
                "message": "Proof pack is blocked due to contract drift. Render refused.",
            },
        )

    # ── Execute render ──
    try:
        artifact_bytes, job_record = await create_and_execute_render(
            pool,
            proof_pack_id=proof_pack_id,
            artifact_type=body.artifact_type.value,
            user_id=body.user_id,
            request_id=body.request_id or str(uuid.uuid4()),
            program_id=proof_pack_program_id,
            idempotency_key=body.idempotency_key,
        )
    except ValueError as exc:
        err_msg = str(exc)
        if "Concurrency cap" in err_msg or "Rate limit" in err_msg:
            logger.warning("Render job throttled: %s", err_msg)
            raise HTTPException(status_code=429, detail="Too many render requests. Try again later.")
        logger.warning("Render job rejected: %s", exc)
        raise HTTPException(status_code=400, detail="Render request rejected. Check proof pack status.")
    except Exception as exc:
        logger.error("Render job failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal render error")

    # ── Audit event (regulatory-critical — log escalation on failure) ──
    audit_ok = False
    try:
        contract = get_contract_snapshot()
        await pool.fetchrow(
            pp_sql.INSERT_AUDIT_EVENT,
            pp_row["id"], pp_row.get("program_id"), body.user_id,
            "RENDER_COMPLETED",
            pp_row.get("subject_hash", ""), pp_row.get("manifest_hash", ""),
            contract.get("risk_vocab_hash", ""),
            contract.get("risk_codes_lock_hash", ""),
            contract.get("schema_hash", ""),
            contract.get("generator_version", ""),
            body.request_id or str(uuid.uuid4()),
            json.dumps(contract),
            json.dumps({
                "artifact_type": body.artifact_type.value,
                "render_job_id": job_record.get("id", ""),
                "artifact_hash": job_record.get("artifact_hash", ""),
                "artifact_size_bytes": job_record.get("artifact_size_bytes", 0),
            }),
        )
        audit_ok = True
    except Exception as audit_exc:
        logger.error("AUDIT FAILURE [RENDER_COMPLETED]: %s — regulatory escalation required", audit_exc)

    return {
        "render_job_id": str(job_record.get("id", "")),
        "proof_pack_id": proof_pack_id,
        "artifact_type": body.artifact_type.value,
        "status": job_record.get("status", "COMPLETED"),
        "inputs_hash": job_record.get("inputs_hash", ""),
        "artifact_hash": job_record.get("artifact_hash"),
        "artifact_size_bytes": job_record.get("artifact_size_bytes"),
        "artifact_path": job_record.get("artifact_path"),
        "created_at": str(job_record.get("created_at", "")),
        "completed_at": str(job_record.get("completed_at", "")),
        "audit_recorded": audit_ok,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# GET /render/jobs/:render_job_id — Job Status
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/jobs/{render_job_id}", dependencies=[Depends(require_render_auth)])
async def get_render_job(
    render_job_id: str,
    program_id: str = Query(..., description="Program ID for ownership check"),
):
    """Get the status of a render job.

    Phase 7.0C: Requires program_id and enforces ownership via scoped query.
    """
    render_job_id = _validate_uuid(render_job_id, "render_job_id")
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Phase 7.0C — ownership enforcement (program_id required)
    job = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_ID_SCOPED, render_job_id, program_id)

    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")

    # Sanitize error — don't leak internal details to client
    safe_error = None
    if job.get("error"):
        safe_error = "Render failed. Contact support for details."

    return {
        "render_job_id": str(job["id"]),
        "proof_pack_id": str(job["proof_pack_id"]),
        "artifact_type": job["artifact_type"],
        "status": job["status"],
        "inputs_hash": job["inputs_hash"],
        "artifact_hash": job.get("artifact_hash"),
        "artifact_size_bytes": job.get("artifact_size_bytes"),
        "artifact_path": job.get("artifact_path"),
        "error": safe_error,
        "started_at": str(job.get("started_at", "")),
        "completed_at": str(job.get("completed_at", "")),
        "created_at": str(job.get("created_at", "")),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# GET /render/jobs/:render_job_id/download — Download Artifact
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/jobs/{render_job_id}/download", dependencies=[Depends(require_render_auth)])
async def download_render_artifact(
    render_job_id: str,
    user_id: str = Query("system", description="User requesting download"),
    program_id: str = Query(..., description="Program ID for ownership scoping"),
):
    """Download the rendered artifact (PDF/DOCX/ZIP) for a completed job.

    Re-renders on the fly (v1 — no blob store caching yet).
    """
    render_job_id = _validate_uuid(render_job_id, "render_job_id")
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    job = await pool.fetchrow(rj_sql.SELECT_RENDER_JOB_BY_ID_SCOPED, render_job_id, program_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")

    if job["status"] != "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail="Render job is not completed. Cannot download.",
        )

    # Re-render (v1: no artifact store, re-generate from proof pack data)
    pp_row = await pool.fetchrow(pp_sql.SELECT_PROOF_PACK_FOR_DOWNLOAD_BY_ID, job["proof_pack_id"])
    if not pp_row:
        raise HTTPException(status_code=404, detail="Proof pack not found for this render job")

    from .render_runner import get_renderer
    renderer = get_renderer(job["artifact_type"])
    artifact_bytes = renderer(pp_row, str(job.get("request_id", "")))

    # Determine content type + filename
    artifact_type = job["artifact_type"]
    content_type_map = {
        "defense_packet_pdf": "application/pdf",
        "defense_packet_docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ectd_sequence_zip": "application/zip",
        "se_matrix_pdf": "application/pdf",
        "proof_pack_summary_pdf": "application/pdf",
        "audit_trail_pdf": "application/pdf",
    }
    filename_map = {
        "defense_packet_pdf": "DefensePacketReport.pdf",
        "defense_packet_docx": "DefensePacketReport.docx",
        "ectd_sequence_zip": "ectd_sequence.zip",
        "se_matrix_pdf": "SEMatrixReport.pdf",
        "proof_pack_summary_pdf": "ProofPackSummary.pdf",
        "audit_trail_pdf": "AuditTrailReport.pdf",
    }
    content_type = content_type_map.get(artifact_type, "application/octet-stream")
    filename = filename_map.get(artifact_type, f"{artifact_type}_output")

    # Audit download (regulatory-critical)
    try:
        contract = get_contract_snapshot()
        await pool.fetchrow(
            pp_sql.INSERT_AUDIT_EVENT,
            job["proof_pack_id"], pp_row.get("program_id"), user_id,
            "RENDER_DOWNLOADED",
            pp_row.get("subject_hash", ""), pp_row.get("manifest_hash", ""),
            contract.get("risk_vocab_hash", ""),
            contract.get("risk_codes_lock_hash", ""),
            contract.get("schema_hash", ""),
            contract.get("generator_version", ""),
            str(job.get("request_id", "")),
            json.dumps(contract),
            json.dumps({"artifact_type": artifact_type, "render_job_id": str(job["id"])}),
        )
    except Exception as audit_exc:
        logger.error("AUDIT FAILURE [RENDER_DOWNLOADED]: %s — regulatory escalation required", audit_exc)

    return StarletteResponse(
        content=artifact_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(artifact_bytes)),
            "X-Render-Job-Id": str(job["id"]),
            "X-Artifact-Hash": job.get("artifact_hash", ""),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# GET /render/proof-pack/:proof_pack_id — List Jobs for a Proof Pack
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/proof-pack/{proof_pack_id}", dependencies=[Depends(require_render_auth)])
async def list_render_jobs(
    proof_pack_id: str,
    program_id: str = Query(..., description="Program ID for ownership check"),
):
    """List all render jobs for a proof pack.

    Phase 7.0C: Requires program_id and enforces ownership via scoped query.
    """
    proof_pack_id = _validate_uuid(proof_pack_id, "proof_pack_id")
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Phase 7.0C — ownership enforcement (program_id required)
    rows = await pool.fetch(rj_sql.SELECT_RENDER_JOBS_BY_PROOF_PACK_SCOPED, proof_pack_id, program_id)

    return {
        "proof_pack_id": proof_pack_id,
        "render_jobs": [
            {
                "render_job_id": str(r["id"]),
                "artifact_type": r["artifact_type"],
                "status": r["status"],
                "inputs_hash": r["inputs_hash"],
                "artifact_hash": r.get("artifact_hash"),
                "artifact_size_bytes": r.get("artifact_size_bytes"),
                "created_at": str(r.get("created_at", "")),
                "completed_at": str(r.get("completed_at", "")),
            }
            for r in rows
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# POST /render/cleanup — TTL Cleanup (Phase 7.0D)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/cleanup", dependencies=[Depends(require_render_auth)])
async def cleanup_render_jobs(
    ttl_days: int = Query(None, description="Override TTL in days (default from config)"),
):
    """Delete expired FAILED render jobs beyond TTL.

    Phase 7.0D: Maintenance endpoint for job table hygiene.
    """
    pool = await db.get_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable")

    deleted = await cleanup_expired_jobs(pool, ttl_days)
    return {"deleted_count": deleted, "ttl_days": ttl_days or "default"}
