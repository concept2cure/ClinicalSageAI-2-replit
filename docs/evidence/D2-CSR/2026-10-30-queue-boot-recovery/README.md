# D2 — CSR: resume the CSR queues after a restart (boot sweep)

Launch row D2 (Authoring / Submission Center), workstream W1. Design: `docs/design/CSR_END_TO_END_2026-10-29.md`
(decision 5: 10,000 pages and 1,000 narratives per build; work that size runs off the request path and must survive
a restart). Board row: "AnA builds a CSR end to end" in `docs/work-orders/README.md`. The narrative queue's evidence
(`../2026-10-30-narrative-queue/README.md`, "Remaining" 1) named this item: "Nothing re-dispatches it on server start,
because the repo has no boot-recovery hook for any CSR queue (the build and the assembly have none either). A boot
sweep over the three queues is the natural next step."

Boundary: the D5 CSR-path lane keeps release, review, approval, signing and transmission,
`shared/authoring/csr-scientific-review.ts`, and the AnA tools `draft_safety_narrative`, `narrate_statistical_result`
and `record_endpoint_result`. None of them was touched. No queue worker was edited.

All data in the tests is **SYNTHETIC** (`server/services/csr/__tests__/support/adam-narrative-synthetic.ts`).

## What already exists

Searches run across `server/`, `shared/` and `scripts/`: `recover`, `resume`, `stalled`, `stall`, `heartbeat`,
`requeue`, `orphan`, `startup`, `onBoot`, `afterMigrat`, `setImmediate`, `runCSRBuildJob`, `runCsrAssembly`,
`runNarrativeRun`, `start*Sweep` / `start*Schedule` in `server/index.ts`, `runWithSystemTenantScope`,
`runWithOrgJobScope`, `filterTenantsForBackgroundWork`, `requireCsrJobAccess`. Deleted history:
`git log --all --diff-filter=D` on `*recover*`, `*boot*sweep*` and `*queue*recovery*` found no CSR recovery.

| Piece (path) | What it does today | What it did not do (before this change) |
|---|---|---|
| Build queue: `server/services/csr/csr-job-runner.ts` `runCSRBuildJob`, started by `server/services/csr-builder.ts` `launchCSRBuildAsync` | Claims `queued`/`failed` by conditional UPDATE, re-checks the requester's project access (`resolveCsrScope`), drafts only sections not yet verified, writes `updated_at` after each section. | No stall rule. A build stopped mid-draft stays `drafting` forever and is not runnable (the runner skips `drafting`). **Reused unchanged.** |
| Assembly queue: `server/services/csr/csr-assembly-run.ts` `runCsrAssembly` | Claims `queued` by conditional UPDATE, assembles as the requester under `withTenantConnection`; `STALL_MINUTES` = 15; a new request records a stalled run `failed` (`CSR_ASSEMBLY_STALLED`). | Nothing re-runs a stalled assembly. **Reused unchanged** (its worker and its stall constant). |
| Narrative queue: `server/services/csr/csr-narrative-run.ts` `runNarrativeRun` | Claims `queued` under a new `attempt`, composes as the requester, per-subject resume; `NARRATIVE_STALL_MINUTES` = 5; the next request takes a stalled run over. | Nothing resumes it until someone asks again; a takeover by request re-binds the run to the new requester. **Reused unchanged.** |
| Access rule: `server/services/csr/project-scope.ts` `requireCsrJobAccess`, `resolveCsrScope` | Current membership and project access of a user, on a raw connection or Drizzle; `forWrite` refuses an archived or deleted project. | **Reused** (raw path). |
| Start-up sweeps: `server/jobs/*Sweep.ts`, started in `server/index.ts` after `httpServer.listen` | Estate-wide discovery under `runWithSystemTenantScope`, per-org work under `runWithOrgJobScope`, tenant lifecycle via `filterTenantsForBackgroundWork`, disabled in tests. | **Pattern followed.** No queue framework exists (`scheduled-jobs.ts` is cron, `action-queue.ts` is AnA actions); none was added. |
| Migrations: `scripts/db/deploy-migrate.mjs` | Runs as its own deploy step before the server process starts. | So a sweep after `listen` runs after migrations. No schema change was needed. |

## What changed

- **`server/services/csr/csr-queue-recovery.ts`** (new, 229 lines): `runCsrQueueRecovery(deps)`.
  - **Discovery** per queue, under the system scope: rows still `queued`/running (`drafting`, `assembling`,
    `running`) whose `updated_at` is older than the queue's own stall time — `NARRATIVE_STALL_MINUTES` (5), the
    assembly's `STALL_MINUTES` (15), and `CSR_BUILD_STALL_MINUTES` (30, new: the build had no stall rule; it lives in
    this module so the runner is not edited). At most 200 per queue. A table that is not provisioned (`42P01`) is
    zero work, logged; any other error is reported.
  - **Tenant lifecycle:** an organization not permitted background work is left as it is.
  - **Requester:** on that organization's tenant connection, the requester's access now — `requireCsrJobAccess`
    (active member, project access) and no new work on an archived or deleted project (the `forWrite` rule of
    `resolveCsrScope`, which the routes apply before queueing). A refusal records the item `failed` with a typed
    code — `CSR_PROJECT_ACCESS_DENIED`, `CSR_PROJECT_ARCHIVED`, `CSR_JOB_NOT_FOUND`, or the queue's own
    requester-missing code (`CSR_NARRATIVE_REQUESTER_MISSING`, `CSR_ASSEMBLY_REQUESTER_MISSING`,
    `CSR_BUILD_REQUESTER_MISSING`) — in the queue's own error shape (a build's carries `reason`, as
    `runCSRBuildJob` writes it). The message says it was not resumed and was not run as anyone else. Nothing is
    dispatched.
  - **Claim:** a conditional UPDATE that matches only a row that is still stalled puts it back to `queued`,
    keeping `requested_by`. Two instances booting together both discover the row; one UPDATE matches, and only that
    one dispatches. The refusal UPDATE is conditional the same way. The worker's own claim follows unchanged.
  - **Dispatch:** each queue's own worker, as the requester the row names, awaited, two at a time.
