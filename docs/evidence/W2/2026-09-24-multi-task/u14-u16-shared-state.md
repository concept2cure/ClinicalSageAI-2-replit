# U14 + U16: shared state across API tasks (continuity baseline, presence roster)

**Launch row:** D1 (hosted production). **Workstream:** W2. **Date:** 2026-10-01.
**Source:** `audit-findings.json` in this folder. These fix units:

- U14: *"AnA Command's trajectory verdict and 'what changed' briefing are measured against whichever API task handled the last request, not a shared baseline"*
- U16: *"Authoring presence roster lives in one task's memory: co-authors vanish on about half of heartbeats and everywhere after each deploy"*

**Production facts these depend on:** 2 API tasks behind an ALB with no stickiness, plus a worker running the same server; no Redis; `RLS_ENFORCE=on` (runtime role `app_service`). Each task has its own in-process Maps.

---

## 1. Defects, verified in code at HEAD `9a0c11174`

### U14: the continuity baseline was per task

| Where (HEAD) | What |
|---|---|
| `server/services/orchestration/continuity-service.ts:36-37` | `const snapshots = new Map…` and `const projectLatest = new Map…` are the only snapshot store. The comment says "in-memory — production: DB table". |
| `continuity-service.ts:69-70` | The "previous snapshot" is whatever **this process** recorded last. |
| `continuity-service.ts:124` | Every POST moves that baseline (`projectLatest.set`), so the baseline is "the last page view this task served". |
| `continuity-service.ts:144-146` | The "what changed" window starts at that snapshot, or 7 days ago when this task has none. |
| `continuity-service.ts:217` | `if (!previousSnapshot) return 'stable'`. With no baseline the verdict is still "stable", and that is always the case after a deploy. |
| `server/routes/orchestration.ts:347` | GET `/continuity/:projectId` reads the same Map. |
| `client/src/concept2cure/v2/surfaces/AnaCommand.tsx:499` | `TRAJ_MAP[cont?.trajectory \|\| 'stable'] \|\| TRAJ_MAP.stable`. Any trajectory the client does not recognise is also shown as "stable". |

### U16: the presence roster was per task

| Where (HEAD) | What |
|---|---|
| `server/routes/realtime-collab.ts:280` | `private rooms: Map<string, CollabRoom>` is the only roster store. |
| `realtime-collab.ts:384` | `updateAwareness`: `if (!room) return;`. A heartbeat for a room this task never created does nothing. |
| `realtime-collab.ts:925-937` | The re-join only runs `if (room && …)`, then the handler answers `{ success: true, connectedUsers: room?.connectedUsers \|\| [] }`. That is an empty roster sent as a success. |
| `realtime-collab.ts:331` | Cursor colours come from a per-process counter (`colorIndex++`), so the same author got different colours on different tasks. **The audit did not list this.** |
| `client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx:141` | `setPeers(res.body.connectedUsers)` takes that `[]` as the roster. |

Both mechanisms match the audit's description.

## 2. Fixes

### U14 (continuity baseline in Postgres)

- **New table** `migrations/20261001_project_continuity_snapshots.sql`: `project_continuity_snapshots` in `public`, with `id`, `organization_id INTEGER NOT NULL`, `project_id`, `readiness_score`, `snapshot jsonb` and `created_at`, plus an index on `(organization_id, project_id, created_at DESC)`. It uses `IF NOT EXISTS` only and has no DROP.
- **Baseline rule (decided, recorded here):** the verdict compares against **the latest snapshot at least 24 h old** for the project (`CONTINUITY_BASELINE_MIN_AGE_HOURS = 24`, `continuity-service.ts:55`, read by `readBaseline` at `:100`). It no longer compares against whoever loaded the page last.
- **No baseline:** the trajectory is `'no_baseline'` (`continuity-service.ts:324`). `newlyReady` is `[]`, and the summary says "No baseline yet: a trend is reported once a snapshot at least 24 hours old exists." The briefing also carries `baseline: {snapshotAt, readinessScore} | null` and `changesSince`, so a reader can reproduce the verdict.
- **Recording** (`recordSnapshot`, `:127`) writes at most **one row per project per hour** in a single `INSERT … WHERE NOT EXISTS` statement. When it inserts a row it also deletes rows older than the current baseline, because the baseline only moves forward and those rows can never be a baseline again. Each project keeps about 25 rows, not one per page view.
- **Fail closed:** a read or write failure on the store throws. The route answers 500 and the surface shows "Continuity briefing unavailable right now". It does not show a verdict computed against nothing.
- **Route** `server/routes/orchestration.ts:348`: GET `/continuity/:projectId` now awaits the shared store.
- **Client** `AnaCommand.tsx`:
  - `TRAJ_MAP.no_baseline` ("no baseline yet") at `:38`.
  - `continuityLead()` at `:43`. An unknown trajectory now maps to "no baseline yet", not "stable".
  - The lead reads "PRG-1: no baseline yet · N need attention".
  - The change list heading says "Since <baseline date>" or "Last 7 days".
  - With no baseline, "Nothing newly ready." becomes "No baseline yet to compare against."
  - Extracting the lead also lowered the component's existing complexity warning from 152 to 142.

