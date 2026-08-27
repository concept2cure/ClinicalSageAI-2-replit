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

### Runtime DDL: `regulatory_twin_simulations`

`server/routes/regulatory-digital-twin.ts` created its own table at module load
— `CREATE TABLE IF NOT EXISTS` inside a try/catch that logged a warning and
carried on. The table therefore existed only on a database whose application
process had booted, never on one built by provisioning alone, and
`ci:tables-live-schema` flagged the route's own queries as reading a table
nothing creates. (The route's `/health` handler ends
`catch { /* table may not exist yet */ }`, which is what code written around an
unreliable table looks like.)

Runtime DDL is a bad fit here for three separate reasons: it runs as the
application role, which under the `app_service` split has no `CREATE` right; it
runs after the routes are already mounted; and its failure is swallowed. The
identical DDL is now `migrations/20260821_regulatory_twin_simulations.sql` on
`C2C_MIGRATION_FILES`, and the runtime DDL is deleted in the same change — one
creator, not two.

**And it was cross-tenant.** The table had no tenant column and the route
queried it with no predicate —
`SELECT … FROM regulatory_twin_simulations ORDER BY created_at DESC LIMIT 100` —
so `GET /simulations` returned every tenant's rows, `GET /simulations/:id`
returned any tenant's row to anyone holding the id, and `GET /health` reported
how many simulations every other customer had run. The stored
`submission_profile` carries submission type, therapeutic area and target
agencies, which on a platform holding unannounced programmes is the
confidential part.

Closed on both layers, because either alone is insufficient:

- `db/migrations/20260821_regulatory_twin_simulations_tenant_scope.sql` adds
  `organization_id` (FK to `organizations`, indexed) and the canonical sweep
  policies it. The column is added NULLABLE and tightened to NOT NULL only when
  no row is left unattributed — on a database where the old runtime DDL ran,
  those rows have no tenant and nothing to infer one from, so they stay NULL,
  which the policy treats as matching nobody. Previously visible to everyone,
  now visible to no one, and no data destroyed; the migration's NOTICE says how
  many are in that state.
- `server/routes/regulatory-digital-twin.ts` derives the org from
  `getSecureOrgId()` (verified JWT, never a client header) and filters every
  read and stamps every write. A request with no verified organization gets 403
  and issues no query at all — the pre-fix answer to a tenant-less request was a
  full-table read, so "no org" has to be a refusal rather than a wider query.
  `GET /health` now reports the caller's count, or `null` with no org, instead
  of a platform-wide total.

RLS is the backstop, not the boundary: it only filters for the non-superuser
role and only under `RLS_ENFORCE=on`. `server/routes/__tests__/regulatory-digital-twin.tenant-scope.test.ts`
asserts the app-layer predicate directly by inspecting the SQL the router
issues — asserting on the response body would pass against a handler that read
every tenant and filtered in JavaScript. Restoring the unscoped query fails 2 of
its 7 cases.

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
- `db/migrations/20260801_tenant_isolation_sweep.sql` gained a **rebuild pass**.
  0021 is ledger-guarded and will not re-run on a database that already has it,
  so the sweep is how existing databases converge. It touches only the generated
  `tenant_isolation_policy` name, on public tables whose preferred tenant column
  is an integer — a hand-tuned or parent-scoped policy is never touched, and a
  table whose only tenant column is `tenant_id` is left exactly as it is.

Verified: the sweep repointed 4 tables on an already-provisioned database, a
second run repointed 0, and
`tests/db/provisioned-tenant-tables-rls.dbtest.ts` went from 2 failures to 11
passes.

### The cast that turned every tenant query into a 500

The canonical policy carried this disjunct, on all ~800 tenant tables:

```sql
OR <col> = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT
```

`app.current_org_id` holds the org **UUID**.
`server/middleware/establishRequestTenantScope.ts` sets `app.current_tenant_id`
to the integer org id and `app.current_org_id` to the uuid, and every non-public
policy compares that GUC as `::uuid`. Casting it to `INT` is a category error,
and PostgreSQL does not guarantee OR short-circuiting — so for any row the
earlier disjuncts do not satisfy, the cast **is** evaluated:

```
ERROR:  invalid input syntax for type integer: "d0211565-c7f2-402f-ad10-e4211e683857"
```

That is every read and every write of every integer tenant-keyed table on any
connection **where `app.current_org_id` actually holds the uuid**, in every RLS
mode — the shadow-mode bypass is just another disjunct and does not stop the
cast being evaluated.

