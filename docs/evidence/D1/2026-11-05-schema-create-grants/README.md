# D1: the migration set completes on a non-superuser applier (two `CREATE ON SCHEMA public` grants)

**Launch row D1, hosted production.** Committed under `Plan: F1`. Session `session_01QoxbLcnW5jPvJSjjKQtvTA`,
2026-11-05. Found while provisioning a local database to open the Data Room in the running app.

## The defect

`deploy-migrate` halted at `migrations/20261023_review_routes.sql`, 432 of 462 files applied, with "permission denied
for schema public". With that fixed, it halted again at `migrations/20261029k_tenant_offboarding_custody.sql`, 454 of
462. The failing statements were:

- `ALTER FUNCTION public.review_route_enlist_member(…) OWNER TO review_route_writer`;
- `ALTER FUNCTION public.purge_tenant_signed_records(integer) OWNER TO tenant_record_purger`.

PostgreSQL's rule: to change a function's owner, the new owning role must hold `CREATE` on the function's schema.
Since PostgreSQL 15, `PUBLIC` no longer has `CREATE` on `public`. A true superuser bypasses the check; the RDS master
user is not a true superuser. Both files grant their owner role `USAGE` only.

**Where it bites.** Any database where the applier is not a superuser and `public` does not grant `CREATE` to
`PUBLIC`. That is every database created on PostgreSQL 15 or later and applied as the RDS master
(`terraform/stack/variables.tf`, `rds_engine_version`, major only). A suite or CI job that applies migrations as
`postgres` would not see it.

**Reproduced on** PostgreSQL 16.15, with the applier role `c2c`: not superuser, `CREATEROLE`, owner of the database,
as the RDS master is (`01-red.txt`).

## What already exists (RULE 3)

Three sibling owner roles already carry exactly this grant, with the reason written beside it:

- `ana_record_purger`: `migrations/20260926_ana_turn_records.sql:272`, "CREATE on public is the ALTER … OWNER TO
  rule for a non-superuser applier";
- `ana_run_events_purger`: `migrations/20261008f_ana_run_events.sql:185`;
- `artifact_record_purger`: `migrations/20260929_concept2cure_signatures_append_only.sql:180`.

A scan of every `OWNER TO <role>` in `migrations/` and `db/migrations/` found these two roles the only owners without
it.

## The change (RULE 1: amended in place, not appended)

Each file's grant becomes `GRANT USAGE, CREATE ON SCHEMA public TO <role>`, with a dated header note saying what,
why and by which change. The amendment is additive and idempotent, and it registers as drift in
`c2c_migration_journal`. Nothing runs as either role except the fixed SECURITY DEFINER bodies those files define.

`server/services/review/__tests__/route-writer-setting.gate.test.ts` anchored one mutation case on the old grant's
exact text; it now anchors on the new line. The gate's own checks pass on the amended file unchanged.

## Evidence

- `01-red.txt`: the two halts, before each amendment.
- `02-green.txt`: 462 of 462 applied after both amendments, including `20261105_file_uploads_durable_object.sql`;
  and a replay of the whole set, also clean.
- The migration gates: `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`,
  `ci:migration-guard-order`, `ci:runtime-ddl` and `db:sync-manifest:check` all pass.
- The 29 suites that apply either file: 340 of 340 after the anchor update.

## Not shown here

Whether production's RDS database grants `CREATE` on `public` to `PUBLIC`, which it would if it was created before
PostgreSQL 15 and upgraded since, was not checked: no production access from this session. The grant is correct
either way, and harmless where it was already implied.

Three other local steps were needed. Each mirrors what the RDS master already has, so none is a code defect:

- `CREATE EXTENSION vector`, run as a superuser;
- `CREATEROLE` on the applier;
- the applier owning the database.
