# Connecting the clinical spine to a project: studies, protocol design, RBQM

**Status:** integration contract. Part of it is now built (RBQM into the
MDX Clinical studies workstream); the rest is specified here so the
protocol/study-design link can be done as a scoped schema change rather
than discovered later.

**Date:** 2026-07-27

## The requirement

A device/IVD **project** should carry its protocol and study design, its
clinical-study conduct record, and its risk-based quality monitoring as
one connected thing — reachable together in the MDX workstream, not
scattered across three modules that don't know about each other.

## The canonical project key

The load-bearing key is **`regulatory_programs.id` (UUID)**, carried as
**`program_id`** on the tables that matter. The codebase says so itself —
the RBM migration header (`migrations/20260629_rbm_surfaces.sql`) calls
`program_id` *"the canonical project id space"* that CMC, labeling, risk
and clinical studies hang off. In the MDX shell this is exactly the
`program.id` the shell already prop-drills as context.

Two other "program/project" namespaces exist and are **not** this key —
do not join to them for clinical work:

- `projects` (integer PK) — a generic PM workspace tree whose depth-0
  rows are labelled "Program". No FK to `regulatory_programs`.
- `ctd_programs` / legacy integer `evidence_claims.program_id` — bridged
  to the UUID space only through `living_record_program_links`.

## What each module carries today

| Module | Table | Project key | Notes |
| --- | --- | --- | --- |
| Clinical study conduct | `clinical_studies` | **`program_id` uuid** | Child tables (`clinical_study_sites/deviations/aes/endpoints`) FK to `clinical_studies.id` (int). |
| RBQM | `rbm_*` (`rbm_risk_assessments`, `_risk_items`, `_kris`, `_qtls`, `_signals`, `_site_risk_scores`, `_patient_profiles`, `_monitoring_plans`) | **`program_id` uuid** | Site risk reads a separate `site_intel` silo, not `clinical_study_sites`. |
| Study design (CDISC PRM) | `cdisc_prm_studies` | **`program_id` uuid** *(added)* | Was keyed only by `study_id` text + `tenant_id`; now carries the canonical project key, populated on persist and backfilled from `protocol_id` where that held a UUID. |
| Protocol authoring | `protocol_documents` | **none directly** | Reaches a project *transitively* via `linked_protocol_id → clinical_studies.id → clinical_studies.program_id` (a soft polymorphic ref). |

RBQM and clinical studies share the project key natively; the study-design
table now carries it too (see below).

## Connecting study design to the project (built)

`cdisc_prm_studies` now carries `program_id` (the canonical project key):

- **Schema + migration** — `program_id uuid` column and index added
  (`migrations/20260727_prm_program_link.sql`). Additive and nullable, so
  existing rows and the v2 `BiostatWorkbench` persist path keep working.
- **Populate on persist** — `studyDesignToRows` writes `program_id` from
  the design's `programId`, but **only when it is a UUID**; a non-UUID
  reference stays in `protocol_id` and `program_id` is left null rather
  than writing a bad project link into a uuid column. Backfill promotes
  existing `protocol_id` values that are already UUIDs.
- **Project-filtered read** — `GET /api/study-design?program_id=<uuid>`;
  an invalid filter matches nothing rather than widening to the tenant.
- **Surfaced in MDX** — a read-first "Protocol and study design" zone on
  the Clinical studies workstream (`useStudyDesign`), project-scoped on
  the same key as the study list and the RBQM zone.

## What is built now (this PR stack)

The MDX **Clinical studies** workstream now carries a project's design,
conduct and monitoring on one key:

- The Clinical studies surface takes the shell's `program` and narrows
  its list to `program_id`; without a project it stays the portfolio.
- A **Risk-based monitoring** zone consumes the RBQM engine's read
  endpoints — `GET /api/mdx/rbm-summary/:programId` and
  `GET /api/mdx/rbm-attention/:programId` — keyed on the same project.
  It falls back to the selected study's own `program_id`, so a study
  opened from the portfolio still shows its project's monitoring.
- Consume-only: the RBQM compute engine (`mdx-rbm.ts`,
  `mdx-rbm-board.ts`) is owned elsewhere and is not modified. The MDX
  side reads through `useRbqm` (`client/src/concept2cure/mdx/hooks/`).

Everything renders through `DataGate`: no project selected → `idle`; a
project with no RBM data → its honest zeros, never a fabricated posture.

- A **Protocol and study design** zone consumes
  `GET /api/study-design?program_id=<uuid>` for the project, on the same
  key, so design sits beside conduct and monitoring on one screen.

## Follow-ups still open

- **`protocol_documents` (protocol authoring)** still has no direct
  project key; it reaches one only transitively via
  `linked_protocol_id → clinical_studies.id → program_id`. If that table
  (rather than `cdisc_prm_studies`) is the intended authoring source for a
  given surface, either add `program_id` there too or key a view off the
  selected study. Not done here because the CDISC PRM table is the one the
  `/api/study-design` routes read.
- The **deeper RBQM ↔ conduct site gap** below is engine-side and remains.

## The deeper RBQM ↔ conduct gap (worth flagging)

RBM site risk and signals key on `site_intel` / free-text `site_id`, not
`clinical_study_sites`. Even with a shared `program_id`, a study's sites
and its monitored sites are not the same rows. Truly unifying monitoring
with conduct — so a site's deviations, enrollment and risk score are one
object — needs the RBM engine to read `clinical_study_*`. That is an
engine-side change, owned by the RBM workstream, and is called out here so
it isn't mistaken for something the MDX client layer can fix.
