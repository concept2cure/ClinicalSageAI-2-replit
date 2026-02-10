"""Phase 6 — DOCX Factory: Runner (lifecycle management).

Manages the full lifecycle of templates, template versions, renders,
artifacts, and render events.  This module handles:

  - create_template / get_template
  - create_template_version (register metadata + sha256 + storage key)
  - create_render (queued) / transition_render (running → completed/failed)
  - create_artifact (metadata only)
  - append_render_event (append-only, never update/delete)
"""

import json
import logging
from typing import Any, Optional
from uuid import UUID

from . import db
from . import sql_docx_factory as sql

logger = logging.getLogger(__name__)


# =============================================================================
# RLS helper
# =============================================================================

async def _set_rls(conn, program_id: UUID) -> None:
    """Set the RLS GUC for the current transaction."""
    await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))


# =============================================================================
# Templates
# =============================================================================

async def create_template(
    program_id: UUID,
    name: str,
    doc_type: str = "generic",
    status: str = "active",
) -> dict[str, Any]:
    """Create a new document template."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        row = await conn.fetchrow(
            sql.INSERT_TEMPLATE,
            program_id, name, doc_type, status,
        )
        return dict(row)
    finally:
        await db.release_connection(conn)


async def get_template(
    program_id: UUID | None,
    template_id: UUID,
) -> Optional[dict[str, Any]]:
    """Get a template by ID.

    If program_id is None, uses bypass-RLS (needed when resolving
    the parent template for version creation).
    """
    conn = await db.acquire_connection()
    try:
        if program_id:
            await _set_rls(conn, program_id)
        else:
            await conn.execute(sql.SET_BYPASS_RLS)
        row = await conn.fetchrow(sql.SELECT_TEMPLATE_BY_ID, template_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_templates(program_id: UUID) -> list[dict[str, Any]]:
    """List all templates for a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_TEMPLATES_BY_PROGRAM, program_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# Template Versions
# =============================================================================

async def create_template_version(
    program_id: UUID,
    template_id: UUID,
    storage_key: str,
    sha256: str,
) -> dict[str, Any]:
    """Register a new version of a template.

    Auto-increments the version number.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        # Get next version number
        ver_row = await conn.fetchrow(sql.SELECT_NEXT_VERSION_NUMBER, template_id)
        next_ver = ver_row["next_version"]

        row = await conn.fetchrow(
            sql.INSERT_TEMPLATE_VERSION,
            template_id, next_ver, storage_key, sha256,
        )

        # Append event
        await _append_event_raw(
            conn, None, "template_version_created",
            {"template_id": str(template_id), "version": next_ver, "sha256": sha256},
        )

        return dict(row)
    finally:
        await db.release_connection(conn)


async def get_template_version(template_version_id: UUID) -> Optional[dict[str, Any]]:
    """Get a template version by ID."""
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql.SELECT_TEMPLATE_VERSION_BY_ID, template_version_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_template_versions(
    program_id: UUID,
    template_id: UUID,
) -> list[dict[str, Any]]:
    """List all versions for a template, scoped to a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(
            sql.SELECT_TEMPLATE_VERSIONS_FOR_PROGRAM,
            template_id,
            program_id,
        )
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# Renders
# =============================================================================

async def create_render(
    program_id: UUID,
    template_version_id: UUID,
    inputs_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a render request (status='queued').

    Returns the render record with a queued status.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        row = await conn.fetchrow(
            sql.INSERT_RENDER,
            program_id, template_version_id, json.dumps(inputs_json or {}),
        )
        render = dict(row)

        # Append creation event
        await conn.fetchrow(
            sql.INSERT_RENDER_EVENT,
            render["id"], "render_queued",
            json.dumps({"template_version_id": str(template_version_id)}),
        )

        return render
    finally:
        await db.release_connection(conn)


async def get_render(program_id: UUID, render_id: UUID) -> Optional[dict[str, Any]]:
    """Get a render by ID."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        row = await conn.fetchrow(sql.SELECT_RENDER_BY_ID, render_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_renders(program_id: UUID) -> list[dict[str, Any]]:
    """List all renders for a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_RENDERS_BY_PROGRAM, program_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def transition_render_running(render_id: UUID) -> dict[str, Any]:
    """Transition a render from queued → running."""
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql.UPDATE_RENDER_STATUS_RUNNING, render_id)
        if not row:
            raise ValueError(f"Render {render_id} not found")
        render = dict(row)

        await conn.fetchrow(
            sql.INSERT_RENDER_EVENT,
            render_id, "render_started",
            json.dumps({"started_at": str(render["started_at"])}),
        )

        return render
    finally:
        await db.release_connection(conn)


