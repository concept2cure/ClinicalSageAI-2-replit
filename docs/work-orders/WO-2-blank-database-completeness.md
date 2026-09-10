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

---

## Added 2026-09-10 by WO-1 — a gate blind spot, and one table it hid

`ci:unbacked-tables` counts a table as backed if **any non-archived `.sql` file
under `db/migrations/` or `migrations/` contains its `CREATE TABLE`**. Its own
header says so. That treats the *existence of a file* as provisioning, and a
file on no applier provisions nothing.

WO-1 archived two dead schema dumps to `sql/_legacy/` —
`cro_database_schema.sql` and `document_versions.sql`, referenced by nothing
since 2026-06-16 and applied by no path. The gate immediately reported a table
it had been calling backed:

```
🚫 Server SQL references tables that NOTHING in this repo creates:
  document_approvals
      server/services/unifiedTaskService.ts
```

`unifiedTaskService.ts:667` runs it unguarded:

```js
// Query vault approval tasks (raw query to avoid missing schema bindings)
const approvalsResult = await dbInstance.execute(sql`
  select id, approver_id as approverId, status, approval_date as approvalDate
  from document_approvals
  where status = 'PENDING'
  limit 50
`);
```

The comment is the tell. Someone hit a missing schema binding and routed around
it with raw SQL rather than asking why the binding was missing — and raw SQL is
exactly what the drizzle-side checks cannot see. The table's only definition was
in a dump nothing applies, so this query has never worked in any environment.

Baselined rather than fixed here: WO-1's scope is authority, and creating this
table needs a shape decision plus `organization_id INTEGER NOT NULL` per
`CLAUDE.md` RULE 1. The baseline did not grow — `document_approvals` entered as
`expected_prev` left, so it stands at 36.

### Two things for this work order

1. **Decide `document_approvals`**: create it properly, or point the query at
   the table that holds vault approvals, or delete the query. It has never
   returned a row.
2. **Fix the gate's definition of "created."** A table should count as backed
   only when its creating file is on a durable applier. The applier map is in
   `docs/evaluation-2026-09/evidence/applier-reachability.mjs`. Expect this to
   surface more entries — that is the point, and it is why it belongs here
   rather than in a restore-green change.
