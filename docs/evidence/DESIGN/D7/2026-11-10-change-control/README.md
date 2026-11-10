# D7-B: Change control is one log section, with no tiles and no guidance box (2026-11-10)

Package **D7** (`.design/claude-convergence/D7.md` §B.4 step 7). Completes `client/src/concept2cure/quality/ChangeControl.tsx`.
Findings `change-2` and `change-3` of the Quality sweep, both confirmed by an independent skeptic before any code changed.

## What already exists (RULE 3)

| Piece | Path | Before | After |
|---|---|---|---|
| Lifecycle | `quality/ChangeFlow.tsx` | A boxed "flowchart": six count tiles joined by arrows, each with a dot from a private hex palette (`#b6b1a2` … `#6f8c5a`), an orange selected border, two off-ramp chips beneath, and an "Explain the pipeline" link to AnA. It sat in a separate section, "Change-control lifecycle", above the log, with a "Clear filter" button. | The log's stage filter: one D0 `.seg` (`role="group"`, "Lifecycle stage"), with "All" then each stage and its count. Each stage keeps its accessible name ("Proposed: 1 change. Change request raised."). "All" is the clear. It is shown once the log has been read and holds changes: an unread log shows no zeroes, and an empty one has nothing to filter. |
| Log | `quality/ChangeControl.tsx` | Two sections: lifecycle (figures, create) and log (a bare `qms-sec-head` with a count) | One `section.pj-sec`, "Change control log": the figures as one line, then "Prepare reviewed learning" and the one "Raise change request" in `.pj-sec-acts`, then the stage filter and the rows |
| Guidance | `quality/ChangeControl.tsx` | A boxed "How to raise a change" panel in a two-column grid, with five numbered circles, an orange filled "Explain the procedure" (a second orange fill on the page) and "Find the controlled procedure" | A closed `<details class="pj-more">` "How a change is raised" at the foot of the log, with the same five steps (D5 §WA.4.2 rule 8) |
| Forms | `quality/ChangeControl.tsx` | A bare `qms-sec-head` | A `section.pj-sec` with `.pj-sec-h` and its `.sec-sub` |
| Starters | `quality/App.tsx` | Change control's third starter was the health check, which asked what the read-out already asks | The read-out folds in "ranked by risk"; the third starter is "Explain the change procedure", with the retired button's prompt verbatim (`CHANGE_PROCEDURE_PROMPT`) |
| Styles | `quality/app.css` | `.qcc-flow*`, `.qcc-node*` with six hex colours, `.qcc-arrow`, `.qcc-offramp*`, `.qcc-train`, `.qcc-step-n`, `.qcc-train-acts` | Deleted. The stage count is a quiet `.qcc-stage-n`, and the steps are a plain list. `surface-text-ramp.css` was regenerated. |

## Capability kept

| Removed | Where its outcome lives now |
|---|---|
| Six count tiles and two off-ramp chips | The stage `.seg`: the same counts, the same filter, the same names |
| "Clear filter" | "All" |
| "Explain the pipeline" (AnA) | The first starter, the read-out: where changes sit, what awaits approval, what is overdue, ranked by risk |
| "Explain the procedure" (AnA) | The third starter, the same prompt; AnA explains and never attests |
| "Find the controlled procedure" (AnA) | The SOP register, the tab beside this one, where the procedure is read and acknowledged; AnA's `quality.open-tab` reaches it |
| The health check starter | Folded into the read-out (the same three asks, now ranked by risk) |

## Acceptance (the running app)

`w5-change.cjs` raised `CC-QS-001` through the governed route (201), then measured (`w5-change.log.json`):

- One `h1` ("Quality"). The `h2`s are "Change control log" and "Change-control documents and forms".
- No tiles, no flow, no guidance box (`.qcc-node, .qcc-flow, .qcc-train`: 0).
- Figures: "1 open of 1 in the log; none awaiting approval; none in implementation; none overdue."
- Stages: All, then Proposed 1 and the rest at 0. Selecting Proposed presses it.
- "How a change is raised" is closed until opened.
- No sideways page scroll at 1440 or 390. No API or page errors.

## Tests

Red first (`red.txt`, 5 cases): the stage filter as one `.seg`, "All" clearing it, the procedure as a closed disclosure,
the starters on the Change control tab, and no AnA button of the log's own. Green (`green.txt`): 31 files, 341 tests.
`anaDrivesWave4`'s `quality.filter-changes` and `quality.open-change` cases pass unchanged, because AnA drives the
same stage state.

## Open, next

`change-1` (confirmed): the change record's description, reason, impact assessment and implementation plan are not
shown anywhere in Quality, so an approver signs without reading them. The fix completes the expanded row with those
fields and an "Edit assessment" (while proposed or under assessment) through the existing `PATCH` route. It is the next
commit. The change rows' own chip buttons ("→ Advance", the icon-only ✻) are part of the sweep's shared row-controls
finding.
