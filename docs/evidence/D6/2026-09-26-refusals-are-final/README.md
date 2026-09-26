# D6: a placement refusal is final everywhere, and the tenant boundary's own evidence holds up (2026-09-26)

**Row:** D6, W2 gateway scope. **What this is:** the fixes for an independent adversarial review of the WS1 change
(`794c9b6c` and `3e4f9f5f`, evidence in `../2026-09-25-tenant-boundary/`).

**How the review ran:** five lenses (placement bypass, legitimate traffic wrongly refused, the policy writer,
private-cloud placement, and whether the tests prove their claims). Every finding of medium severity or above went to
independent skeptics, who were told to refute it, and many reproduced it with probe tests. 8 findings were confirmed,
2 refuted, and 11 kept at low severity without verification. All 19 are listed below with what was done.

## Confirmed findings

| # | Finding | Fix | Proof |
|---|---|---|---|
| 1 | `AIProviderRouter` caught a tenant placement refusal as a provider failure. It re-sent the refused payload to another vendor and counted the refusal against the refused provider's health. Three refusals marked it unhealthy for 60 s for **every** tenant, and one tenant's refusals could take router-based AI down for all tenants. | `aiProviderRouter.ts`: a terminal gateway error is rethrown before health or fallback. `gateway-outcome.ts` holds the one definition of "terminal", shared with `gateway.route()`'s own `isNeverRetried`. | `aiProviderRouter-refusal-final.test.ts`: 2 red, 2 green |
| 2 | The council retried a placement refusal three times, recorded "All LLM providers unavailable", and told the user the service would recover. | `multi-agent-council.ts`: any terminal gateway error is a non-recoverable `CouncilError`: `TENANT_PLACEMENT_DENIED` carrying the gateway's own message, or `GATEWAY_REFUSED`. No outage record. | `multi-agent-council.test.ts` new case: red, green |
| 3 | `/api/ai-assistance` swallowed the refusal, re-sent the content through the legacy router, and answered 200 with template text marked `success: true`. | Both handlers rethrow a terminal error from the gateway and legacy catches. The handler answers with the classified status: new code `PLACEMENT_REFUSED`, HTTP 403, and no template. | `ai-assistance-refusal.test.ts`: 2 red, 2 green |
| 4 | `public_source_egress` was accepted, stored and audited, and read by nothing. | Citation verification now reads it. With egress off, nothing goes to NCBI or CrossRef and every citation is `unverifiable`; an unreadable policy gives `error` with no outbound call. WS2 already withholds hosted web tools. The contract doc now names both readers, and names what does not read it yet: the `integrations/*` clients AnA's research tools use (WS14). | `citation-verification-service.test.ts` new cases: 2 red, 3 green |
| 5 | The writer accepted policies no lane could ever serve, such as residency `us` with only Anthropic, or ZDR with only Kimi. The response was 200, then every request was refused. | `placementPolicyContradiction` refuses a residency or retention no allowed lane could ever provide. Lanes whose placement the deployment decides (Bedrock, Vertex, Azure) remain possible. | `org-placement-writer.test.ts` new case: red, green |
| 6 | London (`eu-west-2`, `europe-west2`) and Zurich (`eu-central-2`, `europe-west6`) were claimed as `eu` residency by a prefix match. | An explicit EU/EEA region list. Anything else claims no EU residency. | `placement.test.ts`: red, green |
| 7 | The tenant-binding gate missed `gw?.route`, `gw!.route`, an aliased `getGateway()`, the `chat` / `complete` / `structuredOutput` helpers, an `organizationId` nested under another key, and a declaration in another function. | `scripts/ci/check-ai-tenant-binding.mjs` now reads the TypeScript syntax tree. Each shape is a must-catch self-test case (35 cases). | `red/gate-old-vs-new.txt`: the old gate missed 15 of 16 shapes, the new misses 0. On the pre-fix `stream.ts` and `AnaToolExecutor.ts` the new gate finds exactly the four known unbound calls. |
| 8 | Gate rule 2 saw only one spelling of `payloadProvenance: 'public'`, and skipped `gateway.ts` entirely. | Every write of `payloadProvenance` is checked, in any spelling (assignment, element assignment, quoted key, shorthand, constant), in every server file, `gateway.ts` included. Only a non-public literal or a forward of an existing provenance passes. | same |

## Low-severity findings

