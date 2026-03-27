# QA Audit: AnA 1.0 RI Integration with New Surfaces

**Date**: 2026-03-27
**Auditor**: Claude Code (QA)
**Scope**: HAQ Manager, Tools Landing, Evidence Ask endpoint — integration with AnA 1.0 RI
**Reference**: `.claude/skills/ana-operating-system.md`

---

## Executive Summary

The three new surfaces (HAQ Manager, Tools Landing, Evidence Ask) are **partially integrated** with AnA 1.0 RI. The "Open in Editor" flow correctly uses `pendingEditorContent` to converge on EditorPanel. However, all three surfaces operate **outside** AnA's slash command and operational command system, violating the chat-first design principle. No `/haq`, `/ask`, or `/tools` slash commands exist, and the evidence-ask endpoint bypasses the AI gateway entirely.

**Overall Grade: C+ (Functional but not AnA-native)**

| Area | Grade | Key Issue |
|------|-------|-----------|
| HAQ Manager | B- | Uses `apiRequest`, converges to editor, but bypasses AnA for drafting |
| Tools Landing | B | Correct routing to EditorPanel, but no AnA context handoff |
| Evidence Ask endpoint | C | Bypasses AI gateway, does not use `sendSuccess`/`sendError`, no AnA wiring |
| Missing slash commands | D | Three obvious slash commands absent from both server and client |

---

## 1. HAQ Manager (`client/src/concept2cure/components/workflow/HAQManager.tsx`)

### What Works

- **`apiRequest` usage**: Correctly uses `apiRequest()` from `@/lib/queryClient` (line 25, 115) instead of raw `fetch()`. Compliant with UI state standards.
- **`onOpenInEditor` flow**: Properly calls `onOpenInEditor(content, title)` (line 152), which in ZenApp.tsx (line 2847-2852) sets `pendingEditorContent`, switches to `riViewMode='editor'` and `layoutMode='regulatory-workspace'`. This correctly converges to EditorPanel.
- **Toast feedback**: Uses `useToast()` for success and error states (lines 102, 133, 143).
- **Governed components**: Uses `WorkspaceCanvas`, `PageTitleHeader`, `WorkspaceStatusBadge`, `EmptyState`, `Button`, `Textarea`, `Spinner` — all from the component registry.
- **Accessibility**: ARIA roles, labels, and live regions present throughout.
- **Loading state**: Uses `Spinner` and disables button during drafting (lines 242-250).

### Issues Found

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 1.1 | **HIGH** | AI drafting calls `/api/evidence/ask` directly instead of going through AnA. This bypasses AnA's persona, context enrichment, RIM interception, and post-response processing. A HAQ response drafted this way gets zero regulatory intelligence overlay. | Route drafting through AnA's streaming endpoint (`POST /api/ana-ri/stream`) with a system context indicating HAQ mode, or add a `/haq` slash command that AnA processes natively. |
| 1.2 | **MEDIUM** | No governed artifact pipeline integration. Drafted responses live in component-local `useState` only. They are not persisted as artifacts, not versioned, and not auditable. The only persistence path is the manual "Open in Editor" click. | When a HAQ response is drafted, auto-create an artifact via the `create_artifact` operational command so it enters the governed lifecycle (Draft -> Review -> Verify -> Publish). |
| 1.3 | **MEDIUM** | Questions are parsed and stored entirely in client-side state. If the user navigates away, all ingested questions and drafted responses are lost. No backend persistence. | Persist HAQ sessions server-side (e.g., as a project-scoped collection), or at minimum store in working memory via AnA's thread. |
| 1.4 | **LOW** | The `context` parameter sent to `/api/evidence/ask` is a static string (line 118). It does not include project intelligence, submission type, regulatory agency, or any RIM signals. AnA would inject all of this automatically. | If keeping the direct endpoint call, at least pass submission type, target agency, and project context. |

