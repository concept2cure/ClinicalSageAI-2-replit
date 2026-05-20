# PDEV → IND UI design brief

> Handoff document for **Claude Design** (canonical design-system project, id `7f3ac932-8a8b-4582-8748-5d4c31e8d0ed`).
>
> This brief enumerates every UI surface the merged PDEV → IND backend needs to be usable. The backend is in place — registry, schema, services, routes, AnA commands, audit, and governance — and is documented in `PDEV_IND_WORKFLOW_AUDIT.md`. This document describes the UI that needs to be designed and shipped to operationalize that backend through the conversational, regulated-workflow surface promised in the CIRM brief.
>
> Read `design-system/CLAUDE.md`, `design-system/HANDOFF.md`, and `design-system/README.md` before this file.

---

## 0. Phase positioning

| Existing phase | Status | What PDEV needs from it |
|---|---|---|
| Phase 1 — Home screen | shipped | Adds one rail item `pdev` (Domain group). Module-launcher tile and `⌘K` palette entry. |
| Phase 2 — MDX workstream | shipped | Reference for the 3-column shell + AnA dock pattern PDEV will reuse 1:1. |
| Phase 3 — Projects (list + detail) | shipped | PDEV programs are projects with `type='IND'`. Projects detail Activity tab can surface PDEV audit events. |
| **Phase 7 — PDEV workstream** (new) | **this brief** | All PDEV-specific surfaces (this document). |
| Phase 4 — Artifact workbench | in design | Co-author surface for PDEV-generated artifacts. AI drafts produced by `pdev.activity.ai_draft` deep-link into it. |
| Phase 5 — Auth | in design | No PDEV-specific changes; PDEV reuses tenant/role context. |
| Phase 6 — Admin | in design | One PDEV-specific control: `anaToolPolicy` allow / deny list for the 20 PDEV commands. |

**Recommended phase number for PDEV: 7.** It depends on Phase 1 (rail slot), benefits from Phase 2 (shell pattern), and is parallel-shippable with Phase 4 (artifact workbench).

---

## 1. Information architecture

### 1.1 Where PDEV lives in the rail

Phase 1's home rail has 15 items grouped 2/4/5/4 (Domain / Work / Intelligence / System). PDEV is a **Domain** item — it represents a regulatory domain alongside `mdx` and `biopharma`.

Proposed rail update (Phase 7 ships this):

```
Domain:        mdx, biopharma, pdev          ← new
Work:          projects, vault, tasking, submission
Intelligence:  protocol, cmc, biostat, quality, reporting
System:        ana_memory, artifacts, audit, admin
```

> **Designer decision needed:** does PDEV become its own Domain item, or does it nest inside `biopharma` as a sub-drawer item? Recommendation: standalone Domain item, because PDEV's workflow spans CMC + Nonclinical + Clinical + Regulatory (it's cross-cutting). Nesting under one of those would mis-categorize.

### 1.2 PDEV's internal sub-navigation

When PDEV is selected from the rail, the sub-drawer reveals the workstream-level navigation, mirroring the MDX pattern:

```
Workstream:    overview, cmc, nonclinical, clinical, regulatory
Workspace:     ind_assembly, contradictions, fda_interactions
System:        back_to_modules
```

8 items × 1 back-link. Exact strings and ids in §6.1.

### 1.3 URL structure

Deep-linkable. Recommended pattern (matches existing kit URLs):

```
/pdev                                            Overview
/pdev/programs                                   Program list
/pdev/programs/:programId                        Program dashboard
/pdev/programs/:programId/workstreams/:ws        Workstream drill-down
/pdev/programs/:programId/activities/:key        Activity detail
/pdev/programs/:programId/ind-assembly           IND assembly view
/pdev/programs/:programId/fda-interactions       FDA interaction stream
/pdev/programs/:programId/contradictions         Contradiction registry
/pdev/programs/:programId/workflow/:runId        Approval chain detail
```

---

## 2. Surface inventory

Each surface includes: purpose, layout, data source (route + AnA command), states, interactions, copy.

### 2.1 Program dashboard (`/pdev/programs/:programId`)

**Purpose.** Single-screen answer to "where does this IND program stand?" Mandatory for every regulated user opening the program.

**Layout.** 3-column shell (mirrors MDX). Left rail + main + AnA dock.

Main column, top to bottom:

