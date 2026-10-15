# U20 — every deploy signed out everyone signed in for more than 15 minutes

Launch row: **D1** (production as configured), with D6 (sign-in).
Date: 2026-10-01. Branch: `concept2cure-v2`.

## Decision B6 (CPO mandate, 2026-10-01): production runs without Redis

Earlier briefs left B6 to the founder: add ElastiCache, or run without Redis.
A read-only agent mapped every Redis consumer in the shipped server. Its
findings:

- Nothing fails at boot. Each consumer falls back to per-process memory or
  turns itself off.
- Setting `REDIS_URL` would fix only the sessions (below) and parts of the AnA
  action lock.
- Setting it would also switch on code paths that have never run in
  production. That includes a job-poll route that checks only that the caller
  is signed in, so with Redis on, any tenant could read another tenant's job
  result.
- It would make Redis a single point of failure for `/readyz` on both API
  tasks.

The repository has already standardised on Postgres for coordination:
`scheduledOnce`, AnA run control, collab locks, lockout and OTP counters. So
the decision is **no Redis**: each gap is closed in Postgres, one at a time,
starting with the one clients would feel.

**Consequence for D1's acceptance line:** `/readyz` reports `redis` and
`worker` as `skipped` by this decision. The `worker` check is the Bull action
queue, not the ECS worker task. That line is amended accordingly.

## The defect

`server/services/session-inactivity.ts` holds three things:

- each session's last activity;
- the account's session registry (the concurrent-session limit);
- the "superseded" markers.

The comments said this lived in Redis, and that "Production runs Redis (plan
P1-3)". Production has no Redis, so all three lived in each process's memory.
A process that had not seen a session measured it from its token's issue
time. Access tokens last 24 hours and are refreshed only near expiry, so in
practice that is the sign-in time. As a result:

- **Every deploy signed out everyone who had signed in more than the idle
  window ago (15 minutes by default), in the middle of their work.** New tasks
  start with empty memory. The client's refresh was refused the same way.
- A session ended by the concurrent-session limit kept working on the other
  task. Over a round-robin load balancer, that means intermittent 401s.
- The limit counted per task, so the effective limit was about double.

## The fix

**Storage.** `session_activity` (`migrations/20261001e_session_activity.sql`)
holds one row per session, keyed by its activity key (`sid:<id>`, or
`tok:<sha256>` for tokens older than session ids). It records last activity,
account, session start, the superseded marker and expiry. No token is stored.

- The table is in `public` with `organization_id INTEGER NOT NULL`. It is
  always 0, because a session belongs to an account, not to one organisation.
- It is read and written only under the audited system scope, so the tenant
  policy hides it from every tenant scope.
- The migration is IF NOT EXISTS only, has no DROP, and is inserted before the
  final pair.

**Activity.** Each request does one indexed lookup and takes the later of the
stored value and this process's memory.

- Writes are throttled per session per process to at most every
  min(30 s, idle window / 4).
- Another process therefore never misjudges a working session as idle, and
  the database is not written on every request.

**Registry.** Registration is one transaction under a per-account advisory
lock: prune expired rows, add the session, count the account's live sessions,
and supersede the oldest beyond the limit. Two sign-ins at once cannot both
read the same count. Signing out deletes the session's row.

**Fallback.** Memory is used only when the store cannot be reached. A session
is then judged by what this process has seen, as before.

**Removed.** The Redis tier (the Lua script and the key prefixes) is gone, and
so is `server/services/__tests__/session-registry-redis.test.ts`. That test
covered the removed tier. Its three behaviours (registration is atomic, the
shared decision is final, and a superseded session is refused on another task)
are now proven against real Postgres below.

## Verified by making it fail

**`tests/db/session-activity-across-tasks.dbtest.ts`**

- **Setup.** Each "task" is a fresh module graph with its own memory and its
  own pool. All share one real PostgreSQL 16 and run as the non-superuser
  runtime role with RLS_ENFORCE=on. The schema is the migration's own DDL plus
  the tenant policy.
- **Old code:** 2 failed.
  - A user working steadily for 40 minutes is signed out by the new task:
    `expected 'idle' to be null`.
  - A session the limit ended on task B is not ended on task A or C:
    `expected null to be 'superseded'`.
- **New code:** 4/4. The two guards also pass: a session idle past its window
  is refused on every process, and signing out frees the slot everywhere.

**Unit suites.** The session, auth middleware, refresh, connector token, setup
and TOTP lockout suites pass, 64 tests. They run the memory fallback because
their database is stubbed.

**Gates and static checks.**

- Migration gates (`set-order`, `drop-safety`, `reachability`, `deploy-path`,
  `prefix-collisions`) are all OK.
- `tsc` reports 0 errors.
- ESLint reports no warnings in the service, before or after.

**Not run.** `delegated-credential-scope.dbtest.ts` needs a fully migrated
database ("relation organizations does not exist"). It fails the same way on
the old code; it is an environment limit here, not a result.

## The other gaps of running without Redis

Recorded on the board, in order of client effect:

1. **AnA governed actions** (`ai-actions/distributed-lock.ts`,
   `concurrency-limiter.ts`). The lock and the per-org cap are per process,
   so two write actions on one target from different tasks can both run.
   Postgres advisory locks fix this.
2. **AnA-MDX pending confirmations** (`ana-ri/mdx-pending-actions.ts`) live in
   memory, so a confirmation that lands on the other task loses its stashed
   parameters.
3. **The sign-in, OTP, password-reset and signing rate limiters** use in-memory
   stores, so each task enforces its own limit. Postgres lockout and OTP caps
   still hold.
4. **The report-subscription sweep** never runs, and would deliver nothing if
   it did. Reporting has no client caller for it today.
5. **`platform_maintenance`** has no schedule. It could run through
   `runScheduledOncePerWindow`.
