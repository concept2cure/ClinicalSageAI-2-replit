"""
PR-D Event Store Neon Adapter.

Writes events to vault.rps_events and vault.uuid_edges.
Does NOT create pools - accepts connection from caller.

Version: 1.0.0
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Protocol
from uuid import UUID

from lumen_cortex.core.events.models import (
    RPSEvent,
    UUIDEdge,
    EventType,
    EdgeType,
    ReviewFindingsPayload,
)


class ConnectionProtocol(Protocol):
    """Protocol for database connection (asyncpg or psycopg2 style)."""

    def execute(self, query: str, *args: Any) -> Any:
        ...

    def executemany(self, query: str, args: List[Any]) -> Any:
        ...


class EventStoreAdapter:
    """
    Adapter for writing to vault.rps_events and vault.uuid_edges.

    This adapter does NOT create database pools. It accepts
    a connection factory or connection object from the caller.

    Usage:
        async with pool.acquire() as conn:
            adapter = EventStoreAdapter(conn)
            await adapter.emit_event(event)
    """

    # SQL for inserting events (ON CONFLICT DO NOTHING for idempotency)
    INSERT_EVENT_SQL = """
        INSERT INTO vault.rps_events (
            event_id, program_id, submission_uuid, event_type,
            event_timestamp, actor_id, content_hash, payload, ordinal
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (event_id) DO NOTHING
    """

    INSERT_EDGE_SQL = """
        INSERT INTO vault.uuid_edges (
            edge_id, program_id, source_uuid, target_uuid,
            edge_type, created_at, metadata
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (edge_id) DO NOTHING
    """

    def __init__(
        self,
        execute_fn: Optional[Callable[[str, tuple], Any]] = None,
    ):
        """
        Initialize adapter with an execute function.

        Args:
            execute_fn: Function that executes SQL with parameters.
                       Signature: execute_fn(sql: str, params: tuple) -> Any
        """
        self._execute_fn = execute_fn
        self._pending_events: List[RPSEvent] = []
        self._pending_edges: List[UUIDEdge] = []

    def queue_event(self, event: RPSEvent) -> None:
        """Queue an event for batch insertion."""
        self._pending_events.append(event)

    def queue_edge(self, edge: UUIDEdge) -> None:
        """Queue an edge for batch insertion."""
        self._pending_edges.append(edge)

    def get_pending_events(self) -> List[RPSEvent]:
        """Get list of pending events (for testing)."""
        return list(self._pending_events)

    def get_pending_edges(self) -> List[UUIDEdge]:
        """Get list of pending edges (for testing)."""
        return list(self._pending_edges)

    def clear_pending(self) -> None:
        """Clear pending events and edges."""
        self._pending_events.clear()
        self._pending_edges.clear()

    async def flush_async(self) -> Dict[str, int]:
        """
        Flush pending events and edges to database (async version).

        Returns:
            Dict with counts of inserted events and edges
        """
        if not self._execute_fn:
            raise RuntimeError("No execute function configured")

        events_inserted = 0
        edges_inserted = 0

        # Insert events
        for event in self._pending_events:
            row = event.to_db_row()
            params = (
                row["event_id"],
                row["program_id"],
                row["submission_uuid"],
                row["event_type"],
                row["event_timestamp"],
                row["actor_id"],
                row["content_hash"],
                row["payload"],
                row["ordinal"],
            )
            await self._execute_fn(self.INSERT_EVENT_SQL, params)
            events_inserted += 1

        # Insert edges
        for edge in self._pending_edges:
            row = edge.to_db_row()
            params = (
                row["edge_id"],
                row["program_id"],
                row["source_uuid"],
                row["target_uuid"],
                row["edge_type"],
                row["created_at"],
                row["metadata"],
            )
            await self._execute_fn(self.INSERT_EDGE_SQL, params)
            edges_inserted += 1

        self.clear_pending()

        return {
            "events_inserted": events_inserted,
            "edges_inserted": edges_inserted,
        }

    def flush_sync(self) -> Dict[str, int]:
        """
        Flush pending events and edges to database (sync version).

        Returns:
            Dict with counts of inserted events and edges
        """
        if not self._execute_fn:
            raise RuntimeError("No execute function configured")

        events_inserted = 0
        edges_inserted = 0

        # Insert events
        for event in self._pending_events:
            row = event.to_db_row()
            params = (
                row["event_id"],
                row["program_id"],
                row["submission_uuid"],
                row["event_type"],
                row["event_timestamp"],
                row["actor_id"],
                row["content_hash"],
                row["payload"],
                row["ordinal"],
            )
            self._execute_fn(self.INSERT_EVENT_SQL, params)
            events_inserted += 1

        # Insert edges
        for edge in self._pending_edges:
            row = edge.to_db_row()
            params = (
                row["edge_id"],
                row["program_id"],
                row["source_uuid"],
                row["target_uuid"],
                row["edge_type"],
                row["created_at"],
                row["metadata"],
            )
            self._execute_fn(self.INSERT_EDGE_SQL, params)
            edges_inserted += 1

        self.clear_pending()

        return {
            "events_inserted": events_inserted,
            "edges_inserted": edges_inserted,
        }


def create_review_findings_event(
    program_id: UUID,
    submission_uuid: UUID,
    document_id: str,
    rule_ids: List[str],
    finding_count: int,
    findings_by_severity: Dict[str, int],
    fingerprints: List[str],
    registry_version: str,
    event_timestamp: datetime,
    actor_id: Optional[str] = None,
) -> RPSEvent:
    """
    Factory function to create a review.findings_created event.

    This is the primary event emitted by Phase 3 Shadow Reviewer.
    """
    payload = ReviewFindingsPayload(
        document_id=document_id,
        rule_ids=rule_ids,
        finding_count=finding_count,
        findings_by_severity=findings_by_severity,
        fingerprints=fingerprints,
        registry_version=registry_version,
    )

    return RPSEvent.create(
        program_id=program_id,
        submission_uuid=submission_uuid,
        event_type=EventType.REVIEW_FINDINGS_CREATED,
        payload=payload.to_dict(),
        event_timestamp=event_timestamp,
        actor_id=actor_id,
    )


def create_edge_from_xref(
    program_id: UUID,
    source_doc_uuid: UUID,
    target_anchor_uuid: UUID,
    created_at: datetime,
    xref_metadata: Optional[Dict[str, Any]] = None,
) -> UUIDEdge:
    """
    Factory function to create a REFERENCES edge from a cross-reference.

    This is used by Phase 2 graph layer to write uuid_edges.
    """
    return UUIDEdge.create(
        program_id=program_id,
        source_uuid=source_doc_uuid,
        target_uuid=target_anchor_uuid,
        edge_type=EdgeType.REFERENCES,
        created_at=created_at,
        metadata=xref_metadata or {},
    )
