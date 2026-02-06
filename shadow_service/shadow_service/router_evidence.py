"""FastAPI router for Evidence Fabric endpoints.

Endpoints:
  POST  /evidence/claims                   — create a claim
  GET   /evidence/claims?program_id=...    — list claims
  GET   /evidence/claims/{claim_id}        — get claim detail
  GET   /evidence/claims/{claim_id}/score  — score a claim (anti-hallucination)
  POST  /evidence/sources                  — create a source
  GET   /evidence/sources?program_id=...   — list sources
  POST  /evidence/support                  — link claim ↔ source
  GET   /evidence/claims/{claim_id}/support — support links for a claim
  POST  /evidence/derivations              — add derivation link
  GET   /evidence/claims/{claim_id}/chain  — derivation chain (recursive)
  GET   /evidence/provenance?claim_id=...  — provenance trail
  GET   /evidence/claims/{claim_id}/verify — hash integrity check
  GET   /evidence/contradictions           — contradiction detector
  GET   /evidence/health-summary           — dashboard health panel data
  POST  /evidence/contradiction-scans      — run a contradiction scan
  GET   /evidence/contradiction-scans      — list scan results
  GET   /evidence/contradiction-scans/{scan_id} — get specific scan

Auth: All endpoints require X-Admin-Token matching REVIEW_ADMIN_TOKEN env var.
      Reuses the same A8 ops token — no second secret.
"""

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, Query

from .db import LiteModeError
from .models_evidence import (
    CreateClaimRequest,
    ClaimResponse,
    ClaimListResponse,
    CreateSourceRequest,
    SourceResponse,
    SourceListResponse,
    CreateSupportRequest,
    SupportResponse,
    SupportListResponse,
    CreateDerivationRequest,
    DerivationResponse,
    DerivationChainItem,
    CreateProvenanceRequest,
    ProvenanceResponse,
    HashEntryResponse,
    ClaimScoreBreakdown,
)
from fastapi.responses import StreamingResponse

from . import evidence_runner as runner
from . import contradiction_scanner as scanner
from . import defense_packet

logger = logging.getLogger(__name__)


# =============================================================================
# Admin Auth Guard — same pattern as orchestration
# =============================================================================

@dataclass
class EvidenceAdminContext:
    """Context carried through every evidence request for audit."""
    request_id: str
    admin_actor: str          # sha256(token)[:8] — never the raw secret
    timestamp: str            # ISO-8601 UTC


def _hash_token_prefix(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:8]


