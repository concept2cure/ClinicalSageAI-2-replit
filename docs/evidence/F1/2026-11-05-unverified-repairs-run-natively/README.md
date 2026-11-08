# F1 — the repairs written without node_modules, run natively

Session `session_01QoxbLb8fV1RgQvaa8JHYku`, 2026-11-05, package F1. The coordinating session is out of credit; this
picks up the repairs it had not verified.

## What already exists (RULE 3)

Between 2026-11-02 and 2026-11-04, 45 commits (author `concept2cure`) landed shared-platform and CSR repairs:

- the export render snapshot, `server/services/authoring/authoring-export.ts`;
- workspace config and its isolation, `server/routes/workspace-config.routes.ts` and
  `shared/regulatory/workspace-config.ts`;
- regional applicability, `server/services/regulatory/workspace-config-enrichment.ts`;
- the submission resolver and its query boundary, `server/services/regulatory/submission-resolver.ts` and
  `server/routes/biopharma/submissions.ts`;
- navigation entitlements bound to the account visit, `client/src/concept2cure/v2/navEntitlements.tsx`;
- AnA's context cache, `server/services/lumen-context/intelligence-prefix.ts`;
- the CSR review, import, job-runner and narrative fences, under `server/services/csr/` and
  `server/services/authoring/workflow-source-import.ts`.

Their own evidence says the work was done in a workspace with no installed dependencies and no network. Vitest,
the whole-repository typecheck and the pre-push gates were "pending" or "not passed here". One of them left trunk
unparseable; another session fixed that in `58e6cf76`. No production code is added here. Every change is a test
brought up to date with shipped behaviour, a copy or reach defect, or a CSS gate.

## What was run

`npm ci`, then Vitest 3 on Node 22.23.4 over the 29 test files those commits added or changed (`suites.txt`).

| Run | Files | Tests | Pass | Fail |
|---|---:|---:|---:|---:|
| The 29 suites, at `ccc797bd` (`repairs-29-suites-before.txt`) | 29 | 560 | 555 | 5 |

The five failures were all CSR screen tests that were out of date with the screen. The shared-platform repairs'
suites passed natively: export snapshot, workspace config, the resolver, nav entitlements, the context cache and
the CSR server fences.

`node scripts/ci/typecheck-no-regression.mjs --incremental`: 0 errors.

## What was found and fixed

| Commit | What | Cause |
|---|---|---|
| `7048ea80` | csrBuildProgress (4), csrCardReach (1), csrWorkflowProgramScope (1) | Tests answered the editor's other reads with `{}` (each a failed read with its own alert); Approve now needs the saved text read first (F9); the board read carries an AbortSignal. Superseded at merge by the CSR lane's own fix of the same suites (`9eb24c87`); the merge kept its version. |
| `57eef8e8` | Risk-based monitoring had no navigation target | P-76 put it in the rail and the catalog, but AnA's navigate, the @ menu and the tour could not open it. The tour also skipped Biostatistics. The calculators were labelled "workbench", a word the client-copy rule forbids. |
| `57eef8e8` | clientNamesSlice1's account-menu cases | Their mocked user had no id. Since `0fc881c1` the navigation read needs one. |
| `3b04e2e3` | ci:check-phantom-tokens, ci:surface-text-ramp, projectHomeStageCss | `--danger-000` does not exist, so a failed quality count rendered grey; the generated ramp was stale; a shared class laid out in two work-area scopes was counted as a clash. |
| next commit | capabilityBrowser (2), clientCopyNoProgram (1) | The same id-less mock user; one action description said "program". |

## Not done here

- Native Word/PDF opening, HTTP refusal mapping and a browser walk of the export repair (the render-snapshot
  README's open list).
- The eight dependency advisories `ci:dependency-risk` names, which go to Security Engineering.
