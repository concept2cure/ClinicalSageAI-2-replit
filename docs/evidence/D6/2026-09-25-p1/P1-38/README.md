# P1-38 — every access-token mint is a session; the enterprise MFA step asks the account its own factor (IAM-02 / IAM-06 / IAM-08 residuals)

**Row:** D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-02, IAM-06, IAM-08 — the residuals the
2026-09-26 lens named (`docs/evidence/reviews/2026-09-26/security.md`, "Residuals noted, not raised as new ids").
**Plan item:** P1-38. **Red run against:** HEAD `51d61713` (the files under test unchanged by the two commits that
followed, `51d61713` → `2211cfa1`). **Green run against:** the working tree at `2211cfa1` with this item's changes.

## What was wrong

- **(a) Two access-token mints bypassed `openSession`.** P1-1 made `openSession` "the one door every sign-in mints
  through": the session's id, start and idle window in the token, registered against the account's concurrent-session
  limit. Two `type: 'access'` mints were never brought through it, so their tokens carried no `sid`, `sst` or `idl`, held
  no slot, had no idle window and no lifetime of their own:
  - `server/routes/setup.ts:147-158` — the first-run bootstrap token (single-use, self-closing route; low severity, but
    "every mint" was not true);
  - `server/mcp/auth/platform-token.ts:155-173` — the connector access token `mintAccessToken` signs at the OAuth `/token`
    exchange and on every refresh (inside IAM-02's scope).
  - And a third the lens did not name, found by the extended contract test: `server/auth.ts:370-449` `login()`, a
    programmatic sign-in that verified a password and minted an access token with no MFA, no lockout and no session — with
    **no caller anywhere** (`grep -rn "\blogin(" server tests` finds none; no re-export; no test).
- **The contract test could not see them.** `routes/__tests__/session-open-contract.test.ts` counted `openSession(` in
  three named route files and refused `newSessionClaims(` there. A mint in any other file, or a bare `jwt.sign` beside a
  correct one, passed.
- **(b) The enterprise MFA step tried the emailed code first for every account.** `server/routes/authEnterprise.ts:524`
  (`POST /api/auth/enterprise/verify-mfa`) called `emailOtpService.verifyEmailOtp` unconditionally and fell back to the
  authenticator — the literal shape of IAM-08, fixed on `routes/auth.ts`'s `/mfa/verify` by P1-2 part 2 and left on this
  door. Not exploitable in the normal flow (the sibling `/verify-password` and `/mfa/resend` mint no emailed code for an
  authenticator account), but the order itself was the defect, and a row in `email_otps` from any other path would have
  signed an authenticator account in.

## What is true now

**`server/services/session-inactivity.ts`**

- `openConnectorSession(userId, accessTtlSeconds, organizationSettings?, now?)` (line 438): a connector access token is
  a session — the same claims, the same `registerSession`, the same 12-hour lifetime rule — with two documented
  differences the connector's semantics require:
  - **Idle policy:** the idle window is the token's own TTL, held inside the platform window `[1 min, 24 h]`
    (`clampIdleSeconds`, shared with `idleWindowSecondsOf`; the platform default when the TTL is not a number). A
    connector is a client acting for a person between tool calls, with no "walked away" to detect; its access token is
    short (`MCP_ACCESS_TOKEN_TTL_SECONDS`, 3600 by default) and dies on its own, and renewal is the OAuth refresh grant,
    bounded by the refresh token's TTL, rotation and revocation in `mcp_oauth_refresh_tokens`. So the tenant's 15-minute
    window is not imposed on a client that legitimately goes quiet, and the claim says what is true: the token is idle when
    it has expired.
  - **Its own pool:** connector sessions register under `connector:<userId>` at the tenant's `maxConcurrentSessions`,
    not in the sign-in pool. Every refresh mints a new access token and so a new session (the grant cannot be the
    session: a 12-hour lifetime on the grant would end a 30-day refresh chain by evening), and a connector refreshing every
    hour would otherwise supersede the person's browser sessions by noon. Beyond the limit the oldest connector token is
    superseded, as a sign-in's would be. `accountKeyOf` routes a token with `token_use: 'mcp'` to that pool, so a
    connector session found idle or over its lifetime frees its own slot.
  - `CONNECTOR_TOKEN_USE = 'mcp'` is the one definition; `platform-token.ts`'s `MCP_TOKEN_USE` is it.
- `openSession` is unchanged; the two are the only ways an access token gets its session.

**`server/routes/setup.ts:151`** — the bootstrap token is `openSession(result.user.id, result.org.settings)` spread into
the payload: the new organisation's window (the default until it sets one) and a registered slot.

**`server/mcp/auth/platform-token.ts:160-180`** — `mintAccessToken` is async and opens its session through
`openConnectorSession(m.userId, input.ttlSeconds, m.organizationSettings)`; `provider.ts` awaits it.
`store.ts`'s `Membership` carries `organizationSettings` (`o.settings` selected in `findMembership`) so the limit is the
tenant's, read at the same moment as at sign-in.

**`server/auth.ts`** — the dead `login()` and the `verifyPassword` wrapper only it called are deleted (115 lines), with
the three imports only they used. Rule followed (CLAUDE.md, "Deleting a user-facing capability"): it is a function, not
a route or surface, and had no caller; the history search `git log --all --diff-filter=D -- 'server/auth*'` finds no
prior deletion of an auth file, and `git log -S'export async function login(' -- server/auth.ts` shows the function last
changed in `6f79a000`. The reachable, canonical sign-in is `server/routes/auth.ts` `POST /api/auth/login` (MFA challenge,
lockout, `openSession`), proven reachable by `routes/__tests__/auth-mfa-challenge-factors.test.ts` and the auth surface
suites; the enterprise door is `POST /api/auth/enterprise/verify-password` + `/verify-mfa`. Zero duplication: a parallel
sign-in that skipped MFA, lockout and the session registry is not kept for a caller that does not exist.

**`server/routes/__tests__/session-open-contract.test.ts`** — walks every non-test source file under `server/`, reads
every `jwt.sign(` payload literal (comments between the call and its payload skipped), and for each payload saying
`type: 'access'` requires a session spread (`...session`, `...devSession`, `...(await openSession(…))`,
`...continuedSessionClaims(…)`) and, per file, a call to `openSession` / `openConnectorSession` /
`continuedSessionClaims` and never `newSessionClaims`. A payload that is not a literal fails the scan by name rather than
passing unread. Floor: at least 12 access mints found (auth.ts 5, authEnterprise.ts 3, sso.ts 2, setup.ts 1,
platform-token.ts 1). The setup door joins the per-door `openSession` count.

**`server/routes/authEnterprise.ts:533-558`** — `/verify-mfa` reads the account's row before any code is tried
(`mfaEnrolmentOf(user).signInFactor`, the rule `/verify-password` applies when deciding whether to mail a code), calls
`verifyEmailOtp` only for an account **without** an authenticator, then `verifyLoginSecondFactor` (authenticator or
recovery code). The user row read for the response is that one read; the `Promise.all` no longer repeats it. The other
lane's uncommitted `/verify-password` hunks (IAM-18 item 8, timing pad) in the same file were left untouched.

## Evidence

| | File | Result |
|---|---|---|
| red | `red/before-fix.txt` | HEAD `51d61713`, code unchanged: **17 failed / 31 passed** across the five files. The contract scan names exactly the three bare mints — `auth.ts:416`, `mcp/auth/platform-token.ts:157`, `routes/setup.ts:147` — and `setup.ts` opens no session; the setup token carries no `sid`; `openConnectorSession is not a function` (4); `mintAccessToken` yields no `sid`, no `idl`, no supersession (5); the enterprise door calls `verifyEmailOtp` for an authenticator account and signs it in (200, `mfaMethod: 'email'`) — 4 of 5 cases (the email-account control passed, as it should). |
| green | `green/after-fix.txt` | the same five files and their neighbours (`authEnterprise-*` ×5, `session-registry-redis`, `mcp-auth-contract`, `auth-refresh-inactivity`, `auth-mfa-challenge-factors`): **14 files, 90 / 90 passed**. |
| green | `green/gates.txt` | `check:security-patterns` 0 violations / 2856 files; `ci:server-error-leaks` OK, 120 baselined sites, no file gained one. |
| green | `green/lint.txt` | ESLint HEAD vs now for every touched file: no count rose (`auth.ts` 1 → 1, the pre-existing `getUserRole`; `authEnterprise.ts` 10 → 10); the two new test files lint clean. |

Tests: `server/routes/__tests__/session-open-contract.test.ts` (extended), `server/routes/__tests__/setup.test.ts` (one
case: the token's `sid`/`sst`/`idl` and the `openSession` call), `server/mcp/__tests__/platform-token-session.test.ts`
(new), `server/services/__tests__/session-inactivity.test.ts` (four `openConnectorSession` cases, pool separation both
ways, slot freed when found over), `server/routes/__tests__/authEnterprise-verify-mfa-factor-order.test.ts` (new, five
cases beside the existing `authEnterprise-*` tests).

Re-run:

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/routes/__tests__/session-open-contract.test.ts server/routes/__tests__/setup.test.ts \
  server/mcp/__tests__/platform-token-session.test.ts server/services/__tests__/session-inactivity.test.ts \
  server/routes/__tests__/authEnterprise-verify-mfa-factor-order.test.ts
npm run check:security-patterns && npm run ci:server-error-leaks
```

## Left open

- **The connector's own verifier does not read the claims it now carries.** `verifyPlatformBearer`
  (`server/mcp/auth/platform-token.ts`) verifies the signature, the token class and the live membership, and checks
  neither revocation, account standing, idle, lifetime nor supersession — IAM-02 parts (a)–(c), the D8 lane's. Until it
  verifies through `verifyLiveToken` as the REST authenticators do, a connector token's session claims are enforced only
  when the token is presented to a platform authenticator (which admits `type: 'access'` tokens whatever their
  `token_use`; also IAM-02's). What this item makes true is the claim in the token and the slot in the registry; what it
  does not make true is enforcement at `/mcp`.
- **A connector token's slot is freed when the token is found over or when the 12-hour prune reaches it**, not at
  sign-out: `POST /api/auth/logout` unregisters from the sign-in pool by the token's `userId`, and the OAuth `revokeToken`
  revokes refresh tokens only ("revocation of one [access token] is expiry"). Connector tokens are an hour long.
- **`server/mcp/__tests__/mcp-connector.dbtest.ts`** was updated for the async mint (`(await mintAccessToken(…)).token`)
  and **not executed**: it needs a PostgreSQL server (`vitest.db.config.ts`) and none is reachable here (`psql` cannot
  connect). The next credentialed run executes it.
- **The idle claim's ceiling.** A deployment that sets `MCP_ACCESS_TOKEN_TTL_SECONDS` above 24 hours gets an idle window
  of 24 hours on its connector tokens (the platform ceiling), which a platform authenticator would enforce before the
  token's own expiry. The default (one hour) is well inside it.
- **`server/routes/authEnterprise.ts` is shared with the IAM-18-8 lane's uncommitted `/verify-password` hunks** in the
  same working tree; the control tower separates the two hunks at commit time (theirs: lines ~43, ~274-278, ~348-357;
  this item's: the `/verify-mfa` block at ~533-570).
