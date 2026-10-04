# W2 / D1 + D5 — P1-11, database half

Row **D1** (hosted production), security remediation plan **P1-11**. Session
`…013CtPf8pjozina2nVvDYkyB`, 2026-10-01.

## 1. Database-level audit that records (INF-13)

**The defect.** The application's Part 11 trail records what the application does. It
cannot record a statement that never went through the application: an edit in psql with
the owner's credentials, a one-off script, a compromised migration. pgaudit is the
control for that path. The RDS parameter group has set `pgaudit.log = write,ddl` from
the start, and nothing was recorded. RDS runs pgaudit only when it is in
`shared_preload_libraries` **and** the extension has been created in the database.
Neither was done. A control that is configured but not running reads as present to
anyone checking the configuration.

**The fix.**

- `terraform/modules/rds`: `shared_preload_libraries = "pg_stat_statements,pgaudit"`.
  This setting replaces RDS's default list, so `pg_stat_statements` is kept. It is a
  static parameter, so it takes effect at boot; a new instance boots with it. A new
  output, `parameters`, exposes the group's settings so the stack can assert them.
- `scripts/db/database-audit.mjs`, called by `deploy-migrate` step 4 as the owner:
  - **preloaded:** `CREATE EXTENSION IF NOT EXISTS pgaudit`, then read `pgaudit.log`
    back;
  - **required but not loaded, or loaded but recording nothing:** the deploy fails
    before any service rolls, naming what is missing;
  - **an unrecognised `DB_AUDIT_REQUIRED` value:** refused before anything is applied.
- `terraform/stack`: every task carries `DB_AUDIT_REQUIRED=pgaudit`. The migration task
  is derived from the API's, so it carries it too.
- `deploy-aws.yml` preflight: `DB_AUDIT_REQUIRED` is required, and its value must be
  exactly `pgaudit`.

**Proof.**

| | before | after |
|---|---|---|
| `deploy-migrate`, `DB_AUDIT_REQUIRED=pgaudit`, server without pgaudit (real PostgreSQL 16) | exit **0**, "safe to roll services", pgaudit not mentioned (`pgaudit-deploy-red.txt`) | exit **1**, naming the missing preload (`pgaudit-deploy-green.txt`) |
| same, not required | — | exit 0, "pgaudit is not loaded on this server" |
| `DB_AUDIT_REQUIRED=yes` | — | exit 1, "not understood", before anything is applied |
| `terraform test` `database_level_audit_is_loaded_and_required` | **3 of 4 assertions fail** (`pgaudit-terraform-red.txt`) | pass, stack 30/30 (`pgaudit-terraform-green.txt`) |

- Dropping `DB_AUDIT_REQUIRED` from the stack makes `terraform-preflight-proof` fail.
- `server/db/__tests__/database-audit.test.ts` (7 tests) pins the loaded branch with a
  fake server. No PostgreSQL reachable from here has pgaudit installed, so
  `CREATE EXTENSION pgaudit` itself has not run. **Owed after the first apply:**
  `SHOW shared_preload_libraries` lists pgaudit, the deploy log shows "pgaudit loaded and
  recording: write, ddl", and an `AUDIT:` line appears in the RDS PostgreSQL log for a
  test DDL. That is the plan's acceptance, "pgaudit rows appear".
- `tests/schema-contract`, `tests/ci`, `server/db/__tests__`: 130 files, 1561 tests.
  `test:ci-scripts`: 116 tests.

## 2. The database tier on customer-managed keys (INF-14, INF-18)

**The defect.** The following were all encrypted under AWS-managed keys (`aws/rds`,
`aws/secretsmanager`):

- the RDS instance, its snapshots and its automated backups;
- its Performance Insights data, which includes query text;
- every secret the tasks read, among them both database URLs.

An AWS-managed key cannot be scoped by a key policy, cannot be disabled to revoke
access, and a snapshot under one cannot be shared or copied to another account. Copying
to another account is how a backup leaves this account's blast radius. The database
passwords also had no rotation.

