# C2C Conversational AI Ubiquity Audit
**Date:** 2026-03-21
**Scope:** Full codebase — client, server, shared
**Auditor:** Claude (hostile audit mode)

---

## A. Brutal Reality Summary

**Verdict: You have substantially more than a chat feature, but not yet a true conversational operating system.**

The platform has ~19 distinct AI surfaces, a centralized AI gateway, a sophisticated context assembly layer (LumenContextBuilder), working memory compression, sentence-level traceability, citation enforcement, and 21 CFR Part 11 audit logging throughout. The shell (ZenApp.tsx) is unified with persistent AI access via AnaPersistentPanel, DrSagePanel, and a ⌘K command palette.

**What's real:**
- AI is accessible on every authenticated screen (AnaPersistentPanel + DrSagePanel are globally mounted)
- Context is centralized and rich (project, module, document, user, workflow, tenant — all wired)
- Provenance is comprehensive (citation enforcement, sentence traceability, integrity hashing)
- Versioning is mature (atomVersionService with SHA-256, diff, rollback)

**What's missing:**
- AI cannot reliably ACT end-to-end (create → save → route → validate → export is fragmented)
- No unified AI action framework — each action has bespoke handlers
- Artifact-to-document promotion is not a first-class pipeline
- No validation → AI refinement feedback loop
- Inline AI exists in editors but is absent from most tables, forms, and list views
- Memory is session-scoped; cross-session project memory exists server-side but is not surfaced to users
- Legacy routes bypass the unified shell entirely

**Score: 62/100** — structurally promising, operationally incomplete.

---

## B. Coverage Map

### AI Present (19 surfaces)

| # | Surface | File | Scope |
|---|---------|------|-------|
| 1 | AnA Persistent Panel | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | **Global** — mounted in ZenApp.tsx |
| 2 | Dr. Sage Panel | `client/src/concept2cure/components/dr-sage/DrSagePanel.tsx` | **Global** — 5-tab help/guide/fix |
| 3 | Command Palette (⌘K) | `client/src/concept2cure/components/command/ZenCommandPalette.tsx` | **Global** — keyboard shortcut |
| 4 | ZenChat (main chat) | `client/src/concept2cure/components/chat/ZenChat.tsx` | **Global** — split-screen layout |
| 5 | Lumen Project Assistant | `client/src/concept2cure/components/assistant/LumenProjectAssistant.tsx` | **Contextual** — project-aware |
| 6 | Smart Claim Highlighter | `client/src/concept2cure/components/intelligentDocs/SmartClaimHighlighter.tsx` | **Inline** — editor |
| 7 | Source Suggestion Panel | `client/src/concept2cure/components/intelligentDocs/SourceSuggestionPanel.tsx` | **Inline** — editor |
| 8 | Auto-Traceability Engine | `client/src/concept2cure/components/intelligentDocs/AutoTraceabilityEngine.tsx` | **Inline** — editor |
| 9 | Inline Approval Panel | `client/src/concept2cure/components/editor/InlineApprovalPanel.tsx` | **Inline** — text selection |
| 10 | Unified Document Editor | `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` | **Inline** — bubble/floating menus |
| 11 | CMC AI Suggestion Engine | `client/src/components/cmc/AISuggestionEngine.tsx` | **Contextual** — CMC forms |
| 12 | CMC AI Panel | `client/src/components/cmc/AIPanel.jsx` | **Contextual** — manufacturing |
| 13 | CER AI Writer | `client/src/components/cer/TrialSageAIWriter.jsx` | **Contextual** — CER docs |
| 14 | ForesightAI Modules | `client/src/components/ForesightAI/` | **Isolated** — predictive analytics |
| 15 | Vault Concierge AI | `client/src/components/VaultConciergeAI.jsx` | **Contextual** — document vault |
| 16 | Enablement Center | `client/src/concept2cure/components/enablement/EnablementCenter.tsx` | **Contextual** — training |
| 17 | IND Auto-Draft | `client/src/concept2cure/pages/INDAutoDraftDashboard.tsx` | **Contextual** — IND submissions |
| 18 | AI Assistant V3 | `client/src/components/ai/AIAssistantV3.tsx` | **Isolated** — standalone |
| 19 | AnA Dashboard | `client/src/concept2cure/pages/AnaDashboard.tsx` | **Isolated** — dedicated chat |

### AI Absent

