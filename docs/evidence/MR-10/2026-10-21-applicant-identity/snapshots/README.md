# Existing signed package identity binding — scoped evidence

## What already exists

- `server/services/submission-package-orchestrator.ts` already assembles the
  canonical real package, prepares its release digest, freezes
  `SignedPackageSnapshot` and hydrates it on resume. The snapshot did not carry
  the sequence applicant registry facts.
- `server/services/ectd/signed-package-export.ts` already verifies the frozen
  snapshot, seal and active signature and projects `SignedExportDescriptor`.
  It did not bind or project recorded applicant facts.
- `server/services/ectd/signed-manifest-covers-sequence.ts` already compares
  current leaves with the signed manifest; `release-signature-status.ts` uses
  that result and falls back to the existing sequence signature. Their
  coverage comparison did not include current applicant identity.
- Existing `package-identity.ts`, `run-package-identity.ts` and
  `orchestrator-real-package.ts` remain the canonical recorded reader and real
  packaging path. The core worker extends their registry/contact connection.
  This work reaches those same contracts; it creates no signature engine,
  snapshot store, release gate or packager.

## Result

The existing assembly, frozen snapshot and export descriptor carry optional
`recordedPackageIdentity`. The existing digest binds this versioned proof with
a domain-separated suffix and canonical known-field ordering. Absence retains
the historical recipe exactly, including the fixed pre-integration digest
`e44dc2505771ec6a528e950587ecac2ab66d8eead703b8bc618cade0a9660513`.

Current FDA sequence coverage requires the same recorded application, bound
sponsor, DUNS and regulatory contact. The comparison independently verifies the
sequence's stored submission parent before reading its identity. A historical
completed signature without this proof is intact but does not establish
current FDA coverage; the existing sequence signature can still decide.
Read failures remain undetermined. Non-FDA coverage retains its existing
application/name and leaf contracts; DUNS is not relabelled as another agency ID.

Fresh FDA release preparation and unfinished historical FDA release completion
both refuse absent, malformed, incomplete or mismatching captured applicant
proof, with a named instruction to reassemble with recorded applicant facts.
This does not rewrite or invalidate the integrity of historical completed
records. Modern frozen hydration verifies its captured facts without replacing
them with a later master-data read.

## Executed checks

| Evidence | Result |
|---|---|
| `red.log` | 12 failed / 32 passed: applicant contact changes left the digest unchanged, altered stored contact still exported, missing/changed FDA identity still cleared coverage. |
| `green.log` | Initial integrated digest/export/coverage cohort: 65 passed / 4 files. |
| `green-expanded.log` | Expanded initial integration: 222 passed / 10 files. |
| `red-sign-boundary.log` | 2 failed / 15 passed: missing-proof awaiting FDA run completed, and stored key reordering changed identity digest. |
| `green-sign-boundary.log` | Modern resume, frozen export, fresh sign gates, KMS seam and existing IND integration: 70 passed / 5 files. |
| `green-final.log` | Broad sign-boundary integration: 239 passed / 12 files. This precedes the final independent sequence-parent hardening below. |
| `red-sequence-submission.log` | 1 failed / 11 passed: identical leaves could borrow the caller's different submission identity. |
| `green-sequence-submission.log` | Post-hardening FDA coverage and existing release coverage: 32 passed / 2 files. |
| `eslint-final.json` | Scoped lint: zero errors; existing warnings retained. New FDA tests are split into their own group to avoid a new warning. |
| `verification-inputs.sha256` | Scoped source/test input pins after the final targeted replay. The root release cohort and published-tree verification remain authoritative. |

The integration fixtures now supply a complete explicitly synthetic recorded
FDA identity and a six-digit test application number. They remain test-only;
these values are not customer identity or agency qualification evidence.

The root lane owns native replay, browser, production build, compiler and
canonical publication. Human witnessing, actual pilot facts, licensed agency
assets, telephone vocabulary and agency conformance are not performed here.
