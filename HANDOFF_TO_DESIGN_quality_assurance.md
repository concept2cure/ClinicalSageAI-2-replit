# Handoff to Design — Quality & Assurance module

**Surface id:** `quality`  ·  **Shell:** ui-v2 (`client/src/concept2cure/v2`)  ·  **Module dir:** `client/src/concept2cure/quality`
**Status:** built, wired, GA-tested end-to-end (route + service + PGlite integration + AnA tools + surface render). This document is the data sheet so the UI layer reflects the real wiring — no invented fields, no fabricated states.

---

## 0. How to read this document

Everything below is **already built and functioning** against real data. Your job is to elevate the visual/interaction quality, not to invent structure. Where a section says **(exists)** the component ships today and renders live data; treat those as the baseline to polish. Every data field, enum value, endpoint, and CSS class named here is real — bind to these exactly. The module is **AnA-first**: no surface mutates data directly; every governed action is a prompt handed to AnA, which runs a typed tool (§8). Keep that contract.

---

## 1. Why this exists / what shipped

A two-surface QMS module aligned to **ICH Q10 §3.2.3** (change management), **EU GMP Annex 15** (change control), **21 CFR 820.30/820.70** and **ISO 13485 §7**:

1. **SOP register** — controlled-document control (draft → in_review → effective → superseded → retired), periodic review, read-and-understood training. *(exists — `SopRegister.tsx`)*
2. **Change control** — the change-control log, a lifecycle flowchart, and the links tying every change to its deviations, CAPAs and validation records; plus "how to raise a change" training and the change-control document/form gallery. *(exists — `ChangeControl.tsx` + `ChangeFlow.tsx`)*

The four product requirements it satisfies: ① train employees to raise change requests, ② draft change-control documents/forms, ③ build/monitor/update SOPs, ④ a flowchart for the change-control log linking changes ↔ deviations ↔ CAPAs ↔ validation.

---

## 2. Where it lives (shell integration — do not change these)

- **Registry:** `shared/constants/ui-surface-registry.ui-v2.ts` → id `quality`, label **"Quality & Assurance"**, `navTier: 'project'`, `group: 'quality-cmc'`, `icon: 'shieldCheck'`, `layoutMode: 'quality'`, `apiPrefixes: ['/api/mdx/qms']`, `compliance: [PART11, A11Y, TONE]`.
- **View map:** `client/src/concept2cure/v2/surfaceViews.ts` → `quality: { component: QualityModule, full: true }` (renders full-bleed; keeps the shared AnA rail).
- **Nav reach:** listed in `SEGMENT_MODULES` under **"Review & govern"** for medtech / diagnostics / biotech / pharma; in `NAV_GROUP_OF` as `'both'`; in `NAV_HIDDEN` (reached via module cards + ⌘K + deep link, like `cmc`).
- **Adapter:** `v2/surfaces/QualityModule.tsx` maps ui-v2 `SurfaceViewProps` → module props: `onAsk` → AnA conversation, `onNav` → shell nav.

---

## 3. Layout architecture

The module carries its **own chrome** inside the ui-v2 `.page` (it is `full: true`). Scoped stylesheet: `client/src/concept2cure/quality/app.css` (class prefix `qms-` for the shell/SOP register, `qcc-` for change control). All resets are scoped to `.qms-shell` so they never leak into the host.

```
.qms-shell (flex column, height:100%, bg var(--bg-050), 13px body)
├─ .qms-topbar        48px  — breadcrumb "Quality & Assurance / {tab}" + right-aligned "✦ Ask AnA"
├─ .qms-tabbar        40px  — role="tablist": [ SOP register | Change control ]  (exists)
└─ .qms-page          flex, scroll — .qms-page-inner (max-width 1240px, centered)
     └─ <SopRegister> | <ChangeControl>   (switched by the active tab)
```

The active tab is local state in `App.tsx` (`'sop' | 'change'`, default `'sop'`, `initialTab` prop overridable). Breadcrumb "here" and the "Ask AnA" starter prompt both key off the active tab.

