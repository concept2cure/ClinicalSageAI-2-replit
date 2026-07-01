# AnA 1.0 RI — Full Stack Audit

**Date:** 2026-07-01
**Branch:** `concept2cure-v2`
**Scope:** Backend routes, AI gateway, RIM integration, frontend chat shell, tests/observability/security
**Method:** Five parallel `Explore` agents, one per subsystem; consolidated here.

---

## Executive Summary

AnA 1.0 RI is a **production-grade regulatory-intelligence chat surface** built on a well-architected multi-provider AI gateway (Claude-first, OpenAI/Moonshot fallback) with sophisticated 3-layer memory assembly, prompt caching, and non-blocking RIM signal capture. The Claude Design bundle has been ported into `client/src/concept2cure/components/ana/` with explicit deviation documentation.

**Where it shines:** streaming SSE with phase telemetry, ephemeral prompt caching with stable/volatile split, provenance-plumbed intelligence signals, multi-tier context assembly with timeout safety, tenant-scoped auth via JWT.

**Where it hurts:** minimal test coverage on the hot paths (`/stream`, `/chat`, interceptors), duplicated provider client instantiation, no cost tracking despite the plumbing existing (`recordCost()` never called), 160KB `command-executor.ts` god-file, unbounded input arrays, prompt-injection defense reduced to two regexes, and a learning loop that captures feedback but never closes back to the pattern registry.

**Overall grade — subsystem breakdown:**

| Subsystem | Grade | Headline |
|-----------|-------|----------|
| Backend routes & orchestration | B+ | Well-engineered protocol layer; god-file + missing tests + unbounded inputs |
| AI gateway & context assembly | A– | Models current, cache correct, tool loop incomplete, providers duplicated |
| RIM integration | B | 6/7 invariants hold; anchoring inconsistent, learning loop half-open |
| Frontend chat shell | B+ | Faithful bundle port, thoughtful streaming; no tests, no error boundary |
| Testing / Observability / Security | C+ | Auth good, injection defense weak, no runId trace, no cost telemetry |

---

## 1. Backend Routes & Orchestration

### 1.1 Inventory

**Route files** (`server/routes/ana-ri/`):

| File | Purpose |
|------|---------|
| `ana-ri.ts` (53 lines) | Router mount point |
| `chat.ts` (716 lines) | Non-streaming `POST /api/ana-ri/chat` with firecrawl + idempotency cache |
| `stream.ts` (684 lines) | SSE streaming `POST /api/ana-ri/stream` with phase telemetry |
| `plan.ts`, `kernel.ts`, `generate-execute.ts`, `lookups.ts`, `utility.ts` | Goal-plan, observability, generation, taxonomy, health |
| `shared.ts` (116 lines) | Response envelopes, enum validation, gateway singleton |

**Service files** (`server/services/ana-ri/` and adjacent):

- `orchestrator.ts` — 1,745 lines; intent + submission-type + role detection, system-prompt assembly
- `command-executor.ts` — **160 KB god-file**; artifact ops, project ops, guidance, evidence, RIM
- `context-enrichment.ts` — 63 KB; message rewriting
- `workflow-orchestration.ts` — 40 KB; workstream + handoff logic
- `deficiency-taxonomy.ts` — 32 KB; per-submission-type deficiency catalog
- `persona.ts` — 32 KB; prompt templates, workstream priorities
- `artifact-generator.ts`, `evaluation.ts`, `evidence-validation.ts`, `enforcement.ts`, `chat-context-builder.ts`, others

**Mount:** `server/bootstrap/register-ai-routes.ts:16` → `app.use('/api/ana-ri', aiCircuitBreaker, anaRiModule.default)` (failureThreshold 10, resetTimeout 30s, maxTimeout 60s).

### 1.2 Request Lifecycle (chat message → response)

