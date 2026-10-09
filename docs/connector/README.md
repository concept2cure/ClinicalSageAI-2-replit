# Concept2Cure connector for Claude

**Positioning.** Claude drafts; Concept2Cure governs, validates and submits. The
connector gives Claude a scoped, audited window onto the regulatory operating
system: every number, readiness verdict, validation finding and precedent count
it returns is computed by a deterministic platform engine, the one model-backed
tool goes through the governed AI gateway and fails closed without a provider,
and the single write files a *draft* that a named human reviews and signs in
the app behind 21 CFR Part 11 electronic signature. Nothing the connector can do
freezes, signs or transmits a sequence.

## What it is

A remote [MCP](https://modelcontextprotocol.io) server (Streamable HTTP,
stateless JSON) mounted at `/mcp` on the platform, acting as an OAuth 2.1
resource server per the MCP authorization specification and — because the
platform had no OAuth issuer — as the minimal authorization server too.

| Path | Standard | Purpose |
|---|---|---|
| `POST /mcp` | MCP Streamable HTTP | The MCP endpoint. Bearer only. |
| `/.well-known/oauth-protected-resource/mcp` | RFC 9728 | Which authorization server protects `/mcp`, scopes supported. |
| `/.well-known/oauth-authorization-server` | RFC 8414 | Endpoints, `code_challenge_methods_supported: ["S256"]`, grants. |
| `GET /authorize` | OAuth 2.1 + PKCE | Renders the consent page; login runs through the platform's existing `/api/auth/login` (+ MFA). |
| `POST /oauth/consent` | — | Consent form target; issues a single-use, ten-minute authorization code bound to the user's organisation membership. |
| `POST /token` | RFC 6749/7636 | `authorization_code` (PKCE verified) and `refresh_token` (rotating; cannot widen scope). |
| `POST /register` | RFC 7591 | Dynamic client registration (public clients, `token_endpoint_auth_method: none`). |
| `POST /revoke` | RFC 7009 | Revokes a refresh token. |

Source: `server/mcp/` — `index.ts` (router), `auth/` (provider, store, verifier,
consent), `tools/` (the catalog), `server.ts` (McpServer factory).
Enable with `MCP_ENABLED=true`; set `MCP_PUBLIC_URL` to the deployment origin
(HTTPS required except for localhost).

## Authentication and tenancy

* **One verifier.** A bearer on `/mcp` is verified by `verifyJwtWithRotation`
  — the same function the REST API's `authenticateToken` uses — with the same
  `type: 'access'` token-class rule and a live `organization_users` membership
  re-check. A token the API would reject, the connector rejects.
* **Two token populations.** A first-party platform session token (login,
  MFA verify, dev-login) carries every connector scope: it is the user's own
  session. A connector-issued token (from `/token`) carries only the scopes
  the user consented to, is bound to `/mcp` as its RFC 8707 audience, and
  names its `client_id`.
* **Tenant on every call.** The token's `organizationId` becomes the tenant
  scope for the whole call (the platform's pool instrumentation sets the RLS
  session variables from it); every service the tools call takes that
  organisation id explicitly as well. A cross-tenant id is refused, never
  emptied.
* **Grants live with the membership.** Authorization codes and refresh tokens
  reference `organization_users(id) ON DELETE CASCADE`: remove the member and
  their connector grants are gone. Access tokens are one-hour JWTs; refresh
  tokens are hashed, 30-day, and rotate on every use.
* **Scopes.** `c2c:read` (listings, readiness, validation, reference,
  intelligence), `c2c:draft` (deterministic cover letter, gateway-backed
  narrative), `c2c:file` (the governed draft placement). Each tool declares
  exactly one; the runtime denies a call whose token lacks it and audits the
  denial.
* **Audit.** Every call — served, refused or denied — writes a row through the
  platform audit service (`audit_logs`, sha-256 chained, HMAC sealed) with the
  tool name, organisation, user, client id, scopes, outcome and duration. The
  governed write is recorded as `mcp_governed_tool_call`; the placement itself
  is additionally audited by the submissions spine.

## The tools

Nineteen hand-curated tools. `RO` = `readOnlyHint`, `D` = `destructiveHint`,
`I` = `idempotentHint`, `OW` = `openWorldHint`. Implementation names the
platform module the tool calls; the connector reimplements nothing.

