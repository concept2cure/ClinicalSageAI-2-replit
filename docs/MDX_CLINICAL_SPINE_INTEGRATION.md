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
| Study design (CDISC PRM) | `cdisc_prm_studies` | **none** | Keyed by its own `study_id` text + `tenant_id`. `programId` is coerced into a `protocol_id` varchar. Consumed by the v2 `BiostatWorkbench`, not MDX. |
| Protocol authoring | `protocol_documents` | **none directly** | Reaches a project *transitively* via `linked_protocol_id → clinical_studies.id → clinical_studies.program_id` (a soft polymorphic ref). |

So RBQM and clinical studies already share the project key; the protocol
and study-design tables do not.

## What is built now (this PR)

RBQM flows into the MDX **Clinical studies** workstream, project-scoped:

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

## What still needs a schema change (next PR — security review)

To make **protocol and study design** connect to a project the same way:

1. **Add the project key to the design tables.** Add `program_id uuid`
   (and `organization_id`) to `cdisc_prm_studies`, populated on persist
   from `design.programId` (`study-design-repository.ts`). Backfill
   existing rows where `protocol_id` already holds a UUID. This is the
   single change that makes study design project-connected.
2. **Expose a project-filtered read** — `GET /api/study-design?program_id=`
   (its routes currently return bare objects, not the `{data}` envelope;
   an MDX consumer should adapt for that).
3. **Prefer the existing transitive link where it fits.**
   `protocol_documents.linked_protocol_id → clinical_studies.id` already
   reaches `program_id`; a protocol-authoring view can key off the
   selected study without new columns.
4. **Then surface it** — a "Protocol & study design" zone on the MDX
   Clinical studies workstream, read-first via `DataGate`, same pattern
   as the RBQM zone.

## The deeper RBQM ↔ conduct gap (worth flagging)

RBM site risk and signals key on `site_intel` / free-text `site_id`, not
`clinical_study_sites`. Even with a shared `program_id`, a study's sites
and its monitored sites are not the same rows. Truly unifying monitoring
with conduct — so a site's deviations, enrollment and risk score are one
object — needs the RBM engine to read `clinical_study_*`. That is an
engine-side change, owned by the RBM workstream, and is called out here so
it isn't mistaken for something the MDX client layer can fix.
