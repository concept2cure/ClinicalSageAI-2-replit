# Open-Source AI Tooling — Need & Fit Assessment

**Date:** 2026-07-30
**Trigger:** Founder request — evaluate 10 free/open-source AI tools ("No glue code — ten well-worn parts, wired together") for use in Concept2Cure.RI, and whether they help *standardize and secure* the codebase.
**Method:** Grounded review of the actual codebase (8-agent parallel sweep + adversarial verification). Every claim below is anchored to a file path.

---

## 0. TL;DR

1. **Category mismatch.** These 10 tools are **AI capability building blocks** (web scraping, agent memory, multi-agent orchestration, RAG, local inference). **None of them lints, type-checks, scans dependencies/secrets, runs SAST, or enforces a compliance gate — so none can "standardize or secure a codebase."** That job is already owned, and owned unusually well, by an in-house stack (ESLint + `eslint-plugin-security`, Prettier, a zero-regression `tsc` gate, ~40 custom CI gates under `scripts/ci/*`, Trivy + npm-audit + CycloneDX SBOM, GitGuardian, Danger/Husky). Adding these tools would *increase* attack surface that then has to be governed.

2. **9 of 10 are already present in a more governed form, or are governance anti-patterns** for a 21 CFR Part 11 platform. Most duplicate mature in-house systems and would introduce a **second LLM egress path that bypasses your audited AI gateway, PHI screen, and approved-models gate** — a net regression.

3. **Firecrawl is not even a decision — it's already built here**, and better-governed than a drop-in (`server/integrations/firecrawl/*`). The only action is *hardening*, not adopting.

4. **LocalAI is the one genuinely defensible tool** — it targets a real, partly-unrealized need (validated air-gapped/on-prem inference for PHI & data residency). But it's a **multi-quarter validation + corpus re-vectorization project**, not a weekend pilot.

5. The review surfaced **three concrete, tool-independent action items** worth more than any adoption decision — see §5.

---

## 1. The framing correction: "standardize and secure" ≠ these tools

You asked how to *standardize and secure* the codebase with these tools. The honest answer is that **you standardize and secure a codebase with a completely different class of tooling**, and you already have a deep set of it:

| Job | What actually does it | Where it lives |
|---|---|---|
| Lint / style / dead code | ESLint flat config + `eslint-plugin-security`, Prettier, `knip` | `eslint.config.js`, `.prettierrc`, `knip.json` |
| Type safety (no-regression) | `tsc` with a baseline gate | `npm run ci:typecheck:no-regression`, `.typecheck-baseline.json` |
| Domain/compliance guardrails | ~40 custom CI gates | `scripts/ci/*.mjs`, `scripts/check-security-patterns.ts` |
| Dependency & container CVEs | Trivy + npm audit + SBOM | `.trivyignore`, `npm run sbom` (CycloneDX) |
| Secret scanning | GitGuardian | `.gitguardian.yaml` |
| PR risk gating | Danger + Husky/lint-staged | `dangerfile.js`, `.husky/` |
| AI-specific safety | AI gateway, prompt-injection tests, tenant-isolation & gateway-bypass gates | `server/services/ai-gateway/*`, `npm run test:security`, `ci:tenant-isolation`, `ci:gateway-bypass` |

**None of the 10 slide tools appears in that table, because none of them does that job.** The correct question to ask of any AI tool here is not "does it secure my code" but: *"Does it fill a real capability gap, and does it survive the platform's existing AI-adoption gate — gateway routing, approved-models lockfile, PHI screen, provider-placement/ZDR policy, SHA-256/HMAC audit, and Part 11 e-signature?"* Against that test, the answer for 9 of 10 is **no**.

---

## 2. Scorecard

**Need** = does this fill a real missing capability (0 = already covered, 5 = critical gap).
**Fit** = architectural + regulatory fit (0 = poor, 5 = excellent).
**Reg-risk** = risk introduced into a Part 11 / GxP posture.

