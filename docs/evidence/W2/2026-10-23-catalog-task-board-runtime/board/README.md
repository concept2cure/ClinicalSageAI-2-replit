# Task-board runtime recovery

Contract: `docs/design/CATALOG_TASK_BOARD_RUNTIME_2026-10-23.md`, items 3 and 4. Baseline: `381a42fda` on `concept2cure-v2`. This worker made no commits or pushes.

## What already exists

- `server/routes/taskBoard.routes.ts` owns the authenticated board read model, reads `unified_tasks` and its dependency edges, and already names unread stores through `meta.partial` / `meta.unreadSources`.
- `server/services/unified-work/unified-work-view.ts` owns the cross-store read and accepts an existing request database. The board previously omitted that argument while holding its request connection.
- `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` owns the canonical board, its error/empty states, source labels and retry control. It already shows partial-source warnings when readable cards exist.
- `client/src/concept2cure/v2/dataConnect.tsx` supplies the existing `isRowsWith` guard and routes failed shape checks through the existing error state. No second fetch, board, task writer or storage mechanism is introduced.
- Existing every-store, recovery, refusal, target and home-handoff tests cover the connected behavior around these changes. The parent evidence README records the repository and deleted-history inventory.

## Reproductions before the fixes

`red.log` records 5 failures / 6 passes from the two focused files before production edits. The route uses the actual `requestDb` and installed Drizzle node-postgres adapter over a synthetic rejecting client. PostgreSQL `42P01` reaches Drizzle as a driver error; Drizzle exposes it at `error.cause.code`, with no top-level code. The route returned 500 rather than retaining readable schedule work with explicit unread-source metadata. Another assertion showed that the cross-store reader received no request database.

The client returned a non-array object or scalar with HTTP 200. It claimed an empty board instead of reaching the existing unavailable state. The initial parameterized receipt also contains a second malformed object case; the final test explicitly preserves an incomplete-row array as one value.

`partial-empty-red.log` records 1 failure / 5 passes after the guard change but before the partial-empty rendering correction: an empty returned array with an unread own store claimed “No tasks on the board yet.” The existing partial warning was inside the nonempty branch. The final behavior names the unread source, says the board is incomplete, and permits retry.

The compact red receipts omit repetitive Drizzle-object and DOM dumps and retain their original hashes, byte counts, exit code, failed cases and result summaries. Full originals remain in the recorded local `/tmp` archives.

## Result and verification

- Missing-table recovery recognizes raw and Drizzle-wrapped `42P01`. The existing failure response remains for permission denial (`42501`), cancellation/timeout (`57014`), missing columns (`42703`) and network failure (`ECONNREFUSED`). No permission or readiness check is bypassed.
- The board passes its existing request database to the cross-store reader, avoiding a second pooled connection for those reads.
- The canonical client opts into `isRowsWith` for task identity and core display fields. Malformed successful objects, scalars and incomplete first rows remain unavailable; retry renders the later valid saved task without a write.
- A valid empty array still renders the honest empty state. An empty partial result names its unread sources and never claims the board is empty. Existing readable partial results retain their source warning.
- `green.log`: **7 files / 95 tests passed** in 22.39 seconds, covering both new suites plus `taskBoard-home-contract`, `taskBoardEveryStore`, `taskBoardRecovery`, `taskBoardRefusalHonesty` and `taskBoardTarget`.
- `shape-final.log`: final parameterization checked separately after correcting Vitest's array argument expansion.
- `lint.log`: **0 errors / 10 warnings**. `lint-baseline-client.log` and `lint-baseline-server.log` confirm the same existing 9 + 1 warnings at HEAD. New test files have no warnings.
- Scoped `git diff --check` passed. Final source/test hashes are in `inputs.sha256`.

Commands used:

```sh
npx vitest run --config vitest.config.ts server/routes/__tests__/taskBoard-runtime-recovery.test.ts client/src/concept2cure/v2/__tests__/taskBoardResponseShape.test.tsx
npx vitest run --config vitest.config.ts client/src/concept2cure/v2/__tests__/taskBoardResponseShape.test.tsx
npx vitest run --config vitest.config.ts server/routes/__tests__/taskBoard-runtime-recovery.test.ts server/routes/__tests__/taskBoard-home-contract.test.ts client/src/concept2cure/v2/__tests__/taskBoardResponseShape.test.tsx client/src/concept2cure/v2/__tests__/taskBoardEveryStore.test.tsx client/src/concept2cure/v2/__tests__/taskBoardRecovery.test.tsx client/src/concept2cure/v2/__tests__/taskBoardRefusalHonesty.test.tsx client/src/concept2cure/v2/__tests__/taskBoardTarget.test.tsx
npx eslint server/routes/taskBoard.routes.ts server/routes/__tests__/taskBoard-runtime-recovery.test.ts client/src/concept2cure/v2/surfaces/TaskBoard.tsx client/src/concept2cure/v2/__tests__/taskBoardResponseShape.test.tsx
```

## Limits

The rejecting-client route test proves actual Drizzle error wrapping and route behavior, not native PostgreSQL isolation. Existing native and browser integration checks belong to the root session. The shared guard checks array shape and first-row key presence; it is not full per-record value validation. Shared null/absent-payload semantics remain unchanged. No deployment incident cause, production migration status, regulated-use qualification or human-testing readiness is established by this bounded repair. No schema, dependency, task-write, approval or signoff behavior changed.