1. **Middleware** — helmet, CORS, Redis rate limiter (generic `/api`), structured HTTP logs, AI circuit breaker
2. **Context extraction** — `extractRequestContext()` (`shared.ts:48`) normalizes tenant/user
3. **Validation** — enum check on `intent_lens` / `user_role`, `MAX_HISTORY_MSGS=20`, `MAX_MSG_LENGTH=50 000`; **no bound on `file_ids`**
4. **Orchestration** — `orchestrate()` (`orchestrator.ts:277`): intent (pattern match), submission type (IND/NDA/BLA/510k/PMA/de_novo/CER/eCTD), role, workstream, system prompt
5. **Kernel routing** — `planKernelExecution()` (`kernel-router.ts:49`): risk tier (low/medium/high), temperature (0.7 → 0.3 → 0.2), max tokens `clamp(req, 512, 8192)`, extended thinking budget 10K tokens when high-risk
6. **Context assembly (parallel)** — intelligence prefix + memory + enrichment + decision + RIM (chat.ts:324, stream.ts:218)
7. **Message build** — stable prefix (intelligence + orchestration) marked `cache_control: ephemeral`; volatile suffix (memory + enrichment) per-turn
8. **Gateway call** — `gw.route()` (sync) or with `stream: true` (SSE)
9. **Synchronous post-processing** — evidence discipline, structure validation, evidence verdict
10. **Async post-processing (background IIFE)** — guidance executor, command executor, thread persistence, RIM interception, kernel decision record

### 1.3 Sophistication

- **Prompt caching** with strategic breakpoints (chat.ts:360, 395; stream.ts:281-285)
- **Phase telemetry** in SSE `done` event: `orchestrationMs`, `contextMs`, `gatewayMs`, memory diagnostics, cache hit/stats
- **Thinking deltas separated** from content tokens (stream.ts:417-424)
- **Tenant scoping** end-to-end, with thread ownership validation
- **Governance layer** — `[KNOWN]/[INFERRED]/[MISSING]` evidence labels, overclaim detection, structure validation, artifact quality gates
- **Idempotency cache** on `/chat` (5-min TTL, 10-min cleanup)
- **Consistent response envelopes** — `{success, data, meta?}` / `{success, error}`

### 1.4 Deficiencies

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | Medium | `chat.ts:401-406`, `stream.ts:323-328` | Unbounded `fileIds` array; `WHERE id = ANY($1)` has no LIMIT |
| 2 | Medium | none | AnA-specific endpoints have no per-user/per-org rate limits distinct from the generic `/api` cap; `/stream` is the most expensive endpoint |
| 3 | Medium | `stream.ts:651-668` | Background IIFE errors only `console.error`'d; user gets no post-`done` failure signal |
| 4 | Medium | `chat.ts:500-503` | Enforcement warnings trigger `replanGoalPlan` but response still ships without `qualityWarnings` |
| 5 | Medium | `command-executor.ts` (160 KB) | God-file mixing artifact, project, guidance, evidence, RIM — impossible to reason about side effects |
| 6 | Medium | 17 sites in `chat.ts` | `any` in hot paths (`evaluation: any`, `response.content`, `executedActions: any[]`) |
| 7 | Medium | `stream.ts:554` | `cleanedFullContent` declared at top, assigned only inside background IIFE; used at 564 without null guard |
| 8 | Low | `shared.ts:71-80` | `ensureGateway()` swallows init errors; transient failures cascade silently |
| 9 | Low | none | No test suite for `/chat` or `/stream` |
| 10 | Low | `stream.ts:399-401` | Extended-thinking budget hardcoded 10K when high-risk; no org feature flag check |

### 1.5 Integration seams

`gw.route()` → gateway • `buildMemoryContextForChat()` → memory assembler • `interceptChatResponse()` → RIM • `recordKernelSuccess()` → kernel-orchestrator • `routeEvidenceRequest()` → research-intelligence • `getOrCreateThread()` → chat-thread-helpers • `processResponseActions()` → guidance-executor • `processCommandsInResponse()` → command-executor • `prefetchRouteIntelligenceContext()` → chat-context-builder • `validateEvidence()` → evidence-validation • `recordAnaTurn()` → ana-ri-metrics.

---

## 2. AI Gateway, Models & Context Assembly

### 2.1 Model inventory (all current, no stale prod refs)

| Registered ID | Model string | Provider | Ctx | Quality |
|---|---|---|---|---|
| `claude-opus-4` | `claude-opus-4-20250514` | Anthropic | 200k | 99 |
| `claude-sonnet-4` | `claude-sonnet-4-20250514` | Anthropic | 200k | 97 |
| `claude-haiku-4` | `claude-haiku-4-5-20251001` | Anthropic | 200k | 85 |
| `gpt-4o` / `gpt-4o-mini` | (same) | OpenAI | 128k | 95 / 82 |
| `kimi-k2-0711`, `moonshot-v1-128k`, `moonshot-v1-32k` | (same) | Moonshot | 32–131k | 83–88 |

Only stale ref: `gateway.test.ts:48` uses `claude-3-5-sonnet-20241022` as a test fixture. Task routing (`gateway.ts:163-173`) enforces Anthropic-primary / OpenAI-fallback / Moonshot-tertiary — matches CLAUDE.md policy.

