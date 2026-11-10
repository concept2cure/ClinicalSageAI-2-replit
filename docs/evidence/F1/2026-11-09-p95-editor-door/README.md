# P-95 on the one editor's document: approval follows a completed review (F1 and D4, 2026-11-09)

**Decision.** P-95 (the founder, 2026-11-02: review is "mandatory for regulated docs"), clarified 2026-11-09
(`c5208a29cd`, docs/LAUNCH_DEFINITION_OF_DONE.md). Each fileable record applies P-95 through its own review. The
editor's document is an authoring document, and its review is the RR5 route.

**Owner.** The coordinating session (`01JbQUvB…`): the server refusal under F1, the reach under D4.

## What already exists (RULE 3)

**The review route already exists, and the editor already reaches it.**
- `server/services/authoring/authoring-review-route.ts`, read through `server/services/review/review-route-standing.ts`.
- "Send for review" (`editor/SendForReviewDialog.tsx`, `POST /api/authoring/documents/:id/request-review`) names the
  reviewers.
- Each reviewer signs REVIEWER by E-sign over the sections digest. That signature closes their member row, and the
  route is complete once every named reviewer has signed.
- The dialog is reached from the Review tasks rail, the canvas card and More › Send for review.

**The approval doors.** Both are in `server/routes/authoring.router.ts`:
- `POST /docs/:docId/e-sign` as APPROVER: `approvalRefused` (seal, separation of duties, the settle question, P-89
  figures).
- `POST /docs/:docId/sign` as APPROVER, the workflow chain: `signingRefused` and P-89.
- Neither read the review before this change. A document could be approved with nobody having reviewed it.

**The filing bar.** `surfaces/AuthoringFilingBar.tsx` already turns two refusals into questions: not settled, and P-89
figures. A REVIEW_REQUIRED refusal would have shown only as the dialog's error.

**What this does not touch.**
- The conversation artifact's door (`server/services/artifact-approval-act.ts`). Its refusal waits for its reach, in
  S4's artifact panel (P-95 clarification).
- The QMS approval door (`server/services/qms/document-approval-signature.ts`), which keeps NEW-4's rule of a
  designated approver (`docs/design/REVIEW_ROUTING_2026-10-23.md` §4).

## The change

**Server.** `authoringApprovalReviewRefusal` (in `authoring-review-route.ts`) reads the route under its lock, after
the document's own lock. An APPROVER signature is refused with **409 REVIEW_REQUIRED**, before the password, on both
doors, unless the latest route:
- names at least one reviewer;
- has every one of them signed;
- is about the text being approved.

Each refusal says what to do:
- never sent, withdrawn or returned: "has not been reviewed… Send it for review";
- still open: "not finished: 1 of 2 reviewers have signed";
- about earlier text: "changed after it was reviewed… Send it for review again".

A route read failure throws, so it is never answered as "no review needed". Nothing is retroactive.

**Client.** The bar turns REVIEW_REQUIRED into a question, "Review comes before approval":
- It shows the server's sentence and one action, **Send for review**. That opens the editor's existing dialog
  (`DocumentWorkbench.tsx` passes `onSendForReview`).
- There is no "approve anyway". Nothing is retried.
- Without a way to send, the button is "Close".

**The bar's size.** P-95's question took the bar past the 500-line limit. Its question forms moved, in the same folder,
to `surfaces/authoringApprovalQuestions.ts` (RULE 6: split, don't add).

**Sequenced, as the clarification decided.**
- Question 1, whether the approver may also be one of the reviewers, is a later slice. The device demo
  (`scripts/demo/launch-demo/packs/mdx.mjs`) has two people, and its reviewer is its approver.
- Question 2, the two-reviewer floor for `regulated_dual_review`, is also a later slice.

## Verified by making each check fail

| File | What it shows |
|---|---|
| `red-at-head.txt` | `authoring-approval-review-required.test.ts` against the code before this change: the seven refusal cases fail, and the approval after a completed review passes. |
| `green.txt` | The same suite after the change: 7 of 7. (An approver-reviewed case was written, then left this slice with question 1.) |
| `client-green.txt` | The bar suite after the change: 4 of 4. |
| `client-red-at-head.txt` | `authoringFilingBarReviewRequired.test.tsx` before the bar change: 4 of 4 fail. After: 4 of 4 pass. With the bar's other suites, 58 of 58. |

## What else this touched, and why

**The shared fixture (read 5).** Suites that approve a document to test something else declare the review complete,
the same way the release-governance fixture answers the other release reads
(`server/services/authoring/__tests__/release-governance-reads.ts`, `withCompletedReview`). It is used by:
- `authoring-approval-independence`, `authoring-atomic-mutations`, `authoring-signature-figure-gate`,
  `authoringApprovalNoWorkflow`, `authoringApprovalSealBinding` and `authoringSignFreezeAndExportGate`: 57 of 57.
- `node-status-follows-work.pglite`, `authoring-section-commits-to-filing.contract` and
  `ind-authoring.journey`: 112 of 112. The journey runs on the C-11 authoring DDL, which has no review tables.

**The device demo** (`packs/mdx.mjs`). The requested reviewer now signs the review by E-sign before the approval.
Freeze as REVIEWER seals the text but does not complete the route.

**The founder-path walk** (`tests/lineage/`). The seal hop now sends for review to its QA reviewer, who signs it.
The walk's database also gains `organizations.payment_status` (`migrations/0003_billing_stripe.sql`), which the
request reads.
- The walk was already red at this hop on trunk: 11 of 15. The AnA-drafted document owes an independent check
  (INDEPENDENT_CHECK_REQUIRED).
- Its database also lacks the review tables, starting with `authoring_reviews`.
- So the walk stays 11 of 15 red. Both items go to its owner, with this hop's review step in place.

**Trunk red on these suites, not this change's** (the same counts at HEAD `b070809971` and after):
- `coauthorSnapshotFromSource` 41, `review-board-authoring-store.pglite` 11, `coauthorSnapshotPinnedByLeaf.pglite` 7;
- `authoringSavedSourcesExport.pglite` 3, `authoringSignerPrintedName` 1;
- the founder-path walk 11.

The fixture commit `b070809971` already took `authoringApprovalSealBinding` from 0 of 5 to 5 of 5.
