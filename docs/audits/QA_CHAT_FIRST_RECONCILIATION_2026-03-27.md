# QA Audit: Chat-First Design vs. Architecture Directive Reconciliation

**Date:** 2026-03-27
**Auditor:** Claude Code QA
**Branch:** `concept2cure-v2`
**Scope:** Evaluate tension between the Chat-First Design skill (`.claude/skills/chat-first-design.md`) and the Final Document Workflow Architecture Directive (`docs/plans/FINAL_DOCUMENT_WORKFLOW_ARCHITECTURE_DIRECTIVE_2026-03-27.md`) with respect to three sprint artifacts: `ToolsLanding.tsx`, `HAQManager.tsx`, and `evidence-ask.ts`.

---

## 1. The Tension

Two governing rules appear to conflict:

| Rule | Source | Says |
|------|--------|------|
| Chat-First Design | `.claude/skills/chat-first-design.md` | "ALL new features MUST be accessible through the AnA chat interface. No new screens, no new panels, no new modals, no new pages." |
| Architecture Directive | `FINAL_DOCUMENT_WORKFLOW_ARCHITECTURE_DIRECTIVE_2026-03-27.md` section 2, item 3 | "Productivity Tools is secondary and intentional." Section 6B: "Tools must become the one secondary place users go when they want to stop talking and start making." Section 6H: "HAQ Response Workflow Must Become Visible." |

The directive explicitly creates a two-surface model: **Project Home = conversation (AnA)** and **Tools = making / continuing work**. Chat-first does not acknowledge this secondary surface.

---

## 2. Evaluation of Each Artifact

### 2A. ToolsLanding.tsx

**File:** `client/src/concept2cure/components/workspace/ToolsLanding.tsx`

**What it is:** A curated workbench listing 9 tool cards (Recent Documents, New Document, Document Builder, Templates, Dossier Map, Vault, Review, Submit, HAQ Response) grouped into Continue / Create / Manage / Finalize.

**Chat-first violation?** Technically yes -- it is a new "page" / "screen."

**Architecture directive status:** Explicitly mandated. Section 6B lists exactly 10 capabilities Tools must expose. The directive says "Tools must become the one secondary place users go when they want to stop talking and start making." ToolsLanding implements this spec faithfully.

**Verdict: COMPLIANT with the directive. The directive supersedes chat-first for this specific surface.**

**Rationale:** The chat-first skill was written before the architecture directive. The directive refines the product model to a deliberate two-surface architecture (AnA Home + Tools Workbench) rather than a single-surface architecture. ToolsLanding is not an ad-hoc new screen; it is the explicitly mandated secondary surface. The directive's section 2, item 3 ("Productivity Tools is secondary and intentional") and its "Non-Negotiable Product Model" status lock this in.

**Consistency check:** ToolsLanding does NOT compete with AnA as a primary surface. It is reachable only via an explicit "Open Tools" action from Project Home. It contains no intelligence display, no dashboards, no analytics. It is purely an action launcher. This is consistent with the chat-first spirit: the conversation remains primary; Tools is the "workbench drawer."

---

### 2B. HAQManager.tsx

**File:** `client/src/concept2cure/components/workflow/HAQManager.tsx`

**What it is:** A standalone workflow component with: question ingestion (paste text), question list, AI-drafted responses via `/api/evidence/ask`, and an "Open in Editor" flow.

**Chat-first violation?** Yes -- it is a new panel with its own UI state, input area, list/detail layout, and lifecycle management. It is a self-contained workflow surface.

**Architecture directive status:** Section 6H explicitly requires HAQ to "become a visible workflow." The directive mandates: ingest HAQs, organize questions, draft responses, tie to source materials, review/approve/finalize. It also says this "must be included in the parity roadmap and tools architecture."

**Verdict: PARTIALLY COMPLIANT. The directive mandates the capability, but the implementation has a gap.**

**Issues identified:**