1. **Program head** (sticky). Product name (24px serif optional, otherwise body+1), indication, programType pill, agency pill, status pill, target IND submission date with days-remaining indicator, gear (open program config — Phase 3 already designed).
2. **Overall readiness card.** One 0–100 number (large) + one-line summary + last-snapshot timestamp + "Snapshot now" CTA that triggers `pdev.readiness.snapshot`. Reads from `GET /api/pdev/programs/:id/readiness`.
3. **4-workstream rollup strip.** 2×2 grid. Each card: workstream name, completed/total activities mini-bar, blocking-resolved/blocking-total mini-bar, readiness score, "View workstream →" link to drill-down. Card row click navigates to `/pdev/programs/:id/workstreams/:ws`.
4. **Top blockers list.** Up to 5 findings from `readiness.findings` filtered to `kind in (blocker, missing_evidence, overdue_review)`. Each row: severity dot · activity title · short message · owner initials · "Open activity →" link.
5. **IND assembly mini-summary.** 5 module dots (M1–M5), each green/amber/red against `report.modules[].moduleReadiness`. Click → IND assembly view.
6. **Recent FDA interactions.** Last 3 items from `pdev.program.fda_interactions`. Each row: kind chip · title · when · "Open stream →" link.
7. **Recent activity audit feed.** Last 10 audit events for the program. One-line each. "Open audit →" link to Phase 3 Activity tab.

AnA dock (right column) is the standard AnA pane with one PDEV-specific addition: the context block pins `{ programId, productName, currentReadinessScore, topBlocker }`.

**Data sources.**
- `GET /api/pdev/programs/:programId` (orchestrator unified view — header + activities)
- `GET /api/pdev/programs/:programId/readiness` (overall + findings)
- `GET /api/pdev/programs/:programId/ind-assembly` (mini summary)
- `GET /api/pdev/programs/:programId/fda-interactions` (recent 3)
- `POST /api/pdev/programs/:programId/readiness/snapshot` (Snapshot now CTA)

**States.**
- Empty (no activities have any state yet): show one-screen onboarding suggesting `pdev.activity.ai_draft` for `regulatory.strategy_memo`.
- Loading: skeleton cards with the structure of populated state.
- Error: per-card error chip, never a whole-page error.

**Copy.**
- Greeting: "PDEV overview"
- Readiness card large number prefix: "Overall readiness"
- Snapshot button: "Snapshot readiness"
- Workstream cards titles: exact case from registry — `CMC`, `Nonclinical`, `Clinical`, `Regulatory`.
- Empty state title: "No PDEV activity yet."
- Empty state subtitle: "Use AnA or the activity grid to start a draft, attach evidence, or open an INTERACT request."

### 2.2 Workstream drill-down (`/pdev/programs/:programId/workstreams/:ws`)

**Purpose.** Per-workstream owner view. CMC lead opens `cmc`, clinical lead opens `clinical`.

**Layout.** 3-column shell. Main is two sections:

1. **Stage strip.** 5 stage nodes left-to-right: `early_pdev → late_pdev → pre_ind_meeting → ind_package → post_ind`. Same `done / active / idle / blocked` states as Phase 2 MDX stage strip. Reads from the rollup of activities in each stage.
2. **Activity grid / list.** Toggleable view (grid default ≤ 12, list otherwise — same toggle pattern as MDX Phase 2 refinement). One card / row per activity in this workstream. Each shows:
   - Activity title
   - Current state pill (14 states, color-coded per §5)
   - Required documents count
   - Owner initials (or "Unassigned" pill)
   - Days to due / overdue
   - Dependency chain mini-graph (small icon revealing dep status)
   - Quick actions menu: state change, AI draft, evidence attach, kickoff approval

Filter chips above the grid: state, owner, due window, has-deps-blocking.

**Data sources.**
- `GET /api/pdev/programs/:programId/workstreams/:workstream` — rollup + activities array
- `POST /api/pdev/programs/:programId/activities/:key/state` — state change (with `force` confirmation dialog)
- `POST /api/pdev/programs/:programId/activities/:key/workflow/kickoff` — kickoff approval
- AnA commands route every action

**Copy.**
- Page title: sentence case workstream name + "workstream"
- Stage strip labels: "Early PDEV", "Late PDEV", "Pre-IND meeting", "IND package", "Post-IND"
- State pills (14 — see §5)
- Empty state: "Nothing in [workstream] yet." with a CTA suggesting `pdev.activity.ai_draft` for the first activity in `early_pdev`.

### 2.3 Activity detail panel

**Purpose.** Single activity's full record. Owner deep-dive surface.

