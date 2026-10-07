# CMC numeric evidence qualification results

W3 / D4; 2026-10-07. Base revision `cdc1308d97fa4564d799001f536fb423b9a5cc0e`.
The control tower approved [the bounded plan](CMC-NUMERIC-PLAN.md) before
production edits and reviewed the subsequent conformance/count refinements.
Root owns commit, push, and shared release gates; this worker made no commits.

## Behavior established

`parseNumeric` reads complete finite numeric values, including scientific
notation and percent values without rescaling. It refuses substring extraction,
censor/comparator substitution, ambiguous grouping, malformed text, coercible
objects/arrays, nonfinite values, and nonzero lexemes that underflow to zero.
Stability time has a separate explicit nonnegative-month grammar that preserves
bare numbers, `6M`, `6 mo(s)`, `6 month(s)`, and `Month 6` / `Month6`.

The canonical numeric-series inspection exposes no partial fitting data when a
present result or its time is invalid. Shelf life and trending refuse the
affected attribute/condition series; poolability refuses the selected parameter
even if two other selected batches could fit. Independent valid series remain
readable. An observation-invalid or narrowly unsupported-criterion parameter
withholds the programme shelf-life claim. Missing results remain missing, with
recorded/usable counts exposed for both successful and refused assessments.

The existing acceptance-criterion grammar is unchanged except for a narrow
preflight over all candidate strings. Exponent-like, grouped, repeated-decimal,
and leading-dot numeric forms are refused rather than extracted as another
limit or hidden behind a supported candidate. This guard is shared by Module 3
comparisons as well as fitting paths. Existing attached textual comparator
boundaries are preserved, and malformed numeric prefixes cannot hide before a
unit suffix or after an unspaced range separator. Ordinary identifiers such as
`Q1E` and `3.2.S.4` remain textual references, with no identifier-specific rule.

Module 3 retains raw results and raw criterion text. Unsupported results or
criteria are not compared. Valid value-versus-specification comparisons remain
visible when a time is unresolved; they do not assert a numerical failure.
Conformance narratives withhold overall stability support when observations
cannot be interpreted, some comparisons are unavailable, or a recorded payload
is unreadable. Clean controls retain their existing comparison/support behavior.
QC applicant-declared dispositions remain explicitly unverified when comparison
is unavailable. No source record, scientific engine arithmetic, human approval,
signature, export gate, route, dependency, or storage schema was changed.

## Actual proof

Full captured output: [RED](CMC-NUMERIC-RED.md) and
[GREEN plus lint baseline](CMC-NUMERIC-GREEN.md).

| Stage | Result |
| --- | --- |
| Core qualification before production edits | 72 failed, 24 passed / 96 |
| Added incomplete-conformance controls before their fix | 4 failed, 92 passed / 96 |
| Added missing-count, unreadable-payload, invalid-time controls before their fixes | 3 failed, 96 passed / 99 |
| Q1E reference compatibility before correction | 1 failed, 99 passed / 100 |
| CTD reference compatibility before correction | 1 failed, 100 passed / 101 |
| Attached textual comparator cases before correction | 10 failed, 104 passed / 114 |
| Second range-bound cases before correction | 4 failed, 116 passed / 120 |
| Systematic operator/unit boundary matrix before correction | 144 failed, 315 passed / 459 |
| Adjacent repeated-dot prefix before correction | 1 failed, 459 passed / 460 |
| Main regression manifest below | 13 files, 677 passed |
| Additional existing shared callers below | 4 files, 180 passed |
| Final qualification rerun after numeric-prefix guard correction | 556 passed |
| Scoped ESLint | 0 errors, 26 warnings; baseline also 26 |
| Scoped `git diff --check` | Passed |

There are **857 distinct passing tests across 17 files**, including **556 new
qualification cases**. The final 556-case rerun is included in that 857, not an
additional set of tests. Baseline lint is 5 warnings in recorded stability,
2 in trending, and 19 in the composer; final counts are identical. The new test
file has no warnings. Existing warnings concern function/file size, complexity,
and two unused composer helpers.

