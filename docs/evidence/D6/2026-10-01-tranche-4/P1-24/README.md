# P1-24 — domain history tables and the authoring signature store are append-only (DP-15, DP-16)

Tranche 4, 2026-10-01. Rows D5 and D6. Security audit 2026-09-24, findings DP-15 and DP-16.

## What was wrong

Five stores that record who did what to a governed record had no trigger. The runtime
role holds UPDATE and DELETE on every public table, so these protections were missing:

| store | what a row is | created on the deploy path by |
|---|---|---|
| `workflow_history` | one approval-workflow transition (start, approve, reject, complete) | `migrations/20260815_workflow_approval_tables.sql` (C2C set) |
| `document_audit_logs` | one unified-document lifecycle event | `migrations/20260729b_unified_workflow_companion_tables.sql` (C2C set) |
| `regulatory_audit_logs` | one regulatory-entity change with GxP flags | provisioning: `install-fresh`'s drizzle push of `shared/schema.ts` `regulatoryAuditLogs` (baseline `migrations/0000_sweet_joseph.sql`), the base schema that `deploy-migrate`'s preflight requires |
| `c2c_ana_actions` | the governed-action ledger, half of every audit pair | `migrations/20260527_mutation_primitives.sql` (C2C set) |
| `authoring_signatures` | an authoring e-signature (signer, meaning, content hash) | `db/migrations/20260725_authoring_signatures_and_workflow.sql` (authoring subsystem, deploy step 3) |

Measured on PostgreSQL 16.13 at HEAD `cbed8986` as `app_service` (NOSUPERUSER NOBYPASSRLS),
under RLS, inside its own tenant:

- `UPDATE 1` and `DELETE 1` on each store;
- the owner could `TRUNCATE` each store;
- deleting a `unified_documents` row, a `document_workflows` row or a `c2c_ana_conversations`
  row cascaded into the history under it. The conversation's key is `ON DELETE SET NULL`,
  so that cascade is an UPDATE.

The transcript is `red/probe-postgres16-head.txt`, and `probe.sql` produces it. The probe
runs in one transaction that is always rolled back, so it is safe on a shared database.

All seven stores the item names are created by a deploy applier. No store was skipped.

## Already closed before this change (proved at HEAD)

| store | closed by | proof |
|---|---|---|
| `authoring_audit_trail` | `7863cf83` (2026-09-29), amendment of `db/migrations/20260725_authoring_audit_trail.sql` | `red/probe-already-closed-head.txt`: UPDATE, DELETE and TRUNCATE are refused at HEAD. Tests: `server/routes/__tests__/authoring-record-comments.pglite.test.ts` and `authoring-record-export.pglite.test.ts` |
| `concept2cure_signatures` | `20d2ef59` (2026-09-29), `migrations/20260929_concept2cure_signatures_append_only.sql`, on the C2C set | the same transcript shows TRUNCATE refused and both triggers present and enabled. Test: `server/services/audit/__tests__/concept2cure-signatures-append-only.pglite.test.ts` |

## Census: every path that updates or deletes these tables

The search covered `server/`, `scripts/`, `shared/`, `client/` and every file on both appliers.
It looked for raw SQL across line breaks, drizzle `.update()`, `.delete()` and
`onConflictDoUpdate`, `EXECUTE format(...)` dynamic SQL, and table names used as string
literals.

- **Writers only INSERT.** The inserting code is:
  - `WorkflowService.ts` (7 sites) and `ApprovalOrchestrator.ts:630`, which write `workflow_history`;
  - `ModuleIntegrationService.ts` (4), `attachment-service.ts` (2) and `ApprovalOrchestrator.ts:644`, which write `document_audit_logs`;
  - `c2c/shared.ts`, `orchestration.ts`, `concept2cure.ts`, `action-registry.ts`, `compute/*` and `ana/*`, which write `regulatory_audit_logs`;
  - `routes/c2c/actions.ts:402`, which writes `c2c_ana_actions` and is its only writer;
  - `authoring.router.ts`, which writes `authoring_signatures` at two sites.
- **No production UPDATE, DELETE, TRUNCATE or upsert** of any of the five stores.
- **No migration on either applier** mutates their rows.
- **The tenant purge and the retention archive skip them.** The purge (`PURGE_CHILD_TABLES`) and the audit retention archive list none of them.
- **Only test fixtures delete them.** These are PGlite suites that build their own schema, plus two dbtests from another lane (see "Needs the control tower").
- **No code deletes the cascade parents.** Nothing deletes `unified_documents`, `document_workflows` or `c2c_ana_conversations`.

No legitimate path needed an exception. So the triggers have no column allow-list, no
SECURITY DEFINER door and no setting that bypasses them.

## What is true now

`migrations/20261001_domain_history_append_only.sql` is on `C2C_MIGRATION_FILES`, placed
after every creator and immediately before the final isolation steps. For each of the five
stores it installs:

- `trg_<store>_append_only`: BEFORE UPDATE OR DELETE, FOR EACH ROW;
- `trg_<store>_no_truncate`: BEFORE TRUNCATE, FOR EACH STATEMENT.

Both call `public.domain_history_append_only()`, which raises
`IMMUTABILITY_VIOLATION: <store> is append-only (21 CFR Part 11 §11.10(e)) — <OP> refused.`
It applies to every role.

- **Inserts are unaffected.** INSERT, the one path every writer uses, still works as `app_service` under RLS.
- **A parent with history cannot be deleted.** The delete is refused together with the history.
- **A parent without history is still deleted.**
- **Replay is safe.** The file uses CREATE OR REPLACE FUNCTION, then DROP TRIGGER IF EXISTS on its own names, then CREATE TRIGGER, and each table is guarded by `to_regclass`. A replay therefore re-arms a trigger that someone disabled. The file drops nothing that another file creates and creates no table.

## Red and green

| check | red (HEAD; dbtest run with a placeholder migration that adds nothing) | green |
|---|---|---|
| `tests/db/domain-history-append-only.dbtest.ts` | 24 failed, 7 passed. Each failure is UPDATE or DELETE applied (`applied (1 row(s))`), TRUNCATE applied, a cascade applied, a trigger absent, or the replay re-arm failing (`red/dbtest-domain-history-append-only.txt`). The 7 that passed are the INSERT and parent-without-history controls. | 31 passed (`green/dbtest-domain-history-append-only.txt`) |
| `probe.sql` (psql as app_service, rolled back) | 5 UPDATE 1, 5 DELETE 1, 3 cascade DELETE 1, 5 TRUNCATE; 0 rows survive (`red/probe-postgres16-head.txt`) | 18 refusals, each `IMMUTABILITY_VIOLATION`; every row survives (`green/probe-postgres16-after.txt`) |
| `ci:migration-set-order` | exit 1 when the entry is moved after the sweep, run on a scratch mirror of the set (`red/ci-migration-set-order-mutant-after-sweep.txt`) | exit 0, 334 migrations (`green/ci-migration-set-order.txt`) |
| `ci:migration-drop-safety` and its selftest | the selftest exercises the failure branch, 12/12 (`green/ci-migration-drop-safety-selftest.txt`) | exit 0 (`green/ci-migration-drop-safety.txt`). The gate does not track triggers, and this file drops only its own. |
| `ci:column-reachability` | not applicable: the file adds no column | exit 0 (`green/ci-column-reachability.txt`) |
| tests/db files touching these tables or their parents | — | `child-table-parent-scoped-rls`, `workflow-approval-tables` and this file: 52 passed (`green/dbtests-touching-these-tables.txt`) |
| schema-contract suites that apply or pin the set | — | `tenant-isolation-sweep`, `deploy-migration-mechanism` and `uuid-tenant-isolation`: 378 passed (`green/schema-contract-set.txt`) |
| `audit-immutability-triggers.test.ts` and `c2c-apply-path.contract.test.ts` | — | 17 passed |

The red dbtest ran against a placeholder `migrations/20261001_domain_history_append_only.sql`
containing only `SELECT 1;`. That reproduces HEAD exactly: no trigger exists at HEAD. The real
file then replaced the placeholder.

## Re-verification, 05:52–06:05 UTC (HEAD `66e82a6d`)

The session continued two and a half hours after the first pass. Other lanes were editing in the
meantime, so every claim above was checked again against the current tree and database.

**The census was repeated and still holds.** The search covered:

- raw SQL on one line and across line breaks;
- drizzle `.update()` and `.delete()`;
- upserts;
- every `UPDATE ${…}` and `DELETE FROM ${…}` helper whose table is a variable, each traced to the tables that variable can hold;
- the demo seeds `scripts/seed/ga-demo.d/20-tasks-approvals.mjs` and `104-decision-lineage.mjs`, which only SELECT and INSERT;
- `PURGE_CHILD_TABLES`, `retentionCron.ts` and `audit-archive.service.ts`;
- the final isolation pair, which mutates no rows;
- every catalog-looping `EXECUTE` in either applier.

No path updates or deletes any of the five stores, and none deletes a cascade parent. The authoring
governed delete removes `authoring_documents`, which has no foreign key to `authoring_signatures`.
The live catalog shows the same three cascading keys described above. It also shows
`regulatory_audit_logs` → `organizations`/`users` with NO ACTION, which already blocks those
parent deletes on its own. Both appliers that run the set (`deploy-migrate`, `apply-c2c-migrations`)
apply the authoring subsystem first, so `authoring_signatures` exists when this file runs.

