# MR-12 / D2: a periodic review is a signed act on the version in force (2026-10-22)

Gap 5, work item 2 of `docs/design/VEEVA_GAP_2026-10-22.md`: "Complete periodic review with a signed review-complete act." Workstream MR-12 (QMS controlled documents), launch row **D2**. This completes the periodic review the register already tracks. It is not a new module. Design: `docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md`.

## What already exists

- **The schedule.** `qms_documents.next_review_date` is set at create, or on a draft PATCH. The create dialog and AnA have sent it since 2026-10-22 (`../2026-10-22-periodic-review-date/`). Three places read it:
  - `GET /api/mdx/qms/documents/review-due` lists and flags it;
  - readiness counts `review_overdue`;
  - the register's Periodic review panel lists due documents and opens each to read.
- **No review act.** The date is part of what the approval signed (`computeQmsDocumentContentDigest`, `document-approval-signature.ts`). Writing a new date on the effective row would break that signature's binding. So a review that found a document current could only be recorded as a revision with no change.
- **The version in force**: `in-force-release.ts`.
- **The approval that put it in force** is checked where it is used: `readCurrentQmsReleaseApproval` (`current-release-approval.ts`).
- **The one signing ceremony.** `signGovernedAct` (`routes/governed-signed-act.ts`), with a content binder per target type (`part11/governed-target-binders.ts`). There was no `qms-document` binder. `REVIEW_ACT_MEANINGS` exists.
- **The organisation-wide review record**, `compliance_review_records`. It covers audit-trail and access reviews over periods. A per-document review fits none of its rules, so it is not extended.
- **Deleted**: `server/jobs/periodicReview.js` (`85616c46f`). It was a reminder cron over a Supabase table that no longer exists, and it recorded no review.

## The change

- **The act.** `POST /api/mdx/qms/documents/:id/periodic-review`, through `signGovernedAct`:
  - meaning `review`, signing authority, password and second factor;
  - the `sign` ledger pair (domain `qms`, target `qms-document:<id>`);
  - one `electronic_signatures` row.
- **The domain write** (`server/services/qms/periodic-review.ts`):
  - it locks the row;
  - it refuses anything but an effective document whose approval still stands. A document with a revision open gets `409 QMS_REVIEW_UNDER_REVISION`; one whose approval does not stand gets `409 QMS_REVIEW_APPROVAL_NOT_STANDING`;
  - it writes nothing to `qms_documents`;
  - the signature manifest's `act` names the version, its approval time, its content digest, the outcome, the next date, the date the approval signed, and the date the reviewer saw as due.
- **The binding.** The `qms-document` binder binds the signature to the release's content digest, using the approval's recipe and basis.
  - That basis is now named in `BINDING_BASIS` (`QMS_DOCUMENT_VERSION_CONTENT`).
  - The binder loads the recipe lazily. A static import closed a cycle through `signature-persistence` at startup, which ten suites showed before the fix.
- **One reader for "when is this due".** `readQmsReviewSchedule` gives the version in force and its last standing review.
  - A review counts only for the release it reviewed: the same version, approval time and content digest. A voided or superseded review signature does not count.
  - These read through it: review-due, readiness `review_overdue`, the register list (`periodic_review`, `next_review_due`) and the controlled document register report. The report gains five columns: last review signature, time, signer, outcome, and next review due as of the report date.
  - `next_review_date` stays what the approval signed.
- **The register.**
  - `PeriodicReview.tsx` holds the panel. Record review is offered on each effective document, in the panel and on its register row.
  - The flow is the outcome and next date, then the shared `EsignModal` with meaning `review`. Once signed, it shows the version, outcome and date attested.
  - Panel rows and the register's Next review cell show the last review: who, when in UTC, the outcome, and the reason for "revision required".

## What the three reviews changed (2026-10-22)

The first commit (`b2cbab76d`) was reviewed independently for Part 11, accessibility and copy before it was pushed. The second commit fixes every blocker and most advisories. `06-red-review-fixes.txt` shows its cases failing on the first commit (4 database, 10 client).

