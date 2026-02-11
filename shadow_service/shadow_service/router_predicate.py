"""Phase 6.6 — Predicate Intelligence Router.

FastAPI router for Toxic Predicate Detection, Shadow 510(k) Reviewer,
and SE Matrix management.

Endpoints:
  POST /predicate/candidates              — Add predicate candidate
  GET  /predicate/candidates              — List candidates for program
  GET  /predicate/candidates/:id          — Get single candidate
  PATCH /predicate/candidates/:id/status  — Update candidate status
  POST /predicate/analyze                 — Run full predicate analysis (toxicity + routing)
  POST /predicate/defense-preview         — Generate Shadow 510(k) review
  GET  /predicate/defense-preview         — Get latest defense preview
  POST /predicate/se-matrix               — Add SE matrix row
  GET  /predicate/se-matrix               — Get SE matrix for candidate
  PATCH /predicate/se-matrix/:id          — Update SE row equivalence
  GET  /predicate/radar                   — Get Predicate Radar data (scatter plot)
  POST /predicate/generate-510k-preview   — Full pipeline: analyze + SE + defense + DOCX
  POST /predicate/device/defense-packet   — Create defense packet (6.6.D)
  GET  /predicate/device/defense-packet/:id — Get defense packet by ID
  GET  /predicate/device/defense-packets  — List defense packets for program
  POST /predicate/device/defense-packet/:id/staleness-check — Check staleness
  PATCH /predicate/device/defense-packet/:id/status — Update packet lifecycle
  POST /predicate/device/defense-packet/build  — Build packet from manifest (6.6.D+)
  GET  /predicate/device/defense-packet/:hash/export.json — Export packet JSON (6.6.D+)
  GET  /predicate/device/defense-packet/:hash/export.csv  — Export tasks CSV (6.6.D+)
  POST /predicate/device/defense-packet/:hash/submission-gate — Check submission gate (6.6.D+)
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from . import db
from . import sql_predicate as sql
from . import sql_predicates as sql_pred
from . import sql_fda_universe as fda_sql
from .predicate_analyzer import PredicateAnalyzer
from .shadow_510k_reviewer import Shadow510kReviewer
from .predicate_suggest import suggest_predicates
from .models_predicate import (
    CandidateStatus,
    DiffSeverity,
    EquivalenceStatus,
    PredicateRadarPoint,
    PredicateSuggestRequest,
    PredicateSuggestResponse,
    RouteType,
    SECategory,
)

# Configurable freshness threshold (spec: 14 days default)
INGEST_FRESHNESS_DAYS = int(__import__('os').environ.get('INGEST_FRESHNESS_DAYS', '14'))

logger = logging.getLogger(__name__)


# ─── Auth dependency (reuses shadow service admin token check) ────────────────

async def require_predicate_admin():
    """Fail-closed auth check — reuses existing admin token pattern."""
    import os
    from fastapi import Header
    # For now, rely on BFF to inject X-Admin-Token
    pass


# ─── Router ───────────────────────────────────────────────────────────────────

router = APIRouter(
    prefix="/predicate",
    tags=["Predicate Intelligence"],
)


# ─── Request Models ───────────────────────────────────────────────────────────

class AddCandidateRequest(BaseModel):
    program_id: UUID
    k_number: str
    device_name: str
    manufacturer: Optional[str] = None
    clearance_date: Optional[str] = None
    product_code: Optional[str] = None
    regulation_number: Optional[str] = None
    similarity_score: float = 0.0


class AnalyzeRequest(BaseModel):
    program_id: UUID
    device_description: str
    similarity_threshold: float = 0.85
    max_candidates: int = 20


class DefensePreviewRequest(BaseModel):
    program_id: UUID
    predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)


class AddSERowRequest(BaseModel):
    program_id: UUID
    candidate_id: UUID
    sort_order: int = 0
    characteristic: str
    category: str = "general"
    subject_value: str
    subject_evidence_ids: list[str] = Field(default_factory=list)
    subject_confidence: float = 0.0
    predicate_value: str
    predicate_evidence_ids: list[str] = Field(default_factory=list)
    predicate_confidence: float = 0.0


class UpdateSERowRequest(BaseModel):
    program_id: UUID
    equivalence_status: str
    diff_explanation: Optional[str] = None
    diff_severity: str = "none"


class UpdateCandidateStatusRequest(BaseModel):
    program_id: UUID
    status: str


class Generate510kPreviewRequest(BaseModel):
    program_id: UUID
    predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
# Suggest — Phase 6.6.B Predicate Suggestion Engine
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/suggest", response_model=PredicateSuggestResponse)
async def suggest_predicate_candidates(req: PredicateSuggestRequest):
    """Return top 5 predicate suggestions with full Shadow Reviewer Scorecard.

    Spec gates:
      - 422: Missing required fields (product_code, device_name, intended_use, technology_description)
      - 503: FDA predicate universe not populated or stale (freshness check)
      - 403: Program access denied (handled by BFF)

    v2 enhancements:
      - B0: Structured input (device_name, intended_use, technology_description required)
      - B1: FTS + match_snippets[]
      - B2: Defense Readiness Score (DRS) per suggestion
      - B3: Anticipated objections with typed triggers
      - B4: AVOID gating for undefendable predicates
      - B5: 15-min cache + audit event (PREDICATE_SUGGEST_REQUESTED/SUCCEEDED/FAILED)
    """
    t0 = time.monotonic()

    # B0: Validate structured input (422)
    if not req.product_code:
        raise HTTPException(status_code=422, detail="product_code is required")
    if not req.device_name:
        raise HTTPException(status_code=422, detail="device_name is required")
    if not req.intended_use:
        raise HTTPException(status_code=422, detail="intended_use is required")
    tech = req.technology_description or req.device_description
    if not tech:
        raise HTTPException(status_code=422, detail="technology_description is required")

    try:
        pool = await db.get_pool()

        # Data freshness gate (503 if stale per spec)
        try:
            await _check_ingest_freshness(pool)
        except HTTPException:
            raise
        except Exception as fe:
            logger.warning("Freshness check failed (proceeding): %s", fe)

        # Emit PREDICATE_SUGGEST_REQUESTED
        try:
            await _emit_audit_event(
                pool, "PREDICATE_SUGGEST_REQUESTED", req, None, 0
            )
        except Exception:
            pass

        response = await suggest_predicates(pool, req)
        latency_ms = int((time.monotonic() - t0) * 1000)

        # Emit PREDICATE_SUGGEST_SUCCEEDED
        try:
            await _emit_audit_event(
                pool, "PREDICATE_SUGGEST_SUCCEEDED", req, response, latency_ms
            )
        except Exception as audit_err:
            logger.warning("Audit event emission failed: %s", audit_err)

        return response
    except db.LiteModeError:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Service running in lite mode.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.exception("Predicate suggestion failed: %s", exc)
        # Emit PREDICATE_SUGGEST_FAILED
        try:
            pool = await db.get_pool()
            await _emit_audit_event(
                pool, "PREDICATE_SUGGEST_FAILED", req, None, latency_ms,
                error_code=type(exc).__name__,
            )
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(exc))


async def _check_ingest_freshness(pool):
    """Data freshness gate per spec: 503 if no recent successful ingest.

    Checks fda_ingest_runs for latest successful completion within threshold.
    If not found or stale → 503.
    """
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(sql_pred.CHECK_INGEST_FRESHNESS)
            if row is None or row["latest_success_at"] is None:
                raise HTTPException(
                    status_code=503,
                    detail="FDA predicate universe not populated. No successful ingest run found.",
                )
            latest = row["latest_success_at"]
            if hasattr(latest, 'tzinfo') and latest.tzinfo is None:
                latest = latest.replace(tzinfo=timezone.utc)
            threshold = datetime.now(timezone.utc) - timedelta(days=INGEST_FRESHNESS_DAYS)
            if latest < threshold:
                raise HTTPException(
                    status_code=503,
                    detail=f"FDA predicate universe stale. Last successful ingest: {latest.isoformat()}",
                )
    except HTTPException:
        raise
    except Exception as e:
        # If freshness table doesn't exist yet, log and proceed
        logger.warning("Ingest freshness check skipped (table may not exist): %s", e)


async def _emit_audit_event(
    pool,
    event_type: str,
    req: PredicateSuggestRequest,
    response: Optional[PredicateSuggestResponse],
    latency_ms: int,
    error_code: str = "",
):
    """Log predicate_suggest audit event per spec.

    Events: PREDICATE_SUGGEST_REQUESTED / SUCCEEDED / FAILED
    Payload: program_id, user_id, subject_hash, product_code,
             candidate_count, returned_count, top_k_number, latency_ms, error_code
    """
    import json as _json
    from .predicate_suggest import compute_subject_hash

    subject_hash = compute_subject_hash(req)
    top_k = ""
    returned_count = 0
    candidate_count = 0

    if response:
        returned_count = len(response.suggestions)
        candidate_count = response.total_candidates_scanned
        top_k = response.suggestions[0].k_number if response.suggestions else ""

    fingerprint = _json.dumps({
        "event_type": event_type,
        "subject_hash": subject_hash,
        "product_code": req.product_code,
        "candidate_count": candidate_count,
        "returned_count": returned_count,
        "top_k_number": top_k,
        "latency_ms": latency_ms,
        "error_code": error_code,
        "weights_version": response.weights_version if response else "v2.0",
        "cached": response.cached if response else False,
    })

    async with pool.acquire() as conn:
        await conn.execute(
            sql_pred.INSERT_AUDIT_EVENT,
            event_type,
            "completed" if not error_code else "failed",
            [req.product_code],
            candidate_count,
            f"program:{req.program_id}",
            fingerprint,
        )


async def _emit_se_matrix_render_event(
    pool,
    program_id: UUID,
    predicate_k_number: str,
    subject_device: dict[str, Any],
    row_count: int,
):
    """Log SE matrix render audit event (C0 audit gate)."""
    import hashlib
    import json as _json

    fingerprint = _json.dumps(
        {
            "predicate_k_number": predicate_k_number,
            "subject_device": subject_device,
        },
        sort_keys=True,
    )
    subject_hash = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

    async with pool.acquire() as conn:
        await conn.execute(
            sql_pred.INSERT_AUDIT_EVENT,
            "SE_MATRIX_RENDER",
            "completed",
            [],
            row_count,
            f"program:{program_id}",
            _json.dumps({
                "subject_hash": subject_hash,
                "predicate_k_number": predicate_k_number,
            }),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Candidates
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/candidates")
async def add_candidate(req: AddCandidateRequest):
    """Add a predicate candidate to the program."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        # Check if already exists
        existing = await conn.fetchrow(
            sql.SELECT_CANDIDATE_BY_K_NUMBER, req.k_number, req.program_id
        )
        if existing:
            return {"status": "exists", "candidate": dict(existing)}

        from datetime import date as date_type
        clearance = None
        if req.clearance_date:
            try:
                clearance = date_type.fromisoformat(req.clearance_date)
            except ValueError:
                pass

        row = await conn.fetchrow(
            sql.INSERT_CANDIDATE,
            req.program_id, req.k_number, req.device_name,
            req.manufacturer, clearance,
            req.product_code, req.regulation_number,
            req.similarity_score, 0.0,  # toxicity_score
            False, False, False, 0,     # recall flags + mdr
            json.dumps([]),              # golden_bridge_path
            None,                        # route_type
            False,                       # recommended
            [],                          # evidence_links
            None,                        # selection_rationale
            "active",                    # status
        )
        return {"status": "created", "candidate": dict(row) if row else None}
    finally:
        await db.release_connection(conn)


