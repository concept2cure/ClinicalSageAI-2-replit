# Research-Compliance / Sponsored-Programs — DB verification

Proves the C2C-01..15 governed backend works against a live Postgres: migrations
apply (DDL + CHECK constraints + FKs + indexes), the governed mutation path writes
the audit hash-chain + c2c_ana_actions ledger, the provenance spine threads, and
the domain invariants hold (no-negative inventory, signature invalidation,
3-year IACUC expiration).

## Run
```bash
pg_ctlcluster 16 main start                       # or any Postgres
export DATABASE_URL="postgresql://USER:PW@127.0.0.1:5432/clinicalsage"
psql "$DATABASE_URL" -f scripts/db-verify/00_bootstrap_base.sql   # minimal base/ledger tables
for m in financial_disclosure_21cfr54 ha_interactions_commitments iacuc_animal_governance \
         irb_submissions ibc_biosafety nonclinical_send egrants rim_lite \
         lifecycle_obligations inspection_readiness controlled_substances etmf; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "migrations/20260610_${m}.sql"
done
npx tsx scripts/db-verify/verify-research-compliance.ts            # → 17 passed, 0 failed
```

In production the base tables come from the full app schema, not 00_bootstrap_base.sql
(which is the minimal FK/ledger set so the new domains can be verified in isolation).

## RLS (tenant-isolation) verification
`0021_enable_rls_everywhere.sql` is a one-time DO-block, so the research-admin
tables (created in later migrations) never received `tenant_isolation_policy` — no
DB-level tenant backstop. `migrations/20260612_rls_research_admin.sql` backfills the
identical policy (shadow-mode kill switch via `app.rls_enforce`, numeric match on
`app.current_tenant_id`/`app.current_org_id`, super-admin bypass) + ENABLE + FORCE.

```bash
psql "$DATABASE_URL" -f migrations/20260612_rls_research_admin.sql   # backfill (shadow mode; no behavior change)
npx tsx scripts/db-verify/verify-rls.ts                              # → 10 passed, 0 failed
```
Proves: new tables covered + FORCED; shadow mode passes all rows (unbroken);
enforcement-on isolates a tenant both directions; WITH CHECK blocks cross-tenant
writes; no-context → zero rows (fail-closed); `app_super_admin` bypasses. The
enforcement test runs in a rolled-back transaction, so the DB stays in shadow mode
and `verify-research-compliance.ts` still passes 82/82.

## Last result
**verify-research-compliance.ts: 82 passed, 0 failed** (governed paths, provenance,
gates, orchestrations, triage, scorecard). **verify-rls.ts: 10 passed, 0 failed**
(tenant isolation now enforceable on the research-admin tables).
