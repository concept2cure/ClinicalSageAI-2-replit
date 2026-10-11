# AnA CMS and diagnostics command memory recall — W3 / D4

Canonical branch: `concept2cure-v2`.
Publication base: `bf80e2fa922a0261edadf403da732983cc55c9b7`.
Original implementation base: `dc1927938a13c46153a3a2132f958dbada138435`.
The intervening automatic health update changed two reports only and was preserved.
Production scope: `server/services/ana-ri/command-executor.ts` shared memory loader
and its unused private importance field type. No UI changes.

## Delivered behavior

The existing CMS/reimbursement and diagnostics/IVD commands share a memory loader
that selects obsolete confidence/importance column names. The canonical table
uses confidence_score/importance_level, so the query fails rather than delivering
project intelligence to either analysis. The corrected SQL aliases those existing
columns to the same result fields, ranks critical/high/medium/low/unknown followed
by creation time, and requires the existing top-level active lifecycle status.

Limits remain 18 for CMS and 20 for diagnostics. Category sets, parameters,
organization/project scope, public command responses, guards, error handling,
CMS risk/coverage/recommendation logic and diagnostics component/readiness math
remain unchanged. The unused private importance field now reflects its actual
string/null type. No schema, lifecycle writer, model, capability or dependency
is changed. This batch covers this one shared loader and its two consumers.

## Qualification

All qualification passed on frozen production/test bytes:

- Focused canonical-schema PGlite suite: 20 passed, 0 failed.
- Fail-first proof on original source: 4 failed and 16 skipped; candidate bytes
  restored in finally before the final focused pass.
- Bounded AnA regression selection: 647 passed across 38 selected test files;
  0 failed or skipped, in 73.416 seconds.
- Production build: passed in 18.128 seconds.
- Forced lint: 0 errors, 18 existing production warnings, 0 test warnings;
  no additional warning rules. Normal pre-commit checks passed.
- Full unchanged pre-push gate: passed in 57.643 seconds;
  TypeScript reported 0 errors with tsc exit 0.

The native compiler helper prepared the incremental cache only. The full
unchanged hook and actual tsc result establish qualification. Raw commands,
results, fail-first evidence and exact source hashes are retained here.
Independent review approved the source boundary and real SQL test contracts.

Client tree remains `f4a50c306387585250e354c68e08a099362e3823`.
Publication uses a non-force update with an expected canonical head. Remote CI
is separate from local qualification; its observed status is reported at delivery.

## Boundaries

Tests execute the real SQL against the canonical table shape locally. A deployed
database was not queried. This is source publication, not production deployment
or a full-repository test verdict. Exact-active applies to the actual row status;
the separate pattern nomination writer's JSON-only review status remains outside
this scope. Existing diagnostics readiness is a deterministic keyword-component
coverage calculation; this batch does not redefine it as scientific validation.
