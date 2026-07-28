# Chapter 06 — The AI layer: gateway, ANA and grounding

**Verdict: this is the platform's most differentiated asset and its most concentrated
engineering risk. The governance around the model is unusually thoughtful. The thing being
governed is an 18,304-line file with 697 tools and no output UI.**

---

## 6.1 Scale, measured

| Component | Measure |
|---|---:|
| `server/services/ana/AnaToolExecutor.ts` | **18,304 lines**, **700** `registerToolHandler(` calls, **697** unique tool names |
| `server/services/ana/AnaToolDefinitions.ts` | 2,632 lines, ~25 spread tool families |
| `server/services/ana/` domain modules | ~200 files |
| `server/services/ana-ri/` | 55 files (orchestrator 1,899 lines, command-executor, enforcement, scope-guard, part11-governance, claim-grounding, evidence-validation) |
| `server/services/ai-gateway/` | `gateway.ts` ~2,245 lines + policy (557), pii-screen, promptInjection, audit, retry-policy, reasoning, providers, embeddings |
| HTTP surface | `/api/ana-ri` 30 endpoints, `/api/ana` 68, plus 6 more prefixes |

For context, `AnaToolExecutor.ts` is roughly 1.2% of the entire server codebase in one file.

## 6.2 What is genuinely well built

**The gateway fails closed in production.** With no provider configured,
`gateway.ts:531-537` throws rather than serving demo content, and says why in-line:

> *"Fail closed in production: serving demo-mode ("[KNOWN]"/placeholder) regulatory text from
> a keyless prod deploy would silently present fabricated content as a real AI response."*

Outside production it degrades to a deterministic response. That is precisely the right
shape for a regulated product, and it cites the prior forensic audit that prompted it.

**Provider governance is real.** A single governed egress point with only **3** baselined
bypasses (`anthropic-client.ts`, `openai-client.ts`, `openai-service.ts`), enforced by
`ci:gateway-bypass`. Multi-provider routing across Anthropic, OpenAI, Azure, Bedrock,
Vertex, Moonshot and a local OpenAI-compatible endpoint, with **per-provider residency and
zero-retention flags** enforced in `ai-governance/approved-models.ts`. The zero-retention
defaults are set honestly — `false` for the shared frontier APIs under the comment *"Flip to
true only once a signed zero-retention agreement is actually in force"*, `true` for the
enterprise-hosted deployments that carry ZDR contractually.

**Prompt-injection defence is better-reasoned than most.** `promptInjection.ts` requires
**both** an override verb **and** a meta-reference to the model's own instructions before
flagging — specifically so that regulated prose like *"disregard the previous draft"* does
not false-positive. It is severity-tiered, fails closed on `high` for **indirect** content
(RAG chunks, tool output, assistant history) rather than only user input, and uses bounded
gaps to prevent ReDoS. Its header is honest: *"This is a heuristic layer, not a guarantee."*

**Anti-fabrication is enforced in code, not policy.** Reject-lists matching `/lorem ipsum/i`
and "coming soon" appear in `governed-ana-execution.ts:43,47`,
`ana/verifiedSeal/helpers.ts:77` and `ai-actions/handlers/run-validation.ts:249`. The
`ana-ri/` layer carries a dedicated `claim-grounding.ts`, `evidence-validation.ts`,
`scope-guard.ts` and `part11-governance.ts`. The governing rule stated in the repo's own
strategy docs — that ANA *calls a deterministic engine for all numbers and governed content*
and only adds natural-language framing — is the correct architecture for this problem.

**Anthropic server-side tools are off by default.** `web_search`, `web_fetch` and
`code_execution` are each env-gated (`ANA_ENABLE_WEB_SEARCH` / `_WEB_FETCH` /
`_CODE_EXECUTION`) and disabled unless explicitly enabled.

## 6.3 The concentrated risks

### 6.3.1 One file, 697 tools

`AnaToolExecutor.ts` at 18,304 lines is a single point of failure for review, merge conflict
and blast radius. Any change to it touches a file no reviewer can hold in their head, and a
mistake in tool dispatch affects all 697 capabilities. The codebase already shows the strain:
`AnaToolDefinitions.ts:2544-2548` carries a **dedupe filter** guarding against
`cdiscTools.ts` re-registering `run_cdisc_pipeline` / `generate_define_xml` already present
in `EXTENDED_REGULATORY_TOOLS`, with the comment *"Remove once the duplicate is resolved at
source."* The count confirms it: **700 registrations, 697 unique names.**

