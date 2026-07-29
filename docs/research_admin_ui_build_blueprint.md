# Research Administration — UI Build Blueprint

The backend for research compliance + sponsored programs is complete, governed,
and DB-verified (`scripts/db-verify/verify-research-compliance.ts` — 82/82). **No
UI was built, by directive.** This is the blueprint for the follow-on session to
build the surfaces. It is deliberately scannable: one section per surface, each
with its data sources (REST + Report-OS + AnA tools), key states, and the
regulatory-UX requirements that are non-negotiable.

Detailed per-capability backend notes live in `research_compliance_grants_handoff.md`.

---

## Cross-cutting requirements (apply to EVERY surface)

These are enforced by the backend; the UI must surface them, not re-implement them.

- **Governed mutations (21 CFR Part 11).** Every create/update/transition/sign goes
  through one audited path. The UI must (a) capture a **reason for change** (≥ 8 chars)
  on every mutation, (b) for `command: 'sign'` actions (effort certify, closeout
  finalize, subaward execute, NCE approve) present an **e-signature confirmation**
  (re-auth + intent), (c) render the returned governed-action receipt (id + hash).
- **Deterministic gates are the floor.** When a gated action is rejected (effort
  over-commit, closeout finalize with outstanding items, subaward execute without a
  clean screen, budget over-allocation, grantee self-approval of a sponsor-required
  NCE), show the returned blocker list verbatim — never let the UI "force" past it.
- **Audit visibility.** Every record needs a history/audit view (the hash-chained
  `audit_logs` / `c2c_ana_actions`). Surface "last verified" + who/when/why.
- **Truthfulness.** Reports may be partial; show blockers and never render a "final"
  state when critical inputs are missing (the report types already carry
  `truthfulnessRules`).
- **Accessibility (WCAG 2.2 AA) + calm motion + reviewer-grade microcopy** per the
  project skills.

---

## 1. Research Administration Scorecard (landing / exec dashboard)
**Purpose:** "What needs my attention across the whole footprint?" — the home surface.
- **Data:** Report `research_admin.scorecard` (severity counts, by-domain rollup,
  ranked top items) · AnA `research_compliance_briefing` (live list) · AnA
  `triage_compliance_attention` (dispatch criticals → central tasks).
- **States:** all-clear · has-criticals (red band) · per-domain drill-down.
- **Actions:** "Triage to tasks" (governed; shows created vs already-tracked). Each
  item deep-links to its domain surface.

## 2. Grants — Pre-award pipeline
**Purpose:** discover NOFOs → build proposals.
- **Data:** `GET/POST /api/grants/opportunities` · `/proposals` (+ `/:id/status`) ·
  connector `grants_gov` (search) · AnA `search_grants_gov`, `record_grant_opportunity`,
  `create_grant_proposal`.
- **UI:** Kanban by status (opportunity → proposal draft → submitted → awarded). A
  "Import from Grants.gov" action (search → record_grant_opportunity with `external_id`).
- **States:** deadline-urgency band (overdue/30/90/later) from the deadline logic.

## 3. Grants — Award detail (the big one)
**Purpose:** run the full post-award lifecycle for one award.
- **Tabs & data:**
  - **Overview / reporting:** `GET /api/grants/awards/:id/reporting` (period state +
    2 CFR 200.344 obligations). AnA `review_grant_reporting`.
  - **Budget vs actual:** `GET /awards/:id/budget`; `POST /awards/:id/budget`
    (over-allocation gated), `/expenditures`. AnA `add_grant_budget_line`,
    `record_grant_expenditure`, `review_grant_budget`. Per-category bars; over-budget red.
  - **Cost share:** `PATCH /awards/:id/cost-share`, `POST .../contributions`,
    `GET .../cost-share`. AnA `record_cost_share_contribution`, `review_cost_share`.
    Met % gauge + shortfall.
  - **Milestones:** `POST /awards/:id/milestones`, `GET /milestones`, `PATCH
    /milestones/:id/status`. AnA `set_grant_milestone_status`. Deadline urgency.
  - **Invoices:** `POST /awards/:id/invoices`, `GET /invoices`, `PATCH
    /invoices/:id/status`. Aging view.
  - **Subawards:** `POST /awards/:id/subawards`, `GET /subawards`, `PATCH
    /subawards/:id/screen`, `POST /subawards/:id/execute` (**e-sign**, eligibility
    gated). AnA `record_subaward`, `screen_subaward`, `execute_subaward`. Screen pairs
    with `screen_restricted_party` (live SAM.gov). Show screen status badge.
  - **No-cost extension:** `POST /awards/:id/nce`, `POST /nce/:id/approve` (**e-sign**,
    grantee-authority gated), `GET /nce`. AnA `request_/approve_no_cost_extension`.
  - **Closeout:** `POST/PATCH/GET /awards/:id/closeout`, `POST .../finalize`
    (**e-sign**, 200.344 gated). AnA `open_/update_/finalize_grant_closeout`. A
    **"Prepare closeout"** panel = AnA `prepare_award_closeout` (one-shot readiness:
    items + milestones + obligations + cost share + budget → readyToClose + blockers).
