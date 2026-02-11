"""Defense Packet Repository — Phase 6.6.D.

Persistence + staleness detection + diff engine for defense packets.
All DB access goes through this module.

Usage:
    from shadow_service.defense_packet_repository import (
        create_defense_packet,
        check_staleness,
        diff_packets,
    )
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

# Lazy imports for DB-dependent modules (asyncpg may not be available in test envs)
# These are imported inside async functions that actually need them.
from .models_defense_packet import (
    CreateDefensePacketRequest,
    DefensePacketDiffSummary,
    DefensePacketRecord,
    StalenessCheckResult,
    is_valid_transition,
)
from .predicate_intel.manifest import (
    GENERATOR_VERSION,
    canonical_sort,
    compute_risk_vocab_hash,
)
from .scoring.risk_code_map import RISK_CODE_MAP_VERSION

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Create
# ═══════════════════════════════════════════════════════════════════════════════

async def create_defense_packet(
    *,
    program_id: str,
    product_code: str,
    subject_device: dict[str, Any],
    predicate_record: dict[str, Any],
    design_control_ids: Optional[dict[str, str]] = None,
    render: bool = True,
    created_by_user_id: str = "system",
) -> dict[str, Any]:
    """Create a defense packet: generate payload → persist → optionally render.

    Returns dict matching CreateDefensePacketResponse.
    """
    # Lazy imports for DB-dependent modules
    from . import db
    from . import sql_defense_packets as sql_dp
    from .generators.se_matrix_payload import generate_se_matrix_with_manifest

    # Step 1: Generate SE matrix + manifest
    result = generate_se_matrix_with_manifest(
        program_id=program_id,
        product_code=product_code,
        subject_device=subject_device,
        predicate_record=predicate_record,
        design_control_ids=design_control_ids,
    )

    manifest = result["manifest"]
    payload = result["payload"]
    evidence_tasks = result["evidence_tasks"]

    subject_hash = manifest["subject_hash"]
    manifest_hash = manifest["manifest_hash"]

    # Step 2: Check for idempotency — if manifest_hash already exists, return it
    conn = await db.acquire_connection()
    try:
        existing = await conn.fetchrow(
            sql_dp.SELECT_PACKET_BY_MANIFEST_HASH, manifest_hash,
        )
        if existing:
            existing_dict = dict(existing)
            return _build_response(existing_dict, diff_summary=None)

        # Step 3: Find previous packet for same program+subject (for diffing)
        previous = await conn.fetchrow(
            sql_dp.SELECT_LATEST_PACKET_FOR_SUBJECT,
            UUID(program_id) if not isinstance(program_id, UUID) else program_id,
            subject_hash,
        )
        previous_packet_id = str(previous["id"]) if previous else None

        # Step 4: Determine render_job_id and initial status
        render_job_id = f"rj_{manifest_hash[:16]}_{int(datetime.now(timezone.utc).timestamp() * 1000)}" if render else None
        initial_status = "RENDERING" if render else "CREATED"

        # Step 5: Persist
        row = await conn.fetchrow(
            sql_dp.INSERT_DEFENSE_PACKET,
            UUID(program_id) if not isinstance(program_id, UUID) else program_id,  # $1
            subject_hash,                                              # $2
            manifest["predicate_k_number"],                            # $3
            manifest["risk_code_map_version"],                         # $4
            manifest["risk_vocab_hash"],                               # $5
            manifest["generator_version"],                             # $6
            manifest["defense_readiness_score"],                       # $7
            json.dumps(manifest["top_risks"]),                         # $8
            json.dumps(evidence_tasks),                                # $9
            json.dumps(payload),                                       # $10
            json.dumps(subject_device),                                # $11
            json.dumps(manifest["risk_codes_used"]),                   # $12
            manifest_hash,                                             # $13
            product_code,                                              # $14
            initial_status,                                            # $15
            render_job_id,                                             # $16
            created_by_user_id,                                        # $17
            UUID(previous_packet_id) if previous_packet_id else None,  # $18
        )

        packet_dict = dict(row)

        # Step 6: Compute diff if previous exists
        diff_summary = None
        if previous:
            diff_summary = diff_packets(dict(previous), packet_dict)

        return _build_response(packet_dict, diff_summary=diff_summary)

    finally:
        await db.release_connection(conn)


def _build_response(
    packet: dict[str, Any],
    diff_summary: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build CreateDefensePacketResponse dict from DB row."""
    tasks = packet.get("tasks", [])
    if isinstance(tasks, str):
        tasks = json.loads(tasks)

    top_risks = packet.get("top_risks", [])
    if isinstance(top_risks, str):
        top_risks = json.loads(top_risks)

    risk_codes_used = packet.get("risk_codes_used", [])
    if isinstance(risk_codes_used, str):
        risk_codes_used = json.loads(risk_codes_used)

    return {
        "defense_packet_id": str(packet["id"]),
        "manifest_hash": packet["manifest_hash"],
        "defense_readiness_score": packet["defense_readiness_score"],
        "top_risks": top_risks,
        "risk_codes_used": risk_codes_used,
        "tasks": tasks,
        "render_job_id": packet.get("render_job_id"),
        "status": packet["status"],
        "subject_hash": packet.get("subject_hash", ""),
        "previous_packet_id": str(packet["previous_packet_id"]) if packet.get("previous_packet_id") else None,
        "diff_summary": diff_summary,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Read
# ═══════════════════════════════════════════════════════════════════════════════

async def get_packet_by_id(packet_id: str) -> Optional[dict[str, Any]]:
    """Fetch a defense packet by ID."""
    from . import db
    from . import sql_defense_packets as sql_dp

    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql_dp.SELECT_PACKET_BY_ID, UUID(packet_id))
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def get_packet_by_manifest_hash(manifest_hash: str) -> Optional[dict[str, Any]]:
    """Fetch a defense packet by manifest hash."""
    from . import db
    from . import sql_defense_packets as sql_dp

    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(sql_dp.SELECT_PACKET_BY_MANIFEST_HASH, manifest_hash)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def get_packets_for_program(program_id: str) -> list[dict[str, Any]]:
    """List all defense packets for a program (newest first)."""
    from . import db
    from . import sql_defense_packets as sql_dp

    conn = await db.acquire_connection()
    try:
        rows = await conn.fetch(
            sql_dp.SELECT_PACKETS_BY_PROGRAM,
            UUID(program_id),
        )
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_latest_packet_for_subject(
    program_id: str,
    subject_hash: str,
) -> Optional[dict[str, Any]]:
    """Get the most recent packet for a program+subject combination."""
    from . import db
    from . import sql_defense_packets as sql_dp

    conn = await db.acquire_connection()
    try:
        row = await conn.fetchrow(
            sql_dp.SELECT_LATEST_PACKET_FOR_SUBJECT,
            UUID(program_id),
            subject_hash,
        )
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Update
# ═══════════════════════════════════════════════════════════════════════════════

