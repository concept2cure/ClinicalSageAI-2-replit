# Database provisioning contract

What provisions the Concept2Cure schema, who owns which table, what is
deliberately not applied, and how each of those claims was checked.

This document exists because the provisioning path had three creators and no
statement of which one owned what, so "the install is green" and "the schema is
complete" were different facts with nothing connecting them.

---

## 1. Schema ownership — `shared/schema.ts` is the drizzle entrypoint

`drizzle.config.ts` sets `schema: './shared/schema.ts'`. It is **not** the
`shared/schema/index.ts` barrel, and that is a decision, not an oversight.

### The measurement

| Entrypoint | Tables it declares |
|---|---|
| `shared/schema.ts` (in effect) | 467 |
| `shared/schema/index.ts` (the barrel) | 642 |

Of the 175 tables reachable only through the barrel, **172 are already created
by the raw `migrations/` overlay** on a fresh install. Switching the entrypoint
would therefore give 172 tables a *second* creator with an independently
maintained shape — the parallel-implementation failure this repo forbids — and
it makes `drizzle-kit push` introspect the whole database to decide what to do,
which on an already-provisioned database (≈800 tables) takes minutes and was the
"timed out while Drizzle was pulling the database schema" symptom.

The remaining 3 were the real gap:

- `module_documents`
- `document_audit_logs`
- `document_attachments`

They are defined only in `shared/schema/unified_workflow.ts`, which the pushed
entrypoint does not re-export, and **no raw migration created them either**. They
simply did not exist on any provisioning path. Their only rival creator,
`db/migrations/_consolidated/20250108_unified_documents_complete_schema.sql`,
also redefines `users`/`tenants` with TEXT keys (ledger C-29) and lives in a tree
the install overlay never walks.

### The resolution

`migrations/20260729b_unified_workflow_companion_tables.sql` provisions all three
with the canonical Drizzle shape — on exactly the terms
`20260729_unified_documents_provision.sql` already established for their siblings
`unified_documents` and `workflow_document_versions`. It is on
`C2C_MIGRATION_FILES` so existing databases get it too, and it sorts before the
tenant-isolation sweep so `module_documents` (integer `organization_id`) comes
under RLS.

Those three were also the three `shared/schema/unified_workflow.ts` entries in
`scripts/ci/orm-table-reachability-baseline.json` — a gate whose own note says
*"Fix by adding a migration, then re-run with --write-baseline to shrink this
list"*. Both that baseline and the `document_audit_logs` entry in
`scripts/ci/tables-live-schema-baseline.json` are ratcheted down in this change.

So: `shared/schema.ts` stays canonical, every table has exactly one creator, and
`install-fresh` now **reports the creator of each required table by name** rather
than asserting it.

### Table ownership at a glance

| Creator | Applied by |
|---|---|
| `drizzle-kit push` from `shared/schema.ts` | install-fresh step 2 |
| raw `migrations/*.sql` overlay | install-fresh step 3 |
| authoring subsystem (`db/migrations/20260725_authoring_*`) | install-fresh step 4, and deploy-migrate |
| governed content (`db/migrations/*_gcc_*.sql`) | install-fresh step 6 |
| out-of-band C2C set (`C2C_MIGRATION_FILES`) | `apply-c2c-migrations.mjs` / `deploy-migrate.mjs` |

---

## 2. Migration status

### 2.1 The ten migrations reported as unapplied

`0006_regulatory_atoms`, `0010_operating_system_foundation`,
`0013_ana_intelligence_system`, `0014_report_os_foundation`,
`20260429_regulatory_graph`, `20260507_mdx_beta_surfaces`,
`20260602_working_memory_embeddings`, `20260603_ai_capability_governance`,
`20260603_living_record_spine`, `20260615_report_subscriptions`.

**All ten apply.** None is retired; none is skipped. On a clean PostgreSQL 16
with pgvector they apply in the ordered set with zero failures, and the seven
tables they were reported as blocking all exist with their expected columns,
primary keys, foreign keys, indexes and policies — asserted per object by
`install-fresh` step 8 (`REQUIRED_OBJECT_CONTRACT`), not by a table count.

The condition that reproduces the failure is a server **without pgvector**. Step
2 then cannot use `drizzle-kit push` (it stops at the first `vector(N)` column
and creates none of the ~950 other tables), falls back to applying push's
statements one at a time, and skips every vector-dependent object plus everything
that transitively depends on one. That cascade is what leaves migrations
unapplied and tables absent. The installer already names pgvector's absence and
refuses to report success; the remedy is `apt-get install -y
postgresql-16-pgvector` (or the equivalent for your major version) and a re-run.

### 2.2 Classified skips — the register