### U16 (presence roster in Postgres, beside the durable locks)

- **New table** `db/migrations/20261001_collab_presence.sql`, next to its precedent `20260807_collab_section_locks.sql`. It is `collab_presence` in `public`: `organization_id INTEGER NOT NULL`, `document_id`, `section_id`, `user_id`, `display_name`, `email`, `awareness jsonb`, `connected_at`, `last_seen_at`, **PK `(organization_id, document_id, user_id)`**. It uses `IF NOT EXISTS` only and has no DROP.
- **`DurablePresenceManager`** (`realtime-collab.ts:529`) follows `DurableLockManager`:
  - Join and heartbeat both UPSERT the caller's own row (`PRESENCE_UPSERT_SQL`, `:480`). A heartbeat to the other task, or to a task started by a deploy, therefore re-joins the caller.
  - The roster is the rows in the caller's section where `last_seen_at > NOW() - make_interval(secs => 90)` (`PRESENCE_ROSTER_SQL`, `:499`).
  - Leave deletes only the caller's row **for the section named**. A late leave from the previous section therefore cannot remove the author from the new section.
  - Rows idle for more than an hour are deleted when someone joins.
  - `GET /rooms` stats are read from the table.
- **Fallback:** the old Map (`YjsRoomManager`) is kept only as the explicit not-durable fallback. It is used under the lock manager's conditions: `42P01`, or no tenant scope. It is also used when an upsert returns no row, which real Postgres never does; this is the stubbed-pool case and mirrors the lock manager's "no row and no conflict twice" rule. On the fallback, a heartbeat for a room this process does not hold answers **`roomKnown: false`** (`memoryHeartbeat`, `:648`). `/health` reports `presenceStorage` (`:1415`).
- **The heartbeat can now join**, so it validates UUIDs and checks document ownership the same way POST /rooms does (`:1192`).
- **Colours:** `colorFor(userId)` (`:196`) is a deterministic hash, so an author has the same colour whichever task answers.
- **Client** `AuthoringCollab.tsx:144` ignores the roster in a heartbeat response that says `roomKnown: false`. A real roster is still adopted.

### Migration set and RLS (CLAUDE.md Rule 1)

- Both files were added to `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs:2878-2879`) **immediately before the isolation tail** (`UUID_TENANT_ISOLATION_NONPUBLIC` → `CHILD_TABLE_PARENT_SCOPE` → `TENANT_ISOLATION_SWEEP`). Nothing else was reordered, and the tail block owned by the D3 lane is untouched.
- `db/migrations/migrations_manifest.json` was synced with `npm run db:sync-manifest`. That appends `20261001_collab_presence.sql` and is required by the pre-push `db:sync-manifest:check`.
- **Tenant sweep (verified by reading it):** `20260801_tenant_isolation_sweep.sql` selects every `public` base table with an `organization_id` / `org_id` / `tenant_id` integer column and no `tenant_isolation_policy`. It then enables and FORCEs RLS and attaches the canonical policy. Both new tables match. A replay on a fresh PG16 database confirms this:

```
--- apply both files, twice (deploy replay)
pass 1: ok
NOTICE:  relation "project_continuity_snapshots" already exists, skipping   (… and the index, and collab_presence + its index)
pass 2: ok
--- before the sweep
 collab_presence              | rls f | forced f | policies 0
 project_continuity_snapshots | rls f | forced f | policies 0
--- sweep (twice)
NOTICE:  [rls-sweep] tenant_isolation_policy applied to 2 newly-provisioned table(s); …
NOTICE:  [rls-sweep] tenant_isolation_policy applied to 0 newly-provisioned table(s); …
--- after the sweep
 collab_presence              | rls t | forced t | policies 1
 project_continuity_snapshots | rls t | forced t | policies 1
```

Both DB tests also check the result directly: `pg_policies` holds the policy, and as the non-superuser runtime role, with no `organization_id` predicate in the SQL, another organisation's scope sees **0** rows where the owning organisation sees 1.

## 3. Proof: fails before, passes after

### Tests

| File | Runner | What it proves |
|---|---|---|
| `tests/db/continuity-baseline.dbtest.ts` (11) | `vitest.db.config.ts`, real PG16, runtime role, `RLS_ENFORCE=on` | Each "task" is a fresh module graph from `vi.resetModules` (its own service, pool and tenant store), and all tasks share one database. A task booted later is the post-deploy case. The readiness score is stubbed, because the subject is *what it is compared against*. The store, the baseline choice and the verdict run for real. |
| `tests/db/collab-presence.dbtest.ts` (11) | same | Each task is a fresh express app with its own import of the router, and all tasks share one database. The tests cover: join on A and heartbeat on B; a post-deploy task; the 90 s TTL; leave on another task; the cross-section leave race; colour parity; RLS; and that no task fell back to the Map. |
| `tests/routes/realtime-collab-presence-fallback.test.ts` (4) | default (mocked pg) | The fallback answers `roomKnown: false` for an unknown room, `/health` reports the fallback, and the heartbeat rejects malformed ids. |
| `client/…/__tests__/anaCommandNoBaseline.test.tsx` (2) | jsdom | With no baseline the page reads "no baseline yet", never "stable". A real trend still renders with the baseline date. |
| `client/…/__tests__/authoringCollabRoomUnknown.test.tsx` (2) | jsdom | The roster survives a `roomKnown: false` heartbeat, and a real roster is still adopted. |

### Fail before

The final test files were run against the HEAD versions of the five source files. The files were swapped in and then restored, and `cmp` confirmed the restore byte for byte.

```
tests/db (PG16):          Tests  19 failed | 3 passed (22)
unit + client (jsdom):    Tests   7 failed | 1 passed (8)
```

Selected failures, verbatim:

```
× continuity … task A records at 60; a day later tasks B, C (post-deploy) and A all say improving at 72
  → expected [ 'improving', 'stable', 'stable' ] to deeply equal [ 'improving', 'improving', 'improving' ]
× continuity … a project never snapshotted reports no_baseline …
  → expected 'stable' to be 'no_baseline'
× continuity … a snapshot minutes old is not a baseline …
  → expected 'improving' to be 'no_baseline'
× continuity … declining is measured against the shared baseline too
  → expected 'stable' to be 'declining'
× presence … task B returns the author who joined on task A (pre-fix: an empty roster, with success)
  → expected [] to deeply equal [ 'alice@dbtcp.test' ]
× presence … two authors who joined through different tasks each see both
  → expected [ 'bob@dbtcp.test' ] to deeply equal [ Array(2) ]
× presence … gives an author the same cursor colour whichever task answers
  → expected '#DD6B20' to be '#E53E3E'
× presence … after a deploy: a task that has served nothing returns the room after one heartbeat
  → expected [] to deeply equal [ Array(2) ]
× AnaCommand … says "no baseline yet" and never "stable"
  (rendered lead was: "PRG-1 is stable: 0 newly ready · 1 need attention")
× AuthoringCollab … keeps the roster when the server says the room was unknown
  → expected null to be truthy   (the "JP" avatar vanished after the heartbeat)
```

The first continuity failure is exactly the audit's scenario. Task A (which recorded the 60) says "improving". Task B and the post-deploy task C say "stable" at the same score with nothing changed.

