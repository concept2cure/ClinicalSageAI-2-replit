# LLM strategy brief — frontier, small, and local AI

The strategy for how Concept2Cure works with third-party frontier LLMs, where it
builds or uses small models, and how it serves clients who need local AI. The
implementation that backs this brief is mapped in
`docs/ai/AI_SUBSTRATE_IMPLEMENTATION_MAP.md`.

## Thesis

You do not need a foundation model, and you should not go local-only. Route every
model call — frontier, small, or local — through one governed gateway, default
reasoning to Claude, own a handful of *small* specialist models, and offer the
local/open-weight lane as a deliberately-priced compliance tier for clients who
cannot send data to a third party. The hard part (a governed, Claude-first,
swappable gateway) already existed; this work adds the private-cloud and local
substrates behind the same seam.

## Three substrates, one product

The same product must run on three inference substrates depending on the buyer:

| Substrate | Who it serves | Providers |
|---|---|---|
| Frontier shared | Default SaaS tenants | Claude, GPT, Kimi (direct APIs) |
| Frontier private | Big pharma / CRO needing BAA, zero-retention, regional residency | Claude on Bedrock/Vertex, GPT on Azure |
| Self-hosted | Air-gapped / sovereign / classified-IP tenants | open-weight models on vLLM |

A request declares its compliance needs (`dataResidency`, `zeroDataRetention`)
and the gateway routes only to a substrate that can honor them — and records
where the data was processed in the audit ledger.

## Where to use what

- **Frontier (Claude primary).** High-stakes reasoning that a human signs off on
  — regulatory drafting, protocol critique, eCTD authoring, gap analysis. The
  gateway is already Claude-first (Opus → Sonnet → Haiku, then cross-provider).
- **Build your own — small specialists, not a foundation model.** Narrow,
  high-volume, deterministic tasks: PHI/PII/regulatory classification, a
  regulatory-tuned embedder/reranker (highest ROI — it lifts the RAG accuracy you
  compete on and removes the OpenAI embedding dependency). Small models run
  cheaply and ship into air-gapped installs.
- **Local / open-weight.** Tenants who contractually cannot use a third party.
  Lower quality than frontier; sold as the compliance-enabling tier.

## What this delivery includes

1. Gateway convergence is enforced (CI gate); cloud/local providers live inside
   the gateway, reusing the proven Claude/OpenAI execution paths.
2. Private-cloud providers wired and governance-pinned — Bedrock (Claude) the
   deepest, Vertex + Azure scaffolded behind the same interface.
3. Local chat lane + a self-hostable embeddings seam (the #2 on-prem blocker).
4. Residency + zero-retention as hard routing constraints, surfaced in the
   21 CFR Part 11 audit ledger (`substrate`, `region`, `retentionPolicy`).
5. A working PHI/PII/regulatory classifier (closes the governance-contract gap)
   plus the SLM seam and training scaffold for the owned specialist models.

## What still needs doing (deepen)

- Burn down the baselined gateway-bypass files.
- Route `enhancedEmbeddingService` through the embedding-provider seam.
- Per-tenant default placement policy (org → residency/ZDR), so callers don't
  pass it per request.
- Train + serve the specialist SLMs (data + GPU, out of band).
- Make shared-frontier zero-retention real (signed agreements, then flip the
  `*_ZERO_RETENTION` flags) — the flags are wired and default to off.

## Non-negotiable that carries through

Every substrate routes through the same governed gateway, so the reproducibility
and audit guarantees (model, prompt hash, temperature, seed, fallback chain,
and now substrate/region/retention) hold no matter where inference runs. That
single audited path is the asset; the substrates are swappable behind it.
