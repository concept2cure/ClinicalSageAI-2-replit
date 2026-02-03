"""
PR-D Event Store Models.

Deterministic Pydantic models for rps_events and uuid_edges.
All event_ids are uuid5-based for reproducibility.

Version: 1.0.0 (frozen)
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid5, NAMESPACE_URL

from pydantic import BaseModel, Field, ConfigDict


class EventType(str, Enum):
    """Event types for the RPS event store."""

    # Document lifecycle events
    DOCUMENT_CREATED = "document.created"
    DOCUMENT_UPDATED = "document.updated"
    DOCUMENT_DELETED = "document.deleted"

    # Anchor events
    ANCHOR_CREATED = "anchor.created"
    ANCHOR_UPDATED = "anchor.updated"

    # Cross-reference events
    XREF_CREATED = "xref.created"
    XREF_VALIDATED = "xref.validated"
    XREF_BROKEN = "xref.broken"

    # Edge events (graph)
    EDGE_CREATED = "edge.created"
    EDGE_DELETED = "edge.deleted"

    # Review events
    REVIEW_STARTED = "review.started"
    REVIEW_COMPLETED = "review.completed"
    REVIEW_FINDINGS_CREATED = "review.findings_created"

    # Submission events
    SUBMISSION_CREATED = "submission.created"
    SUBMISSION_VALIDATED = "submission.validated"


class EdgeType(str, Enum):
    """Edge types for uuid_edges adjacency table."""

    REFERENCES = "references"
    CONTAINS = "contains"
    DERIVED_FROM = "derived_from"
    REPLACES = "replaces"
    RELATED_TO = "related_to"


def deterministic_event_id(
    program_id: UUID,
    submission_uuid: UUID,
    content_hash: str,
    event_type: str,
    ordinal: int = 0,
) -> UUID:
    """
    Generate a deterministic event_id using uuid5.

    Formula: uuid5(NAMESPACE_URL, f"{program_id}|{submission_uuid}|{content_hash}|{event_type}|{ordinal}")

    This ensures the same inputs always produce the same event_id,
    enabling idempotent event insertion and deterministic testing.
    """
    seed = f"{program_id}|{submission_uuid}|{content_hash}|{event_type}|{ordinal}"
    return uuid5(NAMESPACE_URL, seed)


def compute_content_hash(data: Dict[str, Any]) -> str:
    """
    Compute a deterministic SHA-256 hash of event payload.

    Keys are sorted to ensure consistent ordering.
    """
    import json
    serialized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


class RPSEvent(BaseModel):
    """
    Event record for vault.rps_events.

    Append-only event log with deterministic event_id generation.
    """

    model_config = ConfigDict(frozen=True)

    event_id: UUID = Field(
        description="Deterministic UUID5-based event identifier"
    )
    program_id: UUID = Field(
        description="Program/tenant isolation key"
    )
    submission_uuid: UUID = Field(
        description="Submission this event belongs to"
    )
    event_type: EventType = Field(
        description="Type of event (e.g., review.findings_created)"
    )
    event_timestamp: datetime = Field(
        description="When the event occurred (UTC)"
    )
    actor_id: Optional[str] = Field(
        default=None,
        description="User or system that triggered the event"
    )
    content_hash: str = Field(
        description="SHA-256 hash of event payload for deduplication"
    )
    payload: Dict[str, Any] = Field(
        default_factory=dict,
        description="Event-specific data"
    )
    ordinal: int = Field(
        default=0,
        description="Sequence number for events with same content_hash"
    )

    @classmethod
    def create(
        cls,
        program_id: UUID,
        submission_uuid: UUID,
        event_type: EventType,
        payload: Dict[str, Any],
        event_timestamp: datetime,
        actor_id: Optional[str] = None,
        ordinal: int = 0,
    ) -> "RPSEvent":
        """
        Factory method to create an RPSEvent with deterministic event_id.
        """
        content_hash = compute_content_hash(payload)
        event_id = deterministic_event_id(
            program_id=program_id,
            submission_uuid=submission_uuid,
            content_hash=content_hash,
            event_type=event_type.value,
            ordinal=ordinal,
        )
        return cls(
            event_id=event_id,
            program_id=program_id,
            submission_uuid=submission_uuid,
            event_type=event_type,
            event_timestamp=event_timestamp,
            actor_id=actor_id,
            content_hash=content_hash,
            payload=payload,
            ordinal=ordinal,
        )

    def to_db_row(self) -> Dict[str, Any]:
        """Convert to database row format."""
        return {
            "event_id": str(self.event_id),
            "program_id": str(self.program_id),
            "submission_uuid": str(self.submission_uuid),
            "event_type": self.event_type.value,
            "event_timestamp": self.event_timestamp.isoformat(),
            "actor_id": self.actor_id,
            "content_hash": self.content_hash,
            "payload": self.payload,
            "ordinal": self.ordinal,
        }


class UUIDEdge(BaseModel):
    """
    Edge record for vault.uuid_edges adjacency table.

    Represents directed relationships between UUIDs in the graph.
    """

    model_config = ConfigDict(frozen=True)

    edge_id: UUID = Field(
        description="Deterministic UUID5-based edge identifier"
    )
    program_id: UUID = Field(
        description="Program/tenant isolation key"
    )
    source_uuid: UUID = Field(
        description="Source node UUID"
    )
    target_uuid: UUID = Field(
        description="Target node UUID"
    )
    edge_type: EdgeType = Field(
        description="Type of relationship"
    )
    created_at: datetime = Field(
        description="When the edge was created (UTC)"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Edge-specific metadata"
    )

    @classmethod
    def create(
        cls,
        program_id: UUID,
        source_uuid: UUID,
        target_uuid: UUID,
        edge_type: EdgeType,
        created_at: datetime,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "UUIDEdge":
        """
        Factory method to create a UUIDEdge with deterministic edge_id.
        """
        # Deterministic edge_id based on source, target, and type
        seed = f"{program_id}|{source_uuid}|{target_uuid}|{edge_type.value}"
        edge_id = uuid5(NAMESPACE_URL, seed)

        return cls(
            edge_id=edge_id,
            program_id=program_id,
            source_uuid=source_uuid,
            target_uuid=target_uuid,
            edge_type=edge_type,
            created_at=created_at,
            metadata=metadata or {},
        )

    def to_db_row(self) -> Dict[str, Any]:
        """Convert to database row format."""
        return {
            "edge_id": str(self.edge_id),
            "program_id": str(self.program_id),
            "source_uuid": str(self.source_uuid),
            "target_uuid": str(self.target_uuid),
            "edge_type": self.edge_type.value,
            "created_at": self.created_at.isoformat(),
            "metadata": self.metadata,
        }


class ReviewFindingsPayload(BaseModel):
    """
    Typed payload for review.findings_created events.
    """

    model_config = ConfigDict(frozen=True)

    document_id: str = Field(description="Document that was reviewed")
    rule_ids: List[str] = Field(description="Rules that were executed")
    finding_count: int = Field(description="Total findings generated")
    findings_by_severity: Dict[str, int] = Field(
        default_factory=dict,
        description="Count of findings by severity level"
    )
    fingerprints: List[str] = Field(
        default_factory=list,
        description="SHA-256 fingerprints of each finding"
    )
    registry_version: str = Field(
        description="Version of the rule registry used"
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for event payload."""
        return {
            "document_id": self.document_id,
            "rule_ids": self.rule_ids,
            "finding_count": self.finding_count,
            "findings_by_severity": self.findings_by_severity,
            "fingerprints": self.fingerprints,
            "registry_version": self.registry_version,
        }