### 2.2 Prompt caching — implemented correctly

Ephemeral cache with two breakpoints: stable system prefix (chat.ts:360) and last assistant message in history (chat.ts:395). Same pattern in `stream.ts:409`. Cache stats surfaced through `response.cacheStats` and telemetry (stream.ts:463-467). Stable/volatile split is intentional and sound.

### 2.3 Context assembler — 3-layer

`memory-context-assembler.ts:233-395` runs three semantic searches with per-layer 3s timeouts (line 40): working memory (thread), client memory (org-wide), project memory (project-scoped). Per-layer clamps: 4 results, 3500 chars, similarity ≥ 0.6, age ≤ 180d. Deduplication via title + content prefix (line 212-231). Forgetting policy drops old entries unless critical/verified (line 183-201). Per-layer outcomes tracked (`ok/empty/timeout/error/skipped`) — surfaced to the client in the SSE `done` event.

### 2.4 Tool use — partially implemented

Tool definitions (`DOCUMENT_DRAFTING_TOOLS`, `COMPLIANCE_REVIEW_TOOLS`, `GAP_ANALYSIS_TOOLS`) and handlers (`ClaudeToolExecutor.ts:44+` — `search_clinical_evidence`, `search_literature`) exist. Extraction of `toolUses[]` works (gateway.ts:687-704). **Agentic loop is missing**: tool results are never fed back to Claude for a second turn. Feature is declared but non-functional end-to-end.

### 2.5 Provider health & fallback

- Exponential-moving-average latency and error-rate decay per provider (gateway.ts:1142-1178)
- 1 retry per provider with 1s base backoff + 0–30% jitter (gateway.ts:268-291)
- 400/401/403 fail immediately (correct); **429 is not retried** (`policy.ts` rate-limit path has no adaptive backoff)
- Fallback provider chain from `getFallbackModels()`
- Streaming watchdog: 30s inactivity → attempt `stream.controller.abort()` (stream.ts:847)

### 2.6 Deficiencies

| # | Severity | Issue |
|---|----------|-------|
| 1 | Medium | Tool execution loop incomplete — no result-feedback iteration |
| 2 | Medium | Duplicated provider clients: `anthropic-client.ts:40`, `openai-client.ts:61`, `aiProviderRouter.ts:298,488`, `gateway.ts:1298-1320` — each holds its own SDK instance, separate pools, inconsistent instrumentation |
| 3 | Medium | Hardcoded token budgets (`maxTokensPerRequest: 16 000`, OpenAI default 2000, Claude default 4096); no dynamic budgeting against actual prompt size |
| 4 | Medium | PII detection declared in `policy.ts:21-28` but not implemented |
| 5 | Low–Med | Extended-thinking budget hardcoded 10K (gateway.ts:656) |
| 6 | Low–Med | 429 not retried; provider-health thresholds (3 failures) hardcoded |
| 7 | Low | Audit logging failures swallowed (gateway.ts:1228) |

### 2.7 Sophistication highlights

Provider-health tracking with decay; deterministic demo mode; thinking/text stream separation; parallel context assembly; cost estimation per response; per-org/user/task audit records (types.ts:329-351) with non-blocking async persistence.

---

## 3. RIM Integration

### 3.1 Interceptors — call sites

| Interceptor | Call site | Blocking? |
|-------------|-----------|-----------|
| Chat | `chat/send-message.ts:768-779`; `ana-ri/chat.ts:612-622`; `ana-ri/stream.ts:440+` | Fire-and-forget with `.catch()` |
| Compliance | `concept2cure.ts:5603` | Non-blocking |
| Artifact | `concept2cure.ts:6796, 7140` | Non-blocking |
| Feedback | `concept2cure.ts:9191, 17920-17921` | Non-blocking |

All route through `rim-integration.ts` for provenance construction.

### 3.2 Version constants

- `JUDGMENT_FRAMEWORK_VERSION = 1.1.0` (`judgment-framework.ts:38`)
- `PATTERN_REGISTRY_VERSION = 1.2.0` (`pattern-registry.ts:26`)
- `RIM_VERSION = 1.1.0` (`rim.ts:80`)

Bumped manually in source; no CI automation. All attached to every signal.

### 3.3 Invariant audit (per CLAUDE.md §656-664)

