# ANA-SUMMARY DT1 — the run-event mirror, its door and its reads

Slice DT1 of `docs/design/ANA_DETACH_2026-10-08.md` (third draft, §8 DT1). Lane: the founder's P-24
exception (`LAUNCH_DEFINITION_OF_DONE.md`); it moves no D-row. Nothing detaches in this slice: a closed
socket still stops the turn. DT1 records and reads.

As the lead directed, this slice also carries §2.8 from DT3: the verified `thread_id`, and the
per-conversation and per-person caps in `beginRun`.

## What was built

| Part | Where |
|---|---|
| `public.ana_run_events`: table, indexes, guard trigger (UPDATE/TRUNCATE refused; INSERT refused once a record exists; DELETE only as `ana_run_events_purger`), the NOLOGIN/NOINHERIT/NOBYPASSRLS purger role, and three SECURITY DEFINER doors, each verified after install | `migrations/20261008f_ana_run_events.sql` (new) |
| In the set, above the final sweep pair | `scripts/db/migration-set.mjs` |
| Six `ana_runs` columns, in place, with a dated note (`user_message_id` is INTEGER, see "Design corrections") | `db/migrations/20260917_ana_runs.sql` |
| The doors on the reviewed definer allowlist (without this, every deploy revokes them) | `scripts/db/security-definer-allowlist.json` |
| The tenant purge door, before `ana_runs` | `server/services/tenant/tenant-offboarding.ts` (`PURGE_DOORS`, `PURGE_CHILD_TABLES`) |
| The mirror: per-run queue, 250 ms / 20 events, one batch in flight, retries at 250 ms and 1 s, then dropped and logged; owner-only INSERT; an explicit tenant scope per flush; the 1,999 cap and the marker at 2,000; `close()` stamps `timeline_seq`; `release()`; `sealAfterMirror` (flush, then seal, then release) | `server/services/ana/run-events.ts` (new) |
| The third sink | `server/services/ana/turn-timeline-emitter.ts` |
| The marker type, as `MirroredTimelineEvent` (not a `TimelineEvent` member) | `shared/ana/turn-timeline.ts` |
| `planFromTaskChanges`, the inverse of `taskChanges`, for the follower's `plan` | `shared/ana/plan-diff.ts` |
| One process heartbeat (`beatOwnedRuns`, `owner_instance` in SQL, system scope per firing). The checkpoint beat is the same statement for one run. The reaper notifies each reaped run and sweeps the mirror through the release and expiry doors (30 s per process). `beginRun` runs as one locked transaction. `stampRunThread` | `server/services/ana/run-control.ts` |
| The keepalive no longer beats the run. `run_policy` is written at insert. `fileTurnRecord` = `sealAfterMirror`. The `RUN_IN_PROGRESS` / `RUN_LIMIT` frames. The run is stamped with its conversation and question | `server/routes/ana-ri/stream.ts` |
| `GET /runs?thread_id=`, `GET /runs?mine=live`, `GET /runs/:runId/events?after=`; `runReadAccess` (D-1(b)); an allow-listed payload | `server/routes/ana-ri/runs.ts` (new), mounted in `server/routes/ana-ri.ts` |
| `readsEveryRecord` moved to one place | `server/routes/ana-ri/record-access.ts` (new); `turn-records.ts` imports it |
| `controlsOf` exported | `server/services/ana/turn-summary.ts` |

## Tests, red then green

Red is the defect or the absence each test exists to catch. Each is put back by a scripted mutation of
DT1's own code (`red/mutations.py`), run, and restored. The output is in `red/<name>.txt`.

