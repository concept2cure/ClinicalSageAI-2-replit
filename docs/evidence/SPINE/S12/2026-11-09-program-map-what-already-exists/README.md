# S12 gap 5, the program's map across its projects: what already exists, and the decision it needs

**Package:** S12 (founder decisions P-83, P-109). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`, 2026-11-09.
**Status:** this is the inventory only. No code has been changed. The coordinating session asked for it before any
design, beginning with Pyramid and PortfolioLine.

## What already exists (RULE 3)

| Piece | Path | Does | Does not |
|---|---|---|---|
| `PortfolioLine`, `usePortfolioLines` | `surfaces/PyramidProject.tsx:432-489`; `GET /api/v1/pyramids/by-project` (`pyramid.routes.ts:311`, `sendPortfolioLines` :585) | One schedule line per Projects card: on schedule, past due, the next phase's due date | Keyed by `regulatory_programs`, so filing projects only. No work projects, no feeds |
| The project's pyramid plan, `ScheduleLine` | `PyramidProject.tsx:98-430` | One filing project's back-scheduled tasks, owners and critical path | Knows no child projects |
| The S11 6b global schedule (Reporting session) | local commit `c0729896d7`, beside PortfolioLine | — | Not on trunk at this inventory. To be read before any design |
| Work projects list | `ProjectCoreWork.tsx` `ProjectWorkProjects` (S12), reachable from `ProjectHome.tsx` | One filing project's direct children: kind, owner, the door to their work area, and the Plan assignment (who and when) | No deliverables, no feeds, no stale state; one level |
| Children read | `project-hierarchy.ts:147-200` | Program-admitted direct children, with `workKind` and owner | — |
| Tree, rollup and flat routes | `project-hierarchy.ts` :100, :347, :375; `project-rollup-service.ts:91` `getTree` | A recursive subtree with a rollup per node (progress, tasks, risk) | **No client caller.** Organization-scoped, not program-admitted. Drops `workKind` |
| Pyramid feeds | `services/regulatory/pyramids/types.ts:79-85` (`feeds_into`); `SubmissionPyramidEngine.ts:313` `getCrossSubmissionDependencies`, which has no caller; `:270` `getDocumentCoverage` | Static, by submission type: IND to NDA, and a task to CTD sections | Not one project to another |
| Device work packages | `shared/regulatory/work-packages.ts:31-50`; `ProjectMdxWorkflow.tsx:149-151` "Feeds" and "Inputs from" | Static text, device projects only | No versions, child projects or state |
| Stale flags | Data room: `source-usage.service.ts` (384de77ed). Vault: `vault-citation-changes.ts` (d72eecc76), with the Evidence banner and the editor rail | A section written from a superseded source, or from a replaced Vault version, within one program | **Cannot say which work project's deliverable** the section came from |
| Static deliverable-to-place catalogues | `biostatistics-bridge/filing-placement.ts:44`; CMC `section-drift.ts` `sectionsFedBy`; `c2c_artifact_section_map` | — | None is linked to a work project row |
| The map, in prose | `docs/design/THE_PROGRAM_2026-11-01.md` §7a (:238-312) | The deliverable-to-document table; :298-312 lists "the program's map across its projects" as missing | — |

## The gap

1. **No program-wide read.** No single read covers the filing project and its descendant work projects together with
   their owners and due dates. `getTree` walks the subtree, but it has no caller, is not program-admitted, and drops
   `workKind`.
2. **No attribution.** A Vault version family is keyed to the filing program only (`program_id`; `folder_id` points
   to a program's folder), so a deliverable cannot be traced to the work project that produces it.
3. **No recorded feeds.** Which sections a work project feeds can only be inferred from a section's live Vault
   citation.
4. **No per-feed state.** The stale flags exist per section, and are not attributed to a work project.
5. **No surface.** Nothing draws a work project with its feeds and their state.

## The decision needed: how a Vault deliverable belongs to its work project

Gap 2 needs a decision, and is sent to the coordinating session:

- **(A) Through the existing Plan task. Recommended.** A work project's deliverable is assigned as a Plan task, as
  its owner and due date already are (`8f0397d20`). The task's `moduleData` names the Vault family
  (`vaultDocumentCode`). The map reads attribution from the Plan task read. There is no schema change, and it reuses
  `unified_tasks` (RULE 3).
- **(B) A work project owns a Vault folder.** This needs a project key on `document_folders`, which is a schema change.
- **(C) No attribution yet.** The map shows each work project, its owner and due date, and beside them the program's
  Vault-fed sections and their stale state, not tied to a work project.

**The surface,** whichever is chosen: the existing Work projects list in Project knowledge becomes the map. Each work
project gains its deliverables, the sections they feed (from the span lineage) and their state (from
`vault-citation-changes.ts`). There is no new screen or card (RULE 4). The map is read only after the S11 6b global
schedule lands, so the two are not built twice.

**The target date.** The map's dates come from the Plan task's due date. If a project-level target date is wanted,
`projects.target_end_date` (never written) or `project_milestones` would be reached, never added. Both are with R1 as
reach-or-retire candidates.
