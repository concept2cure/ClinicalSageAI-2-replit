# ana-2d — the review loop closes

Launch row **D2**. Follows wave 2C (`9018545a1`, `71492adc0`,
`../ana-2c-send-for-review/`): Authoring sends a document for review through
`POST /api/authoring/documents/:id/request-review`, creates each reviewer's task,
and the reviewer opens the document. 2C left six requests it could not do in its
own files (`REQUESTS-B-F.md`, and its Not done). This slice does them, in the
order asked: C, E, D, B, F, then the follow-up of 2C Not done 1. A review of the
first pass found three more defects; they are fixed here too (section "Review
round", below), except the Tasks rail, which is outside this slice's files and
is handed over as a tested patch (`outside-requests/`).

No migration. Every column used exists (`authoring_reviews.reviewed_at`,
`review_comments`, `updated_at`; `unified_tasks` as deployed).

## What was wrong

- **C (security).** `POST /documents/:id/request-review` had no object-level
  check. `authoringObjectAuthorization.ts` left `/documents/...` unclassified, so
  any authenticated member of the organization could send any of its documents
  for review, to anyone, with a reason written to the document's audit trail in
  their name.
- **E (Part 11).** The verdict (`POST /documents/:id/review`) and the reviewer's
  review task were two records nothing joined. A verdict left the task open. The
  Tasks rail could only state the mismatch on screen.
- **D.** A second request kept the earlier verdict: `ON CONFLICT … DO UPDATE SET
  requested_at = NOW(), requested_by = $6`. So "changes requested, revise, ask
  again" could not be done. The dialog showed such a reviewer and refused to let
  them be chosen.
- **B (duplication).** The Task board held a private copy of the task sign-off
  (`ESignTaskModal`, `TaskBoard.tsx:1419-1503` at HEAD) beside the shared
  `editor/TaskSignOffDialog.tsx`. They had already drifted: the board's
  confirmation showed the signed-in user and the browser's clock, not the
  signature the server recorded.
- **F.** The refusal beside "Send for review" read "Assigning a review needs an
  editing role…" (`authoring.router.ts:1655` at HEAD).
- **2C Not done 1.** Once the canvas card opened `SendForReviewDialog`
  (`71492adc0`), `AssignReviewDialog`'s own task-only form had no caller.

## What changed

- **C.** `server/middleware/authoringObjectAuthorization.ts:166`
  `DOCUMENTS_ROUTES` lists the `/documents/:id` routes the gate classifies, each
  matched as a whole path (`documentsRouteTarget`, `:172`, used at `:219`). The
  tracked-change-decision routes moved into it unchanged. `request-review` is new
  there, as `'edit'`: the action exactly OWNER and AUTHOR hold
  (`authoring-permissions.ts` `ROLE_ACTIONS`). A global admin passes, as on every
  object route. A REVIEWER, APPROVER or VIEWER grant is refused with the
  middleware's standard 403 body. A document of another tenant is 404. A sealed
  document (FROZEN, APPROVED, …) is 409, because a request now reopens verdicts
  (D) and a sealed record's reviews must not be reopened. The verdict route
  `/documents/:id/review` stays unclassified: reviewers hold no grant. In the
  normal path the sender is the document's creator, whom the database trigger
  grants OWNER and AUTHOR, so the workbench and the canvas card keep working.
- **E.** `server/routes/authoring.router.ts:3220` `closeReviewTasksOnVerdict`.
  On the verdict's own transaction it completes the reviewer's open review tasks
  on this document (`unified_tasks`: organization, `sourceEntityType
  'authoring_document'`, `sourceEntityId` = the document, `taskType 'review'`,
  assignee = the reviewer, not archived). It writes no task column itself. It
  composes the tasking path's audited transition, as
  `PATCH /api/regulatory/tasks/:id/status` does: `isLegalTransition`,
  `unifiedTaskService.updateTaskStatus` (compare-and-set), the completion cascade
  `cascadeUnblockOnCompletionInTx`, and one `task.transition` row per move through
  `auditTaskActionInTx`. Drizzle runs over the verdict's own client.
  - Lock order: every task row lock is taken (`:3378`) before the verdict's audit
    row takes the audit-chain lock (`:3390`), and the task ledger rows are
    written after the verdict's row (`:3395`). That is the order every task
    transaction uses.
  - A pending task is started, then completed: the state machine has no
    pending → completed move. Each move has its own ledger row, with the
    reviewer's stated reason (none for an approval given without one).
  - An approval-gated task is left open: completing it is the reviewer's §11.50
    signature, and a verdict is not one. A blocked task is left open. The answer
    names both (`tasks.leftOpen`).
  - If a ledger row cannot be written, the whole transaction rolls back: no
    verdict, no task change, no audit row. The verdict and the task cannot
    disagree.
  - The sender is notified of the completion only after COMMIT (`:3403`).
  - A verdict with no review task is unchanged.
- **D.** `authoring.router.ts:3460`. On conflict the row is reset:
  `review_status = 'pending', reviewed_at = NULL, review_comments = NULL,
  updated_at = NOW()`. The verdicts it reopens are read first (`:3448`) and named
  on the request's `review_requested` audit row (`reopenedVerdicts`). The earlier
  verdict's own `document_reviewed` row is not touched (shown below).
  - Client: `editor/AssignReviewDialog.tsx:240` `alreadyAsked`. Only a member
    whose review is pending cannot be chosen. A member with a recorded verdict can
    be, and is told: "Changes requested on <date>. That verdict stays in the
    record; choosing them requests a new review." (`priorRequestNote`, `:245`;
    `ReviewerOption`, `:300`). `SendForReviewDialog.tsx:425` sends such a member.
    A row that comes back pending gets a new task.
  - The task each reviewer gets now says "Record your verdict on the Review
    board; recording it completes this task. Completing the task does not record
    a verdict." (`SendForReviewDialog.tsx:126`). The governance note says the
    verdict completes the task (`:569`).