async def transition_render_completed(render_id: UUID) -> dict[str, Any]:
    """Transition a render from running → completed."""
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql.UPDATE_RENDER_STATUS_COMPLETED, render_id)
        if not row:
            raise ValueError(f"Render {render_id} not found")
        render = dict(row)

        await conn.fetchrow(
            sql.INSERT_RENDER_EVENT,
            render_id, "render_completed",
            json.dumps({"completed_at": str(render["completed_at"])}),
        )

        return render
    finally:
        await db.release_connection(conn)


async def transition_render_failed(render_id: UUID, error: str) -> dict[str, Any]:
    """Transition a render from running → failed."""
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql.UPDATE_RENDER_STATUS_FAILED, render_id, error[:1000])
        if not row:
            raise ValueError(f"Render {render_id} not found")
        render = dict(row)

        await conn.fetchrow(
            sql.INSERT_RENDER_EVENT,
            render_id, "render_failed",
            json.dumps({"error": error[:200]}),
        )

        return render
    finally:
        await db.release_connection(conn)


# =============================================================================
# Artifacts
# =============================================================================

async def create_artifact(
    render_id: UUID,
    file_type: str,
    storage_key: str,
    sha256: str,
    size_bytes: int,
) -> dict[str, Any]:
    """Register a produced artifact (metadata only — bytes live in blob store)."""
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(
            sql.INSERT_ARTIFACT,
            render_id, file_type, storage_key, sha256, size_bytes,
        )
        artifact = dict(row)

        await conn.fetchrow(
            sql.INSERT_RENDER_EVENT,
            render_id, "artifact_created",
            json.dumps({
                "artifact_id": str(artifact["id"]),
                "file_type": file_type,
                "sha256": sha256,
                "size_bytes": size_bytes,
            }),
        )

        return artifact
    finally:
        await db.release_connection(conn)


async def get_artifact(artifact_id: UUID) -> Optional[dict[str, Any]]:
    """Get an artifact by ID (for download).

    No RLS check — artifact access is validated at the router layer
    by joining back to the render's program_id.
    """
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql.SELECT_ARTIFACT_BY_ID, artifact_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def get_artifact_for_program(
    artifact_id: UUID,
    program_id: UUID,
) -> Optional[dict[str, Any]]:
    """Get an artifact by ID, scoped to a specific program.

    JOINs artifacts → renders to verify the artifact's render belongs
    to the claimed program_id.  Returns None on mismatch (404-safe).
    """
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(
            sql.SELECT_ARTIFACT_BY_ID_WITH_PROGRAM,
            artifact_id,
            program_id,
        )
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_artifacts(render_id: UUID) -> list[dict[str, Any]]:
    """List all artifacts for a render."""
    conn = await db.acquire_connection()
    try:
        rows = await conn.fetch(sql.SELECT_ARTIFACTS_BY_RENDER, render_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_template_version_with_template(
    template_version_id: UUID,
) -> Optional[dict[str, Any]]:
    """Get template version joined with parent template info.

    Returns: version_id, template_id, version, storage_key, sha256,
             program_id, template_name, doc_type.
    Used by the renderer to resolve everything in one query.
    """
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(
            sql.SELECT_TEMPLATE_VERSION_WITH_TEMPLATE,
            template_version_id,
        )
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


# =============================================================================
# Render Events (append-only)
# =============================================================================

async def _append_event_raw(
    conn, render_id: UUID | None, event_type: str, payload: dict[str, Any],
) -> None:
    """Internal: append a render event using an existing connection.

    If render_id is None, skips (used for non-render events like version creation).
    """
    if render_id is None:
        return
    await conn.fetchrow(
        sql.INSERT_RENDER_EVENT,
        render_id, event_type, json.dumps(payload),
    )


async def append_render_event(
    render_id: UUID,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append a render event (public API — acquires its own connection).

    Events are append-only: no update or delete operations exist.
    """
    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(
            sql.INSERT_RENDER_EVENT,
            render_id, event_type, json.dumps(payload or {}),
        )
        return dict(row)
    finally:
        await db.release_connection(conn)


async def list_render_events(render_id: UUID) -> list[dict[str, Any]]:
    """List all events for a render, chronologically."""
    conn = await db.acquire_connection()
    try:
        rows = await conn.fetch(sql.SELECT_RENDER_EVENTS, render_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)
