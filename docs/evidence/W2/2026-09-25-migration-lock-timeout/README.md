# W2 / D1 — a deploy's migration no longer stalls the running application behind a lock

Row **D1** (hosted production). Session `…013CtPf8pjozina2nVvDYkyB`, 2026-09-25.

## The defect

`deploy-aws.yml` runs `deploy-migrate` as a one-off task **while the previous API
tasks are still serving**, and every file in `C2C_MIGRATION_FILES` re-runs on every
deploy (CLAUDE.md, Rule 1). The migration session set no `lock_timeout`.

A replay that changes nothing still takes `ACCESS EXCLUSIVE` locks. Measured on a
provisioned PostgreSQL 16 database (`replay-lock-footprint.txt`, produced by
`measure-lock-footprint.mjs`):

| | |
|---|---|
| files in the set | 309 (58 self-transacting, not measured) |
| files taking `ACCESS EXCLUSIVE` on a table during a no-op replay | **114** |
| distinct tables locked that way | **151**, including `projects`, `organizations`, `users`, `audit_logs`, `vault.documents` |

`ALTER TABLE … ADD COLUMN IF NOT EXISTS` takes its lock before it checks whether the
column exists. Without contention each lock lasts milliseconds. With contention,
PostgreSQL queues the `ALTER` behind any open transaction that has read the table,
and queues every later query on that table behind the `ALTER`. Only the blocker could
end the wait: up to the runtime pool's 30 s `statement_timeout`, or 60 s
`idle_in_transaction_session_timeout`. For that long, every request touching the table
hung. `organizations` is touched by every authenticated request, so this could happen
on any deploy that met one slow request.

## The fix

In `scripts/db/migration-set.mjs`, `applyMigrationFiles` is the one applier behind
both `deploy-migrate` and `apply-c2c-migrations`:

- **Cap on lock waits.** It sets a session `lock_timeout`, 2 s by default, and
  restores the previous value afterwards.
- **Bounded retry.** A file that times out on a lock is rolled back and retried with
  backoff: 12 attempts, starting at 1 s and doubling to a 10 s cap, about 110 s in
  all. Retrying is safe for the reason Rule 1 exists: every file already re-runs on
  every deploy.
- **Loud failure.** A lock that never frees fails the file, naming it, and logs the
  open transactions that were holding locks.
- **Only lock timeouts are retried.** Any other error fails at once, as before.

`deploy-migrate` gives the authoring subsystem's transaction the same cap and retry;
its tables are live in production. `authoring-subsystem.mjs` now keeps the original
error as `cause`, so a lock timeout can be told apart from a real fault.

Tuning is by environment variable: `C2C_MIGRATION_LOCK_TIMEOUT_MS`,
`C2C_MIGRATION_LOCK_ATTEMPTS`, `C2C_MIGRATION_LOCK_BACKOFF_MS`.

## Proof: red, then green

`tests/db/migration-lock-timeout.dbtest.ts` runs on real PostgreSQL 16:

| case | trunk (`dbtest-red.txt`) | fixed (`dbtest-green.txt`) |
|---|---|---|
| request behind a waiting migration (reader holds 4 s) | **3998 ms** | < 1500 ms; migration applies after the reader commits |
| lock that never frees | hangs until the 60 s test timeout | fails in 0.8 s after 3 attempts, naming the file, nothing applied |
| non-lock error | fails once | fails once, not retried |
| session `lock_timeout` restored | — | yes |

Then the real `deploy-migrate`, as a full 309-file replay against a provisioned
database. A "slow request" holds a read on `organizations` for 8 s, and a request
loop reads `organizations` every 50 ms (`deploy-under-load.mjs`):

| | worst request latency | deploy |
|---|---|---|
| trunk (`deploy-under-load-before.txt`) | **7721 ms** | exit 0, 9.6 s |
| fixed (`deploy-under-load-after.txt`) | **1985 ms** | exit 0, 9.5 s, two logged retries on `20260730_fk_delete_policies_port.sql` |

## Checks run

- Blank → `install-fresh` → `deploy-migrate` → replay `deploy-migrate` →
  `deploy-smoke-assert`, all exit 0.
- The applier's existing tests all pass:
  - contract tests: 410 tests across 6 files;
  - `apply-c2c-migrations-manifest`: 9;
  - `workflow-approval-tables.dbtest`: 8;
  - `check-constraint-replay.pglite`.
- `ci:migration-drop-safety` and its selftest pass.
- `ci:db-test-isolation` passes.
- `typecheck` exits 0.
- ESLint reports no findings on the new test.

## Not fixed here, next in this lane

The cap bounds how long a migration **waits** for a lock. It does not bound how long
a migration **holds** one. Six files in the set drop and re-add 14 foreign keys, with
full validation, on every replay (9 of them in
`db/migrations/20260730_fk_delete_policies_port.sql`). Each re-add scans the whole
child table while holding `SHARE ROW EXCLUSIVE` on both the child and the parent,
which blocks writes to both for the length of the scan. On an empty CI database that
takes milliseconds. On a production database it grows with the data, on every
deploy. Rule 1's remedy is to amend the creating files in place, so that the
constraint is replaced only when its definition differs.
