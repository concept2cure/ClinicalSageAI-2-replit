"""Database connection pool and utilities."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

import asyncpg
from asyncpg import Pool, Connection

from .config import get_settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[Pool] = None
_lite_mode: bool = False  # Flag for running without database


async def get_pool() -> Optional[Pool]:
    """Get or create the connection pool.

    Returns None if no database URL is configured (lite mode).
    """
    global _pool, _lite_mode
    if _pool is None:
        settings = get_settings()
        # Parse URL and remove asyncpg prefix if present
        db_url = settings.database_url

        # Support lite mode (no database)
        if not db_url or db_url == "":
            logger.warning("DATABASE_URL not configured - running in LITE MODE")
            logger.warning("Lite mode: Only health check and docs available, all DB operations will fail")
            _lite_mode = True
            return None

        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

        logger.info("Creating database connection pool...")
        try:
            _pool = await asyncpg.create_pool(
                db_url,
                min_size=2,
                max_size=settings.database_pool_size,
                command_timeout=60,
            )
            logger.info("Database connection pool created")
            _lite_mode = False
        except Exception as e:
            logger.warning(f"Database connection failed: {e}")
            logger.warning("Running in LITE MODE - database operations disabled")
            _lite_mode = True
            return None
    return _pool


def is_lite_mode() -> bool:
    """Check if running in lite mode (no database)."""
    return _lite_mode


async def close_pool() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        logger.info("Closing database connection pool...")
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")


class LiteModeError(Exception):
    """Raised when database operations are attempted in lite mode."""
    pass


@asynccontextmanager
async def get_connection() -> AsyncGenerator[Connection, None]:
    """Get a connection from the pool (context manager version)."""
    pool = await get_pool()
    if pool is None:
        raise LiteModeError("Database not available in lite mode. Configure DATABASE_URL to enable database features.")
    async with pool.acquire() as conn:
        yield conn


async def acquire_connection() -> Connection:
    """Get a connection from the pool (manual release required).

    Use this when you need to manage the connection lifecycle manually,
    such as when setting session variables before a transaction.
    Call release_connection() when done.
    """
    pool = await get_pool()
    if pool is None:
        raise LiteModeError("Database not available in lite mode. Configure DATABASE_URL to enable database features.")
    return await pool.acquire()


async def release_connection(conn: Connection) -> None:
    """Release a connection back to the pool."""
    pool = await get_pool()
    if pool is not None and conn is not None:
        await pool.release(conn)


async def execute(
    query: str,
    *args: Any,
    timeout: Optional[float] = None,
) -> str:
    """Execute a query without returning results."""
    async with get_connection() as conn:
        return await conn.execute(query, *args, timeout=timeout)


async def fetch(
    query: str,
    *args: Any,
    timeout: Optional[float] = None,
) -> list[asyncpg.Record]:
    """Execute a query and return all results."""
    async with get_connection() as conn:
        return await conn.fetch(query, *args, timeout=timeout)


async def fetchrow(
    query: str,
    *args: Any,
    timeout: Optional[float] = None,
) -> Optional[asyncpg.Record]:
    """Execute a query and return a single row."""
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args, timeout=timeout)


async def fetchval(
    query: str,
    *args: Any,
    column: int = 0,
    timeout: Optional[float] = None,
) -> Any:
    """Execute a query and return a single value."""
    async with get_connection() as conn:
        return await conn.fetchval(query, *args, column=column, timeout=timeout)


async def health_check() -> dict[str, Any]:
    """Check database connectivity and return status."""
    # Handle lite mode
    if _lite_mode:
        return {
            "status": "lite",
            "database": "not_configured",
            "message": "Running in LITE MODE - set DATABASE_URL for full functionality",
            "version": "N/A (lite mode)",
            "extensions": {},
            "schemas": [],
        }

    try:
        version = await fetchval("SELECT version()")
        extensions = await fetch(
            "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp')"
        )
        schemas = await fetch(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name IN ('truth', 'prose', 'adversarial', 'audit')"
        )

        return {
            "status": "healthy",
            "database": "connected",
            "version": version,
            "extensions": {r["extname"]: r["extversion"] for r in extensions},
            "schemas": [r["schema_name"] for r in schemas],
        }
    except Exception as e:
        logger.exception("Database health check failed")
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
        }


# =============================================================================
# Enhanced Database Utilities for Enterprise Operations
# =============================================================================

@asynccontextmanager
async def transaction(
    user: Optional[str] = None,
    reason: Optional[str] = None,
    request_id: Optional[str] = None,
) -> AsyncGenerator[Connection, None]:
    """Context manager for transactional operations with attribution.

    Combines connection acquisition, transaction management, and Part 11
    attribution in a single context manager. All database triggers will
    capture the attribution context.

    Args:
        user: User email/identifier for audit trail (required for writes)
        reason: Human-readable explanation for the change
        request_id: External ticket/request ID for traceability

    Example:
        async with db.transaction(
            user="qa@concept2cure.ai",
            reason="Quarterly review update",
            request_id="QA-2026-001"
        ) as conn:
            await conn.execute(UPDATE_QUERY, ...)
    """
    conn = await acquire_connection()
    try:
        async with conn.transaction():
            # Set Part 11 attribution context using parameterized queries
            # (SQL-injection safe — never interpolate user input into SQL)
            await set_session_context(conn, user=user, reason=reason, request_id=request_id)

            yield conn
    finally:
        await release_connection(conn)


async def set_session_context(
    conn,
    *,
    user: Optional[str] = None,
    reason: Optional[str] = None,
    request_id: Optional[str] = None,
) -> None:
    """Set session-local attribution context using parameterized queries.

    Uses PostgreSQL set_config() with parameter binding to prevent SQL injection.
    Equivalent to SET LOCAL but safe for user-supplied values.

    Args:
        conn: asyncpg connection
        user: User email/identifier for audit trail
        reason: Human-readable explanation for the change
        request_id: External ticket/request ID for traceability
    """
    if user:
        await conn.execute("SELECT set_config('app.user', $1, true)", user)
    if reason:
        await conn.execute("SELECT set_config('app.reason', $1, true)", reason)
    if request_id:
        await conn.execute("SELECT set_config('app.request_id', $1, true)", request_id)


def _escape_sql(value: str) -> str:
    """Escape single quotes in SQL string values.

    DEPRECATED: Use set_session_context() with parameterized queries instead.
    Retained only for backward compatibility.
    """
    if value is None:
        return ''
    return value.replace("'", "''")


async def execute_many(
    query: str,
    args_list: list[tuple],
    timeout: Optional[float] = None,
) -> None:
    """Execute a query multiple times with different arguments.

    Efficient for bulk inserts/updates using executemany.
    """
    async with get_connection() as conn:
        await conn.executemany(query, args_list, timeout=timeout)


async def copy_records(
    table_name: str,
    records: list[tuple],
    columns: list[str],
    schema_name: Optional[str] = None,
) -> int:
    """Bulk copy records into a table using COPY protocol.

    Much faster than INSERT for large datasets.
    Returns the number of records copied.
    """
    full_table = f"{schema_name}.{table_name}" if schema_name else table_name
    async with get_connection() as conn:
        result = await conn.copy_records_to_table(
            table_name,
            records=records,
            columns=columns,
            schema_name=schema_name,
        )
        return len(records)


async def table_exists(table_name: str, schema_name: str = "public") -> bool:
    """Check if a table exists in the database."""
    result = await fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
        )
        """,
        schema_name, table_name
    )
    return result


