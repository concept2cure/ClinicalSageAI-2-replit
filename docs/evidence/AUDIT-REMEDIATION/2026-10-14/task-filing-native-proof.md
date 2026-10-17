# Native tracked-filing handoff verification

The continuation verified the actual mounted `GET /api/task-management/filings/:filingId`, the existing populated `GET /api/task-management/board`, and both notification-target programme-helper callsites on the already provisioned local PostgreSQL database. On 2026-10-14 at 19:36 UTC, all **10 native tests passed** in 3.74 seconds. Scoped ESLint passed with zero errors and zero warnings; `git diff --check` passed. The native lane uses `tests/setup.db.ts`, which rejects a mocked `pg.Pool` and an unreachable database.

The test is [tests/db/task-filing-home.dbtest.ts](../../../../../tests/db/task-filing-home.dbtest.ts). It signs a synthetic access token and passes it through canonical `authMiddleware`; the scope proof observes the genuine `LazyRequestDbClient`, matching AsyncLocalStorage tenant, and actual `app_service` connection. PostgreSQL reports that role as `NOSUPERUSER` and `NOBYPASSRLS`. The deployed `estar_submissions`, `projects`, `regulatory_programs`, `organization_users`, `users`, `mdx_notifications`, `unified_tasks` and `report_runs` tables all have RLS and FORCE RLS enabled. No schema, policy, role, index or trigger was changed by this test. All fixtures are explicitly synthetic; their organization IDs are 94640 and 94641.

The proof exercises:

- Exact retained filing projection and repeat read, with the actual integer project and programme UUID kept separate. Owner-side before/after comparison confirms the filing row was not changed. Missing retained artifact bindings remain null.
- Readable unattached filings, projects without a programme, and retained filings whose programme is soft deleted. Each preserves its exact native record and returns a null programme rather than guessing one.
- Malformed identifiers, a foreign filing, a missing filing, an actual foreign-project reference and a dangling legacy integer project reference. Refusals carry no record payload.
- Real private-project denial for a regular organization member, grant through canonical `project_members`, revocation, and read recovery after restoration.
- Organization membership removal and account deactivation after genuine authentication. The service rechecks current persisted authority. Account restoration does not revive the ended bearer; a newly issued session after the canonical termination stamp recovers access.
- A controlled connectivity exception on the pinned filing SELECT after genuine authentication. It returns typed `503 FILING_READ_UNAVAILABLE`, then recovers to the same exact filing. All other SQL delegates to the actual connection. This is error-propagation evidence, not an induced RLS or network outage.
- The existing populated task board returns the own filing card with `source: filing`, exact native UUID, real programme UUID and separate integer project; the foreign filing is absent and `estar_submissions` is not reported unread. This path exercises the actual shared-pool reads with authenticated AsyncLocalStorage as well as the pinned programme bridge.
- Actual persisted notices, canonical `TASK-*` records and project-scoped saved report records resolve through `resolveNotificationRecordTarget`, mounted behind genuine authentication with the pinned request client. This covers `projectProgram()` and the direct `reportTarget()` helper call. The ordinary member receives the own exact programme UUID; private task/report notices refuse access, recover after a real `use` grant, and refuse again after revocation. Foreign task/report references and a foreign notice refuse access. Report rows remain queued synthetic fixtures; this proves navigation authority, not a completed report calculation.

## Material red-to-green finding

The native fixture exposed that the existing `loadTaskHomePrograms` queried `regulatory_programs.project_anchor_id`, a column absent from the deployed schema and the migration contract. A corrected canonical fixture then demonstrated actual exact-filing reads returning `503` before the helper repair. The implementation owner repaired the existing helper to use `projects.regulatory_program_id` and canonical `readProgramAnchorRow(..., requireUnique: true)`. The same native route and populated-board proofs then passed.

The actual schema has the unique partial index `projects_one_anchor_per_program` on nonnull `projects.regulatory_program_id`. A duplicate-anchor fixture was therefore not forced into the database. The implementation owner's corrected PGlite tests cover damaged legacy ambiguity using the real canonical column; no native index was removed to manufacture it.

Before/after raw evidence is retained in the task workspace:

| Evidence | Path | SHA-256 |
| --- | --- | --- |
| Canonical-fixture route failure before repair | `/workspace/audit/continuation-task-filing-native-service-red.log` | `1d0eeb1fa70289d9ecc426dfcc3862ac7be26377341d1a9f25e1e77b38f5641c` |
| Final ten-test native pass | `/workspace/audit/continuation-task-filing-notification-native-final.log` | `5e1d4316ca15b68eac17e9e01e634bf89409c5eae6356fa065535b020606a472` |
| Verified test source | `tests/db/task-filing-home.dbtest.ts` | `03f6fbc32fae5ae1558cc8e9ef9f7b644a5d464af3674d823bbc6c74bef440a8` |
| Verified helper source | `server/services/tasking/task-home-programs.ts` | `0ac6c680c8c507e5c0828b64c11806631e0b3ca5490b1722fe8ccb612e5ee570` |

The initial red log also contains a test-fixture recovery mistake: restoring an inactive account does not restore its old session. The final proof uses the canonical session termination wait and a fresh token. That fixture mistake is not claimed as a production defect.

## Reproduce

Provide `TEST_DATABASE_URL` for the disposable provisioned database owner and `APP_DATABASE_URL` for its existing nonprivileged application role. The local run used Node 22.23.3 and verified PostgreSQL TLS for the application connection, with the session CA bundle preserved.

```bash
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts tests/db/task-filing-home.dbtest.ts
node node_modules/eslint/bin/eslint.js tests/db/task-filing-home.dbtest.ts
```

This verifies the native tracker read, existing board consumer and both actual notification-target helper callsites. The notification proof uses a small authenticated test adapter around the actual resolver; it does not claim to exercise the whole notifications HTTP router. It does not assert a relationship to a different canonical submission record, perform an FDA transaction, qualify production infrastructure, or prove the browser component; those remain separate evidence scopes.
