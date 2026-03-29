# AnA Intelligence + App Control Audit
**Date:** 2026-03-28  
**Auditor:** GPT-5.3-Codex (codebase audit)

## 1) Scope and method
This audit reviewed how AnA:
1. Accesses intelligence across app surfaces.
2. Controls app behaviors/modules/actions.
3. Applies governance (auth, tenancy, auditability, HITL).

### Files reviewed (high signal)
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `client/src/components/AnaCortexChat.tsx`
- `client/src/portal-v2/core/moduleRegistry.ts`
- `client/src/concept2cure/pages/RegulatoryPrecedentIntelligence.tsx`
- `server/index.ts`
- `server/routes/ana-ri.ts`
- `server/routes/ana-cortex.ts`
- `server/routes/ana-platform-control.ts`
- `server/services/ana-platform-controller.ts`
- `server/routes/ai-actions.ts`
- `server/services/research-intelligence/sourceSelectionPolicy.ts`
- `server/services/research-intelligence/routeEvidenceRequest.ts`

## 2) Current-state architecture (what is wired today)

### A. Primary user chat control plane (new shell)
- `ZenApp` positions `AnaPersistentPanel` as the core chat surface across key modes (`projects`, `workspace`, `project-home`, `deep-research`) and passes rich context (`screen`, `project`, authoring context, module context).  
- `AnaPersistentPanel` sends chat first to `/api/ana-ri/chat`, then falls back to `/api/cortex/chat` on failure, preserving conversation/thread continuity.  
- It also drives action execution via intent handlers and the unified `useAIAction` hook (`/api/ai-actions/execute`).

### B. Secondary/legacy chat surface (parallel lane)
- `AnaCortexChat` still posts to `/api/ana-cortex/chat` and independently enriches responses by calling `/api/precedent-engine/search` and `/api/foresight/score`.
- This creates a second intelligence pathway outside the main AnA RI orchestration path.

### C. App/module control lane
- `ana-platform-control` exposes agentic org-level control (`/api/ana/platform/*`) for settings, capabilities, module toggles, onboarding, usage optimization, and generic action execution.
- `ana-platform-controller` enforces paid-tier checks and writes audit logs for mutations.
- Frontend module availability in `moduleRegistry.ts` is role-based/static, separate from platform toggles in org settings.

### D. Governance and security baseline
- Global API auth middleware is mounted in `server/index.ts` and protects `/api/*` except explicit open prefixes.
- Some routes add explicit route-level auth (e.g., `/api/ana-cortex/regulatory-analysis`), but pattern consistency varies.
- HITL confirmation exists in `/api/ana/platform/execute` when `requiresConfirmation=true`.

### E. Evidence routing lane
- `ana-ri` can route to evidence intelligence with Firecrawl quota controls.
- `sourceSelectionPolicy` uses regex heuristics to route to literature/device/commercial evidence providers.

---

## 3) Audit findings

## F1 — **Split-brain chat orchestration (High)**
**Observation:** Two materially different chat pipelines are active:
1) `AnaPersistentPanel` → `/api/ana-ri/chat` (+ `/api/cortex/chat` fallback), and  
2) `AnaCortexChat` → `/api/ana-cortex/chat` + direct precedent/foresight calls.

**Risk:**
- Inconsistent model behavior, safety policy, logging, and provenance across surfaces.
- Different context payloads and fallback behavior can produce conflicting recommendations.

## F2 — **Module control is not end-to-end enforced (High)**
**Observation:** Backend toggles module capability (`enabledModules`/`disabledModules`) in org settings, but frontend module access is primarily static role-gating in `moduleRegistry.ts`.

**Risk:**
- AnA can “toggle” a module at backend settings level without guaranteed UI/route enforcement.
- Control appears available but may not actually gate all app entry points.

## F3 — **Tenant context extraction is permissive in platform-control (Medium-High)**
**Observation:** `getOrgId` in `ana-platform-control` accepts org IDs from tenant context *or* query/body fallbacks.

**Risk:**
- Raises risk of confused-deputy mistakes if upstream middleware is bypassed/misconfigured.
- Mutations should bind strictly to authenticated tenant context for regulated operations.

## F4 — **Action execution paths are duplicated (Medium)**
**Observation:** `AnaPersistentPanel` contains many direct intent handlers (`/api/authoring-actions/*`) plus mapping to unified `/api/ai-actions`.

**Risk:**
- Audit/event fragmentation.
- Divergent behavior depending on action path (direct endpoint vs unified dispatcher).

## F5 — **Evidence routing policy is heuristic-only (Medium)**
**Observation:** Source routing is regex-based with confidence values but limited policy dimensions (no explicit regulated-domain risk class, evidence hierarchy score, or mandatory corroboration rules).

**Risk:**
- In high-stakes submissions, evidence source selection may be insufficiently deterministic/defensible.

## F6 — **HITL coverage is incomplete for high-impact actions (Medium)**
**Observation:** HITL confirmation exists for `/api/ana/platform/execute` if flagged, but equivalent strict approval gates are not uniformly visible across all action paths (e.g., authoring promotion/approval/lock commands executed via other endpoints).

**Risk:**
- Potentially inconsistent human approval posture for regulated transitions.

## F7 — **Observability is partially fragmented (Medium)**
**Observation:** Client run logs are stored in session storage; server has action logs and audit logs, but cross-surface unified correlation (chat turn ↔ action ID ↔ artifact mutation ↔ approval decision) is not clearly guaranteed end-to-end.