### How live is it, measured rather than assumed

An earlier revision of this document said "on any connection carrying a real
request scope", which is **wrong**, and the correction is worth more than the
original claim.

Booting the app against a provisioned database as `app_service` with
`RLS_ENFORCE=on`, restoring the pre-fix cast on `regulatory_programs`, and
hitting `GET /api/regulatory-programs` returns **200 with the tenant's row** —
not a crash. A follow-up probe (a policy that divides by zero when
`app.current_org_id` is non-empty) also returned 200. So on that request path
the uuid GUC is **empty**, and RLS is filtering on `app.current_tenant_id`
alone — which it does correctly.

So the accurate statement is narrower:

- the crash needs `app.current_org_id` to hold a non-integer value;
- `server/middleware/establishRequestTenantScope.ts` is *designed* to put the
  org uuid there (`orgUuid ?? ''`), and the JWT carries `organizationUuid`, but
  on the path measured it arrives empty;
- the paths that definitely populate it are the ones passing it explicitly —
  `withTenantConnection({ orgUuid })`, `advancedRAGPipeline`, and
  `server/src/routes/stability.router.ts`.

It is therefore a **loaded landmine rather than a fire already burning**: it
fires the moment `attachOrgUuid` succeeds or an explicit-uuid path runs, and the
fix is still worth having for exactly that reason. What it is not is "the app
cannot read a tenant table today". It can, and does.

Two things hid it, and both are worth naming:

1. RLS only filters for a connection that is neither a superuser nor the table's
   owner, so on any deployment not yet serving requests through the split role
   the policy is never evaluated at all; and
2. every test that sets these GUCs — including
   `tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts` — sets
   `app.current_org_id` to `''`, the one value that avoids the cast.

So the defect was invisible precisely under the conditions the role split
removes — and stays invisible until something populates the org-uuid GUC, which
is why measuring it end to end mattered more than reasoning about it.

Fixed by **extracting** an integer instead of casting whatever is there:

```sql
OR <col> = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
```

NULL for a uuid (the disjunct is simply not satisfied), the integer when there
genuinely is one. The disjunct is fixed, not deleted: narrowing an RLS policy is
a security change, and this is only meant to stop it crashing. 44 occurrences
across 23 files — every place the policy text is written, including
`tests/db/harness.ts`, whose copy is diffed against the migration by
`rls-tenant-isolation.dbtest.ts`.

The sweep's rebuild pass also heals it on existing databases: a policy whose
qual lacks the `^[0-9]+$` marker is on the old shape. Verified — 750 policies
rebuilt on a provisioned database, 0 on the next run; a fresh install emits the
fixed shape for all 631 from 0021 directly; the middleware GUC shape reads its
own tenant's row, still returns nothing for another tenant's, still returns
nothing unscoped, and an actual integer in `app.current_org_id` still resolves.
`tests/db/provisioned-tenant-tables-rls.dbtest.ts` now scopes its connections
the way the middleware does — restoring the broken policy fails 6 of its cases.

#### What the rebuild pass must not touch

The first version of that pass matched on the policy NAME alone, and that was
wrong. `db/migrations/20260813_knowledge_graph_tenant_keys.sql` installs a
policy also called `tenant_isolation_policy`, on the knowledge-graph tables,
whose body is deliberately **stricter** — a bare
`organization_id = current_setting('app.current_tenant_id')`, with no
shadow-mode bypass and no super-admin escape, because the point of that
migration is that unattributed rows are served to nobody and an unscoped
connection sees nothing. Rebuilding it to the canonical text silently weakened
isolation on those three tables.

`tests/db/knowledge-graph-tenant-isolation.dbtest.ts` failed all six of its
isolation cases and caught it. The pass now additionally requires the canonical
template's own shadow-mode marker (`app.rls_enforce`) to be present in the qual,
so it can only ever repair policies it or 0021 wrote. Verified: the strict kg
policies survive the sweep untouched (`0 rebuilt`) and the suite is back to 7/7.

That is the whole argument for the rule this repo already has — a gate that has
only ever been seen to pass has not been tested. This one was made to fail, on
the case it exists to catch, before it was believed.

### The same cast again, under a different policy name

Fixing the canonical policy family was not the end of it. An audit of **every**
cast of a session setting in **every** policy — rather than the two GUCs already
known to be involved — found three shapes:

