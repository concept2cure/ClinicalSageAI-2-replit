# Shadow Interrogation Service

Adversarial AI simulation for regulatory IR (Information Request) prediction.

## Overview

The Shadow Interrogation Service connects to Neon Postgres (pgvector) and performs:

1. **Truth Grounding Checks**: Validates that prose fragments align with linked truth metrics
2. **Adversarial Simulations**: Predicts likely regulator questions using historical precedent similarity
3. **Audit Logging**: Maintains append-only records in `audit.concomitant_audit_logs` for 21 CFR Part 11 compliance

## Quick Start

```bash
# Install dependencies
cd shadow_service
pip install -e ".[dev]"

# Set environment variables
export DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
export EMBEDDING_DIM=1536

# Run the service
uvicorn shadow_service.main:app --reload --port 8001

# Or use the CLI entry point
shadow-service
```

## API Endpoints

### Fragments

- `POST /fragments` - Create a new prose fragment with optional embedding
- `GET /fragments/{fragment_id}` - Retrieve a fragment by ID

### Truth Store

- `POST /truth` - Insert a truth datapoint
- `GET /truth/{truth_id}` - Retrieve a truth datapoint

### Linking

- `POST /fragments/{fragment_id}/link-truth` - Link fragment to truth datapoints

### Shadow Interrogation

- `POST /shadow/interrogate/{fragment_id}` - Run adversarial simulation on a fragment
  - Computes drift between prose claims and truth values
  - Retrieves similar historical IR precedents
  - Logs audit record with risk assessment

## Response Schema

```json
{
  "fragment_id": "uuid",
  "risk_status": "ALIGNED | DATA_DRIFT | IR_PREDICTED",
  "drift_magnitude": 0.0,
  "predicted_questions": [
    {
      "question": "string",
      "similarity": 0.95,
      "precedent_id": "uuid",
      "agency": "FDA",
      "failure_mode": "Clinical Gap"
    }
  ],
  "truth_links_count": 3,
  "audit_log_id": "uuid"
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | Neon PostgreSQL connection string |
| `EMBEDDING_DIM` | No | 1536 | Vector embedding dimension |
| `EMBEDDING_MODEL` | No | - | Embedding model identifier |
| `OPENAI_API_KEY` | No | - | OpenAI API key for embeddings |
| `TOP_K_PRECEDENTS` | No | 5 | Number of precedents to retrieve |
| `LOG_LEVEL` | No | INFO | Logging level |

## Testing

```bash
# Run tests (requires database)
pytest -v -m db_required

# Run tests without database
pytest -v -m "not db_required"

# With coverage
pytest --cov=shadow_service --cov-report=html
```

## Compliance Notes

- All interrogation runs are logged to `audit.concomitant_audit_logs`
- Audit logs are append-only (UPDATE/DELETE blocked by database trigger)
- Agent identity is tracked for every operation
- Request IDs enable correlation with external systems
