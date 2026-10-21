## Lane: AI layer (AnA, gateway, model governance, RAG, eval/PQ, MCP)

Read-only cold audit at HEAD 92ccdba1 (working-tree branch `claude/busy-carson-kr611v`). I opened no audit, evidence or handoff files. Scratch scripts are under `…/scratchpad/ai/`. No live model calls were made: `env` shows 0 provider keys.

### Readiness score: 4/10

The governance scaffolding is better than most competitors'. There is one gateway, a provenance ledger, an approved-models lockfile, fail-closed placement, human confirmation on writes, a proper MCP OAuth implementation, and CI gates that pass.

It still cannot be sold to a GxP buyer today, for five reasons:
1. **No PQ.** No model has passed PQ, and the PQ rule is not enforced in code (the code says so itself).
2. **No drafting model in the deploy path.** The documented Terraform deploy provisions no model approved for high-risk work, so Authoring AI drafting refuses there.
3. **Empty corpus.** The regulatory corpus ships empty, and the eval gold sets are small and scored by text matching.
4. **Model-produced figures.** Several mounted paths still ask the model for scores, likelihoods or confidence and then store the answer.
5. **Unreviewable surface.** 139k reachable lines and 779 tools cannot be validated.

### What is genuinely strong (keep)

- **A single gateway with a rich ledger.** `server/services/ai-gateway/gateway.ts` (4,512 lines) and `audit.ts:60-71` write a 42-column row per call: prompt hash, seed, pinned version, PQ status, placement reason and tried models.
  - Policy denials are terminal (never retried or passed to a fallback).
  - There is a per-model fallback ladder, a circuit breaker, handling of model refusals, and stall timeouts on streams.
- **Approved-models lockfile with a drift gate** (`ai-governance/approved-models.ts`). `approvedForHighRisk` is checked at every selection point (gateway.ts:3148, 3183-3191, 3302). It is enforced again at the tool layer for governed writes (`ana/governed-write-tools.ts`, `AnaToolExecutor.ts:386`).
- **Sensitive-data placement fails closed** (`sensitive-placement-policy.ts`).
  - Production refuses to boot without `AI_SENSITIVE_DATA_POLICY_MODE=enforce` and explicit approvals.
  - Terraform validates the value (`variables.tf:257-275`).
  - The check runs as a last-mile gate before every primary and fallback dispatch (gateway.ts:1925).
- **Demo mode is fenced out of production** (`deterministic-mode.ts`, gateway.ts:1441-1455). A production process with no provider key throws rather than serving canned text.
- **Human in the loop for AnA writes.** Every tool is classified in `tool-authorization.register.json` (779 entries). Write-class tools require a held run, `humanConfirmed`, the editor role read from the database, and e-signature for the high tier (`AnaToolExecutor.ts:395-444`, `routes/ana-ri/utility.ts:560-640`). Approving a QMS document is refused in chat (`AnaToolExecutor.ts:13774`).
- **Tenant scoping in AnA handlers.** A heuristic scan found 0 of 727 handlers running SQL without an organisation reference (`scratchpad/ai/toolscan.mjs`). Vector search is org-filtered before ranking (`enhancedEmbeddingService.ts:540-587`).
- **Submission Readiness engines are deterministic.** There are no gateway calls in `routes/submission-readiness.ts`, `services/regulatory/submission-readiness.ts`, `readinessEvaluator.ts` or `intelligence/readiness-scoring-engine.ts`.
- **The PQ harness works and fails closed.** `tsx server/eval/pq/run-pq.ts --model claude-opus-4` with no keys returns `Verdict: NOT_EXECUTED`, exit 1. The `pq-verdict` and `gold-bank-floor` tests pass (32/32).
- **Source lineage for AnA drafts.** `drafting-source-lineage.ts` and `clinical-regulatory-evidence/lineage-gate.ts` separate verified quote spans from paraphrase the model merely asserts.
- **MCP connector** (`server/mcp`):
  - OAuth 2.1 with PKCE S256, RFC 7591 client registration, RFC 8414 and RFC 9728 metadata, and resource binding.
  - Every tool declares a scope; the editor role is re-checked live for the one governed write; each call runs in a tenant scope and is audited.
  - All four annotation hints are set on every tool. There are 19 tools and 1 write.
