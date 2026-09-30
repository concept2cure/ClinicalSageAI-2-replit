# D3: a blank database's first deploy left a child table unscoped

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-29.
**How this came to me:**

- Handed on by the install child-scope change (`…01AiwZKG`, work-orders
  "Handed on by the install child-scope change", items 1 and 4).
- Claimed 2026-09-24 by `…01GyGhjg`, which made no commit to its files
  afterwards.
- Taken over at the founder's direction. The change lands **inside** the
  24-hour windows other lanes held on `scripts/db/migration-set.mjs` and
  `.github/workflows/ci.yml` (until 18:38 and 18:26 UTC, 2026-09-29). Holding a
  proven change uncommitted for 16 hours in an ephemeral container risked
  losing it. Before landing, I checked that none of its hunks overlaps the
  hunks those lanes changed (`c9f29825`: a list entry near line 2695;
  `b86ab121`: a gate near line 133), and it was merged, not raced.

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The defect

`db/migrations/20260813_child_table_parent_scoped_rls.sql` scopes child tables
(no tenant column) to their parent's tenant. It ran **mid-set**. Its chained
list delegates to a parent's own policy, and
`regulatory_harmonization.export_jobs` gets its policy from the uuid step at
the end of the set. So on a database built from blank, the first deploy logged
"the parent is not scoped … skipping", and the child was scoped only by the
second deploy (`red/first-deploy.txt`, at trunk, one `deploy-migrate`):

```
regulatory_harmonization.export_job_audit_log (child of regulatory_harmonization.export_jobs, row security off)
```

The first deploy is the only one a new customer's database is guaranteed. Any
child or parent created by a file listed after the mid-set position was
exposed the same way.

CI could not see it, because its coverage step runs after the idempotency
re-run, and `tests/db` could not see it either.
`child-table-parent-scoped-rls.dbtest.ts` re-applies the file to the live
schema, which heals the table before any later check reads it. That was
measured on 2026-09-28: the check went from 1 row to 0 across a test run.

## The change

- **`scripts/db/migration-set.mjs`:** the entry moves into the isolation tail,
  as the new export `CHILD_TABLE_PARENT_SCOPE`, placed after the uuid step and
  before the integer sweep. The mid-set position keeps a note saying where it
  went and why.
  - It creates no table, so **the sweep stays last** (C-33).
  - It runs after the uuid step, so the chained parents it delegates to are
    policied.
  - It runs after every table-creating entry, so every child and parent
    exists when it runs.
- **`scripts/ci/check-migration-set-order.mjs`:** invariant 2 was "the uuid
  step is in the final pair". It is now "the last three are uuid step, child
  scope, sweep", in that order. Against trunk's list it refuses
  (`red/order-gate-trunk-list.txt`).
- **`tests/schema-contract/{uuid-tenant-isolation,c48-stage1-identity-org-bridge}.contract.test.ts`:**
  the pinned tail becomes `slice(-3)`. `tenant-isolation-sweep.contract.test.ts`
  (sweep last) is unchanged and passes.
- **`.github/workflows/ci.yml`, blank-database job:** a coverage check runs
  **after the first deploy**, before the idempotency re-run. At trunk it would
  have printed the row above and failed.
- `install-fresh.mjs` is unchanged. It still applies the same file itself,
  after its uuid half.

## Proof

| File | Shows |
| --- | --- |
| `red/first-deploy.txt` | Blank database at trunk, one deploy: the chained child skipped; coverage **1 row** |
| `red/order-gate-trunk-list.txt` | The new order gate refuses trunk's list |
| `green/first-deploy.txt` | Blank database with the move, one deploy: `chained: 2 policied`, no skip; coverage **0 rows**. A second deploy policies nothing new (0 rows). The child-scope, drafting, two-tenant, non-public uuid and provisioned-tables contracts pass **72/72** there. |

Also:

- `ci:migration-set-order` OK, with the new tail message.
- `tests/schema-contract` passes 91/91.
- `tests/db/atom-search.dbtest.ts` passes 5/5 on a provisioned database. That
  confirms handed-on item 4. The failure counted in L201 and L202's numbers
  predated its fix (`881680d73`), and `docs/GA_COMPLETION_LEDGER_2026-08.md`
  L201–L203 now carry dated corrections.

## Found on the way, fixed separately (`89a8ade0`)

My own `migrations/20260928_invitations_for_member.sql` (2026-09-28) created a
`LANGUAGE sql` function unconditionally. On a minimal base it halted the set,
and `tenant-isolation-sweep.contract.test.ts` was red from `7347a3e2`. Both
2026-09-28 functions are now guarded
(`../2026-09-28-invitation-acceptance/`, "Amended 2026-09-29").
