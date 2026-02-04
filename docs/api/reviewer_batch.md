# Batch Reviewer API

The batch reviewer endpoint processes multiple clinical/regulatory documents in a single request,
extracting structured findings with traceability to source locations.

## Endpoint

```
POST /api/v1/reviewer/batch
```

### Request

**Headers:**

- `Content-Type: multipart/form-data`

**Form Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `program` | string | Yes | Program identifier (e.g., `TRIAL-001`) |
| `files` | file[] | Yes | PDF/DOCX documents to review |

### Response

**Status:** `200 OK`

```json
{
  "batch_id": "abc123-def456-...",
  "program": "TRIAL-001",
  "documents": [
    {
      "doc_id": "doc-uuid-1",
      "filename": "protocol_v1.pdf",
      "status": "success",
      "findings": [
        {
          "id": "finding-uuid",
          "category": "eligibility",
          "severity": "high",
          "text": "Age criterion missing upper bound",
          "location": { "page": 12, "paragraph": 3 },
          "suggestion": "Add maximum age limit"
        }
      ],
      "findings_count": 5,
      "findings_truncated": false,
      "processing_ms": 1234.5
    }
  ],
  "summary": {
    "total_documents": 2,
    "successful": 2,
    "failed": 0,
    "total_findings": 12,
    "batch_processing_ms": 3456.7
  }
}
```

### Document Status Values

| Status    | Description                           |
| --------- | ------------------------------------- |
| `success` | Document processed successfully       |
| `failed`  | Processing failed (see `error` field) |

### Failed Document Response

```json
{
  "doc_id": "doc-uuid-2",
  "filename": "corrupted.pdf",
  "status": "failed",
  "error": "Unable to extract text from PDF",
  "findings": [],
  "findings_count": 0,
  "findings_truncated": false,
  "processing_ms": 45.2
}
```

## Error Responses

### 413 Payload Too Large

Returned when request exceeds configured limits.

```json
{
  "error_code": "BATCH_SIZE_EXCEEDED",
  "detail": "Batch contains 30 files; max allowed is 25",
  "limit": 25,
  "observed": 30
}
```

**Error Codes:**
| Code | Description |
|------|-------------|
| `BATCH_SIZE_EXCEEDED` | Too many files in batch |
| `FILE_SIZE_EXCEEDED` | Single file exceeds max bytes |
| `TOTAL_SIZE_EXCEEDED` | Combined file size exceeds max |
| `TEXT_LENGTH_EXCEEDED` | Extracted text exceeds char limit |
| `TOTAL_TEXT_EXCEEDED` | Combined text exceeds char limit |

### 415 Unsupported Media Type

```json
{
  "detail": "Unsupported file type: .xlsx. Allowed: .pdf, .docx"
}
```

### 429 Too Many Requests

When rate limiting is enabled:

```json
{
  "detail": "Rate limit exceeded",
  "retry_after": 2.5
}
```

**Headers:**

- `Retry-After: 2.5` (seconds until next allowed request)

### 500 Internal Server Error

```json
{
  "detail": "Internal server error"
}
```

## Configuration

All limits are configurable via environment variables:

| Variable                        | Default             | Description                        |
| ------------------------------- | ------------------- | ---------------------------------- |
| `REVIEW_MAX_BATCH_DOCS`         | 25                  | Maximum documents per batch        |
| `REVIEW_MAX_TEXT_CHARS_PER_DOC` | 200,000             | Max characters per document        |
| `REVIEW_MAX_TEXT_CHARS_TOTAL`   | 1,000,000           | Max total characters in batch      |
| `REVIEW_MAX_FILE_BYTES`         | 26,214,400 (25MB)   | Max single file size               |
| `REVIEW_MAX_TOTAL_BYTES`        | 104,857,600 (100MB) | Max total upload size              |
| `REVIEW_MAX_FINDINGS_PER_DOC`   | 25                  | Max findings returned per doc      |
| `REVIEW_MAX_FINDINGS_PREVIEW`   | 10                  | Findings shown in truncated mode   |
| `REVIEW_RATE_LIMIT_ENABLED`     | false               | Enable per-program rate limiting   |
| `REVIEW_RATE_RPS`               | 2                   | Requests per second (when enabled) |
| `REVIEW_RATE_BURST`             | 5                   | Burst capacity for rate limiter    |

