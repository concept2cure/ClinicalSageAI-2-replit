# U12 / U13 / U15: in-process schedulers under RLS and multi-process ECS

Launch row: **D1 (hosted production)**. Workstream W2.
Date: 2026-09-25 (batch 2026-09-24-multi-task). Branch: `concept2cure-v2`, not committed. The lead commits.

## Production shape these fixes target

- `NODE_ENV=production`, `RLS_ENFORCE=on`. The runtime connects as `app_service` through `APP_DATABASE_URL`, and `server/db/poolInstrumentation.ts` refuses any `pool.query` or `pool.connect` made with no tenant scope ("FAIL-CLOSED").
- ECS runs an `-api` service and a `-worker` service from the same command (`terraform/modules/ecs-fargate/main.tf:238,286`). The brief gives the count as 2 + 1. None of the scheduler start sites is gated by role: `server/index.ts:279` (schedule-of-events sweep), `server/bootstrap/register-project-routes.ts:80-83` (memory consolidation), `server/bootstrap/register-ai-routes.ts:73-76` (citation pruner) and `server/startup/services.ts:523-530` (digest heartbeat, started only when Redis is absent).
- There is no Redis, and I found no transaction-mode pooler (PgBouncer or RDS Proxy) anywhere in `terraform/`. The session-level advisory lock below depends on that. So does the existing `-c app.rls_enforce=on` startup option.

## Defects: what the audit claimed and what I found

| # | Location (pre-fix HEAD) | Audit claim | Verdict |
|---|---|---|---|
| 1a | `server/db/withTenantConnection.ts:79` (`pool.connect()`) runs before `:92` (`runWithTenantScope`) | A caller with no ambient scope fails on every run under RLS | **Confirmed.** Reproduced against the real instrumented pool: `FAIL-CLOSED: pool.connect`. Both calls in the consolidation job (`memory-consolidation-job.ts:101`, `:179`) hit it. |
| 1b | `memory-consolidation-job.ts:445` (cron on every process), `:347` (unguarded INSERT) | 02:00 on three processes writes each summary three times | **Confirmed as latent.** Before the fix the job writes nothing, because 1a fails first. With 1a fixed, the only duplicate guard is the NOT EXISTS in the SELECT, which every concurrent cycle passes. The test makes two cycles race through the acceptance gate and write 2 rows when the write guard is removed. |
| 2a | `server/services/digest/digest-heartbeat.ts:131` | Each org's digest runs with no tenant scope, so no digest is ever created | **Confirmed.** Every digest query fails closed (`[digest-heartbeat] digest failed for org 1 … FAIL-CLOSED: pool.query`). |
| 2b | `digest-heartbeat.ts:118-131` (check at `:120`, then insert) | Overlapping ticks can deliver duplicates | **Confirmed.** With org scope fixed and the lease disabled, overlapping ticks delivered `{ org1: 5, org2: 9 }` notifications. |
| 2c | `digest-heartbeat.ts:159-162` | `tick()` reports `ok:true` when orgs failed | **Confirmed.** Before the fix `failures` stays 0 while every org fails. |
| 3a | `server/jobs/scheduleOfEventsSweep.ts:58,137` | Health-review revisions tripled every 6 h | **Confirmed.** Every sweep calls `reviewScheduleHealth(apply:true)`, and each call records a `health_review` revision (`schedule-of-events/service.ts:870-874`). Two sweeps reviewed each schedule twice. |
| 3b | `service.ts:686` (`hasOpenScheduleTask`, check-then-insert), `:804`, `:831` (alerts gated only by `lastNotifiedStatus`, read and then written) | Recovery tasks and slip alerts duplicate when sweeps overlap | **Confirmed, with one qualification.** Only overlapping sweeps duplicate. Sequential sweeps see `lastNotifiedStatus` and open no second task or alert. |
| 4 | `server/services/ana/citation-run-pruner.ts:72` (unscoped `getPool().query`), `:145` (warn only), `:190` (`running: !!timer`) | Never prunes under RLS, while the status reports running | **Confirmed.** Every tick logs `FAIL-CLOSED: pool.query`, `lastTick` stays null, and `running` stays true. |
| — | `server/services/automation/scheduled-jobs.ts:306` | The Bull path already wraps each org in `runWithTenantScope` | **Confirmed.** Now shared; see fix (d). |

### Found while fixing (not in the audit)

