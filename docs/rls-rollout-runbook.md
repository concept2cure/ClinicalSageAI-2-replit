# RLS rollout runbook

How to take tenant-isolation row-level security from "compiled but bypassed"
to "actively filtering" without breaking production. Operator-driven; no part
of this should run automatically.

This document captures the state as of branch `claude/audit-db-tech-stack-0f1zt`.
The migrations and code referenced here all live on that branch.

## What's already shipped

- **`migrations/0019_tenant_column_audit.sql`** — read-only audit; emits
  NOTICE for each tenant column whose type is not INTEGER.
- **`migrations/0020_coerce_text_tenant_columns.sql`** — converts the four
  drifted columns to INTEGER, abort-guarded against non-numeric data.
- **`migrations/0021_enable_rls_everywhere.sql`** — installs the
  `tenant_isolation_policy` on every tenant-keyed table outside the
  allowlist. ENABLE + FORCE row-level security (FORCE is required because
  on Neon the app role is the table owner). Default-bypassed via the
  `app.rls_enforce` session var.
- **`scripts/db-rollback/0021_disable_rls_everywhere.sql`** — drops the
  policy, NO FORCE, DISABLE.
- **`server/db/rlsAllowlist.ts`** — single source of truth for the
  six-table allowlist. CI gate
  `scripts/ci/check-rls-allowlist-sync.mjs` keeps it in sync with the SQL.
- **`server/db/rlsEnforcement.ts`** — Pool 'connect' handler that reads
  `RLS_ENFORCE` from env and sets `app.rls_enforce` on every connection.
- **`server/db/withTenantConnection.ts`** — helper for non-request code
  paths (cron, scripts) to get a connection with the tenant session vars
  already set. Already used by `memory-consolidation-job`.
- **`server/db/requestDb.ts`** — helper for route handlers to get a
  Drizzle instance bound to `req.dbClient` instead of the shared pool.
  Worked example: gap-analysis insert in `routes/ana-features.ts`.
- **PR A observability** — pool instrumentation increments
  `tenant_session_var_present_total` / `tenant_session_var_missing_total`
  on every query. Logged at WARN with `caller` (file:line) for misses,
  rate-limited per caller per 30s.

## The flip sequence

The whole rollout is gated on a single env var: `RLS_ENFORCE`.

| Value          | Effect                                                      |
| -------------- | ----------------------------------------------------------- |
| unset / `off`  | Policy installed, every row passes. Default.                |
| `shadow`       | Same as off. Intent: "we're watching."                      |
| `on`           | Policy filters. The flip.                                   |

### 1. Land the SQL

```bash
# Apply migrations in order — the existing tooling reads migrations/*.sql.
psql "$DATABASE_URL" -f migrations/0019_tenant_column_audit.sql
psql "$DATABASE_URL" -f migrations/0020_coerce_text_tenant_columns.sql
psql "$DATABASE_URL" -f migrations/0021_enable_rls_everywhere.sql
```

`0019` will print NOTICE lines for any drifted column it finds. Capture
them — if the count is non-zero on production data, triage before
running `0020`.

`0020` is two-phase: validates every value against `^-?[0-9]+$`, then
ALTERs. If validation finds non-numeric values, the whole transaction
rolls back and the migration prints which column had how many bad values.

`0021` refuses to attach the policy to a non-INTEGER tenant column, so
running it before `0020` will fail loud rather than silently skipping
tables.

### 2. Verify shadow mode in staging

Deploy the application code to staging with `RLS_ENFORCE` unset (or
explicitly `shadow`).

Confirm:

- Application boots (logger emits "RLS enforcement mode installed
  { mode: 'off' }" once at startup).
- Live traffic continues to return data — every row passes the policy
  because the bypass clause matches.
- Prometheus: `tenant_session_var_present_total` and
  `tenant_session_var_missing_total` are both incrementing. Healthy
  pattern is `present > 0` with `missing` slowly growing as legacy
  call sites get exercised.

If `present` is zero, the middleware's `runWithTenantScope` is not
reaching query call sites — investigate before going further.

### 3. Watch the missing-counter

Pull the per-caller breakdown:

```promql
sum by (caller) (
  rate(tenant_session_var_missing_total[1h])
)
```

The labels are `file:line` strings (with stack-walked caller inference).
Each spike is a call site that issues queries from outside any tenant
scope. For each:

1. **If it's a route handler** (path starts with `server/routes/` or
   `server/api/`): convert it to use `requestDb(req)` — see the
   gap-analysis insert at the bottom of `server/routes/ana-features.ts`
   for the worked example. The change is mechanical:
   - import `requestDb` from `../db/requestDb`
   - replace `db.select()...` / `db.insert(...)` with
     `requestDb(req).select()...`
