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

### Re-runs and later deploys

- Every step is idempotent over a **complete** database. Over a partial one
  (step 2 of install-fresh did not finish) re-running is not a repair — the
  preflight says so when it sees that shape; drop and provision into an empty
  database.
- After the first provisioning, each deploy re-runs **only** deploy-migrate
  (`.github/workflows/deploy-aws.yml` `migrate` job, from the production
  image). Every file in the set re-executes on every deploy — see
  `CLAUDE.md` Rule 1 before adding a DROP.

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
