# IAM-18 residuals (4), (5), (9), (10) — four small exposures the audit grouped as Low

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (grouped). **Plan items:** P1-17
(the metrics and gateway items landed separately) and the grouped residue this folder covers.

## What was wrong

- **(4)** `validateTenantContext` (`server/middleware/enterprise-security.ts`), the detector that refuses a request whose
  `x-organization-id` header names another organisation than the session's and audits the attempt, was mounted by
  `applySecurityMiddleware`, which `applyCoreMiddleware` runs **before** the auth boundary. `req.user` was never set when
  it ran, so in production it had never refused or audited anything.
- **(5)** The enterprise sign-in steps (`server/routes/authEnterprise.ts` `POST /verify-password`, `POST /verify-mfa`)
  never read `users.status`: a suspended or deprovisioned account completed both steps, received a session, and the audit
  trail recorded a successful sign-in. The main login and its challenge refuse such an account with
  `AUTH_ACCOUNT_INACTIVE` before spending a code.
- **(9)** `getCategory` (`server/middleware/redisRateLimiter.ts`) put a path in the `ai` bucket only for a bare `ai`,
  `generate`, `openai` or `anthropic` segment; the AI surfaces actually mounted (`/api/ai-assistance`, `/api/ai-gateway`,
  `/api/ana`, `/api/ana-ri`, `/api/claude`, `/api/cortex`) were metered as ordinary API traffic.
- **(10)** `/api/ai-assistance` and its `/api/ai` alias (`server/bootstrap/register-core-routes.ts`) were the only AI mounts
  without `authenticateToken` at the mount; the default-deny boundary covered them, nothing else did.

## What is true now

- The detector is mounted in `applyAuthBoundary` (`server/startup/middleware.ts`), immediately behind the boundary, and
  its pre-auth mount is gone; the unit cases show it refusing a forged header with `TENANT_MISMATCH` and auditing it,
  passing a matching or absent header, and neither refusing nor adopting a header when there is no session.
- Both enterprise steps refuse an account out of use with 403 `AUTH_ACCOUNT_INACTIVE` and an audited failure
  (`account_inactive`), before the lockout, the password or the code.
- The six AI prefixes land in the `ai` bucket; the other buckets are unchanged and no substring matches (`/api/trials`,
  `/api/analytics` stay `api`).
- Both AI-assistance mounts carry `authenticateToken` like every other AI mount.

| | File | Result |
|---|---|---|
| red | `red/impersonation-detector-before-fix.txt` | HEAD `2ec744b7`: `applyAuthBoundary` mounts the boundary alone; the detector's own logic already worked (4 of 5 pass) |
| red | `red/enterprise-inactive-before-fix.txt` | a suspended account gets 200 from both steps; 2 failed / 2 passed |
| red | `red/ai-bucket-before-fix.txt` | six AI prefixes classified `api`; 6 failed / 3 passed |
| green | `green/residuals-after-fix.txt` | 113 / 113 across the three new suites, the enterprise-auth suites, the security-middleware suites, the phase-3 route suite and the recovery-code suite |
| green | `green/gates.txt` | `check:security-patterns` 0 violations; `ci:audit-route-mounts:no-regression` +0 / +0 |

Tests: `server/startup/__tests__/tenant-impersonation-detector.test.ts`,
`server/routes/__tests__/authEnterprise-inactive-account.test.ts`, `server/middleware/__tests__/redisRateLimiter-category.test.ts`.
(10) is a one-token change verified by reading; the route-mount audit is unchanged.

## Not done here

- **(7)** the 50 MB JSON parser on `/api/concept2cure` still runs before the boundary (`server/startup/middleware.ts` step
  6). Deferring it behind the boundary means skipping the general 2 MB parser for that prefix and re-running the
  prototype-pollution scrub after the deferred parse; a reordering of the core pipeline this session did not attempt.
  Every `/api/concept2cure` router is mounted with `authenticateToken`, so the exposure is the parse, not the handlers.
