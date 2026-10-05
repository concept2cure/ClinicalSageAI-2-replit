# The Module 3 signed snapshots and provenance trail are append-only

Rows **D2**, **D5** (21 CFR Part 11 §11.10(e), §11.70) and **D6**. Found by the
GA security review (2026-10-05), DP-84.

## The defect

- **`cmc_module3_section_versions`** holds the snapshot that a Module 3
  section approval signs. The `electronic_signatures` row binds its content
  digest.
- **`cmc_provenance_events`** records who compiled, approved, placed, linked
  and resolved what.

Neither table had a trigger, and the runtime role held UPDATE and DELETE on
both. As `app_service` (NOSUPERUSER, NOBYPASSRLS), under RLS, in its own
tenant (`red-runtime-role-before.txt`, run in BEGIN … ROLLBACK, so nothing was
kept):

```
-- rewrite a signed section snapshot      UPDATE 1
-- delete a signed section snapshot       DELETE 1
-- rewrite who did a provenance event     UPDATE 1
-- delete a provenance event              DELETE 1
```

## The fix

**`migrations/20261005c_cmc_module3_history_append_only.sql`**, in
`C2C_MIGRATION_FILES` after the CMC source-evidence file, does the following:

- **Triggers.** It installs a row trigger (UPDATE, DELETE) and a statement
  trigger (TRUNCATE) on each table, for every role. It reuses
  `public.domain_history_append_only()` from `20261001`, so the refusal reads
  the same as the other domain histories.
- **No door.** The census in the file header shows every writer INSERTs and
  does nothing else. A correction is a new row: a recompile writes a new
  version, and a resolution writes a new event.
- **The cascade.** `section_versions.section_id` is `ON DELETE CASCADE`.
  Deleting a section that has signed versions is now refused together with
  them. A section with no version can still be deleted.
- **Replay-safe** under Rule 1: it drops and recreates only its own triggers,
  guards each table with `to_regclass`, creates no table and drops nothing
  another file creates.

**The runtime role's ceiling.** Both tables are added to `APPEND_ONLY_TABLES`
(`scripts/db/provision-app-role.mjs`), so `app_service` holds only SELECT and
INSERT on them.

**The production boot requires the triggers.** The four triggers are added to
`EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS`
(`server/services/audit/audit-immutability-triggers.ts`). A deployment where
one is missing or disabled is reported by the same check as the audit logs'.

## Red, then green

- **Red:** the runtime-role probe above (`red-runtime-role-before.txt`).
- **Green, real PostgreSQL, under RLS, as `app_service`**
  (`tests/db/cmc-module3-history-append-only.dbtest.ts`, 16 tests,
  `green-dbtest-rls-after.txt`). For each table:
  - an INSERT from the runtime role still lands;
  - UPDATE and DELETE are refused, from the runtime role and from the owner;
  - TRUNCATE is refused;
  - both triggers are installed and enabled.

  Deleting a section that has a signed version is refused. One that has none
  is not. The migration applies twice and leaves one trigger of each name.
- **No real path broke.** With the triggers live in the local database, the
  staff simulation scores **153 passed, 0 failed** (`green-simulation-after.txt`).
  It compiles, approves, places, resolves and links on that run. The server
  log has no `IMMUTABILITY_VIOLATION`.
- **Pins.**
  - `provision-app-role-append-only.test.ts` names both stores.
  - The boot list check (the same file) pairs each store with its triggers.
  - 42 tests pass.

## Not changed

`server/jobs/__tests__/auditChainIntegritySweep.test.ts` fails 10 of 32 on
HEAD without this change, so the failure predates it. It is outside this
change.
