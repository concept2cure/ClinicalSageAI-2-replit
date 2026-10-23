# Independent review — existing program facts and applicant UI

Scope: the additive applicant-sponsor migration, extracted
`server/services/ind-forms/program-form-facts.ts`, recorded form metadata in
`server/routes/ind-forms.routes.ts`, `form-context-assembler.ts`, and the existing
`IndFormsPanel.tsx` / extracted `IndApplicantIdentity.tsx` implementation.
Review is read-only; only this report was written. Workers were sent the
confirmed findings promptly while they continued implementation.

## What already exists

The deployed sponsor registry owns DUNS/contact data. The existing forms route
owns program facts and form generation; its reader/writer was extracted to
`program-form-facts.ts`. The existing governed program-write helper provides
fresh organization membership, role and program authority. Existing chained
audit transactions, session/project visit guards, mutation outcome helper and
form check table are extended, not replaced.

## Confirmed findings at first review

### M1 — old form checks can survive changed recorded facts

`IndFormsPanel.tsx`'s `check()` only checks session/project ownership after the
request. Applicant/program writes keep their busy state in the child, so a
form check can run while an applicant PUT or shared-sponsor PATCH is pending.
A check can read facts A; the identity receipt for B clears checks through
`onRecorded`; a late A check then repopulates the same table because its
session/project guard still passes. The table can show `required fields
present` beneath B although it checked A.

A second trigger requires no concurrency: the parent `load()` sets the reloaded
program without clearing checks, and the child's explicit reload does not call
`onRecorded`. An already green A check remains when B is read.

Recommendation: bind checks and pending responses to the full form-input
context, including program facts revision and bound sponsor revision. Invalidate
at read/receipt changes, and propagate identity mutation busy state if needed.
A late response from an earlier input context must never publish a verdict.
Sent to root and UI worker. Worker fixes/tests were pending at this report's
initial filing.

### M2 — the bound registry's recorded signatory is dropped at build

`programToFormMetadata()` correctly maps the bound sponsor through
`sponsorToInfo()`, including `authorizedRepName` / `authorizedRepTitle` from
`signatory_name` / `signatory_title`. `recordedRequestMetadata()` then replaces
`meta.sponsor` with stated sponsor fields plus pinned name/address/contact,
dropping those recorded representative values.

With no overrides the registry signatory disappears from the generated form.
With a stated `sponsor.authorizedRepName`, the caller can replace it. For
example the existing FDA 3454 builder reads that field as the required
`authorized_rep_name`; other existing form builders use it too.

Recommendation: preserve the recorded sponsor projection and pin its
representative fields when a sponsor is explicitly bound, while retaining the
existing permitted per-build choices. Sent to root/program worker. The worker
has added a failing route regression (`program/signatory-red.log`); final fix
verification remains the worker/root's evidence.

### M3 — malformed form-check answers are displayed as clean

The touched existing `check()` accepts HTTP 200 `{}` and `[]`, substitutes an
empty object for an empty array, and counts a missing `missingRequired` as zero.
The table then shows `required fields present`. This predates the slice, but
is in the same reached check path and must remain an unknown/refused check.

Recommendation: validate the expected form ID, field-result shape and an
explicit string-array `missingRequired` before storing a verdict. For per-
investigator results, reject an empty/malformed result set and do not hide a
later incomplete investigator behind only the first result. Sent to root/UI
worker for the same check-ownership correction.

### L1 — sponsor PATCH receipt accepts an unchanged revision

`matchesProgramReceipt()` rejects a response retaining the prior factsVersion.
`matchesSponsorReceipt()` validates that revision is nonempty but does not
require a PATCH's returned revision to differ from the edited revision. The
backend advances its exact revision on every successful update, including a
no-op. An unchanged revision is therefore an inconsistent receipt and should
be held as unconfirmed rather than shown as a saved sponsor action.

Sent to root; protocol guard recommendation, not a claim that the current
registry writer returns unchanged revisions.

## Boundaries that held under review

- The migration adds one nullable link, leaves DUNS/contact in the existing
  registry, and enforces the same organization through a composite foreign key.
  Its replay guards are additive; no DROP or baseline change.
- Program writes lock the program, run the existing fresh governed-authority
  helper, compare the exact opaque microsecond revision, and lock the selected
  same-tenant sponsor. Update and chained audit share one transaction.
- Pre-commit audit failure rolls facts/revision back. A lost COMMIT
  acknowledgement is explicitly unconfirmed; it is not reported as a refusal
  claiming nothing was written.
- Program bodies only project the four admitted fact fields. Unknown body
  keys cannot become organization/actor fields or sponsor fact updates.
- A dangling/foreign explicit binding does not fall back to an organization-
  named applicant. Program form address remains the existing program fact.
- Program/sponsor registry saves are separate explicit actions. Confirmed
  registry creation does not silently bind it to the program.
- Exact program receipts match ID/resulting fields/bound sponsor and an
  advanced revision. Missing/204/mismatched receipts are held; explicit
  reconciliation reads, not automatic write retries, release holds.
- Whole-panel visit/session guards reject late responses after another program,
  an A-to-B-to-A visit, or retired session. Registry read errors are not
  rendered as empty successful lists.
- Sponsor revision uses an explicit UTC full-precision expression. Program
  updated_at is a timestamp without time zone; its opaque token retains the
  same six digits across session time zones. The worker has added this case.

## Limits

This review traced code and focused regression coverage. Root separately
reported native PostgreSQL 16.15 replay/FK/CAS checks; this reviewer did not
repeat those socket-backed checks. No UI mutation, native data write, agency
asset acquisition or human witnessing was performed by the reviewer.

The reported UI/data-input bugs require the named worker's failing-first and
final integrated tests before closure. No full Stage 4/D7 or agency conformance
claim follows from this review.
