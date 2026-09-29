# The pushed files gain no ESLint warnings — a pre-push gate

**Row:** D5, through the CI evidence chain. A red Lint job skips Build and Release
Evidence on every trunk push.

## The defect

`ci:eslint-warning-ratchet` holds the repo's warning total at its baseline, but
only CI runs it. Pre-push ran `ci:pushed-lint-errors` (errors only). Any lane
could add a warning, push successfully, and leave Lint red for everyone. The work-orders
board named the pattern and asked lanes to run the ratchet by hand. On 2026-09-25,
at `c983e493b`, the ratchet stood at 6441 against a baseline of 6430: sixteen
files across several lanes, one to four warnings each.

## The change

- `check-eslint-warning-ratchet.mjs --since <ref> --gate` makes the existing
  diagnostic exit 1 on net growth across the changed files. Without `--gate` it
  still always exits 0.
- `scripts/ci/check-pushed-lint-warnings.mjs` (`npm run ci:pushed-lint-warnings`)
  resolves the push base as `ci:pushed-lint-errors` does (`lib/push-range.mjs`),
  takes the merge-base, and runs the ratchet with `--gate`. It lints only the
  pushed files, both versions of each, which takes seconds.
- `.husky/pre-push` runs it right after the errors gate.

The eleven warnings already on trunk belong to the lanes that added them. They do
not block an unrelated push. They block the lane that next touches one of those
files, which is the lane in a position to fix it.

## Shown failing on the case it exists to catch

| Run | Input | Result |
|---|---|---|
| `1-real-growth.txt` | `--base ba49982cb` (the commit that last wrote the baseline) | exit 1, the same 16 files and net +11 CI reports |
| `2-scratch-growth.txt` | a 110-line function added to a tracked file, then removed | exit 1, naming `max-lines-per-function` at the new function |
| `3-clean.txt` | the same tree without it | exit 0 |