**Layout.** Right sheet (480px) when launched from a grid row; full page at `/pdev/programs/:id/activities/:key`. Tabs across the top:

1. **State** — current state, history (state changes from audit), dependency graph (visual), due date, owner, reviewer, change-state CTA (governed mutation → reason confirm dialog).
2. **Documents** — required documents from the registry, with present/missing status. Each row: code · title · eCTD destination · mandatoryForInd badge · attached artifact (if any) · "Generate draft" CTA → opens AI drafting workbench (§2.5).
3. **Evidence** — list of attached evidence_objects. Each row: title · type · category · source · linkType · strength · "Detach" governed action. Attach button → evidence picker (§2.6).
4. **Workflow** — current approval chain status. Each checkpoint as a row: step name · status pill · required approver roles · approval records list · approve/reject button (gated by role).
5. **Provenance** — full provenance trace tree (see §2.8).
6. **Audit** — chronological audit_logs scoped to this activity's state row. Same shape as Phase 3 Activity tab.

**Data sources.**
- `GET /api/pdev/programs/:programId/activities/:key/evidence` — Evidence tab
- `GET /api/pdev/programs/:programId/activities/:key/workflow` — Workflow tab
- `GET /api/pdev/programs/:programId/activities/:key/provenance` — Provenance tab
- `POST /api/pdev/programs/:programId/activities/:key/state` — change state
- `POST /api/pdev/programs/:programId/activities/:key/ai-draft` — generate draft
- `POST /api/pdev/programs/:programId/activities/:key/evidence` — attach
- `DELETE /api/pdev/programs/:programId/activities/:key/evidence/:evidenceId` — detach
- `POST /api/pdev/programs/:programId/activities/:key/workflow/kickoff` — kickoff
- AnA dock context pins this activity.

### 2.4 IND assembly view (`/pdev/programs/:programId/ind-assembly`)

**Purpose.** Module-by-module readiness for IND submission. The "are we ready?" answer.

**Honest label** (per backend): this view is **IND assembly readiness**, not eCTD publishing. The Compile CTA invokes the existing eCTD pipeline once threshold is met.

**Layout.** 5 module columns (M1, M2, M3, M4, M5), each a card with:
- Module readiness bar + percentage
- Mandatory documents present / total mandatory
- Total documents present / total
- List of mandatory blockers (max 5 visible, "+N more" link)
- "Open module" link to see all documents in this module

Below the 5 columns: **Compile CTA** (the most consequential PDEV verb).
- Disabled (with reason) when overall readiness < threshold.
- Button text: "Compile IND assembly (readiness {N}%)".
- Click opens a confirmation dialog requiring a reason ≥ 30 chars.
- On submit: calls `POST /api/pdev/programs/:id/ind-assembly/compile`.
- On success: shows the resulting package metadata + a "Download" link.
- On 409 (refused_low_readiness): inline error with blocker list and a "Force compile" link that re-opens the dialog with the force checkbox visible (audit-flagged override).

**Data sources.**
- `GET /api/pdev/programs/:programId/ind-assembly`
- `POST /api/pdev/programs/:programId/ind-assembly/compile`

**Copy.**
- Page title: "IND assembly readiness"
- Subtitle: "Readiness view only. eCTD publishing runs through the existing assembly pipeline once mandatory documents are in place."

### 2.5 AI drafting workbench

**Purpose.** Generate a governed AI draft for one PDEV activity.

**Layout.** Modal / right sheet. Two-pane:
- Left: prompt + context (activity title, target document code, eCTD destination, registry description, optional user-prompt textarea, evidence-object picker).
- Right: streaming generated draft preview. Once complete: title, section list, citations, quality grade (A/B/C/rejected).

Footer: "Accept and file as draft" (governed action — confirm + reason) vs "Discard". Accepting writes to `concept2cure_artifacts` and moves the activity state to `ai_draft_generated`.

**Data sources.**
- `POST /api/pdev/programs/:programId/activities/:key/ai-draft`
- Evidence picker reads from existing evidence endpoints.

**Copy.**
- Sheet title: "Draft {document title} for {product name}"
- Quality grade label: "Quality gate: {grade}"
- Accept button: "File draft and advance activity"

### 2.6 Evidence attach picker

**Purpose.** Attach an evidence_object to a PDEV activity.

**Layout.** Right sheet (440px). Searchable list of evidence_objects scoped to the program (by `evidenceObjects.programId`). Each row: title · type · category · source. Click → expansion with: linkType selector (supports / contradicts / references / supersedes), strength (strong / moderate / weak), rationale textarea. Attach button → governed action with reason.

