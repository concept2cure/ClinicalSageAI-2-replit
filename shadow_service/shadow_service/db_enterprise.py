"""Enterprise-grade database connectivity for regulatory compliance.

Implements:
- Dual connection pools (direct + pooled/PgBouncer)
- Part 11 session context (app.user, app.request_id, app.reason, app.program_id)
- Role-separated database users
- Neon autosuspend tolerance with retries
- Transaction handling with proper attribution

References:
- asyncpg PgBouncer compatibility: https://magicstack.github.io/asyncpg/current/faq.html
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
- Neon autosuspend: https://neon.com/docs/connect/connection-latency
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Callable, Optional, TypeVar
from uuid import uuid4

import asyncpg
from asyncpg import Pool, Connection

logger = logging.getLogger(__name__)

T = TypeVar('T')


# =============================================================================
# Configuration & Types
# =============================================================================

class ConnectionRole(str, Enum):
    """Database connection roles for role-separated access."""
    MIGRATOR = "migrator"      # DDL operations, schema changes
    APP_WRITER = "app_writer"  # Application writes (fragments, links, snapshots)
    SHADOW = "shadow"          # Shadow agent operations (audit logs, interrogation)
    READER = "reader"          # Read-only operations (dashboards, reporting)
    AUDITOR = "auditor"        # Audit trail access
    INGEST = "ingest"          # Bulk ingestion operations


class PoolType(str, Enum):
    """Pool types for different workloads."""
    DIRECT = "direct"    # Direct PostgreSQL connection (migrations, ingestion)
    POOLED = "pooled"    # PgBouncer pooled connection (API traffic)


@dataclass
class RequestContext:
    """Part 11 compliant request context for database operations.
    
    Every write operation must have attribution for regulatory compliance.
    """
    user: str                           # Actor email/identity (X-Actor header)
    request_id: str = field(default_factory=lambda: f"REQ-{uuid4().hex[:12].upper()}")
    reason: Optional[str] = None        # Change reason (X-Change-Reason header)
    program_id: Optional[str] = None    # Program scope for RLS (X-Program-ID header)
    
    def __post_init__(self):
        if not self.user:
            raise ValueError("RequestContext.user is required for Part 11 compliance")


@dataclass
class PoolConfig:
    """Configuration for a database connection pool."""
    dsn: str
    pool_type: PoolType
    min_size: int = 1
    max_size: int = 10
    command_timeout: float = 60.0
    connect_timeout: float = 30.0       # Neon autosuspend can take time
    statement_cache_size: int = 100     # 0 for PgBouncer pooled mode


# =============================================================================
# Connection Pool Manager
# =============================================================================

class DatabaseManager:
    """Enterprise database connection manager.
    
    Supports:
    - Dual pools (direct + pooled) for different workloads
    - PgBouncer compatibility (statement_cache_size=0 for pooled)
    - Neon autosuspend retries
    - Part 11 session context injection
    - Role-separated access
    """
    
    def __init__(
        self,
        connect_retries: int = 3,
        connect_retry_base_ms: int = 250,
    ):
        self._pools: dict[str, Pool] = {}
        self._pool_configs: dict[str, PoolConfig] = {}
        self._connect_retries = connect_retries
        self._connect_retry_base_ms = connect_retry_base_ms
        self._lite_mode = False
        self._initialized = False
    
    @property
    def is_lite_mode(self) -> bool:
        """Check if running in lite mode (no database)."""
        return self._lite_mode
    
    async def initialize(self) -> None:
        """Initialize connection pools from environment variables.
        
        Environment variables:
        - DATABASE_URL_DIRECT: Direct PostgreSQL connection (migrations, ingestion)
        - DATABASE_URL_POOLED: PgBouncer connection (API traffic)
        - DATABASE_URL: Fallback if specific URLs not set
        
        Role-specific URLs (optional):
        - DATABASE_URL_MIGRATOR_DIRECT
        - DATABASE_URL_APP_POOLED
        - DATABASE_URL_SHADOW_POOLED
        - DATABASE_URL_INGEST_DIRECT
        """
        if self._initialized:
            return
        
        # Load DSNs from environment
        direct_url = os.getenv("DATABASE_URL_DIRECT") or os.getenv("DATABASE_URL", "")
        pooled_url = os.getenv("DATABASE_URL_POOLED") or os.getenv("DATABASE_URL", "")
        
        if not direct_url and not pooled_url:
            logger.warning("No DATABASE_URL configured - running in LITE MODE")
            logger.warning("Lite mode: Only health check and docs available")
            self._lite_mode = True
            self._initialized = True
            return
        
        # Normalize URLs
        direct_url = self._normalize_dsn(direct_url)
        pooled_url = self._normalize_dsn(pooled_url)
        
        # Configure pools
        if direct_url:
            self._pool_configs["direct"] = PoolConfig(
                dsn=direct_url,
                pool_type=PoolType.DIRECT,
                min_size=1,
                max_size=5,
                statement_cache_size=100,  # OK for direct connections
            )
        
        if pooled_url:
            self._pool_configs["pooled"] = PoolConfig(
                dsn=pooled_url,
                pool_type=PoolType.POOLED,
                min_size=2,
                max_size=int(os.getenv("DATABASE_POOL_SIZE", "10")),
                statement_cache_size=0,  # CRITICAL: Disable for PgBouncer
            )
        
        # Create pools with retry logic
        for name, config in self._pool_configs.items():
            pool = await self._create_pool_with_retry(name, config)
            if pool:
                self._pools[name] = pool
        
        if not self._pools:
            logger.warning("Failed to create any database pools - running in LITE MODE")
            self._lite_mode = True
        
        self._initialized = True
    
    def _normalize_dsn(self, dsn: str) -> str:
        """Normalize database DSN for asyncpg compatibility."""
        if not dsn:
            return ""
        if dsn.startswith("postgresql+asyncpg://"):
            dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
        return dsn
    
    async def _create_pool_with_retry(
        self, 
        name: str, 
        config: PoolConfig
    ) -> Optional[Pool]:
        """Create a connection pool with Neon autosuspend retry logic."""
        last_error = None
        
        for attempt in range(1, self._connect_retries + 1):
            try:
                logger.info(f"Creating {name} pool (attempt {attempt}/{self._connect_retries})...")
                
                pool = await asyncpg.create_pool(
                    config.dsn,
                    min_size=config.min_size,
                    max_size=config.max_size,
                    command_timeout=config.command_timeout,
                    timeout=config.connect_timeout,
                    statement_cache_size=config.statement_cache_size,
                )
                
                # Verify connectivity with a ping
                async with pool.acquire() as conn:
                    await conn.fetchval("SELECT 1")
                
                logger.info(
                    f"✅ {name} pool created: "
                    f"size={config.min_size}-{config.max_size}, "
                    f"stmt_cache={config.statement_cache_size}"
                )
                return pool
                
            except Exception as e:
                last_error = e
                logger.warning(f"Pool creation attempt {attempt} failed: {e}")
                
                if attempt < self._connect_retries:
                    # Exponential backoff
                    delay_ms = self._connect_retry_base_ms * (2 ** (attempt - 1))
                    logger.info(f"Retrying in {delay_ms}ms...")
                    await asyncio.sleep(delay_ms / 1000)
        
        logger.error(f"Failed to create {name} pool after {self._connect_retries} attempts: {last_error}")
        return None
    
    async def close(self) -> None:
        """Close all connection pools."""
        for name, pool in self._pools.items():
            logger.info(f"Closing {name} pool...")
            await pool.close()
        self._pools.clear()
        self._initialized = False
    
    def get_pool(self, pool_type: PoolType = PoolType.POOLED) -> Optional[Pool]:
        """Get a pool by type."""
        if self._lite_mode:
            return None
        
        pool_name = pool_type.value
        pool = self._pools.get(pool_name)
        
        # Fallback logic
        if pool is None and pool_name == "pooled":
            pool = self._pools.get("direct")
        elif pool is None and pool_name == "direct":
            pool = self._pools.get("pooled")
        
        return pool
    
    @asynccontextmanager
    async def acquire(
        self, 
        pool_type: PoolType = PoolType.POOLED
    ) -> AsyncGenerator[Connection, None]:
        """Acquire a connection from the specified pool."""
        if self._lite_mode:
            raise LiteModeError("Database not available in lite mode")
        
        pool = self.get_pool(pool_type)
        if pool is None:
            raise LiteModeError(f"No {pool_type.value} pool available")
        
        async with pool.acquire() as conn:
            yield conn
    
    @asynccontextmanager
    async def transaction(
        self,
        ctx: RequestContext,
        pool_type: PoolType = PoolType.POOLED,
    ) -> AsyncGenerator[Connection, None]:
        """Execute operations within a transaction with Part 11 attribution.
        
        This is the primary method for write operations. It:
        1. Acquires a connection from the specified pool
        2. Begins a transaction
        3. Sets session context variables (app.user, app.request_id, etc.)
        4. Yields the connection for operations
        5. Commits on success, rolls back on error
        
        Args:
            ctx: RequestContext with user, request_id, reason, program_id
            pool_type: Which pool to use (default: POOLED for API traffic)
        
        Example:
            async with db_manager.transaction(ctx) as conn:
                await conn.execute("UPDATE ...", ...)
        """
        if self._lite_mode:
            raise LiteModeError("Database not available in lite mode")
        
        pool = self.get_pool(pool_type)
        if pool is None:
            raise LiteModeError(f"No {pool_type.value} pool available")
        
        conn = await pool.acquire()
        try:
            async with conn.transaction():
                # Set Part 11 attribution context (transaction-local)
                # Using set_config with is_local=true ensures context doesn't leak
                await conn.execute(
                    "SELECT set_config('app.user', $1, true)",
                    ctx.user
                )
                await conn.execute(
                    "SELECT set_config('app.request_id', $1, true)",
                    ctx.request_id
                )
                if ctx.reason:
                    await conn.execute(
                        "SELECT set_config('app.reason', $1, true)",
                        ctx.reason
                    )
                if ctx.program_id:
                    await conn.execute(
                        "SELECT set_config('app.program_id', $1, true)",
                        ctx.program_id
                    )
                
                logger.debug(
                    f"Transaction context: user={ctx.user}, "
                    f"request_id={ctx.request_id}, program_id={ctx.program_id}"
                )
                
                yield conn
                
        finally:
            await pool.release(conn)
    
    async def run_in_transaction(
        self,
        ctx: RequestContext,
        fn: Callable[[Connection], T],
        pool_type: PoolType = PoolType.POOLED,
    ) -> T:
        """Execute a function within a transaction with Part 11 attribution.
        
        Alternative API for transaction() that takes a callable.
        
        Example:
            result = await db_manager.run_in_transaction(
                ctx,
                lambda conn: conn.execute("UPDATE ...", ...)
            )
        """
        async with self.transaction(ctx, pool_type) as conn:
            result = fn(conn)
            if asyncio.iscoroutine(result):
                return await result
            return result
    
    async def health_check(self) -> dict[str, Any]:
        """Comprehensive health check for monitoring."""
        if self._lite_mode:
            return {
                "status": "lite",
                "mode": "LITE_MODE",
                "message": "No database configured",
                "pools": {},
            }
        
        results = {
            "status": "healthy",
            "mode": "CONNECTED",
            "pools": {},
        }
        
        for name, pool in self._pools.items():
            try:
                start = time.monotonic()
                async with pool.acquire() as conn:
                    version = await conn.fetchval("SELECT version()")
                latency_ms = (time.monotonic() - start) * 1000
                
                results["pools"][name] = {
                    "status": "healthy",
                    "latency_ms": round(latency_ms, 2),
                    "size": pool.get_size(),
                    "idle": pool.get_idle_size(),
                    "min_size": pool.get_min_size(),
                    "max_size": pool.get_max_size(),
                }
            except Exception as e:
                results["status"] = "degraded"
                results["pools"][name] = {
                    "status": "unhealthy",
                    "error": str(e),
                }
        
        return results


# =============================================================================
# Custom Exceptions
# =============================================================================

class LiteModeError(Exception):
    """Raised when database operations are attempted in lite mode."""
    pass


class ContextRequiredError(Exception):
    """Raised when Part 11 context is required but missing."""
    pass


# =============================================================================
# Global Instance
# =============================================================================

# Singleton instance - initialized on first use
_db_manager: Optional[DatabaseManager] = None


async def get_db_manager() -> DatabaseManager:
    """Get the global database manager instance."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(
            connect_retries=int(os.getenv("DB_CONNECT_RETRIES", "3")),
            connect_retry_base_ms=int(os.getenv("DB_CONNECT_RETRY_BASE_MS", "250")),
        )
        await _db_manager.initialize()
    return _db_manager


