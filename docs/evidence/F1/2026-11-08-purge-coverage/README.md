# A tenant erasure no longer rolls back on a Vault project folder, and the report-pack tables are erased

2026-11-08, the coordinating session (`01JbQU…`), F1. Found by triaging CI run 42517353828, where the "Blank DB
Provisioning + Deploy Migration" job's step "Guardrails — what a tenant purge cannot reach (ratchet)" was red.

## What already exists

- **The purge.** `server/services/tenant/tenant-offboarding.ts` holds `PURGE_CHILD_TABLES`. It deletes the list in
  order, in one transaction. Tables without an `organization_id` are deleted through a predicate in
  `server/services/tenant/purge-parent-scope.ts` (`PURGE_PARENT_SCOPED`).
- **The gate.** `ci:purge-coverage` (`scripts/ci/check-purge-coverage.mjs`) reads a live, freshly provisioned schema.
  It refuses a foreign key that would stop the purge part-way, and any new organisation-keyed table the purge cannot
  reach. Its self-test is `ci:purge-coverage:selftest`.
- **`public.document_folders`** has existed since `0000_sweet_joseph.sql`. `20261106_document_folders_project_scope.sql`
  (S6, `b3abbe5b68`) gave it `program_id`, which references `regulatory_programs` with no ON DELETE.
- **`public.simple_documents`** references `document_folders` (`folder_id`, NO ACTION).
- **`simple_document_versions`** references `simple_documents`.
- **The report-pack register**, `report_bundles`, `report_bundle_runs` and `report_bundle_projects`, arrived in
  `aadca02cc7` (C-3, P-91).

## The defect

`regulatory_programs` is on the purge list, but `document_folders` was not. A tenant holding even one project folder
therefore failed its erasure at `regulatory_programs` with 23503, and the whole transaction rolled back. The three
report-pack tables were outside the purge's reach, so a tenant's report packs would survive its erasure.

## The repair

In `PURGE_CHILD_TABLES`, before `regulatory_programs`, in foreign-key order:

| Table | Deleted by |
|---|---|
| `simple_document_versions` | the parent-scoped predicate `document_id IN (SELECT id FROM simple_documents WHERE organization_id = $1)` |
| `simple_documents` | its organisation |
| `document_folders` | its organisation; one DELETE removes a folder tree, `parent_id` included |
| `report_bundle_runs` | its organisation |
| `report_bundle_projects` | its organisation |
| `report_bundles` | its organisation |

No migration is changed (RULE 1), and no table or column is added.

## Red, then green, on a real database

The database was PostgreSQL 16, built from blank by `scripts/db/install-fresh.mjs` and then `scripts/db/deploy-migrate.mjs`,
as the CI job builds it.

- **`red-at-head.txt`.** The gate run against HEAD's purge list, exit 1. It names the `document_folders` foreign key and
  the three new tables.
- **`green.txt`.** With the fix, exit 0, and the self-test passes 59 of 59.
  - No foreign key stops the purge part-way.
  - 452 organisation-keyed tables are outside the purge's reach, against a baseline of 468. None is new, and 16 are now
    covered: the six above, and ten that cascade from them.
- **Other gates** pass: `ci:sql-interpolation`, `ci:tenant-resolvers` and `ci:regulated-delete-audit`. `ci:tenant-isolation`
  exits 0; its two candidates predate this change.
- **The purge suites** under `server/services/tenant/__tests__` pass: 9 files, 128 tests.
- **ESLint counts** are unchanged in both files.

**The baseline is not rewritten.** `--write-baseline` would also add about 30 table names, untouched since 2026-10-29
and outside this change. Locking in the 16 newly covered tables is left to whoever reviews those entries; the
ratchet passes without it.