## Smoke Test

Quick validation script:

```bash
# Create test files
echo "Test protocol content" > /tmp/test.txt
mv /tmp/test.txt /tmp/test.pdf  # Fake PDF for smoke test

# Single file
curl -X POST http://localhost:8000/api/v1/reviewer/batch \
  -F "program=SMOKE-TEST" \
  -F "files=@/tmp/test.pdf"

# Multiple files
curl -X POST http://localhost:8000/api/v1/reviewer/batch \
  -F "program=SMOKE-TEST" \
  -F "files=@/tmp/test.pdf" \
  -F "files=@/tmp/test.pdf"
```

## Rate Limiting

When `REVIEW_RATE_LIMIT_ENABLED=true`, requests are throttled per-program using a token bucket algorithm:

- Each program gets an independent bucket
- Bucket starts with `REVIEW_RATE_BURST` tokens
- Tokens refill at `REVIEW_RATE_RPS` per second
- Each request consumes 1 token
- When empty, requests receive 429 with `Retry-After` header

This prevents any single program from monopolizing batch processing resources.

> **⚠️ Limitation: In-memory, single-process**
>
> Rate limit state is stored in process memory. Each worker/instance maintains independent buckets.
> This means:
>
> - Worker restarts reset all buckets
> - Multiple instances = no global enforcement
>
> **Future:** For multi-instance deployments, migrate to Redis-backed buckets or Postgres advisory locks.

## Determinism

The batch endpoint produces deterministic output when:

1. Same files are uploaded
2. `PYTHONHASHSEED=0` is set (for consistent dict ordering)
3. Underlying LLM responses are cached/mocked

This enables reliable integration testing and snapshot comparisons.

## Batch Worker (Async Processing)

For async batch requests, a separate worker process can be run to claim and process queued batches:

### Running the Worker

```bash
PYTHONPATH=. python -m lumen_cortex.reviewer.batch_worker \
  --program-id <UUID> \
  --worker-id worker-1 \
  --poll-interval 5 \
  --log-level INFO
```

**Environment Variables:**
- `BATCH_PERSISTENCE_ENABLED=true` - Enable batch persistence to Neon
- `DATABASE_URL=postgresql://...` - Database connection string
- `REVIEW_WORKER_ID` - Worker identifier (defaults to hostname)
- `REVIEW_BATCH_STALL_SECONDS=300` - Heartbeat timeout (5 minutes)
- `REVIEW_BATCH_MAX_ATTEMPTS=3` - Max retry attempts

### Worker Behavior

1. **Claim**: Atomically claims next queued batch (FIFO order)
2. **Process**: Processes documents with periodic heartbeats
3. **Finalize**: Updates batch status with summary statistics
4. **Repeat**: Polls for next batch after completion

### Heartbeat Mechanism

Workers send heartbeat updates every N documents to prevent stall detection:
- Default heartbeat interval: 2 documents
- Stall timeout: 300 seconds (configurable)
- Stalled batches are requeued automatically (up to max attempts)

### Admin Endpoints

**Sweep Stalled Batches:**
```bash
POST /review/batch/sweep
Headers:
  X-Admin-Token: <admin_token>
Body:
  { "program_id": "<UUID>" }
```

Returns:
```json
{
  "requeued": 2,
  "failed": 1,
  "requeued_ids": ["batch-1", "batch-2"],
  "failed_ids": ["batch-3"]
}
```

**Configuration:**
- `REVIEW_SWEEPER_ENABLED=true` - Enable sweeper endpoint
- `REVIEW_ADMIN_TOKEN=<secret>` - Admin authentication token
