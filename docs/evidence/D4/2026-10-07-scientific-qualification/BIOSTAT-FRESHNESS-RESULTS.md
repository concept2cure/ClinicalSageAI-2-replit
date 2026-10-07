# Biostat result freshness — local qualification

Date: 2026-10-07. Workstream: W3. Launch row: D4.
Baseline source: `cdc1308d97fa4564d799001f536fb423b9a5cc0e`.
Contract: [BIOSTAT-FRESHNESS-CONTRACT.md](BIOSTAT-FRESHNESS-CONTRACT.md).

## Result

CalculatorPanel now revokes an accepted result when inputs change, reset is
clicked, or a new compute is attempted, including local validation refusal.
An input edit-back does not revive an older computation. Pending responses
must still own the current calculation before they can publish a result,
announce an error or end its busy state. Calculator unmount revokes that
ownership. Reset and revised-input computation remain available while an
obsolete network request completes.

The Insert callback checks the accepted result's authority synchronously. The
existing full-result table/hash handoff is unchanged. An Insert already
authorized while the result was current completes its original save snapshot
after later edits; this does not make that result fileable again.

## RED before production changes

Command:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx -t 'D4 — Biostat result freshness'
```

At 09:22:27 UTC (the runtime reported 05:22:27 EDT), on the original component with the new regression tests:
**9 failed, 58 skipped, 67 total** (5.05 seconds).

| Regression | Observed RED behavior |
| --- | --- |
| Edit and edit-back after a successful result | The previous Insert action remained available immediately after editing. |
| Invalid local rerun | The previous result remained fileable after the required-input refusal. |
| Unchanged-input rerun, eventual domain refusal | The previous Insert action remained available while the rerun was pending. |
| Unchanged-input rerun, eventual thrown network failure | The previous Insert action remained available while the rerun was pending. |
| Pending success after input edit-back | The obsolete response became fileable. |
| New success followed by old success | Revised inputs could not be computed while the original request was pending; the test could not reach the required response ordering. |
| Old thrown failure while newer calculation is pending | Revised inputs could not start a new calculation while the original was pending. |
| Reset while a calculation is pending | Reset was disabled and the input stayed `0.4`. |
| Calculator switch before failure response | The obsolete calculator's error was displayed on the newly selected calculator. |

## GREEN and preservation controls

Command:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx client/src/concept2cure/v2/__tests__/biostatWorkbenchFreshness.test.tsx
```

After the fix, all 67 cases passed. One additional positive boundary control
then verified that an already authorized Authoring save keeps its snapshot
when the user edits during the save. This control mounts under React StrictMode
to exercise initial effect cleanup/replay before the successful compute and
filing. The new cases were moved into the focused freshness test file to keep
the warning ratchet flat, and the original test file was restored byte-for-byte.
The complete final two-file run at 09:26:28 UTC (05:26:28 EDT):
**68 passed, 0 failed** (6.70 seconds): 58 existing cases and 10 freshness cases.

The passing suite includes:

- All nine former RED cases, using visible inputs/buttons and controlled
  HTTP responses rather than implementation-state inspection.
- Old success arriving after the newer accepted result: only the newer
  result's 65-row table and complete 64-character input hash are filed.
- Old thrown rejection arriving before the current success: no obsolete
  alert, current busy state retained, then the current result becomes fileable.
- Existing scalar, table-only, heterogeneous/null-row, later-column,
  untruncated numeric, escaped text, full-table/full-hash and project refusal
  controls.
- Existing 401/domain error copy and failed Authoring-save behavior.
- The accepted-save snapshot boundary under StrictMode described above; no retroactive
  cancellation or rollback is claimed.

Scoped lint command:

```sh
npx eslint client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx client/src/concept2cure/v2/__tests__/biostatWorkbenchFreshness.test.tsx
```

Exit 0: **0 errors, 4 warnings**, with no suppression or lint-baseline change.
Baseline counts were checked by piping each baseline file from `git show`
through ESLint's `--stdin --stdin-filename` mode; no repository temporary files
were needed.

| File | Baseline warnings | Final warnings |
| --- | --- | --- |
| `BiostatWorkbench.tsx` | 4 | 4 |
| `biostatWorkbench.test.tsx` | 0 | 0 |
| `biostatWorkbenchFreshness.test.tsx` (new) | — | 0 |

The four retained warnings concern existing component complexity/function
length. Scoped `git diff --check` passed; `git diff --exit-code` confirms the
original test file is unchanged. Root control tower owns integrated
build/lint/release gates and commits/pushes.

## Limits

This is local UI/Authoring-boundary evidence using controlled HTTP responses.
It does not qualify a live provider, dataset fitness, statistical method,
regulatory filing, production deployment, or all of D4. No dependency, API,
engine, store, surface, review/approval gate or export policy was added or
changed. The server's existing computation and Authoring routes remain the
only producers and filing path.
