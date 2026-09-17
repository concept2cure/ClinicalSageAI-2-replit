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

---

## PROGRESS — 2026-09-10: the first live measurement

**A real database was stood up and the numbers are now measured rather than
inherited.** PostgreSQL 16 + pgvector, `install-fresh` then `deploy-migrate`,
exactly the pair `blank-db-provisioning` runs in CI.

| Step | Result |
|---|---|
| `install-fresh` | 966 tables · *"Application schema install complete"* · 2 classified skips · *"tenant isolation: every integer tenant-keyed table is policied ✓"* |
| `deploy-migrate` | **261/261** files applied · authoring subsystem 19/19 · tenant-parentage FKs 6/6 · `tenant_isolation_policy` 19/19 |
| `ci:tables-live-schema` | 1,281 relations · 785 referenced by server SQL · 25 resolved as functions · **70 absent** |

**The 73 was real and reproducible.** Two of its entries — `tasks` and
`vault.document_chunks` — now exist and the gate named them as ratchet-down
candidates; both removed **by hand** rather than by regenerating the file,
because this database is PG16 while CI's job uses `pgvector/pgvector:pg15` and a
wholesale regenerate from a different major version could silently move entries
the gate never named. **73 → 70.**

### The one unbaselined absence was caused by this work order's own prerequisite

`contradiction_links`, written and read by
`server/services/assumption-registry-service.ts`.

ADR-0007 point 6 recorded that its DDL lived *"only in dead `migrations/0010`"*.
**"Dead" was true of `deploy-migrate` and false of `install-fresh`**, whose
root-tree overlay reads every `migrations/*.sql` — so every from-scratch
database did have the table. Retiring 0010 under WO-1 (commit `9a47438b6`)
removed it from every future fresh install.

**No repository-only check reported that.** `ci:duplicate-table-ddl` went 51 →
47, `ci:unbacked-tables` stayed green, every schema-contract test passed. A
provisioned database is what saw it. That is this work order's premise
demonstrated on the person writing it, which is the most convincing form
available — and it is why WO-1's remaining 47 are now marked *blocked on WO-2*
rather than merely sequenced after it.

**Ported, not reverted.** `db/migrations/20260910_contradiction_links_port.sql`,
listed in `C2C_MIGRATION_FILES` so RULE 1's replay reaches databases that
already exist — restoring 0010 would have restored the duplicates WO-1 retired
it to resolve, and would still have fixed only fresh installs. That is WO-1's
exit criterion B, now demonstrated end to end: the table was dropped, one
`deploy-migrate` pass recreated it, and the canonical sweep reported
*"tenant_isolation_policy applied to 1 newly-provisioned table(s)"*.

`ci:migration-set-order` rejected the first placement — the pinned invariant is
the final **pair**, not just the sweep — and the pre-push hook then required
`npm run db:sync-manifest`. Both gates did their job.

### And the endpoints were worse than the missing table

`POST /api/operating-system/contradiction-links` validated six required fields,
called `createContradictionLink()` **with no arguments** (a method that returns
null unless all six are present), and answered **HTTP 201 Created** with a
`data` object assembled by echoing the request body back. `GET` answered
`{ data: [], count: 0 }` without reading anything.

So the API said *created*, returned a plausible representation of the record,
and then reported that the project had no contradiction links — three false
statements, none of them detectable by a client. This is the failure mode this
work order's own opening quotes:

> A guarded one degrades to a silent no-op, **which is worse: it looks durable
> and is not.**

Both endpoints now do the real thing; `null` from the service is a 500 rather
than a success; the service's catch no longer claims *"table unavailable
(non-blocking)"* (neither half is true now); and its reader throws instead of
returning `[]`, because an empty array asserts a project has no contradictions
and *"none found"* is the answer a reviewer accepts without checking. Five
contract tests pin it at the route boundary, where the lie was visible.

### What remains

- **70 baselined absences.** Each still needs the decision in Scope item 1 —
  code-derived migration, repoint the query, or delete it. The harness to
  measure them now exists and is reproducible in about fifteen minutes.
- **The harness is not yet a repo artefact.** Scope item 3 asks for it as a
  script; today it was run by hand. Worth landing before the next pass, because
  the value shown here came entirely from being able to run it.
