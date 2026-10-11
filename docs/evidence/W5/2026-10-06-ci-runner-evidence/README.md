# W5 — bounded test runner and retained failure evidence (2026-10-06)

Launch rows: D2–D7, verification of the existing IND authoring and filing path.
This repairs existing test execution and evidence retention, not product scope.

## Confirmed defects

The installed runner is Vitest 4.1.7. `vitest.config.ts` still configured
`poolOptions.forks.singleFork`; the installed resolver explicitly reports that
`poolOptions` was removed in Vitest 4. The intended worker limit was therefore
not applied. The supported `maxWorkers: 1` and `fileParallelism: false` controls
now make that existing memory budget real. The fork pool and heap budget remain.

Core and integration CI ran `npm test` without saving structured Jest/Vitest
verdicts. The connected GitHub log endpoint repeatedly returned `Transport
closed`, leaving only job/step conclusions available. The existing test command
now writes results into the already-ignored `test-results/` directory. CI uploads
that directory even after a failed test step; coverage retains its test verdicts
alongside the existing coverage report. Actions remain pinned by commit SHA.

The first local Jest reporter check exposed that Jest does not create its output
directory: 40 assertions passed, but report writing failed with ENOENT. The test
command now creates the output directory before either runner. A repeated Jest
run exited successfully and produced parseable JSON.

No new production dependency, module, model, endpoint or store. Both original
test runners remain in the command, joined by `&&`. Test failures still fail the
job, the real-database stage remains gated, and the coverage ratchet is unchanged.
No baseline, assertion, coverage threshold or release gate was relaxed.

## Regression validation

Before the repair, all **5 tests** in
`tests/ci/test-runner-evidence.contract.test.ts` failed. After repair:

- **155 Vitest tests passed across 6 files**, with one worker and JSON reporting.
- The full Jest suite passed **40 tests across 7 suites**, with JSON reporting.
- The new 5-test contract was rerun after the directory-creation correction.
- Test-import and native Ana → canvas → workbench → Vault path gates passed.
- Changed-file ESLint warning counts remain within their unchanged baseline.

Focused Vitest command:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
 tests/ci/test-runner-evidence.contract.test.ts \
 tests/ci/posture-jobs-run-after-lint-failure.contract.test.ts \
 tests/ci/ci-honesty.contract.test.ts \
 client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmission.test.tsx \
 client/src/concept2cure/v2/__tests__/documentAuthoringPlaceIntoFiling.test.tsx \
 tests/golden-journeys/ind-authoring.journey.test.ts \
 --reporter=verbose --reporter=json --outputFile=test-results/runner-regression.json
```

The reports were parsed and both showed `success: true` and zero failed tests.
Client tests mock their API boundary; the IND golden journey uses PGlite. This
is not a full local Vitest run or live tenant/provider qualification.

## CI status and limitations

On predecessor `a2dad65dd733e4c547d3259133b5fa9ff187f206`, full TypeScript and
ESLint, validation/audit, browser smoke, Semgrep and CodeQL passed. Main CI run
`37548444244` failed in Test (`112562332695`), Integration Tests
(`112562332706`) and the coverage ratchet (`112562332760`). Its real-database
stage and release build/evidence gates were skipped. No coverage artifact was
listed among that run's saved artifacts. The log service failed for all three
jobs; their underlying assertion/runtime failures are not diagnosed here.

Removed worker controls are a demonstrated defect, but are **not proven to be
the sole cause of these CI failures**. Full CI must rerun on this repair, and
any remaining failures must be addressed from actual failure evidence. JSON
reports are written at runner completion; a hard-killed process may still leave
no Vitest report. Upload steps warn when no report exists, not fabricate one.

This change does not qualify the entire IND workload. Live provider access,
verified tenant data, reviewer approval, audit repair and release qualification
remain outstanding. No production deployment is claimed.