**Data sources.**
- Existing evidence endpoints for search.
- `POST /api/pdev/programs/:programId/activities/:key/evidence`

### 2.7 FDA interaction stream (`/pdev/programs/:programId/fda-interactions`)

**Purpose.** Single chronological view of every FDA touchpoint for the program.

**Layout.** Single timeline / table. Each row:
- Date / time
- Kind chip (`q_submission`, `q_sub_meeting`, `q_sub_question`, `q_sub_commitment`, `q_sub_timeline`, `fda_communication`)
- Title
- Summary
- Status (open / responded / closed for fda_communications; rolled-in / pending for commitments)
- "Open in Q-Sub" deep link (when applicable — uses existing Q-Sub surface)

Filter bar: kind, date range, status. Default sort: newest first.

**Footer panel: Roll up FDA feedback into PDEV activities** (collapsible card).
- Lists unrolled `q_sub_commitments` for the program.
- For each: commitment text · blocker badge (when `blocker=true`) · proposed PDEV activity match (with confidence %) · 3 alternatives in a dropdown · "Apply rollup" governed action.
- "Apply all proposed" bulk action — opens a confirmation dialog listing every mapping.

**Data sources.**
- `GET /api/pdev/programs/:programId/fda-interactions`
- `GET /api/pdev/programs/:programId/fda-feedback/proposals`
- `POST /api/pdev/programs/:programId/fda-feedback/apply`

### 2.8 Contradiction registry (`/pdev/programs/:programId/contradictions`)

**Purpose.** Cross-artifact inconsistencies surfaced by the existing contradiction engine, scoped to the program.

**Layout.** Two-pane:
- Left: list of contradictions. Each row: severity dot · type label · object A label · "vs" · object B label · authorityState chip · reviewState chip · createdAt.
- Right: detail panel for the selected contradiction. Shows full description, consequence path, regulatory body, AI explanation if any, and CTAs:
  - "Open object A" / "Open object B" deep links into the relevant workbench.
  - "Transition review state" governed action.
  - "Execute consequence" governed action (only when the contradiction has a consequence path defined).

Filter bar: severity, authorityState, reviewState, contradictionType.

**Data sources.**
- `GET /api/pdev/programs/:programId/contradictions`
- Existing contradiction-engine routes for transitions / consequences.

### 2.9 Provenance trace view

**Purpose.** Single regulated audit view of one activity's full traceability chain.

**Layout.** Tab inside Activity detail (§2.3), or standalone page when accessed via deep link.

Six sections, top to bottom:

1. **Header** — activityTitle, workstream, stage, currentState, ownerUserId, reviewerUserId.
2. **Artifacts** — table of `concept2cure_artifacts` whose provenance pins this activity. Columns: title · type · status · version · ctdSection · contentHash · citationCount · createdAt.
3. **Evidence** — table of attached evidence_objects (same shape as Activity / Evidence tab but shown here as a static read view).
4. **Lineage** — table of data_lineage_records. Columns: sourceObjectType · sourceTitle · linkageType · transformationType · confidenceScore · aiModelUsed · createdAt.
5. **Audit events** — chronological audit_logs for the activity state row.
6. **Counts banner** — 4 large numbers (artifacts, evidence, lineageEdges, auditEvents).

Export button: "Export as PDF" (regulated traceability report).

**Data source.**
- `GET /api/pdev/programs/:programId/activities/:key/provenance`

### 2.10 Approval chain detail

**Purpose.** Reviewer / approver action surface. Where a regulatory lead approves or rejects a checkpoint.

**Layout.** Right sheet from any "workflow status" affordance. Top: chain summary (workflowType, programId, activityKey, targetState, workflowStatus). Below: list of checkpoints in stepIndex order. Each:
- Step number + name
- Status pill (`proposed / awaiting_review / approved / failed / executed / skipped`)
- Required approver roles
- Approvals received (avatar list)
- For the currently `awaiting_review` checkpoint: Approve button + Reject button. Both governed (confirm + reason ≥ 10 chars).

When the chain completes, footer shows: "Activity advanced to {targetState}".

**Data source.**
- `GET /api/pdev/programs/:programId/activities/:key/workflow`
- `POST /api/pdev/workflow-runs/:runId/checkpoints/:cpId/decision`

### 2.11 AnA dock — PDEV-aware context

**Purpose.** AnA can drive every PDEV action through natural conversation (the CIRM brief promise).

