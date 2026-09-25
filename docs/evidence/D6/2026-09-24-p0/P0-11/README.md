# P0-11 — embeddings reached OpenAI with no placement decision (DP-07, High)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-07. **Plan item:** P0-11 (the application
half; the Terraform key set and the DPA Annex III reconciliation are outside this lane's files and are handed on).

## What was wrong

`server/services/ai-gateway/embeddings/embedding-provider.ts` was the one egress in the gateway tree that did not pass
through `AIGateway.route()`. `OpenAICompatibleEmbeddingProvider.embed()` built an OpenAI client and called
`embeddings.create` with no classification, no placement decision and no audit row; `EmbeddingRequest` carried no
organisation, so the org's residency / zero-retention policy (`ai_placement_policies`) could not have been consulted
even if the gate had existed. `resolveEmbeddingProvider()` defaulted to OpenAI, and `EMBEDDING_PROVIDER=local` with no
base URL logged a warning and **returned the OpenAI provider** — a deployment that declared the self-hosted lane sent
its content to the shared frontier API. `server/services/vault/document-chunking.service.ts` embedded a document's text
*before* checking that the document belonged to the caller's organisation, so a foreign document id was embedded under
the caller's policy and only then refused at the write. `docs/AI_SENSITIVE_DATA_PLACEMENT.md:40` acknowledged the
bypass ("embeddings/vectorization … not approved for PHI/PII") while vault ingest embedded every uploaded document.

## What is true now

- `AIGateway.authorizeEmbedding({ organizationId, provider, texts })` (new public method, `gateway.ts`) runs, over a
  synthetic `taskType: 'embedding'` request, the same steps `route()` runs before a chat dispatch: `applyOrgPlacementDefaults`,
  the classification block (a detector throw is `'unknown'`), then **(a)** the residency / zero-retention rule
  `selectModel()` applies to chat candidates (`isPlacementCompliant(resolvePlacement(provider), …)`) — in every
  environment, for every data class, because it is the org's declared requirement, not a policy mode — refusing with
  `DENY_SHARED_PROVIDER_WITHOUT_ZDR` or `DENY_TENANT_POLICY`; and **(b)** `assertSensitiveDispatchAllowed` with intended use
  `embedding`, so an `AI_PROVIDER_PLACEMENT_APPROVALS` entry approved for `chat` alone does not cover embedding. Every
  refusal is a terminal `GatewayPolicyError` and writes the same content-policy audit row as a chat block
  (`detector: 'embedding_placement_policy'` or `'sensitive_placement_policy'`, reason code, provider, region, data
  class — a prompt hash, never the text). `OPENAI_ZERO_RETENTION=true` remains the operator control that unlocks
  OpenAI for a zero-retention tenant; the self-hosted lane (`on_prem`, ZDR) satisfies both rules.
- `embed()` calls `authorizeEmbedding` **before** the SDK client exists (the gateway is imported lazily to keep this
  early-loaded seam light). On refusal the client is never constructed and nothing is sent. `EmbeddingRequest.organizationId`
  is new; when a caller passes none, the running request's tenant scope (`getTenantScope()`) supplies it, and the
  estate-wide system scope (`'0'`) is not offered as an organisation.
- `EMBEDDING_PROVIDER=local` (or `openai_compatible` / `self_hosted`) with neither `EMBEDDING_LOCAL_BASE_URL` nor
  `LOCAL_AI_BASE_URL` throws `EmbeddingConfigurationError` naming the variable — fail closed, on every call, never a
  fallback to OpenAI. **Operational note:** a deployment that relied on that fallback now fails its first embedding
  call with a configuration error instead of silently using OpenAI; that is the intended outcome.
