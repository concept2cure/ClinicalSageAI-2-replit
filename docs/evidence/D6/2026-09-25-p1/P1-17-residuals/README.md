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
