# OpenSearch Integration Decision

<<<<<<< HEAD
## Upstream references checked
- Docker install/deploy docs: https://docs.opensearch.org/latest/install-and-configure/install-opensearch/docker/
- k-NN vector field mapping docs: https://docs.opensearch.org/latest/field-types/supported-field-types/knn-vector/
- Hybrid search docs: https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/

## Required runtime(s)
- OpenSearch node(s) with k-NN/vector support enabled.

## Docker required?
- **Local dev:** recommended single-node profile.
- **Production:** dedicated OpenSearch cluster/service.

## Required env vars
- `OPENSEARCH_ENABLED`
- `OPENSEARCH_BASE_URL`
- `OPENSEARCH_INDEX_NAME`

## Local dev impact
- Optional search-spine profile; app should run with OpenSearch disabled.
- Dual-write mode preserves existing pgvector/SQL retrieval while comparing quality.

## Expected production topology
- OpenSearch cluster with tenant-aware indexes/aliases.
- App indexes platform objects (documents/evidence/literature/artifacts) with org/project scoping fields.

## Fit for this repo
- Introduce adapter layer and hybrid query path for evidence/document/literature retrieval.
- Keep pgvector as fallback until parity/quality thresholds are validated.
=======
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
>>>>>>> origin/codex/complete-integration-recon-for-session-b
