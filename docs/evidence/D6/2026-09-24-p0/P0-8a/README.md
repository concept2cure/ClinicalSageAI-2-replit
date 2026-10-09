# P0-8a — the audit_logs DELETE door was a session setting any role could set (DP-04, High)

**Row:** D5. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-04 (the archive-bypass half; the `app_service`
DELETE grant and the anchored chain head are the rest of plan item P0-8). **Plan item:** P0-8a.
**Reproduction at the audited commit:** `docs/evidence/D6/2026-09-24-security-audit/repro/DP-03-DP-04-postgres16-transcript.txt` §8–11.

## What was wrong

`db/migrations/20260617_audit_logs_immutability.sql` (C2C set index 210) installs the BEFORE DELETE trigger that makes
`public.audit_logs` append-only, with one exemption for the retention job: the trigger returned OLD whenever
`current_setting('app.audit_archive_bypass', true) = 'on'`. A custom GUC is not a privilege — any session can
`SET LOCAL` it — and the runtime role holds DELETE on every public table (`scripts/db/provision-app-role.mjs`
recipe). So the one caller the exemption was written for, `server/services/audit/audit-archive.service.ts`
(`BEGIN; SET LOCAL app.audit_archive_bypass = 'on'; DELETE FROM audit_logs WHERE id = ANY(...); COMMIT`), was
indistinguishable from an attacker with the application's credentials. Phase A ran that statement as a
`LOGIN NOSUPERUSER NOBYPASSRLS` role on PostgreSQL 16: `DELETE 1`, `rows_left 0`.

## What is true now

The migration is amended in place (Rule 1: it re-runs on every deploy, so the change lives in the file, with a dated
header note). The application changed in one file.

- **The trigger reads no setting.** `enforce_audit_logs_no_delete()` permits a DELETE only when
  `current_user = 'audit_archiver'`, and aborts with the existing `IMMUTABILITY_VIOLATION` / `P0A02` shape otherwise.
  `SET LOCAL app.audit_archive_bypass = 'on'` makes no difference to the runtime role, to the owner, or to anyone.
- **`audit_archiver`** is a NOLOGIN, NOINHERIT, NOBYPASSRLS role created idempotently (pg_roles-guarded). It holds
  USAGE and CREATE on `public` (the latter only because PostgreSQL's `OWNER TO` rule demands it of a non-superuser
  applier), SELECT+DELETE on `audit_logs` and INSERT on the ledger — nothing else, and nothing runs as it except the
  fixed body of the door.
- **The door** is `public.audit_logs_archive_delete(p_ids uuid[], p_archive_locator text, p_archive_sha256 text,
  p_cutoff timestamptz) RETURNS integer` — SECURITY DEFINER, owned by `audit_archiver`, `search_path = pg_catalog,
  public`, EXECUTE revoked from PUBLIC and granted to the runtime role (`app_service`, or the role named by
  `app.service_role`, the convention of `20260813_audit_tamper_proof_log.sql`; a no-op when the role is absent). It
  refuses, atomically for the whole batch (`AUDIT_ARCHIVE_REFUSED`, SQLSTATE `P0A04`): an empty batch; an empty
  locator; a checksum that is not 64 hex characters; a cutoff later than `now() - interval '24 months'` — the hot
  window of `docs/operations/audit-log-retention-policy.md` ("Hot vs cold split"), which the policy states and this
  function now enforces; a batch naming a row that is not present; any named row with `created_at >= cutoff`. It
  serialises concurrent runs with a `SHARE UPDATE EXCLUSIVE` table lock (does not block the audit writer's INSERTs),
  writes the deletion's own record, then deletes exactly the named rows and returns the count.
- **The deletion's own audit record:** `public.audit_log_archives` (id, archived_at, row_count, min/max created_at,
  cutoff, locator, sha256, performed_by = session_user), created here if absent, append-only by its own triggers
  (`P0A05`), deliberately not tenant-keyed because an archive batch spans tenants (the `audit_logs` chain is one chain
  across tenants). No request path reads it; `ci:unkeyed-request-tables` is unaffected.
- **Applier posture.** A superuser applier needs nothing. A non-superuser CREATEROLE applier (the RDS master-user
  shape) creates the role, holds ADMIN OPTION on it, grants itself SET membership and hands over the door. An applier
  that neither created the role nor was granted it fails the migration with the remedy in the HINT — shown failing,
  then passing after the grant, in the transcript below. The migration's own verification block now RAISEs (not
  WARNs) when the door is absent, owned by another role, not SECURITY DEFINER, or executable by PUBLIC.
- **`server/services/audit/audit-archive.service.ts`** issues one statement,
  `SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, $4::timestamptz) AS deleted`, with the ids, the sink's
  locator, the checksum the sink stored (already compared to the local hash) and the cutoff. The sink-before-delete
  contract is unchanged. A refusal aborts the batch, is counted in the new `deleteRefusals` field of the result and
  written to `errors` (the runner already prints the result and exits 1 on any error). The dedicated-connection
  checkout is gone with the `SET LOCAL` it served: a single statement is its own transaction on a Pool or a
  PoolClient, and nothing is checked out or released. The default cutoff moved from 720 to 731 days so it can never
  fall inside the 24-calendar-month floor. The batch SELECT casts its cutoff `::timestamptz` the way the door does.

