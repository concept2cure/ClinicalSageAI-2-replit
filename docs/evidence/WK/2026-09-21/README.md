# WK — 2026-09-21 — one review lifecycle (VSR-001 F-6)

Worker WK was terminated by a spend limit before it filed this README. The
control tower verified its work on the tree, fixed the crash described
below, and files this record. Everything here was re-run by the control
tower, not taken on report.

## The finding

A review requested and submitted in Authoring was not visible on the Review
board. Authoring stores reviews in `authoring_reviews` /
`authoring_workflow_steps` / `authoring_comments`; the board read
`document_workflows` / `workflow_approvals` — the unified workflow store —
and carried five write routes of its own into it. Two review stores, two
state machines: a review raised in one was invisible in the other, and a
decision recorded on the board never reached the document.

`OQ-AUTH-17b` failed on it and `URS-AUTH-017` read **fail** in TM-001. Both
demo packs reproduced it (the MDX pack's finding F4).

## The decision (control tower, founder's standing instruction to finish)

The store the Authoring launch app writes through is canonical. The board
reads it. The board's own writes are gone.

| Board action | Now calls |
|---|---|
| approve / request changes / decline | `POST /api/authoring/documents/:id/review` |
| comment | `POST /api/authoring/sections/:sectionId/comment` |
| resolve a comment | `PATCH /api/authoring/comments/:commentId` |
| delegate | no equivalent transition — a reviewer is added with `POST /documents/:id/request-review`, and the board says so |

`server/services/review/authoring-review-board.ts` builds the queue, the
approval chain and the thread from the authoring tables, tenant-scoped
through the request-scoped client. The board still applies no §11.50
signature: signing stays on the authoring e-sign route, PIN-verified against
a frozen version, and the surface's header says so.

## Deleted, with the replacement named (CLAUDE.md working agreement)

Five write routes left `server/routes/review-board-routes.ts`
(`change-request`, `decision`, `delegate`, `comments`, `comments/:id/resolve`)
and two test files went with them:

- `server/routes/__tests__/review-change-request.test.ts` — pinned that a
  change request must not terminate the workflow and must not use the wrong
  id space. Replaced by the authoring transition, whose semantics are the
  document's own review status; covered by
  `review-board-authoring-store.pglite.integration.test.ts`
  (`review_status: 'changes_requested'` then `'approved'` on a real document).
- `server/routes/__tests__/review-decision-delegate.test.ts` — pinned that a
  decision, a delegation and a comment actually reach the server rather than
  living in one browser tab. Replaced for decision and comment by the routes
  above and by `reviewWritesReachTheServer.test.tsx`; delegation has no
  transition and is stated as absent rather than faked.

The unified-workflow tables and their other consumers are untouched and
still work: `server/services/WorkflowService.ts`,
`server/services/workflow/DecisionLineageService.ts`,
`server/services/workflow/decision-lineage-view-assembler.ts`,
`server/routes/decision-lineage.ts`. No table was dropped (Rule 1).

## A crash the control tower fixed before committing

`Review.tsx` read `item.docStatus.toLowerCase()` and `item.reviews.length`
unguarded. A queue row without those fields — anything served before this
read model carried them — threw during render, and React unmounted the whole
board: the surface went blank rather than showing a row with one chip
missing. That is the opposite of the honest-state rule. Both fields are now
optional in the read contract, the chip is omitted when there is no status,
and the three AnA-driving board tests that had been failing on the blank
surface pass.

## Verification re-run by the control tower

| Check | Result |
|---|---|
| WK's five suites | 37 passed |
| Review + AnA-driving board suites | 29 passed |
| whole-tree `tsc --noEmit` | 0 errors |
| eslint warning ratchet | WK's files absent |
| `ci:tenant-isolation:no-regression` | 2 findings, both pre-existing in `server/mcp/__tests__/mcp-connector.dbtest.ts` (D8), file unmodified here |

Gate transcripts captured by the worker itself are the other files in this
folder.

## Owed

`OQ-AUTH-17` / `17b` re-execution against a running server, and the board
screenshot over the seeded demo programs. The worker was terminated before
it reached them; the unit and integration proof above covers the behaviour.
