# Trunk gate sweep, 2026-10-01

**Row:** D2 (launch catalog), with D1/D3 gates in passing. **Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`.

## What was run

Every `npm run ci:*` gate wired into `.github/workflows/*.yml` (122, self-tests
excluded) was run against trunk at `9bc758187`, four at a time with a 300 s timeout
each.

- **116 passed on the first pass.**
- **6 failed only for a missing input**, each naming the input it reads:
  - `component-class-coverage` and `server-bundle-prod-imports` read the
    build.
  - `coverage-ratchet` reads a coverage report.
  - `purge-coverage`, `replay-rebuilds-nothing` and `tables-live-schema`
    need a database.

  Second pass, with those inputs in place:
  - `npm run build` (rc 0), then the two build gates.
  - The database gates against a throwaway copy of the test database. The
    shared `c2c_testdb` was not modified.
  - `replay-rebuilds-nothing` against a database built from empty, exactly as
    CI's blank-database job builds it: `install-fresh.mjs`, then
    `deploy-migrate.mjs`.

| Gate | Result |
|---|---|
| `server-bundle-prod-imports`, `purge-coverage`, `tables-live-schema` | pass |
| `replay-rebuilds-nothing`, blank database built the CI way | **pass**: 8,914 constraints and indexes; 0 rebuilt, 0 dropped, 0 created (`replay-rebuilds-nothing-blank-db.txt`). Against the older test-database copy it reported 147 changes. Those were migrations added since that copy was provisioned, not a defect. That is why the gate is defined against a freshly built database. |
| `component-class-coverage` | **real defect, fixed here.** See below. |
| `coverage-ratchet` | not re-run. It needs a full coverage run of the suite; CI produces that report in its own step. |

## The defect

`client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx:1094` (added
in `544a7563c`, 2026-09-29) renders the section-history error state's
**Try again** button as `.dd-act-retry`. None of the 25 built CSS chunks had a
rule for it, so it shipped as the browser's default button inside a styled
drawer. jsdom applies no cascade, so no component test could see it.

Fix: a rule beside `.dd-act-empty` in
`client/src/concept2cure/mdx/pathway-tabs.css`. It is an inline text button
built from existing tokens (`--text-100`, `--bg-100`, `--radius-sm`).

| Check | Before | After |
|---|---|---|
| `ci:component-class-coverage` against the shipped CSS | FAIL, 1 class with no rule (`component-class-coverage-red.txt`) | OK, 0 (`component-class-coverage-green.txt`), after `vite build` |
| `ci:design-system`, `ci:check-phantom-tokens`, `ci:token-cascade`, `ci:token-contrast`, `ci:check-css-selector-shadowing`, `ci:check-orphaned-stylesheets`, `ci:check-shell-css-collisions` | — | all pass |
