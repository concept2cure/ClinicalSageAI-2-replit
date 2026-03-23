# CMC Gap Closure Build Plan (Full Audit + Execution Plan)

**Date:** 2026-03-23  
**Scope:** CMC module surfaces, tab/screen density, user workflows, tooling readiness, project/document/user/task wiring, and AnA context-awareness.

---

## 1) Executive conclusion

From a pharma CMC operator perspective, the platform has **broad capability inventory** but uneven productization:

1. **Experience fragmentation:** `/cmc` and `/cmc-wizard` expose different maturity levels and interaction models.
2. **Navigation overload:** the advanced CMC surface contains too many top-level tabs and nested tabs for primary operating workflows.
3. **Wiring gaps:** project, document, task, and assistant context are inconsistently connected across entry points.
4. **Contract drift:** some UI models do not match backend response shape, creating silent data-quality and trust issues.
5. **AnA inconsistency:** AnA is powerful in Zen surfaces, but her CMC presence is not normalized across CMC pages/routes.

---

## 2) Audit findings (gap register)

## G1 — Dual CMC entrypoints create operational confusion
- `App.jsx` routes both `/cmc` and `/cmc-wizard` as primary CMC access points.
- `/cmc` renders `CMCPage -> CMCModule` (lightweight/legacy model), while `/cmc-wizard` renders the comprehensive platform.
- Impact: teams can execute different workflows depending on entry route, leading to inconsistent SOP adoption.

## G2 — Legacy CMC page has weak workflow wiring
- `CMCPage` only wraps `CMCModule`; no explicit project-workspace shell, no task board coupling, and no explicit AnA context handoff.
- In `CMCModule`, many CTA buttons are present but are not connected to mutation handlers (create/edit/assign actions are mostly visual).
- Impact: “looks complete” but does not reliably drive regulated execution.

## G3 — UI data-contract mismatches in core CMC list views
- `CMCModule` maps fields like `substance.name` / `substance.chemicalName`, while CMC API payloads expose `substanceName` and related schema-specific keys.
- Similar mismatch exists for drug products (`name`, `containerType` vs schema keys such as `productName`, `containerClosure`).
- Impact: blank/incorrect display states and reduced trust in operational data.

## G4 — Feature/API drift across CMC clients
- `client/src/api/cmc.js` references endpoints like `/api/cmc/stability/upload`, `/api/cmc/analytical-methods/save`, and `/api/cmc/certificates*`.
- Current typed CMC routers expose canonical endpoints using REST resources (e.g., `/analytical-methods`, `/stability`, `/batch-records`) and do not uniformly expose those legacy `*/save` patterns.
- Impact: hidden runtime failures and partial feature activation depending on which component calls which API helper.

## G5 — Tab and screen sprawl in comprehensive CMC surface
- `ComprehensiveCMCPlatformClean.jsx` includes very high tab cardinality at multiple levels (primary + nested sets).
- Impact: high cognitive load, longer task completion time, and increased training burden for paying clients.

## G6 — Project/document/task/user wiring is uneven by surface
- CMC-specific task service exists (`createCMCTask` in taskManagementService), but CMC primary surfaces do not consistently invoke it on quality events.
- Multiple CMC API route groups are mounted (`core`, `aggregator`, `project`, `specification`, `stability`, `batch-records`), but front-end usage is fragmented.
- Impact: broken handoffs between risk detection, task assignment, and evidence closure.

## G7 — AnA presence is not normalized at CMC page level
- AnA persistent architecture is implemented in ZenApp surfaces, but CMC route surfaces in classic app are not uniformly wrapped with explicit context profile and workflow actions.
- Impact: assistant utility varies by route, reducing confidence in “AnA everywhere” promise.

## G8 — Project model under-specifies CMC evidence completeness
- Regulatory project map for CMC remains shallow compared to real dossier readiness burden (limited required docs list).
- Impact: projects can appear green while still missing high-risk CMC evidence objects.

---

## 3) Target operating model (what “closed gaps” looks like)

