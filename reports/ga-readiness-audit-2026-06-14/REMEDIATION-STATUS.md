# GA Readiness — Remediation Status

**Branch:** `claude/codebase-ga-readiness-audit-sghfar` · **PR:** #805 · **Updated:** 2026-06-14

This tracks remediation of the findings in this audit. Every code change below was
verified with `tsc --noEmit` (repo baseline 0 errors) and, where a test exists, by
running it. Scope excludes the React UI; DB-schema migrations are called out explicitly.

---

## BLOCKERS (16) — status

| # | Blocker | Status | Where |
|---|---------|--------|-------|
| B1 | Post-auth OS command injection (RCE) `analytics-routes.ts` | ✅ Fixed | `execFile` argv, no shell; 1M cap |
| B2 | Python code injection (RCE) `faers-bridge.js` | ✅ Fixed | argv to static script + NDC validation |
| B3 | Cross-tenant IDOR — clinical-operations reads | ✅ Fixed | org-scoped via parent study |
| B4 | Cross-tenant IDOR — FDA ESG submission | ✅ Fixed | org-scoped project lookup |
| B5 | Cross-tenant IDOR — 510k workflow (body org) | ✅ Fixed | org from JWT, cross-org 404 |
| B6 | Cross-tenant IDOR — FDA form generation | ✅ Fixed | org threaded into `fetchProjectData` |
| B7 | Unauthenticated `/uploads` static mount | ✅ Fixed | mount removed |
| B8 | Hardcoded credential-vault AES key | ✅ Fixed | throws in prod when unset |
| B9 | Unauthenticated Python generation service `api.py` | ✅ Fixed | bearer token (fail-closed) + path confinement |
| B10 | Canonical audit mirror unchained/mutable | 🟡 Partial — see Audit-Trail Remediation | schema migration required |
| B11 | Audit writes not in the action transaction | 🟡 Partial — e-signature path fixed | broad refactor required |
| B12 | Audit retrieval from volatile in-memory array | 🟡 Open — see Audit-Trail Remediation | reads persistent table needed |
| B13 | Integrity-verify reported ok when seal skipped | ✅ Fixed | `verifyAuditIntegrity` fails closed |
| B14 | eCTD generator fabricates clinical efficacy data | ✅ Fixed | fails loudly; never invents data |
| B15 | Production ECS runs mutable `:latest` image | ✅ Fixed | `image_tag` variable, validation rejects `latest` |
| B16 | GitHub Actions not SHA-pinned | 🟡 Partial | `@master`→tags + TODO checklist; SHAs need real values |

**13 of 16 closed in code.** The 3 partials are the audit-trail architecture cluster
(B10–B12) — see the dedicated remediation plan below. They require a DB-schema
migration and a transaction-threading refactor that must be designed and reviewed,
not applied blind to a regulated audit trail.

---

## HIGH (37) — closed so far

- **Security:** dev SSO JWT backdoor gating; connector SSRF guard (`server/utils/ssrfGuard.ts` applied to fhir-r4/veeva/medidata/ellucian + at credential-store time); SAML JIT org mapping (no longer hardcoded org 1); unauthenticated path traversal (`dossier_routes.ts`); `format`-param traversal (`blueprint-generator.js`).
- **Reliability:** unguarded transaction ROLLBACK now isolated + poisoned connection evicted (`db/runtime.ts`); silently-swallowed CMC/eCTD write-through now logged (`batchRecordRoutes.ts`, `routes.ts`, `specificationRoutes.ts`); process error handlers drain before exit (`shutdown.ts`).
- **Compliance:** `/sign` verifies the second factor server-side and no longer hardcodes validity; e-signature audit write awaited + fails the request on audit failure.
- **API:** `/api/cmc/test-event` injector now auth-gated + production-blocked + body-validated; route-mount CI audit de-vacuumed (sees 241 real mounts; baseline regenerated).
- **Performance:** `tenantCache` bounded with LRU + real TTL; per-request `readFileSync`+`JSON.parse` in CMC handlers memoized.
- **Observability:** `/readyz` checks Redis/worker deps; `/api/metrics` + `/api/health/full` auth/token-gated; request-logger uses the redacting logger.

