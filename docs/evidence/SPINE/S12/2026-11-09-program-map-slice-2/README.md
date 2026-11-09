# S12 gap 5, slice 2: a work project is assigned to produce a Vault document, checked on write and on every read

**Package:** S12 (founder decisions P-83, P-109), with S9 for one call in the task route, D3 for one CSS rule and F1
for one registry prefix. **Ruling:** the coordinating session, 2026-11-09, with three conditions (below). The work project's family is an *assignment*, said as one. It is never
shown as lineage: the map's "Which work project produced each version is not recorded yet." stays true and stays said.
**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

## What already exists (RULE 3)

| Piece | Path | Does | Did not |
|---|---|---|---|
| The Plan's assign | `surfaces/PlanAssign.tsx` `AssignAction` (its `buildBody`), POST `/api/tasks/tasks`, table `unified_tasks` (`module_data`) | A work project's owner and due date (`../2026-11-09-work-project-owner-and-due/`) | Name what the work project produces |
| Vault families | `vault.documents` (`program_id`, `document_code`); `vault/vault-version-family.ts` `supersededSql`; `document-data-disposition/eligibility.ts` `vaultDataEligibleSql` | A family's current live version, by the Vault's own predicates | Answer "is this code a family of this program?" for anything outside the Vault |
| The program's map | `clinical-regulatory-evidence/vault-citation-changes.ts`; GET `/api/c2c/projects/:id/source-changes` (`vaultFeeds`) | The filing's Vault-fed sections and their standing (`../2026-11-09-program-map-slice-1/`) | List the program's families |
| The S6 Vault tree | `vault/**` | The Vault's folders and documents | Serve the picker: see "Why not the Vault tree's read" |

There is no new table, column, route, store or screen. The family rides in the Plan task's existing `module_data`.

## Why not the Vault tree's read (the coordinating session's condition 3)

The families come from this slice's own `source-changes` read (the program's map), not from S6's Vault tree read:

- the tree's read is capped;
- it serves the uploads page only;
- its file is S6's, and this slice was ruled "no Vault edit".

A third list of a program's Vault documents is not to be added. A later picker reads `vaultFamilies` from the map.

## The coordinating session's conditions (2026-11-09)

1. **One predicate set.** `listVaultFamilies` and `vaultFamilyInProgram` are one query, `readFamilyHeads`, in
   `vault-citation-changes.ts`. One code filter narrows it to a family. The list and the write-side check therefore
   cannot disagree.
   - A test proves it: each family the list offers passes the check at the same version. A deleted, withdrawn or
     superseded one is in neither.
   - A mutation shows the test catching a disagreement (`families-mutations.log`).
2. **Truncation is said.** When `vaultFamiliesTruncated` is true:
   - the picker says "Showing the first N Vault documents.";
   - the re-check says "could not be checked", never "gone".
3. **The choice is recorded.** This README, above.

## What changed

1. **One check (item 1, `0d6d3f7f3`, `31d32709a`).** `vault-citation-changes.ts`:
   - `vaultFamilyInProgram`: the family's current live version in this organisation's program, or nothing. An unknown
     family, another program's and another organisation's all get the same nothing.
   - `requireAssignedVaultFamily`: the program is the task's own work project's, through `programOfProject`. A body
     `programId` that differs is refused.
2. **The write (item 2, S9, `a090c330e`).** POST `/api/tasks/tasks` (`taskManagement.routes.ts`) calls that check
   after admission, on the request's transaction. A family not in the program is a 409 `VAULT_FAMILY_NOT_IN_PROGRAM`,
   "That Vault document is not in this project’s Vault. Nothing was assigned.", and nothing is written.