async def close_db_manager() -> None:
    """Close the global database manager."""
    global _db_manager
    if _db_manager is not None:
        await _db_manager.close()
        _db_manager = None


async def reset_db_manager() -> None:
    """Reset the database manager (for testing)."""
    global _db_manager
    if _db_manager is not None:
        await _db_manager.close()
    _db_manager = None


# =============================================================================
# Convenience Functions (for backward compatibility)
# =============================================================================

async def get_pool() -> Optional[Pool]:
    """Get the default (pooled) connection pool.
    
    For backward compatibility with existing code.
    """
    manager = await get_db_manager()
    return manager.get_pool(PoolType.POOLED)


async def get_direct_pool() -> Optional[Pool]:
    """Get the direct connection pool (for migrations/ingestion)."""
    manager = await get_db_manager()
    return manager.get_pool(PoolType.DIRECT)


def is_lite_mode() -> bool:
    """Check if running in lite mode."""
    if _db_manager is None:
        return True
    return _db_manager.is_lite_mode


@asynccontextmanager
async def get_connection(
    pool_type: PoolType = PoolType.POOLED
) -> AsyncGenerator[Connection, None]:
    """Get a connection from the pool (context manager)."""
    manager = await get_db_manager()
    async with manager.acquire(pool_type) as conn:
        yield conn