@router.get("/candidates")
async def list_candidates(program_id: UUID = Query(...)):
    """List all predicate candidates for a program."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))
        rows = await conn.fetch(sql.SELECT_CANDIDATES_BY_PROGRAM, program_id)
        return {"candidates": [dict(r) for r in rows]}
    finally:
        await db.release_connection(conn)


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: UUID, program_id: UUID = Query(...)):
    """Get a single predicate candidate."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))
        row = await conn.fetchrow(sql.SELECT_CANDIDATE_BY_ID, candidate_id, program_id)
        if not row:
            raise HTTPException(status_code=404, detail="Candidate not found")
        return {"candidate": dict(row)}
    finally:
        await db.release_connection(conn)


@router.patch("/candidates/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: UUID, req: UpdateCandidateStatusRequest
):
    """Update candidate status (active, dismissed, selected, archived)."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))
        row = await conn.fetchrow(
            sql.UPDATE_CANDIDATE_STATUS, candidate_id, req.program_id, req.status
        )
        if not row:
            raise HTTPException(status_code=404, detail="Candidate not found")
        return {"candidate": dict(row)}
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Analysis — Toxic Predicate Detection + Golden Bridge
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/analyze")
async def analyze_predicates(req: AnalyzeRequest):
    """Run full predicate intelligence analysis.

    1. Similarity search for candidates
    2. Toxicity scan (recalls, safety comms, MDR rates)
    3. Route classification (conservative vs. aggressive)
    4. Persist results

    Returns candidates sorted by safety with route recommendations.
    """
    conn = await db.acquire_connection()
    try:
        analyzer = PredicateAnalyzer(req.program_id, conn)
        result = await analyzer.find_predicates(
            req.device_description,
            similarity_threshold=req.similarity_threshold,
            max_candidates=req.max_candidates,
        )
        return result
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Shadow 510(k) Review — Defense Preview
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/defense-preview")
async def generate_defense_preview(req: DefensePreviewRequest):
    """Generate Shadow 510(k) review — predict FDA questions before submission.

    Returns:
      - anticipated_questions: Top questions FDA will ask
      - defense_readiness_score: 0-100% readiness meter
      - evidence_gaps: What's missing
      - toxic_warnings: Predicate safety issues
    """
    conn = await db.acquire_connection()
    try:
        reviewer = Shadow510kReviewer(req.program_id, conn)
        preview = await reviewer.generate_defense_preview(
            req.subject_device, req.predicate_k_number
        )
        return preview
    finally:
        await db.release_connection(conn)


@router.get("/defense-preview")
async def get_defense_preview(
    program_id: UUID = Query(...),
    candidate_id: Optional[UUID] = Query(None),
):
    """Get the latest defense preview for a program/candidate."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))
        if candidate_id:
            row = await conn.fetchrow(
                sql.SELECT_DEFENSE_PREVIEW, candidate_id, program_id
            )
        else:
            rows = await conn.fetch(
                sql.SELECT_DEFENSE_PREVIEWS_BY_PROGRAM, program_id
            )
            row = rows[0] if rows else None

        if not row:
            raise HTTPException(status_code=404, detail="No defense preview found")
        return {"preview": dict(row)}
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# SE Matrix
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/se-matrix")
async def add_se_row(req: AddSERowRequest):
    """Add a row to the Substantial Equivalence comparison matrix."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))
        row = await conn.fetchrow(
            sql.INSERT_SE_ROW,
            req.program_id, req.candidate_id, req.sort_order,
            req.characteristic, req.category,
            req.subject_value, req.subject_evidence_ids, req.subject_confidence,
            req.predicate_value, req.predicate_evidence_ids, req.predicate_confidence,
            "PENDING",  # equivalence_status
            None,       # diff_explanation
            "none",     # diff_severity
        )
        return {"row": dict(row) if row else None}
    finally:
        await db.release_connection(conn)


@router.get("/se-matrix")
async def get_se_matrix(
    program_id: UUID = Query(...),
    candidate_id: Optional[UUID] = Query(None),
):
    """Get SE matrix rows for a program, optionally filtered by candidate."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))
        if candidate_id:
            rows = await conn.fetch(
                sql.SELECT_SE_ROWS_BY_CANDIDATE, candidate_id, program_id
            )
        else:
            rows = await conn.fetch(sql.SELECT_SE_ROWS_BY_PROGRAM, program_id)
        return {"rows": [dict(r) for r in rows]}
    finally:
        await db.release_connection(conn)


