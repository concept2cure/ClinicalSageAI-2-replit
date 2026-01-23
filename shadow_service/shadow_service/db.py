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


@asynccontextmanager
async def get_connection() -> AsyncGenerator[Connection, None]:
    """Get a connection from the pool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


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