| # | Invariant | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Persistence is source of truth | ✅ Pass | `signal-capture.ts:118-270` |
| 2 | Every signal has provenance | ✅ Pass | `signal-capture.ts:46-51` |
| 3 | Every signal is anchored | ⚠️ Partial | `ana-ri/chat.ts:612` and `send-message.ts:772` do not reliably pass `sectionCode` |
| 4 | No silent persistence failure | ✅ Pass | `rim.ts:271-275` marks status `degraded` |
| 5 | Trends include confidence | ✅ Pass | `signal-capture.ts:606-612` |
| 6 | Interceptors are non-blocking | ✅ Pass | All call sites fire-and-forget |
| 7 | Trend detection ≥ 10 signals | ✅ Pass | `MIN_TREND_SAMPLE_SIZE=10` in `signal-capture.ts:136` |

### 3.4 Deficiencies

| Severity | Location | Issue |
|----------|----------|-------|
| High | none | Zero tests for `rim-interceptors.ts` — non-blocking guarantee unverified under concurrency |
| Medium | `ana-ri/chat.ts:612` | `sectionCode` not passed → downstream trend analysis loses section grouping |
| Medium | `ana-ri/chat.ts:617-618` | Claim metrics hardcoded (`claimCount: 0, supportedClaimRate: 0.5`) instead of computed |
| Medium | `pattern-registry.ts` | `addLearnedPattern()` in-memory only; learned patterns lost on restart |
| Medium | `pattern-registry.ts:96` | `hitCount` and `lastMatchedAt` in-memory only |
| Medium | `learning-loop-service.ts` | Feedback captured but never updates pattern confidence or suppresses dismissed types — loop is half-open |
| Low | `rim.ts:200-206` | Evidence persistence is fire-and-forget with no degraded status |

### 3.5 Sophistication

Version-aware trend detection filters signals by `judgmentFrameworkVersion` before comparison. Two-layer signal architecture (working 500-cap volatile / durable Intelligence Record). Judgment framework composes 6 weighted models (Evidence Sufficiency 25%, Defensibility 20%, Reviewer Sensitivity 15%, Claim Risk 15%, Cross-Section 10%, Submission 15%). Pattern registry ships 16 hand-curated seed patterns with regulatory basis and remediation — deterministic, no LLM required.

---

## 4. Frontend Chat Shell

### 4.1 Inventory — `client/src/concept2cure/components/ana/`

| File | Lines | Purpose |
|------|-------|---------|
| `Ana.tsx` | 410 | Shell; view state, handlers, wiring |
| `useAnaChat.ts` | 450 | SSE hook; status/text/thinking/done/post_done/grounding_strip/warning/error |
| `Message.tsx` | 459 | Row; markdown (via `marked`), code-copy, thinking, actions, feedback |
| `ChatView.tsx` | 188 | Thread; smart-stick scroll, jump-to-latest |
| `Composer.tsx` | 118 | Auto-grow textarea; Enter/Shift+Enter/Escape |
| `Sidebar.tsx` | 154 | Collapsible rail; recents |
| `TopBar.tsx`, `EmptyState.tsx`, `ProjectsView.tsx`, `useRecents.ts`, `icons.tsx`, `styles.module.css` | | |

### 4.2 Design bundle alignment

**Explicitly aligned.** Every file's header cites the bundle source path (e.g. `docs/design/concept2cure-design-system/project/ui_kits/ana_ri/App.jsx`), and `Ana.tsx:7-16` lists six user-approved functional deviations (real streaming, stop button, latency chip, executed-actions row, inline edit, real recents). Styles reference Claude Design tokens (`--sidebar`, `--accent-main-100`, etc.), no hardcoded colors, no new selectors.

### 4.3 Mode wiring

**No `standard`/`deep-research`/`nano-banana` toggle in the UI.** `submissionType` is a prop, forwarded to `useAnaChat` and included in POST body as `submission_type`. Mode selection lives server-side in the kernel router.

### 4.4 Sophistication

- SSE with `AbortController`, buffered `TextDecoder`, event-type dispatch, idempotent `thread_id` capture, thinking/text separation
- Live markdown during streaming (partial-input tolerant); post-mount code decoration + copy button
- Smart stick-to-bottom (< 80px from bottom follows tokens; otherwise `jump to latest`)
- Auto-grow composer (up to 8 lines); Shift+Enter, Enter to send, Escape to stop
- ARIA attributes on nav, thinking toggle, jump button, edit, send/stop

### 4.5 Deficiencies