| # | Finding | Done |
|---|---|---|
| L1 | The RAG auxiliary-call cache (one hour, process-wide) had no tenant key. A hit served one tenant another tenant's model output with no placement check and no ledger row, and outlived a policy change. | Fixed. The key includes the bound tenant and a digest of its resolved placement policy; an unreadable policy bypasses the cache. `rag-cache-tenant-key.test.ts`: 3 red, 4 green. |
| L2 | Binding `organizationId` on AnA stream turns also turns on per-round metering against the weekly `requests` limit. | Documented in the WS1 operator notes, including re-baselining configured limits before deploy. Whether a turn or a round is the unit is a product decision. |
| L3, L11 | A lookup in flight when a policy changed could re-cache the superseded policy after `invalidate()`, for a full TTL, in the process that made the change. | Fixed with a per-org generation counter in `DbOrgPlacementResolver`. `org-placement-db.test.ts` new case: red, green. |
| L4 | Two concurrent first-time writes each recorded `previousPolicy: null`, so the audit trail hid what the second write replaced. | Fixed. The writer takes `pg_advisory_xact_lock(hashtext('ai_placement_policy:' \|\| org))` before reading the before-value. The writer test now pins the lock order. |
| L5 | An SDK base-URL override (`ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`) changes where requests go while the registry derives residency from the region. | Fixed. With an override set, the lane claims no residency, and a production boot with one on an enabled lane refuses to start. |
| L6 | The Bedrock ZDR opt-out worked only for the exact string `false`. | Fixed. Only unset or `true` claims ZDR. Any other value claims nothing, and in production refuses boot. |
| L7 | The WS1 red file was not produced with the committed tests. | Fixed. It was regenerated from the tests committed in `794c9b6c`, run against a `git archive` export of `bfbf0ee8`: 23 of 34 fail. The WS1 README is corrected. |
| L8 | The action-queue test pinned the helper, not the worker. | Fixed. A test now runs the processor the queue registers. `red/mutations.txt`: reverting the worker call fails it. |
| L9 | The refusal and ledger rows the evidence cites were never observed (`auditEnabled: false`). | Fixed. Two boundary cases now read the ledger. `red/mutations.txt`: removing the refusal write or the `tenantPlacement` metadata fails them. |
| L10 | The "piiDetection off" half of the old last-mile defect was unpinned. | Fixed. Two boundary cases run with `piiDetection: false`. `red/mutations.txt`: making the tenant check conditional on the screen fails them. |
| — | (bypass lens, low) `LITELLM_ENABLED` diverts router calls around the gateway entirely. | Not changed: it is already refused at production boot without `LITELLM_UNGOVERNED_ACK`, which names what is given up (WO-6). Routing LiteLLM through the gateway is WO-6's fix. |

## Refuted, with what was true in them

- **"Tenant payloads reach Gemini, Cohere/Voyage and HuggingFace with no placement check."**
  - True: those executors have no placement check.
  - Refuted because no configuration in the repository gets tenant content to them on a launch surface. The skeptic
    showed the launch-scope gate answers 403 `LAUNCH_SCOPE` for `/api/nano-banana/*` in production, with a probe; the
    routes are unmapped and have no client callers.
  - They stay in the gateway-bypass baseline (`scripts/ci/check-gateway-bypass.mjs`, WO-6).
- **"ci:ai-tenant-binding does not scan `server/services/ana-ri`, so two live dispatches pass."**
  - Refuted as a boundary failure: both sites run only inside an authenticated request's tenant scope, so the gateway
    binds them through the ambient scope, and the gap was disclosed.
  - The gap was still worth closing. Rule 1 now covers `server/services/ana-ri`. It found three sites:
    - `artifact-generator.ts` and the `review_version_impact` command now pass `organizationId` explicitly;
    - the per-turn thread-intelligence extraction (`orchestrator.ts`) carries a reasoned annotation. Binding it
      explicitly would start metering an auxiliary call that was never metered.

## Found while verifying

- **Two services narrowed the gateway codes by hand.** `SubmissionAiError` and `TruthEngineError` listed the codes
  literally, so the new `PLACEMENT_REFUSED` code failed the typecheck there. Both are now typed from
  `GatewayErrorCode`.
- **`routes/submissions.ts` kept its own copy of the gateway status table.** The copy would have answered a placement
  refusal as a 500. It now spreads the exported `GATEWAY_ERROR_HTTP_STATUS`, as `gateway-error-map.ts` asks.
- **Three test files fail on trunk, unrelated to this change:** `CrossReferenceMapping.no-fabricated-content`,
  `conversation-os` and `part11/signer-org-scope`. Each fails identically at HEAD without these changes (checked with
  `git stash`), so they are left to the lanes that own them.

## Red and green

- `red/findings.txt`: every changed source file at `259e22e5`, the new tests run. 15 of 74 fail, plus 2 of 15
  citation cases.
- `red/mutations.txt`: four mutations, each caught by the test that pins it.
- `red/gate-old-vs-new.txt`: the gate comparison.
- `green/findings.txt`: 10 test files, 115 tests pass.
- `green/gate.txt`: self-test 35/35, gate clean on the tree.
- `green/repo-gates.txt`: the wider suite, typecheck and repo gates.
