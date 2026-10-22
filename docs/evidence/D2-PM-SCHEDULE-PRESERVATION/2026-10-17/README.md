# PM-02: preserve milestone actuals during regeneration

**Launch row:** D2, repair of existing Projects schedule behavior.
**Branch:** `concept2cure-v2`, baseline commit `ad372567d29a8ad385a751dde57a397cdc20cb3f`.
**Starting candidate:** local PM-01 atomic generation, identified by its retained service SHA-256 in the PM-01 evidence and this slice's `red-native-exit.json`.

## Value and behavior

Clients can change planned dates without erasing execution history or breaking tasks linked to milestones. This supports ongoing regulatory programs across the client segments in the enhancement roadmap. Segment-specific workflow packs remain subsequent work.

Regeneration locks the organization-scoped parent project, existing plan and schedule stages before matching requirements. Concurrent regenerations serialize, including first creation. All snapshots, updates, goals, revision insertion and response reads remain inside PM-01's transaction.

Matching requires unique, nonempty milestone keys, the same canonical pathway/framework, and unchanged title, description, category, regulatory basis and dependency set. Dependency order and duplicates do not change the requirement. Canonical pathway aliases are accepted. Changed dates and generated narrative are planning changes.

Existing rows retain their IDs, original baseline/start dates, status, progress, completion time, notes, metadata, assignments, settings, review information and linked task references. Completed rows receive no UPDATE, retaining their historical planned dates as well. Completion in either the stage status or schedule metadata protects the row and is reflected in the returned schedule and health assessment. Missing completion timestamps and progress are not fabricated in storage; existing response defaults remain zero progress and null completion time.

Other matching rows update only the due date, generated rationale and update timestamp. Newly introduced keys create uncompleted work. Changed pathway/framework, changed requirement, removed keys, ambiguous keys or orphan milestones cause a typed preservation conflict before business writes. The HTTP route returns 409 with `SCHEDULE_REVIEW_REQUIRED`; AnA preserves the useful review-required message. Both keep their existing ownership, role and confirmation gates.

Each generated revision appends the complete previous header and milestone rows, full generated proposal, from/to versions, preserved IDs and new keys. Optional caller reasons are trimmed; absent or blank reasons are null. A reason is never synthesized or treated as approval. Prior revision rows are unchanged by generation.

The [contract](CONTRACT.md) records the bounded behavior. No new dependency, schema, provider or project screen is introduced.

## Verification

| Record | Observed result |
| --- | --- |
| [red-native.txt](red-native.txt), [red-native-exit.json](red-native-exit.json) | Final 29-case suite against PM-01: 20 failed, 9 passed. The PM-02 candidate was restored byte-for-byte afterward. |
| [green-native.txt](green-native.txt) | 29 passed using PostgreSQL 16, production pool instrumentation, separate runtime connections and a non-superuser/NOBYPASSRLS role under FORCE RLS. |
| [red-route.txt](red-route.txt), [green-route.txt](green-route.txt) | Route reason/conflict regressions: 2 failed / 18 passed before the route patch; 20 passed afterward. |
| [red-ana-reason.txt](red-ana-reason.txt), [green-ana-reason.txt](green-ana-reason.txt) | Real registered AnA handler and tool definition: 2 failed / 10 passed before forwarding/schema edits; 12 passed afterward. Persistence is mocked in this lane. |
| [green-unit.txt](green-unit.txt) | Final focused run: 130 passed in 8 files, covering schedule logic, connection cleanup, read failures, matching edge cases, route identity and AnA authorization/transport. |
| [checks.txt](checks.txt), [check-exits.json](check-exits.json) | Companion scan, database-test isolation (195 files), targeted ESLint and diff whitespace check exited zero. ESLint reported 0 errors and 104 size/complexity warnings across touched files, including the large existing AnA executor. |
| [build.txt](build.txt), [typecheck.txt](typecheck.txt), [verification.json](verification.json) | Final production build and whole-repository incremental TypeScript check; retained exit codes and source/cache bindings qualify the result. Build emits existing bundle-size warnings. |
| [source-bindings.json](source-bindings.json) | SHA-256 of the final candidate code and test files. |

Native tests verify complete row values, retained metadata text and unchanged `xmin`/`ctid` for completed rows; linked-task FK preservation; blocked work with progress and custom metadata; each independent completion marker without FK protection; canonical alias matching; and new work with no invented actuals. Revision assertions compare full prior driver-decoded rows and full proposals, including version transitions and normalized reason.

Eleven conflict variants verify unchanged plan, milestones, goals, tasks and revisions. Native fault injection exercises stage update/insertion, goal retirement/insertion, revision insertion and response reads. Concurrency tests observe two distinct runtime backends waiting on the parent lock, then verify complete per-call views, retained completion, version history and one final milestone set.

The companion scan uses filename matching and warns for `service.ts`, `AnaToolExecutor.ts` and the tool definition file. Executed companions are `service-transaction.test.ts`, `preservation.test.ts`, `schedule-generation-reason.test.ts` and the native suite; the scan alone is not qualification evidence.

## Reproduction

Use Node 22.x and lockfile dependencies from the repository root. The native harness requires an owner/admin URL for disposable PostgreSQL and removes its scratch schema and runtime role afterward. The URL below is a placeholder.

```bash
TEST_DATABASE_URL='<disposable owner PostgreSQL URL>' \
  RLS_ENFORCE=on SKIP_DB_STARTUP_TEST=true \
  npm run test:db -- tests/db/project-schedule-atomic.dbtest.ts

npx vitest run --config vitest.config.ts \
  server/services/projects/schedule-of-events/__tests__ \
  server/routes/__tests__/project-schedule-of-events.test.ts \
  server/services/ana/__tests__/tool-authorization.test.ts \
  server/services/ana/__tests__/schedule-generation-reason.test.ts

bash scripts/ai/verify-tests.sh
npm run ci:db-test-isolation
npm run typecheck:fast
npm run build
```

Red replay uses the retained PM-01 service baseline with the finalized native test, then restores the candidate before green verification. The delivery bundle contains that baseline for reproducibility. Route and AnA red logs qualify their respective transport edits separately.

## Limits and delivery state

The native fixture executes the actual June schedule-table migration. Parent/stage/task tables and tenant-aware indexes/composite keys are narrow fixtures. This does not qualify the full deployed schema or the public-qualified July uniqueness migration.

The preservation guard requires explicit resolution of semantic conflicts; a guided comparison/approval UI, retirement policy and cross-pathway migration are future work. General serialization with milestone amendment, goal reset and background sweep remains unqualified because those paths do not acquire the parent lock. Broader baseline approval and live customer acceptance are outside this slice.

PM-01 evidence remains a historical record tied to its earlier candidate hash; its description of destructive regeneration is superseded by PM-02. No production QA, agency acceptance or launch-row completion is claimed. At this qualification point, changes were local, uncommitted, unpushed and undeployed. Subsequent canonical integration and publication are recorded in [D2-PM-PUBLICATION](../../D2-PM-PUBLICATION/2026-10-18/README.md).