The new qualification file includes a 432-case boundary matrix: nine explicit
unsupported numeric forms (scientific notation, comma/underscore/space grouping,
multiple and adjacent decimal points, and unsigned/signed leading-dot bounds), six existing
operators (`NMT`, `NLT`, `max`, `min`, `>=`, `<=`), attached/detached spelling, and
four suffix forms (none, `%`, `mg`, `EU/mL`). Every case is also checked before
and after an otherwise supported candidate. Additional controls cover incomplete
exponents, longer existing comparator phrases, both range bounds, negative and
unspaced ranges, ordinary unit bounds, and guideline/CTD reference text.

The compatibility RED stages exposed and corrected defects in the proposed
preflight during independent review. They are not claims that the original
production parser rejected ordinary reference annotations. The final guard
passed both the unsupported-prefix matrix and those preservation controls.

Main command (run from repository root):

```sh
npx vitest run --config vitest.config.ts \
  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts \
  server/services/cmc/__tests__/acceptance-criterion.test.ts \
  server/services/cmc/__tests__/shelf-life-two-sided.test.ts \
  server/services/cmc/__tests__/shelf-life.test.ts \
  server/services/cmc/__tests__/recorded-poolability-two-sided.test.ts \
  server/services/cmc/__tests__/shelf-life-poolability.test.ts \
  server/services/cmc/__tests__/recorded-stability-trending.test.ts \
  server/services/cmc/__tests__/stability-trending.test.ts \
  server/services/cmc/__tests__/stability-signal.test.ts \
  server/services/__tests__/module3Composer.stability-filed.test.ts \
  server/services/__tests__/module3Composer.stability-honesty.test.ts \
  server/services/__tests__/module3Composer.stability-trending.test.ts \
  server/services/ana/__tests__/deepening-tools.test.ts
```

Additional existing-caller command:

```sh
npx vitest run --config vitest.config.ts \
  server/services/cmc/__tests__/recorded-capability.test.ts \
  server/services/cmc/__tests__/process-capability.test.ts \
  server/services/__tests__/module3Composer.test.ts \
  server/services/__tests__/cmcWriteThroughMappers.test.ts
```

Every RED stage and the final qualification rerun used:

```sh
npx vitest run --config vitest.config.ts server/services/cmc/__tests__/recorded-numeric-qualification.test.ts
```

Scoped lint:

```sh
npx eslint server/services/cmc/recorded-stability.ts \
  server/services/cmc/stability-trending.ts \
  server/services/module3Composer.ts \
  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts
```

Baseline lint used `git show HEAD:<path> | npx eslint --stdin --stdin-filename
<path>` for each of the three production paths, while HEAD still matched the
base revision above. Independent read-only review verified all numeric-series
callers handle the discriminated result, no exhaustive refusal handler was
missed, and both incomplete-evidence conformance cases withhold support without
turning a valid comparison into a numerical failure.

## Qualification limits and next work

This is local deterministic software evidence, not client intended-use
qualification, scientific approval, staging/provider evidence, or completion of
D4. Full TypeScript, builds, integrated verification, and CI/release evidence
remain control-tower work; full local TypeScript was not rerun because of the
known memory limit.

Raw `%` values are assumed to be recorded in percentage points, consistent with
the existing register. No dimensional validation or conversion is introduced.
Clients must clarify unsupported measurements, units, censoring/missing-data
handling, and intended analysis before the affected data can be fitted.

The acceptance parser is **not comprehensively qualified** by this change.
Legacy text/unit grammar remains permissive: for example, `<=12abc` can still
be read as a decimal criterion, whereas a measured result `12abc` is refused.
Arbitrary adjacent text cannot be distinguished from existing units without a
separate explicit grammar contract. Existing absent/non-numeric-criterion
eligibility (including `Conforms`) remains unchanged; this tranche's mandatory
parameter/programme hold applies to invalid measured observations and the
specified unsupported numeric-criterion spellings. No broader claim of complete
criterion semantics, censoring-method validation, or dataset qualification is
made.
