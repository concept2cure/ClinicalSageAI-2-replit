# Fold device-tasks into Tasks

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `fb562e76`.

**Status: done.** The device task workbench (`device-tasks`) is folded into Tasks. Its one function that Tasks
lacked, the count of blocking work across stores, was carried first. One mutation survived on the first try. The
test was strengthened and the mutation now fails.

## What a user sees now

- `/concept2cure/device-tasks`, an old ⌘K habit, and AnA's `device-tasks` navigation target all land on Tasks, with
  or without a project open. None of them lands on a 404 or on the old screen.
- The medtech product tour stops at Tasks (`target: 'tasking'`).
- On Tasks, work that another store records as blocking carries a "Blocking the submission" flag: a review or
  correspondence item with a `blocker_type`, or a schedule task flagged critical-to-quality. It is not called
  blocked, and it stays in the column its status puts it in. Analytics counts it, and so does AnA's screen context.
- The Apps catalogue no longer offers "Device submission workload". Existing subscriptions are kept.

## Why it was folded

1. It was a copy of Tasks. FUNCTION_PARITY.md lists device-tasks under "Safe to fold today" (`:846`, `:1172`).
   `docs/SURFACE_DECISIONS_2026-10-08.md:174` records it as `device-tasks | duplicate | tasks`.
2. It showed something false. `GET /api/submission-ops/workload` returns one row per owner:
   `readCanonicalDueSoonAndWorkload` in `server/services/regulatory-correspondence/operating-layer.ts:223-231`
   runs `GROUP BY owner_id, owner_name` and returns the snake_case columns as they are. `useWorkbenchTasks`
   adapted each of those rows as one work item in camelCase. Fed the real response body, TasksSurface drew:
   - two "(Untitled)" cards;
   - two "Unassigned" assignees, although each row names its owner;
   - "Open work" as 2, which is the number of owners; the work was 5;
   - a random id on each card.

   See `red/tasks-surface-shows-false.txt` and the test source beside it. That test was temporary and is removed
   with the screen.

## What already exists

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| The old screen | `client/src/concept2cure/mdx/workbench/Workbench.tsx` `TasksSurface` (deleted) | Kanban and list over `/workload`; off-board counts and "· N blocking" from `/unified-work`; New task and card clicks as AnA prompts | Show a real work item (see above) |
| Its hooks | `client/src/concept2cure/mdx/hooks/useWorkbench.ts` `useWorkbenchTasks`, `useUnifiedWork`, `workNotOnTheBoard` (deleted) | Read the two routes for that screen only | Serve anything else; no other importer |
| The replacement | `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`, mounted as `tasks` (`surfaceViews.ts:573`) | Board, Critical path, Analytics and Table over `GET /api/task-management/board`, which reads every store through `loadUnifiedWork` (`server/routes/taskBoard.routes.ts:483`) | Before this change: mark another store's blocking work |
| The alias mechanism | `DEEP_LINK_ALIASES` in `client/src/concept2cure/v2/registryModel.ts`, resolved by `routing.ts` (`surfaceIdFromLocation`, `destinationFor`) | Same pattern as `mdx` (A2.8), `task-board` and `dossier` | — |
| The catalogue writers | `db/migrations/20260810_reconcile_module_catalog.sql`, `db/migrations/20260823_module_catalog_commercial_packaging.sql` | Step 1 deprecates every id missing from the keep-list on every replay; the packaging file refuses an unknown module | — |
| The retire precedent | A2.7 (`8b192f1e`), A2.10 and A2.10a | Amend both writers in place, deprecate on replay, keep rows and subscriptions | — |
| The replay test | `tests/schema-contract/catalog-module-claims.contract.test.ts` | Replays every catalogue writer on PGlite; covers a fresh database and a replay with subscriptions | — |
| AnA's handle | `shared/navigation/index.ts:205` | The `device-tasks` target, scope global | Kept unchanged; it now resolves to Tasks |
| The routes | `server/routes/submission-ops.ts` `/workload` (`:1410`), `/unified-work` (`:1438`) | Kept | Have a caller. None is left in the client, and AnA's tools do not call them: `ana-ri/command-executor.ts:1012` mentions the view in a comment only. `cross-object-resolver.ts` and `project-schedule-of-events.ts` call the service directly |

Searches run:

- `device-tasks`, `device_tasks`, `deviceTasks` and `TasksSurface` across `client/`, `shared/`, `server/`,
  `migrations/`, `db/`, `scripts/` and `tests/`.
- Every importer of `useWorkbenchTasks`, `useUnifiedWork`, `workNotOnTheBoard`, `TASKS_COLUMNS`, the Task types,
  `STATUS_TO_TASK_COL`, `TYPE_TO_TASK_KIND`, `TASK_COLUMNS` and `TASK_KINDS`. Only TasksSurface and one test used
  them.