1. **No AnA chat coverage.** There is no `/haq` slash command. The 43 existing slash commands (verified in `context-enrichment.ts` line 45) do not include `haq`. There is no natural-language trigger for HAQ workflows. This means HAQ is accessible ONLY through the Tools workbench -- violating the chat-first rule that every capability must ALSO be accessible through AnA.

2. **Raw `fetch()` instead of `apiRequest()`.** Line 97-108 of HAQManager.tsx uses `fetch('/api/evidence/ask', ...)` with manual `Authorization` header construction from `sessionStorage`. This violates the UI State Standards which mandate `apiRequest()` for all API calls.

3. **`useState` per field.** The component uses `useState` for `inputText`, `questions`, and `selectedQuestion` instead of `react-hook-form` for the input area. The ingest area with its textarea is effectively a form.

4. **No toast feedback on error.** AI drafting failures silently set fallback text ("AI drafting unavailable") instead of surfacing a toast.

5. **No `DataStateWrapper`.** The component does not use `DataStateWrapper` for the questions list loading/error/empty states.

---

### 2C. evidence-ask.ts

**File:** `server/routes/evidence-ask.ts`

**What it is:** A `POST /api/evidence/ask` endpoint that queries `ForesightRAGService` for semantic Q&A over project documents with source citations.

**Chat-first violation?** No -- backend endpoints are not UI surfaces. The endpoint is a service layer that can be called from anywhere.

**Architecture directive status:** Section 6G ("Data Room / Ask Must Be Surfaced") and section 7 ("Expand: Data Room / Ask") explicitly require this capability.

**Verdict: COMPLIANT. But the endpoint is currently only consumed by HAQManager.tsx -- it is not wired into AnA chat.**

**Gap:** AnA should be able to answer questions using this same RAG endpoint when users ask about their project documents in conversation. Currently, AnA's context enrichment does not call `/api/evidence/ask` or `ForesightRAGService` directly. This is a missed integration.

---

## 3. Chat Coverage Gap Analysis

### What AnA CAN already do (relevant slash commands):

| Slash Command | Covers |
|---------------|--------|
| `/draft` | Draft submission-ready CTD sections |
| `/workflow` | Show submission workflow status, phases, next steps |
| `/readiness` | Assess submission readiness |
| `/review` | Regulatory review of current section |
| `/submit` | Submit document to regulatory workflow |
| `/scan` | Scan for deficiencies |
| `/checklist` | Generate compliance checklist |
| `/audit` | Hostile-reviewer audit |
| `/status` | Quick project status briefing |

### What AnA CANNOT do (missing slash commands):

| Missing Capability | Needed Slash Command | Notes |
|--------------------|---------------------|-------|
| Ingest and respond to Health Authority Questions | `/haq` | HAQManager is the only path today |
| Ask questions over project documents (Data Room) | `/ask` or `/evidence` | evidence-ask.ts exists but is not wired to AnA |
| Browse/resume recent documents | `/recent` | Only in ToolsLanding |
| Open document builder | `/builder` | Only in ToolsLanding |
| Browse templates | `/templates` | Only in ToolsLanding |

The first two are material gaps. The last three are navigation shortcuts that are less critical since AnA can already `/draft` specific sections.

---

## 4. Reconciliation: Does the Directive Supersede Chat-First?

**Yes, partially. Here is the precise reconciliation:**

### The directive refines (not replaces) chat-first:

1. Chat-first remains the primary interaction model. AnA Home is the default surface. The user talks first, acts second.

2. The directive adds exactly ONE secondary surface: Tools. This is not a dashboard, not a settings page, not a feature launcher. It is a curated workbench for "making / continuing work" -- the manual counterpart to conversational guidance.

3. The directive does NOT exempt features from chat accessibility. Section 6A makes AnA the "single visible guide identity." The mental model is: anything you can do in Tools, you should ALSO be able to invoke through AnA. Tools provides a visual, browsable alternative for users who prefer direct action.

### The correct interpretation:

> **Chat-first means every capability MUST be accessible through AnA. The directive means some capabilities MAY ALSO have a secondary visual surface in Tools. Tools is additive, not a replacement for chat coverage.**

