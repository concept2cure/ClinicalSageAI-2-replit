# Existing authoring filing continuity — client evidence

W1 / D2, local deterministic verification only. Root owns canonical Git and
combined release checks. Final client checks ran after root synchronized
`concept2cure-v2` to `bd24ecb4c`; no package, lockfile or configuration changed.

## What already exists

- `editor/FileToVaultDialog.tsx` already exports through the authoring filing
  route, shows the server receipt and approval, and opens the returned Vault
  record. This increment tightens that same receipt and request boundary.
- `DocumentWorkbench.tsx` and `DocumentCanvas.tsx` already host the dialog.
  Their only production changes keep it mounted with the existing `open` flag,
  preserving an uncertain write through ordinary close and reopen.
- `SubmissionSeqWorkspaces.tsx` already defines `mutateVerbatim` and the definite
  refusal allowlist; `submissionScopedRead.ts` already owns auth revision;
  `shellProject.ts` already owns project-visit guards. These implementations are
  reused without modification. The keyed visit follows `EctdCompile.tsx`.
- `vaultTarget.ts`, `Vault.tsx` and `VaultPlaceIntoSubmission.tsx` already carry
  the returned UUID into the existing `vault_documents` leaf write. The mounted
  composed test qualifies that existing reachability, with shared
  `_vault-surface-fixtures.ts` and existing deferred fixtures. No placement
  control, second editor, CSS, provider or transport was added.

## Retained checks

Each JSON receipt records the actual argv, environment, exit code, elapsed time,
before/after source SHA-256 pins and compressed raw-output SHA-256. The adjacent
`.log.gz` contains the combined stdout/stderr bytes, gzip mtime zero.

| Receipt | Outcome |
| --- | --- |
| `initial/red.json` | Initial test development: 32 failed, 5 passed. Includes one composed assertion wording error (`Placed` versus existing `Filed`) corrected before the clean RED. Its test pins show that in-flight test correction; production pins remained unchanged. |
| `red.json` | Clean pre-fix RED: 31 failed, 7 passed; composed existing placement and genuine same-account bearer refresh passed. The workbench test file was extended during this run but was not an input suite; both executed test files and all production pins were stable. |
| `red-host.json` | Pre-fix mounted workbench RED: uncertain receipt disappeared after closing/reopening the conditionally mounted dialog. 1 failed, 10 skipped. |
| `green.json` | Initial implementation: 7 suites, 121 passed. |
| `lint.json` | Initial scoped lint: 0 errors, 19 warnings; four new warnings were removed before final verification. |
| `red-review.json` | Review regression RED: initial shell/document project mismatch and a synchronous callback retiring the toast context both failed; null-shell positive passed. 2 failed, 1 passed, 37 skipped. |
| `green-final.json` | Reviewed implementation before the final envelope check: 7 suites, 124 passed, exit 0. |
| `lint-final.json` | Six changed files: 0 errors, 15 warnings, all in the two existing large hosts; root owns comparison to canonical baseline. |
| `lint-strict.json` | Dialog and all three changed/new test files: `--max-warnings 0`, exit 0. |
| `red-envelope.json` | Final review RED: contradictory success/data plus a non-null error was accepted. 1 failed, 1 older-envelope positive passed, 40 skipped. |
| `green-envelope-final.json` | Final frozen implementation: 7 suites, 126 passed, exit 0. |
| `lint-envelope-final.json` | Final six changed files: 0 errors, 15 existing-host warnings. |
| `lint-envelope-strict.json` | Final dialog and three test files: `--max-warnings 0`, exit 0. |

The executable name `vitest` was initially unavailable outside npm's PATH; the
recorded runs use actual `node node_modules/vitest/vitest.mjs` argv with the
existing Node 22 toolchain PATH. No test was run by that failed launch.

## Confirmed behavior and limits

Successful HTTP responses require the returned Vault UUID, captured project
UUID, SHA-256 and requested PDF/DOCX format. Missing approval remains unknown.
False-success, missing/bodyless/unreadable/mismatched receipts and ambiguous
transport/server outcomes hold further POSTs and require checking the Vault.
An error alongside plausible success/data is contradictory and likewise held;
the older `{ data }` envelope and explicit `error: null` remain compatible.
`VAULT_VERSION_ALREADY_RECORDED` likewise holds review; definite refusals remain
retryable without a fabricated no-write sentence.

Tests cover duplicate activation, source/project/shell changes including
A → B → A, account/organization/logout changes, genuine bearer refresh,
obsolete rejection/result/callback/toast suppression, null-shell compatibility,
and the actual workbench close/reopen host. A purely presentational file-local
form extraction keeps existing markup and removes new lint warnings; all
mutation, current-context and reconciliation decisions remain in the dialog
controller.

The composed test mounts the actual File to vault dialog, consumes its actual
Open in Vault handoff in the actual Vault and places that same returned UUID
through the existing placement dialog. HTTP answers are deterministic fixtures;
this establishes product reachability and client request identity, not agency
delivery, server approval creation, historical version lineage or human visual
acceptance. The root's server tests and human checklist qualify those separate
boundaries. No compiler, build, full scan or Git mutation ran in this worker.

`independent-review.md` records this worker's subsequent read-only review of
the frozen server ownership/compensation changes and their bounded residuals.