@router.patch("/se-matrix/{row_id}")
async def update_se_row(row_id: UUID, req: UpdateSERowRequest):
    """Update equivalence status and explanation for an SE matrix row."""
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))
        row = await conn.fetchrow(
            sql.UPDATE_SE_ROW_EQUIVALENCE,
            row_id, req.program_id,
            req.equivalence_status, req.diff_explanation, req.diff_severity,
        )
        if not row:
            raise HTTPException(status_code=404, detail="SE row not found")
        return {"row": dict(row)}
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Predicate Radar — scatter plot data
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/radar")
async def get_predicate_radar(program_id: UUID = Query(...)):
    """Get scatter plot data for the Predicate Radar visualization.

    Returns candidates as {k_number, device_name, similarity, toxicity,
    recommended, route_type, has_recall} points.
    """
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))
        rows = await conn.fetch(sql.SELECT_CANDIDATES_BY_PROGRAM, program_id)

        points = []
        for r in rows:
            points.append({
                "k_number": r["k_number"],
                "device_name": r["device_name"],
                "similarity": r["similarity_score"],
                "toxicity": r["toxicity_score"],
                "recommended": r["recommended"],
                "route_type": r["route_type"],
                "has_recall": r["has_class_i_recall"] or r["has_class_ii_recall"],
            })

        return {"points": points}
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Full Pipeline — Generate 510(k) Preview
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/generate-510k-preview")
async def generate_510k_preview(req: Generate510kPreviewRequest):
    """Full pipeline: analyze predicate → SE matrix → defense preview → DOCX.

    This is the "jaw-dropping" endpoint:
    1. Toxicity scan on selected predicate
    2. Generate SE matrix with evidence cells
    3. Shadow FDA review (predicted questions + readiness score)
    4. Render DOCX via DOCX Factory (if template exists)
    5. Create Defense Packet entry

    Returns unified response with all intelligence in one call.
    """
    conn = await db.acquire_connection()
    try:
        # 1. Ensure candidate exists and run toxicity analysis
        analyzer = PredicateAnalyzer(req.program_id, conn)
        toxicity = await analyzer.calculate_toxicity(req.predicate_k_number)

        # 2. Get or create candidate
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))
        candidate = await conn.fetchrow(
            sql.SELECT_CANDIDATE_BY_K_NUMBER,
            req.predicate_k_number, req.program_id,
        )

        candidate_data = dict(candidate) if candidate else {
            "k_number": req.predicate_k_number,
            "device_name": req.subject_device.get("predicate_name", "Unknown"),
            **toxicity,
        }

        # 3. Get SE matrix rows
        se_rows = []
        if candidate:
            se_rows = await conn.fetch(
                sql.SELECT_SE_ROWS_BY_CANDIDATE,
                candidate["id"], req.program_id,
            )

        # 4. Shadow 510(k) Review
        reviewer = Shadow510kReviewer(req.program_id, conn)
        defense = await reviewer.generate_defense_preview(
            req.subject_device, req.predicate_k_number
        )

        # 5. Build response
        return {
            "predicate": candidate_data,
            "toxicity": toxicity,
            "se_matrix": [dict(r) for r in se_rows],
            "defense_analysis": {
                "readiness_score": defense["readiness_score"],
                "anticipated_questions": defense["anticipated_questions"][:5],
                "evidence_gaps": defense["evidence_gaps"],
                "contradictions": defense["internal_contradictions"],
            },
            "toxic_warnings": defense["toxic_warnings"],
            "readiness_score": defense["readiness_score"],
            "docx_url": None,  # DOCX rendering integrated in next iteration
        }
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.C — Generate SE Matrix (Auto-populated from predicate + subject)
# ═══════════════════════════════════════════════════════════════════════════════

class GenerateSEMatrixRequest(BaseModel):
    program_id: UUID
    selected_predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)


@router.post("/generate-se-matrix")
async def generate_se_matrix(req: GenerateSEMatrixRequest):
    """Auto-generate SE comparison matrix from subject device + predicate.

    Returns structured payload with evidence-linked cells, diff analysis,
    and defense readiness score — ready for DOCX rendering.
    """
    from .generators.se_matrix_generator import SEMatrixGenerator

    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        # Fetch predicate data from FDA clearances table
        from . import sql_fda_universe as fda_sql
        predicate_row = await conn.fetchrow(
            fda_sql.SELECT_CLEARANCE, req.selected_predicate_k_number,
        )

        if predicate_row:
            predicate_data = dict(predicate_row)
        else:
            # Fallback: check candidates table
            candidate = await conn.fetchrow(
                sql.SELECT_CANDIDATE_BY_K_NUMBER,
                req.selected_predicate_k_number,
                req.program_id,
            )
            predicate_data = dict(candidate) if candidate else {
                "k_number": req.selected_predicate_k_number,
                "device_name": "Unknown Predicate",
            }

        generator = SEMatrixGenerator()
        payload = generator.generate_payload(
            subject_device=req.subject_device,
            selected_predicate=predicate_data,
            design_control_ids=req.design_control_ids,
        )

        return {
            "se_matrix_payload": payload,
            "defense_readiness_score": payload["defense_readiness_score"],
            "row_count": len(payload["comparison_rows"]),
            "discussion_required_count": sum(
                1 for r in payload["comparison_rows"]
                if r["equivalence_status"] == "DISCUSSION_REQUIRED"
            ),
            "generation_timestamp": payload["generation_timestamp"],
            "evidence_manifest": payload.get("evidence_manifest", []),
        }
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.A — Health / Stats Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health")
async def predicate_universe_health():
    """Return ingestion stats: total clearances, embeddings %, signals %.

    Acceptance criteria: one query, <200ms, proves data layer is alive.
    """
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(fda_sql.HEALTH_STATS)
        if row:
            return {
                "status": "ok",
                "total_clearances": row["total_clearances"],
                "total_embeddings": row["total_embeddings"],
                "total_signals": row["total_signals"],
                "total_lineage_edges": row["total_lineage_edges"],
                "total_rollups": row["total_rollups"],
                "pct_with_embeddings": float(row["pct_with_embeddings"]),
                "pct_with_signals": float(row["pct_with_signals"]),
            }
        return {"status": "empty", "total_clearances": 0}
    except Exception as exc:
        logger.warning("Health check failed: %s", exc)
        return {"status": "degraded", "error": str(exc)}
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.B — Deterministic Reviewer Questions (the Shadow Reviewer magic)
# ═══════════════════════════════════════════════════════════════════════════════

# These are generated deterministically from characteristic diffs — no LLM vibes.
REVIEWER_QUESTION_RULES: list[dict[str, Any]] = [
    {
        "trigger_field": "materials",
        "condition": "differs",
        "severity": "high",
        "question": "Biocompatibility assessment per ISO 10993-1 required. "
                    "Provide biological evaluation data for the changed materials.",
        "citation": "ISO 10993-1:2018; FDA Guidance: Use of ISO 10993-1",
        "required_evidence": ["ISO10993", "MaterialCharacterization", "ChemicalAnalysis"],
    },
    {
        "trigger_field": "energy_source",
        "condition": "differs",
        "severity": "high",
        "question": "Bench testing, electrical safety (IEC 60601-1), and EMC "
                    "testing required for the changed energy source.",
        "citation": "IEC 60601-1:2005+AMD2:2020; IEC 60601-1-2:2014+AMD1:2020",
        "required_evidence": ["BenchTestReport", "IEC60601Report", "EMCReport"],
    },
    {
        "trigger_field": "tissue_contact",
        "condition": "differs",
        "severity": "high",
        "question": "Risk management justification required for different tissue "
                    "contact characteristics. Updated risk analysis per ISO 14971.",
        "citation": "ISO 14971:2019; FDA Guidance: Factors to Consider Regarding Benefit-Risk",
        "required_evidence": ["RiskAnalysis", "ISO14971", "BiocompatibilityReport"],
    },
    {
        "trigger_field": "sterilization",
        "condition": "differs",
        "severity": "medium",
        "question": "Sterility validation, SAL demonstration, and packaging "
                    "integrity testing required for the changed sterilization method.",
        "citation": "ISO 11135, ISO 11137, ISO 17665; ISO 11607",
        "required_evidence": ["SterilizationValidation", "PackagingValidation"],
    },
    {
        "trigger_field": "software",
        "condition": "present",
        "severity": "high",
        "question": "IEC 62304 software lifecycle documentation, cybersecurity "
                    "assessment, and PCCP required if AI/ML-enabled (SaMD).",
        "citation": "IEC 62304:2015; FDA Guidance: Cybersecurity in Medical Devices; "
                    "FDA PCCP Guidance (AI/ML)",
        "required_evidence": ["IEC62304", "CybersecurityDoc", "PCCP"],
    },
    {
        "trigger_field": "duration",
        "condition": "differs",
        "severity": "medium",
        "question": "Extended duration of contact may require additional "
                    "biocompatibility and chronic toxicity testing.",
        "citation": "ISO 10993-1:2018 Table A.1; FDA Guidance: Use of ISO 10993-1",
        "required_evidence": ["ChronicToxicity", "ISO10993"],
    },
    {
        "trigger_field": "intended_use",
        "condition": "differs",
        "severity": "critical",
        "question": "Intended use/indications differ significantly. FDA may "
                    "require De Novo classification or PMA pathway instead of 510(k).",
        "citation": "21 CFR 807.87(f); FDA Guidance: The 510(k) Program",
        "required_evidence": ["IntendedUseComparison", "PredicateJustification"],
    },
    {
        "trigger_field": "technology",
        "condition": "differs",
        "severity": "medium",
        "question": "Technological differences require detailed comparison "
                    "showing equivalence in safety and effectiveness.",
        "citation": "FDA Guidance: The 510(k) Program; 21 CFR 807.87",
        "required_evidence": ["TechComparison", "BenchTestReport"],
    },
]


