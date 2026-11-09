# S12, work projects and their downstream deliverables: what already exists, and the decisions it needs

**Package:** S12 (founder decision P-83; `docs/design/THE_PROGRAM_2026-11-01.md` §7a; `docs/design/ONE_DESIGN_PLAN.md`
§1c; ledger `docs/design/one-design-plan.json`). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`, 2026-11-08, after D3-4.
**Status:** the inventory is written, and no code has been changed. The decisions below must be made before any code.

## What already exists (RULE 3)

The search was read-only and covered the code, routes, tables, client callers and deleted history. The clone is
shallow (743 commits), so a `git log --all --diff-filter=D` for `*hierarch*`, `*rollup*`, `*deliverable*` and
`*work-project*` returned nothing; that does not prove nothing was deleted.

| Piece | Path | Does today | Does not do |
|---|---|---|---|
| Project kinds | `server/routes/c2c/project-intake.ts:36` `VALID_PROGRAM_TYPES`, checked at `server/routes/c2c/projects.ts:750` | Accepts filing types only (ind, nda, bla, maa, 510k, mdr, dmf, filing-document classes) | Has no work kind (cmc, biostatistics, rbm, data management, clinical pharmacology, nonclinical) |
| New project | `client/src/concept2cure/v2/surfaces/Projects.tsx` (`STEP_LABELS` :274, `programTypeFor` :122, POST :533–557) | Takes a filing type, product, team, target date and `riskBasedMonitoring` | Cannot choose a work kind or a parent program |
| `regulatory_programs` | `shared/schema/programs.ts:41–143` | — | Has no parent or product-program link |
| The integer tree | `shared/schema.ts:5714–5716` (`projects.parent_project_id`, `depth` 0 Program … 3 Sub-project, `path`); `:5771` `regulatory_program_id` | The tree's shape, with a self foreign key and indexes | Intake writes a root row only (`server/services/c2c/program-project-anchor.ts:188–201`) |
| Hierarchy route | `server/routes/project-hierarchy.ts` (programs :46, tree :96, ancestors :120, children :147, move :182, rollup :318, flat :346); mounted at `server/bootstrap/register-project-routes.ts:41` | Reads the tree and moves a node | **No client caller.** Keyed by integer id, not the program's UUID |
| Rollup | `server/services/project-rollup-service.ts` (getTree :91, getAncestors :369, recomputePaths :394, validateMove :457) | Rolls up progress, budget, worst risk, tasks and modules | Rolls up no deliverables or feeds |
| Ancestor breadcrumb | `server/routes/project-home-routes.ts:55, 271–318` | Ancestors with a kind by depth | Project home does not call it |
| Work-area doors | `client/src/concept2cure/v2/surfaces/ProjectCoreWork.tsx:35–50` `workAreasFor` | Doors from Project knowledge | The project does not open on its area; the doors follow the filing track |
| Data-room versions | `migrations/20260829_cre_source_versioning.sql:46–71`; `evidence-spine.service.ts:94` `createSupersedingSource` | A version chain (`previous_version_id`, `is_current`) | Has no deliverable identity, owner or due date |
| Section ← source citations | `server/services/clinical-regulatory-evidence/source-usage.service.ts` (citeSource :216, listSectionSources :360, summarizeSourceUsage :430, listChangedSourceUsages :493) | The editor shows "Source has been replaced since cited" (`editor/DocumentWorkbench.tsx:802`); "Used in" on the data room | **Refuses a citation across projects** (`citation-ends.ts:50`; `source-usage.service.ts:240, 616`). `changedSections` compares checksums only, so a new version never counts as changed |
| Vault versions | `server/services/vault/vault-version-family.ts:23–30` | A family = same program + same document code | Cannot cross programs |
| CMC evidence and drift | `server/services/cmc/source-evidence.ts`, `section-drift.ts:70` `sectionsFedBy`, `cmc_section_lineage`, `CmcSectionEvidence.tsx` | Stale detection from CMC registers to Module 3, holding approve and export | Works within the same program only |
| CMC into a sequence | `CmcPlaceIntoSubmission.tsx`, `place-module3-into-submission.ts` | Places approved 3.2 sections in this program's sequence | Cannot place into another (filing) project |
| Statistical deliverables | `server/services/biostatistics-bridge/filing-placement.ts:44` `STATISTICAL_DELIVERABLES`, :334 `placementFor` | A deterministic catalog from deliverable to CTD place | Has no versioned link to a filing's section |
| Artifact → section map | `ana-biostats/workflow-integrator.ts:453`, `c2c_artifact_section_map` (`shared/schema.ts:6825`, owner by user, role or function) | Maps an artifact to a package section, with its owner | Has no due date, pinned version or stale flag |
| Pyramid feeds | `services/regulatory/pyramids/types.ts:83, 101–102`; `ind-pyramid.ts`; `SubmissionPyramidEngine.ts:315` `getCrossSubmissionDependencies` | Static feeds and document bindings | `getCrossSubmissionDependencies` has no caller |
| Device work packages | `shared/regulatory/work-packages.ts:31–50`; `ProjectMdxWorkflow.tsx:151` renders "Feeds" | The nearest existing Feeds list | Static text, with no versions |
| Stale links | `server/services/reactive-dependency-service.ts` (register :88, propagate :181, getStale :164; table `governed_dependencies`) | Marks a target stale or impacted | Its object types exclude data-room sources and authoring sections; no client reads it |
| Change propagation | `server/services/ana/changePropagationTools.ts` (8 AnA tools); `server/routes/change-propagation.ts` | Drift of governed facts, from chat | No client caller; not keyed to deliverable versions |
| Data lineage | `server/routes/data-lineage.ts`; `ana/drafting-source-lineage.ts` | Lineage of drafted text | No client caller |
| `cdisc_task_deliverables` | `migrations/0000_sweet_joseph.sql:966` | Assignee, due date and dependencies | No code reads it |

## Gaps

1. A work kind in New project, with a parent program.
2. A work project opens on its work area.
3. A deliverable's identity, version, owner and due date, and its "Feeds" to a filing project's sections.
4. A filing section flagged when a newer deliverable version lands.
5. The program's map across its projects.

## Decisions needed before code (for the coordinating session, or the founder)

1. **Where a work project lives.**
   - (a) As a `regulatory_programs` row with a new work `program_type`. This needs `project-intake.ts` and
     `projects.ts`, which are **outside S12's ledger paths**, and the kind has no filing semantics anywhere else (the
     scaffold, launch scope, the dossier).
   - (b) As a child of the filing project's anchored integer `projects` row (`parent_project_id`; depth 2 or 3),
     reached through the existing hierarchy route. That route has no client caller and is keyed by integer id.

   The recommendation is (b), because it reuses the existing tree; it still needs the anchor (`program-project-anchor.ts`,
   outside S12's paths) to accept a parent.
2. **Feeds across projects.** Today a section may cite only its own project's sources (`citation-ends.ts`, a tenant
   and project isolation rule). A work project's deliverable feeding a filing section needs a sanctioned exception
   within one product program. That is a security and Part 11 decision, not a session's.
3. **What a "deliverable" is.** The candidates are a data-room source's version chain, a Vault document's version
   family (same program only today), or an artifact in `c2c_artifact_section_map`. One must be chosen, and the others
   converged onto it (zero duplication).
4. **Ledger paths.** S12's paths do not include `server/routes/c2c/project-intake.ts`, `server/routes/c2c/projects.ts`,
   `server/services/c2c/program-project-anchor.ts`, or `server/services/vault/**`. Whichever answer is chosen above
   needs a `Plan: PLAN` change with a founder decision before code.
