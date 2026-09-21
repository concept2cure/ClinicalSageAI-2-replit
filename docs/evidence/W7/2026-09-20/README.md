# W7 — Connector for Claude (row D8) — evidence, 2026-09-20/21

**Row moved:** D8 "Connector for Claude". **Status: built and proven locally; row not green** — the
row's named evidence is a transcript from a *second machine's* Claude client against *staging*
plus the Connectors Directory acknowledgement, and both need D1 (a hosted origin) and the founder.

## Files here

| File | What it is |
|---|---|
| `transcript-mcp-client.md` | A **separate Node process** (`server/mcp/client-transcript.ts`, official SDK `Client` over `StreamableHTTPClientTransport`) against the dev server on port 5300 with a dev-login bearer: unauthenticated 401 + `resource_metadata`, RFC 9728 metadata, `initialize`, `tools/list` (19 tools with annotations, scope and governed flag), `c2c_list_projects`, **`c2c_assess_sequence_readiness`** (the readiness tool) on sequence 1, `c2c_get_sequence_status`, and the model-backed tool's verbatim refusal with no API key. |
| `oauth-pkce-flow.md` | The full OAuth 2.1 flow driven by a script standing in for the Claude client: RFC 7591 registration (201), `/authorize` consent page (CSP-nonced), `/oauth/consent` with a verified platform session → 302 with code+state, `/token` with a **wrong** PKCE verifier → 400, right verifier → 200 (`scope: c2c:read c2c:draft`), **code replay → 400**, the issued token listing 19 tools and reading submissions, the governed write **denied for insufficient scope**, refresh rotation, **rotated-refresh reuse → 400**, **scope widening on refresh → 400**. |
| `test-output.md` | Both vitest lanes: 8/8 contract tests (pg mocked) and 10/10 real-PostgreSQL tests under `RLS_ENFORCE=on`. |

## Verified by making the check fail

The tenant-scoping assertion was exercised against a mutation: `c2c_list_projects` was edited to
call `listPrograms(2 /* ignores the principal */)`, and the real-DB test went red —

```
× c2c_list_projects: A sees A’s program; B sees B’s and never A’s
  AssertionError: expected [ Array(6) ] to include 'W7-a'
```

— then the file was restored (`grep -c MUTATION server/mcp/tools/catalog.ts` → 0) and the lane
re-ran green (`test-output.md`). The PKCE, replay, refresh-reuse and scope-widening checks in
`oauth-pkce-flow.md` are each shown failing on the case they exist to catch.

## Gates run

| Gate | Result |
|---|---|
| `npx eslint server/mcp` | 0 errors, 0 warnings |
| scoped `tsc` (server/mcp + server/index.ts + tests) | clean |
| `ci:gateway-bypass` | OK — no new bypasses |
| `ci:launch-scope` | OK — 6 apps, 41 surfaces, fixture-free |
| `ci:migration-set-order` | OK — 291 migrations, sweep last |
| `ci:migration-drop-safety` | OK |
| `ci:migration-prefix-collisions` | OK — no new collisions |
| `ci:insert-columns-declared` | OK — no new violations |
| `ci:unbacked-tables` | OK |
| `ci:purge-coverage` | **fails on `relation_extraction_log` — not W7's table.** W7's two org-keyed tables cascade from `organization_users` and are not in the residue. |

## What is proven

* Remote MCP server at `/mcp` (Streamable HTTP, stateless) with 19 hand-curated tools, each with
  title, description, JSON-schema input, the four annotations, a scope and a governed flag.
* OAuth 2.1 resource-server contract per the MCP authorization spec (401 + `WWW-Authenticate
  resource_metadata`, RFC 9728/8414 metadata) and a minimal authorization server (PKCE S256, DCR,
  refresh rotation, revocation) storing clients/codes/refresh tokens in Postgres via
  `migrations/20260920_mcp_oauth.sql` (additive, IF NOT EXISTS, public, `organization_id INTEGER
  NOT NULL`, above the final sweep pair).
* One verifier: bearer validation is `verifyJwtWithRotation` + `requireAccessTokenReason` +
  a live membership check — the API's own rules. A refresh-class token is rejected.
* Tenant context from the token's `organizationId` on every call; a second organisation sees
  none of the first's projects, documents or sequences, and cross-tenant ids are refused.
* Every call audited through `auditService.logAction` with tool name, org, user, client, scopes
  and outcome (asserted against `audit_logs` in the DB lane).
* The model-backed tool goes through `getGateway()` and returns the gateway's refusal verbatim
  without a provider key; demo-mode responses are refused too.
* The governed write creates a draft leaf via `submission-service.upsertLeaf` and returns the
  Submission Center sign-off link; it cannot sign, freeze or transmit.

## What is not proven / open

* Not run from a second machine and not against staging (needs D1). `MCP_PUBLIC_URL` must be an
  HTTPS origin there; the SDK refuses non-HTTPS issuers except localhost.
* Directory submission, acknowledgement, support/security mailboxes and the published privacy
  policy are the founder's (`docs/connector/DIRECTORY_SUBMISSION.md`).
* The consent page's login path (`/api/auth/login` + `/api/auth/mfa/verify` from the browser)
  was exercised with a platform session token, not with a live password + MFA round trip.
* `c2c_search_vault_documents` and `c2c_draft_agency_response` could only be proven in their
  fail-closed branch here (no embedding/model provider key locally).
* The local `c2c` role lacks INSERT on `audit.tamper_proof_log` (pre-existing environment gap);
  the chained `audit_logs` write — the one the tests assert — succeeded.