- **B.** `surfaces/TaskBoard.tsx:9` imports `TaskSignOffDialog` and mounts it at
  `:1137` with `req`, `signer`, `onClose` and `onSigned`. `TASK_MEANING`,
  `TASK_MEANINGS`, `ESignTaskModalProps`, `ESignTaskModal` and their header are
  deleted, with the imports only they used. The board now shows the signature the
  server recorded, and a success without one is not shown as a signature. The
  existing sign-off test, `taskBoardSignature.test.tsx`, stayed green before and
  after.
- **F.** `authoring.router.ts:1667`: "Sending for review needs an editing role in
  this organization. Your role: …". `documentCanvasPolish.test.tsx:462` follows.
- **2C Not done 1.** `AssignReviewDialog`'s form is deleted:
  `AssignReviewDialogForSource`, `ReviewerSelect`, `ReviewInstructionsField`,
  `AssignReviewDialogProps` and the `AssignReviewDialog` export. The exported
  helpers stay (roster read, `ReadFailed`, checklist, task body, create). The
  replacement that delivers the same outcome is `editor/SendForReviewDialog.tsx`,
  opened by the workbench header, the Tasks rail and the canvas card. Its
  reachability is pinned by `sendForReview.test.tsx` (workbench header and
  rail), `documentCanvas.test.tsx` (canvas card, "Send for review") and
  `ci:canvas-path`. The six tests that rendered the old form
  (`workbenchAssignReview.test.tsx`) now drive `SendForReviewDialog`: the task's
  link and context, a lost answer, a task receipt for another document, a change
  of document, a late answer, and a confirmed refusal. Test count unchanged
  (18).

