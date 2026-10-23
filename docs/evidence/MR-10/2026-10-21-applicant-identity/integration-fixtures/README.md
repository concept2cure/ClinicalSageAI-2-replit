# Existing private signature fixture reaches the deployed resolver query

## What already exists

`server/services/ectd/__tests__/shadow-review-waiver.pglite.integration.test.ts`
uses its existing private `electronic_signatures` DDL with the real release
resolver. The deployed signature schema has `signature_hash`; the resolver now
selects it to classify identity-only staleness safely. This test fixture omitted
the real column, so even the query for a non-release waiver failed and returned
`undetermined` instead of the correct `unsigned` verdict.

The fixture now declares only the missing `signature_hash TEXT` column. No
production code, gate, fallback, mock, assertion or signature data changed.
Root owns the sequence-release fixtures; they were not edited here.

## Verification

- `shadow-waiver-red.txt`: the exact original case fails, expected `unsigned`,
  got `undetermined` (1 failed / 26 skipped).
- `shadow-waiver-green.txt`: **43 passes across 2 files**, full waiver suite
  and unchanged adjacent shadow-finding suite.
- `lint.txt`: owned fixture ESLint exit 0.

Search of existing ectd private signature DDL found four files. Dispatch-on-
signing and the root-owned sequence-release fixture already had signature_hash.
Shadow-finding-disposition also omitted it, but was left untouched unless an
actual reached failure demonstrated that change was necessary. This is a
fixture repair, not a change to the product's release gate.

## Additional existing FDA fixture completion

The broad runner confirmed five more reached fixture failures, retained in
`applicant-broad-red.txt`:

- `dispatch-on-signing.pglite.integration.test.ts`: three signatures could not
  derive their real FDA binding because the old base migration lacks the later
  `submissions.program_id` anchor. The fixture now uses existing shared program
  DDL, the actual deployed master-data/binding/anchor migrations, and explicitly
  recorded synthetic applicant facts in each tenant. Submissions select those
  records. No signature-meaning or content-tampering assertion changed.
- `lifecycle-rehearsal.pglite.test.ts`: two export cases now correctly require
  the canonical recorded applicant identity, while their fixture had only an
  organization name and application number. It now binds the existing program
  to a synthetic complete sponsor-registry record. All prior-state, modified-
  file, skipped-act and rehearsal filename assertions remain unchanged.

`applicant-completion-green.txt` records **12 passes across 2 files**;
`applicant-completion-lint.txt` records ESLint exit 0. No product file, identity
reader, signature gate, lifecycle assertion, baseline or Stage 11 enforcement
posture was changed. These fixtures remain isolated test data, never product
seed records.
