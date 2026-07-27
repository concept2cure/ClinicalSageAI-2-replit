# RBM / RBQM — Full UI Design Advisory Report

*For the Claude design team — full-app UI rebuild. June 2026.*

> **Status note added 2026-07-26.** This document describes the RBM module as it
> stood in June 2026 and is kept as a point-in-time record, not a current
> specification. Several of the files it references no longer exist. The standalone
> RBM app (`client/src/concept2cure/rbm/` — `RbmRoute.tsx`, `App.tsx`, `data/nav.ts`),
> the second `rbm-operations` surface, and the `services/rbmService.ts` +
> `hooks/useRbm.ts` client layer were all removed when RBM was consolidated onto a
> single UI. The live module is `client/src/concept2cure/v2/surfaces/Rbm.tsx` with
> `RbmSurfacesA/B.tsx`, reading the aggregated board
> (`GET /api/mdx-rbm/rbm-board/:programId`) and writing through
> `surfaces/rbmWrites.tsx` to the granular `/api/mdx/rbm-*` routes. Treat file
> paths below as historical.

This is the exhaustive design brief for the **Risk-Based Monitoring (RBM / RBQM)**
module. It is written for a **full UI rebuild across the entire app**, so it does
two things at once:

1. Specifies **every UI need** of the RBM module, surface by surface, bound to
   the exact live data/service/hook/endpoint that already backs it.
2. Situates RBM inside the **app-wide shell + AnA architecture** so the rebuild
   keeps RBM consistent with its sibling domain shells (Risk, Labeling, CMC, MDX).

**Nothing here needs backend work.** The data model, API, deterministic engines,
AnA tools, and typed data layer are complete and stable. The design team builds
designed surfaces on top of the contracts below. Where this report overlaps the
earlier `RBM_DESIGN_SOW.md`, this document supersedes it — the SOW's "phase 2/3
out of scope" items (central statistical monitoring, patient profiles, KRI trend
history, the Risk Review report, the attention feed) are now **built and live**,
and are specified here as first-class surfaces.

---

## 0. TL;DR for the design lead

- **10 surfaces**, one per `RBM_NAV` entry: Overview, Risk review report, Risk
  assessment (RACT), Key risk indicators, Quality tolerance limits, Central
  monitoring, Patient profiles, Site risk, Site oversight, Monitoring plan.
- **40 REST endpoints** under `/api/mdx/rbm-*`, all tenant-scoped, all wrapped in
  the `{ data, meta }` envelope, all already fronted by a typed client
  (`rbmService`) and React Query hooks (`useRbm*`).
- **9 AnA tools** span the same surfaces. AnA is not a bolt-on chat box — it is a
  **parallel actuator** of the exact same operations the buttons perform. Every
  surface has a docked assistant with 3 curated starters and a tool that can read
  or drive that surface.
- **5 deterministic engines** produce every score/status the UI renders
  (likelihood×impact, KRI/QTL banding, robust modified z-score outlier detection,
  monitoring-tier assignment, the Risk Review builder). The UI **never computes
  risk** — it renders engine output and shows the numbers behind every chip.
- **Two governed actions** (approve assessment, approve plan) are **21 CFR Part 11**
  flows: reason-for-change + e-signature before `status → active`, with a visible
  audit trail.
- Build RBM as a **first-class domain shell** that visually matches
  `client/src/concept2cure/risk/` (the ISO 14971 module) — Rail + TopBar + TabBar
  + surface-router + AnA dock.

---

## 1. Where RBM sits in the app (architecture the rebuild must respect)

### 1.1 The app is a set of domain shells behind one Zen app frame

- **Host frame:** `client/src/concept2cure/ZenApp.tsx`. It owns a `layoutMode`
  state and a nav router. RBM is entered when `layoutMode === 'rbm'`, reachable at
  `?nav=rbm`, rendered by `client/src/concept2cure/rbm/RbmRoute.tsx`
  (`<RbmRoute activeProjectId={activeProjectId} />`, ZenApp.tsx:2013).
- **Sibling shells (the visual reference set):** `risk/` (ISO 14971 — the closest
  analog and the canonical reference for RBM), plus `labeling/`, `cmc/`, `mdx/`.
  The rebuild should extract the shell primitives these share (Rail, TopBar,
  TabBar, surface-router, AnA dock, empty/loading/error states, status chips) into
  a shared kit so RBM inherits them rather than re-implementing.
- **Program (study) context:** the active project id (`activeProjectId`, a UUID
  from `useProjects`) is threaded from the host into RBM and becomes the
  `program_id` filter on every read and the `programId` argument on every mutation.
  The **study selector lives in the shell**, not in individual surfaces; changing
  it re-scopes the whole module.

**Design implication:** RBM is one tab-set inside a persistent app frame. Do not
design a standalone page. Design a **domain shell**: a left Rail of surfaces, a
TopBar (study selector + global actions + AnA toggle), a TabBar or Rail-driven
surface router, and a docked AnA panel that is present on every surface.

