# GA Readiness Audit — Security & Authentication

**Scope:** `server/` and `shared/` (application/server code only). Excludes `client/` and raw DB migrations/schema, per audit charter.
**Date:** 2026-06-14
**Auditor focus:** Auth flows (JWT/SAML/session/dev-auth), multi-tenant isolation, secrets, injection (SQL/command/path/SSRF), CSRF, file uploads, RBAC/IDOR, crypto, rate limiting, input validation.
**Method:** Net-new independent review from source, augmented by two focused sub-audits (injection sweep; exhaustive RBAC/IDOR route sampling across ~300 route files). Findings verified by reading actual code; cited as `file:line`. Prior audit/markdown reports in the repo were deliberately not consulted.

---

## Executive Summary

The platform's **perimeter and primitive security is mature**: hardened JWT verification, fail-closed SAML, centralized dev-auth gating, strong password/MFA/login-lockout, strict CORS/CSP, and a global `/api` authentication gate. The most damaging *perimeter* vulnerability classes are already remediated, with visible fix markers and a large battery of CI guards.

**However, the audit found a cluster of post-authentication broken-object-level-authorization (IDOR) vulnerabilities that allow cross-tenant data access and cross-tenant regulatory mutations.** The global auth gate ensures a request is *authenticated*, but several legacy clinical-ops and FDA-510k route handlers fetch sensitive objects by an ID taken straight from `req.params`/`req.body` **without scoping to the caller's organization**. In a multi-tenant regulated SaaS, these are launch-blocking: any logged-in customer can read another customer's enrollment data, protocol deviations, and FDA project data, and in some cases transmit another tenant's submission to FDA. This is compounded by the fact that **Postgres Row-Level Security ships in shadow mode (off) by default**, so there is currently no database safety net behind the application-layer scoping bugs.

Sub-audit results folded in:
- **SQL/command injection:** clean. Queries use Drizzle parameterization / `pool.query($1)`; reviewed `sql\`\`` interpolations are bound parameters; the lone string-interpolated identifiers come from `information_schema`, not user input. No command-injection sinks with user-controlled args.
- **RBAC/IDOR:** the source of the BLOCKERs below.

### Findings by severity

| Severity | Count |
|----------|-------|
| BLOCKER  | 6 |
| HIGH     | 2 |
| MEDIUM   | 6 |
| LOW      | 5 |

### Verdict: **NOT READY**

Cross-tenant IDOR on clinical and regulatory data (B-1…B-4) is a direct confidentiality/integrity breach for paying enterprise tenants, and the unauthenticated `/uploads` mount (B-5) plus the hardcoded credential-vault key (B-6) compound it. These must be fixed and regression-tested before GA. Once the BLOCKERs are closed (and ideally RLS flipped to enforce as a backstop — H-1), the perimeter is strong enough to reach CONDITIONAL.

---

## BLOCKER

### B-1. Cross-tenant IDOR in clinical-operations study sub-resources (read)

**Evidence:** `server/routes/clinical-operations-routes.ts` — multiple GET handlers fetch child tables by `studyId` from `req.params` with **no organization scoping**, even though a `getOrgId(req)` helper exists (line 93) and *is* used in the corresponding write/delete handlers.
```ts
// :studyId/enrollment — line 527-534
router.get('/studies/:studyId/enrollment', async (req, res) => {
  const { studyId } = req.params;
  const result = await pool.query(
    `SELECT * FROM clinical_ops.enrollment_records WHERE study_id = $1 ORDER BY period`,
    [studyId]);            // ← no org check
```
Same pattern on: `:studyId/enrollment-forecast` (~line 841), `:studyId/monitoring-visits` (~line 601), `:studyId/deviations` (~line 684 — protocol violations, highly sensitive), `:studyId/milestones` (~line 768).

**Why it blocks GA:** Any authenticated user enumerates numeric study IDs and reads another tenant's enrollment numbers, site-monitoring findings, and protocol deviations. Direct cross-tenant PHI/regulatory-data confidentiality breach.

