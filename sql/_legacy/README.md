# `sql/_legacy/` — historical schema dumps, on no applier

Files here are kept as historical records and are **not** applied by anything.
`scripts/ci/check-duplicate-table-ddl.mjs` ignores any path containing
`_legacy/` (see its `ARCHIVED` list), which is the point: these files define
tables that live migrations also define, and comparing a dump against the
lineage that superseded it produces noise, not findings.

## What is here, and why it moved (2026-09-10, WO-1)

| File | Why it is here |
|---|---|
| `cro_database_schema.sql` | A 490-line full-schema dump. Referenced by nothing in the repository — no script, no test, no workflow, no manifest — and last modified 2026-06-16. It contributed duplicate definitions for `users`, `organizations`, `audit_logs`, `document_versions` and others against the real migration lineage. |
| `document_versions.sql` | A 182-line standalone table definition, same story: referenced by nothing, last modified 2026-06-16, duplicating `document_versions` from the dump above. |

Neither was on `C2C_MIGRATION_FILES` (deploy-migrate) or under `migrations/`
(install-fresh), so archiving them changes no deployed schema. It removes them
from the duplicate-table-ddl surface, where they were pure noise.

## If you are looking for the real definition

The canonical creator for any table is the file on an applier. Start from
`scripts/db/migration-set.mjs` (`C2C_MIGRATION_FILES`) and `migrations/`, and
see `docs/adr/0006-canonical-migration-lineage.md`. **Do not restore a file from
here to "fix" a missing table** — that reintroduces a second definition of
something the lineage already creates, which is the hazard ADR-0006 and
`CLAUDE.md` RULE 1 exist to prevent.
