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

## 2. Keys

Customer-managed keys for RDS storage and the database credentials; recorded below when
done.

## Not in this half

P1-11's last clause, symmetric seal-key rotation (a key id / epoch column, SOP-SEC-001
§5), is application work for D5.