**Fix:** Scope every read through the parent study with `getOrgId(req)`, e.g. `WHERE study_id = $1 AND study_id IN (SELECT id FROM clinical_ops.studies WHERE org_id = $2)` — the write paths already do this.

### B-2. Cross-tenant IDOR in FDA ESG submission (irreversible regulatory mutation)

**Evidence:** `server/routes/esgSubmissionRoutes.ts:14` → `server/services/ESGSubmissionService.ts:121-136`. `POST /api/510k/:projectId/esg/submit` passes the JWT-derived `organizationId` into `submitToFDA`, but `createSubmissionPackage` fetches the project/documents by `projectId` only (`.where(eq(fda510kProjects.id, projectId))`, line 136) — org is never used to authorize project access.

**Why it blocks GA:** A user in org A can transmit org B's project to FDA (an irreversible external regulatory action) by guessing/enumerating `projectId`.

**Fix:** Add `AND organization_id = <jwtOrg>` to the project/document lookup; 404 if it doesn't belong to the caller's org.

### B-3. Cross-tenant IDOR + body-supplied tenant in 510k workflow save (write)

**Evidence:** `server/routes/510k-workflow-routes.ts:21-96`. `POST /:projectId` reads `organizationId` from **`req.body`** (line 23) and writes it as the owner of new `fda510kProjects` rows (line 89); project lookup and `fda510kStageProgress` upserts are scoped by `projectId` only (lines 79-82, 121-170).

**Why it blocks GA:** An authenticated user writes/poisons workflow stage data into ANY project regardless of tenant, and self-assigns tenant ownership of new rows via the body field — cross-tenant write + tenant-claim forgery.

**Fix:** Never read `organizationId` from the body; derive it from `req.user`/JWT. Scope the project lookup and all upserts by the JWT org.

### B-4. Cross-tenant IDOR in FDA form generation/export

**Evidence:** `server/routes/fda-forms.routes.ts:118` → `fetchProjectData` (line 541-548). `POST /project/:projectId/generate/:formType` computes `organizationId` (line 121) but never uses it; `fetchProjectData(projectId)` resolves the project and even derives the org *from the project row* (line 565). Same gap on the other handlers calling `fetchProjectData` (~lines 225, 254, 338).

**Why it blocks GA:** Generate/export FDA forms populated with another tenant's device and project data by changing `projectId`.

**Fix:** Pass the JWT org into `fetchProjectData` and require the project's `organization_id` to match; 404 otherwise.

### B-5. Unauthenticated `/uploads` static mount

**Evidence:** `server/bootstrap/register-inline-routes.ts:225` — `app.use('/uploads', express.static('/tmp/uploads'))`. Mounted **outside `/api`**, so the global auth gate never runs; every file under `/tmp/uploads` is downloadable with no auth and no tenant scoping. Document/export services write here, and some filenames are predictable (e.g. `${formType}_${projectId}_${timestamp}`).

**Why it blocks GA:** If regulatory PDFs / generated forms / PHI land in this directory, they are world-readable to anyone who can reach the host. (Verify exactly what is written to `/tmp/uploads`; if strictly transient non-sensitive assets, downgrade to HIGH.)

**Fix:** Serve tenant files through an authenticated, org-scoped controller (or short-lived signed URLs); never raw `express.static` for tenant content.

### B-6. Hardcoded AES key fallback in the integration credential vault (no production guard)

**Evidence:** `server/services/integrations/credentialVault.ts:21`
```ts
const raw = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY
  || process.env.AUDIT_SIGNING_KEY
  || 'dev-integration-credential-key-change-me';
```
This vault encrypts **tenant integration credentials** with AES-256-GCM. If neither env var is set, the key is derived from a constant baked into source — anyone with the repo/bundle can decrypt every stored tenant credential. Unlike `connector-registry.ts` (which throws in production when no key is set), this module has **no `NODE_ENV==='production'` guard**.