Three cases pass on HEAD on purpose. Two check the migration and sweep that the test applies itself. The third is a section-separation guard that both designs must keep.

### Pass after

```
tests/db (PG16):  continuity-baseline 11/11, collab-presence 11/11  → Tests 22 passed (22)
unit + client + neighbours (9 files):                                 Tests 54 passed (54)
```

The neighbours are `anaCommandRecConfidence`, `anaCommandPortfolioHonesty`, `authoringCollab`, `tests/routes/realtime-collab-tenancy`, `orchestration-project-id` and `collab-section-locks.pglite`. All are unchanged and still green.

How the DB suite was run: `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/c2c_u14u16_scratch npx vitest run --config vitest.db.config.ts <files>`. That database was disposable and was dropped afterwards.

## 4. Gates

| Command | Result |
|---|---|
| `npm run ci:migration-set-order` | OK: 340 migrations, sweep last, tail uuid step → child scope → sweep |
| `npm run ci:migration-drop-safety` | OK (no DROP added) |
| `npm run ci:migration-drop-safety:selftest` | OK 12/12 |
| `npm run ci:migration-deploy-path` / `:selftest` | OK / OK |
| `npm run ci:migration-reachability` | OK: 0 server-referenced tables on deploy-dead migrations |
| `npm run ci:migration-prefix-collisions` | OK |
| `npm run db:sync-manifest:check` | Manifest is in sync |
| `ci:column-reachability`, `ci:runtime-ddl`, `ci:unbacked-tables`, `ci:duplicate-table-ddl`, `ci:drizzle-tenant-scope`, `ci:json-operator-types`, `ci:server-error-leaks`, `ci:session-scoped-rls-bypass`, `ci:fixture-fallback`, `ci:no-mock-in-prod-routes` | all OK |
| `tests/schema-contract/{tenant-isolation-sweep,c2c-apply-path,declared-table-surface,uuid-tenant-isolation}` + `tests/phase11-e2e-migration-hardening` | 92/92 |
| `node --test tests/ops/apply-c2c-migrations-manifest.test.mjs` | 9/9 |
| eslint, changed files vs HEAD (stdin) | No new warnings. Per file, HEAD → now: AnaCommand 4 → 4 (complexity 152 → 142); AuthoringCollab 4 → 4; orchestration.ts 1 → 1; realtime-collab.ts 5 → 5 (all on pre-existing functions; the new functions are each ≤15); continuity-service 3 → 2. New test files: 0. |
| `npx tsc --noEmit -p tsconfig.json` | 0 errors |

## 5. Where this differs from the audit, and what remains

- **Additional defect:** cursor colour was assigned per process (`realtime-collab.ts:331` at HEAD), so presence also disagreed on colour between tasks. Fixed with `colorFor`.
- **Additional defect:** the client mapped any unrecognised trajectory to "stable" (`AnaCommand.tsx:499` at HEAD). Without the client fix, the server's honest `no_baseline` would still have been shown as "stable".
- **Design hazard the audit did not raise:** with one presence row per document, a late leave for the previous section could have deleted the author's new-section presence. The leave is therefore section-scoped, and a test covers it.
- **Proof vehicle:** the audit suggested a PGlite test for U16. The real-PG16 dbtest is used instead, because it also exercises the runtime role and RLS.
- **Test-harness note:** the router resolves its pool lazily with `import('../db.js')`. Under `vi.resetModules` a task's first lazy import could land in the *next* task's registry and lose the request scope. The test warms each task's pool at boot. This cannot happen in production, where each task is one bundle.
- **Not fixed, outside U14 (pre-existing):** `detectChanges` (`continuity-service.ts`) catches an audit-log read failure and returns `[]`, which renders as "No changes recorded yet." That is an error shown as an empty result. Its fix is to propagate the failure so the briefing reports itself unavailable. That changes the surface's failure behaviour and deserves its own decision.
- **Stale, pre-existing:** the "LOCK ENDPOINTS" comment in `realtime-collab.ts` still says locks "live in process memory". They have been durable since 20260807. Left unedited.
- `shared/types/orchestration.ts` was not edited. The `'no_baseline'` trajectory and the `baseline` and `changesSince` fields are declared as `ContinuityBriefing` in `continuity-service.ts`.
