# P0-3 — SAML was not bound to a tenant (IAM-03, High if SAML configured)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-03. **Plan item:** P0-3.
**HEAD when the evidence was taken:** `dac69d76`.

## What was wrong

`server/routes/sso.ts` selected an IdP configuration from an org slug and then decided, on its own, which
organisation the signed-in user belonged to. Four things were wrong with that decision and one with what followed.

- `getSamlConfig()` fell back to the single-org env configuration (`SAML_IDP_*`) for **any** slug absent from
  `SAML_TENANTS`, so a user of the default IdP could name any organisation in `?org=` or in RelayState and
  `resolveOrgIdForSlug` would then provision them into it.
- `findOrCreateSamlUser()` matched an existing user by e-mail alone and read their membership with
  `WHERE user_id = ?` — the **first row found, in whatever organisation**, decided the tenant and role of the token.
  A user with no membership was attached to the config's organisation (a JIT attach across tenants).
- It also overwrote `users.name` from the assertion when the stored name equalled the e-mail local part, and never
  read `users.status`, so a suspended or deprovisioned account signed in through its IdP.
- `GET /saml/logout` accepted the session token from the query string.
- `server/middleware/requirePlatformAdmin.ts` honoured `PLATFORM_ADMIN_EMAILS` against the token e-mail whatever
  issued the token, so a trusted IdP asserting the platform owner's address received platform administration.
- No SAML sign-in, admitted or refused, wrote an auth event; the password path writes one for every outcome.

## What is true now

The organisation is **always** the one that owns the matched IdP configuration (`configOrgId`), and an assertion is
proof of identity in that organisation only.

- The env configuration serves the slug `default` alone. Any other slug without a `SAML_TENANTS` entry answers 404
  (`SAML_NOT_CONFIGURED`) on initiate and on the callback, before anything is validated.
- An existing account must already hold a membership in `configOrgId`; the lookup is scoped to that organisation in
  the statement (`user_id = $1 AND organization_id = $2`). Otherwise the sign-in is refused: 403
  `SSO_USER_NOT_IN_ORGANISATION`, no membership minted, none adopted. A new account is created with a membership in
  `configOrgId` only, and that insert is no longer swallowed: if it fails, no token is issued. `users.name` is never
  rewritten. An account whose `users.status` is not `active` is refused (403 `SSO_ACCOUNT_INACTIVE`) with the same
  reading the password path uses (`isActiveAccountStatus`, `server/services/account-standing.ts`).
- Every outcome is an awaited `recordAuthEvent` in the tenant it concerns: `user_login` / `success` / `saml_sso`
  with `tenantId = configOrgId`; and `failure` with `saml_validation_failed`, `saml_org_not_resolved`,
  `saml_no_email`, `saml_user_not_in_organisation` or `account_inactive`. The org is resolved before the response is
  validated so a refused response is recorded in that tenant too.
- `/saml/logout` (GET, and now POST) reads the token from the `Authorization` header or the POST body; the query
  string is ignored. A bearer or body token still starts SP-initiated SLO against the org's IdP.
- `isPlatformAdmin` skips the e-mail allow-list when the token provider is `saml`
  (`req.identity?.provider ?? req.user?.provider`); the `platform_role_grants` path is unchanged and still decides
  for that identity.

| | File | Result |
|---|---|---|
| red | `red/sso-tenant-binding-before-fix.txt` | 14 of 34 fail on HEAD `dac69d76` with the tests added and the sources untouched. Initiate for an unconfigured slug: 302 to the default IdP (expected 404). Callback for it: reaches `validateResponse` with the default IdP (expected 404). Existing user, membership in org 99 only, IdP of org 42: **200** (expected 403). Memberships in 99 then 42: token for **`99`** (expected `42`). Membership predicate rendered as `"organization_users"."user_id" = $1` only. `users.name` rewritten. Suspended account: 200. Validation failure and orphan slug: no auth event. Query-string logout token: 302 (expected 401). POST logout: 404. Allow-listed e-mail with `provider: 'saml'`: admitted. |
| green | `green/sso-tenant-binding-after-fix.txt` | 40 of 40: 17 in `ssoRoutes.test.ts` (3 existing + 14 new), 17 in `requirePlatformAdmin.test.ts` (14 existing + 3 new), 6 in `saml-provider.test.ts` (unchanged, run to show the provider is untouched) |

Tests: `server/routes/__tests__/ssoRoutes.test.ts` and `server/middleware/__tests__/requirePlatformAdmin.test.ts`.
The SSO test's `db` stub renders every `where()` through drizzle's `PgDialect` and filters the seeded rows on it,
so the red run shows the cross-organisation sign-in the unscoped query performs rather than a stub artefact; the
provider is stood in for (its signature enforcement has its own suite). A scoped `tsc` over the four changed files
plus the `Request` augmentation reports nothing for them (the full-tree typecheck was not re-run: three concurrent
runs were OOM-killed on this host; the control tower runs it at push).

Gates at the fix: `ci:saml-fail-closed`, `ci:drizzle-tenant-scope` (125 sites, all baselined; the entry
`server/routes/sso.ts::select:organizationUsers#0` is now stale and `--write-baseline` shrinks it),
`ci:no-dev-auth-in-prod`, `ci:discarded-audit-write`, `check:security-patterns` — all pass.

## Not done here

- `InResponseTo` stays `ifPresent` (`server/services/saml-provider.ts`, IdP-initiated SSO accepted); IAM-18.
- The SAML access token is still returned in the redirect query string on a `returnTo` (`sso.ts`, IAM-18).
- `req.identity.provider` is set only on the `server/auth.ts` `authMiddleware` path (master-admin, tenants). On the
  `server/middleware/auth.ts` `authenticateToken` path (`billing-dashboard.ts:933`, `/api/clinical-regulatory-evidence`
  POST `/crl`) neither `req.identity` nor `req.user.provider` is populated, so the allow-list still applies to a SAML
  token there. The one-line change, not made here (file owned by another lane): in `admitLiveSession`, immediately
  after the `req.user = { … }` literal, add
  `Object.assign(req.user, { provider: typeof (decoded as { provider?: unknown }).provider === 'string' ? (decoded as { provider?: string }).provider : 'local-jwt' });`
  (`Request.user` is declared identically in five `declare global` blocks, so the field is set by assignment rather
  than added to the literal). `tokenProvider()` in `requirePlatformAdmin.ts` already reads it.
- `EVENT_DESCRIPTIONS` in `server/services/audit/auth-event-audit.ts` has no sentences for the new reasons; the
  ledger shows the generic `user login: success (saml_sso)` form until they are added.
