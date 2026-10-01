# U19 — scheduled jobs ran once per process, not once per window

Launch row: **D1** (production as configured: two API tasks and a worker from
one image, every in-process scheduler started on each).
Date: 2026-10-01. Branch: `concept2cure-v2`.

A read-only agent classified all 40 server files that call `cron.schedule` or
`setInterval`. To decide reachability it bundled the server with the
production esbuild options and read the module set from the metafile. It also
checked each job's enable flags against the environment terraform/stack
renders. Most of the 40 are per-process cache sweeps, which are correct as
they are. The ones that write shared state are listed below.

## The defect class

`runScheduledOnce` (U12/U13/U15) is an advisory **lease**. It stops two runs
from overlapping. It does not stop the same window from running again on a
tick that comes later: a cron tick a few milliseconds later on another task,
or a boot-relative `setInterval` minutes later. The helper's own comment said
so. Its two durable users already had their own guards (schedule-of-events
has a per-plan claim, and the digest has a per-day check). The jobs below had
neither.

## The fix

**`runScheduledOncePerWindow(job, windowKey, fn, { organizationId })`**, in
`server/db/scheduledOnce.ts`:

- Under the lease, each process tries to `INSERT … ON CONFLICT DO NOTHING`
  into `scheduled_job_claims`. The process whose insert wins runs the job;
  every later tick in that window skips.
- A run that throws gives its window back.
- `windowKeyOf(intervalMs)` aligns boot-relative timers to epoch windows.

**The table**, `migrations/20261001d_scheduled_job_claims.sql`:

- It is in `public` with `organization_id INTEGER NOT NULL`: 0 for estate-wide
  jobs, the org id for per-org jobs.
- It is IF NOT EXISTS only, with no DROP.
- It is inserted before the final pair, so the tenant sweep gives it its
  policy.
- Claims older than 30 days are pruned.

| Job | What three runs did | Now |
|---|---|---|
| `services/sentinel/scheduler.ts` (hourly, per org, on by default) | Every high or critical finding went to the rules engine, which notifies and escalates. That happened **three times an hour** for every org's users, and again from each task a deploy started | One claim per org per interval window |
| `jobs/retentionCron.ts` (03:30) | Up to three archive snapshots and three **Part 11 `retention_soft_delete` audit rows** per disposed document. The losing runs' UPDATE matched nothing, and that was ignored | One claim per day. `disposeDocument` now also rolls back when the soft delete matches no row (new `alreadyDisposed` count), whoever runs it |
| `jobs/externalIntelligenceSweep.ts` (01:00) | **Three nightly calls to FDA, EMA, MHRA, TGA and NCBI**, and three run-log rows | One claim per day |
| `jobs/auditChainIntegritySweep.ts` (02:00) | Three full scans, and three alerts per break | One claim per day |

## Verified by making it fail

**`tests/db/scheduled-once-window.dbtest.ts`**

- Setup: real Postgres 16, the migration's own DDL and the tenant policy, and
  the non-superuser runtime role under RLS_ENFORCE=on.
- Before the helper existed, every case failed.
- Its CONTROL case shows the defect: two sequential `runScheduledOnce` calls
  both run.
- After the fix, all 8 cases pass. With the lease suite and
  `scheduler-jobs-under-rls`, 25/25 pass.

```
 ✓ … CONTROL: the lease alone runs the same window twice when the ticks do not overlap
 ✓ … a second process ticking later in the same window does not run the job again
 ✓ … the next window runs
 ✓ … claims are per organisation
 ✓ … a run that throws gives the window back, so a later tick retries
 ✓ … concurrent calls run once
 ✓ … records the claim as finished
 ✓ … windowKeyOf aligns boot-relative timers to the same wall-clock window
      Tests  8 passed (8)
```

**`server/services/sentinel/__tests__/scheduler-once-per-window.test.ts`**

Three scheduler instances stand in for three processes, sharing one claim
store. Before the fix:

```
 × … one boot scan per organisation, one set of rule events
   → expected [ 42, 42, 42 ] to deeply equal [ 42 ]
 × … claims per organisation, on the organisation's own interval window
   → expected [] to deeply equal [ Array(2) ]
```

After the fix: one scan and one set of rule events. The sentinel suites pass,
11/11.

**`server/jobs/__tests__/retentionCron.policies.test.ts`, raced disposal**

- Before the fix, it failed.
- After: no second audit row, and the raced transaction rolled back.
  Retention passes 28/28.

**`server/jobs/__tests__/nightly-sweeps-once-per-window.test.ts`**

- Before the fix, the external-intelligence and audit-chain cases failed:
  their ticks claimed nothing.
- After: all of `server/jobs` passes, 64/64.

**`server/__tests__/qa-storm/wave3.test.ts`**

This test pins the in-process overlap guard. Its claim is now a pass-through,
and it passes 3/3.

**Gates**

- Migration gates pass: `migration-set-order`, `drop-safety`, `reachability`,
  `deploy-path` and `prefix-collisions`.
- `tsc` reports 0 errors.
- ESLint reports no new warnings.

## Not fixed here, recorded

