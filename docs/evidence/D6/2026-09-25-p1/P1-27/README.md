# P1-27 (second part) — the browser Sentry client sent events unscrubbed; a `Math.random` organisation API key (DP-26, DP-27, Low)

**Row:** D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-26, DP-27. **Plan item:** P1-27 (its first
part, DP-24, was closed on trunk by another lane's `3625a205`; DP-28, the `tamper_proof_log` tenant column, is still open).

## What was wrong

- `client/src/utils/sentry.ts` initialised `@sentry/react` with the library defaults: no `beforeSend`, no
  `beforeBreadcrumb`, no `sendDefaultPii` decision, replay masking left implicit. With a DSN configured (none is today),
  an error event would have carried the signed-in user's email address, the request headers (bearer token, tenant
  header), the URL with its query string, and every fetch and console breadcrumb, to a third-party sink, from a
  PHI-adjacent application. The server client has scrubbed its events since June (`server/utils/sentry.ts`).
- `POST /api/tenants/:id/api-key` (`server/routes/tenants-simple.ts`) wrote a `Math.random` key in plaintext into
  `organizations.api_key`. Nothing reads that column (grep of `server/` and `client/`), no first-party client calls the
  route, and organisation API keys are `server/routes/api-keys.ts` (hashed, scoped, admin-only), managed from
  `client/src/concept2cure/v2/surfaces/AdminAccess.tsx`. A second, weaker path beside the canonical one.

## What is true now

- `client/src/utils/sentryScrub.ts`: `scrubSentryEvent` (the `beforeSend`) drops `user.ip_address` and `user.geo`,
  redacts `user.email` and `user.username`, redacts credential and tenant headers, removes cookies, strips the values
  of secret query parameters from the URL and query string, then walks the whole event: a key denylist (credentials,
  identifiers, health-data keys) wherever it occurs, and value patterns (bearer token, JWT, provider key, email
  address, US SSN) in every string. `scrubSentryBreadcrumb` (the `beforeBreadcrumb`) walks each crumb the same way.
  Both return `null` when scrubbing throws, which drops the event. `sentry.ts` passes both, sets `sendDefaultPii:
  false`, and states the replay masking (`maskAllText`, `maskAllInputs`, `blockAllMedia`) instead of inheriting it.
- The legacy mint route is removed. Its replacement by path: `server/routes/api-keys.ts`, mounted at `/api/api-keys`
  by `server/bootstrap/register-document-routes.ts`, reached from `AdminAccess.tsx`; the bundle-reach test
  (`server/bootstrap/__tests__/routes-reach-the-bundle.test.ts`) and the tenants contract test cover the mount and the
  removal. The create-tenant path still writes a CSPRNG key into the column at creation; retiring the column is a
  separate, additive-migration change (Rule 1) and is left as a hand-off. Deletion history checked:
  `git log -S"api-key" -- server/routes/tenants-simple.ts` shows the route unchanged since the file's history begins,
  apart from a 2026-09-23 logging edit.

Not changed: the server logger's key list (the DP-26 note that `email` and `ip` keys are not redacted). Adding
`email` to that blunt list would blank the sign-in lines operations reads; the right change is a per-field decision at
each writer, and the plan row keeps it.

## Evidence

- `red/browser-sentry-before-fix.txt` — the init test against the unchanged `sentry.ts`: `sendDefaultPii` undefined,
  no `beforeSend`, replay options not stated (2 of 3 failing); the scrubber test cannot import its module.
- `red/org-api-key-mint-before-fix.txt` — the contract test against the unchanged router: the mint ran its UPDATE.
- `green/browser-sentry-after-fix.txt` — 13/13 across both client suites.
- `green/org-api-key-mint-after-fix.txt` — 23/23 across the tenants contract test and the bundle-reach test.
- ESLint: the client `utils/` files are outside the lint set (project ignore); the two server files lint clean.

## Third commit: the server logger masks personal data (DP-26, server half)

The logger redacted secrets by key and left everything else as written, so an e-mail address or an IP address in a
context object (a refused sign-in, a rate-limited client, a mailed link) reached the log store in clear. GDPR
Arts. 5(1)(c) and 25 ask for no more personal data than the purpose needs; the log's purpose is correlation, and the
audit trail holds the full value.

`redactContext` now masks, in every string value at any depth, an e-mail address to its first character and domain
(`a***@example.test`) and an IP address to its network part (`203.0.113.xxx`, `2001:db8:85a3::xxxx`); strings over
2 KB are left alone for throughput; a sensitive key is still redacted whole, never merely masked. Tests:
`server/utils/__tests__/logger.test.ts` (`red/logger-before-fix.txt`, `green/logger-after-fix.txt`).