### Verdict on AnA Leverage

**Partial.** The HAQ Manager does not use any AnA slash commands or operational commands for drafting. It calls a separate endpoint that bypasses the entire AnA intelligence stack. The "Open in Editor" convergence is correct, but the drafting step itself is AnA-unaware.

---

## 2. Tools Landing (`client/src/concept2cure/components/workspace/ToolsLanding.tsx`)

### What Works

- **Routing**: All tool clicks go through `onAction(toolId)` callback. In ZenApp.tsx, this correctly routes:
  - `'create'` -> EditorPanel (via `pendingEditorContent` or layout switch)
  - `'builder'` -> FullDocumentBuilder, which has its own `onOpenInEditor` that converges to EditorPanel
  - `'haq'` -> HAQManagerView, which has `onOpenInEditor` converging to EditorPanel
  - `'recent'` / resume -> `onResumeArtifact` opens artifact in EditorPanel
- **Component compliance**: Uses `WorkspaceCanvas`, governed `Button`-like patterns.
- **Mental model**: Correctly positioned as "Tools = making/continuing work" with AnA conversation being primary.

### Issues Found

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 2.1 | **MEDIUM** | When user clicks a tool and transitions to EditorPanel, AnA's conversational context is not pre-seeded. The user arrives at the editor with no AnA awareness of what they are about to do. For example, clicking "New Document" opens EditorPanel, but AnA does not receive a signal like "user is starting a new document." | On tool action, send an AnA context hint (via `initialMessage` or `moduleContext`) so AnA can proactively offer help. |
| 2.2 | **MEDIUM** | The "Vault / Data Room" tool (`id: 'vault'`) routes through `onAction('vault')` but there is no evidence of it converging to AnA's `/knowledge` command. The vault/ask capability exists as a separate surface. | Connect vault tool to AnA's `/knowledge` slash command or the evidence-ask pipeline with AnA context. |
| 2.3 | **LOW** | The "Review" and "Submit" tools route to separate views. These overlap with AnA's `/review`, `/scan`, `/preflight`, and `/submit` slash commands. Users may not realize they can do the same thing in chat. | Add a subtle hint on each tool card: "Also available: `/review` in chat" to reinforce chat-first discoverability. |
| 2.4 | **LOW** | No `data-testid` on individual tool buttons — only the outer `WorkspaceCanvas` has `testId="tools-landing"`. | Add `data-testid={`tool-${tool.id}`}` to each tool button for E2E testing. |

### Verdict on EditorPanel Convergence

**Good.** The Tools -> Editor flow works correctly through `pendingEditorContent`. All creation paths (Create, Builder, HAQ) converge on EditorPanel where AnA is available. The gap is that AnA receives no signal about which tool initiated the flow.

---

## 3. Evidence Ask Endpoint (`server/routes/evidence-ask.ts`)

### What Works

- **Auth**: Uses `authMiddleware` (line 48).
- **Rate limiting**: 15 requests/minute per user+org, well-configured (lines 22-33).
- **Input validation**: Checks for minimum 3-character question (lines 52-56).
- **Graceful degradation**: Returns structured error with `answer: null` on failure (lines 89-95).

