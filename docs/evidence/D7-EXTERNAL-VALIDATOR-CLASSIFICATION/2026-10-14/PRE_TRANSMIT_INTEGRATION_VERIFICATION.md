# Pre-transmit caller integration verification

2026-10-14, working tree based on `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. This worker owns only `pre-transmit-check.ts`, its existing test file and this evidence. No dependencies, transports, agency/vendor APIs, credentials, commits or deployment changed. This composes the published D7 validator-classification contract; it does not qualify an external provider or package/profile.

## Behavior

`PreTransmitInput.selectedExternalValidator` carries a trusted server-selected `Pick<ExternalValidator, 'name' | 'kind'>`; the caller forwards it to the pure external gate. No report-derived classification is introduced. Missing selection remains unknown and refuses required production external clearance.

The `external-evalidator` check's `passed` now means `assessmentStatus === 'passed'`. Detail preserves assessment status, selected kind, whether the error count is known, known errors or `unknown`, execution and enforced policy. Required blockers remain from the existing external gate. Advisory failed/invalid/not-assessed outcomes add a warning and remain `passed=false` while the overall no-hard-block policy remains clear. Coherent subset error diagnostics remain visible without becoming an external assessment.

The low-level guard's `enforceExternal=false` behavior remains unchanged. Existing size, authorization, region, PDF/A and DTD/stylesheet checks are preserved.

## Fail-first evidence

New caller tests were added before changing the production caller. With the new shared gate already present, the unchanged caller produced **9 failures and 19 passes**: it omitted the trusted descriptor, so even a matched clean external report could not pass, and it still rendered advisory clearance as a passed check. The opt-out and existing guard tests remained passing. [Fail-first log](pre-transmit-fail-first.log).

## Final verification

Node 22 command:

```bash
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/submission-gateways/__tests__/pre-transmit-check.test.ts server/services/submission-gateways/__tests__/transmit-guard-reports-checks.test.ts
```

**30 tests passed in 2 files**. Cases include selected external descriptor with coherent clean/error report fixtures, selected clean subset, no descriptor despite an engine-named report, advisory failures in staging and optional production, unassessed execution, invalid report identity, coherent subset error diagnostics and explicit external opt-out. Existing guarded-transmit authorization/size refusal, region checks, package-generated DTD/stylesheet regression and result-report propagation also passed. [Final green log](pre-transmit-green.log).

The adapter constructors supply the actual source-defined identity/kind in these tests; reports are synthetic fixtures. Tests do not execute a licensed validator, and the repository Vitest setup mocks database access. These are caller/component and existing guard/packager regression evidence, not production/database/provider/agency qualification. No full application or full repository typecheck was run by this worker.

Focused ESLint command:

```bash
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/eslint/bin/eslint.js server/services/submission-gateways/pre-transmit-check.ts server/services/submission-gateways/__tests__/pre-transmit-check.test.ts
```

Exit 0, **0 errors, 3 warnings** for long existing entry-point/test-group functions and `evaluatePreTransmit` complexity. [Lint log](pre-transmit-lint.log).

## Reviewed file hashes

| File | SHA-256 |
|---|---|
| `server/services/submission-gateways/pre-transmit-check.ts` | `39766d82059b5f4da7fb19b58eaaf8acaaee94cc0189adeb8b6b96d74177ebb5` |
| `server/services/submission-gateways/__tests__/pre-transmit-check.test.ts` | `4e683ec27ae07a9412a349c6fe0bfd2c604683970ab53a1f3d07092fa8d4b912` |

Independent architecture reviewer completed **8/8 component checks**, exit 0, including exact identity-case mismatch, missing descriptor, nonfinite/count inconsistency, subset error diagnostics, warning-only external, staging advisory failure and low-level opt-out. The reviewer also confirmed that the low-level guard still uses `pre.cleared`, rather than requiring every advisory check to pass. [Independent result](/workspace/scratch/d7-independent-pretransmit-green.json). Root integrates that result with the shared gate, assessor and tool evidence. Provider authenticity, exact package hash/profile/engine qualification, regional coverage and successful agency delivery remain separately unproven. No competitive exclusivity is claimed.
