# Security Finding: Stability module tenant isolation is non-functional

**Severity:** High (cross-tenant read/write on GMP-regulated stability data)
**Status:** Open — remediation specified below, not yet implemented
**Discovered:** 2026-07-28, during the AnA-1 assessment G-02 (unbacked-table) burndown
**Surface:** `server/src/routes/stability.router.ts` (mounted at `/api/stability`) and the `stab_*` schema
**Related:** assessment finding G-02 (this is why the stability tables must **not** be naively backed)

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