A single CMC operating model with:
1. **One primary CMC route** with role-aware workspace modes.
2. **4 top-level workflow lanes** (not 10+): Plan, Execute, Control, Submit.
3. **Unified canonical API client** with typed DTO adapters and no legacy endpoint drift.
4. **Event-driven wiring**: every risk/finding/deviation can spawn/track a task and ownership trail.
5. **AnA on every CMC screen** with explicit context (project, section, task, risk state) + action affordances.
6. **Submission readiness gates** with hard evidence thresholds (not visual completion only).

---

## 4) Build plan to close all gaps

## Workstream A — Route unification and IA simplification (G1, G5)

### A1. Choose canonical CMC entry
- Make `/cmc` the canonical route and redirect `/cmc-wizard` (or inverse, but only one canonical path).
- Preserve deep links with redirects and telemetry.

### A2. Condense tabs into 4 workflow lanes
- **Plan:** project setup, product profile, section strategy, milestones.
- **Execute:** DS/DP authoring, analytical, process, stability, document drafting.
- **Control:** deviations/CAPA, change control, risk register, quality metrics.
- **Submit:** eCTD packaging, readiness gate, dispatch checklist, regulator view.

### A3. Convert low-frequency tools to context drawers
- Move advanced/rarely used tools from primary tabs into side drawers or “Advanced” flyouts.
- Keep primary nav to role-critical tasks.

**Deliverables:**
- CMC IA spec v1
- Route migration + redirects
- Primary tab reduction implementation

---

## Workstream B — Data-contract stabilization + API convergence (G3, G4)

### B1. Canonical CMC API client
- Replace ad-hoc fetches in legacy pages with a single typed CMC service client.
- Introduce endpoint map constants and deprecate `*/save` legacy patterns.

### B2. DTO adapters for backward compatibility
- Normalize API responses to UI view models (`substanceName -> name` adapter if needed).
- Add runtime schema guards for critical CMC entities.

### B3. Contract tests
- Add API contract tests for projects, substances, products, stability, tasks, risks.
- Add UI smoke tests for list rendering against real fixture payloads.

**Deliverables:**
- `cmcApiClient` (typed)
- adapter layer + deprecation map
- contract + smoke test suite

---

## Workstream C — Workflow wiring (project/doc/user/task) (G2, G6, G8)

### C1. Project-centric context bus
- Every CMC action carries `projectId`, `moduleSection`, `artifactId`, `ownerId`.
- Enforce context at API boundaries for auditable traceability.

### C2. Task orchestration hooks
- Auto-create CMC tasks from trigger events:
  - compliance failures,
  - comparability risk signals,
  - stability gaps,
  - unresolved deviations/CAPA.
- Link tasks back to source artifact and gate status.

### C3. Readiness Gate service
- Implement hard gate checks (stability maturity, PPQ/GMP evidence, batch representativeness, CAPA closure).
- Gate publish/submit actions behind objective thresholds.

### C4. Evidence taxonomy expansion
- Expand CMC project document requirements by lifecycle phase (development, PPQ, commercial, post-approval change).
- Add mandatory evidence classes for 3.2.S / 3.2.P completeness.

**Deliverables:**
- context propagation standard
- task trigger rules + linkage UI
- readiness gate engine
- expanded evidence model

---

## Workstream D — AnA ubiquity and context-awareness (G7)

### D1. AnA contract per page
Each CMC page must pass:
- project identity,
- active tab/lane,
- open artifact,
- current risks/findings,
- user role/persona.

### D2. AnA action packs by lane
- **Plan:** generate section strategy, milestone plan, critical path risks.
- **Execute:** draft section text, suggest methods/tests, summarize evidence gaps.
- **Control:** triage deviations, generate CAPA drafts, risk mitigation plans.
- **Submit:** run readiness preflight, generate deficiency preemption memo, finalize handoff checklist.

### D3. Assistant observability
- Log context payload quality and action completion rates.
- Alert when AnA receives insufficient context.

**Deliverables:**
- page-level AnA integration checklist
- lane-specific action catalog
- telemetry dashboard for assistant efficacy

