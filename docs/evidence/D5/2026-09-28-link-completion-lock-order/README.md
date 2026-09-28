# A link and a completion over the same two tasks queue — they do not deadlock

**Row:** D5 (the governed task path). **Session:** `…01P6GWSv`. **Date:**
2026-09-28. **Source:** the open item in
`docs/evidence/D5-GOVERNED-PATH/2026-09-22/README.md` ("Still open": "A
dependency link racing a completion of the same pair can deadlock").

## What was wrong

A completion locks two things, in this order:
1. the task it completes (its `UPDATE`);
2. then that task's dependents (the cascade's locking read).

This holds on every door: `PATCH /api/tasks/tasks/:id`,
`PATCH /api/regulatory/tasks/:id/status`, and AnA's `update_task`.

A link (`unifiedTaskService.linkTasks`, behind
`POST /api/regulatory/tasks/:id/link`) locked both of its endpoints in one read,
**in task-id order**. When the dependent's id sorted first, the link took the
two row locks in the opposite order to the completion:
- the completion held the predecessor and waited for the dependent;
- the link held the dependent and waited for the predecessor.

Postgres broke that after `deadlock_timeout` by aborting one side (`40P01`).
One user's completion or link then failed for no reason of its own. Nothing
partial was written, but the action was lost.

## The change

The link now locks its **source first, then its target**: predecessor before
successor, which is the order every completion takes. In a graph without
cycles that is a single order for every link and every completion, so the
second transaction waits for the first instead of deadlocking.
- **Two links over the same pair, same direction:** they still queue on the
  source.
- **Two links in opposite directions:** these are a cycle attempt, and the one
  case left to Postgres's deadlock detector.
- **Unchanged:** neither endpoint can be archived under the link, and every row
  lock still precedes the ledger row's audit-chain lock.

## Proof

**Real PostgreSQL 16.13**, because a deadlock only exists between two
connections: `tests/db/task-link-completion-lock-order.dbtest.ts`. The tables
are built in a throw-away schema exactly as the migration set builds them.
1. Connection 1 completes the predecessor (`TASK-Z-…`) and holds it.
2. Connection 2 starts a link over the pair, and the test waits until it is
   blocked on a lock.
3. Connection 1's cascade then locks the dependent (`TASK-A-…`, whose id sorts
   first).

| | HEAD | Change |
|---|---|---|
| Outcome | the link is aborted: `40P01` deadlock_detected, after `deadlock_timeout` (1 s) | both commit (152 ms): the dependent is unblocked, and the link row exists |

- **The pinned order.** The unified-tasks PGlite suite's pinned statement
  order changed from one `lock:by-task-id` read to `lock:TASK-X`,
  `lock:TASK-A`: the source first, although `TASK-A` sorts first. It fails
  against HEAD's service.
- **The files.** `red.txt` and `green.txt`. 145/145 pass across the
  unified-tasks, cascade, tasking and AnA cascade suites.
- **Gates.** `ci:drizzle-tenant-scope`, `ci:tenant-isolation:no-regression`,
  `ci:check-unrun-tests` and `ci:db-test-isolation` pass.
- **Type check and lint.** The only type error is in `orgMembership.ts`, a
  file this change does not touch. ESLint is unchanged.

Run it: `TEST_DATABASE_URL=… npm run test:db -- tests/db/task-link-completion-lock-order.dbtest.ts`.