- **CI gates pass:** gateway-bypass (8 baselined files), unapproved-model-pins (54 baselined), pq-evaluation-callers, ai-tenant-binding, tenant-blind-models, model-migration-agreement.
- **LiteLLM bypass is guarded.** Production refuses to boot unless it is explicitly acknowledged (`LiteLLMAdapter.ts:60-85`).

### Gateway bypass table

| File:line | SDK / endpoint | Caught by gate? |
|---|---|---|
| services/anthropic-client.ts:23,40 | `new Anthropic` (shared factory) | y (baselined) |
| services/openai-client.ts:17,68 | `new OpenAI` (shared factory) | y (baselined) |
| services/anthropic-files.ts:78,106 | Anthropic Files API via `getAnthropicClient()` (no call sites, per its baseline entry) | y (baselined) |
| services/ai/LiteLLMAdapter.ts:127 | `fetch(${baseUrl}/chat/completions)`; aiProviderRouter.ts:643 makes the gateway its else-branch | y (baselined; production boot refuses without acknowledgement) |
| huggingface-service.ts (generateEmbeddings) | axios to api-inference.huggingface.co | y (baselined) |
| services/nanoBananaService.ts:22 | `@google/generative-ai` image generation, with harm thresholds relaxed | y (baselined) |
| services/rag-reranker.ts | api.cohere.com / api.voyageai.com rerank | y (baselined) |
| routes/integration-test.ts:218 | api.openai.com/v1/models reachability probe | y (baselined; test-fenced) |
| services/advancedRAGPipeline.ts:40,41,49 | imports `@anthropic-ai/sdk`, `openai`, `getOpenAIClient`; unused today | **n** (the gate does not match imports) |
| aiProviderRouter.ts:212-245 | retired `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, `claude-3-haiku-20240307` (the last deprecated, retiring 2026-04-19, not yet listed as retired) — sent verbatim if LiteLLM is enabled | via LiteLLM entry only |
| Synthetic evasion shapes, tested in a scratch git repo against the gate's own patterns (positive controls: `new OpenAI(`, `= getOpenAIClient()` caught) | aliased import `{OpenAI as Client}` + `new Client`; `await getOpenAIClient()`; client passed as an argument; `const C=Anthropic; new C()`; `/v1/messages/batches`; Vertex REST `:rawPredict`; `fetch('https://api.moonshot.ai/v1/chat/completions')` | **n — all 7 missed.** Root cause: the path regexes require a non-alphanumeric character before `/v1/` or `/chat/`, so any full URL to a host not on the list escapes; api.moonshot.ai, fireworks, dashscope, aiplatform.googleapis.com and localhost:11434 are not on the host list; and the docstring's claim of "provider/wrapper module imports" has no matching pattern. |

The client bundle, `ingestion/` and `shadow_service/` are clean.

### "Model produces the figure" instances

| File:line | Figure the model is asked for | Where it goes | Catalog? |
|---|---|---|---|
| prompts/shadow-review/v1.0.md:40-42; shadow-review-service.ts:225-226,247 | `rtfRiskScore` / `crlRiskScore` ("likelihood of RTF/CRL") in [0,1]; stored as `max(model, aggregate)`, where the aggregate is itself built from model-assigned severities | shadow_review_runs; ShadowReview surface; AnA tool `run_shadow_review` (in scope) | **Submission Center** |
| ingestion/ingestion-service.ts:335-341; prompts/document-classify/v1.0.md:34 | Model's own confidence ≥0.5 writes the CTD module onto the document with no human step | coauthor_documents.moduleNumber | **Vault / Submission** |
| api/drafting/routes.ts:119-125,244,431,438-440 | Citation `page` (the model's value is preferred over the database page number); citation confidence (defaults to 0.5); `confidenceScore` rises with every model-emitted citation, including ones that match no retrieved chunk | vault.drafting_sessions | Authoring (dead on deploy, see AI-13) |
| api/drafting/routes.ts:556,592 | `PATIENT_COUNT` / `P_VALUE` entities; confidence defaults to 0.8 | vault.extracted_entities | Vault |
| sentenceTraceabilityService.ts:501,~535,~580 | Model decides whether a source "supports" a sentence and with what confidence; `isSupported` and `needsReview: mapping.needsReview ?? …` — the model decides whether human review is needed | traceability records (audit-services routes) | Authoring / QMS adjacent |
| routes/ana-cortex.ts:25-45 | `regulatory_readiness_score`, `projected_delay_days`, `total_financial_impact`, `compliance_score`, `confidence_score`; the code comment says "Every numeric field … produced by the AI gateway" | /api/ana-cortex/regulatory-analysis (mounted, requireAuth; no client caller found) | outside |
| routes/snowglobe.ts:270-323 | Six 0-100 risk scores (pre-technical rejection, reviewer friction, audit exposure, …) plus per-finding confidence | /api/snowglobe | outside |
| csr-builder.ts:732-740 | `disproportionalityScore` 0-5, `relatedStudies` count, adverse-event frequency "based on your knowledge" with no data input | /api/csr-builder | outside |
| submission-twin-service.ts:1159,1193,896 | Claim confidence, relevance score and support strength from the model; readiness falls back to `readinessPercent ?? 50` when no snapshot exists | /api/submission-twin | Rule 2 "twin" (no sessions allowed) |
| indCopilot.js:624,981,1168 | Compliance and completeness scores 0-100 | routes/ind.ts (mounted) | outside |
| predictiveSectionService.ts:199; c2c/ai-editing.ts:1677 | Suggestion confidence; inconsistency severity | returned to the editor | Authoring (display only) |

### Findings

**AI-01 — P0 — No PQ-passed model serves high-risk drafting, and the PQ rule is not enforced**
- Evidence:
  - All 16 `APPROVED_MODELS` entries have `pq: {status:'pending'}` (approved-models.ts, `grep -c` = 16).
  - `pq-protocol.json:6-7` has `"status":"draft","approvedBy":null`; the RAG component at `:33` is `"executable": false`.
  - effort.ts:141 and :194 say "Rule 2's PQ clause… is enforced nowhere yet".
  - The gateway only records `pq_status` in the ledger (gateway.ts:4305).
  - PQ scores the harness's own prompt, not the production drafting prompts (run-pq.ts header).
- Impact: CLAUDE.md Rule 2 and the launch definition of done are unmet. A regulated buyer's validation team will reject the system.
- Fix:
  - Founder approves the PQ protocol.
  - Run `pq:run --record` for `claude-opus-4` and `claude-opus-5`.
  - Add gateway enforcement: when `isHighRiskRequest`, require `pq.status==='passed'` and `verifyPqClaim`, fail closed, behind `AI_ENFORCE_PQ` (forced on in production).
  - Extend PQ to the production drafting prompts.
- Effort: M. Dependencies: provider key (AI-02), gold bank (AI-07), founder sign-off.

**AI-02 — P0 — The documented production deploy has no model approved for high-risk work**
- Evidence:
  - `terraform/stack/main.tf:207` wires only `OPENAI_API_KEY`; `grep -ri anthropic|bedrock terraform/*.tf` returns nothing.
  - `gpt-4o` and `gpt-4o-mini` are `approvedForHighRisk:false`, so drafting throws `ModelNotApprovedError` (gateway.ts:3183-3191).
  - `@anthropic-ai/bedrock-sdk` and `vertex-sdk` are not in package.json; clients.ts:13-16 disables those providers when the package is absent.
  - The deploy preflight (`deploy-aws.yml:374-379`) and `ana-readiness-state.ts:121` do not require a model approved for high-risk work.
  - Bedrock and Vertex entries are pinned to Opus 4.7 with Claude 3 pricing and a 200K context window (cloud-models.ts).
- Impact: Authoring AI drafting refuses in production. The EU-residency and BAA story (Bedrock/Vertex) cannot be deployed. Anthropic's direct API is placed as `global` only and `inference_geo` is never sent.
- Fix:
  - Add an Anthropic secret (or Bedrock with the SDK, IAM and an inference-profile ID) to Terraform.
  - Make the preflight and `/readyz` fail unless at least one high-risk-approved, PQ-passed model is enabled.
  - Bump the Bedrock/Vertex pins, prices and context windows.
- Effort: S-M. Dependencies: provider contract.

**AI-03 — P1 — The AnA Python "sandbox" is an in-process socket patch**
- Evidence:
  - `python-script-runtime.py:64-84` replaces `socket.socket`, then `exec()`s model-written code (:141, :159).
  - It is spawned as the server's own user with no container (`compute/scriptWorker.ts:67-76`).
  - `_socket`, `subprocess` and `os.system` are all untouched.
  - By contrast, `containerExec.ts:74` does use `--network none`.
- Impact: a document poisoned via prompt injection, plus one confirmed click, can exfiltrate data; possibly read server secrets via `/proc/<ppid>/environ` (UNVERIFIED in the ECS image).
- Fix: route `run_python_script` through `containerExec` (no network, non-root, read-only root filesystem, no host mounts) or delete the tool.
- Effort: S. Dependencies: none.

**AI-04 — P1 — Model-produced figures on mounted paths**
- Evidence: see the table above.
- Impact: Rule 2 defect. RTF/CRL "likelihoods" and auto-assigned CTD placement shown as facts in Submission Center and Vault are an inspection finding waiting to happen.
- Fix:
  - Shadow review: derive scores only from a deterministic rubric, or drop them.
  - Classification: store it as a proposal that needs human acceptance.
  - Drafting: drop citations whose `sourceId` is not among the retrieved chunks, take the page from the database, remove model confidence.
  - Traceability: compute `needsReview` deterministically.
  - Fence or delete ana-cortex analysis, snowglobe scoring, csr-builder safety signals and the twin's default of 50.
  - Add a `ci:model-figure` gate that scans prompt strings for numeric score schemas.
- Effort: M-L. Dependencies: none.

**AI-05 — P1 — Grounding is marker-based, not verified**
- Evidence:
  - `c2c/ai-editing.ts:436-446` marks a claim SUPPORTED if it contains any `[SRC-n]`; there is no entailment or number check, and WEAK is never assigned.
  - Retrieval failure is swallowed (`:247`) and generation continues ungrounded; the "expand" action asks for "supporting evidence references" (`:331`).
  - Retrieved evidence is placed in the system role (`:343-350`).
  - `groundedness.ts` is a citation-marker regex.
  - `answer-grounding.ts` checks only identifiers and quotes, is advisory, and reports a ratio of 1 when no tools ran.
- Impact: fabricated numbers can pass as "supported" in the canonical editor.
- Fix:
  - Refuse claim-bearing actions when retrieval is empty.
  - Move evidence into a delimited user turn.
  - Add a post-generation validator: every numeric token in a sentence must appear in its cited chunk text, else mark it unsupported.
  - Block acceptance on high-risk drafts that contain unsupported claims.
- Effort: M. Dependencies: none.

**AI-06 — P1 — No regulatory corpus ships**
- Evidence:
  - `data/ich_guidelines/` contains only README.md.
  - Ingestion is CT.gov only and off by default (`corpusIngestionSweep.ts:153`, `ENABLE_CORPUS_INGESTION`).
  - `server/data/ich-guidelines-comprehensive.json` is 40 KB of metadata.
  - There is no FDA guidance, CFR or eCTD spec text and no currency tracking.
- Impact: RAG answers about guidance come from model memory, and the RAG PQ component cannot run.
- Fix: a licensed ingestion pipeline (FDA guidance, eCFR, ICH, EMA) with version, effective date and hash per document, a staleness sweep, and pgvector at 1536 dimensions.
- Effort: L. Dependencies: licensing (see open questions).

**AI-07 — P1 — The eval is thin, lexical, and not in CI**
- Evidence:
  - The RAG gold set has 20 items, 0 of which carry `expectedSourceIds`, so retrieval precision and recall cannot be measured.
  - Doc-quality has 42 tasks: 3 document types × (10 generation + 4 extraction), scored by substring coverage and forbidden phrases.
  - The offline run scored 6 and skipped 36 ("no captured candidate").
  - No `eval`, `pq` or `ai:eval` step exists in `.github/workflows`, and there is no prompt-change regression gate. Only 33 `promptVersion` uses exist against about 127 AI-calling files.
- Fix:
  - An SME-authored gold bank of at least 10 tasks per launch document type, plus 100+ retrieval items with source IDs.
  - Nightly PQ regression.
  - A gate that requires an eval re-run when a prompt hash changes.
- Effort: M-L. Dependencies: SMEs.

**AI-08 — P1 — Provider governance: Moonshot, and non-PII content goes anywhere**
- Evidence:
  - `TASK_PROVIDER_PREFERENCES` (gateway.ts:403-413) puts Moonshot (China-based; `kimi-k2-0711-preview` is a preview model) in the fallback chain for every task whenever `KIMI_API_KEY`/`MOONSHOT_API_KEY` is set.
  - `sensitive-placement-policy.ts:51` allows any provider when the detected data class is `none`; tenant allow-lists are opt-in.
  - A cross-provider fallback switches to a different data processor silently.
- Impact: unpublished CMC and clinical content can reach an unapproved sub-processor.
- Fix: delete Moonshot from the registry; default the tenant allow-list to the contracted provider(s); record every cross-provider fallback.
- Effort: S. Dependencies: data processing agreements.

**AI-09 — P1 — The PHI/PII screen is text-regex only**
- Evidence:
  - `heuristic-classifier.ts:35-47` covers SSN, email, card, phone, MRN/DOB (label required) and plan ID.
  - It misses patient names, subject IDs and adverse-event narratives.
  - Non-text blocks are "not inspected" (`pii-screen.ts:99`). PDF intake (stream.ts:1203-1222, flag-gated) and images in `AnaDocumentDraftingService` bypass it.
- Impact: clinical narratives are classed `none` and sent without a zero-retention provider.
- Fix: treat clinical-document payloads as PHI-possible (require an approved zero-retention placement); refuse non-text blocks unless the placement is approved for PHI; move to the SLM classifier.
- Effort: M. Dependencies: AI-02.

**AI-10 — P1 — Metering and quota gaps**
- Evidence:
  - `recordTenantUsage` uses only the explicit `request.organizationId` (gateway.ts:3905-3907); ambient tenant binding does not set it (:3379-3383).
  - A heuristic scan found 134 of 171 non-AnA call sites passing no organisation ID (`scratchpad/ai/orgscan.mjs`); example: ai-editing.ts:356.
  - Those calls are not metered and all share the `'__global__'` 100 requests/minute bucket (policy.ts:520).
  - Rate buckets are in-memory per process.
  - `dailyCost` is accumulated (:366-376) but never checked.
  - Weekly limits apply to AnA routes only, are opt-in, fail open, and count requests only (register-ai-routes.ts:15-21).
- Fix: bind the organisation ID from tenant scope inside the gateway; use Redis buckets; enforce per-organisation token and cost caps with per-plan defaults.
- Effort: M. Dependencies: billing plans.

**AI-11 — P1 (latent) — One platform-wide Gmail and Calendar shared across tenants**
- Evidence:
  - `search_regulatory_correspondence` (class read, in scope; AnaToolExecutor.ts:4169) reads the one mailbox set by `GMAIL_OAUTH_JSON` (correspondence-search.ts:49) for any tenant.
  - `create_calendar_event` (:4150) writes to one shared calendar.
- Impact: cross-tenant data exposure once configured, and an email-borne prompt-injection channel.
- Fix: per-tenant connector credentials, or remove both tools from scope.
- Effort: S.

**AI-12 — P2 — Bypass gate blind spots**
- Evidence: see the table above.
- Fix:
  - Allow alphanumeric characters before `/v1/`.
  - Extend the host list.
  - Flag any import of a provider SDK outside the gateway.
  - Count call sites per baselined file.
- Effort: S.

**AI-13 — P2 — Sprawl and a duplicate drafting path**
- Evidence:
  - `services/ana` is 139,505 lines, 99.6% statically reachable (`scratchpad/ai/reach.mjs`).
  - 779 tools are registered: 590 in launch scope, 86 with write-shaped names.
  - 31 AI-flavoured `/api` mounts: /api/chat, /api/ana-ri, /api/ana, /api/claude, /api/ana-cortex plus an alias, /api/gcc/drafting, and others.
  - `/api/gcc/drafting` depends on `vault.hybrid_search`, `table_priority_search`, `drafting_sessions` and `extracted_entities`, none of which is created by any file in `C2C_MIGRATION_FILES`, so it is dead on deploy.
  - cognitive-ecosystem is 10,451 lines and unreachable.
- Impact: Computer System Validation of this surface is infeasible, and it breaks the zero-duplication rule.
- Fix: define the minimal launch AI surface (AnA chat over Vault, `draft_authoring_document` plus editor AI, Vault classify/extract, narration of readiness, MCP) and fence or delete the rest per the working-agreement deletion rule.
- Effort: L-XL.

**AI-14 — P2 — Model pin hygiene**
- Evidence:
  - `gpt-4o`, `gpt-4o-mini` and `moonshot-v1-*` are floating aliases recorded as "pinnedVersion".
  - `kimi-k2-0711-preview` is a preview model.
  - The Sonnet slot is `claude-sonnet-5` (valid, previous generation; the current Sonnet is `claude-sonnet-5-5`).
  - vault.ts:202 defaults to `text-embedding-ada-002`.
  - The embedding corpus policy is advisory (embedding-corpus-policy.ts says so itself).
  - Status of gpt-4o and Kimi retirement: UNVERIFIED.
  - All Anthropic direct pins are valid current IDs: `claude-opus-5-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-haiku-4-5`.
- Effort: S.

**AI-15 — P2 — Retention and data locality**
- Evidence:
  - `retentionCron.ts` covers vault.documents only; there is no scheduled retention for chat_messages, ai_generation_runs or `ai.gateway_audit_log`.
  - `ai.gateway_audit_log` holds user and organisation IDs in the non-public `ai` schema with no RLS (20260813_ai_gateway_audit_log.sql); there are no readers today.
- Effort: S-M.

**AI-16 — P2 — MCP connector is not ready for the Connectors Directory**
- Evidence:
  - `MCP_ENABLED` is not set in Terraform.
  - `docsUrl` `/concept2cure/connector` has no route (no client or server match).
  - There is no public privacy-policy URL or support contact.
  - Dynamic client registration is open in production unless `MCP_CLIENT_REDIRECT_ALLOWLIST` is set (index.ts:199-205).
- Effort: S.

**AI-17 — P3 — Timeouts**
- Evidence:
  - The Anthropic client is built without `timeout` or `maxRetries` (gateway.ts:4071), so the SDK defaults apply (10 minutes, 2 retries).
  - `Promise.race` 120-second timeouts (gateway.ts:2167, 2433, 2888) do not abort the underlying request, so spend continues and retries stack.
- Fix: an `AbortController`-backed timeout plus explicit SDK settings.
- Effort: S.

### Recommended work orders (in order)

1. **Provision the governed primary model.**
   - Scope: a Terraform secret for Anthropic (or Bedrock plus SDK, IAM and inference profile); preflight and `/readyz` require an enabled model that is approved for high-risk work and has passed PQ.
   - Acceptance: a Terraform plan contains the provider; the deploy preflight fails on a task definition that has only an OpenAI key; a drafting request in staging is served by `claude-opus-5-5`.
   - Effort: S-M. Dependencies: provider contract.
2. **Execute and enforce PQ.**
   - Scope: protocol approval, expanded gold bank, `pq:run --record` for the primary and one fallback, and gateway enforcement.
   - Acceptance: two registry entries show `pq.passed` with a reference that `verifyPqClaim` accepts; a test proves a high-risk request to a PQ-pending model throws `ModelNotApprovedError`; the fail case is shown.
   - Effort: M. Dependencies: #1, founder sign-off.
3. **Sandbox and tenant-leak fixes** (AI-03, AI-11).
   - Acceptance: model code that opens `_socket` or runs `subprocess` curl fails inside the tool; the Gmail and Calendar tools are refused without a per-tenant credential.
   - Effort: S.
4. **Remove model-produced figures** (AI-04) and add a `ci:model-figure` gate.
   - Acceptance: the gate fails on a synthetic prompt containing `"score": number (0-100)`; the shadow-review score is reproducible from findings alone; classification never writes `moduleNumber` without a human acceptance row.
   - Effort: M-L.
5. **Grounding validator for editor AI** (AI-05).
   - Acceptance: a draft containing a number absent from the cited chunk is marked UNSUPPORTED and acceptance is blocked for high-risk work; empty retrieval returns 422 for `expand` and `add-references`.
   - Effort: M.
6. **Data governance** (AI-08, AI-09).
   - Acceptance: Moonshot is absent from `getModels()`; a PDF or image block with no PHI-approved placement is refused in production; the tenant default allow-list is enforced.
   - Effort: M. Dependencies: #1.
7. **Metering and quotas** (AI-10).
   - Acceptance: every served ledger row has an organisation ID; two orgs do not share a rate bucket; a per-org daily cost cap blocks the next call.
   - Effort: M.
8. **Corpus and eval** (AI-06, AI-07).
   - Acceptance: `verify-rag-corpus` reports at least N FDA/ICH/CFR documents with an effective date; the RAG gold set has at least 100 items with source IDs; nightly CI runs doc-quality and RAG evaluation with thresholds.
   - Effort: L. Dependencies: licensing, SMEs.
9. **Gate hardening, pin hygiene, timeouts** (AI-12, AI-14, AI-17).
   - Acceptance: all 7 scratch evasion shapes are caught; no floating aliases remain in `pinnedVersion`.
   - Effort: S.
10. **Surface reduction** (AI-13).
    - Acceptance: a documented launch AI surface; `/api/gcc/drafting`, cognitive-ecosystem, ana-cortex analysis and snowglobe scoring are removed, each with its replacement named per the working agreement; the in-scope tool count is cut to the launch set.
    - Effort: L-XL.
11. **MCP directory package and retention** (AI-15, AI-16).
    - Acceptance: the docs, privacy and support URLs resolve; `MCP_ENABLED` is in Terraform; retention jobs exist for AI tables.
    - Effort: S-M.

### Open questions / needs from the founder

- **Provider contracts.** Which provider is primary: Anthropic direct or Bedrock? Is a zero-data-retention agreement signed (the gateway reads `ANTHROPIC_ZERO_RETENTION` / `OPENAI_ZERO_RETENTION`)? Is a BAA needed for any PHI customer? Is Moonshot allowed at all? The OpenAI and Cohere/Voyage sub-processor listings must be in customer data processing agreements.
- **Placement value.** What value should `AI_PROVIDER_PLACEMENT_APPROVALS` take for production (which provider, region, data classes and intended uses)?
- **PQ.** Approval of PQ-DRAFT-001, its acceptance criteria and the system owner. Who authors the SME gold tasks, and for which launch document types?
- **Corpus licensing.** Terms for ICH guideline reuse, EMA content reuse, MedDRA (csr-builder uses preferred terms), licensed eCTD DTDs/stylesheets, and the eSTAR templates. FDA guidance and the eCFR are public domain.
- **Retention.** The retention period for prompts, completions and chat, and whether customers require no storage of prompts at all.
- **Plans.** AI usage caps per plan (tokens or cost), which gate the quota defaults in work order 7.
