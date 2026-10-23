# Core regional release identity evidence

W5 / D7, 2026-10-23. Baseline
`dd749f3e56f1d9055b19067e90680d70bf9a9fb9`. Contract:
[`NONUS_RELEASE_IDENTITY_COMPLETION_2026-10-23.md`](../../../../design/NONUS_RELEASE_IDENTITY_COMPLETION_2026-10-23.md).
This worker changed existing identity/binding/assembly/package infrastructure;
root owns commits, native PostgreSQL proof, compiler/build and release gates.

## What already exists

- `shared/regulatory/region-identity.ts` already resolves all 12 supported
  jurisdictions and agency aliases. No region mapping was added.
- `server/services/ectd/package-identity.ts` already owns the same-tenant
  program/sponsor reader, P-44 market-number reader, version-1 proof, equality,
  FDA completeness and program-before-sponsor SHARE locks.
- `server/services/part11/ectd-sequence-binding.ts` already binds actual sequence
  and ordered leaves, preserves the old content digest and captures FDA proof.
- `assemble-from-core.ts` and `package-from-core.ts` already clone/thread/echo
  captured facts and package existing regional serializers. The export proof
  and scalar/proof consistency check were FDA-only.
- `sequence-release-signature.ts` already separates intact identity-only
  staleness from changed leaves and modern malformed/damaged proof. Its legacy
  branch needed the canonical manifest hash checked before allowing renewal.
- Existing FDA admin, recorded identity, sequence approval, release integrity,
  Vault parity and market-number tests were extended or reused. The existing
  FDA admin byte fixture used a handmade PDF header; the current original-PDF
  preservation guard correctly requires a real catalog/page tree.

## Change proved

- Version-1 default/FDA capture retains exact JSON bytes. Known non-US captures
  retain program, market application number, sponsor pointer and applicant name;
  FDA-only DUNS/contact fields are null. Capture and clone do not mutate input.
- All known sequence regions bind captured proof and the original
  `sequenceContentDigest`. Unknown regions use the existing ledger fallback.
  Number/name/anchor/pointer edits change non-US approval; FDA contact/DUNS edits
  do not. FDA changes retain their existing binding behavior.
- Every known-region export passes projected proof into the actual packager.
  ZIP regional XML is read for all 11 non-US jurisdictions to check recorded
  number/name, caller regional identifier and absent FDA DUNS/contact. PMDA
  assembly also checks immutable proof echo and its existing XML identifier.
- Supplied non-US proof contradicting actual program/application/name is
  refused. Existing FDA ID/contact validation remains FDA-only.
- The new staged lock helper takes organization SHARE before a same-tenant,
  nondeleted submission SHARE, or one direct submission UPDATE for freeze.
  It returns the actual program anchor or null for a missing/foreign parent.
  Existing program/sponsor locks remain unchanged. Caller ordering and native
  concurrency proof are root-owned.
- Legacy identity-only renewal requires the canonical manifest hash as well as
  unchanged leaf content. Missing/damaged FDA or non-US legacy hashes refuse;
  valid legacy hashes still permit renewal. Modern integrity checks remain.
- FDA admin byte tests now create a valid pdf-lib page. Their admin assertions
  and the production original-PDF preservation guard remain intact.

## Fail-first and corrections

- `fail-first-capture-binding.txt`: 30 expected failures / 40 passes before
  projection, known-region binding and unknown-region fallback implementation.
- `fail-first-export-proof.txt`: 15 expected failures / 15 passes before
  export proof propagation and common scalar validation.
- `fail-first-submission-lock.txt`: 3 expected failures before the new helper.
- `fail-first-organization-lock.txt`: 2 expected failures before organization
  SHARE and direct submission UPDATE behavior.
- `fail-first-legacy-integrity.txt`: 4 expected failures / 4 passes, with
  missing/damaged FDA/EU legacy hashes incorrectly returning unsigned.
- `first-integration-test-vocabulary.txt`: 100 passes / 3 test assertion
  failures; corrected the tests to respect existing PMDA/Canada identifier tags.
- `regression-invalid-pdf-fixture.txt`: 76 passes / 3 failures / 1 existing
  todo. Replaced the invalid test-only PDF instead of changing the guard.
- `lint.txt` records an initial new capture complexity warning, removed by
  sharing contact projection. No warning suppression or baseline was changed.

These red/intermediate records precede their corresponding fixes. The early
`focused-green.txt` run (103 passes) is superseded by the final run below.

## Executed final checks

- `final-green.txt`: **9 files, 189 passed, 1 pre-existing todo**, exit 0,
  Node v22.23.3, one Vitest worker, 4096 MiB heap. This includes all focused
  changes plus release-signature PGlite, FDA adapter/admin, Vault parity and
  P-44 market-number regressions.
- `final-lint.txt`: **0 errors, 4 existing warnings**, exit 0, across the five
  changed production files and five changed test files. New helpers/tests have
  no lint warnings. Remaining warnings are existing assembly/package function
  size/complexity.
- `git diff --check` passed for all ten owned changed files.
- `final-inputs.json` records exact commands and SHA-256 of the tested source,
  test and direct configuration inputs immediately before the final execution.
  A post-run comparison found no changed pinned inputs.

The existing todo concerns Vault re-filing supersession and is outside this
slice. This evidence does not claim agency qualification, human-test release
approval, full application regression coverage or native database concurrency.
No migration, dependency, baseline, region vocabulary, writer policy, Vault
filing derivation or enforcement default was changed by this worker.
