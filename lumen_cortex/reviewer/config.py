"""
Reviewer Configuration - A7-4 Hardening

Centralized configuration for batch review limits and rate limiting.
All values are env-overridable for production tuning.

Usage:
    from lumen_cortex.reviewer.config import ReviewConfig
    config = ReviewConfig()
    if len(docs) > config.max_batch_docs:
        raise HTTPException(413, ...)
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_int(key: str, default: int) -> int:
    """Get integer from env var or default."""
    val = os.environ.get(key)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


def _env_bool(key: str, default: bool) -> bool:
    """Get boolean from env var or default."""
    val = os.environ.get(key, "").lower()
    if val in ("1", "true", "yes", "on"):
        return True
    if val in ("0", "false", "no", "off"):
        return False
    return default


@dataclass(frozen=True)
class ReviewConfig:
    """
    Immutable configuration for batch review limits.

    All values can be overridden via environment variables:
    - REVIEW_MAX_BATCH_DOCS
    - REVIEW_MAX_TEXT_CHARS_PER_DOC
    - REVIEW_MAX_TEXT_CHARS_TOTAL
    - REVIEW_MAX_FILE_BYTES
    - REVIEW_MAX_TOTAL_BYTES
    - REVIEW_MAX_FINDINGS_PER_DOC
    - REVIEW_MAX_FINDINGS_PREVIEW
    - REVIEW_RATE_LIMIT_ENABLED
    - REVIEW_RATE_RPS
    - REVIEW_RATE_BURST
    """

    # Batch document limits
    max_batch_docs: int = 25
    max_text_chars_per_doc: int = 200_000
    max_text_chars_total: int = 1_000_000

    # File upload limits (bytes)
    max_file_bytes: int = 25 * 1024 * 1024  # 25 MB
    max_total_bytes: int = 100 * 1024 * 1024  # 100 MB

    # Findings limits
    max_findings_per_doc: int = 25
    max_findings_preview: int = 10

    # Rate limiting
    rate_limit_enabled: bool = False
    rate_rps: float = 2.0
    rate_burst: int = 5

    @classmethod
    def from_env(cls) -> "ReviewConfig":
        """
        Create config from environment variables.

        Environment variables:
        - REVIEW_MAX_BATCH_DOCS (default: 25)
        - REVIEW_MAX_TEXT_CHARS_PER_DOC (default: 200000)
        - REVIEW_MAX_TEXT_CHARS_TOTAL (default: 1000000)
        - REVIEW_MAX_FILE_BYTES (default: 26214400)
        - REVIEW_MAX_TOTAL_BYTES (default: 104857600)
        - REVIEW_MAX_FINDINGS_PER_DOC (default: 25)
        - REVIEW_MAX_FINDINGS_PREVIEW (default: 10)
        - REVIEW_RATE_LIMIT_ENABLED (default: false)
        - REVIEW_RATE_RPS (default: 2)
        - REVIEW_RATE_BURST (default: 5)
        """
        return cls(
            max_batch_docs=_env_int("REVIEW_MAX_BATCH_DOCS", 25),
            max_text_chars_per_doc=_env_int("REVIEW_MAX_TEXT_CHARS_PER_DOC", 200_000),
            max_text_chars_total=_env_int("REVIEW_MAX_TEXT_CHARS_TOTAL", 1_000_000),
            max_file_bytes=_env_int("REVIEW_MAX_FILE_BYTES", 25 * 1024 * 1024),
            max_total_bytes=_env_int("REVIEW_MAX_TOTAL_BYTES", 100 * 1024 * 1024),
            max_findings_per_doc=_env_int("REVIEW_MAX_FINDINGS_PER_DOC", 25),
            max_findings_preview=_env_int("REVIEW_MAX_FINDINGS_PREVIEW", 10),
            rate_limit_enabled=_env_bool("REVIEW_RATE_LIMIT_ENABLED", False),
            rate_rps=float(_env_int("REVIEW_RATE_RPS", 2)),
            rate_burst=_env_int("REVIEW_RATE_BURST", 5),
        )


# Global config instance (loaded from env at import time)
REVIEW_CONFIG = ReviewConfig.from_env()


@dataclass(frozen=True)
class LimitViolation:
    """Structured error for limit violations."""

    error_code: str
    detail: str
    limit: int
    observed: int

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            "error_code": self.error_code,
            "detail": self.detail,
            "limit": self.limit,
            "observed": self.observed,
        }