**Why it blocks GA:** A publicly-known default key defeats the encryption of stored customer secrets; an env-unset prod deploy silently uses it.

**Fix:** Throw in `getEncryptionKey()` when `NODE_ENV==='production'` and no real key is set (mirror `connector-registry.ts:48-53`). Add a CI ban on the literal fallback in non-dev paths.

---

## HIGH

### H-1. Postgres RLS ships in shadow mode (off) by default — no DB safety net behind the IDOR bugs

**Evidence:**
- `server/db/rlsEnforcement.ts` — `readEnforcementMode()` defaults to `'off'` unless `RLS_ENFORCE=on`; `assertRlsEnforcementForProduction()` only **warns** in production, hard-failing only if the operator sets `RLS_REQUIRE_ENFORCE=true`.
- `migrations/0021_enable_rls_everywhere.sql` — policy leading clause is a shadow bypass: `NULLIF(current_setting('app.rls_enforce', TRUE),'') IS DISTINCT FROM 'on'` → every row passes unless the var is `'on'`.
- `server/middleware/tenantContext.ts:294-296`, `server/db/requestDb.ts:13-16`, `server/db/poolInstrumentation.ts` — rollout is mid-flight ("PR A" counts unscoped queries; "PR B" turns on enforcement). The `ci:tenant-isolation` baseline tracks **28** query sites running outside any tenant scope (`docs/reports/tenant-isolation-baseline.json`).

**Why it's HIGH:** RLS is the defense-in-depth layer that would have *contained* B-1…B-4. With it off, every app-layer scoping bug is a live cross-tenant breach. The code intentionally treats app-layer scoping as primary, but the IDOR findings prove that single layer is not currently reliable.

**Fix:** Set `RLS_ENFORCE=on` in production, verify with `scripts/db-verify/verify-rls.ts` + the tenant-isolation contract tests, burn down the 28 baseline unscoped sites (route them through `requestDb(req)`/`requireTenantContext`), then set `RLS_REQUIRE_ENFORCE=true` so a regression fails the boot.

### H-2. SAML JIT provisioning assigns every new user to a hardcoded organization (org 1)

**Evidence:** `server/routes/sso.ts:491-578` (`findOrCreateSamlUser`) — new JIT users (and existing users with no association, line 509) are placed into `defaultOrgId = 1` regardless of which tenant's IdP authenticated them. The org is not derived from the validated SAML config.

**Why it's HIGH:** In a multi-tenant deployment serving multiple IdPs (`SAML_TENANTS`), a user authenticating via Org B's IdP is provisioned into Org 1 — a cross-tenant membership grant. The assertion is verified (no auth bypass), but the *tenant mapping* is wrong.

**Fix:** Map the JIT user to the org owning the SAML config used for the callback (`orgSlug` from RelayState already identifies it); reject if it doesn't resolve. Add a test asserting JIT users land in the IdP's org.

---

## MEDIUM

### M-1. Forgeable actor identity in audit trails (21 CFR Part 11 integrity)

**Evidence:** Many handlers take the actor from `req.headers['x-user-id']` / `req.body.created_by` and write it into audit / `createdBy` / `submittedBy` fields: `esgSubmissionRoutes.ts:17`, `510k-workflow-routes.ts:43,190,225`, `fda-forms.routes.ts:122,225,254,338`, `authoring.router.ts` (931,1059,1100,1221,1289,1327,1400,…), `document-data-center.ts:18,99`. Org authority is JWT-bound (so not a tenant bypass), but a user can attribute consequential actions — including FDA submissions and document authorship — to another user or `system`.

**Fix:** Derive actor identity from `req.user`, never from the header/body.

### M-2. Redis rate limiter fails open

