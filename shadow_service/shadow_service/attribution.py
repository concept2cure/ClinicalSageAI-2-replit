"""Attribution helper for regulatory-grade prose versioning.

Provides context managers and utilities for setting attribution context
when updating prose fragments. This ensures all changes are properly
attributed per 21 CFR Part 11 requirements.

Usage:
    from shadow_service.attribution import with_attribution

    async with with_attribution(conn, user="shadow.agent@concept2cure.ai", 
                                 reason="Auto-rewrite for objectivity",
                                 request_id="AUTO-2026-0001"):
        await conn.execute(UPDATE_FRAGMENT, ...)

The attribution is captured by triggers in migration 003 and stored
immutably in prose.smart_fragment_versions.
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator

from asyncpg import Connection

logger = logging.getLogger(__name__)


@asynccontextmanager
async def with_attribution(
    conn: Connection,
    user: str,
    reason: Optional[str] = None,
    request_id: Optional[str] = None,
) -> AsyncGenerator[Connection, None]:
    """Context manager that sets attribution for fragment updates.
    
    All updates to prose.smart_fragments within this context will be
    attributed to the specified user with the given reason and request_id.
    The attribution is captured by database triggers and stored immutably
    in prose.smart_fragment_versions.
    
    Args:
        conn: asyncpg connection (should be within a transaction)
        user: User email/identifier creating this change
        reason: Human-readable explanation of why this change was made
        request_id: External change request/ticket ID for traceability
        
    Example:
        async with get_connection() as conn:
            async with conn.transaction():
                async with with_attribution(conn, 
                                            user="shadow.agent@concept2cure.ai",
                                            reason="Auto-rewrite for objectivity",
                                            request_id="SR-2026-0001"):
                    await conn.execute(
                        "UPDATE prose.smart_fragments SET content_prose = $1 WHERE id = $2",
                        new_content, fragment_id
                    )
    """
    try:
        # Set session-local attribution variables
        # These are read by the database triggers in migration 003
        # Note: "user" is quoted because it's a reserved word in PostgreSQL
        await conn.execute(f"SET LOCAL \"app.user\" = '{_escape_sql_string(user)}'")
        
        if reason:
            await conn.execute(f"SET LOCAL \"app.reason\" = '{_escape_sql_string(reason)}'")
        
        if request_id:
            await conn.execute(f"SET LOCAL \"app.request_id\" = '{_escape_sql_string(request_id)}'")
        
        logger.debug(f"Attribution context set: user={user}, reason={reason}, request_id={request_id}")
        
        yield conn
        
    finally:
        # Session variables are automatically cleared at transaction end
        # but we can explicitly reset them if needed
        pass


def _escape_sql_string(value: str) -> str:
    """Escape single quotes in SQL string values."""
    if value is None:
        return ''
    return value.replace("'", "''")


# =============================================================================
# Version History Queries
# =============================================================================

SELECT_FRAGMENT_VERSION_HISTORY = """
SELECT 
    v.id,
    v.fragment_id,
    v.version_id,
    v.ectd_section_path,
    v.jurisdiction,
    v.content_prose,
    v.objectivity_score,
    v.confidence_rating,
    v.is_verified_against_truth,
    v.regulatory_precedent_id,
    v.burden_of_proof_justification,
    v.created_at,
    v.created_by,
    v.change_reason,
    v.request_id
FROM prose.smart_fragment_versions v
WHERE v.fragment_id = $1
ORDER BY v.version_id DESC
"""

SELECT_FRAGMENT_VERSION_BY_ID = """
SELECT 
    v.id,
    v.fragment_id,
    v.version_id,
    v.ectd_section_path,
    v.jurisdiction,
    v.content_prose,
    v.embedding,
    v.objectivity_score,
    v.confidence_rating,
    v.is_verified_against_truth,
    v.regulatory_precedent_id,
    v.burden_of_proof_justification,
    v.created_at,
    v.created_by,
    v.change_reason,
    v.request_id
FROM prose.smart_fragment_versions v
WHERE v.fragment_id = $1 AND v.version_id = $2
"""

SELECT_FRAGMENT_LATEST_VERSION = """
SELECT 
    v.id,
    v.fragment_id,
    v.version_id,
    v.ectd_section_path,
    v.jurisdiction,
    v.content_prose,
    v.embedding,
    v.objectivity_score,
    v.confidence_rating,
    v.is_verified_against_truth,
    v.regulatory_precedent_id,
    v.burden_of_proof_justification,
    v.created_at,
    v.created_by,
    v.change_reason,
    v.request_id
FROM prose.smart_fragment_versions v
WHERE v.fragment_id = $1
ORDER BY v.version_id DESC
LIMIT 1
"""

COUNT_FRAGMENT_VERSIONS = """
SELECT COUNT(*) FROM prose.smart_fragment_versions WHERE fragment_id = $1
"""

# Compare two versions of a fragment
SELECT_VERSION_COMPARISON = """
SELECT 
    v.version_id,
    v.content_prose,
    v.objectivity_score,
    v.confidence_rating,
    v.is_verified_against_truth,
    v.created_at,
    v.created_by,
    v.change_reason
FROM prose.smart_fragment_versions v
WHERE v.fragment_id = $1 AND v.version_id IN ($2, $3)
ORDER BY v.version_id
"""

# Get all fragments modified by a specific user
SELECT_VERSIONS_BY_USER = """
SELECT 
    v.fragment_id,
    v.version_id,
    v.ectd_section_path,
    v.jurisdiction,
    v.change_reason,
    v.request_id,
    v.created_at
FROM prose.smart_fragment_versions v
WHERE v.created_by = $1
ORDER BY v.created_at DESC
LIMIT $2
"""

# Get all fragments modified for a specific request/ticket
SELECT_VERSIONS_BY_REQUEST = """
SELECT 
    v.fragment_id,
    v.version_id,
    v.ectd_section_path,
    v.jurisdiction,
    v.change_reason,
    v.created_by,
    v.created_at
FROM prose.smart_fragment_versions v
WHERE v.request_id = $1
ORDER BY v.created_at
"""

# Audit trail: all changes in a date range
SELECT_VERSIONS_IN_RANGE = """
SELECT 
    v.fragment_id,
    v.version_id,
    v.ectd_section_path,
    v.jurisdiction,
    v.created_by,
    v.change_reason,
    v.request_id,
    v.created_at
FROM prose.smart_fragment_versions v
WHERE v.created_at >= $1 AND v.created_at <= $2
ORDER BY v.created_at DESC
LIMIT $3
"""
