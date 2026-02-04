"""
Rate Limiting Tests - A7-4

Unit tests for token bucket rate limiter (independent of FastAPI).

PYTHONHASHSEED=0 required for determinism.
"""

from __future__ import annotations

import time
from uuid import UUID

import pytest

from lumen_cortex.reviewer.ratelimit import TokenBucket, RateLimiter


class TestTokenBucket:
    """Test token bucket algorithm."""

    def test_initial_state_allows_burst(self):
        """New bucket allows burst requests immediately."""
        bucket = TokenBucket(capacity=5, refill_rate=1.0)

        # Should allow 5 requests immediately
        for _ in range(5):
            assert bucket.allow() is True

        # 6th request should be denied
        assert bucket.allow() is False

    def test_refill_after_time(self):
        """Bucket refills tokens over time."""
        bucket = TokenBucket(capacity=2, refill_rate=10.0)  # 10 tokens/sec

        # Consume all tokens
        assert bucket.allow() is True
        assert bucket.allow() is True
        assert bucket.allow() is False

        # Wait for refill (0.15s = 1.5 tokens at 10/sec)
        time.sleep(0.15)

        # Should have at least 1 token now
        assert bucket.allow() is True

    def test_retry_after_calculation(self):
        """retry_after returns time until next token."""
        bucket = TokenBucket(capacity=1, refill_rate=1.0)  # 1 token/sec

        # Consume the token
        assert bucket.allow() is True

        # Check retry after
        retry = bucket.retry_after()
        assert 0.5 < retry <= 1.0  # Should be close to 1 second

    def test_retry_after_zero_when_tokens_available(self):
        """retry_after returns 0 when tokens available."""
        bucket = TokenBucket(capacity=5, refill_rate=1.0)

        retry = bucket.retry_after()
        assert retry == 0.0


class TestRateLimiter:
    """Test per-program rate limiter."""

    def test_disabled_limiter_always_allows(self):
        """Disabled limiter allows all requests."""
        limiter = RateLimiter(enabled=False, rps=1.0, burst=1)
        program_id = UUID("11111111-1111-1111-1111-111111111111")

        # Even with burst=1, should allow many requests when disabled
        for _ in range(100):
            assert limiter.allow(program_id) is True

    def test_enabled_limiter_enforces_limits(self):
        """Enabled limiter enforces burst and RPS."""
        limiter = RateLimiter(enabled=True, rps=1.0, burst=2)
        program_id = UUID("22222222-2222-2222-2222-222222222222")

        # Should allow 2 requests (burst)
        assert limiter.allow(program_id) is True
        assert limiter.allow(program_id) is True

        # 3rd should be denied
        assert limiter.allow(program_id) is False

    def test_per_program_isolation(self):
        """Different programs have separate buckets."""
        limiter = RateLimiter(enabled=True, rps=1.0, burst=1)
        program_a = UUID("33333333-3333-3333-3333-333333333333")
        program_b = UUID("44444444-4444-4444-4444-444444444444")

        # Each program gets its own burst
        assert limiter.allow(program_a) is True
        assert limiter.allow(program_b) is True

        # Both are now rate limited
        assert limiter.allow(program_a) is False
        assert limiter.allow(program_b) is False

    def test_retry_after_when_limited(self):
        """retry_after returns positive value when limited."""
        limiter = RateLimiter(enabled=True, rps=2.0, burst=1)
        program_id = UUID("55555555-5555-5555-5555-555555555555")

        # Consume the token
        assert limiter.allow(program_id) is True
        assert limiter.allow(program_id) is False

        # Should have positive retry_after
        retry = limiter.retry_after(program_id)
        assert retry > 0
        assert retry <= 0.5  # At 2 RPS, max wait is 0.5s

    def test_retry_after_zero_when_disabled(self):
        """retry_after returns 0 when limiter disabled."""
        limiter = RateLimiter(enabled=False, rps=1.0, burst=1)
        program_id = UUID("66666666-6666-6666-6666-666666666666")

        retry = limiter.retry_after(program_id)
        assert retry == 0.0


class TestConfigIntegration:
    """Test config and rate limiter integration."""

    def test_config_from_env_defaults(self, monkeypatch):
        """Config loads defaults when env vars not set."""
        # Clear any existing env vars
        monkeypatch.delenv("REVIEW_MAX_BATCH_DOCS", raising=False)
        monkeypatch.delenv("REVIEW_RATE_LIMIT_ENABLED", raising=False)

        from lumen_cortex.reviewer.config import ReviewConfig
        config = ReviewConfig.from_env()

        assert config.max_batch_docs == 25
        assert config.max_text_chars_per_doc == 200_000
        assert config.max_text_chars_total == 1_000_000
        assert config.rate_limit_enabled is False

    def test_config_from_env_custom_values(self, monkeypatch):
        """Config loads custom values from env vars."""
        monkeypatch.setenv("REVIEW_MAX_BATCH_DOCS", "10")
        monkeypatch.setenv("REVIEW_MAX_TEXT_CHARS_PER_DOC", "50000")
        monkeypatch.setenv("REVIEW_RATE_LIMIT_ENABLED", "true")
        monkeypatch.setenv("REVIEW_RATE_RPS", "5")

        from lumen_cortex.reviewer.config import ReviewConfig
        config = ReviewConfig.from_env()

        assert config.max_batch_docs == 10
        assert config.max_text_chars_per_doc == 50_000
        assert config.rate_limit_enabled is True
        assert config.rate_rps == 5.0