async def get_table_row_count(table_name: str, schema_name: str = "public") -> int:
    """Get approximate row count for a table (fast, uses statistics)."""
    result = await fetchval(
        """
        SELECT reltuples::bigint
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
        """,
        schema_name, table_name
    )
    return result or 0


async def get_schema_tables(schema_name: str) -> list[dict]:
    """Get all tables in a schema with their row counts."""
    records = await fetch(
        """
        SELECT
            t.table_name,
            c.reltuples::bigint as approx_rows,
            pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))) as size
        FROM information_schema.tables t
        JOIN pg_class c ON c.relname = t.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
        WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
        ORDER BY c.reltuples DESC
        """,
        schema_name
    )
    return [dict(r) for r in records]


async def get_migration_status() -> list[dict]:
    """Get status of all applied migrations."""
    try:
        records = await fetch(
            """
            SELECT
                version,
                description,
                applied_at,
                execution_time_ms
            FROM core.schema_migrations
            ORDER BY version
            """
        )
        return [dict(r) for r in records]
    except Exception:
        # Migration table might not exist yet
        return []


async def comprehensive_health_check() -> dict[str, Any]:
    """Comprehensive health check for enterprise monitoring.

    Returns detailed status of all system components including:
    - Database connectivity
    - Extension versions
    - Schema presence and table counts
    - Migration status
    - Pool statistics
    """
    if _lite_mode:
        return {
            "status": "lite",
            "mode": "LITE_MODE",
            "message": "Database not configured - limited functionality",
            "components": {}
        }

    try:
        pool = await get_pool()

        # Basic connectivity
        version = await fetchval("SELECT version()")

        # Extensions
        extensions = await fetch(
            "SELECT extname, extversion FROM pg_extension ORDER BY extname"
        )

        # Schemas and their tables
        schemas_query = """
            SELECT
                n.nspname as schema_name,
                COUNT(c.relname) as table_count,
                SUM(c.reltuples::bigint) as total_rows
            FROM pg_namespace n
            LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
            WHERE n.nspname IN ('truth', 'prose', 'adversarial', 'audit', 'core',
                               'auth', 'retention', 'monitoring', 'regulatory', 'ectd', 'governance')
            GROUP BY n.nspname
            ORDER BY n.nspname
        """
        schema_stats = await fetch(schemas_query)

        # Migration status
        migrations = await get_migration_status()

        # Pool stats
        pool_stats = {
            "size": pool.get_size() if pool else 0,
            "min_size": pool.get_min_size() if pool else 0,
            "max_size": pool.get_max_size() if pool else 0,
            "free_size": pool.get_idle_size() if pool else 0,
        }

        return {
            "status": "healthy",
            "mode": "CONNECTED",
            "database": {
                "version": version,
                "pool": pool_stats,
            },
            "extensions": {r["extname"]: r["extversion"] for r in extensions},
            "schemas": {
                r["schema_name"]: {
                    "tables": r["table_count"],
                    "rows": r["total_rows"] or 0
                } for r in schema_stats
            },
            "migrations": {
                "count": len(migrations),
                "latest": migrations[-1]["version"] if migrations else None,
                "latest_applied": str(migrations[-1]["applied_at"]) if migrations else None,
            },
        }
    except Exception as e:
        logger.exception("Comprehensive health check failed")
        return {
            "status": "unhealthy",
            "mode": "ERROR",
            "error": str(e),
        }

