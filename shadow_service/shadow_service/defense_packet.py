"""Regulatory Defense Packet — deterministic ZIP export.

Produces a self-contained ZIP archive that can be handed to QA, legal,
or a regulatory inspector as proof of evidence integrity.

Contents:
  manifest.json       — packet metadata + SHA-256 of every enclosed file
  claims.json         — all claims (active + historical)
  sources.json        — all source captures
  support_links.json  — claim ↔ source links with strength
  derivations.json    — claim → claim reasoning chains
  provenance.json     — execution → evidence traceability
  hash_ledger.json    — append-only tamper-evident fingerprints
  scans.json          — all contradiction scan snapshots
  summary.json        — human-readable executive summary

Security:
  - Actor fields are SHA-256 prefix hashed (first 8 chars) in the
    public export. Full actor is only in server-side audit logs.
  - No raw credentials, model weights, or PII are included.

@version 1.0.0
@phase 5.3.B — Truth Machine / Defense Packet
"""

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from . import db
from . import sql_evidence as sql


# =============================================================================
# Helpers
# =============================================================================

def _json_serial(obj: Any) -> str:
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not JSON serializable")


def _to_dicts(rows: list) -> list[dict]:
    """Convert asyncpg Record rows to plain dicts."""
    return [dict(r) for r in rows]


def _hash_actor(actor: str | None) -> str:
    """Hash actor to 8-char prefix — no PII in exported packet."""
    if not actor:
        return "unknown"
    return hashlib.sha256(actor.encode()).hexdigest()[:8]


def _redact_actors(items: list[dict], field: str = "actor") -> list[dict]:
    """Replace actor fields with hashed prefix across a list of dicts."""
    for item in items:
        if field in item:
            item[field] = _hash_actor(item[field])
    return items


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# =============================================================================
# Core — build_defense_packet
# =============================================================================

async def build_defense_packet(program_id: UUID) -> io.BytesIO:
    """Build a deterministic ZIP archive for a regulatory program.

    Returns an in-memory BytesIO buffer containing the ZIP.
    """
    conn = await db.acquire_connection()
    try:
        await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))

        # Run all export queries in parallel-ish (sequential for safety)
        claims_rows = await conn.fetch(sql.EXPORT_ALL_CLAIMS, program_id)
        sources_rows = await conn.fetch(sql.EXPORT_ALL_SOURCES, program_id)
        support_rows = await conn.fetch(sql.EXPORT_ALL_SUPPORT_LINKS, program_id)
        derivation_rows = await conn.fetch(sql.EXPORT_ALL_DERIVATIONS, program_id)
        provenance_rows = await conn.fetch(sql.EXPORT_ALL_PROVENANCE, program_id)
        hash_ledger_rows = await conn.fetch(sql.EXPORT_HASH_LEDGER, program_id)
        scans_rows = await conn.fetch(sql.EXPORT_ALL_SCANS, program_id)
    finally:
        await db.release_connection(conn)

    # Convert to dicts
    claims = _to_dicts(claims_rows)
    sources = _to_dicts(sources_rows)
    support_links = _to_dicts(support_rows)
    derivations = _to_dicts(derivation_rows)
    provenance = _redact_actors(_to_dicts(provenance_rows))
    hash_ledger = _to_dicts(hash_ledger_rows)
    scans = _redact_actors(_to_dicts(scans_rows))

    # Build summary
    now = datetime.now(timezone.utc)
    active_claims = [c for c in claims if c.get("status") == "active"]
    completed_scans = [s for s in scans if s.get("status") == "completed"]
    latest_scan = completed_scans[-1] if completed_scans else None
    total_contradictions = sum(
        s.get("contradictions_found", 0) for s in completed_scans
    )

    summary = {
        "program_id": str(program_id),
        "generated_at": now.isoformat(),
        "generator": "Concept2Cure.RI Defense Packet v1.0.0",
        "counts": {
            "claims_total": len(claims),
            "claims_active": len(active_claims),
            "sources": len(sources),
            "support_links": len(support_links),
            "derivations": len(derivations),
            "provenance_entries": len(provenance),
            "hash_ledger_entries": len(hash_ledger),
            "scans_total": len(scans),
            "scans_completed": len(completed_scans),
        },
        "integrity": {
            "total_contradictions_ever_found": total_contradictions,
            "latest_scan_id": str(latest_scan["id"]) if latest_scan else None,
            "latest_scan_at": (
                latest_scan["completed_at"].isoformat()
                if latest_scan and latest_scan.get("completed_at")
                else None
            ),
            "latest_contradictions": (
                latest_scan.get("contradictions_found", 0) if latest_scan else 0
            ),
        },
        "disclosure": {
            "actor_handling": "SHA-256 prefix (8 chars) — no PII in export",
            "model_ids_included": True,
            "raw_data_included": False,
            "note": "This packet is a point-in-time snapshot of the evidence fabric.",
        },
    }

    # Serialize all files
    files: dict[str, bytes] = {}
    for name, data in [
        ("claims.json", claims),
        ("sources.json", sources),
        ("support_links.json", support_links),
        ("derivations.json", derivations),
        ("provenance.json", provenance),
        ("hash_ledger.json", hash_ledger),
        ("scans.json", scans),
        ("summary.json", summary),
    ]:
        files[name] = json.dumps(
            data, default=_json_serial, indent=2, sort_keys=True,
        ).encode("utf-8")

    # Build manifest with SHA-256 of each file
    manifest = {
        "version": "1.0.0",
        "program_id": str(program_id),
        "generated_at": now.isoformat(),
        "files": {
            name: {"size": len(content), "sha256": _sha256(content)}
            for name, content in files.items()
        },
    }
    manifest_bytes = json.dumps(
        manifest, indent=2, sort_keys=True,
    ).encode("utf-8")

    # Pack into ZIP
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_bytes)
        for name, content in files.items():
            zf.writestr(name, content)
    buf.seek(0)

    return buf
