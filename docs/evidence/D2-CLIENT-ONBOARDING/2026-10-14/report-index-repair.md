# Report tenant index repair for authenticated onboarding validation

Tier 5 browser verification could not start on either the inherited upstream head
or the completed onboarding head. Both stopped during fresh schema provisioning
with the same required-object failure:

```text
immutable_report_records incomplete — missing index on organization_id
(Report OS sealed records (Part 11 immutable report spine))
```

The upstream failure is [run 38503640193](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38503640193),
head `2ae0b1cb5aeabbd69ea9ae1ebc4de3e4d6b218ef`. The failure reproduced in
[run 38507560410](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38507560410),
onboarding head `53693722f971a8fa694b85f3f955d401ddea8fd3`. In both runs,
"Provision the application schema from scratch" failed; authenticated browser
smoke and the governed golden journey were skipped. These are provisioning
failures, not browser test passes or browser failures.

The relevant failed-step excerpts are saved as
[upstream CI](report-index-upstream-ci.txt) and
[onboarding CI](report-index-onboarding-ci.txt); environment output is excluded.

The required-object check already requires a valid index whose leading column is
`organization_id`. The canonical Drizzle model already declares
`irr_org_idx` on that column. The migration adds the same index using
`CREATE INDEX IF NOT EXISTS`; it changes no table definitions, columns, report
rows, signatures, access policies or schema contract. If the base table was never
provisioned, the migration fails explicitly instead of accepting a missing
capability.

The repair is in the root `migrations/` overlay so fresh install applies it
before its required-object verdict. It is also in `C2C_MIGRATION_FILES` so deployed
databases receive it. It sits before the unchanged isolation tail:
UUID non-public scope → parent-scoped children → integer tenant sweep.
`db/migrations/migrations_manifest.json` needs no change because its synchronizer
scans `db/migrations/`, and the deployed set is the durable apply path.

## Executed proof

[The focused PGlite suite](../../../../tests/schema-contract/immutable-report-tenant-index.pglite.test.ts)
executes the actual installer `verifyRequiredObjects` function and its actual
report contract against the real PostgreSQL catalog in PGlite. It does not replace
the required-object verdict with a count or a hand-written approximation.

Five tests prove:

- Without a tenant-leading index, the verifier reports the identical CI
  shortfall, even when a composite index includes the tenant as its second key.
- Applying the actual migration makes that same verifier accept the table.
  Applying it again is a no-op. A catalog query proves exactly one valid,
  nonunique B-tree `irr_org_idx` on the canonical table and leading column.
- Stored reports, column definitions and RLS policy expressions are unchanged.
  Removing the repaired index makes the acceptance assertion fail again.
- A missing canonical base table is refused.
- Fresh overlay reachability, exactly one deployed-set entry, the unchanged
  isolation tail, the matching model index and the standard audit header hold.

[Red output](report-index-red.txt) records the tests before the migration and set
entry existed. [Green output](report-index-green.txt) records all five passing.
The behavioral negative controls query the actual catalog and canonical verifier;
they do not merely search the migration text for a statement.

Migration order, deployment reachability, guarded-creator order, replay/drop
safety, model/migration agreement, prefix collision and manifest-sync checks pass.
The scoped test passes ESLint without warnings. Existing installer AnA ordering
and complete Tier 5 schema contracts also pass. The combined
[installer/deploy contract run](report-index-installer-green.txt) passed 405
tests across four files, including the five repair tests.

## Limits

The original Drizzle push's failed index statement is not in the CI logs:
`install-fresh` discards the push output when Drizzle returns exit code zero.
The table stage passed before the later verifier detected its missing index.
This repair ensures the required canonical index through the migration path;
it does not claim to diagnose or change Drizzle's earlier partial execution.

Full browser verification requires a new CI run on the repair commit. Local
PGlite proof validates the migration and exact object contract, not a full
application boot or an authenticated Chromium journey.
