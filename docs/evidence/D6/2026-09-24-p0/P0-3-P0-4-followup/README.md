# P0-3 / P0-4 follow-up — the second `/api` authenticator, the token provider behind `authenticateToken`, and the SAML ledger sentences

**Row:** D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-04 (plan item P0-4) and IAM-03 (plan item
P0-3). These are the three companion changes each of those commits named under "Not done here" because the file
belonged to the other lane: `613c6e00` (P0-4) for `server/auth.ts`, `a96fbea0` (P0-3) for `server/middleware/auth.ts`
and `server/services/audit/auth-event-audit.ts`. **HEAD at the red run:** `5c978992`. No migration, no schema change,
no new dependency, no client change.

## What was wrong

1. **`server/auth.ts` `authMiddleware` did not apply the password-change rule.** It is the global `/api` gate's
   authenticator (`server/bootstrap`, the one essentially every authenticated `/api` route runs behind), and it read
   the account's standing through `isAccountActiveBeforeTenant`, which discards the `password_changed_at` column the
   same statement returns. So after P0-4 a bearer minted before the account's last password change was refused by
   `verifyLiveToken` (`/api/auth/session`, the users and enterprise routes, both socket handshakes) and by
   `authenticateToken`, and admitted by this gate: the change ended the session on the surfaces the holder is least
   likely to be using and left it open on the one they are.
2. **`server/middleware/auth.ts` `admitLiveSession` did not carry the token's `provider` onto `req.user`.** P0-3 made
   `requirePlatformAdmin` skip the `PLATFORM_ADMIN_EMAILS` allow-list when `tokenProvider(req)` is `saml`, reading
   `req.identity.provider` (set only by `server/auth.ts`) or else `req.user.provider`. Behind `authenticateToken`
   neither was set, so on the routes that compose it with `requirePlatformAdmin` — `billing-dashboard.ts:933`
   `POST /credits/adjust` and `clinical-regulatory-evidence-routes.ts` `POST /crl` — a SAML token asserting the
   platform owner's address was still a platform administrator.
3. **`auth-event-audit.ts` had no sentence for the five reasons P0-3 records** (`saml_sso`, `saml_validation_failed`,
   `saml_org_not_resolved`, `saml_no_email`, `saml_user_not_in_organisation`), so the ledger showed the generic
   `user login: failure (saml_validation_failed)` form for a federated sign-in while every password outcome has its
   own sentence.

## What is true now

- **`authMiddleware` refuses a session the password change ended, before the tenant membership is read.**
  `refusedAccountOutOfUse` is now `refusedAccountOrSessionOutOfUse(userId, claims, res)`: one call to
  `readAccountStandingBeforeTenant` (the single statement that returns `status` and
  `floor(extract(epoch FROM password_changed_at))`), then, in order: 503 `SESSION_UNCHECKED` when the read throws
  (unchanged), 401 `ACCOUNT_INACTIVE` when the account is out of use (unchanged), and 401
  `{ error: 'This session has ended. Sign in again.', code: 'SESSION_ENDED' }` when
  `sessionPredatesPasswordChange(issuedAtOfClaims(decoded), standing.passwordChangedAtSeconds)` — the flat
  `{ error, code }` shape this file uses for its other refusals, carrying the same message `authenticateToken` sends
  in its `{ error: { code, message } }` envelope. The gate's order is revocation → payload → standing and currency →
  membership, as before; a refused session never issues the membership query. The rule is the shared one from
  `account-standing.ts`, so the P0-4 semantics hold here unchanged: whole-second comparison (the sign-in that
  follows a change is current), a token with no `iat` refused in production only. `decoded`'s type gains
  `iat?: number`. The revocation read is not folded into a `Promise.all` with the standing: the two were sequential
  in this file before, `isTokenRevoked` swallows its own tier failures rather than rejecting, and the round trip the
  P0-4 note means — standing and password stamp in one statement — is what `readAccountStanding` already is.
- **`admitLiveSession` sets `req.user.provider`**: the token's `provider` claim when it is a string, `'local-jwt'`
  otherwise — the same reading `server/auth.ts` gives `req.identity.provider`. Set by `Object.assign` after the
  literal, because `Request.user` is declared identically in several `declare global` blocks and TypeScript
  requires the merged declarations to stay identical; `JWTPayload` gains `provider?: string`. `tokenProvider()` in
  `requirePlatformAdmin.ts` already read it, so behind `authenticateToken` an allow-listed e-mail on a SAML token is
  now refused (403, grants consulted) and the same e-mail on a password session is still admitted.
  `enforceOrgMembership` writes `organizationUuid` onto the existing object rather than rebuilding it, so the field
  survives the chain.
