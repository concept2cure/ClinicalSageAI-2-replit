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

5. **Diagnostics + CMS operational command layer**
   - Add first-class operational commands for diagnostics validation packs and CMS coverage/coding planning so AnA can execute governed actions (not just enrich responses) in these domains.

---

## 2026-04-01 Additional Enhancement Wave (Completed)

### Scope
- Extended AnA domain intelligence beyond baseline RA/medical writing into explicit **CMS/reimbursement** and **diagnostics/IVD** pathways.
- Tightened workstream/intent detection so these domains route to stronger strategy/evidence behaviors.

### Files Updated

| File | Enhancement |
|---|---|
| `server/services/ana-ri/context-enrichment.ts` | Added `/cms` and `/diagnostics` slash commands, natural-language trigger packs, and dedicated enrichment blocks (`enrichWithCMS`, `enrichWithDiagnostics`) |
| `server/services/ana-ri/orchestrator.ts` | Expanded intent/workstream scoring patterns to recognize CMS/payer and diagnostics/IVD contexts |
| `server/services/ana-ri/persona.ts` | Added explicit expertise sections for CMS/reimbursement and diagnostics/IVD regulatory strategy |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Added `/cms` and `/diagnostics` to slash autocomplete (UI parity) |
| `client/src/concept2cure/config/domain-prompts.ts` | Added new domain prompt groups for `cms` and `diagnostics`; mapped into context-domain routing |

### Impact
- AnA can now detect and enrich conversations around:
  - reimbursement/coding/coverage strategy (CMS + payer lenses)
  - diagnostics/CDx/IVD analytical and clinical validation pathways
- These domains are now represented in:
  - persona contract
  - backend enrichment and triggers
  - orchestrator routing
  - chat slash command UI
  - domain prompt registry

### Residual Risk
- Operational execution parity is still pending for these new domains (commands that perform governed creation/workflow operations). Current wave is enrichment + prompt/routing + UI parity.

## 2026-04-01 Execution-Layer Enhancement Wave (Completed)

### Scope
- Added true operational command execution for CMS and diagnostics so AnA can perform governed analysis actions beyond prompt enrichment.
- Updated command contract documentation and routing hints so AnA can invoke these commands deterministically in conversation flows.

### Files Updated

| File | Enhancement |
|---|---|
| `server/services/ana-ri/command-executor.ts` | Added `analyze_cms_strategy` and `assess_diagnostic_validation` command handlers; registered both in `CommandName`, `COMMAND_REGISTRY`, and execution router |
| `server/services/ana-ri/context-enrichment.ts` | Updated `/cms` and `/diagnostics` rewrite directives to explicitly instruct command execution when project context exists; expanded `/help` enrichment to include CMS + diagnostics context |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Added suggested-action intent mapping for CMS and diagnostics (`cms_strategy`, `diagnostics_strategy`) to deterministic slash commands |
| `.claude/skills/ana-operating-system.md` | Updated operational command inventory from 39 to 41 and documented new market-access/diagnostics command family |

### Impact
- AnA now has execution-layer command primitives for:
  - CMS coding/coverage/payment risk analysis from project intelligence
  - Diagnostics/IVD validation-readiness assessment (analytical, clinical, cutoff, CDx alignment)
- This reduces domain behavior drift between “intelligence narration” and “action execution,” improving reliability for regulated workflows.

### Residual Risk
- These are analytical execution commands; downstream governed artifact-generation commands for dedicated CMS dossiers and diagnostics validation plans are still a next step.

---

## 2026-04-01 Reliability + Observability Hardening Wave (Completed)

### Scope
- Implemented key reliability recommendations surfaced by parallel subagent audits.
- Improved command-output hygiene, execution context richness, and enrichment diagnostics visibility in both `/chat` and `/stream`.

### Files Updated

| File | Enhancement |
|---|---|
| `server/routes/ana-ri.ts` | Uses cleaned assistant text after command execution in `/chat`; stream now emits/persists cleaned assistant text, includes `enrichmentMeta`, and enriches command context with `userRole`/`userName` |
| `server/services/ana-ri/context-enrichment.ts` | Adds explicit `sourcesFailed` marker for detected-but-unhandled slash commands (`slash_unhandled:<command>`) and removes duplicate command-description key shadowing |