| | File | Result |
|---|---|---|
| red | `red/postgres16-guc-delete-before-amendment.txt` | PostgreSQL 16.13, HEAD `af833c44`, the unamended trigger: as the runtime role, plain DELETE refused; `BEGIN; SET LOCAL app.audit_archive_bypass = 'on'; DELETE; COMMIT` → `DELETE 1`, `rows_left 0` (Phase A §9 replayed) |
| red | `red/pglite-door-before-amendment.txt` | PGlite, HEAD `af833c44`, unamended migration and service: 12 of 14 fail — the GUC opens the door for the runtime role and for the superuser session; no door function; the service still names the GUC |
| green | `green/pglite-door-after-amendment.txt` | 14 of 14: plain DELETE refused; the GUC statement refused for the runtime role and the superuser; the service's statement (read from its source) deletes a 3-row batch and writes the ledger row; refusals for a newer row, a 1-month and a 23-month cutoff, empty/blank locator, empty/malformed sha256, an absent row, an empty batch; EXECUTE not public; owner/SECURITY DEFINER/NOLOGIN pinned; ledger append-only; UPDATE and TRUNCATE still refused; a second apply changes nothing; the service code names neither the GUC nor a raw DELETE |
| green | `green/postgres16-door-after-amendment.txt` | PostgreSQL 16.13, `c2c_audit_repro`: the amended file re-applied by the owner as a deploy would (`CREATE OR REPLACE`); as `app_service` (login) the Phase A statement is refused on a fresh row and on old rows; the door deletes 3, `rows_left 0`, ledger row `performed_by app_service`; six refusals, rows and ledger unchanged; a role with DML on `audit_logs` but no grant gets `permission denied for function`; ledger UPDATE/DELETE/TRUNCATE refused for the owner; replay keeps 3 triggers and the owner; door works again |
| green | `green/postgres16-nonsuperuser-applier.txt` | PostgreSQL 16.13, fresh database owned by a CREATEROLE NOSUPERUSER applier: first run creates `audit_archiver`, self-grants membership, hands over the door; second run is a no-op with the same shape; door works as `app_service`. B2: a second applier that did not create the role fails closed with the HINT, `door_installed 0`; after `GRANT audit_archiver TO applier_p08a_2` the re-run installs |
| green | `green/unit-archive-service.txt` | `audit-archive.test.ts` 14 of 14 with the existing doubles: door called once per batch with `(ids, locator, storedSha256, cutoff)` after the sink confirmed; a refusal aborts, counts, reports, leaves rows; a wrong count is a refusal; no `SET`/`BEGIN`/raw DELETE on the wire; Pool-shaped client without `connect()`; default cutoff never inside the floor. The P0-9a trigger self-check suites, which apply this file, 17 of 17 |
| green | `green/gates.txt` | `ci:migration-drop-safety`, `ci:migration-set-order`, `db:sync-manifest:check` (manifest unchanged: it tracks order and count, not content), `ci:runtime-ddl`, `ci:migration-prefix-collisions`, `ci:discarded-audit-write`, `ci:regulated-delete-audit`, `check:security-patterns`, `ci:audit-logs-fixture`, plus `ci:unkeyed-request-tables` — all exit 0 |

Tests: `server/services/audit/__tests__/audit-archive-delete-door.pglite.integration.test.ts` (new),
`server/services/audit/__tests__/audit-archive.test.ts` (rewritten for the door). PGlite runs role switching and
SECURITY DEFINER faithfully (its session is a superuser, so the runtime role is `SET ROLE app_service` and the ledger's
`performed_by` reads `postgres` there); the login-role view is the PostgreSQL 16 transcript.

## Not done here

- **The `app_service` DELETE grant on `public.audit_logs` and `audit_events`** (`scripts/db/provision-app-role.mjs`,
  another lane's file until 16:02 UTC). Until it is withdrawn the trigger is the control; with it withdrawn the
  refusal happens a layer earlier. The recipe's `GRANT … ON ALL TABLES IN SCHEMA public` will also hand `app_service`
  UPDATE/DELETE on `audit_log_archives`; the ledger's triggers refuse both regardless. `APPEND_ONLY_TABLES` in that
  script could name `public.audit_logs` and `public.audit_log_archives` so `auditRuntimeRoleGrants` reports the grant.
- **The anchored chain head** written outside the database (plan P0-8, DP-05).
- **How the chain verifier treats archived rows** (`server/services/audit/chain.ts`, another lane's file): the
  ledger now records what left the hot table and where it went; the verifier still walks the hot table only.
- **Seventeen `tests/db/*.dbtest.ts` files and `tests/db/two-tenant-fixture.ts`** tear down their `audit_logs`
  fixtures with `SET LOCAL app.audit_archive_bypass = 'on'; DELETE …`. That door no longer opens; against a real
  database those teardowns will now be refused (they warn and continue in the two-tenant fixture, throw in the
  others). They connect as the table owner, so the replacement is
  `ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete` / `DELETE` / `ENABLE TRIGGER` inside their
  teardown transaction; the door itself cannot help them because their rows are inside the 24-month floor. Not this
  lane's files; not executable here (no PostgreSQL with pgvector).
- **Documents that describe the GUC as current:** `docs/DB_PROVISIONING_CONTRACT.md` §"The RAISE that never raised",
  `docs/security/WO-03_TWO_TENANT_RLS_PROOF.md`, `docs/work-orders/WO-3-tenant-isolation-proof.md`,
  `tests/db/tenant-proof-routes.ts` (comment). `docs/operations/audit-log-retention-policy.md` should name the door,
  the ledger and the enforced floor, and its role names (`bff_app`, `bff_archive`) predate `app_service`.
- The tranche index `docs/evidence/D6/2026-09-24-p0/README.md` row for P0-8a.