**Risk:**
- Harder root-cause analysis and weaker inspection-readiness narrative.

---

## 4) Gap-closure plan (with wiring to add/enhance)

## Phase 0 (0–2 weeks): **Unify control contracts (no UX disruption)**
1. **Define canonical AnA chat contract** (`/api/ana-ri/chat` as primary).
2. **Deprecation shim:** Route `/api/ana-cortex/chat` into `ana-ri` orchestration or explicit compatibility adapter.
3. **Single conversation envelope:** require `thread_id`, `project_id`, `context.screen`, `source_surface` on all chat calls.
4. **Connection enhancement:** add a common correlation ID propagated from client → chat → actions → artifact mutations.

## Phase 1 (2–4 weeks): **Close module-control loop**
1. **Module entitlement API** (`/api/ana/platform/entitlements`) returning effective module access after tier + role + org toggles.
2. **Wire frontend registry to entitlements:** replace static-only gating with server-evaluated entitlements.
3. **Route guard middleware** on module APIs so disabled modules fail closed server-side.
4. **Connection enhancement:** on every `toggleModule`, publish entitlement invalidation event to UI/session cache.

## Phase 2 (3–6 weeks): **Action-path consolidation + governance hardening**
1. Migrate direct authoring intents into unified `/api/ai-actions` dispatch where feasible.
2. Introduce **policy class tags** for actions (informational / drafting / approval-impacting / irreversible).
3. Require **HITL + e-signature** for approval-impacting and irreversible actions.
4. Enforce strict tenant source: use authenticated tenant only; remove query/body org fallback for regulated mutation routes.

## Phase 3 (4–8 weeks): **Evidence discipline upgrade**
1. Replace heuristic-only source routing with policy matrix:
   - evidence class, jurisdiction, recency requirements, corroboration count, citation grade.
2. Require structured provenance bundle in response payload:
   - source list, retrieval timestamp, normalization hash, confidence explanation.
3. Add policy gate that blocks claim-level conclusions when evidence quality threshold is unmet.

## Phase 4 (6–10 weeks): **Inspection-grade traceability**
1. Unified event ledger keyed by correlation ID:
   - chat turn, model/provider, evidence route, actions invoked, artifact state transitions, approvals.
2. Add an “Audit Replay” endpoint/UI for QA/RA reviewers.
3. Build conformance tests validating fail-closed behavior when policies/entitlements are absent.

---

## 5) Connections/wiring that should be added or enhanced

### Add
- `AnA Chat Context Bus`: standardized context payload producer from all major pages (not only selected pages) into chat context.
- `Entitlement Resolver`: backend endpoint consumed by shell navigation and route guards.
- `Action Policy Engine`: pre-dispatch gate that classifies risk and enforces HITL/e-sign.
- `Trace Correlator`: mandatory `x-correlation-id` across UI → API → DB audit logs.

### Enhance
- Existing `/api/ana/platform/execute` confirmation mechanism to include policy reason codes and signed approver identity.
- Existing evidence routing to emit structured decision rationale and required-citation checklist.
- Existing AI fallback logic to preserve policy parity across primary and fallback paths.

---

## 6) Human SME perspective: what is still needed/missing
From a Regulatory Affairs + Quality + Clinical SME lens, the following are still needed for enterprise/regulated confidence:

1. **Regulatory-grade decision accountability**
   - Explicit accountable role per AnA recommendation and action execution.
   - “Who approved what, when, and under which policy” must be first-class.

2. **Submission lifecycle guardrails tied to stage gates**
   - AnA should not permit stage-advancing actions unless required upstream evidence and reviews are complete.

3. **Jurisdiction-aware response obligations**
   - Clear, enforced checks for FDA vs EMA vs PMDA differences (not just generic advisory language).

4. **Evidence adequacy scoring before recommendations**
   - Before strategic advice, AnA should state whether evidence quality is sufficient, borderline, or inadequate.

5. **Human override and dissent capture**
   - Structured mechanism to record SME disagreement with AI recommendation and rationale, linked to artifacts.

6. **Operational resilience policy**
   - If primary model/provider fails, fallback must preserve the same governance constraints and disclosure quality.

7. **Validation package completeness**
   - IQ/OQ/PQ trace from intelligence outputs to release decisions should be queryable and exportable.

---

## 7) Priority backlog (recommended)
1. **P0:** Unify chat pathways under one orchestrator and correlation ID.
2. **P0:** Enforce effective module entitlements end-to-end (UI + API fail-closed).
3. **P1:** Consolidate high-impact actions into unified action dispatcher with policy classes.
4. **P1:** Strengthen tenant-binding rules in platform mutation routes.
5. **P2:** Upgrade evidence routing to deterministic policy matrix + quality thresholds.
6. **P2:** Implement audit replay and inspection-ready trace exports.

---

## 8) Executive conclusion
AnA is already deeply integrated as the central conversational and automation interface, with meaningful platform-control capabilities and emerging governance controls. The biggest risk is **architectural divergence** (multiple chat/action lanes) that can undermine consistency, auditability, and regulated trust. The fastest path to materially reduce risk is to **unify orchestration**, **close entitlement enforcement loops**, and **apply uniform policy/HITL gating** across every action path.
