# OSS Stack Repo Truth Reconciliation

_Last reconciled: 2026-03-27 (UTC)_

## 1) Repo truth pass (what code exists today)

### Runtime and stack constraints (verified)
- App runtime is Node/TypeScript/Express/Vite, with engines pinned to Node `>=20` and npm `>=10`.
- Existing validation commands are present and already used in CI/local workflows:
  - `npm run typecheck`
  - `npm test`
  - `npm run test:ana`

### Governed export and no-break surfaces (verified)
- `server/services/export/governedExportConsequence.ts` is the core governed export consequence writer and provenance/audit bridge; this is a strict no-go for breaking changes.
- `server/routes/510k-estar-routes.ts` routes export output through `createGovernedExportConsequence` and enforces org/user context + attachment bounds.
- `server/routes/cerv2-export-routes.ts` applies human-review gating and governed export persistence for PDF/DOCX/ZIP export paths.
- `server/routes/conversation-os.ts` enforces authoritative user/project context and proposal acceptance pathways; retrieval + orchestration are currently simple scoped services.

### Existing policy and governance baseline
- There is an in-app policy engine (`server/submission-ops/policy-engine.ts`) already resolving policy by org/context from DB policy tables.
- Export review gates are enforced in routes (`server/routes/cerv2-export-routes.ts`, `server/routes/ectd-export.ts`) via fail-closed behavior in production unless explicitly configured otherwise.

### Existing retrieval baseline
- Conversation retrieval currently uses deterministic chunking/keyword scoring in `server/services/conversation-os/retrievalService.ts` with persistence fallback.
- This is the safest insertion point for a future retrieval adapter boundary (Qdrant standard path, Byaldi pilot path).

### Existing feature-flag baseline
- Tenant-aware feature toggle service and middleware already exist:
  - `server/services/featureToggleService.ts`
  - `server/middleware/featureToggleMiddleware.ts`
- New OSS planes should use this existing capability instead of introducing a second flag system.

## 2) Reconciliation against stale assumptions

## Corrected truths
- Policy enforcement is **not absent**; it exists today in DB-backed policy resolution and export gates.
- Retrieval is **not vector-native yet** in the conversation OS path; it currently uses keyword scoring and persisted chunks.
- Governance headers + human-review guardrails are already implemented on export routes and must be preserved.
- The repo already has a feature-toggle mechanism suitable for gated rollout of Docling/Unstructured/Qdrant/Byaldi/Temporal/E2B paths.

## 3) Safest integration points by target

- **Docling primary + Unstructured fallback**: add behind an ingestion service boundary, normalize into a stable internal schema before any downstream use.
- **Qdrant**: introduce through retrieval adapter in conversation/evidence service layer, preserving existing context filters and citation payload requirements.
- **Byaldi**: optional pilot path only; no default critical-path routing until benchmark gate passes.
- **OPA**: start with sidecar/decision-service integration that mirrors current policy inputs/outputs; keep existing in-app policy path as fallback during migration.
- **OpenTelemetry + Langfuse**: instrument request/policy/retrieval/workflow spans without changing business logic first.
- **Temporal**: begin with long-running/non-interactive jobs (e.g., packaging and async validations), not core synchronous export pathways.
- **E2B**: pilot-only isolated compute tasks returning outputs through governed app-controlled pathways.

## 4) Exact no-go areas (until explicit migration plans land)

- Any direct edits that bypass `createGovernedExportConsequence` in export routes.
- Any direct write path from experimental components into core regulated artifact tables.
- Any change that weakens `HUMAN_REVIEW_REQUIRED` behavior on regulated export routes.
- Any uncontrolled replacement of current policy decision points without contract tests + fallback.
- Any default-on Byaldi or E2B path before benchmark and safety gates pass.

## 5) Reconciliation checklist for each merge wave

- [ ] Contract docs updated before implementation merge.
- [ ] Feature flags exist and default to safe/off for new OSS paths.
- [ ] No-go files untouched or changed only with explicit governance tests.
- [ ] Rollback notes added for each new integration.
- [ ] Supervisor audit passes (`npm run oss:supervisor:audit`).
- [ ] `npm run typecheck` and `npm test` pass; run `npm run test:ana` if AnA/conversation-os paths are touched.
