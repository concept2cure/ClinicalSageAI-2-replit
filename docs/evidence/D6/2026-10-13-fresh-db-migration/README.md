# D6/D1: a new environment could not be provisioned from trunk, 2026-10-13

**Symptom.** On every trunk run since `15af6bc4b` (2026-10-12 18:37), four CI
jobs failed:
- Blank DB Provisioning ("Deploy migration succeeds on the provisioned database");
- Production Boot Smoke;
- Production Image Boot;
- Integration Tests (their provisioning step).

No new database, whether for a test environment, staging or a client, could be
brought up from `concept2cure-v2`.

**Cause.** `db/migrations/20260813_knowledge_graph_tenant_keys.sql` was
amended on 2026-10-12 to give `citation_chains` a tenant key. The amendment
placed its backfill above the loop on purpose, so that it runs before the
policy exists. The backfill reads `knowledge_graph_nodes.organization_id`, but
that column is added by the loop below it:
- A database that had already run the file had the column, so replays passed.
- A fresh one did not. Every deploy migration stopped there.

**Fix.** The creating file is amended in place, with a dated note (Rule 1).
The backfill now runs only when `knowledge_graph_nodes` carries
`organization_id`. On a fresh database those nodes are new and unattributed, so
nothing could be attributed from them anyway. Nothing is removed.

| Run, local PostgreSQL 16 with pgvector, `install-fresh` then `deploy-migrate` as CI does | Result |
|---|---|
| Before, fresh database (`red-fresh-deploy-migrate.log`) | `✗ failed: db/migrations/20260813_knowledge_graph_tenant_keys.sql — column n.organization_id does not exist` (172 of 375 applied) |
| After, same database (`green-fresh-deploy-migrate.log`) | 375 of 375; "Schema migration complete — safe to roll services" |
| After, replayed as the next deploy (`green-replay-deploy-migrate.log`) | Exit 0. The backfill runs (`citation_chains: 0 row(s) attributed`) |
| `tests/db/knowledge-graph-tenant-isolation.dbtest.ts` as `app_service` (NOSUPERUSER, NOBYPASSRLS), RLS on | 10/10 |
| `ci:migration-drop-safety`, `ci:migration-set-order` | OK |