2. **If it's a worker / cron / script**: wrap the work in
   `withTenantConnection({ tenantId, source: 'job' }, async (client) => { ... })`.
   For cross-tenant scans, pass `role: 'app_super_admin'` — see
   `findStaleMemories` in `services/memory-consolidation-job.ts`.
3. **If it's infrastructure** (health checks, metrics scraping,
   `SELECT 1`): add the query text to the `INFRASTRUCTURE_QUERIES`
   allowlist in `server/db/poolInstrumentation.ts`.

Goal: drive the missing-counter to zero. Wait at least 48 hours of
zero in production traffic before considering the flip.

### 4. Flip in staging

```
# Set in the staging env config:
RLS_ENFORCE=on
```

Recycle the application pool (process restart). The `connect` handler
in `rlsEnforcement.ts` will set `app.rls_enforce='on'` on every new
connection.

Smoke-test: load a real tenant's dashboard. Documents and projects
must appear. If lists go empty, see "rollback" below.

### 5. Soak in staging

Run integration tests. Run the cron jobs (or wait for them).
Specifically watch:

- `memory-consolidation-job` — its inner SELECT runs under
  `app_super_admin` so it should keep returning rows. Its INSERT runs
  under the per-tenant scope from `withTenantConnection`. If
  consolidation count goes to zero, the super-admin clause isn't
  matching — check `app.current_user_role` is being set on the
  connection.
- Auth flow — `requireTenantContext` middleware queries
  `organization_users` to resolve the user's role. That table is in
  `RLS_ALLOWLIST` so the query is unaffected. If logins start 403'ing,
  the allowlist drifted (CI gate should have caught this; rerun
  `node scripts/ci/check-rls-allowlist-sync.mjs`).

48 hours of clean staging is the bar before promoting to prod.

### 6. Flip in production

```
RLS_ENFORCE=on
```

Recycle the prod pool.

## Rollback

Two levels, in order of severity:

### Soft rollback — disable enforcement

```
RLS_ENFORCE=off
```

Recycle the pool. The bypass clause re-engages on every new connection;
queries return rows again. The policy itself stays installed. Use this
for any unexpected issue once flipped — it's instant and reversible.

### Hard rollback — remove the policy

```bash
psql "$DATABASE_URL" -f scripts/db-rollback/0021_disable_rls_everywhere.sql
```

Drops the `tenant_isolation_policy` from every table that has it,
NO FORCEs, DISABLEs row-level security. Idempotent. Use only if the
policy itself is broken (not just the enforcement state) — for example
if `0021` hit a bug and left a malformed policy on some tables.

Always run the soft rollback first to reduce the chance of the hard
rollback racing with in-flight queries.

## What this rollout intentionally does NOT do

- **Does not migrate every route handler** to `requestDb(req)`. The
  observability counter is the priority signal — migrate by data, not
  by guessing. See "Watch the missing-counter" above.
- **Does not add an FK constraint** to the four columns coerced in
  `0020`. Adding a foreign key requires every existing value to match a
  row in `organizations.id`, which would fail on legacy / orphaned
  rows. Separate cleanup PR if desired.
- **Does not touch `tenantDb` or `tenantDbHelper`** in `server/db/`.
  Both are actively used by routes (`tenant-traceability`,
  `tenant-ctq-factors`, `tenant-quality-validation`,
  `sectionQualityGating`). They predate this rollout and use a
  separate `postgres-js` connection rather than the shared `pg.Pool`
  — code paths through them are NOT covered by the pool
  instrumentation in PR A. Migrating those routes to the canonical
  pool + `requestDb` is a follow-up.

## Related

- `server/db/rlsAllowlist.ts` — what's excluded and why.
- `server/db/__tests__/rlsMigrationShape.test.ts` — pinned shape of the
  policy SQL; if you change `0021`, this test will catch unintended
  drift.
- `scripts/ci/check-rls-allowlist-sync.mjs` — CI gate diffing
  `RLS_ALLOWLIST` (TS) against the embedded SQL array.
