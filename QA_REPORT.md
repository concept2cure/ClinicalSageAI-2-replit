# Submission Center — QA report (multi-agent swarm)

Five parallel read-only QA agents audited the surface built this session plus targeted
broader sweeps: **security/multi-tenancy**, **correctness**, **build/types/tests**,
**duplication/consistency**, **Part 11 / AI-gateway discipline**.

## Headline
- **Build healthy:** `tsc --noEmit` = **0 errors**; **73 tests pass** (9 suites), 0 failures.
- **Service layer is sound:** `/api/submissions` services are tenant-scoped from the session, ownership-checked, audited, and sanitize provider errors. Core services have **zero** `any`/unsafe casts.
- **No new duplication:** new code **reuses** the existing validator/packager; routes mounted once, correctly ordered; AnA registry consistent.
- **Gating issues found:** 2 CRITICAL, 6 HIGH — all with concrete fixes (below).

## Findings (severity-ranked) — status: ✅ fixed · ⏭ deferred

| # | Sev | Area | Finding | Status |
|---|-----|------|---------|--------|
| 1 | CRITICAL | Auth | `submissionClient` (UI kit) sends a cookie, but `authenticateToken` reads **only** `Authorization: Bearer` → every Submission Center call would 401. OpenAPI also wrongly declared cookie auth. | ✅ client + SSE now send `getAuthHeaders()`; OpenAPI → bearer |
| 2 | CRITICAL | Tenancy | AnA tool `check_dossier_consistency` took `organization_id` from **model input** (cross-tenant read via chat / prompt injection). *Pre-existing tool.* | ✅ org now from `ctx.organizationId`; param removed from schema |
| 3 | HIGH | Governance (Part 11) | `transitionSequence` let a plain author route flip a sequence to `frozen`/`dispatched` (irreversible) with no e-signature/reason. | ✅ those two targets rejected on the generic route; must go through the governed e-sign flow |
| 4 | HIGH | Tenancy | `ectd-documents.ts` CRUD: org filter **optional** (unscoped reads when absent) + **no RBAC** on mutating routes + raw error messages leaked. *Pre-existing CRUD in the file I extended.* | ✅ org filter mandatory, `requireRole` added, generic errors |
| 5 | HIGH | Correctness | `ctxOf` used `Number(user.organizationId)` → 401 if the claim is non-numeric; inconsistent with the platform resolver. | ✅ aligned with `tenantContext?.organizationId ?? user.organizationId` |
| 6 | HIGH | Correctness | `getShadowReviewFindings` ordered by `severity` **text** → alphabetical (info > major). | ✅ explicit severity-rank ordering |
| 7 | HIGH | Correctness | `truth-engine`/`submission-ai` flattened all gateway errors to 503; rate-limit/token-limit not mapped; failed AI calls not audited. | ✅ shared `mapGatewayError`; audit on failure |
| 8 | MED | Correctness | `idParam` accepted `0`, negatives, floats. | ✅ `Number.isInteger(n) && n > 0` |
| 9 | MED | Tenancy | `upsertLeaf` didn't verify the referenced document belongs to the caller's org (dangling cross-tenant pointer). | ✅ ownership check on `coauthor_documents` ref |
| 10 | MED | Correctness | SSE parser `.trim()`-ed `data:` lines (corrupts whitespace); no client-disconnect handling. | ✅ client: single-leading-space strip + error terminal; server: `req.on('close')` stops writes (full upstream abort — thread AbortSignal into the service — left as a follow-up) |
| 11 | MED | Hygiene | Orphaned prompt `provenance-trace/v1.0.md` (traceProvenance is deterministic, never loads it). | ✅ removed |
| 12 | LOW | Hygiene | `core-to-packager.ts` header cited now-deleted `reg/{indexXml,packager}.ts`. | ✅ comment corrected |
| 13 | MED | Governance | AnA `set_program_metadata` lets an LLM write `esig`/`transmitAt`/`gateOk` display keys (fakes a completed transmit; metadata-only). *Pre-existing.* | ⏭ flagged — lock the LLM-writable key set (operator) |
| 14 | MED | Tenancy/Part 11 | `ectd-documents` `DELETE` is a **hard delete** of regulated docs with no audit. *Pre-existing.* | ⏭ needs a `deleted_at` column on `coauthor_documents` (migration) + audit — operator |
| 15 | MED | Coverage | `ectd4-validator.ts` pure functions are untested. *Pre-existing.* | ⏭ add unit tests (follow-up) |
| 16 | LOW | Types | Risky casts in `ectd-validator-hardening.ts` (`(leaf as any).studyId`) + `ectd-documents` metadata reads. *Pre-existing.* | ⏭ flagged |
| 17 | LOW | Consistency | Workspace key drift: `submission-ui.ts` uses kebab ids, `/capabilities` uses camelCase. | ⏭ cosmetic; UI bridges |

## What the swarm confirmed clean
- Every `/api/submissions` handler resolves org from the session, is `requireRole` + `authenticateToken` + rate-limited + Zod-validated, re-checks ownership before AI tasks, and never leaks provider errors.
- All 10 AI tasks route through the gateway (no direct SDK), use disk-loaded versioned prompts with anti-fabrication guardrails, pass tenant identity, and double-audit (service `AI_GENERATE` + gateway hash chain).
- `dispatch-qc` only gates; it never transmits. No transmit route is exposed in the new surface.
- No SQL-injection (all parameterized); no new data-model duplication; new code reuses the single validator/packager.

## Deferred items needing an operator decision / migration
- `coauthor_documents` soft-delete column + delete audit (#14).
- Lock down LLM-writable `esig`/`transmitAt`/`gateOk` metadata keys (#13).
- `ectd4-validator` unit tests (#15).
