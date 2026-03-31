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
