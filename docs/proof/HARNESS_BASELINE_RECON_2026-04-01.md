# Harness Baseline Recon (2026-04-01)

## Scope

Pre-op baseline for customer-shaped governed harness work in the current branch.

## Confirmed merged foundations present

1. Platform-law governed contract foundation exists:
   - `shared/types/document-contract.ts`
   - route-level enforcement returning `GOVERNED_CONTRACT_INVALID` exists in:
     - `POST /api/concept2cure/projects/:projectId/artifacts`
     - `PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId`

2. Route/bootstrap cleanup foundation appears present:
   - monolithic route split patterns and startup hardening artifacts present in repo.

3. Env-gated observability/policy/model gateway spine present:
   - LiteLLM: `server/services/ai/LiteLLMAdapter.ts`
   - Langfuse: `server/services/observability/langfuseService.ts`
   - OPA: `server/services/policy/opaClient.ts`, `opaMiddleware.ts`
   - OpenTelemetry: `server/services/telemetry/opentelemetry.ts`

4. Session-B feature-gated ingestion/search/workflow spine present:
   - Tika: `server/services/ingestion/tikaClient.ts`
   - GROBID: `server/services/literature/grobidClient.ts`
   - OpenSearch: `server/services/search/opensearchClient.ts`
   - Temporal bridge: `server/services/workflow/temporalBridge.ts`

## Build reliability baseline

- `npm run typecheck`:
  - **fails** with a high count of pre-existing repo-wide TypeScript errors outside harness scope.
  - Harness changes were validated via targeted Vitest suites (see below).

- Targeted governed harness tests:
  - `npx vitest run tests/document-contract.governed.test.ts server/services/__tests__/governedDocumentContractService.test.ts server/services/__tests__/governedRuleResolver.test.ts`
  - **passes** (10/10 tests).

## Top-level authority surfaces (before/after this build slice)

### Canonicalized in this slice

- Shared contract + validator:
  - `shared/types/document-contract.ts`
- Context/rule/semantics/overlay authority:
  - `server/services/concept2cure/governedDocumentContractService.ts`
  - `server/services/concept2cure/rules/ruleResolver.ts`
  - `server/services/concept2cure/rules/rulePacks.ts`
  - `server/services/concept2cure/rules/personaOverlays.ts`
  - `server/services/concept2cure/authority/documentClassSemantics.ts`

### Route enforcement currently wired in this slice

- `POST /projects/:projectId/artifacts` -> governed context resolution + validation
- `PUT /projects/:projectId/artifacts/:artifactId` -> governed context resolution + validation
- `POST /conversations/:conversationId/promote` -> governed context resolution + validation
- Knowledge document upload convergence artifact -> governed context resolution + validation before insert
- Audit report export artifact -> governed context resolution + validation before insert
- `PUT /projects/:projectId/haq-session` -> governed context resolution + validation for create/update
- Artifact placement/status/CTD-section/rollback mutation routes -> governed context resolution + validation before mutation
- `server/routes/knowledge-base.ts` artifact writes -> governed context resolution + validation
- `server/routes/authoring-actions.ts` promote/approve/lock/submission-ready metadata updates -> governed context resolution + validation

## Known bypass/authority split risks still present

1. Service-layer artifact creation bypasses still exist and should be routed through canonical harness:
   - `server/services/ana-guidance-executor.ts` (`executeArtifactCreation`)
   - `server/services/contradiction-consequence-service.ts` (`createContradictionMemo`)

2. Route-level completeness gaps remain:
   - knowledge upload convergence path currently treats convergence artifact failure as non-fatal
   - authoring-actions has mixed error-envelope behavior for governed validation failures

3. Typecheck green baseline cannot be proven due to broad pre-existing repository type errors.

## Notes

- This document is intentionally operational, not narrative.
- It records what is truly wired and what remains an explicit bypass risk.
