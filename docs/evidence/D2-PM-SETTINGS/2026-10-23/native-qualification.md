# PM-06 native PostgreSQL qualification

The final [native run](native-postgres.txt) passes **8 tests** under Node 22 and PostgreSQL 16:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.db.config.ts tests/db/project-settings.dbtest.ts
```

`TEST_DATABASE_URL` points at a task-owned disposable PostgreSQL database. The test creates another disposable public database, because canonical anchor admission inspects the actual public catalog. It extracts the listed base CREATE TABLE definitions, applies the named canonical program/document/anchor/audit/schedule migrations and provisions the actual application role with `provisionAppServiceRole`. The runtime role is verified NOSUPERUSER/NOBYPASSRLS; tenant tables carry FORCE RLS using the canonical tenant policy. Milestone/section fixtures use parent-scoped policies.

The actual mounted Projects router, current persisted actor/sharing admission, native row locks, canonical `applyProgrammeProfilePatch`, Drizzle/pg driver, chained audit writer and HMAC verifier execute. The successful row and audit have the same PostgreSQL `xmin`, and the reason and before/after fields are readable. Actual chain/seal verification passes.

Two HTTP writes use two real database connections. The first waits after taking the program lock; `pg_stat_activity` observes the second blocked on that lock. Releasing the first yields one acknowledged save, one stale 409 and one audit entry. This qualifies serialization rather than a mocked sequential expectation or a SHARE-lock upgrade deadlock.

A real audit-table constraint failure rolls back the profile change and audit. Lost acknowledgement is injected after the actual COMMIT: the saved row and chained audit persist, the route returns `PROJECT_SETTINGS_OUTCOME_UNKNOWN`, and exactly one owned connection is discarded. An injected lost actual rollback acknowledgement likewise reports uncertainty, despite independently observed rollback. Current persisted viewer/inactive actor, private unshared reader, cross-organization RLS and contradictory client claim are refused.

Before/after snapshots retain the canonical project anchor, completed workflow stage, schedule header/goals/revision, completed program milestone, locked dossier and version-5 approved section unchanged. Program actual submission/approval dates and progress actuals also remain identical. Deliberate null clearing survives reread; a semantic no-op produces no second audit.

Authentication/request assembly is synthetic, including the explicit request ALS and actor ID; it is not deployed authentication. The fixture omits unrelated baseline ALTER foreign keys and uses narrow empty sharing/review relationships. It qualifies this actual transaction/SQL/RLS boundary, not a full installed schema, live client sign-off, provider, external portal or ownership-transfer policy. The optional tamper-proof audit store is provisioned from its real migration, but the tested commit obligation is the transactional domain ledger.

[The first native attempt](native-postgres-first.txt) is a fixture diagnostic: its reused PM-05 `source:'test'` was correctly refused by the settings request gate, the narrow review table lacked the reservation's ID column, and one expectation incorrectly required 403 instead of the canonical concealed 404. The final fixture supplies synthetic request scope/actor, the actual needed ID and the existing concealed-read policy; no production gate or RLS rule was weakened. The initial concurrency case was also changed to report a refused pre-update response immediately instead of waiting for a barrier it could never reach.