### Responsive
- `.qms-kpis` 4-col → 2-col at ≤960px. `.qms-grid2` (two-column sections) → 1-col at ≤960px.
- `.qcc-flow-track` is `overflow-x:auto` — the flowchart scrolls horizontally rather than wrapping/breaking on narrow viewports. **This is the one horizontal-scroll surface; keep the page body from scrolling sideways.**

---

## 4. Region-by-region specification — Change control surface

`ChangeControl.tsx`. Renders `live ?? fixture` (see §5, §7). Order top-to-bottom:

### 4.1 Header — `.qms-head`
- Eyebrow "Workstream" · H1 "Change control" (serif, 24px) · sub (≤760px) describing ICH Q10 / Annex 15.
- Actions (`.qms-actions`, right): **Health check** (`.qms-btn.ghost`, icon `shieldCheck`) and **Raise change request** (`.qms-btn.primary`, icon `plus`, Claude-orange — the single focal CTA). Both call `onAsk(...)`.

### 4.2 KPI row — `.qms-kpis` (4 × `.qms-kpi`)
| Label | Value | Sub | Tone |
|---|---|---|---|
| Open changes | `summary.open` | `{total} in the log` | — |
| Awaiting approval | `summary.awaitingApproval` | "In impact assessment" / "None…" | warn if >0 |
| In implementation | `summary.inImplementation` | `{awaitingVerification} awaiting verification` | — |
| Overdue | `summary.overdueImplementation` | "Past target date" / "All on schedule" | err if >0 |

Tone maps to `data-tone` (`err` → `#c84a4a`, `warn` → `#c2410c`) on `.qms-kpi .val`.

### 4.3 Lifecycle flowchart — `ChangeFlow.tsx` — **the centerpiece; the highest-value polish target**
A horizontal chain of six nodes = the controlled path; each node shows the **live count** of changes sitting at that stage (the "ongoing maintenance of the change-control log" made visible).

```
[Proposed] → [Under assessment] → [Approved] → [In implementation] → [Verification] → [Closed]
   (n)              (n)               (n)             (n)                  (n)            (n)
        off-ramps beneath:  ● Rejected · n     ● Cancelled · n            "✦ Explain the pipeline"
```

- Each node (`.qcc-node`, a `<button>`): a stage dot (`.qcc-node-dot[data-stage=…]`, warm progression amber→olive→green — proposed `#b6b1a2`, under_assessment `#d6a24a`, approved `#c17d3a`, in_implementation `#b5762e`, verification `#8a8f5a`, closed `#6f8c5a`), the count (18px, tabular), the stage label, and a one-line blurb.
- Arrows between nodes: `.qcc-arrow` (icon `arrowRight`).
- **Interaction:** click a node → filters the log below to that stage (`data-on` highlight + accent border); click again → clears. `data-empty` dims a zero-count node. Keyboard + SR: each node has `aria-pressed` and an `aria-label` = "`{stage}: {n} changes. {blurb}.`".
- Off-ramps (`.qcc-offramp`): Rejected / Cancelled pills, also filter.
- `FLOW_STEPS` (order + labels + blurbs) and the stage→count map (`deriveStageCounts`) live in `changeData.ts` — bind to those, don't hardcode.

**Design opportunity:** this is currently a clean node-chain. It is the module's signature visual — consider progress emphasis (e.g. a subtle connective track showing "flow"), and make the active-filter state unmistakable. Motion must stay calm (§11); no springy node pops.

