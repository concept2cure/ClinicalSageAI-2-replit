# MR-03 Stage 3 — the RDS master credential out of the API task

Launch row **D1** (hosted production). Work order
[`MR-03`](../../../work-orders/MR-03-first-deploy-staging-to-production.md), Stage 3
(OPS-16). Branch `concept2cure-v2`. Session `…session_01GSjEDJLuZsEzPa9PnVg1yF`
(lane W2/D1).

The same change delivers two parts of
[`MR-05`](../../../work-orders/MR-05-tenant-isolation-as-a-hard-boundary.md), so
the work is done once:

- **Stage 2** (DATA-03, the same finding as OPS-16);
- **Stage 1, steps 2–5** (`tenants-simple` off the owner connection, ARCH-08).

MR-05 Stage 1's steps 6–7 (removing the extra drivers, and `ci:single-db-pool`)
are not done here.

| Slice | What | State |
|---|---|---|
| A | `/api/tenants` off the owner connection | done |
| B | The boot without the owner credential: the auth schema and organisation seeds into the migration set, a verify-only production boot, CI's boot smoke without `DATABASE_URL` | next |
| C | Terraform: a migrate task definition that alone holds the owner secrets; the deploy preflight and one-off tasks | open |

## Re-confirmed at head before starting

At `8e2c7af37`, OPS-16 is open as the work order describes it:

- `terraform/stack/main.tf` puts `DATABASE_URL` in `boot_secrets` and
  `APP_SERVICE_DB_PASSWORD` in `api_secrets`;
- `deploy-aws.yml` requires `DATABASE_URL` in the API task definition and
  derives the migrate task from it;
- the boot runs DDL and seeds on the owner connection
  (`server/startup/services.ts:130`, `server/db/bootstrap/index.ts`);
- `server/routes/tenants-simple.ts:67` opens a `postgres` client on
  `DATABASE_URL` at import.

**Measured, not only read** (`raw/b0`). This is a local reproduction of
`ci.yml`'s `production-boot-smoke`: Postgres 16.15 with TLS, provisioned by
`install-fresh` and `deploy-migrate`, and the production bundle booted from a
root without `.env`, as the image is.

- With the owner URL, `/readyz` returns 200.
- With `APP_DATABASE_URL` only, the process exits at import:
  `server/config/environment.ts` throws "Missing required environment variable:
  DATABASE_URL_PROD", and `server/db.js` logs "No DATABASE_URL provided,
  skipping database connection".

## What already exists (Rule 3)

The full inventory of the boot's DDL and seeds, against the migration set, was
taken before any change. The pieces this stage completes:

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| Runtime pool | `server/db/runtime.ts`, `getRuntimeDatabaseUrl` (`server/db/getDatabaseUrl.ts`) | Serves requests as `app_service` (`APP_DATABASE_URL`), with RLS enforcing | Serve `/api/tenants`'s directory, which used its own owner client |
| System scope for the directory | `SYSTEM_SCOPE_PREFIXES` (`server/middleware/establishRequestTenantScope.ts`) | Runs `/api/tenants` under the audited system scope; the offboarding handlers there already use `pool` | — |
| Schema provisioning | `scripts/db/install-fresh.mjs` (drizzle push), `scripts/db/deploy-migrate.mjs` (`C2C_MIGRATION_FILES`, runtime role, readiness contract) | Create every table the boot checks, on the owner connection, at deploy | Seed the two organisations the boot seeds, or carry the auth-schema statements the boot runs every start |
| Boot schema check | `server/db/ensureCoreTables.ts`, `server/startup/services.ts` | Verifies schemas, the `vector` extension and critical tables, and sets readiness | Run without the owner URL: it opens a standalone pool on `DATABASE_URL`, and creates what is missing |
| Auth bootstrap | `server/db/bootstrap/{index,auth-schema,seed-default-org}.ts` | Runs `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on organizations and users, creates the membership and module tables, and seeds two organisations, every boot, on an owner connection | Run as `app_service`: ALTER needs ownership, and the seed's upsert is refused (42501 at head, `tests/db/signup-launch-catalog.dbtest.ts`) |
| Migrate task | `deploy-aws.yml` and `scripts/ops/ecs-one-off-task.sh` | Clone the API task definition, owner secret included, for `deploy-migrate` | Exist apart from the API task |

## Slice A: `/api/tenants` off the owner connection

**What changed.** `server/routes/tenants-simple.ts`:

- The `postgres` import, the URL cleaner and the module-level client on
  `DATABASE_URL` are deleted.
- The four directory handlers (list, create, rename, users) send
  parameterized `pool.query` statements through the runtime pool, under the
  system scope the mount already applies.
- Authorization is unchanged: `resolvePlatformAdmin`, the membership join and
  the `authedOrgId` check.
- A rename's missing field keeps its value (`COALESCE($n, column)`), as the
  nested fragments did. The duplicate-slug 409 still reads `pg`'s `code` and
  `constraint`.

`server/services/ana-cortex-service.ts` reports the runtime connection, not the
owner URL. Two tests that mocked the `postgres` driver now mock the pool.

**Verified by making it fail.**

- **The contract test** (`raw/a1`, `raw/a2`). Its mock moved to the pool, and
  it gained three checks: no second driver imported, no owner URL read, and
  every directory statement parameterized through the pool. On the old route
  16 of 25 fail; after, 25/25.
- **On real Postgres** (`raw/a3`, `raw/a4`). The new
  `tests/db/tenants-directory-rls.dbtest.ts` runs against the deploy-provisioned
  database, as a fresh NOSUPERUSER NOBYPASSRLS role, with RLS enforcing and
  `DATABASE_URL` pointing at a closed port.
  - On the old route, 5 of 7 fail: every directory call answers 500, because
    the route used the owner URL.
  - After, 7/7:
    - a member lists only their own organisation and reads only their own
      directory;
    - another organisation's directory is a 403;
    - a platform admin lists both, renames one, gets a 409 on a taken slug,
      and creates one.
- **Related tests** (`raw/a5`): 97/97. eslint reports 0 errors, with warnings
  per file unchanged.

## Not shown here

- Slices B and C are not done yet; their sections follow when they land.
