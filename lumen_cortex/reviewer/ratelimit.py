"""
Rate Limiting - A7-4 Hardening

In-memory token bucket rate limiter for batch review endpoints.
Disabled by default; enable via REVIEW_RATE_LIMIT_ENABLED=1.

Usage:
    from lumen_cortex.reviewer.ratelimit import RateLimiter, get_rate_limiter

    # In FastAPI dependency
    limiter = get_rate_limiter()
    if not limiter.allow(program_id):
        raise HTTPException(429, ...)
"""

from __future__ import annotations

import time
import threading
from dataclasses import dataclass, field
from typing import Dict, Optional
from uuid import UUID

from lumen_cortex.reviewer.config import REVIEW_CONFIG


@dataclass
class TokenBucket:
    """
    Token bucket for rate limiting.

    Allows `burst` requests immediately, then refills at `rps` tokens/second.
    """

    capacity: int
    refill_rate: float  # tokens per second
    tokens: float = field(default=0.0, init=False)
    last_refill: float = field(default_factory=time.monotonic, init=False)
    lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    def __post_init__(self):
        """Initialize with full bucket."""
        self.tokens = float(self.capacity)

    def _refill(self, now: float) -> None:
        """Refill tokens based on elapsed time."""
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

    def allow(self) -> bool:
        """
        Attempt to consume one token.

        Returns True if allowed, False if rate limited.
        """
        with self.lock:
            now = time.monotonic()
            self._refill(now)

            if self.tokens >= 1.0:
                self.tokens -= 1.0
                return True
            return False

    def retry_after(self) -> float:
        """
        Time in seconds until next token is available.

        Returns 0 if tokens are available.
        """
        with self.lock:
            now = time.monotonic()
            self._refill(now)

            if self.tokens >= 1.0:
                return 0.0

            needed = 1.0 - self.tokens
            return needed / self.refill_rate


class RateLimiter:
    """
    Per-program rate limiter using token buckets.

    Thread-safe. Buckets are created on-demand and cached.
    """

    def __init__(
        self,
        enabled: bool = True,
        rps: float = 2.0,
        burst: int = 5,
    ):
        self.enabled = enabled
        self.rps = rps
        self.burst = burst
        self._buckets: Dict[str, TokenBucket] = {}
        self._lock = threading.Lock()

    def _get_bucket(self, key: str) -> TokenBucket:
        """Get or create bucket for key."""
        with self._lock:
            if key not in self._buckets:
                self._buckets[key] = TokenBucket(
                    capacity=self.burst,
                    refill_rate=self.rps,
                )
            return self._buckets[key]

    def allow(self, program_id: UUID) -> bool:
        """
        Check if request is allowed for program.

        Returns True if allowed, False if rate limited.
        Always returns True if rate limiting is disabled.
        """
        if not self.enabled:
            return True

        key = str(program_id)
        bucket = self._get_bucket(key)
        return bucket.allow()

    def retry_after(self, program_id: UUID) -> float:
        """
        Get retry-after time for program.

        Returns 0 if rate limiting is disabled or tokens available.
        """
        if not self.enabled:
            return 0.0

        key = str(program_id)
        bucket = self._get_bucket(key)
        return bucket.retry_after()


# Global rate limiter instance
_RATE_LIMITER: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """
    Get the global rate limiter instance.

    Lazily initialized from REVIEW_CONFIG.
    """
    global _RATE_LIMITER
    if _RATE_LIMITER is None:
        _RATE_LIMITER = RateLimiter(
            enabled=REVIEW_CONFIG.rate_limit_enabled,
            rps=REVIEW_CONFIG.rate_rps,
            burst=REVIEW_CONFIG.rate_burst,
        )
    return _RATE_LIMITER


def reset_rate_limiter() -> None:
    """Reset the global rate limiter (for testing)."""
    global _RATE_LIMITER
    _RATE_LIMITER = None
