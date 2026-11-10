# Repair existing CSR qualification UUID recognition

Plan: F1. Completes: `scripts/demo/launch-demo/qualify-csr.mjs` and
`scripts/demo/launch-demo/qualify-ana-editor.mjs`.

## What already exists

- `qualify-csr.mjs` checks an exact approved Vault source, retained tables,
  saved real-model output, independent review and reopened DOCX. Its existing
  UUID constant omits one four-character group, refusing ordinary recorded IDs.
- `qualify-ana-editor.mjs` checks an attributable model candidate and exact
  human acceptance in the existing editor. Its UUID constant has the same defect.
- Their existing `.test.mjs` suites already supply ordinary five-group UUIDs.
  `packs/biotech-shared.mjs` and `packs/faux.mjs` contain the correct existing
  five-group pattern. Reuse that pattern in the two existing constants; add no
  helper, module, route, dependency or new qualification capability.

Read the repository rules, current plan/ledger and coordination holds. Searched
qualification/UUID names, callers, tests and the existing demo pack patterns;
`git log --all --diff-filter=D` found no deleted qualification/UUID counterpart
under the searched demo paths. This repair touches no held editor/project UI.

## Reproduction and bounded contract

Before edits, the two exact Node suites fail **5 of 9** cases: standard IDs
`11111111-2222-4333-8444-888888888888` are refused as invalid. A direct call to
the real source qualifier reproduces the same refusal. Preserve that RED log
and four source/test hashes before editing. Correct only the missing regex
group and pin rejection of the formerly accepted shortened shape in the
existing tests. Keep all source, model, evidence, human-review and export checks.

Run those same two suites and scoped lint, record final hashes, then freeze.
No provider request, paid build, signature, approval, export or browser flow is
authorized or claimed by these fixture runs.

The broader demo test run's 67 failures are not 67 product defects: its temporary
`demo-recovery` module lacks an export that exists in production, and Faux tests
expect an older source taxonomy. Those fixtures remain outside this repair.

## Qualification status

The exact two Node suites are now **9/9 GREEN** (90 ms). Existing positive
cases accept recorded UUIDs; added assertions refuse the shortened shape that
the old regex admitted. `red-before.txt.gz` and `red-source-hashes.json` retain
the genuine 5/9 failure before the repair; `green-after.txt.gz` and
`green-source-hashes.json` record final qualification.

The repository's normal ESLint configuration ignores `scripts/**`. An explicit
scoped `--no-ignore` run has **0 errors**, five existing warnings in each
qualifier and none in either test. The two baseline runs have the same warning
counts and rules. Logs and the comparison are retained here. No allowance or
configuration changed. All four source/test files are frozen.

The earlier broad run had 35 temporary-module export failures, 27 Faux fixture
taxonomy/refusal-order failures and these five actual qualifier failures. Its
raw log is retained separately; the real biotech pack and letter export import
successfully. No provider/API/browser qualification is claimed by these tests.
