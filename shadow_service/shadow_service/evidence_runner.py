"""Evidence Fabric Runner — core service layer.

Responsible for:
 1. CRUD for claims, sources, support links, derivations
 2. Provenance creation (execution → evidence links)
 3. Hash ledger entries (tamper-evident fingerprints)
 4. Claim confidence scoring + contradiction detection
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import asyncpg

from . import db
from . import sql_evidence as sql

logger = logging.getLogger(__name__)


# =============================================================================
# RLS Context helpers (same pattern as orchestration)
# =============================================================================

async def _set_rls(conn: asyncpg.Connection, program_id: UUID) -> None:
    """Set the RLS GUC for the current transaction."""
    await conn.execute(sql.SET_PROGRAM_CONTEXT, str(program_id))


# =============================================================================
# Content hashing — deterministic, canonical
# =============================================================================

def _hash_content(content: str) -> str:
    """SHA-256 hash of content for tamper evidence."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _canonical_claim_content(claim_text: str, structured: dict) -> str:
    """Canonical representation of a claim for hashing."""
    return f"{claim_text}|{json.dumps(structured, sort_keys=True)}"


# =============================================================================
# 1) Claims
# =============================================================================

async def create_claim(
    program_id: UUID,
    claim_type: str,
    claim_text: str,
    structured: Optional[dict[str, Any]] = None,
    section_ref: Optional[str] = None,
    supersedes_id: Optional[UUID] = None,
    confidence: Optional[float] = None,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Create a new claim and record its hash.

    If supersedes_id is set, the old claim is marked 'superseded'.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        structured_data = structured or {}
        version = 1

        async with conn.transaction():
            # If superseding, bump version and mark old claim
            if supersedes_id:
                old = await conn.fetchrow(sql.SELECT_CLAIM_BY_ID, supersedes_id)
                if old:
                    version = old["version"] + 1
                    await conn.fetchrow(
                        sql.UPDATE_CLAIM_STATUS, supersedes_id, "superseded"
                    )

            row = await conn.fetchrow(
                sql.INSERT_CLAIM,
                program_id,
                claim_type,
                claim_text,
                json.dumps(structured_data),
                section_ref,
                version,
                supersedes_id,
                "active",
                confidence,
                actor,
            )

            # Hash ledger entry
            content = _canonical_claim_content(claim_text, structured_data)
            content_hash = _hash_content(content)
            await conn.fetchrow(
                sql.INSERT_HASH_ENTRY,
                program_id,
                "claim",
                row["id"],
                content_hash,
                None,  # no prev_hash for new claims
                "sha256",
            )

            # Provenance entry if request context available
            if request_id:
                idem_key = _compute_idempotency_key(
                    program_id, "claim_created", claim_id=row["id"],
                )
                await conn.fetchrow(
                    sql.INSERT_PROVENANCE,
                    program_id,
                    row["id"],   # claim_id
                    None,        # source_id
                    None,        # workflow_run_id
                    None,        # step_run_id
                    None,        # batch_id
                    "claim_created",
                    actor,
                    request_id,
                    json.dumps({"claim_type": claim_type}),
                    idem_key,
                )

            logger.info("Created claim %s type=%s program=%s", row["id"], claim_type, program_id)
            return dict(row)
    finally:
        await db.release_connection(conn)


async def get_claim(claim_id: UUID, program_id: UUID) -> Optional[dict[str, Any]]:
    """Fetch a single claim by ID."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        row = await conn.fetchrow(sql.SELECT_CLAIM_BY_ID, claim_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_claims(
    program_id: UUID, limit: int = 25, offset: int = 0
) -> list[dict[str, Any]]:
    """List active claims for a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_CLAIMS_BY_PROGRAM, program_id, limit, offset)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def list_claims_by_section(
    program_id: UUID, section_ref: str, limit: int = 50
) -> list[dict[str, Any]]:
    """List active claims for a program + section."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_CLAIMS_BY_SECTION, program_id, section_ref, limit)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# 2) Sources
# =============================================================================

async def create_source(
    program_id: UUID,
    source_type: str,
    source_ref: str,
    source_uri: Optional[str] = None,
    content: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Create a source record. Auto-computes content_hash if content provided.

    Deduplicates by content_hash — returns existing source if hash matches.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        content_hash = _hash_content(content) if content else None
        meta_json = json.dumps(metadata or {})

        async with conn.transaction():
            # Dedup by hash
            if content_hash:
                existing = await conn.fetchrow(
                    sql.SELECT_SOURCE_BY_HASH, program_id, content_hash
                )
                if existing:
                    logger.info("Dedup source: hash=%s already exists as %s", content_hash[:8], existing["id"])
                    return dict(existing)

            row = await conn.fetchrow(
                sql.INSERT_SOURCE,
                program_id,
                source_type,
                source_ref,
                source_uri,
                content_hash,
                meta_json,
            )

            # Hash ledger
            if content_hash:
                await conn.fetchrow(
                    sql.INSERT_HASH_ENTRY,
                    program_id,
                    "source",
                    row["id"],
                    content_hash,
                    None,
                    "sha256",
                )

            # Provenance
            if request_id:
                idem_key = _compute_idempotency_key(
                    program_id, "source_captured", source_id=row["id"],
                )
                await conn.fetchrow(
                    sql.INSERT_PROVENANCE,
                    program_id,
                    None,        # claim_id
                    row["id"],   # source_id
                    None, None, None,
                    "source_captured",
                    actor,
                    request_id,
                    json.dumps({"source_type": source_type}),
                    idem_key,
                )

            logger.info("Created source %s type=%s program=%s", row["id"], source_type, program_id)
            return dict(row)
    finally:
        await db.release_connection(conn)


async def get_source(source_id: UUID, program_id: UUID) -> Optional[dict[str, Any]]:
    """Fetch a single source by ID."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        row = await conn.fetchrow(sql.SELECT_SOURCE_BY_ID, source_id)
        return dict(row) if row else None
    finally:
        await db.release_connection(conn)