**Layout.** Same dock as Phases 1 / 2 / 3 / 4. Two PDEV-specific additions:

1. **Context block** — when the user is on a `/pdev/...` URL, the dock's context pin shows: program name, current activity (if drill-down), readiness score, top blocker. This is data only; the visual treatment is the existing dock context pattern.
2. **Suggestion chips** — when the dock is collapsed and a high-priority signal exists for the current PDEV view, surface 1-3 chip prompts pulled from the activity registry. Example: on Activity detail with state=`not_started`, suggestions are "Draft this activity", "Attach evidence", "What does the registry say about this activity?"

Slash-command palette inside the dock: `/pdev` opens a list of the 20 PDEV commands, each with example utterance from `PDEV_COMMAND_METADATA`.

**No new data sources** — the existing AnA chat surface already exposes the 20 PDEV commands through the LLM tool-use pipeline.

### 2.12 Reason-for-change confirmation dialog

**Purpose.** Required UI gate on every governed mutation. Mandated by the `regulatory-compliance-ux` skill.

**Layout.** Modal centered. Title states the action. Body shows the resource being mutated (program / activity / artifact). Required fields: reason (minimum chars varies per action — see backend), confirm explicit (`yes` typed for typical actions; `yes-transmit` typed for `ind_assembly.compile` and the 30-char floor). Cancel + Confirm buttons.

On confirm: dispatch the route call, show a toast on success, capture the audit-pass result in the audit feed.

Used by: every governed action across §2.1–2.11.

### 2.13 New PDEV program wizard

**Purpose.** Create a new `regulatoryPrograms` row scoped to PDEV / IND.

**Layout.** Existing `NewProjectDialog` pattern from Phase 3 Projects kit, with PDEV-specific defaults: programType=`IND`, suggested phases preset, suggested first activities (`regulatory.strategy_memo`, `cmc.development_plan`, `nonclinical.development_plan`, `clinical.development_plan`) pre-created in `not_started`.

**Data source.**
- Existing `POST /api/regulatory-programs` route (already shipped — backend, no new wiring needed).

---

## 3. Closed-enum data contracts

These are the canonical enums the kit's `data.jsx` must mirror. Port verbatim; do not invent.

### 3.1 PDEV workstreams

```js
export const PDEV_WORKSTREAMS = ['cmc', 'nonclinical', 'clinical', 'regulatory'];

export const PDEV_WORKSTREAM_LABELS = {
  cmc: 'CMC',
  nonclinical: 'Nonclinical',
  clinical: 'Clinical',
  regulatory: 'Regulatory',
};
```

### 3.2 PDEV stages

```js
export const PDEV_STAGES = [
  'early_pdev',
  'late_pdev',
  'pre_ind_meeting',
  'ind_package',
  'post_ind',
];

export const PDEV_STAGE_LABELS = {
  early_pdev: 'Early PDEV',
  late_pdev: 'Late PDEV',
  pre_ind_meeting: 'Pre-IND meeting',
  ind_package: 'IND package',
  post_ind: 'Post-IND',
};
```

### 3.3 Activity lifecycle states (14 — used by pills)

```js
export const PDEV_ACTIVITY_STATES = [
  'not_started',
  'drafting',
  'ai_draft_generated',
  'evidence_linked',
  'human_review_required',
  'in_review',
  'changes_requested',
  'approved',
  'locked',
  'submission_ready',
  'submitted',
  'agency_feedback_received',
  'revision_required',
  'superseded',
];

// Three buckets for pill color treatment:
export const PDEV_COMPLETED_STATES = ['approved', 'locked', 'submission_ready', 'submitted'];
export const PDEV_BLOCKED_STATES = ['revision_required'];
export const PDEV_IN_FLIGHT_STATES = [
  'drafting', 'ai_draft_generated', 'evidence_linked',
  'human_review_required', 'in_review', 'changes_requested',
  'agency_feedback_received',
];
// remainder ('not_started', 'superseded') = neutral
```

### 3.4 Activity registry (52 activities)

Full source: `server/services/pdev/pdev-activity-registry.ts`. The kit should fetch the list at runtime from `GET /api/pdev/registry`; do not hard-code 52 rows into `data.jsx`. The fetch returns `{ activities, workstreams, stages, states }`.

The kit may hard-code the **workstream / stage labels** and the **state colour map**, but the activities themselves are the canonical registry.

### 3.5 eCTD module destinations

