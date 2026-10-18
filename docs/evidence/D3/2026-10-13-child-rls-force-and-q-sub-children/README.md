# D3 — the four children a blank install refuses, and a deny-all that exempted the owner

Found by running `scripts/db/install-fresh.mjs` against a blank PostgreSQL 16
rather than against a database that already existed. Its final step runs this
repo's own coverage gate (`scripts/db/rls-coverage-check.sql`) and the install
**failed**:

```
❌ Install failed: 4 tenant-keyed table(s) carry no RLS policy — rows are
   readable across tenants once anything reads them: public.capa_actions
   (child of public.capa_records, row security off), public.q_sub_meetings
   (child of public.q_submissions, row security off), public.q_sub_questions
   (child of public.q_submissions, row security off),
   public.q_sub_timeline_entries (child of public.q_submissions, row security off)
```

No database could be provisioned from blank at all while that held.

## Why these four, and why now

Not a new hole — a hole that became *visible* the day before. The 2026-10-12
amendment to `db/migrations/20260813_child_table_parent_scoped_rls.sql` added
`capa_records` and `q_submissions` to its spec list, which gave those two row
security. The gate's child rule looks for

> a table with no tenant column of its own, row security OFF, holding a foreign
> key into a parent that **has** row security

so policying a parent promotes its children into the gate's scope. Their own
isolation up to that point was whatever their reading route's join happened to
do, and nothing in the database.

**The general lesson, now written into the migration's header: adding a parent
to one of those spec lists makes its children the gate's business on the next
install, and they have to be added in the same change.** `q_sub_commitments` is
in this change for exactly that reason and not because the gate named it — it
hangs off `q_sub_questions`, so it becomes the next unprotected generation the
moment `q_sub_questions` gains row security. Fixing the four without it would
have moved the hole down one level instead of closing it.

## Measured, as the runtime role

Two tenants, one Pre-Sub question each, read as `app_service`
(`NOSUPERUSER NOBYPASSRLS`) with `app.rls_enforce = 'on'` — the production
posture, not a superuser connection, which RLS never filters:

| scope | before | after |
|---|---|---|
| tenant 9001 | **2** — its own question *and* tenant 9002's | 1 |
| tenant 9002 | 2 | 1 |
| scoped, no organisation | — | 0 (fails closed) |

The rows are Pre-Submission / Pre-IND questions put to FDA and the position the
sponsor took on each. Reproduced in both directions: disabling row security on
the same table returns the count to 2, re-enabling it returns 1. See
`measured.txt`.

## The second defect: "deny-all, which is safe" exempted the table owner

The same file's header exempts three chains it cannot express, because their
parent is itself a child:

```
csr_endpoint_results -> csr_endpoints       -> csr_studies
ctd_module_sections  -> ctd_submissions     -> ctd_programs
ctd_documents        -> ctd_module_sections -> ctd_submissions -> ctd_programs
```

> All three remain deny-all, which is safe, and none is referenced by server
> code — so nothing is broken by leaving them until they are needed.

Checking that instead of trusting it: on a database provisioned from blank all
three measure

```
relrowsecurity = t, relforcerowsecurity = f, 0 policies
```

For the runtime role that is genuine deny-all, so the exemption holds where
production reads. For the **table owner** it is not — PostgreSQL exempts an
owner from its own policies unless `FORCE` is set, and with no policy and no
`FORCE` the owner reads every tenant's rows. It is the same owner exemption
`install-fresh` warns about in general terms at step 7/8, and the reason every
other table in that file gets `ENABLE` **and** `FORCE`.

The `ENABLE` comes from `migrations/0005_csr_knowledge_database.sql`, which
sets `ENABLE` without `FORCE` — and which is on `install-fresh`'s own
`RLS_MIGRATIONS` list but **not in `C2C_MIGRATION_FILES`**. So that half
reaches a database provisioned from blank and nothing replays it for one that
only ever runs `deploy-migrate`. Both halves are now applied by a block in
`20260813_child_table_parent_scoped_rls.sql`, which the deploy set does carry,
so the state the header claims is true on either path from one place.