### 1.2 Data envelope, tenancy, and identity (constraints, not choices)

- Every endpoint returns `{ data, meta }`. The client already unwraps `data`
  (`rbmService.request` returns `payload.data ?? payload`). Designers consume
  typed rows, never raw envelopes.
- **Tenant isolation is server-side** (`organization_id` from the JWT). The UI
  never sends an org id. Cross-tenant leakage is impossible by construction — but
  the UI must still show "no access / empty" states gracefully.
- **Program scoping:** all list reads take `program_id`; the hooks are
  `enabled` only when a program UUID is present (`enabledUuid`). Before a study is
  selected, surfaces show a **"select a study" empty state**, not a spinner.

---

## 2. The data layer the design binds to (already built — reuse verbatim)

Two files are the entire contract. Designers should treat these as the API:

- **`client/src/concept2cure/services/rbmService.ts`** — typed client, 1 class,
  `baseUrl = '/api/mdx'`. Every row interface (`RbmAssessment`, `RbmRiskItem`,
  `RbmKri`, `RbmKriValue`, `RbmQtl`, `RbmSignal`, `RbmSiteRisk`,
  `RbmSiteOversight`, `RbmPatientProfile`, `RbmPlan`, `RbmAction`, `RbmRiskReview`,
  `RbmAttentionItem`, `RbmSummary`) is defined here with exact field names and
  literal-union enums.
- **`client/src/concept2cure/hooks/useRbm.ts`** — React Query hooks + the
  `rbmQueryKeys` factory + `useInvalidateProgram` (mutations invalidate the whole
  `['rbm']` tree + the program summary). Query hooks are read; mutation hooks
  write and re-fetch.

### 2.1 Full endpoint ↔ service ↔ hook map (40 routes)

| Domain | Endpoint | Service method | Hook |
|---|---|---|---|
| Assessments | `GET /rbm-assessments` | `listAssessments` | `useRbmAssessments` |
| | `POST /rbm-assessments` | `createAssessment` | — |
| | `POST /rbm-assessments/seed` | `seedAssessment` | `useSeedRbmAssessment` |
| | `GET /rbm-assessments/:id` | `getAssessment` | `useRbmAssessment` |
| | `PATCH /rbm-assessments/:id` | (patch via detail) | — |
| | `POST /rbm-assessments/:id/approve` | `approveAssessment` | `useApproveRbmAssessment` |
| Risk items (CtQ) | `GET /rbm-risk-items` | `listItems` | `useRbmItems` |
| | `POST /rbm-risk-items` | `createItem` | `useCreateRbmItem` |
| | `PATCH /rbm-risk-items/:id` | `updateItem` | `useUpdateRbmItem` |
| KRIs | `GET /rbm-kris` | `listKris` | `useRbmKris` |
| | `POST /rbm-kris` | `createKri` | `useCreateRbmKri` |
| | `POST /rbm-kris/seed` | `seedKris` | `useSeedRbmKris` |
| | `PATCH /rbm-kris/:id` | `updateKri` | `useUpdateRbmKri` |
| | `POST /rbm-kris/:id/values` | `appendKriValue` | `useAppendRbmKriValue` |
| | `GET /rbm-kris/:id/values` | `listKriValues` | `useRbmKriValues` |
| QTLs | `GET /rbm-qtls` | `listQtls` | `useRbmQtls` |
| | `POST /rbm-qtls` | `createQtl` | `useCreateRbmQtl` |
| | `POST /rbm-qtls/seed` | `seedQtls` | `useSeedRbmQtls` |
| | `PATCH /rbm-qtls/:id` | `updateQtl` | `useUpdateRbmQtl` |
| Signals | `GET /rbm-signals` | `listSignals` | `useRbmSignals` |
| | `POST /rbm-signals` | `createSignal` | `useCreateRbmSignal` |
| | `PATCH /rbm-signals/:id` | `updateSignal` | `useUpdateRbmSignal` |
| Site risk | `GET /rbm-site-risk` | `listSiteRisk` | `useRbmSiteRisk` |
| | `POST /rbm-site-risk/recompute` | `recomputeSiteRisk` | `useRecomputeSiteRisk` |
| Central monitoring | `POST /rbm-central-monitoring/run` | `runCentralMonitoring` | `useRunCentralMonitoring` |
| Site oversight (SPOT) | `GET /rbm-site-oversight/:programId` | `listSiteOversight` | `useRbmSiteOversight` |
| Patient profiles | `GET /rbm-patient-profiles` | `listPatientProfiles` | `useRbmPatientProfiles` |
| | `POST /rbm-patient-profiles` | `upsertPatientProfile` | — |
| | `POST /rbm-patient-profiles/score` | `scorePatients` | `useScoreRbmPatients` |
| Plans | `GET /rbm-monitoring-plans` | `listPlans` | `useRbmPlans` |
| | `POST /rbm-monitoring-plans` | `createPlan` | `useCreateRbmPlan` |
| | `GET /rbm-monitoring-plans/:id` | `getPlan` | — |
| | `PATCH /rbm-monitoring-plans/:id` | `updatePlan` | — |
| | `POST /rbm-monitoring-plans/:id/approve` | `approvePlan` | `useApproveRbmPlan` |
| Actions | `GET /rbm-monitoring-actions` | `listActions` | `useRbmActions` |
| | `POST /rbm-monitoring-actions` | `createAction` | `useCreateRbmAction` |
| | `PATCH /rbm-monitoring-actions/:id` | `updateAction` | — |
| Rollups | `GET /rbm-summary/:programId` | `getSummary` | `useRbmSummary` |
| | `GET /rbm-report/:programId` | `getReport` | `useRbmReport` |
| | `GET /rbm-attention/:programId` | `getAttention` | `useRbmAttention` |