**Part 11**
- **B1 (blocker).** A review with a date beyond the panel's 120 days was shown nowhere once it left the panel. The register row's Next review cell now names the review and the date the approval signed. The register row also offers Record review, so such a document can be reviewed again.
- **B2 (blocker).** The signed confirmation did not say what was attested. `EsignModal` gains `signedRows` (version, outcome, next date), and the review returns the chain hash.
- **A1.** A review was accepted on a release whose approval signature had been withdrawn. It is now refused.
- **A3.**
  - Review times are shown in UTC to the minute.
  - A missing reviewer name says so and names the signature.
- **A4.**
  - The act records the due date the reviewer saw (`previousNextReviewDue`).
  - "Revision required" says the document keeps the date its approval set, and shows that date.
  - The UTC date rule is now: not in the past. The client's bounds are the reviewer's local days.
- **A5.** The reason is shown for "revision required".
- **A6.**
  - A dropped connection or server error says the review was not confirmed, and to check before signing again. It does not say "nothing was signed".
  - A 409 refusal reads the register again.
  - "Nothing was signed." is no longer printed twice. That fix also applies to approvals.

**Accessibility**
- **B1 (blocker).** Focus after the handoff:
  - `EsignModal` now restores focus when its host unmounts it, so Approve and Retire benefit too;
  - the review returns focus to its trigger, or to the panel heading once a review from the panel is recorded.
- **B2 (blocker).** Once signed, Done has focus and carries the summary as its description.
- **B3 (blocker).** Continue is never silently disabled. An empty or out-of-range date gets an inline alert and `aria-invalid`, and focus moves to the field. The hint is the field's description.
- **B4 (blocker).** The row reflows below 480px.
- **Advisories:**
  - the last review describes the row's controls;
  - list semantics;
  - `--text-200` on the overdue tint;
  - a 24px minimum target;
  - "Review outcome" as the legend.

**Copy**
- "Requires revision", consistently.
- Status words, not raw enum values, in refusals.
- A refusal says the review was refused.
- "N overdue · M due within 120 days", where the two counts used to overlap.
- An overdue row's name says since when.

## Evidence

| File | What it shows |
|---|---|
| `01-red-db.txt` | Trunk with the implementation stashed: every case fails (10/10). There is no route. |
| `02-red-client.txt` | Trunk: the register cannot record a review or read the due date after one (7 fail). |
| `03-green-db.txt` | Real PostgreSQL 16, `RLS_ENFORCE=on`, as `app_service`: this suite (12), the in-force, report, QMS RLS, signing-admission, signature-required and lifecycle-binding suites. 75/75. |
| `04-mutation.txt` | Six mutations of the first commit, each caught: any version counts; a voided review counts; no binder; review-due reads the row; Record review on a revising document; today accepted. |
| `05-green-unit-client.txt` | The QMS client, every `EsignModal` consumer, the QMS route suites, Part 11 binders, QMS services, signature verification and the report. 89 files, 1051 tests. |
| `06-red-review-fixes.txt` | The review-driven cases against `b2cbab76d`. The `EsignModal` Escape case passed until it waited for focus to enter the dialog; both runs are shown. |
| `07-mutation-review-fixes.txt` | Four mutations of the fixes, each caught: approval not checked; no focus restore on unmount; focus to a leaving row; a dropped connection reported raw. |

Also clean: `tsc --noEmit` and the lint warning ratchet (`--since origin/concept2cure-v2`).

## What remains

- **Reminders** before the date (`emitDeadlineTask` / `taskDueSweep`): gap 5 item 2, second half.
- **Signing authority is not known to the client.** Record review, like Approve and Retire, is offered to everyone, and the server refuses before any write (403). Showing it only to signers needs the session to state signing authority, as it states authenticator posture.
- **No review history or correction in the UI.** Only the latest standing review of the version in force is shown. Earlier reviews, and reviews of superseded versions, are in the signature register report, not on the document. A wrong date is corrected by reviewing again; revoking a review signature is server-side only.
- **"Revision required" creates no tracked obligation** (owner, due date) and no link into Revise.
- **No idempotency key.** After a dropped connection the copy says to check before signing again, but a second signature is not prevented.
- **Shared style, not changed:** the `.qms-dialog` input border (`--bg-200` on `--bg-050`) is below 3:1 for every QMS dialog.
- **Not measured:** screen-reader output, 320px layout and forced colours in a real browser.
