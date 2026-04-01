# AnA Core Strengthening — Intelligence Layers & Feature Audit (Updated)

**Date:** 2026-04-01  
**Branch:** `cursor/ana-intelligence-refinement-35c8`  
**Scope:** Full-stack AnA intelligence audit + high-impact implementation pass (routes, enrichment, chat UX wiring)

---

## Executive Summary

This audit focused on the practical intelligence path that users actually hit in production:

1. Prompt orchestration (persona + intent + workstream + grounding)
2. Intelligence injections (project profile, RIM, decisions, memory, enrichment)
3. Runtime endpoints (`/api/ana-ri/chat`, `/api/ana-ri/stream`)
4. UX execution path (slash commands, suggested actions, fallback behavior)

### Top findings

- The orchestrator had advanced intelligence hooks (`_projectIntelligenceProfile`, `_feedbackContext`, `_rimContext`, `_decisionContext`) but active route handlers were not fully feeding them.
- `/decisions` was exposed in UI slash commands but had no corresponding endpoint and no slash enrichment path.
- Suggested intelligence actions in chat sometimes sent natural labels instead of power commands, reducing deterministic behavior.

### What was implemented now

- Wired full intelligence prefetch + injection into both `/chat` and `/stream`.
- Added server-side `/api/ana-ri/decisions` endpoint for decision audit trail.
- Added `/decisions` slash support in enrichment + prompt rewrite map.
- Tightened suggested-action routing so intelligence actions map to explicit slash commands.

---

## System Audit by Layer

## 1) Persona + Orchestration Layer

**Status:** Strong foundation, partially underutilized before patch.

### Strengths
- Rich core persona in `server/services/ana-ri/persona.ts` (evidence discipline, grounding mode, next-step contract, doc-state-aware behavior).
- Workstream and phase detection in `orchestrator.ts` gives AnA useful continuity and mode switching.
- Existing hooks for project intelligence, decision context, and RIM context are already designed correctly.

### Gaps found
- Route handlers were constructing orchestration input without preloading all optional high-value context blocks.

### Implemented fix
- `/chat` and `/stream` now preload and pass:
  - `_feedbackContext` via `getFeedbackSummary(...)`
  - `_projectIntelligenceProfile` via `prefetchProjectIntelligence(...)`
  - `_decisionContext` via `decisionLifecycleService.getDecisionContext(...)`
  - `_rimContext` via `preloadRIMContext(...)` when section/artifact context exists

**Files touched:**  
- `server/routes/ana-ri.ts`

---

## 2) Context Enrichment Layer

**Status:** Broad capability coverage, one key parity hole was present.

### Strengths
- High breadth of slash + natural language triggers in `server/services/ana-ri/context-enrichment.ts`.
- Non-blocking enrichment behavior is mostly correct.

### Gaps found
- `/decisions` missing in slash detection regex.
- No decision audit enrichment block despite UI exposing decision-related workflow.

### Implemented fix
- Added `decisions` to slash-command detection.
- Added `enrichWithDecisions(projectId)` that surfaces:
  - decision-aware status summary
  - recent decision records
  - receipt/pending-approval hints
- Added `/decisions` rewrite description in `commandDescriptions`.

**Files touched:**  
- `server/services/ana-ri/context-enrichment.ts`

---

## 3) API Layer (`/chat`, `/stream`, decision APIs)

**Status:** Functional, now materially stronger in intelligence grounding.

### Strengths
- SSE protocol for `/stream` is solid (thread_id → orchestration → tokens → done).
- Post-response lifecycle includes persistence, RIM interception, guidance and command execution.

### Gaps found
- Missing `/api/ana-ri/decisions` endpoint despite UI slash support and strategic need for traceability.

### Implemented fix
- Added `GET /api/ana-ri/decisions` with:
  - `project_id` required query param
  - optional `section_code`, `module_code`, `limit`
  - response includes `decisionAwareStatus` + contradiction-linked decision context

**Files touched:**  
- `server/routes/ana-ri.ts`

---

## 4) UI + Action Path (AnA Chat UX)

**Status:** Strong overall UX shell, improved determinism in this pass.

### Strengths
- Slash autocomplete is extensive and role-consistent.
- Suggested action framework supports both authoring and intelligence prompts.

### Gaps found
- Intelligence suggested actions (`recommendation`, `next-action`, etc.) were passed as free text labels, causing less deterministic backend behavior.

### Implemented fix
- Added intent-to-slash mapping in `handleSuggestedAction`:
  - `recommendation` → `/recommend`
  - `next-action` → `/next`
  - `risk-assessment` → `/risk`
  - `open-question` → `/knowledge`
  - `ctd_map` → `/workflow`
  - `find_predicates` → `/precedent`
  - `check_readiness` → `/readiness`
  - `draft_section` → `/draft`

**Files touched:**  
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`

---

## Code Changes in This Pass

| File | Change Summary |
|---|---|
| `server/routes/ana-ri.ts` | Added intelligence prefetch injection into orchestrator (`_feedbackContext`, `_projectIntelligenceProfile`, `_decisionContext`, `_rimContext`) for both `/chat` and `/stream`; added `/api/ana-ri/decisions` endpoint |
| `server/services/ana-ri/context-enrichment.ts` | Added `/decisions` slash support, decision enrichment block, and command rewrite description |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Mapped key suggested intents to deterministic slash commands |

---

## Validation Notes

- `npm run typecheck` failed in this environment because `tsc` is not installed.
- `npm run lint ...` failed in this environment because `eslint` is not installed.
- Manual code-path validation and diff inspection completed for touched files.

---

## Remaining High-Impact Opportunities (Next Iteration)

1. **Unify route logic on shared builder**
   - `server/services/ana-ri/chat-context-builder.ts` already exists but is not used in active routes.
   - Migrating `/chat` and `/stream` to it will reduce drift and future regressions.

2. **Formal slash/command parity tests**
   - Add a lightweight test that compares:
     - UI slash list
     - backend slash detection
     - rewrite map coverage
   - Prevents silent divergence.

3. **Decision-aware UI affordances**
   - Use new `/api/ana-ri/decisions` in UI for `/decisions` command chips and audit rail previews.

4. **Biostats + multi-agency deepening**
   - Add stronger domain-specific enrichments for PMDA/Health Canada/CMS-oriented workflows and statistical reviewer triggers.

---

## Outcome

AnA now receives materially richer, project-grounded intelligence in both primary runtime paths and has improved command parity with UI promises. This is a meaningful step toward the “alive intelligence operator” behavior you asked for: more context-aware, less generic, more traceable, and more deterministic in action selection.
