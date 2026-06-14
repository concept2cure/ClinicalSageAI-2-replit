# GA Readiness Audit — API & Route Contracts

Date: 2026-06-14
Auditor scope: server/routes/ (292 files), server/api/, server/controllers/, OpenAPI specs (`submission-center.openapi.json`, `ivd-platform.openapi.json`). Excludes React client, raw DB.
Method: NET-NEW from source. Ran `ci:no-mock-in-prod-routes`, `audit:orphaned-endpoints`, `ci:audit-route-mounts`. Grep surveys for handler decls, validation, mock markers. Sampled highest-risk files (auth, billing, esignature, submissions, AI-actions, export, ivd-lifecycle).

---

## Executive Summary

The API surface is large: **~3,883 handler declarations across 397 route files**, with **846 declared endpoints** (per the orphan audit). Overall contract hygiene is **better than the raw numbers suggest** — sensitive flows (Stripe webhook, demo seeding, test-assembly) are correctly production-gated, and several CI "findings" are false positives caused by text-matching comments.

However, GA-blocking gaps remain in three areas:

1. **Validation is inconsistent and mostly ad-hoc.** Only **162 of ~397 route files use any zod `.parse`/`.safeParse`**. Many high-risk mutation files (auth-enterprise, billing, api-keys, esignature, ai-actions, authoring-actions — 100+ handlers combined) validate via manual `if (!field)` presence checks only, with no type/format/length/enum enforcement. Bodies are destructured and passed to DB writes, AI gateways, and signing flows largely untyped.
2. **One ungated prod-reachable test endpoint emits arbitrary domain events** from unvalidated input (`POST /api/cmc/test-event`).
3. **Significant OpenAPI ↔ implementation drift and broken mount-audit tooling.** `ivd-lifecycle.ts` exposes **49 endpoints**; the spec documents ~24 — roughly half the surface is undocumented. The `ci:audit-route-mounts` script targets `server/index.ts` but routes actually mount in `server/bootstrap/register-*.ts`, so it reports **0 mounts captured** — the route-mount safety net is effectively blind.

**Severity counts:** BLOCKER 0 · HIGH 4 · MEDIUM 5 · LOW 3

**API GA verdict: CONDITIONAL.** No customer-facing fake-data blocker found, and security-sensitive paths are gated. But unvalidated input on financial/auth/signing mutations, an ungated test event-emitter, and blind mount tooling + spec drift must be closed before GA.

---

## Findings

### [HIGH] H1 — Inconsistent / absent schema validation on high-risk mutation routes
**Files:**
- `server/routes/authEnterprise.ts` — 13 handlers, 17 `req.body` uses, **0 zod**. Login/MFA/e-signature use manual presence checks only (e.g. `authEnterprise.ts:116`, `:172`, `:303`, `:531`).
- `server/routes/billing.ts` — 7 handlers, **0 zod**. `tier/billingCycle/seats/currency` taken raw from body (`billing.ts:49`, `:178`) and sent to Stripe checkout.
- `server/routes/api-keys.ts` — `POST /` accepts `name, scopes, expiresAt, rateLimit, metadata` (`api-keys.ts:95`) with **0 zod**; `metadata` is a free-form object persisted unconstrained.
- `server/routes/esignature.ts` — 3 handlers, **0 zod** (`esignature.ts:72`, `:104`, `:137`) on a 21 CFR Part 11 signing surface.
- `server/routes/ai-actions.ts` — `POST /execute` (`ai-actions.ts:123`), **0 zod**, drives AI gateway actions.
- `server/routes/authoring-actions.ts` — 32 handlers, 18 body uses, **0 zod** (e.g. `:295`, `:582`, `:789`, `:971`).

**Impact:** Untyped/unbounded input reaches billing, identity, e-signature, and AI execution. Risks: malformed/oversized payloads, type-confusion, unexpected enum values silently accepted, weak audit-trail integrity on a regulated signing flow. Manual `if (!x)` checks catch missing fields but not wrong types, ranges, or unknown keys.
**Fix:** Introduce zod schemas (with `.strict()`) for every mutation body/param/query in these files, applied via shared validation middleware before handler logic. Prioritize esignature, billing, authEnterprise, api-keys.

### [HIGH] H2 — Ungated prod-reachable test endpoint emits arbitrary domain events from unvalidated body
**File:** `server/api/cmc/index.js:29` — `POST /api/cmc/test-event` reads `{ eventType, data }` from `req.body` with no validation, no auth/role check, and no `NODE_ENV` gate, then calls `emitCMCEvent(eventType, data)`.
**Impact:** Any caller can inject arbitrary CMC lifecycle events with arbitrary payloads in production — a state-integrity and abuse vector. Flagged by `audit:orphaned-endpoints` as a `retire-candidate`.
**Fix:** Remove the endpoint, or gate it behind `NODE_ENV !== 'production'` + admin role + zod validation (mirror the gating already done in `seed-demo.ts:15` and `test-assembly.ts:46-52`).

