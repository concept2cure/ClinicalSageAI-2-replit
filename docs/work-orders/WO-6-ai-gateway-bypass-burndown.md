# WO-6 — Burn down the 19 AI-gateway bypasses

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN — 19 → **10**, and only **three** of the ten are live inference
**Blocks:** external pilot on real customer data
**This is the clearest regression since the July audit: 3 → 19.**

> ### 2026-09-10 — where the ten stand, by REACHABILITY
>
> A count of ten says nothing about exposure. Each remaining entry was traced to
> a caller, and the answer changes what is worth doing:
>
> | Entry | Reach | What that means |
> |---|---|---|
> | `services/anthropic-client.ts` | **live** | the shared factory; baselined for CONSTRUCTING a client, and the gate now matches call sites too so downstream callers cannot hide behind it |
> | `services/openai-client.ts` | **live** | same status, same caveat |
> | `services/nanoBananaService.ts` | **live** | mounted at `/api/nano-banana`. Both TEXT paths migrated 2026-09-10; what remains is image generation, which the gateway has no surface for. `SAFETY_SETTINGS` still relaxes all four harm categories to `BLOCK_ONLY_HIGH`, now only on the image calls |
> | `services/ai/LiteLLMAdapter.ts` | latent | `LITELLM_ENABLED` defaults false and nothing in helm/terraform/compose sets it. Now refuses to boot in production without an explicit acknowledgement, and warns at construction everywhere else |
> | `services/rag-reranker.ts` | latent | needs `RAG_RERANKER_PROVIDER` + `_API_KEY` + `_MODEL` all set. Real egress when active; no gateway rerank surface exists to migrate to |
> | `routes/integration-test.ts` | **not inference** | fetches `/v1/models` as a reachability probe, mounted only under `testRoutesEnabled` |
> | `services/anthropic-files.ts` | **dead** | `uploadFileToAnthropic` / `deleteAnthropicFile` have ZERO call sites. All three importers take only `readLocalUploadBuffer`, which egresses nothing |
> | `huggingface-service.ts` | **dead** | the embeddings half. Not one of five callers writes the vector to a pgvector column |
> | `services/csr-extractor-service.ts` | **dead-ish** | ungoverned `gpt-4-turbo-preview` calls at `:378`/`:490`, reachable only through an unreferenced barrel — but a live test guards it, see below |
> | `services/semanticSearch.js` | **dead** | both importers throw `ERR_MODULE_NOT_FOUND` at module load on an absent `docushare.js` |
>
> **So the live inference surface is two shared factories plus one image path.**
> Five entries are dead code, and migrating a call nobody makes would be work
> spent governing dead code — those leave the baseline by deletion, not by
> migration, and deletion is a separate decision (see WO-10).
>
> **Three baseline reasons of mine were wrong and are corrected in place**, which
> matters because a burndown list that overstates its own findings costs the next
> reader an investigation:
> - `rag-reranker.ts` — I wrote that `tokensUsed` is "reported as 0
>   unconditionally so cost is structurally invisible". The Cohere path reports
>   real usage; only the cross-encoder returns 0, and the field is documented as
>   "Auxiliary LLM tokens spent (0 for non-LLM providers)". The code does what its
>   contract says.
> - `anthropic-files.ts` — I wrote that "the uploaded file is later referenced by
>   gateway-routed calls". No such flow exists.
> - `csr-extractor-service.ts` — I wrote that its exported symbol "has zero call
>   sites", marking it a deletion candidate. A test imports it and runs three
>   passing assertions in the default `npm test`, and **that test is a
>   fabrication-regression guard**: the service used to hardcode extraction
>   confidence to `0.92`, then silently overwrite it with `0.85`, a number shown
>   to reviewers deciding whether an extracted CSR needs human verification.
>   Deleting the module would have deleted the guard.
>
> **What was fixed, not just counted.** Two of the migrations removed defects
> worse than the bypass itself: `huggingface-service.ts` returned hardcoded
> clinical guidance ("Phase 3: 500-1500 participants") on every failure branch,
> which `endpoint-recommender-service.ts:1035` then split into lines and returned
> as *suggested clinical trial endpoints*; and `nanoBananaService.ts`'s
> presentation prompt ended "Include data points, percentages, and specific
> metrics where relevant" when its only input was a topic string.

---

## What the code actually says

`scripts/ci/gateway-bypass-baseline.json`, 19 entries, described by its own header:

> Files that reach a model provider outside the governed AI gateway — by
> constructing an SDK client, calling a provider endpoint directly, or using a
> shared client factory's returned client. … Every entry carries a REASON
> stating what governance is lost.

```
server/services/anthropic-client.ts        server/services/anthropic-files.ts
server/services/openai-client.ts           server/routes/integration-test.ts
server/services/ai/LiteLLMAdapter.ts       server/services/submission-twin-service.ts
server/api/ai/routes.ts                    server/services/innovation/auto-traceability-service.ts
server/routes/graphrag.ts                  server/services/innovation/regulatory-delta-radar-service.ts
server/services/deep-research-orchestrator.ts
                                           server/services/innovation/regulatory-negotiation-logbook-service.ts
server/services/EvidenceManagementService.ts
server/huggingface-service.ts              server/services/semanticSearch.js      ← JS shadow
server/services/nanoBananaService.ts       server/services/huggingface-service.js ← JS shadow
server/services/rag-reranker.ts            server/services/csr-extractor-service.ts
```

In July this list had **3** entries.

## Why this blocks the pilot

The governed AI gateway is the platform's differentiator and the mechanism by
which AI output is auditable. Every bypass loses whatever the gateway provides
for that call path — at minimum audit logging and model pinning, and per each
entry's own REASON field, more. Nineteen bypasses on a platform sold to
regulated customers as a governed AI layer is a claim-versus-code gap, not just
technical debt.

Two of the nineteen are `.js` files shadowing `.ts` implementations
(`ci:js-ts-shadows` tracks 12 such pairs). Those are worse than the rest,
because which one production resolves is not obvious from reading the imports.

## Scope

1. Route each of the 19 through `server/services/ai-gateway` (`getGateway`) or
   `server/lib/unified-ai-client`, which is what the baseline header instructs.
2. For any that genuinely cannot be routed — a provider SDK feature the gateway
   does not expose — re-justify with what governance is lost and what
   compensating control covers it, and give it an expiry (WO-5).
3. Resolve the two `.js` shadows as part of this: establish the TypeScript
   implementation as canonical, normalise imports, prove production resolution,
   delete the twin.

## Exit criteria

```bash
npm run ci:gateway-bypass      # baseline 19 -> 0, or every survivor re-justified with an expiry
npm run ci:js-ts-shadows       # the two AI-path shadows gone
```

## Blast radius

Medium. Touches live AI call paths. Each migration is independently testable —
do them one at a time, not as one sweep.

## Estimate

2–3 weeks.