def require_evidence_admin(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Fail-closed admin gate — reuses REVIEW_ADMIN_TOKEN.

    * env missing  → 503  (evidence endpoints disabled until configured)
    * token wrong  → 403
    """
    expected = os.getenv("REVIEW_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="REVIEW_ADMIN_TOKEN not configured — evidence endpoints disabled",
        )
    if x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


def get_evidence_context(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> EvidenceAdminContext:
    """Build audit context from request headers."""
    return EvidenceAdminContext(
        request_id=x_request_id or str(uuid4()),
        admin_actor=_hash_token_prefix(x_admin_token) if x_admin_token else "no-token",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


router = APIRouter(
    prefix="/evidence",
    tags=["Evidence Fabric"],
    dependencies=[Depends(require_evidence_admin)],
)


def _handle_lite_mode(e: LiteModeError):
    raise HTTPException(
        status_code=503,
        detail="Database not available. Service running in lite mode.",
    )


# =============================================================================
# Claims
# =============================================================================

@router.post("/claims", response_model=ClaimResponse, status_code=201)
async def create_claim(
    body: CreateClaimRequest,
    ctx: EvidenceAdminContext = Depends(get_evidence_context),
):
    """Create a new claim with optional hash-ledger entry + provenance."""
    try:
        row = await runner.create_claim(
            program_id=body.program_id,
            claim_type=body.claim_type,
            claim_text=body.claim_text,
            structured=body.structured,
            section_ref=body.section_ref,
            supersedes_id=body.supersedes_id,
            confidence=body.confidence,
            actor=ctx.admin_actor,
            request_id=ctx.request_id,
        )
        return ClaimResponse(**row)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/claims", response_model=ClaimListResponse)
async def list_claims(
    program_id: UUID = Query(..., description="Filter by program"),
    limit: int = Query(25, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Offset"),
):
    """List active claims for a program (paginated)."""
    try:
        rows = await runner.list_claims(program_id, limit=limit, offset=offset)
        return ClaimListResponse(claims=[ClaimResponse(**r) for r in rows], total=len(rows))
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/claims/{claim_id}", response_model=ClaimResponse)
async def get_claim(claim_id: UUID, program_id: UUID = Query(...)):
    """Get a single claim by ID."""
    try:
        row = await runner.get_claim(claim_id, program_id)
        if not row:
            raise HTTPException(status_code=404, detail="Claim not found")
        return ClaimResponse(**row)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/claims/{claim_id}/score", response_model=ClaimScoreBreakdown)
async def score_claim(claim_id: UUID, program_id: UUID = Query(...)):
    """Compute claim confidence from support links (anti-hallucination scorer)."""
    try:
        result = await runner.score_claim(claim_id, program_id)
        return ClaimScoreBreakdown(**result)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/claims/{claim_id}/verify")
async def verify_claim(claim_id: UUID, program_id: UUID = Query(...)):
    """Verify a claim's hash integrity against the ledger."""
    try:
        result = await runner.verify_claim_integrity(claim_id, program_id)
        return result
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Sources
# =============================================================================

@router.post("/sources", response_model=SourceResponse, status_code=201)
async def create_source(
    body: CreateSourceRequest,
    ctx: EvidenceAdminContext = Depends(get_evidence_context),
):
    """Create a source record. Deduplicates by content_hash."""
    try:
        row = await runner.create_source(
            program_id=body.program_id,
            source_type=body.source_type,
            source_ref=body.source_ref,
            source_uri=body.source_uri,
            content=body.content,
            metadata=body.metadata,
            actor=ctx.admin_actor,
            request_id=ctx.request_id,
        )
        return SourceResponse(**row)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/sources", response_model=SourceListResponse)
async def list_sources(
    program_id: UUID = Query(..., description="Filter by program"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List sources for a program (paginated)."""
    try:
        rows = await runner.list_sources(program_id, limit=limit, offset=offset)
        return SourceListResponse(sources=[SourceResponse(**r) for r in rows], total=len(rows))
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Support (claim ↔ source links)
# =============================================================================

@router.post("/support", response_model=SupportResponse, status_code=201)
async def create_support(
    body: CreateSupportRequest,
    ctx: EvidenceAdminContext = Depends(get_evidence_context),
):
    """Link a claim to a source with support type + strength."""
    try:
        row = await runner.create_support(
            claim_id=body.claim_id,
            source_id=body.source_id,
            program_id=body.program_id,
            support_type=body.support_type,
            strength=body.strength,
            span_start=body.span_start,
            span_end=body.span_end,
            annotation=body.annotation,
            actor=ctx.admin_actor,
            request_id=ctx.request_id,
        )
        return SupportResponse(**row)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/claims/{claim_id}/support", response_model=SupportListResponse)
async def get_support_for_claim(
    claim_id: UUID,
    program_id: UUID = Query(...),
):
    """Get all support links for a claim."""
    try:
        rows = await runner.get_support_for_claim(claim_id, program_id)
        return SupportListResponse(
            support=[SupportResponse(**r) for r in rows],
            total=len(rows),
        )
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Derivations
# =============================================================================

@router.post("/derivations", response_model=DerivationResponse, status_code=201)
async def create_derivation(
    body: CreateDerivationRequest,
    ctx: EvidenceAdminContext = Depends(get_evidence_context),
):
    """Record a derivation link (claim → claim)."""
    try:
        row = await runner.create_derivation(
            program_id=body.program_id,
            derived_claim_id=body.derived_claim_id,
            source_claim_id=body.source_claim_id,
            derivation_type=body.derivation_type,
            reasoning=body.reasoning,
            model_id=body.model_id,
            actor=ctx.admin_actor,
        )
        return DerivationResponse(**row)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/claims/{claim_id}/chain")
async def get_derivation_chain(
    claim_id: UUID,
    program_id: UUID = Query(...),
):
    """Get the full derivation chain for a claim (recursive, up to 10 levels)."""
    try:
        rows = await runner.get_derivation_chain(claim_id, program_id)
        return {"chain": rows, "depth": len(rows)}
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Provenance
# =============================================================================

@router.post("/provenance", response_model=ProvenanceResponse, status_code=201)
async def create_provenance(
    body: CreateProvenanceRequest,
    ctx: EvidenceAdminContext = Depends(get_evidence_context),
):
    """Record execution → evidence provenance link."""
    try:
        row = await runner.create_provenance(
            program_id=body.program_id,
            event_type=body.event_type,
            claim_id=body.claim_id,
            source_id=body.source_id,
            workflow_run_id=body.workflow_run_id,
            step_run_id=body.step_run_id,
            batch_id=body.batch_id,
            actor=ctx.admin_actor,
            request_id=ctx.request_id,
            metadata=body.metadata,
        )
        return ProvenanceResponse(**row)
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/provenance")
async def get_provenance(
    claim_id: Optional[UUID] = Query(None),
    step_run_id: Optional[UUID] = Query(None),
    request_id: Optional[str] = Query(None),
    program_id: UUID = Query(...),
):
    """Query provenance by claim, step, or request ID."""
    try:
        if claim_id:
            rows = await runner.get_provenance_for_claim(claim_id, program_id)
        elif step_run_id:
            rows = await runner.get_provenance_for_step(step_run_id, program_id)
        elif request_id:
            rows = await runner.get_provenance_by_request(request_id, program_id)
        else:
            raise HTTPException(
                status_code=400,
                detail="Provide at least one of: claim_id, step_run_id, request_id",
            )
        return {"provenance": rows, "total": len(rows)}
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Contradiction detector
# =============================================================================

@router.get("/contradictions")
async def detect_contradictions(
    program_id: UUID = Query(...),
    section_ref: Optional[str] = Query(None),
):
    """Detect contradicting claims about the same entity/field."""
    try:
        results = await runner.detect_contradictions(program_id, section_ref)
        return {"contradictions": results, "total": len(results)}
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Evidence Health Summary — dashboard panel data
# =============================================================================

@router.get("/health-summary")
async def get_health_summary(
    program_id: UUID = Query(...),
):
    """Aggregated evidence health for the dashboard panel.

    Returns latest scan info, claims breakdown, source/provenance counts,
    and the top 5 contradictions from the latest completed scan.
    Loads in <1s — all data from indexed queries.
    """
    try:
        result = await scanner.health_summary(program_id)
        return result
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Contradiction Scanner — batch scan with persisted results
# =============================================================================

@router.post("/contradiction-scans")
async def run_contradiction_scan(
    program_id: UUID = Query(...),
    scan_type: str = Query("full"),
    section_ref: Optional[str] = Query(None),
    triggered_by: str = Query("manual"),
    ctx: EvidenceAdminContext = Depends(get_evidence_context),
):
    """Run a contradiction scan and persist the results.

    Creates a scan record, executes detection, and stores the snapshot.
    Scan types: full (all claims), section (filtered by section_ref).
    """
    try:
        result = await scanner.run_scan(
            program_id=program_id,
            scan_type=scan_type,
            section_ref=section_ref,
            triggered_by=triggered_by,
            actor=ctx.admin_actor,
        )
        return result
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/contradiction-scans")
async def list_contradiction_scans(
    program_id: UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List contradiction scans for a program (newest first)."""
    try:
        scans = await scanner.list_scans(program_id, limit, offset)
        return {"scans": scans, "total": len(scans)}
    except LiteModeError as e:
        _handle_lite_mode(e)


@router.get("/contradiction-scans/{scan_id}")
async def get_contradiction_scan(
    scan_id: UUID,
    program_id: UUID = Query(...),
):
    """Get a specific contradiction scan by ID."""
    try:
        result = await scanner.get_scan(scan_id, program_id)
        if not result:
            raise HTTPException(status_code=404, detail="Scan not found")
        return result
    except LiteModeError as e:
        _handle_lite_mode(e)


# =============================================================================
# Defense Packet — regulatory export ZIP
# =============================================================================

@router.get("/defense-packet")
async def download_defense_packet(
    program_id: UUID = Query(...),
    ctx: EvidenceAdminContext = Depends(require_evidence_admin),
):
    """Generate and download a Regulatory Defense Packet (ZIP).

    Returns a self-contained ZIP archive containing all evidence data,
    integrity hashes, contradiction scan snapshots, and a manifest.
    Actor fields are SHA-256 prefix hashed (8 chars) — no PII in export.
    """
    try:
        buf = await defense_packet.build_defense_packet(program_id)
        filename = f"defense-packet-{program_id}.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except LiteModeError as e:
        _handle_lite_mode(e)
