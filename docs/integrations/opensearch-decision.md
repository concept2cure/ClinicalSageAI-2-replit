# OpenSearch Integration Decision

Checked upstream docs on 2026-03-31:
- https://docs.opensearch.org/
- https://docs.opensearch.org/latest/search-plugins/semantic-search/
- https://docs.opensearch.org/latest/vector-search/
- https://docs.opensearch.org/latest/search-plugins/hybrid-search/

## Required runtime(s)
- OpenSearch node/cluster.
- Optional vector/hybrid plugins enabled per deployment profile.
- Node app uses REST API.

## Docker service required?
- **Local dev**: recommended for reproducibility.
- **Production**: managed or self-hosted cluster.

## Required env vars
- `OPENSEARCH_ENABLED` (default `false`)
- `OPENSEARCH_BASE_URL` (e.g. `http://localhost:9200`)
- `OPENSEARCH_INDEX` (default `concept2cure-documents`)
- Optional `OPENSEARCH_API_KEY`

## Expected local dev impact
- Extra service + index bootstrap step.
- Dual-write mode allows side-by-side comparison with existing pgvector paths.

## Expected production topology
- OpenSearch cluster with index templates and ILM strategy.
- Write from app-layer persistence events; query via scoped filters (`organizationId`, `projectId`, artifact/doc metadata).

## Fit for this repo
- Implement as integration layer, not immediate replacement of pgvector.
- Start with evidence/doc/literature objects in dual-write mode.
- Add comparison harness in evidence search route and keep fallback to current semantic/basic path.
