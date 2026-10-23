# October 23 company filing identity integration

## What already exists

`server/services/ectd/package-identity.ts:readSubmissionPackageIdentity` already
owns bound-applicant and per-market number selection. Company reconciliation in
`company-documents/identity.ts` previously selected the tenant name and home
number directly; company correspondence used its project-only reader. These
existing company paths now use the submission reader with the admitted sequence
region. The canonical form assembler keeps the program sponsor address as the
filing address; this correction preserves that authority. Existing comparison,
role-review hashing, reservation and Authoring creation are extended in place.
Deletion history found no competing removed reader; the search and responsibility
inventory are recorded in `docs/design/COMPANY_CORRESPONDENCE_WORKFLOW.md`.

## Evidence

The native pre-correction run failed eight of sixteen cases (`baseline-red.txt`).
After correction, **29 cases across two suites pass**, including the retained
sixteen cases and thirteen added regressions; `tests-green.txt` records each
case. Lint has zero errors and warnings (`eslint.txt`). `verification.json` pins
the exact checked-out sources and records runner provenance and boundaries.

The native identity fixture executes canonical submission/applicant SQL against
PGlite. It separates tenant account, parent brand and applicant; exercises added
market numbers, missing numbers, review invalidation, audit rollback and current
admission. Correspondence exercises the real canonical reader with a SQL transport
double, including third-market non-borrowing, same-name sponsor rebind, changed
contact, current-context refusal and canonical Authoring reservation. No provider,
agency or production endpoint is called. Historical public provenance is unchanged.