| # | Tool | Layer | Need | Fit | Reg-risk | Verdict |
|---|------|-------|:---:|:---:|:---:|---------|
| 1 | **Firecrawl** | WEB | — | 4 | 🟡 med | ✅ **Already built — keep & harden** |
| 2 | **LocalAI** | KNOWLEDGE | 3 | 3–4 | 🟡 med | 🧪 **Pilot (as a validation project)** |
| 3 | Crawl4AI | WEB | 2 | 3 | 🟡 med | 🕓 **Defer → conditional** (residency escape hatch) |
| 4 | Browser Use | WEB | 2 | 0–1 | 🔴 high | ⛔ **Avoid** (narrow read-only research only) |
| 5 | Mem0 | MEMORY | 1 | 1 | 🔴 high | ⛔ **Avoid** (fix extraction in-house instead) |
| 6 | Langflow | BRAIN | 1 | 1 | 🔴 high | ⛔ **Avoid runtime** (design-time only, maybe) |
| 7 | RAGFlow | KNOWLEDGE | 1 | 1 | 🔴 high | ⛔ **Avoid** (parser-only, if ever) |
| 8 | AutoGen | BRAIN | 0 | 1 | 🔴 high | ⛔ **Avoid** (already have it) |
| 9 | CrewAI | BRAIN | 0 | 1 | 🔴 high | ⛔ **Avoid** (already have it) |
| 10 | AnythingLLM | KNOWLEDGE | 0 | 0 | 🔴 high | ⛔ **Avoid** (would fork your RAG) |

---

## 3. Per-tool detail (grounded in your code)

### ✅ Firecrawl — already integrated, more governed than a drop-in
You already ship a complete Firecrawl integration: `server/integrations/firecrawl/{client,scrape,crawl,search,extract,policy,usage,webhook,errors}.ts` + `server/routes/firecrawl.ts`. It has per-tenant policy + domain allowlist, a DB-transactional daily quota (`usage.ts`, `FOR UPDATE`), HMAC-SHA256 webhook verification, per-day caching, dual audit-log writes to `external_tool_audit_log`, and evidence persistence with provenance. It's **feature-flagged OFF by default** (`FEATURE_FIRECRAWL_ENABLED` + per-tenant `firecrawl_enabled`, schema default `false`). Tests exist (`server/__tests__/firecrawl-*.test.ts`).
- **Residual risk:** `api.firecrawl.dev` is a third-party SaaS that sees every target URL and its content, and the gateway PHI screen can't inspect base64/binary document bodies — so **it must never receive PHI-bearing documents.**
- **⚠️ Live footgun (verified):** `policy.ts:34` — `if (!input.domainAllowlist?.length) return { allowed: true }`. An *enabled* tenant with an empty allowlist can scrape **any** non-blocklisted public URL through governed infrastructure. This should **fail closed**, not default-allow. See §5, action #1.

### 🧪 LocalAI — the one defensible tool (but scope it honestly)
The seam already exists but is **unproven**: `server/services/ai-gateway/providers/clients.ts` `createLocalClient` (`LOCAL_AI_BASE_URL`/`LITELLM_BASE_URL`) wired into the gateway's `local` case; `embedding-provider.ts` local lane; `placement.ts` marks `local` as `self_hosted` / `zeroDataRetention:true`; `server/services/ai-governance/approved-models.ts` has a `local-default` entry — explicitly *"Pending per-deployment eval; not approved for high-risk regulatory drafting."*
- **Why it's defensible:** air-gapped/on-prem inference for PHI and data residency is a genuine regulated-industry need, and it's the one substrate the platform already models as compliant.
- **Honest cost (adversarially corrected — this is a project, not a pilot):**
  1. **GxP/CSV/GAMP-5 validation** of an open-weight model + ongoing drift monitoring.
  2. **Embedding-dimension migration**: LocalAI's default `bge-large-en-v1.5` is **1024-d**, but your corpora are **1536-d / 3072-d**, and *no dual-index migration tooling was found* — so this means **re-vectorizing 8 pgvector corpora**, or provisioning new corpora at the model's dimension.
  3. LocalAI is just *one* interchangeable OpenAI-compatible backend behind the `local` seam — **vLLM / LiteLLM / TGI / TEI** (already named in code) are generally higher-throughput serving choices. The need is for a *validated on-prem deployment*, not specifically LocalAI.
- **Safe path:** pilot strictly **through the gateway's `local` provider** (never a new direct client — a direct `new OpenAI({baseURL})` in TS *would* trip `check-gateway-bypass.mjs`); add the concrete model to `approved-models.ts` with a pinned version + model card + eval reference; run the pending eval against `server/eval/rag/` before it serves any high-risk drafting; keep `AI_PII_ENFORCEMENT=block` on.

### 🕓 Crawl4AI — a pre-built data-residency escape hatch (not a new capability)
No self-hosted crawler exists today; the only crawl path is the Firecrawl SaaS. Crawl4AI is justified **only if data-residency policy forbids sending target URLs/content to `api.firecrawl.dev`**. If/when that constraint is live, run it self-hosted **behind the existing `FirecrawlClient` interface** so it inherits `policy.ts`, `usage.ts` quota, and the audit/evidence pipeline — but wire `server/utils/ssrfGuard.ts` (incl. the documented DNS-rebinding pre-fetch re-check) into its fetch path, since the fetch moves in-house. Given the SaaS is a *standing* residency exposure whenever the flag is on, treat this as **"conditional-adopt-now" the moment any enabled tenant targets PHI-adjacent content**, not an indefinite defer.

