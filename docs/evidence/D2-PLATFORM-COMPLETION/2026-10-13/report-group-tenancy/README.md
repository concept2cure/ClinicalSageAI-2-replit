# Native report-program group tenant integrity — D2

The installed pre-repair table accepted a group in organization A linked to a
project in organization B. Its parent-derived FORCE RLS policy filtered by the
group but could not prove the second parent's tenant. The rolled-back native
baseline probe records one valid same-org control and two expected failures:
wrong-tenant link acceptance and the missing non-null integer tenant column.
`baseline-native.probe.mjs` records that historical shape; it is not a recurring
test or a schema installer.

The canonical `migrations/0014_report_os_foundation.sql` amendment now supplies
validated, immediate composite foreign keys to both parents. The native test
executes the real `applyMigrationFiles` applier against a database provisioned
through the platform installer, followed by the existing child-parent and
integer tenant policy installers. It creates no replacement table or policy.
The existing parent-derived FORCE RLS policy remains authoritative.

`native-green-27.txt` records **27 passing tests in two files, zero skips**:

- 14 new native cases prove exact tenant-key shape and validated composite
  references; same-org writes; wrong group/project refusals even for the owner;
  actual configured non-owner `app_service`, NOSUPERUSER/NOBYPASSRLS and FORCE
  RLS; filtered reads and foreign-row mutation refusal; replay without changing
  retained links or constraints.
- Legacy reconciliation tests stage only rollback-owned changes on the real
  table. They execute the canonical migration with only its outer transaction
  delimiters removed so the test owns rollback. They prove safe NULL-only
  backfill; named refusal of conflicting parent scopes, incorrect populated
  child tenant keys and missing parents; no partial backfill, deletion or
  relabeling; refusal of a wrong-shape named key; and validation of a correctly
  shaped existing NOT VALID key without replacing its OID.
- 13 existing actual HTTP tenant-session cases prove that the report routes
  continue taking organization and actor identity from the session, including
  the repaired program-group writer and tenant-isolated group mutations.

The new test's ESLint run has zero errors and zero warnings. Source digests and
the final runner result are retained in `native-source-digests.json`. The first
local native run passed all 14 security assertions but failed isolated fixture
cleanup because project rows must be deleted before their organization; that
test-only cleanup was corrected before the final green run.

Run with Node 22, a disposable owner `TEST_DATABASE_URL` and the provisioned
non-owner `APP_DATABASE_URL`:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts \
  tests/db/report-program-group-tenancy.dbtest.ts \
  tests/db/report-os-tenant-from-session.dbtest.ts
node node_modules/eslint/bin/eslint.js tests/db/report-program-group-tenancy.dbtest.ts
```

This is native tenant-integrity and route regression evidence, not deployment,
production HMAC qualification, model qualification or regulatory approval. The
existing HTTP fixture explicitly reports a non-production audit-HMAC fallback.
Browser organization 2/user 25 and their project content were not modified.
