# W3 — trunk CI: a tenant purge reaches `citation_chains`, and the CMC tools read as steps; the blank-database deploy confirmed (2026-10-13)

Trunk CI was red on every run from 2026-10-12 through 2026-10-13, on every lane.
Human testing needs a trunk that deploys from a blank database and boots, so
this session took the three reds that block that and had no claim.

## 1. The deploy migration halted on every blank database

**Measured:** `install-fresh`, then `deploy-migrate`, on a new database at
`94b4f923` ([`deploy-migrate-before.txt`](deploy-migrate-before.txt)):

> `✗ failed: db/migrations/20260813_knowledge_graph_tenant_keys.sql — column n.organization_id does not exist (172/375 applied before the failure)`

**Cause.** `15af6bc4` (2026-10-12) added a `citation_chains` backfill to this
file. The backfill reads `knowledge_graph_nodes.organization_id`, but that
column is added by the loop **further down the same file**:

- A database deployed before then already had the column, so it deployed.
- A blank one did not, so every fresh install stopped here.

The same halt explains the red in Production Image Boot, Production Boot
Smoke and Integration Tests. Each provisions a database at its first step.

**Fix: landed by another lane, not this change.** `2ef129e5` (2026-10-13
16:27, `docs/evidence/D6/2026-10-13-fresh-db-migration/`) made the backfill wait
for the column it reads. This session had independently reached the same fix,
reproduced above, and dropped its own copy at merge, so there is one
implementation. What this change adds to it is confirmation on a new database at
`72b2e36c`, the trunk carrying `2ef129e5`
([`deploy-migrate-after.txt`](deploy-migrate-after.txt) is the run with this
session's identical guard):

- `install-fresh` and `deploy-migrate` complete;
- every later Blank DB step, as `ci.yml` defines it, passes, except the purge
  guardrail. The purge guardrail is §2's fix, and it passes with it.

## 2. A tenant purge could not reach `citation_chains`

The same change made `citation_chains` organisation-keyed, and
`ci:purge-coverage` (the Blank DB job's last step) then failed. A tenant who
asks to be erased would keep its citation rows.

The table has no foreign key, so it is a leaf. It is added to
`PURGE_CHILD_TABLES` (`server/services/tenant/tenant-offboarding.ts`), with
the reason given there. Rows the backfill could not attribute stay NULL, so
they belong to no tenant and a purge leaves them alone.

- [`purge-coverage.txt`](purge-coverage.txt): before, *"NEW org-keyed table(s)
  a tenant purge cannot reach: citation_chains"*; after, *"new 0"*.
- `tenant-offboarding`, `tenant-purge-audit` and the catalog-driven
  `tenant-export-covers-purge` contract: 47 of 47 pass.

## 3. Ten CMC AnA tools had no step presentation

`f3927184` (2026-10-12) made CMC / Module 3 the eighth launch app, which
brought its AnA tools into the scope of `ci:step-presentation` (Lint). Ten
tools had no `present` block, so their steps would have read "Ran a step".

Each now has one, in the closed vocabulary of `shared/ana/step-verbs.ts`,
consistent with its CMC siblings:

| Tool | Verb | Source |
|---|---|---|
| the five recorded-data assessments (batch poolability, process capability, stability trend, dissolution comparison, shelf-life estimate) | check, compute, assess, compare, estimate | `engine` |
| `list_cmc_registers` | list | `project` |
| the four questioning-flow tools (start, answer, resume, commit) | start, record, open, record | `project` |

The gate verifies each `engine` claim: it refuses one whose handler can reach
a model call. It accepted all five.

- [`step-presentation.txt`](step-presentation.txt): *"618 in-scope tools each
  have a present entry … 128 engine claims, none with a reachable model
  call"*.
- The gate's self-test is 20 of 20.

## Not done here

The other reds of the 2026-10-13 runs (Lint's proof tier, the Test job, and
the Tier 5 browser smoke) are recorded in the board entry for this change
with what was measured.
