# A turn record leaves with the tenant, and the runtime role can rewrite no record table

Launch rows **D5** (Part 11 evidence) and **D6** (security posture), 2026-10-01.
This follows the AnA record work in `../2026-09-26/` (turn records) and
`../2026-09-26-authoring/` (comments, quoted passages, AI-suggestion
decisions). It closes three items that work left open.

## 1. What a purge does with an AnA turn record (decided)

The turn-record tables were append-only for every role, and the tenant purge
did not list them. An offboarded tenant therefore kept every prompt, document
excerpt and answer AnA had handled. `ci:purge-coverage` reported both tables as
new residue (hand-on 4 in `docs/work-orders/README.md`).

**Decision.** The contract already answers this. MSA §10.2 and DPA §3.5
delete Customer Data after the export window. They retain only audit-trail
records, for ten years.

- **A turn record's body is Customer Data.** That is `record_text` and the
  texts in `ana_record_blobs`: the person's question, the files and passages
  AnA was given, its tool inputs and its answer.
- **Its audit-trail record is the chained `audit_logs` row.** That row holds
  `recordSha256`, the actor, the time and the chain link.

So the export returns the body, the purge erases it, and the chained row stays.
The customer's exported copy can still be checked against our retained chain
for the whole retention period.

**How** (`migrations/20260926_ana_turn_records.sql`, amended in place with a
dated note, CLAUDE.md Rule 1):

- **The role.** `ana_record_purger` is NOLOGIN, NOINHERIT and NOBYPASSRLS. It
  follows the `audit_archiver` pattern of `20260617_audit_logs_immutability.sql`,
  including the path for a non-superuser applier (the RDS master).
- **The trigger.** The append-only trigger lets a row DELETE through only when
  `current_user` is that role. The table owner and a superuser are still
  refused, and TRUNCATE is refused for everyone.
- **The door.** `public.purge_tenant_turn_records(integer)` is SECURITY
  DEFINER, owned by the role, with `search_path` pinned and EXECUTE revoked
  from PUBLIC. It restates the purge's preconditions at the database, as
  VR-07's `purge_tenant_vault_records` does:
  - the session is in the platform scope;
  - the organization is `pending_deletion`;
  - no legal hold on it is active.

  It is on `scripts/db/security-definer-allowlist.json` as `reviewed-risk`,
  with its reason.
- **The purge.** `purgeTenant` (`server/services/tenant/tenant-offboarding.ts`)
  lists both tables, erases them through the door inside its transaction, and
  reports `turnRecordErasure: {records, blobs}`. So does `POST
  /api/tenants/:id/purge`. A database that has the tables but not the door is
  refused (`TURN_RECORD_PURGE_UNAVAILABLE`) and nothing is erased.
- **The export.** `tenant-full-export.service.ts` already finds both tables by
  their tenant column, and the purge already requires a complete export
  receipt.

## 2. P0-8, the grant half: the runtime role cannot rewrite a record table

Before this change, `APPEND_ONLY_TABLES` named `audit.tamper_proof_log` alone.
The grant recipe left the runtime role UPDATE and DELETE on every public record
table, and only the triggers refused a rewrite. On a database built by
install-fresh + deploy-migrate at `3ae47ecca`, `app_service` held UPDATE, DELETE
and TRUNCATE on all nine public record tables. The engine accepted its
`UPDATE audit_logs …` (`red/dbtest-old-grants.txt`).

Now:

- **The list.** `APPEND_ONLY_TABLES` names ten tables: `audit.tamper_proof_log`,
  `audit_logs`, `audit_log_archives`, `audit_events`, `ana_turn_records`,
  `ana_record_blobs`, `authoring_audit_trail`, `doc_revisions`,
  `concept2cure_signatures` and `concept2cure_submission_snapshots`.
- **Why these.** Each one's trigger refuses every UPDATE and DELETE, so no
  runtime path can need either privilege. A search of `server/`, `shared/` and
  `scripts/db` found no runtime UPDATE, DELETE, TRUNCATE, upsert or row lock on
  any of them. The one writer is the tamper drill in `scripts/db-verify`, which
  runs as the owner. Deletes go through their own doors, each with its own
  role.
- **Not on the list.** Tables whose triggers allow a governed UPDATE:
  `electronic_signatures` (supersession), `authoring_comments` (status) and
  `vault.documents` (write-once columns).
- **The recipe.** `withdrawAppendOnlyWrites` revokes UPDATE, DELETE and TRUNCATE
  on each table, from the runtime role and from PUBLIC. It runs on every
  deploy, after the schema grants and the default privileges.
- **The audit.** `auditRuntimeRoleGrants`, which the deploy and the readiness
  contract check against, holds each of these tables to SELECT/INSERT in any
  schema. It now reads TRUNCATE too. Anything beyond that is `excess`, and a
  runtime role that owns one of the tables is `ownedAppendOnly`.

## 3. Task events record the reason a person gave, or none

The task ledger wrote a sentence the code composed whenever nobody had stated a
reason, from eleven sources:

- the tasking routes' `defaultReason`;
- AnA's "Task created by AnA…" and "Task status changed by AnA";
- the completion cascade;
- the blueprint seed;
- the biostatistics bridge;
- workflow templates;
- the dependency block;
- auto-assign;
- the module sync.

