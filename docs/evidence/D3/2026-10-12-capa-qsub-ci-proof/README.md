# capa_records and q_submissions are proven by CI, not by a one-off probe

**Row** D3 (tenant isolation). **Date** 2026-10-12.
**Follows** `docs/evidence/D3/2026-10-12-unkeyed-table-classification/`, which
added the two tables to `db/migrations/20260813_child_table_parent_scoped_rls.sql`
and proved the policy by hand against a deploy-shaped database.

## What was missing

`tests/db/child-table-parent-scoped-rls.dbtest.ts` has two kinds of assertion:

1. a **structural** one over `ALL_CHILD_TABLES` — every table the migration
   names that exists must have `tenant_isolation_policy`, `relrowsecurity` and
   `relforcerowsecurity`;
2. a **behavioural** `CASES` list — one entry per distinct key shape, each
   seeding both tenants and asserting both directions.

The two new tables were in neither. So their isolation rested on a probe I ran
once, in one session, by hand. Nothing would have reported their regression.

## What changed

- Both added to `ALL_CHILD_TABLES`.
- Both added as `CASES` entries. They are the text-program-id shape — a TEXT
  `program_id` compared against a uuid parent key as text — which is the one
  thing in this class that can silently be wrong, and which the structural
  assertion cannot see.
- `ensureAddedTables` gained minimal `CREATE TABLE IF NOT EXISTS` declarations
  for both, so the suite still runs on CI's bare PostgreSQL service. On a
  provisioned database both statements are no-ops and the suite runs against the
  genuine shapes.

## Verify by making the check fail

Three runs, same command:

```
CI=true NODE_ENV=test RLS_ENFORCE=on \
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:5432/c2c_dbtest" \
APP_DATABASE_URL="postgresql://app_service:probe-pw@127.0.0.1:5432/c2c_dbtest" \
npx vitest run --config vitest.db.config.ts tests/db/child-table-parent-scoped-rls.dbtest.ts
```

### 1. As shipped — 15 passed (was 13)

```
 ✓ capa_records: each tenant sees its own row and not the other's 13ms
 ✓ q_submissions: each tenant sees its own row and not the other's 14ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

### 2. Policy REMOVED — the two spec rows deleted from the migration and the
existing policies dropped. **3 failed:**

```
AssertionError: capa_records has no tenant_isolation_policy: expected false to be true
AssertionError: capa_records: tenant A cannot see its OWN row: expected +0 to be 1
AssertionError: q_submissions: tenant A cannot see its OWN row: expected +0 to be 1
 Tests  3 failed | 12 passed (15)
```

Note **how** it failed: `tenant A cannot see its OWN row`, not `tenant B can
read tenant A's row`. Both tables already had `relrowsecurity` and
`relforcerowsecurity` set, so with the policy gone they are deny-all — inert,
not leaky. That is the honest failure mode for this pair, and it means run 2
exercised only the positive half.

### 3. Policy LEAKY — `USING (true) WITH CHECK (true)` installed under the same
name. **2 failed, and the structural assertion passed:**

```
 ✓ every table named by the migration ends up policied, enabled and FORCEd
AssertionError: capa_records: tenant B can read tenant A's row: expected 1 to be +0
AssertionError: q_submissions: tenant B can read tenant A's row: expected 1 to be +0
 Tests  2 failed | 13 passed (15)
```

This is the run that justifies adding the cases at all. A policy that exists,
is enabled and is FORCEd satisfies the structural assertion completely while
disclosing every tenant's CAPAs and pre-submission strategy to every other
tenant. Only the behavioural cases caught it.

### 4. Restored — the migration re-applied unchanged, 15 passed, and
`pg_policies` shows both policies back:

```
   tablename   |       policyname
---------------+-------------------------
 capa_records  | tenant_isolation_policy
 q_submissions | tenant_isolation_policy
```

The restore needed no repair step: the suite's `beforeAll` re-executes the
migration file, which re-created both policies. That is RULE 1's replay
property doing its job, observed rather than assumed.

## Scope note

The cases seed into `public.`, and `ScratchSchema.destroy()` drops only the
scratch schema — so a run leaves its fixture rows behind. This is true of all
ten cases and predates these two; it is harmless on CI, whose database is
ephemeral per job, and harmless to the assertions, which filter by a
run-unique FK value rather than counting a table. The rows this session's runs
left in the local `c2c_dbtest` were deleted (0 remain for orgs 91001/91002).

## File split

Adding the two cases took `child-table-parent-scoped-rls.dbtest.ts` past the
500-line ceiling (`max-lines`, which is `error` for this path and gated by
`ci:pushed-lint-warnings`). Rather than raise a baseline, the fixtures moved to
`tests/db/child-table-parent-scoped-rls.cases.ts` — the `CASES` list, the three
structural name lists and the two bare-CI `ensureTables` helpers. The
assertions stay in the suite. A new case is now a data change, and the test body
stops growing with the spec.

`npx vitest list --config vitest.config.ts --filesOnly | grep -c child-table-parent-scoped-rls`
returns 0 and the db config still collects exactly the one `.dbtest.ts`, so the
sibling is not mistaken for a suite with no tests in it. Both files lint clean;
15 passed after the split.
