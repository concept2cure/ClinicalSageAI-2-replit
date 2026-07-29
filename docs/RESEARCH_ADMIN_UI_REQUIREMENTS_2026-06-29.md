# Research-Administration & Protocol-Development — UI Requirements Report

> **Status:** Backend + AnA-tool layers are COMPLETE and merged on `concept2cure-v2`.
> **This document:** the front-end build spec for surfacing them. No UI has been built yet.
> **Created:** 2026-06-29 · **Audience:** UI engineers / Claude Code UI build sessions.

## Context

Across this initiative, 14 backend modules were shipped (org-scoped Drizzle schema →
pure regulation-cited logic + vitest → governed/audited service → REST API → AnA
conversational tools → Prometheus metrics → migration). **Every module is reachable
only via REST API or the AnA assistant — none has a front-end surface.** This report
enumerates, per module, the API it exposes, the AnA tools, and the screens/components
the UI must provide.

### Conventions to follow (existing platform UI)
- Honor the canonical shell/IA: `docs/architecture/CONCEPT2CURE_CANONICAL_UI_IA_AND_SHELL_SPEC.md`
  (three-pane Project Workspace: left project/module tree · center work surface · right
  artifacts/audit/tasks). "No orphaned screens" — every surface mounts inside the shell.
- Client app root: `client/src/concept2cure/ZenApp.tsx`; module registry in
  `client/src/concept2cure/zen-app-constants.ts`; surfaces live under
  `client/src/concept2cure/<area>/surfaces/`. A `pdev/` area folder already exists.
- Reuse the existing component library under `client/src/components/ui/*` (shadcn-style)
  and the design skills (`frontend-design`, `design-tokens`, `accessibility-enforcement`,
  `regulatory-compliance-ux`, `motion-discipline`, `microcopy-tone`).
- **Governance UX is mandatory** (21 CFR Part 11): every mutating action requires a
  reason-for-change capture (min 8 chars), shows the audit trail, and gated/`sign`
  actions (finalize, approve, execute) need an e-signature/confirm step. Apply the
  `regulatory-compliance-ux` skill to all mutations.
- All endpoints are org-scoped and behind `authMiddleware`; the UI must send the tenant
  session. Errors return `{ error: { code, message } }` with 400/401/403/404/409/500.

### Cross-cutting components to build once and reuse
- **GovernedActionDialog** — wraps any mutation: reason field, optional e-sign, optimistic
  result + audit-id toast.
- **ReasonField**, **AuditTrailPanel** (right pane), **CompletenessGatePanel** (renders
  `findings[]` with severity + the readyTo* boolean used by finalize gates).
- **RegulatoryCitation** chip (renders the `basis`/`citation` strings the logic returns).
- **FindingsList** (severity: critical/major/minor/warning/info).
- **EntityStatusBadge** (maps the many CHECK-constrained status enums to colors).

---

## 1. Medicare Coverage Analysis (C2C-15) — `/api/coverage-analysis`
**Why:** classify each protocol item as Medicare routine cost / sponsor-paid / SOC per
NCD 310.1 (False Claims Act risk). **AnA tools:** create_coverage_analysis, add_coverage_item,
classify_coverage_item, review_coverage_analysis.
**Screens:**
- **Analyses list** (`GET /analyses`) → table by status; "New analysis" → create dialog
  (title, study, NCT id, sponsor).
- **Analysis detail**: qualifying-trial panel (`PATCH /analyses/:id/qualifying` — 3 required
  criteria toggles + deemed + desirable count, shows determination + rationale); **billing
  grid** (`GET /analyses/:id/billing-grid`) — rows = items with classification +
  billing-designation badge + NCD/LCD citation; per-item classify action
  (`PATCH /items/:id/classify`, SOC + sponsor-paid toggles → deterministic designation);
  ICD-10 validate (`PATCH /items/:id/icd10`); **Suggest** panel (`GET /analyses/:id/suggest`).
- **Finalize** (`POST /analyses/:id/finalize`) — blocked with a readiness blocker list until
  every item classified; e-sign. Show the **advisory disclaimer** prominently.

## 2. Research Committee Governance (C2C-16) — `/api/committees`
**Why:** IACUC/IRB/IBC membership, meetings, **polling/voting + quorum**, role-gated
privileges, multi-protocol portfolio. **AnA tools:** assign_committee_member,
convene_committee_meeting, add_committee_agenda_item, cast_committee_vote,
finalize_committee_determination, review_protocol_portfolio.
**Screens:**
- **Committee roster** per type (`GET /members`, `POST /members`) + **composition status**
  (`GET /:committeeType/composition`) — show critical findings (nonscientist, non-affiliated,
  IACUC vet, ≥5 members).