Server tests changed to the new rules (files in this slice's list):
`review-board-authoring-store.pglite.integration.test.ts:255` pinned that a
re-request did NOT put the document back on the reviewer's queue, under a title
that said it did. It now checks that it does. `authoring-record-attribution.pglite.test.ts`
builds `unified_tasks` (baseline and soft-delete migration), which the verdict
now reads, as the deployed database has it.

## Review round

Three defects the review of the first pass found, and what was done.

- **The gate could be skipped by spelling the path differently (blocker).**
  Express routes match without case and ignore a trailing slash (Router
  defaults; `authoring.router.ts:111` sets neither). The gate compared the
  literal path. So `POST …/request-review/`, `…/Request-Review` or
  `/api/Authoring/…` ran the handler with no object check. The case hole covered
  the whole middleware (`/api/Authoring/Docs/:id/Freeze` too), and the
  trailing-slash hole already existed on the tracked-change-decision routes.
  Fixed at `authoringObjectAuthorization.ts:37` `relativeAuthoringPath`: the
  prefix is compared without case, trailing slashes are dropped, and every route
  pattern and exact comparison in `targetForRequest` (`:183` onward) matches
  without case. Ids keep the spelling the caller sent, so the decision is about
  the document the handler acts on (`id = $1` on a uuid). The new test mounts the
  gate on a real `express.Router()` and, for each spelling, first shows the
  handler runs with no gate, then shows the gate refuses it.
- **Send for review was offered to a sender the request refuses (blocker /
  major).** After C, `access.assignReview` still reported the organization role
  only. A member with an editing role but no Owner or Author grant (any teammate
  who did not create the document), and every sender on a sealed document, saw
  the control enabled, chose reviewers, wrote a reason, and met a 403 or 409.
  Fixed in the same statement as F, `authoring.router.ts:1657`: the role check
  comes first (so a viewer still reads the F sentence), then the request's own
  `'edit'` decision through `decideAuthoringPermission`, reported with
  `objectGate`: "Sending for review needs an Owner or Author grant on this
  document. Your grants on it: none." or "Sending for review is refused while the
  document's status is FROZEN." A lookup that fails is unknown (null), not an
  allowance. The test reads the report and then sends the request through the
  real gate in front of the real router, for three callers: they agree. The
  header comment of `callerDocumentAccess` (`:1544`) is outside this slice's
  lines; its new text is in `outside-requests/comments.patch`.
- **The refusal named "the authoring object" (part of the same finding).** The
  gate's standard 403 sentence is internal wording. `SendForReviewDialog.tsx:198`
  `GATE_REFUSAL` says it as "The review request was refused: Sending this
  document for review needs an Owner or Author grant on it." The control is
  normally not offered (above); this covers a grant revoked after the read.
- **The Tasks rail misdescribes an earlier round's task (blocker; not in this
  slice's files).** The rail pairs every review task with the reviewer's one
  request row. After change request → re-request (D) → new task, the first task
  read "This task is completed, but no verdict is recorded", and after the
  approval it read "Verdict recorded on the Review board: Approved", the second
  round's verdict. `ReviewTasksPanel.tsx` is not this slice's file. The fix is
  `outside-requests/rail-earlier-request.patch`: a closed task opened before the
  reviewer's current request says "This task belongs to an earlier review
  request. <Name> was asked again on <date>; that review is pending on the Review
  board." (or "the verdict on that request is recorded on the Review board:
  Approved."). The pending note now says "recording the verdict there completes
  this task" (or, for an approval-gated task, that completing it needs an
  electronic signature). The panel was at the 500-line limit, so the review-state
  half moves to a new `editor/reviewTaskState.ts`; `reviewStatusLabel` is
  re-exported from the panel, so its importers do not change. The patch also
  corrects `TaskSignOffDialog.tsx:13-15`, which still said the Task board holds
  its own copy. **D must not ship without this patch.**

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `server/middleware/__tests__/authoringObjectAuthorization-request-review.test.ts`: a member with no role on the document is refused, 403 with the standard body | fails: `next()` called | passes |
| same: REVIEWER, APPROVER, VIEWER grants are refused (3 cases) | fails | passes |
| same: OWNER and AUTHOR are admitted, classified as `edit` (2 cases) | fails: not classified | passes |
| same: a global admin is admitted without a grant read | fails | passes |
| same: another tenant's document is 404; a sealed document is 409 | fails | passes |
| same: the verdict route and a longer path stay unclassified (controls) | passes | passes |
| same, review round: every spelling Express routes to the handler meets the gate (trailing slash, mixed case in each segment, `/api/Authoring`, all upper case; tracked-change decisions; `/Docs/:id/Freeze`) | 8 of 10 fail: 200, handler reached | passes |
| same: the gate decides on the id as sent (upper-case uuid) | fails | passes |
| same: `/api/authoring-actions/…` is not classified (control) | passes | passes |
| `server/routes/__tests__/authoring-review-loop.pglite.integration.test.ts` E: an in-progress review task is completed, with a `task.transition` row naming the verdict, and the sender notified | fails: task `in-progress` | passes |
| same E: a pending task is started then completed, two ledger rows, the reviewer's reason on each | fails: task `pending` | passes |
| same E: only this reviewer's review task on this document moves (not another reviewer's, another document's, a non-review, an archived, another tenant's) | fails | passes |
| same E: an approval-gated task is left open and named | fails: no `tasks` in the answer | passes |
| same E: a verdict with no review task is recorded as before (control) | passes | passes |
| same E: when the task's ledger row cannot be written, neither the verdict nor the task is recorded | fails: 200, verdict saved, task open | passes |
| same D: a re-request makes the row pending, with no verdict time and no comments | fails: `changes_requested` stays current | passes |
| same D: the earlier `document_reviewed` row is untouched; the new request names the verdict it reopened | fails: no `reopenedVerdicts` | passes |
| same D: the whole loop: change request closes task 1, re-request reopens, approval closes task 2 | fails | passes |
| `authoringDocAccess.pglite.integration.test.ts` (F): the refusal names "Sending for review" | fails: "Assigning a review…" | passes |
| same, review round: an editing member with no grant is told it needs an Owner or Author grant, and the gated request is 403 | fails: reported allowed | passes |
| same: on a FROZEN document the owner is told why not, and the gated request is 409 | fails: reported allowed | passes |
| same: a failed grant lookup reports Send for review as unknown | fails: reported allowed | passes |
| same: the creator is offered it and the gated request goes through (control) | passes | passes |
| `client/…/__tests__/taskBoardSharedSignOff.test.tsx`: the board's confirmation shows the server's printed name and time | fails: shows the client's | passes |
| same: a success without the recorded signature is not shown as one; closing re-reads the board | fails: "Signature applied" | passes |
| same: the board holds no ceremony of its own | fails: `ESignTaskModal` present | passes |
| `taskBoardSignature.test.tsx` (existing B guard: what the board sends) | passes | passes |
| `sendForReview.test.tsx`: a member with a recorded verdict can be asked again and is told the verdict stays in the record; a pending member cannot be chosen | fails: checkbox disabled | passes |
| same: the task says recording the verdict completes it | fails | passes |
| same, review round: the gate's refusal is said as what it means for this act, not "the authoring object" | fails | passes |
| `reviewTaskVerdict.test.tsx` with `outside-requests/rail-earlier-request.patch` (not applied in the tree): an earlier round's task says it belongs to the earlier request (pending, then approved); the pending note says the verdict completes the task; a gated task says a signature does | 4 of 11 fail against today's panel | 11/11 with the patch |

