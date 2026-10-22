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
| B | OPS-04, OPS-30 (RDS storage, snapshot tags, Database Insights), DATA-13 (Postgres major, instance class) | done |
| C | OPS-08 (the worker), after decision NEW-1 | done |

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
| Worker decision | `docs/LAUNCH_DEFINITION_OF_DONE.md` P-10 (B7, 2026-10-01) | No separate worker at launch: count 0, no worker image built | Say whether the Terraform for one stays; the production default was still 1 |
| Worker infrastructure | `terraform/modules/ecs-fargate` (log group, task definition, service), `terraform/modules/ecr` (`worker` repository), both roots (`worker_desired_count`, `ecr_worker_url`) | Declares a worker service from a repository nothing pushes to | Run anything useful: no command (so the API's CMD), no scanner (so the boot self-test exits) |
| Background work | `server/index.ts`, `server/startup/services.ts`, `server/db/scheduledOnce.ts` | Every scheduler runs in the API process, once per window across tasks | Need a separate service |

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

## Slice B — RDS before the first apply, and CI on production's Postgres

**What changed.**

- **`terraform/modules/rds`:**
  - `storage_type` defaults to `gp3` and is validated to gp3, io1 or io2. The
    provider's default is gp2, whose IOPS burst and then fall to 3 per GB.
  - `copy_tags_to_snapshot = true`: snapshots carry `Part11Control` and
    `BackupRetention`, so each is identifiable on its own.
  - `database_insights_mode = "standard"` (OPS-30), with an
    `instance_settings` output for the tests.
- **Performance Insights stays on.** This departs from the work order's
  wording, which said to replace it. Standard Database Insights is built on
  Performance Insights; turning PI off would drop the database-load data and
  the CMK the instance puts on its query text.
- **DATA-13, instance class:** production's `rds_instance_class` is
  `db.m6g.large` (default and `terraform.tfvars.example`).
  `terraform/stack/variables.tf` refuses a `db.t*` class in production through
  a cross-variable validation (Terraform ≥ 1.9; the floor is now 1.11).
  Staging keeps `db.t3.small`. A burstable instance throttles to its baseline
  when its CPU credits run out, under exactly a filing day's PDF/A, OCR and
  compile load.
- **DATA-13, Postgres major:**
  - `db-schema-validation.yml` moves from `pgvector/pgvector:pg16` to `pg15`,
    and `database-dr-restore-proof.yml` from `postgres:16` to `postgres:15`.
  - `ci:terraform-backend` now also refuses any Postgres image in
    `.github/workflows/*.yml` or a root `docker-compose*.yml` whose major
    differs from `rds_engine_version`, and requires both roots to agree.
  - `terraform-tests.yml` runs the guard when a workflow or compose file
    changes.
- **Cross-region snapshot copy is MR-04's** (OPS-14), as the work order says.
  It is not added here.

**Verified by making it fail.**

- **The new runs before the fix** (`raw/10`):
  - `rds_is_gp3_with_tagged_snapshots_and_database_insights` and
    `refuses_a_burstable_production_database` fail on the pre-change module;
  - `staging_may_run_a_burstable_database` passes there, as it should.
- **After:** stack 66/66, modules 26/26, the three roots validate (`raw/11`).
- **Mutants** (`raw/15`), each caught:
  - `storage_type` removed;
  - `storage_type = "gp2"`;
  - `copy_tags_to_snapshot` removed;
  - `database_insights_mode` removed;
  - the production class validation removed.
- **The guard:**
  - self-test 12 cases, including a `postgres:16` workflow, a
    `pgvector/pgvector:pg16` workflow, and a `postgres:5432` host that is not
    an image (`raw/12`);
  - refused head's two Postgres 16 workflows (`raw/13`);
  - passes after with 16 images checked (`raw/14`).

## Slice C — the worker (OPS-08), after decision NEW-1

**The decision.** NEW-1 (keep or remove the ECS worker) was decided under the
CPO mandate: **remove.** P-10 already said "no separate worker at launch", so
the decision is recorded as a dated amendment to P-10 in
`docs/LAUNCH_DEFINITION_OF_DONE.md`, not as a new entry beside it (Rule 3).
Kept at a count of zero, the worker was a hazard, not an option:

- its task definition named no command, so it ran the API's;
- one change of `worker_desired_count` (production's default was still 1)
  would boot a third API server outside the load balancer;
- that server would pull from an ECR repository nothing pushes to;
- since MR-08 Stage 1 it could not boot anyway, because it has no scanner
  beside it and the boot self-test exits without one.

**Nothing user-facing is removed.** Background work runs in the API's own
schedulers, started in `server/index.ts` and `server/startup/services.ts`. They
run once per window across tasks through `server/db/scheduledOnce.ts`, proven
by `tests/db/scheduled-once-lease.dbtest.ts` and
`tests/db/scheduled-once-window.dbtest.ts`. A worker that returns under P-10's
condition comes back as a new service with its own entrypoint, command and
evidence.

**What changed.**

- **`terraform/modules/ecs-fargate`:**
  - removed the worker log group, task definition and service;
  - removed the variables `worker_image`, `worker_cpu`, `worker_memory`,
    `worker_desired_count`, `worker_environment` and `worker_secrets`;
  - removed the outputs `worker_service_name` and `worker_container`;
  - added a `service_names` output, so the stack's tests can say which
    services exist.
- **`terraform/modules/ecr`:** the default is `["api"]`. The stack creates only
  the `api` repository.
- **`terraform/stack`:**
  - `module "ecs"` loses its worker inputs, and the variable
    `worker_desired_count` and the output `ecr_worker_url` are gone;
  - comments that described two containers now describe one (`main.tf`,
    `release_signing.tf`, `modules/embedding-service`).
- **Both roots:** removed `worker_desired_count` (wiring, variable, tfvars
  example) and `ecr_worker_url`.
- **`terraform/stack/tests/boot_contract.tftest.hcl`:**
  - new run `one_service_and_one_repository_no_worker`, with three checks:
    - the services are exactly the API's;
    - the repositories are exactly `api`;
    - `service_names` lists every `aws_ecs_service` declared in
      `modules/ecs-fargate` (it is written by hand, so it is held to the
      source).
  - every assertion that looped over the API and worker containers now covers
    the API container. Each one's API half is unchanged.
  - Worker-only assertions are gone: its boot contract, its absent scanner, and
    its lack of `SETUP_TOKEN`, `APP_SERVICE_DB_PASSWORD` and the owner
    allowlists.
  - `the_api_and_worker_embed_through_the_self_hosted_lane` is renamed
    `the_api_embeds_through_the_self_hosted_lane`.
- **`deploy-aws.yml`:**
  - the `TODO(infra)` block is replaced by a note that the worker was removed;
  - the preflight's remark that "the worker carries that list" now gives the
    real reason `CLAMAV_HOST` is checked by value.
- **`server/db/scheduledOnce.ts`:** a dated note in the header, which counted
  "a worker task" among production's processes (MR-14 Stage 7 step 6 asks for
  this).
- **Not edited:** `migrations/20261001d_scheduled_job_claims.sql`. Its comment
  mentions a worker, but a comment edit to a migration only registers drift
  (Rule 1).

**Verified by making it fail.**

- **Before** (`raw/18`): the new run fails on the pre-change stack (66 passed,
  1 failed). The services are a tuple of two, and the repositories are
  `["api","worker"]`.
- **After** (`raw/19`):
  - stack 67/67, modules 26/26, and bootstrap and both roots validate, from the
    committed lock files;
  - the work order's acceptance grep returns nothing:
    `worker_desired_count|ecr_worker_url|aws_ecs_service" "worker` under
    `terraform/`;
  - `terraform fmt -check` passes.
- **Mutants** (`raw/20`), each failing the new run:
  - the `worker` repository restored;
  - an `aws_ecs_service "worker"` appended to the module without listing it.
    This one is caught by the source check. Before that check was added, this
    mutant passed: the first run of it was on a copy made before the check
    existed, and it showed the gap.
  - the same service, listed in `service_names`.
- **Gates** (`raw/21`):
  - `ci:terraform-backend` self-test passes 12/12, and the guard passes;
  - `ci:workflow-targets` and `ci:frontend-sync-coverage` are OK.
- **Preflight proof** (`raw/22`):
  - deploy-aws.yml's own preflight, run against the rendered API task
    definition, holds;
  - so does every other check: the ARN pinned end to end, provision-database,
    38 job×action IAM pairs, and the health check;
  - the suite it runs reports 67 passed.

## Trivy (all three slices)

The scan used `trivy config` with CI's exact settings: HIGH and CRITICAL,
`exit-code 1`, the same skip-files, over the whole tree (`raw/16`).

- Exit 0, and every Terraform file shows 0 findings, including
  `terraform/bootstrap`, `modules/rds` and `modules/secrets`.
- **Control** (`raw/17`): the same binary and filter on a planted open-SSH
  security group exit 1 with AWS-0107 (HIGH). The checks were loaded; the
  clean result is a real one.
- After slice C, the same scan again exits 0 (`raw/23`).
- The binary is v0.69.3, built from the Go module proxy because GitHub release
  downloads are not reachable from here.

## Not shown here

- **The real-AWS acceptance** (bootstrap creates `c2c-tfstate-<account>-us-east-1`;
  the bucket answers from us-east-1). This is Stage 5, after F-4.
- **Whether the eu-west-1 bucket is the founder's.** It does not matter now:
  nothing reads that name any more.
- **No `.terraform.lock.hcl` for `terraform/stack` or the modules.** These are
  test-only roots; the deployable roots are locked.
- **A plan against a real account showing only the worker removed.** Nothing
  has been applied, so there is nothing to destroy. The first apply (Stage 5)
  creates one service and one repository, which the mocked plan asserts.