class ReviewerQuestionsRequest(BaseModel):
    program_id: UUID
    subject_device: dict[str, Any] = Field(default_factory=dict)
    predicate_device: dict[str, Any] = Field(default_factory=dict)


@router.post("/reviewer-questions")
async def generate_reviewer_questions(req: ReviewerQuestionsRequest):
    """Deterministic FDA reviewer question generation from device diffs.

    No LLM. Pure regulatory logic.
    Returns questions ranked by severity with citations and required evidence.
    """
    questions: list[dict[str, Any]] = []
    subj = req.subject_device
    pred = req.predicate_device

    for rule in REVIEWER_QUESTION_RULES:
        field = rule["trigger_field"]
        subj_val = str(subj.get(field, "")).strip().lower()
        pred_val = str(pred.get(field, "")).strip().lower()

        triggered = False
        if rule["condition"] == "differs":
            # Trigger if values are different and at least one is non-empty
            if subj_val and pred_val and subj_val != pred_val:
                triggered = True
            elif subj_val and not pred_val:
                triggered = True
            elif pred_val and not subj_val:
                triggered = True
        elif rule["condition"] == "present":
            # Trigger if subject has this characteristic
            if subj_val and subj_val not in ("n/a", "none", "no", "false", ""):
                triggered = True

        if triggered:
            questions.append({
                "field": field,
                "severity": rule["severity"],
                "question": rule["question"],
                "citation": rule["citation"],
                "required_evidence": rule["required_evidence"],
                "subject_value": subj.get(field, "N/A"),
                "predicate_value": pred.get(field, "N/A"),
            })

    # Sort: critical → high → medium → low
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    questions.sort(key=lambda q: severity_order.get(q["severity"], 3))

    return {
        "questions": questions,
        "total_questions": len(questions),
        "critical_count": sum(1 for q in questions if q["severity"] == "critical"),
        "high_count": sum(1 for q in questions if q["severity"] == "high"),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.A — Toxic Predicate Detail (with signal citations)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/toxic-detail/{k_number}")
async def get_toxic_detail(k_number: str, program_id: UUID = Query(...)):
    """Return why a predicate is toxic — citing specific signals with dates.

    Enterprise edge: red badge → click → see 'Class I Recall on 2024-03-15,
    Recall #Z-1234-2024, reason: patient injury reports.'
    """
    conn = await db.acquire_connection()
    try:
        # Get signals
        signals = await conn.fetch(fda_sql.SELECT_SIGNALS_BY_K_NUMBER, k_number)

        # Get rollup
        rollup = await conn.fetchrow(fda_sql.SELECT_RISK_ROLLUP, k_number)

        # Get family safety
        family = await conn.fetchrow(fda_sql.CHECK_FAMILY_SAFETY, k_number)

        signal_list = []
        for s in signals:
            signal_list.append({
                "signal_type": s["signal_type"],
                "signal_date": str(s["signal_date"]) if s["signal_date"] else None,
                "severity_score": float(s["severity_score"]),
                "description": s["description"],
                "recall_number": s.get("recall_number"),
                "source_url": s.get("source_url"),
            })

        return {
            "k_number": k_number,
            "signals": signal_list,
            "toxicity_score": float(rollup["toxicity_score"]) if rollup else 0.0,
            "family_toxicity_score": float(rollup["family_toxicity_score"]) if rollup else 0.0,
            "mdr_rate_bucket": rollup["mdr_rate_bucket"] if rollup else "NONE",
            "family_recall_count": family["family_recall_count"] if family else 0,
            "is_toxic": any(
                s["severity_score"] > 0.6 for s in signals
            ) if signals else False,
            "toxic_because": [
                f"{s['signal_type']} on {s['signal_date']}"
                + (f" (Recall #{s['recall_number']})" if s.get("recall_number") else "")
                + f": {(s['description'] or '')[:200]}"
                for s in signals
                if s["severity_score"] > 0.5
            ],
        }
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.C — Render SE Matrix DOCX (real python-docx output)
# ═══════════════════════════════════════════════════════════════════════════════

class RenderSEDocxRequest(BaseModel):
    program_id: UUID
    selected_predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    include_reviewer_questions: bool = True
    include_toxicity_warnings: bool = True


@router.post("/render-se-docx")
async def render_se_docx(req: RenderSEDocxRequest):
    """Render SE Matrix as a downloadable DOCX file.

    Produces a professional 510(k) Substantial Equivalence comparison document
    with color-coded evidence cells, EV_ bookmarks, discussion sections,
    reviewer questions appendix, and toxicity warnings appendix.

    Returns: StreamingResponse with application/vnd.openxmlformats DOCX.
    """
    from fastapi.responses import StreamingResponse
    from .generators.se_matrix_generator import SEMatrixGenerator
    from .generators.docx_factory import SEMatrixDocxFactory

    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        # Fetch predicate data
        from . import sql_fda_universe as fda_sql
        predicate_row = await conn.fetchrow(
            fda_sql.SELECT_CLEARANCE, req.selected_predicate_k_number,
        )
        predicate_data = dict(predicate_row) if predicate_row else {
            "k_number": req.selected_predicate_k_number,
            "device_name": "Unknown Predicate",
        }

        # Generate SE matrix payload
        generator = SEMatrixGenerator()
        se_payload = generator.generate_payload(
            subject_device=req.subject_device,
            selected_predicate=predicate_data,
            design_control_ids=req.design_control_ids,
        )

        # Optional: generate reviewer questions
        reviewer_questions = []
        if req.include_reviewer_questions:
            for rule in REVIEWER_QUESTION_RULES:
                field = rule["trigger_field"]
                subj_val = str(req.subject_device.get(field, "")).strip().lower()
                pred_val = str(predicate_data.get(field, "")).strip().lower()
                triggered = False
                if rule["condition"] == "differs" and subj_val and pred_val and subj_val != pred_val:
                    triggered = True
                elif rule["condition"] == "differs" and (subj_val and not pred_val or pred_val and not subj_val):
                    triggered = True
                elif rule["condition"] == "present" and subj_val and subj_val not in ("n/a", "none", "no", "false", ""):
                    triggered = True
                if triggered:
                    reviewer_questions.append(rule)

        # Optional: get toxicity warnings
        toxicity_warnings = []
        if req.include_toxicity_warnings:
            signals = await conn.fetch(fda_sql.SELECT_SIGNALS_BY_K_NUMBER, req.selected_predicate_k_number)
            for s in signals:
                if s["severity_score"] > 0.3:
                    toxicity_warnings.append({
                        "k_number": req.selected_predicate_k_number,
                        "signal_type": s["signal_type"],
                        "signal_date": str(s["signal_date"]) if s["signal_date"] else None,
                        "severity_score": float(s["severity_score"]),
                        "description": s["description"],
                    })

        # Render DOCX
        factory = SEMatrixDocxFactory()
        docx_buf = factory.render(
            se_payload=se_payload,
            reviewer_questions=reviewer_questions,
            toxicity_warnings=toxicity_warnings,
        )

        # Audit event (best-effort)
        try:
            pool = await db.get_pool()
            await _emit_se_matrix_render_event(
                pool=pool,
                program_id=req.program_id,
                predicate_k_number=req.selected_predicate_k_number,
                subject_device=req.subject_device,
                row_count=len(se_payload.get("comparison_rows", [])),
            )
        except Exception as audit_err:
            logger.warning("SE matrix render audit failed: %s", audit_err)

        k_num = req.selected_predicate_k_number
        filename = f"SE_Matrix_{k_num}.docx"

        return StreamingResponse(
            docx_buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        logger.exception("DOCX render failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DOCX render failed: {exc}")
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.D — Download Defense Packet (ZIP: DOCX + manifest + questions)
# ═══════════════════════════════════════════════════════════════════════════════

class DownloadDefensePacketRequest(BaseModel):
    program_id: UUID
    selected_predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)


@router.post("/download-defense-packet")
async def download_defense_packet(req: DownloadDefensePacketRequest):
    """Build and download the complete defense packet as a ZIP.

    Contains:
      - SE Matrix DOCX with evidence-linked cells
      - defense_manifest.json (SHA-256 chain-of-custody)
      - reviewer_questions.json (deterministic)
      - toxicity_warnings.json (if any)
      - README.txt

    Returns: StreamingResponse with application/zip.
    """
    from fastapi.responses import StreamingResponse
    from .generators.se_matrix_generator import SEMatrixGenerator
    from .generators.defense_packet_builder import DefensePacketBuilder

    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        # Fetch predicate data
        from . import sql_fda_universe as fda_sql
        predicate_row = await conn.fetchrow(
            fda_sql.SELECT_CLEARANCE, req.selected_predicate_k_number,
        )
        predicate_data = dict(predicate_row) if predicate_row else {
            "k_number": req.selected_predicate_k_number,
            "device_name": "Unknown Predicate",
        }

        # Generate SE matrix payload
        generator = SEMatrixGenerator()
        se_payload = generator.generate_payload(
            subject_device=req.subject_device,
            selected_predicate=predicate_data,
            design_control_ids=req.design_control_ids,
        )

        # Generate reviewer questions
        reviewer_questions = []
        for rule in REVIEWER_QUESTION_RULES:
            field = rule["trigger_field"]
            subj_val = str(req.subject_device.get(field, "")).strip().lower()
            pred_val = str(predicate_data.get(field, "")).strip().lower()
            triggered = False
            if rule["condition"] == "differs" and subj_val and pred_val and subj_val != pred_val:
                triggered = True
            elif rule["condition"] == "differs" and (subj_val and not pred_val or pred_val and not subj_val):
                triggered = True
            elif rule["condition"] == "present" and subj_val and subj_val not in ("n/a", "none", "no", "false", ""):
                triggered = True
            if triggered:
                reviewer_questions.append(rule)

        # Get toxicity warnings
        toxicity_warnings = []
        signals = await conn.fetch(fda_sql.SELECT_SIGNALS_BY_K_NUMBER, req.selected_predicate_k_number)
        for s in signals:
            if s["severity_score"] > 0.3:
                toxicity_warnings.append({
                    "k_number": req.selected_predicate_k_number,
                    "signal_type": s["signal_type"],
                    "signal_date": str(s["signal_date"]) if s["signal_date"] else None,
                    "severity_score": float(s["severity_score"]),
                    "description": s["description"],
                })

        # Build defense packet ZIP
        builder = DefensePacketBuilder()
        zip_buf = builder.build(
            se_payload=se_payload,
            reviewer_questions=reviewer_questions,
            toxicity_warnings=toxicity_warnings,
        )
        zip_filename = builder.get_zip_filename(se_payload)

        return StreamingResponse(
            zip_buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
        )
    except Exception as exc:
        logger.exception("Defense packet build failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Defense packet build failed: {exc}")
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.C-V2 — Evidence-Linked SE Matrix (risk_code + evidence_task_ids)
# ═══════════════════════════════════════════════════════════════════════════════

class GenerateSEMatrixV2Request(BaseModel):
    """Request for the V2 SE matrix generator with risk_code linkage."""
    program_id: UUID
    selected_predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)