- **Meetings** (`GET /meetings`, `POST /meetings`); **Convene** screen (`POST /meetings/:id/convene`)
  with a present-members checklist → quorum result banner.
- **Meeting detail** (`GET /meetings/:id`): agenda items, **the poll** — per-member vote
  controls (`POST /agenda/:id/votes`: approve / approve_with_modifications / disapprove /
  abstain / recuse), live tally; **Finalize determination** (`POST /agenda/:id/finalize`,
  gated on quorum + approve privilege + CITI training; e-sign).
- **Protocol portfolio cockpit** (`GET /portfolio`) — all IACUC + IRB protocols + pending agenda.
- **Role-gating:** disable/hide assign/vote/finalize per the `can()` privileges (403 → tooltip).

## 3. Intelligent Grant Finder (C2C-14) — `/api/grant-finder`
**AnA tools:** set_funding_profile, find_grant_opportunities.
**Screens:** **Funding profile** editor (`PUT /profile`, `GET /profile` — keywords, agencies,
mechanisms, institution type, award range); **Discover** results (`GET /discover?query=`) —
ranked opportunity cards with **fit score (0–100)**, eligibility flag, days-to-deadline, and the
per-factor `reasons[]` ("why this scored"); **Record** to pipeline (`POST /record`).

## 4. CITI Training (C2C-01/02) — `/api/citi-training`
**AnA tools:** import_citi_records, review_training_matrix, review_expiring_training.
**Screens:** **Training matrix** (`GET /matrix`) — personnel × training-type grid with
status cells (current/expiring/expired/missing); **Import** completion records
(`POST /personnel/:id/import`); **Expiring report** (`GET /expiring?withinDays=`).

## 5. Protocol-Portfolio Analytics (C2C-16) — `/api/protocol-portfolio/analytics`
**AnA tool:** review_protocol_portfolio_analytics. **Screen:** dashboard with expiration
buckets (expired/due_30/due_90/current) across IACUC+IRB, overdue + expiring-soon lists, and a
prioritized "needs attention" queue with continuing-review citations.

## 6. Protocol Development authoring (C2C-17) — `/api/protocol-development`
**Why:** the core protocol builder. **AnA tools:** create_protocol_document, update_protocol_section,
add_protocol_objective, add_eligibility_criterion, review_protocol_completeness, finalize_protocol_document.
**Screens:**
- **Documents list** (`GET /documents`) + **New** (kind iacuc/irb/clinical/ibc → auto-seeds
  templated sections).
