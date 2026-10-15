# D2 — AnA Command's "Tasks done" is computed from every task store, or no figure

**Row:** D2 (launch catalog: Projects). **Source:** the "→ Projects, unclaimed — Two task stores" measurement on
`docs/work-orders/README.md` (`…01E2moDu`, 2026-09-29). **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`, claimed before
the work.

## What was wrong

- `server/services/orchestration/cross-object-resolver.ts` hardcoded `totalTasks`, `blockedTasks` and `overdueTasks` to
  **0** for every project. These feed AnA's reasoning context (the readiness and recommendation engines): AnA was told
  every project had no tasks and nothing blocked.
- `server/services/orchestration/continuity-service.ts` turned a zero total into `taskCompletionPercent: 100`, and
  `AnaCommand.tsx` rendered it: **"Tasks done 100%" on every project**, whatever its state. Its formula was also
  `(total − blocked) / total` — the non-blocked share — so with real counts a project where nothing was done but
  nothing was blocked still read 100%.

## What is true now

- The resolver reads the platform's one cross-store work view, `loadUnifiedWork` (schedule-of-events tasks, the board,
  agency correspondence and filings), with completed board work included through a new opt-in `includeCompleted` (the
  board alone is read open-only, because the work queues that call the view show outstanding work; their default is
  unchanged). `ProjectSnapshot` gains `doneTasks` and `taskCountsPartial` — the view's own caveat that a store could not
  be read, so a floor is never read as a total.
- `taskCompletionPercent` (now an exported pure function) is done ÷ total, and **no figure** (`null`) when there is
  nothing to complete or a store went unread. AnA Command shows `—` for that state.

## Proof

| File | |
|---|---|
| `red/resolver-before-fix.txt` | `tests/db/cross-object-resolver.dbtest.ts`, new case: five tasks across three stores in the project (plus another organisation's), as the runtime role with RLS on — every count 0. |
| `green/dbtests-after-fix.txt` | That suite and `continuity-baseline.dbtest.ts` (the AnA Command lane's, unchanged): 18/18. Total 5, done 2, blocked 2, overdue 2, not partial; the other organisation's task does not count. |
| `green/unit-after-fix.txt` | Orchestration, unified-work and AnA Command client suites, with `task-completion-percent.test.ts`: 46/46. |
| `red/M2-completed-board-work-dropped.txt` | With `includeCompleted` ignored, the cross-store case fails (completed board work leaves both total and done). |
| `red/M3-old-formula.txt` | With the old formula restored, all four formula cases fail (40%, 0% not 100%, no figure for no tasks, no figure when partial). |

Also: the view's two other callers' suites 33/33 (default unchanged); three orchestration fixtures gained the two new
fields; typecheck 0; lint ratchet unchanged; tenant-isolation, security-patterns, server-error-leaks and microcopy OK.

## Not done here

- **The task board itself** still reads `unified_tasks` only (`server/routes/taskBoard.routes.ts`): schedule,
  Communication Center and correspondence tasks never appear on it, and its Blocked tile cannot see them. Showing them
  needs a client change in `TaskBoard.tsx`, in another lane's 24 h window (`b894544ae`, 03:08). Next.
- `project-rollup-service.ts` counts tasks for the hierarchy rollup from `project_tasks` alone — a second count path,
  recorded here for whoever moves it onto the view.