- **`server/jobs/csrQueueRecovery.ts`** (new, 77 lines): the production wiring and `startCsrQueueRecovery()`, a
  one-shot run 15 s after boot. Discovery through the pool under `runWithSystemTenantScope`; access check and
  claim under `withTenantConnection`; `runCSRBuildJob` under `runWithOrgJobScope` (it uses the shared db, as
  `launchCSRBuildAsync`'s worker does), `runCsrAssembly` and `runNarrativeRun` on their own tenant connections.
  Off in tests and with `CSR_QUEUE_RECOVERY_DISABLED=true`.
- **`server/index.ts`**: one import and one call inside the `listen` callback, after the other start-up sweeps
  (+6 lines).

What a resume means is each queue's own: a build drafts only sections not yet verified; a narrative build composes
only subjects not yet verified (attempt + 1); an assembly, which has no partial state, assembles again.

## Red first

Each check was shown failing on the case it exists to catch, then restored. The files are in this folder.

| Red | What fails | Green |
|---|---|---|
| `red-head-no-recovery.txt`: the test with no recovery module (HEAD has none) | Nothing exists that resumes a stalled item | — |
| `red-claim-not-conditional.txt`: the claim without its still-stalled predicate | Two concurrent sweeps dispatch every item twice (`assembly:1:5`, `build:4:5`, `narrative:1:5` each twice) | Each dispatched once; the other sweep counts it `not_claimed` |
| `red-access-not-rechecked.txt`: the requester check skipped | The narrative run of a requester whose project membership was revoked is dispatched and run as them; a build and an assembly with no requester are dispatched | Nothing dispatched; each recorded `failed` with its typed code |

## Green

`green.txt`: 2 files, 6 tests.

- `server/services/csr/__tests__/csr-queue-recovery.pglite.test.ts` — the real
  `migrations/20260628_csr_job_state.sql` in PGlite (replayed twice), the real access check over the
  project-sharing tables, the real narrative worker:
  - two sweeps run concurrently over a narrative run left `running` (attempt 1, 10 minutes without a heartbeat), a
    build left `drafting` and an assembly left `assembling`: each is dispatched once, as user 5 who asked. The
    narrative run completes as attempt 2, 80 of 80 subjects, still bound to user 5; the source reader was called
    once, as user 5. A run written 1 minute ago is left `running`.
  - a requester whose project membership was revoked: the narrative run, the assembly and the build are each
    `failed` with `CSR_PROJECT_ACCESS_DENIED` (the build with `reason: project_access_refused`), nothing is
    dispatched, the source reader is never called, no narrative is written.
  - a deleted requester (`requested_by` NULL): `CSR_ASSEMBLY_REQUESTER_MISSING`, `CSR_BUILD_REQUESTER_MISSING`;
    an archived project: `CSR_PROJECT_ARCHIVED`.
  - an organization not permitted background work: found, skipped, unchanged.
- `server/jobs/__tests__/csrQueueRecovery.test.ts` — `server/index.ts` starts the sweep inside `listen`; it does
  not run in tests.

`neighbours.txt`: 10 files, 65 tests — `csr-narrative-run`, `csr-assembly-run`, `csr-worker-private-access`,
`csr-narrative-memory`, `csr-project-scope`, the jobs routes (`csr-jobs-narratives`, `csr-jobs-assembly`,
`csr-jobs-build-and-review`), `taskDueSweep`, `nightly-sweeps-once-per-window`.

Gates: ESLint reports nothing on the new files; `server/index.ts` keeps its 4 existing `no-console` warnings (none
new). `npm run ci:sql-interpolation`: OK (every value is a bind parameter). `ci:tenant-isolation:no-regression`:
nothing in these files (every raw query names `organization_id`); the gate reports one finding in
`server/services/qms/training-compliance.ts`, which is not part of this item and was not edited. No client call was
added, so `ci:launch-scope-api` is unaffected; no migration changed. `tsc.txt`:
`NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .` exit 0.

## Open

1. **A superseded but live worker.** The narrative run's writes are attempt-guarded; the build's and the assembly's
   are guarded only by status. A worker on another instance that is still alive but has written nothing for the
   stall time (30 min for a build, 15 for an assembly) could keep writing after the sweep re-queues its item. At
   boot the restarted process holds no worker, so this needs a live worker on a second instance that has stalled
   past its rule. Closing it means an attempt column on `csr_build_jobs` and `csr_assembly_runs` (an in-place
   amendment of `20260628_csr_job_state.sql`, RULE 1).
2. **An assembly assembles again.** It has no partial state, so the leaves the stopped attempt had already retained
   stay in the rendered-leaf store, unplaced. Placement points only at the finishing attempt's leaves.
3. **Build stall reads.** `CSR_BUILD_STALL_MINUTES` is used by the boot sweep only. The board does not yet show a
   build as stalled, and a stalled build is still not runnable by request (`runCSRBuildJob` skips `drafting`); the
   next boot resumes it. The comparison assumes the database session's time zone is UTC (`csr_build_jobs.updated_at`
   is `timestamp` without time zone).
4. **RLS.** The access check runs on a role-null tenant connection, as the narrative and assembly workers do. It is
   proven here on PGlite without RLS policies, not against Postgres with `RLS_ENFORCE=on`.
5. The board row in `docs/work-orders/README.md` is left to the root session, which commits.