| Screen | File | Impact |
|--------|------|--------|
| Landing Page | `concept2cure/pages/LandingPage.tsx` | Low (public) |
| Legal Center | `concept2cure/pages/LegalCenter.tsx` | Low |
| Pricing | `concept2cure/pages/PricingPage.tsx` | Low |
| Auth flows | `concept2cure/auth/` | Low (pre-auth) |
| Error pages | `concept2cure/pages/ErrorPages.tsx` | Low |
| **All legacy dashboards** | `client/src/pages/`, `client/src/components/` (non-concept2cure) | **HIGH** — large surface area outside unified shell |
| **Table/list views** | Various data tables across modules | **HIGH** — no inline AI on tabular data |
| **Form views** (most) | Most forms outside CMC | **MEDIUM** — limited to CMC forms |
| **File/document browsers** | Document list views | **MEDIUM** — no AI summarize/compare on browse |

---

## C. Existing Reusable Assets

### Tier 1 — Production-Ready, Generic

| Asset | File | Reusability |
|-------|------|-------------|
| AI Gateway (multi-provider routing) | `server/services/ai-gateway/gateway.ts` | **HIGH** — routes Claude/OpenAI/Kimi with fallback |
| LumenContextBuilder | `server/services/lumen-context-builder.ts` | **HIGH** — assembles all context for AI |
| Atom Version Service | `server/services/atomVersionService.ts` | **HIGH** — generic versioning with SHA-256 |
| Working Memory Service | `server/services/working-memory.ts` | **HIGH** — conversation compression |
| Gateway Audit Logger | `server/services/ai-gateway/audit.ts` | **HIGH** — 21 CFR Part 11 compliant |
| Citation Enforcement | `server/services/citationEnforcementService.ts` | **HIGH** — grounded generation |
| Sentence Traceability | `server/services/sentenceTraceabilityService.ts` | **HIGH** — sentence-level provenance |
| Unified AI Client | `server/lib/unified-ai-client.ts` | **HIGH** — abstraction over providers |
| useChat hook | `client/src/concept2cure/hooks/useChat.ts` | **HIGH** — submission-type prompts |
| useCortex hook | `client/src/concept2cure/hooks/useCortex.ts` | **HIGH** — chat/search/advisory |
| ZenWorkspaceContext | `client/src/concept2cure/contexts/ZenWorkspaceContext.tsx` | **HIGH** — project/conversation/artifact state |
| TenantContext | `client/src/contexts/TenantContext.tsx` | **HIGH** — multi-tenant isolation |

### Tier 2 — Reusable with Refactoring

| Asset | File | Issue |
|-------|------|-------|
| Chat Actions | `server/routes/chat-actions.ts` | Bespoke per action type; needs abstraction |
| Task Management | `server/routes/taskManagement.routes.ts` | Good but not wired to AI triggers |
| Document Export | `server/routes/cerv2-export-routes.ts` | Module-specific; needs generic wrapper |
| Real-time Validation | `server/services/realTimeValidationService.ts` | No feedback to AI |

### Tier 3 — Module-Specific (Not Reusable)

| Asset | File | Why |
|-------|------|-----|
| CMC AI Panel | `client/src/components/cmc/AIPanel.jsx` | Hardcoded to CMC |
| CER AI Writer | `client/src/components/cer/TrialSageAIWriter.jsx` | Hardcoded to CER |
| ForesightAI | `client/src/components/ForesightAI/` | Specialized predictive models |

---

## D. Top 10 Gaps

| # | Gap | Where | Impact | Why It Matters |
|---|-----|-------|--------|----------------|
| 1 | **No unified AI action framework** | `server/routes/chat-actions.ts` — bespoke handlers per action | CRITICAL | Every new AI action requires new endpoint code. No standard `execute(action, target, params)` interface. |
| 2 | **Artifact → Document promotion pipeline missing** | Artifacts created via chat remain lightweight shells; no explicit `accept → save → route` flow | CRITICAL | AI-generated content doesn't naturally become "real" regulated documents. Users must manually copy/save. |
| 3 | **No validation → AI refinement loop** | Validation results in `ectd-validate.ts`, `realTimeValidationService.ts` never route back to AI | HIGH | AI can't self-correct. Users must manually review validation, then re-prompt. |
| 4 | **Inline AI absent from tables/lists** | No AI actions on data tables (project lists, document lists, task lists) | HIGH | Users can't ask AI to summarize, compare, filter, or act on tabular data without switching to chat. |
| 5 | **Legacy routes bypass unified shell** | `client/src/pages/`, legacy `components/` — dozens of routes outside ZenApp | HIGH | Significant surface area has no AI access, no shared context, no persistent assistant. |
| 6 | **No "move document after creation" capability** | `moduleIntegrationRoutes.ts` — module assignment at creation time only | MEDIUM | Documents can't be rerouted between modules (510k → IND) without recreation. |
| 7 | **File attachment system unused** | `documentAttachments` table defined in schema but no routes query it | MEDIUM | AI can't attach files to artifacts; attachment metadata is lost. |
| 8 | **Cross-session AI memory not surfaced** | `client-intelligence-memory.ts`, `account-canon.ts` exist server-side but no UI exposes them | MEDIUM | Users can't see what AI "remembers" about their org/project. No transparency. |
| 9 | **No orchestrated dossier assembly** | Export is per-section; no `compile(project, submissionType)` endpoint | MEDIUM | Users manually assemble submission packages instead of AI orchestrating the full eCTD. |
| 10 | **AI invocation scattered across 8+ patterns** | Direct API calls, useChat, useCortex, inline hooks, Dr. Sage, legacy assistant buttons | LOW | Maintenance burden; inconsistent AI behavior across surfaces. No single `useAI()` hook. |

