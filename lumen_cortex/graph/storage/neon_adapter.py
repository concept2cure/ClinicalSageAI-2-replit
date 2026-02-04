"""
Neon Graph Storage Adapter - Phase 2

Idempotent persistence of anchors and cross-references to Neon.
"""

from __future__ import annotations

import json
from typing import List, Optional
from uuid import UUID

from lumen_cortex.graph.anchors import Anchor
from lumen_cortex.graph.xrefs import CrossRef


class NeonGraphStorage:
    """
    Persistence adapter for graph data in Neon.

    Features:
    - Idempotent upserts using ON CONFLICT
    - Tenant isolation via program_id
    - Batch operations for efficiency
    """

    def __init__(self, pool, program_id: UUID):
        """
        Initialize storage adapter.

        Args:
            pool: asyncpg or psycopg pool
            program_id: Tenant identifier for RLS
        """
        self._pool = pool
        self._program_id = program_id

    async def save_anchors(self, anchors: List[Anchor]) -> int:
        """
        Save anchors with idempotent upsert.

        Returns number of rows affected.
        """
        if not anchors:
            return 0

        sql = """
            INSERT INTO vault.anchors (
                doc_id, program_id, content_hash,
                anchor_key, anchor_type, anchor_ordinal,
                evidence_pointer, extracted_text
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (content_hash, anchor_key, anchor_ordinal)
            DO UPDATE SET
                evidence_pointer = EXCLUDED.evidence_pointer,
                extracted_text = EXCLUDED.extracted_text
        """

        rows_affected = 0
        async with self._pool.acquire() as conn:
            for anchor in anchors:
                evidence_json = json.dumps(
                    anchor.evidence_pointer.model_dump(mode="json")
                )
                result = await conn.execute(
                    sql,
                    anchor.doc_id,
                    self._program_id,
                    anchor.content_hash,
                    anchor.anchor_key,
                    anchor.anchor_type,
                    anchor.anchor_ordinal,
                    evidence_json,
                    anchor.extracted_text,
                )
                rows_affected += 1

        return rows_affected

    async def save_cross_refs(self, xrefs: List[CrossRef]) -> int:
        """
        Save cross-references with idempotent upsert.

        Returns number of rows affected.
        """
        if not xrefs:
            return 0

        sql = """
            INSERT INTO vault.cross_references (
                source_doc_id, program_id, content_hash,
                source_anchor_key, target_anchor_key,
                evidence_pointer, validation_status, confidence
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (content_hash, target_anchor_key, (evidence_pointer->>'paragraph_index'))
            DO UPDATE SET
                validation_status = EXCLUDED.validation_status,
                confidence = EXCLUDED.confidence
        """

        rows_affected = 0
        async with self._pool.acquire() as conn:
            for xref in xrefs:
                evidence_json = json.dumps(
                    xref.evidence_pointer.model_dump(mode="json")
                )
                result = await conn.execute(
                    sql,
                    xref.source_doc_id,
                    self._program_id,
                    xref.content_hash,
                    xref.source_anchor_key,
                    xref.target_anchor_key,
                    evidence_json,
                    xref.validation_status,
                    xref.confidence,
                )
                rows_affected += 1

        return rows_affected

    async def delete_for_document(self, doc_id: UUID, content_hash: str) -> None:
        """Delete all graph data for a specific document version."""
        async with self._pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM vault.cross_references WHERE source_doc_id = $1 AND content_hash = $2",
                doc_id, content_hash
            )
            await conn.execute(
                "DELETE FROM vault.anchors WHERE doc_id = $1 AND content_hash = $2",
                doc_id, content_hash
            )

    async def get_validation_summary(self, content_hash: str) -> dict:
        """Get validation status summary for a document."""
        sql = """
            SELECT validation_status, COUNT(*) as count
            FROM vault.cross_references
            WHERE content_hash = $1
            GROUP BY validation_status
            ORDER BY validation_status
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(sql, content_hash)
            return {row["validation_status"]: row["count"] for row in rows}


# Synchronous version for non-async contexts
class NeonGraphStorageSync:
    """
    Synchronous version of NeonGraphStorage.

    For use in non-async contexts (tests, CLI tools).
    """

    def __init__(self, conn, program_id: UUID):
        """
        Initialize storage adapter.

        Args:
            conn: psycopg2 connection
            program_id: Tenant identifier for RLS
        """
        self._conn = conn
        self._program_id = program_id

    def save_anchors(self, anchors: List[Anchor]) -> int:
        """Save anchors with idempotent upsert."""
        if not anchors:
            return 0

        sql = """
            INSERT INTO vault.anchors (
                doc_id, program_id, content_hash,
                anchor_key, anchor_type, anchor_ordinal,
                evidence_pointer, extracted_text
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (content_hash, anchor_key, anchor_ordinal)
            DO UPDATE SET
                evidence_pointer = EXCLUDED.evidence_pointer,
                extracted_text = EXCLUDED.extracted_text
        """

        with self._conn.cursor() as cur:
            for anchor in anchors:
                evidence_json = json.dumps(
                    anchor.evidence_pointer.model_dump(mode="json")
                )
                cur.execute(sql, (
                    str(anchor.doc_id),
                    str(self._program_id),
                    anchor.content_hash,
                    anchor.anchor_key,
                    anchor.anchor_type,
                    anchor.anchor_ordinal,
                    evidence_json,
                    anchor.extracted_text,
                ))

        self._conn.commit()
        return len(anchors)

    def save_cross_refs(self, xrefs: List[CrossRef]) -> int:
        """Save cross-references with idempotent upsert."""
        if not xrefs:
            return 0

        sql = """
            INSERT INTO vault.cross_references (
                source_doc_id, program_id, content_hash,
                source_anchor_key, target_anchor_key,
                evidence_pointer, validation_status, confidence
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (content_hash, target_anchor_key, (evidence_pointer->>'paragraph_index'))
            DO UPDATE SET
                validation_status = EXCLUDED.validation_status,
                confidence = EXCLUDED.confidence
        """

        with self._conn.cursor() as cur:
            for xref in xrefs:
                evidence_json = json.dumps(
                    xref.evidence_pointer.model_dump(mode="json")
                )
                cur.execute(sql, (
                    str(xref.source_doc_id),
                    str(self._program_id),
                    xref.content_hash,
                    xref.source_anchor_key,
                    xref.target_anchor_key,
                    evidence_json,
                    xref.validation_status,
                    xref.confidence,
                ))

        self._conn.commit()
        return len(xrefs)
