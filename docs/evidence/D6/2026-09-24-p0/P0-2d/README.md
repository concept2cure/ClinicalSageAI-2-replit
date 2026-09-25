# P0-2 (d) — the connector's dynamic client registration was open to anyone (IAM-02, High if `MCP_ENABLED=true`)

**Row:** D6 (row D8 owns the connector itself). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-02, the
"dynamic client registration is open" clause. **Plan item:** P0-2, part (d) — "closed or allow-listed". Parts (a)–(c)
(token scope, revocation and account standing on the connector's verifier) are the D8 lane's
(`docs/work-orders/README.md`, the D8 row) and are not touched here.
**HEAD at the red run:** `5c978992`. No migration, no schema change, no new dependency.

## What was wrong

`server/mcp/index.ts` `createMcpRouter` mounts the MCP SDK's `mcpAuthRouter`, which serves `POST /register` (RFC 7591)
whenever the provider's `clientsStore` implements `registerClient` — and `ConceptToCureOAuthProvider` does, because a
Claude connector onboards by registering itself. The SDK handler validates the body against its metadata schema
(`redirect_uris: z.array(SafeUrlSchema)`: any parseable URL, any scheme the schema does not name as dangerous, fragments
included) and writes the row to `mcp_oauth_clients`. Nothing in front of it looked at *which* origin was registering.

So anyone on the internet could `POST /register` with any `client_name` and any `redirect_uris`, and the consent page
(`server/mcp/auth/consent.ts`) would then present that client, by the name it chose, to a signed-in user and — on
consent — send the authorization code to the attacker's redirect URI. The `red/` file shows it at HEAD:
`{"client_name":"Evil","redirect_uris":["https://attacker.example/cb"]}` answers **201** with a `client_id`. The only
control was the SDK's own 20/h rate limit on the route, which bounds the rate of registrations, not who may register.

Closing the route outright was ruled out by the D8 lane, correctly: with no `registration_endpoint` the connector's
onboarding fails, and whether the connector ships is the founder's call. The control here closes the finding
without deciding that question.

## What is true now

- **`resolveMcpConfig` carries a `clientRegistration` policy** (`server/mcp/config.ts`):
  - `redirectOriginAllowlist` from `MCP_CLIENT_REDIRECT_ALLOWLIST`, comma-separated origins, trimmed and lower-cased
    (`https://claude.ai,https://claude.com`). Each entry must be an http(s) URL with no path, query, fragment or
    credentials. **A malformed value throws at resolution** — a path, a missing scheme, `ftp://`, an empty entry
    between two good ones — so a typo can never resolve to an open or partial list. Unset or blank → `null`.
  - `requireHttpsRedirects`: true unless `NODE_ENV` is `development` or `test`, where `http://localhost`,
    `http://127.0.0.1` and `http://[::1]` are also admitted (the MCP inspector and other local clients).
  - `openInProduction`: `NODE_ENV=production` **and** no allowlist. This is the one state the finding describes, made
    explicit rather than implicit.
- **A guard sits in front of the SDK handler** (`server/mcp/index.ts`):
  `router.post('/register', rateLimit(20/h per IP), express.json({ limit: '16kb' }), clientRegistrationGuard(config),
  clientRegistrationBodyError)`, mounted **before** `router.use(mcpAuthRouter(...))`. `checkClientRegistration` is a
  pure decision over the body: no `redirect_uris` array, or an empty one, or no JSON object at all →
  `400 {"error":"invalid_client_metadata"}`; an entry that is not a string, not an absolute URL, carries a fragment, is
  not https (outside the loopback exception), or — when the allowlist is set — has an origin that is not on it →
  `400 {"error":"invalid_redirect_uri"}` (RFC 7591 §3.2.2 shape). Matching is by `URL.origin`, so `https://claude.ai.attacker.example`,
  `https://claude.ai:8443` and `https://claude.ai@attacker.example` are all foreign. One bad entry refuses the whole
  registration. When the decision is null the guard calls `next()` and the SDK handler runs unchanged — its schema
  validation, its own 20/h limiter and the store are untouched; the end-to-end test shows a `https://claude.ai/...`
  registration reaching it and answering 201.
- **The error description names the entry by index, never by value**, nothing about the refusal is logged, and the
  body is never logged (pinned: every logger method is spied during a refusal and the offending URI appears in none).
  A body the JSON parser refuses (not JSON, a bare string, over 16 KB) is answered in the same RFC shape by
  `clientRegistrationBodyError` rather than by Express's final handler, whose development-mode page prints the stack.
- **Express matches the route with the same spellings the SDK's `use('/register')` answers** (`/register/`,
  `/REGISTER`, `?query`), so no path spelling reaches the SDK handler around the guard (pinned).