| # | Issue |
|---|-------|
| 1 | **No error boundary around `<Ana>`** — `ErrorBoundary.tsx` exists but isn't used; any child throw crashes the workspace |
| 2 | Raw `fetch()` in `useAnaChat.ts:240-245` instead of `apiRequest()`; inconsistent with `useRecents.ts:59` |
| 3 | No skeleton on `loadThread()`; `isLoadingThread` flag exists but never rendered |
| 4 | Hardcoded strings (`"Planning response…"`, `"Reply to AnA…"`, `SUGGESTED_ACTION_LABELS`) |
| 5 | **Zero tests** for `Ana`, `useAnaChat`, `Message`, etc. |
| 6 | `Ana.tsx` is a 410-line god-component (view state + handlers + transforms + hooks) |
| 7 | Attach/Tools buttons in Composer are visual stubs (no `onClick`) |
| 8 | Model chip in Composer non-functional |
| 9 | `Message.tsx:341` uses `dangerouslySetInnerHTML` with `marked` output; no DOMPurify pass |
| 10 | Thinking section has no `max-height` — long thinking pushes assistant reply off-screen |
| 11 | Copy button calls `navigator.clipboard` but no visual confirmation |
| 12 | No offline/network-failure retry affordance |
| 13 | No analytics or user-event logging despite 21 CFR Part 11 claim in header comment |

---

## 5. Testing, Observability, Security

### 5.1 Test inventory

**Exists:** `tests/routes/ana-ri-health.test.ts`, `ana-ri-resilience.test.ts`, `ana-gap-analysis.test.ts`, `tests/resolution/ana-orchestrator.test.ts`, `tests/services/ana-biostats.test.ts`, `server/services/__tests__/ana-ri.test.ts` (>200 lines: intent lens, role output, hedging penalty, taxonomy, conversation continuity), `ana-guidance-executor.test.ts`, `governed-ana-execution.test.ts`, `intelligence-engine.test.ts`, `kernel-observability.test.ts`, `kernel-router.test.ts`. Playwright: `510k-founder-path.e2e.spec.ts`.

**Missing:** `/stream` SSE, `/chat` (idempotency + firecrawl), evidence validation, command executor, kernel protocol, auth/tenant-boundary, prompt-injection, RIM interceptors, cost tracking. Estimated coverage on AnA paths: **~40–50%**.

### 5.2 Observability

- **Sentry** (`server/utils/sentry.ts:6`) — 10% trace sampling in prod
- **Prometheus** — CER + `concept2cure` error counters
- **AnA RI metrics** (`ana-ri-metrics.ts`) — in-memory histograms for turns, prompt cache, phase latencies (9 buckets 50ms–30s), semantic search, memory layer outcomes
- **Structured logs** (`monitoring.js:41-50`) — JSON, error context to Sentry
- **Audit logger** (`middleware/auditLogger.js`) — API requests with body sanitization

**Gaps:**
- **No runId trace across services** — each layer logs independently
- **No cost/token tracking** — `policy.recordCost()` exists (`policy.ts:65`) but is never called
- **Phase telemetry not exported** — `streamOrchestrationMs`/`streamContextMs`/`streamGatewayMs` land in the SSE `done` event but not in Prometheus
- **AnA metrics in-memory** — lost on restart
- **No `Sentry.captureException()` in `stream.ts`/`chat.ts`**
- **Audit logger records HTTP, not semantic AnA turns** (intent lens, inferred role, deficiency detection)

### 5.3 Security

**Strengths:**
- **JWT auth enforced** (`middleware/auth.ts:64-94`)
- **Tenant from JWT, not headers** (`middleware/tenantContext.ts:88-106`) — warns on mismatch
- **Rate limiting** — Redis limiter on `/api`; policy engine tracks 100 req/min per org, 30 per user
- **Token ceiling** — `maxTokensPerRequest: 128 000` (`policy.ts:94-102`)
- **Enum validation** on `intent_lens`, `user_role` (`shared.ts:99-116`)

**Weaknesses:**

| # | Issue |
|---|-------|
| 1 | AnA route group does not explicitly mount `authenticateToken` / `requireOrganizationContext` — depends on parent router wiring; verify in `server/index.ts` |
| 2 | `/stream` uses generic AI rate limit (20 req/min) — should be tighter given per-request cost |
| 3 | No Zod schema for `OrchestratorInput` — TypeScript-only, no runtime validation |
| 4 | Message length uncapped at orchestrator input |
| 5 | `conversation_history` roles/content not validated |
| 6 | **Prompt injection defense: only 2 regex patterns** (`policy.ts:106-119`) — missing role-play, memory-wipe, XML tag, code-fence escape |
| 7 | Injection patterns applied to `messages` but not to the system prompt built from context |
| 8 | DOMPurify installed but no server-side sanitization on `text` / `grounding_strip` events |
| 9 | No PII scan on message, project_context, document_context, authoring_context |
| 10 | Firecrawl-scraped content persisted without PII filtering |