Decomposition has visibly started (the git history shows *"refactor(ana): extract … tool defs
(decomposition tranche 5/6)"*), which is the right direction.

### 6.3.2 Per-tool authorization is the open question

With 697 tools reachable through a chat surface, the security-relevant question is not
whether the *endpoint* is authenticated — `/api/ana-ri/*` is, and live probing confirmed the
boundary holds — but whether each **tool handler** re-checks tenant scope and role at
execution time, or trusts the calling context. Given that Chapter 05 establishes RLS is inert
and that `check-tenant-isolation.mjs` cannot see Drizzle query-builder calls, a tool that
queries without an `organization_id` predicate has no backstop.

This audit did not sample all 697 handlers. It is flagged as the **highest-value remaining
review target**, and the acceptance test is mechanical: enumerate every handler that issues a
query, and assert each one takes tenant scope from the request context rather than a
parameter.

### 6.3.3 The UI cannot render what the engine produces

Chapter 09 documents this from the frontend side; it belongs here too because it is an AI-layer
gap, not merely a UI one. The shipping AnA rail consumes **three** modules from
`components/ana/` — `useAnaChat`, `useGovernedAction`, `GovernedActionSignoff`. The 28 result
panels built to render structured tool output (`SEComparisonTable`, `ReadinessGatePanel`,
`CrlPremortemPanel`, `WarGameReport`, `ConcordancePanel`, `VerificationPanel`, `SealBadge`,
…) plus `ToolPicker` and `ModelEffortPicker` are unreferenced.

So the product has 697 governed, grounded, deterministic tools and — on the surface users
actually reach — no way to pick one, no way to see a structured result, and no way to see the
verification and seal state those panels were built to display. **The grounding work is real
and largely invisible to the user**, which is both a product gap and a competitive one: honest
uncertainty is only a differentiator if the buyer can see it.

### 6.3.4 The PII gate ships in observe mode

`.env.example:109` — `AI_PII_ENFORCEMENT=audit`. The classifier runs and records; it does not
refuse. Combined with correctly-declared `ZERO_RETENTION=false` on the shared frontier APIs,
the shipped default path allows protected content to reach a non-ZDR provider and be logged
rather than blocked. One-line fix; see Chapter 04 §4.7 item 5.

### 6.3.5 SSRF on model-supplied URLs

`ssrfGuard.ts` exists and is applied to the connector family, but not at
`citation-verification-service.ts:108` or the `AnaToolExecutor.ts` fetch sites
(`:5933,:15233,:15339`). Citation verification is precisely the path that fetches URLs
originating in model output — the untrusted-URL case the guard was written for.

### 6.3.6 Grounding is asserted more than it is measured

`eval:grounding` and `ai:eval-doc-quality` scripts exist. **Neither is invoked by any
workflow** (Chapter 11 §11.7). `ci:reasoning-tier-ga-readiness` and
`ci:reasoning-tier-uat-evidence` are likewise orphaned. So the claim that ANA degrades
honestly rather than fabricating — which the repo's own strategy documents call *"the actual
moat"* — is architecturally supported but **not continuously measured**. For a buyer, an
unmeasured moat is a hypothesis.

---

## 6.4 Priority actions

| # | Action | Sev | Gate | Effort |
|---|---|---|---|---|
| 1 | **Audit tenant scope and RBAC across all 697 tool handlers.** Enumerate every handler that queries, assert each derives tenant scope from request context. | **P0** | G1 | 2 weeks |
| 2 | Flip `AI_PII_ENFORCEMENT` to `block`. | P1 | G2 | hours |
| 3 | Apply `ssrfGuard` to citation verification and the `AnaToolExecutor` fetch sites. | P1 | G1 | days |
| 4 | **Wire the grounding evals into CI** — `eval:grounding` and `ai:eval-doc-quality` exist and run nowhere. Make the moat measurable. | P1 | G2 | 1 week |
| 5 | Resolve the duplicate tool registration at source; add a CI assertion that registration count equals unique-name count. | P2 | G2 | days |
| 6 | **Continue the `AnaToolExecutor` decomposition.** 18,304 lines in one file is a standing review and merge hazard. | P2 | G2 | months |
| 7 | **Surface the result panels.** Wire `ToolPicker`, `ModelEffortPicker` and the verification/seal panels into the shipping rail — or delete 13,000 lines. Today the platform's best differentiator is invisible. | P2 | G2 | weeks |
| 8 | Expand the prompt-injection corpus beyond 20 cases, especially for indirect content, and treat it as a living adversarial suite. | P2 | G2 | weeks |
