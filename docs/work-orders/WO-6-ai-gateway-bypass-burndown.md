# WO-6 — Burn down the 19 AI-gateway bypasses

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** external pilot on real customer data
**This is the clearest regression since the July audit: 3 → 19.**

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
