# D7-B item 6: a register row is one line, its next step and "More" (2026-11-10)

Package **D7** (`.design/claude-convergence/D7.md` §B.4 item 6). Completes
`client/src/concept2cure/quality/SopRegister.tsx`. Follows `../2026-11-06-quality/` (one header, no tiles, no type cards).

## What already exists (RULE 3)

| Piece | Path | Before | After |
|---|---|---|---|
| Register row | `quality/SopRegister.tsx` (inline in the register's `map`) | Every action stacked in a 150px last cell: Open document, Training, Review route, Approve, Revise, Record review, Retire, Controlled copy, History, Ask AnA. Rows were 192px. | `quality/SopRegisterRow.tsx`, split out of the register into the same folder (RULE 6: split, don't add). Shows the document's one next step and "More"; "More" reveals the rest in the row on its own line, with the same buttons, names and handlers, and no new menu component. |
| Row helpers | `SopRegister.tsx` `NextReviewCell`, `approvableBy`, `RouteLine`, `TrainingChip` | In the register | Moved with the row; `TrainingChip` is now the row's "Training" action |
| Read button | `quality/TrainingCoverage.tsx` `DocumentReadButton` | Rendered "Open document" / "Read and acknowledge" in the row | **Deleted**. The row's `read` action has the same label, title, disabled rule and handler. Reachable: `QualityWorkArea.test.tsx`, `SopRegisterPersonalTraining.test.tsx` ("Read and acknowledge" opens the reader). |
| Author | `qmsDocumentRecord.ts` `adaptDoc` | `author_id` came back from `GET /api/mdx/qms/documents` (`SELECT *`) and was dropped | Mapped to `QmsDoc.authorId` |

## The next step, by state

| State | Next step shown | Under "More" |
|---|---|---|
| Draft | Send for review | Open document, Training, History, Ask AnA |
| Under review, my turn or no route and I am not the author | Approve | Open document, Training, Review route, Revise, Record review, History, Ask AnA |
| Under review, otherwise | Review route | the rest |
| Effective | Read and acknowledge | Training, Revise, Record review, Retire, Controlled copy, History, Ask AnA |
| Superseded, retired | History | the rest |

**A fix found on the walk.** The author of a document under review with no route was offered "Approve" as the row's
next step. The server refuses the author's approval (separation of duties), and the approval dialog's own text says
so, so the button could only ever be refused. `approvableBy` now withholds it from the author. The author's next step is
the review route. The proof is `QualityWorkArea.test.tsx` "does not offer its author an approval the server refuses",
which is red without the fix (`red-author-test.txt`).

## Acceptance (the running app, as the runtime role with RLS on)

`w4-rows.cjs`, measured in `w4-rows.log.json`:

| | Author 1440 | Author 390 | Approver 1440 | Approver 390 |
|---|---|---|---|---|
| Row buttons, More closed | number, Review route, More | same | number, Approve, More | same |
| Row height | 79px (was 192) | 79px | 79px | 79px |
| Table scrolls inside itself | 0px | 678px (contained) | 0px | 678px (contained) |
| Page scrolls sideways | 0 | 0 | 0 | 0 |
| API / page errors | none | none | none | none |

History opened from "More" ("Version history of QS-SOP-001").

The 79px is the status cell: a document under review on no route carries the designed label "Not assigned to one
person." under its pill (`REVIEW_ROUTING_2026-10-23.md` keeps that wording), on two lines in a 120px column. A row with
no route line is one button high. The grid's fixed tracks are 776px. That leaves the title its 160px floor
(`registerGrid.ts`) inside the 1038px table a 1440 window gives the page, so the row fits there without scrolling.
Before this change it scrolled 24px and clipped "More".

During the walk, `/api/task-management/my-work` answered 500 on every page. The cause was this local database
missing `unified_tasks.parent_task_id` (`migrations/20261109_unified_tasks_parent_task.sql`). `npm run
db:migrate:deploy` applied it, and the re-walk had no API errors. It was an environment gap, not a product defect.

## Tests

- **Red first.** The new row test fails against the previous register: the row had 8 buttons where the new one has 3
  (`red-row-test.txt`). Twelve existing tests failed against the new row because they clicked an action now under
  "More" (`red-existing-tests.txt`). Each now opens "More" first through one helper, `openMore`, and still proves what it
  was written to prove.
- **Green.** `green.txt`: 30 files, 335 tests across `quality/**`, `sopRegisterReadHonesty` and `anaDrivesWave4`.

## Open, same package

- **Phone.** At 390 a register row is still a wide grid that scrolls inside its section, so the next step and "More"
  sit off to the right until scrolled. Which columns a register sheds on a phone is the design question `registerGrid.ts`
  leaves open. It is the next step for Quality's registers (SOP, change control, records), together with the findings of
  the Quality sweep running now.
