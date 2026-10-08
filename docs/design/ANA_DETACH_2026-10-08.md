# AnA detach: a turn that outlives its page, and any device that can rejoin it

**Date:** 2026-10-08. **Status:** design only. No product code was changed. Checked against `concept2cure-v2` at `24ad99898` (S1–S5 landed: `6df767850`, `546a989e7`, `d6e0be49b`, `1f2557255`, `24ad99898`).
**Asked by:** decision 2 (b) of `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` ("Decisions taken", line 586): *"A turn keeps running when the page closes or the phone locks, inside the API process, with D1 built alongside it. It gets its own design after S4."* Recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md:373` (P-24).
**Revision:** second draft. The first draft was critiqued in a governance/security pass and a product/UX pass; §11 lists every point and how it was handled, and says how those passes were run.

## Summary

Today a dropped socket is a stop. The route's `close` handler marks the run `cancelled` with reason `client_disconnected` and aborts the work (`server/routes/ana-ri/stream.ts:901-929`, `server/services/ana/run-control.ts:638-676`). Detaching means not doing that. The route's handler already continues after its socket is gone, because nothing but the abort signal stops it. Four things make that safe and honest. Each is a defect or gap that exists now:

1. **The run's heartbeat rides the SSE keepalive** (`stream.ts:806-831`), which is cleared when the response closes. Without its own timer, a detached run would be reaped as `orphaned` five minutes later while it was still running (`run-status.ts:316`, `run-control.ts:745-760`).
2. **A reaped or otherwise terminated row does not stop the turn.** Only `cancelled` aborts (`run-control.ts:181-188`), and the default hold reads any other non-paused status as "carry on" (`run-hold.ts:272`). A detached run that loses its row would keep calling models and then seal a record contradicting its row.
3. **Nothing stops two live turns in one conversation** (no guard in `beginRun`, `run-control.ts:228-276`). Detach turns "I closed the tab and asked again" into two concurrent turns writing one thread.
4. **Nobody can see a run that has no socket.** D1's append-only `public.ana_run_events` table is the live copy of the timeline that S4 already emits from one producer (`server/services/ana/turn-timeline-emitter.ts:93-101`). Any device reads it by polling with `after=seq` until the sealed record exists, then hands over to the record's Summary.

The design adds one table, two read routes, a process-wide heartbeat, one rule per thread, and a detached ceiling that reuses an existing number. It adds no worker (P-10), no model call, and no tool. Sub-agents stay unhosted and off in production. Manual holds and approval timeouts behave exactly as they do today. A deploy or crash still ends a detached run, now with an honest closing row and the steps that were saved as they ran. It ships as five slices, DT1–DT5, with the server state change (DT3) landing together with its client.

---

## 0. Where this sits

- **Lane.** `ANA-SUMMARY`, the founder-directed exception to Rule 2 recorded as P-24 (`LAUNCH_DEFINITION_OF_DONE.md:356-373`). It moves no D-row. Evidence goes to `docs/evidence/ANA-SUMMARY/<date>/DT<n>-<name>/`, beside S1–S5 (`docs/evidence/ANA-SUMMARY/2026-10-08/`).
- **Directory set:**
  - `server/services/ana/`
  - `server/routes/ana-ri/`
  - `server/startup/shutdown.ts` (DT4 only)
  - `server/services/tenant/tenant-offboarding.ts` (one list entry)
  - `scripts/db/migration-set.mjs`, `migrations/`, `db/migrations/20260917_ana_runs.sql`
  - `shared/ana/`
  - `client/src/concept2cure/components/ana/`, `client/src/concept2cure/v2/`
- **No new surface.** Rejoin happens inside the conversation and the Summary panel or sheet that S4 built (`client/src/concept2cure/v2/TurnSummary.tsx`, `AnaWorkPanel.tsx`). The one notification (DT5, decision D-5) uses the existing in-app notification table (`server/services/notifications/notification-service.ts:61`), which the AnA dock already reads.
- **Rule 2, the model narrates.** Every line this design adds to the screen comes from a fixed table: the run row's status and reason, the `STOP_LINES` table (`client/src/concept2cure/v2/anaWorkModel.ts:42-55`), and the timeline events the server wrote. No model is asked whether a run is alive, finished or worth notifying about.
- **P-10.** The turn keeps running inside the API request handler that started it. There is no queue, no worker and no hand-off between processes. A run lives and dies with the process that owns it.
- **ADR-0015 §2.** The stream does not host `run_agent` (`server/services/ana/governed-toolset.ts:74, 96`; the stream passes no `hostsSubAgents`), and `subAgentsEnabled()` is off in production (`server/services/ana/sub-agent-limits.ts:26-35`). Detach changes neither. When ADR-0015 S6 hosts agents, a child runs under the parent's `cancelSignal`, so a detached parent's children obey the same stop, ceiling and reaper.

---

## 1. What happens at disconnect today

| # | Step | Where |
|---|---|---|
| 1 | A 15 s interval writes `: heartbeat` to the socket **and** refreshes the run's `heartbeat_at`. The comment explains why the beat rides the keepalive. | `stream.ts:806-825`; the beat itself is `run-control.ts:265-272` |
| 2 | The interval is cleared on `res` `close` and `finish`, and on `req` `close` when aborted. **After a drop, the run's heartbeat stops.** | `stream.ts:826-831` |
| 3 | `disconnectRun` is registered on `res` `close` and on an aborted `req` `close`. It returns early if the run already settled or the response ended normally. | `stream.ts:901-903, 928-929` |
| 4 | Unless a person's Stop already aborted the run, it records the cause on the turn policy (`noteDisconnected`). `turnStoppedReason` later maps the loop's `cancelled` to `client_disconnected`. | `stream.ts:905`; `turn-run-policy.ts:188-190`; `run-status.ts:184-194` |
| 5 | A turn with no run row (no resolvable organisation) aborts its local-only handle and writes a warning into its record. | `stream.ts:906-913`; `run-control.ts:290-299` |
| 6 | A turn with a row calls `stopRunInternally(…, 'client_disconnected')`. That aborts the local controller first, then writes `status='cancelled', stopped_reason='client_disconnected'`, guarded on a live status, in the run's own tenant scope. No control event is written, because nobody decided anything. | `stream.ts:926`; `run-control.ts:638-676` |
| 7 | A socket that closed while `beginRun` was awaiting is settled after the recorder opens. | `stream.ts:950-953` |
| 8 | The abort reaches the gateway call and the tool dispatcher through `runSignal`. The error path persists the streamed text as a stopped answer, ends the timeline as `stopped` with reason `client_disconnected`, and files the turn record as `stopped`. | `stream.ts:2056`, `3497-3527`; `post-processing.ts:312` |
| 9 | The `finally` releases the local run. `endRun` is skipped because the disconnect already settled the row. | `stream.ts:3529-3546` |
| 10 | Three wait loops also test for a gone client, with `res.writableEnded`: the pause hold (`clientGone` → `stopForDisconnect`), the approval wait, and the Live Drive move settle. Node sets `writableEnded` only once `res.end()` has been called, so **none of these three ever sees a dropped socket**. A drop reaches them only through the abort from step 6. | `stream.ts:517-523`; `run-hold.ts:205-207`; `stream.ts:2324-2327`; `stream.ts:3214` |
| 11 | S4's closing row reads "Stopped: this page lost its connection." with Continue. | `anaWorkModel.ts:53-54` |
| 12 | **Client.** Four paths drop the socket, and only Stop sends a cancel first: Stop (awaits `cancel`, then aborts, `useAnaChat.ts:745-773`); unmount, except a turn that is driving (`:778-797`); switching or reloading the conversation (`abandonTurn`, `:806-819`, called by `loadThread`, `:828-830`); the 90 s idle timer (`:122`, `:1056-1063`). Each non-Stop path marks the turn interrupted (`:1903-1975`) and asks for the record by run id twice, at 1.5 s and 4 s (`:179`, `:737-743`; `anaTurnTimeline.ts:81-100`). | as cited |
| 13 | The request's lazy DB client is released on `close` (`establishRequestTenantScope.ts:160-170`). The stream does not use it: it queries through `getPool()` under the tenant scope that `runWithTenantScope(…, next)` set (`establishRequestTenantScope.ts:274-277`), and that scope is AsyncLocalStorage, which outlives the socket. A detached turn keeps its tenant scope. | as cited |
| 14 | A graceful shutdown drains HTTP connections for up to 10 s (`server/startup/shutdown.ts:41-53`), returns the LISTEN client (`:89-96`) and ends the pool. Nothing in it addresses live runs. An attached run is cut when its socket is force-closed, and a run without a socket would not be waited for at all. | as cited |

**What the reaper does.** `reapOrphanedRuns` marks every live row whose `heartbeat_at` is older than `STALE_AFTER_MS` (5 min) as `failed` with reason `orphaned`, estate-wide, under the system scope (`run-control.ts:745-760`). It runs only opportunistically, after a new run opens (`stream.ts:867`). It sends no notification, so the owner, if it is alive, does not learn that it was reaped.

---

## 2. The detached run's lifecycle

### 2.1 Which turns detach

A turn **detaches** on disconnect, and keeps running, when all of these hold:
- it has a run row (`runId` non-empty);
- it has an owner (`isHoldable`, `run-status.ts`; `user_id` non-null), because a run nobody owns can be stopped by nobody (`applyControl`, `run-control.ts:470-472`);
- it is not driving the screen (`driveState.enabled` false, `stream.ts:961-971`). A Live Drive turn's work is moving a screen that is gone. Its moves cannot land, and `settleMoves` would wait out `MOVE_SETTLE_MAX_MS` on every round for nothing.

Every other turn **stops on disconnect exactly as today** (§1, rows 3–9), with "Stopped: this page lost its connection."

One predicate, `detachable({ runId, runUserId, driveEnabled })`, goes in `run-status.ts` beside `isHoldable`. `disconnectRun` branches on it:
- **Detachable.** Record `detachedAt` on the turn policy and write it into the recorder as a warning line ("The page closed at 14:02:11; the turn continued."). Arm the detached ceiling (§2.6). Do not abort.
- **Otherwise.** Today's path.

`detachedAt` goes to the record so an inspector can see the turn ran unwatched. It is **not** a human control and is never written to `control_events`, for the reason `stopRunInternally` gives (`run-control.ts:631-637`): a page closing is not a decision (§11, G-3).

### 2.2 Ownership

`ana_runs.owner_instance` is the process that holds the run's `AbortController` (`run-control.ts:170, 231-241`). It does not change for the life of the run, and nothing migrates a run. Detach changes only one thing: the owner's request handler keeps executing after its socket is gone.

### 2.3 Heartbeat: one per process, independent of any socket

- **What moves.** The beat moves out of the keepalive (`stream.ts:816-824`) into `run-control.ts`. One process-wide interval, armed by the first `beginRun` and idle while `localRuns` is empty, beats every run this process owns:

  ```sql
  UPDATE ana_runs AS r
     SET heartbeat_at = now(), timeline_seq = v.seq
    FROM unnest($1::text[], $2::int[]) AS v(id, seq)
   WHERE r.id = v.id AND r.status IN ('running','paused','awaiting_approval')
  ```

- **Interval.** `RUN_HEARTBEAT_MS = 15_000`, equal to today's keepalive. The SSE comment ping stays on the response for proxies; it no longer touches the database.
- **Scope.** The interval runs under `runWithSystemTenantScope('ana-run-control:heartbeat', …)` per firing, for the reason the poll fallback gives (`run-control.ts:837-850`).
- **Round number.** The per-round `heartbeat(round)` at checkpoints (`stream.ts:3245-3248`) stays, because it stamps `current_round`. It is the same `UPDATE` scoped to one id, so there is still one heartbeat writer.
- **`timeline_seq`** is the emitter's latest `seq` (§3.6). It lets a reader know how many events exist even when some failed to be written.
- **Lifetime.** A run leaves the beat set in `releaseLocalRun` (`run-control.ts:336-338`), which every exit path already reaches (`stream.ts:3537`). A process that dies stops beating, and the reaper takes the row 5 minutes later.

### 2.4 Reaper, and an owner that learns its row ended

- **Reaper, unchanged.** Same predicate and status (`failed`/`orphaned`). Two additions:
  - it `RETURNING id`s and sends `pg_notify(RUN_CONTROL_CHANNEL, id)` for each, so a live owner that was wrongly reaped (a partition, §7) is told;
  - it also runs, rate-limited to once per 30 s per process, from the new run read routes (§3.7). A viewer of a dead run does not have to wait for someone else to start a turn.
- **Any terminal row stops the owner.** `driveLocalRun` (`run-control.ts:181-188`) aborts on **every** terminal status that this process did not write itself, not only `cancelled`. It aborts with `controller.abort(reason)`, where `reason` is the row's `stopped_reason`. The default hold's `leave` (`run-hold.ts:272`) returns `'cancelled'` for any terminal status, not only `cancelled`. Manual's `settleHold` already fails closed on a non-live row (`turn-run-policy.ts:301-303`).
- **The row's reason wins.** The error path (`stream.ts:3497-3527`) reads `runSignal.reason`, when it is a `RunStoppedReason`, in place of `turnPolicyOf.stoppedReason('cancelled')`. The stopped answer, the `end` event and the record then all say `orphaned` when the row says `orphaned`. A record never says "answered" for a run whose row says it failed.

### 2.5 Control from another device

There is nothing new here. Control is a row write accepted on any instance, delivered to the owner by NOTIFY, with a 2 s poll as the declared fallback (`run-control.ts:30-46, 783-862`).
- **Who.** Cancel, pause, resume and steer stay owner-only: another organisation gets 404 and a colleague 403 (`run-control.ts:451-475`; `stream.ts:3640-3653`). Another device of the same person is the same user, so it may control the run.
- **Effect.** A cancel aborts in-flight model and tool work on the owner (`run-control.ts:609-627`, `181-188`).
- **Two devices.** A second Stop on a run that already stopped gets 409 `Run already cancelled` (`stream.ts:3560-3577`). The client reads that as done, not as an error (DT2).

### 2.6 The round budget, and a ceiling for a run nobody watches

- **Round budgets are unchanged** (P-24 line 372): Fast 4; Balanced 6 + 2; Thorough 10 + 4; Auto 20 absolute (`agentic-loop.ts:294-372`; `shared/ana/run-control-limits.ts:49`). A detached turn earns no extra rounds.
- **The gap.** A turn with no run policy has a round ceiling and no clock. A hung tool or a stalled provider can hold a round open indefinitely, and nobody is watching to press Stop.
- **The ceiling.** A detached run is bounded by the existing Auto wall clock, `AUTO_WALL_MS` (40 min, `run-control-limits.ts:64`), measured from the turn's start. No new number is added.
  - The check is a timer armed at detach, not a round-boundary check, so it fires inside a hung round.
  - At the ceiling the owner aborts with reason `budget_exhausted`, and the closing row reads "Stopped at the time limit." (`anaWorkModel.ts:49`).
  - Auto's own 15-minute active-work budget still applies at round boundaries (`run-status.ts:208-221`).
  - The founder may choose a different bound (decision D-2).
- **Cost bound.** A detached turn makes at most:
  - one model call per round up to the round ceiling (14 for Thorough, 20 for Auto);
  - one closing call;
  - the post-turn answer check (`post-processing.ts`);
  - model calls inside tools (`usedModel`), which already count against nothing today and are unchanged.

  This is the same envelope as an attached turn whose person walked away from the screen. Detach adds the one-live-run rule (§2.8) and the ceiling above. A per-person limit on live runs is decision D-3.

### 2.7 Holds and approvals while nobody is watching

All unchanged. The table shows what each case does with no socket. The timeouts are `MAX_PAUSE_MS` (10 min, `run-control-limits.ts:26`).

| Case | Today, attached | Detached |
|---|---|---|
| Person's pause, no policy | Resumed as abandoned at 10 min, with no control event (`run-control.ts:911-918`; `stream.ts:517-525`) | Same. The run continues. |
| Manual hold, or a pause in a Manual turn | Ended at 10 min: `paused → finished`, `hold_expired` (`run-control.ts:954-964`) | Same: "Stopped waiting for you." |
| Approval, no policy | Denied at 10 min, recorded with `byUserId: null`; the step reads "Nobody authorised this within the time allowed, so it did not run. Nothing was changed." The turn continues without it (`stream.ts:2344-2358`) | Same. |
| Approval, Manual or Auto | Same denial, then the turn ends with `approval_timeout` (`run-status.ts:208-216`) | Same: "Stopped: an approval was not answered." |
| Approval decided on another device | Woken by NOTIFY (`run-control.ts:1095-1116`) | Same. The asker's other device gets the sign-off from the run read (§3.7). |

The approval wait's `res.writableEnded` test (`stream.ts:2324-2327`) and the hold's `clientGone` (`run-hold.ts:205-207`, `stream.ts:521-523`) are deleted in DT3. They never detected a drop (§1, row 10). A drop is acted on in one place, `disconnectRun`, which either detaches or stops.

### 2.8 One live run per conversation

`beginRun` takes `pg_advisory_xact_lock(hashtext('ana_runs:' || org || ':' || thread_id))` in a transaction, reaps stale rows for that thread, and refuses when a live row exists for the same `(organization_id, thread_id)`. The index already exists: `idx_ana_runs_org_thread`, `db/migrations/20260917_ana_runs.sql:131-132`.

- **Why not a unique index.** A partial unique index would fail to build on any database that holds two live rows for one thread. Two open tabs make that possible today, and Rule 1 replays the file on every deploy. The lock needs no schema.
- **The refusal.** It comes before the question is saved (`beginRun` at `stream.ts:852`, `saveMessage` at `:1131`). It is a frame, `{type:'error', code:'RUN_IN_PROGRESS', runId}`, followed by `end`, because the SSE head is already written (`stream.ts:799-804`).
  - The asker's client rejoins that run.
  - The copy is "AnA is still working on the last message in this conversation."
- **Escape hatch.** A stale row from a dead process blocks the thread until the reaper's 5 minutes pass, or until the asker presses Stop. A cancel makes the row terminal even with no owner alive (`run-control.ts:606-628`).
- **Threadless turns** (`thread_id` null) are not limited by this rule.

### 2.9 What still ends a detached run

| Cause | How it ends |
|---|---|
| The answer | As today. |
| The person's Stop | From any device. |
| A round ceiling | As today. |
| The detached ceiling | §2.6. |
| A hold or approval timeout | §2.7. |
| An error | As today. |
| A graceful shutdown | DT4: `orphaned`, with a stopped answer and record when they can be written in the drain window. |
| A crash | The reaper, `orphaned`, after 5 min. The events saved so far remain. |

---

## 3. D1: `public.ana_run_events`

### 3.1 Schema

New file `migrations/<DT1 date>_ana_run_events.sql`. It is listed in `C2C_MIGRATION_FILES` directly above `UUID_TENANT_ISOLATION_NONPUBLIC` (`scripts/db/migration-set.mjs:3098`), so it is above the final pair `CHILD_TABLE_PARENT_SCOPE`, `TENANT_ISOLATION_SWEEP` (`:3114, 3128`) that `ci:migration-set-order` pins.

```sql
CREATE TABLE IF NOT EXISTS public.ana_run_events (
  organization_id integer     NOT NULL REFERENCES organizations(id),
  run_id          text        NOT NULL REFERENCES ana_runs(id),
  seq             integer     NOT NULL CHECK (seq BETWEEN 1 AND 2000),
  at              timestamptz NOT NULL,
  event           jsonb       NOT NULL,
  written_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_ana_run_events_org_run ON public.ana_run_events (organization_id, run_id, seq);
```

- **Tenancy (Rule 1, corollary 3).** `public` with `organization_id integer NOT NULL`, so the integer sweep `20260801_tenant_isolation_sweep.sql` gives it a policy. The `organization_id` is the run's, never the caller's: the insert takes it from the run row (§3.4).
- **Its own key.** The FK to `ana_runs(id)` has no cascade, because `ana_runs` has no cascade target to inherit and the purge lists both tables explicitly (§3.3). The table does not inherit `ana_runs`'s RLS; it has its own `organization_id`.
- **`event`** is exactly the `TimelineEvent` as `emitTimeline` serialised it (`turn-timeline-emitter.ts:93-101`), or the truncation marker (§3.5). A note's text is inline here. The sealed record keeps it as a `TextRef`.
- **Replay.** Additive and `IF NOT EXISTS` throughout. No DROP. `ci:migration-drop-safety` has nothing to check, and the file says so in its header.

**`ana_runs` amendments**, in place in `db/migrations/20260917_ana_runs.sql`, as `ADD COLUMN IF NOT EXISTS` below the `CREATE TABLE`, with a dated note. The file's own header says this is how a column is added (`:33-39`).
- `timeline_seq integer NOT NULL DEFAULT 0`, the high-water mark (§2.3, §3.6).
- `user_message_id text`. The question this run answers, written when the question is saved (`stream.ts:1131`). It places a live or unsealed run in the transcript after reload. This is the same join-by-id rule S4 uses for records (design §3.5).

### 3.2 Append-only trigger

`public.ana_run_events_guard()`, `BEFORE UPDATE OR DELETE` per row and `BEFORE TRUNCATE` per statement. It follows the shape of `20260926_ana_turn_records.sql:161-207`:

- **UPDATE:** always refused, with `IMMUTABILITY_VIOLATION`.
- **TRUNCATE:** always refused.
- **DELETE:** allowed only when
  - (a) a turn record exists for `(OLD.organization_id, OLD.run_id)`. This is the post-seal cleanup: the record holds the same events. Or
  - (b) `organizations.status = 'pending_deletion'` for `OLD.organization_id`. This is the tenant purge, the same precondition the turn-record door checks (`20260926_ana_turn_records.sql:308-312`).

  Anything else is refused. In particular, the events of a run that crashed with no record cannot be deleted. They are its only trace.
- **INSERT:** refused when a turn record already exists for `(NEW.organization_id, NEW.run_id)`. This puts "no writes once sealed" in the database, not only in the writer.

The table is **working data, not the retained record.** The sealed `ana_turn_records` row stays the Part 11 record. That is why DELETE has a door here and not a dedicated purger role: a role would claim a retention status the table does not have.

### 3.3 Purge, export, sweep

- `PURGE_CHILD_TABLES` (`server/services/tenant/tenant-offboarding.ts:886-892`) gains `'ana_run_events'`, **before** `'ana_runs'`, because of the FK. The trigger admits the DELETE because the purge runs only on a `pending_deletion` organisation. `ci:purge-coverage` and its selftest cover the entry.
- The full tenant export discovers tenant-keyed tables from the catalog (`server/services/tenant-export/tenant-full-export.service.ts:24-28`), so the table is exported with no list change.
- The integer sweep policies it. The tenant-isolation contract tests and `ci:tenant-isolation` run unchanged and must stay green.

### 3.4 Write rules

**One writer.** `TurnTimeline` gets a third sink beside the recorder and the socket: `mirror`, a per-run ordered queue in `server/services/ana/run-events.ts`. `emitTimeline` stays the one producer (`turn-timeline-emitter.ts:93-101`). It now appends to the recorder, enqueues to the mirror, and writes the frame.

**The statement.** A batched multi-row insert, at most one in flight per run, flushed every 250 ms or every 20 events:

```sql
INSERT INTO ana_run_events (organization_id, run_id, seq, at, event)
SELECT r.organization_id, r.id, v.seq, v.at, v.event
  FROM ana_runs r, unnest($2::int[], $3::timestamptz[], $4::jsonb[]) AS v(seq, at, event)
 WHERE r.id = $1 AND r.organization_id = $5 AND r.owner_instance = $6
ON CONFLICT (run_id, seq) DO NOTHING
```

- **Owner instance only.** The predicate on `owner_instance` is in SQL. A process that is not the owner writes zero rows.
- **While no record exists.** The insert trigger enforces this (§3.2).
- **Not guarded on a live status.** Rows written after a cancel are kept, as the first design required (`ANA_AGENT_WORK_VIEW_2026-10-08.md:539`; its §2.2 "cancel case").
- **Idempotent.** A retried batch writes nothing twice.
- **Failures.** A failed batch is retried twice, with 250 ms and 1 s waits. If it still fails, those events are dropped from the mirror and logged at error level. The next batch carries on, so the gap is visible by `seq` (§3.6).
  - The run is **not** failed for a mirror failure. The recorder still holds every event, and the record will carry them.
  - Failing a regulatory turn because a progress mirror could not be written would trade a visible gap for a lost answer.
- **Cleanup.** After `fileTurnRecord` reports the record written (`post-processing.ts:595-606`, `stream.ts:617-622`), the owner deletes the run's rows. A delete that fails, or a process that dies first, leaves rows that the reaper's pass removes, bounded:

  ```sql
  DELETE FROM ana_run_events e USING ana_turn_records t
   WHERE t.organization_id = e.organization_id AND t.run_id = e.run_id
  ```

  (`LIMIT` via a `ctid` subselect.)

### 3.5 The cap and its marker

- **Limits.** Seq 1–1,999 are events. Seq 2,000 is the marker `{ kind: 'truncated', seq: 2000, at, round }`. Nothing is written after it. The `CHECK (seq BETWEEN 1 AND 2000)` makes the cap a database fact.
- **The type.** The marker is a new member of `TimelineEvent` in `shared/ana/turn-timeline.ts`. It is server-written, never counted, never sealed, and never part of the record: the recorder holds every event, uncapped, as today.
- **On screen.** "Only the first 1,999 steps are shown while AnA works. The full list appears when the turn is recorded."
- **The `end` event** is the one event that matters most to a reader, and past the cap it is not mirrored. The reader does not need it: a terminal `ana_runs.status` and `stopped_reason` give the closing row (§4.3).

### 3.6 Gaps

A reader holds `events` (sorted by `seq`) and the run row's `timeline_seq`.
- A missing `seq` below the cap is a dropped write.
- `timeline_seq` greater than the last `seq` read, on a terminal run with no record, is a set of trailing writes that were lost.

Either shows one line, never an empty list: "Some steps could not be shown live. The full list appears when the turn is recorded." If no record follows, the turn's footer reads "Not recorded" (S4, design §2.7).

### 3.7 The read routes

New `server/routes/ana-ri/runs.ts`, mounted beside the stream routes. Two routes:

```
GET /api/ana-ri/runs?thread_id=<id>
  → { runs: [{ runId, userMessageId, status, startedAt }] }
    The thread's runs that are live, or ended without a sealed record; newest first; at most 5.

GET /api/ana-ri/runs/:runId/events?after=<seq>
  → { runId, threadId, userMessageId, status, stoppedReason, round, startedAt,
      lastBeatAt, highWater, events: TimelineEvent[] (seq > after, ≤ 200),
      controls: TimelineControl[] | null,
      sealed: { recordId, assistantMessageId } | null,
      approval: <the sign-off envelope> | { waiting: true } | null,
      canControl: boolean }
```

**Access**, one function, `runReadAccess(req, runId)`, used by both routes:
1. The organisation comes from `resolveOrgId(req)`, the resolver `beginRun` stamped the row with and the one the control route uses (`stream.ts:3632-3637`). With none, the answer is 404.
2. `SELECT … FROM ana_runs WHERE id = $1 AND organization_id = $2`, with the organisation **in the SQL**, as `applyControl` does (`run-control.ts:454-460`). No row means 404, so another organisation's run cannot be confirmed to exist. The events query repeats `organization_id = $2`.
3. A row with `user_id IS NULL` is refused to anyone but an admin or owner, with 403. This mirrors `applyControl`'s rule that an unattributed run belongs to nobody (`run-control.ts:464-472`).
4. **Allowed:** the asker (`user_id` = caller); an admin or owner (`readsEveryRecord`, `turn-records.ts:65-69`); or anyone who may read the thread's transcript (`transcriptReadable`, `turn-records.ts:97-100`). The last is decision 6 of the first design, as applied to the Summary (`turn-records.ts:120-121`): the live events are the same redacted rows the Summary shows. Anyone else gets 403 with "This turn's progress is visible to the person who asked and to administrators."
5. `readsEveryRecord` and `transcriptReadable` move out of `turn-records.ts` into `server/routes/ana-ri/record-access.ts`, and both route files import them. That keeps one rule.

**What the payload carries, by allow-list, never by spreading the row:**
- `events`: the mirror rows.
- `controls`: from `control_events` through `controlsOf`, exported from `server/services/ana/turn-summary.ts:57-71`. It carries the person's pause, steer and stop without who took them, exactly as the sealed Summary does.
- `approval`:
  - For **the asker only**: the envelope rebuilt by `buildHumanConfirmationRequiredResult(pending.command, pending.params, pending.tier)` from the row's `pending_approval`, which is what the live `approval_required` frame carries (`stream.ts:2300-2312`), plus `runId` and `toolUseId` so the existing sign-off can post its decision.
  - For **anyone else**: `{ waiting: true }`. The sign-off parameters are the asker's governed action, and `toolUseId` is the key that binds a decision to a proposal (`run-control.ts:1077-1094`).
- `canControl`: true only for the asker. The control route still decides.
- **Never in the payload:** `owner_instance`, `pending_interjections`, `approval_decision`, `byUserId`, `organization_id`, `user_id`, `surface`, tool names, tool-use ids other than the asker's pending approval.

**A leak test** proves this, shaped like S4 test 3: sentinels in every excluded column. It is shown failing first against a handler that returns `SELECT *`.

**Reaper.** Each read route runs `reapOrphanedRuns`, rate-limited per process (§2.4), before reading. A crashed run therefore reads `failed`/`orphaned`, not a `running` that will never move.

---

## 4. Rejoin

### 4.1 Poll, not SSE resume

**Chosen: poll with `after=seq`.** Every 2 s while the page is visible. Paused while hidden. One immediate poll on `visibilitychange → visible`.

**Rejected: SSE resume** (`Last-Event-ID` on a new stream). A resumed stream lands on any instance, and only the owner produces events. A non-owner would have to tail the table (a poll in disguise) or subscribe to a per-run NOTIFY fan-out. That second path would need its own payload limits (NOTIFY caps a payload at 8,000 bytes), its own failure handling, and its own tests, and it would deliver the same rows. Two delivery paths for one stream break zero duplication.

**The cost of polling** is one primary-key range read and one run-row read per watcher every 2 s. A watcher that is not looking costs nothing. A long-poll that waits on the existing NOTIFY wake is a later optimisation behind the same route, and is not part of this design.

### 4.2 How a device attaches

| Situation | What happens |
|---|---|
| **The originating page, still connected** | Keeps its SSE stream as today. Its events have `seq`, and it does not poll. |
| **The originating page, socket dropped** | The fetch errors, the idle timer fires, or the page is restored after a lock. The client stops marking the turn interrupted when it holds a `runId` for a detachable turn. It switches to polling from its last `seq`. |
| **A reload, or another device opening the thread** | `loadThread` (`useAnaChat.ts:828`) also calls `GET /runs?thread_id=`. Each returned run is attached after its `userMessageId`'s message as a live turn bound to that `runId`, and polled from `after=0`. |
| **Two sources at once** (the SSE stream and a catch-up poll, or two tabs) | Events merge by `seq`, and a duplicate is dropped. That makes a duplicate rejoin harmless by construction. |
| **The composer** | Disabled for a thread with a live run, with "AnA is still working on the last message in this conversation." A send that races it gets `RUN_IN_PROGRESS` (§2.8) and rejoins. |

### 4.3 Hand-over to the sealed record

The poll reads the events first, then whether a record exists. The writer commits the record before it deletes the rows (§3.4). So a reader never sees both "no rows" and "no record" for a run that sealed.
- **`status` terminal and `sealed` present.** The client stops polling and refetches the thread messages. The assistant message now exists, written by post-processing before the record (`post-processing.ts:578-606`). The client then opens `GET /turn-records/:recordId/summary` as S4 does (`turn-records.ts:216-227`). The Summary's rows replace the live rows. They are the same events, so nothing visibly moves.
- **`status` terminal and no `sealed` yet.** The client keeps polling for up to the existing confirm windows (1.5 s, then 4 s; `useAnaChat.ts:179`). The footer reads "Recording…" in that time, as S4 already does.
- **Still no record after that.** The closing row comes from the run row:
  - `stopLineText(stoppedReason)`, with the table extended for the run-row reasons in §5.2;
  - the mirrored rows, kept;
  - the footer "Not recorded".
- **`confirmRecordByRun`** (`anaTurnTimeline.ts:81-100`) is folded into this poll and deleted. "What became of run X" gets one path.

---

## 5. The client

### 5.1 States and copy

Every line comes from a table in `anaWorkModel.ts` or `turnSummaryRows.ts`, never from the model.

| State | Asker | Colleague who can read the thread |
|---|---|---|
| Live, followed by polling | The live turn as it looks today (phase line, rows, Summary button), plus "Started 4 min ago". Pause, Stop and Steer work. | The same rows and Summary, with no controls, and "Only the person who asked can pause or stop this." |
| Waiting on an approval | The existing sign-off opens from `approval` (`GovernedActionSignoff`, as the `approval_required` frame opens it today). The state line is the existing "waiting for you" (`anaWorkModel.ts:76-84`). | "Waiting for the person who asked to approve a step." |
| Paused, Manual | The existing Manual hold with "Run this step" and "Do this instead". | "Waiting for the person who asked." |
| No heartbeat for four beats (60 s) | "Last heard from AnA 2 min ago." It is computed from `lastBeatAt`; it is not a guess about why. | Same |
| Ended, recorded | Hand-over to the Summary (§4.3). | Same |
| Ended with no record | The closing row from the run's reason, the saved rows, and "Not recorded". | Same, without Continue |
| A gap or the cap | §3.5 and §3.6 lines. | Same |

**Copy rules:** no exclamations, no reassurance, and no duration promises.

### 5.2 Stop lines added

`STOP_LINES` is the one table (`anaWorkModel.ts:42-55`). It gains two entries, because a run without a record is described by its row's reason, which is a `RunStoppedReason`:

| Reason | Line |
|---|---|
| `orphaned` | "Stopped: the server restarted." Followed by the first design's crash line (`ANA_AGENT_WORK_VIEW_2026-10-08.md:542`): "The steps up to here were saved as they ran; this turn has no sealed record." when there is no record. |
| `error` | "Stopped: the turn ended with an error." |

`orphaned` also joins `TurnStoppedReason` (`run-status.ts:89`), because DT4 can now write it onto an answer.

`client_disconnected` stays, for turns that cannot detach (§2.1).

### 5.3 The phone-lock case

1. The phone locks mid-turn. Within seconds to minutes the OS drops the socket. The server detaches; nothing stops.
2. On unlock, `visibilitychange → visible` triggers one poll from the last `seq`.
   - If the SSE reader is still alive, its frames and the poll's rows merge by `seq`.
   - If it errored, polling continues alone.
3. The turn shows what happened while the phone was locked, and continues live. There is no "lost connection" row.
4. If the turn finished while the phone was locked, the hand-over in §4.3 shows the answer and the Summary.

### 5.4 Notifications (DT5, decision D-5)

**Minimal.** One in-app notification to the asker through `createNotification`. No email and no push.
- **When:**
  - a detached run starts waiting on an approval: "AnA is waiting for your approval";
  - a detached run ends: "AnA finished your request", or "AnA stopped: {stop line}".
- **Fields:** category `ana_turn`, severity `info` (`warning` for an approval), and `actionUrl` = the conversation.
- **Only when the run is detached at that moment.** A connected page already shows it.
- **Deterministic.** The title is from the table above. The body is empty.
- **What it is not.** The in-app inbox is not a push to a locked phone. A person who closed the app sees it next time they open the product. Push is a later decision.

---

## 6. Multi-instance deployment

The API runs as several tasks behind a load balancer, with no sticky routing (`LAUNCH_DEFINITION_OF_DONE.md:187-192`; `run-control.ts:5-10`).

| Request | Instance | What it needs |
|---|---|---|
| `POST /stream` | Any; it becomes the **owner**, `owner_instance` | Nothing new |
| Control (pause, steer, stop) | Any | A row write plus NOTIFY. Unchanged. |
| Approval decision | Any | Unchanged (`utility.ts:74-176`; `run-control.ts:1095-1116`) |
| `GET /runs…` | Any | DB reads only |
| Event writes | **Owner only** | Enforced in SQL (§3.4) |
| Heartbeat | Owner only, for its own `localRuns` | §2.3 |
| Reaper | Any; estate-wide | Unchanged, plus a notify |

A request that lands on a non-owner never needs the owner. Everything it reads is in the database, and everything it writes reaches the owner through the existing NOTIFY/poll path. The cross-instance test (`server/services/ana/__tests__/run-control-cross-instance.dbtest.ts`) gains the cases in DT1 and DT3.

---

## 7. Failure modes

| Failure | What happens | What the person sees |
|---|---|---|
| **Owner crash** (OOM, SIGKILL) | Heartbeats stop. The next run open or run read reaps the row after 5 min as `failed`/`orphaned`. The mirrored events remain; the trigger refuses their deletion with no record. No assistant message, no record. | Up to 5 min of "Last heard from AnA n min ago", then "Stopped: the server restarted. The steps up to here were saved as they ran; this turn has no sealed record." with Continue. |
| **Deploy** (SIGTERM) | DT4: before the HTTP drain, shutdown writes `failed`/`orphaned` for every owned live run and aborts each with that reason. Turns unwind through the error path within the existing 10 s drain (`shutdown.ts:41-53`): the stopped answer, the `end` event and the record all say `orphaned`. A turn that does not finish in the window leaves its row already terminal and its events saved. | "Stopped: the server restarted.", recorded when the window allowed, with Continue. |
| **Partition: the owner loses the DB** | Heartbeats fail and are logged. Another instance reaps after 5 min. The owner's model calls may continue. When the DB returns, the owner reads the terminal row: through NOTIFY from the reaper (§2.4), the 2 s poll fallback, or its next checkpoint status read. It then aborts with `orphaned`. Its `endRun` is a no-op (`run-control.ts:309-327`). Its record says `stopped`/`orphaned`, never `answered`. | As for a crash. If the DB returns in time, the record says the run was stopped because it was lost. |
| **Partition: a reader loses the server** | Polls fail. The client shows "Last heard from AnA n min ago" from the last good `lastBeatAt`, and retries with backoff (2, 4, 8 … 30 s). | No false "stopped". |
| **Duplicate rejoin** | Reads only. Merged by `seq`. Two Stops: the second gets 409 and is read as done. Two approvals: the second gets 409 `STALE_APPROVAL` or 404 (`utility.ts:100-121`). | Nothing extra |
| **Two sends in one thread** | §2.8: refused with `RUN_IN_PROGRESS` before the question is saved. | "AnA is still working on the last message in this conversation." |
| **Mirror write failure** | §3.4, §3.6. The run continues; the gap is shown. | The gap line |
| **Record write failure** | Rows stay, and the trigger refuses their deletion. | "Not recorded" with the saved rows |
| **Hung tool or provider, nobody watching** | The detached ceiling (§2.6) aborts at `AUTO_WALL_MS`. | "Stopped at the time limit." |
| **Unwatched cost** | Bounded by §2.6 and §2.8, and by decision D-3. Every model call is already in the gateway audit (`server/services/ai-gateway/audit.ts`). | — |
| **Writes to a dead socket** | Frames written after the drop are discarded. DT3 test 6 proves that a destroyed response raises no `error` event and the process stays up. Until that test is green, this design does not assert it. | — |

---

## 8. Slices

Order: the table and reads first, harmless while every run still stops on disconnect. Then rejoin for a second device. Then detach itself, with its client. Then restart honesty, then the notification. Each slice runs red first and files `docs/evidence/ANA-SUMMARY/<date>/DT<n>-<name>/`, holding the red output, the green output and the browser captures named below.

### DT1: the event mirror and its reads (no behaviour change for the person)

**Files:**
- `migrations/<date>_ana_run_events.sql`: table, index, trigger and header.
- `scripts/db/migration-set.mjs`: the entry, above `UUID_TENANT_ISOLATION_NONPUBLIC`, with its note.
- `db/migrations/20260917_ana_runs.sql`: `timeline_seq` and `user_message_id`, as `ADD COLUMN IF NOT EXISTS` with a dated note.
- `server/services/tenant/tenant-offboarding.ts`: `'ana_run_events'` before `'ana_runs'`.
- New `server/services/ana/run-events.ts`: the ordered mirror queue, the cap, and the post-seal delete.
- `server/services/ana/turn-timeline-emitter.ts`: the third sink, and the `truncated` marker at seq 2000.
- `shared/ana/turn-timeline.ts`: the marker type.
- `server/services/ana/run-control.ts`:
  - the process-wide heartbeat, which stamps `timeline_seq`;
  - the reaper's `RETURNING` + notify, and its post-seal cleanup pass.
- `server/routes/ana-ri/stream.ts`:
  - the keepalive no longer beats the run (`:816-824` removed);
  - `user_message_id` is written at `:1131`;
  - the mirror is flushed and deleted after the record is filed.
- New `server/routes/ana-ri/runs.ts` and `server/routes/ana-ri/record-access.ts`. `turn-records.ts` imports the latter.
- `server/services/ana/turn-summary.ts`: export `controlsOf`.

**Tests that must fail first:**
1. **Mirror equals record.** A turn with a stand-in model leaves mirror rows whose events equal the sealed `record.timeline` with notes resolved, until the record is filed, and none after. *Red today:* there is no table.
2. **Trigger** (pglite):
   - UPDATE and TRUNCATE are refused.
   - DELETE is refused for a run with no record, allowed once a record exists, and allowed for a `pending_deletion` organisation.
   - INSERT is refused once a record exists.

   The selftest shows each refusal by running the statement against the table before the trigger is installed (green), then after (red).
3. **Owner only.** A batch written with another `owner_instance` inserts zero rows.
4. **Cap.** 2,050 events produce rows 1–1,999 plus a `truncated` row at 2000. A row at seq 2001 is refused by the CHECK. The record holds all 2,050.
5. **Gap.** A failed batch leaves a missing `seq` and `timeline_seq` above it. The read's payload shows both.
6. **Heartbeat without a socket.** A run whose response emitted `close` still has `heartbeat_at` advanced 15 s later (fake timers). *Red today:* `stream.ts:826-831` clears the only beat.
7. **Access** (pglite route test, the shape of S4 test 5):
   - asker 200;
   - admin 200;
   - colleague who can read the thread 200 with `approval: { waiting: true }` and `canControl: false`;
   - another organisation 404;
   - a `user_id IS NULL` run 403 for a member and 200 for an admin.

   The test is shown red against a handler that filters the organisation in JS rather than SQL, by running it with RLS off.
8. **Leak.** Sentinels in `owner_instance`, `pending_interjections`, `approval_decision`, `byUserId`, `user_id` and `surface` appear nowhere in either payload. Shown red against `SELECT *`.
9. **Purge.** `ci:purge-coverage` passes with the entry and fails without it (selftest).
10. **Migration gates.** `ci:migration-set-order`, `ci:migration-drop-safety` and `ci:tables-live-schema` are green. `ci:migration-set-order` is shown red with the entry placed after the sweep.

**Accepted when** (browser, desktop): a turn runs as today. Its events can be fetched from `/runs/:runId/events` while it runs, as captured JSON. The rows are gone after it is recorded. Nothing on screen changes.

### DT2: a second device follows a live turn

**Files:**
- `client/src/concept2cure/components/ana/useAnaChat.ts`:
  - `loadThread` reads `/runs?thread_id=`;
  - a `following` turn state, bound to a `runId`, polls `after=seq` and merges by `seq`;
  - the hand-over (§4.3);
  - the composer lock;
  - `confirmTurnRecordByRun` is replaced by the poll.
- `client/src/concept2cure/components/ana/anaTurnTimeline.ts`: `confirmRecordByRun` is deleted, and a `pollRun` is added.
- `client/src/concept2cure/v2/anaWorkModel.ts`: the copy in §5.1, and the `orphaned` and `error` stop lines.
- `TurnSummary.tsx`, `turnSummaryRows.ts`: the gap and cap lines.
- `AnaActivity.tsx`: the "Started …" and "Last heard …" lines.

**Tests that must fail first:**
1. A reloaded thread whose last question has a live run renders a live turn after that message, from polled events. *Red today:* the question stands alone until the answer exists.
2. SSE frames and polled rows with overlapping `seq` render each event once.
3. A terminal run with a record hands over to the Summary, and the rows are identical before and after.
4. A colleague's view has no Stop, Pause or Steer, and shows the colleague line. The asker's view of `approval` opens the sign-off.
5. A second Stop answered 409 renders as stopped, not as an error.
6. No record after the confirm windows: "Not recorded", and the stop line from the run's reason.

**Accepted when** (browser, 1280 px and 390×844):
- Start a Balanced turn on desktop, using the S4 acceptance corpus (`ANA_AGENT_WORK_VIEW_2026-10-08.md:466`). Open the same conversation on the phone. The phone shows the same rows arriving, and Stop on the phone stops the desktop turn.
- A colleague's browser shows the rows and no controls.
- The desktop reload mid-turn **still stops the turn** in this slice ("Stopped: this page lost its connection."), because the server does not detach yet. That is filed as the expected result.

### DT3: detach

**Files:**
- `server/services/ana/run-status.ts`: `detachable()`, and `orphaned` in `TurnStoppedReason`.
- `server/routes/ana-ri/stream.ts`:
  - `disconnectRun` branches on `detachable` (§2.1);
  - the detached ceiling timer (§2.6);
  - the approval loop's `res.writableEnded` test is deleted (`:2324-2327`);
  - `clientGone` and `stopForDisconnect` are removed from `streamRunHold` (`:517-523`);
  - the error path reads `runSignal.reason` (`:3497-3527`);
  - `beginRun`'s refusal frame for `RUN_IN_PROGRESS`.
- `server/services/ana/run-hold.ts`: `clientGone`, `stopForDisconnect` and the `'disconnected'` outcome are removed (`:88-90, 205-207`); `leave` returns `'cancelled'` for any terminal status (`:272`).
- `server/services/ana/turn-run-policy.ts`: `noteDetached`. `'disconnected'` handling is kept only for the non-detachable path (`:188-190, 296-297`).
- `server/services/ana/run-control.ts`:
  - `driveLocalRun` aborts on every terminal status, with a reason (`:181-188`);
  - `beginRun` gets the per-thread advisory lock and the refusal (`:228-276`).
- `useAnaChat.ts`: a socket error, the idle timeout, unmount and `abandonTurn` on a detachable turn switch to following instead of marking it interrupted (`:778-819, 1056-1063, 1903-1975`). Stop is unchanged.
- Existing tests updated, not deleted:
  - `server/routes/ana-ri/__tests__/stream-disconnect.test.ts:253-290` ("keeps a durable disconnect distinct…") becomes "detaches a durable run, and stops a local-only or driving one";
  - `stream-run-hold.test.ts` and `run-hold.test.ts` lose the `clientGone` cases.

**Tests that must fail first:**
1. **Detach.** A durable, owned, non-driving turn whose response emits `close` at round 1 runs every remaining round and files its record as `answered`. Its row ends `finished`, and no `client_disconnected` is written. *Red today:* it is cancelled with `client_disconnected`.
2. **Still stops.** A local-only turn, a turn with `user_id` null and a Live Drive turn are each stopped with `client_disconnected` on `close`, exactly as before.
3. **Reaped owner stops.** A detached run whose row is set to `failed`/`orphaned` by another writer aborts within one poll interval. Its record says `stopped` with reason `orphaned`. *Red today:* `driveLocalRun` ignores `failed`, and `run-hold.ts:272` carries on.
4. **One run per thread.** A second `POST /stream` on a thread with a live run gets `RUN_IN_PROGRESS`, and no second question is saved. Two racing posts produce exactly one run (pglite, two connections). *Red today:* both run.
5. **Ceiling.** A detached turn whose tool never resolves is aborted at `AUTO_WALL_MS` (fake timers) with `budget_exhausted`.
6. **Dead socket.** A detached turn writes 50 frames to a destroyed response. No `error` event is emitted on the response, and the process has no unhandled error.
7. **Holds unattended.** Manual: a detached hold ends `hold_expired` at `MAX_PAUSE_MS`. No policy: an approval is denied at `MAX_PAUSE_MS` and the turn continues. Auto: the turn ends `approval_timeout`. Each was green before and must stay green: they are regression guards, run in the detached state.
8. **Cross-instance** (`run-control-cross-instance.dbtest.ts`):
   - a cancel accepted on instance B aborts a detached run on instance A;
   - a reaper on B notifies A, and A aborts.

**Accepted when** (browser, phone 390×844 and desktop):
- **Phone lock.** Start the S4 corpus turn on the phone and lock it for 3 minutes. On unlock, the steps taken while it was locked are present, the turn carries on or has finished, and there is no "lost connection" row.
- **Close the tab** on desktop mid-turn, then reopen the conversation. The turn is live, or finished with its Summary.
- **Stop from another device** while the first is closed.
- **A second message** while the turn runs is refused with the sentence and the live turn is shown.
- **Manual + approval while closed.** With a Manual turn holding for an approval, close the page and wait past 10 minutes. Reopening shows "Stopped: an approval was not answered." *(A staging run with `MAX_PAUSE_MS` unchanged; the wait is real.)*
- **A Live Drive turn** still stops on close, with the old line.

### DT4: a restart says so

**Files:**
- `server/startup/shutdown.ts`: a step before the HTTP drain (`:41`), `settleOwnedRunsForShutdown(pool)`. It writes `failed`/`orphaned` for each owned live run in its own tenant scope, aborts each with that reason, then lets the existing drain window run.
- `run-control.ts`: `ownedLiveRuns()`, and `stopRunInternally` accepts `orphaned` with status `failed`. Today it writes `cancelled` for both reasons (`:664-671`), while the reaper writes `failed` for `orphaned` (`:752-755`). One reason now means one status.
- `TurnSummary.tsx` and `turnSummaryRows.ts`: the crash line under `orphaned` when there is no record.

**Tests that must fail first:**
1. `gracefulShutdown` with one owned detached run marks it `failed`/`orphaned` before `pool.end()`, and the turn's error path files a `stopped` record with reason `orphaned` (stand-in model, fake drain). *Red today:* the row stays `running` until the reaper.
2. `stopRunInternally(…, 'orphaned')` writes `failed`. *Red today:* `cancelled`.
3. A run read for a row whose heartbeat is 6 minutes old returns `failed`/`orphaned` (the reaper runs from the read). *Red today:* `running`.

**Accepted when** (staging, browser): start a turn, close the page, and redeploy. Reopen: "Stopped: the server restarted." with the steps saved before the deploy and Continue. Capture the ECS task stop and the record (or its absence) as evidence. Separately, `kill -9` the owner in a local two-instance run: after 5 minutes the other instance's read shows the crash line.

### DT5: the in-app notification (only if decision D-5 is yes)

**Files:**
- `server/routes/ana-ri/stream.ts`: on `approval_required` and at turn end, if detached, `void createNotification(…)` with the copy in §5.4.
- `anaWorkModel.ts`: the title table.

**Tests that must fail first:**
1. A detached turn that ends creates one notification for the asker. An attached turn creates none.
2. A detached approval creates one `warning` notification. Its body carries no parameters and no ids.

**Accepted when** (browser): close the page mid-turn and reopen the product later. The AnA dock lists "AnA finished your request", and opening it lands on the conversation.

---

## 9. Decisions for the founder or product owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D-1 | **Who may watch a live turn.** | (a) The Summary rule: anyone who may read the thread (decision 6). (b) The asker and admins only. | **(a)**. The live rows are the Summary's rows, redacted by the same construction; a colleague can already read the transcript. Controls and the pending approval stay with the asker. |
| D-2 | **The ceiling for a turn nobody watches.** | (a) `AUTO_WALL_MS` (40 min) for every detached turn. (b) Only the round budgets. (c) A new number. | **(a)**. It reuses an existing number, and it is the only bound that stops a hung round. |
| D-3 | **A per-person limit on live runs.** | (a) None beyond one per conversation. (b) At most 3 live runs per person across the estate, counted in `beginRun`, with "You have three turns running. Stop one, or wait for one to finish." | **(b)**. Detach makes "start, close, start elsewhere" free. Three keeps parallel work possible. It is cost governance, decided by a count, not by a model. |
| D-4 | **Mirror rows of a crashed run** (no record). | (a) Keep until the tenant purge, like `ana_runs`. (b) Delete after N days. | **(a)** for launch. They are small, and they are the only trace of that turn. Retention is set with the rest of the working-data schedule. |
| D-5 | **Notifications.** | (a) None. (b) In-app only, for an approval waiting and for the end of a detached turn. (c) Plus email or push. | **(b)**. Push to a locked phone is the screenshots' full experience, but it is a new channel with its own consent and delivery questions. |
| D-6 | **Who may decide a held step.** The governed-action route checks that the run is waiting and that the decision matches its proposal (`utility.ts:74-123`), but not that the decider is the run's asker. Today only the asker's socket received the envelope. With rejoin, §3.7 gives the envelope to the asker alone, which keeps the de facto rule. | (a) Keep as is. (b) Make it explicit in the route: the asker, or an admin. | **(b)**, as a small change in DT2. A rule that holds only because a toolUseId is unguessable should be written down where it is enforced. |
| D-7 | **Live Drive turns stay non-detachable.** | (a) Yes. (b) Detach and drop the drive. | **(a)**. The turn's work is the screen. |

---

## 10. Risks and out of scope

**Risks**

- **Load.** Each live run adds about 60 mirror inserts in batches, one heartbeat row update every 15 s (one statement per process), and 2-second polls per watching page. All are primary-key or indexed. Poll volume rises with watchers, not with runs.
- **A 5-minute dark period after a crash.** The reaper's threshold is unchanged. The "Last heard" line makes the wait honest; it does not shorten it.
- **Clock skew.** Controls accepted on another instance sort by their own `at`, as in S4.
- **The detach warning** in the record is a new kind of line an inspector reads. It is a fact (when the page closed), not a claim.
- **Two stop paths remain**: detach, and stop for turns that cannot detach. They are one branch in `disconnectRun`, not two handlers.
- **Writes to dead sockets.** Every write to a closed socket is ignored. DT3 test 6 proves the process tolerates it. No write site is refactored.

**Out of scope**

- a background worker (P-10);
- moving a run between instances;
- surviving a deploy;
- SSE resume;
- web push and email;
- per-thread privacy;
- sub-agents (ADR-0015);
- any change to round budgets or `MAX_PAUSE_MS`.

---

## 11. Critique response

**How the critiques were run.** The task asked for two independent reviewers spawned with the Agent tool. That tool was not available in this session (only the tools listed for this subagent were, and a tool search found no agent-spawning tool). The two passes below were therefore run in this session, sequentially, each with its brief stated and the draft re-read against the code. **They are not independent.** The caller should run two independent reviewers over this revision before DT1 starts.

Verdicts: **A** accepted, **P** partly accepted, **R** rejected.

### Governance and security pass

Brief: tenancy, Part 11 lineage, fail-closed, Rule 1, P-10, ADR-0015.

| # | Point | Verdict | Handled |
|---|---|---|---|
| G-1 | The first draft called the trigger "insert-only" and also deleted rows after sealing, and the purge needs a plain DELETE. The two cannot both hold. | A | DELETE has a door in the trigger: a record exists, or the organisation is `pending_deletion`. UPDATE and TRUNCATE are always refused, and INSERT is refused once sealed (§3.2). DT1 test 2. |
| G-2 | The first draft let the reaper's deletion remove a crashed run's events, the only trace of that turn. | A | The trigger refuses deletion with no record. Retention is decision D-4. |
| G-3 | The first draft wrote `detached` into `control_events`. That table is the human-decision lineage the dossier reads. A page closing is not a decision; `stopRunInternally` draws exactly this line. | A | It is a recorder warning, not a control event (§2.1). |
| G-4 | The heartbeat on the keepalive means a detached run would be reaped as orphaned while alive. | A | It was found in the code (`stream.ts:816-831`) and made DT1's first red test. |
| G-5 | A reaped run keeps running and would seal "answered" against a `failed` row. | A | Any terminal row aborts with the row's reason, and the error path uses it (§2.4). DT3 test 3. |
| G-6 | The read route must not filter the organisation only in JS. | A | The organisation is in SQL on both queries. The test runs with RLS off to prove the SQL is the boundary (DT1 test 7). |
| G-7 | Colleagues receiving `toolUseId` would hold the key that binds a decision. | A | The envelope goes to the asker only. Colleagues get `{waiting:true}`. Explicit enforcement is decision D-6. |
| G-8 | A unique index for one-run-per-thread would fail to build on replay where duplicates exist. | A | An advisory lock in `beginRun`, with no schema change (§2.8). |
| G-9 | `stopRunInternally` writes `cancelled` for `orphaned`, while the reaper writes `failed`. | A | It is unified in DT4 (test 2). |
| G-10 | The mirror might be used as a second retained record. | A | It is stated as working data; the sealed record is the record (§3.2). |
| G-11 | Notification bodies could leak parameters. | A | Fixed titles, empty body (§5.4). DT5 test 2. |
| G-12 | Use a dedicated purger role, as for turn records. | R | The table is not retained data. A purger role would claim a status it does not have. The `pending_deletion` predicate in the trigger gives the same guarantee for the purge path. |
| G-13 | Detach widens unwatched model spend. | P | The ceiling (D-2), the per-person limit (D-3) and one run per thread are adopted. A tenant token budget does not exist in the gateway today and is not invented here. |

### Product and UX pass

Brief: the screenshots' use case, the phone, honest states, copy, and slice value.

| # | Point | Verdict | Handled |
|---|---|---|---|
| U-1 | The first draft's slice order shipped detach (server) before any client could rejoin, so closed turns would run invisibly. | A | Detach and its client switch are one slice (DT3), after the reads (DT1) and following (DT2). |
| U-2 | After a reload there is no way to place a live run in the transcript. | A | `ana_runs.user_message_id`, and `GET /runs?thread_id=` (§3.1, §4.2). |
| U-3 | A dead owner looks "running" for 5 minutes. | A | "Last heard from AnA n min ago" from `lastBeatAt`. The reaper runs from reads (§2.4, §5.1). |
| U-4 | A colleague sees controls that will 403. | A | No controls, with a line saying why (§5.1). |
| U-5 | A second Stop shows an error. | A | 409 is read as stopped (DT2 test 5). |
| U-6 | Two copies of "is it recorded?" logic (`confirmRecordByRun` and the poll). | A | Folded into one (§4.3). |
| U-7 | The "lost connection" line would vanish entirely, and Live Drive users would get a frozen screen. | A | Kept for non-detachable turns, Live Drive among them (§2.1, D-7). |
| U-8 | Use SSE resume for snappier updates. | R | Two delivery paths for one stream. A long-poll on the existing NOTIFY wake is the upgrade if 2 s proves slow (§4.1). |
| U-9 | Push notifications are the real phone experience. | P | In-app only for launch (D-5). Push is out of scope and listed. |
| U-10 | "Started 4 min ago" and "Last heard" must not become promises ("about 2 minutes left"). | A | Only elapsed facts. No estimates (§5.1). |
| U-11 | The truncation line must not say the steps were lost. | A | It says the full list comes with the record, which is true because the recorder is uncapped (§3.5). |
