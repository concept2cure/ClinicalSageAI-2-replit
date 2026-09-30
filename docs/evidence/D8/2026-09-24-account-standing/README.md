# D8 — the connector refuses accounts out of use, its grants work under RLS, and its tokens open nothing else

**Row:** D8 (Connector for Claude). **Findings:** review 2026-09-22 follow-through #6 ("the MCP connector accepts
suspended or deprovisioned accounts", `docs/evidence/reviews/2026-09-22/follow-through/README.md`); security audit
2026-09-24 IAM-02, plan item P0-2 parts **(a)** (connector tokens outside `/mcp`) and **(c)** (revocation and
`users.status` on `verifyPlatformBearer` and consent). Part (d), client registration, is D6's (`5c10785e`).
**Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`, claimed on `docs/work-orders/README.md` before the work.
**Fix commit:** `3bdb50458` (2026-09-30). No migration, no schema change, no new dependency.

The work was done on 2026-09-25 and its first push lost three ref races, so it landed five days and ~860 trunk commits
later. It was rebased, re-verified from a freshly built database, and re-proven against the trunk it landed on. Two
trunk commits touched the same code meanwhile, both kept:

- `53b5545db` (`…01FSu2RL`, 09-25) made the connector's membership read (`store.ts` `findMembership`) refuse an account
  that is not active, or any member of a suspended organisation. That closed the suspended/deprovisioned half of
  finding #6 at every door — as "no longer a member", which is not true: the membership exists.
- `fc5f5d31f` (D6 P1-38, 09-26) made every connector token a registered session (`openConnectorSession`), and noted
  that `verifyPlatformBearer` "does not yet read the claims the connector token carries (IAM-02 (a)–(c), the D8
  lane's)". It now does, through `verifyLiveToken`.

## What was wrong on trunk the day this landed

`red/1-trunk-before-fix-dbtest.txt` — the new suite against trunk's code, **11 of 14 fail**:

1. **No client can connect in production.** `mcp_oauth_authorization_codes` and `mcp_oauth_refresh_tokens` carry
   `organization_id` and are under the tenant sweep's policy. `server/mcp/auth/store.ts` touched them in the pre-auth
   scope, which carries no tenant and by design bypasses no policy (`server/db/tenantStore.ts`). Under
   `RLS_ENFORCE=on` — the only mode production boots in — the consent POST fails with **"new row violates row-level
   security policy for table mcp_oauth_authorization_codes"** (500, for the active control account too), every
   `/token` lookup finds nothing, and redeem and revoke match nothing.

   Not seen before because the connector's real-database suite (`mcp-connector.dbtest.ts`; the W7 evidence's
   "10/10 … under `RLS_ENFORCE=on`") connects as the database owner — a superuser, whom RLS never binds — and mints its
   tokens directly, never driving consent or `/token`; the W7 OAuth walk-through ran against a dev server.
2. **A signed-out session kept the connector.** `verifyPlatformBearer` — the one verifier, called by `/mcp` **and** by
   the consent POST — called `verifyJwtWithRotation` directly: no revocation list, no password change, no session
   registry. A token its holder had signed out opened `/mcp` (200).
3. **A connector token was a full platform session (P0-2a).** A connector token is `type: 'access'` with
   `token_use: 'mcp'`, and no authenticator read `token_use`: a token consented for `c2c:read` passed the global `/api`
   gate and every router's `authenticateToken` (200), and equally the sockets, the collaboration server, and the
   enterprise route that mints a fresh first-party token from the token it is shown.
4. **Refusals said the wrong thing.** A suspended account was refused (`53b5545db`) as "no longer a member" at `/mcp`
   and `/token`, and as "Sign-in could not be verified. Sign in again" at consent — advice that cannot help it.

`red/2-trunk-before-fix-unit.txt` — **7 of 30**: the token-class rule (3), and every case of the fail-closed suite
(4): with the standing unreadable, trunk admitted — `/mcp` 200, consent issued a code, both exchanges issued tokens — because it never asked.

`red/history-2026-09-25/` — the same suite on 2026-09-25's trunk, before `53b5545db`: unchanged code 11/14 (consent
500 for everyone), and with only the grant store fixed **9 of 14 on the findings themselves** — a suspended account's
session opened `/mcp` (200) and authorised a new client (302 with a code); a grant outlived the suspension.

## What is true now

- **The connector's verifier is the platform's.** `decodeAccessClaims` checks the signature, then the token class,
  then `verifyLiveToken` (`server/services/token-revocation.ts`) — revocation, account standing, a password change
  after issue, and session inactivity (P1-38's registry) — the check the `/api` gates, sockets, users and enterprise
  routes and the collaboration server make, in `authenticateToken`'s order. Reused, not copied.
- **Both `/token` exchanges ask the canonical question first.** `liveGrantorMembership` — one helper replacing two
  duplicated membership blocks — calls `isAccountActiveBeforeTenant` (`server/services/account-standing.ts`) before
  the membership read, and on a refresh **before** the rotation, so a refusal leaves the grant as it was and
  reactivation restores it (asserted).
- **`53b5545db`'s predicate stays, as a backstop**, and takes "active" from `ACCOUNT_STATUS_ACTIVE` rather than a
  second literal, so the definition is single-sourced. The canonical check runs first on every path and is what
  refuses, with the reason. Its organisation-suspension clause is kept: nothing else on the connector reads that.
- **Fail closed, and say which.** An unreadable revocation list or account is an SDK `ServerError` (500) at `/mcp` and
  `/token` and a 503 at consent — never a pass, never a 401 "bad token" that would send the user back through consent
  for an outage. An account out of use is told `This account is not active. Contact your administrator.` at `/mcp`
  (in `WWW-Authenticate`), at consent, and at `/token`.
- **One token-class rule, every authenticator that calls it** (`server/middleware/tokenType.ts`). A token carrying any
  `token_use` is refused on both entry points with `delegated_token`, whatever its `type`. The connector's verifier
  alone passes `{ delegatedUse: 'mcp' }`, which admits that use and no other, and nothing the rule otherwise refuses.
- **Grants are tenant-routed.** A code or refresh token is `<organizationId>.<secret>`; each grant query runs in that
  organisation's tenant scope (no role). The row is found by the sha256 of the whole string, so a prefix changed to
  another organisation's id only narrows the search to rows it cannot match; the organisation is already in clear in
  the access token. A string without a well-formed prefix names no grant.

## Proof

Real PostgreSQL 16 + pgvector, built as CI builds it (blank → `install-fresh` → `deploy-migrate`, 2026-09-30), the
suite connecting as a freshly provisioned **NOSUPERUSER NOBYPASSRLS** runtime role with `RLS_ENFORCE=on` (its first
assertion). The connector is production's `createMcpRouter` on a real HTTP server, driven as a client drives it:
`/register`, `/authorize`, consent, `/token`, `/mcp`. The `/api` authenticators are production's own. Accounts are taken
out of use by the admin route's and SCIM's statements; a session is signed out by `revokeToken`, as logout does.

| File | What it shows |
|---|---|
| `red/1-trunk-before-fix-dbtest.txt`, `red/2-trunk-before-fix-unit.txt` | The suites against the trunk this landed on, before the fix: 11/14 and 7/30. |
| `red/history-2026-09-25/` | The same on 2026-09-25's trunk, including the run that isolates the standing defects from the store's. |
| `green/dbtests-after-fix.txt` | **37/37**: the new suite 14/14, the connector suite 10/10 (P1-38's update to it, executed here for the first time — its author had no database), F-29's 13/13. |
| `green/unit-after-fix.txt` | **72/72**: fail-closed 8/8, token class, connector contract, P1-38's session suite, the `findMembership` PGlite suite, the MCP role gate, D6's registration contract. |
| `revert-proofs.txt` (`revert-proofs.py`) | Each fix undone in turn, two of them fail-open mutations: **7 of 7 turn a test red**. The harness refuses a revert that changes nothing. |
| `green/gates.txt` | Guards; typecheck 0; lint ratchet unchanged; **605/605** across 67 dependent unit files. |

M2 (the exchanges skip the canonical check) first came back *green* in the real-database suite on this trunk:
`53b5545db`'s backstop still refused, as "The authorising membership no longer exists". The suite now pins the true
reason at `/token`, and M2 is red in both suites.

## Not done here, and why

- **Handed on — two trunk gates red, neither touched by this change.** `audit-requestdb-coverage
  --strict-no-regression` fails on `server/routes/c2c/artifact-project-scope.ts` (`a1d99e1b8`, `…01KnUGoX`), and
  `ci:tenant-entry-points` on `server/routes/mdx-admin.ts` changed since its justification (`c0056614d`,
  `…01YZFCXR`: re-read, then refresh the digest).
- **P0-2 (b), `requireScope` reads `scope`.** Not edited: a connector token is refused by every first-party
  authenticator before any scope check runs; its scopes are enforced per tool inside `/mcp`.
- **Founder / D6 — a password change and connector grants.** Through `verifyLiveToken` a password change ends connector
  *access tokens* issued before it. It does not end a connector *grant*: a refresh token authorised before the change
  keeps minting access. Whether it should revoke third-party grants is a product decision, not defaulted.
- **RFC 7009 access-token revocation.** `POST /revoke` revokes refresh tokens; for an access token it is a no-op
  (1-hour life). RFC 7009 says SHOULD. Reported.
- **Grants issued before this change** (unprefixed) are refused and the client authorises again — reachable only where
  the connector ran with RLS off, since under RLS no grant could be issued.
- **The connector suite's two-tenant proof still runs as a superuser.** The new suite runs one tool call as the runtime
  role; `mcp-connector.dbtest.ts`'s cross-tenant cases do not bind RLS. Next in this lane.
