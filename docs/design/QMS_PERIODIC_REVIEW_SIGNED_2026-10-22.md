# QMS periodic review: a signed review of the version in force (2026-10-22)

Gap 5.2 of `docs/design/VEEVA_GAP_2026-10-22.md`: "a signed review-complete act". Workstream MR-12 (QMS controlled documents), launch row **D2**. This completes the periodic review the register already tracks. It is not a new module.

## What already exists

- **The schedule.** `qms_documents.next_review_date` is set at create, or on a draft PATCH (`controlled-document-service.ts`); the create dialog and AnA send it since 2026-10-22.
  - `GET /api/mdx/qms/documents/review-due` lists and flags it (`mdx-qms.ts`).
  - Readiness counts `review_overdue`.
  - The register's Periodic review panel (`SopRegister.tsx`) lists due documents and opens each one to read.
  - The register report prints it (`compliance-reports/queries/controlled-documents.ts`).
- **What is missing.** There is no act that records a review.
  - The panel says the next review date "changes through a revision". The date is part of what the approval signed (`computeQmsDocumentContentDigest`, `document-approval-signature.ts`), so writing a new date on the effective row would break that signature's binding.
  - So today a review that finds the document current can only be recorded by revising and re-approving it, as a new version with no change.
- **The version in force.** `in-force-release.ts` resolves it, including during a revision.
- **The signing ceremony.** `signGovernedAct` (`routes/governed-signed-act.ts`) is the platform's one ceremony:
  - components, meaning, signing authority, password and second factor;
  - the domain write and the `sign` ledger pair;
  - one `electronic_signatures` row whose manifest carries the act's payload.
  - A content binder per target type (`part11/governed-target-binders.ts`) binds the signature to a content digest. There is no binder for `qms-document` yet: approval and retirement compute their own.
  - `REVIEW_ACT_MEANINGS` (`['review']`) exists.
- **The organisation-wide review record.** `compliance_review_records` (`migrations/20261001_compliance_review_records.sql`, `services/audit/compliance-reviews.ts`) holds the audit-trail and access reviews.
  - Its rules are built for one kind of review: continuous periods, a sealed report run and one decision line per account.
  - A per-document review fits none of them, so it is not extended. That is a decision, not an omission.
- **Deleted.** `server/jobs/periodicReview.js` (deleted in `85616c46f`) was a reminder cron over a Supabase `periodic_review_tasks` table that no longer exists. It recorded no review.

## The design

1. **The act.** `POST /api/mdx/qms/documents/:id/periodic-review`, through `signGovernedAct`:
   - target `qms-document:<id>`, meaning `review`;
   - the reviewer's reason, password and second factor.
2. **The body.** `outcome` is `current` or `revision-required`. `nextReviewDate` is required for `current`; it must be after today and within five years.
3. **The domain write** (`services/qms/periodic-review.ts`):
   - It locks the row and refuses unless the document is effective. A document under revision is refused, because the revision's approval sets its next review. Retired and draft-only documents are refused too.
   - It writes nothing to `qms_documents`. Its payload, which goes on the signature manifest and into the ledger, names exactly what was reviewed and what was decided: `{ kind: 'qms-periodic-review', documentId, docNumber, version, approvedAt, contentDigest, outcome, nextReviewDate, previousNextReviewDate }`.
4. **The binding.** A `qms-document` content binder computes `computeQmsDocumentContentDigest` of the row as it stands, which is the same digest its approval signed. So the review signature is bound to the content of the version it attests.
5. **The readers.** `readQmsPeriodicReviews` reads the latest standing review signature per document (not superseded, not invalid, not revoked).
   - It counts a review only if it is of the release in force: the same version, approval time and content digest.
   - The effective next review is then that review's date for `current`; for `revision-required` it is the row's date, unchanged.
   - Without a counted review it is the row's own date.
   - Review-due, readiness and the register list read through it, and the register report adds the last review.
   - A new version, once approved, starts from its own row date.
6. **The UI.** The register's Periodic review panel offers **Record review** to anyone with signing authority. It asks for the outcome and, for "remains current", the next review date, then opens the shared `EsignModal` with meaning `review`. Each row says when it was last reviewed, by whom, and with what outcome.
7. **AnA** cannot sign, and gets no tool for this.

## Tests (red first)

- **Real PostgreSQL** (`RLS_ENFORCE=on`, `app_service`):
  - a `current` review moves the document out of review-due and sets its next date;
  - the signature is bound to the release digest, and the ledger pair is written;
  - the effective row is unchanged and its approval still verifies;
  - a review of v1.0 stops counting once v2.0 is approved;
  - refused: under revision, a past date, no signing authority, a wrong password.
- **Client:** Record review posts the outcome, date and signature; a row shows its last review.

## Not in this design

- Reminders before the date (`emitDeadlineTask` / `taskDueSweep`, gap 5).
- Training assignment.
