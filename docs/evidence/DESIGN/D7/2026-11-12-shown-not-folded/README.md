# D7 · What Quality showed is on the screen, not behind a closed disclosure (2026-11-12)

Package **D7**, under founder decision **P-122** rule 2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`): no session puts behind a
closed disclosure a metric, workflow, verdict, action or record a screen showed. Two things in Quality were folded
that way by this lane's own restyle of 2026-11-10, and this change opens them again. It also answers the trunk-CI
lane's handoff in `.design/claude-convergence/COORDINATION.md`: three classes in `quality/**` rendered with no rule
in any built chunk.

## What already exists

- **The change procedure's five steps**: `client/src/concept2cure/quality/ChangeControl.tsx`, "How a change is
  raised", an ordered list under the change log. Until 2026-11-10 it was a boxed panel beside the forms, always on
  the screen. The restyle (`a65f886a7`, `6f651cc23`, `0561109d1`) made it a `<details>` closed by default.
- **How training coverage is counted**: `client/src/concept2cure/quality/TrainingCoverage.tsx`, one paragraph. It was
  a permanent line above the rows; C1 moved it under them, closed.
- **A change's target date**: the Change control log's Target column, a formatted date in plain text.
- **The three classes**: `tbody.qcc-change` (a change's rows), `tbody.qms-doc` (a controlled document's rows) and
  `tr.qms-row-more-tr` (the row that holds a record's further actions), all set by `SopRegisterRow.tsx`'s
  `RegisterBody` and its callers, and used by tests and walks as hooks.
- **P-122's inventory of Quality**: `docs/evidence/DESIGN/P-122/inventory/qms-reporting-device.md` (Q6, the change
  procedure).

Nothing new: no screen, route, mount or table.

## What changed

| | Before | After |
|---|---|---|
| "How a change is raised" | closed; the five steps one click away | open; a person can close it |
| Its five steps | an ordered list with no numbers (the base reset removes them) | numbered 1 to 5 |
| "How coverage is counted" | closed | open; a person can close it |
| A change's target date | plain text; it could wrap inside a narrow column | a `<time datetime="…">`, on one line (`tbody.qcc-change time`) |
| A document's facts on a phone | wrapped inside the scrolling table | one line each; the title still wraps (`tbody.qms-doc td:not(.qms-title)`, at 640px and under) |
| The "more actions" row | its own gap above it | the same rule as the actions row: no gap (`tr:is(.qms-row-acts-tr, .qms-row-more-tr)`) |

## Tests

`client/src/concept2cure/quality/__tests__/ChangeControl.test.tsx` and `QualityWorkArea.test.tsx`:

- how a change is raised is shown open under the log, with no AnA button of its own;
- a change's target date is marked as a date (`<time>` with its `datetime`);
- the SOP tab's coverage method is open.

`red.txt`: the three cases fail before the change. `green.txt`: Quality's suite, 31 files and 411 tests (it includes
the cases of `../2026-11-12-training-lists-re-read/`). `ci:undefined-css-classes`, `ci:check-css-selector-shadowing`,
`ci:check-shell-css-collisions` and the surface text ramp check pass.

## Walked in the running app

`w42-shown-not-folded.cjs` (`shots/w42-shown-not-folded.log.json`) ran as the approver at 1440 and 390, through every
Quality tab, with no page error and no failed request.

1. **Every disclosure in the work area** was listed on each tab. There are two, and both are open at both widths:
   "How coverage is counted" (SOP register) and "How a change is raised" (Change control). No other tab has one.
2. **The change procedure** (`shots/w42-how-a-change-is-raised-1440.png`, `-390.png`): five numbered steps under the
   log.
3. **The coverage method** (`shots/w42-how-coverage-is-counted-1440.png`, `-390.png`): the paragraph under the rows.
4. **A target date.** No change in the walk's organization had one, so the walk gave CC-W31-451228 a target date
   through the edit route, as the Edit drawer does. The log shows `2026-12-15`, `datetime="2026-12-15"`,
   `white-space: nowrap`, one line, at both widths.
5. **A document's facts at 390**: each fact but the title computes `white-space: nowrap`.
6. **The actions row and the "more" row** both compute `padding-top: 0px`.

Run it from this folder with `NODE_PATH=$(npm root -g) node w42-shown-not-folded.cjs`. It needs `WALK_PASSWORD` and a
running server.

## Not changed, and why

- **P-122's Q5** (a list of document types on the SOP tab) stays the Template field of "New controlled document":
  a per-type start is refused by RULE 4.
- The record registers' "more" disclosure per row is not a folded fact: it holds a record's further actions, and
  the record's facts and next step are on the row.