**Evidence:** `server/middleware/redisRateLimiter.ts:454-461` — on limiter error, `next()` lets the request through unthrottled; Redis-down degrades to per-instance in-memory counting (per-node limits multiply). Login is independently protected by a dedicated `loginLimiter` (10/15 min, `auth.ts:101-111`) + DB account lockout, so brute-force stays bounded; the fail-open mainly weakens volumetric abuse throttling.

**Fix:** Fail-closed (429) for sensitive categories (auth, export) on limiter error, or alert on degradation.

### M-3. `authenticateToken` trusts the JWT org claim without per-request membership revalidation

**Evidence:** `server/middleware/auth.ts:78-117` sets `req.user.organizationId` from the decoded JWT; most route groups mount with `authenticateToken` only (`server/bootstrap/register-*-routes.ts`), unlike `requireTenantContext` which re-checks `organizationUsers` membership and tenant `status` per request. A user removed from an org (or a suspended org) keeps stale access until the 24h token expires.

**Fix:** Standardize sensitive/data routes on `requireTenantContext`, or add token revocation / shorter access-token TTL + refresh.

### M-4. SSO `:provider` dev bypass gated only on `NODE_ENV`, not `isDevAuthAllowed()`

**Evidence:** `server/routes/sso.ts:19,422-471` — when `NODE_ENV==='development'`, `/:provider/initiate` and `/:provider/callback` mint a real signed JWT (`userId:'1'`, `organizationId:'2'`). Not reachable in prod, but bypasses the stricter `ALLOW_DEV_AUTH=1` requirement and the `ci:no-dev-auth-in-prod` policy that all other dev-auth shortcuts use.

**Fix:** Gate behind `isDevAuthAllowed()` (from `server/auth/dev-auth-policy.ts`).

### M-5. `connector-registry` encryption falls back to reusing `JWT_SECRET`

**Evidence:** `server/services/connectors/connector-registry.ts:56` — `ENCRYPTION_KEY_FROM_ENV || 'default-dev-key-change-in-prod'`; production is guarded, but the documented fallback reuses `JWT_SECRET` as the AES key. Cross-purpose key reuse is a hardening smell.

**Fix:** Require a dedicated `CONNECTOR_ENCRYPTION_KEY`; do not reuse `JWT_SECRET`.

### M-6. `/api/v1` open-prefix and `/api/setup` first-run invariants are unpinned

**Evidence:** `/api/v1` is on the global-gate allowlist and relies on `public-api.ts` enforcing `router.use(requireApiKey)` (present, ~line 261) — but no contract test asserts every `/api/v1/*` route requires a key, so a future route added above that line silently becomes unauthenticated. Separately, `routes/setup.ts` self-closes via a non-transactional `userExists()` check (first-run TOCTOU; small window).

**Fix:** Add a contract test pinning `/api/v1` api-key coverage; wrap first-user bootstrap in a transaction + unique constraint.

---

## LOW

### L-1. `/api/diag`, `/api/time` reachable unauthenticated (registered before the gate)
`registerPlatformRoutes` mounts these before the global `/api` gate; they expose only timestamp/static HTML. Latent footgun: any `app.get('/api/...')` placed before the gate bypasses auth. Keep pre-gate routes minimal and test-pinned.

### L-2. SCIM token compare — verify constant-time
`/scim/v2` (outside `/api`) self-authenticates via its own bearer + IP allowlist. Confirm the token comparison uses `crypto.timingSafeEqual` (not `===`).

### L-3. Firecrawl webhook — confirm fail-closed
`/api/firecrawl-webhooks` verifies signatures; confirm it **rejects** when its signing secret is unset (Stripe webhooks already verify signatures correctly).

### L-4. CSP allows broad `img-src https:` / `connect-src wss:`
`server/middleware/enterprise-security.ts:219-222`. Acceptable trade-off given varied regulatory imagery; script-src is correctly locked with nonce + strict-dynamic. Tighten if feasible.

### L-5. SAML logout callback does not validate the IdP `LogoutResponse` signature
`server/routes/sso.ts:404-414` — acknowledged in-code as a follow-up. Low forgery value (no session created).