```js
export const ECTD_MODULES = ['m1', 'm2', 'm3', 'm4', 'm5'];
export const ECTD_MODULE_LABELS = {
  m1: 'Module 1', m2: 'Module 2', m3: 'Module 3', m4: 'Module 4', m5: 'Module 5',
};
```

### 3.6 Contradiction severity / authorityState / reviewState

```js
export const CONTRADICTION_SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const CONTRADICTION_AUTHORITY_STATES = [
  'advisory_only',
  'requires_review',
  'requires_approval',
  'blocks_promotion',
  'requires_escalation',
];
export const CONTRADICTION_REVIEW_STATES = [
  'unresolved',
  'under_review',
  'reviewed',
  'approved_resolution',
  'superseded',
];
```

### 3.7 Approval-chain status enums

```js
export const WORKFLOW_RUN_STATUSES = [
  'pending', 'running', 'paused', 'awaiting_approval',
  'completed', 'failed', 'cancelled',
];
export const APPROVAL_CHECKPOINT_STATUSES = [
  'proposed', 'awaiting_review', 'approved', 'executed', 'failed', 'skipped',
];
```

### 3.8 The 20 AnA commands (chip text)

Use exact metadata strings from `PDEV_COMMAND_METADATA` (in `server/services/ana-ri/pdev-command-handlers.ts`). The slash-menu chips render `metadata.example` strings verbatim.

---

## 4. Component naming convention

Every PDEV component class is prefixed `pdev-` (same convention as `prj-`, `pact-`, `mdx-`). Examples:

```
.pdev-shell, .pdev-rail, .pdev-main, .pdev-ana
.pdev-overview, .pdev-workstream-strip, .pdev-workstream-card
.pdev-activity-row, .pdev-activity-state-pill
.pdev-stage-strip, .pdev-stage-node
.pdev-assembly-grid, .pdev-assembly-module
.pdev-fda-stream, .pdev-fda-row
.pdev-contradiction-table, .pdev-contradiction-detail
.pdev-provenance-section, .pdev-provenance-table
.pdev-workflow-chain, .pdev-workflow-step
.pdev-ai-draft-sheet, .pdev-evidence-picker
.pdev-confirm-dialog
```

JSX file organization (mirrors `ui_kits/home/`):

```
ui_kits/pdev/
├── index.html
├── App.jsx
├── Shell.jsx
├── Surfaces.jsx          ← Overview, Workstream, Assembly, FDA Stream, Contradictions
├── ActivityDetail.jsx    ← all activity-detail tabs
├── Workflows.jsx         ← approval chain detail + decision UI
├── AiDraft.jsx           ← AI drafting workbench + provenance trace
├── Evidence.jsx          ← evidence picker
├── Confirm.jsx           ← reason-for-change dialog (also exported for other kits)
├── data.jsx              ← closed enums + suggestion text
├── Icons.jsx
└── styles.css
```

---

## 5. Visual treatment — state pills

The 14-state lifecycle drives a recurring chip across multiple surfaces. Treatment:

| State | Tone | Token (background / text) |
|---|---|---|
| not_started | neutral | `--bg-200` / `--text-400` |
| drafting | neutral-active | `--bg-100` / `--text-200` |
| ai_draft_generated | accent-muted | `--accent-000` / `--accent-100` |
| evidence_linked | accent-muted | `--accent-000` / `--accent-100` |
| human_review_required | warning-muted | `--warning-muted` / `--warning` |
| in_review | warning-muted | `--warning-muted` / `--warning` |
| changes_requested | warning | `--warning` / `--bg-000` |
| approved | success-muted | `--success-muted` / `--success` |
| locked | success | `--success` / `--bg-000` |
| submission_ready | success | `--success` / `--bg-000` |
| submitted | success | `--success` / `--bg-000` |
| agency_feedback_received | warning-muted | `--warning-muted` / `--warning` |
| revision_required | error-muted | `--error-muted` / `--error` |
| superseded | neutral-strikethrough | `--bg-200` / `--text-500` (with strikethrough text-decoration) |

> Claude orange (`--accent-100`) appears on `ai_draft_generated` and `evidence_linked` because those are the two "AnA touched it" states. Use sparingly — one accent focus per screen still applies; pills are exempt from that rule because they're inline metadata.

---

## 6. Exact strings

Every label below is verbatim. Sentence case. No emoji. No exclamation marks.

### 6.1 PDEV rail items (NAV_ITEMS extension)