A classified skip is a file `install-fresh` **expects** to fail on a fresh
install, for a stated reason, with a tracked resolution. It does not flip the
exit code. Anything not on this list that fails — deferred *or* hard — is now a
recorded shortfall and the install does not report success.

| File | Why it does not apply | Verified by | Resolution owner |
|---|---|---|---|
| `0008_critical_fk_delete_policies.sql` | Aborts on `user_sessions`, a table retired from the schema. Its FK-delete policies were ported to `db/migrations/20260730_fk_delete_policies_port.sql`, which is applied as a pre-overlay creator on every install. | Observed error on a clean install: `relation "user_sessions" does not exist`. The port applies (`✓ pre-overlay creator`), so the policies it carries are present. | superseded — delete the original once no environment replays the raw tree |
| `20260609_design_risk.sql` | `risk_items` / `risk_management_files` shapes collide with `shared/schema.ts` (ledger C-29). Both consumers are live, so the file cannot apply over the pushed shape without a rename decision. | Observed error on a clean install: `column "rmf_id" does not exist`. | ledger C-29 — needs a rename decision, not a deletion |

Two entries were **removed** from this register because they were not actually
blocked by what they claimed:

- `0004_workflow_performance_indexes.sql` — needed `document_audit_logs`.
- `0007_tenant_isolation_fixes.sql` — needed `module_documents`.

Both now apply, because §1 gave those tables a creator. Verified on a clean
install: classified skips went from 4 to 2 and the overlay applied 206 files.

### 2.3 `0007_tenant_isolation_fixes.sql` is now idempotent

Every statement in it was unconditional, which is correct exactly once. On a
re-run — after step 5 has attached `tenant_isolation_policy` to
`unified_documents` — `ALTER COLUMN organization_id TYPE integer` fails with
*"cannot alter type of a column used in a policy definition"*, and the bare
`ADD CONSTRAINT` / `CREATE INDEX` fail on duplicates. Each operation is now
guarded on the catalog state it is trying to reach. Its effect on a database
that has not had it applied is unchanged.

That failure was also **invisible**: the overlay counted hard failures, printed
them, and recorded nothing, so the installer still printed
`✅ Application schema install complete.` and exited 0 with a migration that had
errored outright. That hole is closed — see §3.

---

## 3. What `install-fresh` now verifies

Beyond the table count and presence lists it already had:

- **Schema provenance.** The drizzle entrypoint is read from `drizzle.config.ts`
  and reported; a snapshot of `public` base tables is taken after each creator,
  so every required table is reported with the step that created it.
- **Required-object contract.** Seven capabilities, each with its required
  columns, primary key, foreign keys, leading-column indexes and RLS posture.
  A table that exists with the wrong columns, no FKs or no policy is a shortfall
  by name. Registries with no tenant column declare `tenantColumn: null`, so
  "no policy" is a stated decision rather than an inferred absence.
- **Tenant-isolation coverage.** `scripts/db/rls-coverage-check.sql` — the repo's
  own gate, run rather than re-implemented, so it stays on the single-source
  allowlist that `ci:rls-allowlist-sync` pins.
- **Overlay hard failures.** Now recorded as shortfalls unless classified.

### The tenant-isolation leak this found

`db/migrations/063_gcc_cognitive_agent_runtime.sql` creates three public tables
with an integer `tenant_id` and no RLS of its own:

- `cognitive_agent_definitions`
- `cognitive_agent_threads`
- `cognitive_governance_constraints`

It runs in step 6, **after** `0021_enable_rls_everywhere.sql` has swept in step
5, so all three shipped cross-tenant readable on every fresh install. A policy
*count* could never catch this — adding unprotected tables makes the count go up.

Fixed by re-running the canonical
`db/migrations/20260801_tenant_isolation_sweep.sql` at the end of step 6 — the
same file that already runs last on the deploy path, for the same reason.
Reusing it keeps one sweep, one policy shape, one allowlist.

### The policy-on-the-wrong-column defect this found

`migrations/0021_enable_rls_everywhere.sql` yielded a table **once per matching
tenant column** and did `DROP POLICY IF EXISTS` + `CREATE POLICY` on each pass.
On a table with more than one tenant column the alphabetically last one silently
overwrote the earlier policy, so `tenant_id` beat `organization_id` every time.

Six tables have that shape:

`stability_studies`, `cmc_batch_records`, `cmc_comparability_assessments`,
`cmc_documents`, `multi_agency_validation_sessions`, `c2c_bla_assessments`

On all six, `organization_id` / `org_id` is the NOT NULL key writers stamp
(`server/api/cmc/routes.ts` inserts `organizationId`), while `tenant_id` is a
**nullable adapter column** added by
`db/migrations/20260401_cmc_convergence_os.sql`.

