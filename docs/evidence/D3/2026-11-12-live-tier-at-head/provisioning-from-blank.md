# F1: no database could be provisioned from empty, and the gate for it reported nothing (2026-11-12)

**Package:** F1 (a defect in shipped behaviour). **Launch rows it serves:** D1 (`npm run db:provision` on an empty
database) and D3 (the live-database tenant tier needs a database built from empty before it can run).
**Base:** `a9b5af187`. **Session:** `session_01UrPzGsENAo1PbcH1GQGRvX`.

Found on the way to re-running the D3 live-database tier at head (the lane this directory is named for; its own record
is `README.md` here, filed when that run completes). Nothing was added: two existing files are finished.

## What already exists

Searched before changing anything (RULE 3): `install-fresh`, `overlay`, `PRE_OVERLAY_CREATORS`, `to_regclass`,
`document_catalog`, across `scripts/db/`, `scripts/ci/`, `migrations/`, `db/migrations/`, `.husky/` and
`.github/workflows/`.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The installer | `scripts/db/install-fresh.mjs` | Builds a database from empty in eight steps. Step 3 overlays `migrations/` only, multi-pass. Step 6 applies the governed-content tree, then **re-applies every root file carrying a `to_regclass('<schema>.<table>')` guard** ("Second chance for files guarded on a named-schema object"), selected "mechanically by the guard they share, not by filename, so a fourth such file is covered the day it is written". | Nothing wrong. Its contract for a root file that depends on a named-schema table is the guard. |
| The gate for this failure class | `scripts/ci/check-install-fresh-overlay-deps.mjs` (`ci:install-fresh-overlay-deps`, with a selftest; both run in `.husky/pre-push:170`) | For every overlay file, checks that each **public** table it FKs or ALTERs is reachable by the installer. Its header records five earlier outages of this kind. | `dependsOn` skipped every non-public qualifier as "a different applier's question". No gate asked that question. |
| The table's creator | `migrations/20260905_document_catalog.sql` | Creates `vault.document_catalog`, guarded on `vault.documents` (`:85`). | — |
| The earlier file that alters the table | `migrations/20261008e_document_catalog_attribution.sql` | Adds columns, guarded on `vault.document_catalog` (`:53`). The pattern. | — |
| The file that broke it | `migrations/20261112_vault_catalog_dataset_profile.sql` (`a8cd38ed1`, 2026-11-12 16:04 UTC, the data catalog's lane) | Adds `dataset_profile` and `dataset_profiled_at`. Correct on a deploy. | Carried no guard. |
| The deploy applier | `scripts/db/deploy-migrate.mjs` over `C2C_MIGRATION_FILES` | Unaffected: creator at allowlist line 1890, this file at 3846. | — |

No second gate, installer or guard helper was written. The gate is extended; the migration is amended in place.

## The defect

On a database built from empty at `a9b5af187`:

```
  pass 1: applied=383 already-present=1 deferred=14 hard=0
  pass 2: applied=12 already-present=0 deferred=2 hard=0
  pass 3: applied=0 already-present=0 deferred=2 hard=0
  ⚠ 1 file(s) left unapplied. …
      20261112_vault_catalog_dataset_profile.sql — relation "vault.document_catalog" does not exist
❌ Install INCOMPLETE — not reporting success.            (exit 1)
```

Why the table is absent on every pass: its creator is in `migrations/`, but opens with
`IF to_regclass('vault.documents') IS NULL THEN RETURN`, and `vault.documents` is created by
`db/migrations/044c_gcc_vault_schema.sql` at step 6. So at step 3 the creator returns, is recorded as applied, and is
never retried. The installer already answers this for guarded files at step 6. The new file had no guard, so it failed
at step 3 instead of waiting.

What it stops: every job that builds a database from empty. In `ci.yml` three jobs run `install-fresh.mjs`
(read from the file): "Blank DB Provisioning + Deploy Migration" (`:1920`), "Production Boot Smoke (RLS on,
non-superuser role)" (`:2169`), and "Integration Tests" (`:1760`, "Provision a deploy-shaped database for the
real-database tests": plain `node scripts/db/install-fresh.mjs` under `set -euo pipefail`, so the real-database tier
never starts). Three more workflows build from empty: `neon-provisioning.yml`, `provision-database.yml` and
`tier5-browser-smoke.yml`. Deploys stay green, which is how it hides.

**Nobody had seen it yet.** CI is about two days behind (the newest completed `ci.yml` runs on 2026-11-12 are for
commits of 2026-11-10), and in those runs the database jobs were cancelled, not failed. The file landed at 16:04 UTC
today. This was found by running the installer here, not from a red job.

## Why the gate said nothing

`red/A-gate-at-HEAD-reports-nothing.txt` is the gate as it stood at `a9b5af187`, run over that tree:

```
[ci:install-fresh-overlay-deps] 398 overlay file(s) · 695 pushed table(s) · 7 pre-overlay creator(s) · 0 finding(s).
[ci:install-fresh-overlay-deps] ✅ every overlay dependency is reachable by the installer.
```

