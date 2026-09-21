# Database readiness — from an empty PostgreSQL to `/readyz` `schema: ok`

**Status:** canonical from 2026-09-20 (launch rows D1 / D3, workstream W2).
**Evidence:** `docs/evidence/W2/2026-09-20/`.

## The one command

```bash
DATABASE_OWNER_URL='postgresql://<owner>:<pw>@<host>:5432/<db>' \
APP_DATABASE_URL='postgresql://app_service:<app-pw>@<host>:5432/<db>' \
APP_SERVICE_DB_PASSWORD='<app-pw>' \
node scripts/db/provision.mjs          # npm run db:provision
```

It runs, in order, and stops at the first failure:

| Step | What | As | Refuses when |
|---|---|---|---|
| 0 | Resolve connections | — | owner and app URLs name different databases (exit 2) |
| 1 | Preflight | owner | pgvector not in `pg_available_extensions` (exit 4, names `postgresql-<major>-pgvector`); owner lacks CREATEROLE or cannot `CREATE EXTENSION vector` (exit 5); `psql` absent (exit 2). Nothing is written before these except `CREATE EXTENSION IF NOT EXISTS vector`. |
| 2 | `scripts/db/install-fresh.mjs` | owner | any incomplete area (exit 6) — drizzle push, raw overlay, authoring subsystem, RLS, the 42 `*_gcc_*` governed-content files, app_service grants, verification |
| 3 | `scripts/db/deploy-migrate.mjs` | owner | any file of `C2C_MIGRATION_FILES` fails (exit 7). This is the step that creates `public.licenses` and `audit.tamper_proof_log`; install-fresh alone leaves both absent. It ends with the readiness contract verified as the owner. |
| 4 | Readiness contract | **app** | anything `/readyz` would fail on (exit 8): required schemas (`public`, `vault`, `extensions`), the `vector` extension, `organizations`/`users`, the five security-critical tables (`organization_users`, `platform_role_grants`, `revoked_tokens`, `licenses`, `audit_logs`), `audit.tamper_proof_log`, the 19 authoring tables — and, as the app role, that it is neither superuser nor BYPASSRLS and can `SELECT` every one of those tables. |

The contract in step 4 is `scripts/db/readiness-contract.mjs`, the same code
deploy-migrate verifies with. Its lists are pinned to
`server/db/ensureCoreTables.ts` and `server/startup/services.ts` by
`server/db/__tests__/readiness-contract.test.ts`, so the deploy cannot verify
one list while the boot demands another.

### Roles

- **`DATABASE_OWNER_URL`** provisions. It needs `CREATEROLE` (three governed-
  content files create roles) and the ability to `CREATE EXTENSION vector`
  (`vector` is not a trusted extension). On RDS/Aurora the master user has
  both; locally use the `postgres` superuser or `ALTER ROLE <owner> CREATEROLE`
  plus a superuser-created extension. Falls back to `DATABASE_URL` **with a
  warning** — the single-role posture that production refuses under
  `RLS_ENFORCE=on`.
- **`APP_DATABASE_URL` + `APP_SERVICE_DB_PASSWORD`** mint the non-superuser,
  NOBYPASSRLS `app_service` role (`scripts/db/provision-app-role.mjs`) and
  verify the contract as it. The server must run with `APP_DATABASE_URL` set to
  this role; the provisioner prints that in its "Next" block.
- **`APP_DATABASE_URL` without `APP_SERVICE_DB_PASSWORD`** (2026-09-21,
  IQ-DEV-001): a runtime role that already exists is **not minted but is still
  granted**. The provisioner identifies the runtime role — `RUNTIME_DB_ROLE` if
  set, else the `APP_DATABASE_URL` login — refuses at preflight if it does not
  exist, hands it to `install-fresh` and `deploy-migrate` as `RUNTIME_DB_ROLE`,
  and both refresh its grants through the one recipe
  (`provision-app-role.mjs` → `ensureRuntimeRole`). Step 4 then verifies the
  contract **as that role**, including the grant audit below. Before this, the
  grant refresh was gated on the password, so an unminted split-role estate
  (owner `postgres`, runtime `c2c`) came out of a green provisioning with 183
  public tables the runtime could not read (`docs/evidence/WD/2026-09-21/`).
- **Single-role** (no `APP_DATABASE_URL`, or it names the owner): nothing is
  granted, exactly as before — the owner needs no grants on its own tables.

### The grant recipe and the grant audit

One function defines what the runtime role may do
(`scripts/db/provision-app-role.mjs`): on every application schema present,
`USAGE`; `SELECT, INSERT, UPDATE, DELETE` on tables (**`audit`: `SELECT,
INSERT` only — append-only; `extensions`: `SELECT`**); `USAGE, SELECT` on
sequences; `EXECUTE` on functions; and the same as `ALTER DEFAULT PRIVILEGES`
for objects the owner creates later, so the next migration cannot reintroduce
the gap. It only ever GRANTs.

