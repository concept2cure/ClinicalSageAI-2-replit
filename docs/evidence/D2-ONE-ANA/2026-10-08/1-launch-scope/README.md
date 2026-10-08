# Step 1 — the launch scope keeps only what is real

Launch row **D2**, 2026-10-08. Decided in `docs/SURFACE_DECISIONS_2026-10-08.md`, under the founder's delegation of 2026-10-07.

## What changed

`shared/constants/launch-scope.ts` moves 11 surfaces out of the launch scope; 30 remain where 41 were reachable.

- From Projects: `program-journey`, `filings-catalog`.
- From Authoring: `regulatory-workspace`, `template-library`.
- From Submission Center: `ectd-coauthor`, `dossier-map`, `ectd-publishing`.
- From QMS: `qmp`.
- From the shell: `ana-command`, `ana-memory`, `training`.

The seven apps of D2 all stay. Each app keeps at least one screen, and a test now checks that. The scope file records the reason for each removal beside the list.

`ProjectHome.tsx` stops offering the locked screens:

- a CTD module chip opens the program's documents, not the dossier map;
- "Trace a claim to its source" shows only when the source tracer can be opened;
- the Plan, Respond and Lifecycle tools are filtered by the same launch-scope verdict as the Workspace grid, and a stage left with nothing says "Not in this release";
- the Plan stage stops pointing at meetings, eTMF and grants "above" while none of them can be opened.

## Shown

| Check | Before (`red/`) | After (`green/`) |
|---|---|---|
| `launch-scope.test.ts`: the eleven are out, a bought row is still locked, every app keeps a screen | 11 failed, 14 passed | 25 passed |
| `projectHomeLaunchScope.test.tsx` (new): no stage, chip or button opens a locked screen | 5 failed | 5 passed |
| The server and shared tests that name any of the eleven, plus `server/services/entitlements` and the API gate | 4 failed (below) | 498 passed |
| The client tests that name any of the eleven, plus the project, scope, nav and rail suites | — | 365 passed (63 files) |
| `ci:launch-scope` | — | routable, registered, licensable, fixture-free |
| `ci:launch-scope-api` | — | 269 paths named by launch and shell screens, none refused |
| `ci:canvas-path` | — | wired |

**The four tests that pinned the old scope** (`red/server-tests-four-pinned-paths.txt`) each named a route that only a now-locked screen calls:

- `/api/orchestration/execute` and `/templates`: only AnA Command and the locked Orchestration board call them;
- `/api/mdx/ana/memory`: only AnA memory calls it;
- `/api/dossier-map`: only the dossier map calls it;
- `/api/report-os/portfolio/org`: only AnA Command and Orchestration call it.

A search of `client/src`, `server` and `shared` found no other caller of any of them. The tests now assert that production refuses them, and each says why.

## Not changed

- No surface or component is deleted. The working agreement requires a deletion to name its replacement and the test that proves it; those changes come one by one.
- No migration and no catalog row changes. Modules leave only the set granted to a new organisation.
- AnA's toolset is unchanged. No hidden-app group in `server/services/ana/ana-launch-scope.inventory.json` names any of the eleven: their tools were classified `inScope` while these were launch screens. Reclassifying them is a separate decision; nothing here depends on it.