3. **The read and the row (item 3, this change).**
   - **The read.** `listVaultFamilies` lists the program's families by their current live version, through the
     check's own query (condition 1). It is capped at 300 and says `truncated`.
   - **The route.** GET `/source-changes` adds `vaultFamilies` and `vaultFamiliesTruncated` to the map's one read.
   - **The row.** In `ProjectCoreWork.tsx`, each work project row:
     - says what its newest assignment names, re-checked on this read:
       - "Assigned to produce Drug substance specification (current v2.0)";
       - "The assigned Vault document (CODE) is no longer in this project’s Vault." (warn), when the complete list
         lacks it;
       - "…could not be checked." (warn), when the list was cut short or the map could not be read. A shortened list
         never says "gone".
     - to a person who may write (`AssignAction`'s own `canGovernedWrite` rule), offers "Vault document it produces"
       beside Assign:
       - "Not named", then each family by title, code and version (titles repeat across families);
       - "Showing the first N Vault documents." when the list was cut short;
       - it starts from the family already assigned, so assigning another person keeps it;
       - the chosen code goes into the task's `moduleData.vaultDocumentCode` (`buildWorkProjectTaskBody`).
   - **`project-home-v2.css` (D3).** The picker wraps under the row and never widens it past the page.
4. **The launch-scope gate (F1, the coordinating session's request).** `ci:launch-scope-api` was red on trunk:
   `[unmapped] /api/project-hierarchy/:p/children`, called by project home since S12's work projects
   (`launch-scope-api-red.log`).
   - The fix: `ui-surface-registry.ts` declares `/api/project-hierarchy` on the project-home surface. Project home is
     the namespace's only client caller.
   - The gate then passes: 636 paths, none refused (`launch-scope-api.log`).
   - The 12 launch-scope and entitlement middleware suites pass, 142 cases.

## Red first

- **The check (item 1).**
  - `vault-family-in-program.pglite.test.ts`: on trunk the four cases fail (`check-tests-red.log`); with the check
    they pass (`check-tests.log`).
  - Three mutations each fail a case (`check-mutations.log`): withdrawn data still counting (no
    `vaultDataEligibleSql`), a superseded version counting (no `supersededSql`), and the read not held to the
    organisation and program.
- **The write (item 2).** `task-management-vault-family.test.ts` fails on trunk's route (`route-red.log`) and passes
  with the call (`route.log`). The task route's 29 suites, 365 cases, still pass (`task-route-suites.log`).
- **The families read (item 3).** The same pglite file gains two cases:
  - "lists the program's families by their current live version, the same rule, and says when the list was cut";
  - "offers exactly what the check admits" (condition 1).

  Both fail on trunk's service and the other five pass (`families-red.log`). The three server files pass together,
  14 cases (`server-tests.log`).
- **The row (item 3).** `__tests__/projectWorkProjects.test.tsx` gains one case:
  1. The picker lists the families, and choosing one sends `moduleData.vaultDocumentCode`.
  2. The row says "Assigned to produce …".
  3. Read again, the picker starts from it.
  4. A person who may not write sees the line and no picker.
  5. The line says "no longer in this project’s Vault" for a complete list, and "could not be checked" for a cut one
     or an unread map.
  6. A cut list's picker says "Showing the first 1 Vault document."

  On trunk's `ProjectCoreWork.tsx` that case fails and the other 7 pass (`ui-red.log`). With the change, all 8 pass
  (`ui.log`). Four mutations each fail it (`ui-mutations.log`):
  - "gone" for a cut list;
  - the picker offered to a person who may not write;
  - the picker starting at "Not named";
  - no "partial" line for a cut list.
- **Gates.**
  - `ci:sql-interpolation` passes (`sql-gate.log`). The new read uses the approved Vault builders under the existing
    caller entry.
  - The CSS gates pass (undefined classes, selector shadowing, shell collisions, design system).
  - `typecheck:fast` reports nothing in these files.

## In the running app

- **The route.** GET `/api/c2c/projects/<C2C-101>/source-changes` answers 200. It lists 18 families, not truncated,
  and an unauthenticated read answers 401 (`route-families.log`).
- **The walk.** `walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:
  1. A fresh CMC work project is added through the one intake.
  2. A task naming a code not in the program is refused: 409 `VAULT_FAMILY_NOT_IN_PROGRAM`, nothing assigned.
  3. The row says "No one is assigned to deliver it yet." and nothing about a family.
  4. The picker lists the program's families by title, code and version. One is chosen, and Assign opens the Plan's
     form (`family-picker-1440-light.png`).
  5. POST `/api/tasks/tasks` carries `moduleData.vaultDocumentCode`.
  6. The row says "Assigned to JM Smith, due Nov 30, 2026" and "Assigned to produce Drug substance specification
     (current v2.0)", read back (`assigned-to-produce-1440-light.png`).
  7. At 390 dark it says the same, and the picker starts from the assigned family (`assigned-to-produce-390-dark.png`).

  The walk's first run caught the picker widening the row by 418px at 390. It was sized by its longest option. The D3
  rule above fixes that, and the walk now checks there is no sideways scroll.

## After the D0 §8.6 page frame (`35f5fb4747`, re-walked 2026-11-09)

The coordinating session's one page frame changed the project page's width and padding: max 1120, padding 32/40.
`walk.cjs` was run again unchanged, on trunk with the frame (`walk-after-frame.log`). All six steps pass:
- a code from outside the program is refused (409);
- the picker lists the program's families by title, code and version;
- Assign files the chosen family;
- the row reads it back;
- at 390 dark the picker starts from the assigned family, with no sideways scroll.

The screenshots and `walk.json` in this folder are now from this run. The family picker stays inside its row in the
frame's right column at 1440 (`assigned-to-produce-1440-light.png`) and at 390 (`assigned-to-produce-390-dark.png`).
