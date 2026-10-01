# DP-66 (plan P1-52), part 1: nineteen more audit and history stores under the append-only grant ceiling

Date: 2026-10-01 (late evening). Lane: D6 (security tranche 4). Register DP-66 (Medium): beyond the eleven stores P0-8
put under the ceiling, audit, history and ledger stores still granted the runtime role UPDATE and DELETE.

## What was measured

On PostgreSQL 16 (the local test database, built by the appliers), every table whose name says audit, history,
ledger or signature was checked for an UPDATE or DELETE trigger and for what `app_service` holds. **36** had neither
trigger, and the runtime role could UPDATE and DELETE each of them; **9** more were trigger-guarded but still granted
(the census query and its output are in this README's history: `has_table_privilege('app_service', …)` per table).

The P0-8 rule is that a store joins the ceiling only after a census shows nothing at run time updates or deletes it.
Three read-only census agents covered the 34 that are not dead schemas' partitions, each checking the SQL name and
the Drizzle identifier for UPDATE, DELETE, TRUNCATE, `ON CONFLICT … DO UPDATE`, `SELECT … FOR UPDATE` and
`.update()`/`.delete()` across `server/` (tests excluded), the creating file and its applier, the writers and readers,
and whether a launch-catalog route reaches them. Their findings, with file and line, decide the list below.

## Decision

| Disposition | Stores |
|---|---|
| **Under the ceiling now** (written by INSERT only on every path) | `proof_audit_logs` (Authoring workflow proofs), `coauthor_validation_history` (AnA actions), `embedding_audit_log`, `ai_provider_audit_log`, `ai.gateway_audit_log` (every AI call), `credit_ledger`, `document_audit_trail`, `ectd_submission_status_history`, `specification_audit_log`, `stab_audit`, the three IVDR histories, `regulatory_harmonization.export_job_audit_log` |
| **Under the ceiling now** (P1-24's domain-history stores, append-only by trigger since `00f94ee9`, which the list's own comment said should join once that migration landed) | `workflow_history`, `document_audit_logs`, `regulatory_audit_logs`, `c2c_ana_actions`, `authoring_signatures` |
| Not audit stores: mutable working records with "audit", "history" or "ledger" in the name | `authoring_export_history` (a deletable export registry; the Part 11 record of an export is its `authoring_audit_trail` row), `qms_internal_audits` (an internal-audit schedule, edited by design), `weekly_overage_ledger` (a per-week accumulator, upserted) |
| Retire (no live writer and no reader) — a product decision per table, outside this change | `authoring_audit_events`, `org_lifecycle_state_history`, `signing.signatures`, `evidence.hash_ledger`, `cer_version_history`, `sharepoint_audit_log`, `innovation.guardrail_api_audit`, `cognitive_audit.audit_replay_sessions`, `cognitive_audit.electronic_signatures`, `cortex.evolution_ledger`, `federated_ml.privacy_budget_ledger`, `fhir.resource_history`, `regulatory_harmonization.electronic_signatures`, `public.audit_trail` (no writer; two vestigial readers) |
| Left open | `regulatory_harmonization.audit_log` and its partitions (each partition needs its own ceiling; and no partition exists after 2026-04-01, so the GRDHE audit write fails today — outside the launch catalog), `cognitive_audit.semantic_audit_log` (install-fresh only, dead writers), and the trigger-guarded `compliance.*`, `charter_audit_events`, `device_audit_trail`, `signing.signature_manifests` |

Foreign-key actions run as the referencing table's owner, so the ceiling changes none of them (the
`embedding_audit_log.atom_id` `ON DELETE SET NULL` the census flagged keeps working).

## What changed

- `scripts/db/provision-app-role.mjs` `APPEND_ONLY_TABLES`: nineteen stores added. The recipe withholds UPDATE, DELETE
  and TRUNCATE on them from PUBLIC and the runtime role on every deploy (step 4), and the deploy's grant audit (step 5)
  refuses a widened one.
- `db/migrations/20260813_ai_gateway_audit_log.sql`, amended in place with a dated note (CLAUDE.md Rule 1): it granted
  the runtime role SELECT, INSERT, UPDATE, DELETE, deliberately, to keep a delete path for erasure and retention. No
  runtime path deletes from it, and an erasure belongs behind a door run as the owner, as the assistant's turn
  records' purge is. It now grants SELECT and INSERT. Without this, a suite that re-applies the file (as
  `tests/db/ai-gateway-audit-log.dbtest.ts` does) would hand the privileges back until the recipe ran again.
- Tests: `tests/db/append-only-store-grants.dbtest.ts` names the nineteen stores explicitly, as it names the first
  eleven (a test that takes its list from the code under test cannot notice the code leaving one out);
  `server/db/__tests__/provision-app-role-append-only.test.ts` pins the list and states why each new store has no
  boot-required trigger; `tests/db/domain-history-append-only.dbtest.ts` accepts the privilege refusal (42501) that
  now comes before the trigger's for the runtime role.

## Red / green

| Check | Red | Green |
|---|---|---|
| `tests/db/append-only-store-grants.dbtest.ts` with the fourteen census stores, against the recipe as it stood | `red/append-only-store-grants.dbtest.txt`: 6 of 14 failed (a role minted by the recipe, and `app_service`, held UPDATE, DELETE and TRUNCATE on each) | `green/append-only-store-grants.dbtest.txt` |
| The same with P1-24's five added, against the recipe as it stood (recipe change stashed) | `red/append-only-store-grants.dbtest.with-domain-history.txt`: 4 of 14 failed; e.g. `public.workflow_history: UPDATE`, and `UPDATE public.workflow_history … WHERE false → ran` | as above |
| The recipe on this database's `app_service` (what deploy-migrate step 4 does) | — | `UPDATE, DELETE, TRUNCATE withheld on 30/30 append-only store(s) present` |
| Recipe unit suites (`provision-app-role*`, `readiness-contract`) | — | `green/recipe-units.txt`: 63 passed |

Neighbouring database suites (`green/neighbour-dbtests.txt`): the gateway log's (run before the grant suite, so the
re-applied migration is exercised), P1-24's domain history, both signing ceremonies, the compliance-review suites, the
signed-act suite, child-table RLS and the two-tenant application RLS suite. `tests/db/gateway-accounts.dbtest.ts`
fails on this local database before any grant matters: its table, `organization_gateway_accounts`, comes from another
lane's newer migration that this database has not had applied.

## What remains (DP-66)

- Retire the fourteen dead stores: a product decision per table, by amending each creating migration (Rule 1), with
  the history search the working agreement asks for.
- The GRDHE audit log: a ceiling on each partition, and partitions after 2026-04-01 (the write fails today).
- Boot-required triggers for P1-24's stores (`server/services/audit/audit-immutability-triggers.ts`, changed by other
  lanes inside 24 hours on 2026-10-01).
- Triggers on the nineteen ceiling-only stores, if the owner is to be refused too. While the API task holds the owner
  credential (DP-05), a trigger does not stop a compromised process either; the ceiling stops the runtime role.
- Side findings of the census, registered separately: the AnA `export_document` command writes export history without
  a tenant (`server/services/ana-ri/command-executor.ts:3623`).
