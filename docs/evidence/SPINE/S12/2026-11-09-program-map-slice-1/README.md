# S12 gap 5, slice 1: the program's map across its projects, without attribution

**Package:** S12 (founder decisions P-83, P-109), and D3 for two CSS rules. **Ruling:** the coordinating session,
2026-11-09: slice 1 is option C, slice 2 is option A under three conditions, and B is refused. **Session:**
`session_01FTWcmXm7At3ZXBE5VWn6oS`. **Inventory:** `../2026-11-09-program-map-what-already-exists/`.

The S11 6b global schedule, which landed at about 05:55Z, was read first (`../../S11/2026-11-09-global-schedule/`). It
is filing-level across programs: filing dates, review clocks and the next phase. This slice is inside one program's
project page, so the two do not overlap. The Reporting session was sent this design for review.

## What changed

There is no new screen, card, table or route.

- **`vault-citation-changes.ts`.** It gains `listVaultFedSections`: every section of the program with a live
  `vault_document` span, each `current` or `replaced` (with the approved version). It uses the same readers and the
  same scope.
  - `listChangedVaultCitations` is now its replaced half (`replacedVaultCitations`), so the two answers come from one
    rule.
- **`GET /api/c2c/projects/:id/source-changes`.** It adds `vaultFeeds` and `vaultFeedCount` from the same single read.
  `vaultChanges` comes from that read too. The existing keys are unchanged.
- **`ProjectCoreWork.tsx`.** Under the work projects, Project knowledge's Work areas card now shows "Drafted from the
  Vault":
  - a count sentence, for example "1 section of this filing was drafted from Vault versions; 1 was replaced since
    cited";
  - then **"Which work project produced each version is not recorded yet."**;
  - then each section, with its Vault document, the version it was drafted from, and its standing in words ("current",
    or "replaced since cited; v3.0 is approved").

  It is drawn only when there are rows. A failed or malformed read says "could not be checked", never "none". It is
  read only once the project's id is known.
- **What it does not claim.** Nothing in this slice ties a section to a work project. Who produced a version is
  slice 2 (option A): an assignment, said as such, checked on write and on read.
- **Its levels.** The map stays one level: the governed children read. `getTree` is not reached, and if nested work
  projects are wanted it is reached and fixed (program-admitted, carrying `workKind`), not written a second time.
  Dates come only from the Plan task's due date.

## Red first

- **The read.** `vault-citation-changes.pglite.integration.test.ts` gains one case: a section drafted from a replaced
  v1 reads as `replaced`, naming v2. A section drafted from v2 reads as `current`. The changed list is the replaced
  half of the same read.
  - On trunk's service it fails, because the read does not exist (`tests-red.log`). With the change, all 5 pass
    (`tests.log`).
- **The page.** `projectWorkProjects.test.tsx` gains one case: two Vault-fed sections, one current and one replaced,
  give the count sentence, the unattributed note and both rows in words. A reply with no `vaultFeeds` says it could not
  be checked, and no list is drawn.
  - On trunk's component it fails (`ui-red.log`). With the change, all 7 pass (`ui.log`).

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101. Its Vault-drafted section was seeded on the
local database by `../2026-11-09-editor-rail-vault-replaced/walk.cjs`, whose README says what was seeded and why.

1. At 1440 light, the Work areas card shows the work projects, each with its owner, due date and Assign.
2. Under them, "Drafted from the Vault": "1 section of this filing was drafted from Vault versions; 1 was replaced
   since cited. Which work project produced each version is not recorded yet." Then "… Module 2.5 Clinical Overview —
   C2C-101 · 2.5.3 — Drug substance specification v1.0 · replaced since cited; v3.0 is approved"
   (`map-1440-light.png`).
3. The same at 390 dark, with no sideways scroll (`map-390-dark.png`).
