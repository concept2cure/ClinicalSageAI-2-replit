# Direct canonical-branch integration — seal, review and signature hardening

Repository: concept2cure/ClinicalSageAI-2-replit.
Branch: concept2cure-v2 only.
Starting commit: b11199c26c7719aaab46e49963fdc4e4c453c849.
Starting root tree: 040ace830c44494a2c6f900d14fccd264d08696d.
Evidence date: 2026-10-09 UTC.
Workstreams: existing authoring/governance repairs supporting D4/D5.

## Included in this commit

This commit integrates all three previously downloadable continuation batches:

1. Seal-declaration preservation and refusal: sourceQualification and sealEligible
   no longer disappear into legacy ok-only sealing. Specified negative, malformed
   and forged positive values refuse before seal-pool access.
2. Assignment-bound review quorum and fail-closed contradiction preflight: each
   active assignment requires exactly one attributable current-version approval.
   A missing, failed or inconsistent contradiction check cannot authorize signing.
3. Commit-time signature target/version binding: the shared signing service
   re-reads the scoped target and stored version on the transaction, requests row
   locks, verifies exact bytes and recomputed SHA-256, rechecks the review quorum,
   derives status-only writes and refuses unconfirmed signature/snapshot writes.

Existing signed approval/lock paths remain the integration points. No UI, client,
dependency, migration, workflow, hook, baseline, model or tool-registry changes.
The tree is based on the complete existing GitHub root tree, not a replacement
made from the sparse local files. Publication uses a direct, non-forced canonical
ref update with the expected starting commit; no PR or additional branch.
The publishing commit and subsequent branch-ref read are the publication receipt.

## Native-test compatibility work actually applied

Both existing PGlite signing suites now use the actual SHA-256 of their body
fixture rather than a placeholder hash. The direct signing test reads complete
Drizzle-shaped records and uses canonical status changes. The route mock supports
row-lock calls, transaction-time target/version reads for BOTH successful approval
and lock, and returned status fields. No assertions were removed or weakened.
The three original test files were recovered and matched to their exact Git blob
hashes before amendment. These suites were not executed natively in this runtime.

## Validation performed here

| Check | Result and boundary |
| --- | --- |
| Seal boundary harness | 64 passed, 0 failed, 0 skipped; complete route/service with explicit dependency doubles. |
| Review integrity harness | 73 passed, 0 failed, 0 skipped; complete service and SQL on SQLite, dependency doubles. |
| Signature binding harness | 111 passed, 0 failed, 0 skipped; complete signing/quorum modules, SQLite predicates and rollback, dependency doubles. |
| Combined isolated cases | 248 passed, 0 failed. Rerun against the final publication source tree. |
| Shipped standalone signature harness | Its repository fixture filename was corrected; all 111 cases passed again. These are the same cases, not 111 additional unique tests. |
| Syntactic TypeScript transpilation | 10 changed/new TypeScript files, zero diagnostics. Not semantic typechecking. |
| Source identity | All 15 source/test/contract blobs match the prepared files exactly; source-pins.json records their identities. |
| JSON fixture formatting | Compact publication fixtures are parsed-data identical to the tested sets. |
| Cumulative patch application | Applied and compared in a sparse baseline fixture, not a full repository checkout. |

Node 22.16.0 and the installed TypeScript compiler executed the isolated harnesses.
SQLite does not execute PostgreSQL FOR UPDATE/SHARE semantics. The tests observe
lock requests but do not establish concurrent-writer, RLS, production database,
live password/MFA, browser, source-review or end-to-end regulatory qualification.

The local runtime could not resolve GitHub or the npm registry for a full checkout
or dependency installation. GitHub connector read/write operations did work.
Full repository tests, native Vitest/PGlite suites, semantic TypeScript check,
ESLint, build and the full pre-push hook were NOT run here. Direct GitHub API
publication does not execute a local pre-push hook. No gate was edited to conceal
that limitation. This is code integration, not a green release qualification.

The starting commit's CI run 37927474425 was already completed with failure.
That historical failure is not a verdict on this commit. New remote CI and
release-gate results must be read for this commit itself; they were pending at
record preparation. No deployment or production-readiness claim is made.

## Reproduction in a provisioned full checkout

Run the repository's existing test configuration over the three added suites
and three amended native suites. The added suite paths are:

- server/routes/ana-ri/__tests__/seal-qualification-declarations.test.ts
- server/services/__tests__/artifact-approval-review-integrity.pglite.test.ts
- server/services/__tests__/artifact-signed-target-binding.test.ts

The amended native suites are:

- server/routes/c2c/__tests__/artifact-approval-ceremony.pglite.integration.test.ts
- server/services/ana-ri/__tests__/ana-signed-artifact-act.pglite.integration.test.ts
- tests/artifact-status-lock-covers-approval.test.ts

The isolated signature harness can also be executed from the repository root:

```sh
node --experimental-sqlite server/services/__tests__/fixtures/artifact-signed-target-harness.cjs . /tmp/c2c-signed-target-results.json
```

It requires the repository's installed TypeScript dependency and Node's SQLite
support. A passing isolated run is not a substitute for the native suites,
semantic compiler, build, security gates or full release evidence.

## Still open, not shipped by these repairs

Receipt-less legacy ok-only sealing remains open. The scientific-source-review
contract is documentation only: no authenticated scientific-review writer or
accepting seal consumer is implemented. Generic review completion and copying
fidelity are not scientific approval. Current quorum rechecks do not synchronize
all subsequent review/source/contradiction writers. Full IND applicability,
therapeutic/modality coverage, regulatory currency and scientific qualification
remain separate work. See the adjacent scientific-review and signature contracts.

Rollback must be a reviewed revert of this integration commit on concept2cure-v2,
never a force-reset. It restores known prior defects and does not erase records
already written. No schema or data migration is introduced by this commit.
