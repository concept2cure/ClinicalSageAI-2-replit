# AnA's task writes land on the board with their ledger row, or not at all

**Row:** D5 (Part 11: every governed change leaves a record). **Session:**
`…01AiwZKG`. **Date:** 2026-09-24. **Source:** the WO-16C audit-outcome
lane's hand-on, item 1 (`docs/work-orders/README.md`,
`docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/README.md`).

## What was wrong

AnA's `create_task` and `update_task`
(`server/services/ana-ri/command-executor.ts`) mirror a `project_tasks` change
onto `unified_tasks`, the canonical regulated task table the board reads. Then
they record the `task.create` / `task.transition` lineage row. The board write
went through the pool, and the lineage row through a separate best-effort
transaction afterwards.

When the lineage write failed, the board row had already committed: a governed
change to the regulated task table with no §11.10(e) record. The HTTP task
routes already commit the row on the write's own transaction
(`auditTaskActionInTx`), and roll the write back when the row cannot be
recorded. AnA's result also said "Created task" or "updated" either way.

## The change

- **One helper, `boardWriteWithLineage`.** It runs the board write and its
  lineage row on one client in one transaction, and checks the enlisted
  outcome. An unattributable row counts as a failure, as it does in
  `auditTaskActionInTx`. Both rows commit, or neither does.
- **Both mirror paths use it**, the create mirror and the update mirror.
- **What happens after the transaction.** The assignee notice and the unblock
  cascade run after the commit, and only when it committed. The cascade then
  reads the completion it acts on.
- **Still best-effort as a whole, as the mirror always was.** The
  `project_tasks` write that came before still stands.
- **The result says so.** `data.onTaskBoard` / `data.boardUpdated` are false,
  and the message states that the board entry and its audit record could not be
  written.

## Proof (PGlite, a real engine; the property is atomicity, which a mocked pool cannot roll back)

`server/services/ana-ri/__tests__/ana-task-ledger-atomic.pglite.integration.test.ts`:

| Case | Without the fix | With the fix |
|---|---|---|
| create_task: board row with its `task.create` row | pass | pass |
| create_task, ledger store down: no board row without its ledger row, and says so | **fail**: a board row committed without its `task.create` row | pass |
| update_task: board moves with its `task.transition` row | pass | pass |
| update_task, ledger store down: board stays where it was, and says so | **fail**: the status changed to `review` without its `task.transition` row | pass |

`red.txt` / `green.txt` hold the runs.

`ana-task-esign-gate.pglite.integration.test.ts` had a pool with no
`connect()` and no ledger tables, so every lineage write in it had failed
silently. Its three "completion / transition allowed" cases passed only
because the board moved without a ledger row, which is the defect this change
removes. The harness now has a connectable pool, plus the ledger tables from a
new shared `GOVERNED_ACTION_LEDGER_PGLITE_DDL`
(`server/services/ana-ri/__tests__/governed-action-ledger.fixture.ts`), which
the new test uses too. It sits under `__tests__/` because `ci:runtime-ddl`
counts `server/db/pglite-harness.ts` as server code. Both files together: 17/17.

Also:

- The AnA and tasking suites pass: 70 files, 811 tests.
- `tsc` is clean on the changed files.
- The ESLint ratchet is at −2 on `command-executor.ts`.
- `ci:discarded-audit-write`: `command-executor.ts` goes from 2 baselined
  discarded audit outcomes to 0, and the baseline is shrunk to match.
- `ci:dead-audit-catch` and `ci:audit-logs-fixture` are OK.
