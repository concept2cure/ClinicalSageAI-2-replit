# P0-2 residual (IAM-02 part b): a delegated credential is limited to what it was granted

Row **D6**, security tranche 4, 2026-10-01. Plan item P0-2; security audit 2026-09-24 IAM-02. Parts (a) and (c)
were closed by the D8 lane (`3bdb5045`, `b835cf15`) and part (d) by `5c10785e`. Part (b) reads "`requireScope`
does not read `scope`". The item asked: at HEAD, does a connector (MCP) token or an API key used on a general
`/api` route get refused, or limited by its scope? A `c2c:read` token must not be able to DELETE in the vault,
or to write anywhere.

> **Correction (fix round, same day).** The first round's conclusion that a `c2c:read` connector token could not
> write anywhere was wrong. Posted to the connector's own consent page, it authorised a new grant of every scope,
> including the governed write. The table below is what the first round found. See **Fix round** at the end for
> the defect, the fix and its red/green.

## What HEAD answered (66e82a6d), question by question

| Question | At HEAD | Where it is enforced |
|---|---|---|
| A `c2c:read` connector token on a launch-app write route | **Refused**, `401 AUTH_008`, before any handler runs. This holds on all 316 requests: 4 write methods × 79 API prefixes of the 7 launch apps. | `server/middleware/tokenType.ts` refuses any `token_use` (D8, `3bdb5045`). The boundary's `authenticateToken` (`server/middleware/auth.ts`) and `server/auth.ts` `authMiddleware` both call it. |
| The same token on the one `/api/v1` write route, which sits outside the boundary (pyramid PATCH) | **Refused** (401) | `server/auth.ts` `authMiddleware` → `requireAccessTokenReason` |
| The same token at `/mcp` on a write tool | **Refused**: `Insufficient scope` (`mcp-connector.dbtest.ts`, green) | `server/mcp/tools/runtime.ts:215` reads the token's scopes for each tool call. `c2c_file_draft_for_review` alone writes; it needs `c2c:file` and an editor role. Every `c2c:read` tool is a pure read: its service functions contain no INSERT, UPDATE or DELETE. `mcp-auth-contract.test.ts` pins the catalogue (one governed tool; every other tool `readOnlyHint: true`). |
| Does `requireScope` read the scope? | **Yes**, for API keys: a key without the route's scope gets `403 INSUFFICIENT_SCOPE` with `missing`. It is pinned now; until today no test covered it. | `server/middleware/enterprise-security.ts` `requireScope` reads `req.apiScopes`. For connector tokens the question is moot: (a) refuses them on `/api` entirely. |
| An API key alone on a launch-app write route | **Refused** (401) by the boundary, which accepts Bearer sessions only | `createAuthBoundary` → `authenticateToken` |
| **An API key together with a session from another organisation** | **Admitted, inside the key's tenant scope. This was the defect.** | see below |
| **An API key alone on a non-`/api/v1` path the boundary leaves open** (e.g. `/api/csp-report`) | **Ran inside the key's tenant scope** | see below |

No API key can carry a write scope: `API_KEY_SCOPES` (`shared/schema/api-keys.ts`) has only `:read` scopes, and
every public-API route is a GET.

## What was wrong

`validateApiKey` is mounted app-wide by `applySecurityMiddleware`, ahead of the `/api` boundary. On any path, a valid
`X-API-Key` made it run the rest of the request inside `runWithTenantScope({ tenantId: <key's organisation>, role: 'api_key' })`
and set `req.tenantId` to the key's organisation. The boundary's tenant step (`establishRequestTenantScope`) is
idempotent: it keeps a real tenant scope it finds already open. So a request carrying **a read-only key of
organisation A and the session of a user in organisation B**:

- passed the boundary on B's session (B is a member of B);
- reached every launch write handler as **B's user**, under **A's row-level-security scope**, with `req.tenantId = A`;
- and through any handler that relies on RLS, or reads `req.tenantId`, it read **and wrote** A's rows.

