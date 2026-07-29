# Gap analysis: industry-context tailoring vs. current code

**What this is:** a measurement, not a plan. It compares the target architecture —
*one self-tailoring workspace whose behaviour is preset by the client's industry and
project context, with the left rail unchanged* — against what the code does today, so
the work orders can be scoped from facts rather than guesses.

**Date:** 2026-07-27 · **Method:** five read-only passes over onboarding/admin,
licensing/context, Projects, Tasking (`unified_tasks`), and Study Design.

---

## Verdict

The target's central claim is correct: the codebase is **already built to tailor one
workspace, not to fork into a second product.** Three foundations the design depends on
already exist and behave as specified — so this is an *extension*, not a rewrite. But the
load-bearing middle layer — a persisted, governed context and a single resolver that the
modules read — **does not exist**, and every module adapts (if at all) off a different,
partial signal. The gap is concentrated in three greenfield pieces:

1. a **governed org + project industry profile** (persisted, audited) — today's signals
   are a free-text column, a localStorage blob, and a mock;
2. a **single effective-context resolver** the modules consume — today each module reads a
   different partial input;
3. the **module-interior adaptation** (Projects tabs, task metadata, study archetypes) —
   today these are static or pharma-first.

Nothing here requires touching the left rail. That part of the thesis is already true in
code.

---

## What is already right (the foundation the target assumes)

| Assumption in the target | Reality in code |
| --- | --- |
| The left rail should not change; industry gates *interiors*, not navigation | **Confirmed.** The v2 rail is a static registry (`v2/registryModel.ts`, rendered by `v2/Shell.tsx`); licensing gates apps *inside* surfaces (locked apps show an upgrade CTA, never a dead rail button). The rail is not computed from `enabledModules`. |
| "Medical Device Company" already maps to a governed medtech → MDX mode | **Confirmed as a preset.** `shared/regulatory/client-type-profiles.ts` maps `medtech → vertical 'mdx'`, device terminology, `regulated_dual_review`, and a `US_510K` default need. `orgToSubmissionClientType('medtech') → 'mdx'`. |
| Licensing should overlay tier + enabled modules and mark locked capabilities | **Exists.** `server/services/regulatory/workspace-config-enrichment.ts` overlays `getLicenseInfo(orgId)` and partitions `accessibleApps` / `lockedApps[{id, requiredModule}]`. |
| Tasks are a single source of truth to *extend*, not replace | **Exists.** `unified_tasks` (`shared/schema.ts:6963`) already carries dependencies, `critical_path`, `regulatory_impact`, `impact_score`, approvals, workload, plus `task_templates` / `task_automation` / `project_rules` engines. |
| The clinical spine (design → conduct → monitoring) hangs off the project | **Now true** (this session): `clinical_studies`, `rbm_*`, and `cdisc_prm_studies` all carry `program_id`, surfaced in the MDX Clinical studies workstream. |

The recommendation is therefore to build the missing context layer and let these existing
foundations do what they were built to do.

---

## Gap by work order

Legend — **Effort:** S (≤1 PR), M (2–3 PRs), L (multi-PR), XL (multi-PR + migration + security review).

### MDX-CONTEXT-01 — Governed organization industry profile · **P0 · Effort M (schema)**

**Target:** a tenant-scoped, audited `organization_industry_profiles`
(primary_industry, mdx_specialization, default_markets, default_pathways,
default_approval_rigor) with `GET/PATCH /api/admin/industry-profile`, editable in Admin
Settings; no localStorage authority.

**Current:**
- **No such table, no such endpoint** (zero matches for `organization_industry_profiles`,
  `industry-profile`).
- Org identity is split across **two un-normalised columns**: `organizations.industry_mode`
  (free text, nullable) and `organizations.client_type` (default `'pharma'`).
- `mdx_specialization`, `default_markets`, `default_pathways`, `approval_rigor` exist
  **nowhere** as columns.
- The Admin Settings client-type picker (`v2/surfaces/AdminSurfaces.tsx`) writes only to
  `localStorage('c2c_admin_settings')` and is explicitly documented as *not* a governed
  write; its vocabulary (`medtech/biotech/pharma/diagnostics/cro/health`) doesn't even
  match the server `industryMode` enum.