- **`services/audit/chainIntegrityMonitor.ts` (every 5 minutes).** Each cycle
  runs three full scans of `audit_events`. The health endpoints read a
  per-process status cache, so putting the monitor on a lease would leave two
  tasks reporting stale status. The fix is to serve that status from the
  database. That is a design change, left with this lane.
- **Dormant jobs behind unset flags:** `driftSentinelSweep`,
  `corpusIngestionSweep` and `regulatoryHorizonScan`. Each must go through
  `runScheduledOncePerWindow` before anyone enables it.
## Follow-up, same day: the retention admin email was never sent

`retentionCron.ts` built its own nodemailer transport from `SMTP_PASSWORD`.
Nothing sets that variable: terraform/stack renders `SMTP_HOST`, `SMTP_USER`
and `SMTP_PASS`, which is what `services/emailService.ts` reads. In
production the summary was therefore never sent, and nothing reported it.

**Fix.** `notifyAdmins` now sends through `sendGenericEmail`, the one mail
path (no second transport). If recipients are configured but the mail is not
delivered, it raises `retention_notify_failed` instead of skipping silently.

**Test (`retentionCron.policies.test.ts`).** It now sets the variables the
stack renders, and sets `SMTP_PASSWORD` to a decoy value.

- Before the fix, 3 failed:
  - every recipient is emailed;
  - unconfigured SMTP raises the alert;
  - a send failure raises the alert.
- After the fix, `server/jobs` passes 65/65.

## Follow-up: a regression this unit introduced, fixed the same day

Background-job heartbeats are kept per process. With the claim in place, the
sentinel on a process that found its window already scanned recorded
nothing. On the two tasks that lose the claim, the heartbeat would therefore
pass its 90-minute threshold, and `/api/health/jobs` would report
**degraded** while the scanner was healthy.

The fix records a skipped tick as a successful tick with nothing processed.
The digest heartbeat already did exactly this.

**Test.** A new case in `scheduler-once-per-window.test.ts` checks that each
of the three processes records a live heartbeat.

- Before the fix, it failed: `expected [ { ok: true } ] to have a length of 3 but got 1`.
- After the fix, the sentinel and qa-storm suites pass 15/15.

## Follow-up: the 5-minute audit-chain monitor runs once per window, and every task reports its result

`services/audit/chainIntegrityMonitor.ts` had two problems on the three
processes:

- **Every process ran the full check.** Each one scanned all of
  `audit_events` every five minutes and wrote its own failure event for each
  break.
- **Its status lived in each process's memory.** That status is the §11.10(e)
  evidence a platform administrator reads at
  `GET /api/audit/chain-monitor/status`. A per-window claim alone would
  therefore have left two tasks serving a stale answer.

**Fix.**

- **Scheduled ticks:** `runScheduledCheck` sends both the boot tick and the
  interval tick through `runScheduledOncePerWindow`, with `storeResult`. The
  process that runs the check records the status it found in the window's
  claim. The others skip and record a live heartbeat.
- **Status read:** `getSharedChainMonitorStatus` serves the latest recorded
  status, or this process's own if that is newer (an on-demand check run
  here). If the shared status cannot be read, it reports `error` ("could not
  read the shared monitor status") rather than its own possibly idle view.
- **The status route** uses it.
- **`stopChainMonitor`** now also clears the boot timer.
- **`scheduled_job_claims.result JSONB`.** It is in the CREATE for a fresh
  database, plus `ADD COLUMN IF NOT EXISTS` for an existing one. It is
  additive only, and the migration has a dated header note.
- **`readLatestWindowResult`** throws when the claims cannot be read.

**Tests.**

- **`chainIntegrityMonitor.once-per-window.test.ts`.** Three module graphs act
  as three processes and share one claim store.
  - Before the fix: 3 failed. The scheduled tick and the shared status did not
    exist; until now each process scanned on its own.
  - After the fix: one scan per window, three live heartbeats, a process that
    did not scan serves the scanning process's `healthy`, and an unreadable
    shared status reads `error`.
- **`scheduled-once-window.dbtest.ts`**, against real Postgres.
  - Before: two new cases failed (store and read the latest result; nothing is
    stored unless asked).
  - After: 10/10.
- **The audit suites and every test that touches the monitor or its routes**
  pass 271/271. The route test's mock gained the shared reader.

**Recorded, not changed:** on a break, the monitor's failure event is still
written into organisation 1's audit trail (`organization_id` 1 is hard-coded).
That event belongs to the platform, not to any tenant. It is now written once
per window instead of three times.

## Follow-up: a broken chain is recorded in the affected organisation's trail

When the monitor found a break, it wrote one `audit.chain_integrity_failure`
event with `organization_id` hard-coded to 1:

- every tenant's break was reported in organisation 1's audit trail;
- that event's metadata included other organisations' link details;
- the organisation whose records were affected never saw it.

It now writes one event per affected organisation, into that organisation's
own chain, naming only its own links (up to 20, plus a total count).

**Test: `chainIntegrityMonitor.failure-event-org.test.ts`.** Organisations 7
and 12 have broken chains; organisation 9's is intact.

- Before the fix, it failed: one event, in organisation 1.
- After the fix, it passes: one event each for 7 and 12, none for 9, and each
  event names only its own organisation's links. The audit and route suites
  pass 232/232.
