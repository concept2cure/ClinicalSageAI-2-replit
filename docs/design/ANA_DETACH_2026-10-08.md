# AnA detach: a turn that outlives its page, and any device that can rejoin it

**Date:** 2026-10-08. **Status:** DT1 (`c3b9524c4`), DT2 (`202e11814`) and DT3 built; DT3 absorbed DT4 (the notification), and was completed on trunk on 2026-10-22 (§12.4); its browser acceptance (§12.5) found that Live Drive's default kept a default turn from detaching, and D-7 was decided on 2026-10-22 (a Live Drive turn detaches; its later screen actions are refused, §9, §12.6). Three independent reviews of the uncommitted change were addressed on 2026-10-22 (§12.6). What the build found and changed is in §12. The body below is the design as decided; where the build departed from it, §12 says so. Checked against `concept2cure-v2` at `c33211ee2` (S1–S5 landed: `6df767850`, `546a989e7`, `d6e0be49b`, `1f2557255`, `24ad99898`).

**Asked by:** decision 2 (b) of `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` ("Decisions taken", line 586): *"A turn keeps running when the page closes or the phone locks, inside the API process, with D1 built alongside it. It gets its own design after S4."* It is recorded as P-24 in `docs/LAUNCH_DEFINITION_OF_DONE.md:373`.

**Revision:** third draft.
- The second draft (`c33211ee2`) was reviewed by two independent reviewers, one for governance and security and one for product and UX.
- Every finding is addressed in the body. §11 records each finding and how it was handled.
- The decisions are now taken (§9).

## Summary

**Today.** A dropped socket is a stop: the route's `close` handler marks the run `cancelled` with reason `client_disconnected` and aborts the work (`server/routes/ana-ri/stream.ts:901-929`, `server/services/ana/run-control.ts:638-676`).

**What detach means.** Detach means not doing that. The request handler already keeps running after its socket is gone, because nothing but the abort signal stops it. Making that safe and honest takes the following, each grounded in a gap that exists now:

1. **A heartbeat that does not depend on the socket.** Today's heartbeat rides the SSE keepalive, which is cleared on close (`stream.ts:816-831`).
2. **A run that settles honestly.**
   - Today's disconnect handler sets `runSettled` first (`stream.ts:902-903`), so a detached run would never reach `endRun`.
   - Only `cancelled` aborts the owner (`run-control.ts:181-188`).
   - The default hold reads any other status as "carry on" (`run-hold.ts:272`).
3. **A verified thread, and one run per conversation.**
   - `beginRun` stamps the thread id the client sent before the thread is resolved (`stream.ts:852-858` against `:1103-1131`).
   - A brand-new conversation's run is left with `thread_id` null.
   - Nothing limits live runs per thread or per person.
4. **A run that cannot outlive its person's authority.** Sign-out, a revoked session, a password change, a deactivated account, and a suspended or deleting organisation all stop the person's or organisation's live runs. Each round re-checks the session and the organisation.
5. **A bound on unwatched work.** No tenant spend bound exists in the gateway. A run nobody is watching stops after 15 minutes unwatched, and never later than 40 minutes from its start.
6. **A way to see a run that has no socket.** D1's append-only `public.ana_run_events` mirrors the timeline that S4 already emits from one producer (`server/services/ana/turn-timeline-emitter.ts:93-101`). Any permitted device polls it with `after=seq` and hands over to the sealed record's Summary.

**What this adds:**
- one table, behind a governed delete door;
- additive columns on `ana_runs`;
- three read routes;
- a process heartbeat;
- the run limits.

**What it does not add:** no worker (P-10), no model call, no tool. Sub-agents stay unhosted and off in production.

**Unchanged:** Manual holds and approval timeouts. A deploy or crash still ends a detached run, with an honest closing row and the steps that were saved as they ran.

**Slices.** Four, DT1–DT4. The server change and its client ship together in DT3.

**Prerequisite (P-A).** Approval authority is fixed separately (§2.7). Landed in 8a3c1a4f5: only the asker decides, 403 `NOT_RUN_OWNER` otherwise.

---

## 0. Where this sits

- **Lane.** `ANA-SUMMARY`, the founder-directed exception to Rule 2 recorded as P-24 (`LAUNCH_DEFINITION_OF_DONE.md:356-373`).
  - It moves no D-row.
  - Evidence goes to `docs/evidence/ANA-SUMMARY/<date>/DT<n>-<name>/`.
- **Directory set:**
  - `server/services/ana/` and `server/routes/ana-ri/`;
  - `server/routes/auth.ts`, `server/services/account-standing.ts` and `server/services/token-revocation.ts`, for the session-end hooks only;
  - `server/services/tenant/`, for the purge door and the lifecycle hooks;
  - `server/startup/shutdown.ts`;
  - `scripts/db/migration-set.mjs`, `migrations/` and `db/migrations/20260917_ana_runs.sql`;
  - `shared/ana/`;
  - `client/src/concept2cure/components/ana/` and `client/src/concept2cure/v2/`.
- **No new surface.** Rejoin happens inside the conversation and in the Summary panel or sheet that S4 built (`TurnSummary.tsx`, `AnaWorkPanel.tsx`). The conversation list gains a "Working" marker. The notification uses the existing in-app inbox, which `TaskTray.tsx` reads (`:104-107`, `:344-352`).
- **Rule 2, the model narrates.** Every line this design adds comes from a fixed table. The sources are the run row's status and reason, the `STOP_LINES` table (`client/src/concept2cure/v2/anaWorkModel.ts:42-55`), and server-written timeline events. No model decides whether a run is alive, finished or worth a notification.
- **P-10.** The turn keeps running inside the API request handler that started it. There is no queue, no worker and no hand-off. A run lives and dies with its owner process.
- **ADR-0015 §2.** The stream hosts no `run_agent` (`server/services/ana/governed-toolset.ts:74, 96`; the stream passes no `hostsSubAgents`). `subAgentsEnabled()` is off in production (`server/services/ana/sub-agent-limits.ts:26-35`). Detach changes neither.
- **One clock.** Every time this design stores or sends is written by the server, as ISO-8601 UTC (`now()` in SQL, `Date.now()` on the owner). Each poll response carries `serverNow`, and the client computes elapsed times against it, never against its own clock.

---

## 1. What happens at disconnect today

| # | Step | Where |
|---|---|---|
| 1 | A 15 s interval writes `: heartbeat` to the socket and also refreshes the run's `heartbeat_at`. | `stream.ts:806-825`; `run-control.ts:265-272` |
| 2 | The interval is cleared on `res` `close` and `finish`, and on an aborted `req` `close`. After a drop, the run's heartbeat stops. | `stream.ts:826-831` |
| 3 | `disconnectRun` is registered on both closes. Its first act is `runSettled = true` (unless the run already settled, or the response ended normally). | `stream.ts:901-903, 928-929` |
| 4 | Unless a Stop already aborted the run, it notes the disconnect on the policy, which later maps the loop's `cancelled` to `client_disconnected`. | `stream.ts:905`; `turn-run-policy.ts:188-190`; `run-status.ts:184-194` |
| 5 | A turn with no run row aborts its local-only handle and writes a warning into its record. | `stream.ts:906-913`; `run-control.ts:290-299` |
| 6 | A turn with a row calls `stopRunInternally(…,'client_disconnected')`. That aborts the local controller, then writes `cancelled`/`client_disconnected`, guarded on a live status, in the run's tenant scope. No control event is written. | `stream.ts:926`; `run-control.ts:638-676` |
| 7 | A close that happened during `beginRun` is settled after the recorder opens. | `stream.ts:950-953` |
| 8 | The abort reaches the gateway and the tools through `runSignal`. The error path saves the streamed text as a stopped answer, ends the timeline, and files the record as `stopped`. | `stream.ts:2056, 3497-3527`; `post-processing.ts:312` |
| 9 | `finally` releases the local run. `endRun` is skipped because `runSettled` is already true. | `stream.ts:3529-3546` |
| 10 | The pause hold, the approval wait and the Live Drive move settle each test `res.writableEnded`. Node sets that flag only after `res.end()`, so none of them sees a dropped socket; a drop reaches them only through step 6's abort. | `stream.ts:517-523, 2324-2327, 3214`; `run-hold.ts:205-207` |
| 11 | S4's closing row reads "Stopped: this page lost its connection." with Continue. | `anaWorkModel.ts:53-54`; `isContinuable`, `:218-232` |
| 12 | **The client.** The four ways the client drops the socket, and the confirm waits that follow:<ul><li>Stop sends `cancel` and awaits it, but aborts **even when the cancel failed**: "A failed cancel must not leave the client streaming; abort anyway." (`useAnaChat.ts:745-771`)</li><li>Unmount, except a driving turn (`:778-797`).</li><li>Switching or reloading the conversation (`abandonTurn` `:806-819`; `loadThread` `:828-830`).</li><li>The 90 s idle timer (`:122, 1056-1063`).</li></ul>Each non-Stop path marks the turn interrupted (`:1903-1975`). It then asks for the record by run id at 1.5 s and 4 s (`:179, 737-743`; `anaTurnTimeline.ts:81-100`). | as cited |
| 13 | The request's lazy DB client is released on close (`establishRequestTenantScope.ts:160-170`). The stream does not use it. It queries `getPool()` under the AsyncLocalStorage tenant scope set by `runWithTenantScope(…, next)` (`:274-277`), and that scope outlives the socket. Timers created later inherit whatever context created them (`run-control.ts:63-76`). | as cited |
| 14 | Graceful shutdown drains HTTP for up to 10 s (`server/startup/shutdown.ts:41-53`), returns the LISTEN client (`:89-96`) and ends the pool. Nothing in it addresses live runs. | as cited |
| 15 | **The reaper** marks live rows whose heartbeat is older than `STALE_AFTER_MS` (5 min, `run-status.ts:316`) as `failed`/`orphaned`, estate-wide, under the system scope (`run-control.ts:745-760`).<ul><li>It runs only after a run opens (`stream.ts:867`).</li><li>It notifies nobody.</li><li>Nothing deletes or ages out `ana_runs` rows. The migration's "these rows are reaped" (`db/migrations/20260917_ana_runs.sql`) means marked, not deleted.</li><li>`ana_runs` has no retention job.</li></ul> | as cited |

---

## 2. The detached run's lifecycle

### 2.1 Which turns detach

**A turn detaches on disconnect when:**
- it has a run row;
- it has an owner (`user_id` non-null; `isHoldable`, `run-status.ts`);
- its request did not ask to drive (`live_drive !== true`, read at request parse, `stream.ts:731`).

**Why the request flag and not the drive state.** `driveState` is not known until context assembly resolves (created at `:967`, awaited at `:1354`). A drive is enabled only when the request asked for one, so the request flag is known from the first line and is never wrong in the unsafe direction.

**What still stops on disconnect.** A turn that asked to drive stops exactly as today, because its work is a screen that is gone (D-7). So do a turn with no row and a turn with no owner.

> **Superseded 2026-10-22 (D-7, §9, §12.6).** A turn that asked to drive now detaches like any other. From the close, AnA stops driving the screen: a further screen action is refused before it runs and listed as a step that did not run ("Not run: the page was closed, so AnA stopped driving the screen."); the rest of the turn goes on. What still stops on disconnect: a turn with no row, no owner or no resolved conversation.

**The predicate.** `detachable({ runId, runUserId, liveDriveRequested })` goes in `run-status.ts` beside `isHoldable`.

**The detach branch of `disconnectRun`:**
- returns **before** `runSettled = true`;
- does not call `noteDisconnected`;
- does not abort.

It records `detachedAt` (ISO UTC) and the armed limits on the turn, and writes them into the recorder as a warning, for example: "The page closed at 2026-10-08T14:02:11Z; the turn continued. Unattended limit: stops after 15 minutes with nobody watching, and no later than 2026-10-08T14:40:00Z." That is a fact an inspector can read. It is never written to `control_events`, because a page closing is not a person's decision (`run-control.ts:631-637`).

**How the run ends.** The detached run reaches `finally` like any turn, and `endRun` writes `finished` or `failed` (`stream.ts:3539-3545`).

### 2.2 Ownership, and the watched state