> A handful of writes (`createAssessment`, `PATCH` assessment, `getPlan`,
> `updatePlan`, `updateAction`, `upsertPatientProfile`) have service methods but
> no dedicated hook yet — trivial to add following the existing pattern when a
> surface needs them. Flag these to engineering per surface rather than
> re-inventing.

### 2.2 The deterministic engines behind every number (context for the visuals)

The UI renders engine output; it must **show the number behind every chip** so a
reviewer/inspector can trace it. Engines:

- **`server/services/rbm/rbm-engine.ts`** — `scoreRisk` (likelihood × impact),
  `bandFromScore` / `rbmBand` (low <8, medium 8–14, high ≥15), `kriStatus`
  (green/amber/red vs thresholds + direction), `qtlStatus`
  (within/approaching/breached, secondary limit = 50–75% early warning),
  `monitoringTierFromRisk`, `defaultPlanStrategy`, and the seed libraries
  (`DEFAULT_CTQ_FACTORS`, `DEFAULT_KRIS`, `DEFAULT_QTLS` — the TransCelerate model).
- **`server/services/rbm/site-risk-engine.ts`** — `recomputeSiteRisk` derives
  composite/enrollment/quality/operational risk + monitoring tier + drivers from
  Site Intelligence.
- **`server/services/rbm/central-statistical-monitoring.ts`** — CluePoints
  SMART-style **robust modified z-score** (Iglewicz–Hoaglin, MAD with z fallback),
  `detectSiteOutliers`, `scorePatientCohort` (MIN_COHORT = 5). Produces anomaly
  scores + severity.
- **`server/services/rbm/risk-report.ts`** — `buildRiskReview` /
  `renderRiskReviewMarkdown` (the inspection deliverable) and `buildAttentionFeed`
  (the daily driver).

**Design implication:** every score is explainable. Chips carry the numeric score
and the driver; matrices/heatmaps map to the exact bands above; "why is this red"
is answerable from data the UI already has.

---

## 3. Cross-cutting design system, compliance, and interaction rules

These are **mandatory** and apply to every surface. They are drawn from the app's
existing regulated-UX posture and the design skill set (accessibility,
motion-discipline, microcopy-tone, regulatory-compliance-ux, design-tokens).

### 3.1 Tokens & visual language
- **Tokens only.** Cream canvas, terracotta accent (`--accent`), olive/amber/red
  status ramp. Reference `design-system/README.md` and
  `client/src/concept2cure/design/zen.css`. No hard-coded hex, no ad-hoc spacing.
- **Density:** match the Risk shell — information-dense tables/cards, generous but
  not airy. This is a professional monitoring tool, not a consumer dashboard.
- **Iconography:** Lucide only (design-system non-negotiable). One icon per status
  meaning, used consistently across surfaces.

### 3.2 Accessibility (WCAG 2.2 AA — hard gate)
- **Color is never the only signal.** Every status chip pairs **tone + text label
  + icon**. A red KRI reads "Red" with an icon, not just a red dot. Mirror
  `risk/surfaces/state.tsx`.
- **Every score shows its number.** Risk matrix cells, KRI bands, QTL gauges,
  anomaly scores, site composite risk — always render the value.
- Full keyboard operability, visible focus, correct focus order, no keyboard
  traps. Tables are navigable; dialogs trap focus correctly and restore it.
- Charts have text/table equivalents (a sortable data table behind every viz).
- Respect `prefers-reduced-motion`.

### 3.3 Motion discipline
- 200 ms ease-out default. No spring, no bounce, no overshoot. Transitions are
  informative (state change, disclosure), never decorative. Honor reduced-motion.

### 3.4 Microcopy & tone
- Reviewer-grade: **sentence case, no emoji, no exclamation marks**, calm and
  factual. Errors state what happened and the next action. Empty states state what
  the surface is for and offer the seed/compute action. Follow the
  `microcopy-tone` skill.

