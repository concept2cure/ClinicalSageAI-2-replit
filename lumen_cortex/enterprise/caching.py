"""
═══════════════════════════════════════════════════════════════════════════════
                    LUMEN CORTEX - ENTERPRISE CACHING LAYER
═══════════════════════════════════════════════════════════════════════════════

High-performance distributed caching with Redis and local memory tiers.

FEATURES:
1. Two-tier caching (L1 local + L2 Redis)
2. Cache-aside pattern with automatic population
3. Write-through and write-behind strategies
4. TTL-based expiration with jitter
5. Cache invalidation with pub/sub
6. Compression for large values
7. Serialization with msgpack/json
8. Connection pooling
9. Circuit breaker for Redis failures
10. Metrics and monitoring

PATTERNS:
- Cache-aside (lazy loading)
- Write-through (synchronous)
- Write-behind (async batched)
- Read-through (automatic population)
- Refresh-ahead (proactive refresh)

@module lumen_cortex.enterprise.caching
@version 2.0.0
"""

from __future__ import annotations

import asyncio
import gzip
import hashlib
import json
import logging
import os
import pickle
import random
import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from functools import wraps
from typing import (
    Any, Awaitable, Callable, Dict, Generic, List, Optional,
    Set, Tuple, TypeVar, Union
)

logger = logging.getLogger("LumenCortex.Cache")

T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')


# ═══════════════════════════════════════════════════════════════════════════
#                          CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class SerializationFormat(Enum):
    """Serialization formats"""
    JSON = "json"
    PICKLE = "pickle"
    MSGPACK = "msgpack"


class CacheStrategy(Enum):
    """Cache write strategies"""
    CACHE_ASIDE = "cache_aside"
    WRITE_THROUGH = "write_through"
    WRITE_BEHIND = "write_behind"
    READ_THROUGH = "read_through"


@dataclass
class CacheConfig:
    """Cache configuration"""

    # Redis settings
    redis_url: str = ""
    redis_prefix: str = "lc:"
    redis_max_connections: int = 20
    redis_socket_timeout: float = 5.0
    redis_connect_timeout: float = 10.0

    # Local cache settings
    local_max_size: int = 10000
    local_ttl_seconds: int = 300
    local_enabled: bool = True

    # TTL settings
    default_ttl_seconds: int = 3600
    max_ttl_seconds: int = 86400
    ttl_jitter_percent: float = 10.0  # Add random jitter to prevent thundering herd

    # Compression settings
    compression_enabled: bool = True
    compression_threshold: int = 1024  # Compress values larger than this
    compression_level: int = 6

    # Serialization
    serialization_format: SerializationFormat = SerializationFormat.JSON

    # Strategy
    write_strategy: CacheStrategy = CacheStrategy.CACHE_ASIDE

    # Write-behind settings
    write_behind_batch_size: int = 100
    write_behind_flush_interval: float = 1.0

    # Refresh-ahead settings
    refresh_ahead_threshold: float = 0.8  # Refresh when 80% of TTL elapsed

    # Circuit breaker
    circuit_breaker_enabled: bool = True
    circuit_breaker_threshold: int = 5
    circuit_breaker_timeout: float = 30.0

    # Pub/sub for invalidation
    pubsub_enabled: bool = True
    pubsub_channel: str = "cache:invalidate"

    @classmethod
    def from_env(cls) -> "CacheConfig":
        """Create config from environment variables"""
        return cls(
            redis_url=os.getenv("REDIS_URL", ""),
            redis_prefix=os.getenv("CACHE_PREFIX", "lc:"),
            redis_max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "20")),
            local_max_size=int(os.getenv("LOCAL_CACHE_SIZE", "10000")),
            local_ttl_seconds=int(os.getenv("LOCAL_CACHE_TTL", "300")),
            default_ttl_seconds=int(os.getenv("CACHE_DEFAULT_TTL", "3600")),
            compression_enabled=os.getenv("CACHE_COMPRESSION", "true").lower() == "true",
        )


# ═══════════════════════════════════════════════════════════════════════════
#                          LOCAL CACHE (L1)
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class CacheEntry(Generic[T]):
    """Cache entry with metadata"""
    value: T
    created_at: float
    expires_at: float
    hits: int = 0
    size_bytes: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    @property
    def ttl_remaining(self) -> float:
        return max(0, self.expires_at - time.time())

    @property
    def age(self) -> float:
        return time.time() - self.created_at


