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

**The five grandchildren (ledger L202), same day.** A grandchild's parent is
itself a child with no tenant column:

- `ai_claims`
- `ai_claim_citations`
- `c2c_document_section_evidence`
- `c2c_document_section_versions`
- `section_propagations`

So the single-level predicate had no tenant column to compare. The migration
gains a second, chained list, where each grandchild delegates to its
**parent's own** `tenant_isolation_policy`. That works because a policy's
subquery runs under the invoker's row security.

This was shown on the database before it was written into the migration
(`green/chained-predicate-probe.txt`), in a rolled-back transaction as the
runtime role. Counted from the child alone, tenant A saw one of two tenants'
section versions. Tenant A's own content edit fired the SECURITY INVOKER
snapshot trigger, whose version insert passed WITH CHECK.

A parent that carries no policy is skipped **before** the child's row security
is enabled, so the gate fails CI rather than accepting a scope that scopes
nothing. The three deny-all `csr_` / `ctd_` chains are left deny-all on
purpose: nobody reads them, and the test pins that choice.

**Children outside `public` (ledger L203), same day.** The chained list takes
schema-qualified names and gains sixteen: the fourteen with a tenant-scoped
parent (the `audit`, `core`, `ectd`, `global_dossier`, `manufacturing`,
`precedent`, `ai` and `regulatory_harmonization` schemas), plus
`audit.purge_approvals` and `audit.tombstones`. Those two appeared once their
parent `audit.purge_requests` was covered, and are listed after it.

A second survey found no reader of the fourteen that runs without a tenant
context. Thirteen are unused at runtime or reached only by dead code. The
fourteenth, `regulatory_harmonization.export_job_audit_log`, is written on the
request path, and it was the leak: `POST /api/grdhe/exports/:jobId/cancel`
filed an audit row against any job id. Execute's failure path does the same.
Row security filtered the job's UPDATE, but the audit insert ran regardless,
through a foreign key that ignores row security. Cancel then answered
`success: true` with no job.

That is fixed twice. The policy refuses the insert, and the service no longer
attempts it: both writers now return the UPDATE's id and raise
`ExportJobNotFoundError` when nothing was updated. Cancel answers 404. Unit
test: red 2/4 on the old service, green 4/4
(`red/unit-grdhe-audit-before.txt`, `green/unit-grdhe-audit-4-of-4.txt`).

Children of `identity.users` are per-user rather than per-tenant, and are not
counted: `cognitive_audit.*` and `federated_ml.privacy_budget_ledger`.

## The gate that keeps it closed

`scripts/db/rls-coverage-check.sql`, which CI runs after `install-fresh` and
`deploy-migrate`, gains a child rule. It flags any table, in any schema, with no
tenant column and row security off that has a foreign key into an
RLS-protected parent other than `identity.users`. Before the non-public entries
it listed the fourteen (`red/gate-nonpublic-before.txt`).
After the grandchildren, there is no carve-out left. A child that cannot be
covered would go there, with its reason.

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

**The grandchildren:** red, `c2c_document_section_versions` is read across
tenants from the child alone (`red/contract-grandchildren-before.txt`); green,
11 of 11 (`green/contract-11-of-11.txt`). The structural list now holds 71 new
tables. The non-public children: red, `audit.purge_requests` unpolicied
(`red/contract-nonpublic-before.txt`); green, 12 of 12
(`green/contract-12-of-12.txt`).

**Every real-database suite, after the amendment:** 53 of 54 files, 655 of 660
tests (`green/all-db-suites-53-of-54.txt`), and after the grandchildren
656 of 661 (`green/all-db-suites-after-grandchildren.txt`), and after the
non-public children 657 of 662 (`green/all-db-suites-after-nonpublic.txt`).
That includes all seven D3 fixture suites. The one failing file, `atom-search`, fails on `search_atoms_hybrid`'s
signature on a from-blank install. That predates this change and is recorded in
the D3 launch note.

## Recorded, not fixed here

- **GRDHE writes `system` as its actor.** `getCurrentUserId()` in
  `grdheService.ts` returns `CURRENT_USER_ID` or `'system'`. Its own comment
  says production "would" read the request context. So every export audit row,
  `completed_by` and completion signature names no real user. That is a Part 11
  attribution defect, row D5. The whole service also leaves tenant filtering to
  row security.

## Reproduce

```
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/child-table-parent-scoped-rls.dbtest.ts
psql <owner url> -tA -f scripts/db/rls-coverage-check.sql   # no rows
```