### Impact
- Reduces user-facing leakage of raw ```command blocks and keeps persisted assistant output aligned with what users should read.
- Improves observability by exposing full enrichment diagnostics (trigger type, attempted/succeeded/failed sources) rather than only successful source names.
- Improves command-execution safety/compliance by passing role/name context into command handlers.

### Residual Risk
- Slash command completeness still needs dedicated regression tests to prevent future UI/backend drift.
- Some slashes (`/draft`, `/preflight`, `/export`) are still rewrite-first and should get stronger deterministic execution handlers in a future pass.

---

## Outcome

AnA now receives materially richer, project-grounded intelligence in both primary runtime paths and has improved command parity with UI promises. This is a meaningful step toward the “alive intelligence operator” behavior you asked for: more context-aware, less generic, more traceable, and more deterministic in action selection.

---

## 2026-04-01 Cross-Session Consolidation Audit (Pause Point)

### Audit Objective
- Pause implementation and evaluate:
  1. Current AnA feature-set quality and risk posture
  2. Open PR overlap/conflict risk
  3. Cursor branches with work not yet represented in an open PR and not merged to `concept2cure-v2`
  4. Concrete next-step execution sequence

### Feature-Set Status Snapshot (AnA)

| Capability Area | Status | Notes |
|---|---|---|
| Chat/stream intelligence prefetch | **Improved** | Shared prefetch helper added and wired into both `/chat` + `/stream` |
| Slash parity contract | **Improved** | Backend slash contract exported + parity tests added |
| Decision intelligence UX | **Improved** | Decision status rail + `/decisions` deterministic handling in chat panel |
| Response cleanup hygiene | **Improved** | Action/command cleanup unified before persistence/return |
| Biostats command wiring | **Improved** | `generateSAP` + `computeSampleSize` wired to real orchestrator/engine |
| Route maintainability | **Partial** | Drift reduced, but `server/routes/ana-ri.ts` remains monolithic |

### Risk-Ranked Findings

#### High
1. **Open PR overlap risk (merge sequencing required).**
   - Confirmed overlapping file hotspots:
     - PR #323 ↔ PR #309: `AnaPersistentPanel.tsx`, `server/routes/ana-ri.ts`
     - PR #327 ↔ PR #324: `server/routes/authoring-actions.ts`
     - PR #325 ↔ PR #323: `tests/routes/ana-ri-health.test.ts`
     - PR #325 ↔ PR #320: `package.json`

2. **Un-PR'd cursor branches with unmerged commits exist.**
   - `cursor/critical-files-management-f38a` → not merged; 33 branch-only commits relative to `concept2cure-v2`
   - `cursor/development-environment-setup-811c` → not merged; diverged (2 branch-only commits, base ahead by 39)

#### Medium
3. **Large PR scope concentration in #323.**
   - Broad multi-wave surface area increases review and conflict cost if landing is delayed.

4. **Monolithic route pressure remains.**
   - Shared helpers now exist, but `/chat` and `/stream` still carry substantial duplicated post-response lifecycle logic.

#### Low
5. **Local session hygiene.**
   - Two local debug import processes were detected and terminated; no active background diagnostics remain.

### Open PR Landscape (targeting `concept2cure-v2`)

| PR | Branch | Draft | Merge State | Scope Summary |
|---|---|---:|---|---|
| #323 | `cursor/ana-intelligence-refinement-35c8` | Yes | UNSTABLE | AnA intelligence + commands + decision UX + parity + shared prefetch |
| #324 | `cursor/customer-shaped-harness-build-e420` | Yes | UNSTABLE | Large governed enforcement and transition QA surface |
| #325 | `cursor/customer-shaped-harness-build-5841` | Yes | UNSTABLE | Stage 8 RC docs/scripts/route mapping + test/package touches |
| #326 | `cursor/central-system-review-18f8` | Yes | UNSTABLE | “Docs” titled but includes route/server/client functional changes |
| #327 | `cursor/biotech-client-ui-experience-ebb9` | Yes | UNSTABLE | Workflow/auth/governance stabilization set |
| #320 | `codex/refactor-codebase-for-optimization` | No | DIRTY | Structural/bootstrap/package refactor |
| #309 | `codex/implement-ana-continuous-conversation-queue` | No | DIRTY | Earlier AnA queue/streaming line with overlap into #323 |

### Cursor Branches Without Open PR

| Branch | Merge Status vs `concept2cure-v2` | Action |
|---|---|---|
| `cursor/app-ui-assessment-86e4` | Already merged | No action |
| `cursor/critical-files-management-f38a` | Not merged | Open PR or cherry-pick selected commits |
| `cursor/development-environment-setup-811c` | Not merged (diverged) | Open PR for the 2 unique commits or cherry-pick |

### Recommended Merge Sequence (Conflict-Minimizing)

1. **Land #323 first** (current AnA line is cohesive and validated)
2. **Land #327 next** (smaller overlap footprint than #324)
3. **Rebase and land #324** after #327 (shared `authoring-actions.ts` hotspot)
4. **Handle #326** after rebasing onto latest `concept2cure-v2` (contains functional route changes despite docs title)
5. **Split #325 if needed**: separate docs/report payload from runtime/test/package edits before merge
6. **Decide disposition of #309 and #320** (close as superseded or rebase/cherry-pick only surviving deltas)

### Immediate Next-Step Plan

1. **Consolidation control pass**
   - Produce a per-PR file-touch map and classify each touched file as: independent / conflict-prone / superseded.
2. **Orphan-branch triage**
   - Create PRs (or explicit cherry-pick plans) for:
     - `cursor/critical-files-management-f38a`
     - `cursor/development-environment-setup-811c`
3. **AnA hardening phase after merge**
   - Extract shared post-response pipeline from `ana-ri.ts` (actions/commands cleanup/persistence/RIM intercept) into a dedicated service to complete drift reduction.