@asynccontextmanager
async def transaction(
    ctx: RequestContext,
    pool_type: PoolType = PoolType.POOLED,
) -> AsyncGenerator[Connection, None]:
    """Execute operations within a transaction with Part 11 attribution."""
    manager = await get_db_manager()
    async with manager.transaction(ctx, pool_type) as conn:
        yield conn


async def execute(query: str, *args: Any, timeout: Optional[float] = None) -> str:
    """Execute a query without returning results."""
    async with get_connection() as conn:
        return await conn.execute(query, *args, timeout=timeout)


async def fetch(query: str, *args: Any, timeout: Optional[float] = None) -> list:
    """Execute a query and return all results."""
    async with get_connection() as conn:
        return await conn.fetch(query, *args, timeout=timeout)


async def fetchrow(query: str, *args: Any, timeout: Optional[float] = None) -> Optional[asyncpg.Record]:
    """Execute a query and return a single row."""
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args, timeout=timeout)


async def fetchval(query: str, *args: Any, timeout: Optional[float] = None) -> Any:
    """Execute a query and return a single value."""
    async with get_connection() as conn:
        return await conn.fetchval(query, *args, timeout=timeout)


async def health_check() -> dict[str, Any]:
    """Run a health check against the database."""
    manager = await get_db_manager()
    return await manager.health_check()