The consequence is not a leak — it is a dead surface. `NULL = <tenant>` is NULL,
so under `RLS_ENFORCE=on` nothing passes `USING` and nothing passes `WITH CHECK`:
every read returns zero rows and every INSERT fails with *"new row violates
row-level security policy"*. Every existing gate stayed green throughout, because
a policy **was** attached and the policy count **did** go up. It was found by
connecting as `app_service` and trying an ordinary tenant-scoped read — which is
the whole argument for testing behaviour rather than catalog shape.

Fixed in two places, because they answer different databases:

- `0021` now selects **one column per table** with `DISTINCT ON` and an explicit
  precedence — `organization_id` > `org_id` > `tenant_id`, the order
  `server/db/rlsEnforcement.ts` and `rls-coverage-check.sql` already use. Fresh
  installs are correct at the source.
- `db/migrations/20260801_tenant_isolation_sweep.sql` gained a **repoint pass**.
  0021 is ledger-guarded and will not re-run on a database that already has it,
  so the sweep is how existing databases converge. It touches only the generated
  `tenant_isolation_policy` name, and only when the table has a higher-precedence
  tenant column than the one the policy references — a hand-tuned or
  parent-scoped policy is never touched, and a table whose only tenant column is
  `tenant_id` is left exactly as it is.

Verified: the sweep repointed 4 tables on an already-provisioned database, a
second run repointed 0, and
`tests/db/provisioned-tenant-tables-rls.dbtest.ts` went from 2 failures to 11
passes.

---

## 4. Runtime role and RLS verification

`app_service` (`scripts/db/provision-app-role.mjs`) is minted
`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`, granted
full DML on every application schema except `audit` (SELECT + INSERT only, so a
compromised app process cannot rewrite the Part 11 trail) and `extensions`
(SELECT only).

Provisioning is opt-in: it is a no-op unless `APP_SERVICE_DB_PASSWORD` is set.
When it is set, `install-fresh` step 8 refuses to finish if the role is a
superuser, holds BYPASSRLS, cannot log in, cannot read a core tenant table, or
lacks `USAGE` on any application schema.

Behaviour under that role is asserted by
`tests/db/provisioned-tenant-tables-rls.dbtest.ts`, against **real provisioned
tables** rather than a scratch table:

- tenant-scoped read returns that tenant's rows and no other's;
- cross-tenant read of a known row returns nothing;
- tenant-scoped write succeeds and stays invisible to the other tenant;
- cross-tenant INSERT is refused by `WITH CHECK`;
- cross-tenant UPDATE and DELETE affect zero rows, and the row is unchanged;
- an unscoped connection sees nothing;
- the policy keys on `organization_id`, not the nullable `tenant_id` adapter;
- audit tables are append-only for the role (SELECT/INSERT yes, UPDATE/DELETE no);
- `audit_logs` refuses UPDATE and DELETE with `IMMUTABILITY_VIOLATION` /
  `P0A01` / `P0A02`, and the authorized archival bypass still deletes;
- `assessRlsCatalogPosture` rejects the superuser/owner connection and raises no
  role-related failure for `app_service`.

Run it with `npm run test:db` against an `install-fresh` + `deploy-migrate`
database. The suite fails — it does not skip — when the tables are absent.

### The audit guard that never raised what it declared

`db/migrations/20260617_audit_logs_immutability.sql` and
`db/migrations/20260222_audit_events_immutability.sql` both wrote their guard as

```sql
RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: … are append-only'
USING ERRCODE = 'P0A02', MESSAGE = 'IMMUTABILITY_VIOLATION', DETAIL = …
```

PostgreSQL rejects that — the message is given twice — so all six triggers
aborted with `ERROR: RAISE option already specified: MESSAGE` (SQLSTATE 42601)
instead of the `P0A0x` `IMMUTABILITY_VIOLATION` they declare. The write was
still blocked, so no audit history was ever at risk; but the error code and
message were both wrong, and every caller that matches on
`/IMMUTABILITY_VIOLATION/` (`server/routes/audit-trail-routes.ts`,
`server/startup/middleware.ts`, the esig and orchestrator contract tests) would
have failed to recognise it. Nothing had ever executed the failure path.

Fixed by removing the redundant `MESSAGE =` option, keeping the RAISE literal as
the message — the form the repo's other immutability triggers already use.
Verified by running the path: UPDATE → `P0A01`, DELETE → `P0A02`, both carrying
the full DETAIL and HINT, and `SET LOCAL app.audit_archive_bypass = 'on'` still
lets the retention service delete.