- **Consolidation skip-marker collision.** `memory-consolidation-job.ts:132` matched `pme.title LIKE '%cwm_' || id || '%'`. The pattern `%cwm_1%` matches `[cwm_12]`, `[cwm_10]` and `[cwm_100]`, so working-memory row 1 counted as consolidated once row 12 of the same project was, and was never promoted. `_` is also a LIKE wildcard. Now matched exactly on the bracketed marker with `strpos(title, '[cwm_<id>]')`. There is a test for it.
- **withTenantConnection borrowed the ambient scope for its checkout.** For callers already inside a scope, the instrumentation wrapped the client with the *ambient* scope. A `BEGIN` inside `fn` then received the ambient scope's LOCAL tenant variables instead of the requested ones. For a system-scoped job calling `withTenantConnection({tenantId: org})`, that makes every transaction super-admin. No current caller opens a transaction inside `withTenantConnection` (checked: `audit/tenant-chain-verdict.ts`, `routes/c2c/actions.ts:751`, `audit/chain.ts` `verifyAuditChain` issues plain SELECTs). It would have become live as soon as consolidation ran under a system-scoped lease, because its new write guard uses a transaction. Fix (a) closes it.
- **Existing lock helper is not reusable.** `server/services/ai-actions/distributed-lock.ts` uses Redis and falls back to an in-memory Map, which coordinates nothing across processes on a Redis-less deploy. Its TTL is also capped at 120 s. `scripts/db/deploy-migrate.mjs` has an inline advisory lock for migrations only. So `runScheduledOnce` is new rather than a copy of an existing helper.

## Fixes

**(a) `server/db/withTenantConnection.ts`.** The function now enters the requested scope before `pool.connect()`. Connect, session `set_config`, `fn` and cleanup all run inside `runWithTenantScope(scope, …)`. For request-path callers that already hold a scope, three things are unchanged: `fn` still runs in the requested scope, the session `set_config`/clear sequence is byte-identical (a unit test pins it), and the ambient scope is back in force afterwards. The one difference is the one intended: a `BEGIN` inside `fn` now carries the requested scope's LOCAL variables.

**(b) `server/db/scheduledOnce.ts` (new).** `runScheduledOnce(jobName, fn)` runs under `runWithSystemTenantScope`. On one dedicated pooled connection it takes `pg_try_advisory_lock(20260924, hashtext(jobName))` (the two-int4 form, a separate key space from the migration runner and credit-ledger locks). It runs `fn` only if the lock was acquired, then unlocks and releases on both success and throw. It returns `{ran:true,value}` or `{ran:false,reason:'held_elsewhere'}`. If the unlock does not confirm, the connection is destroyed rather than pooled, because advisory locks are re-entrant per session. A crashed holder's session ends and releases the lock.

**Shared per-org scope, `server/db/tenantStore.ts`.** `runWithOrgJobScope(orgId, caller, fn)` sets tenant = org, no role, source `job`. The Bull scheduler (`scheduled-jobs.ts`) and the digest heartbeat both use it, so the scope is defined in one place.

**(c) `server/services/memory-consolidation-job.ts`.**
- The cron now calls the new `runScheduledConsolidation()`, which wraps `runConsolidation` in `runScheduledOnce('memory-consolidation', …)`.
- The write is idempotent without a migration. `insertSummaryOnce` opens a transaction, takes `pg_advisory_xact_lock(hashtext('memory-consolidation'), cwm.id)`, re-checks for an existing summary with the exact marker under the org's scope, and inserts only if none is found. Under READ COMMITTED the second writer sees the first writer's committed row. No unique index was needed.
- The marker match is now exact (see "Found while fixing").

**(d) `server/services/digest/digest-heartbeat.ts`.**
- Each org's digest runs in `runWithOrgJobScope(orgId, 'digest-heartbeat:proactive_digest', …)`.
- Each tick runs under `runScheduledOnce('proactive-digest-heartbeat', …)`.
- `runDigestHeartbeatTick` now also returns `orgsFailed`. The tick records `ok: orgsFailed === 0`, with an error string when any org failed.
- A tick that finds the lease held records `ok:true, processed:0`. That process's heartbeat stays live, and the holder records the real outcome.

**(e) Sweep and pruner.**
- `server/jobs/scheduleOfEventsSweep.ts`: `runScheduleOfEventsSweep()` runs under `runScheduledOnce('schedule-of-events-sweep', …)` (which also supplies the system scope it had before). Before reviewing a schedule, the sweep claims it with the guarded `UPDATE project_schedule_of_events SET last_reviewed_by_ana_at = now() WHERE id=$1 AND (… IS NULL OR … < now() - 0.9×interval) RETURNING id`, which is the `taskDueSweep` claim pattern. The loser does not review. So a health_review revision (and its tasks and alerts) is not produced when the last review is younger than about one sweep interval, whichever process's timer fires.
- `server/services/ana/citation-run-pruner.ts`: the scheduled global prune runs under `runScheduledOnce('citation-run-prune', …)`, which supplies the audited system scope its estate-wide DELETE needs. `getCitationRunPruneStatus()` gains `lastFailure`, so a failing prune is visible there. The org-scoped route path (`routes/ana-features.ts:4264`) is unchanged.

