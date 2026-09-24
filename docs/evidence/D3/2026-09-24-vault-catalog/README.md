# D3 — AnA's document catalog had no row-level security

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Workstream:** the AnA client-files lane (`docs/work-orders/README.md`).
**Date:** 2026-09-24. **Database:** the local reference install
(`scripts/setup-local-db.sh`, journal applied 2026-09-24).
**State:** local half **done**; row green **blocked on D1** — D3's named
evidence is a two-tenant contract log from staging with the production image.

## The defect

`migrations/20260905_document_catalog.sql` created two tables with no RLS and
no policy:

| Table | Holds |
|---|---|
| `vault.document_catalog` | AnA's comprehension record for each vault document — `summary`, `purpose`, `key_data` (doses, lots, endpoints), the extraction tier, the chunking ledger |
| `vault.document_read_receipts` | the exact character spans AnA was served — the proof `completeCatalog` requires before it accepts a comprehension record |

Neither has a tenant column. Ownership is `document_id → vault.documents`,
which *is* policied, so isolation rested entirely on every application query
remembering to join through it. The sibling `vault.document_chunks`, created one
file later by the same lane, has carried four policies since the day it was
written; these two were missed.

`scripts/ci/unkeyed-request-tables-baseline.json` listed both as
`unreviewed — no one has classified this table yet`, which that file defines as
"a DEFECT awaiting triage, not a category".

## Reproduced (red)

As a minted non-superuser that is not the table owner, with exactly the four
settings `server/db/poolInstrumentation.ts` applies to a scoped statement
(`app.rls_enforce=on`, `app.current_tenant_id`, `app.current_org_id`,
`app.current_user_role`) for sponsor A:

| Attempt | Before |
|---|---|
| read B's catalog row | **1 row** |
| read B's read receipt | **1 row** |
| overwrite B's `summary` / `key_data` | **UPDATE 1** |
| forge a `cataloged` row for B's uncatalogued document | **INSERT 0 1** |
| plant a full-coverage read receipt on B's document | **INSERT 0 1** — enough to satisfy the coverage gate |
| delete B's receipt | **DELETE 1** |

`red/vault-catalog-tenant-isolation.red.txt` — 7 failed, 1 passed (the passing
case is the control: a tenant writes its own rows). `red/posture.txt`:
`document_catalog|f|f|0`, `document_read_receipts|f|f|0`, `document_chunks|t|f|4`.
`red/HEAD.txt` is the commit it ran at.

No HTTP path exploits this today — every lane query joins through
`vault.documents` to `regulatory_programs.organization_id` or acts on an id
`loadDocumentForOrg` already resolved. That is precisely what "isolation rests
on application predicates" means, and it is not what D3 asks for.

## The fix

`migrations/20260905_document_catalog.sql`, **amended in place** with a dated
header note (CLAUDE.md Rule 1: every file in the set re-runs on every deploy).
Both tables get `ENABLE ROW LEVEL SECURITY` and one policy per command, each an
`EXISTS` through `vault.documents` with `core.can_access_program` /
`core.can_write_program` — the policy set `vault.document_chunks` already
carries, not a new one. The `EXISTS` is itself filtered by `vault.documents`'
own policy for the querying role, so another tenant's document is not there to
match.

A parent-scoped policy rather than an `organization_id` column: duplicating the
tenant onto a child makes a second copy of the truth that can drift — the
reasoning `db/migrations/20260813_child_table_parent_scoped_rls.sql` records.

**Not FORCEd**, deliberately, matching `vault.documents` and
`vault.document_chunks`. `docs/evidence/D3/2026-09-23/` decided that posture:
FORCE would block the owner-run migrations and seeds, and production boot now
refuses a runtime role that owns an RLS-enabled, non-FORCEd table
(`assertRlsCatalogPosture`). Enabling RLS here brings these two tables *under*
that boot check, which they previously escaped by having no RLS at all.

The two baseline entries are removed: with the policies in place,
`ci:unkeyed-request-tables` reports them stale ("no longer
unkeyed-and-read"), and the file's rule is shrink, never grow. 112 → 110
entries, 106 → 104 unreviewed.

## Proven (green)

| File | What |
|---|---|
| `green/vault-catalog-tenant-isolation.green.txt` | `tests/db/vault-catalog-tenant-isolation.dbtest.ts`, **8/8** — RLS on with all four policies; each tenant sees exactly its own catalog row and receipt and not the other's (both directions, positive half first); A's overwrite of B affects 0 rows; A's forged catalog row and planted receipt are refused by the policy; A's delete of B's receipt affects 0 rows; A still writes its own rows |
| `green/lane-dbtests-regression.txt` | the lane's seven real-PostgreSQL suites — ingest, catalog, recall, toggles, passage search, chunking-off, placement — **56/56** |
| `green/lane-dbtests-as-app_service.txt` | **the run that matters for the write paths.** The same seven suites plus the isolation suite, **64/64**, exactly as CI's `test:db` step runs them: a database provisioned from blank by `install-fresh` + `deploy-migrate` with `APP_SERVICE_DB_PASSWORD`, `RLS_ENFORCE=on`, and the server pool on `APP_DATABASE_URL` as `app_service`. A probe confirmed the pool's `current_user` was `app_service`, not a superuser, not the owner (`postgres`). So ingest writing the extraction tier, the read receipts, `completeCatalog`, the chunking ledger and placement all ran under the new policies as the production role — no repeat of F-14, where Vault refused every upload under that role |
| `green/posture.txt` | `document_catalog|t|f|4`, `document_read_receipts|t|f|4` |
| `green/gates.txt` | `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:unkeyed-request-tables` all OK |

The suite applies the committed migration file itself in `beforeAll`, so it
proves the file as committed, not a database that happens to be ahead of it.
It connects through `tests/db/harness.ts`, whose runtime role is provisioned
by the real `scripts/db/provision-app-role.mjs`. The lane's other db suites
see a policy only when the application pool runs as the runtime role — which
is why the regression run is repeated CI-shaped above; on a developer default
(no `APP_DATABASE_URL`) the pool falls back to the owner and RLS does not
apply.

To reproduce: `TEST_DATABASE_URL=<admin url> npx vitest run --config
vitest.db.config.ts tests/db/vault-catalog-tenant-isolation.dbtest.ts`, then
remove the RLS block from the migration and run it again.

## Owed

- **Staging.** The two-tenant contract against staging with the production
  image, which is D3's named evidence. Blocked on D1.
- **Operator backfill.** `scripts/backfill-vault-chunks.mjs --org N` runs with
  no tenant scope, so as the runtime role under `RLS_ENFORCE=on` the pool guard
  refuses it outright (it already did before this change — it reads
  `vault.documents` and writes `vault.document_chunks`, both policied). With an
  owner connection RLS does not apply either way. It should scope itself to the
  `--org` it is given; recorded, not done here.
