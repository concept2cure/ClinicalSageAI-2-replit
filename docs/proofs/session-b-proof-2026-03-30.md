# Session B Proof — 2026-03-30

## What was implemented
1. Recon completed and documented in `docs/audits/session-b-infra-recon-2026-03-30.md`.
2. Upstream integration decision docs added for Tika, GROBID, Temporal, OpenSearch.
3. Tika-backed ingestion normalizer service added (`server/services/ingestion/tikaIngestionService.ts`) with feature flags + fallback.
4. GROBID literature extraction service added (`server/services/literature/grobidLiteratureService.ts`) with selective scholarly routing + fallback.
5. Literature ingest endpoint added (`POST /api/literature-review/ingest`) to route uploads through Tika + GROBID and optional OpenSearch indexing.
6. Temporal workflow spine boundary added (`server/services/workflows/temporal/temporalWorkflowSpine.ts`) and wired via compute endpoint (`POST /api/concept2cure/compute/projects/:projectId/governed-workflow-runs`) using existing `workflow_runs` persistence (no ad-hoc table creation).
7. OpenSearch adapter added (`server/services/search/opensearchAdapter.ts`) and evidence search route updated to prefer hybrid retrieval when enabled.
8. Docker compose updated with optional profile-based services for Tika, GROBID, OpenSearch, Temporal.
9. Session B env/setup doc added: `docs/integrations/session-b-env-setup.md`.
10. Basic integration guard tests added: `server/test/__tests__/sessionBIntegrations.test.ts`.
11. Firecrawl evidence ingest now dual-writes to OpenSearch indexing when persistence succeeds (`server/routes/firecrawl.ts`).
12. Temporal workflow inspection + transition endpoints added under compute route (`GET/POST governed-workflow-runs/:runId`).
13. OSS feature-flag registry now includes Session B toggles for Tika, GROBID, and OpenSearch adapters.

## Search comparison notes
- `server/routes/evidence-search.ts` now attempts OpenSearch hybrid retrieval first when `organizationId` is available.
- Added `GET /api/evidence-search/search-compare` as a comparison harness returning hybrid vs baseline semantic result sets.
- If OpenSearch is disabled/unavailable, route falls back to existing semantic search and then DB text fallback.

## Workflow proof notes
- New workflow spine persists run state into existing `workflow_runs` and supports transition logging in metadata.
- Feature-gated engine marker:
  - `temporal-bridge` when `OSS_WORKFLOW_TEMPORAL_ENABLED=true`
  - `legacy-db-fallback` when disabled

## Validation command list
1. `npm run typecheck` → failed in this environment due missing type packages in node_modules.
2. `npx vitest run server/test/__tests__/sessionBIntegrations.test.ts` → failed because npm registry access is blocked (`403`) in this environment.

## Exact files changed
- `docker-compose.yml`
- `docs/audits/session-b-infra-recon-2026-03-30.md`
- `docs/integrations/tika-decision.md`
- `docs/integrations/grobid-decision.md`
- `docs/integrations/temporal-decision.md`
- `docs/integrations/opensearch-decision.md`
- `docs/integrations/session-b-env-setup.md`
- `docs/proofs/session-b-proof-2026-03-30.md`
- `server/config/ossStackFeatureFlags.ts`
- `server/routes/compute.ts`
- `server/routes/evidence-search.ts`
- `server/routes/firecrawl.ts`
- `server/routes/knowledge-base.ts`
- `server/routes/literature-review.ts`
- `server/services/ingestion/tikaIngestionService.ts`
- `server/services/literature/grobidLiteratureService.ts`
- `server/services/search/opensearchAdapter.ts`
- `server/services/workflows/temporal/temporalWorkflowSpine.ts`
- `server/test/__tests__/sessionBIntegrations.test.ts`
