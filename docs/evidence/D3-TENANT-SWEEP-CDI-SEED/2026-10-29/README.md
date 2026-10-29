# Tenant-isolation sweep contract: red on the CDI public reference seed — 2026-10-29

Row: D3, tenant isolation proven. The contract that proves the deploy set
ends with every integer-keyed tenant table policied,
`tests/schema-contract/tenant-isolation-sweep.contract.test.ts`, had stopped
running its isolation assertions. This change makes it run them again, and
now they include the table the seed writes into.

## The red

At 90512f55, `timeout 300 npx vitest run tests/schema-contract/tenant-isolation-sweep.contract.test.ts`:

```
FAIL  C-33: the batch applies in set order, twice, and ends fully isolated
Error: pass 1: migrations/20261027_cdi_public_reference_seed.sql failed —
       CDI reference seed requires the canonical CRE source store
Tests  17 passed | 3 skipped (20)
```

The three skipped tests are the suite's isolation proofs: no unpoliced tenant
table, `electronic_signatures` policied and forced, and a real cross-tenant
read refused. They had not run since the seed joined the set in 0a07f49d on
2026-10-27. The suite fails the same way with
`20261029_hf_engineering_files_program_key.sql` removed, because the abort
happens at the seed (index 426), before that file (index 427). Trimmed output
is in `red.txt`.

## What already exists

- **The sweep**, `db/migrations/20260801_tenant_isolation_sweep.sql`, is the
  last entry of `C2C_MIGRATION_FILES` (index 430 of 431). It enables, forces
  and creates `tenant_isolation_policy` on every `public` base table with an
  integer `organization_id`, `org_id` or `tenant_id` that lacks that policy,
  and on three listed non-public lumen tables. It skips a fixed allowlist
  (`organization_users`, `__drizzle_migrations`, `stripe_events`,
  `billing_budgets`, `billing_alerts`, `api_keys`), mirrored in
  `server/db/rlsAllowlist.ts` and kept in sync by
  `scripts/ci/check-rls-allowlist-sync.mjs`. It adds its policy alongside any
  policy a subsystem installed, and never replaces one. This is the mechanism
  behind CLAUDE.md Rule 1's third corollary.
- **The contract test** builds a base-schema fixture (the drizzle journal plus
  named precondition files), then applies the set from `BATCH_START`
  (`db/migrations/022_stability_v2.sql`, index 79) to the end, twice. Files
  before index 79 run only if the fixture names them. Seven earlier
  precondition files are there for exactly this reason, each with a comment
  ("Same class again, for the same reason"). In each case a batch file
  depended on a table whose creator sits before `BATCH_START`.
- **The table the seed writes**, `public.cre_evidence_sources`, is created by
  `db/migrations/20260724_clinical_regulatory_evidence_spine.sql` (index 18).
  `migrations/20260726_cre_source_program_scope.sql` (index 20) adds
  `client_program_id`. The table is mixed by design. A row with
  `organization_id` set is tenant-owned. A row with `organization_id IS NULL
  AND visibility_class = 'global_public'` is shared reference data. The spine
  was amended in place on 2026-10-14 to add one permissive SELECT-only policy,
  `cre_explicit_global_public_read`, which admits only that explicit
  global-public pair ("NULL organization alone never grants visibility"). The
  sweep's `tenant_isolation_policy` covers the tenant rows.
- **Every batch file that alters the table guards on existence.**
  `20260829_cre_source_versioning`, `20261001_cre_evidence_sources_capture_immutability`,
  `20260926b_program_same_org_keys`, `20261006_document_data_dispositions`
  (a `to_regclass(target)` loop), `20261008c_data_room_source_text` and
  `20261008d_cre_source_study_ref` each check `to_regclass` and skip with a
  NOTICE. `20260803_document_span_lineage` names the table only in comments.
  So the fixture never had the table, and nothing failed until a file
  required it.
- **The seed**, `migrations/20261027_cdi_public_reference_seed.sql`, was added
  by 0a07f49d ("Prepare AnA CSR reference ingestion…"). Its evidence is
  `docs/evidence/D2/2026-10-27-cdi-csr-seed/README.md`. It creates no table. It
  inserts 78 rows into `cre_evidence_sources` with `organization_id` hard-coded
  to NULL and `visibility_class` hard-coded to `'global_public'`. It raises
  `CDI reference seed requires the canonical CRE source store` if the table is
  absent, and it asserts the row count and identity on every replay. The
  payload rows carry no tenant key (`organization_id`, `tenant_id`,
  `client_program_id` and `client_workspace_id` appear in none). All 78 are
  `clientStudyEvidence: false`, `trainingApproved: false` and
  `evidenceRole: external_reference`. Their sources are FDA, EMA, the EU Clinical
  Trials Register, ClinicalTrials.gov, DIMDI, sponsor disclosure portals and one CC BY paper.
  The seed's own test,
  `server/services/clinical-regulatory-evidence/__tests__/public-reference-seed.pglite.integration.test.ts`,
  applies the spine, program scope, versioning and source-text files to its
  own database. It never ran against the sweep's fixture. 142c133d added the
  `.d.mts` for the seed's generator script, which changes types only.
