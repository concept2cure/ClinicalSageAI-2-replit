# OpenSearch Integration Decision

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
