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
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from . import db
from . import sql_predicate as sql
from .predicate_analyzer import PredicateAnalyzer
from .shadow_510k_reviewer import Shadow510kReviewer
from .models_predicate import (
    CandidateStatus,
    DiffSeverity,
    EquivalenceStatus,
    PredicateRadarPoint,
    RouteType,
    SECategory,
)

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