| Shape | Policies | Verdict |
|---|---|---|
| `current_setting('app.current_org_id')::integer`, unguarded | 9 | **live crash** |
| `current_setting('app.organization_id')::integer` | 5 | vestigial |
| `current_setting('app.is_admin')::boolean` | 1 | safe |

The nine are `rls_org_*` on `csr_studies`, `ctd_programs` and seven CSR siblings,
generated by one loop in `migrations/0005_csr_knowledge_database.sql`. They cast
the org **UUID** to int and raise exactly as the canonical family did. They
survived that fix for a reason worth writing down: **the tenant sweep only ever
rebuilds a policy named `tenant_isolation_policy`.** A defect under any other
name is invisible to it.

Being PERMISSIVE alongside the canonical policy does not save them either.
PostgreSQL evaluates both sides of an OR, so the raise lands before the healthy
policy can admit the row — confirmed by reading `csr_studies` (20 rows) as
`app_service` under the middleware GUC shape.

The other two are not defects, and it is worth saying why rather than leaving
them looking suspicious:

- `app.organization_id` has **no writer anywhere in `server/`**, so it is always
  unset; `NULL::integer` is NULL, which never raises. Each of those five tables
  also carries the canonical policy, and PERMISSIVE policies OR together, so the
  vestigial one blocks nothing. Dead weight, not a fault.
- `app.is_admin` is only ever written as the literal `'true'`. Unset yields NULL
  → no rows, which is fail-closed. Only a non-boolean, non-empty value would
  raise, and nothing writes one.

Fixed at the source in `0005`, and the heal migration widened to repair an
unguarded cast under **any** policy name, integer or uuid. Verified: 9 repaired
on a provisioned database, 0 on the next run, the crash gone, isolation
unchanged (own tenant sees its row through either GUC, another tenant sees
nothing), and a deliberately re-broken policy healed again on the following run.

Two things the widening got wrong first, both caught by running it: selecting on
"names the GUC and ends in `::integer`" also matched the already-guarded form, so
three healthy tables were reported as needing manual review — the branches now
exclude their own guarded marker; and the success notice said every repair went
"through `identity.current_org_id()`", which is only true of uuid casts.

---

### UUID-native tenant schemas — the mirror-image cast, and it was live

The non-public schemas key on a uuid. Isolation itself is correct — executed
against `core.programs` as `app_service` with two real tenants, each uuid sees
only its own row, and an unset GUC sees both (the documented context-less-safe
path for background jobs that never establish a tenant).

The casts were not. 48 policies read `app.current_org_id` and cast it straight
to uuid, 19 of them without even a `NULLIF`:

```sql
organization_id = current_setting('app.current_org_id', true)::uuid
```

`''::uuid` does not yield NULL — it raises. And `''` is exactly what the
codebase writes on the scopes it uses most: `systemSessionVars()` (the
cross-tenant super-admin scope), `tenantSessionVars()` whenever `orgUuid` is
null, and the reset paths in `lazyRequestDbClient`, `withTenantConnection` and
`poolInstrumentation`. Measured on a provisioned database — reading
`cortex.knowledge_gaps` as `app_service`:

| `app.current_org_id` | Before | After |
|---|---|---|
| `''` (system scope) | `ERROR: invalid input syntax for type uuid: ""` | 1 row |
| unset (raw pool) | 1 row | 1 row |
| the row's own uuid | 1 row | 1 row |
| another tenant's uuid | 0 rows | 0 rows |
| a non-uuid string | error | treated as no context |

So this was **live, not latent** — my first pass called it latent, having tested
only the `COALESCE(NULLIF(…))` variant on `core.programs` and not the 19 without
the NULLIF. Same root cause as the integer-side cast, and invisible for the
same reason: RLS is inert for an owner or superuser connection, so nothing
evaluates the policy until the split role is in use.

Fixed by routing every read through the one helper that already existed for it,
`identity.current_org_id()`, and making that helper extract rather than cast:

```sql
SELECT substring(current_setting('app.current_org_id', TRUE)
                 from '^[0-9a-fA-F]{8}-…-[0-9a-fA-F]{12}$')::UUID;
```

That collapses 25 inline copies of the expression down to one, and preserves
every intended behaviour: a `COALESCE(helper, col)` wrapper still falls through
to "no tenant context, see everything"; a bare `col = helper` still matches
nothing; a real uuid still resolves to its tenant. The only change is that `''`
and other non-uuid values stop raising — a non-uuid is now treated as *no
context*, which is what the enclosing policy shape already does when the GUC is
unset, so nothing is widened beyond what that shape already permits.

