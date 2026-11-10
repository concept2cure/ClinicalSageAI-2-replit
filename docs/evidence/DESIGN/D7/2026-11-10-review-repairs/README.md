# Repairs from an independent review of the Quality pass (C1 to C5) (2026-11-10)

Package **D7**. The four Quality commits that landed today (`0561109d1` C1–C2, `1a69d42a1` C5, `ff2a66369` C3,
`3f2ab6ad1` C4) were reviewed by three independent readers, on honest state, doors and tests. A skeptic checked each
finding against the code before it counted. Result: 23 confirmed, 2 refuted (`review-findings.json`). This commit
repairs all 23.

## What was wrong, and what changed

**Doors**

| Finding | Before | After |
|---|---|---|
| C5-1 (high) | A reviewer's or approver's notice was meant to open the review route at their turn. It decided the turn from the single-document read (`GET /qms/documents/:id`), which never carries the route, so it could never fire in the running app. The test passed only because its mock added a field the server does not send. | The turn is decided from the register row, which carries the route. The notice waits for the register read. The test's single read is the server's shape, and a second case pins "not your turn: the document opens". |
| C5-5 | A notice for a legacy entry past draft still landed on the editor's "no editing copy" | The notice opens every other document through the same `openDocument` the rows use |
| C5-3 | The periodic-review row's door moved to the editor. The editor read is refused to a trainee without an authoring grant, and that refusal said "could not be opened" with a useless Try again. | A refused editor read (403, or 409 with no editing copy) is said as a refusal with no Try again, and offers "Read its controlled text" in the reader (`ControlledDocumentWorkbench` `onReadText`; `qmsDocuments.ts` `QmsRequestError` carries the status and code) |
| C5-4 | The periodic-review row's Open was disabled whenever the register was unread, with no reason | Without the register, it opens the reader the schedule names |
| C5-2 / honest-open-legacy | The code comment, commit and README said a legacy entry past draft opens "read-only". The reader keeps "Edit controlled text" for a governed writer. | The comment and the C5 README say what it does. The second edit path waits on a decision (`dialogs-3`), and the reader's drawer and title are C16. |

**Honest state**

| Finding | Before | After |
|---|---|---|
| C2-2 | "No document is assigned for training yet." when documents were assigned, to nobody active | "No one assigned to train is an active member.", the coverage figure's own words |
| C2-3 | The expiry line said the assignment count "could not be read" while that read was still in flight | While reading: "Reading who is assigned to train…". "Could not be read" only when it was not read. |
| C1-2 | A retired row past its signed date showed "Overdue" under a figure line saying "none overdue" | Only a document the review schedule can hold (effective, in review, or a draft with a version in force) is overdue: the server's rule |
| C2-1 | While the schedule read failed, the register's overdue count was derived from the register and missed a version in force under revision | The register says nothing about overdue until the schedule is read |
| C4-1 | A failed totals read said "could not be read" right above the log's own failure panel, and the log's Try again did not re-read the totals | The figure line is silent while the log reports its failure, a refused summary is said in the classifier's words, and the log's Try again re-reads both |

**Tests that could not fail, now able to**

- The expiry all-clear under an empty register now runs its branch: the expiry read and the summary are stubbed.
- The Form's "Open" is clicked and lands on the editor read.
- The change log's failed and loading cases look for the current empty-log words.
- C2's headline, a failed schedule shown as itself, now has its own case. That case's Try again re-reads the schedule,
  not the register.
- The stale "No documents due for review." guard became `/none is due for review/i`.
- The refused controlled copy is checked as the toast (`.de-toast`), not by a class the register no longer has.
- The periodic-review and legacy-open comments claim what their assertions check, and cite where the rest is pinned.

## Tests and the running app

Red first (`red.txt`): the four cases aimed at real defects (the route notice, the failed schedule, the expiry
states, the refused editor read). The strengthened guards pass on both versions, as guards should. Green (`green.txt`):
33 files, 363 tests. No type errors under `quality/`. Re-walked (the SOP tab at 1440 and 390, light and dark, and the
legacy entry's Open): no API or page errors.