- Every caller of `/api/submission-ops/workload`, `/unified-work`, `loadUnifiedWork` and
  `readCanonicalDueSoonAndWorkload`.
- History:
  - `git log --all --diff-filter=D` on the Workbench, TasksSurface, TaskBoard and task file names. It finds only
    `0fc2fc29`, which deleted the sibling TemplatesSurface from the same file.
  - `git log --all -S TasksSurface` and `-S "'device-tasks'"`. Every hit adds; nothing removed either name.
  - This clone is shallow: 1,044 commits and 12 boundary commits, the earliest from 2026-10-22/23. Older history
    is not covered.

## Parity, function by function

The functions are from FUNCTION_PARITY `:803-809`, and each was checked again against the code.

| TasksSurface function | Where Tasks does it | Verdict |
|---|---|---|
| Board of submission-ops work | Read-only cards from every store, which open where the work lives (`TaskBoard.tsx:1446`) | Present, and correct where the old one was not |
| Off-board counts (schedule, filings) | Those items are on the board; per-store count strip (`:1076`) | Present |
| "Some sources could not be read" | Names each unread store (`:1069`) | Present |
| "· N blocking" | Flag on the card (`:1144`) and the table row; Analytics count (`:1224`); AnA facts (`:889`) | **Carried by this change.** The count uses the same rule as `summary.blocking` |
| New task (an AnA prompt) | Real create, POST /api/tasks/tasks (`:990`, `:755`) | Present |
| AnA context | `usePublishSurfaceContext('tasks')` (`:929`) | Present |
| Loading, error and empty states | `:1012` onwards | Present |
| List view | Table view (`:1250`) | Partial, not real today (the old rows were per-owner counts) |
| "Mine" (compared against the hard-coded 'JC') | My tasks, by the signed-in user's id (`:1098`) | Partial, not real today |
| Four KPI cards | Analytics metrics (`:1224`) | Partial, not real today |
| Ask AnA from a card | Ask AnA on an own task's detail (`:1673`) | Partial, not real today |
| Card flags (e-sign, comments, due) | Approval, comments, overdue (`:1151`) | Partial, not real today |
| Overdue work for each owner | Team productivity (`:1239`) | Partial, not real today |
| Tour stop | Retargeted to `tasking` | n/a |

Every function that is real today now has its home in Tasks.

### The blocking flag

- `server/routes/taskBoard.routes.ts:320`: `blocking: item.blocking` on `otherStoreCard`. The value is the
  cross-store view's own field (`unified-work-view.ts` `taskToUnified`, `workItemToUnified`), so the board infers
  nothing. `blocked` still means the status only.
- `TaskBoard.tsx`:
  - a `tb-flag blk` flag, titled "Blocking the submission", on the card and on the table row, shown only when the
    work is not already blocked;
  - a count of blocking work, by the summary's rule: blocked, or recorded as blocking by another store, or a board
    task on the critical path that is not done;
  - the count appears in Analytics and in AnA's screen context.

## Replacement and reachability

Replacement: `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` at `tasks`. It is reached from the old id through
`DEEP_LINK_ALIASES['device-tasks'] = 'tasks'` (`registryModel.ts:984`).

Proved by `client/src/concept2cure/v2/__tests__/foldDeviceTasks.test.ts`:
- the old id resolves to `tasks` from a URL, from an in-app move, and from AnA's target, with or without a project
  open;
- `tasks` is mounted by `TaskBoard`;
- the old id has no view, no registry entry (so ⌘K cannot list it) and no kit id;
- no client file names TasksSurface;
- neither scope list, the device rail nor the tour names the old id.

`navigationReachability.test.ts` proves that the kept AnA target reaches a real view.

## What changed

Product:
- `client/src/concept2cure/mdx/workbench/Workbench.tsx`: TasksSurface deleted.
- `client/src/concept2cure/mdx/MdxSurfaceHost.tsx`: import, meta entry, `ORGANIZATION_VIEWS`, the publish call and
  the case removed.
- `client/src/concept2cure/mdx/surfaceIds.ts`, `client/src/concept2cure/v2/surfaceViews.ts`,
  `shared/constants/ui-surface-registry.ui-v2.ts`: the id removed.
- `client/src/concept2cure/v2/registryModel.ts`: the alias added, and the id removed from `SEGMENT_MODULES`.
- `shared/constants/launch-scope.ts`, `shared/constants/mdx-project-features.ts`: the id removed from both lists.
- `shared/navigation/demo-scripts.ts`: the tour stop now goes to Tasks.
- `server/routes/taskBoard.routes.ts`, `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`: the blocking flag.
- Leftovers deleted:
  - `useWorkbenchTasks`, `useUnifiedWork` and `workNotOnTheBoard` (`mdx/hooks/useWorkbench.ts`);
  - `mdx/hooks/__tests__/useWorkbench.unified.test.ts` (deleted file);
  - the Task types and `TASKS_COLUMNS` (`mdx/data/workbench.ts`);
  - the Workbench Kanban maps (`shared/constants/mdx.ts`).