One consequence worth naming: `tests/db/c2c-project-persistence.dbtest.ts` tore
down its probe rows with a bare `DELETE FROM audit_logs`, which only ever
succeeded because the first run had nothing to delete and later runs died on the
malformed RAISE rather than on the guard. It now opts into the same authorized
archival path, so `npm run test:db` is re-runnable against one database.

---

## 5. Verification commands

```bash
git branch --show-current                       # concept2cure-v2

DATABASE_URL='postgresql://…/concept2cure-ri' \
NODE_ENV=development \
node scripts/db/install-fresh.mjs               # exit 0 only when complete

DATABASE_URL='postgresql://…/concept2cure-ri' \
APPLY_C2C_MIGRATIONS=true \
node scripts/db/apply-c2c-migrations.mjs        # 0 failures

DATABASE_URL='postgresql://…/concept2cure-ri' \
node scripts/db/readiness-audit.mjs

DATABASE_URL='postgresql://…/concept2cure-ri' \
node scripts/db/deploy-smoke-assert.mjs

npm run build
```

### Results on the run that produced this document

Local PostgreSQL 16.13 + pgvector 0.6.0, database `concept2cure-ri` built from
blank:

| Step | Result |
|---|---|
| `install-fresh` (clean) | exit 0 · 789 tables · 806 policies · 206 overlay files applied · 2 classified skips · required objects 7/7 |
| `install-fresh` (re-run) | exit 0 · overlay `hard=0` · classified skips unchanged · provenance reports "pre-existing" |
| `apply-c2c-migrations` | exit 0 · 193 files applied · 0 failures · idempotent on a second run |
| `deploy-migrate` | exit 0 · authoring 19/19 · tenant-parentage FKs 6/6 · policies 19/19 |
| `readiness-audit` | exit 0 · 0 FAIL (13/17, remainder are pre-existing WARNs) |
| `deploy-smoke-assert` | exit 0 · every invariant holds |
| `npm run test:db` | 10 files, 95 tests, all passing under `RLS_ENFORCE=on` — twice in a row against the same database |
| `npm run build` | exit 0 |

CI gates re-run clean: `ci:migration-reachability`, `ci:duplicate-table-ddl`,
`ci:migration-prefix-collisions`, `ci:rls-allowlist-sync`, `ci:db-test-isolation`,
`ci:unbacked-tables`, `ci:tenant-column-types`, `ci:orm-reachability`,
`ci:tables-live-schema`, `ci:baseline-justifications`, `test:ops-audits` (53
tests), `test:security` (279 tests), `tests/schema-contract` (58 files, 718
tests).

`install-fresh` is idempotent; re-running it against a provisioned database is
supported and expected. Note that `drizzle-kit push` introspects the entire
database on every run, so step 2 takes minutes on an already-provisioned one —
that is introspection cost, not a hang.

---

## 6. Neon validation

Neon must be validated against the **direct admin host** (`ep-*.neon.tech`),
never a `*.pooler.*` host — `drizzle.config.ts` refuses a pooler URL for exactly
this reason, because DDL through the pooler is not session-stable.

```bash
# Scratch database on the direct host, admin credentials.
export DATABASE_URL_ADMIN='postgresql://…@ep-xxxx.<region>.aws.neon.tech/c2c_scratch?sslmode=require'
export APP_SERVICE_DB_PASSWORD='<generated, ≥12 chars>'

DATABASE_URL="$DATABASE_URL_ADMIN" node scripts/db/install-fresh.mjs
DATABASE_URL="$DATABASE_URL_ADMIN" APPLY_C2C_MIGRATIONS=true node scripts/db/apply-c2c-migrations.mjs
DATABASE_URL="$DATABASE_URL_ADMIN" node scripts/db/deploy-smoke-assert.mjs

# Runtime role, separate URL, non-superuser.
export APP_DATABASE_URL='postgresql://app_service:…@ep-xxxx.<region>.aws.neon.tech/c2c_scratch?sslmode=require'
DATABASE_URL="$DATABASE_URL_ADMIN" TEST_DATABASE_URL="$DATABASE_URL_ADMIN" \
  RLS_ENFORCE=on npm run test:db
```

`sslFor()` verifies the server certificate for any non-local URL; if a provider
chains to a CA outside Node's trust store, supply it with `NODE_EXTRA_CA_CERTS`
rather than disabling verification.

**Not executed in the session that produced this document** — no Neon
credentials were available there. Everything above was validated against a local
PostgreSQL 16 with pgvector 0.6.0. Neon-specific behaviour (direct-host DDL, its
superuser posture, `CREATE ROLE` permissions on the admin role) remains
unverified until someone runs the block above.
