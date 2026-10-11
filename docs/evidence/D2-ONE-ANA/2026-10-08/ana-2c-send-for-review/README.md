# ana-2c — Authoring sends a document for review; the reviewer opens that document

Launch row **D2**. Build order step 3 of `docs/SURFACE_DECISIONS_2026-10-08.md`.
Design: `docs/design/ONE_ANA_ONE_CANVAS.md` §4.7 and slice 19.

## What was wrong

Checked on 2026-10-07 (`0-inventory/authoring-review-records.json`, items
`document-authoring` and `review`):

- Nothing in the client called `POST /api/authoring/documents/:id/request-review`
  (`server/routes/authoring.router.ts:3248`). The workbench's "Assign review"
  created a task (`POST /api/tasks/tasks`). The Review board reads
  `authoring_reviews` (`server/services/review/authoring-review-board.ts:296-303`)
  and does not read tasks. So an authored document never reached the board, and
  the board was empty for every new organisation.
- The Review board's "Open in editor" and "Sign in the authoring workspace" called
  `onNav('document-authoring')` with no document. The reviewer landed on the
  document list and had to find the document again.
- In the document's Tasks rail, a task that needed a signature said the ceremony
  "runs on the Task board" and offered to go there, away from the document.

## What changed

- `editor/SendForReviewDialog.tsx` (new). One act, in this order:
  1. `POST /api/authoring/documents/:id/request-review` with
     `{ reviewers: [{ id, name }], reason }` (`:130`, `:191`). The id is the
     roster's `users.id` as a string (`GET /api/task-management/assignees`). The
     board matches a reviewer by `reviewer_id` against the session's user id, or by
     email (`authoring-review-board.ts:415`). The roster carries no email, so none
     is sent.
  2. Only after the server returns review rows for this document and every chosen
     reviewer (`confirmedReviews`, `:163`): one review task per reviewer the
     request actually asked, that is, whose row came back pending (`:429`,
     `createTasksFor` `:215`). The task is made through `AssignReviewDialog`'s
     create and confirmation, so the request also appears in each reviewer's My
     work.

  The dialog shows the server's rows: reviewer, state, request id (`SentReceipt`,
  `:353`). It shows each task as created, not created, or unknown, and says which.
  A request is never reported when only a task was made.
- The reason is required. The route accepts an optional reason
  (`optionalGovernedReason`: absent, or 8 to 2000 characters after trimming). A
  review request is a governed act, so the dialog requires the reason at that
  floor (`reviewReasonProblem`, `:122`). The reason goes on the audited
  `review_requested` row and into each task's description. AnA has no path to
  this act. Only the person's click sends it.
- A refusal is shown in the server's words ("The review request was refused: …").
  A 5xx or lost response is shown as unknown: no task is created, Send stays
  disabled, and "Check the Review board" is offered. A success that names another
  document is not accepted as a receipt.
- `editor/DocumentWorkbench.tsx:3814-3830`. The header's "Assign review" is now
  "Send for review" and opens the new dialog (`:5712`). The access gate is
  unchanged (`docAccess.assignReview`, the task create's gate, part of the same
  act).
- `editor/ReviewTasksPanel.tsx`. The rail offers "Send for review" in place of
  "Assign review" (`TasksBar`, `:528`). A 428 `ESIGN_REQUIRED` completion now
  opens the signing dialog in place (`:590`, `:686`). The panel cannot send the
  signer to the Task board.
- `editor/TaskSignOffDialog.tsx` (new). The task sign-off over the shared
  `EsignModal`: meaning, reason, password, and the authenticator code when one is
  enrolled. It sends the same `PATCH /api/tasks/tasks/:taskId` again with the
  signature, which the server re-verifies (`task-signoff.ts` →
  `part11/reverify-signer.ts`). "Completed" is reported only after the server
  confirms it. A lost response is reported as unknown, and the list is re-read.
