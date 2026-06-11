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

## Last result
**17 passed, 0 failed** — FCOI certify+provenance+audit+signature-invalidation,
controlled-substances negative-inventory rejection, HA commitment provenance,
IACUC approval expiration + Module 4 provenance.
