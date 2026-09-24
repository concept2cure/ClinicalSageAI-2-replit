# D3: a child table inherits its parent's tenant isolation

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
Ledger L201.

**Date:** 2026-09-24.

**Database:** the from-blank PostgreSQL 16 install of
`../2026-09-24-update-boundary/`. The cases run as a non-superuser runtime role
with `app.rls_enforce=on`.

**What this is not:** the row's closing evidence. That is the contract against
staging, owed with D1.

## What was wrong

The two tenant sweeps put a policy on every table that carries an
organization column. A child table carries none. Its tenant is its parent's,
reached through a foreign key. `db/migrations/20260813_child_table_parent_scoped_rls.sql`
is the canonical way such a table is scoped: a spec list of child, key and
parent, each child getting `tenant_isolation_policy` with the tenant comparison
redirected at its parent. It covered 39 children; it now covers 105.

On the from-blank install, 67 more public tables had **row security off**, no
tenant column, and a foreign key into an RLS-protected parent. That is 73 edges
(`red/child-tables-before.txt`). Under `RLS_ENFORCE=on` the database refused
nothing on them. Three post-market tables that key their program by text, with
no foreign key, had the same gap: `complaints`, `mdr_events` and
`vigilance_events`.

Most of these have no runtime reader. A read-only survey of every child's
access paths found 17 used by live code. Four of those reach other tenants'
rows today, because none of them touches the parent and a foreign key does not
consult RLS:

| Path | What it did |
|---|---|
| `delegateApproval` (`POST /api/approval-workflows/:id/delegate`) | Read and updated a `workflow_approvals` row by id, and wrote `workflow_history` into any workflow. |
| `startWorkflow` | Read `workflow_steps` by a template id from the request body. |
| `GET /api/decision-lineage/:type/:id` | Read `document_audit_logs` by the document id in the URL. |
| AnA `pdev.activity.set_state` | Read, updated and inserted `pdev_program_activities` by `params.programId`. |

## The fix

The canonical file's spec list grows, amended in place with a dated note
(CLAUDE.md RULE 1). It is not a second mechanism beside it.

- `complaints`, `mdr_events`, `vigilance_events` are scoped through
  `regulatory_programs`, with the keys compared as text. The file already does
  this for type mismatches.
- 63 children are scoped through their tenant-keyed parent. Where a child has
  two, the owning key is chosen: a milestone link by its milestone, a comment by
  its document, a plan document by its plan, a collection link by its
  collection, a group membership by its group.

WITH CHECK is part of the policy, so each of the four paths above is now
refused when it reaches for another tenant's parent.

Nothing else can break, by construction:

- Inside the server process, every query already needs a tenant scope.
- Out-of-process scripts (the migration runner, laptop seeds, audit scripts)
  connect as the owner without `app.rls_enforce`, which the policy's first
  clause lets through.
- Four owner keys are nullable (`context_members`, `project_predictions`,
  `risk_detections`, `validation_findings`). An unparented row there is visible
  to nobody, the canonical file's existing choice. None of those tables has a
  runtime reader.

**Not covered, and named with reasons** in `scripts/db/rls-coverage-check.sql`:
five grandchildren, whose parent is itself a child with no tenant column. The
single-level spec cannot express them; this is the chained case the canonical
file already records for three `csr_` / `ctd_` tables. Their live readers reach
them through the parent, whose own policy filters the join.

- `ai_claims`
- `ai_claim_citations`
- `c2c_document_section_evidence`
- `c2c_document_section_versions`, written only by the section trigger and read with an org join
- `section_propagations`, which appeared only once its parent was covered and has no runtime reader

## The gate that keeps it closed

`scripts/db/rls-coverage-check.sql`, which CI runs after `install-fresh` and
`deploy-migrate`, gains a child rule. It flags any public table with no tenant
column and row security off that has a foreign key into an RLS-protected parent.
The carve-out above may only shrink.

- Before the amendment, the rule lists the 67 tables.
- After it, the gate returns no rows.
- With row security disabled on `workflow_approvals` as a mutation, it names that
  table, once per parent edge. Restored, the gate is empty again
  (`green/gate-and-mutation.txt`).

## What the contract shows

`tests/db/child-table-parent-scoped-rls.dbtest.ts`, the canonical suite for
this migration, gains three cases (complaints, PDEV activities, resolution
bundle items) and 66 tables in its structural list. Each case seeds a parent and
child for two tenants, then counts from the child alone, as a query that forgot
the join would. Each asserts that a tenant sees its own row (the positive half)
before asserting it sees none of the other's.

| Run | Result |
|---|---|
| Red, the post-market entries not yet added | `complaints`: tenant B reads tenant A's row (1, expected 0). |
| Red, the 63 not yet added | `pdev_program_activities` and `resolution_bundle_items` each leak one row the same way; the structural check fails on the first uncovered table. |
| Green | 10 of 10. |

In `tests/db/request-parent-boundary.dbtest.ts`, a new positive case shows the
tenant's own flow still works under the new complaint and MDR policies: an MDR
event sourced from the caller's own complaint answers 201 and links it.

**Every real-database suite, after the amendment:** 53 of 54 files, 655 of 660
tests (`green/all-db-suites-53-of-54.txt`). That includes all seven D3 fixture
suites. The one failing file, `atom-search`, fails on `search_atoms_hybrid`'s
signature on a from-blank install. That predates this change and is recorded in
the D3 launch note.

## Recorded, not fixed here

- The five grandchildren above need a chained predicate.
- **Outside `public`,** 19 child tables (30 edges) have the same shape, in
  schemas such as `global_dossier`, `manufacturing`, `audit` and
  `cognitive_audit`. Several belong to subsystems CLAUDE.md RULE 2 gives no
  sessions. They need the same survey before any policy.

## Reproduce

```
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/child-table-parent-scoped-rls.dbtest.ts
psql <owner url> -tA -f scripts/db/rls-coverage-check.sql   # no rows
```
