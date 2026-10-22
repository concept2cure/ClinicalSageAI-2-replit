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
| B | The boot without the owner credential: the auth schema and organisation seeds into the migration set, a verify-only production boot, CI's boot smoke without `DATABASE_URL` | done |
| C | Terraform: a migrate task definition that alone holds the owner secrets; the deploy preflight and one-off tasks | next |

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

## Slice B: the boot without the owner credential

**What changed.** The schema is the deploy's; the boot checks it.

- **The auth schema and the two organisation seeds are a migration.**
  `migrations/20261022_auth_schema_and_seeded_organizations.sql` carries the
  statements `ensureAuthTables` ran at every boot, unchanged: the organizations
  and users columns, the guarded email constraint, and the membership and
  module-catalog tables. It also seeds `default` and `concept2cure`, and asserts
  both rows exist.
  - It sits in `C2C_MIGRATION_FILES` immediately before
    `20260923_organization_default_client_workspace.sql`, so each seeded
    organisation gets its workspace on the same deploy.
  - It is replay-safe under Rule 1: every statement is `IF NOT EXISTS`,
    `ON CONFLICT` or guarded. It drops nothing.
- **The boot runs no DDL in production.**
  - `server/db/bootstrap/auth-schema.ts` holds no DDL. `missingAuthSchema`
    reads `information_schema.columns` as the runtime role.
    `server/startup/services.ts` sets readiness to `missing`, naming each
    absent column. A test holds the column list to the migration.
  - `ensureCoreTables` runs verify-only in production, on the runtime pool. It
    creates no schema or extension and reports what is absent.
  - `ensureAuthTables` and `seedOrganizations` are deleted. Their replacement
    is the migration above, which `scripts/db/deploy-migrate.mjs` applies as
    the owner on every deploy. No capability is removed.
- **The demo admin stays a development convenience.** Outside production the
  boot still seeds it (`seedDemoAdminOutsideProduction`). Production never
  does: `SEED_DEMO_USER=true` no longer opts a production process in, and is
  logged as ignored. Two things already held that in practice: the pilot
  go/no-go gate fails on it (`scripts/ops/pilot-go-no-go.mjs`, gate 3), and the
  seed needs the owner connection a production process no longer has.
- **Production needs only `APP_DATABASE_URL`.**
  - `server/startup/env.ts` requires it in production, and requires the owner
    URL nowhere.
  - `server/config/environment.ts` and `server/db.js` accept it where they
    demanded `DATABASE_URL`.
  - `ci.yml`'s `production-boot-smoke` and `production-image-boot` no longer
    give the booting process `DATABASE_URL`. Their provisioning steps still
    run as the owner, as the deploy does.

**Verified by making it fail.**

- **Unit tests** (`raw/b1`, `raw/b2`). Against head's source:
  - 7 of the new and changed tests fail;
  - the auth-schema test file cannot load, because the check it tests does not
    exist.

  After the change, those tests pass 47/47. The suites around the boot modules
  pass 1,387 of 1,387 run, across 137 files (25 tests in 3 files skip, as at head). eslint reports 0 errors, with warnings per
  file unchanged.
- **The boot on real Postgres** (`raw/b3`). Postgres 16.15 with TLS,
  provisioned by `install-fresh` and `deploy-migrate`, with the production
  bundle booted from a root without `.env`:
  - with `APP_DATABASE_URL` only, `/readyz` answers 200;
  - the deploy applied the new migration, and each seeded organisation has one
    workspace;
  - with connection logging on, the boot connected only as `app_service`. It
    still does with the owner URL also present, as Terraform supplies it until
    slice C;
  - **the negative case:** the owner drops `users.bio`, and the boot answers
    503 with `schemaDetail: "auth schema incomplete: users.bio"`. The column is
    still absent after that boot. One `deploy-migrate` run restores it, and the
    next boot answers 200.

  At head, the same boot without the owner URL exits at import (`raw/b0`).
- **The seed on the deploy-provisioned database** (`raw/b4`).
  `tests/db/signup-launch-catalog.dbtest.ts` applies the migration and the
  workspace sweep twice, as consecutive deploys do, and finds one workspace per
  seeded organisation. 15 of 16 pass. The one failure is the communication-center
  tier-lock case, which fails at head too.
- **Gates** (`raw/b4`): all pass.
  - `ci:migration-set-order` (422 migrations, sweep last);
  - `ci:migration-drop-safety`;
  - `ci:migration-deploy-path`;
  - `ci:runtime-ddl` and its self-test. The baseline entry for
    `auth-schema.ts` is removed, because the file has no DDL left.

## Not shown here

- Slice C is not done yet. Until it lands, the ECS task definition still
  carries `DATABASE_URL`. The boot no longer uses it, as the
  owner-present boot above shows.
- **The Helm chart cannot run a production install, at head or now.**
  `charts/concept2cure-app` names only `DATABASE_URL`, and its migrate init
  container runs `dist/scripts/migrate.js`, which does not exist. A production
  boot already required the non-superuser runtime role under `RLS_ENFORCE=on`,
  and both `licenses` and the Part 11 audit store already required
  `deploy-migrate`. The chart is not a launch deployment path (hosted ECS, or
  self-host compose with `npm run db:provision`). Fixing it is recorded, not
  done here.
