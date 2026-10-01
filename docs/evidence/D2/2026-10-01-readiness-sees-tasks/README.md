# D2 — AnA's readiness review and recommendations see the project's real tasks

**Date:** 2026-10-01 · **Row:** D2 · Follows `…01JNRgCK`'s counts fix (`7694bcad0`, `docs/evidence/D2/2026-10-01-task-completion-honest/`)

## The defect

`resolveTasks` in `server/services/orchestration/cross-object-resolver.ts` built AnA's project task list from `regulatory_audit_logs` rows tagged `entity_type = 'task'`. That is wrong in three ways:

- it read the whole organization's rows, not the project's;
- no writer in the server produces such a row;
- it numbered the results 1, 2, 3.

So `payload.tasks` was always empty. As a result:

- `computeReadinessAssessment` could never raise its `blocked_task` blocker;
- `generateRecommendations` could never produce a blocked or overdue task recommendation.

This held even though, since `7694bcad0`, the project counts beside the list correctly said tasks were blocked and overdue.

## The change

- **One read, one list.** The task list reads the platform's one cross-store work view (`loadUnifiedWork`, completed work included): the schedule, the board, agency correspondence and filings.
- **Counts derived from the list.** The project counts (`totalTasks`, `doneTasks`, `blockedTasks`, `overdueTasks`, `taskCountsPartial`) now come from that same list rather than a separate read. The review's number and the review's list cannot disagree.
- **Real ids.** Each task carries the view's composite id (`board:…`, `schedule:…`), not an invented number. `TaskSnapshot.id` is a string.
- **Same definitions as the counts.** Blocked is the view's `blocking` flag. Overdue is not done and past due.
- **Reads that fail are never an empty list:**
  - if no task store could be read, the payload fails with `tasks` named, as every other read does;
  - if some stores could not be read, the review carries a blocker saying blocked or overdue work may be missing.
- An `urgent` blocked task is a high-severity recommendation, like `high`.

## Proof

| Check | Result |
|---|---|
| `tests/db/cross-object-resolver.dbtest.ts`, real PostgreSQL as the runtime role with RLS on, against trunk's resolver | `red-against-trunk.txt`: 2 of 9 fail. The list is empty, and the review raises no `blocked_task` although the counts say 2 are blocked. |
| Same, after | `green.txt`: 9/9. The list holds every store's open work by real id, excludes the other organization's task, and its blocked, overdue and total match the counts. The review raises the blocked work, and the recommendations name the overdue task. |
| The partial-store blocker, removed | `red-partial-blocker.txt`: its unit case fails |
| Related unit tests (70 files touching orchestration) | `green-related.txt` |
| `continuity-baseline.dbtest.ts` (the AnA Command lane's suite) | 11/11, unchanged |