| Tool | Scope | RO | D | I | OW | Governed | Implementation |
|---|---|---|---|---|---|---|---|
| `c2c_list_projects` | read | ✓ | – | ✓ | – | – | `regulatory-programs.service.listPrograms` |
| `c2c_list_submissions` | read | ✓ | – | ✓ | – | – | `submission-service.listSubmissions` |
| `c2c_list_sequences` | read | ✓ | – | ✓ | – | – | `submission-service.listSequences` |
| `c2c_get_sequence_status` | read | ✓ | – | ✓ | – | – | `getSequence` + `listLeaves` + `ectd/release-signature-status` |
| `c2c_assess_sequence_readiness` | read | ✓ | – | ✓ | – | – | `ectd/assess-dispatch-readiness.assessSequenceDispatchReadiness` |
| `c2c_readiness_overview` | read | ✓ | – | ✓ | – | – | `ana/org-readiness-overview.getOrgReadinessOverview` |
| `c2c_validate_ectd_structure` | read | ✓ | – | ✓ | – | – | `ectd/ectd4-validator.validatePackage` + external-validator posture |
| `c2c_sweep_contradictions` | read | ✓ | – | ✓ | – | – | AnA `detect_evidence_contradictions` (evidence-contradiction-detector) |
| `c2c_lookup_ich_guideline` | read | ✓ | – | ✓ | – | – | AnA `lookup_ich_guideline` (ana-ri ICH corpus) |
| `c2c_check_regulatory_currency` | read | ✓ | – | ✓ | – | – | AnA `check_regulatory_currency` + `guidance_change_radar` (currency registry) |
| `c2c_lookup_submission_deficiencies` | read | ✓ | – | ✓ | – | – | AnA `lookup_submission_deficiencies` (deficiency taxonomy) |
| `c2c_run_crl_premortem` | read | ✓ | – | ✓ | – | – | AnA `run_submission_premortem` (pattern scan + premortem core + precedent engine) |
| `c2c_search_precedents` | read | ✓ | – | ✓ | – | – | AnA `lookup_regulatory_precedents` (precedent engine) |
| `c2c_list_vault_documents` | read | ✓ | – | ✓ | – | – | `vault/document-catalog.service.listProjectDocuments` |
| `c2c_search_vault_documents` | read | ✓ | – | ✓ | ✓ | – | `vault/document-catalog-search.searchCatalog` (fails closed without embeddings) |
| `c2c_ga_readiness_probe` | read | ✓ | – | ✓ | – | – | `submission-readiness/procurement-preflight.runProcurementPreflight` |
| `c2c_draft_cover_letter` | draft | ✓ | – | ✓ | – | – | `cover-letter/cover-letter-composer.composeCoverLetterDraft` (deterministic) |
| `c2c_draft_agency_response` | draft | ✓ | – | – | ✓ | – | `getGateway().chat` — refuses verbatim when no provider is configured |
| `c2c_file_draft_for_review` | file | – | – | – | – | **✓** | `submission-service.upsertLeaf` (same seam as AnA `place_into_sequence`) |

Every tool returns a one-line text summary plus `structuredContent`. A refusal
(no licence, no credentials, no API key, wrong tenant, locked sequence) is
returned as an error result carrying the platform's message verbatim.

## Honesty contract

* Numbers and verdicts come from engines; the model narrates. No tool asks a
  model for a figure.
* Cold start is reported, not filled in: an un-ingested precedent corpus gives
  `count: 0` with a note; the pre-mortem's denominator is 0 and its confidence
  low; an organisation with no projects gets "no readiness to report".
* `c2c_validate_ectd_structure` says which external validator is configured;
  passing the built-in check is never presented as passing the agency's.
* `c2c_search_vault_documents` throws the catalog's own unavailability error
  through rather than returning an empty list.

## Client setup

1. Add the connector URL `https://<host>/mcp` in Claude. The client reads the
   protected-resource metadata, registers itself, and opens `/authorize`.
2. Sign in on the consent page (existing platform credentials, MFA if enabled)
   and approve the requested scopes.
3. The client exchanges the code with PKCE and calls `/mcp` with the bearer.

For local development: `POST /api/auth/dev-login` (requires
`NODE_ENV=development` and `ALLOW_DEV_AUTH=1`) returns a platform token that
`/mcp` accepts directly.

## Verification

* `server/mcp/__tests__/mcp-auth-contract.test.ts` — discovery, 401 challenge,
  token-class rejection, catalog shape, fail-closed model tool (no DB).
* `server/mcp/__tests__/mcp-connector.dbtest.ts` — SDK client over Streamable
  HTTP against PostgreSQL with `RLS_ENFORCE=on`: tools/list, three org-scoped
  reads with a second organisation seeing nothing, the governed write with
  scope denial, sign-off link and audit row, and the verbatim gateway refusal.
* `server/mcp/client-transcript.ts` — the separate-process client used for the
  evidence transcript under `docs/evidence/W7/`.