---

## E. Top 10 Fixes (Highest Leverage)

| # | Fix | Effort | Impact | Dependency |
|---|-----|--------|--------|------------|
| 1 | **Build unified AI Action API** — `POST /api/ai-actions/execute { type, target, params }` with standard response envelope | M | CRITICAL | None — new endpoint |
| 2 | **Build artifact acceptance pipeline** — `POST /api/artifacts/:id/accept { targetModule, sectionId, createVersion }` | M | CRITICAL | Fix #1 |
| 3 | **Create `useAIAction()` hook** — single client-side entry point for all AI actions (create, update, validate, export) | S | HIGH | Fix #1 |
| 4 | **Wire validation results back to AI** — `POST /api/artifacts/:id/regenerate { validationResults }` | S | HIGH | Fix #1 |
| 5 | **Add inline AI actions to data tables** — generic `<AITableAction>` component (summarize row, compare rows, bulk actions) | M | HIGH | Fix #3 |
| 6 | **Migrate legacy routes into ZenApp shell** — wrap remaining legacy pages in ZenApp layout to get persistent AI access | L | HIGH | None |
| 7 | **Surface AI memory to users** — `AnAMemory.tsx` exists but needs to display account canon, project intelligence | S | MEDIUM | None |
| 8 | **Build orchestrated dossier assembly** — `POST /api/dossiers/compile { projectId, submissionType, modules }` | M | MEDIUM | Export routes exist |
| 9 | **Activate file attachment system** — wire `documentAttachments` table to upload/query routes | S | MEDIUM | Schema exists |
| 10 | **Consolidate AI invocation patterns** — single `useAI()` provider wrapping useChat + useCortex + legacy hooks | M | LOW | None — refactor |

**Effort key:** S = 1-2 days, M = 3-5 days, L = 1-2 weeks

---

## F. Architecture Blockers

### Blocker 1: No Unified AI Action Framework
**Location:** `server/routes/chat-actions.ts`
**Problem:** Each AI action (generate outline, draft section, validate, export) is a bespoke handler with its own request/response format. Adding a new action requires writing a new route, new handler, new client call.
**Impact:** Every new AI capability requires full-stack implementation. Cannot compose actions (e.g., "generate → validate → save" as a pipeline).
**Fix:** Standard action executor with typed action registry.

### Blocker 2: Artifact ≠ Document (Two-World Problem)
**Location:** `artifacts` table vs `unifiedDocuments` table
**Problem:** AI creates "artifacts" (lightweight, ephemeral). The system manages "documents" (versioned, audited, routable). There's no first-class bridge between them. An artifact doesn't automatically become a document.
**Impact:** AI-generated content exists in limbo. Users must manually promote artifacts to documents. This breaks the conversational operating model — AI suggests but can't place.
**Fix:** Artifact acceptance pipeline that promotes artifacts to documents with version, audit, and module assignment in one operation.

### Blocker 3: Legacy Shell Fragmentation
**Location:** `client/src/pages/` (legacy), `client/src/components/` (legacy) vs `client/src/concept2cure/` (unified)
**Problem:** The ZenApp shell (concept2cure/) provides global AI access, but dozens of legacy routes render outside it. These pages have no persistent assistant, no shared workspace context, no command palette.
**Impact:** Users navigating to legacy pages lose AI access entirely. The experience is inconsistent.
**Fix:** Wrap legacy routes in ZenApp layout as a migration path, or redirect to concept2cure equivalents.

---

## G. Phased Plan

### Phase 1: Foundation (Must Fix Now) — ~2 weeks

**Goal:** Make AI actionable and outputs governable.