The audit (`auditRuntimeRoleGrants`, run by deploy-migrate step 5 and by the
provisioner's step 4 whenever a runtime role is identified) walks every table,
view, materialized view and foreign table in every application schema and
fails the deploy on:

- any relation the role lacks the recipe privileges on, or a schema it lacks
  `USAGE` on (the IQ-DEV-001 shape — `re-run deploy-migrate as the owner`);
- any privilege **beyond** the append-only ceiling that the role holds on an
  audit relation it does not own (a `PUBLIC` grant or a hand `GRANT UPDATE ON
  audit.tamper_proof_log`) — the recipe never grants these and a widened audit
  store is not a deployable state; the operator REVOKEs;
- the role **owning** `audit.tamper_proof_log` (ownership confers everything).

On demand: `node scripts/db/audit-runtime-grants.mjs [--role <name>] [--json
<path>]` prints the same audit (exit 1 on any gap) and writes the inventory in
the shape IQ-001 check IQ-07 records (`deniedCount`, `denied[]`).

### Re-runs and later deploys

- Every step is idempotent over a **complete** database. Over a partial one
  (step 2 of install-fresh did not finish) re-running is not a repair — the
  preflight says so when it sees that shape; drop and provision into an empty
  database.
- After the first provisioning, each deploy re-runs **only** deploy-migrate
  (`.github/workflows/deploy-aws.yml` `migrate` job, from the production
  image). Every file in the set re-executes on every deploy — see
  `CLAUDE.md` Rule 1 before adding a DROP.
- deploy-migrate connects with `DATABASE_OWNER_URL` when it is set (else
  `DATABASE_URL`). With the owner URL set, `DATABASE_URL` is read as the
  runtime's connection and its login is the runtime role to grant — the split
  posture in one command:
  `DATABASE_OWNER_URL=… DATABASE_URL=… node scripts/db/deploy-migrate.mjs`.

## Proof (2026-09-21, IQ-DEV-001 — `docs/evidence/WD/2026-09-21/`)

- `denied-before.txt` / `denied-after.txt` — the IQ-07 inventory query on
  `clinicalsage` (runtime `c2c`, 183 public tables owned by `postgres`): **264
  denied → 0** after one `deploy-migrate` run as the owner with the runtime
  role identified from `DATABASE_URL` (`deploy-migrate-clinicalsage.transcript.txt`,
  grant audit 1263/1263). `audit.tamper_proof_log` for `c2c`: SELECT, INSERT
  only.
- `fail-proof-throwaway.transcript.txt` — on a throwaway copy of
  `clinicalsage_fresh`: a hand `REVOKE` is caught by the audit (exit 1, names
  `public.organizations` and the `intelligence` schema), healed by
  deploy-migrate with `RUNTIME_DB_ROLE=app_service` and no password; `GRANT
  UPDATE ON audit.tamper_proof_log TO PUBLIC` makes deploy-migrate **refuse**
  (exit 1) until revoked; a table created after the refresh is readable with no
  further grant (default privileges), and an audit table created later is
  SELECT/INSERT only; a non-existent `RUNTIME_DB_ROLE` fails the deploy instead
  of being skipped.
- `provision-throwaway.transcript.txt` — the full one-command path with
  `APP_DATABASE_URL` on an existing, unminted `app_service` and no password:
  preflight confirms the role, both children refresh grants, step 4 verifies as
  `app_service` including the grant audit.

## Proof (2026-09-20, local PostgreSQL 16.13, pgvector 0.6.0)

- `provision-fresh.transcript.txt` — empty `clinicalsage_fresh` → 792 public
  tables, 821 RLS policies, 42/42 governed-content files, 291-file C2C set,
  contract verified as `app_service` (27/27 tables readable), exit 0.
- `readyz-5100-clinicalsage_fresh.txt` — the server booted on port 5100 **as
  `app_service`** against that database: `database: ok, schema: ok,
  schemaState: ready`. HTTP 503 only because `ana: down (no_provider)` — no AI
  provider key was set, which is expected and is the separate `ana` gate.
- `provision-refusal-no-pgvector.txt` — with the server's `vector.control`
  hidden, exit 4 naming `postgresql-16-pgvector`, 0 tables written.
- `provision-refusal-owner-privileges.txt` — as `c2c` (no CREATEROLE), exit 5
  naming the three role-creating files, 0 tables written, plus the
  `DATABASE_URL`-fallback warning.
- `provision-refusal-url-mismatch.txt` — exit 2.

## Production checklist (what the command does not do)

- [ ] `DATABASE_OWNER_URL` is the RDS master (or a CREATEROLE role); it is used
      by the one-off provisioning task and by the deploy-time migrate job only.
- [ ] `APP_DATABASE_URL` is `app_service`; `RLS_ENFORCE=on`; the boot refuses a
      superuser or BYPASSRLS role.
- [ ] TLS: the provisioning scripts verify the server certificate; supply the
      Amazon RDS CA bundle via `NODE_EXTRA_CA_CERTS`, never disable verification.
- [ ] `AUDIT_TRAIL_ENABLED=true` with `AUDIT_HMAC_SECRET` / `AUDIT_HMAC_KEY` in
      KMS — `audit.tamper_proof_log` exists after step 3.
- [ ] Automated snapshots + a restore drill (`npm run db:dr:restore-proof`).
- [ ] Pool sizing vs. the instance's connection limit; statement timeouts.
- [ ] Alerts on connection saturation, error spikes, slow queries.
- [ ] Credentials rotate on a schedule (`APP_SERVICE_DB_PASSWORD` re-runs
      deploy-migrate to rotate `app_service` in place).