**In progress (this session):** API input validation on billing/api-keys/MFA/ai-actions;
audit actor identity from JWT (anti-forgery); outbound HTTP timeouts (GROBID/OpenSearch/OPA/Veeva/Ellucian/OpenAI).

---

## Audit-Trail Remediation (B10–B12) — execution-ready design

**Current architecture (verified in `server/services/auditService.ts`):** `logAction`
dual-writes to (1) the queryable Drizzle `audit_logs` mirror — unchained, has an
`updated_at` (mutable) — and (2) `TamperProofAuditLog`, a real sha256 hash-chained,
HMAC-sealed, immutability-triggered log. A compliance-grade chain therefore **exists**;
the gaps are transactionality and the mutable mirror, not a total absence of chaining.

**Why this was not auto-applied:** it requires a DB-schema migration and threading a
transaction handle through hundreds of `logAction` call sites. Done wrong it corrupts
the regulated audit trail, so it must be designed and reviewed. Concrete plan:

1. **Make the queryable mirror tamper-evident (B10).** Migration: add `sha256_chain`
   and `hmac_seal` columns to `audit_logs`; add a `BEFORE UPDATE/DELETE` trigger that
   rejects mutation (mirror the existing trigger on the tamper-proof log). Backfill is
   not required (forward-only chain). Drop `updated_at` writes from `logAction`.
2. **Single canonical writer (B11).** Route `logAction` through `computeAuditChainSealed`
   (already used by C2C governed actions and proven by
   `audit-integrity-pglite.integration.test.ts`) so the mirror and the chain share one
   sealed write. Accept an optional `tx` (PoolClient) param; governed mutation handlers
   pass their transaction so the audit row commits/rolls back atomically with the action.
   Adopt incrementally, governed routes first (the e-signature path already does this).
3. **Persistent retrieval (B12).** Point `queryAuditEvents`/`auditLogger.queryAuditEvents`
   at the persisted table, removing the 10k in-memory ring buffer as the source of truth
   (keep it only as a write-through cache if desired).
4. **Verification:** extend the existing pglite integration test to assert (a) the mirror
   row carries a valid chain/seal, (b) UPDATE/DELETE on `audit_logs` is rejected, (c) a
   governed mutation that rolls back leaves no audit row. Make `audit:verify:full` cover
   the canonical table, not just the C2C subset.

Estimated as a focused, reviewed change set (1–2 engineer-days incl. migration + tests),
gated on a DBA/architecture review because it touches the production audit schema.

---

## Remaining backlog (tracked in sections 01–09)

~24 HIGH, 45 MEDIUM, 28 LOW remain, plus two CI-infrastructure items that gate the
audit's own assurance:

- **Provision Postgres in the CI `Test` job + enforce `--coverage`** (Testing HIGH) — the
  most leveraged remaining item: today the safety-critical RLS/tenant/audit suites
  self-skip without a DB, so they "pass" by skipping. This is a CI-workflow change.
- **Flip `RLS_ENFORCE=on`** as the DB backstop behind tenant scoping, after burning down
  the 28 baseline unscoped query sites (DB/ops workstream).
- OpenAPI ↔ implementation reconciliation (API H4); `console.*`→redacting-logger migration
  across remaining prod paths (Observability); eCTD ZIP streaming (Performance);
  Celery retry/idempotency/dead-letter (Python).

## CI state of this PR

Green except two inherent items: the DangerJS **"Extremely Large PR"** check (unavoidable
for a combined audit+fixes deliverable) and the **pre-existing terraform `validate`**
Checkov backlog in modules untouched by this work. The blocking deps/secrets scans,
typecheck, security-contract tests, and route-mount/ownership gates pass.