- **How shared tables are admitted to the sweep:** two ways. A table with no
  tenant rows goes on the allowlist (with the `rlsAllowlist.ts` entry and its
  reason). A mixed table keeps the sweep's tenant policy and adds a narrow
  permissive read policy for its shared rows. `cre_evidence_sources` already
  uses the second way, from the 2026-10-14 amendment.

## Cause

The fixture was smaller than the deploy it models. The seed is the first
batch file that requires `cre_evidence_sources`, and it fails closed when the
table is absent, as it should. On a real deploy, index 18 creates the table
long before index 426. This is the eighth case of the class the fixture
already documents. It is not a sweep defect, not a seed defect, and not an
isolation defect.

## Decision and reason

The fix is to the fixture. Nothing is admitted to an allowlist or baseline.

- `cre_evidence_sources` holds tenant rows (Data Room captures, client
  documents) next to the global rows. Allowlisting it would turn off tenant
  isolation for those tenant rows, so it must stay policied. Probe 1 below
  shows the contract refusing that admission.
- The seed's rows are deliberately global reference data. The seed's header
  says "No tenant rows". Its evidence README says every record is
  `external_reference` with `clientStudyEvidence=false`, and the spine's
  2026-10-14 amendment is the policy that makes those rows readable. They need
  no admission beyond what the spine already does.
- The seed needs no change. Under Rule 1 it could not be corrected in place
  anyway.

The change adds the two pre-batch creators to `baseSchemaFixture()` in set
order, next to the seven existing precondition files, with the same kind of
comment. They are applied with `pg.exec`, not `safe()`, so a creator that
stops applying fails the suite instead of being swallowed. The full diff is
in `fix.diff`, 13 added lines.

With the table present, the six guarded batch files listed above now act on
it instead of skipping. That includes the capture-immutability guard and the
disposition late-write trigger. The seed's INSERT and count assertion pass through both,
twice.

## Green

At 43fb57cc plus `fix.diff` (output in `green.txt`):

- `tenant-isolation-sweep.contract.test.ts`: 20 of 20 pass, including the
  three isolation proofs that had been skipped.
- `npm run -s ci:migration-set-order`: OK, 431 migrations, sweep last.
- `npm run -s ci:migration-drop-safety`: OK.
- `npx eslint` on the test file: 0 problems, the same as head. The root
  `tsconfig.json` does not include `tests/`, so the typecheck gate does not
  read this file. A one-file check with a scratch tsconfig extending the root
  config reports no error on the added lines. The one error it reports in
  this file, a TS2352 on the existing `AUTHORING_SUBSYSTEM_FILES` cast, was
  there before this change.

## Making the check fail

There were two temporary edits, to the test file only, each run once. The
file was then restored from a byte copy. Its sha256 was the same before and
after (`83d339fc…`), `grep -c PROBE-` returns 0, and `git diff --stat` shows
only the 13-line fixture change. Output is in `mutation.txt`.

1. **Admit the seed's table to the sweep allowlist** (the wrong decision).
   The sweep SQL, as the test reads it, gets `'cre_evidence_sources'`
   appended to its allowlist. Result: red, `unpoliced tenant tables: expected
   [ 'cre_evidence_sources' ] to deeply equal []`. Before this change, that
   assertion could not see this table at all.
2. **A new integer-keyed tenant table after the set ran, sweep not re-run.**
   `CREATE TABLE probe_new_tenant_rows (id serial primary key, organization_id
   integer, title text)`. Result: red, `expected [ 'probe_new_tenant_rows' ]`.

What this contract cannot catch: a table with no tenant column at all. The
sweep and this assertion only cover tables that declare one, as the test's own
`electronic_signatures` comment says. That population belongs to
`scripts/ci/check-unkeyed-request-tables.mjs`. The seed adds no table, so it
does not arise here.

## Needs a founder decision (not changed here)

All 78 global rows carry `metadata.publicReference.fit`. That field holds
`targetStudyId: "NCT05330182"` (LMN-201, RePreve). On 29 rows its
limitations, and on 3 rows its rationale, are written about the LMN-201
study, such as "never the
LMN-201 client study results". `searchPublicReferenceSources`
(`server/services/clinical-regulatory-evidence/public-reference-sources.ts`)
returns `fit` to any organization, and its text search matches on it. No
client results are in the seed, and the registry identifier is public.
However, any tenant can read which client program the collection was
assembled for, and the fit reasoning written for it. Whether a global
reference row may carry a single client's target annotation is a product
decision. If the answer is no, the fix is a new seed version without `fit`, or
with `fit` moved to a tenant-scoped record. It cannot be an in-place edit of
this seed (Rule 1).

## Files

- `tests/schema-contract/tenant-isolation-sweep.contract.test.ts`: the
  fixture change, the only code change.
- `docs/evidence/D3-TENANT-SWEEP-CDI-SEED/2026-10-29/`: this README,
  `red.txt`, `green.txt`, `mutation.txt`, `fix.diff`.