**Gap:** the entire governed profile — table, API, audit, Admin wiring, and a normalisation
of the two overlapping org columns. `mdx_specialization` (the design's key distinction:
medical_device / ivd_diagnostics / both / samd / companion_diagnostic / combination_product)
is net-new.

### MDX-CONTEXT-02 — Project industry profile · **P0 · Effort M (schema)**

**Target:** `project_industry_profiles` (vertical, specialization, product_type,
lifecycle_stage, target_markets[], regulatory_pathways[], filing_types[]) inheriting org
defaults, overridable per project; captured in the new-project dialog.

**Current:**
- **No `project_industry_profiles` table.** The `projects` table has `type` (free text) and
  `therapeutic_area` — and **none** of vertical / specialization / product_type /
  lifecycle_stage / markets / pathways / filing_types.
- The fragments live scattered and unqueryable: `regulatory_programs` has `product_type` /
  `device_class` / `regulatory_path` / `target_agencies`; `project_charters` has
  `submission_type` / `development_stage`; and the new-project flow stashes
  `lifecycleStage` / `applicationType` / `dossierStandard` into `projects.metadata` JSON.
- `client_workspaces.industry` exists but is **dead data** (only ever SELECTed for display).
- The new-project dialog (`NewProjectDialog.tsx`) collects **region + application type +
  name/product/sponsor only** — no industry focus, product stage, multi-pathway,
  filing-types, or purpose.

**Gap:** the project profile table, the inherit-with-override mechanism, and the richer
new-project dialog. No inheritance from org defaults exists anywhere today.

### MDX-CONTEXT-03 — Effective-context resolver · **P0 · Effort M**

**Target:** one server `resolveEffectiveProjectContext({organizationId, clientId,
projectId, userId}) → EffectiveIndustryContext` with precedence
project → client → org → license default; consumed by Projects, Tasking, Study Design,
Reporting, and AnA alike.

**Current:**
- **No such resolver.** The closest is `resolveWorkspaceConfig(need)` + `enrichWorkspaceConfig`,
  exposed at `GET /api/workspace/config?need=…` — but it is **keyed on a document `need`,
  scoped to the org only**, and never reads project or client rows.
- Precedence today is a **2-level, request-only** merge (`req.user.industryMode ??
  tenantContext.industryMode`); there is no project → client → org → license chain. The only
  full precedence pattern in the codebase is for AI providers (`provider-preference.ts`), a
  useful template.
- The output pieces are partial and scattered: `vertical` and a 2–3-key `terminology` map
  exist per industry; `approvalRigor` exists **twice** (industry profile *and* per
  document-class semantics) and is unmerged; `pathways[]` / `markets[]` / `specialization` /
  `productType` are not fields of any single context object.

**Gap:** the resolver itself, the merge/precedence, and unifying the two rigor sources into
one `approvalRigor`. This is the keystone — CONTEXT-01/02 feed it and every module reads it,
so it should land immediately after the two profile tables.

### MDX-PM-01 — Project Management specialization · **P1 · Effort L**

**Target:** keep the Projects shell; add contextual center-pane tabs (Overview, Plan,
Studies, Deliverables, Decisions, Timeline, Team, Client Review) that adapt to the resolved
context.

**Current:**
- **No tabbed cockpit** and, worse, **two competing project surfaces**: the C2C
  `projects/ProjectDetail.tsx` (single scroll: workstreams, AnA, drafts, team/evidence/activity;
  backed by `regulatory_programs`) and the v2 `ProjectHome.tsx` (a *process-stage* rail —
  Plan/Evidence/Author/Review/Submit/Respond/Lifecycle — not the target content tabs).