### 4.4 Change-control log — `.qms-table`
Grid columns (`GRID` const): `Number | Title | Type | Class | Status | Target | Links | actions`.
- **Number** (`.qms-num`, mono) — click toggles the linked-records expansion (`aria-expanded`).
- **Type** → `.qms-tag` (from `CHANGE_TYPE_LABEL`).
- **Class** → `.qcc-class[data-tone]` (minor=ok green, major=warn amber, critical=err red — `CLASSIFICATION_TONE`).
- **Status** → `.qms-pill[data-tone]` (`STATE_TONE`: closed=effective green, in-flight=review amber, rejected=err, cancelled/superseded=muted).
- **Target** → date; if `isImplementationOverdue` (approved/in_implementation past target) render `.qms-overdue` + flag icon.
- **Links** → `.qcc-linkcount` (link icon + count) — also toggles expansion.
- **actions** (`.qms-rowacts`): **Advance** chip (icon `arrowRight`, → `onAsk` next controlled step) and an **Ask AnA** ghost chip (icon `sparkle`).
- Empty filter → `.qms-empty` "No changes at this stage."

### 4.5 Linked-records expansion — `.qcc-detail` (row-level, the ④ requirement)
Appears beneath a change when expanded.
- Header: "Linked records" + **Link a record** link (→ `onAsk`).
- Empty → `.qcc-detail-empty` guidance copy.
- `.qcc-links` grid of `.qcc-link` cards, each: a **typed icon** (`.qcc-link-ico[data-type]` — deviation `#c2410c`, capa `#8a5a1a`, validation `#4a6b3a`; icon per `LINK_TYPE_ICON`), the ref (mono), the label, the **relationship** (`RELATIONSHIP_LABEL`), and a type tag. Click → `onAsk` "open {type} {ref}…".

### 4.6 "How to raise a change" — `.qcc-train` (the ① requirement)
Left cell of `.qms-grid2`. An ordered 5-step list (`.qcc-steps` with `.qcc-step-n` numbered chips) + two actions: **Train me** (primary — AnA quizzes + records training) and **Record team training** (ghost).

### 4.7 Change-control documents & forms — `.qcc-forms` (the ② requirement)
Right cell of `.qms-grid2`. Stack of `.qms-tpl-card` build cards from `CHANGE_FORMS` (change-request form `CC-`, change-control procedure `SOP-CC-`, impact-assessment form `CC-IA-`). Each → `onAsk` "create {label}… open it in the editor/Canvas."

### 4.8 SOP register surface (tab 1) — `SopRegister.tsx` *(exists, unchanged)*
Header + KPIs (Effective / Under review / Review overdue / Training compliance), a **template gallery** (`SOP_TEMPLATES`), the **controlled-document register** table with status-filter chips and row actions (Approve / Revise / Retire / Ask AnA), and a two-up **Periodic review** + **Read-and-understood training** grid. Same `qms-` classes. It is fully AnA-first and already live against `/api/mdx/qms/documents|templates|training`.

---

## 5. State matrix (every surface must honor all four)

| State | Trigger | What renders |
|---|---|---|
| **Loading** | hooks return `data: null` initially | typed fixtures render immediately (no spinner-only screen); no layout shift when live data lands |
| **Live** | org authed + store provisioned | real org-scoped rows from `/api/mdx/qms/*` |
| **Empty (honest)** | store provisioned, no rows / filtered to none | `.qms-empty` / `.qcc-detail-empty` copy — never a fabricated row |
| **Not-provisioned** | table missing (42P01) | reads fail **closed** to `{data:[], meta:{pendingStore:true}}`; surface shows fixtures — never a 500, never a fabricated verdict |

Fixtures are the design reference for populated state: `FIXTURE_CHANGES` (6 changes, one per lifecycle stage), `FIXTURE_SUMMARY`, and the SOP-register fixtures. They exist so the surface always looks alive; they are visually identical to live rows.

---

## 6. Data model reference (bind to these — `changeData.ts` / `data.ts`)