- **Owner.** `ana_runs.owner_instance` is the process holding the run's `AbortController` (`run-control.ts:170, 231-241`). It never changes. Detach changes only one thing: the owner's handler keeps executing after its socket is gone.
- **Watched** is a separate fact from detached:
  - A run is **watched** while its originating socket is attached, or while the asker's poll stamped `ana_runs.last_watched_at` within the last 15 s.
  - The poll stamps at most once every 5 s, and only while the page is visible. A hidden page does not poll (§4.1).
  - An admin's poll does not count. Watching is the asker's.
- **What keys on unwatched.** The unattended limit (§2.6) and the notification (§5.4) key on **unwatched**, not on detached.

### 2.3 Heartbeat: one per process, independent of any socket

The beat moves out of the keepalive (`stream.ts:816-824`) into `run-control.ts`. One process-wide interval beats every run this process owns. It is armed by the first `beginRun` and idle while `localRuns` is empty.

```sql
UPDATE ana_runs AS r
   SET heartbeat_at = now(), timeline_seq = v.seq
  FROM unnest($1::text[], $2::int[]) AS v(id, seq)
 WHERE r.id = v.id
   AND r.owner_instance = $3
   AND r.status IN ('running','paused','awaiting_approval')
```

- **Interval.** `RUN_HEARTBEAT_MS = 15_000`, today's keepalive interval. The SSE comment ping stays on the response for proxies and no longer touches the database.
- **Scope.** Each firing opens `runWithSystemTenantScope('ana-run-control:heartbeat', …)`, as the poll fallback does (`run-control.ts:837-850`). `owner_instance = $3` limits the write to this process's rows: a process can never beat another's run back to life.
- **One heartbeat writer.** The checkpoint's `heartbeat(round)` (`stream.ts:3245-3248`) becomes the same statement for one id plus `current_round`.
- **Lifetime.** A run leaves the beat set in `releaseLocalRun` (`run-control.ts:336-338`).

### 2.4 Reaper, and an owner that learns its row ended

- **The reaper's statement and threshold are unchanged.** Three additions:
  - it returns the reaped ids and sends `pg_notify(RUN_CONTROL_CHANNEL, id)` for each;
  - it also runs from the run read routes, at most once per 30 s per process;
  - its pass deletes the mirror rows of runs whose record exists, through the door (§3.2).
- **Which writes abort the owner.** `driveLocalRun` aborts on `cancelled` (today) **and on `failed`**. `failed` is written by the reaper, by shutdown, or by the session-end stop. It never aborts on `finished`.
  - That matters because the owner's own `endHeldRun` writes `paused → finished` and drives the local run (`run-control.ts:954-964`). The turn must then write its closing answer, and an abort would kill it.
  - The owner's `endRun` does not drive its local run, and it releases the run (`:309-327`).
  - So **no terminal write the owner makes about itself aborts its own post-processing.** That post-processing is not awaited by the handler (`stream.ts:3452`, `void runStreamPostProcessing`) and runs after `releaseLocalRun`.
- **How the reason travels.** `controller.abort(new RunStopped(reason))`, where `RunStopped extends Error` with `name = 'AbortError'` and a `stoppedReason` field.
  - It is never a string. Abort consumers that throw `signal.reason` keep receiving an `Error` named `AbortError`. `Semaphore.acquire` rejects with `signal.reason` (`server/services/ai-gateway/concurrency.ts:24, 38, 60`), and the gateway converts any error on an aborted signal to `GatewayAbortedError` (`gateway.ts:1966-1986`), so failover and the circuit breaker see a cancel, as today.
  - DT3 test 9 runs this through a stand-in provider, both mid-call and while queued for a permit.
- **The row's reason wins.** The error path (`stream.ts:3497-3527`) takes the stop reason from `runSignal.reason.stoppedReason` when it is a `RunStopped`. The stopped answer, the `end` event and the record then say what the row says. A record never says "answered" for a run whose row says `failed`.
- **Holds.** The default hold's `leave` (`run-hold.ts:272`) returns `'cancelled'` for any terminal status. Manual's `settleHold` already fails closed (`turn-run-policy.ts:301-303`).

### 2.5 Control from another device

**Cancel, pause, resume and steer.** They stay owner-only, unchanged. Control is a row write accepted anywhere and delivered to the owner by NOTIFY, with a 2 s poll fallback (`run-control.ts:30-46, 451-502, 783-862`). Another organisation gets 404 and a colleague 403 (`stream.ts:3560-3577`). The same person on another device is the same user.

**A second Stop** gets 409 `Run already cancelled`, and the client reads that as stopped (DT2).

**Admin or owner cancel (new; cancel only, never approve).** `applyControl` admits `cancel` from an organisation admin or owner (`readsEveryRecord`, `server/routes/ana-ri/turn-records.ts:65-69`) on any live run in their organisation:
- The organisation is in the SQL as today, so another organisation gets 404.
- The control event records the admin's `byUserId` and `byRole: 'admin'` at acceptance, in `control_events`, which already is the decision lineage.
- An audit row goes to the chained audit trail through the existing audit service, as every governed control does.
- Pause, resume, steer and any approval stay the asker's alone.
- The closing row reads "Stopped by an administrator."

### 2.6 Budgets, and the unattended limit

- **Round budgets are unchanged** (P-24): Fast 4, Balanced 6 + 2, Thorough 10 + 4, Auto 20 absolute (`server/services/ana/agentic-loop.ts:294-372`; `shared/ana/run-control-limits.ts:49`). A detached turn earns no extra rounds.
- **No tenant spend bound exists.** The gateway caps in-flight calls per process (`concurrency.ts:1-13`, default 20) and refuses a request too large for the model's context. It has no per-tenant or per-turn token or cost budget (`gateway.ts`; `context-budget.ts`). Nothing in this design invents one.
- **The unattended limit (decided).**
  - **Clock.** Auto's work budget, `AUTO_ACTIVE_MS` (15 min, `run-control-limits.ts:57`), counted while the run is **unwatched** (§2.2). It starts when the run becomes unwatched and resets when someone watches again.
  - **Hard cap.** `AUTO_WALL_MS` (40 min, `:64`) from the turn's start, which no watching resets.
  - **When the 15 minutes run out at a round boundary,** the loop's `stopWhen` makes the next model call the closing answer, the way `budget_exhausted` does (`run-status.ts:208-221`).
  - **When they run out inside a round** (a hung tool or a stalled provider), a timer gives a closing-answer grace of `DETACHED_CLOSE_GRACE_MS = 120_000`. This is the one new number. It lets the round finish and the closing answer be written. Past it, the owner aborts with `RunStopped('unattended_limit')`.
  - **New reason `unattended_limit`,** line "Stopped: nobody was watching for 15 minutes." It is continuable.
  - **The 40-minute cap** uses the same path with `budget_exhausted` ("Stopped at the time limit.").
  - **Where the armed limit is written:** into the record (§2.1), and on the follower and conversation-list views as "Stops by 14:31 if nobody opens it".
- **Cost bound.** An unwatched turn makes at most:
  - one call per round up to its ceiling;
  - one closing call;
  - the post-turn answer check;
  - model calls inside tools, which are unchanged.

  All of these fall within 15 minutes unwatched and 40 minutes in all. Every call is in the gateway audit (`server/services/ai-gateway/audit.ts`).

### 2.7 Holds and approvals while nobody watches

**Prerequisite P-A (approval authority).**
- **The gap.** `readPendingApproval`, `recordApprovalDecision` (`run-control.ts:1064-1116`) and `resolveAuthorisedAction` (`server/routes/ana-ri/utility.ts:75-123`) never compare `ana_runs.user_id` with the decider.
- **The fix.** It is being made separately from detach, by the coordinator, on 2026-10-08: asker only, 403 for anyone else, and no admin approval.
- **Status in this checkout.** At `c33211ee2` it has not yet landed: `utility.ts` has no such comparison. DT2, which first exposes a pending approval to a second device, does not start until it has landed and its test is green.

**Unchanged by detach.** The timeouts are `MAX_PAUSE_MS` (10 min, `run-control-limits.ts:26`).

| Case | Attached (today) | Detached |
|---|---|---|
| A person's pause, no policy | Resumed as abandoned at 10 min, with no control event (`run-control.ts:911-918`) | Same |
| Manual hold, or a pause in a Manual turn | Ended at 10 min, `hold_expired` (`run-control.ts:954-964`) | Same: "Stopped waiting for you." |
| Approval, no policy | Denied at 10 min with `byUserId: null`; the step reads "Nobody authorised this within the time allowed, so it did not run. Nothing was changed."; the turn continues (`stream.ts:2344-2358`) | Same |
| Approval, Manual or Auto | The same denial, then the turn ends `approval_timeout` (`run-status.ts:208-216`) | Same: "Stopped: an approval was not answered." |
| Approval decided on another device | Woken by NOTIFY (`run-control.ts:1095-1116`) | Same; the asker's other device gets the sign-off from the run read |

**The expected failure.** An approval nobody answers within 10 minutes fails. That is the decided behaviour, and DT3's acceptance files it as the expected result (§8). The notification and the closing row say so in words:
- the Summary's closing row, and the "finished" notification, add "1 step was not authorised and did not run." The count comes from `heldBack` steps in the timeline;
- push for approvals is a later founder option (§10).

**Dead checks.** The approval wait's `res.writableEnded` test (`stream.ts:2324-2327`) and the hold's `clientGone` (`run-hold.ts:205-207`; `stream.ts:521-523`) never detected a drop (§1, row 10). They are deleted in DT3. A drop is acted on in one place, `disconnectRun`.

### 2.8 A verified thread, one run per conversation, three per person

**Thread verification moves before the run lock.** Today the order is:
1. the run is stamped with the client-sent `thread_id` (`stream.ts:852-858`);
2. `getOrCreateThread` then resolves it (`:1103-1131`).

`getOrCreateThread` resolves "in the caller's organization and to the caller's own thread, or mints a fresh one; a colleague's thread id is refused outright" (`:1103-1108`). A new conversation's run therefore keeps `thread_id` null forever. That run cannot be listed by thread for rejoin, and it escapes a per-thread rule.

**`beginRun` becomes one transaction:**
1. `pg_advisory_xact_lock(hashtext('ana_runs:user:' || org || ':' || user))`. Count the person's live runs in the organisation. If there are 3 or more, refuse with `RUN_LIMIT` (D-3).
2. If the client sent a thread id, verify it under the same rule as `getOrCreateThread`, without minting. Then take `pg_advisory_xact_lock(hashtext('ana_runs:thread:' || org || ':' || thread))`, reap that thread's stale rows, and refuse with `RUN_IN_PROGRESS` if a live run holds it.
3. Insert the run with the **verified** thread id, or null for a new conversation.

**After `getOrCreateThread` mints a new conversation's thread,** the same UPDATE that writes `user_message_id` writes `thread_id`. It takes the thread lock and is guarded `WHERE NOT EXISTS` (a live run on that thread).

**Why locks and not a unique index.** A partial unique index would fail to build on any database that already holds two live rows for one thread (Rule 1 replay). The locks need no schema.

**Both refusals come before the question is saved.** They are frames, `{type:'error', code, runId?}`, then `end`, because the SSE head is written first (`stream.ts:799-804`).
- `RUN_IN_PROGRESS` reads: "AnA is still working on the last message in this conversation." The asker's client rejoins that run.
- `RUN_LIMIT` reads: "You have three turns running. Stop one, or wait for one to finish." It links to the Working conversations (§5.1).

**Escape hatch.** A stale row from a dead process blocks its thread only until the reaper, or until the asker or an admin presses Stop. A cancel makes the row terminal with no owner alive (`run-control.ts:606-628`).

### 2.9 A run cannot outlive its person's authority

**Immediate stop.** `stopRunsFor({ organizationId, userId? }, 'session_ended')` in `run-control.ts`:
- writes `cancelled`/`session_ended` on the matching live rows, guarded on a live status, in that organisation's scope;
- writes no control event;
- notifies each run, so every owner aborts with `RunStopped('session_ended')`.

It is called from:

| Trigger | Hook | Scope of the stop |
|---|---|---|
| Sign-out | `POST /api/auth/logout`, after `revokeToken` (`server/routes/auth.ts:1344-1378`) | All of that person's live runs, on every device. This is the conservative reading of "the session ended". |
| Sign out everywhere, suspension, deprovisioning | `endEverySessionOf` (`server/services/account-standing.ts:206-216`, called at `auth.ts:1319`) | The person's runs |
| Password change or reset | The writer of `users.password_changed_at` (`server/routes/auth.ts`, `server/auth.ts`) | The person's runs |
| Organisation suspension | The writer that sets a denying `organizations.status` (`tenant-lifecycle.ts:101`) | The organisation's runs |
| Deletion requested | `requestDeletion` (`server/services/tenant/tenant-offboarding.ts:127`) | The organisation's runs |
| Purge | `purgeTenant` (`:789`), **first**, before any table is purged | The organisation's runs |

**The backstop at each round boundary.** The checkpoint re-checks before the next model call:
- **the session:** `verifyLiveToken(token, undefined, { activity: false })` (`server/services/token-revocation.ts:289-311`) on the credential the request was authenticated with, held in the owner's memory only. That one call covers revocation, an inactive account, a password change, sign-out everywhere, and the idle, lifetime and superseded windows. `activity: false` is the flag for "not the user acting" (`server/services/session-inactivity.ts:462-467`), as the collaboration socket's re-check uses it;
- **the organisation:** `shouldProcessTenantInBackground(orgId)` (`server/services/tenant/tenant-lifecycle.ts:413-424`). It permits only `allow`, so `pending_deletion` (read-only), `suspended` and `inactive` all stop the turn.

A failed or refused check stops the run with `session_ended`. **A check that cannot be read also stops it,** because the turn fails closed.

**What a missed hook costs.** At most one round, plus the unattended limit.

**Copy:** "Stopped: the session that started this turn ended." It is continuable once the person is signed in again.

### 2.10 What ends a detached run

| Cause | Reason | Line |
|---|---|---|
| The answer | — | — |
| A person's Stop, from any device | `cancelled` | today's |
| An admin's cancel | `cancelled`, with an admin control event | "Stopped by an administrator." |
| A round ceiling | `max_rounds` | today's |
| Unattended for 15 minutes | `unattended_limit` | "Stopped: nobody was watching for 15 minutes." |
| 40 minutes from start | `budget_exhausted` | "Stopped at the time limit." |
| A hold or approval timeout | today's | today's |
| The session or organisation ended | `session_ended` | §2.9 |
| A deploy (graceful) | `server_shutdown` | "Stopped: the server restarted for an update." |
| A crash, or a partitioned owner | `orphaned` | "Stopped: the server handling this turn stopped responding." |
| An error | `error` | "Stopped: the turn ended with an error." |

---

## 3. D1: `public.ana_run_events`

### 3.1 Schema

**New file `migrations/<DT1 date>_ana_run_events.sql`.** It goes in `C2C_MIGRATION_FILES` directly above `UUID_TENANT_ISOLATION_NONPUBLIC` (`scripts/db/migration-set.mjs:3100`), so it sits above the final pair `CHILD_TABLE_PARENT_SCOPE` (`:3117`) and `TENANT_ISOLATION_SWEEP` (`:3128`), which `ci:migration-set-order` pins.

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
CREATE INDEX IF NOT EXISTS idx_ana_run_events_written ON public.ana_run_events (written_at);
```

- **Tenancy (Rule 1).** `public`, with an integer `organization_id NOT NULL`, so the integer sweep (`20260801_tenant_isolation_sweep.sql`) gives the table a policy. The organisation is always the run's, copied from the run row by the insert (§3.4).
- **`event`.** Exactly the `TimelineEvent` that `emitTimeline` serialised, or the truncation marker (§3.5).
- **Replay.** Additive and `IF NOT EXISTS` throughout. No DROP.

**`ana_runs` amendments.** These go in place in `db/migrations/20260917_ana_runs.sql`, as `ADD COLUMN IF NOT EXISTS` below the `CREATE TABLE`, with a dated note. The file's own header says this is the way to add a column (`:33-39`).

| Column | Purpose |
|---|---|
| `timeline_seq integer NOT NULL DEFAULT 0` | The high-water mark (§2.3, §3.6) |
| `user_message_id text` | The question this run answers (§2.8) |
| `run_policy text` | `manual`, `auto` or null, written at insert; for followers (§3.7) |
| `hold jsonb` | `{ reason, next }` while a Manual hold or a person's pause is open; written by `holdForPerson` and the hold's announcement, cleared on leave; for followers |
| `last_watched_at timestamptz` | §2.2 |
| `released_at timestamptz` | When the owner finished trying to record the turn: post-processing's end, whatever came of the record write. A reader uses it to stop waiting (§4.3). |

### 3.2 Append-only, and a governed delete door

`public.ana_run_events_guard()` follows `20260926_ana_turn_records.sql:161-207`. It fires `BEFORE UPDATE OR DELETE` per row, `BEFORE INSERT` per row, and `BEFORE TRUNCATE` per statement.

- **UPDATE and TRUNCATE:** always refused, with `IMMUTABILITY_VIOLATION`.
- **INSERT:** refused once a turn record exists for `(NEW.organization_id, NEW.run_id)`.
- **DELETE:** refused unless `current_user = 'ana_run_events_purger'`, a NOLOGIN, NOINHERIT, NOBYPASSRLS role created and verified exactly as `ana_record_purger` is (`20260926_ana_turn_records.sql:243-262, 329-345`).

Three SECURITY DEFINER functions are owned by that role. Each restates its own preconditions inside the function, the way `purge_tenant_turn_records` does (`:295-325`), and each has EXECUTE granted to `app_service` only.

| Function | Who calls it | Preconditions checked inside |
|---|---|---|
| `release_sealed_run_events(org int, run text)` | The owner after sealing; the reaper's pass | The caller's tenant scope is `org`. A turn record exists for `(org, run)`. No active legal hold for `org` in `vault.legal_holds`. Deletes only that run's rows. |
| `expire_orphaned_run_events(org int, older_than timestamptz)` | The reaper's pass, per organisation (D-4) | `ana_runs.status` is terminal for each run. No record exists. `written_at < older_than`. `older_than` is at least the decided retention period before `now()`. No active legal hold for `org`. |
| `purge_tenant_run_events(org int)` | `purgeTenant`, through `PURGE_DOORS` | The platform scope. `organizations.status = 'pending_deletion'`. No active legal hold. Copied from `:303-321`. |

**The tenant purge** goes through `PURGE_DOORS` (`server/services/tenant/tenant-offboarding.ts:563-578`), not `PURGE_CHILD_TABLES`, because the table refuses a plain DELETE. The door runs before `'ana_runs'` is purged (`:894`), which the FK requires. `ci:purge-coverage` and its selftest cover it.

**The table is working data, not the retained record.** The sealed `ana_turn_records` row stays the Part 11 record. The door keeps every deletion of this table to three named, precondition-checked paths. In particular, the mirror rows of a run that crashed without a record are kept until the governed expiry, and never while a legal hold is active.

**Export.** The full tenant export discovers tenant-keyed tables from the catalog (`server/services/tenant-export/tenant-full-export.service.ts:24-28`), so the table is exported with no change.

### 3.3 Retention (D-4)

- **Expiry.** Mirror rows of a run that ended without a record are expired through `expire_orphaned_run_events` after **90 days**, recommended. The period is the founder's call. Expiry is legal-hold aware and runs from the reaper's pass, so there is no new job.
- **`ana_runs` itself has no retention job today** (§1, row 15). This design does not add one. That is noted for the working-data retention schedule.

### 3.4 Write rules

**One producer, a third sink.** `emitTimeline` stays the one producer (`turn-timeline-emitter.ts:93-101`). It appends to the recorder, enqueues to the mirror, and writes the frame. The mirror is a per-run ordered queue in `server/services/ana/run-events.ts`. It flushes every 250 ms or every 20 events, with one batch in flight.

```sql
INSERT INTO ana_run_events (organization_id, run_id, seq, at, event)
SELECT r.organization_id, r.id, v.seq, v.at, v.event
  FROM ana_runs r, unnest($2::int[], $3::timestamptz[], $4::jsonb[]) AS v(seq, at, event)
 WHERE r.id = $1 AND r.organization_id = $5 AND r.owner_instance = $6
ON CONFLICT (run_id, seq) DO NOTHING
```

- **Owner only.** The owner-instance predicate is in SQL.
- **While no record exists.** Enforced by the trigger.
- **Not guarded on a live status,** so the rows after a cancel are kept.
- **Idempotent** under retry.
- **Tenant scope.** Every flush runs inside `runWithTenantScope({ tenantId: String(run.organizationId), … caller: 'ana-run-events:flush' })`, opened explicitly per flush. It is never inherited from whatever context created the timer (§1, row 13).
- **Failures.** A failed batch is retried twice, at 250 ms and at 1 s. It is then dropped from the mirror and logged at error level. The gap is visible by `seq` and `timeline_seq` (§3.6). The run is not failed for it: the recorder still holds every event, and the record will carry them.
- **Flush, then seal, then release.**
  - Post-processing **awaits `mirror.close()`** before `fileTurnRecord` (`post-processing.ts:595-606`; `stream.ts:617-622`), because the trigger refuses inserts once a record exists.
  - If the close fails, the mirror stamps `timeline_seq` past the last row written, which marks the gap, and the record is sealed anyway. A record is never withheld for a mirror.
  - After the record is written, the owner calls `release_sealed_run_events`. It then writes `released_at`, whether or not the record was written.
  - Rows a crash leaves behind are released by the reaper's pass.

### 3.5 The cap and its marker

- **Numbers.** Seq 1–1,999 are events. Seq 2,000 is `{ kind: 'truncated', seq: 2000, at, round }`, a new `TimelineEvent` member in `shared/ana/turn-timeline.ts`. Nothing is written after it, and the CHECK makes 2,000 a database fact.
- **The record keeps everything.** The recorder is uncapped, so the record holds every event.
- **Copy:** "Only the first 1,999 steps are shown while AnA works. The full list appears when the turn is recorded."

### 3.6 Gaps

A missing `seq` below the cap is a dropped write. So is a `timeline_seq` above the last row on a released run. Either shows one line, never an empty list: "Some steps could not be shown live. The full list appears when the turn is recorded."

### 3.7 The read routes

New `server/routes/ana-ri/runs.ts`, mounted beside the stream routes.

```
GET /api/ana-ri/runs?thread_id=<id>     the thread's runs that are live, or released without a record; newest first; ≤ 5
GET /api/ana-ri/runs?mine=live          the caller's live runs, any conversation (the "Working" marker, D-3 copy)
GET /api/ana-ri/runs/:runId/events?after=<seq>
  → { runId, threadId, threadTitle, userMessageId, status, stoppedReason, round,
      runPolicy, hold: { reason, next } | null, plan: PlanStep[] | null,
      startedAt, detachedAt, unattendedStopsAt, lastBeatAt, releasedAt, serverNow,
      highWater, events: TimelineEvent[] (seq > after, ≤ 200),
      controls: TimelineControl[] | null,
      sealed: { recordId, assistantMessageId } | null,
      approval: <sign-off envelope> | null, canControl: boolean }
