# Complete the existing proof-tier prerequisites and canonical anchor read

Plan: F1. Continues the existing schema-contract and eCTD compile owners. No new route, service, table or scanner exception.

## What already exists

- CI's `Proof tier — schema contracts + golden journeys + export contracts` runs `npm run test:proof-tier`. Completed `b0300fe5c` logs show the catalog fixture's missing `tmf_artifact_filings` relation and the duplicate program-anchor reader in `ectd-compile.ts`. Both conditions remained at the integrated canonical source; targeted native execution reproduced both failures. Completed b9 CI run `43507358665`, job `132168388472`, independently confirms the same two failures: 141 files passed, one test failed, 1,781 passed and 31 catalog cases did not execute because their setup failed.
- `tests/schema-contract/catalog-module-claims.contract.test.ts` derives catalog-writing migrations from the real deploy set and executes their real SQL. Its existing base DDL does not provide the trial-master-file table now read by `db/migrations/20261112_etmf_module_professional_tier.sql`.
- `migrations/20260615_tmf_artifact_filings.sql` owns that table's real DDL. The entitlement migration and its retained-organization grant are production behavior, not fixtures to omit or weaken.
- `server/routes/ectd-compile.ts` already provides async compile jobs. `trackingProjectIdFor` retains a numeric project id, otherwise independently selects the lowest-id project anchored to a program; an absent tracking anchor keeps compilation synchronous.
- `server/services/c2c/program-project-anchor.ts` already exports the org-scoped `readProgramAnchorRow` with the same lowest-id behavior and validation. `tests/schema-contract/one-program-anchor-reader.contract.test.ts` requires it to remain the sole reader. Existing reader tests cover duplicates, missing anchors and lookup failures.

Searches covered both failures, catalog migration ownership, compile-job tracking, canonical anchor readers and their tests. A deleted-history search over those existing owners found no deleted alternate implementation to restore. The coordination record at `.design/claude-convergence/COORDINATION.md:240` names the compile route under readiness lane L4. The root resolved this bounded integration conflict under the user's instruction to land working code: only the helper's duplicate read and its import are taken, preserving the owning lane's async implementation. No general hold is released; subsequent route work is handed back to L4. No hold names the catalog fixture.

## Completion contract

Provide the missing catalog fixture prerequisite from its owning migration before replaying every catalog writer in the real deploy order. Preserve catalog claims, commercial-tier behavior and all existing assertions. Replace only the async compile helper's duplicate anchor lookup with the existing reader after scope is released. Keep numeric identifiers, absent-anchor synchronous fallback, organization filtering and existing admission/release behavior intact; preserve lookup-error handling. Do not relax the one-reader contract or modify migrations.

Verify focused existing suites and meaningful numeric/program/missing/error cases in the existing compile-test owner. The root retains Git, the full compiler, build and publication.

## Focused verification

- Catalog fixture: 31/31 tests passed, no skipped cases, using the real owning TMF migration.
- Async compile, canonical anchor contract, actual PGlite anchor reader and Compile Validate: 18/18 tests passed across four files, no skipped cases. These include program jobs, an absent tracking anchor's synchronous result, failed lookups refusing before any job/assembly, and the admitted numeric route's existing synchronous draft backbone.
- Changed test files passed explicit ESLint with zero warnings/errors. The compile route has zero lint errors and its eight existing warnings; no lint rule was suppressed.
- The exact full `npm run test:proof-tier` step passed: **143 files, 1,813 tests, zero failed or skipped**, in 1,039.81 seconds. The 31 catalog cases blocked by the earlier setup failure all executed. The final source hashes match published source commit `661ec7183`; `verification.json` retains the bounded counts, timing and local log hash. No plaintext fixture-token log is committed. The root owns the separate full-compiler and build evidence.