**Change lifecycle states** (`ChangeState`): `proposed | under_assessment | approved | rejected | in_implementation | verification | closed | cancelled`.
**Legal transitions** (enforced server-side): proposed→{under_assessment,cancelled}; under_assessment→{approved,rejected,cancelled}; approved→{in_implementation,cancelled}; in_implementation→{verification,cancelled}; verification→{closed,in_implementation}; rejected/closed/cancelled = terminal.
**Change types** (`ChangeType`): document, process, equipment, material, supplier, method, facility, computer_system, specification, other → labels in `CHANGE_TYPE_LABEL`.
**Classification** (`Classification`): minor | major | critical → `CLASSIFICATION_LABEL`, tone `CLASSIFICATION_TONE`.
**Risk** (`RiskLevel`): low | medium | high.
**Link types** (`LinkType`): deviation, capa, validation, document, sop, supplier, risk, other → `LINK_TYPE_LABEL`, icon `LINK_TYPE_ICON`.
**Relationships** (`Relationship`): triggered_by, addresses, requires, impacts, references → `RELATIONSHIP_LABEL`.

Row shapes: `ChangeControl { id, changeNumber, title, description, changeType, classification, riskLevel, status, reason, targetImplementationDate, createdAt, updatedAt, links?: ChangeLink[] }`; `ChangeLink { id, changeId, linkType, linkedRef, linkedLabel, relationship, note }`; `ChangeSummary { total, open, awaitingApproval, inImplementation, awaitingVerification, closed, overdueImplementation, byStatus }`. SOP register: `QmsDoc`, `DocStatus`, `DocType`, `SopTemplate` in `data.ts`.

---

## 7. Data binding summary (component → endpoint)

| Component | Hook | Endpoint | Envelope |
|---|---|---|---|
| Change log | `useChangeRegister` | `GET /api/mdx/qms/changes` | `{ data: ServerChange[], meta }` |
| KPI row / flowchart totals | `useChangeSummary` | `GET /api/mdx/qms/changes/summary` | `{ data: ChangeSummary }` |
| (detail) | — | `GET /api/mdx/qms/changes/:id` | `{ data: change + links }` |
| SOP register | `useSopRegister` | `GET /api/mdx/qms/documents` | `{ data, meta }` |
| Templates | `useSopTemplates` | `GET /api/mdx/qms/templates` | `{ data }` |
| Periodic review | `useReviewDue` | `GET /api/mdx/qms/documents/review-due` | `{ data }` |
| Training | `useTrainingCompliance` | `GET /api/mdx/qms/training/compliance` | `{ data }` |

All hooks use the shared `useFetchJson` (auth headers + cancellable) and adapt snake_case → camelCase. Mutations happen **only** through AnA tools (§8), never a direct write from these surfaces.

---

## 8. AnA action model (every button is a governed prompt → typed tool)

The surfaces call `onAsk(prompt)`; AnA runs the matching tool against the real backend. Design should treat each action button as "send intent to AnA," and expect AnA to stream back the executed result (and, for governed actions, a 21 CFR Part 11 sign-off / reason-for-change prompt rendered by the shared AnA rail — not a surface-local modal).

| UI action | AnA tool | Governance |
|---|---|---|
| Raise change request | `qms_change_create` | audit-logged; starts `proposed` |
| Advance (row) | `qms_change_transition` | **requires reason-for-change**; **segregation of duties** (approver ≠ proposer); rejects illegal moves; audit-logged |
| Link a record | `qms_change_link` | audit-logged |
| SOP: New / Approve / Revise / Retire / Record training | `create_qms_document` / `approve_qms_document` / `revise_qms_document` / `retire_qms_document` / `ack_training` | approve stamps approver+effective; revise requires reason + bumps version; retire terminal |

**Implication for Design:** the reason-for-change / e-signature capture is the **AnA rail's** job (existing `GovernedActionSignoff`), so do **not** design a separate reason modal inside these surfaces. Keep the surfaces read + "ask" only.

---

## 9. Design tokens & existing classes (stay consistent)

Tokens (host design system, loaded globally): `--text-100/200/300/400/500`, `--bg-050/100/200`, `--background`, `--accent-main-100/200` (Claude orange — the single focal color, primary CTA only), `--font-sans/serif/mono`. Body **13px**, section H2 serif 16px, H1 serif 24px. Borders `#e8e6dc` (card) / `#f2f0e8` (row). Motion **200ms ease-out**. Tone colors: ok `#4a6b3a`/`#e7efe2`, warn `#8a5a1a`/`#f6ead3`, err `#a23b2f`/`#f6dfda` (pill) & `#c84a4a` (text).