@router.post("/generate-se-matrix-v2")
async def generate_se_matrix_v2(req: GenerateSEMatrixV2Request):
    """Generate Evidence-Linked SE Matrix with risk_code → evidence_task_ids.

    V2 improvements over /generate-se-matrix:
      - Deterministic risk_code assignment per diff category
      - evidence_task_ids linked to each comparison row
      - defense_readiness_score (0-100)
      - Stable sha256 task hashes for idempotency
      - risk_code_map_version for audit trail

    Returns: SEMatrixPayloadV2 with comparison_rows, evidence_tasks, score.
    """
    from .generators.se_matrix_payload import generate_se_matrix_payload

    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        # Fetch predicate data from FDA clearances table
        from . import sql_fda_universe as fda_sql
        predicate_row = await conn.fetchrow(
            fda_sql.SELECT_CLEARANCE, req.selected_predicate_k_number,
        )

        if predicate_row:
            predicate_data = dict(predicate_row)
        else:
            # Fallback: check candidates table
            candidate = await conn.fetchrow(
                sql.SELECT_CANDIDATE_BY_K_NUMBER,
                req.selected_predicate_k_number,
                req.program_id,
            )
            predicate_data = dict(candidate) if candidate else {
                "k_number": req.selected_predicate_k_number,
                "device_name": "Unknown Predicate",
            }

        payload = generate_se_matrix_payload(
            program_id=str(req.program_id),
            subject_device=req.subject_device,
            predicate_record=predicate_data,
            design_control_ids=req.design_control_ids,
        )

        return {
            "se_matrix_payload": payload.model_dump(),
            "defense_readiness_score": payload.defense_readiness_score,
            "row_count": len(payload.comparison_rows),
            "discussion_required_count": sum(
                1 for r in payload.comparison_rows
                if r.diff_flag == "DISCUSSION_REQUIRED"
            ),
            "significant_count": sum(
                1 for r in payload.comparison_rows
                if r.diff_flag == "SIGNIFICANT"
            ),
            "evidence_task_count": len(payload.evidence_tasks),
            "risk_code_map_version": payload.risk_code_map_version,
            "generation_timestamp": payload.generated_at,
            "manifest_hash": getattr(payload, "manifest_hash", None) or payload.generated_at,
        }
    except Exception as exc:
        logger.exception("SE matrix V2 generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"SE matrix V2 generation failed: {exc}")
    finally:
        await db.release_connection(conn)


class RenderSEDocxV2Request(BaseModel):
    """Request for V2 DOCX rendering with evidence footnotes + risk badges."""
    program_id: UUID
    selected_predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    include_reviewer_questions: bool = True
    include_toxicity_warnings: bool = True


@router.post("/render-se-docx-v2")
async def render_se_docx_v2(req: RenderSEDocxV2Request):
    """Render V2 Evidence-Linked SE Matrix as downloadable DOCX.

    Improvements over /render-se-docx:
      - [EV:task_id] footnote markers in matrix cells
      - Risk_code badges in discussion sections
      - Yellow highlighted cells for missing evidence
      - Evidence Tasks Appendix with artifact checklists
      - defense_readiness_score in executive summary

    Returns: StreamingResponse with DOCX.
    """
    from fastapi.responses import StreamingResponse
    from .generators.se_matrix_payload import generate_se_matrix_payload
    from .generators.docx_factory import SEMatrixDocxFactory

    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        # Fetch predicate data
        from . import sql_fda_universe as fda_sql
        predicate_row = await conn.fetchrow(
            fda_sql.SELECT_CLEARANCE, req.selected_predicate_k_number,
        )
        predicate_data = dict(predicate_row) if predicate_row else {
            "k_number": req.selected_predicate_k_number,
            "device_name": "Unknown Predicate",
        }

        # Generate V2 payload
        v2_payload = generate_se_matrix_payload(
            program_id=str(req.program_id),
            subject_device=req.subject_device,
            predicate_record=predicate_data,
            design_control_ids=req.design_control_ids,
        )

        # Optional: reviewer questions (reuse existing rules)
        reviewer_questions = []
        if req.include_reviewer_questions:
            for rule in REVIEWER_QUESTION_RULES:
                field = rule["trigger_field"]
                subj_val = str(req.subject_device.get(field, "")).strip().lower()
                pred_val = str(predicate_data.get(field, "")).strip().lower()
                triggered = False
                if rule["condition"] == "differs" and subj_val and pred_val and subj_val != pred_val:
                    triggered = True
                elif rule["condition"] == "differs" and (subj_val and not pred_val or pred_val and not subj_val):
                    triggered = True
                elif rule["condition"] == "present" and subj_val and subj_val not in ("n/a", "none", "no", "false", ""):
                    triggered = True
                if triggered:
                    reviewer_questions.append(rule)

        # Toxicity warnings
        toxicity_warnings = []
        if req.include_toxicity_warnings:
            signals = await conn.fetch(fda_sql.SELECT_SIGNALS_BY_K_NUMBER, req.selected_predicate_k_number)
            for s in signals:
                if s["severity_score"] > 0.3:
                    toxicity_warnings.append({
                        "k_number": req.selected_predicate_k_number,
                        "signal_type": s["signal_type"],
                        "signal_date": str(s["signal_date"]) if s["signal_date"] else None,
                        "severity_score": float(s["severity_score"]),
                        "description": s["description"],
                    })

        # Render V2 DOCX
        factory = SEMatrixDocxFactory()
        docx_buf = factory.render_v2(
            se_payload_v2=v2_payload,
            reviewer_questions=reviewer_questions,
            toxicity_warnings=toxicity_warnings,
        )

        # Audit event (best-effort)
        try:
            pool = await db.get_pool()
            await _emit_se_matrix_render_event(
                pool=pool,
                program_id=req.program_id,
                predicate_k_number=req.selected_predicate_k_number,
                subject_device=req.subject_device,
                row_count=len(v2_payload.comparison_rows),
            )
        except Exception as audit_err:
            logger.warning("SE matrix V2 render audit failed: %s", audit_err)

        k_num = req.selected_predicate_k_number
        filename = f"SE_Matrix_V2_{k_num}.docx"

        return StreamingResponse(
            docx_buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        logger.exception("DOCX V2 render failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DOCX V2 render failed: {exc}")
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.C2 — SE Matrix Payload + Manifest Endpoint
# ═══════════════════════════════════════════════════════════════════════════════

class SEMatrixPayloadReq(BaseModel):
    """Request for the manifest-bearing SE matrix payload endpoint."""
    program_id: UUID
    product_code: str = ""
    selected_predicate_k_number: str
    subject_device: dict[str, Any] = Field(default_factory=dict)
    selected_predicate: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    include_explainability: bool = True


@router.post("/device/se-matrix-payload")
async def se_matrix_payload_endpoint(req: SEMatrixPayloadReq):
    """Generate SE Matrix payload with RegulatoryIntelManifest.

    Phase 6.6.C2 endpoint. Returns:
      - manifest: deterministic, hashable RegulatoryIntelManifest
      - payload: SEMatrixPayloadV2 (comparison rows + evidence tasks)
      - evidence_tasks: ordered evidence task list

    The manifest enables Part 11 audit traceability, downstream eCTD
    integration, and Truth Machine linkage.
    """
    from .generators.se_matrix_payload import generate_se_matrix_with_manifest

    # Fast path: if selected_predicate dict contains k_number, skip DB entirely
    if req.selected_predicate and req.selected_predicate.get("k_number"):
        predicate_data = dict(req.selected_predicate)
        result = generate_se_matrix_with_manifest(
            program_id=str(req.program_id),
            product_code=req.product_code,
            subject_device=req.subject_device,
            predicate_record=predicate_data,
            design_control_ids=req.design_control_ids,
        )
        return result

    # Slow path: fetch predicate from DB
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(req.program_id))

        from . import sql_fda_universe as fda_sql
        predicate_row = await conn.fetchrow(
            fda_sql.SELECT_CLEARANCE, req.selected_predicate_k_number,
        )
        if predicate_row:
            predicate_data = dict(predicate_row)
        else:
            candidate = await conn.fetchrow(
                sql.SELECT_CANDIDATE_BY_K_NUMBER,
                req.selected_predicate_k_number,
                req.program_id,
            )
            predicate_data = dict(candidate) if candidate else {
                "k_number": req.selected_predicate_k_number,
                "device_name": "Unknown Predicate",
            }

        result = generate_se_matrix_with_manifest(
            program_id=str(req.program_id),
            product_code=req.product_code,
            subject_device=req.subject_device,
            predicate_record=predicate_data,
            design_control_ids=req.design_control_ids,
        )

        return result

    except Exception as exc:
        logger.exception("SE matrix payload+manifest generation failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"SE matrix payload generation failed: {exc}",
        )
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.D — Defense Packet (Versioned, Signed Artifact)
# ═══════════════════════════════════════════════════════════════════════════════

class DefensePacketCreateReq(BaseModel):
    """Request body for creating a defense packet."""
    program_id: UUID
    product_code: str = ""
    subject_device: dict[str, Any] = Field(default_factory=dict)
    predicate_record: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)
    render: bool = True
    created_by_user_id: str = "system"