- `chunkAndEmbedDocument` checks `documentIsInOrganization` **before** embedding (on the pool; the in-transaction check
  stays as the write's own guard) and runs the embedding loop under the verified organisation's tenant scope
  (`runWithTenantScope`), so the provider's gate sees the owning organisation whatever the caller's ambient scope. This
  is how the organisation reaches the provider for the hot caller: `enhancedEmbeddingService.embedBatch(texts, model)`
  has no argument to carry it and is inside another lane's window today.

| | File | Result |
|---|---|---|
| red | `red/embedding-placement-gate-before-fix.txt` | 12 of 12 fail on HEAD `dac69d76`: `authorizeEmbedding` does not exist |
| red | `red/embedding-provider-before-fix.txt` | 4 of 9 fail on HEAD `dac69d76`: a zero-retention tenant's plain text, PHI to a provider approved for chat only, and the tenant-scope case all **resolve** ("promise resolved instead of rejecting" — the SDK was called); `local` with no base URL does not throw. The 5 passing are controls (lane selection, plain text with no policy, the self-hosted lane, the system scope) |
| red | `red/document-chunking-tenancy-before-fix.txt` | 3 of 6 fail on HEAD `dac69d76`: the embedding call happens before the ownership refusal (1 call recorded), a transaction is opened for the foreign document, and the embed runs under no tenant scope |
| green | `green/embedding-placement-gate-after-fix.txt` | 12 of 12 |
| green | `green/embedding-provider-after-fix.txt` | 9 of 9 |
| green | `green/document-chunking-tenancy-after-fix.txt` | 6 of 6 |
| green | `green/typecheck-scoped.txt` | scoped `tsc` over the six files and their import closure: 0 diagnostics |

Tests: `server/services/ai-gateway/__tests__/embedding-placement-gate.test.ts` (new; the decision table over a real
`AIGateway` with the audit buffer inspected), `server/services/ai-gateway/embeddings/__tests__/embedding-provider.test.ts`
(extended; the OpenAI SDK constructor is a spy — refusal is proved by the client never being built),
`server/services/vault/__tests__/document-chunking.tenancy.test.ts` (extended; the embed mock records the tenant scope
it ran under). The PHI fixture is a synthetic MRN string that the heuristic classifier detects; no fixture text
appears in any audit row or log line, and the tests assert that.

Gates: `ci:gateway-bypass` OK (8 baselined sites, none new), `ci:check-embedding-runtime` OK, `check:security-patterns`
0 violations across 2835 files. Pre-existing suites unchanged: `sensitive-placement-{gate,integration,policy}`,
`tests/audit-medium-fabrication-attribution.test.ts` (it pins `getEmbeddingProvider().embed(` in
`enhancedEmbeddingService.ts`, which is untouched), `document-chunking.service.test.ts`,
`document-chunking-backfill.service.test.ts` — 42 of 42; and 55 further files that reach the embedding seam
(`unified-ai-client-embeddings`, `revectorize-corpus`, `enhancedEmbeddingService.source-identity`,
`embedding-failure-honesty.contract`, the chat-upload routes, the memory-consolidation and IB-assembler PGlite
integrations, `gateway.test.ts`, `audit-tenant-scope`, `high-risk-model-approval`, …) — 491 of 491. The full-tree
`tsc --noEmit -p tsconfig.check.json` could not complete on this host (OOM-killed, exit 137, three workers running it
concurrently — the control tower runs it once at push); the scoped run is recorded in `green/typecheck-scoped.txt`.

## Not done here

- `server/services/enhancedEmbeddingService.ts` (another lane's window): `embed()` / `embedBatch()` should accept and
  forward `organizationId` to `getEmbeddingProvider().embed({ …, organizationId })` instead of relying on the tenant
  scope; and `embedBatch`'s retry loop retries **every** error up to `maxRetries` with backoff — a `GatewayPolicyError`
  or `EmbeddingConfigurationError` is terminal and should be rethrown at once (today a refusal is attempted three times
  and writes three audit rows). Its in-memory cache is keyed on `(text, model)` only; a vector cached under one org's
  policy is served to another org's identical text — acceptable while the cache is process-local and content-derived,
  worth a note when the cache is made shared.
- `server/openai-service.ts:37` and `server/lib/unified-ai-client.ts:99` call `getEmbeddingProvider().embed` without an
  organisation; they are covered by the tenant-scope fallback inside a request and by nothing outside one. Pass the
  organisation explicitly when those files are next opened.
- Terraform (`terraform/stack/main.tf:93-95,187`): the key set still provisions `OPENAI_API_KEY` and no Anthropic key;
  `OPENAI_ZERO_RETENTION` is unset (so `false`). With this change a zero-retention or region-resident tenant's
  embeddings are refused rather than sent — which means **retrieval for such a tenant is off until an embedding lane
  that satisfies its policy is provisioned** (`EMBEDDING_PROVIDER=local` + `EMBEDDING_LOCAL_BASE_URL` on-prem, or a
  signed OpenAI ZDR agreement recorded as `OPENAI_ZERO_RETENTION=true`). The `terraform test` for the key set in
  the plan row is not written.
- `docs/AI_SENSITIVE_DATA_PLACEMENT.md` §"Dispatch inventory" (line 40) should move embeddings out of the
  legacy/unapproved list: `embeddings/embedding-provider.ts` now applies the canonical decision via
  `AIGateway.authorizeEmbedding` with intended use `embedding`, and an approval must list `"embedding"` in
  `approvedIntendedUses` for sensitive text to be embedded. `docs/commercial/DATA_PROCESSING_ADDENDUM.md:263,269`
  (OpenAI disabled unless ordered) and the stack still disagree; that is the founder's decision named in the plan.
- `server/huggingface-service.ts` and `scripts/ci/*` were not touched; no CI allowlist needed changing.
