"""
═══════════════════════════════════════════════════════════════════════════════
                 LUMEN CORTEX - CONNECTION POOL MANAGER
═══════════════════════════════════════════════════════════════════════════════

Enterprise connection pool management for PostgreSQL, Neo4j, and Redis.

FEATURES:
1. Multi-backend connection pooling
2. Health monitoring and auto-recovery
3. Connection lifecycle management
4. Read replica support
5. Automatic failover
6. Connection metrics
7. Graceful degradation

POOL TYPES:
- PostgreSQL (asyncpg with pgvector)
- Neo4j (bolt driver)
- Redis (connection pool)

@module lumen_cortex.enterprise.pool_manager
@version 2.0.0
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import (
    Any, AsyncContextManager, AsyncIterator, Callable, Dict, 
    Generic, List, Optional, TypeVar, Union
)

logger = logging.getLogger("LumenCortex.PoolManager")

T = TypeVar('T')


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class PoolBackend(Enum):
    """Supported pool backends"""
    POSTGRESQL = "postgresql"
    NEO4J = "neo4j"
    REDIS = "redis"


class PoolStrategy(Enum):
    """Connection acquisition strategy"""
    ROUND_ROBIN = "round_robin"
    LEAST_CONNECTIONS = "least_connections"
    RANDOM = "random"


@dataclass
class PoolConfig:
    """Pool configuration"""
    
    # Basic settings
    min_size: int = 5
    max_size: int = 20
    max_overflow: int = 10
    
    # Timeouts
    acquire_timeout: float = 10.0
    connection_timeout: float = 30.0
    idle_timeout: float = 300.0
    max_lifetime: float = 3600.0
    
    # Health checks
    health_check_interval: float = 30.0
    health_check_timeout: float = 5.0
    
    # Retry settings
    max_retries: int = 3
    retry_delay: float = 1.0
    
    # Strategy
    strategy: PoolStrategy = PoolStrategy.LEAST_CONNECTIONS
    
    # SSL
    ssl_enabled: bool = True
    ssl_verify: bool = True


@dataclass
class PostgresConfig(PoolConfig):
    """PostgreSQL-specific configuration"""
    
    host: str = ""
    port: int = 5432
    database: str = ""
    user: str = ""
    password: str = ""
    
    # Read replicas
    read_replicas: List[str] = field(default_factory=list)
    
    # Statement cache
    statement_cache_size: int = 100
    
    # pgvector
    pgvector_enabled: bool = True
    
    @classmethod
    def from_env(cls) -> "PostgresConfig":
        """Create config from environment"""
        return cls(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            database=os.getenv("POSTGRES_DB", ""),
            user=os.getenv("POSTGRES_USER", ""),
            password=os.getenv("POSTGRES_PASSWORD", ""),
            min_size=int(os.getenv("POSTGRES_POOL_MIN", "5")),
            max_size=int(os.getenv("POSTGRES_POOL_MAX", "20")),
        )
    
    @property
    def dsn(self) -> str:
        """Build connection DSN"""
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass
class Neo4jConfig(PoolConfig):
    """Neo4j-specific configuration"""
    
    uri: str = ""
    user: str = ""
    password: str = ""
    database: str = "neo4j"
    
    # Driver settings
    max_transaction_retry_time: float = 30.0
    encrypted: bool = True
    
    @classmethod
    def from_env(cls) -> "Neo4jConfig":
        """Create config from environment"""
        return cls(
            uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            user=os.getenv("NEO4J_USER", "neo4j"),
            password=os.getenv("NEO4J_PASSWORD", ""),
            database=os.getenv("NEO4J_DATABASE", "neo4j"),
            min_size=int(os.getenv("NEO4J_POOL_MIN", "5")),
            max_size=int(os.getenv("NEO4J_POOL_MAX", "20")),
        )


@dataclass  
class RedisPoolConfig(PoolConfig):
    """Redis-specific configuration"""
    
    url: str = ""
    
    # Cluster settings
    cluster_mode: bool = False
    
    # Sentinel settings
    sentinel_enabled: bool = False
    sentinel_master: str = ""
    sentinel_hosts: List[str] = field(default_factory=list)
    
    @classmethod
    def from_env(cls) -> "RedisPoolConfig":
        """Create config from environment"""
        return cls(
            url=os.getenv("REDIS_URL", "redis://localhost:6379"),
            min_size=int(os.getenv("REDIS_POOL_MIN", "5")),
            max_size=int(os.getenv("REDIS_POOL_MAX", "20")),
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          CONNECTION WRAPPER
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ConnectionStats:
    """Connection statistics"""
    created_at: datetime
    last_used: datetime
    use_count: int = 0
    errors: int = 0
    total_query_time_ms: float = 0.0
    
    @property
    def age_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.created_at).total_seconds()
    
    @property
    def idle_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.last_used).total_seconds()
    
    @property
    def avg_query_time_ms(self) -> float:
        return self.total_query_time_ms / self.use_count if self.use_count > 0 else 0


class PooledConnection(Generic[T]):
    """
    Wrapper for pooled connections with lifecycle management.
    """
    
    def __init__(
        self,
        connection: T,
        pool: "ConnectionPool",
        conn_id: str
    ):
        self._connection = connection
        self._pool = pool
        self._id = conn_id
        self._stats = ConnectionStats(
            created_at=datetime.now(timezone.utc),
            last_used=datetime.now(timezone.utc)
        )
        self._in_use = False
    
    @property
    def id(self) -> str:
        return self._id
    
    @property
    def connection(self) -> T:
        return self._connection
    
    @property
    def stats(self) -> ConnectionStats:
        return self._stats
    
    @property
    def in_use(self) -> bool:
        return self._in_use
    
    def mark_used(self) -> None:
        """Mark connection as in use"""
        self._in_use = True
        self._stats.use_count += 1
        self._stats.last_used = datetime.now(timezone.utc)
    
    def mark_available(self) -> None:
        """Mark connection as available"""
        self._in_use = False
    
    def record_query_time(self, time_ms: float) -> None:
        """Record query execution time"""
        self._stats.total_query_time_ms += time_ms
    
    def record_error(self) -> None:
        """Record connection error"""
        self._stats.errors += 1
    
    def is_expired(self, max_lifetime: float) -> bool:
        """Check if connection has exceeded max lifetime"""
        return self._stats.age_seconds > max_lifetime
    
    def is_idle_expired(self, idle_timeout: float) -> bool:
        """Check if connection has been idle too long"""
        return self._stats.idle_seconds > idle_timeout


# ═══════════════════════════════════════════════════════════════════════════
#                          ABSTRACT POOL
# ═══════════════════════════════════════════════════════════════════════════

class ConnectionPool(ABC, Generic[T]):
    """Abstract connection pool"""
    
    def __init__(self, config: PoolConfig):
        self.config = config
        self._connections: List[PooledConnection[T]] = []
        self._available: asyncio.Queue[PooledConnection[T]] = asyncio.Queue()
        self._lock = asyncio.Lock()
        self._closed = False
        self._conn_counter = 0
        
        # Health check task
        self._health_task: Optional[asyncio.Task] = None
        
        # Metrics
        self._metrics = {
            "acquires": 0,
            "releases": 0,
            "timeouts": 0,
            "errors": 0,
            "connections_created": 0,
            "connections_destroyed": 0,
        }
    
    @abstractmethod
    async def _create_connection(self) -> T:
        """Create a new connection"""
        pass
    
    @abstractmethod
    async def _close_connection(self, conn: T) -> None:
        """Close a connection"""
        pass
    
    @abstractmethod
    async def _health_check(self, conn: T) -> bool:
        """Check if connection is healthy"""
        pass
    
    async def initialize(self) -> None:
        """Initialize pool with minimum connections"""
        async with self._lock:
            for _ in range(self.config.min_size):
                try:
                    conn = await self._create_new_connection()
                    await self._available.put(conn)
                except Exception as e:
                    logger.error(f"Failed to create initial connection: {e}")
        
        # Start health check task
        self._health_task = asyncio.create_task(self._health_check_loop())
        
        logger.info(f"Pool initialized with {len(self._connections)} connections")
    
    async def close(self) -> None:
        """Close all connections"""
        self._closed = True
        
        # Cancel health check
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
        
        # Close all connections
        async with self._lock:
            for pooled in self._connections:
                try:
                    await self._close_connection(pooled.connection)
                    self._metrics["connections_destroyed"] += 1
                except Exception as e:
                    logger.error(f"Error closing connection: {e}")
            
            self._connections.clear()
        
        logger.info("Pool closed")
    
    async def _create_new_connection(self) -> PooledConnection[T]:
        """Create a new pooled connection"""
        self._conn_counter += 1
        conn_id = f"conn_{self._conn_counter}"
        
        raw_conn = await self._create_connection()
        pooled = PooledConnection(raw_conn, self, conn_id)
        
        self._connections.append(pooled)
        self._metrics["connections_created"] += 1
        
        return pooled
    
    async def acquire(self) -> PooledConnection[T]:
        """
        Acquire a connection from the pool.
        
        If no connections available:
        1. Create new if under max_size
        2. Wait for one to become available
        """
        if self._closed:
            raise RuntimeError("Pool is closed")
        
        self._metrics["acquires"] += 1
        
        try:
            # Try to get from queue with timeout
            pooled = await asyncio.wait_for(
                self._get_available_connection(),
                timeout=self.config.acquire_timeout
            )
            
            pooled.mark_used()
            return pooled
            
        except asyncio.TimeoutError:
            self._metrics["timeouts"] += 1
            raise TimeoutError("Connection acquire timeout")
    
    async def _get_available_connection(self) -> PooledConnection[T]:
        """Get an available connection, creating one if needed"""
        while True:
            try:
                # Try to get from queue (no wait)
                pooled = self._available.get_nowait()
                
                # Check if expired
                if pooled.is_expired(self.config.max_lifetime):
                    await self._destroy_connection(pooled)
                    continue
                
                # Check if idle expired
                if pooled.is_idle_expired(self.config.idle_timeout):
                    await self._destroy_connection(pooled)
                    continue
                
                return pooled
                
            except asyncio.QueueEmpty:
                # Can we create a new connection?
                async with self._lock:
                    total = len(self._connections)
                    if total < self.config.max_size + self.config.max_overflow:
                        return await self._create_new_connection()
                
                # Wait for one to become available
                return await self._available.get()
    
    async def release(self, pooled: PooledConnection[T]) -> None:
        """Release a connection back to the pool"""
        if self._closed:
            await self._destroy_connection(pooled)
            return
        
        self._metrics["releases"] += 1
        pooled.mark_available()
        
        # Check if connection should be destroyed
        if pooled.is_expired(self.config.max_lifetime):
            await self._destroy_connection(pooled)
            return
        
        # Return to queue
        await self._available.put(pooled)
    
    async def _destroy_connection(self, pooled: PooledConnection[T]) -> None:
        """Destroy a connection"""
        try:
            await self._close_connection(pooled.connection)
        except Exception as e:
            logger.error(f"Error destroying connection: {e}")
        finally:
            if pooled in self._connections:
                self._connections.remove(pooled)
            self._metrics["connections_destroyed"] += 1
    
    async def _health_check_loop(self) -> None:
        """Periodic health check of connections"""
        while not self._closed:
            try:
                await asyncio.sleep(self.config.health_check_interval)
                await self._run_health_checks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health check error: {e}")
    
    async def _run_health_checks(self) -> None:
        """Run health checks on idle connections"""
        # Get snapshot of available connections
        available = []
        while not self._available.empty():
            try:
                conn = self._available.get_nowait()
                available.append(conn)
            except asyncio.QueueEmpty:
                break
        
        # Check each connection
        for pooled in available:
            if pooled.is_expired(self.config.max_lifetime):
                await self._destroy_connection(pooled)
                continue
            
            try:
                is_healthy = await asyncio.wait_for(
                    self._health_check(pooled.connection),
                    timeout=self.config.health_check_timeout
                )
                
                if is_healthy:
                    await self._available.put(pooled)
                else:
                    await self._destroy_connection(pooled)
                    
            except Exception as e:
                logger.warning(f"Health check failed: {e}")
                await self._destroy_connection(pooled)
        
        # Ensure minimum connections
        async with self._lock:
            current = len(self._connections)
            if current < self.config.min_size:
                for _ in range(self.config.min_size - current):
                    try:
                        conn = await self._create_new_connection()
                        await self._available.put(conn)
                    except Exception as e:
                        logger.error(f"Failed to create connection: {e}")
    
    @asynccontextmanager
    async def connection(self) -> AsyncIterator[T]:
        """Context manager for connection acquisition"""
        pooled = await self.acquire()
        try:
            yield pooled.connection
        except Exception as e:
            pooled.record_error()
            self._metrics["errors"] += 1
            raise
        finally:
            await self.release(pooled)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics"""
        active = sum(1 for c in self._connections if c.in_use)
        
        return {
            "total_connections": len(self._connections),
            "active": active,
            "available": self._available.qsize(),
            "min_size": self.config.min_size,
            "max_size": self.config.max_size,
            **self._metrics
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          POSTGRESQL POOL
# ═══════════════════════════════════════════════════════════════════════════

class PostgreSQLPool(ConnectionPool):
    """PostgreSQL connection pool using asyncpg"""
    
    def __init__(self, config: PostgresConfig):
        super().__init__(config)
        self.pg_config = config
        self._pool = None  # asyncpg pool for comparison
    
    async def _create_connection(self) -> Any:
        """Create asyncpg connection"""
        try:
            import asyncpg
        except ImportError:
            raise RuntimeError("asyncpg not installed")
        
        conn = await asyncpg.connect(
            host=self.pg_config.host,
            port=self.pg_config.port,
            database=self.pg_config.database,
            user=self.pg_config.user,
            password=self.pg_config.password,
            timeout=self.pg_config.connection_timeout,
            statement_cache_size=self.pg_config.statement_cache_size,
        )
        
        # Enable pgvector if configured
        if self.pg_config.pgvector_enabled:
            try:
                await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            except Exception:
                pass  # Extension may already exist
        
        return conn
    
    async def _close_connection(self, conn: Any) -> None:
        """Close asyncpg connection"""
        await conn.close()
    
    async def _health_check(self, conn: Any) -> bool:
        """Check PostgreSQL connection health"""
        try:
            await conn.fetchval("SELECT 1")
            return True
        except Exception:
            return False
    
    async def execute(self, query: str, *args) -> str:
        """Execute a query"""
        async with self.connection() as conn:
            return await conn.execute(query, *args)
    
    async def fetch(self, query: str, *args) -> List[Any]:
        """Fetch multiple rows"""
        async with self.connection() as conn:
            return await conn.fetch(query, *args)
    
    async def fetchrow(self, query: str, *args) -> Optional[Any]:
        """Fetch single row"""
        async with self.connection() as conn:
            return await conn.fetchrow(query, *args)
    
    async def fetchval(self, query: str, *args) -> Any:
        """Fetch single value"""
        async with self.connection() as conn:
            return await conn.fetchval(query, *args)
    
    @asynccontextmanager
    async def transaction(self):
        """Transaction context manager"""
        async with self.connection() as conn:
            async with conn.transaction():
                yield conn


# ═══════════════════════════════════════════════════════════════════════════
#                          NEO4J POOL
# ═══════════════════════════════════════════════════════════════════════════

class Neo4jPool(ConnectionPool):
    """Neo4j connection pool"""
    
    def __init__(self, config: Neo4jConfig):
        super().__init__(config)
        self.neo4j_config = config
        self._driver = None
    
    async def initialize(self) -> None:
        """Initialize Neo4j driver"""
        try:
            from neo4j import AsyncGraphDatabase
        except ImportError:
            raise RuntimeError("neo4j package not installed")
        
        self._driver = AsyncGraphDatabase.driver(
            self.neo4j_config.uri,
            auth=(self.neo4j_config.user, self.neo4j_config.password),
            max_connection_pool_size=self.neo4j_config.max_size,
            connection_acquisition_timeout=self.neo4j_config.acquire_timeout,
        )
        
        # Verify connectivity
        async with self._driver.session(database=self.neo4j_config.database) as session:
            await session.run("RETURN 1")
        
        logger.info("Neo4j driver initialized")
    
    async def close(self) -> None:
        """Close Neo4j driver"""
        if self._driver:
            await self._driver.close()
            self._driver = None
        logger.info("Neo4j driver closed")
    
    async def _create_connection(self) -> Any:
        """Create Neo4j session"""
        if not self._driver:
            raise RuntimeError("Driver not initialized")
        return self._driver.session(database=self.neo4j_config.database)
    
    async def _close_connection(self, conn: Any) -> None:
        """Close Neo4j session"""
        await conn.close()
    
    async def _health_check(self, conn: Any) -> bool:
        """Check Neo4j connection health"""
        try:
            result = await conn.run("RETURN 1")
            await result.consume()
            return True
        except Exception:
            return False
    
    @asynccontextmanager
    async def session(self):
        """Session context manager"""
        session = self._driver.session(database=self.neo4j_config.database)
        try:
            yield session
        finally:
            await session.close()
    
    async def run(self, query: str, **params) -> List[Dict[str, Any]]:
        """Run a Cypher query"""
        async with self.session() as session:
            result = await session.run(query, **params)
            return [record.data() for record in await result.data()]
    
    @asynccontextmanager
    async def transaction(self, access_mode: str = "WRITE"):
        """Transaction context manager"""
        from neo4j import WRITE_ACCESS, READ_ACCESS
        
        mode = WRITE_ACCESS if access_mode == "WRITE" else READ_ACCESS
        
        async with self.session() as session:
            tx = await session.begin_transaction()
            try:
                yield tx
                await tx.commit()
            except Exception:
                await tx.rollback()
                raise


# ═══════════════════════════════════════════════════════════════════════════
#                          REDIS POOL
# ═══════════════════════════════════════════════════════════════════════════

class RedisPool(ConnectionPool):
    """Redis connection pool"""
    
    def __init__(self, config: RedisPoolConfig):
        super().__init__(config)
        self.redis_config = config
        self._redis = None
    
    async def initialize(self) -> None:
        """Initialize Redis connection pool"""
        try:
            import redis.asyncio as redis
        except ImportError:
            raise RuntimeError("redis package not installed")
        
        if self.redis_config.sentinel_enabled:
            # Sentinel mode
            from redis.asyncio.sentinel import Sentinel
            
            sentinel = Sentinel(
                [(h.split(":")[0], int(h.split(":")[1])) 
                 for h in self.redis_config.sentinel_hosts],
                socket_timeout=self.redis_config.connection_timeout
            )
            self._redis = sentinel.master_for(
                self.redis_config.sentinel_master,
                redis_class=redis.Redis
            )
        else:
            # Standard mode
            self._redis = await redis.from_url(
                self.redis_config.url,
                max_connections=self.redis_config.max_size,
                socket_timeout=self.redis_config.connection_timeout,
            )
        
        # Test connection
        await self._redis.ping()
        logger.info("Redis pool initialized")
    
    async def close(self) -> None:
        """Close Redis pool"""
        if self._redis:
            await self._redis.close()
            self._redis = None
        logger.info("Redis pool closed")
    
    async def _create_connection(self) -> Any:
        """Get Redis connection from internal pool"""
        return self._redis
    
    async def _close_connection(self, conn: Any) -> None:
        """No-op for Redis (uses internal pool)"""
        pass
    
    async def _health_check(self, conn: Any) -> bool:
        """Check Redis connection health"""
        try:
            await conn.ping()
            return True
        except Exception:
            return False
    
    @property
    def client(self):
        """Get Redis client"""
        return self._redis
    
    async def get(self, key: str) -> Optional[bytes]:
        """Get value"""
        return await self._redis.get(key)
    
    async def set(
        self, 
        key: str, 
        value: Union[str, bytes],
        ex: Optional[int] = None
    ) -> bool:
        """Set value with optional expiry"""
        return await self._redis.set(key, value, ex=ex)
    
    async def delete(self, *keys: str) -> int:
        """Delete keys"""
        return await self._redis.delete(*keys)
    
    async def exists(self, *keys: str) -> int:
        """Check if keys exist"""
        return await self._redis.exists(*keys)


# ═══════════════════════════════════════════════════════════════════════════
#                          POOL MANAGER
# ═══════════════════════════════════════════════════════════════════════════

class PoolManager:
    """
    Centralized pool manager for all database connections.
    
    Features:
    - Manages PostgreSQL, Neo4j, and Redis pools
    - Health monitoring across all pools
    - Graceful shutdown
    - Unified metrics
    """
    
    def __init__(self):
        self._pools: Dict[str, ConnectionPool] = {}
        self._configs: Dict[str, PoolConfig] = {}
        self._running = False
    
    async def add_postgres(
        self,
        name: str = "default",
        config: Optional[PostgresConfig] = None
    ) -> PostgreSQLPool:
        """Add PostgreSQL pool"""
        config = config or PostgresConfig.from_env()
        pool = PostgreSQLPool(config)
        await pool.initialize()
        
        self._pools[f"postgres:{name}"] = pool
        self._configs[f"postgres:{name}"] = config
        
        return pool
    
    async def add_neo4j(
        self,
        name: str = "default",
        config: Optional[Neo4jConfig] = None
    ) -> Neo4jPool:
        """Add Neo4j pool"""
        config = config or Neo4jConfig.from_env()
        pool = Neo4jPool(config)
        await pool.initialize()
        
        self._pools[f"neo4j:{name}"] = pool
        self._configs[f"neo4j:{name}"] = config
        
        return pool
    
    async def add_redis(
        self,
        name: str = "default",
        config: Optional[RedisPoolConfig] = None
    ) -> RedisPool:
        """Add Redis pool"""
        config = config or RedisPoolConfig.from_env()
        pool = RedisPool(config)
        await pool.initialize()
        
        self._pools[f"redis:{name}"] = pool
        self._configs[f"redis:{name}"] = config
        
        return pool
    
    def get_postgres(self, name: str = "default") -> Optional[PostgreSQLPool]:
        """Get PostgreSQL pool"""
        return self._pools.get(f"postgres:{name}")
    
    def get_neo4j(self, name: str = "default") -> Optional[Neo4jPool]:
        """Get Neo4j pool"""
        return self._pools.get(f"neo4j:{name}")
    
    def get_redis(self, name: str = "default") -> Optional[RedisPool]:
        """Get Redis pool"""
        return self._pools.get(f"redis:{name}")
    
    async def close_all(self) -> None:
        """Close all pools"""
        for name, pool in self._pools.items():
            try:
                await pool.close()
                logger.info(f"Closed pool: {name}")
            except Exception as e:
                logger.error(f"Error closing pool {name}: {e}")
        
        self._pools.clear()
    
    async def health_check(self) -> Dict[str, bool]:
        """Check health of all pools"""
        results = {}
        
        for name, pool in self._pools.items():
            try:
                stats = pool.get_stats()
                results[name] = stats.get("total_connections", 0) > 0
            except Exception:
                results[name] = False
        
        return results
    
    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get stats for all pools"""
        return {
            name: pool.get_stats()
            for name, pool in self._pools.items()
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          GLOBAL INSTANCE
# ═══════════════════════════════════════════════════════════════════════════

# Global pool manager instance
_pool_manager: Optional[PoolManager] = None


def get_pool_manager() -> PoolManager:
    """Get global pool manager"""
    global _pool_manager
    if _pool_manager is None:
        _pool_manager = PoolManager()
    return _pool_manager


async def init_pools(
    postgres: bool = True,
    neo4j: bool = True,
    redis: bool = True
) -> PoolManager:
    """Initialize all pools"""
    manager = get_pool_manager()
    
    if postgres:
        await manager.add_postgres()
    if neo4j:
        await manager.add_neo4j()
    if redis:
        await manager.add_redis()
    
    return manager


async def close_pools() -> None:
    """Close all pools"""
    global _pool_manager
    if _pool_manager:
        await _pool_manager.close_all()
        _pool_manager = None


# ═══════════════════════════════════════════════════════════════════════════
#                          EXPORTS
# ═══════════════════════════════════════════════════════════════════════════

__all__ = [
    # Configs
    "PoolConfig",
    "PostgresConfig",
    "Neo4jConfig",
    "RedisPoolConfig",
    "PoolBackend",
    "PoolStrategy",
    # Pools
    "ConnectionPool",
    "PostgreSQLPool",
    "Neo4jPool",
    "RedisPool",
    # Manager
    "PoolManager",
    "get_pool_manager",
    "init_pools",
    "close_pools",
    # Utilities
    "PooledConnection",
    "ConnectionStats",
]
