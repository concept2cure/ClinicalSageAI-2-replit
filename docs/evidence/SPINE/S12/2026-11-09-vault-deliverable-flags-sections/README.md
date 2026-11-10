# S12: a section drafted from a Vault version is flagged once a later version is approved

**Package:** S12 (founder decisions P-83, P-109 with its third clarification, `a47a3d0782`). No Vault file is changed.
**Plan:** S12.
**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`, 2026-11-09.

This closes gaps 3 and 4 of the inventory (`../2026-11-08-what-already-exists/README.md`) for Vault deliverables, as
far as the link and the stale flag go. The deliverable's owner and due date are not part of this change.

## The decision

- **What P-109 item 3 says.** A deliverable is a Vault document's version family, and only an approved version feeds
  a filing section. Item 3 names `c2c_artifact_section_map` as the link.
- **Why that table cannot be the link.** It joins `concept2cure_artifacts` to `c2c_package_sections`, the Submission
  Ops package spine (`migrations/0002_phase15_submission_ops.sql:25–50`).
  - It has no column for a Vault document or family, and no editor section.
  - Using it would need an artifact row for each deliverable, which is a second store; item 3 forbids that.
- **What was decided.** This was reported to the coordinating session with two options. The user chose (A) on
  2026-11-09 ("I trust your judgement"):
  - The link is the one that already exists: a section's live `vault_document` span lineage.
  - The coordinating session then ruled (A) as well, and recorded it as P-109's third clarification (`a47a3d0782`,
    `docs/LAUNCH_DEFINITION_OF_DONE.md`). The link is the `vault_document` span lineage, and `c2c_artifact_section_map`
    stays Submission Ops' own. Read-only use of the Vault's helpers is fine, and no Vault file is edited.

## What already exists (RULE 3)

| Piece | Path | Does | Did not |
|---|---|---|---|
| Section ← Vault version link | `document_span_lineage`, provenance `vault_document` (`migrations/20260908`); writer `span-lineage-vault.ts` `replaceVaultFigureSpans`, called by `authoring-section-seed.ts:28` when a section is drafted from a Vault version; retired by `lineage-gate.ts` | Records which Vault version (by id, with its content hash) a drafted figure came from | — |
| Vault where-used | `vault-where-used.ts` `readVaultSectionCitations` (G7); `VaultVersions.tsx` `sectionsCitingEarlier` | On the Vault, the new version lists the sections that still cite an earlier one | Nothing on the project or filing side |
| Span state | `span-lineage.service.ts` `withVaultVersions` | Compares the span's hash with its own version's hash. That hash never changes, so the span always reads "current" | Never considers a later version |
| Family rule | `vault-version-family.ts` (`VALID_LINK`, `currentVersionLateral`) | Which rows are versions of one document | Had no approval-aware read |
| Approval | `vault-lifecycle.ts` `STEADY_STAGES`, one `canonical_documents` record per version | The approved, usable stages | — |
| The project's changes | `source-usage.service.ts` `listChangedSourceUsages` (S12 slice 1); `GET /api/c2c/projects/:id/source-changes`; `ProjectHome.tsx` DataRoom | Data-room citations to a source that changed or was superseded | No Vault citations |
| `c2c_artifact_section_map` | `shared/schema.ts:6825` | Artifact → package section, with its owner | Not a Vault family or an editor section (above) |

## What changed

There is no new table, route, screen or card.

- **S12, `clinical-regulatory-evidence/vault-citation-changes.ts`.** This is a split beside `source-usage.service.ts`.
  Its `listChangedVaultCitations` lists a program's sections whose live `vault_document` spans cite a version that a
  later approved version has replaced. It:
  - reads only sections the person may read (`getCurrentAuthoringReadScope`, the same scope as the data-room
    changes);
  - holds the cited version to the section's organization and program (P-109 item 2);
  - finds each cited version's later versions through the Vault's own readers: `readVersionFamily` (its family, by
    program and organization) less itself and `readPredecessorIds`. No family rule is restated here;
  - keeps the latest of those whose lifecycle record is at a `vault-lifecycle.ts` `STEADY_STAGES` stage, one query on
    `canonical_documents` as `findVaultLifecycleRecord` reads it;
  - names the version cited and the approved version.

  **A first version was withdrawn.** It added a SQL builder to `vault-version-family.ts`. That needed a Vault edit,
  which the ruling rules out, and an entry in F1's SQL-interpolation allow-list. This version needs neither:
  `ci:sql-interpolation` passes with nothing in this file's query text interpolated.
- **S12, `GET /api/c2c/projects/:id/source-changes`.** It also returns `vaultChanges` and `vaultCount`. Its `changes`
  and `count` are unchanged.
- **S12, `ProjectHome.tsx` DataRoom.** Beside the data-room notice it says, for example: "1 section was drafted from a
  Vault version that a later approved version has replaced." Each section is named, for example "Module 2.5 Clinical
  Overview · 2.5.3 — drafted from Drug substance specification v1.0; v3.0 is approved", followed by "Nothing has been
  rewritten." A reply without `vaultChanges` fails the shape guard. The page then says it could not verify the
  changes; it never shows an empty "none".

## Red first

**The read**, `__tests__/vault-citation-changes.pglite.integration.test.ts`. It runs on PGlite with the real
authoring read scope, the real span-lineage migrations and the Vault's own family readers. `public.actor_name` is
defined in the test with its production signature, because its migration installs it only where its own preconditions
hold. Its four cases:

1. A section drafted from v1 is not listed while v2 is in review, and is listed once v2 is approved, naming both.
2. With v2 placed and v3 approved, the section names v3. A section drafted from v3 is not listed.
3. A retired span is not listed. Neither is a "successor" under another document code, which the family rule refuses.
4. Organisation A does not see organisation B's section. Organisation A's span naming B's version is not resolved.

All four pass (`tests.log`). The read is new, so trunk has nothing to run. Instead, each guard was broken in turn
(`mutations.log`), and each break fails exactly the case that guards it:

- any later version counts, approved or not: case 1 fails;
- a retired span still counts: case 3 fails;
- the cited version's own predecessors are counted as later versions: case 2 fails;
- the cited version is not held to the section's organization and program: **all four still pass**. The Vault's family
  reader, scoped by program and organization, also refuses that version, so no later version is found. This query's
  guard is a second layer, and no case can tell the two apart. `mutations.log` says so.

**The page**, `__tests__/projectHomeDataRoom.test.tsx`:

- One new case names the Vault-drafted section.
- The malformed-read cases gain a reply without `vaultChanges`, which must not read as "none".
- Against trunk's `ProjectHome.tsx`, both of those fail and 40 pass (`ui-red.log`). With the change, all 42 pass
  (`ui.log`).

**Around it:**

- `server/services/clinical-regulatory-evidence`, `server/services/vault`, the data-room UI,
  `core-project-record-gating` and `project-vault-parent-access.pglite` pass: 129 files, 1,914 tests.
- `tests/db/project-vault-parent-access.dbtest.ts` cannot start in this container. It requires an `APP_DATABASE_URL`
  for a provisioned runtime role, and it stops before loading any code.
- Typecheck reports 0 errors. ESLint gained no warning.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101 against the local, disposable database.

**What is seeded, and why.** No person-facing step drafts a section from a Vault version: the span is written by AnA's
drafting (`authoring-section-seed.ts`). An approval needs a complete review route and a signature. So the walk seeds,
as the database superuser:

- three versions of one document, v1, v2 and v3, chained by `supersedes_id`;
- one `vault_document` span in section 2.5.3 of the Module 2.5 Clinical Overview, citing v1;
- v2's lifecycle record in review;
- for step 2, v3 with its record approved.

The lifecycle guard refuses a stage change that has no lifecycle event of its own. The first attempt, an UPDATE from
review to approved, was refused. The walk does not fabricate events, so v3's record is seeded at approved instead.
The writers are pinned by their own tests. What this walk shows is the reading path, through the running server and
page.

1. While v2 is in review, `GET /source-changes` lists nothing for the section.
2. With v3 approved, it lists the section. It names v1 and the approved 3.0, and passes over v2, which is still in
   review.
3. Evidence's data room names it (`evidence-vault-changes-1440-light.png`).
4. The same at 390 dark, with no sideways scroll (`evidence-vault-changes-390-dark.png`).

On trunk's route, the walk stops at step 1 because the reply carries no `vaultChanges` (`red.log`, `walk-red.json`).

## Next in S12

- **The deliverable's owner and due date.** These come from the work project (`projects.owner_id`) and its existing
  tasks, with no new column.
- **The editor rail.** A section drafted from a replaced Vault version could say "replaced since approved" there, as
  data-room citations do.
