# AnA's completion cascade commits with the completion, on the ledger

**Row:** D5 (Part 11: every governed change leaves a record). **Session:**
`…01P6GWSv`. **Date:** 2026-09-28. **Source:** the open item in
`docs/evidence/D5-GOVERNED-PATH/2026-09-22/README.md` ("Still open"), claimed in
`docs/work-orders/README.md`. It follows `docs/evidence/D5/2026-09-24-ana-task-ledger/`,
whose `boardWriteWithLineage` this builds on.

## What was wrong

When AnA completes a task (`update_task`,
`server/services/ana-ri/command-executor.ts`), the board move and its own
`task.transition` row commit together. That has been so since 2026-09-24. The
completion cascade then ran **after that COMMIT, on the pool**, through the
no-transaction entry point (`cascadeUnblockOnCompletion`). Two consequences:

- **No record of the dependents.** Every dependent the cascade unblocked changed
  `status` and `blocked_by` with no §11.10(e) row.
- **A half-done completion.** A cascade that failed part-way was logged as
  "non-fatal". The completion stayed committed and its dependents stayed
  blocked. The board contradicted itself, and AnA's answer said "updated".

The HTTP task routes already run the cascade on the completion's own
transaction (`cascadeUnblockOnCompletionInTx`) and write its rows after the
completion's (`docs/evidence/D5-GOVERNED-PATH/2026-09-22/README.md`, "T1, T2,
T4" follow-up).

## The change

- **The cascade runs inside the completion's transaction.** In `update_task`,
  when the board move is a completion, the cascade runs inside
  `boardWriteWithLineage`'s transaction. It uses the new pool-client entry point
  `cascadeUnblockOnCompletionOnClient` (`task-side-effects.ts`), which is
  Drizzle over the board write's own connection, delegating to
  `cascadeUnblockOnCompletionInTx`.
- **Rows in cause-then-effect order.** `boardWriteWithLineage` writes the
  completion's row first, then one row per dependent the cascade changed. The
  dependents' notices go out only after COMMIT.
- **Locks in the one order every task transaction uses.** The completed row is
  locked first (its UPDATE), then the dependents (the cascade's locking read),
  then the audit chain (the ledger rows).
- **All or nothing.** A cascade or ledger failure rolls the completion back with
  the rest. AnA's answer then says "the task board still shows the previous
  state". The `project_tasks` write before it stands, as the mirror has always
  been best-effort.
- **The no-transaction entry point** `cascadeUnblockOnCompletion` has no
  production caller left. It remains a thin wrapper over the same walk, used by
  two test suites.

### Tests: one pool fixture for the AnA executor suites

In production, the board write's client is a pg `PoolClient`. It answers pg's
`query(text, values)`, and Drizzle's `query({ text, values, rowMode })` with
raw timestamps. The two existing AnA task suites faked it with a
`query(sql: string)` only, and had no `task_dependencies` table. Under the old
code, the e-signature suite's completions ran their cascade on a stub `db`
after COMMIT. It failed there, and the failure was swallowed: the defect
itself.

`server/services/ana-ri/__tests__/pglite-pool.fixture.ts` is one pool that
answers both call shapes the way production does. `ana-task-ledger-atomic` and
`ana-task-esign-gate` now use it and create `task_dependencies` from the
baseline. Their cases are unchanged. They were last edited on 2026-09-26, more
than 24 hours before this change.

## Proof (PGlite, a real engine: the property is atomicity)

`ana-task-cascade-ledger.pglite.integration.test.ts`: `unified_tasks` and
`task_dependencies` exactly as the migration set builds them. `db` is real
Drizzle over the same connection, so the old path really moved the dependent.
What it could not do was record the move, or roll it back.

| Case | HEAD | Change |
|---|---|---|
| A completion unblocks its dependent; the dependent's `task.transition` row exists and is written after the completion's | red: *"the dependent moved with no task.transition row"* | green |
| A cascade that cannot finish (`task_dependencies` unavailable) takes the completion back | red: *"the completion committed while its dependents could not be moved"* | green |

- `red.txt`: both cases against HEAD's `command-executor.ts` and
  `task-side-effects.ts`.
- `green.txt`:
  - 19/19 across the new suite and the two AnA task suites;
  - 825/825 across every AnA executor and tasking suite, the HTTP cascade suite
    and the rail-actions client suite.

Gates: all pass.
- `ci:discarded-audit-write`, `ci:server-error-leaks`,
  `ci:tenant-isolation:no-regression`, `ci:drizzle-tenant-scope`,
  `check:security-patterns`, `ci:regulated-delete-audit`, `ci:sign-ceremony`;
- `ci:db-test-isolation`, `ci:check-unrun-tests`, and the requestDb coverage
  audit;
- a scoped type check with no errors in the changed files;
- ESLint: no changed file gained a warning.

## Still open

- ~~**A link racing a completion can deadlock.**~~ Closed the same day: a link
  locks its source first, the order a completion takes
  (`docs/evidence/D5/2026-09-28-link-completion-lock-order/`).
- **The executor's other board-changing commands** were not re-read for this
  change; it covers `update_task` only.
