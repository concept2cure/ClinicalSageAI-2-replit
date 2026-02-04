# Reviewer Events

The batch reviewer emits structured events to an event store for audit logging,
downstream processing, and analytics integration.

## Event Store Interface

Events are persisted via the `EventStore` interface:

```python
class EventStore(Protocol):
    async def emit(self, event_type: str, payload: dict) -> None:
        """Emit an event to the store."""
        ...
```

The default implementation uses PostgreSQL (Neon) with async connection pooling.

## Event Types

### `findings_created`

Emitted for each document that successfully produces findings.

**Payload:**

```json
{
  "batch_id": "abc123-def456-...",
  "program": "TRIAL-001",
  "doc_id": "doc-uuid-1",
  "filename": "protocol_v1.pdf",
  "findings_count": 5,
  "timestamp": "2025-01-24T10:30:00Z"
}
```

**Trigger:** Document processed successfully with `status: success`

**Use Cases:**

- Count findings per program over time
- Trigger downstream review workflows
- Populate analytics dashboards

### `document_failed`

Emitted when document processing fails.

**Payload:**

```json
{
  "batch_id": "abc123-def456-...",
  "program": "TRIAL-001",
  "doc_id": "doc-uuid-2",
  "filename": "corrupted.pdf",
  "error": "Unable to extract text from PDF",
  "timestamp": "2025-01-24T10:30:01Z"
}
```

**Trigger:** Document processing throws exception or returns `status: failed`

**Use Cases:**

- Alert on document processing failures
- Track problematic file patterns
- Debug ingestion issues

### `batch_completed`

Emitted once when the entire batch finishes processing.

**Payload:**

```json
{
  "batch_id": "abc123-def456-...",
  "program": "TRIAL-001",
  "total_documents": 5,
  "successful": 4,
  "failed": 1,
  "total_findings": 23,
  "batch_processing_ms": 4567.8,
  "timestamp": "2025-01-24T10:30:05Z"
}
```

**Trigger:** After all documents in batch are processed

**Use Cases:**

- Track batch throughput and latency
- Aggregate success rates by program
- Trigger batch-level notifications

## Event Ordering

Events are emitted in this order:

1. `findings_created` (per successful doc, in processing order)
2. `document_failed` (per failed doc, in processing order)
3. `batch_completed` (once, after all docs)

Within a batch, document events maintain submission order.

## Testing Events

Use the `CapturingEventStore` pattern for integration tests:

```python
class CapturingEventStore:
    """Event store that captures events for test assertions."""

    def __init__(self):
        self.events: list[tuple[str, dict]] = []

    async def emit(self, event_type: str, payload: dict) -> None:
        self.events.append((event_type, payload))
```

**Test Example:**

```python
async def test_batch_emits_events():
    store = CapturingEventStore()
    # ... run batch with store ...

    assert len(store.events) == 3  # 2 findings + 1 completed
    assert store.events[0][0] == "findings_created"
    assert store.events[-1][0] == "batch_completed"
```

## Schema Evolution

Event payloads may gain new fields over time. Consumers should:

1. Ignore unknown fields (forward compatibility)
2. Use defaults for missing optional fields (backward compatibility)
3. Never remove required fields without versioning

Current required fields per event type:

| Event              | Required Fields                                                  |
| ------------------ | ---------------------------------------------------------------- |
| `findings_created` | `batch_id`, `program`, `doc_id`, `filename`, `findings_count`    |
| `document_failed`  | `batch_id`, `program`, `doc_id`, `filename`, `error`             |
| `batch_completed`  | `batch_id`, `program`, `total_documents`, `successful`, `failed` |

## Database Schema

The event store table (PostgreSQL/Neon):

```sql
CREATE TABLE IF NOT EXISTS reviewer_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    batch_id UUID,
    program VARCHAR(100)
);

CREATE INDEX idx_reviewer_events_batch ON reviewer_events(batch_id);
CREATE INDEX idx_reviewer_events_program ON reviewer_events(program);
CREATE INDEX idx_reviewer_events_type ON reviewer_events(event_type);
```

## Querying Events

**Get all events for a batch:**

```sql
SELECT * FROM reviewer_events
WHERE batch_id = 'abc123-...'
ORDER BY created_at;
```

**Count findings by program (last 7 days):**

```sql
SELECT
    program,
    SUM((payload->>'findings_count')::int) as total_findings
FROM reviewer_events
WHERE event_type = 'findings_created'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY program;
```

**Failed document rate:**

```sql
SELECT
    program,
    COUNT(*) FILTER (WHERE event_type = 'document_failed') as failed,
    COUNT(*) FILTER (WHERE event_type = 'findings_created') as succeeded
FROM reviewer_events
WHERE event_type IN ('findings_created', 'document_failed')
GROUP BY program;
```