async def list_sources(
    program_id: UUID, limit: int = 25, offset: int = 0
) -> list[dict[str, Any]]:
    """List sources for a program."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_SOURCES_BY_PROGRAM, program_id, limit, offset)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# 3) Support links (claim ↔ source)
# =============================================================================

async def create_support(
    claim_id: UUID,
    source_id: UUID,
    program_id: UUID,
    support_type: str = "supports",
    strength: float = 0.5,
    span_start: Optional[int] = None,
    span_end: Optional[int] = None,
    annotation: Optional[str] = None,
    actor: str = "system",
    request_id: Optional[str] = None,
) -> dict[str, Any]:
    """Create or update a support link between a claim and a source."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            row = await conn.fetchrow(
                sql.INSERT_SUPPORT,
                claim_id, source_id, program_id,
                support_type, strength,
                span_start, span_end, annotation, actor,
            )
            return dict(row)
    finally:
        await db.release_connection(conn)


async def get_support_for_claim(
    claim_id: UUID, program_id: UUID
) -> list[dict[str, Any]]:
    """Get all support links for a claim (with joined source info)."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_SUPPORT_FOR_CLAIM, claim_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_contradictions(
    claim_id: UUID, program_id: UUID
) -> list[dict[str, Any]]:
    """Get contradicting sources for a claim."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_CONTRADICTIONS_FOR_CLAIM, claim_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# 4) Derivations (claim chains)
# =============================================================================

async def create_derivation(
    program_id: UUID,
    derived_claim_id: UUID,
    source_claim_id: UUID,
    derivation_type: str = "inference",
    reasoning: Optional[str] = None,
    model_id: Optional[str] = None,
    actor: str = "system",
) -> dict[str, Any]:
    """Record a derivation link between two claims."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            row = await conn.fetchrow(
                sql.INSERT_DERIVATION,
                program_id,
                derived_claim_id,
                source_claim_id,
                derivation_type,
                reasoning,
                model_id,
                actor,
            )
            return dict(row)
    finally:
        await db.release_connection(conn)


async def get_derivation_chain(
    claim_id: UUID, program_id: UUID
) -> list[dict[str, Any]]:
    """Get the full derivation chain for a claim (recursive, up to 10 levels)."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_DERIVATION_CHAIN, claim_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# 5) Provenance (idempotent)
# =============================================================================