| Design test | Test | Red | Green |
|---|---|---|---|
| 1 mirror = record | `run-events.pglite.test.ts` › 1 | `red/no-table.txt`: no table (`relation "ana_run_events" does not exist`) | `green/unit-pglite.txt` |
| 2 guard and doors | › 2. the guard / 2. the doors | `red/no-guard-trigger.txt`: 3 failed | ✓ |
| 3 flush before seal | › 3, and `stream-run-events.test.ts` › flush, then seal | `red/seal-without-await.txt`; `red/stream-no-seal-order.txt` | ✓ |
| 4 owner only | › 4 | `red/no-owner-predicate.txt`: 2 failed | ✓ |
| 5 cap | › 5 | `red/no-cap.txt` | ✓ |
| 6 gap | `runs-read.pglite.test.ts` › 6 | `red/highwater-rows-only.txt` | ✓ |
| 7 heartbeat without a socket | `run-events.pglite.test.ts` › 7; `stream-run-events.test.ts` › keepalive | `red/no-process-heartbeat.txt`; `red/keepalive-beats.txt` | ✓ |
| 8 scope with RLS on | `run-events-rls.dbtest.ts` › 8a–8c (real PostgreSQL, `app_service`, `RLS_ENFORCE=on`) | `red/flush-unscoped.txt`: zero rows, nothing logged | `green/dbtest-rls-on.txt` |
| 9 access | `runs-read.pglite.test.ts` › 9 | `red/access-no-org-in-sql.txt`: the other organisation's admin got 200, not 404 | ✓ |
| 10 leak | › 10 | `red/payload-select-star.txt` | ✓ |
| §2.8 verified thread, caps | `run-control-begin.pglite.test.ts`; `run-events-rls.dbtest.ts` › racing posts | `red/begin-unverified.txt`: 6 failed | ✓ |
| One producer, third sink; refusals before the question | `stream-run-events.test.ts` | `red/stream-no-mirror-sink.txt`; `red/stream-refusal-as-outage.txt` | ✓ |
| 11 gates | `gates.txt` | `red/gate-migration-set-order.txt` (entry after the sweep); `red/gate-purge-coverage.txt` (table off the purge list) | all exit 0 |

The existing suites that DT1 changed under them are green again: the two run-control PGlite suites (the
adapter now hands `beginRun` its transaction client; `chat_threads` stand-in), the cross-instance dbtest
(each case ends its runs; the poll-fallback case refuses the listener's connection by its system scope), and
`run-control-tenant-scope.test.ts` (each reaper query is estate-wide, now three). Wide run: `server/routes/ana-ri`,
`server/services/ana`, `server/services/tenant` and `shared/ana`. 426 files: the first run had 2
failures, both fixed. The re-run: 425 passed and 1 skipped; 6,069 tests passed and 3 skipped; 0 failed
(`green/wide-server.txt`). Database: `fresh2` built by `deploy-migrate`. The purge, definer and turn-record
dbtests are green (`green/dbtest-rls-on.txt`).

Type check: `tsc --noEmit -p tsconfig.check.json` exit 0 (`tsc-full.txt`). ESLint on every changed file:
the warnings on modified files are unchanged from HEAD; the new files have none.

## Acceptance (API level, not a browser)

A private instance on `fresh2` (`RLS_ENFORCE=on`, dev auth, entitlements off) ran against the S5 stand-in
model (`acceptance/dt1-accept.mjs`). A new conversation was used, and the turn ran as it does today:

- `/runs/:runId/events` returned 8 rows while it ran. They deep-equal the first 8 SSE `timeline` frames.
- The plan came from the task events.
- A colleague got 403 with the sentence. An admin got 200, with `approval: null` and `controlScope: cancel`.
- `?mine=live` listed the run.
- After `post_done` (recorded), the read showed `finished`, 0 rows, `sealed` with the record id, and `releasedAt`.

`acceptance/dt1-accept-sql.txt` shows the following. `run_policy` is `auto`. The new conversation's thread and
`user_message_id` were stamped. `timeline_seq` = 9 = the record's 9 events. No mirror rows were left.

Not shown: a browser capture of "nothing on screen changes". DT1 changes no client file.