---

## Areas reviewed and found solid (no action required)

- **Global `/api` auth gate** — `server/bootstrap/register-platform-routes.ts:235` forces JWT auth on all `/api/*` except an explicit health/auth/webhook allowlist; mounted before family routers; pinned by `server/bootstrap/__tests__/api-auth-gate.test.ts`.
- **JWT verify pinning & rotation** — `server/utils/jwtVerify.ts`: `algorithms:['HS256']`; previous-secret fallback only on signature mismatch; secret validated ≥32 chars at config load (`server/config/environment.ts:99-128`).
- **SAML assertion validation** — `server/services/saml-provider.ts`: vetted `@node-saml/node-saml`, signed-assertion required, audience pinned, InResponseTo/replay, sha256; fail-closed ACS (`server/routes/sso.ts:239-247`).
- **Dev-auth** — centralized `isDevAuthAllowed()` (NODE_ENV=development AND ALLOW_DEV_AUTH=1), CI-enforced; `/dev-login` returns 404 otherwise; hardcoded login backdoor removed (`server/auth.ts:174`).
- **Password hygiene & login** — bcrypt cost 12; empty-hash / legacy `temp_` plaintext rejected (`server/auth.ts:266-291`); account lockout (5→30 min); enumeration-safe errors; mandatory MFA by default.
- **Tenant identity sourcing** — JWT-only; `x-organization-id`/`x-tenant-id`/`x-org-id` overrides detected, blocked, audited (`tenantIsolation.ts`, `tenantContext.ts`, `enterprise-security.ts:487-563`). Canonical helpers `authedOrgId`/`getTenantContext`/`getSecureOrgId` source org from JWT. (Note: the IDOR BLOCKERs are handlers that *fail to call* these helpers, not a weakness in the helpers themselves.)
- **CORS / CSP / headers** — strict allowlist, no wildcard+credentials in prod; Helmet CSP nonce + strict-dynamic (no unsafe-inline/eval for scripts), HSTS preload, Permissions-Policy deny-by-default.
- **CSRF** — double-submit cookie, constant-time compare, fixed-length token, anchored exempt-path matching (`server/middleware/csrf.ts`).
- **Prototype pollution** — `__proto__`/`constructor`/`prototype` stripped from body/query/params, fail-closed (`enterprise-security.ts:417-481`).
- **Upload allowlist** — extension + MIME allowlist, executable/script types always blocked; layered with magic-number + virus scan (`server/middleware/uploadAllowlist.ts`).
- **Injection** — SQL parameterized (Drizzle / `$1`); reviewed `sql\`\`` interpolations are bound; no command injection with user-controlled args; the one path-traversal candidate (`reports/subscriptions-routes.ts`) is dead/unmounted code.
- **Crypto** — AES-256-GCM with per-message random IV; no `createCipher`/ECB/DES/RC4/hardcoded-IV; `crypto.randomBytes` for security tokens.
- **Audit trail** — tamper-proof HMAC chain fails closed in prod; 21 CFR Part 11 immutability blocks DELETE on audit/esignature routes (`server/startup/middleware.ts:119-155`). (Actor-identity sourcing is the M-1 gap.)
- **Stripe webhooks** — signature-verified and CSRF-exempt by design.

---

## Recommended pre-GA gate

1. Fix B-1…B-4 (org-scope every `studyId`/`projectId` lookup; stop reading `organizationId` from request bodies/headers) and add cross-tenant contract tests for each.
2. Confirm and lock down B-5 (`/uploads`) — authenticated, org-scoped delivery.
3. Fix B-6 (credential-vault prod key guard).
4. Flip RLS to enforce (H-1) as the backstop and burn down the 28 unscoped baseline sites; fix H-2 (SAML org mapping).
5. Address M-1 (audit actor from JWT) for Part 11 integrity, and the remaining MEDIUMs.
