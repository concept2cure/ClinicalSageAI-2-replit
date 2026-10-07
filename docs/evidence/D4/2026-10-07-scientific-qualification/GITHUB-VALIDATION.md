# Exact-source direct publication and GitHub validation

W3/D4, 2026-10-07. All changes were published directly to `concept2cure-v2`
with an expected-parent lease and `force: false`. Each published blob and
full tree matched the corresponding committed local source. The report-only
repository-health child `c96abba04d2e43932779392dc91fe2a2abe49c57` was preserved.
No pull request, baseline, suppression, dependency or hook change was used.

## Source-specific checks

| Source | Actual result |
| --- | --- |
| `3bd8ac52e0d150d01e95c6210621613f1f601c41` (tree `66d2598d279d44cab9b87a9ecf49ec09f71ebe79`) | Initial scientific release: 77 files / 1,896 tests passed locally. GitHub C2C run `37603301722`, job `112732651120`, found ten TypeScript errors in the heterogeneous numeric test table; ESLint was skipped. This source is not represented as typechecked successfully. |
| `9dd81408d4775b8361a96bcf5e6002955db3722e` (tree `a8a94986e4101adf1c703d5c0ba89b31b2019096`) | Test-only typing correction. Actual C2C run `37604598878`, job `112736901380`: TypeScript baseline 0, errors 0, tsc exit 0 at 10:05:48 UTC; ESLint 0 errors / 6,258 warnings at 10:07:54 UTC. Browser, CodeQL and Semgrep also succeeded for this exact source. |
| `a49d69a2be956dc8a4a8cba6f3951b1a49f5b91c` (tree `41f82bed092cae64d167e11a63d1d3e9bfc39003`) | CMC disposition and catalog-fixture increment. Frozen offline regression: 86 files / 1,954 tests passed, 212.39 seconds; server build, pre-commit, unchanged actual pre-push prefix through warning ratchet and audit fixture guard passed. Actual C2C run `37606300448`, job `112742490952`, found one test-only TS2698 error at 10:20:44 UTC: the history assertion spread an untyped PGlite row. Baseline 0, tsc exit 2; ESLint was skipped. This source is not represented as successfully typechecked. |

The full local compiler is delegated to GitHub because it exceeds the local
memory limit. The numeric fixture correction preserved every input and
assertion without casts or changing the zero-error baseline. Its independent
17-file CMC regression passed 857/857; the final CMC/disposition regression
passed 108/108 across 13 files after the catalog fixture parity correction.

## Final-source checks and open release evidence

For `a49d69a2` the browser smoke run `37606300462`, job `112742491061`, has
succeeded. Main CI run `37606300511` has successful Security Contract
`112742491284`, Security Scan `112742491633` and full-history secret scan
`112742491803` jobs. Its Lint job `112742491674` remains running; audit fixture
step 63 and the main workflow's tests/build/release evidence are not yet claimed.
CodeQL `37606300409` and Semgrep `37606300340` remain running at this receipt.

The 56 inherited main-CI failures are recorded against their actual earlier
sources in [PRIOR-SOURCE-GITHUB.md](PRIOR-SOURCE-GITHUB.md). The audit fixture
guard defect and three catalog consumer fixture errors are corrected here;
remaining inherited failures are not waived by the targeted regression.
Skipped C2C regulatory/compliance/provider jobs are not qualification evidence.

An initial final-manifest attempt was stopped by automatic approval review
when it attempted external OpenAI traffic with an unverified payload. No result
from that attempt is counted. The completed final run used the unchanged
existing offline verification boundary, whose external HTTPS/fetch refusal was
verified against stubs before dispatch. This does not qualify an AI provider.

Independent-connection lock scheduling, full runtime-role RLS, staging,
intended-use scientific/medical review and human release qualification remain
open. D4, commercial deployment and acceptance of regional filings are not
declared complete. This receipt records the explicitly named source checks;
subsequent documentation-only publication must not be presented as a new
production/test-source validation.

## Test-row typing correction contract

Root approved this test-only correction before editing: explicitly declare
the actual CMC SQL link result as `Record<string, unknown>` through PGlite's
query generic. Preserve the SQL, all runtime cases and the full old-row history
assertion. No cast, suppression, production edit or zero-baseline change.
The actual GitHub diagnostic above is RED evidence; after correction, run the
14 focused cases and lint, then republish and require whole-tree TypeScript
on that new exact source. Earlier-source success is not substituted.

After the row-type correction, the same 14 focused tests passed, exit 0,
6.36 seconds (10:22:40 UTC; runtime-local 06:22:40 EDT). Focused ESLint has
zero errors and zero warnings. Root compared TypeScript's emitted JavaScript
before/after: it is identical, so the correction changes type information only.
The source-specific GitHub Actions checks attached to the correction commit
are authoritative for its full semantic TypeScript result; this historical
receipt does not reuse either preceding source's status.
