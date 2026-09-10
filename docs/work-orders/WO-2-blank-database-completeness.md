# WO-2 — Make a blank database complete

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** external pilot on real customer data
**Depends on:** WO-1 · **Prerequisite for:** WO-3

---

## What the code actually says

| Measurement | Count | Source |
|---|---:|---|
| Tables the server queries that do **not exist on a live database** | **73** | `scripts/ci/tables-live-schema-baseline.json` (gate green at baseline) |
| Tables referenced by runtime code that **nothing in the repo creates** | **36** | `scripts/ci/unbacked-tables-baseline.json` |
| Tables/views created across all sources | 1,493 | `ci:unbacked-tables` output |
| Referenced in server SQL | 747 | same |

Improved from 89 unbacked in July (`576ec5d`) to 36. The direction is right; the
remainder is what blocks a real-data pilot.

## Why this blocks the pilot

From `unbacked-tables-baseline.json`'s own header, and repeated in the gate
output:

> An unguarded query against a missing table throws "relation does not exist",
> which route handlers turn into a 500 — the endpoint never works. A guarded one
> degrades to a silent no-op, **which is worse: it looks durable and is not.**

A pilot customer writing real regulatory content into a silently no-op path
loses it, and the UI reports success. That is the single worst failure mode this
platform can have, because it is invisible until an audit.

## Scope

1. For each of the 73 live-schema gaps and 36 unbacked tables, decide: add a
   code-derived migration, or point the query at the table that holds the data,
   or delete the dead query. Per ledger entries C-11/C-14.
2. New tables go in `public` with `organization_id INTEGER NOT NULL`, inserted
   before the final pair in `C2C_MIGRATION_FILES` — `ci:migration-set-order`
   enforces that the tenant sweep runs last. A new schema, or a uuid-keyed org
   column, ships with **no RLS policy** and is cross-tenant readable.
3. Stand up the from-scratch install as a repeatable harness so this cannot
   regress: `scripts/db/install-fresh.mjs` against an empty database, then
   `ci:tables-live-schema` against the result.
4. Delete both baselines.

## Exit criteria

```bash
# against a genuinely empty database
node scripts/db/install-fresh.mjs
DATABASE_URL=... npm run ci:tables-live-schema   # exit 0, baseline absent
npm run ci:unbacked-tables:strict                # exit 0, baseline absent
DATABASE_URL=... npm run ci:purge-coverage       # re-measure; 611 is not an exit criterion here, but record it
```

Then prove the gate can fail: drop one table from the fresh install and confirm
`ci:tables-live-schema` goes red. A gate only ever seen passing has not been
tested.

## Blast radius

Medium-high. New migrations run on every deploy (RULE 1). The
`blank-db-provisioning` CI job already exists (`ci.yml:1297`, `:1314`) — extend
it rather than building a parallel harness.

## Estimate

2–3 weeks, overlapping WO-1.