---

## 5. Violations Summary

| Item | Violation | Severity | Fix |
|------|-----------|----------|-----|
| ToolsLanding.tsx as a screen | None -- explicitly mandated by directive as the single secondary surface | N/A | N/A |
| HAQManager.tsx as a panel | Low -- directive mandates visible workflow, but it must ALSO be chat-accessible | Medium | Add `/haq` slash command |
| No `/haq` slash command | Chat-first violation -- HAQ is only accessible via Tools | **High** | Wire `/haq` into `context-enrichment.ts` + operational command |
| No `/ask` or `/evidence` slash command | Chat-first violation -- Data Room Q&A only accessible via HAQManager UI | **High** | Wire `/ask` into `context-enrichment.ts` calling `ForesightRAGService` |
| HAQManager uses raw `fetch()` | UI State Standards violation | Medium | Replace with `apiRequest()` |
| HAQManager no toast on error | UI State Standards violation | Low | Add `toast()` on AI drafting failure |
| HAQManager no `DataStateWrapper` | UI State Standards violation | Low | Wrap questions list in `DataStateWrapper` |

---

## 6. Recommended Actions

### Priority 1: Add AnA slash commands for parity

**`/haq` slash command:**
- Add `haq` to the slash command regex in `context-enrichment.ts` line 45
- Add command description: "Help with Health Authority Question responses. Ingest questions, draft responses with source citations, and manage the HAQ workflow."
- Add HAQ natural language triggers: `/\b(?:health authority question|haq|reviewer question|information request response|deficiency response)\b/i`
- Wire to an operational command: `draft_haq_response` that calls evidence-ask.ts backend

**`/ask` slash command:**
- Add `ask` to the slash command regex
- Add command description: "Search project documents and answer questions with source citations."
- Wire enrichment to call `ForesightRAGService` and inject answer + sources into context
- Add natural language triggers: `/\b(?:search documents|find in|look up|what does.*say about|data room)\b/i`

### Priority 2: Fix HAQManager standards violations

- Replace `fetch()` with `apiRequest()` from `@/lib/queryClient`
- Add `toast()` on AI drafting error
- Consider wrapping the questions list in `DataStateWrapper` for the empty/loading states

### Priority 3: Update chat-first skill file

The chat-first skill (`.claude/skills/chat-first-design.md`) should be updated to acknowledge the two-surface model:

> **Addition to Rules section:**
> ### Exception: Tools Workbench
> The architecture directive establishes exactly one secondary surface: the Tools workbench (`ToolsLanding.tsx`). This surface is allowed because:
> - It is explicitly mandated by the architecture directive
> - It serves "making / continuing work" actions, not intelligence or analysis
> - It is reachable only via explicit "Open Tools" from Project Home
> - Every capability in Tools MUST also be accessible through AnA slash commands or natural language
> - Tools is additive to chat, never a replacement

---

## 7. Final Judgment

| Question | Answer |
|----------|--------|
| Is ToolsLanding a violation? | **No.** It is the explicitly mandated secondary surface. Compliant with both rules when properly interpreted. |
| Is HAQManager a violation? | **Partially.** The visual workflow is mandated by the directive, but the lack of a `/haq` slash command means it is NOT also chat-accessible, which violates chat-first. |
| Are features also accessible through AnA? | **No, not yet.** Neither HAQ workflow nor Data Room Ask have slash commands or natural language triggers in AnA. This is the primary gap. |
| Does the directive supersede chat-first? | **It refines it.** The directive adds a secondary surface (Tools) but does not remove the requirement that all capabilities be chat-accessible. Both rules must hold simultaneously: chat-first AND Tools as secondary. |

**Bottom line:** The architecture is sound. The gap is that the new capabilities built for the Tools surface have not yet been wired back into AnA chat. Adding `/haq` and `/ask` slash commands resolves the tension completely.

---

*Report generated: 2026-03-27*
*Audit path: `docs/audits/QA_CHAT_FIRST_RECONCILIATION_2026-03-27.md`*
