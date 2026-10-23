# Existing canonical identity and assembly connection

## What already exists

`package-identity.ts` is the shared recorded application/name reader;
`regulatory-identifiers.ts` owns FDA/DUNS/contact rules;
`core-to-packager.ts`, `package-from-core.ts` and `assemble-from-core.ts` are the
existing adapter/assembler; `run-package-identity.ts` and
`orchestrator-real-package.ts` reach the same publisher for orchestrator runs.
The deployed `ind_sponsors` registry already holds the DUNS/contact facts.
This change connects those paths and carries a captured identity in their
existing proof envelopes. No second parser, store, assembler or validator.

The canonical reader uses one tenant-scoped join and refuses a broken binding
without organization-name fallback. FDA callers require the explicit sponsor,
nine-digit DUNS, six-digit application and complete usable regulatory contact.
Non-FDA callers keep regional applicant IDs and never substitute a FDA DUNS.
Contacts use the existing FDA serializer. Its unresolved telephone type and
agency conformance gaps remain unchanged.

`RecordedPackageIdentitySnapshot` captures known facts by value. The transaction
lock helper takes program then sponsor share locks. Assembly echoes only the
supplied capture, and refuses FDA inputs that differ from its application,
applicant, program or contact. It does not reread a later identity and claim
those were the packaged facts. Signing/claim integration is in the root and
caller-worker scopes.

## Verification

- `red.txt`: original implementation, **10 failed / 1 passed**. It did not
  read the bound sponsor, require FDA DUNS/contact or thread contacts through
  the existing adapter.
- `identity-green.txt`: initial reader/adapter completion, 11 passes.
- `green.txt`: first expanded cohort, 56 passes / 1 test assertion failure. The
  new assertion omitted the existing `applicant-contact-type` attribute; actual
  XML correctly included the existing regulatory code. No serializer change.
- `final-identity-capture.txt`: concurrent earlier execution retained the same
  assertion failure (40 passes / 1 failure); the corrected assertion is in the
  final cohort.
- `final-green.txt`: **88 passes across 10 files**, including actual packaged
  FDA XML, existing assembler/audit tests, recorded-run dry-run refusal,
  captured-by-value proof, malformed proof refusal, lock order and non-FDA
  no-DUNS-substitution.
- `final-capture-green.txt`: final reader/capture rerun after documentation and
  absent-contact-key compatibility cleanup: **42 passes across 2 files**.
- `lint-final.txt`: owned ESLint exit 0, no errors. Four pre-existing assembly
  size/complexity warnings remain; no additional warning site.
- `owned-inputs.sha256`: final owned source/test pins. Root's integrated source
  cohort and publication checks establish the final combined tree.

All regulatory names, application/DUNS/contact values used here are explicitly
synthetic test fixtures, isolated in PGlite and temporary package directories.
They are not seeded into product data or evidence of agency qualification.
Actual pilot customer facts, human witnessing and licensed agency conformance
remain unexecuted.