- **Each SAML outcome has its own ledger sentence**, in the style of the existing entries: signed in through the
  organisation's SAML identity provider; refused because the response did not validate, the configuration resolved
  to no organisation, the assertion carried no email address, or the account is not a member of the organisation
  that owns the identity provider. `account_inactive`, which the SAML path also records, already had one.

| | File | Result |
|---|---|---|
| red | `red/auth-middleware-session-currency-before-fix.txt` | 1 of 7 fail on HEAD `5c978992`: a bearer whose `iat` precedes `password_changed_at` reaches the handler through `authMiddleware` (and the membership query is issued for it). The 6 that pass are the controls: after-change, same-second, never-changed and no-`iat` bearers admitted; `ACCOUNT_INACTIVE` and `SESSION_UNCHECKED` unchanged. |
| red | `red/auth-carries-provider-before-fix.txt` | 4 of 5 fail: `req.user.provider` is `undefined` whatever the token says, and an allow-listed e-mail on a token with `provider: 'saml'` is a platform admin (`isPlatformAdmin` true) behind `authenticateToken`. The 1 that passes is the control (password session admitted). |
| red | `red/auth-event-audit-before-fix.txt` | 5 of 18 fail: each of the five SAML reasons falls to the generic `user login: … (reason)` form. |
| green | `green/auth-middleware-session-currency-after-fix.txt` | 7 of 7 |
| green | `green/auth-carries-provider-after-fix.txt` | 5 of 5 |
| green | `green/auth-event-audit-after-fix.txt` | 18 of 18 |
| green | `green/existing-suites.txt` | 1342 of 1342 across the 127 existing suites under `server/` and `tests/` that import `server/auth.ts`, `server/middleware/auth.ts` or `auth-event-audit.ts` (126 files passed, 1 skipped by its own guard; 7 cases skipped by their own guards; 0 failed; exit 0) — including every pool double keyed on `SELECT status FROM users` (`auth-establishes-scope`, `auth-hardening`, `auth-invalid-expired-jwt`, `authSurfaceSecurity`, `requirePlatformAdmin`, `ssoRoutes`, `passwordResetAuditTrail`, `platform-role-escalation`, `role-claims`, `api-auth-gate`, the admin, c2c, cerv2, estar and RLS contract suites) |
| green | `green/existing-suites-heavy.txt` | 21 of 21 in the four heavy suites that also import these modules and were run on their own (`cerv2-section-versions.pglite.integration`, the three golden journeys); exit 0. Both existing-suite runs were taken with the fix applied on HEAD `52254d11` (the branch advanced twice between the red run and these; neither commit touched the three changed files or the two authenticators' callers) |
| green | `green/gates.txt` | `ci:jwt-verify-pinned` OK; `check:security-patterns` 0 violations across 2838 files; `ci:client-ip-single-source` exit 0; `ci:discarded-audit-write` no new occurrences (131 baselined) |
| green | `green/typecheck-scoped.txt` | scoped `tsc` (repo `tsconfig.json` options; the three changed sources, the three tests, the ambient `.d.ts` files and the two request-augmentation modules): exit 0, nothing reported |

Tests added: `server/__tests__/security/auth-middleware-session-currency.test.ts` (1; beside the existing
`server/auth.ts` suites `auth-hardening` and `auth-invalid-expired-jwt`; the pool is a double keyed on the statements
the gate issues, the drizzle membership lookup is a chain that counts its reads, and the guards behind the gate are
pass-throughs, as in P0-4's `auth-session-currency.test.ts`), `server/middleware/__tests__/auth-carries-provider.test.ts`
(2; a real signed token with `provider: 'saml'` through the real `authenticateToken`, then the real `isPlatformAdmin`
and `requirePlatformAdmin`). Test extended: `server/services/audit/__tests__/auth-event-audit.test.ts` (3; five
cases in the existing "what the audit ledger shows" block).

Existing assertion changed: none. Existing fixture changed: none.

The full-tree typecheck was not run (OOM on this host under concurrent runs; the control tower runs it at push).

## Not done here

- **`optionalAuth`** (`server/middleware/auth.ts:526`) still builds `req.user` without `provider`. No route composes
  it with `requirePlatformAdmin` (the guard answers 401 when neither `req.user` nor `req.userId` is set, and the
  optional path is for requests that may be anonymous), so nothing reads the provider there today; noted so the
  next reader does not assume the field is universal.
- A `provider` claim that is not a string reads as `'local-jwt'` on both authenticators (pinned in the new test).
  First-party issuers only ever mint the string `'saml'` or no claim, so no minted token takes that branch; if a
  third provider is ever added, the allow-list rule in `requirePlatformAdmin` should become "password sessions
  only" rather than "not saml".
- P0-4b (`session_version`, `terminateAllSessions`, whether the password-change response mints fresh tokens for the
  changing session) and the IAM-18 items P0-3 listed are unchanged by this follow-up; see those READMEs.