The three chains stay deny-all. Reversing that is the repo's decision, not a
session's.

## The test asserted the exemption and could not see any of this

`tests/db/child-table-parent-scoped-rls.dbtest.ts` pinned the exemption as:

```ts
expect(row.policied, `${row.table_name} gained a policy — …`).toBe(false);
```

`policied === false` is equally true of three states:

| `relrowsecurity` | `relforcerowsecurity` | policy | who can read across tenants |
|---|---|---|---|
| `t` | `t` | none | nobody — the claimed deny-all |
| `t` | `f` | none | the table owner — **the actual state** |
| `f` | `f` | none | everybody |

So it passed in the state it existed to prevent, and would have passed in the
worse one. It now asserts all three columns. **A gate that has only ever been
seen to pass has not been tested**, so it was run against a database
provisioned before the fix, and fails there naming each defect:

```
× every table named by the migration ends up policied, enabled and FORCEd
  → capa_actions has no tenant_isolation_policy: expected false to be true
× q_sub_questions: each tenant sees its own row and not the other's
  → q_sub_questions: tenant B can read tenant A's row: expected 1 to be +0
× leaves the three chained tables deny-all against every role
  → csr_endpoint_results is deny-all but not FORCEd — the table owner is
    exempt from it and reads every tenant's rows: expected false to be true
```

With the amendment applied to the same database: **16 passed (16)**.

A new isolation case covers `q_sub_questions` rather than leaving the five new
tables to the structural assertion, because the delegation has to survive two
hops of *different kinds*: the child's policy only asks whether the parent
`q_submissions` row is visible, and the parent's own policy compares a TEXT
`program_id` against `regulatory_programs.id::text` before reading the
programme's integer `organization_id`. The pre-existing grandchild case
(`c2c_document_section_versions`) chains an integer key into a directly
org-keyed parent, so it would pass whether or not the text comparison in the
middle hop works.

## A methodology note worth more than the finding

The first version of this analysis was wrong, and wrong in the direction that
reads as a bigger finding. The cluster it was measured on had **no pgvector**,
so `drizzle-kit push` silently failed on every table carrying a `vector(1536)`
column — `csr_studies`, `csr_endpoints`, `coauthor_documents` among them — and
`migrations/0005_csr_knowledge_database.sql`'s `ENABLE ROW LEVEL SECURITY` loop
aborted on the first absent name. On that database the three chains measured
`relrowsecurity = f`, which supports a much louder claim: that the deny-all was
never real anywhere and the tables were openly readable.

Installing the extension and re-provisioning showed the loop runs fine and the
three are `t / f / 0` — a real but much narrower defect, scoped to the owner.
Three conclusions drawn on the broken cluster were discarded, including a
`coauthor_document_versions` "finding" that was purely the missing extension,
and a deny-all block that would have been justified by a false premise.

A missing extension does not announce itself as a missing extension. It
announces itself as a finding. **Verify the environment the measurement came
from before believing what it measured** — the same lesson as the shallow-clone
claim in `docs/evidence/reviews/2026-10-11-reporting-coverage/`, arrived at
from the other direction.

## Files

- `db/migrations/20260813_child_table_parent_scoped_rls.sql` — amended in place
  per CLAUDE.md Rule 1 (171 lines added, none removed): five chained entries,
  the ENABLE+FORCE deny-all block, and the dated header note.
- `tests/db/child-table-parent-scoped-rls.cases.ts` — the `q_sub_questions`
  isolation case, the five names in `ALL_CHILD_TABLES`, bare-CI declarations
  for the three new children.
- `tests/db/child-table-parent-scoped-rls.dbtest.ts` — the deny-all assertion
  that can tell the three states apart.
- `measured.txt` — the raw before/after output.