`db/migrations/20260821_uuid_org_guc_cast_heal.sql` converges existing
databases. It has to carry the guarded function body as well as repoint the
policies: the fixed definition lives in the governed-content tree, which
`deploy-migrate` deliberately does not apply, so repointing policies at a helper
that still held the unguarded body would just move the raise one call deeper. It
rewrites surgically — `pg_get_expr` to read each policy's current expressions,
a string replace of only the cast fragment, `ALTER POLICY` to put them back — so
policy names, roles and commands are untouched and any unrecognised spelling is
reported rather than rewritten. Verified: 49 expressions repointed, 0 on the
second run, 0 inline casts left in the catalog, and a deliberately re-broken
policy is healed on the next run with isolation intact.

---|---|
| tenant A's uuid | only A's row |
| tenant B's uuid | only B's row |
| unset / `''` | both rows — the documented cross-tenant background-job path |
| an integer | `ERROR: invalid input syntax for type uuid` |
| any non-uuid | same error |

Isolation is correct. The last two rows are the exact mirror image of the
integer-side defect above, and they are **latent, not live**: all ten writers of
`app.current_org_id` in the repo set a uuid or `''`
(`establishRequestTenantScope`, `withTenantConnection`, `lazyRequestDbClient`,
`poolInstrumentation`, `advancedRAGPipeline`, `stability.router`). Nothing is
broken today, so this is left as a recorded risk rather than another sweep over
the uuid policies. The remedy, if a caller ever sets a non-uuid, is the same
shape as the fix above — extract rather than cast:
`substring(current_setting('app.current_org_id', true) from '^[0-9a-fA-F-]{36}$')::uuid`.

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

## 4b. Apply order is checked before every push

`C2C_MIGRATION_FILES` has two positional invariants: the integer tenant sweep
must be the **last** entry (ledger C-33) and the uuid non-public step must be
immediately before it (C-46). A file ordered after either one is never swept, so
a tenant-keyed table ships with **no policy** — silently, because the policy
count goes *up* when unprotected tables are added.

Three contract tests already pinned this, and it still reached the default
branch broken: `migrations/20260821_vault_documents_canonical_shape.sql` was
appended after the sweep and all three were red on origin until someone looked.
Nothing in `.husky/pre-push` checked ordering, and `tests/schema-contract` takes
about five minutes, so it is not run before a push. A guard nobody can afford to
run is not a guard.

`scripts/ci/check-migration-set-order.mjs` does the positional subset in ~55 ms
— no database, no PGlite, no vitest — and runs in `pre-push` beside the eCTD,
risk-code and ledger gates. It checks four things: sweep last, uuid step in the
final pair, every listed file present on disk, no duplicates. Each was made to
fail on its own case before being believed, and the hook was shown to block the
exact append that reached origin.

The anchor path used to be hardcoded in four places — three contract tests plus
the list itself — so the invariant had four copies and no definition. It is now
exported from `scripts/db/migration-set.mjs` as `TENANT_ISOLATION_SWEEP` /
`UUID_TENANT_ISOLATION_NONPUBLIC`, used by the list entries themselves, and
imported by the gate and all four tests. (`scripts/ci/check-rls-allowlist-sync.mjs`
keeps its own literal: there the path is one row in a table of files to *parse*
for allowlist arrays, and importing a single entry would leave it inconsistent
with its siblings.)

One consequence worth naming: `document-span-lineage.contract.test.ts` asserted
apply order by comparing `indexOf` **byte offsets** of the two quoted paths in
the source text of `migration-set.mjs`. That proxy broke the moment an entry
stopped being a bare string literal. It now measures the array, which is what
determines apply order and what the test always meant.

---

## 4c. The app, running on it

Provisioning is only interesting if the application actually serves from it. The
chain was booted end to end against a provisioned database:

| Posture | Result |
|---|---|
| dev (`postgres`, `RLS_ENFORCE=shadow`) | boots; `/readyz` → `database: ok`, `schema: ok`, `schemaState: ready` |
| **production (`app_service`, `RLS_ENFORCE=on`)** | boots; same readiness; live tenant data served |

`/readyz` reports `ana: down` in both, with the reason: no AI provider key is
configured. That is an environment gap, correctly named rather than papered
over — the database and schema legs are green.

**A real write→read round trip**, authenticated as a seeded user whose JWT
carries `organizationId: 36`:

- `POST /api/c2c/projects` → **201**, and it did real work: a project, a
  document, **71 scaffolded sections**, a submission — a multi-table write
  across exactly the tables §1 and §2 gave creators to. It also reported
  `projectAnchorSkipped: "NO_CLIENT_WORKSPACE"` rather than silently faking the
  anchor.
- `GET /api/c2c/projects` → **200**, returns the project.
- `GET /api/c2c/rule-packs` → **200**, 30 seeded rule packs.
- Empty tables return honest empty collections, not fixtures and not errors.

All of the above holds under `app_service` with `RLS_ENFORCE=on`, which is the
configuration the role split exists for and which nothing had previously run.

One thing this surfaced, working as designed: with enforcement on, background
work that uses the **raw pool with no tenant scope** is refused —
`[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while
RLS_ENFORCE=on`, seen from the sentinel scheduler and a feature-flag read. That
is the guard doing its job, and it is the signal that those jobs need a
tenant-scoped or explicitly super-admin-scoped connection before enforcement is
turned on in production.

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

Local PostgreSQL 16.13 + pgvector 0.6.0. The final row of each measurement is
from one uninterrupted chain on a database built from blank —
`install-fresh` → `deploy-migrate` → `apply-c2c-migrations` →
`deploy-smoke-assert` → `readiness-audit` → `ci:tables-live-schema` →
`test:db` ×2:

| Step | Result |
|---|---|
| `install-fresh` (clean) | exit 0 · 789 tables · 806 policies · 206 overlay files applied · 2 classified skips · required objects 7/7 |
| `install-fresh` (re-run) | exit 0 · overlay `hard=0` · classified skips unchanged · provenance reports "pre-existing" |
| `apply-c2c-migrations` | exit 0 · 193 files applied · 0 failures · idempotent on a second run |
| `deploy-migrate` | exit 0 · authoring 19/19 · tenant-parentage FKs 6/6 · policies 19/19 |
| `readiness-audit` | exit 0 · 0 FAIL (13/17, remainder are pre-existing WARNs) |
| `deploy-smoke-assert` | exit 0 · every invariant holds |
| `ci:tables-live-schema` | exit 0 · no new references to absent tables (83 baselined) |
| `npm run test:db` | 10 files, 96 tests, all passing under `RLS_ENFORCE=on` — twice in a row against the same database |
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

### It runs in CI now

`.github/workflows/neon-provisioning.yml` does the above on a schedule (weekly)
and on demand, so the criterion is executed rather than documented. It creates an
ephemeral Neon branch with the pinned `neondatabase/create-branch-action` the
repo already uses, makes a **blank** database inside it (a Neon branch is a
copy-on-write clone of its parent, so the branch's own database is not empty),
asserts the endpoint is the direct host rather than the pooler, runs the full
chain — refuse-on-blank, install-fresh ×2, deploy-migrate ×2, apply-c2c ×2,
deploy-smoke, readiness-audit, `ci:tables-live-schema`, `test:db` under
`RLS_ENFORCE=on` — and deletes the branch in an `always()` step.

Two deliberate choices:

- **It does not run per-PR.** Each run costs a Neon branch, for a property that
  changes rarely. Run it by hand before any release touching `scripts/db/` or
  `migrations/`.
- **A missing secret fails the job rather than skipping it.** A skipped job
  reports green, and "Neon provisioning passes" would then be a claim nobody
  checked — the same failure `install-fresh` exists to prevent, one level up. The
  graceful skip in `c2c-agent.yml` exists for fork PRs, which cannot reach this
  workflow (no `pull_request` trigger).

An `APP_SERVICE_DB_PASSWORD` is generated per run and masked before export, so
the run exercises the non-superuser role split — the part a managed host, where
the admin role is a superuser, is uniquely able to falsify.

**Still unverified at the time of writing:** nobody has run it yet. The session
that produced this document had no Neon credentials, and the GitHub token it
used lacked `actions: write`, so it could not dispatch the workflow either.
Everything else here was measured against a local PostgreSQL 16.13 with pgvector
0.6.0. The first scheduled or dispatched run is what turns Neon-specific
behaviour — direct-host DDL, certificate verification, and whether Neon's admin
role can `CREATE ROLE` — from expected into observed. Expect the first run to
find something: nothing has ever exercised `install-fresh` against Neon.

Dispatch it from
<https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/workflows/neon-provisioning.yml>
("Run workflow"), or `gh workflow run neon-provisioning.yml --ref concept2cure-v2`.