Now the recorded reason is the person's, trimmed, or null. The system's
description goes into the hashed payload as `summary`. Commit `4656ab885`; its
evidence is in `task-reasons/`.

## Shown

Every run is on PostgreSQL 16.13, on a database built from empty by
`install-fresh` + `deploy-migrate`, the way CI's real-database job builds one.

| | Red | Green |
|---|---|---|
| `tests/db/turn-record-purge-door.dbtest.ts` | 2 of 7 on the old grants: nine tables writable; `UPDATE audit_logs` accepted (`red/dbtest-old-grants.txt`) | 7/7 after `deploy-migrate` with this recipe (`green/dbtest.txt`); the redeploy's readiness contract passed its grant audit (`green/redeploy-excerpt.txt`) |
| `ci:purge-coverage` | HEAD's purge list: `ana_record_blobs`, `ana_turn_records` new, exit 1 (`red/purge-coverage-head.txt`) | 0 new (`green/purge-coverage.txt`) |
| The amended migration | n/a | applied twice by hand and once more by the redeploy, all clean (CLAUDE.md Rule 1 replay) |

**What the dbtest proves.**

- The runtime role holds SELECT and INSERT, and nothing more, on every
  append-only table. Its UPDATE, DELETE and TRUNCATE are refused with SQLSTATE
  42501, before any trigger runs.
- The table owner's own DELETE and TRUNCATE are refused.
- The door refuses three cases: an active organization, a tenant scope, and an
  active legal hold.
- The door is not executable by PUBLIC. It is owned by the purger role, which
  cannot log in and is neither superuser nor BYPASSRLS.
- The export contains the turn record, and its bytes hash to the recorded
  sha256.
- The purge erases both tables for that tenant and leaves the other tenant's
  records alone.
- The chained `audit_logs` row survives, and its `recordSha256` still matches
  the exported bytes.
- Without the door, the purge refuses and erases nothing.

**Mutations** (`mutations.txt`). Each one was applied, run, seen red, and then
restored: the migration re-applied, files compared with `cmp`.

| # | Mutation | Red |
|---|---|---|
| M1 | The trigger also admits the table owner (the VR-07 shape) | the owner's DELETE |
| M2 | The door does not check `pending_deletion` | an active organization's records erased |
| M3 | The door does not check the platform scope | a tenant scope erases |
| M4 | The door does not check legal holds | a held tenant erased |
| M5 | The purge sends the two tables through a plain DELETE | the purge fails with `IMMUTABILITY_VIOLATION`; the missing-door case no longer answers `TURN_RECORD_PURGE_UNAVAILABLE` |
| U1 | The audit uses a record table's schema default, full DML | 3 unit cases |
| U2 | The audit does not read TRUNCATE | 2 unit cases |
| U3 | The recipe revokes only UPDATE and DELETE, and only from the role | the recipe case |

## Regressions

- **Real-database tier** (`npm run test:db`): 941 of 943 on the first run
  (`green/db-tier-first-run.txt`). Two failures:
  - `two-tenant-application-rls`, "audit_logs: update and delete of tenant B
    are indistinguishable not-found". This change caused it. The proof route's
    PATCH and DELETE had no handler for a privilege refusal, so it answered
    500. They now give 42501 the same opaque 404 the route's POST already uses.
    A new case pins the stronger property: tenant A cannot rewrite even its own
    audit row. Before P0-8 that reached the trigger and answered 500. 30/30.
  - `scheduler-jobs-under-rls`, the memory-consolidation lease. This change
    did not cause it: it fails the same way with the old grants restored.
    `3947cc453` made the cron callback discard the cycle's outcome (node-cron's
    callback type), and the test awaited that outcome. It now fires
    `runScheduledConsolidation`, the function the callback runs, twice at once.
    11/11, and red again with the lease removed. CI had not shown this failure
    because its real-database job is skipped while Lint is red.
- **Proof tier** (`test:proof-tier`): 114 files, 1,238 tests, all pass.
- **Unit suites**:
  - the tenant, tenant-export and `server/db` suites;
  - every test that applies `20260926_ana_turn_records.sql` (6 files, 64
    tests), including the turn-record and trigger-registry PGlite suites;
  - `provision-app-role{,-append-only}` and `readiness-contract` (53).

  All pass. The PGlite harnesses have no `organizations` table, so that grant
  is guarded the same way the legal-holds grant already was.
- `tsc`: 0 errors. ESLint ratchet: no file gained a warning.
- `ci:migration-drop-safety` and `ci:migration-set-order`: OK.

## Not done

- **The anchored chain head**, P0-8's other half: a daily chain-head anchor in
  the object-locked evidence bucket, checked by the sweep.
- **Two more places that compose a reason**, open in this lane:
  - realtime-collab lock events: "Section lock acquired/released via
    realtime-collab API" (`realtime-collab.ts` ~798);
  - `erasePersonalData`: `params?.reason || 'GDPR Art. 17 erasure request'`,
    and the model's params rather than the person's sign-off
    (`command-executor.ts` ~1934).
- **`authoring_audit_trail` at purge** stays retained, deliberately. It is an
  audit trail of changes to electronic records (21 CFR 11.10(e)), the category
  the contract retains.
