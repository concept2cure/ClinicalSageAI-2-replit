# W2: remove source-tree races from the ESLint warning comparison (2026-10-30)

Launch row: D1, the push-time verification path. This completes the existing warning ratchet; it does not relax any baseline or lint rule.

## What already exists

Searches: `lintText`, `lint-source`, source-version helpers, `__eslint_ratchet_prev__`, the warning-ratchet and JSON-operator scripts, and deleted history with `git log --all --diff-filter=D -- '*eslint*ratchet*' '*lint-source*'`. No deleted source-version helper was found.

- `scripts/ci/check-eslint-warning-ratchet.mjs` compares warning counts against the fixed baseline. Its `--since` mode already selects changed files, reads their historical bytes from git, reports per-file deltas and refuses growth with `--gate`. It stages historical bytes in sibling `__eslint_ratchet_prev__.*` files so ESLint sees the same suffix and directory. Those files are visible to concurrent server scanners and TypeScript; they can contain old SQL defects or disappear between enumeration and reading. Exact-basename ESLint rules also do not match the prefixed sibling.
- `scripts/ci/check-json-operator-types.mjs` scans server source from the working tree. It correctly rejects current SQL defects, but cannot distinguish a concurrently staged historical source file from current source.
- `scripts/ci/__tests__/eslint-warning-ratchet.test.mjs` already covers count arithmetic, baseline validity, malformed reports and invalid `--since` arguments. It does not exercise historical source linting or source-tree races.
- ESLint is already a development dependency and exposes `lintText` with `filePath`; no dependency is needed.

## Design

Keep the ratchet's existing changed-file selection, current-file CLI linting, warning counting, report and fail-closed behavior. Lint historical text in memory with ESLint's API under each original filename and the same root configuration. Reuse one ESLint instance for the batch, suppress the same ignored-file notices as the existing CLI path, and create no historical source files. Delete the sibling staging/cleanup path entirely. Keep the full-repository invocation and baseline unchanged.

Verification will use the real ESLint engine against a temporary fixture configuration to show original-name overrides, test suffixes, JSX and ignores apply, configuration errors propagate, and working files remain unchanged. The parent session coordinates the full `--since` gate against the live combined changes.

## Results

- `01-red.txt`: before the fix, the actual gate and ESLint fail both regression controls. A filesystem watcher sees `__eslint_ratchet_prev__.record.js` created and removed, and an exact-basename override incorrectly reports no warning change. The invalid-configuration refusal already passes. The fixture supplies synthetic git command responses; it creates no repository, branch or worktree.
- `02-green.txt`: **19/19** pass: the 13 existing arithmetic/fail-closed tests and six real-engine controls. The controls cover zero source-directory events, unchanged current bytes, exact basename, test suffix, JSX, ignored files, a deleted directory, invalid configuration, historical API failures and actual `--gate` refusal on warning growth.
- `03-lint.txt`: syntax checks pass. Repository ESLint deliberately ignores these CI scripts; its `--no-warn-ignored` invocation exits zero, so it is not presented as a lint examination of the scripts. The integration controls execute the real ESLint engine on their fixture sources.
- The parent session will record the live comparison and publication gates after the combined client/server changes settle. No baseline was changed.