### 5.4 Audit trail (21 CFR Part 11)

**Reality:** HTTP-level audit logs only. **No** immutable AnA-turn table, **no** hash chain, **no** electronic signatures, **no** persisted decision record for lens/role inference, **no** prompt-assembly trace, **no** cryptographic binding of AnA output to user identity. Claims of Part 11 compliance in README and header comments are not backed by the code.

### 5.5 Cost controls

- Token ceiling per request ✅
- Rate limits per org/user ✅
- `dailyCost` field exists ✅ **but `recordCost()` is never called** ❌
- No daily budget ceiling, no budget alerts, no per-tenant cost quotas, no emergency kill-switch
- No input/output token accounting, no cache-savings surfacing
- Firecrawl quota is URL-based, tracked separately

### 5.6 Dependency health

| Dep | Version | Verdict |
|-----|---------|---------|
| `@anthropic-ai/sdk` | `^0.82.0` | Current, supports Claude 4.x |
| `openai` | `^6.33.0` | v7+ exists; verify streaming/cost regressions |
| `langchain` | `^0.3.21` | Current |

All caret-pinned; consider `major.minor` pins for the two AI SDKs given regulated context.

---

## 6. Prioritized Remediation Backlog

**P0 — safety / correctness**
1. Verify `authenticateToken` + `requireOrganizationContext` are mounted before `/api/ana-ri/*` in `server/index.ts`
2. Fix `stream.ts:554` null-guard on `cleanedFullContent`
3. Bound `file_ids` at 50 and add `LIMIT` to the `file_uploads` lookup
4. Wire `recordCost()` in gateway response path; add daily budget ceiling and kill-switch

**P1 — regulated-industry gaps**
5. Implement immutable AnA-turn audit table with hash chain; persist lens/role/deficiency decisions
6. Add server-side sanitization on `text` and `grounding_strip` SSE events (DOMPurify is already installed)
7. Expand prompt-injection patterns; apply them to the assembled system prompt, not just user messages
8. Fix RIM anchoring: pass `sectionCode` and computed claim metrics from `ana-ri/chat.ts:612`
9. Persist `pattern-registry` learned patterns + hit counts; close the learning loop back into pattern confidence

**P2 — resilience / observability**
10. Add `runId` correlation propagated from AnA routes through memory/RIM/gateway; export phase telemetry to Prometheus
11. Instrument `Sentry.captureException()` in `stream.ts` / `chat.ts` handlers
12. Add per-endpoint rate limits (`/stream` tighter than `/chat`)
13. Complete tool-execution agentic loop or remove tool definitions from the surface
14. Unify Anthropic/OpenAI/Moonshot SDK clients behind a single lifecycle-managed factory

**P3 — architecture / test debt**
15. Split `command-executor.ts` (160 KB) into artifact/project/evidence/guidance modules
16. Split `Ana.tsx` (410 lines) into shell + controller + hooks
17. Add SSE streaming tests (event order, large payloads, abort)
18. Add tests for RIM interceptors (non-blocking guarantee, provenance completeness)
19. Add auth/tenant boundary tests and prompt-injection attack tests
20. Wrap `<Ana>` in `<ErrorBoundary>`; replace raw `fetch()` in `useAnaChat` with `apiRequest()`

---

## 7. Assessment

AnA 1.0 RI is a **serious, well-thought-out platform** at the architectural level: the gateway pattern is right, the 3-layer context assembly is right, the ephemeral cache split is right, and the RIM invariants are almost all upheld. The chat shell is a faithful, documented port of the Claude Design bundle.

The problems are almost entirely in **the last mile**: unbounded inputs, hardcoded budgets, cost telemetry with the wiring missing at the final step, prompt-injection defense that hasn't kept pace with the threat model, an audit trail that doesn't meet the regulatory claim on the box, and thin test coverage on the most expensive endpoints. The learning loop is captured but not closed. The tool-use path is defined but not agentic.

Fixing the P0/P1 items would move this from "hardened but incomplete" to "production-ready for a regulated buyer." The god-files and test debt are the next expensive frontier after that.