### 3.5 21 CFR Part 11 governed actions (compliance-critical)
- **Approving an assessment or a plan** (`status → active`) is a governed action:
  it requires **reason-for-change capture + e-signature** before it commits, via
  the same signing surface the app uses (`server/api/gcc/signing`). The endpoints
  are `POST /rbm-assessments/:id/approve` and `POST /rbm-monitoring-plans/:id/approve`
  (`approveAssessment(id, reason)` / `approvePlan(id, reason)`).
- The approval dialog is the canonical **governed-action confirmation** pattern:
  summarize what changes, require a typed reason, require signature (identity
  re-assertion), and on success surface the audit entry. Follow the
  `regulatory-compliance-ux` skill.
- **Immutable history is visible.** Assessments carry a `version`; approvals are
  audited. The UI should expose "who approved, when, why" as first-class content,
  not a hidden log.

### 3.6 Standard status vocabularies (use these exact tokens everywhere)
| Dimension | Values (render label + icon + tone) |
|---|---|
| Risk band | low · medium · high |
| CtQ item status | open · mitigating · accepted · closed |
| KRI status | green · amber · red |
| QTL status | within · approaching · breached |
| Signal severity | low · medium · high · critical |
| Signal status | new · triaged · investigating · resolved · dismissed |
| Monitoring tier | reduced · standard · enhanced |
| Patient status | normal · review · flagged |
| Plan strategy | centralized · risk_based · on_site · hybrid |
| Action type | issue · capa · site_visit · query · escalation |
| Action status | open · in_progress · done |

`data/nav.ts` already exports label maps for most of these
(`RBM_CATEGORY_LABEL`, `RBM_ITEM_STATUS_LABEL`, `RBM_KRI_STATUS_LABEL`,
`RBM_QTL_STATUS_LABEL`, `RBM_SEVERITY_LABEL`, `RBM_TIER_LABEL`) plus `rbmBand()`.
Reuse them; do not invent new copy.

---

## 4. How AnA is involved (this is central — read carefully)

AnA is the app's agentic assistant. In RBM it is **not a chat sidebar bolted on
top** — it is a **second way to drive the same module**. Three integration layers:

### 4.1 The docked assistant (present on every surface)
- Wire `useAnaChat({ moduleContext: { workstream: 'rbm', activeNav, projectId } })`
  exactly as `risk/App.tsx` does. The dock is a persistent panel toggled by
  `⌘\` (Cmd/Ctrl+backslash). It travels with the shell, not the surface.
- **Per-surface starters:** `RBM_SUGGESTIONS` in `data/nav.ts` maps every surface
  id to **3 sentence-case prompts** (e.g. Overview → "Summarize the risk-based
  monitoring posture for this study", "Which critical-to-quality factors are still
  open", "What needs my attention across KRIs, QTLs and signals"). Render these as
  clickable starter chips in the dock that change with the active surface.
- `moduleContext` gives AnA the workstream + active surface + program so its
  answers are already scoped — the user never re-states the study.

### 4.2 The 9 tools (AnA can read or actuate every surface)
Every tool takes `programId` and (for writes) uses the **server-injected tenant
context**, never a model-supplied org id. Tool → surface mapping:

| AnA tool | What it does | Primary surface(s) it drives |
|---|---|---|
| `run_rbm_assessment` | Seed or summarize the RACT (CtQ factors, criticals, overall risk) | RACT, Overview |
| `assess_site_risk` | Per-site risk snapshot + monitoring tier + drivers | Site risk |
| `evaluate_kris_qtls` | Summarize amber/red KRIs and approaching/breached QTLs | KRIs, QTLs, Central monitoring |
| `generate_rbm_plan` | Draft strategy + actions from the assessment (advisory) | Monitoring plan |
| `prioritize_monitoring_queries` | Rank open signals + high-risk CtQ items by urgency | Central monitoring, Overview |
| `run_central_monitoring` | Robust z-score site-outlier detection → `central_stat` signals | Central monitoring, Site oversight |
| `scan_patient_profiles` | Patient-level anomaly detection → review/flagged | Patient profiles |
| `generate_rbm_report` | Inspection-ready ICH E6(R3) Risk Review (structured + markdown) | Risk review report |
| `get_rbm_attention` | Prioritized "needs attention now" feed | Overview, Attention widgets |

### 4.3 Design implications of AnA parity
- **Surface actions and AnA tools must feel like one system.** When a user clicks
  "Recompute site risk," that is `assess_site_risk`/`recomputeSiteRisk`; when they
  ask AnA "recompute site risk and show enhanced-tier sites," the same thing runs.
  Design the button label and the AnA starter to name the same operation.
- **AnA results should be able to deep-link into surfaces.** When AnA returns "3
  enhanced-tier sites," each should be a link that navigates to Site risk filtered
  to those sites. Plan for AnA→surface navigation affordances.
- **Advisory outputs are clearly advisory.** `generate_rbm_plan` and
  `generate_rbm_report` are drafts pending human review/approval — the UI must
  badge AnA-generated content as draft and route it through the same governed
  approval as manual content.
- **The attention feed is the AnA/UI bridge.** `get_rbm_attention` and
  `GET /rbm-attention/:programId` return the same feed; render it as a shared
  widget (Overview hero + optional shell-level "needs attention" badge) so the
  daily-standup answer is identical whether asked in chat or read on screen.

---

## 5. Surface-by-surface UI specification (all 10)

For each: **who/job**, **data**, **components**, **states**, **governed/AnA**.
Build one file per surface under `rbm/surfaces/*`, routed by the shell, matching
`risk/surfaces/*` structure.

### 5.1 Overview  (`overview`)
- **Who/job:** clinical operations lead / medical monitor opening the study —
  "what's the posture and what needs me now."
- **Data:** `useRbmSummary(programId)` → `RbmSummary` (overallRisk; riskItems
  {total, critical, open, high}; kris {total, red, amber}; qtls {total, breached,
  approaching}; signals {total, open, high}; sites {total, enhanced}). Plus
  `useRbmAttention(programId)` → `RbmAttentionItem[]`.
- **Components:** a row of **readiness tiles** (overall risk band as the hero;
  then critical CtQs, KRI red/amber, QTL breached/approaching, open/high signals,
  enhanced-tier sites) each linking to its surface; a **"Needs attention now"
  queue** (the attention feed, ordered by severity: breached QTLs → high signals →
  red KRIs → flagged patients → overdue actions → unapproved active assessments),
  each item deep-links to the source row.
- **States:** no study → "select a study"; study with no data → seed CTA cluster
  ("Seed risk assessment", "Seed KRIs", "Seed QTLs", "Recompute site risk");
  loading → tile skeletons; error → inline retry.
- **AnA:** starters summarize posture / list open CtQs / "what needs my attention."
  Tiles' numbers should match what `get_rbm_attention` and `evaluate_kris_qtls`
  return.

### 5.2 Risk review report  (`report`)
- **Who/job:** QA / inspection readiness — a portfolio- or study-level Risk Review
  a regulator would accept.
- **Data:** `useRbmReport(programId)` → `{ report: RbmRiskReview; markdown }`.
  `RbmRiskReview` = { programId, asOf, framework, overallRisk, headline,
  attentionCount, approved, sections: RbmReportSection[] } where each section is
  { title, status: ok|attention|critical, items: string[] }.
- **Components:** a formal **report document view** — header (framework, as-of
  timestamp, overall risk, approved badge), an executive headline, then sectioned
  findings (each section a card with an ok/attention/critical status header and a
  bulleted findings list). Provide **Export** (the `markdown` field is the export
  payload) and **Print** (inspection hand-off). An "approved" indicator ties to
  the assessment approval state.
- **States:** empty → "no data yet, seed the assessment"; the report is
  read-derived so no create flow.
- **AnA:** `generate_rbm_report` produces exactly this; starters: "Generate the
  ICH E6(R3) risk review report", "Summarize the overall risk posture for an
  inspection", "What would a regulator flag." AnA-generated report and the surface
  render the same builder output — keep them visually identical.

### 5.3 Risk assessment / RACT  (`ract`)
- **Who/job:** risk manager building/maintaining the Critical-to-Quality register.
- **Data:** `useRbmItems(programId)` → `RbmRiskItem[]` (category, ctq_factor,
  likelihood, impact, detectability?, risk_score, is_critical, mitigation,
  residual_score, status). Seed via `useSeedRbmAssessment`; create/edit via
  `useCreateRbmItem` / `useUpdateRbmItem`. Assessment header via
  `useRbmAssessments` / `useRbmAssessment`.
- **Components:** the signature **likelihood × impact risk matrix** (mirror
  `risk/surfaces/Matrix.tsx`) with cells banded low/medium/high per `rbmBand`,
  each cell showing count + click-to-filter; a **CtQ register table** (category,
  factor, L×I score with the number, critical flag, mitigation, residual, status);
  a **create/edit dialog** (category, factor, likelihood/impact sliders or
  selects, detectability, mitigation, status). Show residual vs inherent risk
  side by side.
- **Governed:** the assessment's move to `active` is the **approval flow**
  (reason-for-change + e-signature). Show version + approval state prominently.
- **States:** empty → "Seed a default ICH E6(R3) assessment" (seed CTA); loading →
  matrix + table skeleton.
- **AnA:** `run_rbm_assessment` (seed/summarize); starters seed / rank by score /
  "which risks have no mitigation."

### 5.4 Key risk indicators  (`kris`)
- **Who/job:** central monitor watching operational/quality signals.
- **Data:** `useRbmKris(programId)` → `RbmKri[]` (name, metric_definition,
  data_source, unit, direction higher_worse|lower_worse, threshold_amber/red,
  current_value, status green|amber|red, evaluated_at). Trend: `useRbmKriValues(kriId)`
  → `RbmKriValue[]` (value, status, observed_at, note). Seed `useSeedRbmKris`;
  create/edit `useCreateRbmKri`/`useUpdateRbmKri`; append reading
  `useAppendRbmKriValue`.
- **Components:** KRI cards/table with **green/amber/red status** (label+icon+tone),
  current value vs amber/red thresholds shown numerically, and a **sparkline / trend
  chart** per KRI from the values history (with a data-table equivalent). A
  **value-entry** control appends a reading and recomputes status. Direction
  (higher/lower worse) must be legible so a rising line reads correctly as good or
  bad.
- **States:** empty → "Seed the standard KRI library"; a KRI with no history →
  sparkline empty state + "add first reading."
- **AnA:** `evaluate_kris_qtls`; starters: which are amber/red now / seed library /
  explain each red KRI.

### 5.5 Quality tolerance limits  (`qtls`)
- **Who/job:** sponsor quality lead governing study-level tolerance.
- **Data:** `useRbmQtls(programId)` → `RbmQtl[]` (parameter, rationale, threshold,
  secondary_limit, current_value, breached, status within|approaching|breached).
  Seed `useSeedRbmQtls`; create/edit `useCreateRbmQtl`/`useUpdateRbmQtl`.
- **Components:** QTL table with a **gauge/threshold bar** per parameter showing
  current value against the **secondary (early-warning) limit** and the primary
  threshold — the secondary limit (50–75% of threshold) is the RBQM-distinctive
  early-warning band and must be visually first-class. Status chip
  within/approaching/breached with the number. Rationale is inline (QTLs require
  documented rationale).
- **States:** empty → "Propose quality tolerance limits" (seed CTA).
- **AnA:** `evaluate_kris_qtls`; starters: which approaching/breached / propose
  QTLs / "what action does a breached QTL require."

### 5.6 Central monitoring  (`signals`)
- **Who/job:** central monitor / data manager triaging statistical + rule-based
  signals.
- **Data:** `useRbmSignals(programId, status?)` → `RbmSignal[]` (source
  central_stat|kri|qtl|site_score|manual, signal_type, severity, title, detail,
  detected_at, status new|triaged|investigating|resolved|dismissed). Run detection
  `useRunCentralMonitoring` (returns `{ findings, signals }`). Triage
  `useUpdateRbmSignal` (severity/status/detail/resolutionNotes). Create manual
  `useCreateRbmSignal`.
- **Components:** a **signal inbox** — sortable/filterable by severity, source,
  status; a **triage panel** per signal (change status, add resolution notes,
  escalate to an action); a **"Run central monitoring"** action that surfaces the
  robust-z-score findings and newly raised `central_stat` signals. Severity
  (critical→low) drives sort order and a left border/tone. Source badges
  distinguish statistical vs KRI/QTL-derived vs manual.
- **States:** empty → "No open signals; run central monitoring" (compute CTA);
  post-run → surface findings + new-signal count.
- **AnA:** `prioritize_monitoring_queries`, `run_central_monitoring`; starters:
  prioritize by urgency / which sites have most high-severity signals / "draft an
  action for the most critical signal."

### 5.7 Patient profiles  (`patients`)
- **Who/job:** medical monitor / safety reviewer looking for atypical subjects.
- **Data:** `useRbmPatientProfiles(programId, status?)` → `RbmPatientProfile[]`
  (subject_id, site_id, metrics: Record<string,number>, anomaly_score,
  top_dimension, status normal|review|flagged, scored_at). Score cohort
  `useScoreRbmPatients`. Upsert profile `upsertPatientProfile` (service; hook TBD).
- **Components:** a **patient anomaly list** ranked by anomaly score, with status
  (normal/review/flagged), the **top contributing dimension**, and the underlying
  metric values; a **per-patient drill-in** showing every metric with its z-score
  vs cohort (why this subject is atypical); a **"Scan cohort"** action running
  `scorePatients`. Consider a cohort **scatter/strip plot** (anomaly score vs
  metric) with a data-table equivalent. Respect the MIN_COHORT = 5 rule — below it,
  show "cohort too small to score" rather than false anomalies.
- **States:** empty → "Scan the patient cohort for atypical subjects"; small
  cohort → explanatory empty state.
- **AnA:** `scan_patient_profiles`; starters: scan cohort / which flagged for
  medical review / "explain why a flagged patient is an anomaly."

### 5.8 Site risk  (`sites`)
- **Who/job:** monitoring lead assigning risk-proportionate oversight per ICH
  E6(R3).
- **Data:** `useRbmSiteRisk(programId)` → `RbmSiteRisk[]` (site_number, site_name,
  composite_risk, enrollment_risk, quality_risk, operational_risk, monitoring_tier
  reduced|standard|enhanced, drivers[], scored_at). Recompute
  `useRecomputeSiteRisk`.
- **Components:** a **site table ranked by composite risk** with per-dimension risk
  (enrollment/quality/operational) as a small **multi-dimension bar or heat row**,
  a **monitoring-tier chip** (reduced/standard/enhanced), and the **drivers** as
  chips/list ("why this tier"). A **"Recompute site risk"** action. Optionally a
  **portfolio heatmap** (sites × dimensions) with the table as equivalent.
- **States:** empty → "Recompute site risk" (compute CTA, reads Site Intelligence).
- **AnA:** `assess_site_risk`; starters: recompute + show enhanced-tier / which
  sites should move to enhanced and why / "explain the drivers behind the
  highest-risk site."

### 5.9 Site oversight (SPOT)  (`oversight`)
- **Who/job:** oversight lead running the site-oversight stand-up — risk plus the
  live signal load per site.
- **Data:** `useRbmSiteOversight(programId)` → `RbmSiteOversight[]` (site_number,
  site_name, composite_risk, monitoring_tier, drivers[], **open_signals**,
  **high_signals**). This joins site risk with the open-signal counts — the
  operational complement to Site risk.
- **Components:** an **oversight table/board** ranked by risk, each row showing tier
  + drivers + open-signal count + high-severity-signal count, with the signal
  counts linking into Central monitoring filtered to that site. This is the
  "where do I send a monitor" view.
- **States:** empty → mirrors Site risk (recompute first).
- **AnA:** driven by `run_central_monitoring` + `assess_site_risk`; starters: show
  oversight ranked by risk / which sites carry most open high-severity signals /
  "summarize what each enhanced-tier site needs."

### 5.10 Monitoring plan  (`plan`)
- **Who/job:** monitoring lead turning the assessment into an actionable plan.
- **Data:** `useRbmPlans(programId)` → `RbmPlan[]` (title, strategy
  centralized|risk_based|on_site|hybrid, status draft|active|archived). Plan detail
  `getPlan` → `RbmPlanDetail` (+ actions). Actions `useRbmActions(planId, programId)`
  → `RbmAction[]` (action_type, description, priority, owner, due_date, status).
  Create plan `useCreateRbmPlan`; create action `useCreateRbmAction`; update
  plan/action via service.
- **Components:** a **plan header** (strategy chip, status, approval state) + an
  **actions board** (kanban open/in_progress/done, or a table) with action type,
  priority, owner, due date; a **"Generate plan"** action (AnA `generate_rbm_plan`,
  badged draft); a create-plan flow. Overdue actions are visually flagged (they
  also feed the attention feed).
- **Governed:** plan `status → active` is the **approval flow** (reason-for-change
  + e-signature, `approvePlan`). AnA-generated plans are drafts until approved.
- **States:** empty → "Generate a risk-based monitoring plan from the assessment."
- **AnA:** `generate_rbm_plan`; starters: generate plan / recommend a strategy for
  this risk level / "turn the critical risks into monitoring actions."

---

## 6. Shared component inventory (build once, reuse across surfaces)

The rebuild should produce a small RBM (ideally app-wide) component kit:

- **StatusChip** — tone + label + icon, one variant per vocabulary in §3.6.
  Never color-only. Renders the numeric value when one exists.
- **RiskMatrix** — likelihood × impact grid, banded by `rbmBand`, cell counts,
  click-to-filter (reuse from Risk shell).
- **ScoreCell / ScoreBar** — a value with its band; used in tables everywhere.
- **ThresholdGauge** — current value against secondary + primary limits (QTLs),
  and against amber/red thresholds (KRIs).
- **Sparkline / TrendChart** — KRI values history; data-table equivalent required.
- **SiteRiskRow / Heatmap** — multi-dimension risk visualization.
- **AnomalyList / AnomalyDetail** — patient profiles with per-metric z-scores.
- **SignalInbox / TriagePanel** — severity-sorted list + triage actions.
- **ActionsBoard** — kanban/table of monitoring actions.
- **ReadinessTiles** — Overview metric tiles.
- **AttentionQueue** — the shared attention feed widget (Overview + shell badge).
- **GovernedApprovalDialog** — reason-for-change + e-signature + audit surfacing
  (the Part 11 pattern; shared with the rest of the app).
- **SeedEmptyState** — the recurring "no data → seed/compute" CTA cluster.
- **AnADock + StarterChips** — the docked assistant with per-surface starters.

Because the app-wide rebuild touches every domain, extract **StatusChip,
RiskMatrix, GovernedApprovalDialog, AttentionQueue, AnADock, SeedEmptyState,
and the shell primitives (Rail/TopBar/TabBar/surface-router)** into the shared
kit so Risk, Labeling, CMC, MDX, and RBM all consume one implementation.

---

## 7. State, loading, empty, and error patterns (every surface)

- **No study selected** → a calm "select a study" panel, never a spinner. Hooks are
  `enabled` only with a program UUID.
- **Loading** → skeletons that match the final layout (tiles, table rows, matrix),
  not a centered spinner. Respect reduced-motion (no shimmer if reduced).
- **Empty (study, no data)** → the **SeedEmptyState** naming exactly what will be
  created and the action (seed assessment / seed KRIs / seed QTLs / recompute site
  risk / scan patients / run central monitoring / generate plan / generate report).
- **Error** → inline, factual message + retry; never a raw error envelope. The
  client already normalizes `{ error }` to an `Error`.
- **Mutation feedback** → optimistic where safe; governed actions are never
  optimistic (they must round-trip the signature). Invalidation already re-fetches
  the `['rbm']` tree + summary.
- **Freshness** → surfaces show `scored_at` / `evaluated_at` / `detected_at` /
  `asOf` timestamps so a monitor knows how stale a score is (compute actions are
  point-in-time).

---

## 8. Information architecture & navigation

- **Rail order** (from `RBM_NAV`): Overview → Risk review report → Risk assessment
  (RACT) → Key risk indicators → Quality tolerance limits → Central monitoring →
  Patient profiles → Site risk → Site oversight → Monitoring plan. This is a
  deliberate flow: posture → deliverable → design-layer (RACT/KRI/QTL) →
  detection (signals/patients) → site oversight → response (plan).
- **Deep-linking:** every rollup number (Overview tiles, attention items, report
  sections, oversight signal counts) links to the source surface, ideally
  pre-filtered. Design the navigation so a monitor can go headline → root cause in
  one click.
- **Study selector** is shell-level and persistent; surface state resets/re-scopes
  on change.
- **AnA↔surface:** AnA answers should offer affordances to jump into the relevant
  surface (see §4.3).

---

## 9. App-wide rebuild alignment (so RBM is not a one-off)

- **Match the Risk shell** (`client/src/concept2cure/risk/`) as the structural
  template: `App.tsx` (Rail + TopBar + TabBar + surface-router + AnA dock),
  `shell/{Rail,TopBar,TabBar}.tsx`, `surfaces/*`, `icons.tsx`, `app.css`
  (imports `../mdx/app.css` then `./app.css`). RBM should read as a sibling of
  Risk, not a different product.
- **One AnA dock pattern** across all shells (`useAnaChat` + `moduleContext` +
  per-workstream starters). RBM's `workstream: 'rbm'` slots into the same
  mechanism Risk/Labeling/CMC use.
- **One governed-approval pattern** across all shells (reason-for-change +
  e-signature + audit). RBM's two approvals must be the same dialog as CMC/Risk
  sign-offs.
- **One status-chip / matrix / empty-state kit** shared across domains (see §6).
- **Consistent density, tokens, motion, and tone** so switching `layoutMode`
  between domains never feels like switching apps.

---

## 10. Acceptance criteria for the redesigned RBM

- All **10 surfaces** render live data via the `useRbm*` hooks — no demo arrays.
- Every empty state offers the correct seed/compute action; the study selector
  threads `program_id` to every surface.
- Every status is **label + icon + tone**; every score shows its number; charts
  have table equivalents; keyboard nav/focus order correct; reduced-motion honored
  (WCAG 2.2 AA passes).
- The two approvals capture **reason-for-change + e-signature** and surface the
  audit trail; AnA-generated plans/reports are badged draft and routed through the
  same approval.
- `⌘\` toggles the AnA dock; per-surface starters fire real AnA round-trips; AnA
  results deep-link into surfaces where sensible.
- RBM matches the Risk/Labeling/CMC shells visually and structurally (rail, top
  bar, tab bar, density, tokens).
- The Risk review report exports (markdown) and prints cleanly for inspection.

---

## 11. Open decisions for the design team (flag, don't guess)

1. **Portfolio vs study scope** for the Risk review report and Overview — the data
   is study-scoped today; a portfolio rollup across studies is a natural next add
   (would need a new endpoint). Decide whether to design the portfolio layer now.
2. **KRI thresholds source** — thresholds are currently entered/seeded; live EDC/
   CTMS-fed values are a phase-next connector. Design the KRI surface so a "live
   feed connected" state can slot in later.
3. **Site oversight vs Site risk** — they share a table; decide whether to merge
   into one surface with a "signals" toggle or keep two (current nav keeps two).
4. **Missing hooks** — a few writes (`createAssessment`, `PATCH` assessment,
   `getPlan`/`updatePlan`, `updateAction`, patient `upsert`) have service methods
   but no hook; confirm which surfaces need them so engineering adds the thin hook.
5. **AnA content provenance badging** — finalize the visual for "AnA-drafted,
   pending review" so advisory output is never mistaken for approved record.

---

*Contracts referenced: `client/src/concept2cure/services/rbmService.ts`,
`client/src/concept2cure/hooks/useRbm.ts`, `client/src/concept2cure/rbm/data/nav.ts`,
`server/routes/mdx-rbm.ts`, `server/services/rbm/*.ts`,
`server/services/ana/AnaToolDefinitions.ts` (RBM tool block),
`client/src/concept2cure/ZenApp.tsx` (`layoutMode === 'rbm'`). Reference shell:
`client/src/concept2cure/risk/`.*