def _compute_idempotency_key(
    program_id: UUID,
    event_type: str,
    step_run_id: Optional[UUID] = None,
    batch_id: Optional[UUID] = None,
    claim_id: Optional[UUID] = None,
    source_id: Optional[UUID] = None,
) -> str:
    """Deterministic key for provenance dedup.

    Format: program:event:step:batch:claim:source
    Ensures at-least-once safe inserts.
    """
    return ":".join([
        str(program_id),
        event_type,
        str(step_run_id) if step_run_id else "_",
        str(batch_id) if batch_id else "_",
        str(claim_id) if claim_id else "_",
        str(source_id) if source_id else "_",
    ])


async def create_provenance(
    program_id: UUID,
    event_type: str,
    claim_id: Optional[UUID] = None,
    source_id: Optional[UUID] = None,
    workflow_run_id: Optional[UUID] = None,
    step_run_id: Optional[UUID] = None,
    batch_id: Optional[UUID] = None,
    actor: str = "system",
    request_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Record an execution → evidence provenance link.

    Idempotent: ON CONFLICT DO NOTHING. If duplicate, returns existing row.
    """
    idem_key = _compute_idempotency_key(
        program_id, event_type, step_run_id, batch_id, claim_id, source_id,
    )
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        async with conn.transaction():
            row = await conn.fetchrow(
                sql.INSERT_PROVENANCE,
                program_id,
                claim_id,
                source_id,
                workflow_run_id,
                step_run_id,
                batch_id,
                event_type,
                actor,
                request_id,
                json.dumps(metadata or {}),
                idem_key,
            )
            if row is None:
                # ON CONFLICT — fetch existing
                row = await conn.fetchrow(
                    sql.SELECT_PROVENANCE_BY_IDEM_KEY, idem_key,
                )
            return dict(row)
    finally:
        await db.release_connection(conn)


async def get_provenance_for_claim(
    claim_id: UUID, program_id: UUID
) -> list[dict[str, Any]]:
    """Get provenance trail for a claim."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_PROVENANCE_FOR_CLAIM, claim_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_provenance_for_step(
    step_run_id: UUID, program_id: UUID
) -> list[dict[str, Any]]:
    """Get all evidence produced by a specific step run."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_PROVENANCE_FOR_STEP, step_run_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


async def get_provenance_by_request(
    request_id: str, program_id: UUID
) -> list[dict[str, Any]]:
    """Get all evidence produced in a single request (by X-Request-Id)."""
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)
        rows = await conn.fetch(sql.SELECT_PROVENANCE_BY_REQUEST, request_id)
        return [dict(r) for r in rows]
    finally:
        await db.release_connection(conn)


# =============================================================================
# 6) Hash verification
# =============================================================================

async def verify_claim_integrity(
    claim_id: UUID, program_id: UUID
) -> dict[str, Any]:
    """Verify a claim's content hasn't been tampered with.

    Recomputes hash from current content and compares to ledger.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        claim = await conn.fetchrow(sql.SELECT_CLAIM_BY_ID, claim_id)
        if not claim:
            return {"valid": False, "error": "claim_not_found"}

        # Recompute hash
        structured = json.loads(claim["structured"]) if isinstance(claim["structured"], str) else dict(claim["structured"])
        content = _canonical_claim_content(claim["claim_text"], structured)
        computed_hash = _hash_content(content)

        # Get latest ledger hash
        ledger_hash = await conn.fetchval(sql.VERIFY_HASH, "claim", claim_id)
        if not ledger_hash:
            return {"valid": False, "error": "no_hash_in_ledger"}

        is_valid = computed_hash == ledger_hash
        return {
            "valid": is_valid,
            "claim_id": str(claim_id),
            "computed_hash": computed_hash,
            "ledger_hash": ledger_hash,
            "match": is_valid,
        }
    finally:
        await db.release_connection(conn)


# =============================================================================
# 7) Claim scoring — confidence computation + anti-hallucination
# =============================================================================