**The fix.**

- `terraform/stack/database_keys.tf` adds two keys, each with an alias, annual rotation
  and a 30-day deletion window:
  - **`database`**: RDS storage, snapshots, backups and Performance Insights.
  - **`secrets`**: every Secrets Manager entry.

  Both key policies delegate to IAM in this account, as AWS's default key policy does.
  Use is granted by the IAM policies that name the key, and every use is a CloudTrail
  event under the key.
- **Wiring.** `modules/rds` gains `performance_insights_kms_key_id`, and `kms_key_id`
  now defaults to null rather than `""`. `modules/secrets` gains a `kms_key_id` for
  every secret. `modules/ecs-fargate` lets the execution role call `kms:Decrypt` on the
  secrets key, through Secrets Manager only (`kms:ViaService`); without it no task could
  start. No workflow reads a secret value, so no GitHub role needs the key.
- **Before the first apply, deliberately.** Changing an existing instance's storage key
  replaces the instance, so this could not be done later without a migration.
- **Rotation of the database passwords.** `db_credentials_rotation` (stack and both
  roots, default `"initial"`) is a keeper on both `random_password`s. Changing it
  replaces both passwords on the next apply. An empty marker is refused.

**Rotation runbook.** A deliberate, recorded change, not a timer. Running tasks hold the
old values until they are replaced, and the runtime also opens owner connections
(`DATABASE_URL`, at startup and in some services), so the apply and a deploy go together:

1. In a maintenance window, set `db_credentials_rotation = "<yyyy-mm>"` in the
   environment's tfvars and run `terraform apply`. RDS takes the new master password;
   the secrets take both.
2. At once, run the deploy workflow for the current release tag.
   - `deploy-migrate` connects with the new owner URL.
   - It re-aligns `app_service` to the new secret: `ensureRuntimeRole` sends a SCRAM
     verifier, never the plaintext.
   - Then every task rolls onto the new secrets.
3. Record the change: date, marker, operator, and the deploy run.

Between steps 1 and 2, a task that starts reads the new `app_service` password before the
database has it, and fails readiness until step 2. Keep the gap to the minutes the deploy
takes. Zero-gap rotation would need two alternating runtime users and a rotation
function. That is not built; it is recorded here as the next step if rotation must ever
be unattended.

**Proof.**

| | before (`keys-terraform-red.txt`) | after (`keys-terraform-green.txt`) |
|---|---|---|
| `the_database_tier_is_under_customer_managed_keys` | **fails**: storage not on a key in this account, Performance Insights not on the storage key, every secret on the default key, no decrypt grant | pass |
| `each_key_is_used_where_it_belongs_and_the_passwords_rotate_on_the_marker` (distinct ARN per key) | — | pass |
| `refuses_an_empty_rotation_marker` | — | pass |
| stack suite | — | 47/47 |

- Pointing the secrets at the database key fails the identity run, "Every secret must be
  on the secrets key" (`keys-terraform-mutation.txt`).
- A trap found on the way: runs share state, so a per-run `override_resource` on a key an
  earlier run created is silently ignored. Every key then had the same mock ARN, and the
  first version of this test passed under that very mutation. The overrides are now at
  file level.
- `terraform validate` passes for production and staging.
- `terraform-preflight-proof`: every check holds (47 runs).

**Owed after the first apply:**

- `aws rds describe-db-instances` shows `KmsKeyId` and `PerformanceInsightsKMSKeyId` on
  `alias/c2c-production-database`.
- Every secret shows `KmsKeyId` on `alias/c2c-production-secrets`.
- Tasks start, which proves the decrypt grant.
- The first rotation is run and recorded per the runbook.

## Not in this half

P1-11's last clause, symmetric seal-key rotation (a key id / epoch column, SOP-SEC-001
§5), is application work for D5.
