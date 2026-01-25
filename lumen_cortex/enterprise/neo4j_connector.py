"""
═══════════════════════════════════════════════════════════════════════════════
                    NEO4J ASYNC CONNECTOR
═══════════════════════════════════════════════════════════════════════════════

Enterprise Neo4j integration with async support, connection pooling,
and automatic retry logic for graph operations.

FEATURES:
- Async driver with connection pooling
- Automatic retry with exponential backoff
- Transaction management
- Query result caching
- Health monitoring

@module lumen_cortex.enterprise.neo4j_connector
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import (
    Dict, Any, List, Optional, Tuple, TypeVar, Generic,
    AsyncGenerator, Callable, Union
)
from functools import wraps
from collections import OrderedDict

logger = logging.getLogger("LumenCortex.Neo4j")

T = TypeVar('T')


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class Neo4jConfig:
    """Neo4j connection configuration"""
    uri: str = "bolt://localhost:7687"
    username: str = "neo4j"
    password: str = ""
    database: str = "neo4j"
    max_connection_lifetime: int = 3600
    max_connection_pool_size: int = 50
    connection_acquisition_timeout: int = 60
    connection_timeout: int = 30
    max_retry_time: int = 30
    initial_retry_delay: float = 1.0
    retry_delay_multiplier: float = 2.0
    max_retry_delay: float = 30.0

    @classmethod
    def from_env(cls) -> Neo4jConfig:
        """Create config from environment variables"""
        import os
        return cls(
            uri=os.environ.get('NEO4J_URI', 'bolt://localhost:7687'),
            username=os.environ.get('NEO4J_USER', 'neo4j'),
            password=os.environ.get('NEO4J_PASSWORD', ''),
            database=os.environ.get('NEO4J_DATABASE', 'neo4j'),
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          QUERY CACHE
# ═══════════════════════════════════════════════════════════════════════════

class LRUCache(Generic[T]):
    """Thread-safe LRU cache for query results"""

    def __init__(self, max_size: int = 1000, ttl_seconds: int = 300):
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: OrderedDict[str, Tuple[T, float]] = OrderedDict()
        self._lock = asyncio.Lock()

    def _make_key(self, query: str, params: Dict) -> str:
        """Create cache key from query and params"""
        content = f"{query}:{json.dumps(params, sort_keys=True)}"
        return hashlib.sha256(content.encode()).hexdigest()[:32]

    async def get(self, query: str, params: Dict) -> Optional[T]:
        """Get value from cache if not expired"""
        key = self._make_key(query, params)

        async with self._lock:
            if key not in self._cache:
                return None

            value, timestamp = self._cache[key]

            # Check TTL
            if time.time() - timestamp > self.ttl_seconds:
                del self._cache[key]
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            return value

    async def set(self, query: str, params: Dict, value: T) -> None:
        """Set value in cache"""
        key = self._make_key(query, params)

        async with self._lock:
            # Remove if exists
            if key in self._cache:
                del self._cache[key]

            # Evict oldest if at capacity
            while len(self._cache) >= self.max_size:
                self._cache.popitem(last=False)

            self._cache[key] = (value, time.time())

    async def invalidate(self, pattern: Optional[str] = None) -> int:
        """Invalidate cache entries matching pattern"""
        async with self._lock:
            if pattern is None:
                count = len(self._cache)
                self._cache.clear()
                return count

            keys_to_remove = [
                k for k in self._cache.keys()
                if pattern in k
            ]
            for key in keys_to_remove:
                del self._cache[key]
            return len(keys_to_remove)

    @property
    def size(self) -> int:
        return len(self._cache)


# ═══════════════════════════════════════════════════════════════════════════
#                          RETRY LOGIC
# ═══════════════════════════════════════════════════════════════════════════

def retry_on_failure(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 30.0,
    multiplier: float = 2.0,
    retryable_exceptions: Tuple[type, ...] = (Exception,)
):
    """Decorator for retry with exponential backoff"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e

                    if attempt == max_retries:
                        logger.error(f"Max retries ({max_retries}) exceeded: {e}")
                        raise

                    logger.warning(
                        f"Attempt {attempt + 1} failed: {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )

                    await asyncio.sleep(delay)
                    delay = min(delay * multiplier, max_delay)

            raise last_exception

        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════════════════════════
#                          QUERY RESULT MODELS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class QueryResult:
    """Container for query results with metadata"""
    records: List[Dict[str, Any]]
    summary: Dict[str, Any]
    query: str
    parameters: Dict[str, Any]
    execution_time_ms: float
    from_cache: bool = False

    @property
    def single(self) -> Optional[Dict[str, Any]]:
        """Get single record or None"""
        return self.records[0] if self.records else None

    @property
    def count(self) -> int:
        return len(self.records)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "records": self.records,
            "count": self.count,
            "execution_time_ms": self.execution_time_ms,
            "from_cache": self.from_cache
        }


