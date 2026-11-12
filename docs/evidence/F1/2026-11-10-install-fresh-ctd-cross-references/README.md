# F1: "install-fresh refuses `ctd_cross_references`": not reproducible on trunk

**Package:** F1 (a repair report, checked). **Read at:** `59dc4f9f58` on `concept2cure-v2`, 2026-11-10.
**Reported by:** the D3-4 session (`docs/evidence/DESIGN/D3/D3-4/README.md`, "Found, not D3's"). It said
`scripts/db/install-fresh.mjs` stops with "`public.ctd_cross_references` carries no RLS policy", while deploy-migrate
completes. Its environment also needed `postgresql-16-pgvector` installed and `CREATE EXTENSION vector` run before
the migration set applied.

## What already exists

- `migrations/0005_csr_knowledge_database.sql:655` creates `ctd_cross_references`. It has no tenant column; it is a
  child of `ctd_module_sections`, `ctd_documents` and `csr_studies`.
- `db/migrations/20260813_child_table_parent_scoped_rls.sql:319` scopes it through `target_study_id` →
  `csr_studies.organization_id`.
- `scripts/db/install-fresh.mjs` step 6 applies that same file after the tenant sweeps ("child tables scoped to their
  tenant-keyed parents"). Step 8 runs `scripts/db/rls-coverage-check.sql`.

## What was run

On a new, empty database (`c2c_fresh_install`, owner `c2c`, not a superuser; `vector` and `pgcrypto` created first
by the superuser, as the report's note says a fresh environment needs):

1. `install-fresh.mjs` (`01-install-fresh.txt`): **exit 0**. "child tables scoped to their tenant-keyed parents",
   839 public tables, 1048 policies, "tenant isolation: every integer tenant-keyed table is policied", "Application
   schema install complete".
2. `deploy-migrate.mjs`, the step the installer names next (`02-deploy-migrate.txt`): **exit 0**. "[child-rls]
   ctd_cross_references already policied — leaving it alone", "Schema migration complete — safe to roll services".
3. `install-fresh.mjs` again over the migrated database (`03-install-rerun-over-migrated.txt`): **exit 1**, but at
   step 2. `drizzle-kit push` stops on a non-empty schema, the limitation the script's header and its own message
   state ("repair means an empty database"). It never reaches the RLS checks.

## Finding

On trunk, the documented path (an empty database, the install, then deploy-migrate) does not refuse
`ctd_cross_references`, and the table is policied. The reported refusal fits a partial install: with pgvector absent
the vector-bearing migrations fail, `csr_studies` can stay unpolicied, and the child scope then skips
`ctd_cross_references` ("parent is not scoped"), which the coverage gate rightly names. **No code change.** If it
recurs on an empty database with pgvector present, the next step is the install log's first ✗ or ⚠ line, not this
table.
