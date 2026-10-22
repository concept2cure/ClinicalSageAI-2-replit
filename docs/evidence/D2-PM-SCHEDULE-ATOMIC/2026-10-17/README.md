# PM-01: atomic schedule generation

**Launch row:** D2, repair of existing Projects schedule persistence.
**Baseline:** `ad372567d29a8ad385a751dde57a397cdc20cb3f` on `concept2cure-v2`.
**Scope:** the canonical schedule service, focused lifecycle/native tests and this evidence. No new dependency, schema, surface, provider or integration.

## Behavior

Previously, generation separately committed the plan header, deleted milestones, inserted replacements, replaced goals and recorded its revision. A later failure could leave a partially replaced schedule.

Generation now checks out one tenant-scoped client and uses it for the header, milestones, optional goals, revision and returned view. The production pool instrumentation applies the caller's tenant variables after `BEGIN`. The view is read before `COMMIT`; a failed response read therefore rolls back instead of reporting an error after successful persistence.

The header upsert remains first. Its existing `(organization_id, project_id)` unique arbiter and row lock serialize competing regenerations, including concurrent first creation. Each successful call returns its own complete version.

Pre-commit failures attempt rollback and preserve the original error. Failed rollback, unconfirmed `BEGIN` and rejected `COMMIT` discard the connection. A rejected `COMMIT` is an uncertain outcome: even successful cleanup does not prove it rolled back. The call rejects, never reports success and does not retry automatically.

## Evidence

| Record | Result and meaning |
| --- | --- |
| [red-unit.txt](red-unit.txt) | Baseline lifecycle suite: 6 failed, 1 passed. |
| [red-native.txt](red-native.txt), [red-native-exit.json](red-native-exit.json) | Finalized native suite against the baseline service: 8 failed, 3 passed, with no fixture errors. The repaired service was restored byte-for-byte before the green run. |
| [green-unit.txt](green-unit.txt) | 90 passed across 6 files: lifecycle, schedule logic/read failures, route identity and AnA tool authorization. |
| [green-native.txt](green-native.txt) | 11 passed on PostgreSQL 16 with actual separate connections, the production pool instrumentation and a non-superuser, non-bypass runtime role under FORCE RLS. |
| [checks.txt](checks.txt) | Companion scan passed with a filename warning; `service-transaction.test.ts` is the focused companion. DB-test isolation passed for 195 files. ESLint: 0 errors, 6 size/complexity warnings; generation now has complexity 16. |
| [build.txt](build.txt) | Node 22 production client/server build passed; bundle-size warnings remain. |
| [typecheck.txt](typecheck.txt), [typecheck-final.txt](typecheck-final.txt) | Cold whole-repository check and final candidate incremental check both passed with no TypeScript errors. The final cache hash matches the candidate service. |

Native failure injection covers milestone insertion, goal retirement/insertion, revision insertion and response loading. Snapshots verify the previous plan, milestones, goals and revision rows survive unchanged; first-generation failure leaves no business rows. PostgreSQL sequence counters are not transactional and are not part of that claim.

Positive controls cover retained plan identity, one version increment, complete returned milestones/goals/history, unchanged unrelated organizations/projects and manual stages, preserved achieved/dropped/revised goal history, and unchanged behavior for omitted/empty goals. Concurrency cases observe two distinct runtime backends waiting on native locks before checking complete per-call views and one final milestone set.

## Reproduction

Run from the repository root with Node **22.x** and installed lockfile dependencies. The native suite requires a real disposable PostgreSQL owner/admin URL; the harness provisions its restricted runtime role and removes its scratch schema/role afterward. Values below are placeholders, not recorded credentials.

```bash
TEST_DATABASE_URL='<disposable owner PostgreSQL URL>' \
  RLS_ENFORCE=on SKIP_DB_STARTUP_TEST=true \
  npm run test:db -- tests/db/project-schedule-atomic.dbtest.ts

npx vitest run --config vitest.config.ts \
  server/services/projects/schedule-of-events/__tests__ \
  server/routes/__tests__/project-schedule-of-events.test.ts \
  server/services/ana/__tests__/tool-authorization.test.ts

npm run ci:db-test-isolation
npm run typecheck:fast
npm run build
```

For a red replay, run the same tests against the recorded baseline service, then restore the implementation before green verification. Control tower owns that sequential replacement and the retained exit/source bindings.

## Limits

The native fixture applies the actual June schedule-table migration. Its parent/stage tables and tenant-aware unique/composite keys are narrow fixtures. It does **not** execute or qualify the public-qualified July uniqueness migration, the full deployed schema or a production deployment.

This repair does not preserve completed actuals during regeneration, add a controlled baseline/reason/approval workflow, restore the intentionally removed Plan screen or change project access policy. Amendment, goal reset and background review remain outside the new transaction; general locking between those operations and regeneration is not established.

No production QA, agency acceptance, live customer validation or launch-row completion is claimed. At this historical qualification point, changes were local on the canonical branch; no commit, push or deployment was performed. Subsequent canonical integration and publication are recorded in [D2-PM-PUBLICATION](../../D2-PM-PUBLICATION/2026-10-18/README.md). Candidate file hashes are retained in `source-bindings.json`.