```js
export const PDEV_NAV_ITEMS = [
  { group: 'Workstream', id: 'overview',         label: 'Overview',          icon: 'LayoutDashboard' },
  { group: 'Workstream', id: 'cmc',              label: 'CMC',               icon: 'Beaker' },
  { group: 'Workstream', id: 'nonclinical',      label: 'Nonclinical',       icon: 'Microscope' },
  { group: 'Workstream', id: 'clinical',         label: 'Clinical',          icon: 'Stethoscope' },
  { group: 'Workstream', id: 'regulatory',       label: 'Regulatory',        icon: 'FileCheck' },
  { group: 'Workspace',  id: 'ind_assembly',     label: 'IND assembly',      icon: 'Package' },
  { group: 'Workspace',  id: 'contradictions',   label: 'Contradictions',    icon: 'AlertTriangle' },
  { group: 'Workspace',  id: 'fda_interactions', label: 'FDA interactions',  icon: 'MessageSquare' },
  { group: 'System',     id: 'back',             label: 'Back to all modules', icon: 'ChevronLeft' },
];
```

### 6.2 Suggestion chips per nav state

Used by the AnA dock when collapsed in each view (`MDX_SUGGESTIONS` precedent).

```js
export const PDEV_SUGGESTIONS = {
  overview: [
    'What is blocking IND for this program?',
    'Snapshot readiness now',
    'Show me the critical contradictions',
  ],
  cmc: [
    'What is the CMC status?',
    'Draft cmc.formulation_development',
    'Show overdue CMC activities',
  ],
  nonclinical: [
    'What is the nonclinical status?',
    'Draft my GLP toxicology summary into Module 4',
    'What evidence is attached to nonclinical.glp_tox?',
  ],
  clinical: [
    'What is the clinical status?',
    'Show me protocol risk assessment progress',
    'Roll up FDA commitments into clinical activities',
  ],
  regulatory: [
    'What is the regulatory status?',
    'Walk me through every FDA interaction',
    'Compile the IND assembly readiness',
  ],
  ind_assembly: [
    'How ready is each module for IND?',
    'Compile the IND eCTD assembly',
    'What documents are missing from Module 3?',
  ],
  contradictions: [
    'Show me critical contradictions',
    'What needs reviewer escalation?',
    'Which contradictions block promotion?',
  ],
  fda_interactions: [
    'What FDA commitments need to be rolled into PDEV?',
    'Show all Pre-IND interactions',
    'Which FDA questions are still awaiting response?',
  ],
};
```

---

## 7. Non-negotiables (re-stated from `CLAUDE.md`)

- **Sentence case everywhere.** Never Title Case. Never ALL CAPS except 10px metadata labels.
- **No emoji. No exclamation marks. No cheerleading.**
- **Body = 13px.** Max title = 18–24px.
- **Claude orange (`#d97757`) is the only strong color** — used sparingly; one focal point per screen except for the inline state pills.
- **200ms ease-out motion.** No bounce, no spring, no overshoot.
- **Lucide icons only.**
- **Second person, direct.** "You", never "we".
- **Numbers over adjectives.**
- **Tokens from `colors_and_type.css` only.** No hard-coded hex / font-family / spacing.

---

## 8. Acceptance checklist (per phase ship)

**Token surface (every phase):**
- [ ] `colors_and_type.css` imported once at the app root, before any component CSS.
- [ ] `--accent-100` resolves to `#d97757`, `--bg-000` to `#faf9f5` in DevTools.
- [ ] No hex codes, font-families, or magic spacing values hard-coded in any PDEV component.

**Phase 7.1 — Overview + workstream surfaces:**
- [ ] All 4 workstream cards render correctly with mini-bars.
- [ ] Stage strip shows correct active / done / blocked nodes per workstream.
- [ ] Activity grid / list toggle persists in localStorage as `pdev.viewMode`.
- [ ] State pills use the 14-state colour map from §5.
- [ ] AnA dock context block pins program + activity context on every PDEV URL.
- [ ] Suggestion chips swap when nav changes (verify all 8 surfaces).

**Phase 7.2 — Activity detail + governed mutations:**
- [ ] All 6 activity tabs render in order: State · Documents · Evidence · Workflow · Provenance · Audit.
- [ ] Every governed action triggers the reason-for-change confirmation dialog.
- [ ] Confirmation dialog requires the typed `yes` (or `yes-transmit` for compile) plus reason ≥ minimum chars per action.
- [ ] State change refuses promotion to a completed state when dependencies aren't satisfied, and offers the force-with-reason override path (audit-flagged).
- [ ] AI drafting workbench shows quality grade + citations and the Accept CTA writes the artifact via `/api/pdev/.../ai-draft`.