```

**Access (D-1, decided: (b)).** Live reads are for **the asker and the organisation's admins and owners only**, until project access control exists.
- The first draft's rule, "anyone who may read the thread", would have meant the whole organisation, because thread transcripts are organisation-readable (`threads.ts:188-210`; `turn-records.ts:97-100`).
- The sealed Summary keeps decision 6's rule. That decision is the first design's, and it is unchanged here.

The rule lives in one function, `runReadAccess(req, runId)`, used by all three routes:
1. The organisation comes from `resolveOrgId(req)`, the resolver `beginRun` and the control route use (`stream.ts:3632-3637`). With none, 404.
2. `SELECT … FROM ana_runs WHERE id = $1 AND organization_id = $2`: the organisation is **in the SQL**, as in `applyControl` (`run-control.ts:454-460`). No row, 404. The events query repeats the predicate.
3. Allowed: `user_id` equals the caller, or `readsEveryRecord` is true (`turn-records.ts:65-69`). A row with `user_id IS NULL` is admin-only, mirroring `run-control.ts:464-472`.
4. Anyone else gets **403**, with "You don't have access to this conversation's live progress." This is the reviewers' "You don't have access to this conversation", qualified; see §11 U-15.

`readsEveryRecord` moves to `server/routes/ana-ri/record-access.ts`, and `turn-records.ts` imports it, so there is one rule.

**What the payload carries, built by allow-list:**
- `plan` is computed from the mirror's `task` events by the shared `taskChanges`/`TaskIds` (`shared/ana/plan-diff.ts`), the same code the live client uses. It is not a second store.
- `hold` and `runPolicy` come from the new columns.
- `controls` come through `controlsOf`, exported from `server/services/ana/turn-summary.ts:57-71`, without who took them.
- `approval`, for the **asker only**: the envelope rebuilt by `buildHumanConfirmationRequiredResult(pending.command, pending.params, pending.tier)`, which is what the `approval_required` frame carries (`stream.ts:2300-2312`), plus `runId` and `toolUseId`. For an admin it is null, because admins never approve (P-A).
- `canControl`: true for the asker; for an admin, true for cancel only.

**Never in the payload:** `owner_instance`, `pending_interjections`, `approval_decision`, `byUserId`, `organization_id`, `user_id`, `surface`, tool names, and any tool-use id other than the asker's pending approval.

**Reaper.** Each route runs `reapOrphanedRuns`, rate-limited (§2.4), before reading.

**Watched stamp.** The events route stamps `last_watched_at` when the caller is the asker and the request carries `visible=1`, at most once per 5 s per run.

---

## 4. Rejoin

### 4.1 Poll, not SSE resume

**Chosen: a poll with `after=seq`** every 2 s while the page is visible, paused while hidden, plus one immediate poll on `visibilitychange → visible`.

**Rejected: SSE resume.** A resumed stream lands on any instance, and only the owner produces events. A non-owner would have to tail the table, which is a poll in disguise, or fan out a per-run NOTIFY. A NOTIFY payload is capped at 8,000 bytes, and that path would need its own failure handling and tests while delivering the same rows. That is two delivery paths for one stream.

**Cost.** One primary-key range read, one run-row read and at most one watched stamp per watching page every 2 s. A long-poll that waits on the existing NOTIFY wake is a later optimisation behind the same route.

### 4.2 How a device attaches

| Situation | What happens |
|---|---|
| The originating page, connected | Keeps its SSE stream. Events carry `seq`. |
| The originating page, socket gone (a fetch error, a phone unlock, the idle timer) | With a `runId` for a detachable turn, the client **goes straight to following** from its last `seq`. It never marks the turn interrupted or shows "AnA stopped responding". On a `didTimeout` (`useAnaChat.ts:1056-1063`) for a detachable turn, the timeout branch (`:1908-1932`) is skipped and following begins. |
| A reload, or another device of the asker | `loadThread` also calls `GET /runs?thread_id=`. Each run is attached after its `userMessageId` message as a followed turn. |
| Two sources at once | Events merge by `seq`, so a duplicate is dropped. A duplicate rejoin is harmless by construction. |
| Following | The client sets `isStreaming` and `runStatus` from the poll's `status` and `hold`, so every control and phase line works as for a live turn. |
| The composer, for the asker | Steers the followed run, through `interject`, as today. |
| The composer, for an admin following | Disabled, with "Only the person who asked can steer AnA." |
| A send that races a live run | Gets `RUN_IN_PROGRESS` (§2.8) and follows that run. |

### 4.3 Hand-over to the sealed record

**Ordering guarantee.** The reader reads the events first, then whether a record exists. The writer commits the record before it releases the rows (§3.4). So a reader never sees "no rows and no record" for a run that sealed.

- **Terminal, with `sealed`.** The client stops polling, aborts any live SSE reader it still holds, and refetches the thread messages. The assistant message exists, because it is written before the record (`post-processing.ts:578-606`). The client then opens `GET /turn-records/:recordId/summary` (`turn-records.ts:216-227`). The rows are the same events.
- **Terminal, no `sealed`, `released_at` null.** The owner is still trying. The client keeps polling for up to 30 s from the terminal status, showing "Recording…".
- **Terminal, no `sealed`, and either `released_at` set or 30 s passed.** The closing row is built from:
  - the run's reason (§2.10);
  - the line "The steps up to here were saved as they ran. This turn was not recorded.";
  - the mirrored rows;
  - the footer "Not recorded".
- **`confirmRecordByRun` is deleted.** It lived at `anaTurnTimeline.ts:81-100` and is folded into this poll. "What became of run X" has one path.

---

## 5. The client

### 5.1 Lines

Every line comes from a table in `anaWorkModel.ts` or `turnSummaryRows.ts`. None is model-written. There is no exclamation, no reassurance, and no estimate.

| State | Asker | Admin following |
|---|---|---|
| Followed, running | The live turn (rows, Summary button, plan rail), with the phase line "Working · step 7 · 4m" (step = count of announced steps; time from `startedAt` against `serverNow`). No live prose. | Same, with Stop only |
| Unwatched elsewhere | The conversation-list marker "Working · stops by 14:31 if nobody opens it" | — |
| Manual hold | The existing hold with "Run this step" and "Do this instead", from `hold.next` | "Waiting for the person who asked." |
| Approval waiting | The sign-off opens from `approval` (`GovernedActionSignoff`) | "Waiting for the person who asked to approve a step." |
| The reader's own network failing | "Can't reach the server. Retrying." Backoff 2, 4, 8 … 30 s. The last known state stays on screen. | Same |
| Owner heartbeat stale (more than 60 s, four missed beats, by `lastBeatAt` against `serverNow`) | "AnA hasn't reported for 2 min. The server handling this turn may have stopped." with **Stop** | Same, with Stop |
| Stop sent, not yet confirmed | "Stop not confirmed. Retrying." The turn stays as it is. | Same |
| Stopped | Shown only once the server confirms: the poll's terminal status, or the cancel's 200 or 409 | Same |
| Ended | §4.3 | Same |
| A gap, or the cap | §3.5, §3.6 | Same |
| The run routes answer 403 | "You don't have access to this conversation's live progress." | — |

**The Working marker.** Rows in `client/src/concept2cure/v2/surfaces/projectThreads.ts`, and the conversation list that reads it, show "Working" from `GET /runs?mine=live` (DT3). The `RUN_LIMIT` refusal links to that filtered list.

### 5.2 Stop on a flaky network

`stop()` gains `abortIntent: 'stop' | 'leave'`.
- **Today's behaviour.** Stop aborts the reader even after a failed cancel (`useAnaChat.ts:762-771`). For a detachable turn that would mean the page says Stopped while the server goes on.
- **Under detach,** for a detachable turn with intent `'stop'`, a failed cancel **does not abort**. The client keeps following, retries the cancel with backoff, and shows "Stop not confirmed. Retrying."
- **Stopped is shown** only on a confirming 200 or 409, or on a polled terminal status.
- **Intent `'leave'`** (unmount, switching conversation) never cancels and never shows Stopped.
- **Non-detachable turns** keep today's behaviour.

### 5.3 Stop lines

`STOP_LINES` (`anaWorkModel.ts:42-55`) is the one table. It gains the reasons in §2.10:
- `unattended_limit`
- `session_ended`
- `server_shutdown`
- `orphaned`
- `error`
- the admin-cancel variant of `cancelled`.

The run-row reasons join `TurnStoppedReason` (`run-status.ts:89`) so they can be written onto an answer.

`isContinuable` (`anaWorkModel.ts:218-232`) adds `unattended_limit`, `session_ended`, `server_shutdown` and `orphaned`, with a test for each. A `cancelled` by anyone stays not continuable, because it was a decision.

**The closing row** adds "{n} step(s) were not authorised and did not run." when n ≥ 1 (§2.7).

### 5.4 The phone-lock case

1. The phone locks. The socket drops within seconds to minutes. The server detaches; nothing stops.
2. With nobody watching, the unattended clock starts (§2.6).
3. On unlock, `visible` triggers one poll from the last `seq`. If the SSE reader is alive, frames and rows merge by `seq`. If it errored, or the idle timer fired, following continues. "AnA stopped responding" is never shown for a detachable turn.
4. The page then watches again, and the unattended clock resets.
5. A turn that finished while the phone was locked hands over (§4.3). A turn that ended at the limit says so.

### 5.5 Notifications (D-5: in-app only)

**When.** A detached run is **unwatched** and either:
- it starts waiting on an approval: severity `warning`, title "AnA is waiting for your approval"; or
- it ends: title "AnA finished your request" or "AnA stopped: {stop line}", plus "{n} step(s) were not authorised and did not run." when n ≥ 1.

**How.** One `createNotification` (`server/services/notifications/notification-service.ts:61-100`) to the asker. Category `ana_turn`, and `actionUrl` = the conversation.

**The body names the conversation:** the thread title when it has one, otherwise the start time and the first 60 characters of the question, for example "14:02 · Find every stability report in…". The question is the asker's own words, and the asker is the only recipient.

> **Superseded 2026-10-22 (DT3 review, DP-84; §12.6).** The body never copies the question's words into the notification store: it is the conversation's title, or "Your conversation started at 14:02 UTC". The notice expires after 30 days (`ANA_TURN_NOTICE_TTL_MS`), and `ana_turn` is written by the platform only: neither `POST /api/mdx/notifications` nor AnA's `fire_notification` may mint it.

**Where it is read.** `TaskTray.tsx` (`:104-107`, `:344-352`). Today its rows show a title and body and a mark-read button, and they do not navigate. DT4 makes a row with an `action_url` a link that marks the notification read and navigates to it.

**What it is not.** It is not push. A locked phone shows nothing until the product is opened. Push for approvals is a later founder option (§10).

### 5.6 Approvals decided elsewhere

- **Before the signing step,** `GovernedActionSignoff` checks the run's poll state.
- **The dialog closes** when the poll shows the approval is no longer pending.
- **`NO_PENDING_APPROVAL` (404) and `STALE_APPROVAL` (409)** from `utility.ts:100-121` render "Already decided on another device." **only when** the poll confirms the approval was decided or the run moved on. Otherwise they render today's error.

---

## 6. Multi-instance deployment

The API runs as several tasks behind a load balancer with no sticky routing (`LAUNCH_DEFINITION_OF_DONE.md:187-192`; `run-control.ts:5-10`).

| Request or work | Where | Mechanism |
|---|---|---|
| `POST /stream` | Any instance; it becomes the owner | `owner_instance` |
| Control, admin cancel, approval decision, session-end stop | Any instance | A row write, then NOTIFY to the owner (poll fallback 2 s) |
| `GET /runs…` | Any instance | Database reads, plus the watched stamp |
| Mirror writes, heartbeat | The owner only | `owner_instance` in SQL |
| Reaper, mirror release and expiry | Any instance | Estate-wide, through the door functions |

A request on a non-owner never needs the owner. The cross-instance test (`server/services/ana/__tests__/run-control-cross-instance.dbtest.ts`, real Postgres, `app_service`, RLS on) gains the cases in DT1 and DT3.

---

## 7. Failure modes

| Failure | What happens | What the person sees |
|---|---|---|
| Owner crash (OOM, SIGKILL) | Heartbeats stop. After 5 min the reaper marks the run `failed`/`orphaned`. Mirror rows remain until expiry (§3.3). | "AnA hasn't reported for n min…" with Stop, then "Stopped: the server handling this turn stopped responding. The steps up to here were saved as they ran. This turn was not recorded." with Continue |
| Deploy (SIGTERM) | Before the HTTP drain, shutdown writes `failed`/`server_shutdown` for each owned live run, in its tenant scope, and aborts each with `RunStopped('server_shutdown')`. Turns unwind within the existing 10 s drain (`shutdown.ts:41-53`). A turn that was about to finish records `stopped`/`server_shutdown` to match the row (DT3 test 14). | "Stopped: the server restarted for an update." Recorded when the window allowed. Continue. |
| Partition: the owner loses the database | Heartbeats fail. After 5 min the reaper marks it `orphaned` and notifies. The owner learns this by NOTIFY, by the poll fallback, or at its next checkpoint, then aborts with `orphaned`. Its record says `stopped`/`orphaned`. | As for a crash |
| Partition: the reader loses the server | "Can't reach the server. Retrying." | No false "stopped" |
| Duplicate rejoin | Reads merge by `seq`. A second Stop gets 409, read as stopped. A second approval gets 409 or 404. After P-A it shows "Already decided on another device." once the poll confirms (§5.6). | — |
| Two sends in one thread; a fourth live run | `RUN_IN_PROGRESS` / `RUN_LIMIT`, before the question is saved | §2.8 |
| The session or organisation ends | `session_ended` (§2.9) | §2.10 |
| A mirror write fails | Gap marked; the run continues | The gap line |
| The record write fails | Rows stay; `released_at` is set | "Not recorded" with the saved rows |
| A hung tool, nobody watching | Closing-answer grace, then abort (§2.6) | "Stopped: nobody was watching for 15 minutes." |
| Writes to a dead socket | Discarded. DT3 test 6 proves no `error` event and no unhandled error. Until then the design does not assert it. | — |

---

## 8. Slices

Each slice runs red first, and files `docs/evidence/ANA-SUMMARY/<date>/DT<n>-<name>/` with the red output, the green output and the browser captures named below.

**Prerequisite P-A** (approval authority, §2.7) landed in 8a3c1a4f5.

### DT1: the event mirror, its door and its reads (nothing on screen changes)

**Files:**
- `migrations/<date>_ana_run_events.sql`: the table, indexes, guard trigger, `ana_run_events_purger` role and the three door functions, with the header.
- `scripts/db/migration-set.mjs`: the entry above `:3100`, with a note.
- `db/migrations/20260917_ana_runs.sql`: the six columns (§3.1), with a dated note.
- `server/services/tenant/tenant-offboarding.ts`: a `PURGE_DOORS` entry (`:563-578`).
- New `server/services/ana/run-events.ts`: the queue, the scoped flush, `close()`, the cap and the release.
- `turn-timeline-emitter.ts`: the third sink and the marker.
- `shared/ana/turn-timeline.ts`: the marker type.
- `server/services/ana/run-control.ts`:
  - the process heartbeat, with `owner_instance`;
  - the reaper's notify, release and expiry passes.
- `stream.ts`:
  - the keepalive no longer beats the run;
  - `run_policy` is written at insert;
  - post-processing awaits `mirror.close()`, seals, releases, and writes `released_at`.
- New `server/routes/ana-ri/runs.ts` and `record-access.ts`.
- `turn-summary.ts`: export `controlsOf`.

**Tests that must fail first:**
1. **Mirror equals record.** With a stand-in model, the mirror rows equal the sealed `record.timeline` (notes resolved) until the release, and none remain after it. *Red today:* no table.
2. **Guard** (pglite):
   - UPDATE and TRUNCATE are refused;
   - INSERT is refused after a record exists;
   - a plain DELETE as `app_service` is refused in every state;
   - each door deletes only under its own preconditions and refuses under an active legal hold.

   Each is shown green before the trigger is installed and red after.
3. **Flush before seal.** Events emitted just before the turn ends are all in the mirror before the record is inserted. A failing `close()` marks the gap and the record is still sealed. *Red without the await:* the trigger refuses the last batch.
4. **Owner only.** A batch, or a heartbeat, from another `owner_instance` changes zero rows.
5. **Cap.** 2,050 events produce rows 1–1,999 plus the marker. A row at 2001 is refused. The record holds all 2,050.
6. **Gap.** A dropped batch shows in `events` and `highWater`.
7. **Heartbeat without a socket.** `heartbeat_at` advances 15 s after the response emits `close` (fake timers). *Red today:* `stream.ts:826-831`.
8. **Scope with RLS on** (`test:db`, `app_service`, `RLS_ENFORCE=on`). A flush armed inside tenant A's turn, then fired after a tenant B request created the timer context, writes A's rows. The heartbeat writes both tenants' runs. *Red:* the flush without its explicit scope writes zero rows and logs nothing.
9. **Access** (pglite route test):
   - asker 200;
   - admin 200, with `approval: null` and cancel-only `canControl`;
   - a colleague who can read the transcript 403 with the sentence;
   - another organisation 404;
   - a `user_id IS NULL` run 403 for a member.

   Shown red against a handler that filters the organisation in JS, with RLS off.
10. **Leak.** Sentinels in every excluded column appear in no payload. Shown red against `SELECT *`.
11. **Gates.** `ci:purge-coverage` (and its selftest), `ci:migration-set-order` (shown red with the entry after the sweep), `ci:migration-drop-safety` and `ci:tables-live-schema` are all green.

**Accepted when** (browser, desktop): a turn runs as today. `/runs/:runId/events` returns its rows while it runs, captured as JSON. They are gone after the record is filed. Nothing on screen changes.

### DT2: a phone follows a desktop turn (after P-A)

**Files:**
- `useAnaChat.ts`:
  - following (the poll, the merge by `seq`, `isStreaming`/`runStatus` from the poll);
  - the hand-over;
  - the composer steering for the asker;
  - `abortIntent`;
  - the reworked `confirmTurnRecordByRun`.
- `anaTurnTimeline.ts`: `pollRun`; `confirmRecordByRun` deleted.
- `anaWorkModel.ts`: §5.1 and §5.3; `isContinuable`.
- `TurnSummary.tsx`, `turnSummaryRows.ts`: the gap, cap and not-recorded lines; the "not authorised" count.
- `AnaActivity.tsx`: the phase and staleness lines.
- `GovernedActionSignoff`: §5.6.

**Tests that must fail first:**
1. A reloaded thread whose last question has a live run renders a followed turn after that message, with the plan rail from `plan` and the phase line. *Red today:* the question stands alone.
2. Overlapping SSE frames and polled rows render once.
3. A sealed run hands over, and the rows are identical before and after.
4. The plan rail and a Manual hold ("Run this step", "Do this instead") render on a follower from `plan` and `hold`, and pressing them sends controls.
5. A failed cancel on a detachable turn shows "Stop not confirmed. Retrying." and does not abort. A later 200 shows Stopped. A 409 shows Stopped.
6. The reader's network failing and a stale owner each show their own line. Stop is offered on a stale owner.
7. With no record, "Recording…" is shown until `released_at` or 30 s, then "Not recorded".
8. `NO_PENDING_APPROVAL` confirmed by the poll shows "Already decided on another device.", and the dialog closes.
9. An admin follower has Stop only, and its composer shows "Only the person who asked can steer AnA."

**Accepted when** (browser, a phone at 390×844 following a desktop at 1280):
- Start the S4 corpus turn (`ANA_AGENT_WORK_VIEW_2026-10-08.md:466`) on desktop, in a Manual turn, and open it on the phone. The phone shows the same rows, the plan rail, and the Manual hold.
- Run this step from the phone proceeds on desktop. Stop from the phone stops desktop.
- A colleague: **a direct read of the run returns 403 with the sentence; the colleague's UI shows nothing** (amended after DT2, §12.1: the thread listing never shows a colleague's run, so the line cannot appear on their screen).
- Closing the desktop tab **still stops the turn in this slice** ("Stopped: this page lost its connection."). That is filed as the expected result.

### DT3: detach, its limits, session end and restart honesty (ships as one)

#### What already exists (CLAUDE.md Rule 3; checked against trunk `28637579e`, 2026-10-22)

DT3 was cut off at its gates on 2026-10-08 and finished on 2026-10-22, 1,472 trunk commits later. Before the build was completed, trunk was searched for every capability DT3 touches, by every name it could have (session recheck, standing, sign-out, shutdown, drain, notification, notice, inbox, open, target, stop line, watched, working, live runs, admin cancel, hold), and `git log --all --diff-filter=D` was run on the same names. What exists, what it does, and what DT3 did with it:

| Capability | Where it lives on trunk | What it does / does not do | DT3 |
|---|---|---|---|
| Session re-check | `server/socket/sessionRecheck.ts` `sessionEndReasonFor`; `server/services/token-revocation.ts` `verifyLiveToken` | Re-runs the live-token, membership and tenant checks for every open socket every 60 s. Knows nothing of HTTP SSE turns. | **Reached, not copied.** The round-boundary check (`run-control.ts runStanding`) calls `sessionEndReasonFor` and collapses every reason to `session_ended`, failing closed. |
| Ending every session | `server/services/account-standing.ts` `endEverySessionOf`; `server/routes/auth.ts` logout, reset, change | Stamps `users.sessions_ended_at`; stops no run. | **Extended**: each calls `stopPersonsRuns`. Also SCIM (every deprovisioning path, including `DELETE /Users/:id` and a shared account's membership removal) and member removal (`server/routes/tenant-users.ts`). |
| The request's DB client | `server/middleware/establishRequestTenantScope.ts` `attachLazyClient`; `server/db/requestDb.ts` `requestPgClient` (since `14362ef00` every tool, the round's titles and context assembly read through it) | Released on the response's `close`, so a detached turn's next round had no client. | **Fixed in place**: the release is a lease (`server/db/requestDbLease.ts`); the stream holds the request's own pinned connection until the turn and its post-processing end. One connection, the same tenant session variables; no second client, no fallback to the shared pool. |
| Shutdown drain | `server/startup/shutdown.ts` (HTTP drain 10 s, `drainActionQueue` 10 s, listener, pool) | Drains connections; ends no AnA run. | **Extended**: `settleOwnedRunsForShutdown` before the drain; `shutdown-hold.ts` lets the drain wait for the turns' own recording in the same 10 s window. |
| Notifications and opening one | `server/services/notifications/notification-service.ts` `createNotification`; `shared/constants/notifications.ts` (categories, labels); `GET /api/mdx/notifications/:id/target` → `notification-record-target.ts`; client `NotificationOpenButton.tsx` → `notificationNavigation.ts openNotificationRecord`; `TaskTray.tsx` | One server-verified door opens every notice's record; categories can be muted. Had no conversation target and no `ana_turn` category. | **Converged**: `ana_turn` is a canonical category; the notice names `chat_thread`/thread id as its record; the resolver gained `conversationTarget` (the recipient's own thread, by `chat-thread-helpers.ts threadOwnerMatches`); `openNotificationRecord` hands the thread to the shell's conversation channel. The first build's second door in `TaskTray.tsx` (`openNotice`, its CSS) is **deleted**; `TaskTray.tsx` is unchanged from trunk. Trunk's F19 rule stands: opening a notice does not mark it read. |
| Stop lines, "not authorised" | `client/src/concept2cure/v2/anaWorkModel.ts` `STOP_LINES`; `turnSummaryRows.ts notAuthorisedLine` | Client-only copy. | **Moved** to `shared/ana/stop-lines.ts`; the client re-exports it, the server's notice reads it. One table. |
| Watched stamp | `db/migrations/20260917_ana_runs.sql` `last_watched_at` (DT1); client `pollRun` `visible=1` (DT2) | Column and flag existed; nothing wrote or read them. | **Completed**: the asker's visible poll stamps it (`runs.ts`), `unattended-clock.ts` and the run read share `shared/ana/run-detach.ts unattendedDeadline`. |
| Working marker, `?mine=live` | `server/routes/ana-ri/runs.ts listRuns` (DT1); client `anaTurnTimeline.ts listThreadRuns` | The list existed with no caller. | **Reached** through one reader (`readListedRuns`, `projectThreads.ts useWorkingThreads` on `useLiveData`); the first build's second reader (a raw `fetch`) is deleted. |
| Admin cancel | `runs.ts controlScope` (DT1); `record-access.ts readsEveryRecord` (reads the database-current role, `middleware/auth.ts applyOrganizationRole`) | The cancel scope was advertised and refused. | **Completed** in `applyControl`, with `byRole` in `control_events` and an audit row whose outcome (`persisted` and `chained`) the response carries. |
| Hold payload | `ana_runs.hold` (DT1) | Never written. | **Completed** by `holdForPerson(pool, runId, next)`. |

Deleted names found (`git log --all --diff-filter=D`): `server/routes/agent-swarm.ts` (replaced by `run_agent`), `server/routes/notification_routes.ts`, the old `useNotifications`/`NotificationsBell` and `useProjectNotifications`. DT3 revives none of them; none matched session recheck, run notice, unattended, shutdown hold, stop lines, run detach or the Working marker.

**Files:**
- `run-status.ts`: `detachable()`; the new reasons in `RunStoppedReason`/`TurnStoppedReason`; the unattended directive.
- `stream.ts`:
  - **thread verification before `beginRun`**, and the write-back of `thread_id` and `user_message_id` (`:852-858`, `:1103-1131`);
  - the detach branch (no `runSettled`; `:901-929`);
  - the unattended clock and grace;
  - the round-boundary session and organisation re-check;
  - deletion of the dead `writableEnded` checks;
  - `runSignal.reason` in the error path;
  - the `RUN_IN_PROGRESS` and `RUN_LIMIT` frames.
- `run-hold.ts`: `clientGone`, `stopForDisconnect` and `'disconnected'` removed (`:88-90, 205-207`); `leave` (`:272`).
- `turn-run-policy.ts`: the unattended directive; `'disconnected'` kept only for non-detachable turns.
- `run-control.ts`:
  - `RunStopped`;
  - `driveLocalRun` on `failed`;
  - `beginRun`'s transaction and locks;
  - `stopRunsFor`;
  - admin cancel in `applyControl`;
  - `stopRunInternally` accepting `server_shutdown` and `session_ended`;
  - `ownedLiveRuns`;
  - `hold` and `last_watched_at` writes.
- Session hooks: `server/routes/auth.ts:1344-1378` (logout), `account-standing.ts:206` (`endEverySessionOf`), the `password_changed_at` writer, the organisation-status writer, and `tenant-offboarding.ts:127, 789`.
- `server/startup/shutdown.ts`: `settleOwnedRunsForShutdown` before `:41`.
- Client:
  - `useAnaChat.ts`: detachable socket loss, idle timeout, unmount and abandon all go to following (`:778-819, 1056-1063, 1903-1975`);
  - `projectThreads.ts` and the conversation list: the Working marker from `?mine=live`;
  - the `RUN_LIMIT` link.
- Updated, not deleted:
  - `server/routes/ana-ri/__tests__/stream-disconnect.test.ts:253-290` becomes "detaches a durable run; stops a local-only, unowned or drive-requested one";
  - `stream-run-hold.test.ts` and `run-hold.test.ts` lose the `clientGone` cases.

**Tests that must fail first:**
1. **Detach, finished, and stays finished.** A durable, owned turn without drive, whose response emits `close` at round 1, runs every round. It reaches `endRun`, its row is `finished`, and the record is `answered`. A reaper run 6 minutes later (fake clock, heartbeat alive) leaves it `finished`. *Red today:* `cancelled`/`client_disconnected`. A variant that only removes `noteDisconnected` but keeps `runSettled = true` leaves the row `running` and is reaped `orphaned`.
2. **Still stops.** Local-only, `user_id` null, and `live_drive: true` turns each stop with `client_disconnected`.
3. **Close during context assembly.** A socket closed before `driveStatePromise` resolves (`:967-1354`) on a request without `live_drive` detaches. One with `live_drive: true` stops.
4. **A new conversation.** A first message in a new chat produces a run whose `thread_id` and `user_message_id` are the minted thread and question. A second device's `/runs?thread_id=` finds it. *Red today:* `thread_id` stays null.
5. **Forged thread.** A client-sent thread id belonging to a colleague or another organisation is refused before any run row is written.
6. **Dead socket.** 50 frames written to a destroyed response produce no `error` event and no unhandled error.
7. **One per thread, three per person.**
   - Two racing posts in one thread produce one run.
   - A fourth live run for one person gets `RUN_LIMIT`.
   - Neither refusal saves a question.
   - Run against pglite with two connections, and against `test:db` with RLS on.
8. **A reaped owner stops.** A row set `failed`/`orphaned` by another writer aborts the owner within one poll interval, and the record says `stopped`/`orphaned`. *Red today:* `run-control.ts:181-188` and `run-hold.ts:272`.
9. **The abort reason** is an `Error` named `AbortError`. With a stand-in provider, a stop mid-call and a stop while queued for a permit each yield `GatewayAbortedError` and no fallback attempt. A Manual `endHeldRun` (`finished`) does not abort the closing answer.
10. **Unattended limit** (fake timers):
    - an unwatched run ends `unattended_limit` at 15 minutes with a closing answer;
    - a hung tool is aborted after the grace;
    - a watch at 10 minutes resets the clock;
    - 40 minutes from start ends `budget_exhausted` whatever the watching;
    - the record's warning names the armed limits.
11. **Session end.**
    - Logout, `endEverySessionOf`, a password change, an organisation set to `suspended`, `requestDeletion`, and `purgeTenant` each stop the person's or organisation's live runs with `session_ended`, and `purgeTenant` does so before any table.
    - A run whose token is revoked by another path stops at the next round boundary.
    - A standing read that throws stops it too (fail closed).
12. **Admin cancel.** An admin cancels a colleague's run: the control event carries the admin and `byRole`, and the audit row exists. An admin pause, steer or approve is refused. Another organisation's admin gets 404.
13. **Holds unattended** are regression guards in the detached state: Manual `hold_expired`; approval with no policy denied with the turn continuing; Auto `approval_timeout`.
14. **Drain.** A turn finishing during the 10 s shutdown drain records `stopped`/`server_shutdown` to match the row's `failed`/`server_shutdown`, never `answered`. A turn that cannot finish leaves the row terminal and its rows kept. `stopRunInternally(…,'server_shutdown')` writes `failed`. *Red today:* it writes `cancelled` for every reason (`run-control.ts:664-671`), while the reaper writes `failed` (`:752-755`).
15. **Cross-instance** (`run-control-cross-instance.dbtest.ts`):
    - a cancel on B aborts a detached run on A;
    - B's reaper notifies A, and A aborts;
    - a `stopRunsFor` on B aborts A's run.

**Accepted when** (browser, a phone at 390×844 and a desktop):
- **Phone lock.** Start the S4 corpus turn on the phone and lock it for 3 minutes. On unlock, the steps taken meanwhile are there, the turn carries on or has finished, and there is no "lost connection" or "stopped responding" line.
- **New chat.** Start a new conversation on the phone and lock it. The desktop's conversation list shows Working, and opening it follows the turn.
- **Close the tab** on desktop, then reopen: following, or the Summary.
- **Unwatched for 15 minutes:** "Stopped: nobody was watching for 15 minutes."
- **Sign out** on desktop while the phone's turn runs: it stops with the session line.
- **Approval, expected failure.** A Manual turn holding for an approval with the page closed past 10 minutes reopens to "Stopped: an approval was not answered." That is filed as the expected failure (decided).
- **A Live Drive turn** still stops on close.
- **Staging redeploy** mid-turn: "Stopped: the server restarted for an update." Evidence: the ECS stop, and the record or its absence.
- **Local two instances, `kill -9` the owner:** the staleness line with Stop, then the orphaned line after 5 minutes.

### DT4: the in-app notification

**Files:**
- `stream.ts`: on an approval or at the end, when unwatched, `void createNotification(…)` with the §5.5 copy.
- `TaskTray.tsx`: a row with an `action_url` navigates and marks itself read (`:344-352`).
- `anaWorkModel.ts`: the titles.

**Tests that must fail first:**
1. An unwatched detached run that ends creates one notification for the asker, whose body names the conversation. A watched run creates none.
2. An approval while unwatched creates one `warning`, with no parameters and no ids.
3. A TaskTray row with an `action_url` navigates there and is marked read. *Red today:* rows do not navigate.

**Accepted when** (browser): close the page mid-turn and leave it unwatched. Reopening the product shows the notification in TaskTray, naming the conversation, and clicking it opens the conversation.

---

## 9. Decisions (taken)

| # | Decision | Taken |
|---|---|---|
| D-1 | Who may watch a live turn | **(b)**: the asker, and the organisation's admins and owners, until project access control exists (§3.7). The sealed Summary keeps decision 6's rule. |
| D-2 | The ceiling for unwatched work | 15 minutes of **unwatched** time (`AUTO_ACTIVE_MS`), capped at 40 minutes from start (`AUTO_WALL_MS`), with a closing-answer grace of 2 minutes before a hard abort (§2.6). No tenant spend bound exists, and none is invented. |
| D-3 | A per-person live-run limit | **At most 3** live runs per (organisation, person), counted in `beginRun`'s locked transaction. It is mandatory (§2.8). |
| D-4 | Retention of mirror rows for runs without a record | A governed, legal-hold-aware expiry door (§3.2, §3.3). **Recommended 90 days; the period is the founder's call.** `ana_runs` has no retention job, and that is noted for the retention schedule. |
| D-5 | Notifications | **In-app only**, through TaskTray, keyed on unwatched (§5.5). |
| D-6 | *(removed)* Who may decide a held step | Not a decision: prerequisite **P-A**, asker only, 403 for others, no admin approval, fixed separately (§2.7). |
| D-7 | Live Drive turns | **Decided 2026-10-22** (coordinator, under the founder's delegation), replacing "they keep stopping on disconnect": **a Live Drive turn detaches like any other when its page closes.** From that moment AnA stops driving the screen: any further screen action (`navigate_to`, `act_on_screen`, `start_product_demo`; `run-status.ts SCREEN_ACTION_TOOLS`) is refused before it runs, never queued as a chip and never applied to a page that is gone, and it is listed as a step that did not run with the line "Not run: the page was closed, so AnA stopped driving the screen." (`shared/ana/stop-lines.ts SCREEN_GONE_LINE`). The rest of the turn's work continues. **Why:** Live Drive has been on by default since `9db931c56` (2026-09-22), so every default turn sends `live_drive: true`, and the old rule meant no default turn ever detached (§12.5): DT3 was real only for the few who switched Live Drive off. The old rule's reason — "its work is a screen that is gone" — is true of the screen moves only, not of the reading, drafting and approvals a driven turn also does; refusing the moves and keeping the rest gives the person the turn they asked for without a single move landing on a page nobody is looking at. Was: "They keep stopping on disconnect" (§2.1, superseded). |

---

## 10. Risks, later options and out of scope

**Risks**
- **Load.** About 60 mirror inserts per turn in batches; one heartbeat statement per process every 15 s; a 2 s poll and a watched stamp (at most one every 5 s) per watching page. All are indexed.
- **A dark period of up to 5 minutes** after a crash. The staleness line and Stop make it honest; they do not shorten it.
- **Sign-out on one device stops the person's turns on every device.** That is conservative by design (§2.9).
- **A long round between session re-checks.** The immediate hooks cover the named paths, and the round boundary covers the rest. A missed hook costs at most one round plus the unattended limit.
- **Clock skew** between instances orders controls by their own `at`, as in S4. Every time is server UTC.

**Later options**
- Push notifications for approvals (founder option, D-5).
- A long-poll on NOTIFY.
- Project access control, which would let D-1 widen.
- A tenant token budget in the gateway.
- Retention for `ana_runs`.

**Out of scope**
- a worker (P-10);
- moving a run between instances, or surviving a deploy;
- SSE resume;
- email;
- sub-agents (ADR-0015);
- any change to round budgets or `MAX_PAUSE_MS`.

---

## 11. Critique response

**How the reviews ran.**
- **First draft.** In the second draft, this section recorded two passes run in the authoring session, because no agent-spawning tool was available there. They were not independent.
- **Second draft** (`c33211ee2`). It was reviewed by two **independent** reviewers, one for governance and security and one for product and UX, run by the coordinator.
  - Both found the design's direction sound.
  - Both returned blocking findings: governance five HIGH, product several that change the client contract. They are below, with how each was handled.
  - The coordinator took decisions D-1, D-2, D-3, D-5 and D-7, and the approval fix (P-A), at the same time.

**Key:** A = accepted; P = partly accepted. No finding was rejected.

### Governance and security (independent)

| # | Finding | Verdict | Handled |
|---|---|---|---|
| G-1 | HIGH. Approval authority: `run-control.ts:1064-1116` and `utility.ts:75-123` never compare `ana_runs.user_id` with the decider. | A | D-6 removed. This is prerequisite P-A, fixed separately as asker only, 403, no admin approval. Not yet in this checkout at `c33211ee2`; DT2 waits for it (§2.7). Admin approval is excluded from the payload (§3.7) and from admin control (§2.5). |
| G-2 | HIGH. The unverified `thread_id`: a new chat's run has a null thread forever and escapes the per-thread rule. The per-person cap is mandatory. | A | Verification moves before the run lock, `thread_id` is written back with `user_message_id`, and there is one locked transaction with per-person and per-thread locks (§2.8). DT3 tests 4, 5 and 7. |
| G-3 | HIGH. `runSettled = true` is set first (`stream.ts:902`), so a detached run never calls `endRun` and is reaped. | A | The detach branch returns before it (§2.1). DT3 test 1 asserts `finished` and still `finished` after a reaper pass, and names the variant that is red. |
| G-4 | HIGH. `detachable()` depends on `driveState`, which resolves late. | A | It keys on the request's `live_drive` flag, which is known at parse and never wrong in the unsafe direction (§2.1). DT3 test 3 closes the socket during context assembly. |
| G-5 | HIGH. A detached run outlives the session. Stop on logout, revocation, password change, deactivation, and suspension or deletion; re-check per round; admin cancel; the purge cancels first. | A | §2.9: immediate hooks, plus a per-round `verifyLiveToken(…, {activity:false})` and `shouldProcessTenantInBackground`, failing closed. Admin cancel with a control event and audit row (§2.5). `purgeTenant` stops runs first. DT3 tests 11 and 12. |
| G-6 | Flush and await the mirror before sealing; mark the gap on failure and seal anyway. | A | §3.4. DT1 test 3. |
| G-7 | The DELETE door needs a purger role or SECURITY DEFINER functions with status and legal-hold checks; drop the "same guarantee" claim. | A | The `ana_run_events_purger` role and three door functions with preconditions inside. The purge goes through `PURGE_DOORS`. The claim is removed (§3.2). DT1 test 2. |
| G-8 | Define retention and a governed, legal-hold-aware delete for the events of orphaned runs. | A | `expire_orphaned_run_events`; 90 days recommended; the founder's call (§3.3, D-4). |
| G-9 | The heartbeat needs `owner_instance`; the flush must run in the run's tenant scope; test with RLS on. | A | §2.3, §3.4. DT1 tests 4 and 8 (`test:db`, RLS on). |
| G-10 | Thread readers are the whole organisation. Say so; apply project access, or choose D-1(b). | A | Stated. D-1 decided (b), asker plus admins (§3.7). |
| G-11 | `abort(reason)` changes `signal.reason`; verify the gateway and failover; the owner's own terminal write must not abort its post-processing. | A | Verified: `concurrency.ts:24, 38, 60` rethrows `signal.reason`, and `gateway.ts:1966-1986` maps any error on an aborted signal to `GatewayAbortedError`. The reason is an `Error` named `AbortError`, never a string. Only `cancelled`/`failed` abort, never `finished` (`endHeldRun`); `endRun` releases without driving; post-processing runs after release (§2.4). DT3 test 9. |
| G-12 | State that no tenant spend bound exists; the ceiling is 15 min `AUTO_ACTIVE_MS` with a 40 min cap and a closing grace. | A | §2.6, D-2, with the unwatched keying from U-4. |
| G-13 | State that `ana_runs` has no retention job. | A | §1 row 15, §3.3. |
| G-14 | Test that a turn finishing in the drain records stopped/shutdown to match the row. | A | DT3 test 14. A distinct `server_shutdown` reason follows from U-10. |
| G-15 | Line-reference drift (3100, 3117). | A | Corrected (§3.1). |

### Product and UX (independent)

| # | Finding | Verdict | Handled |
|---|---|---|---|
| U-1 | A follower sees only timeline events; add `runPolicy`, `hold`, a plan snapshot and a phase line, with no prose. DT2 acceptance should cover the plan rail and Manual hold. | A | `run_policy` and `hold` columns; `plan` from task events through the shared plan-diff; "Working · step 7 · 4m" (§3.7, §5.1). DT2 test 4 and acceptance. |
| U-3 | Stop on a flaky network: don't abort, retry, show "Stop not confirmed. Retrying."; add `abortIntent`; fix §1 row 12. | A | §5.2. Row 12 now cites the abort after a failed cancel (`useAnaChat.ts:762-771`). DT2 test 5. |
| U-4 | Separate watched from detached (`last_watched_at`); key the ceiling and notifications on unwatched. | A | §2.2, §2.6, §5.5. |
| U-5 | An approval while nobody watches: keep 10 min; file it as the expected failure; say "1 step was not authorised and did not run"; push is later. | A | §2.7, §5.3, §5.5. DT3 acceptance. §10. |
| U-6 | A "Working" marker on conversation rows from `?mine=live`, in DT3; D-3 copy links to it; at most 3. | A | §3.7, §5.1, D-3. |
| U-7 | Notifications are read in TaskTray, not the dock; rows must navigate; the body must name the conversation. | A | §0, §5.5, DT4 test 3. The first draft's "the AnA dock" claim is corrected. |
| U-8 | The composer steers the followed run for the asker; it is disabled only for those who can't steer, with correct copy; following sets `isStreaming` and `runStatus`. | A | §4.2. DT2 test 9. |
| U-9 | A distinct reason and line for the ceiling; the armed limit written into the record; "Stops at…" once unwatched. | A | `unattended_limit` (§2.6, §2.10); the record warning (§2.1); "stops by 14:31 if nobody opens it" (§5.1). |
| U-10 | Cause-neutral orphaned copy; "restarted for an update" only on the shutdown path; reworded sealed-record sentence; `orphaned` continuable. | A | `orphaned` vs `server_shutdown` (§2.10); "This turn was not recorded." (§4.3); `isContinuable` (§5.3). |
| U-11 | Two staleness lines (the reader's network vs a stale owner); offer Stop when the owner is stale. | A | §5.1, DT2 test 6. |
| U-12 | `released_at`; poll up to about 30 s before "Not recorded". | A | §3.1, §4.3, DT2 test 7. |
| U-13 | `NO_PENDING_APPROVAL`/`STALE_APPROVAL` show "Already decided on another device." once the poll confirms; the dialog closes on the poll; check run state before signing. | A | §5.6, DT2 test 8. |
| U-14 | The phone-unlock idle timer: `didTimeout` goes straight to following; the hand-over aborts the reader; no "stopped responding" flash. | A | §4.2, §4.3, §5.4. |
| U-15 | Colleague copy "You don't have access to this conversation." | P | Used, qualified to "…this conversation's live progress.", because under D-1(b) the colleague can still read the transcript (`threads.ts:188-210`), so the unqualified sentence would be false on the page that shows them the conversation. |
| U-16 | Merge DT4 into DT3; DT2 acceptance is a phone following a desktop. | A | The restart work is in DT3. Slices renumbered DT1–DT4. DT2 acceptance rewritten. |
| U-17 | One clock; ISO UTC. | A | §0 "One clock"; `serverNow` in the payload (§3.7). |

The product review numbered its findings 1 and 3–17. No finding 2 was sent, so none is recorded.

---

## 12. Implementation record

What the build found, and what it changed against the body above. The body is left as decided so the reviews in §11 still read against it.

### 12.1 DT2 findings (`202e11814`, evidence `docs/evidence/ANA-SUMMARY/2026-10-08/DT2-follow/`)

| # | Finding | Resolution |
|---|---|---|
| 1 | The colleague's 403 acceptance cannot appear in the UI. `/runs?thread_id=` lists only the caller's own runs for a member, so a colleague's client never reads the run. | DT2 acceptance amended (§8): a direct read returns 403 with the sentence; the colleague's UI shows nothing. |
| 2 | `hold` was not written before DT3, so a follower read a Manual hold as a person's pause. | DT3 writes it: `holdForPerson(pool, runId, next)` writes `{ reason: 'manual', next }` with the pause; a resume, a steer that answers it, an end and every terminal write clear it. |
| 3 | "Stopped by an administrator." had no producer: `controlsOf` drops who took a control. | DT3 writes `stopped_reason = 'admin_cancelled'` on an admin's cancel (§2.5). `admin_cancelled` is now a `RunStoppedReason` and a `TurnStoppedReason`, so the row, the record's end event, the answer and the follower all say it. |
| 4 | The clock format. | The phase line uses the shared `formatElapsed` ("4m 00s"), not "4m". The "stops by 14:31" marker uses the shared `formatClock`. *(Superseded by §12.6: the marker says the bound, the limit plus the closing grace, in UTC: "stops by 14:33 UTC".)* |
| 5 | Only a follower could show "a reload mid-turn rejoins" in DT2. | DT3: the page that started the turn rejoins it after a reload (DT3 acceptance). |

### 12.2 DT3: what was built differently from the body

- **DT4 is merged into DT3.** The notice (§5.5) ships with the detach and opens through trunk's one notification door (§12.4). The old "restart honesty" work was already in DT3.
- **One new column, `ana_runs.detached_at`** (amended in place in `db/migrations/20260917_ana_runs.sql`, dated note, RULE 1). The follower payload's `detachedAt` and `unattendedStopsAt`, and the `?mine=live` marker, need it; the six DT1 columns could not express when the page closed.
- **When the unattended limit falls** is one shared function, `shared/ana/run-detach.ts unattendedDeadline`: 15 minutes after watching stopped (the later of `detached_at` and `last_watched_at`), never later than 40 minutes from `created_at`. The owner's clock (`server/services/ana/unattended-clock.ts`) and the run read both call it, so "stops by" and the stop are the same instant. The 15 s watched window keys the notice only.
- **The 40-minute cap applies to a turn once it has detached**, whatever its policy. An attached Auto turn keeps `policyStopDirective`'s own ceilings, as before.
- **The round-boundary re-check reuses `socket/sessionRecheck.ts sessionEndReasonFor`** (zero duplication): `verifyLiveToken(token, undefined, { activity: false })`, then a live membership, then `shouldProcessTenantInBackground`. The membership check is one more than §2.9 names. The credential is held by the run's handle only (`RunHandle.standing`); a turn with no credential stops (fail closed). It runs at every round boundary of a durable turn with a person, attached or not.
- **Internal stop statuses.** `failed` for `server_shutdown`, `orphaned`, a hard `unattended_limit` stop and the hard 40-minute stop; `cancelled` for `client_disconnected` and `session_ended`. Every reason but `client_disconnected` writes the row first and aborts after, so the turn's own `endRun` cannot land between them.
- **A detached turn's notice** fires on an approval and at the end, for a person's own Stop never. Its title for a stop is the stop line ("AnA stopped: nobody was watching for 15 minutes"); its body is the conversation's title, or the start (UTC) and the first 60 characters of the question *(the question's words were dropped by the review, §12.6)*. The stop lines moved to `shared/ana/stop-lines.ts`, so the server and the client read one table.
- **Session-end hooks.** Sign-out (`POST /api/auth/logout`, for a token the server signed), `endEverySessionOf`, a password reset or change, every SCIM deprovisioning (`PUT`/`PATCH active=false` on a sole-organisation or a shared account, and `DELETE /Users/:id`; that organisation), a member removed from an organisation (`routes/tenant-users.ts`), a platform admin suspending a person or an organisation (`routes/admin/master-admin.ts`, the writer of a denying `organizations.status`), `requestDeletion`, and `purgeTenant` (before its transaction). None throws: the round-boundary check is the backstop. Not hooked, by design: SAML single logout (`routes/sso.ts` redirects to the IdP; the app's own session ends at `POST /api/auth/logout`, which is hooked) and the idle-session revocation in `middleware/auth.ts` (it ends one token; that token's own turn stops at its next round boundary, when `verifyLiveToken` refuses it, and the person's other sessions are not ended).
- **Purge ordering.** `purgeTenant` stops the organisation's runs after `assertPurgePermitted` and before its one transaction. That transaction can still refuse (`assertRegulatedContentDisposition`, `REGULATED_RETENTION_CHECK_UNAVAILABLE`, e1f3fd425): the runs are then stopped for a purge that did not happen. That is accepted: a purge is only reachable for an organisation already `pending_deletion`, whose runs `requestDeletion` stopped.
- **Shutdown** ends every owned run `failed`/`server_shutdown` before the HTTP drain, then waits for the turns to record themselves (`server/services/ana/shutdown-hold.ts`) in the same 10 s window. A detached turn has no connection, so the HTTP drain alone never waited for it.
- **The Manual hold settle** keeps failing closed when the row left the hold as `failed` or `finished` with no abort reaching the turn; a hold the run's own stop ended is filed as `stopped`, or `disconnected` only for a turn that could not detach.
- **DT3 tests 4, 5 and 7** (a new conversation's thread, a forged thread, one run per conversation and three per person) were built and shown red in DT1 with `beginRun`'s locks; DT3 does not repeat them.
- **The hand-over aborts any live reader of the run.** By construction a follower of the page's own turn starts only after its reader ended, so this is a guard, not a path a test reaches.

### 12.3 ECS stop timeout (DT3 finding)

`terraform/modules/ecs-fargate/main.tf` sets no `stopTimeout` on the API container, so Fargate's default applies: SIGKILL 30 s after SIGTERM. The ALB target group's `deregistration_delay` is 30 s (`terraform/modules/alb/main.tf:112`). In a rolling deploy the task is deregistered first, and the ALB closes its connections when the delay ends. Since DT3 those turns detach and go on rather than stop. SIGTERM then ends them as `server_shutdown`. The shutdown's own budget is: end the runs (one statement per organisation), then the HTTP drain and the turns' recording (one shared 10 s window), then the AI action queue drain (up to 10 s), then the pool. That is at most about 21 s, inside 30 s. It leaves about 9 s of margin and is not configured anywhere: a change that lengthens either drain, or a slow database, can reach SIGKILL. Recommended (not changed here; outside this slice's directory set): set `stopTimeout = 45` on the API container so the budget is explicit.

Re-checked on trunk `28637579e` (2026-10-22): `terraform/` still sets no `stopTimeout` anywhere (MR-03 Stage 1 did not add it; `docs/work-orders/MR-findings-2026-10-13.json` infra-hi-4 prescribes 60). The order is unchanged: the runs are ended first, the HTTP drain and the turns' recording share one 10 s window, then the AI action queue drains for up to 10 s, sequentially, then the pool. One more gap: after an `uncaughtException` the process force-exits at 12 s (`FORCE_EXIT_MS`, `server/startup/shutdown.ts`), which cuts the action-queue drain short; the runs are already ended by then, and a turn that had not recorded itself in the first 10 s leaves its row terminal and its mirrored steps kept, as §7 says.

### 12.4 DT3 completed on trunk (2026-10-22; evidence `docs/evidence/ANA-SUMMARY/2026-10-08/DT3-detach/`)

The DT3 build of 2026-10-08 was cut off at its gates and sat for 12 days while trunk moved 1,472 commits. It was merged onto `28637579e` and completed. What the merge found, and what changed against §12.2:

- **The request's DB client (blocking).** Since `14362ef00` the stream hands the request's pinned, tenant-scoped client to every tool, to the round's document-title lookup and to context assembly, and the auth boundary released it on the response's `close`. A detached turn's next round therefore failed (`MissingRequestDbContextError`, or "Cannot query a released request DB client"), and a `run_agent` child, which inherits the client, failed mid-read. The release is now a lease with holders (`server/db/requestDbLease.ts`): the response holds the client until it ends, and the stream takes its own hold for the turn and its post-processing (`retainRequestDbClient`). Same connection, same tenant session variables, no second client and no fallback to the shared pool. A turn whose response closed before the handler started has nothing to retain and fails closed, as before.
- **A resolved conversation.** `detachable()` also requires the run's conversation to be resolved: the thread `beginRun` verified, or the one minted for a new conversation and stamped on the run. A page that closes before a new conversation's thread exists is decided once the thread step has run: stamped, the turn detaches; not, it stops as `client_disconnected`. A run with no conversation could not be found again and its notice could name nothing.
- **A held step's ending.** The hold now tells a cancel (`'cancelled'`) from a row that failed or finished (`'ended'`). A cancel settles with no further read of the row, as trunk's `661a2c93a` requires (the first build read it again, which trunk's test caught); `'ended'` with no abort reaching the turn fails closed, as before DT3.
- **Who a stop is credited to (`5d8e60f3e`).** A step in flight when the run row's stop lands — a shutdown, the reaper, the session's end, an admin, the unattended limit — says what ended it ("… was ended because the server restarted for an update."), never "You stopped …". The clauses are `shared/ana/stop-lines.ts STOP_CAUSE`, and the run row's "Stopped: …" lines are built from them.
- **Read-only turns (`2aa766a76`).** A step refused because the person asked for a read-only answer is held back but is not "not authorised": the timeline marks it `readOnly`, and the closing row and the notice count only `notAuthorisedStep`. A Manual hold in a read-only turn never offers such a step as "Run this step", and never holds for it alone.
- **The notice opens through trunk's door.** See the DT3 "What already exists" table (§8). TaskTray is unchanged from trunk: the conversation opens through `NotificationOpenButton` and the server-verified target, and opening it does not mark it read (trunk's F19 rule; the design's "marks itself read" is superseded).
- **Admin cancel.** *(Superseded by §12.6: the cancel and its chained row are now one transaction, and a reason is required.)* The audit service resolves `{ persisted, chained }` (e1f3fd425). The cancel has already landed, so it stands; the 200 says `auditRecorded` and a missing chained row is logged (`ci:discarded-audit-write`). `readsEveryRecord` reads `req.user.role`, which `middleware/auth.ts applyOrganizationRole` sets from the membership row on the request, so an admin demoted a moment ago cannot cancel.
- **Strict round-body limit (`7780de83f`).** A detached turn whose round is refused by `ToolResultBudgetExceededError` ends `failed`, files its record `failed`, and tells its person "AnA stopped: the turn ended with an error"; the write to its closed socket is discarded.
- **Sub-agents (stay off in production, ADR-0015).** A `run_agent` child holds on its parent's hold and inherits its client, so after a detach it reads on the retained client and waits on the parent's unattended clock and `MAX_PAUSE_MS`. It has no `ana_runs` row: `stopRunsFor`, a shutdown and the reaper reach it only through the parent's signal. Its held-back steps travel as `agent_event` frames, which the parent's "not authorised" count does not include.
- **One reader of `?mine=live`.** The Working marker and RUN_LIMIT's links read the list through `readListedRuns` and `useLiveData`; the links are mounted only under a RUN_LIMIT refusal.


### 12.5 DT3 browser acceptance (2026-10-22; `docs/evidence/ANA-SUMMARY/2026-10-08/DT3-detach/acceptance/`)

Run in Chromium on a private instance against the CI-shaped database with RLS on and the DT1 stand-in model: a desktop (1280×800) and a phone (390×844) signed in as one person, and an admin of the same organisation. It found four things; three were defects in this slice and were fixed red first, and one is a decision.

- **Live Drive is on by default, so a default turn never detached (decided 2026-10-22: D-7, §9, §12.6).** Live Drive became the product's default on 2026-09-22 (`9db931c56`), two weeks before this design; §2.1 and D-7 were written as if it were the exception. Every turn of a person who has not switched it off sends `live_drive: true`, and by D-7 (§2.1) a turn that asked to drive stops when its page closes. So for a person on the defaults, DT3 changes nothing on screen: closing the page still stops the turn ("This page lost its connection, so the run was stopped before AnA finished.", acceptance G). Scenarios A–F were run with Live Drive switched off in the person's own setting. The request flag is the safe direction (§2.1), so this slice does not loosen it. Whether a default turn should detach (for example: only a turn whose drive state was actually enabled stops on close, which needs context assembly's `driveState` instead of the request flag) is a founder decision on D-7, not this slice's.
- **The client dropped the run row's reasons.** `anaProgress.ts readTurnEnding` kept only the reasons it knew before DT3, so an attached turn the run row stopped (an admin's cancel, a shutdown) reopened with no reason. It now keeps `unattended_limit`, `session_ended`, `server_shutdown`, `orphaned`, `error` and `admin_cancelled`.
- **An attached turn the run row stopped ended in an `error` frame.** When the row's stop reached a turn whose page was still open, `stream.ts` wrote `{type:'error'}`, so the asker read a failure, not "Stopped by an administrator.". It now ends as any stopped turn does: `done` with the row's reason and the rounds run, then `post_done` with the record.
- **The transcript had no note for a run-row stop.** `anaWorkModel.ts stoppedNoteText` had lines for the loop's and the run policy's stops only, so a turn a restart stopped reopened as its answer with no note and no Continue (Continue is drawn inside the note). Each run-row reason now says its shared stop line (`shared/ana/stop-lines.ts`), with "Continue picks it up." where `isContinuable` holds: a restart, a dead server, the session's end and the unattended limit; not an administrator's stop or an error.

### 12.6 The DT3 review fixes (2026-10-22; evidence `docs/evidence/ANA-SUMMARY/2026-10-08/DT3-detach/README.md`, "Review findings")

Three independent reviews of the uncommitted change (product and UX; governance and security; the system as a whole) raised 27 findings, one of them a blocker. Every one was fixed red first or given a verdict with its evidence; the per-finding table is in the evidence README. What changed against the body and §12.2–§12.5:

- **D-7, decided (§9).** `detachable({ runId, runUserId, threadResolved })` no longer reads the drive flag. Once a Live Drive turn has detached, `stream.ts` treats the screen as gone: a `navigate_to`, `act_on_screen` or `start_product_demo` call (`run-status.ts SCREEN_ACTION_TOOLS`) is refused before its handler runs, recorded `not_run` with `SCREEN_GONE_LINE`, and the model is told not to ask again (`SCREEN_GONE_RESULT`); no directive, demo promotion or move settle is sent after the close. The client follows a drive turn like any other. Browser acceptance G was re-run with Live Drive on (§12.5's G is superseded).
- **An administrator's cancel** (supersedes §12.4's bullet). The cancel and its chained audit row (`ana.run.admin_cancelled`: who, whose run, the conversation, the reason) are written in one transaction (`run-control.ts cancelAsAdministrator`); a row the chain refuses rolls the cancel back, and the administrator reads "The turn was not stopped: the record of your stop could not be written. Nothing was changed. Try again." (503). A reason is required (400, at most 500 characters), asked in a confirmation that names whose turn it is (`askerName` on the run read). Every projection names who took a control: the Summary ("Stopped by {name}, an administrator"; "You stopped …, as an administrator" for the administrator; never "You" for the asker), the run read, and the lineage dossier (`by`, `byRole`, `reason`; the XML's `by`/`byRole`/`<Reason>`; the trace report's "By" column).
- **Approvals.** The follower's approval is built by the attached frame's own builder (`part11-governance.ts approvalRequiredEnvelope`), so the proposal check a sign-off records as shown is shown. The governed-action route claims the held approval atomically before it signs off or executes (`run-approval-claim.ts claimApproval`; `routes/ana-ri/held-run-release.ts`): a run that ended meanwhile refuses with "The run ended before your approval arrived, so the action did not run. Nothing was changed." (409), and a second submit is refused. A run that ends while the approved action runs leaves the action standing; the answer is marked, an error is logged and a ledger row (`ana.governed_action.run_ended`) links it. A waiting turn stopped after a claim records the step as stopped after a person approved it, never as "nobody decided".
- **Session ends** (the first review pass). Sign-out stops only the runs of the session it ends, and only for a live access token. `stopRunsFor` is an organisation-keyed statement or a user-wide system statement, never an optional predicate (INF-39), and its audit row names the cause and the runs. The round-boundary check names what it found (`credential_ended`, `membership_ended`, `org_unavailable`, `standing_unreadable`) in `stopped_detail` and the record, and the `session_ended` line reads "the sign-in or access that started this turn ended" (DP-83). A turn whose run row could not be opened gets the same check (IAM-35).
- **The record and the notice.** A person's Stop followed by the socket closing is not a detach; the ended notice reads the watched stamp fresh; a record is never sealed "answered" over a row another writer stopped (the first review pass). The 40-minute cap on a detached turn is worded as that cap, not as Auto's budget, when the turn was not under Auto. The notice is server-only, never copies the question, and expires (§5.5).
- **Bounds.** At most 16 detached turns per process and 8 per organisation hold a pinned connection (`server/services/ana/detach-slots.ts`); past that, a closing page stops the turn as before DT3, and the record says why (INF-40). The shutdown gives the run writes 3 s, then stops the turns locally and leaves their rows to the reaper (INF-41). ECS `stopTimeout` is still unset (§12.3; infra, open).
- **The client.** A follow settles the bubble's running rows as unconfirmed; a hand-over whose conversation cannot be read says so instead of showing an empty answer; a 401 on the follower's poll says the person was signed out and stops polling; a failure the server announced is never read as a lost socket; a failed live-runs read says so, with "Check again"; the Working marker re-reads every 15 s and when the page becomes visible, says "Waiting for you" for a hold or an approval, says when it could not be read, and says "stops by HH:MM UTC", the limit plus the closing grace (a bound, on the server's clock).
