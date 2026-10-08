# QA 2026-10-08 — authoring journey (j4) fixes

Source findings: browser walk j4-authoring (document authoring → review → approval
e-signature → PDF export → File to Vault → Place into filing). Reproduced on the
running app at :5078 (pre-fix server code; it is not restarted by this change) as
emily.watson, through the API, or from the walk's own artefacts where a signing
role was needed (only the two admin accounts can sign in the QA org).

Red/green: each fix has a test that failed on the pre-fix code and passes after it
(the red run was shown for every item; for the freeze `frozen_at`, the export
rendering record, the lifecycle reference, the review-only E-sign and the
Assign-review request the red was shown by reverting the one changed line in place
and re-running, then restoring). Final run of every touched suite:
`green-final-summary.txt` (108 files, 1121 tests). ESLint per changed file vs HEAD:
`eslint-parity.txt` (no file above its HEAD count). Targeted `tsc` over the changed
sources: 0 errors.

| Finding | Reproduced | Root cause | Fix | Test |
|---|---|---|---|---|
| Section created after template sections stored first | yes, `repro/02` (2.5.8 at 7, template at 101…701) | `createSection` used the list position (`sectionInsertIndex`) as the stored `order_index` | stored-index slot (`sectionInsertSlot`), rows shifted by id; step moved to `services/authoring/section-placement.ts` | `server/services/authoring/__tests__/create-section-placement.pglite.test.ts` (real `createSection` on PGlite) |
| Duplicate section code → 500 LINEAGE_REQUIRED | yes, `repro/03` | catch-all in `createSection` mapped the unique-index error to lineage | 409 `SECTION_CODE_EXISTS` before anything moves (case-folded, as the structure check compares); 23505 on the index also mapped | same file |
| Approval signature "covers no frozen snapshot"; approved_at/frozen_at NULL | from the walk (signing needs an admin) | e-sign wrote the signature before the `approved` snapshot; status flip set neither timestamp; freeze never set `frozen_at` | snapshot first (`approveAndSnapshotForSignature`), signature + digest bound to it; `approved_at`/`frozen_at` COALESCE'd; freeze sets `frozen_at` | `server/routes/__tests__/authoringApprovalSealBinding.test.ts` |
| PDF fallback prints `<!doctype html>` and a `% % %` rule | yes, `repro/04` (walk's PDF) | `htmlToPlainText` kept the doctype as text; the U+2500 rule is not encodable in the standard PDF font | doctype stripped in the reducer; rule drawn as a vector line | `server/export/__tests__/renderers-fallback.test.ts` |
| PDF export reports success for the plain-text fallback; history silent | from the walk (`usedFallback` discarded) | `renderPdf` used `renderHtmlToPdf` | tracked render; `rendering` on the export record and `X-Export-Rendering`; client toast says plain-text rendering (error tone) | `authoringExportPdf.test.ts`, `authoringCreateExport.test.tsx` |
| "All changes saved" when the text did not reach the filing | from the walk's API log | workbench never read PATCH `filing` | save confirmation appends the server's filing answer | `client/.../authoringSaveFilingCommit.test.tsx` |
| Place into filing packages the whole document at the open section's code | yes (walk: leaf 58 content) | server files the whole document by design (`coauthor-snapshot.ts`: one copy per source); the dialog prefilled the open section's code | prefill the document's own code (common parent), say "whole saved document (N sections)", refuse one of its own section codes | `client/.../authoringPlaceWholeDocument.test.tsx` |
| Same section placed twice (authoring path) | `repro/05`: both leaves point at the same snapshot #52, so 24e8cb5f4's same-document rule covers this path on the server | — | dialog reports the server's `unchanged` answer as "Already placed", not as a new leaf | same file |
| Lifecycle error "Quote the reference below" with no reference | yes (walk) | every surface rendered `serverMessage` without `correlationId` | `serverMessage` appends `Reference: <id>` when the message points at it | `api-error-extraction.test.ts`, `vaultLifecycle.test.tsx` |
| Author can assign her own review | from the walk (task 17) | no author check anywhere | request-review refuses the author 409 `REVIEWER_IS_AUTHOR`; the dialog does not offer the author | `review-board-authoring-store.pglite.integration.test.ts`, `workbenchAssignReview.test.tsx` |
| Assigned reviewer cannot review or sign; no UI grants authority | from the walk | Assign review wrote a task only; `/e-sign` was always an 'approve' act; the grant API had no caller | Assign review sends the review request first (Review board) — which grants REVIEWER when the requester is the document owner or an admin (the grant API's own rule), chained ledger row; `/e-sign` with meaning REVIEWER is a 'review' act; access reports `esignReview`; E-sign offers the review meaning alone to a Reviewer grant | `authoringObjectAuthorization.test.ts`, `authoringDocAccess.pglite.integration.test.ts`, `authoringFilingBar.test.tsx`, review-board test |
| Review task has no assigner / name; instructions not shown | from the walk (task 18) | task create set none of them; board model and drawer omitted `description` | named assignee resolved among members (non-member 400), `assignee_name`, `assigned_by`, `assigned_at` written; drawer shows Instructions | `task-management-assignment-record.test.ts`, `taskBoardInstructions.test.tsx` |
| Vault "Send for review" 500 `require is not defined` | no longer reproduces: `repro/06` (start path reaches the store, answers 422 for an unknown version; 0 occurrences in the :5078 log) | fixed in 5fe22cb10 | — | — |

Decisions needed (not made here): see the final report of this session.
Writes made in the shared QA database by this work: document
`de153e03-c228-4ad5-9cf2-3f929a64b735` "FIX-J4 repro 2.5 Clinical Overview" (7 template
sections plus 2.5.8), created through the API as emily.watson.
