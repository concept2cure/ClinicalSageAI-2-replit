# What the first un-skipped run is expected to show

The Integration job runs `npm run test:db` as `app_service` against a database built by `install-fresh` +
`deploy-migrate`. The same was run here on 2026-10-01 (PostgreSQL 16 + pgvector, the database built blank and migrated
to the tree at `6cb78f44b`):

- `green/test-db-full-run.txt` — the full suite: 97 of 101 files, 983 of 996 tests. The 4 files and 13 tests that
  failed (`two-tenant-application-rls`, `turn-record-purge-door`, `review-comments-record`, `cre-capture-immutability`)
  each tested a database guarantee added by a migration newer than the local database: e.g. "function
  public.purge_tenant_turn_records(integer) does not exist".
- `green/test-db-four-after-migrate.txt` — after `deploy-migrate` brought the database to the tree: those 4 files,
  50/50.

So on a database at the tree, the suite is green, 101/101 — the state CI builds it in. Un-skipping the job should add
the proof it was not giving, not new red. Blank DB Provisioning's path (`install-fresh` → `deploy-migrate`) also ran
clean here, twice, on 2026-09-30 and 2026-10-01. Boot Smoke needs TLS certificates and was not run locally.
