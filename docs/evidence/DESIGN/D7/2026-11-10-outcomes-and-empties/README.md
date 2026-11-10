# An outcome is a toast, a write keeps the register on screen, and an empty line is the shared quiet one (2026-11-10)

Package **D7**. The Quality sweep's commit **C3**: findings `sop-notice-as-empty`, `records-5`, `records-6`, and the
notice and empty-line parts of `styles-honest-notice`, each confirmed by an independent skeptic. One more defect was
found walking it.

## What already exists (RULE 3), and what changed

| Path | Before | After |
|---|---|---|
| `SopRegister.tsx`, `ChangeControl.tsx`, `QmsRecords.tsx` | A write's outcome, refusals included, was a grey line inside the table, under the column headers, in the same place and tone as "nothing here" | The shared toast (`v2/toast.tsx` `useToast`/`C2CToast`, used as-is). A confirmation is a polite status; a refusal (a controlled copy the server refused, one the browser could not save) is an alert. |
| `QmsRecords.tsx` | `loaded = rows !== null && !read.loading`: every write's re-read blanked the register to "Loading the register…" and unmounted the open detail, with its confirmation | `loaded = rows !== null`: the rows the register has stay on screen while it re-reads |
| `CapaActions.tsx`, `ReviewActions.tsx` | Each kept its confirmation in local state, lost when the register re-read | Each hands its confirmation to the register (`onChanged(text)`), which toasts it. "The server did not return the action items." is an `ErrorState` with Try again, not a grey line. |
| The three registers, the periodic-review, training and expiry sections, the action items and linked records | Loading and empty lines were Quality's own centred `.qms-empty`/`.qcc-detail-empty`, under column headers over nothing | The shared `EmptyState` (busy while loading), drawn as one quiet left-aligned line by the work-area rule. A table renders only when it has rows. `.qcc-detail-empty` is deleted. |
| `changeHooks.ts` `useChangeSummary`, `ChangeControl.tsx` (**found on the walk**) | A raised change appeared in the log while the figure line above it still counted the log as it was ("1 open of 1" over two rows): the summary read was never refreshed | The summary exposes `refresh`, and every write that re-reads the log re-reads the figures too. An empty log is said once, by its empty state; the figure line no longer repeats "No changes in the log yet." |

## Acceptance (the running app)

`w8-states.cjs`, `w8-states.log.json`, at 1440 and 390:

- On SOP, CAPA and Change control, every empty line is the shared `.c2c-empty-state`, left-aligned. No `.qms-empty` or
  `.qcc-detail-empty` is left, and no table shows headers over nothing.
- No sideways scroll. No API or page errors.
- A change raised through the drawer: the toast says "CC-QS-40663 was raised as a proposed change.", the log shows the
  new row, and the figure line says "3 open of 3 in the log" over 3 rows (`shots/w8-change-toast-1440.png`).

## Tests

Red first (`red.txt`):
- the register stays on screen while a re-read is in flight;
- a refused controlled copy is an alert, not a line in the table (red against the previous register);
- the change figures re-read after a raise (red without the refresh).

Green (`green.txt`): 32 files, 350 tests. The suites read confirmations from the toast. `ChangeControl.test.tsx` reads
the empty log once, with no headers.
