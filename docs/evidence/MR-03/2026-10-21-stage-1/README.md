# MR-03 Stage 1 — Terraform appliable before anything is created

Launch row **D1** (hosted production). Work order
[`MR-03`](../../../work-orders/MR-03-first-deploy-staging-to-production.md), Stage 1.
Branch `concept2cure-v2`. Session `…session_01GSjEDJLuZsEzPa9PnVg1yF` (lane W2/D1).

Stage 1 changes code only. Its real-AWS half (bootstrap creates the bucket, the
first apply creates PostgreSQL on gp3) is Stage 5's, and needs the founder's
AWS account (F-4). This folder holds one slice per finding group:

| Slice | Findings | State |
|---|---|---|
| A | OPS-03 (state bucket), OPS-26 (locking, provider bounds, lock files, task-role grant, staging secret recovery) | done |
| B | OPS-04, OPS-30 (RDS storage, snapshot tags, Database Insights), DATA-13 (Postgres major, instance class) | next |
| C | OPS-08 (the worker), after decision NEW-1 | next |

## Re-confirmed at head before starting

At `28637579` (`raw/00-reconfirm-at-head.txt`) every Stage 1 finding was still
open as the work order describes it:

- the state bucket name is hard-coded in bootstrap and both backends;
- the providers are bounded `>= 5.0`, there is no staging lock file, and the
  backends lock with `dynamodb_table`;
- RDS has no `storage_type` or `copy_tags_to_snapshot`, and uses
  `performance_insights_enabled`;
- two workflows run Postgres 16 against production's 15;
- the worker service, task definition and log group exist.

## What already exists (Rule 3)

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| State bootstrap | `terraform/bootstrap/main.tf`, `variables.tf` | Creates the state bucket (versioned, CMK-encrypted, refuses SSE-S3 writes, TLS only, public access blocked) and a DynamoDB lock table | Name a bucket it can create: the default was a fixed global name owned by another account |
| Root backends | `terraform/environments/{production,staging}/main.tf` | S3 backend, key per environment | Run `init` against a bucket that exists; lock without the deprecated DynamoDB table |
| Provider lock | `terraform/environments/production/.terraform.lock.hcl` (added 2026-10-18 by another lane) | Pinned aws 5.70.0 and random 3.6.3 | Agree with the configuration (`>= 5.0`); exist for staging or bootstrap |
| Terraform CI | `.github/workflows/terraform-tests.yml` | Tests the stack and five modules, validates both roots, runs the preflight proof, on Terraform 1.9.8 | Validate bootstrap; hold a root to its lock file; check the backend |
| Global names | `terraform/stack/main.tf` (`evidence_bucket`, `frontend_bucket`), `vault_storage.tf` (`vault_bucket`), `deploy-aws.yml` `FRONTEND_BUCKET` | Fixed names `c2c-prod-*` | Avoid a name another account already holds |
| Task S3 grant | `terraform/modules/ecs-fargate/main.tf` `ecs_task_s3` | Get/Put on `anchors/` objects (narrowed earlier by another lane) | Also listed `s3:ListBucket`, which never matches an object ARN |
| Secrets | `terraform/modules/secrets` | One CMK-encrypted secret per name | Let staging be torn down and re-applied: a deleted secret is held 30 days |

Nothing was rebuilt. Each of these is completed in place: no second bootstrap,
no second stack, no new lock mechanism beside Terraform's own.

## Slice A — what changed

**OPS-03, the state bucket.**

- Bootstrap names it `c2c-tfstate-<account id>-<region>` (`local.state_bucket`,
  with `data.aws_caller_identity`). `state_bucket_name` defaults to `null`.
  The KMS description and alias follow the name.
- Both backends are partial: the `bucket` comes from `backend.hcl` at
  `terraform init -backend-config=backend.hcl`. Each root has a
  `backend.hcl.example`.
- `terraform/README.md` steps 1–3 say how. The account ID is not known yet
  (F-4), so the real `backend.hcl` is committed once it is.
- The stack's other global names carry the account id too: evidence, frontend
  and vault buckets. Nothing has been applied, so renaming them costs nothing.
- `deploy-aws.yml` publishes the frontend to `${{ vars.FRONTEND_BUCKET }}`,
  set from the new `frontend_bucket` output. Its sync step refuses an empty
  value with the command that fills it.
- `production/terraform.tfvars.example` lists the variable beside the
  pipeline's secrets.

**OPS-26, locking and bounds.**

- Both backends use `use_lockfile = true` (S3-native lock file), and
  bootstrap's DynamoDB table is removed in place. It was never applied, and the
  amendment is dated in the file's header.
- `required_version` is `>= 1.11` in bootstrap, both roots and the stack. The
  work order said 1.10, but S3-native locking was experimental in 1.10 and
  went generally available in 1.11, with DynamoDB locking deprecated (the
  Terraform 1.11 changelog, line 66).