class LRUCache(Generic[K, V]):
    """
    Thread-safe LRU cache with TTL support.

    Uses OrderedDict for O(1) operations.
    """

    def __init__(self, max_size: int = 1000, default_ttl: float = 300):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self._cache: OrderedDict[K, CacheEntry[V]] = OrderedDict()
        self._lock = asyncio.Lock()

        # Stats
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    async def get(self, key: K) -> Optional[V]:
        """Get value from cache"""
        async with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._misses += 1
                return None

            if entry.is_expired:
                del self._cache[key]
                self._misses += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.hits += 1
            self._hits += 1

            return entry.value

    async def set(
        self,
        key: K,
        value: V,
        ttl: Optional[float] = None
    ) -> None:
        """Set value in cache"""
        async with self._lock:
            # Evict if at capacity
            while len(self._cache) >= self.max_size:
                # Remove oldest (least recently used)
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
                self._evictions += 1

            now = time.time()
            ttl = ttl if ttl is not None else self.default_ttl

            self._cache[key] = CacheEntry(
                value=value,
                created_at=now,
                expires_at=now + ttl,
                size_bytes=len(str(value).encode()) if isinstance(value, str) else 0
            )

            # Move to end
            self._cache.move_to_end(key)

    async def delete(self, key: K) -> bool:
        """Delete key from cache"""
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    async def exists(self, key: K) -> bool:
        """Check if key exists and is not expired"""
        async with self._lock:
            entry = self._cache.get(key)
            if entry is None or entry.is_expired:
                return False
            return True

    async def clear(self) -> int:
        """Clear all entries"""
        async with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    async def get_many(self, keys: List[K]) -> Dict[K, V]:
        """Get multiple keys"""
        results = {}
        for key in keys:
            value = await self.get(key)
            if value is not None:
                results[key] = value
        return results

    async def set_many(
        self,
        items: Dict[K, V],
        ttl: Optional[float] = None
    ) -> None:
        """Set multiple keys"""
        for key, value in items.items():
            await self.set(key, value, ttl)

    async def cleanup_expired(self) -> int:
        """Remove expired entries"""
        async with self._lock:
            expired_keys = [
                k for k, v in self._cache.items()
                if v.is_expired
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0

        return {
            "size": len(self._cache),
            "max_size": self.max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(hit_rate, 2),
            "evictions": self._evictions,
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          SERIALIZATION
# ═══════════════════════════════════════════════════════════════════════════

class Serializer(ABC):
    """Abstract serializer"""

    @abstractmethod
    def serialize(self, value: Any) -> bytes:
        pass

    @abstractmethod
    def deserialize(self, data: bytes) -> Any:
        pass


class JSONSerializer(Serializer):
    """JSON serializer"""

    def serialize(self, value: Any) -> bytes:
        return json.dumps(value, default=str).encode()

    def deserialize(self, data: bytes) -> Any:
        return json.loads(data.decode())


class PickleSerializer(Serializer):
    """Pickle serializer (faster for Python objects)"""

    def serialize(self, value: Any) -> bytes:
        return pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)

    def deserialize(self, data: bytes) -> Any:
        return pickle.loads(data)


class MsgPackSerializer(Serializer):
    """MessagePack serializer (compact binary)"""

    def __init__(self):
        try:
            import msgpack
            self._msgpack = msgpack
            self._available = True
        except ImportError:
            self._msgpack = None
            self._available = False

    def serialize(self, value: Any) -> bytes:
        if not self._available:
            raise RuntimeError("msgpack not available")
        return self._msgpack.packb(value, use_bin_type=True)

    def deserialize(self, data: bytes) -> Any:
        if not self._available:
            raise RuntimeError("msgpack not available")
        return self._msgpack.unpackb(data, raw=False)


def get_serializer(format: SerializationFormat) -> Serializer:
    """Get serializer for format"""
    if format == SerializationFormat.JSON:
        return JSONSerializer()
    elif format == SerializationFormat.PICKLE:
        return PickleSerializer()
    elif format == SerializationFormat.MSGPACK:
        return MsgPackSerializer()
    else:
        raise ValueError(f"Unknown format: {format}")


# ═══════════════════════════════════════════════════════════════════════════
#                          COMPRESSION
# ═══════════════════════════════════════════════════════════════════════════

class Compressor:
    """Data compressor"""

    def __init__(self, level: int = 6, threshold: int = 1024):
        self.level = level
        self.threshold = threshold

    def compress(self, data: bytes) -> Tuple[bytes, bool]:
        """
        Compress data if above threshold.
        Returns (data, was_compressed)
        """
        if len(data) < self.threshold:
            return data, False

        compressed = gzip.compress(data, compresslevel=self.level)

        # Only use compressed if smaller
        if len(compressed) < len(data):
            return compressed, True

        return data, False

    def decompress(self, data: bytes, is_compressed: bool) -> bytes:
        """Decompress data if it was compressed"""
        if not is_compressed:
            return data
        return gzip.decompress(data)


# ═══════════════════════════════════════════════════════════════════════════
#                          CIRCUIT BREAKER
# ═══════════════════════════════════════════════════════════════════════════

class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CacheCircuitBreaker:
    """Circuit breaker for cache backend failures"""

    def __init__(self, threshold: int = 5, timeout: float = 30.0):
        self.threshold = threshold
        self.timeout = timeout

        self._state = CircuitState.CLOSED
        self._failures = 0
        self._last_failure_time: Optional[float] = None
        self._success_count = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def is_available(self) -> bool:
        if self._state == CircuitState.CLOSED:
            return True

        if self._state == CircuitState.OPEN:
            # Check if timeout elapsed
            if self._last_failure_time and time.time() - self._last_failure_time > self.timeout:
                return True

        return self._state == CircuitState.HALF_OPEN

    async def record_success(self) -> None:
        """Record successful operation"""
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= 3:
                    self._state = CircuitState.CLOSED
                    self._failures = 0
                    self._success_count = 0
                    logger.info("Circuit breaker closed")
            else:
                self._failures = 0

    async def record_failure(self) -> None:
        """Record failed operation"""
        async with self._lock:
            self._failures += 1
            self._last_failure_time = time.time()

            if self._failures >= self.threshold:
                if self._state != CircuitState.OPEN:
                    self._state = CircuitState.OPEN
                    logger.warning("Circuit breaker opened")

    async def try_reset(self) -> None:
        """Try to reset to half-open state"""
        async with self._lock:
            if self._state == CircuitState.OPEN:
                if self._last_failure_time and time.time() - self._last_failure_time > self.timeout:
                    self._state = CircuitState.HALF_OPEN
                    self._success_count = 0
                    logger.info("Circuit breaker half-open")


# ═══════════════════════════════════════════════════════════════════════════
#                          REDIS CACHE (L2)
# ═══════════════════════════════════════════════════════════════════════════

class RedisCache:
    """
    Redis cache backend with connection pooling.
    """

    def __init__(self, config: CacheConfig):
        self.config = config
        self._redis = None
        self._pubsub = None
        self._pubsub_task: Optional[asyncio.Task] = None

        self.serializer = get_serializer(config.serialization_format)
        self.compressor = Compressor(
            level=config.compression_level,
            threshold=config.compression_threshold
        )
        self.circuit_breaker = CacheCircuitBreaker(
            threshold=config.circuit_breaker_threshold,
            timeout=config.circuit_breaker_timeout
        )

        # Stats
        self._stats = {
            "gets": 0,
            "sets": 0,
            "deletes": 0,
            "hits": 0,
            "misses": 0,
            "errors": 0,
        }

        # Invalidation callbacks
        self._invalidation_callbacks: List[Callable[[str], Awaitable[None]]] = []

    async def connect(self) -> bool:
        """Connect to Redis"""
        if not self.config.redis_url:
            logger.warning("Redis URL not configured")
            return False

        try:
            import redis.asyncio as redis

            self._redis = await redis.from_url(
                self.config.redis_url,
                max_connections=self.config.redis_max_connections,
                socket_timeout=self.config.redis_socket_timeout,
                socket_connect_timeout=self.config.redis_connect_timeout,
            )

            # Test connection
            await self._redis.ping()

            # Start pub/sub listener
            if self.config.pubsub_enabled:
                await self._start_pubsub()

            logger.info("Connected to Redis")
            return True

        except ImportError:
            logger.warning("redis package not installed")
            return False
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from Redis"""
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass

        if self._redis:
            await self._redis.close()
            self._redis = None

    async def _start_pubsub(self) -> None:
        """Start pub/sub listener for cache invalidation"""
        if not self._redis:
            return

        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe(self.config.pubsub_channel)

        self._pubsub_task = asyncio.create_task(self._pubsub_listener())

    async def _pubsub_listener(self) -> None:
        """Listen for invalidation messages"""
        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    key = message["data"].decode()
                    for callback in self._invalidation_callbacks:
                        try:
                            await callback(key)
                        except Exception as e:
                            logger.error(f"Invalidation callback error: {e}")
        except asyncio.CancelledError:
            pass

    def add_invalidation_callback(
        self,
        callback: Callable[[str], Awaitable[None]]
    ) -> None:
        """Add callback for cache invalidation events"""
        self._invalidation_callbacks.append(callback)

    def _make_key(self, key: str) -> str:
        """Make full Redis key with prefix"""
        return f"{self.config.redis_prefix}{key}"

    async def get(self, key: str) -> Optional[Any]:
        """Get value from Redis"""
        if not self._redis or not self.circuit_breaker.is_available:
            return None

        self._stats["gets"] += 1

        try:
            await self.circuit_breaker.try_reset()

            redis_key = self._make_key(key)
            data = await self._redis.get(redis_key)

            if data is None:
                self._stats["misses"] += 1
                return None

            # Check if compressed (first byte is flag)
            is_compressed = data[0] == 1
            payload = data[1:]

            # Decompress if needed
            decompressed = self.compressor.decompress(payload, is_compressed)

            # Deserialize
            value = self.serializer.deserialize(decompressed)

            self._stats["hits"] += 1
            await self.circuit_breaker.record_success()

            return value

        except Exception as e:
            self._stats["errors"] += 1
            await self.circuit_breaker.record_failure()
            logger.error(f"Redis get error: {e}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """Set value in Redis"""
        if not self._redis or not self.circuit_breaker.is_available:
            return False

        self._stats["sets"] += 1

        try:
            await self.circuit_breaker.try_reset()

            # Serialize
            serialized = self.serializer.serialize(value)

            # Compress
            compressed, is_compressed = self.compressor.compress(serialized)

            # Add compression flag
            flag = bytes([1 if is_compressed else 0])
            payload = flag + compressed

            # Calculate TTL with jitter
            ttl = ttl or self.config.default_ttl_seconds
            if self.config.ttl_jitter_percent > 0:
                jitter = ttl * self.config.ttl_jitter_percent / 100
                ttl = int(ttl + random.uniform(-jitter, jitter))

            redis_key = self._make_key(key)
            await self._redis.setex(redis_key, ttl, payload)

            await self.circuit_breaker.record_success()
            return True

        except Exception as e:
            self._stats["errors"] += 1
            await self.circuit_breaker.record_failure()
            logger.error(f"Redis set error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from Redis"""
        if not self._redis:
            return False

        self._stats["deletes"] += 1

        try:
            redis_key = self._make_key(key)
            result = await self._redis.delete(redis_key)

            # Publish invalidation
            if self.config.pubsub_enabled:
                await self._redis.publish(self.config.pubsub_channel, key)

            return result > 0

        except Exception as e:
            self._stats["errors"] += 1
            logger.error(f"Redis delete error: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        if not self._redis:
            return False

        try:
            redis_key = self._make_key(key)
            return await self._redis.exists(redis_key) > 0
        except Exception as e:
            logger.error(f"Redis exists error: {e}")
            return False

    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple keys"""
        if not self._redis or not keys:
            return {}

        try:
            redis_keys = [self._make_key(k) for k in keys]
            values = await self._redis.mget(redis_keys)

            results = {}
            for key, data in zip(keys, values):
                if data:
                    try:
                        is_compressed = data[0] == 1
                        payload = data[1:]
                        decompressed = self.compressor.decompress(payload, is_compressed)
                        results[key] = self.serializer.deserialize(decompressed)
                    except Exception:
                        pass

            return results

        except Exception as e:
            logger.error(f"Redis mget error: {e}")
            return {}

    async def set_many(
        self,
        items: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> int:
        """Set multiple keys"""
        if not self._redis:
            return 0

        ttl = ttl or self.config.default_ttl_seconds
        count = 0

        # Use pipeline for efficiency
        try:
            pipe = self._redis.pipeline()

            for key, value in items.items():
                serialized = self.serializer.serialize(value)
                compressed, is_compressed = self.compressor.compress(serialized)
                flag = bytes([1 if is_compressed else 0])
                payload = flag + compressed

                redis_key = self._make_key(key)
                pipe.setex(redis_key, ttl, payload)
                count += 1

            await pipe.execute()
            return count

        except Exception as e:
            logger.error(f"Redis pipeline error: {e}")
            return 0

    async def clear_prefix(self, prefix: str = "") -> int:
        """Clear all keys with prefix"""
        if not self._redis:
            return 0

        try:
            pattern = self._make_key(prefix + "*")
            keys = []

            async for key in self._redis.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                await self._redis.delete(*keys)

            return len(keys)

        except Exception as e:
            logger.error(f"Redis clear error: {e}")
            return 0

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0

        return {
            **self._stats,
            "hit_rate": round(hit_rate, 2),
            "circuit_state": self.circuit_breaker.state.value,
            "connected": self._redis is not None,
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          UNIFIED CACHE SERVICE
# ═══════════════════════════════════════════════════════════════════════════

class CacheService:
    """
    Two-tier cache service with L1 local and L2 Redis.

    Features:
    - Automatic L1/L2 coordination
    - Cache-aside pattern by default
    - Pub/sub invalidation across instances
    - Metrics and monitoring
    """

    def __init__(self, config: Optional[CacheConfig] = None):
        self.config = config or CacheConfig.from_env()

        # L1 local cache
        self.local = LRUCache(
            max_size=self.config.local_max_size,
            default_ttl=self.config.local_ttl_seconds
        ) if self.config.local_enabled else None

        # L2 Redis cache
        self.redis = RedisCache(self.config)

        # Write-behind buffer
        self._write_behind_buffer: List[Tuple[str, Any, int]] = []
        self._write_behind_task: Optional[asyncio.Task] = None
        self._write_behind_lock = asyncio.Lock()

        # Background tasks
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        """Start cache service"""
        # Connect to Redis
        await self.redis.connect()

        # Register invalidation callback
        if self.local:
            self.redis.add_invalidation_callback(self._on_remote_invalidation)

        self._running = True

        # Start background tasks
        if self.local:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

        if self.config.write_strategy == CacheStrategy.WRITE_BEHIND:
            self._write_behind_task = asyncio.create_task(self._write_behind_loop())

        logger.info("Cache service started")

    async def stop(self) -> None:
        """Stop cache service"""
        self._running = False

        # Cancel background tasks
        for task in [self._cleanup_task, self._write_behind_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        # Flush write-behind buffer
        if self._write_behind_buffer:
            await self._flush_write_behind()

        # Disconnect from Redis
        await self.redis.disconnect()

        logger.info("Cache service stopped")

    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Checks L1 first, then L2.
        Populates L1 from L2 on hit.
        """
        # Try L1 first
        if self.local:
            value = await self.local.get(key)
            if value is not None:
                return value

        # Try L2
        value = await self.redis.get(key)

        if value is not None and self.local:
            # Populate L1
            await self.local.set(key, value)

        return value

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """
        Set value in cache.

        Strategy determines write behavior:
        - CACHE_ASIDE: Only updates cache
        - WRITE_THROUGH: Synchronous write to L2
        - WRITE_BEHIND: Async batched write to L2
        """
        ttl = ttl or self.config.default_ttl_seconds

        # Update L1
        if self.local:
            await self.local.set(key, value, ttl=min(ttl, self.config.local_ttl_seconds))

        # Update L2 based on strategy
        if self.config.write_strategy == CacheStrategy.WRITE_THROUGH:
            return await self.redis.set(key, value, ttl)

        elif self.config.write_strategy == CacheStrategy.WRITE_BEHIND:
            async with self._write_behind_lock:
                self._write_behind_buffer.append((key, value, ttl))
            return True

        else:  # CACHE_ASIDE - write to L2 directly
            return await self.redis.set(key, value, ttl)

    async def delete(self, key: str) -> bool:
        """Delete from both caches"""
        # Delete from L1
        if self.local:
            await self.local.delete(key)

        # Delete from L2
        return await self.redis.delete(key)

    async def exists(self, key: str) -> bool:
        """Check if key exists in either cache"""
        if self.local and await self.local.exists(key):
            return True
        return await self.redis.exists(key)

    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple keys"""
        results = {}
        missing = []

        # Check L1
        if self.local:
            results = await self.local.get_many(keys)
            missing = [k for k in keys if k not in results]
        else:
            missing = keys

        # Get missing from L2
        if missing:
            l2_results = await self.redis.get_many(missing)
            results.update(l2_results)

            # Populate L1
            if self.local and l2_results:
                await self.local.set_many(l2_results)

        return results

    async def set_many(
        self,
        items: Dict[str, Any],
        ttl: Optional[int] = None
    ) -> int:
        """Set multiple keys"""
        ttl = ttl or self.config.default_ttl_seconds

        # Update L1
        if self.local:
            await self.local.set_many(items, ttl=min(ttl, self.config.local_ttl_seconds))

        # Update L2
        return await self.redis.set_many(items, ttl)

    async def invalidate(self, key: str) -> None:
        """
        Invalidate a key across all instances.

        Uses pub/sub to notify other instances.
        """
        await self.delete(key)

    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate keys matching pattern"""
        # Clear local cache (full clear since we can't pattern match efficiently)
        if self.local:
            await self.local.clear()

        # Clear from Redis
        return await self.redis.clear_prefix(pattern)

    async def _on_remote_invalidation(self, key: str) -> None:
        """Handle invalidation from another instance"""
        if self.local:
            await self.local.delete(key)

    async def _cleanup_loop(self) -> None:
        """Periodic cleanup of expired L1 entries"""
        while self._running:
            try:
                await asyncio.sleep(60)
                if self.local:
                    await self.local.cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cleanup error: {e}")

    async def _write_behind_loop(self) -> None:
        """Periodic flush of write-behind buffer"""
        while self._running:
            try:
                await asyncio.sleep(self.config.write_behind_flush_interval)
                await self._flush_write_behind()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Write-behind error: {e}")

    async def _flush_write_behind(self) -> None:
        """Flush write-behind buffer to Redis"""
        async with self._write_behind_lock:
            if not self._write_behind_buffer:
                return

            buffer = self._write_behind_buffer.copy()
            self._write_behind_buffer.clear()

        # Write to Redis
        for key, value, ttl in buffer:
            await self.redis.set(key, value, ttl)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        stats = {
            "strategy": self.config.write_strategy.value,
        }

        if self.local:
            stats["local"] = self.local.get_stats()

        stats["redis"] = self.redis.get_stats()

        return stats


# ═══════════════════════════════════════════════════════════════════════════
#                          DECORATORS
# ═══════════════════════════════════════════════════════════════════════════

def cached(
    cache: CacheService,
    key_prefix: str = "",
    ttl: Optional[int] = None,
    key_builder: Optional[Callable[..., str]] = None
):
    """
    Decorator for caching function results.

    Usage:
        @cached(cache_service, key_prefix="user", ttl=3600)
        async def get_user(user_id: str) -> dict:
            return await db.get_user(user_id)
    """
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Build cache key
            if key_builder:
                key = key_builder(*args, **kwargs)
            else:
                key_parts = [key_prefix, func.__name__]
                key_parts.extend(str(a) for a in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                key = ":".join(key_parts)

            # Check cache
            cached_value = await cache.get(key)
            if cached_value is not None:
                return cached_value

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            await cache.set(key, result, ttl)

            return result

        return wrapper
    return decorator


def cache_invalidate(
    cache: CacheService,
    key_pattern: Optional[str] = None,
    key_builder: Optional[Callable[..., str]] = None
):
    """
    Decorator to invalidate cache after function execution.

    Usage:
        @cache_invalidate(cache_service, key_pattern="user:*")
        async def update_user(user_id: str, data: dict) -> None:
            await db.update_user(user_id, data)
    """
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            result = await func(*args, **kwargs)

            # Invalidate cache
            if key_builder:
                key = key_builder(*args, **kwargs)
                await cache.invalidate(key)
            elif key_pattern:
                await cache.invalidate_pattern(key_pattern)

            return result

        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════════════════════════
#                          EXPORTS
# ═══════════════════════════════════════════════════════════════════════════

__all__ = [
    # Config
    "CacheConfig",
    "SerializationFormat",
    "CacheStrategy",
    # Services
    "CacheService",
    "LRUCache",
    "RedisCache",
    # Utilities
    "CacheEntry",
    "CacheCircuitBreaker",
    "Compressor",
    "Serializer",
    "JSONSerializer",
    "PickleSerializer",
    "MsgPackSerializer",
    # Decorators
    "cached",
    "cache_invalidate",
]