### ⛔ Browser Use — avoid for governed actions; narrow research value only
No autonomous browser agent exists in production (deliberately). An autonomous LLM browser agent is non-deterministic, can't be placed in the SHA-256/HMAC audit trail, has **no §11.200 genuine-owner identity** (so it can't re-authenticate to sign/mutate governed records), and widens the SSRF/credential-exfil surface the platform is built to close (`server/utils/ssrfGuard.ts`).
- **Honest caveat (adversarially corrected):** the claim "all regulatory data is structured APIs that need no browser" is **too strong**. Your 20 connectors cover openFDA / CT.gov v2 / EMA, but a real class of evidence is **web/PDF-only and in no API** — FDA Warning Letters, Form 483s, Complete Response Letters, guidance documents, advisory-committee transcripts/briefing packets. That's a genuine (narrow) gap. The *only* defensible use is a self-hosted, **read-only, human-in-the-loop** evidence gatherer whose LLM calls route through the gateway, whose every fetch passes `ssrfGuard` + a per-tenant allowlist, and whose output enters the evidence pipeline as an **untrusted draft** — never a record mutation.

### ⛔ Mem0 — duplicates your memory stack; fix the real gap in-house
Your purpose-built memory stack already implements Mem0's entire loop: `working-memory.ts` (short-term), `client-intelligence-memory.ts` (long-term, pgvector, confidence, lifecycle/supersession), `memory-orchestrator.ts` (ranking + structured forgetting + dedup), `memory-context-assembler.ts` (multi-layer retrieval), `memory-consolidation-job.ts` (nightly ephemeral→summary→canon) — all org-scoped with RLS and enforced by `ci:tenant-isolation`. Managed Mem0 ships client intelligence (potential PHI) to a third-party sub-processor with no BAA/ZDR — a hard Part 11 blocker; self-hosted Mem0 reintroduces duplication + a **third** vector-store convention (Qdrant).
- **The one thing Mem0 does better maps to your real gap:** `extractMemoryEntriesFromText` in `client-intelligence-memory.ts` is **regex/heuristic despite "AI-powered" docstrings**. Fix that *in place* — route extraction through `server/services/ai-gateway` so it becomes LLM-based, audited, and tenant-scoped — keeping your orchestrator, consolidation job, and RLS envelope.

### ⛔ AutoGen & CrewAI — you already have both, in governed TypeScript
- Single-agent reason→tool→observe loop: `server/services/ana/agentic-loop.ts` (bounded, DI, thrash-resistant, token-budgeted, tested).
- Role-based multi-agent "crew": `server/services/multi-agent-council.ts` (Drafter→Statistician→Critic→Synthesizer, each gateway-routed and Part-11 audit-logged, annotated `@compliance FDA 21 CFR Part 11`) and `server/routes/agent-swarm.ts` (Coordinator + specialists with HITL breakpoints).
- **Important correction — do NOT rely on a CI gate to catch these.** It's tempting to say "AutoGen/CrewAI would trip `check-gateway-bypass.mjs`." **They would not.** That gate's regex (`check-gateway-bypass.mjs:29`) matches the JS idiom `new OpenAI(` / `new Anthropic(`. Python has no `new` keyword — AutoGen/CrewAI call `openai.OpenAI()` / `anthropic.Anthropic()`, which **cannot match**, even though `server/services/python` is inside `SEARCH_PATHS`. So a Python agent framework's second egress path would be **silent to the automated gate** — the risk is *higher*, not lower, resting entirely on human review. **If you ever add Python LLM tooling, you need a Python-aware egress gate first.** (Actionable — see §5, action #2.)

### ⛔ Langflow — a standalone app with its own ungoverned runtime
The graph/checkpoint/HITL concept exists in-house as `server/services/cognitive-ecosystem/langgraph-orchestrator.service.ts` — but it's **dead code** (route unregistered, executor is a `simulateAgentExecution` placeholder). Langflow is a **standalone app, not an embeddable library**, so flows authored in it execute in *Langflow's own runtime* — a second execution plane outside the gateway, RBAC, and audit trail: a direct Part 11 hole. If a visual authoring surface is genuinely wanted, use it **strictly design-time** to emit a spec that runs on `WorkflowExecutionEngine.ts`. First, resolve the real debt: finish-and-wire the cognitive-ecosystem orchestrator through the gateway, or delete it and correct `AGENT_ARCHITECTURE.md`.