- The AWS provider is bounded to `~> 5.93`. The work order said `~> 5.70`, but
  `aws_db_instance.database_insights_mode` (slice B, OPS-30) arrived in 5.92.0
  and was fixed in 5.93.0 (provider CHANGELOG, v5.100.0 tag). The bound stops
  at 6.0, whose breaking changes are a separate migration.
- The random provider is bounded to `~> 3.6`.
- Lock files are committed for bootstrap, production (replacing the 5.70.0
  lock, which no longer satisfies the bound) and staging. They pin aws 5.100.0
  and random 3.6.3, with hashes for `linux_amd64`, `linux_arm64`,
  `darwin_amd64` and `darwin_arm64`.
- How the lock files were made. `registry.terraform.io` is refused by this
  environment's egress policy, so the provider zips came from
  `releases.hashicorp.com`. Each zip was checked against its `SHA256SUMS`,
  whose signature verified against HashiCorp's published key (fingerprint
  `C874 011F 0AB4 0511 0D02 1055 3436 5D94 72D7 468F`). The hashes were then
  recorded with `terraform providers lock -fs-mirror`.
- Independent check of those hashes: the new random 3.6.3 entry contains all
  three hashes the old, registry-made production lock recorded, plus one for
  the new platform.
- **Task role.** `s3:ListBucket` is removed from the task role's object-ARN
  grant, where it matched nothing. Listing `anchors/` stays where it works: the
  bucket policy's prefix-conditioned statement.
- **Secrets.** The secrets module takes `recovery_window_in_days` (0, or 7 to
  30; validated): 30 in production, 0 in staging.
- **CI** (`terraform-tests.yml`):
  - Terraform 1.11.4;
  - bootstrap is validated beside both roots, each with
    `init -lockfile=readonly`, so CI fails when a committed lock no longer
    matches its configuration;
  - a new `backend-guard` job runs the guard's self-test and then the guard.
- **The guard,** `npm run ci:terraform-backend` (`scripts/ci/check-terraform-backend.mjs`,
  with `:selftest`), refuses:
  - a `backend "s3"` with a literal `bucket`, without `use_lockfile = true`,
    or with DynamoDB locking;
  - a bootstrap default other than `null`;
  - a DynamoDB table in bootstrap;
  - the old bucket name anywhere under `terraform/`.

## Verified by making it fail

All runs are offline: Terraform 1.11.4 with the AWS provider mocked, against
the verified local mirror.

**Baseline at head, before any change** (`raw/01`):

- bootstrap and both roots validate;
- `terraform/stack` 60/60;
- modules 26/26.

An earlier stack failure in that run was the harness, not the code. The test
reads `server/config/platform-limits.ts` from outside `terraform/`, and the
scratch copy now includes every file a test reads.

**The guard.**

- Refused head with 11 problems (`raw/02`).
- Self-test: 9 cases, including head's production block verbatim, which
  yields 4 problems (`raw/03`).
- Passes after (`raw/04`).

**Mutants of the changed tree** (`raw/05`):

| Mutant | Result |
|---|---|
| Frontend bucket without the account id | `every_bucket_name_carries_the_account_id` fails (60/1) |
| `deploy-aws.yml` back to `FRONTEND_BUCKET: c2c-prod-frontend` | `production_names_are_the_ones_the_deploy_workflow_targets` fails (60/1) |
| The old 5.70.0 lock under `~> 5.93` | `init -lockfile=readonly` refuses: "locked provider … 5.70.0 does not match" |

**The OPS-26 assertions** were written before their fix and failed on head
(`raw/06`):

- `task_grants_and_secret_recovery_are_what_they_say` failed: ListBucket on an
  object ARN; production windows not 30.
- `staging_secrets_can_be_recreated_after_a_teardown` failed.

Overall: 61 passed, 2 failed.

**After the change** (`raw/07`):

- bootstrap, production and staging validate (the roots also from read-only
  locks);
- `terraform/stack` 63/63;
- alb 4, cloudfront 9, compliance-evidence 5, github-deploy-roles 6,
  vpc-secure 2.

**Other checks.**

- `scripts/ops/terraform-preflight-proof.mjs` (`raw/08`): every check holds.
  The pipeline's own preflight accepts the rendered task definition, and 38
  job×action IAM pairs are granted.
- `ci:frontend-sync-coverage` (and its self-test) and `ci:workflow-targets`
  pass on the edited sync step.
- `terraform fmt -check -recursive terraform` passes. Two modules (`ecr`,
  `vpc-secure`) had whitespace-only drift, fixed here; `git diff -w` is empty
  for both.
- `grep -rn c2c-terraform-state terraform/` returns nothing.

## Not shown here

- **The real-AWS acceptance** (bootstrap creates `c2c-tfstate-<account>-us-east-1`;
  the bucket answers from us-east-1). This is Stage 5, after F-4.
- **Whether the eu-west-1 bucket is the founder's.** It does not matter now:
  nothing reads that name any more.
- **No `.terraform.lock.hcl` for `terraform/stack` or the modules.** These are
  test-only roots; the deployable roots are locked.