- **(6)** the SAML token in the query string and `InResponseTo` `ifPresent`, **(8)** the login timing oracle
  (`routes/auth.ts`, inside another lane's window until 01:07 UTC), and the bare `/api` mount of the RTM export with
  `authenticateToken` (correct, if broad; left as is).

## 2026-09-26 — re-check of (4): the dead skip list, the audited path, and the end-to-end proof

A re-verification of (4) at HEAD `7fbe51c5` found the fix of `50b04d99` in place — the detector mounts once, in
`applyAuthBoundary`, behind the boundary — and three residuals in cold, own-lane files. This section closes them.

### What was wrong

- `server/middleware/enterprise-security.ts:543-554` — the detector's `publicPaths` skip list held full paths
  (`/api/health`, `/api/auth/login`, …) and tested them with `req.path.startsWith`. Mounted on `/api`, the detector receives
  a mount-relative `req.path` from Express 5 (`/auth/login`), so no entry ever matched. Dead, and harmless: every `/api`
  entry is on the boundary's `PUBLIC_API_ALLOWLIST` (`server/middleware/public-api-allowlist.ts`), which the boundary
  consults before it authenticates (`authBoundary.ts:159-160`), so such a request reaches the detector with no `req.user`
  and takes the no-session branch; `/healthz` and `/readyz` are not under `/api` at all. It was a second list of public
  paths beside the boundary's.
- `server/middleware/enterprise-security.ts:574` — the audit detail recorded `path: req.path`, so the
  `tenant_impersonation_attempt` row named `/vault/documents`, not the `/api/vault/documents` the client sent. The unit
  fixture faked `path: '/api/vault/documents'` with no `baseUrl` and could not see it.
- `server/bootstrap/register-platform-routes.ts:19` — the comment said the CSP report route "survives the
  validateTenantContext skip list"; the route is public because `CSP_REPORT_URI` is on `PUBLIC_API_ALLOWLIST`.
- The end-to-end proof the item named — a real token through the real boundary — did not exist; the unit test drove
  `validateTenantContext` with a hand-built request.
- The expression `` `${req.baseUrl || ''}${req.path || ''}` `` was written out in `authBoundary.ts:159`,
  `tenantLifecycleGuard.ts:128` and `storageQuotaGuard.ts:117`; recording the full path in the detector would have been
  a fourth copy.

### What is true now

- The skip list is **deleted**, with the reason in the code. Decided by reading, not rewritten: rewriting it against the
  full path would have revived a second copy of the boundary's allowlist, every entry of which the boundary already
  answers before the detector runs (`/api/auth/login`, `/api/auth/register`, `/api/auth/signup` under the `/api/auth`
  prefix entry; `/api/health` and `/api/csp-report` as prefix entries), and a session that presents another
  organisation's id is an impersonation attempt on any path — there is no public path on which the detector should
  stand down.
- The audit detail records `requestFullPath(req)`; the row names `/api/vault/documents`.
- `server/middleware/request-path.ts` (`requestFullPath`) is the one implementation. The detector,
  `tenantLifecycleGuard.ts` and `storageQuotaGuard.ts` import it; their private `fullPath` copies are gone (2 + 4 call
  sites). `authBoundary.ts:159` keeps its inline copy until that file is cold (lane `01E8btkB…`, window ends 2026-09-26
  23:56 UTC).
- `register-platform-routes.ts` names the real reason the CSP route is reachable without a session.
- `server/startup/__tests__/tenant-impersonation-detector.e2e.test.ts` builds `express()`, calls `applyAuthBoundary(app)`
  as `server/index.ts` does, sets `AUTH_BOUNDARY_MODE=enforce`, mints a real `jwt.sign` access token (organizationId 7,
  session claims `sid`/`sst`/`idl`) against the test `JWT_SECRET`, and doubles the pool, membership, tenant scope,
  lifecycle and quota guards exactly as `server/middleware/__tests__/auth-session-currency.test.ts` does. Four cases:
  Bearer(org 7) + `x-organization-id: 9` → 403 `TENANT_MISMATCH` and one `tenant_impersonation_attempt` row with
  `tenantId 7`, `resourceId '9'`, `details.path '/api/vault/documents'`; Bearer(org 7) + header 7 → 200 with
  `req.organizationId` 7 from the session; no token + header 9 → the boundary's 401 `AUTH_001`, no audit row; a
  `PUBLIC_API_ALLOWLIST` path with Bearer + header 9 → 200, no audit row (the boundary established no session, which is
  why the detector needs no list of its own).
- The unit fixture models the mount (`baseUrl: '/api'`, `path: '/vault/documents'`) and asserts the audited path.

| | File | Result |
|---|---|---|
| red | `red/impersonation-audit-path-before-fix.txt` | code unchanged: **2 failed / 7 passed** — e2e case 1 "the audited path lost its /api prefix: expected '/vault/documents' to be '/api/vault/documents'"; the unit case the same way; the other three e2e cases (200, 401 `AUTH_001`, public path) already pass, so the refusal itself was never in doubt |
| green | `green/impersonation-e2e-after-fix.txt` | **119 / 119** across 10 files: both detector suites, `tenantLifecycleGuard` (21), `storageQuotaGuard` (19), `authBoundary` (17), `csp-nonce`, `csrf-webhook-exemption`, `enterprise-security-dev-origins`, `audit-outcome-headers-exposed`, `api-auth-gate` |
| green | `green/gates-2026-09-26.txt` | `ci:column-reachability` OK; `ci:migration-set-order` OK (315 migrations); `ci:migration-drop-safety` OK; `check:security-patterns` 0 violations across 2855 files (no migration is touched; the gates ran because the lane's brief asks for them) |

Lint, HEAD → working tree: `enterprise-security.ts` 4 → 4 warnings, `register-platform-routes.ts` 4 → 4,
`tenantLifecycleGuard.ts` 0 → 0, `storageQuotaGuard.ts` 0 → 0, `tenant-impersonation-detector.test.ts` 0 → 0;
`request-path.ts` and the e2e test lint clean.

Re-run:

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/startup/__tests__/tenant-impersonation-detector.e2e.test.ts \
  server/startup/__tests__/tenant-impersonation-detector.test.ts \
  server/middleware/__tests__/tenantLifecycleGuard.test.ts server/middleware/__tests__/storageQuotaGuard.test.ts
npm run --silent ci:column-reachability && npm run --silent ci:migration-set-order && npm run --silent ci:migration-drop-safety
npm run --silent check:security-patterns
```

### Left open

- `authBoundary.ts:159` computes the full path inline; it joins `request-path.ts` once its lane's window closes.
- The register (`docs/security/SECURITY_AUDIT_2026-09-24.md:132`) dates the closing commit "2026-09-26"; `50b04d99` is
  2026-09-25T23:47Z. Shared document — the corrected wording is returned to the control tower, not edited here.
- The e2e test runs enforce mode only. In warn mode an anonymous request passes the boundary with no `req.user` and the
  detector takes the no-session branch, which unit case 4 covers; a valid token is authenticated identically in both
  modes (`authBoundary.ts:176-190`).
- `applyAuditTrailMiddleware`, mounted before the boundary, additionally records the 403 as `UNAUTHORIZED_ACCESS`
  (`server/startup/audit-trail.ts`); unchanged and not asserted here.