### [HIGH] H3 — `ci:audit-route-mounts` is blind (captures 0 mounts) — no mount-integrity safety net
**File:** `scripts/ci/audit-route-mounts.mjs` targets `server/index.ts`, but route registration lives in `server/bootstrap/register-*.ts` (15 files, ~229 `app.use`/register calls; e.g. `register-governance-routes.ts:50`, `register-core-routes.ts:32`, `register-document-routes.ts:303`).
**Evidence:** `npm run ci:audit-route-mounts` → "Total captured mounts: 0".
**Impact:** The CI gate intended to catch unmounted/duplicate/orphaned mounts inspects the wrong file and always passes vacuously. Regressions (a route file that stops being mounted) would not be detected.
**Fix:** Point the audit script at the bootstrap registrar entrypoint(s) (or the composed app after bootstrap), regenerate `route-mount-audit-baseline.json`, and re-enable the strict variant in CI.

### [HIGH] H4 — OpenAPI ↔ implementation drift; large undocumented surface
**Files:** `ivd-platform.openapi.json` documents ~24 ivd-lifecycle paths; `server/routes/ivd-lifecycle.ts` exposes **49** `router.*` endpoints. Undocumented examples: `POST /authoring/{mir,fsn,emdr,psur}`, `POST /change/{eu-significant,fda-510k}`, `POST /registration/{eu,fda}`, `POST /lot-release`, `/carryover`, `/cutoff`, `/process-validation`, `/scientific-validity`, `/signal/disproportionality`. `submission-center.openapi.json` lists 19 paths vs `submissions.ts` alone declaring 64 handlers.
**Impact:** Customers/integrators relying on the spec see <50% of the real surface; undocumented endpoints are unversioned breaking-change risk and unreviewed contract surface.
**Fix:** Generate the OpenAPI specs from source (or add a CI drift check) and reconcile. Explicitly mark internal-only endpoints as `x-internal` and exclude from the published contract.

### [MEDIUM] M1 — 659 orphaned endpoints (no client/server caller) — large unmaintained surface
**Evidence:** `audit:orphaned-endpoints` → Declared 846, Consumed 187, **Orphans 659** (`docs/reports/orphan-endpoints-latest.md`). Owners: Platform API Gateway 437, CMC 112, Identity Access 75.
**Caveat (important):** The heuristic only matches `/api/...` literals in `client/src/` and does not track server-to-server calls, so many orphans are live. This is a **dead-code / attack-surface** signal, not proven contract breakage.
**Impact:** Unbounded surface to secure, validate, and document; raises odds of forgotten unvalidated handlers (see H1).
**Fix:** Triage the 646 `needs-review` by owner; retire the 8 `retire-candidate` (see M2); annotate genuine server-only/webhook endpoints to suppress noise.

### [MEDIUM] M2 — Retire-candidate test/demo endpoints reachable (most gated; one is not)
**Endpoints (from orphan audit):**
- `POST /api/cmc/test-event` (`server/api/cmc/index.js:29`) — **NOT gated** → see H2.
- `POST /api/demo/seed` (`server/routes/seed-demo.ts:50`) — gated (`seed-demo.ts:15` blocks production). OK.
- `/api/test-assembly/*` (`server/routes/test-assembly.ts:63-104`) — gated (`test-assembly.ts:46-52`, 403 in prod unless `FORCE_TEST_ASSEMBLY`). OK.
- `GET/POST /api/cmc/qc-testing` (`server/api/cmc/routes.ts:192,203`) — **not a test route**; real DB-backed, zod-validated (`insertQcTestingSchema.parse`). False positive; safe.
**Impact:** Mostly contained; the only live risk is H2.
**Fix:** Remove/rename misleadingly-named `qc-testing` out of the retire bucket; fix H2.