### Issues Found

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| 3.1 | **HIGH** | Does **not** use the AI gateway (`server/services/ai-gateway/gateway.ts`). Instead calls `ForesightRAGService` which internally uses `advancedRAGPipeline` — a separate LLM call path. This means no Claude-primary/OpenAI-fallback routing, no token tracking, no unified cost accounting. | Refactor `ForesightRAGService` to route generation through the AI gateway, or wire evidence-ask as an AnA operational command that uses the standard pipeline. |
| 3.2 | **HIGH** | Does **not** use `sendSuccess()` / `sendError()` response envelope from `concept2cure.ts`. Uses raw `res.json()` (line 74) and `res.status(400).json()` (line 53). This violates the backend route standard. | Replace with `sendSuccess(res, data)` and `sendError(res, status, message)`. |
| 3.3 | **HIGH** | No RIM interception. When a user asks a question about project evidence, this is exactly the kind of signal RIM should capture — but the endpoint operates entirely outside RIM's interceptor chain. | Either (a) route through AnA so RIM chat interceptor fires, or (b) add an explicit RIM signal capture call after the RAG query returns. |
| 3.4 | **MEDIUM** | No tenant scoping. The `projectId` is passed but not validated against the user's organization. The `ForesightRAGService.query()` does not receive `orgId` or `userId`, so it may return documents from other tenants. | Pass `req.userId` and `req.header('x-organization-id')` through to the RAG service for tenant-scoped retrieval. |
| 3.5 | **MEDIUM** | AnA cannot call this endpoint via operational commands. There is no `ask_evidence` or similar command in `command-executor.ts`. If a user types "search my data room for X" in AnA, it triggers the "evidence" natural language trigger but cannot execute a structured RAG query. | Add an `ask_evidence` operational command to `command-executor.ts` that calls the same RAG pipeline, so AnA can answer data room questions natively. |
| 3.6 | **LOW** | The error response format on line 89 includes both `error` and `message` fields, which is inconsistent with the standard `sendError` envelope. | Standardize to `sendError(res, 502, 'Data Room search is temporarily unavailable')`. |

### Verdict on AnA Compatibility

**Poor.** The endpoint is architecturally isolated from AnA. It does not use the AI gateway, does not produce RIM signals, does not follow the response envelope standard, and is not callable from AnA's command system. It is a standalone RAG endpoint that happens to be consumed by HAQ Manager.

---

## 4. Missing Slash Commands

### Current State

The server-side `detectSlashCommand` regex in `context-enrichment.ts` (line 45) contains **48 commands**:
```
risk|readiness|precedent|draft|preflight|claims|recommend|next|simulate|
signals|export|assess|twin|consistency|deficiencies|knowledge|help|sap|
power|dose|defensibility|design|safety|cmc|csr|device|ectd|audit|amend|
review|memo|brief|strategy|freeze|sign|scan|checklist|submit|workflow|
status|narrative|report|iss|ise|ib|smpc|rmp|uspi
```

The client-side `SLASH_COMMANDS` array in `AnaPersistentPanel.tsx` contains **43 commands**.

**None of the following exist** on either side:

| Proposed Command | Category | Purpose | Priority |
|-----------------|----------|---------|----------|
| `/haq` | Authoring | "Draft a response to this health authority question: [text]" — uses project context, RIM signals, evidence chains, and regulatory persona to produce a defensible HAQ response | **HIGH** |
| `/ask` | Analysis | "Search the data room: [question]" — semantic Q&A over project documents with source citations, equivalent to evidence-ask but through AnA with full context | **HIGH** |
| `/tools` | Navigation | "Show the Tools workbench" — client-side navigation to ToolsLanding | **LOW** |
| `/vault` | Navigation | "Open the data room" — client-side navigation to vault view | **LOW** |
| `/ingest` | Authoring | "Ingest these health authority questions: [pasted text]" — parse and create HAQ session through chat | **MEDIUM** |

### Recommended Implementation

**`/haq` (HIGH priority)**:
1. Server: Add `haq` to `detectSlashCommand` regex
2. Server: Add enrichment in `enrichMap` that loads project readiness + claims + CRL/RTF patterns
3. Server: AnA's persona already has regulatory response expertise — just needs the command routing
4. Client: Add `{ command: '/haq', description: 'Draft HAQ response', category: 'Authoring' }` to `SLASH_COMMANDS`
5. The response would be a rich markdown HAQ response that AnA can auto-create as an artifact