- Of the eight target tabs: Overview and Plan are **partial**; Team exists as a section;
  **Studies, Deliverables, Decisions, Timeline, Client Review have no dedicated surface** (a
  separate `DecisionLineage.tsx` exists but isn't in the cockpit).

**Gap:** pick one cockpit, add the eight context-driven tabs, and make their content switch
on the resolved vertical/specialization. Consolidating the two cockpits is a prerequisite
decision.

### MDX-PM-02 — Regulatory work-package compiler · **P1 · Effort L**

**Target:** compile a combined plan (work packages → milestones → tasks → deliverables →
approvals → filing links) from specialization + pathways + markets + filing types, reusing
shared analytical/clinical evidence across filings (e.g. Dual 510(k)/CLIA + IVDR Class C as
one plan).

**Current:**
- **No `work_packages` concept** at all (only a textual mention of depth-3 sub-projects as
  "work packages"). Grouping today is by workflow stage / module.
- The raw material to compile *into* exists and is strong: `task_templates` (with
  dependencies, milestones, regulatory_requirements, risk_factors, pre-computed critical
  path), `task_automation`, `project_rules`, and the `from-template` instantiator.

**Gap:** the work-package entity + the compiler that maps a project's pathways/markets/filings
onto template-driven task graphs with shared-evidence de-duplication. Depends on CONTEXT-02/03
and PM-01.

### MDX-STUDY-01 — Study archetype registry · **P1 · Effort L**

**Target:** a versioned registry of device *and* IVD study archetypes, each with
applicability, required protocol sections, design questions, endpoints, acceptance criteria,
statistical methods, supporting plans, filing mappings, and approvals — so the design center
offers only relevant study types.

**Current:**
- **No registry.** The closest is `shared/constants/domain/study-designs.ts`: a flat list of
  **14 pharma clinical-trial designs** with only label/description/refs — no sections,
  endpoints, filing maps, versioning, or IVD/device archetypes.
- The IVD/device *knowledge* exists but as scattered standalone engines
  (`stats/analytical-performance.ts`, `stats/clinical-performance.ts`,
  `stats/diagnostic-design.ts`, `regulatory/human-factors.ts`, `regulatory/cdx-study-design.ts`,
  `gspr-postmarket/pmcf-plan-generator.ts`, `ivd-knowledge/**`) — not a unified registry the
  design center reads.
- `StudyDesign.productType` (`'drug'|'biologic'|'device'|'ivd'|'combination'`) **exists but
  nothing branches on it** — a dormant hook.

**Gap:** the versioned archetype registry (device + IVD, eight facets each), assembled largely
by *organising the knowledge that already exists* behind one contract.

### MDX-STUDY-02 — Contextual protocol builder · **P1 · Effort L**

**Target:** one protocol editor with dynamic rule packs (device / IVD analytical / IVD
clinical-performance / human-factors / CLIA-waiver / PMCF-PMPF), AnA beside the document
surfacing regulatory purpose, filing sections, weaknesses, reviewer challenges, gaps.

**Current:**
- The protocol outline is **static**: `authoring/data.ts` `AUTH_OUTLINES['protocol:ich']` — a
  single ICH-generic 9-section outline; `resolveOutline(docType, agency)` does **not** vary by
  study type or device/IVD.
- Two unrelated "rule pack" concepts exist, **neither** shapes the protocol editor by study
  type: the authoring outline packs (doc-type × agency) and the governed-document rule packs
  (`rules/rulePacks.ts`, keyed on document class / client track).
- AnA-beside-document exists **only in the Authoring workbench**, section-scoped on fixtures;
  the study-design surfaces only fire free-text prompts (no design/filing/gap context).
- Three disjoint surfaces exist (intelligence `Protocol`, v2 `BiostatWorkbench`, mdx
  `ClinicalStudiesSurface`) — none is a unified, context-adaptive center.

**Gap:** consolidate to one editor, add study-type-driven rule packs, and give the beside-doc
AnA live design/archetype/filing context. Depends on STUDY-01.

### MDX-TASK-01 — MDX task metadata + lifecycle phases · **P1 · Effort M**

**Target:** extend `unified_tasks` via a relationship layer (industry_vertical,
mdx_specialization, lifecycle_phase, market, filing_type, study_id, deliverable_id,
requirement_id, commitment_id, acceptance_criteria, evidence_required, client_visibility);
add lifecycle phases and MDX board saved views; richer task cards.

**Current:**
- The core model is rich (see foundations), but **all 13 target fields are absent** on
  `unified_tasks` (analogues exist on other tables — usable as relationship-layer FK targets).
- **`lifecycle_phase` is absent and documented in code as a gap** — the board read-model
  hardcodes `phase: null` (`taskBoard.routes.ts:243`, mirrored client-side).
- Board views are **4 hardcoded segments** (board/path/analytics/table); **no saved/preset
  views**.

**Gap:** a task relationship/metadata layer (prefer a join table over widening `unified_tasks`),
the lifecycle-phase enum, saved board views, and MDX task-card fields. Lower-risk than the
schema profiles; depends on CONTEXT-03 for the values.

### MDX-CLIENT-01 — Client Review Room · **P2 · Effort L**

**Target:** visibility states (internal / client_visible / client_action_required /
authority_ready), a client-facing project view (decisions needed, deliverables for review,
meetings, action log, milestone forecast, client-visible risks), with internal strategy hidden.

**Current:**
- **No task-level client-visibility concept** (zero matches for `client_visible` etc.). The
  only visibility construct is `project_visibility_settings` (`private | org_public`) —
  org-internal, not client-facing.
- The "Client Review Room" exists **only as design docs**, no surface or route. A
  `client_workspace_id` scoping FK exists on tasks but is tenancy, not a visibility state
  machine.

**Gap:** the visibility state model, client-scoped read filtering, and the Review Room surface —
all net-new. Depends on CONTEXT + PM + TASK.

---

## Current-code corrections (called out in the target, confirmed here)

1. **Signup discards the signal it collects.** `ZenSignup.tsx` validates `useCase` (510k / pma
   / cer …), `country`, `jobTitle` — then sends **only** the mapped `industryMode` to
   `/api/auth/signup`. Add `mdxSpecialization`, `primaryUseCases[]`, `defaultMarkets[]` to the
   payload and `signupSchema`, and persist them into the CONTEXT-01 profile.
2. **v2 onboarding activation is a no-op.** `Onboarding.tsx` `activate()` just sets a done
   flag; the code comment states no workspace is created, no plan provisioned, no invites sent.
   Wire it to org creation, billing/checkout, license provisioning, the industry profile,
   invitations, and initial project setup.
3. **Admin client type isn't authoritative.** It is localStorage-per-browser with a divergent
   vocabulary. It must become the CONTEXT-01 tenant-scoped, audited record before it can drive
   regulated behaviour.

---

## Cross-cutting risks

- **Vocabulary fragmentation.** At least four parallel client-type vocabularies coexist
  (`mdx` / `device` / `medtech`; plus the Admin picker's `diagnostics` / `health`), and two
  org columns (`industry_mode`, `client_type`). CONTEXT-01 should **normalise these into one
  governed vocabulary** as part of its migration, or the resolver inherits the ambiguity.
- **Two of everything to consolidate.** Two project cockpits (C2C `ProjectDetail` vs v2
  `ProjectHome`), two study models (design-as-data `cdisc_prm_studies` vs conduct
  `clinical_studies`), three study-design surfaces. The tailoring work is a good moment to pick
  one of each; doing so is a prerequisite for PM-01 and STUDY-02.
- **`approvalRigor` has two owners.** Industry profile and document-class semantics both define
  it; CONTEXT-03 must decide precedence or they will disagree at runtime.
- **Dead data that should become live.** `client_workspaces.industry` and
  `StudyDesign.productType` already exist and are unused — the resolver and STUDY-01 should
  activate them rather than add parallel fields.

---

## Recommended sequence

```
CONTEXT-01 (org profile, governed)   ┐
CONTEXT-02 (project profile)         ├─ P0 foundation; unblocks everything
CONTEXT-03 (effective resolver)      ┘   (consume dead columns; normalise vocab)
        │
        ├─ TASK-01     (metadata + lifecycle_phase + saved views)   ← quickest visible win
        ├─ PM-01       (consolidate cockpit → 8 context tabs)
        ├─ STUDY-01    (archetype registry: organise existing knowledge)
        │       └─ STUDY-02 (one editor, dynamic rule packs, design-context AnA)
        └─ PM-02       (work-package compiler)  ← needs CONTEXT + PM-01
                └─ CLIENT-01 (Review Room + visibility states)  ← P2, needs the above
```

Corrections (signup payload, onboarding activation, Admin authority) fold into CONTEXT-01 as
the same work — the profile is where all three currently-lost signals should land.

**Bottom line:** the rail-stable, context-driven model the target describes is the direction
the code already leans. The work is to make the context *real and persisted*, resolve it once
on the server, and let the existing modules — Projects, Tasking, Study Design, all already
built to be extended — read it. No separate MedTech product; a smarter one.