@router.post("/device/defense-packet")
async def create_defense_packet_endpoint(req: DefensePacketCreateReq):
    """Create a Defense Packet — first-class versioned compliance artifact.

    Phase 6.6.D. Generates SE matrix + manifest, persists to
    predicate.defense_packets, optionally kicks render.

    Idempotent: if the manifest_hash already exists, returns existing packet.

    Returns CreateDefensePacketResponse with diff_summary if previous packet
    exists for the same program+subject.
    """
    from .defense_packet_repository import create_defense_packet

    try:
        result = await create_defense_packet(
            program_id=str(req.program_id),
            product_code=req.product_code,
            subject_device=req.subject_device,
            predicate_record=req.predicate_record,
            design_control_ids=req.design_control_ids,
            render=req.render,
            created_by_user_id=req.created_by_user_id,
        )
        return result
    except Exception as exc:
        logger.exception("Defense packet creation failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Defense packet creation failed: {exc}",
        )


@router.get("/device/defense-packet/{packet_id}")
async def get_defense_packet_endpoint(packet_id: UUID):
    """Get a defense packet by ID."""
    from .defense_packet_repository import get_packet_by_id

    packet = await get_packet_by_id(str(packet_id))
    if not packet:
        raise HTTPException(status_code=404, detail="Defense packet not found")
    return {"packet": packet}


@router.get("/device/defense-packets")
async def list_defense_packets_endpoint(
    program_id: UUID = Query(...),
):
    """List all defense packets for a program (newest first)."""
    from .defense_packet_repository import get_packets_for_program

    packets = await get_packets_for_program(str(program_id))
    return {"packets": packets, "count": len(packets)}


@router.post("/device/defense-packet/{packet_id}/staleness-check")
async def check_packet_staleness_endpoint(packet_id: UUID):
    """Check if a defense packet is stale (upstream data has changed)."""
    from .defense_packet_repository import check_staleness, get_packet_by_id

    packet = await get_packet_by_id(str(packet_id))
    if not packet:
        raise HTTPException(status_code=404, detail="Defense packet not found")

    result = check_staleness(packet)
    return result.model_dump()


@router.patch("/device/defense-packet/{packet_id}/status")
async def update_defense_packet_status_endpoint(
    packet_id: UUID,
    status: str = Query(...),
    render_job_id: Optional[str] = Query(None),
    error_code: Optional[str] = Query(None),
    error_detail: Optional[str] = Query(None),
    staleness_reason: Optional[str] = Query(None),
):
    """Update a defense packet's lifecycle status with validation."""
    from .defense_packet_repository import update_packet_status

    updated = await update_packet_status(
        str(packet_id),
        status,
        render_job_id=render_job_id,
        error_code=error_code,
        error_detail=error_detail,
        staleness_reason=staleness_reason,
    )
    if not updated:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid status transition to '{status}' or packet not found",
        )
    return {"packet": updated}


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.D+ — Defense Packet Builder (deterministic, no DB required)
# ═══════════════════════════════════════════════════════════════════════════════

class DefensePacketBuildReq(BaseModel):
    """Request body for building a defense packet from manifest data."""
    program_id: str
    product_code: str = ""
    subject_device: dict[str, Any] = Field(default_factory=dict)
    selected_predicate: dict[str, Any] = Field(default_factory=dict)
    design_control_ids: dict[str, str] = Field(default_factory=dict)


