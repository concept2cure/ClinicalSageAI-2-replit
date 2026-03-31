# Session B Proof Notes (2026-03-30)

## What was implemented
1. **Tika integration path**
   - Added `server/services/ingestion/tikaClient.ts`.
   - Wired into evidence upload and knowledge-base autodraft upload with fallback behavior.
2. **GROBID integration path**
   - Added `server/services/literature/grobidClient.ts`.
   - Added selective scholarly detection + structured extraction attachment in evidence/knowledge flows.
3. **Temporal integration path**
   - Added `server/services/workflow/temporalBridge.ts`.
   - Added compute route endpoint to start governed workflows with feature-gated temporal transport, idempotency-key reuse, and durable local fallback completion states.
4. **OpenSearch integration path**
   - Added `server/services/search/opensearchClient.ts`.
   - Dual-write indexing from firecrawl and evidence/knowledge upload paths.
   - Added evidence search path that attempts OpenSearch hybrid query first, then existing semantic/basic fallback.
5. **Runtime wiring**
   - Added optional compose profile services for Tika, GROBID, OpenSearch, and Temporal.
   - Added env/setup notes in `docs/integrations/session-b-env-setup.md`.

## Search comparison notes
- Evidence search route now executes an OpenSearch attempt first when enabled and org-scoped.
- If unavailable/disabled, it preserves existing semantic and relational fallback.
- This allows side-by-side behavior without cutting over from pgvector.

## Workflow proof notes
- New compute workflow endpoint (`/api/compute/projects/:projectId/workflows`) starts a governed workflow record.
- With Temporal disabled, execution runs through local fallback with retry attempts and explicit completed/failed status transitions in DB job + attempt records.
- With Temporal enabled and SDK available, workflow start is routed to Temporal client/task queue.

## Validation commands run
- `npm run -s typecheck`  
  - Result: failed in this environment due missing ambient type packages (`@types/node`, `@types/react`, etc.) in current install context.

## Exact files changed
- `server/services/ingestion/tikaClient.ts`
- `server/services/literature/grobidClient.ts`
- `server/services/search/opensearchClient.ts`
- `server/services/workflow/temporalBridge.ts`
- `server/routes/evidence-management.routes.ts`
- `server/routes/knowledge-base.ts`
- `server/routes/firecrawl.ts`
- `server/routes/evidence-search.ts`
- `server/routes/compute.ts`
- `docker-compose.yml`
- `docs/audits/session-b-infra-recon-2026-03-30.md`
- `docs/integrations/tika-decision.md`
- `docs/integrations/grobid-decision.md`
- `docs/integrations/temporal-decision.md`
- `docs/integrations/opensearch-decision.md`
- `docs/integrations/session-b-env-setup.md`
- `docs/proofs/session-b-proof-2026-03-30.md`