The red run shows this on every write method of every API prefix of all seven launch apps, e.g.
`POST /api/projects/…: B's user, RLS scope A, req.tenantId A; A's row visible 1, updated 1`. It shows the same on
the `/api/v1` pyramid PATCH chain (`authMiddleware` → handler, 200). In other words, a leaked read-only integration key plus
any account of one's own (sign-up creates an organisation) became write access to the key's organisation, and the
key's scopes limited nothing. A key presented alone off the public API (e.g. `/api/csp-report`, which takes no
session) also ran its handler inside the key's tenant scope.

## What is true now

`server/middleware/enterprise-security.ts` `validateApiKey` → `apiKeyRefusal` (one change, in the middleware that
opens the key's scope; no second checker). It refuses a key **before it is looked up** in two cases:

1. **The path is not the public API** (`/api/v1`, excluding its session alias `/api/v1/auth`) → `401 API_KEY_NOT_ACCEPTED`.
   No route outside `/api/v1` takes a key, and the session surface authenticates Bearer sessions only. The path is
   matched lower-cased, because Express routes case-insensitively and `/api/v1/Auth/…` reaches the session alias.
2. **The request also carries an `Authorization` header** → `401 AMBIGUOUS_CREDENTIALS`: one request, one principal.

On the public API a key alone behaves exactly as before: validated, scoped, and checked by `requireScope` (granted
→ 200; not granted → 403). The `requireScope` header now states why its pass-through for non-key requests is not a
way for a key to escape its scopes.

**Why 401, not the plan's "→ 403".** The plan's acceptance line assumed a credential that is admitted and then
limited. At HEAD neither delegated credential is admitted to the session surface at all. A connector token is
refused as a token class (`AUTH_008`, D8). A key is not a credential there (`API_KEY_NOT_ACCEPTED`). Both are
refused before any handler, which is the stronger result. A 403 for insufficient scope remains where a key IS a
credential: `requireScope` on the public API.

## Red / green

Test: `server/middleware/__tests__/delegated-credential-scope.dbtest.ts` (new, 32 cases). It runs as a
NOSUPERUSER NOBYPASSRLS runtime role with `RLS_ENFORCE=on`, using production's middleware in production's order:
`validateApiKey` app-wide, then `createAuthBoundary` on `/api`. The launch-app prefixes come from the launch catalog
(`shared/constants/launch-scope.ts` × `UI_SURFACES[].apiPrefixes`), not a hand-picked list. A probe behind them
records what a write handler is handed, then reads and updates an organisation-A row the way an RLS-reliant handler would.
Controls first: A's own session sees and writes A's row, and B's own session sees none of it.

| Case | Red (HEAD's `enterprise-security.ts`, final test) | Green (fix) |
|---|---|---|
| Posture, catalog coverage, A/B session controls (4) | pass | pass |
| `c2c:read` connector token × 7 launch apps (316 requests) + token class + `/api/v1` pyramid (9) | pass (already closed, D8) | pass |
| `requireScope` reads key scopes (1) | pass (already true) | pass |
| Key alone × 7 launch apps (7) | pass (boundary 401) | pass (`API_KEY_NOT_ACCEPTED`) |
| Key alone off the public API opens no tenant scope (1) | **fail**: scope opened for the key's organisation | pass |
| Key alone on the session alias `/api/v1/auth`, and `/api/v1/Auth` (1) | **fail**: handler ran in the key's scope | pass |
| A's key + B's session × 7 launch apps (7) | **fail**: B's user in A's scope, A's row read and updated | pass |
| A's key + B's session on the `/api/v1` pyramid write (1) | **fail**: 200, handler ran | pass (`AMBIGUOUS_CREDENTIALS`) |
| A's row never written by B (1) | **fail** | pass |
| **Total** | **11 failed / 21 passed (32)** | **32 passed (32)** |

The red is a revert-proof: the final test was run against `git show HEAD:server/middleware/enterprise-security.ts`
copied over the fixed file for that run, and the fixed file was then restored. An earlier red, taken with the
test before the code-pinning assertions, failed 9/30 on the same defect. A mutation run of the fix without the
lower-casing fails exactly the letter-case case (`/api/v1/Auth/…` → 200, handler ran): 1/32.

Files: `red/delegated-credential-scope.before-fix.txt`, `red/case-insensitive-alias.mutation.txt`,
`green/delegated-credential-scope.after-fix.txt`.

Neighbours (`green/`):
- `neighbour-unit-suites.txt`: 22 files (the security-middleware suites, auth-hardening, the public-API suites,
  the bootstrap gates, security-swarm-hardening (token class) and the MCP unit suites): 193/194 passed. The one
  failure is a 10 s timeout on `mcp-tenant-tool-policy`'s first test: a cold import of `AnaToolExecutor` at load
  average 24 on a shared VM. That suite does not load `enterprise-security`. Re-run alone with `--testTimeout=60000`: 3/3 passed.
- `mcp-suites.txt`: `mcp-connector.dbtest.ts` 10/10, including "the governed write is denied to a connector token
  without c2c:file". `mcp-account-standing.dbtest.ts` 13/14. The one failure is not this change; see hand-offs.
- `gates.txt`: `check:security-patterns`, `ci:server-error-leaks`, `ci:unauthenticated-fetch`,
  `ci:tenant-entry-points`, `ci:check-unrun-tests` and `ci:committed-secrets` all exit 0. ESLint on both files: 0 errors and 4 warnings, all four
  also present at HEAD.

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=3072
npx vitest run --config vitest.db.config.ts server/middleware/__tests__/delegated-credential-scope.dbtest.ts
npx vitest run --config vitest.db.config.ts server/mcp/__tests__/mcp-connector.dbtest.ts server/mcp/__tests__/mcp-account-standing.dbtest.ts
npx eslint server/middleware/enterprise-security.ts server/middleware/__tests__/delegated-credential-scope.dbtest.ts
npm run check:security-patterns && npm run ci:server-error-leaks && npm run ci:unauthenticated-fetch && npm run ci:tenant-entry-points && npm run ci:check-unrun-tests && npm run ci:committed-secrets
```

Fixture rows are tagged `p02b-` (organisations, users, `api_keys`, `chat_threads`) along with a `p02b_rt_*` role, and
are removed in `afterAll`; zero remained after the runs. The working tree's `server/services/account-standing.ts` (P0-4b,
uncommitted) reads `users.sessions_ended_at`. So this run applied P0-4b's own additive migration
`migrations/20261001_users_sessions_ended_at.sql` to the local `c2c_testdb` (ADD COLUMN IF NOT EXISTS plus a
re-armed trigger). Without it every authenticated request in any dbtest answers `503 SESSION_UNCHECKED`.

## Residuals and hand-offs (not edited: outside this item's files)

- **`establishRequestTenantScope` trusts any real scope it finds open.** This item removes the one pre-boundary
  middleware that opened such a scope from a non-session credential. But the rule that let it shadow the session is still
  there: a future pre-boundary scope would do the same. Proposed: on the session path, replace (or refuse) an open
  scope whose tenant is not the authenticated session's organisation. Owner: the tenant-scope lane.
- **Zero duplication, `server/routes/public-api.ts`.** Its `requireApiKey` re-validates every key the global
  `validateApiKey` already validated, so each request does two lookups and `request_count` is incremented twice.
  It also keeps a local `requireScope` beside the canonical one ("both must pass"). Proposed: route every public-API
  route through the canonical `requireScope` and delete the local one, then make one validator the validator. The
  router's validator has the per-key rate limit and the tenant-lifecycle check; the global one has the 503
  fail-closed on a key-store error.
- **Two e2e specs** (`tests/e2e/governed-lifecycle.e2e.spec.ts`, `tests/e2e/review-collaboration.e2e.spec.ts`)
  authenticate to `/api/concept2cure` with `x-api-key: dev-api-key` and no Bearer token. At HEAD that value already failed the
  key format check (401); now it is `401 API_KEY_NOT_ACCEPTED`. Neither spec exercised anything, before or after,
  and both should use the login flow.
- **For the P0-4b lane:** `mcp-account-standing.dbtest.ts` "a connector grant … ends when the account is
  deprovisioned" fails with P0-4b's uncommitted `account-standing.ts` and its migration. The loop reuses
  `members.held.session` after the "suspended" iteration reactivated the account, and P0-4b now ends every session
  when an account leaves `active`. The test needs a fresh session after reactivation.
- `mcp-tenant-tool-policy.test.ts` first case: its 10 s default timeout is shorter than the cold import of
  `AnaToolExecutor` under load (12 s measured).

## Fix round (2026-10-01, at `0e58e794`): a connector token authorised a wider grant at the consent page

### What was wrong

The adversarial verifier found that IAM-02 (b) was not closed. I reproduced it before changing anything (red below).
The consent POST (`server/mcp/auth/consent.ts`) checked the token it was handed with `verifyPlatformBearer`. That
verifier admits connector-issued tokens (`token_use: 'mcp'`) because `/mcp` is their resource server:
`platform-token.ts` passed `{ delegatedUse: 'mcp' }` to the token-class rule. The handler then issued an
authorization code for the scopes the `/authorize` request named (`pending.scopes`). Nothing compared those scopes
with what the token carried, and nothing checked the token's class.

So a `c2c:read` connector token, posted as `access_token`, authorised `c2c:read c2c:draft c2c:file` for any registered
client, with no user present. The code exchanged for an access token with that scope plus a 30-day refresh token.
`/mcp` enforces scope per tool (`server/mcp/tools/runtime.ts`), so the widened token ran `c2c_file_draft_for_review`,
the governed write, limited only by the user's editor role. A leaked one-hour read token became a month of write
access. Where `MCP_CLIENT_REDIRECT_ALLOWLIST` is unset, the code could also go to a redirect the token's holder had
registered. Clauses: 21 CFR 11.10(d), 11.300(c); HIPAA 164.312(a)(1); Annex 11 §12.

### What is true now

There is still one verifier and one token-class rule, and no second checker. `verifyPlatformBearer(token, config, purpose)`
now takes the purpose the bearer is presented for:

- `'resource'`, the default, is `/mcp`. It admits connector tokens exactly as before.
- `'grant'` is the consent POST. It passes no `delegatedUse` to `requireAccessTokenReason`, so a connector token is
  refused for its class **before any read**: `401 invalid_token`, "A connector token cannot authorise a grant. Sign in
  to Concept2Cure and try again." No code is issued and no `mcp_oauth_authorization_codes` row is written.

`consentHandler` verifies for `'grant'`. A first-party session consents exactly as before. The refresh grant was
already bounded (`provider.ts` refuses a scope beyond the original grant), and it is now pinned.

The answer is 401, not the 403 the verifier offered as one option. It matches the handler's other bearer refusals,
and it matches `/api`'s refusal of the same token (`AUTH_008`). The verifier's second option (verify without
`delegatedUse`) yields this status by construction.

### Red / green

Test: `server/mcp/__tests__/mcp-consent-delegated.dbtest.ts` (new, 10 cases). The setup matches
`mcp-account-standing.dbtest.ts`: a NOSUPERUSER NOBYPASSRLS runtime role, `RLS_ENFORCE=on`, the production `createMcpRouter`
on a real HTTP server, and the OAuth flow driven over HTTP (`/register`, `/authorize`, `/oauth/consent`, `/token`, then
`/mcp` through the SDK client). Each refusal case records what a code would have bought, so the red output says what
leaked.

| Case | Red (HEAD `consent.ts` + `platform-token.ts`) | Green (fix) | Mutation: default purpose `'grant'` |
|---|---|---|---|
| Posture: non-superuser runtime role, RLS on | pass | pass | pass |
| The user's session consents to `c2c:read`; the connector token carries exactly `c2c:read` | pass | pass | pass |
| That token at `/mcp` is refused the governed write (`Insufficient scope`) | pass | pass | **fail** (shut out of `/mcp`) |
| That token at consent: all three scopes, **another client** | **fail**: 302, code, 1 code row, token scope `c2c:read c2c:draft c2c:file`, governed write **filed** | pass: 401, no code, 0 rows | pass |
| ... all three scopes, its own client | **fail**: same as above | pass | pass |
| ... `c2c:read`, another client | **fail**: 302, code, 1 row, scope `c2c:read` | pass | pass |
| ... `c2c:read`, its own client | **fail**: same | pass | pass |
| The token still opens `/mcp` for a read (`c2c_list_projects`) | pass | pass | **fail** |
| A refresh cannot widen the grant (`400 invalid_scope`) | pass | pass | pass |
| The user's own session still consents to all three scopes, and that grant files the draft | pass | pass | **fail** |
| **Total** | **4 failed / 6 passed** | **10 / 10** | **3 failed / 7 passed** |

The mutation is an over-broad fix: one that refuses connector tokens at `/mcp` as well. The controls catch it. Files:
`red/consent-connector-token.before-fix.txt`, `green/consent-connector-token.after-fix.txt`,
`red/consent-default-purpose.mutation.txt`. The red run used HEAD's two files unchanged, confirmed with
`git diff --quiet HEAD`. The mutation was reverted afterwards and the restored file checked with `cmp` against the fixed copy.

### Neighbours (`green/neighbours-fix-round.txt`, `green/gates-fix-round.txt`)

- Real PostgreSQL: `mcp-connector.dbtest.ts` 10/10 and `delegated-credential-scope.dbtest.ts` 32/32.
  `mcp-account-standing.dbtest.ts` is 13/14. The one failure is the P0-4b case already handed off in the first round
  ("ends when the account is deprovisioned": a session reused after reactivation, refused "This session has ended").
  It fails the same way with `consent.ts` and `platform-token.ts` restored to HEAD; that control run is in the same file.
- Unit: six MCP suites, 34/34. They include `mcp-standing-unreadable` (consent still answers 503 when standing cannot be read),
  `mcp-auth-contract`, `platform-token-session` and `findMembership.pglite`. `security-swarm-hardening` and
  `session-open-contract`: 27/27.
- Gates: `check:security-patterns`, `ci:server-error-leaks`, `ci:unauthenticated-fetch`, `ci:check-unrun-tests` (the
  new dbtest is reachable through `vitest.db.config.ts`) and `ci:committed-secrets` all exit 0. `ci:tenant-entry-points`
  exits 1 on `server/jobs/auditChainIntegritySweep.ts`. Another lane has an uncommitted change to that file, and this
  round does not touch it.
- ESLint on the three files: 0 errors, 0 warnings.

### Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=3072
npx vitest run --config vitest.db.config.ts server/mcp/__tests__/mcp-consent-delegated.dbtest.ts
npx vitest run --config vitest.db.config.ts server/mcp/__tests__/mcp-connector.dbtest.ts server/mcp/__tests__/mcp-account-standing.dbtest.ts server/middleware/__tests__/delegated-credential-scope.dbtest.ts
npx vitest run server/mcp/__tests__/*.test.ts server/mcp/auth/__tests__/findMembership.pglite.test.ts server/__tests__/security/security-swarm-hardening.test.ts server/routes/__tests__/session-open-contract.test.ts --testTimeout=60000
npx eslint server/mcp/auth/consent.ts server/mcp/auth/platform-token.ts server/mcp/__tests__/mcp-consent-delegated.dbtest.ts
```

Fixture rows are tagged `p02bc-` (organisation, user, `mcp_oauth_clients`, submission, sequence, leaves, codes, refresh
tokens), along with a `p02bc_rt_*` role, and are removed in `afterAll`. None remained after the runs.

### Fix-round residuals

- **Open dynamic client registration in production** (`MCP_CLIENT_REDIRECT_ALLOWLIST` unset). `server/mcp/index.ts`
  only logs a warning. This round removes the escalation the verifier chained with it: a leaked token can no longer
  buy a grant. But any https origin can still register a client that a phished user then consents to. Whether
  production ships an allowlist is the founder's decision (`config.ts`). Proposed: set it in the production deploy
  configuration, or refuse to boot without it when `MCP_ENABLED=true`.
- The 24-hour window: `server/mcp/auth/consent.ts` and `server/mcp/auth/platform-token.ts` were last touched
  09-30 23:38 by `session_01JNRgCKWRqqJxZ1cJCyxoor` (`3bdb5045`, D8).
