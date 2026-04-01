<<<<<<< HEAD
# Session B Env + Setup

## New environment variables
- `TIKA_ENABLED` (default `false`)
- `OSS_INGESTION_TIKA_ENABLED` (default `false`, OSS feature registry toggle)
- `TIKA_BASE_URL` (default `http://localhost:9998`)
- `TIKA_TIMEOUT_MS` (default `20000`)
- `GROBID_ENABLED` (default `false`)
- `OSS_INGESTION_GROBID_ENABLED` (default `false`, OSS feature registry toggle)
- `GROBID_BASE_URL` (default `http://localhost:8071`)
- `GROBID_TIMEOUT_MS` (default `30000`)
- `OSS_WORKFLOW_TEMPORAL_ENABLED` (default `false`)
- `TEMPORAL_ADDRESS` (planned; default `localhost:7233`)
- `TEMPORAL_NAMESPACE` (planned)
- `TEMPORAL_TASK_QUEUE` (planned)
- `OPENSEARCH_ENABLED` (default `false`)
- `OSS_RETRIEVAL_OPENSEARCH_ENABLED` (default `false`, OSS feature registry toggle)
- `OPENSEARCH_BASE_URL` (default `http://localhost:9200`)
- `OPENSEARCH_INDEX_NAME` (default `concept2cure_objects_v1`)

## Compose profiles
- `ingestion-spine` -> Tika + GROBID
- `search-spine` -> OpenSearch
- `workflow-spine` -> Temporal server + temporal-postgres

## Local run examples
```bash
# baseline app only
npm run dev

# enable ingestion services
docker compose --profile ingestion-spine up -d tika grobid

# enable search service
docker compose --profile search-spine up -d opensearch
```

## Degraded mode
- With all flags disabled, app keeps legacy parsing/search paths.
- Missing services should not prevent app startup.
=======
# Session B Env + Setup Notes

## Feature flags (all default off)
- `TIKA_ENABLED=false`
- `TIKA_BASE_URL=http://localhost:9998`
- `GROBID_ENABLED=false`
- `GROBID_BASE_URL=http://localhost:8070`
- `TEMPORAL_ENABLED=false`
- `TEMPORAL_ADDRESS=localhost:7233`
- `TEMPORAL_NAMESPACE=default`
- `TEMPORAL_TASK_QUEUE=concept2cure-governed`
- `OPENSEARCH_ENABLED=false`
- `OPENSEARCH_BASE_URL=http://localhost:9200`
- `OPENSEARCH_INDEX=concept2cure-documents`

## Optional local startup
```bash
docker compose --profile session-b up -d tika grobid opensearch temporal
```

## Degraded mode
- If flags remain disabled, existing parsers, job paths, and pgvector search stay active.
- New integrations are additive and non-blocking.

## Dev verification snippets
```bash
curl -s http://localhost:9998/tika
curl -s http://localhost:8070/api/isalive
curl -s http://localhost:9200
nc -zv localhost 7233
```
>>>>>>> origin/codex/complete-integration-recon-for-session-b
