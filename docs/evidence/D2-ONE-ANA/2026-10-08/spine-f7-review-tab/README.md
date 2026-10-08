# F7: the Review tab shows this filing's reviews

Launch row **D2**. Slice F7 of `docs/design/FILING_SPINE.md` §7.2 (§2 "Review", §6 row 3).
Workflow: `docs/design/WORKFLOW_DECISION_2026-10-08.md` §3 step 5, §6 week 2.

## What was wrong

- The project's Review tab listed the program's tasks from the unified work view
  and nothing else. No row named a document, so no control on the tab opened one.
- Its only door, "Open task board", called `onNav('task-board')`. `task-board` is a
  deep-link alias of `tasks` (`registryModel.ts:941`). §5 of the spine says the
  project no longer names that alias.
- A person whose document came back with changes requested had to leave the
  project, open the review board, and find the document again.
- The F0 gate held this as red: `review-tab-to-document` in
  `tests/ui/filing-path-reachability.baseline.json`.

## What changed

- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`
  - `ProjectReviews` (`:1405`) reads `GET /api/review/board?scope=all&programId=<uuid>&limit=100`.
    The route filters by program (`server/routes/review-board-routes.ts:108-115`,
    `server/services/review/authoring-review-board.ts:297`) and returns
    `{ success, data: { queue, … } }`. `limit=100` is the route's maximum; the
    default is 25.
  - `ProjectReviewsBody` (`:1362`) groups the queue by what it needs from the
    person (`reviewGroupOf`, `:1326`): Waiting on you (`awaitingMyReview` or
    `atMySignOff`), In review, Changes requested, Declined, Reviewers approved
    and awaiting sign-off, Approved. Each group is a labelled list.
  - `reviewStanding` (`:1317`) decides the group and the words. The board's
    `state` is the reviewers' verdict, not the record's status: `deriveState`
    (`authoring-review-board.ts:194`) returns `approved` when every reviewer
    approved, while the document is still `IN_REVIEW` and its signature chain
    is pending. So "Approved" is shown only when the row's `docStatus` is
    `APPROVED`. A row whose reviewers approved but whose document is not yet
    approved reads "Reviewers approved, sign-off pending", with the in-review
    tone. A decline (`rejected`) reads "Declined", as the Review surface says
    (`REVIEW_STATUS_LABEL`, `Review.tsx:83`). It is not filed under
    "Changes requested".
  - `ProjectReviewRow` (`:1338`) is the canvas list's row (`cdl-row`) and pill
    (`cdl-pill`). The status is in words; the pill colour only repeats them
    (`data-status` `APPROVED` only for an approved record). It also says
    "Awaiting your review", "At your sign-off" or "Requested by you", the
    reviewer and role, and the open comment count.
  - "Open document" calls the Review surface's own `openReviewDocument`
    (`Review.tsx:159`). That sets the editor target to the document id and program
    and opens the editor. Nothing is copied from Review.tsx.
  - "Open the review board" opens `review` and only shows when
    `useSurfaceAvailable()` says that surface is in this release. The board starts
    on the open program (`Review.tsx:386`, `onlyProgram`).
  - States: loading is a live region; a failed read is `ErrorState` with "Try
    again" and the read's own reason (`:1370`, as the Author tab does at
    `:1641`), never the empty sentence; an empty board says "Nothing in this project
    is out for review."
  - The Review stage block (`:2265`) renders `ProjectReviews` and then the
    existing `ProjectWorkPanel`, retitled "Tasks and approvals".
  - `ProjectWorkPanel` (`:1185`): its door now calls `onNav('tasks')`, the
    surface the alias resolved to, so it opens the same board. It shows only
    when `tasks` is available (`:1265`). The Author tab's Tasks panel uses the
    same component and gets the same change.
- `client/src/concept2cure/v2/styles/project-home-v2.css`: three rules for the
  group heading (`.pj-rv-group`, `.pj-rv-h`, `.pj-rv-n`). The regenerated text ramp
  did not change.
- `tests/ui/filing-path-reachability.baseline.json`: the `review-tab-to-document`
  entry is removed. The baseline has no numeric ceiling. Rule 2 of that test
  requires the entry to go once the hop is green.

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `client/src/concept2cure/v2/__tests__/projectHomeReviewStage.test.tsx` (new, 7 cases): program-scoped read, groups, status in words, "Declined" not "Changes requested", a reviewer-approved document still `IN_REVIEW` is not shown as "Approved" while an `APPROVED` record is, "Open document" targets that doc id and program, 500 → error with the read's own reason and a retry that reads again, empty in words, no "aren't wired" and no `task-board`, review-board door only when available | `red/projectHomeReviewStage.txt` (HEAD): 7 failed of 7 | `green/projectHomeReviewStage.txt`: 7 passed |
| The same test against the slice's first version, before the review fixes (verdict shown as "Approved", decline under "Changes requested" as "Rejected", fixed "did not answer" message) | `red/projectHomeReviewStage-review-fixes.txt`: 3 failed of 7 (groups, not-shown-as-Approved, failed-read reason) | `green/projectHomeReviewStage.txt`: 7 passed |
| `tests/ui/filing-path-reachability.test.ts`, hop `review-tab-to-document`, with the baseline entry removed | `red/filing-path-reachability.txt`: 1 failed ("the Review tab sends the person to the task-board alias") | `green/filing-path-reachability.txt`: 21 passed |
| Every test that imports ProjectHome (all `projectHome*`, `anaDrivesWave5`, `composerAttachWorks`, `conversationFilesAdopt`, `marketSupportLine`, `projectDocumentDisposition`, `surfaceRender`, `reviewOpensDocument`, `tests/ui/pj-title-authority`, `one-shell`, `surface-registry-coverage`, the reachability gate) | — | `green/related-suite.txt`: 30 files, 448 passed |

The HEAD red runs used `ProjectHome.tsx` and `project-home-v2.css` as at HEAD, before any edit. The review-fixes red run used the slice's first version of `ProjectHome.tsx` with only the review fixes taken out.

Other checks, after the change:
- `npx eslint ProjectHome.tsx`: 7 warnings, the same 7 as HEAD. The new test file: 0.
- `npm run -s ci:undefined-css-classes`: OK.
- `node scripts/design/generate-surface-text-ramp.mjs`, then `npm run -s ci:surface-text-ramp`: OK, no change to the generated sheets.
- `npm run -s ci:canvas-path`: OK.
- Type check of `ProjectHome.tsx` and the new test (tsc on those two files): no error in either.

## One rule for both review lists, landed in the same change

The slice's review found the reviewer verdict shown as "Approved" on a document whose sign-off chain was still pending. The project tab was fixed, and the Review board's own queue had the same fault: its pill printed the raw verdict code (`approved`, `changes-requested`, `rejected`). Two places deciding the same words is the duplication the working agreement forbids, so the rule moved to one module before commit:

- `client/src/concept2cure/v2/surfaces/reviewStanding.ts`: `reviewStanding(row)` gives the group, the words, and the tone. "Approved" is shown only when the document's own status is APPROVED. A reviewer-approved document still in review reads "Reviewers approved, sign-off pending". A decline reads "Declined".
- `ProjectHome.tsx` (this tab) and `Review.tsx` (the board's queue pill, which showed `r.state`) both import it. `STATUS_TONE` is no longer read by `Review.tsx`.
- `tests/ui/surface-registry-coverage.test.ts`: the stale comment about the "Open task board" button is corrected.

| Test | Against HEAD `Review.tsx` | After |
|---|---|---|
| `reviewBoard.test.tsx` › the queue pill says where the document stands (5 cases) | 5 of 5 fail: `expected 'approved' to be 'Reviewers approved, sign-off pending'`, `expected 'changes-requested' to be 'Changes requested'`, … (`red/reviewBoard-queue-pill.txt`) | 14 of 14 pass |

Run after the move: every `projectHome*` and `review*` test, `anaDrivesWave2`, `surfaceRender`, the reachability gate, `surface-registry-coverage`, `pj-title-authority` and `one-shell`: 33 files, 475 of 475 pass. ESLint: `Review.tsx` 5 (HEAD 5), `ProjectHome.tsx` 7 (HEAD 7), the new module 0.

## Not done

- The spec asks for an `onlyProgram` nav param on `Review.tsx`. The board already
  starts on the open program (`Review.tsx:386`), so none was added. Review.tsx is
  not this slice's file.
- Under `scope=all` the board returns open work only (`isInScope`,
  `authoring-review-board.ts:485`). A document that is approved and has nothing
  pending leaves this tab. The "Approved" group holds only an approved record
  with a signature step still pending. Showing finished documents here needs a
  second read (`scope=requested`) or a server flag; neither was added.
- The board's `meta.total` is the length of the capped queue, not the count before
  the cap. So at 100 rows the tab can only say "there may be more"
  (`authoring-review-board.ts`, `boardMeta`).
