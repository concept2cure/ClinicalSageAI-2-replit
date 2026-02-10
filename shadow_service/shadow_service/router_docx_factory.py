"""Phase 6 — DOCX Factory: FastAPI router.

Auth: same fail-closed REVIEW_ADMIN_TOKEN pattern as Evidence Fabric.
All endpoints delegate to docx_factory_runner for DB logic.
Render execution delegates to docx_renderer.
"""

import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from . import docx_factory_runner as runner
from . import docx_renderer
from . import seed_docx_templates as seeder
from .blob_store import get_blob_store
from .models_docx_factory import (
    ArtifactResponse,
    CreateRenderRequest,
    CreateTemplateRequest,
    CreateTemplateVersionRequest,
    RenderEventResponse,
    RenderListResponse,
    RenderResponse,
    TemplateListResponse,
    TemplateResponse,
    TemplateVersionListResponse,
    TemplateVersionResponse,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Auth — fail-closed admin token guard
# =============================================================================

@dataclass
class DocxAdminContext:
    """Audit context for the current request."""
    actor_hash: str  # sha256(token)[:8] — never the raw secret


def require_docx_admin(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> DocxAdminContext:
    """Fail-closed auth: 503 if env missing, 403 if token wrong."""
    expected = os.getenv("REVIEW_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="DOCX Factory service is disabled (REVIEW_ADMIN_TOKEN not configured)",
        )
    if x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden")
    actor_hash = hashlib.sha256(expected.encode()).hexdigest()[:8]
    return DocxAdminContext(actor_hash=actor_hash)


def _handle_lite_mode(e: Exception) -> None:
    """Convert LiteModeError to 503."""
    from .db import LiteModeError
    if isinstance(e, LiteModeError):
        raise HTTPException(status_code=503, detail="Database not available (lite mode)")
    raise


# =============================================================================
# Router
# =============================================================================

router = APIRouter(
    prefix="/docx",
    tags=["DOCX Factory"],
    dependencies=[Depends(require_docx_admin)],
)


# ── Templates ────────────────────────────────────────────────────────────────

@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def create_template(req: CreateTemplateRequest):
    """Register a new document template."""
    try:
        result = await runner.create_template(
            program_id=req.program_id,
            name=req.name,
            doc_type=req.doc_type,
            status=req.status,
        )
        return result
    except Exception as e:
        _handle_lite_mode(e)
        raise


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates(program_id: UUID = Query(...)):
    """List all templates for a program."""
    try:
        items = await runner.list_templates(program_id)
        return {"items": items, "total": len(items)}
    except Exception as e:
        _handle_lite_mode(e)
        raise


# ── Template Versions ────────────────────────────────────────────────────────

@router.post(
    "/templates/{template_id}/versions",
    response_model=TemplateVersionResponse,
    status_code=201,
)
async def create_template_version(template_id: UUID, req: CreateTemplateVersionRequest):
    """Register a new version of a template (metadata only — file upload in PR 6.2)."""
    try:
        # Resolve program_id from parent template
        template = await runner.get_template(program_id=None, template_id=template_id)
        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

        result = await runner.create_template_version(
            program_id=template["program_id"],
            template_id=template_id,
            storage_key=req.storage_key,
            sha256=req.sha256,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        _handle_lite_mode(e)
        raise


@router.get(
    "/templates/{template_id}/versions",
    response_model=TemplateVersionListResponse,
)
async def list_template_versions(template_id: UUID, program_id: UUID = Query(...)):
    """List all versions for a template (scoped to program)."""
    try:
        template = await runner.get_template(program_id, template_id)
        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

        items = await runner.list_template_versions(program_id, template_id)
        return {"items": items, "total": len(items)}
    except HTTPException:
        raise
    except Exception as e:
        _handle_lite_mode(e)
        raise


# ── Renders ──────────────────────────────────────────────────────────────────

@router.post("/renders", response_model=RenderResponse, status_code=201)
async def create_render(req: CreateRenderRequest):
    """Create a render request (queued)."""
    try:
        result = await runner.create_render(
            program_id=req.program_id,
            template_version_id=req.template_version_id,
            inputs_json=req.inputs_json,
        )
        return result
    except Exception as e:
        _handle_lite_mode(e)
        raise


@router.get("/renders/{render_id}", response_model=RenderResponse)
async def get_render(render_id: UUID, program_id: UUID = Query(...)):
    """Get a render by ID."""
    try:
        result = await runner.get_render(program_id, render_id)
        if not result:
            raise HTTPException(status_code=404, detail=f"Render {render_id} not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        _handle_lite_mode(e)
        raise


@router.get("/renders", response_model=RenderListResponse)
async def list_renders(program_id: UUID = Query(...)):
    """List all renders for a program."""
    try:
        items = await runner.list_renders(program_id)
        return {"items": items, "total": len(items)}
    except Exception as e:
        _handle_lite_mode(e)
        raise


# ── Render Execution ─────────────────────────────────────────────────────────

@router.post("/renders/{render_id}/execute", response_model=ArtifactResponse)
async def execute_render(render_id: UUID, program_id: UUID = Query(...)):
    """Execute a queued render: fill template → produce artifact.

    Transitions: queued → running → completed (or failed).
    Requires program_id query param to enforce cross-program ownership.
    Returns the produced artifact metadata on success.
    """
    try:
        artifact = await docx_renderer.render_document(render_id, program_id=program_id)
        return artifact
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _handle_lite_mode(e)
        raise


# ── Render Events (read-only) ────────────────────────────────────────────────

@router.get("/renders/{render_id}/events", response_model=list[RenderEventResponse])
async def list_render_events(render_id: UUID, program_id: UUID = Query(...)):
    """List all events for a render, chronologically.

    Requires program_id to enforce cross-program ownership.
    """
    try:
        # Verify render belongs to program
        render = await runner.get_render(program_id, render_id)
        if not render:
            raise HTTPException(
                status_code=404, detail=f"Render {render_id} not found"
            )
        events = await runner.list_render_events(render_id)
        return events
    except HTTPException:
        raise
    except Exception as e:
        _handle_lite_mode(e)
        raise


# ── Artifact Download ────────────────────────────────────────────────────────

DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact(artifact_id: UUID, program_id: UUID = Query(...)):
    """Stream a rendered artifact's bytes (DOCX).

    Requires program_id query param to enforce cross-program ownership.
    Returns a streaming download with Content-Disposition attachment header.
    """
    try:
        artifact = await runner.get_artifact_for_program(artifact_id, program_id)
        if not artifact:
            raise HTTPException(
                status_code=404, detail=f"Artifact {artifact_id} not found"
            )

        store = get_blob_store()
        stream = await store.get_stream(artifact["storage_key"])

        filename = f"artifact-{artifact_id}.{artifact['file_type']}"
        return StreamingResponse(
            stream,
            media_type=DOCX_MEDIA_TYPE,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Artifact-SHA256": artifact["sha256"],
            },
        )
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail="Artifact file not found in storage"
        )
    except Exception as e:
        _handle_lite_mode(e)
        raise


# ── Seed Templates ───────────────────────────────────────────────────────────

@router.post("/seed")
async def seed_templates(program_id: UUID = Query(...)):
    """Seed starter templates into a program (idempotent).

    Creates 6 regulatory-real templates + versions + demo input packs.
    Safe to call multiple times — duplicates are skipped.
    """
    try:
        result = await seeder.seed_for_program(program_id)
        return result
    except Exception as e:
        _handle_lite_mode(e)
        raise


@router.get("/demo-packs")
async def list_demo_packs(doc_type: str | None = Query(default=None)):
    """List available demo input packs (no DB required).

    If doc_type is provided, returns packs for that template type only.
    Otherwise returns all packs grouped by template.
    """
    if doc_type:
        return seeder.get_demo_packs_for_template(doc_type)
    return seeder.get_all_demo_packs()