- **Report:** `grants.portfolio_register` (org-wide rollup incl. closeout/subaward/
  budget/cost-share/NCE).

## 4. Effort certification (2 CFR 200.430)
- **Data:** `/api/effort-certification` CRUD · `/:id/validation` · `/:id/certify`
  (**e-sign**). AnA `create_effort_certification`, `add_effort_line`. Report
  `effort.certification_register`.
- **UI:** statement editor with a **live validation banner** (total ≤ 100%, recert
  flag on > 25% sponsored deviation); certify is blocked while high-risk.

## 5. Research security / COI (NSPM-33 / NOT-OD-26-017)
- **Data:** `/api/research-security` disclosure CRUD · `/:id/review`. AnA
  `create_coi_disclosure`. Report `research_security.coi_register`.
- **UI:** disclosure intake · **foreign-nexus review queue** · manage/conflict panel
  with management plan.

## 6. Committee workspaces — IRB / IACUC / IBC
- **Data:** `/api/irb`, `/api/iacuc`, `/api/ibc` (submissions/protocols/registrations
  + reviews). AnA `create_*` + `add_*` + `review_*` per committee.
- **UI:** per-committee queue → submission/protocol detail with review stages,
  approval (sets expiration; IACUC 3-yr), and the **Module 4/5 provenance** link.
- **Onboarding helper:** AnA `assess_study_onboarding` — one panel that shows
  required approvals + training and **which gap blocks which committee**.

## 7. Personnel roster + training gate ("no index until trained")
- **Data:** `/api/research-compliance` roster CRUD · `/checklist` · `/gate`. AnA
  `add_personnel_training`, `run_compliance_checklist`, `review_training_gate`.
  Report `research_compliance.training_status`.
- **UI:** roster grid with per-person training currency (current/expiring/expired);
  gate verdict banner (blocked → who/what is missing).

## 8. HA interactions & commitments
- **Data:** `/api/ha-interactions`. AnA `create_ha_interaction`,
  `create_regulatory_commitment`, `fulfill_regulatory_commitment`,
  `review_commitment_portfolio`, `review_ha_interaction`. **Meeting prep panel** =
  AnA `prepare_meeting_package` (readiness + open questions + sourced commitments →
  action list). Report `ha.commitment_register`.

## 9. Connectors settings
- **Data:** existing connector catalog UI + the 3 new entries (`grants_gov` free,
  `sam_exclusions` apiKey, `ellucian_banner` baseUrl+apiKey). Setup guides ship in
  the catalog metadata — render them. Add a **"Screen a party"** action
  (`screen_restricted_party`) and a Banner reconciliation view.
- **Note:** these hosts need network egress allowlisting in the environment.

## 10. Preclinical ingestion
- **Data:** `POST /api/preclinical/ingest` (multipart PDF; opt-in `governed=true` +
  `submissionId`). Show `governedStudyId` + CTD section + the provenance chain
  (`ctd_nonclinical_study → nonclinical_study → submission_module4`).

## 11. AnA conversational panel (shared)
Surface the tool set per context; the backend already does intent-based selection
(`selectToolsForTurn`) and exposes per-surface usage telemetry
(`describe_capabilities.execution.surfaceUsage`) — pass the active `surface` in the
chat request's `tool_context` so handlers and telemetry see it. Orchestration tools
(`assess_study_onboarding`, `prepare_award_closeout`, `prepare_meeting_package`,
`research_compliance_briefing`, `triage_compliance_attention`) are the highest-value
to surface as one-click "assistant" actions on the relevant screens.

---

## Build order (suggested)
1. **Scorecard** (1) — immediate exec value, exercises the report + briefing + triage.
2. **Award detail** (3) — the deepest surface; unlocks most of grants.
3. **Roster + gate** (7) and **Committee workspaces** (6) — the compliance core.
4. **Effort** (4) + **COI** (5) — high-volume, e-sign flows.
5. **HA** (8), **Pre-award** (2), **Connectors** (9), **Preclinical** (10).
6. **AnA panel** (11) threaded throughout as the assistant layer.

Every governed action's request/response shape, gate behavior, and report summary
keys are exercised in the DB-verify harness — use it as the contract reference.