| Task | Files | Rationale |
|------|-------|-----------|
| Build unified AI Action API | New: `server/routes/ai-actions.ts` | Unblocks all downstream action capabilities |
| Build artifact → document promotion pipeline | New: `server/services/artifactPromotionService.ts` | Makes AI outputs "real" |
| Create `useAIAction()` client hook | New: `client/src/concept2cure/hooks/useAIAction.ts` | Single invocation point for all actions |
| Wire validation → AI refinement | Modify: `server/routes/chat-actions.ts` | Closes the feedback loop |

**Outcome:** AI can generate → validate → refine → save → version in one flow.

### Phase 2: Ubiquity (Spread AI Everywhere) — ~3 weeks

| Task | Files | Rationale |
|------|-------|-----------|
| Inline AI actions on data tables | New: `client/src/concept2cure/components/ai/AITableAction.tsx` | Tables are 40%+ of screen time |
| Inline AI on forms (beyond CMC) | Extend: `AISuggestionEngine.tsx` → generic | Most forms lack AI assistance |
| Migrate top 10 legacy routes to ZenApp shell | Modify: routing config, layout wrappers | Largest coverage gap |
| Surface AI memory/intelligence to users | Modify: `AnAMemory.tsx`, new memory UI components | Transparency + trust |
| Activate file attachment system | Modify: `server/routes/document-routes.ts`, wire `documentAttachments` | Complete document lifecycle |

**Outcome:** AI accessible on 95%+ of screens; inline actions in editors, tables, and forms.

### Phase 3: Operating System (Conversational OS) — ~4 weeks

| Task | Files | Rationale |
|------|-------|-----------|
| Orchestrated dossier assembly | New: `server/services/dossierAssemblyService.ts` | End-to-end submission automation |
| AI workflow automation | Extend: `taskManagement.routes.ts` with AI triggers | AI assigns tasks, moves documents |
| Cross-session continuity UI | Extend: `ZenWorkspaceContext.tsx`, working memory UI | "Pick up where you left off" across sessions |
| Consolidate all AI invocation into `useAI()` | Refactor: merge useChat, useCortex, legacy hooks | Clean architecture |
| AI-driven project planning | New: `server/services/projectPlanningAI.ts` | AI generates project timelines, milestones |

**Outcome:** Conversational operating system where AI plans, drafts, validates, routes, and exports — with full governance.

---

## H. Final Verdict

### Structurally Close? **Yes, with caveats.**

**What you have (strong foundation):**
- Unified shell with global AI access (ZenApp + AnaPersistentPanel + DrSagePanel)
- Centralized context assembly (LumenContextBuilder with 9 context sources)
- Rich memory layer (working memory, client intelligence, account canon, user intelligence)
- Comprehensive provenance (citation enforcement, sentence traceability, integrity hashing)
- Mature versioning (atomVersionService with diff, rollback, audit)
- Multi-provider AI gateway with policy enforcement
- 21 CFR Part 11 compliance throughout

**What's blocking you from "operating system" (critical gaps):**
1. **AI can suggest but can't reliably place** — artifact ≠ document
2. **No action framework** — each action is bespoke
3. **No feedback loops** — validation doesn't feed back to AI
4. **Legacy fragmentation** — significant surface area outside unified shell

**Bottom line:**
You're at ~62% of the conversational operating system target. The infrastructure is there — context, memory, provenance, versioning, audit. What's missing is the **action layer** (the ability for AI to *do* things end-to-end) and **ubiquity** (legacy routes and non-editor surfaces).

Phase 1 (unified action API + artifact promotion) would jump you to ~75%.
Phase 1 + Phase 2 would put you at ~88%.
All three phases would achieve the target state.

**The fastest single fix:** Build the unified AI Action API (`POST /api/ai-actions/execute`). This unblocks artifact promotion, validation loops, dossier assembly, and task automation — all downstream capabilities depend on having a standard way to tell AI "do this thing."

---

## Dimension Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **AI Everywhere** | 70/100 | Global on concept2cure shell; absent from legacy routes and most tables/forms |
| **Context Awareness** | 85/100 | LumenContextBuilder is excellent; 9 context sources; minor gaps in legacy routes |
| **Actionability** | 40/100 | AI can generate content; cannot reliably save, route, validate, or export autonomously |
| **Artifact Governance** | 75/100 | Version service, audit trail, citation enforcement all mature; artifact → document gap |
| **Continuity Across Modules** | 55/100 | Working memory + session restore within concept2cure; breaks on legacy routes |
| **Overall** | **62/100** | Strong foundation, weak action layer, legacy fragmentation |

---

*End of audit. No fluff. No optimism bias. This is where you actually are.*