---

## Workstream E — UX hardening for paying-client workflows (G2, G5, G6)

### E1. Role-based workflow presets
- CMC Lead, MSAT, QA, RA-CMC, Tech Ops views.
- Show only high-priority tasks + blockers for each role.

### E2. “Day-in-the-life” quick paths
- New project onboarding path (first 30 minutes)
- Weekly quality review path
- Submission-readiness war-room path

### E3. Empty-state to action-state upgrades
- Convert non-functional CTA buttons to real actions (create/update/assign/export).
- Add success/failure states and task linkage confirmation.

**Deliverables:**
- role presets
- guided quick paths
- CTA wiring completion matrix

---

## 5) 12-week execution timeline

## Sprint 1 (Weeks 1–2) — Foundation
- Canonical route decision + redirects.
- Freeze and publish CMC API contract map.
- Identify/remove orphaned endpoints in client helpers.

## Sprint 2 (Weeks 3–4) — IA and tab condensation
- Implement 4-lane navigation shell.
- Move advanced tabs into drawers.
- Ship role-based landing defaults.

## Sprint 3 (Weeks 5–6) — Data + wiring stabilization
- Roll out typed API client + adapters.
- Patch field mapping mismatches in project/substance/product views.
- Add contract/smoke tests for primary workflows.

## Sprint 4 (Weeks 7–8) — Readiness + tasks
- Release readiness gate engine v1.
- Auto-task triggers from risk/compliance/deviation events.
- Add gate status panel to Submit lane.

## Sprint 5 (Weeks 9–10) — AnA ubiquity
- Inject AnA context payload on all CMC pages.
- Enable lane-specific action packs.
- Add AnA telemetry and context quality checks.

## Sprint 6 (Weeks 11–12) — Hardening + UAT
- Full role-based UAT (CMC Lead/QA/RA-CMC/MSAT).
- SOP/enablement package for paying clients.
- Production readiness signoff with rollback playbook.

---

## 6) Acceptance criteria (must-pass)

1. **Single source of truth route:** all CMC users enter same canonical workflow shell.
2. **Tab reduction:** top-level CMC tabs reduced to 4 lanes.
3. **Zero contract drift in core lists:** projects/substances/products render with validated fields.
4. **Task traceability:** every critical finding can spawn/track a linked task owner + due date.
5. **Submission gate enforcement:** cannot mark submission-ready with unmet hard-gate evidence.
6. **AnA consistency:** AnA available with contextual payload on every CMC lane.
7. **Operator time-to-action:** reduce clicks-to-close-critical-gap by >=30% vs baseline.

---

## 7) Risks and mitigations

- **Risk:** breaking existing deep links.  
  **Mitigation:** route redirect map + telemetry + phased deprecation.

- **Risk:** regressions from endpoint normalization.  
  **Mitigation:** adapter layer + contract tests + staged rollout.

- **Risk:** over-scoping AnA changes.  
  **Mitigation:** ship context contract first, action packs second.

- **Risk:** UAT failure due to SOP mismatch.  
  **Mitigation:** role-based scripts and signoff criteria authored before pilot.

---

## 8) Build governance

- **Weekly steering:** Product + CMC SME + QA + Platform + Design + AI lead.
- **RACI ownership:**
  - Product: IA + adoption KPIs
  - Engineering: route/API/wiring
  - QA/Validation: gate logic + audit trail verification
  - CMC SME: evidence taxonomy + workflow realism
  - AI Team: AnA context and action quality

- **Tracking artifacts:**
  - Gap closure burndown by workstream
  - Blocker log with owner/date
  - UAT evidence packet for release

---

## 9) Immediate next 5 actions (start this week)

1. Approve canonical CMC route and deprecation plan for the secondary route.
2. Approve final 4-lane IA for CMC operations.
3. Stand up canonical typed CMC API client and map legacy endpoints.
4. Patch field mapping mismatches in CMC project/substance/product list views.
5. Define AnA context contract payload schema for all CMC pages.