async def update_packet_status(
    packet_id: str,
    status: str,
    *,
    render_job_id: Optional[str] = None,
    error_code: Optional[str] = None,
    error_detail: Optional[str] = None,
    staleness_reason: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Update a packet's status with lifecycle validation."""
    from . import db
    from . import sql_defense_packets as sql_dp

    conn = await db.acquire_connection()
    try:
        # Fetch current status
        current = await conn.fetchrow(sql_dp.SELECT_PACKET_BY_ID, UUID(packet_id))
        if not current:
            return None

        current_status = current["status"]
        if not is_valid_transition(current_status, status):
            logger.warning(
                "Invalid status transition: %s → %s for packet %s",
                current_status, status, packet_id,
            )
            return None

        if status == "RENDERING":
            row = await conn.fetchrow(
                sql_dp.UPDATE_PACKET_RENDERING, UUID(packet_id), render_job_id,
            )
        elif status == "RENDERED":
            row = await conn.fetchrow(
                sql_dp.UPDATE_PACKET_RENDERED, UUID(packet_id), render_job_id,
            )
        elif status == "FAILED":
            row = await conn.fetchrow(
                sql_dp.UPDATE_PACKET_FAILED,
                UUID(packet_id), error_code or "UNKNOWN", error_detail or "",
            )
        elif status == "STALE":
            row = await conn.fetchrow(
                sql_dp.UPDATE_PACKET_STALE, UUID(packet_id), staleness_reason or "",
            )
        else:
            row = await conn.fetchrow(
                sql_dp.UPDATE_PACKET_STATUS, UUID(packet_id), status,
            )

        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Staleness Detection
# ═══════════════════════════════════════════════════════════════════════════════

def check_staleness(packet: dict[str, Any]) -> StalenessCheckResult:
    """Check if a defense packet is stale based on current upstream state.

    Staleness triggers:
      1. risk_vocab.yml hash has changed (risk_vocab_hash mismatch)
      2. risk_code_map_version has changed
      3. generator_version has changed

    Pure function — no DB, no network. Deterministic.
    """
    current_risk_vocab_hash = compute_risk_vocab_hash()
    current_risk_code_map_version = RISK_CODE_MAP_VERSION
    current_generator_version = GENERATOR_VERSION

    packet_risk_vocab_hash = packet.get("risk_vocab_hash", "")
    packet_risk_code_map_version = packet.get("risk_code_map_version", "")
    packet_generator_version = packet.get("generator_version", "")

    reasons: list[str] = []

    if current_risk_vocab_hash != packet_risk_vocab_hash:
        reasons.append(
            f"risk_vocab_hash changed: {packet_risk_vocab_hash} → {current_risk_vocab_hash}"
        )

    if current_risk_code_map_version != packet_risk_code_map_version:
        reasons.append(
            f"risk_code_map_version changed: {packet_risk_code_map_version} → {current_risk_code_map_version}"
        )

    if current_generator_version != packet_generator_version:
        reasons.append(
            f"generator_version changed: {packet_generator_version} → {current_generator_version}"
        )

    return StalenessCheckResult(
        is_stale=len(reasons) > 0,
        reasons=reasons,
        current_risk_vocab_hash=current_risk_vocab_hash,
        current_risk_code_map_version=current_risk_code_map_version,
        packet_risk_vocab_hash=packet_risk_vocab_hash,
        packet_risk_code_map_version=packet_risk_code_map_version,
    )


async def mark_stale_packets_for_program(program_id: str, reason: str) -> list[str]:
    """Mark all active packets for a program as STALE. Returns list of affected IDs."""
    from . import db
    from . import sql_defense_packets as sql_dp

    conn = await db.acquire_connection()
    try:
        rows = await conn.fetch(
            sql_dp.MARK_PROGRAM_PACKETS_STALE,
            UUID(program_id),
            reason,
        )
        return [str(r["id"]) for r in rows]
    finally:
        await db.release_connection(conn)


# ═══════════════════════════════════════════════════════════════════════════════
# Diff Engine
# ═══════════════════════════════════════════════════════════════════════════════

def diff_packets(
    previous: dict[str, Any],
    current: dict[str, Any],
) -> dict[str, Any]:
    """Compute a diff summary between two defense packets.

    Pure function — no DB, no network. Deterministic.

    Returns dict matching DefensePacketDiffSummary.
    """
    prev_codes = _extract_list(previous, "risk_codes_used")
    curr_codes = _extract_list(current, "risk_codes_used")

    prev_set = set(prev_codes)
    curr_set = set(curr_codes)

    prev_tasks = _extract_list(previous, "tasks")
    curr_tasks = _extract_list(current, "tasks")

    prev_top = _extract_list(previous, "top_risks")
    curr_top = _extract_list(current, "top_risks")

    prev_score = previous.get("defense_readiness_score", 0)
    curr_score = current.get("defense_readiness_score", 0)

    return {
        "previous_manifest_hash": previous.get("manifest_hash", ""),
        "current_manifest_hash": current.get("manifest_hash", ""),
        "readiness_score_delta": curr_score - prev_score,
        "risk_codes_added": canonical_sort(list(curr_set - prev_set)),
        "risk_codes_removed": canonical_sort(list(prev_set - curr_set)),
        "evidence_tasks_added": max(0, len(curr_tasks) - len(prev_tasks)),
        "evidence_tasks_removed": max(0, len(prev_tasks) - len(curr_tasks)),
        "top_risks_changed": prev_top != curr_top,
    }


def _extract_list(d: dict[str, Any], key: str) -> list:
    """Extract a list from a dict value that may be JSON string or native list."""
    val = d.get(key, [])
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return []
    return val if isinstance(val, list) else []