- `surfaces/Review.tsx:159` `openReviewDocument`. "Open in editor" (`:981`), the
  sign-off button (`:848`, now "Open the document to sign") and the AI comment's
  button (`:1024`) set the editor target to the document id (`editorTarget.ts`,
  the channel Vault's "Open in editor" uses), then open the editor. When the
  document belongs to another program, that program is opened first. The
  editor's list is scoped to the open program.
- `editor/AssignReviewDialog.tsx`. The roster read, the reviewer checklist, the
  task body, the create and its confirmation are exported, so the new dialog
  reuses them. There is still one task-write implementation.

### Review round (same day)

Five findings were raised against the first version. Each is fixed here, or, for
the canvas card, handed over as a verified patch.

- **A task whose answer was lost read as "no task".** `taskLine`
  (`SendForReviewDialog.tsx:333`) printed "no task" for every failed outcome,
  and the toast counted an unknown task as not created ("0 of 1 review tasks were
  created"). Now a task has three outcomes: created, refused, unknown
  (`tasksSentence`, `:231`). An unknown task reads as unknown in its line and in
  the toast ("Review tasks: 1 with an unknown outcome. Check the task list before
  sending again."), and is never counted as not created.
- **A second request to a reviewer who had decided reopened nothing, but it
  made a task and said "requested".** The route keeps an existing row's verdict:
  `ON CONFLICT … DO UPDATE SET requested_at` (`authoring.router.ts:3275`). The
  board lists a document as awaiting a reviewer only while their row is pending
  (`authoring-review-board.ts:461`). Now the dialog reads the document's review
  requests first (`useDocumentReviews`, `ReviewTasksPanel.tsx:362`, called at
  `SendForReviewDialog.tsx:388`). A member who already has a request is shown
  with it and cannot be chosen: "Already asked on <date>; their review is
  pending.", or "Changes requested on <date>. A new request does not reopen a
  recorded verdict, so they cannot be asked again here."
  (`AssignReviewDialog.tsx:286`, `:339`). If that read fails, no one can be
  chosen, and "Read them again" is offered. A row that still comes back with a
  verdict (a request made in between) gets no task, and the receipt and the toast
  say its verdict stands and was not reopened (`receiptHeadline`, `:342`;
  `sentToast`, `:245`). When nothing was reopened, the receipt says so, with a
  warning icon, not a check.
- **The task and the review request never reconciled.** Completing a review task
  recorded no verdict, and a verdict did not close the task. Nothing on the server
  joins the two. Now the Tasks rail reads the document's review requests beside
  its tasks (`ReviewTasksPanel.tsx:641`, both re-read together).
  `taskReviewState` (`:402`) and `reviewStateNote` (`:414`) decide what a review
  task says:
  - while its assignee's review is pending, Complete is not offered (`:451`). The
    row says "Completing this task does not record a verdict. <Name>’s review is
    pending on the Review board; the task can be completed once the verdict is
    recorded there.", with "Open the Review board" (`DocumentWorkbench.tsx:5381`);
  - once a verdict is recorded, Complete is offered and the verdict is named;
  - a completed review task whose review is still pending says no verdict is
    recorded;
  - if the review requests could not be read, a review task is not offered for
    completion. A task that is not a review task is unchanged.

  Each task's description now ends "Record your verdict on the Review board;
  completing this task does not record one." (`SendForReviewDialog.tsx:117`).
- **The canvas card still offered a task-only "Assign review".**
  `editor/DocumentCanvas.tsx` belongs to wave 2B in this wave, so it is not edited
  here. The change is handed over as a patch, verified in a scratch copy of the
  client (see Not done). The commit message names the workbench and the Tasks
  rail, not the canvas card.
- **The sign-off confirmation showed a manifestation the client made up.** The
  time was the browser's clock and the name was the signed-in user as the client
  held it. Now `recordedManifestation` (`TaskSignOffDialog.tsx:84`) takes the last
  approval-history entry the PATCH returns, and the dialog shows its printed name
  (`:126`, `:138`) and its time. A success without one is not shown as a
  signature. It settles as unknown, and closing re-reads the task list.

Minor findings fixed here: the roster error has "Read the roster again"
(`ReadFailed`, `AssignReviewDialog.tsx:121`, shared by both review dialogs, with
`useAssigneeRoster`'s new `reload`, `:84`); `AssignReviewDialog`'s governance note
names the Tasks rail as a place the signature is taken, and says its task is not
a review request (`:477`); the AI comment's "Apply in editor", which applied
nothing, is "Open the document" (`Review.tsx:1024`).

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `__tests__/sendForReview.test.tsx`: POSTs request-review for the open document with the reviewer's user id and the reason, and shows the server's rows | fails: no `send-for-review-open` | passes |
| same: every chosen reviewer in one request, a task each | fails | passes |
| same: reviewer and reason (8 characters) required before anything is sent | fails | passes |
| same: a refusal in the server's words; no task; can send again | fails | passes |
| same: an unknown outcome stays unknown: no task, no second send, board offered | fails | passes |
| same: a success naming another document is not a receipt | fails | passes |
| same: a failed task is reported as not created; the request stands | fails | passes |
| same: an unconfirmed task offers the task list, not a retry | fails | passes |
| same: the Tasks rail offers Send for review, not a task-only assignment | fails: "Assign review" found | passes |
| `__tests__/reviewOpensDocument.test.tsx`: "Open in editor" sets the editor target to the document id | fails: target `undefined` | passes |
| same: the sign-off button opens the document to sign | fails: target `null` | passes |
| same: a document in another program opens that program first | fails | passes |
| same: the editor then opens on that document, not its first row | fails: editor opened the default row | passes |
| `__tests__/reviewTaskSignsOnDocument.test.tsx`: a gated completion opens the signing dialog in place and sends the signed transition | fails: no dialog | passes |
| same: closing without signing changes nothing and claims nothing | fails: no dialog | passes |
| `__tests__/workbenchAssignReview.test.tsx` (retargeted: 428 opens the ceremony on the document; reconciliation through Send for review) | n/a | 18/18 |
| `__tests__/workbenchA11ySweep.test.tsx` (GE-P-3 gate on the renamed controls) | n/a | 23/23 |

Review round. Red is the first version of this slice; green is this one.

| Test | Before (red) | After (green) |
|---|---|---|
| `sendForReview.test.tsx`: a task whose answer was lost is unknown in the receipt and the toast | fails: line reads "OQ Signer: no task. …" | passes |
| same: a member with a request on the document is shown with it and cannot be chosen | fails: checkbox enabled | passes |
| same: a row that comes back with a verdict gets no task and is not reported as requested | fails: 2 task creates, expected 1 | passes |
| same: when no row was reopened, nothing is reported as requested and no task is made | fails: 1 task create, expected 0 | passes |
| same: existing requests that could not be read: no one can be chosen; reading them again recovers | fails: no such state | passes |
| same: a roster that could not be read offers to read it again | fails: no way to read it again | passes |
| same: each task says the verdict is recorded on the Review board | fails: description lacks it | passes |
| `reviewTaskVerdict.test.tsx` (new): no Complete while the assignee's review is pending; the Review board offered | fails: Complete offered | passes |
| same: Complete offered once the verdict is recorded, and the verdict named | fails: nothing said | passes |
| same: a completed review task with a pending review says no verdict is recorded | fails: nothing said | passes |
| same (3 cases: refused read, no rows, rows of another document): no Complete on a review task; a non-review task keeps it | fails: Complete offered | passes |
| same: Refresh re-reads the review requests with the tasks | fails: never read | passes |
| `reviewTaskSignsOnDocument.test.tsx`: the confirmation shows the server's printed name and time | fails: shows the client's signer | passes |
| same: a success without the recorded signature is not shown as one; closing re-reads | fails: "Signature applied" shown | passes |
| `reviewOpensDocument.test.tsx`: the AI comment's button opens the document and is named for it | fails: "Apply in editor" found | passes |
| `workbenchAssignReview.test.tsx`: the lost-task reconciliation line never says "no task" | fails: "no task" found | passes |

Runs:

- `red/send-for-review.txt`, `red/review-opens-document.txt`,
  `red/review-task-signs-on-document.txt`: the first three new test files against
  the committed `DocumentWorkbench.tsx`, `ReviewTasksPanel.tsx`,
  `AssignReviewDialog.tsx` and `Review.tsx`.
- `red/review-round-*.txt`: the test files as they now stand, against the
  slice's first version (all six source files). Five files; 18 tests fail, each
  on the behaviour it pins. The tests that were already green stay green.
- `green/send-for-review.txt` (16/16), `green/review-task-verdict.txt` (7/7),
  `green/review-task-signs-on-document.txt` (4/4),
  `green/review-opens-document.txt` (5/5), `green/workbench-assign-review.txt`
  (18/18), `green/workbench-a11y-sweep.txt` (23/23).
- `green/related-suites.txt`: every test file that imports or mocks a changed
  file, or mounts the workbench, the canvas or the Review board: 47 files,
  511/511.

Gates: ESLint warnings are unchanged on every changed file (DocumentWorkbench
14/14, Review 5/5, ReviewTasksPanel 0/0, AssignReviewDialog 0/0,
workbenchAssignReview test 1/1, workbenchA11ySweep test 0/0). The new files have
0: `SendForReviewDialog`, `TaskSignOffDialog` and the four new test files.
`ci:undefined-css-classes` is OK: no new class. `ci:canvas-path` is OK. No CSS
was changed. A narrow `tsc` over the changed files reports nothing in them.

## Not done

- **The canvas card still opens a task-only "Assign review".**
  `editor/DocumentCanvas.tsx:598-607` and `:686-695` open `AssignReviewDialog`,
  which creates a task and no review request. Wave 2B owns that file and its
  tests in this wave. The change is a patch of 3 files: import
  `SendForReviewDialog`, label the button `{I.send} Send for review`, render the
  new dialog with `onOpenBoard`, and update the expectations in
  `documentCanvas.test.tsx:281-282` and `documentCanvasPolish.test.tsx:257` and
  `:459`. Applied to a scratch copy of the client, the four canvas test files
  pass (52/52), and `DocumentCanvas.tsx` keeps its 2 warnings. After it lands,
  `AssignReviewDialog`'s own form (`AssignReviewDialogForSource`,
  `ReviewerSelect`, `ReviewInstructionsField` and the `AssignReviewDialog`
  export) has no caller and should be deleted, keeping the exported helpers, with
  its form tests in `workbenchAssignReview.test.tsx` moved onto
  `SendForReviewDialog`.
- **Two copies of the task sign-off.** `editor/TaskSignOffDialog.tsx` is the Task
  board's private `ESignTaskModal` (`surfaces/TaskBoard.tsx:1419-1503`) as a
  component that both places can mount, now with the server's manifestation.
  `TaskBoard.tsx` is not in this slice. The change: delete `TASK_MEANING`,
  `TASK_MEANINGS`, `ESignTaskModalProps` and `ESignTaskModal` there
  (`:1431-1503`), import `TaskSignOffDialog` from `../editor/TaskSignOffDialog`,
  and at `:1131` render it with `req`, `signer`, `onClose` and `onSigned`.
- **A re-request cannot reopen a recorded verdict.** The server keeps the verdict
  (`ON CONFLICT … DO UPDATE SET requested_at`, `authoring.router.ts:3275`). So the
  usual loop, changes requested, revise, ask again, cannot be done from this
  dialog: the reviewer is shown with their verdict and cannot be chosen. The fix
  is on the server: on a re-request, reset the row to pending
  (`review_status = 'pending'`, `reviewed_at = NULL`); the earlier verdict stays
  in the `document_reviewed` audit row. Then the dialog may offer such a reviewer
  again.
- **The two records are reconciled on screen, not on the server.** The verdict
  route (`authoring.router.ts`, `POST /documents/:id/review`) does not close the
  reviewer's task, and the task route does not record a verdict. The rail now
  says which is which and does not offer Complete before the verdict. The server
  fix is for the verdict route to complete the reviewer's linked review task in
  the same transaction.
- **"Open the Review board" opens the board, not the document on it.** The board
  has no selection channel a sender can write, and a new module for one is
  outside this slice's files. The board lists the document under "Awaiting my
  review" for its reviewer.
- **request-review has no object-level permission check.** It requires only an
  authenticated user in the tenant (`server/middleware/authoringObjectAuthorization.ts:145-166`
  leaves `/documents/:id/request-review` unclassified on purpose). The client
  gates Send for review on the task create's role rule, because the act includes
  that create.
- **The refusal text still says "Assigning a review".** It comes from the server
  (`authoring.router.ts:1655`) and is shown beside the renamed control. The
  change: "Sending for review needs an editing role in this organization. Your
  role: …".
- **The lifecycle strip** (slice 18) will place Send for review as the one primary
  button on a draft. It is not built here.

## Addendum — the canvas card sends for review too (outside-file request A, landed by the coordinator)

The canvas card beside the conversation (`editor/DocumentCanvas.tsx`, wave 2B's file) still opened the
task-only `AssignReviewDialog`. Once 2B landed (`e76ae571c`), the verified patch from request A was
applied as written: the card offers "Send for review" and opens `SendForReviewDialog`, so the
document on the right reaches the Review board the same way the workbench's does.

- Red: `red/canvas-send-for-review.txt` — `documentCanvas.test.tsx` and `documentCanvasPolish.test.tsx`
  against the committed `DocumentCanvas.tsx`: 2 failed ("expected 'Assign review' to be 'Send for review'").
- Green: `green/canvas-send-for-review.txt` — 25/25; with `conversationThreadCanvas`, `documentCanvasLive`,
  `canvasDocumentsList` and `sendForReview`: 6 files, 90/90. `DocumentCanvas.tsx` warnings unchanged (2).
