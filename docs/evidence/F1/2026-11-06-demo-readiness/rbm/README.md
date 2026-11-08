# Restore the existing RBM patient-profile upsert arbiter

Plan: F1. Existing capability: project RBM subject-metric intake. Inventory at
`c50f8782ad8ef622872578ae4fae41e14d18caa1`; no production edit or live DDL at
publication.

## What already exists

- `server/routes/mdx-rbm-data.ts` owns the existing metric-ingest transaction
  and direct patient-profile upsert. Both retain the existing project/tenant
  admission. `server/services/rbm/metric-ingestion.ts:533` merges subject metrics
  using `ON CONFLICT (organization_id, program_id, subject_id)`; the direct
  route uses the same conflict target. Neither writer is rebuilt here.
- `migrations/20260701_rbm_patient_profiles.sql` creates this existing table and
  declares exactly that three-column UNIQUE, inside `CREATE TABLE IF NOT EXISTS`.
  Its three later standalone indexes are nonunique. There is no standalone
  repair of that uniqueness elsewhere in the searched migrations.
- `20260928_platform_role_grants_platform_writes.sql` and the existing project
  sharing/review migrations already verify unique-index validity, readiness,
  immediacy and exact key attributes using `unnest(indkey) WITH ORDINALITY`.
  Reuse that established catalog-check shape for the replay postcondition.
- `shared/schema.ts:19024` declares the same table and its three ordinary
  indexes, but omits the three-column unique definition. `install-fresh.mjs`
  initially provisions Drizzle's declared tables before the raw migrations.
  Once the table exists, replaying its `CREATE TABLE IF NOT EXISTS` does not
  install the missing inline constraint.
- `scripts/db/migration-set.mjs:223` already lists the creating migration.
  `applyMigrationFiles` executes its current SQL on every run, with transaction,
  bounded lock timeout/retries and rollback on failure. The applier does not
  skip a migration because its journal hash was seen before. This is a missing
  replay repair, not an absent migration-list entry.
- `scripts/demo/launch-demo/packs/lumen-rbm.mjs:204` already names this gap and
  keeps subject intake separate so failed profiles do not erase other metrics.
  The intake, board and cohort scorer already exist; no new demo app or table
  is required.

Read `AGENTS.md`, `CLAUDE.md` Rule 1, the current plan/ledger and coordination
holds. Searched both upsert callers, model, creating/follow-up migrations,
installer/applier, tests and demo code. Deleted RBM history includes
`2895218b8` and `15da8159e`; no deleted parallel store is restored.

## Actual reproduction and source finding

The native owner recorded the real POST at 20:25:11 UTC: HTTP 500, SQLSTATE
`42P10`, no unique/exclusion constraint matching the conflict target. Its
bounded catalog read reports zero profiles, zero duplicate triples, only the
primary-key unique index and the three nonunique model indexes. Raw bounded
evidence is `../native/rbm-subject-import-red.json`; no subject data is exported.
The source finding above explains why replay did not repair that state.

## Proposed minimal repair and risks

Amend the existing creating migration in place with an idempotent, standalone
unique-index repair for the same three columns. A dated note must explain the
bootstrap/replay gap. Reuse the original auto-generated constraint-index name
`rbm_patient_profiles_organization_id_program_id_subject_id_key` so an already
correct fresh inline constraint does not gain a second index. Verify the actual
arbiter after replay; an object-name collision must not masquerade as success.
Root's approved bounded contract also adds the matching named three-column
unique index in the existing `shared/schema.ts` declaration, using its already
imported `uniqueIndex`. Model bootstrap and migration replay must agree. No
migration-list change, new table/route/field, writer change, deletion,
deduplication or metric rewrite is proposed.

Index creation blocks concurrent table writes while it scans; the canonical
applier bounds lock acquisition. Existing duplicate non-null program triples
would make the unique build fail and roll back. Preserve those rows and stop
for reconciliation; never pick a survivor or weaken the key. Nullable-program
semantics must remain the original ordinary UNIQUE behavior. The live fixture
has zero rows, but that does not qualify populated production databases.

Before landing, the native owner must replay the exact amended file, prove
idempotent second replay and actual subject intake, and test duplicate-data
failure without row changes on an isolated fixture. Live DDL requires root GO.
No GREEN or repair implementation is claimed at inventory publication.

## Implemented bounded repair and focused checks

The existing model and creator now declare the same named three-column unique
index. The replay postcondition verifies the existing named object is usable,
immediate, valid, ready, plain and nonpartial, with exactly the intended key
attributes and ordinary NULL-distinct semantics. Wrong, invalid, expression,
partial, deferred and NULLS-NOT-DISTINCT named indexes are refused for explicit
reconciliation. No writer, data, route or migration-list entry changed.

Focused qualification: **45/45 tests across three files passed in 7.24 seconds**,
including 13 isolated real-SQL/PGlite schema cases plus the existing ingestion
and honest-outcome suites. Fresh creation, two replays, bootstrap repair,
one-profile metric merge, nullable-program compatibility, wrong/invalid named
indexes and duplicate-data failure with both original rows retained all pass.
These are isolated fixtures; native replay and actual HTTP intake are recorded
by their owner separately.

Scoped lint has zero errors: the new schema test has zero warnings, and the
existing shared schema has its two existing warnings (file size and an unrelated
unused argument). No allowance changed. The source/test hashes and raw focused
logs are retained here. All worker-owned sources/tests are frozen; no build,
full typecheck or gates were run by this worker.

Final test-only follow-up: explicit PGlite row types were added; all 13 schema
cases pass again in 3.85 seconds. Production hashes are unchanged. A separate
focused TypeScript compiler was not run; root owns the required push compiler.