Runs:

- `red/request-review-permission.txt`: the new middleware test against the HEAD
  middleware. 9 of 11 fail; the 2 controls pass.
- `red/request-review-path-spellings.txt`: the spelling cases against the
  middleware as the first pass left it. 9 fail; the canonical spelling,
  `/docs/:id/freeze/` (its pattern already allowed a tail) and the
  `/authoring-actions` control pass.
- `red/review-loop-server.txt`: the new loop test and `authoringDocAccess`
  against the HEAD router. 9 fail; the 4 controls and unchanged cases pass.
- `red/send-for-review-access.txt`: `authoringDocAccess` against the router as
  the first pass left it. 3 fail; the creator control and the 3 earlier cases
  pass.
- `red/taskboard-shared-signoff.txt`: the new board test against today's
  `TaskBoard.tsx`. 3 fail; `taskBoardSignature` passes.
- `red/send-for-review-again.txt`: `sendForReview.test.tsx` against the HEAD
  `AssignReviewDialog.tsx` and `SendForReviewDialog.tsx`. 2 fail.
- `red/send-for-review-gate-refusal.txt`: the gate-refusal case against
  `SendForReviewDialog.tsx` as the first pass left it. 1 fails.
- `outside-requests/red-rail-earlier-request.txt` and
  `outside-requests/green-rail-earlier-request.txt`: `reviewTaskVerdict.test.tsx`
  as the patch changes it, against today's panel (4 of 11 fail) and with the
  patch substituted at load time by a vitest plugin, nothing in the tree written
  (11/11). `outside-requests/green-related-client-with-patch.txt`: every client
  test file that imports or mocks the panel, the dialogs, the board, the
  workbench or the canvas, with the patch substituted.