## Proof: fail before, pass after

Environment: the local PostgreSQL 16 already running in the container (`/var/lib/postgresql/c2c-local`, port 5432). I created a disposable database `u12_sched_dbtest`. The dbtests create a scratch schema, mint a NOSUPERUSER NOBYPASSRLS runtime role through the real `scripts/db/provision-app-role.mjs`, put ENABLE + FORCE RLS and the canonical 0021 policy on every tenant table, and import the real `server/db/runtime.ts` pool with `RLS_ENFORCE=on`.

For the "before" runs, the seven modified sources were restored to their HEAD contents and `scheduledOnce.ts` was moved aside. The test files were identical to the "after" runs.

### Real database: `tests/db/scheduler-jobs-under-rls.dbtest.ts`, `tests/db/scheduled-once-lease.dbtest.ts`

Before (original code): **9 failed | 2 passed | 6 skipped (17)**. The lease file fails to import because the module does not exist yet, so its 6 tests are skipped.
```
× memory consolidation > runs with no ambient tenant scope … → the cycle must not fail closed at checkout: expected 1 to be +0
× memory consolidation > two cycles at once … idempotent write → both cycles really raced for the row: expected +0 to be 2
× memory consolidation > row 1 is not mistaken for consolidated because row 12 … → expected +0 to be 1
× memory consolidation > the nightly cron fired on two processes at once runs ONE cycle → expected [] to have a length of 1 but got +0
× digest heartbeat > each org's digest runs in THAT org's tenant scope … → digest ran with no tenant scope: expected false to be true
× digest heartbeat > a tick in which an org failed is reported as a failed run → expected 0 to be greater than 0
✓ schedule-of-events sweep > CONTROL: the plan listing works under the sweep scope
× schedule-of-events sweep > two sweeps at once review each schedule ONCE → expected [ 510, 510, 520, 520 ] to deeply equal [ 510, 520 ]
× schedule-of-events sweep > a later sweep inside the interval records no second review → … to have a length of 2 but got 4
✓ schedule-of-events sweep > a schedule whose last review is older than the interval IS reviewed again
× citation-run pruner > the scheduled prune actually deletes across tenants … → expected [ Array(3) ] to deeply equal [ Array(3) ]
  (log: [citation-run-prune] tick failed … FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on)
Error: Cannot find module '/server/db/scheduledOnce' (scheduled-once-lease.dbtest.ts)
```

After: **17 passed (17)**.
```
✓ memory consolidation ×4 · ✓ digest heartbeat ×2 · ✓ schedule-of-events sweep ×4 · ✓ citation-run pruner ×1
✓ runScheduledOnce > CONTROL: the runtime pool refuses unscoped access
✓ runScheduledOnce > two concurrent calls — separate sessions — run fn exactly once
✓ runScheduledOnce > holds the lock while fn runs and releases it afterwards
✓ runScheduledOnce > releases the lock when fn throws, and rethrows
✓ runScheduledOnce > runs fn under the audited system scope
✓ runScheduledOnce > different job names do not exclude each other
```

### Unit: `server/db/__tests__/withTenantConnection-scope-before-checkout.test.ts` (real `instrumentPool` over a fake driver)

Before: **2 failed | 2 passed (4)**. The control and the request-path regression guard pass.
```
× a caller with NO ambient tenant scope > gets a connection … → [tenant-rls] FAIL-CLOSED: pool.connect requires an active tenant scope while RLS_ENFORCE=on
× the checkout carries the requested scope > … → expected [ '5', '', 'member' ] to deeply equal [ '0', '', 'app_super_admin' ]
```
After: **4 passed (4)**.

### Mutation checks: each mechanism shown load-bearing with the other fixes in place

| Mutation (temporary, reverted) | Tests that then failed |
|---|---|
| Lease always "acquired" (`scheduledOnce.ts`) | lease: two concurrent calls (`expected 2 to be 1`); consolidation cron (`[Array(2)] length 1 but got 2`); digest (`{ '1': 5, '2': 9 }` vs `{ '1': 1, '2': 1 }`) |
| Schedule claim always succeeds | sweep: later sweep inside interval (`length 2 but got 4`) |
| Consolidation write guard disabled | idempotent write (`length 1 but got 2`) |
| Exact marker reverted to `LIKE '%cwm_' \|\| id \|\| '%'` | row 1 vs row 12 (`expected +0 to be 1`) |