while `red/B-install-fresh-from-blank-at-HEAD.txt` is the installer on the same tree reporting INCOMPLETE. The gate's
`dependsOn` returned early for any qualifier other than `public`, so `ALTER TABLE vault.document_catalog` was never
looked at. And had it been, the public rule would have passed it: the creator is in the same tree, which that rule
reads as "a later pass resolves it". The creator being itself deferred is a dependency one step removed.

## The change

**The gate** (`scripts/ci/check-install-fresh-overlay-deps.mjs`), a second rule beside the first, in the same style
(textual, a pure exported decision, selftested):

- For a **non-public** table a root overlay file FKs or ALTERs and does not create: either the table exists during the
  overlay (created by a pre-overlay creator, or by a root file that is not itself deferred to step 6), or the file
  guards on **that exact table**. Otherwise it is a finding.
- "Deferred to step 6" is decided by the installer's own `namedSchemaGuard` expression, **read out of
  `install-fresh.mjs`**, not restated, like the two lists the gate already reads. If the installer has none, or two,
  the gate throws.
- The remedy it prints is the guard. It says that `PRE_OVERLAY_CREATORS` is not the remedy here, because the creator
  is already in `migrations/` and is deferred on purpose.
- The public rule is unchanged, and its six selftest cases still pass.

Before settling the rule it was run over all 398 overlay files: four depend on a named-schema table that exists only
after the overlay; three guard on exactly that table (`20260905b_vault_document_chunks.sql`,
`20260924_org_relationships_sponsor_rls.sql`, `20261008e_document_catalog_attribution.sql`); one does not, and it is
the file the installer rejects. One true finding, no false one. That is also why the guard must name the table itself:
all three real files do, and a file that guards one table and alters another would still fail on the second.

**The migration** (`migrations/20261112_vault_catalog_dataset_profile.sql`), amended in place with a dated header note
(RULE 1): the same `ALTER` and `COMMENT`, inside a `DO` block that returns when `vault.document_catalog` is absent.
Nothing is removed. On a database that has the table, the same two columns and the same comment are applied.

## Proof — each shown failing first

| Stage | Result | File |
|---|---|---|
| A: the gate at `a9b5af187`, over that tree | exit 0, "0 finding(s)" | `red/A-gate-at-HEAD-reports-nothing.txt` |
| B: `install-fresh` from blank at `a9b5af187` | exit 1, INCOMPLETE, the one file unapplied | `red/B-install-fresh-from-blank-at-HEAD.txt` |
| C: the extended gate, migration not yet touched | **exit 1, 1 finding: that file, that table** | `red/C-extended-gate-on-the-unfixed-migration.txt` |
| D: `install-fresh` from blank, migration guarded | exit 0, "Application schema install complete"; step 6 re-applies **31/31** guarded root files (30/30 before) | `green/D-install-fresh-from-blank-after.txt` |
| — the two columns on that from-blank database | `dataset_profile jsonb`, `dataset_profiled_at timestamp with time zone` | queried after D, before `deploy-migrate` |
| E: `deploy-migrate` on it | exit 0, "safe to roll services" | `green/E-deploy-migrate-after.txt` |
| F: the gate's selftest | 21 of 21 (10 as before, 8 named-schema cases, 3 for reading the installer's selector) | `green/F-gate-selftest.txt` |
| G: the gate on the tree | exit 0, 0 findings, 277 named-schema tables counted as existing only after the overlay | `green/G-gate-after.txt` |

C is the control: the gate was extended first and run against the migration as it was, so it is seen failing on the
real case, naming the same file the installer names in B. D is the installer itself, since the gate only models it.

Also green after: `ci:migration-guard-order`, `ci:migration-set-order`, `ci:migration-drop-safety`,
`ci:migration-deploy-path`, `ci:migration-reachability`, `ci:migration-prefix-collisions`. No test pins the gate's
summary line (searched `scripts/`, `tests/`, `.husky/`, `.github/`).

## Environment, stated so the result can be weighed

PostgreSQL 16.15 with pgvector 0.6.0 (Ubuntu's `postgresql-16-pgvector`, installed for this run), a new database
`c2c_d3_head_20261112` created as `postgres`, `app_service` minted by `deploy-migrate`. CI uses
`pgvector/pgvector:pg15`. The defect is an ordering one and does not depend on either version; the failure text in B is
PostgreSQL's own.

## Not done

- **Sort order inside step 6.** The re-apply runs each guarded root file once, in filename order. A guarded file that
  sorts before its own guarded creator would no-op at step 3 and again at step 6, and for an added column nothing
  asserts it afterwards. No file in the tree is in that position today (all four dependents sort after their
  creators). The gate does not check it; it is a real hole of the same family and is named here, not built, because
  nothing has shown it.
- **The other statements that fail on a missing table** (`CREATE INDEX … ON`, `CREATE POLICY … ON`,
  `COMMENT ON`). The gate reads the same two forms for named schemas as it always has for `public`: an FK target and
  an `ALTER` subject. Widening both rules is a separate change.
- **No hosted run.** Everything here is local. Whether CI's own blank-database job goes green is known when CI reaches
  this commit, about two days from now at its present pace.