New classes you can restyle: `.qms-tabbar/.qms-tab`, `.qcc-flow/.qcc-flow-track/.qcc-node/.qcc-node-dot/.qcc-arrow/.qcc-flow-foot/.qcc-offramp`, `.qcc-class`, `.qcc-linkcount/.qcc-detail/.qcc-links/.qcc-link*`, `.qcc-train/.qcc-steps/.qcc-step-n`, `.qcc-forms`. Reused: `.qms-head/.qms-kpis/.qms-kpi/.qms-sec/.qms-table/.qms-row/.qms-pill/.qms-chip/.qms-tpl-card/.qms-btn/.qms-empty`.

---

## 10. Microcopy (per `microcopy-tone` — calm, factual, sentence case, no emoji, no exclamations)

All strings today follow this. Examples to preserve the register of: "Your change-control log, aligned to ICH Q10 change management and EU GMP Annex 15." · "No changes at this stage." · "Link the deviation, CAPA or validation protocol this change touches so the change control log stays traceable end to end." Keep AnA prompt copy in second person, imperative, no hype.

## 11. Motion (per `motion-discipline`)
200ms ease-out on hover/border/background/width transitions (KPI, cards, node highlight, training bar fill). No spring/bounce/overshoot. Honor `prefers-reduced-motion`. The flowchart filter transition and the row expansion should feel instant-but-smooth, not animated-for-show.

## 12. Compliance & accessibility gates (requirements, not polish)
- **A11y (WCAG 2.2 AA):** every actionable node/chip is a real `<button>`; flowchart nodes carry `aria-pressed` + descriptive `aria-label`; tab bar is a `role="tablist"` with `aria-selected`; row expansion sets `aria-expanded`. Color is never the only signal (status/classification carry text labels alongside tone). Maintain focus-visible and logical focus order; the horizontal flowchart must be keyboard-reachable.
- **Part 11 (`regulatory-compliance-ux`):** governed mutations show a reason-for-change / e-signature via the AnA rail; the surface never fabricates a success state — it reflects what AnA executed.

## 13. Definition of done
Both tabs render live data (or honest fixtures/empty), the flowchart reads as the module's signature visual and filters the log, linked records are legible and typed, all actions round-trip through AnA, and the whole thing passes the ui-v2 render gate and the a11y/tone/motion rails. No horizontal body scroll; no dead buttons.

## 14. What Design owns / out of scope
- **Own (polish):** the flowchart's visual language (the biggest lever), the linked-records card density/typography, KPI hierarchy, the classification/status/tone palette within the tokens above, empty-state illustration/copy, responsive behavior below 960px.
- **Out of scope (built, don't rebuild):** the data model, endpoints, AnA tools, lifecycle state machine, seed data, and the reason-for-change/e-sign flow (AnA rail owns it). Deviation/CAPA/validation are governed cross-references (`link_type` + `linked_ref`), not hard FKs — the "open linked record" action hands off to AnA.

---

## Appendix — files
Frontend: `client/src/concept2cure/quality/{App,SopRegister,ChangeControl,ChangeFlow}.tsx`, `{changeData,data,changeHooks,hooks,icons}.ts(x)`, `app.css`; adapter `v2/surfaces/QualityModule.tsx`. Backend: `server/routes/mdx-qms.ts` (`/qms/changes/*`), `server/services/qms/changeControl.service.ts`, `sopTemplates.ts`; migration `db/migrations/20260724_qms_change_control_store.sql`; seed `scripts/seed/ga-demo.d/123-qms-quality.mjs`. Tests: `server/routes/__tests__/qms-changes.test.ts`, `server/services/qms/__tests__/changeControl.pglite.integration.test.ts`, `server/services/ana/__tests__/qms-change-tools.test.ts`, `client/src/concept2cure/quality/__tests__/ChangeControl.test.tsx`.
