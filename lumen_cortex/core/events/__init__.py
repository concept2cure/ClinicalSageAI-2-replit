"""
Event Store Models and Adapters for PR-D.

This module provides deterministic event emission to vault.rps_events
and vault.uuid_edges tables.
"""

from lumen_cortex.core.events.models import (
    RPSEvent,
    UUIDEdge,
    EventType,
    ReviewFindingsPayload,
    BatchCompletedPayload,
    BatchDocumentSummary,
    derive_submission_uuid,
    derive_review_event_id,
    derive_batch_id,
    derive_batch_event_id,
    compute_content_hash,
    deterministic_event_id,
)
from lumen_cortex.core.events.neon_adapter import (
    EventStoreAdapter,
)

__all__ = [
    "RPSEvent",
    "UUIDEdge",
    "EventType",
    "EventStoreAdapter",
    "ReviewFindingsPayload",
    "BatchCompletedPayload",
    "BatchDocumentSummary",
    "derive_submission_uuid",
    "derive_review_event_id",
    "derive_batch_id",
    "derive_batch_event_id",
    "compute_content_hash",
    "deterministic_event_id",
]
