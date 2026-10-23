# Canonical-reader qualification

## What already exists

`server/services/ectd/package-identity.ts` is the one recorded submission reader,
refusal and snapshot writer. Its existing PGlite market-number suite already
reaches real export refusal. The existing export/applicant/run/coverage suites
exercise actual ZIP packaging and snapshot compatibility. This work extends
those paths; it adds no resolver table, store, route or dependency.

## Executed

- `red-reader.txt`: the extended existing PGlite suite failed 9 cases and passed
  6 against the original reader. Unknown/blank package markets and home agencies
  borrowed the project number; explicit null borrowed the submission number;
  equal unknown strings established home; unknown primary-region diagnosis was
  absent. Exact source/test hashes and command are in `red-inputs.json`.
- `green-reader.txt`: all 15 reader/PGlite cases passed after correction.
- `lint.json` retains two intermediate added warnings. The database-text type
  gate and two test groups removed them without changing the conditions.
  `lint-final.json` records zero errors and zero warnings in both owned files.
- `green-reader-regressions.txt`: 150 tests in 5 files passed, including actual
  export packaging and existing applicant/run/coverage regressions. The final
  source/test hashes and command are in `regression-inputs.json`; those input
  hashes matched at completion. Its pin was observed during execution, not
  represented as a pre-run pin. No code inputs changed during that run.

The runtime-only `marketResolutionProblem` is omitted from the version-1 proof;
known FDA proof bytes and non-US aliases remain covered. Explicit null is now an
unresolved override; only omitted/undefined chooses the submission region.
These are scoped engineering checks, not human or agency qualification. Root
owns full TypeScript/build, caller/UI integration and canonical publication.

## Shared-helper and anchor followup

The root's caller inventory also found `AnaToolExecutor.ts`'s existing
`recordedPackageIdentityOrRefusal`: it shares `isHomeMarket`, and a strict
comparison alone mislabeled an unresolved home agency as another market. The
existing home-market, recorded-identity and withdrawal suites own that path.
The canonical reader also needs to carry its anchor diagnosis to the existing
market row instead of letting an unanchored read look like home.

`followup-red.txt` records 7 failures / 15 passes: five intentional unknown home
agency verdict failures, one missing anchor diagnosis, and a fixture
incompatibility discovered during the expanded cohort (the positive home case
supplied a PDF with no readable catalog/page tree). No separate baseline-product
execution is claimed for that PDF case. The three owned AnA fixture helpers now
use valid one-page bytes from the already installed `pdf-lib`; successful FDA
fixtures explicitly record `homeAgency: FDA`. No PDF integrity guard was changed.

The first corrected cohort passed 36 checks (`followup-green.txt`,
`followup-first-green-inputs.json`). Review then refined this lane's own anchor
wording, which still told a market with unresolved ownership to record a number
on the project. `unanchored-remedy-red.txt` proves that assertion failed before
the remedy was corrected; its source/test pins are recorded separately.

Final `followup-final-green.txt` passes **171 checks in 8 files**, with every
pre-run source/test pin unchanged at completion (`followup-final-inputs.json`).
This includes the complete earlier reader/export/applicant/run/coverage cohort
and the three AnA suites. Snapshot capture is unchanged. AnA returns
`PACKAGE_IDENTITY_MISSING` for unresolved home agencies before its existing
`NOT_HOME_MARKET` branch; unanchored records carry the truthful instruction to
anchor before resolving the market's number.

`followup-lint.json` records zero errors in all six owned files. The five smaller
files have zero warnings. `AnaToolExecutor.ts` retains 96 warnings;
`ana-lint-comparison.json` proves the same per-rule counts against HEAD (96
before and after), not a zero-warning claim. The full normal gate remains the
root's responsibility. No compiler/build/commit/push was run by this worker.