@dataclass
class TransactionResult:
    """Container for transaction results"""
    success: bool
    queries_executed: int
    total_time_ms: float
    results: List[QueryResult]
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════
#                          ASYNC NEO4J CONNECTOR
# ═══════════════════════════════════════════════════════════════════════════

class Neo4jAsyncConnector:
    """
    Enterprise async Neo4j connector with:
    - Connection pooling
    - Query caching
    - Automatic retry
    - Health monitoring
    - Transaction support
    """

    def __init__(self, config: Optional[Neo4jConfig] = None):
        self.config = config or Neo4jConfig.from_env()
        self._driver = None
        self._cache = LRUCache[List[Dict[str, Any]]](max_size=1000, ttl_seconds=300)
        self._connected = False
        self._health_check_interval = 30
        self._last_health_check: Optional[datetime] = None
        self._is_healthy = False

        # Statistics
        self._stats = {
            "queries_executed": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "retries": 0,
            "errors": 0
        }

    async def connect(self) -> None:
        """Establish connection to Neo4j"""
        if self._connected:
            return

        try:
            # Try to import neo4j driver
            try:
                from neo4j import AsyncGraphDatabase
            except ImportError:
                logger.warning("neo4j driver not installed - using mock mode")
                self._connected = True
                self._is_healthy = True
                return

            self._driver = AsyncGraphDatabase.driver(
                self.config.uri,
                auth=(self.config.username, self.config.password),
                max_connection_lifetime=self.config.max_connection_lifetime,
                max_connection_pool_size=self.config.max_connection_pool_size,
                connection_acquisition_timeout=self.config.connection_acquisition_timeout,
            )

            # Verify connection
            await self._verify_connectivity()

            self._connected = True
            self._is_healthy = True
            logger.info(f"Connected to Neo4j at {self.config.uri}")

        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            self._connected = True  # Mark as "connected" in mock mode
            self._is_healthy = False
            raise

    async def close(self) -> None:
        """Close connection"""
        if self._driver:
            await self._driver.close()
            self._driver = None
        self._connected = False
        self._is_healthy = False
        logger.info("Neo4j connection closed")

    async def _verify_connectivity(self) -> bool:
        """Verify Neo4j is reachable"""
        if not self._driver:
            return False

        try:
            async with self._driver.session(database=self.config.database) as session:
                result = await session.run("RETURN 1 as n")
                await result.consume()
            return True
        except Exception as e:
            logger.error(f"Connectivity check failed: {e}")
            return False

    async def health_check(self) -> Dict[str, Any]:
        """Perform health check"""
        start_time = time.time()

        health = {
            "status": "unknown",
            "connected": self._connected,
            "uri": self.config.uri,
            "database": self.config.database,
            "latency_ms": 0,
            "cache_size": self._cache.size,
            "stats": self._stats.copy()
        }

        if not self._driver:
            health["status"] = "disconnected"
            return health

        try:
            is_healthy = await self._verify_connectivity()
            health["latency_ms"] = (time.time() - start_time) * 1000
            health["status"] = "healthy" if is_healthy else "unhealthy"
            self._is_healthy = is_healthy
            self._last_health_check = datetime.utcnow()
        except Exception as e:
            health["status"] = "error"
            health["error"] = str(e)
            self._is_healthy = False

        return health

    @retry_on_failure(max_retries=3, initial_delay=1.0)
    async def execute(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None,
        use_cache: bool = True,
        cache_ttl: Optional[int] = None
    ) -> QueryResult:
        """
        Execute Cypher query.

        Args:
            query: Cypher query string
            parameters: Query parameters
            use_cache: Whether to use query cache (for reads)
            cache_ttl: Optional cache TTL override

        Returns:
            QueryResult with records and metadata
        """
        parameters = parameters or {}
        start_time = time.time()

        # Check cache for read queries
        if use_cache and self._is_read_query(query):
            cached = await self._cache.get(query, parameters)
            if cached is not None:
                self._stats["cache_hits"] += 1
                return QueryResult(
                    records=cached,
                    summary={},
                    query=query,
                    parameters=parameters,
                    execution_time_ms=(time.time() - start_time) * 1000,
                    from_cache=True
                )
            self._stats["cache_misses"] += 1

        # Execute query
        if not self._driver:
            # Mock mode
            logger.warning(f"Mock mode - query not executed: {query[:50]}...")
            return QueryResult(
                records=[],
                summary={"mock": True},
                query=query,
                parameters=parameters,
                execution_time_ms=0,
                from_cache=False
            )

        try:
            async with self._driver.session(database=self.config.database) as session:
                result = await session.run(query, parameters)
                records = [dict(record) for record in await result.data()]
                summary = await result.consume()

                summary_dict = {
                    "counters": {
                        "nodes_created": summary.counters.nodes_created,
                        "nodes_deleted": summary.counters.nodes_deleted,
                        "relationships_created": summary.counters.relationships_created,
                        "relationships_deleted": summary.counters.relationships_deleted,
                        "properties_set": summary.counters.properties_set,
                    },
                    "query_type": summary.query_type,
                    "database": summary.database,
                }

            execution_time = (time.time() - start_time) * 1000
            self._stats["queries_executed"] += 1

            # Cache read query results
            if use_cache and self._is_read_query(query):
                await self._cache.set(query, parameters, records)

            return QueryResult(
                records=records,
                summary=summary_dict,
                query=query,
                parameters=parameters,
                execution_time_ms=execution_time,
                from_cache=False
            )

        except Exception as e:
            self._stats["errors"] += 1
            logger.error(f"Query execution failed: {e}")
            raise

    def _is_read_query(self, query: str) -> bool:
        """Determine if query is read-only"""
        query_upper = query.strip().upper()
        write_keywords = ["CREATE", "MERGE", "SET", "DELETE", "REMOVE", "DETACH"]
        return not any(kw in query_upper for kw in write_keywords)

    @asynccontextmanager
    async def transaction(self) -> AsyncGenerator[Transaction, None]:
        """
        Context manager for transactions.

        Usage:
            async with connector.transaction() as tx:
                await tx.run("CREATE (n:Node {name: $name})", name="test")
                await tx.run("MATCH (n) RETURN n")
        """
        if not self._driver:
            # Mock transaction
            yield MockTransaction()
            return

        session = self._driver.session(database=self.config.database)
        tx = await session.begin_transaction()

        try:
            wrapper = Transaction(tx, self._stats)
            yield wrapper
            await tx.commit()
        except Exception as e:
            await tx.rollback()
            raise
        finally:
            await session.close()

    async def run_batch(
        self,
        queries: List[Tuple[str, Dict[str, Any]]],
        use_transaction: bool = True
    ) -> TransactionResult:
        """
        Run multiple queries in batch.

        Args:
            queries: List of (query, params) tuples
            use_transaction: Whether to run in transaction

        Returns:
            TransactionResult with all query results
        """
        start_time = time.time()
        results = []

        try:
            if use_transaction:
                async with self.transaction() as tx:
                    for query, params in queries:
                        result = await tx.run(query, params)
                        results.append(result)
            else:
                for query, params in queries:
                    result = await self.execute(query, params, use_cache=False)
                    results.append(result)

            return TransactionResult(
                success=True,
                queries_executed=len(queries),
                total_time_ms=(time.time() - start_time) * 1000,
                results=results
            )

        except Exception as e:
            return TransactionResult(
                success=False,
                queries_executed=len(results),
                total_time_ms=(time.time() - start_time) * 1000,
                results=results,
                error=str(e)
            )

    # ─────────────────────────────────────────────────────────────────────
    #                    CONVENIENCE METHODS
    # ─────────────────────────────────────────────────────────────────────

    async def create_node(
        self,
        labels: List[str],
        properties: Dict[str, Any]
    ) -> QueryResult:
        """Create a node with labels and properties"""
        labels_str = ':'.join(labels)
        query = f"CREATE (n:{labels_str} $props) RETURN n"
        return await self.execute(query, {"props": properties}, use_cache=False)

    async def find_nodes(
        self,
        labels: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None,
        limit: int = 100
    ) -> QueryResult:
        """Find nodes matching criteria"""
        label_clause = ':'.join(labels) if labels else ''
        label_clause = f":{label_clause}" if label_clause else ''

        where_clauses = []
        params = {"limit": limit}

        if properties:
            for i, (key, value) in enumerate(properties.items()):
                param_name = f"prop_{i}"
                where_clauses.append(f"n.{key} = ${param_name}")
                params[param_name] = value

        where_str = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        query = f"MATCH (n{label_clause}){where_str} RETURN n LIMIT $limit"
        return await self.execute(query, params)

    async def create_relationship(
        self,
        from_node_id: str,
        to_node_id: str,
        relationship_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> QueryResult:
        """Create relationship between nodes"""
        props_str = " $props" if properties else ""
        query = f"""
            MATCH (a) WHERE elementId(a) = $from_id
            MATCH (b) WHERE elementId(b) = $to_id
            CREATE (a)-[r:{relationship_type}{props_str}]->(b)
            RETURN r
        """
        params = {
            "from_id": from_node_id,
            "to_id": to_node_id
        }
        if properties:
            params["props"] = properties

        return await self.execute(query, params, use_cache=False)

    async def get_neighbors(
        self,
        node_id: str,
        relationship_types: Optional[List[str]] = None,
        direction: str = "both",
        max_depth: int = 1
    ) -> QueryResult:
        """Get neighboring nodes"""
        rel_filter = '|'.join(relationship_types) if relationship_types else ''
        rel_str = f":{rel_filter}" if rel_filter else ''

        if direction == "outgoing":
            pattern = f"-[r{rel_str}*1..{max_depth}]->"
        elif direction == "incoming":
            pattern = f"<-[r{rel_str}*1..{max_depth}]-"
        else:
            pattern = f"-[r{rel_str}*1..{max_depth}]-"

        query = f"""
            MATCH (n){pattern}(m)
            WHERE elementId(n) = $node_id
            RETURN DISTINCT m, r
        """
        return await self.execute(query, {"node_id": node_id})

    async def vector_search(
        self,
        index_name: str,
        query_vector: List[float],
        top_k: int = 10
    ) -> QueryResult:
        """
        Perform vector similarity search using Neo4j vector index.

        Requires Neo4j 5.11+ with vector index created:
        CREATE VECTOR INDEX entity_embeddings FOR (n:Entity) ON (n.embedding)
        """
        query = """
            CALL db.index.vector.queryNodes($index_name, $top_k, $query_vector)
            YIELD node, score
            RETURN node, score
            ORDER BY score DESC
        """
        return await self.execute(
            query,
            {
                "index_name": index_name,
                "top_k": top_k,
                "query_vector": query_vector
            }
        )

    async def run_gds_algorithm(
        self,
        algorithm: str,
        graph_name: str,
        config: Optional[Dict[str, Any]] = None
    ) -> QueryResult:
        """
        Run Graph Data Science algorithm.

        Algorithms: pageRank, louvain, leiden, node2vec, etc.
        """
        config = config or {}

        # Map algorithm names to GDS procedures
        gds_procedures = {
            "pagerank": "gds.pageRank.stream",
            "louvain": "gds.louvain.stream",
            "leiden": "gds.leiden.stream",
            "node2vec": "gds.node2vec.stream",
            "betweenness": "gds.betweenness.stream",
            "closeness": "gds.closeness.stream",
        }

        procedure = gds_procedures.get(algorithm.lower())
        if not procedure:
            raise ValueError(f"Unknown GDS algorithm: {algorithm}")

        query = f"""
            CALL {procedure}($graph_name, $config)
            YIELD nodeId, score
            RETURN gds.util.asNode(nodeId) AS node, score
            ORDER BY score DESC
        """

        return await self.execute(
            query,
            {"graph_name": graph_name, "config": config},
            use_cache=False
        )

    async def invalidate_cache(self, pattern: Optional[str] = None) -> int:
        """Invalidate query cache entries"""
        return await self._cache.invalidate(pattern)

    def get_stats(self) -> Dict[str, Any]:
        """Get connector statistics"""
        return {
            **self._stats,
            "cache_size": self._cache.size,
            "is_healthy": self._is_healthy,
            "last_health_check": self._last_health_check.isoformat() if self._last_health_check else None
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          TRANSACTION WRAPPER
# ═══════════════════════════════════════════════════════════════════════════

class Transaction:
    """Wrapper for Neo4j transaction"""

    def __init__(self, tx, stats: Dict):
        self._tx = tx
        self._stats = stats
        self._query_count = 0

    async def run(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> QueryResult:
        """Run query within transaction"""
        parameters = parameters or {}
        start_time = time.time()

        result = await self._tx.run(query, parameters)
        records = [dict(record) for record in await result.data()]

        self._query_count += 1
        self._stats["queries_executed"] += 1

        return QueryResult(
            records=records,
            summary={},
            query=query,
            parameters=parameters,
            execution_time_ms=(time.time() - start_time) * 1000,
            from_cache=False
        )


class MockTransaction:
    """Mock transaction for testing without Neo4j"""

    async def run(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> QueryResult:
        """Mock query execution"""
        logger.warning(f"Mock transaction - query not executed: {query[:50]}...")
        return QueryResult(
            records=[],
            summary={"mock": True},
            query=query,
            parameters=parameters or {},
            execution_time_ms=0,
            from_cache=False
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          SINGLETON INSTANCE
# ═══════════════════════════════════════════════════════════════════════════

_connector_instance: Optional[Neo4jAsyncConnector] = None


async def get_neo4j_connector(config: Optional[Neo4jConfig] = None) -> Neo4jAsyncConnector:
    """Get or create Neo4j connector singleton"""
    global _connector_instance

    if _connector_instance is None:
        _connector_instance = Neo4jAsyncConnector(config)
        await _connector_instance.connect()

    return _connector_instance


async def close_neo4j_connector() -> None:
    """Close the Neo4j connector singleton"""
    global _connector_instance

    if _connector_instance:
        await _connector_instance.close()
        _connector_instance = None