- `green/request-review-permission.txt` (the 3 middleware files),
  `green/review-loop-server.txt` (the loop and `authoringDocAccess`),
  `green/taskboard-shared-signoff.txt` (every TaskBoard test file and
  `reviewTaskSignsOnDocument`), `green/send-for-review-again.txt`
  (`sendForReview`, `workbenchAssignReview`). Counts are in each file.
- Review round: `green/request-review-path-spellings.txt`,
  `green/send-for-review-access.txt` and `green/send-for-review-gate-refusal.txt`
  pair with the red runs of the same names.
- `green/related-server-suites.txt`: every server test that imports the
  authoring router or the object gate (the router's own suites, the canvas
  fixture suites, the schema contracts, the golden journey), the review board,
  and the task routes' cascade and governed tests.
- `green/related-client-suites.txt`: every client test file that imports or
  mocks `TaskBoard`, `SendForReviewDialog`, `AssignReviewDialog`,
  `TaskSignOffDialog`, `ReviewTasksPanel`, the workbench, the canvas or
  `DocumentAuthoring`, plus `tests/ui/surface-registry-coverage.test.ts`.

Gates: ESLint warnings unchanged on every changed file
(`authoringObjectAuthorization.ts` 1/1, `authoring.router.ts` 24/24,
`TaskBoard.tsx` 9/9, `SendForReviewDialog.tsx` 0/0, `AssignReviewDialog.tsx`
0/0, `documentCanvasPolish.test.tsx` 1/1, `workbenchAssignReview.test.tsx` 1/1,
the other changed tests 0/0). The three new test files have 0. The patched
outside files lint clean (the panel 0, `reviewTaskState.ts` 0, the test 0).
`ci:canvas-path`, `ci:undefined-css-classes` (no new class),
`ci:drizzle-tenant-scope`, `ci:tenant-entry-points`, `ci:server-error-leaks`,
`ci:internals-in-copy`, `ci:discarded-audit-write` are OK. No CSS was changed. A
narrow `tsc` over the changed files, with the patch substituted in memory,
reports nothing in the lines this slice changed. In `authoring.router.ts` it
reports the file's existing `req.user` typing errors (`:199`, `:200`, `:505`,
`:522`, `:6350`), none in this slice's lines.

`green/related-client-suites.txt` has one failure that is not this slice's:
`tests/ui/filing-path-reachability.test.ts`, another wave-2 agent's new,
untracked test, fails on that agent's in-progress `ProjectHome.tsx` change. It
was picked up because it names `DocumentWorkbench`. The run with the patch
(`outside-requests/green-related-client-with-patch.txt`) leaves it out: 57
files, 570/570.

## Not done

- **The Tasks rail patch is not applied.** `ReviewTasksPanel.tsx`,
  `reviewTaskVerdict.test.tsx` and `TaskSignOffDialog.tsx` are outside this
  slice's files. `outside-requests/rail-earlier-request.patch` applies cleanly
  with `git apply` and adds `editor/reviewTaskState.ts`. Until it lands, an
  earlier round's review task is misdescribed, as above.
- **Two comments are outside this slice's lines.** `callerDocumentAccess`'s
  header (`authoring.router.ts:1544`) and the Send for review button's comment
  (`DocumentWorkbench.tsx:3815-3820`, "The gate stays the task create's") still
  describe the role check only. `outside-requests/comments.patch` has both.
- **A verdict cannot finish an approval-gated review task.** By design: that
  completion is the reviewer's §11.50 signature. It stays open and is named in
  the answer. Tasks made by Send for review are not gated.
- **A reviewer's verdict completes their task regardless of their organization
  role.** The task routes require an editing role for a direct write
  (`requireEditorAccess`). Here the assignee closes their own assigned task as
  the consequence of the verdict, which the verdict route allows any member to
  record. Whether the verdict route itself should require a role is a separate
  question, not changed here.
- **The dialog keeps its handling of a row that comes back with a verdict.** The
  route no longer returns one (the row is reset under the document's lock), so
  that branch is defensive: no task, and the receipt says the verdict stands.
- 2C Not done 5 (the board opens on the document) and 6 (a request made by
  someone else between the dialog's read and the send) are unchanged.
