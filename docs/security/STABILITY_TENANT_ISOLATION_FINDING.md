# Security Finding: Stability module tenant isolation is non-functional

**Severity:** High (cross-tenant read/write on GMP-regulated stability data)
**Status:** **Remediated for existing tables** (see "Remediation delivered" below) — the seven
unbacked `stab_*` tables + `cmc_methods` + the two views are backed-with-isolation as a tracked
follow-up (they 500 today, so they are fail-safe until then).
**Discovered:** 2026-07-28, during the AnA-1 assessment G-02 (unbacked-table) burndown
**Surface:** `server/src/routes/stability.router.ts` (mounted at `/api/stability`) and the `stab_*` schema
**Related:** assessment finding G-02 (this is why the stability tables must **not** be naively backed)

---

## Remediation delivered (2026-07-28)

The fix aligns the stability module with the app's **canonical** RLS instead of its bespoke (inert)
`app.tenant_id` scheme:

1. **`db/migrations/20260728_stability_tenant_isolation.sql`** — for every existing `stab_*` base
   table: adds an integer `tenant_id` (0021 requires integer keys), defaults it to
   `current_setting('app.current_tenant_id')` so the router's tenant-less `INSERT`s auto-tag, and
   installs `ENABLE`/`FORCE ROW LEVEL SECURITY` + the **identical `tenant_isolation_policy`** shape as
   `migrations/0021_enable_rls_everywhere.sql` (shadow-mode gated on `app.rls_enforce`, keyed on
   `app.current_tenant_id`/`app.current_org_id`, `app_super_admin` escape hatch). On the durable
   applier path; idempotent; a no-op where the tables do not yet exist.
2. **`server/src/routes/stability.router.ts`** — the module `pool` is replaced by a fail-closed,
   tenant-scoped facade that derives the tenant from the request ALS (`getTenantScope()`) and sets the
   **canonical** session vars on the connection (`.query()` is_local in a transaction; `.connect()`
   session-level with clear-on-release). No stability query can run without a tenant boundary. The
   inert `set_config('app.tenant_id', …)` blocks are superseded.
3. **`tests/schema-contract/stability-tenant-isolation.contract.test.ts`** — golden PGlite proof under
   a non-superuser role with `rls_enforce=on`: INSERTs auto-tag, and a second tenant's `SELECT`/`UPDATE`
   by surrogate id (`capa_id`, `study_id`) affect **zero** rows; shadow mode bypasses (proving the
   policy is what isolates); missing context is fail-closed.

**Follow-up (tracked):** create the seven unbacked `stab_*` tables + `cmc_methods` with `tenant_id`
from birth and define the two `v_stab_*` views, then drop them from `unbacked-tables-baseline.json`.

---

## Summary

The stability module's multi-tenant isolation is **declared but not enforced**. Queries scope by
opaque surrogate ids (`capa_id`, `assign_id`, `study_id`) with **no tenant predicate**, and the
`set_config('app.tenant_id', …)` calls that are supposed to provide isolation are inert because
**no RLS policy references `app.tenant_id`** and the `set_config` is mis-scoped so it never reaches
the query anyway. A user who knows (or enumerates) another tenant's `capa_id` / `assign_id` can read
and update that tenant's records.

## Evidence

1. **No tenant predicate in the queries.** `grep -icE 'where[^;]*tenant_id'` over the router → **0**.
   The dangerous by-id operations scope on the surrogate key alone:
   - `update stab_capa set … where capa_id=$1` (`stability.router.ts:2087`)
   - `select study_id from stab_capa where capa_id=$1` (`:2083`)
   - `update stab_assignments set … where assign_id=$1` (`:2396`)
   - `select * from stab_capa where study_id=$1` (`:2041`)

2. **The RLS context is inert.** `executeQuery` (`:131-151`) runs
   `SELECT set_config('app.tenant_id', $1, true)` with `is_local = true`, which scopes the setting to
   the *current transaction*. There is **no `BEGIN`**, so that statement is its own autocommit
   transaction and the value is discarded before the next `client.query()` (the real query) runs.
   And there is **no `CREATE POLICY` anywhere** referencing `app.tenant_id` (`grep 'app.tenant_id'`
   over `migrations/` + `db/` → 0 policy definitions), so even a persisted value would filter nothing.