- **The outer rate limit counts refused attempts** (the SDK's inner limiter only sees admitted ones), so the route
  cannot be used to fill `mcp_oauth_clients` or to probe the allowlist at speed: the 21st attempt in an hour is 429.
- **Production with no allowlist logs one structured warning at router creation** — `[mcp] Dynamic client
  registration (POST /register) is open in production … Set MCP_CLIENT_REDIRECT_ALLOWLIST …`, context
  `{ control, finding: 'IAM-02', plan: 'P0-2d' }` — never per request, and nothing about the state is exposed on the
  wire. The RFC 8414 document still advertises `registration_endpoint`; the connector needs it.

| | File | Result |
|---|---|---|
| red | `red/mcp-client-registration-before-fix.txt` | **17 of 19 fail on HEAD `5c978992`**: `clientRegistration` is undefined on the config, `clientRegistrationGuard` is not a function, no `/register` route layer precedes the SDK router, a malformed allowlist does not throw, no warning is emitted, and end to end a foreign origin **registers with 201**. The two that pass are controls (the rest of the config's shape; no warning outside the open state). |
| green | `green/mcp-client-registration-after-fix.txt` | 19 of 19 |
| existing | `green/existing-suites.txt` | `server/mcp/__tests__/mcp-auth-contract.test.ts` 8 of 8 (the D8 lane's suite, run not edited; it pins that `registration_endpoint` is still advertised). `mcp-connector.dbtest.ts` needs PostgreSQL and was not runnable on this host. |
| gates | `green/gates.txt` | `check:security-patterns` 0 violations; `ci:unauthenticated-fetch` 64 scanned, 0 baselined, unaffected; `ci:server-error-leaks` 146 baselined, none gained; eslint on the three files 0 errors, 0 warnings (nothing added to the warning ratchet trunk CI is already red on). |

Test: `server/__tests__/security/mcp-client-registration.contract.test.ts` — the guard alone over supertest with a
probe standing in for the SDK handler (9 cases), the config (4), and `createMcpRouter` itself (6: router-stack order,
end to end through the real SDK handler over the process-wide `pg` mock, path spellings, rate limit, the one warning
and its absence). `green/typecheck-scoped.txt`: a scoped `tsc --noEmit` over the three changed files plus the repo's
ambient `*.d.ts` reports **nothing** for them; the 7 diagnostics it does print are in three transitively imported
modules this item does not touch (`governedDocumentContractService.ts`, `authoring-permissions.ts`,
`orgMembership.ts`) and are the scoped include's, not the code's. The full-tree check was not run on this host.

## Not done here

- **Whether production ships an allowlist, and which origins, is the founder's decision.** The engineering half is
  in place: set `MCP_CLIENT_REDIRECT_ALLOWLIST=https://claude.ai,https://claude.com` (or whatever the connector
  platform's callback origins are) in the production environment and registration is bound. **With no allowlist,
  registration stays open in production** — any https origin may still register — and the boot log says so once.
  Nothing here closes registration outright; if the decision is to close it, the provider's `registerClient`
  (D8's `server/mcp/auth/provider.ts`) is the switch, and the SDK then stops advertising `registration_endpoint`.
- A registration that passes the guard is still stored under the `client_name` the caller chose, and the consent
  page still shows that name. Binding the *name* to the origin (or showing only the redirect host, which the page
  already prints) is a consent-page change in D8's files.
- The D8 lane owns the token-scope half (a `c2c:read` token is a full API session; `requireScope` reads no `scope`)
  and the account-standing half (`verifyPlatformBearer` and the consent POST read neither the revocation list nor
  `users.status`) of IAM-02 / P0-2, in `server/mcp/auth/*`, `server/middleware/tokenType.ts` and
  `server/mcp/__tests__/*`. None of those files is touched here.
- `.env.example` / deployment documentation does not yet list `MCP_CLIENT_REDIRECT_ALLOWLIST`; that file is outside
  this item's files and is one line for whoever next edits it.