**Phase 7.3 — IND assembly + FDA + contradictions:**
- [ ] IND assembly 5-module grid uses `grid-template-columns: repeat(5, 1fr)` regardless of container width.
- [ ] Compile CTA disabled with reason when readiness < threshold; Force option requires a reason ≥ 30 chars.
- [ ] FDA interaction stream renders all 6 kinds with the correct chip colours.
- [ ] FDA feedback roll-up shows the proposed match confidence and exposes the 3 alternatives.
- [ ] Contradiction registry filter chips work as multi-select with count badges.

**Phase 7.4 — Workflow / approval chain:**
- [ ] Approval chain detail surface renders every checkpoint in stepIndex order.
- [ ] Approve / Reject buttons gated on role (read from JWT claims).
- [ ] Approval records list shows approver name / role / decided-at / comment.
- [ ] On rejection, activity moves to `revision_required` and the failure reason is captured in the audit feed.

**Cleanup:**
- [ ] Sentence case everywhere. No emoji. No exclamation marks. 13px body. 200ms ease-out. Lucide icons only.
- [ ] No legacy PDEV surfaces remain in `client/src/concept2cure/` after the phase ships.

---

## 9. Open questions for the designer

Items the backend doesn't decide. Each needs a designer call before the kit lands.

1. **Rail position.** Domain-tier standalone (`mdx, biopharma, pdev`) or nested in `biopharma`? Recommendation: standalone (§1.1).
2. **Workstream view default.** Grid or list at first load? Threshold for auto-switch? Recommendation: grid ≤ 12 activities (matches MDX Phase 2 refinement).
3. **Provenance trace export.** Inline PDF render in the browser, or backend job that returns a download link? The PDF export is a future endpoint — backend can ship it when the design lands.
4. **Approval chain configuration.** Today the default chain is hard-coded 2 steps (reviewer + approver). UI should be read-only at first; tenant-admin configuration of chains is a Phase 6 (Admin) concern.
5. **Reason-for-change minimum length.** Per-action floor varies (10 for most, 30 for `ind_assembly.compile`). Should the dialog show the live char count + minimum? Recommendation: yes.
6. **AnA suggestion ranking.** Three chips per view feels right; if more than three apply, how do we choose? Recommendation: source of truth is the metadata `example` strings in registry order, capped at 3.
7. **State pill colour for `superseded`.** Strikethrough is non-standard in the kit. Verify against `colors_and_type.css` whether the design system has a token for it; if not, drop the strikethrough and use neutral muted (§5).
8. **Empty state on Overview.** Recommendation onboarding suggests one specific activity (`regulatory.strategy_memo`). Verify with the regulatory advisor that's the right first activity to surface, or pick a different one.

---

## 10. Build sequence (phasing within Phase 7)

In dependency order:

1. **7.0 — Rail + sub-nav + Overview.** The skeleton. Reads from `/api/pdev/registry` + `/api/pdev/programs/:id` + readiness. No mutations.
2. **7.1 — Workstream drill-down + Activity detail (read tabs).** State · Documents · Audit only. Still no mutations.
3. **7.2 — Reason-for-change confirmation dialog.** Reusable component shipped before any governed action.
4. **7.3 — Activity governed mutations.** State change, evidence attach/detach, AI drafting workbench. Each uses 7.2.
5. **7.4 — IND assembly + Compile.** Module grid, compile CTA, force-override path.
6. **7.5 — FDA interactions + feedback roll-up.** Stream view + propose / apply.
7. **7.6 — Contradictions registry.** Two-pane filter + detail.
8. **7.7 — Workflow / approval chain detail.** Kickoff + per-checkpoint decision.
9. **7.8 — Provenance trace.** Activity detail Provenance tab + standalone deep-link.
10. **7.9 — New program wizard.** Extends Phase 3 NewProjectDialog.

Each step is independently shippable.

---

## 11. Files this brief lives alongside

- `PDEV_IND_WORKFLOW_AUDIT.md` — backend architecture finding (the why).
- `server/services/pdev/pdev-activity-registry.ts` — canonical activity registry (the closed enum the UI mirrors).
- `server/services/ana-ri/pdev-command-handlers.ts` — the 20 AnA commands the dock surfaces.
- `server/routes/pdev/pdev-routes.ts` — the 14 routes the UI calls.

When the kit lands, this brief's `Acceptance checklist` (§8) is the contract to verify against.
