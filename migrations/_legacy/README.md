# `migrations/_legacy/` — superseded root-tree migrations

`scripts/db/install-fresh.mjs` reads this tree with a flat
`readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))` — non-recursive —
so a subdirectory is skipped. `scripts/db/migration-set.mjs` lists files
explicitly. `scripts/ci/check-duplicate-table-ddl.mjs` ignores any path
containing `_legacy/`. Nothing here is applied by anything.

**Do not restore a file from here to "fix" a missing table.** Each was moved
because a canonical creator already defines the same table, usually in a
STRONGER shape. Restoring one reintroduces the second definition that ADR-0006
and `CLAUDE.md` RULE 1 exist to prevent.

## Contents

### `20260524_udi_records.sql` — moved 2026-09-10 (WO-1)

Entirely subsumed by `migrations/20260507_mdx_beta_surfaces.sql`, which is on
BOTH appliers (the install-fresh root tree and `C2C_MIGRATION_FILES`) and sorts
first, so its definition already won everywhere.

The two were not equivalent, and the surviving one is the better of the pair:

| | `20260507` (canonical) | `20260524` (this file) |
|---|---|---|
| `program_id` | `uuid REFERENCES regulatory_programs(id)` | `UUID`, no foreign key |
| indexes | org, program, org+program, **plus a UNIQUE `udi_records_org_di_uniq`** | org, program, org+program |

So this file contributed a weaker `program_id` and a strict subset of the
indexes. Its only effect was to make `udi_records` read as having two creators.

### `0010_resolution_orchestration.sql` — moved 2026-09-10 (WO-1)

A statement-for-statement copy of
`db/migrations/20260725_resolution_orchestration_tables.sql`: the same four
tables (`resolution_plans`, `resolution_bundles`, `resolution_bundle_items`,
`supersession_records`), the same thirteen indexes, in the same order, with
definitions that are byte-identical once whitespace and keyword case are
normalised.

Kept the `db/migrations` copy because it is on `C2C_MIGRATION_FILES`, which
reaches BOTH a fresh install (deploy-migrate runs after install-fresh finishes)
and an existing database being updated. This file reached only the first.

Safe to remove because nothing else in the root tree touches these four tables —
no other `migrations/*.sql` file ALTERs them or foreign-keys to them — so
creating them later in the fresh-install sequence changes nothing. That check
matters: `install-fresh.mjs`'s own `PRE_OVERLAY_CREATORS` list exists because
root-tree files that ALTER a `db/migrations`-created table would otherwise defer
forever.

It was also one of the three files colliding on the `0010` prefix
(`migrations/.prefix-collisions-baseline.json`), alongside
`0010_biostats_signal_engine.sql` and `0010_operating_system_foundation.sql`.