**`/ask` (HIGH priority)**:
1. Server: Add `ask` to `detectSlashCommand` regex
2. Server: Add enrichment function that calls the RAG pipeline (same as evidence-ask) and injects results into AnA's context
3. Client: Add `{ command: '/ask', description: 'Query project data room', category: 'Analysis' }` to `SLASH_COMMANDS`
4. Add `ask_evidence` operational command so AnA can execute structured queries

---

## 5. Cross-Cutting Concerns

### Chat-First Compliance

The CLAUDE.md and `chat-first-design.md` state: **"The chat IS the product. ALL new features MUST be accessible through the AnA chat interface."**

| Surface | Chat-accessible? | Violation? |
|---------|-----------------|-----------|
| HAQ Manager | NO — separate UI surface only | **YES** — no `/haq` command exists |
| Tools Landing | Partially — `/workflow` and `/help` exist, but no `/tools` | **MINOR** — navigation surfaces are acceptable as secondary |
| Evidence Ask | NO — API endpoint only, not callable from AnA | **YES** — no `/ask` command, no operational command |

### RIM Signal Coverage

| Surface | RIM signals captured? | Gap? |
|---------|----------------------|------|
| HAQ Manager | NO | YES — drafted HAQ responses are invisible to RIM |
| Tools Landing | N/A (navigation only) | No gap |
| Evidence Ask | NO | YES — data room queries and answers not captured |

### Governed Artifact Pipeline

| Surface | Creates governed artifacts? | Gap? |
|---------|---------------------------|------|
| HAQ Manager | NO — local state only, manual editor handoff | YES — should auto-create artifacts |
| FullDocumentBuilder (via Tools) | YES — converges to EditorPanel | No gap |
| Evidence Ask | N/A (query, not creation) | No gap |

---

## 6. Remediation Priority

### P0 — Must Fix (AnA Architecture Violations)

1. **Add `/haq` slash command** to server (`context-enrichment.ts` regex + enrichMap) and client (`AnaPersistentPanel.tsx` SLASH_COMMANDS). This makes HAQ drafting chat-first.
2. **Add `/ask` slash command** to server and client. This makes data room queries chat-first.
3. **Add `ask_evidence` operational command** to `command-executor.ts` so AnA can execute structured RAG queries.
4. **Fix evidence-ask response envelope** — use `sendSuccess()`/`sendError()` instead of raw `res.json()`.

### P1 — Should Fix (Quality Gaps)

5. **Route evidence-ask through AI gateway** or document the intentional deviation (RAG pipeline has its own LLM orchestration).
6. **Add RIM signal capture** to evidence-ask endpoint — at minimum capture the query-answer pair as a signal.
7. **Add tenant scoping** to evidence-ask — validate projectId against user's org.
8. **Persist HAQ sessions** server-side so questions and responses survive navigation.

### P2 — Nice to Have

9. **Add AnA context hint** when Tools -> Editor transitions occur.
10. **Add `/tools` and `/vault` navigation commands** to client-side slash commands.
11. **Add `data-testid`** to individual tool buttons in ToolsLanding.
12. **Add subtle chat-first hints** on tool cards ("Also try `/review` in chat").

---

## Summary Table

| Audit Question | Answer |
|---|---|
| Does HAQ Manager leverage AnA's capabilities? | **No** — drafts via standalone endpoint, not AnA |
| Does HAQ Manager use `pendingEditorContent` correctly? | **Yes** — converges to EditorPanel correctly |
| Does Tools Landing route to AnA-connected surfaces? | **Partially** — routes to EditorPanel (where AnA exists) but no context handoff |
| Is evidence-ask compatible with AnA's architecture? | **No** — bypasses AI gateway, no RIM, no response envelope, no operational command |
| Are there missing slash commands? | **Yes** — `/haq`, `/ask` are critical gaps; `/tools`, `/vault`, `/ingest` are nice-to-haves |

---

*Report generated 2026-03-27. File: `docs/audits/QA_ANA_INTEGRATION_AUDIT_2026-03-27.md`*
