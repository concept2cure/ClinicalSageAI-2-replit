"""Storage layer models for batch persistence."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class BatchRow:
    """Database row representation for vault.review_batches."""

    batch_id: str
    program_id: str
    status: str  # queued | running | completed | failed
    mode: str  # sync | async
    ruleset_version: str
    extractor_version: str
    response_mode: str  # summary | full
    request_digest: str
    documents_total: int
    created_at: datetime | None = None
    idempotency_key: str | None = None
    documents_succeeded: int = 0
    documents_failed: int = 0
    findings_total: int = 0
    by_severity: dict[str, int] = field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    locked_at: datetime | None = None
    heartbeat_at: datetime | None = None
    attempts: int = 0
    last_error: str | None = None
    error_summary: list[dict[str, Any]] = field(default_factory=list)

    # Property aliases for worker API compatibility
    @property
    def docs_total(self) -> int:
        """Alias for documents_total (worker API compatibility)."""
        return self.documents_total

    @property
    def attempt_count(self) -> int:
        """Alias for attempts (worker API compatibility)."""
        return self.attempts


@dataclass
class DocRow:
    """Database row representation for vault.review_batch_docs."""

    batch_id: str
    doc_id: str
    program_id: str
    content_hash: str
    status: str  # succeeded | failed
    filename: str | None = None
    errors: list[dict[str, Any]] = field(default_factory=list)
    findings_count: int = 0
    findings_digest: str = "0" * 64
    findings_preview: list[dict[str, Any]] = field(default_factory=list)
    created_at: datetime | None = None


@dataclass
class BatchInputRow:
    """Database row representation for vault.review_batch_inputs."""

    program_id: str
    batch_id: str
    seq: int
    filename: str | None = None
    source_type: str = "text"
    doc_id: str = ""
    content_hash: str = ""
    text_content: str = ""
    created_at: datetime | None = None


@dataclass
class BatchSummaryUpdate:
    """Summary data for finalizing a batch."""

    documents_succeeded: int
    documents_failed: int
    findings_total: int
    by_severity: dict[str, int]
    error_summary: list[dict[str, Any]] = field(default_factory=list)