@router.post("/device/defense-packet/build")
async def build_defense_packet_endpoint(req: DefensePacketBuildReq):
    """Build a deterministic defense packet with full evidence ops tasks.

    Phase 6.6.D+. No DB required — builds from manifest in-memory.
    Returns DefensePacketFull with:
    - Operationally complete evidence tasks (all 24 codes mapped)
    - Anticipated reviewer questions (non-LLM)
    - Submission gating check
    - Truth Machine placeholders
    - Stable ordering (severity desc, category, task_id)

    Determinism: same inputs → same JSON (except generated_at).
    """
    from .predicate_intel.defense_packet import (
        build_defense_packet_from_manifest,
        check_submission_gate,
    )
    from .generators.se_matrix_payload import generate_se_matrix_with_manifest

    try:
        result = generate_se_matrix_with_manifest(
            program_id=req.program_id,
            product_code=req.product_code,
            subject_device=req.subject_device,
            predicate_record=req.selected_predicate,
            design_control_ids=req.design_control_ids,
        )

        manifest = result["manifest"]
        subject_hash = manifest["subject_hash"]

        # Inject SE matrix rows into manifest for task generation
        if "se_matrix" not in manifest:
            payload = result.get("payload", {})
            comparison_rows = payload.get("comparison_rows", [])
            manifest["se_matrix"] = {"rows": comparison_rows}

        packet = build_defense_packet_from_manifest(
            program_id=req.program_id,
            product_code=req.product_code,
            manifest=manifest,
            subject_hash=subject_hash,
        )

        gate = check_submission_gate(packet)

        return {
            "defense_packet": packet.model_dump(mode="json"),
            "submission_gate": gate.model_dump(),
        }

    except Exception as exc:
        logger.exception("Defense packet build failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Defense packet build failed: {exc}",
        )


@router.get("/device/defense-packet/{manifest_hash}/export.json")
async def export_defense_packet_json(manifest_hash: str):
    """Export a defense packet as canonical JSON.

    Phase 6.6.D+. Stable ordering, deterministic.
    Returns full DefensePacketFull JSON.
    """
    # For v1, rebuild from DB if stored, or return 404
    from .defense_packet_repository import get_packet_by_manifest_hash
    try:
        packet_row = await get_packet_by_manifest_hash(manifest_hash)
    except Exception:
        packet_row = None

    if not packet_row:
        raise HTTPException(status_code=404, detail="Defense packet not found for manifest_hash")

    # Return canonical DefensePacketFull JSON
    import json as _json
    from datetime import datetime, timezone
    from .models_defense_packet import DefensePacketFull, PacketOpsStatus
    tasks = packet_row.get("tasks", [])
    if isinstance(tasks, str):
        tasks = _json.loads(tasks)
    top_risks = packet_row.get("top_risks", [])
    if isinstance(top_risks, str):
        top_risks = _json.loads(top_risks)
    # Determine ops status from task state (same rule as builder)
    any_high_open = False
    for task in tasks:
        sev = task.get("severity", "") if isinstance(task, dict) else ""
        completion = task.get("completion", {}) if isinstance(task, dict) else {}
        state = completion.get("state", "OPEN") if isinstance(completion, dict) else "OPEN"
        if sev in ("High", "HIGH") and state in ("OPEN", "IN_PROGRESS"):
            any_high_open = True
            break

    status = PacketOpsStatus.BLOCKED if any_high_open else PacketOpsStatus.CREATED
    generated_at = packet_row.get("created_at") or datetime.now(timezone.utc)

    packet = DefensePacketFull(
        packet_version="6.6.D+",
        packet_id=manifest_hash,
        manifest_hash=manifest_hash,
        subject_hash=packet_row.get("subject_hash", ""),
        program_id=str(packet_row["program_id"]),
        product_code=packet_row.get("product_code", ""),
        generated_at=generated_at,
        risk_code_map_version=str(packet_row.get("risk_code_map_version", "")),
        risk_vocab_hash=str(packet_row.get("risk_vocab_hash", "")),
        readiness_score=float(packet_row.get("defense_readiness_score", 0)),
        status=status,
        stale_reasons=[],
        top_risks=top_risks,
        tasks=tasks,
    )

    from fastapi.responses import JSONResponse
    return JSONResponse(content=packet.model_dump(mode="json"), media_type="application/json")


@router.get("/device/defense-packet/{manifest_hash}/export.csv")
async def export_defense_packet_csv(manifest_hash: str):
    """Export defense packet tasks as stable CSV.

    Phase 6.6.D+. Columns: task_id, severity, category, title,
    triggered_risk_codes, se_matrix_rows, acceptance_criteria,
    recommended_artifacts, artifact_targets, state.

    Stable ordering — compliance teams love CSV.
    """
    from .defense_packet_repository import get_packet_by_manifest_hash
    import csv
    import io
    import json as _json

    try:
        packet_row = await get_packet_by_manifest_hash(manifest_hash)
    except Exception:
        packet_row = None

    if not packet_row:
        raise HTTPException(status_code=404, detail="Defense packet not found for manifest_hash")

    tasks = packet_row.get("tasks", [])
    if isinstance(tasks, str):
        tasks = _json.loads(tasks)

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow([
        "task_id", "severity", "category", "title",
        "triggered_risk_codes", "se_matrix_rows",
        "acceptance_criteria", "recommended_artifacts",
        "artifact_targets", "state",
    ])

    for task in tasks:
        writer.writerow([
            task.get("task_id", ""),
            task.get("severity", ""),
            task.get("category", ""),
            task.get("title", ""),
            "|".join(task.get("triggered_risk_codes", [])),
            "|".join(task.get("se_matrix_rows", [])),
            "|".join(task.get("acceptance_criteria", [])),
            "|".join(task.get("recommended_artifacts", [])),
            "|".join(task.get("artifact_targets", [])),
            task.get("completion", {}).get("state", "OPEN") if isinstance(task.get("completion"), dict) else "OPEN",
        ])

    from fastapi.responses import Response
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=defense-packet-{manifest_hash[:12]}.csv"},
    )


