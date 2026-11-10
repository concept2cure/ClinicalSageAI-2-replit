# The SOP tab is one column of quiet sections, and its figures say only what was read (2026-11-10)

Package **D7**. The Quality sweep's commits **C1** and **C2** (the plan is in the sweep's result). Each finding below was
confirmed by an independent skeptic before any code changed.

## What already exists (RULE 3), and what changed

| Finding | Path | Before | After |
|---|---|---|---|
| sop-panels-boxed-two-column, dialogs-10 | `SopRegister.tsx`, `PeriodicReview.tsx`, `TrainingCoverage.tsx`, `TrainingExpiry.tsx` | Periodic review, training and expiry sat in boxes in a two-up `.qms-grid2`, each with Quality's own `.qms-sec-head` | Each is a `section.pj-sec` with `.pj-sec-h` (h2, `.sec-sub`, `.pj-sec-acts`), one column under the register, 32px apart |
| sop-coverage-bar | `TrainingCoverage.tsx` `CoverageFigure` | A bar coloured red, amber or green at 80% and 95%, thresholds the client invented, with no word | "2 of 3 acknowledged", in words |
| sop-training-copy | `TrainingCoverage.tsx`, `SopRegister.tsx` | Every state said twice (the figure line and the section's own line); a permanent method paragraph above the rows | Each state is said once: the figure line only when there are rows to measure. The method sits in a closed "How coverage is counted". |
| sop-overdue-without-word | `SopRegisterRow.tsx`, `PeriodicReview.tsx`, `ChangeControl.tsx` | Overdue was red text, a flag icon and a red row fill | The word, `rd-chip tone-err` "Overdue" |
| sop-ids-on-screen | `PeriodicReview.tsx`, `TrainingExpiry.tsx` | "by a reviewer not recorded (signature 41)", "User #10" | "by a reviewer whose name is not on record", "A member whose name is not on record"; the id is in the element's `title` |
| sop-own-controls (part) | the three sections | "Job roles", "Record review", "My acknowledgement" were Quality's own chip and link buttons, with icons | `btn ghost small`, text only |
| sop-review-window-fabricated | `SopRegister.tsx` | A failed `review-due` read was replaced by an unwindowed derivation from the register, still headed "due within 120 days"; its error was never shown while the register read | The panel shows the schedule as read, or its failure (`sop-review-failed`) or loading line. The window is `REVIEW_WINDOW_DAYS`, the same number the read asks for. The register's own overdue count still derives from the register when the schedule is unread. |
| sop-vacuous-allclear | `PeriodicReview.tsx`, `TrainingExpiry.tsx` | Under an empty register: "0 overdue · 0 due within 120 days", "No documents due for review.", "No one's training has lapsed" | "No controlled documents yet, so none is due for review." The expiry all-clear is said only where training is assigned ("No document is assigned for training yet."; no all-clear when that is unknown). |

CSS deleted: `.qms-grid2`, `.qms-overdue`, `.qms-flag-txt`, the overdue row fill, `.qms-training-summary`, `.qms-train-bar`,
`.qms-train-fill*`, the review list's box. `surface-text-ramp.css` was regenerated.

## Acceptance (the running app)

`w6-sop.cjs`, measured in `w6-sop.log.json`, at 1440 and 390, light and dark:

- The h2s are "Controlled documents", "Periodic review", "Read-and-understood training" and "Training lapsed or lapsing
  soon", each in a `.pj-sec-h`.
- No box, two-up grid or coverage bar (0).
- No sideways scroll. No API or page errors.
- On this tenant (one document in review, no training assigned), each section says its state once: "None is due for
  review within 120 days.", "No training-controlled documents yet.", "No document is assigned for training yet."

## Tests

Red first (`red.txt`, 8 cases across five suites). Green (`green.txt`): 32 files, 347 tests. `SopRegisterIdentity` and
`SopRegisterPersonalTraining` read the figure in words.

## Next

C3 makes outcomes toasts and turns these empty lines into the shared quiet `EmptyState` (left-aligned, as the work-area
rule draws it). C4 says a refused read as itself. C5 makes every "Open" reach the one editor.