### ⛔ AnythingLLM & RAGFlow — would fork a more capable RAG
Your custom pipeline is *more* capable than either: `server/services/advancedRAGPipeline.ts` (HyDE, multi-query, step-back, multi-hop, LLM-judge + cross-encoder rerank, MMR, CRAG/Self-RAG, hybrid RRF, self-query — all verified against real imports) over **8 tenant-scoped pgvector corpora**, with a canonical embedding runtime (`enhancedEmbeddingService.ts`) + corpus policy and a CI canonicality gate. Neither tool can read your corpora, honor RLS, emit the audit trail, or route through the gateway's PII/prompt-injection policy. Layout-aware clinical parsing is already handled by `server/workers/layout-aware-ingestion.ts` + the PyMuPDF/tesseract sidecar, so RAGFlow's DeepDoc differentiator is largely covered too.
- **The only narrow, legitimate use:** a **sandboxed internal knowledge base on NON-regulated corporate docs** (HR, sales enablement, internal wiki) that never touches the tenant corpora, RLS, or audit trail — a quick internal-productivity deployment, kept entirely off the regulated data plane.

---

## 4. Cross-cutting regulatory adoption gate

Any third-party AI component must pass all of these before it touches regulated data:

1. **Gateway routing** — all model calls go through `server/services/ai-gateway` (audit, PII/PHI screen, approved-models). No second egress path.
2. **Data residency / PHI** — no regulated content leaves to a SaaS without BAA + ZDR (`placement.ts`). Managed Mem0, Firecrawl-SaaS-with-PHI, and any hosted agent runtime fail this.
3. **Auditability** — the component's actions must land in the SHA-256-chained, HMAC-sealed audit trail (`server/services/auditService.ts`).
4. **Identity for governed actions** — §11.200 genuine-owner identity + author≠approver separation-of-duties. Autonomous agents cannot hold this.
5. **Determinism / reproducibility** — regulated outputs must be reproducible; nondeterministic autonomous agents are constrained to *untrusted-draft* inputs behind human review.
6. **Supply-chain governance** — self-hosted OSS preferred; must enter the SBOM and pass the dependency-quarantine gate (`ci:check-legacy-dep-quarantine`).

**Archetype verdicts:** local inference server 🟢 · self-hosted crawler behind existing seam 🟡 · self-hosted RAG/memory duplicating in-house systems 🔴 · autonomous browser/multi-agent 🔴 · managed-SaaS memory/RAG with PHI 🔴.

---

## 5. Three concrete actions worth more than any adoption decision

These came out of the review and stand on their own, independent of whether you adopt anything:

1. **Fix the Firecrawl empty-allowlist default-allow.** `server/integrations/firecrawl/policy.ts:34` returns `allowed: true` when a tenant is enabled but has no domain allowlist. Make a non-empty per-tenant allowlist **mandatory** (fail closed). This is a real SSRF/exfiltration default-allow, live whenever the flag is on. *(Small, high-value security fix.)*

2. **Add a Python-aware gateway-bypass gate.** `scripts/ci/check-gateway-bypass.mjs` only catches the JS `new OpenAI(`/`new Anthropic(` idiom; Python LLM-client instantiation is a blind spot today. There are no Python LLM clients yet — so add the gate *now*, before any Python AI tooling makes the blind spot matter.

3. **Close the memory-extraction gap in-house.** Route `client-intelligence-memory.ts` extraction through the AI gateway so it becomes LLM-based (it's regex today, despite "AI-powered" docstrings). This is the real capability Mem0 was tempting you toward — captured without forking your memory stack. Consistent with the March-2026 audit's "enhance existing, don't rebuild."

---

## 6. Bottom line

Don't treat the slide as a shopping list — it's a category mismatch. **9 of 10 tools are already present in a more governed form or are active governance anti-patterns** for a Part 11 platform, and adopting them would add a second, unaudited LLM egress path — a net regression. **Firecrawl is already built** (just needs the allowlist hardening). **LocalAI is the one genuinely defensible tool**, and even then it's a validated-deployment project (with an 8-corpus re-embedding migration), where vLLM/LiteLLM are equally valid backends behind the seam you already have. Everything else should be an *"enhance what exists"* investment: LLM-based memory extraction, unified egress/SSRF policy across your web subsystems, durable persistence for the agent swarm's in-memory state, and finishing-or-deleting the dead cognitive-ecosystem orchestrator.

*Prepared from a grounded, adversarially-verified codebase review. File references are current as of the date above.*