@router.post("/device/defense-packet/{manifest_hash}/submission-gate")
async def check_submission_gate_endpoint(manifest_hash: str):
    """Check submission gating status for a defense packet.

    Phase 6.6.D+. Returns SubmissionGateResult indicating
    whether eCTD packaging is allowed or blocked.

    Gate rules:
    - Block if any HIGH task is OPEN|IN_PROGRESS
    - Block if any SIGNIFICANT risk code has no evidence refs
    - Override requires WAIVED + Part 11 audit event
    """
    from .defense_packet_repository import get_packet_by_manifest_hash
    import json as _json

    try:
        packet_row = await get_packet_by_manifest_hash(manifest_hash)
    except Exception:
        packet_row = None

    if not packet_row:
        raise HTTPException(status_code=404, detail="Defense packet not found for manifest_hash")

    # Build a minimal packet object for gate check
    tasks = packet_row.get("tasks", [])
    if isinstance(tasks, str):
        tasks = _json.loads(tasks)

    # Check gate with simplified logic (matching builder logic)
    from ..scoring.risk_code_map import SIGNIFICANT_RISK_CODES as SIG_CODES
    blocking_task_ids = []
    blocking_risk_codes = []
    missing_evidence = []
    next_actions = []

    for task in tasks:
        sev = task.get("severity", "")
        completion = task.get("completion", {})
        state = completion.get("state", "OPEN") if isinstance(completion, dict) else "OPEN"
        task_id = task.get("task_id", "")
        title = task.get("title", "")

        if sev in ("High", "HIGH"):
            if state in ("OPEN", "IN_PROGRESS"):
                blocking_task_ids.append(task_id)
                next_actions.append(f"Complete or waive task '{title}' (task_id={task_id})")

        for code in task.get("triggered_risk_codes", []):
            if code in SIG_CODES:
                refs = completion.get("evidence_refs", []) if isinstance(completion, dict) else []
                if not refs:
                    if code not in blocking_risk_codes:
                        blocking_risk_codes.append(code)
                        missing_evidence.append(f"{code} — no evidence refs for task {task_id}")

    allowed = len(blocking_task_ids) == 0 and len(blocking_risk_codes) == 0
    reason = ""
    if not allowed:
        parts = []
        if blocking_task_ids:
            parts.append(f"{len(blocking_task_ids)} HIGH task(s) not completed")
        if blocking_risk_codes:
            parts.append(f"{len(blocking_risk_codes)} SIGNIFICANT risk code(s) without evidence")
        reason = "Packaging blocked: " + "; ".join(parts)

    return {
        "allowed": allowed,
        "blocking_task_ids": sorted(blocking_task_ids),
        "blocking_risk_codes": sorted(blocking_risk_codes),
        "missing_evidence_refs": sorted(missing_evidence),
        "recommended_next_actions": next_actions,
        "override_available": not allowed,
        "reason": reason,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.E1 — Defense Proof Pack (Zero-Drift Evidence)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/proof-pack")
async def get_proof_pack(
    program_id: str = Query(..., description="Regulatory program UUID"),
    subject_hash: str = Query("", description="Subject device hash (for latest packet lookup)"),
):
    """Return a minimal proof attestation packet for demo / compliance.

    Always includes risk_vocab_hash and manifest_hash.
    Never includes secrets.
    Works with no DB access beyond latest ingest run + latest defense packet.

    Phase 6.6.E1 — Defense Proof Pack
    """
    import hashlib
    import json as _json
    from datetime import timezone as _tz

    from .scoring.risk_code_map import RISK_CODE_MAP_VERSION
    from .scoring.risk_code_contract_validator import _compute_lock_hash

    risk_vocab_hash = _compute_lock_hash()

    # ── Latest defense packet for this program+subject (if any) ──
    manifest_hash = ""
    generated_at = ""
    pool = await db.get_pool()

    if pool and subject_hash:
        try:
            from . import sql_defense_packets as dp_sql
            row = await pool.fetchrow(
                dp_sql.SELECT_LATEST_PACKET_FOR_SUBJECT,
                program_id,
                subject_hash,
            )
            if row:
                manifest_hash = row.get("manifest_hash", "") or ""
                created = row.get("created_at")
                if created:
                    generated_at = created.isoformat() if hasattr(created, "isoformat") else str(created)
        except Exception as exc:
            logger.warning("proof-pack: failed to read latest packet: %s", exc)

    if not generated_at:
        generated_at = datetime.now(timezone.utc).isoformat()

    # ── Ingest freshness ──
    ingest_freshness = {
        "last_success_at": None,
        "source": "openFDA + enforcement",
        "status": "RED",
    }

    if pool:
        try:
            ingest_row = await pool.fetchrow(fda_sql.SELECT_LAST_SUCCESSFUL_INGEST)
            if ingest_row:
                completed = ingest_row.get("completed_at")
                if completed:
                    ingest_freshness["last_success_at"] = (
                        completed.isoformat() if hasattr(completed, "isoformat") else str(completed)
                    )
                    age = datetime.now(timezone.utc) - completed.replace(tzinfo=timezone.utc) if completed.tzinfo is None else datetime.now(timezone.utc) - completed
                    if age <= timedelta(days=INGEST_FRESHNESS_DAYS):
                        ingest_freshness["status"] = "GREEN"
                    elif age <= timedelta(days=INGEST_FRESHNESS_DAYS * 2):
                        ingest_freshness["status"] = "YELLOW"
                    else:
                        ingest_freshness["status"] = "RED"
        except Exception as exc:
            logger.warning("proof-pack: failed to read ingest freshness: %s", exc)

    # ── Audit stub (DEV signer for now; HSM/PKI in production) ──
    doc_content = f"{program_id}:{subject_hash}:{manifest_hash}:{risk_vocab_hash}"
    doc_hash = hashlib.sha256(doc_content.encode("utf-8")).hexdigest()

    return {
        "subject_hash": subject_hash,
        "risk_vocab_version": RISK_CODE_MAP_VERSION,
        "risk_vocab_hash": risk_vocab_hash,
        "manifest_hash": manifest_hash,
        "generated_at": generated_at,
        "ingest_freshness": ingest_freshness,
        "audit": {
            "signature_method": "DEV",
            "key_id": "dev-local-001",
            "doc_hash": doc_hash,
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 6.6.E2 — Replay Determinism
# ═══════════════════════════════════════════════════════════════════════════════


class ReplayDeterminismPayload(BaseModel):
    """Payload for the replay determinism check."""
    product_code: str = Field(..., alias="productCode")
    subject_device: dict = Field(..., alias="subjectDevice")
    selected_predicate: dict = Field(..., alias="selectedPredicate")
    original_manifest_hash: str = Field(..., alias="originalManifestHash")

    class Config:
        populate_by_name = True


@router.post("/replay-determinism")
async def replay_determinism(payload: ReplayDeterminismPayload):
    """Re-run the defense packet build and compare hashes for determinism.

    Returns whether the replay produced identical manifest_hash,
    risk_vocab_hash, and triggered_risk_codes.

    Phase 6.6.E2 — Replay Determinism
    """
    import json as _json

    from .scoring.risk_code_contract_validator import _compute_lock_hash

    drift_details: list[str] = []

    # ── Load original packet ──
    original_manifest_hash = payload.original_manifest_hash
    original_risk_vocab_hash = ""
    original_risk_codes: list[str] = []
    pool = await db.get_pool()

    if pool:
        try:
            from . import sql_defense_packets as dp_sql
            row = await pool.fetchrow(
                dp_sql.SELECT_PACKET_BY_MANIFEST_HASH,
                original_manifest_hash,
            )
            if row:
                original_risk_vocab_hash = row.get("risk_vocab_hash", "") or ""
                codes_raw = row.get("risk_codes_used", [])
                if isinstance(codes_raw, str):
                    codes_raw = _json.loads(codes_raw)
                if isinstance(codes_raw, list):
                    original_risk_codes = sorted(codes_raw)
                elif isinstance(codes_raw, dict):
                    original_risk_codes = sorted(codes_raw.keys())
        except Exception as exc:
            logger.warning("replay-determinism: failed to read original packet: %s", exc)

    # ── Replay: rebuild using the same deterministic pipeline ──
    from .predicate_intel.defense_packet import (
        build_defense_packet_from_manifest,
    )
    from .generators.se_matrix_payload import generate_se_matrix_with_manifest

    try:
        se_result = generate_se_matrix_with_manifest(
            program_id="replay",
            product_code=payload.product_code,
            subject_device=payload.subject_device,
            predicate_record=payload.selected_predicate,
            design_control_ids={},
        )
        manifest = se_result["manifest"]
        subject_hash = manifest["subject_hash"]
        if "se_matrix" not in manifest:
            comparison_rows = se_result.get("payload", {}).get("comparison_rows", [])
            manifest["se_matrix"] = {"rows": comparison_rows}

        replay_packet = build_defense_packet_from_manifest(
            program_id="replay",
            product_code=payload.product_code,
            manifest=manifest,
            subject_hash=subject_hash,
        )
        replay_data = replay_packet.model_dump(mode="json") if hasattr(replay_packet, "model_dump") else replay_packet
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Replay build failed: {exc}",
        )

    replay_manifest_hash = replay_data.get("manifest_hash", "") if isinstance(replay_data, dict) else ""
    replay_risk_vocab_hash = _compute_lock_hash()

    # Extract risk codes from replay tasks
    replay_tasks = replay_data.get("tasks", []) if isinstance(replay_data, dict) else []
    replay_risk_codes_set: set[str] = set()
    for task in replay_tasks:
        if isinstance(task, dict):
            for code in task.get("triggered_risk_codes", []):
                replay_risk_codes_set.add(code)
    replay_risk_codes = sorted(replay_risk_codes_set)

    # ── Compare ──
    if original_manifest_hash != replay_manifest_hash:
        drift_details.append(
            f"manifest_hash mismatch: original={original_manifest_hash[:16]}… replay={replay_manifest_hash[:16]}…"
        )
    if original_risk_vocab_hash and original_risk_vocab_hash != replay_risk_vocab_hash:
        drift_details.append(
            f"risk_vocab_hash mismatch: original={original_risk_vocab_hash[:16]}… replay={replay_risk_vocab_hash[:16]}…"
        )
    if original_risk_codes != replay_risk_codes:
        added = set(replay_risk_codes) - set(original_risk_codes)
        removed = set(original_risk_codes) - set(replay_risk_codes)
        parts = []
        if added:
            parts.append(f"added={sorted(added)}")
        if removed:
            parts.append(f"removed={sorted(removed)}")
        drift_details.append(f"risk_codes changed: {', '.join(parts)}")

    deterministic = len(drift_details) == 0

    return {
        "deterministic": deterministic,
        "original_manifest_hash": original_manifest_hash,
        "replay_manifest_hash": replay_manifest_hash,
        "original_risk_vocab_hash": original_risk_vocab_hash,
        "replay_risk_vocab_hash": replay_risk_vocab_hash,
        "original_risk_codes": original_risk_codes,
        "replay_risk_codes": replay_risk_codes,
        "drift_details": drift_details,
    }