- Migrations, both amended in place with a dated note (CLAUDE.md Rule 1):
  - `20260810`: the id is off the keep-list and out of the upsert, so step 1 deprecates the row on every replay;
  - `20260823`: the packaging row is removed;
  - nothing is deleted, and subscriptions are kept.

Gates and scripts:
- `scripts/ci/check-ana-surface-context.mjs`: `ID_BASELINE` 113 → 112. The old id is now an alias, not a
  publisher.
- `scripts/ci/check-launch-scope-api.ts`, `scripts/visual-qa/dump-v2-surfaces.spec.tsx`: the id removed.

Tests:
- New: `server/routes/__tests__/taskBoard-blocking.test.ts`, `client/src/concept2cure/v2/__tests__/taskBoardBlocking.test.tsx`,
  `client/src/concept2cure/v2/__tests__/foldDeviceTasks.test.ts`.
- Extended:
  - `tests/schema-contract/catalog-module-claims.contract.test.ts`: fresh-database and replay cases;
  - `server/services/entitlements/__tests__/launch-scope.test.ts`: a guard that the id is in neither list;
  - `client/src/concept2cure/v2/__tests__/ProjectMdxWorkflow.test.tsx`: the id's entry removed; counts now 20
    features, eleven opened from Plan, nine with no door;
  - `client/src/concept2cure/mdx/workbench/__tests__/workbenchNoFixtures.test.tsx`: the TasksSurface cases went
    with the screen. Tasks pins the same failed-read rule in `taskBoardResponseShape.test.tsx`.

## Proof

- `red/`: each new test failed first, for the reason it exists.
  - `server-blocking.txt`: 4 of 4 fail.
  - `client-blocking.txt`: the 2 positive cases fail. The 2 cases that check nothing is invented pass at baseline.
  - `catalog-replay-at-head.txt`: both new cases fail against the HEAD migrations.
  - `fold-guard-alias-removed.txt`: with the alias removed, the old id resolves to its own screen.
  - `tasks-surface-shows-false.txt`: the false screen, described above.
- `green.txt`: 28 files on the final tree, run one at a time, all green. This includes the suites that render
  every surface view: surfaceRender (253 tests), a11ySemantics, liveBranchRender, hostilePayloadProbe and
  workflowAudit. All 16 TaskBoard suites are green.
- `mutations/`: each mutation was restored byte-for-byte, checked with `cmp`.

  | Mutation | Turned red |
  |---|---|
  | M1: put the TasksSurface import back in the host | foldDeviceTasks "no client code naming TasksSurface" |
  | M2: remove the alias | foldDeviceTasks, plus two navigationReachability cases (`device-tasks → device-tasks`) |
  | M3: leave the id in the Projects list | the launch-scope guard and foldDeviceTasks |
  | M3b: leave the id in the feature list | the existing subset pin and the launch-scope guard |
  | M4: the server derives blocking from the status | 3 server cases |
  | M5: count blocking work as Blocked | **survived** the first test (`M5-survived-before-strengthening.txt`); the Analytics Blocked metric is now pinned and the mutation fails |
  | M6: put the id back on the 20260810 keep-list | replay, through the packaging guard ("no tier assigned: device-tasks") |
  | M7: put the 20260823 packaging row back | the fresh-database replay raises "packaging names modules that are not in available_modules: device-tasks" |

- `gates.txt`:
  - green: ci:launch-scope (53 surfaces), ci:launch-scope-api, ci:ana-surface-context, ci:surface-discoverability,
    ci:migration-drop-safety, ci:migration-set-order, check:catalog-copy, ci:migration-deploy-path and
    ci:undefined-css-classes;
  - ci:check-client-reachability fails on `hooks/useRejectWorkflow.ts` and `services/workflowDecisionService.ts`.
    Both existed before this change, and it adds no new unreachable file.
- `eslint.txt`: every touched file is at or below its HEAD count. The new files have 0 problems.
- Typecheck: the changed files were compiled through a temporary tsconfig that extends the root one. No error is in
  a changed file. The remaining errors are in untouched files and come from ambient declarations that a partial
  config does not load.

## Handed on

- `/api/submission-ops/workload` and `/unified-work` have no caller now, from the client or from AnA. They are kept.
- AnA's `device-tasks` target keeps its old label and description ("The device task workbench"), but it opens
  Tasks. Its text is in `shared/navigation/index.ts`, which this slice did not edit.
- FUNCTION_PARITY.md's Fold column and the IA rows still describe device-tasks as pending.
- `client/src/concept2cure/v2/surfaces/DeviceSurfaces.tsx` says "seventeen" in a comment. It was stale before this
  change.