Correction made during the work: the first version of the idempotent-write test also passed with the guard removed. Without latency between the acceptance gate and the insert, the second cycle usually saw the first row. The embedding mock now waits 150 ms (the gate-to-insert window a real provider call creates), and the test asserts that both cycles processed the row, so it fails when the guard is removed.

The sweep's "two sweeps at once" test still passes with the lease disabled, because the per-schedule claim also arbitrates concurrent sweeps. The lease is the second guard there, not the only one.

## Tests run

```
# new: real database
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/u12_sched_dbtest \
  npx vitest run --config vitest.db.config.ts \
  tests/db/scheduler-jobs-under-rls.dbtest.ts tests/db/scheduled-once-lease.dbtest.ts     → 17 passed

# new + existing: mocked-pg config
npx vitest run --config vitest.config.ts \
  server/db/__tests__/withTenantConnection.test.ts \
  server/db/__tests__/withTenantConnection-scope-before-checkout.test.ts \
  server/db/__tests__/tenantScope.test.ts server/db/__tests__/governed-pattern-under-scope.test.ts \
  server/db/__tests__/poolInstrumentation.integration.test.ts \
  server/db/__tests__/poolInstrumentation-tenant-scope.test.ts \
  server/services/__tests__/memory-consolidation.pglite.integration.test.ts \
  server/services/digest/__tests__/ \
  server/services/ana-ri/__tests__/project-memory-read.pglite.test.ts \
  tests/build-order-14-governed-export-and-ops.test.ts \
  server/services/ana/__tests__/run-control-tenant-scope.test.ts            → 121 passed, 8 skipped (13 files + 1 skipped)
  (the 8 skipped are poolInstrumentation.integration.test.ts, which needs RUN_INTEGRATION_TESTS and is unrelated)

# existing dbtest that mentions withTenantConnection
tests/db/rls-bypass-does-not-outlive-release.dbtest.ts                      → 4 passed
tests/db/provisioned-tenant-tables-rls.dbtest.ts                            → not runnable here: needs a fully
                                                                              provisioned DB (install-fresh + deploy-migrate)

# gates
npm run ci:tenant-isolation:no-regression   → OK (8 current, 9 baseline)
npm run ci:baseline-justifications          → OK
npm run ci:db-test-isolation                → OK (62 real-database files unmocked)
node scripts/ci/check-unrun-tests.mjs       → OK (every test file reachable)
npm run ci:tenant-entry-points              → FAIL: digest drift on server/jobs/scheduleOfEventsSweep.ts (see follow-ups)
eslint (changed files)                      → 0 errors; 8 warnings, all present before this change
tsc (changed files via a scoped tsconfig)   → no errors in changed code; only missing @types (node-cron,
                                              jsonwebtoken, qrcode) in this container, on pre-existing imports
```

## Follow-ups: not done, and why

1. **`ci:tenant-entry-points` baseline refresh (blocking CI).** `scheduleOfEventsSweep.ts` changed, so its digest in `docs/reports/tenant-entry-points-baseline.json` no longer matches. That file is outside this task's allowed file set. The recorded justification still holds against the new code: zero `organization_id` references in the file, and it runs under a system scope, now via `runScheduledOnce`. The lead should run `npm run ci:tenant-entry-points:write-baseline` after re-reading it.
2. **Per-task and per-alert claims inside `reviewScheduleHealth`.** Task and alert creation lives in `server/services/projects/schedule-of-events/service.ts:686-850` (`hasOpenScheduleTask` check-then-insert, and `lastNotifiedStatus` read then write). That file was outside the allowed set. The sweep is now protected at the schedule level by the lease and the claim. A *user-triggered* `reviewScheduleHealth(apply:true)` that runs at the same moment as the sweep on the same schedule can still double-open a task or alert. Fixing it needs a guarded claim on the `project_workflow_stages` metadata row, in the `taskDueSweep` style, inside service.ts.
3. **Other schedulers still run on every process.** Examples from `server/index.ts`: regulatory horizon, external intelligence, sentinel, task-due sweep (already claim-guarded). I did not audit them. `runScheduledOnce` is available for them.
4. **No unique index needed for consolidation.** The transaction-scoped advisory lock plus the re-check makes the write idempotent without a migration. A partial unique index on the marker would only matter if another writer ever inserts `conversation_summary` rows with the same marker. None does today.