async def score_claim(
    claim_id: UUID, program_id: UUID
) -> dict[str, Any]:
    """Compute claim confidence from its support links.

    confidence = f(source_count, source_types, avg_strength,
                   contradiction_count, recency)

    Returns a score breakdown and updates the claim's confidence field.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        # Get all support links
        supports = await conn.fetch(sql.SELECT_SUPPORT_FOR_CLAIM, claim_id)
        contradictions = [s for s in supports if s["support_type"] == "contradicts"]
        positive = [s for s in supports if s["support_type"] in ("supports", "qualifies")]

        source_count = len(positive)
        contradiction_count = len(contradictions)
        avg_strength = (
            sum(float(s["strength"]) for s in positive) / source_count
            if source_count > 0 else 0.0
        )

        # Source type bonuses
        source_types = {s.get("source_type") for s in supports}
        has_guideline = "guideline" in source_types
        has_csr = "csr_section" in source_types
        has_dataset = "dataset_row" in source_types

        # Confidence formula:
        # base = avg_strength * min(source_count / 3, 1.0)  -- saturates at 3 sources
        # bonus = +0.1 for guideline, +0.05 for CSR, +0.05 for dataset
        # penalty = -0.15 per contradiction
        # clamp to [0, 1]
        base = avg_strength * min(source_count / 3.0, 1.0)
        bonus = (0.10 if has_guideline else 0.0) + (0.05 if has_csr else 0.0) + (0.05 if has_dataset else 0.0)
        penalty = contradiction_count * 0.15
        confidence = max(0.0, min(1.0, base + bonus - penalty))

        # Flags
        flags = []
        if source_count == 0:
            flags.append("unsupported_claim")
        if contradiction_count > 0:
            flags.append("has_contradictions")
        if source_count == 1:
            flags.append("single_source")
        if not has_guideline and not has_csr:
            flags.append("no_authoritative_source")
        if confidence < 0.3:
            flags.append("low_confidence")

        # Update claim confidence
        async with conn.transaction():
            await conn.fetchrow(sql.UPDATE_CLAIM_CONFIDENCE, claim_id, confidence)

        logger.info(
            "Scored claim %s: confidence=%.4f sources=%d contradictions=%d flags=%s",
            claim_id, confidence, source_count, contradiction_count, flags,
        )

        return {
            "claim_id": str(claim_id),
            "source_count": source_count,
            "contradiction_count": contradiction_count,
            "avg_source_strength": round(avg_strength, 4),
            "has_guideline_source": has_guideline,
            "has_csr_source": has_csr,
            "has_dataset_source": has_dataset,
            "recency_factor": 1.0,  # placeholder for future time-decay
            "computed_confidence": round(confidence, 4),
            "flags": flags,
        }
    finally:
        await db.release_connection(conn)


async def detect_contradictions(
    program_id: UUID,
    section_ref: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Find pairs of claims about the same field/entity with contradicting support.

    Returns list of {claim_a, claim_b, field, contradiction_type, sources}.
    """
    conn = await db.acquire_connection()
    try:
        await _set_rls(conn, program_id)

        # Get active claims (optionally filtered by section)
        if section_ref:
            claims = await conn.fetch(sql.SELECT_CLAIMS_BY_SECTION, program_id, section_ref, 200)
        else:
            claims = await conn.fetch(sql.SELECT_CLAIMS_BY_PROGRAM, program_id, 200, 0)

        # Group by entity+field from structured data
        entity_claims: dict[str, list[dict]] = {}
        for c in claims:
            structured = json.loads(c["structured"]) if isinstance(c["structured"], str) else dict(c["structured"])
            entity = structured.get("entity")
            field = structured.get("field")
            if entity and field:
                key = f"{entity}:{field}"
                entity_claims.setdefault(key, []).append(dict(c))

        # Find contradictions: same entity+field but different values
        contradictions = []
        for key, group in entity_claims.items():
            if len(group) < 2:
                continue
            values = set()
            for claim in group:
                structured = json.loads(claim["structured"]) if isinstance(claim["structured"], str) else claim["structured"]
                val = structured.get("value")
                if val is not None:
                    values.add(str(val))

            if len(values) > 1:
                contradictions.append({
                    "entity_field": key,
                    "claim_count": len(group),
                    "distinct_values": list(values),
                    "claim_ids": [str(c["id"]) for c in group],
                    "severity": "high" if len(values) > 2 else "medium",
                })

        return contradictions
    finally:
        await db.release_connection(conn)