3. **Mixed query paths.** Some routes bypass `executeQuery` and call `pool.query(...)` directly
   (e.g. `:2041`, `:2497`), so they set **no** tenant context at all.

4. **`INSERT`s do not write `tenant_id`** (e.g. `insert into stab_capa (study_id,title,why,actions,
   owner,due_date,status,linked_result_id,linked_oot)` — `:2057`). New rows would have `tenant_id
   NULL` even if the column existed.

5. **The tenancy scaffolding is not on the durable apply path.** `db/stability_constraints_ddl.sql`
   (the only file that adds `tenant_id` to `stab_*`) is an **ALTER-only** file that assumes the tables
   already exist, and neither it nor `022_stability_v2.sql` appears in
   `scripts/db/apply-c2c-migrations.mjs`. Seven `stab_*` tables have no `CREATE TABLE` at all
   (`stab_assignments`, `stab_capa`, `stab_chain`, `stab_excursions`, `stab_protocols`, `stab_samples`,
   `stab_signoffs`) plus `cmc_methods`, and two entries are **views** with no definition anywhere
   (`v_stab_due_tp`, `v_stab_upcoming_tp`).

## Why the tables must NOT be naively backed (the G-02 trap)

Today, on a fresh database, the unbacked-table routes fail *safe*: they 500 because the table does
not exist. Simply adding `CREATE TABLE` (the mechanical "burndown") would flip a broken feature into
a **working but tenant-leaky** one — strictly worse on a GMP surface. Backing these tables must be
done **together with** the isolation fix, never before it.

## Remediation (design)

Leverage the infrastructure already present (`set_config('app.tenant_id')`) by making it actually work
and enforcing it with RLS — no per-query rewrites:

1. **Fix the context helper.** In `executeQuery` / `executeInternalQuery` / `audit`, wrap the
   `set_config` + query in one explicit transaction (`BEGIN; SELECT set_config('app.tenant_id',$1,true);
   <query>; COMMIT;` with `ROLLBACK` on error) so the `is_local` value persists to the query.
2. **Route every query through the helper.** Replace the direct `pool.query(...)` call sites so no
   stability query runs without tenant context. (CI guard: grep the router for `pool.query(` = 0.)
3. **Provision `tenant_id` uniformly.** One canonical migration that (a) `CREATE TABLE`s the eight
   unbacked tables and (b) ensures every `stab_*` table has
   `tenant_id INTEGER NOT NULL DEFAULT current_setting('app.tenant_id', true)::int` — so the existing
   `INSERT`s (which omit `tenant_id`) auto-populate it from the session context.
4. **Enable RLS + policy** on every `stab_*` table:
   `USING (tenant_id = current_setting('app.tenant_id', true)::int)` and the same `WITH CHECK`.
5. **Views:** `v_stab_due_tp` / `v_stab_upcoming_tp` have no source definition in the repo and cannot
   be reconstructed from usage; they must be defined from the module spec (they read
   `study_id`-scoped timepoint due/upcoming logic) or the routes that use them retired.
6. **Put the migration on the durable apply path** (`apply-c2c-migrations.mjs`) and drop the backed
   tables from `unbacked-tables-baseline.json`.

## Blast radius & risk

Module-wide (~19 `stab_*` tables, every route in a 2,500-line router). Two failure modes to test
against: (a) RLS + a mis-scoped `set_config` returns **0 rows for everything** (module appears empty);
(b) a missed query path or a `NULL` `tenant_id` default **leaks or hides** rows. This is why it needs
a dedicated, fully-tested change rather than a burndown.

## Test plan (golden, PGlite)

- Under `set_config('app.tenant_id','1',true)` inside a transaction, tenant 1 inserts a `stab_capa`;
  its `tenant_id` is 1 (populated by the default).
- Under tenant 2's context, `select * from stab_capa where study_id=<t1 study>` and
  `update stab_capa … where capa_id=<t1 capa>` affect **zero** rows.
- A route path that bypasses the helper is a test failure (static grep guard).