### [MEDIUM] M3 — `ci:no-mock-in-prod-routes` net-new findings are false positives (but signal a weak check)
**Evidence:** `npm run ci:no-mock-in-prod-routes` failed with 4 net-new files:
- `server/routes/cro.ts:7` — comment: "Previously every endpoint returned hardcoded mock data" (mock REMOVED).
- `server/routes/fda510k-unified.ts:10,233,250` — comments documenting removal of deprecated mock route modules.
- `server/routes/agent-swarm.ts:623` — comment: "Replaces the prior setTimeout-based mock…" (mock REMOVED; now uses real AI gateway, `agent-swarm.ts:630+`).
- `server/routes/ivd-lifecycle.ts:189` — legitimate domain feature "Reviewer simulation (mock FDA / notified-body deficiencies)" with manual 422 validation (`ivd-lifecycle.ts:194-198`).
**Impact:** The check matches `/\bMOCK\b/i` and `/simulated/i` in comments, producing false failures and eroding trust in the gate. No actual fake-data-to-customer was found in these files.
**Fix:** Restrict the matcher to executable scope / add `// mock-ok` annotations, then update the baseline. Do not silently disable.

### [MEDIUM] M4 — Inconsistent error shape / status-code conventions across files
**Evidence:** Multiple competing response shapes coexist: `{ error: '…' }` (`ivd-lifecycle.ts:195`, `billing.ts`), `{ success: false, error: '…' }` (`cmc/routes.ts:198`, `test-assembly.ts:53`), and 422-vs-400 inconsistency for validation failures (422 in `ivd-lifecycle.ts`, 400 in `billing.ts:181`-style). A global `errorHandler` exists (`server/index.ts:195`) but per-route handlers bypass it with bespoke responses.
**Impact:** Integrators cannot rely on a single error contract; client error handling becomes brittle.
**Fix:** Standardize on one error envelope and a status-code convention (e.g. 400 validation, 401/403 authz, 422 semantic), centralize via the error handler, and lint for ad-hoc `res.status(4xx).json` shapes.

### [MEDIUM] M5 — Idempotency largely absent on mutations
**Evidence:** Only **4 route files** reference `idempotency` (`grep -li idempotency`). Stripe webhook is replay-safe via stored `stripe_events` (`billing.ts:255+`), but general POST mutations (api-keys creation, authoring promote/approve/lock, submission generation) lack idempotency keys.
**Impact:** Network retries / double-clicks can create duplicate resources or re-run AI/billing actions.
**Fix:** Add an `Idempotency-Key` header convention with a dedup store for non-idempotent mutations, especially billing and resource-creation endpoints.

### [LOW] L1 — Pagination present but not uniformly enforced
**Evidence:** 58 route files use `.limit()`; 40 files read pagination query params (`page/offset/cursor/pageSize/limit`). Many list `GET` handlers (e.g. ivd-lifecycle `GET /capabilities`, `/pathways`; cmc `GET /qc-testing`) return full `db.select()` results without a cap. These are typically small reference/config sets, but `qc-testing` is per-org unbounded.
**Fix:** Add a default + max page size to list endpoints that query tenant-scoped row sets.
**Impact:** Low — most unbounded lists are bounded-cardinality config data.

### [LOW] L2 — Stripe webhook returns 200 on processing errors (intentional) — verify dead-letter handling
**File:** `billing.ts:258-268` returns `200` even when `processWebhookEvent` throws, to suppress Stripe retries; relies on `stripe_events` replay.
**Impact:** Low, by design — but if the replay/dead-letter path is not operationally monitored, failed events are silently dropped.
**Fix:** Confirm a replay/alerting runbook exists for failed `stripe_events`.

### [LOW] L3 — `metadata` free-form object persisted on api-keys without shape constraints
**File:** `api-keys.ts:95` — `metadata` accepted and stored unconstrained.
**Impact:** Low — potential for oversized/unexpected payloads; covered by H1's broader fix.
**Fix:** Constrain `metadata` size/shape in the api-keys zod schema.

---

## What is healthy (counter-evidence, to avoid over-flagging)

- **Stripe webhook** (`billing.ts:223+`): signature verified, SDK error message not echoed, events stored for replay. Solid.
- **Demo seeding** (`seed-demo.ts:15`) and **test-assembly** (`test-assembly.ts:46-52`): correctly production-gated.
- **`submissions.ts`**: 64 handlers with 34 zod hits — the best-validated large file; pattern to replicate.
- **cmc `qc-testing`**: real DB-backed and zod-validated (`insertQcTestingSchema.parse`), despite being flagged as a retire-candidate.
- No customer-facing endpoint was found returning hardcoded/fake data in production paths; prior mock handlers were removed (M3).

---

## Recommended GA gate (close before launch)
1. H2: remove/gate `POST /api/cmc/test-event`.
2. H1: add zod validation to esignature, billing, authEnterprise, api-keys, ai-actions (highest blast radius first).
3. H3: fix `ci:audit-route-mounts` target and re-enable strict mode.
4. H4: reconcile OpenAPI specs with implementation (or add drift CI).
5. M3: tighten `ci:no-mock-in-prod-routes` matcher to executable scope.