- **Protocol editor** (`GET /documents/:id`): left = section outline (status not_started/draft/
  complete); center = section content editor (`PATCH /sections/:id`); tabs for **Objectives**
  (`POST /documents/:id/objectives`), **Eligibility** (inclusion/exclusion,
  `POST /documents/:id/eligibility`), **Schedule of assessments** (see #12).
- **Completeness panel** (`GET /documents/:id/completeness`) — % required complete + gaps.
- **Finalize** (`POST /documents/:id/finalize`, gated; e-sign; bumps major version).
- Surface area folder already scaffolded: `client/src/concept2cure/pdev/`.

## 7. Protocol Risk Register (C2C-19) — `/api/protocol-risks`
**AnA tools:** add_protocol_risk, review_protocol_risk_register. **Screen:** risk register table
+ **5×5 likelihood × impact heat-map**; add/edit risk (`POST /documents/:id/risks`,
`PATCH /risks/:id` — mitigation, residual L×I, status); register summary (counts by level,
open high/extreme, residual exposure).

## 8. Protocol Amendments (C2C-18a) — `/api/protocol-amendments`
**AnA tools:** create_protocol_amendment, add_amendment_change, review_amendment.
**Screens:** amendments list per protocol; amendment detail with **change set** (section,
previous→proposed); impact panel (review path + reconsent trigger); status workflow
(`PATCH /amendments/:id/status`); readiness gate (`GET /amendments/:id/readiness`).

## 9. Protocol Deviations & CAPA (C2C-18b) — `/api/protocol-deviations`
**AnA tools:** report_protocol_deviation, add_capa_action, review_deviation.
**Screens:** deviation log (severity/category badges, reportable flag + timeliness clock);
report dialog; **CAPA actions** sub-list with status; close gate (`POST /deviations/:id/close`
— all CAPA verified/completed).

## 10. Protocol Review & Comment (C2C-18c) — `/api/protocol-reviews`
**AnA tools:** assign_protocol_reviewer, add_protocol_review_comment, review_protocol_review_status.
**Screens:** reviewer assignment panel (by role); **threaded comments** with severity +
resolve; disposition controls; **review summary** (`GET /documents/:id/summary`) — consensus +
open blocking comments + decide-readiness.

## 11. Informed Consent Builder (C2C-18d) — `/api/protocol-consent`
**AnA tools:** create_consent_form, update_consent_element, review_consent_completeness.
**Screens:** consent forms list; **element editor** seeded with the 45 CFR 46.116 required
elements (present toggle + content); completeness meter (`GET /forms/:id/completeness`);
approve gate (`POST /forms/:id/approve`).

## 12. Protocol Templates (C2C-20a) — `/api/protocol-templates`
**AnA tools:** create_protocol_template, clone_protocol_template, save_document_as_template,
list_protocol_templates. **Screens:** template library (by kind); template editor (sections);
**Clone → new document** action; **Save current document as template** action from the editor.

## 13. Protocol Milestones / Timeline (C2C-20b) — `/api/protocol-milestones`
**AnA tools:** add_protocol_milestone, set_protocol_milestone_status, review_protocol_timeline.
**Screen:** a **timeline / Gantt-lite** (`GET /documents/:id/timeline`) — milestones ordered by
date with urgency buckets (overdue/due_30/due_90/upcoming) + next-milestone callout; add +
status transition.

## 14. Protocol Export + ClinicalTrials.gov draft (C2C-20c) — `/api/protocol-export`
**AnA tools:** export_protocol_document, generate_ctgov_registration_draft. **Screens:**
**Export preview** (`GET /:id`) — rendered Markdown of the assembled protocol + download
(future: DOCX/PDF); **CT.gov registration draft** (`GET /:id/ctgov-draft`) — PRS data-element
form (titles, study type, phase, primary/secondary outcomes, eligibility) with completeness
findings highlighting what's missing for registration.

## 15. Protocol Schedule of Assessments (C2C-21) — `/api/protocol-soa`
**AnA tools:** add_soa_assessment, set_soa_cell, review_soa_matrix. **Screen:** the **SoA grid**
(`GET /documents/:id/matrix`) — assessments (rows) × visits (columns) with clickable X cells
(`POST /cells`, `POST /cells/clear`); validation banner (empty visits, unscheduled assessments,
screening coverage). This is the visual centerpiece tab inside the Protocol editor (#6).

## 16. Protocol Budget & Feasibility (C2C-22) — `/api/protocol-budget`
**AnA tools:** add_protocol_budget_item, set_protocol_budget_params, review_protocol_budget.
**Screen:** budget builder (`POST /documents/:id/items`) by category; params panel
(`PUT /documents/:id/params` — enrollment, sponsor $/subject, F&A %); **feasibility summary**
(`GET /documents/:id/summary`) — per-subject direct + F&A + total, total study cost, sponsor
revenue, **margin + funded/under_funded verdict** with a clear callout.

---

## Recommended build sequence
1. **Shell integration + cross-cutting components** (GovernedActionDialog, AuditTrailPanel,
   CompletenessGatePanel, status/citation chips) — everything else depends on these.
2. **Protocol editor hub (#6)** with its tabs (#7 risk, #12 templates, #13 milestones,
   #14 export, #15 SoA, #16 budget, #8 amendments, #9 deviations, #10 reviews, #11 consent) —
   one cohesive workspace surfaces the whole protocol-development suite.
3. **Committee governance (#2)** incl. the voting/poll surface (highest novel UX).
4. **Coverage Analysis (#1)** billing grid.
5. **Grant Finder (#3)**, **CITI matrix (#4)**, **Portfolio dashboards (#5)**.

## Verification for the UI build
- Each surface: render from the live API (seed a doc/analysis/committee via the API or AnA),
  exercise the mutation with the GovernedActionDialog, confirm the audit-id returns and the
  governed action appears in the audit panel.
- Run the `accessibility-enforcement`, `design-review`, and `regulatory-compliance-ux` skills
  against each surface before sign-off.
- Gated actions must visibly block (409 + findings) until preconditions are met.

## Honesty boundary
These modules **advise**; they are not legal/billing/registration guarantees. The UI must
carry the advisory disclaimers the APIs return (esp. Coverage Analysis #1 and CT.gov draft #14),
and the deterministic engine's output is the source of truth — AI text is advisory only.