| check | red | green |
|---|---|---|
| probe as `app_service` under RLS | `probe-red-mutant.sql` is `probe.sql` with this file's ten triggers dropped inside its always-rolled-back transaction. Result: 0 refusals, 18 mutations applied, 0 rows survive (`red/probe-postgres16-mutant-triggers-dropped-reverify.txt`). After the rollback, all 10 triggers are still present and enabled. | `probe.sql`: 18 `IMMUTABILITY_VIOLATION`, every row survives (`green/probe-postgres16-reverify.txt`) |
| `tests/db/domain-history-append-only.dbtest.ts` | the saved red run: 24 failed, each on an applied mutation or an absent trigger | 31 passed (`green/dbtest-domain-history-append-only-reverify.txt`) |
| tests/db files touching these stores or their parents | — | 59 passed (`green/dbtests-touching-these-tables-reverify.txt`): `child-table-parent-scoped-rls`, `workflow-approval-tables`, this file, and the new `authoring-governed-delete-signed-freeze` (another lane's). That last suite's sealing ceremony INSERTs `authoring_signatures` under the trigger. Also `domain-sign-ceremony` and `research-admin-sign-ceremony`: 68 passed |
| suites that pin or replay the set | — | 406 passed across `tenant-isolation-sweep`, `uuid-tenant-isolation`, `deploy-migration-mechanism`, `known-unlisted-reason-holds`, `check-constraint-replay`, `c2c-apply-path` and `audit-immutability-triggers`. `node --test tests/ops/apply-c2c-migrations-manifest.test.mjs`: 9/9 (`green/schema-contract-set-reverify.txt`) |
| `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:column-reachability`, `db:sync-manifest:check` | set-order mutant as above | all exit 0, 334 migrations (`green/gates-reverify.txt`) |
| already-closed stores | — | `probe-already-closed.sql`: `authoring_audit_trail` refuses UPDATE, DELETE and TRUNCATE; `concept2cure_signatures` refuses TRUNCATE (`green/probe-already-closed-reverify.txt`) |

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run --config vitest.db.config.ts tests/db/domain-history-append-only.dbtest.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run --config vitest.db.config.ts tests/db/child-table-parent-scoped-rls.dbtest.ts tests/db/workflow-approval-tables.dbtest.ts
psql "$TEST_DATABASE_URL" -X -f docs/evidence/D6/2026-10-01-tranche-4/P1-24/probe.sql
psql "$TEST_DATABASE_URL" -X -f docs/evidence/D6/2026-10-01-tranche-4/P1-24/probe-red-mutant.sql   # red: triggers dropped inside the rolled-back transaction
psql "$TEST_DATABASE_URL" -X -f docs/evidence/D6/2026-10-01-tranche-4/P1-24/probe-already-closed.sql
npm run ci:migration-set-order && npm run ci:migration-drop-safety && npm run ci:column-reachability
```

## Needs the control tower

1. **Resolved by the owning lane at 05:57 UTC: the two P0-10 sign-ceremony dbtests.** At 03:30 `tests/db/research-admin-sign-ceremony.dbtest.ts` and `tests/db/domain-sign-ceremony.dbtest.ts` deleted their `c2c_ana_actions` rows as the owner with no guard lifted, and the trigger refused it (`green/other-lane-sign-ceremony-cleanup-refused.txt`). Both files now use the owner-side idiom proposed here: inside the cleanup transaction, `DISABLE TRIGGER trg_c2c_ana_actions_append_only`, then the delete, then `ENABLE TRIGGER`, guarded on the trigger existing. Both suites pass with the trigger in place (68 passed, `green/other-lane-sign-ceremony-after-their-fix.txt`), and the residue for orgs 93210 and 93220 is gone (0 rows). Nothing is left for the control tower here.
2. **Boot verification.** `server/services/audit/audit-immutability-triggers.ts` is not this item's file. Add the ten triggers to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` so that a boot without them refuses and the daily sweep alarms. Each entry has the shape `{ schema: 'public', table: '<store>', trigger: 'trg_<store>_append_only' | 'trg_<store>_no_truncate', source: 'migrations/20261001_domain_history_append_only.sql' }`, for the five stores above. The file names each trigger literally, so the drift guard in `audit-immutability-triggers.test.ts` will pass.
3. **No migration manifest regeneration is needed.** `db/migrations/migrations_manifest.json` covers `db/migrations/` only, and `npm run db:sync-manifest:check` reports in sync.

## Not done here (residuals of P1-24 as the plan writes it)

- **DP-15, "unlinked".** `linkDomainHistory` (`server/services/audit/domain-history-link.ts`) still has no call site, and every `DOMAIN_HISTORY_TABLES` entry says `linked: false`. The rows are now immutable but are still not indexed in the `audit_logs` chain.
- **DP-16, second half.** `authoring_signatures` still keys the signer by e-mail, and it is not consolidated onto `electronic_signatures`. The plan's acceptance criterion "one signature substrate" is open.
