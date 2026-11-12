# Terraform — C2C AWS Infrastructure

## Directory Structure

```
terraform/
├── bootstrap/       # One-time: S3 + DynamoDB for remote state
├── environments/
│   ├── staging/     # Staging environment (VPC, S3 evidence, CloudTrail)
│   └── production/  # Full prod stack (VPC, ECR, RDS, ECS, ALB, CloudFront)
└── modules/
    ├── alb/                 # Application Load Balancer
    ├── cloudfront/          # CloudFront + S3 static hosting
    ├── compliance-evidence/ # S3 WORM + CloudTrail (21 CFR Part 11)
    ├── ecr/                 # Elastic Container Registry
    ├── ecs-fargate/         # ECS Fargate cluster + services
    ├── rds/                 # RDS PostgreSQL (encrypted, multi-AZ)
    ├── secrets/             # AWS Secrets Manager
    └── vpc-secure/          # VPC with public/private subnets, NAT, endpoints
```

## Getting Started

Terraform 1.11 or later: state locks with an S3 lock file beside the state
(`use_lockfile = true`), which 1.11 made generally available; there is no
DynamoDB lock table. Each root commits its `.terraform.lock.hcl`, so `init`
installs the provider builds the configuration was tested with.

### 1. Bootstrap remote state (once per AWS account)

The state bucket is named for the account, `c2c-tfstate-<account id>-<region>`.
A fixed name cannot work: S3 names are global, and the one this repository used
to hard-code belongs to another account (MR-03 OPS-03).

```bash
cd terraform/bootstrap
terraform init
terraform apply
terraform output -raw state_bucket   # the name each root's backend.hcl names
```

Then, in each root, copy `backend.hcl.example` to `backend.hcl` and set its
`bucket` to that name. An account id is not a secret: commit `backend.hcl` once
the account exists. `npm run ci:terraform-backend` refuses a backend that names
its bucket in source, or locks with DynamoDB.

### 2. Deploy staging

```bash
cd terraform/environments/staging
cp terraform.tfvars.example terraform.tfvars  # Edit values; it lists every TF_VAR_ secret to export
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

### 3. Deploy production

```bash
cd terraform/environments/production
cp terraform.tfvars.example terraform.tfvars  # Edit values, including domain_aliases
terraform init -backend-config=backend.hcl
export TF_VAR_cloudfront_origin_secret="$(openssl rand -hex 32)"  # keep it: CloudFront and the ALB share it
terraform plan
terraform apply  # with every TF_VAR_ secret terraform.tfvars.example lists exported
```

Production needs a custom domain (`domain_aliases`), and both certificates
(`acm_certificate_arn` on the ALB, `cloudfront_certificate_arn`) must cover it:
CloudFront checks the ALB's certificate against the domain it forwards.

Both roots also need `dr_region`, the disaster-recovery region, with no
default: it is the founder's decision (MR-04 NEW-2), and the example recommends
`us-west-2`, which keeps the data in the US. The first apply makes the database
and vault keys multi-Region and replicates them, with the release-signing key,
into that region (MR-04 Stage 1). A KMS key is multi-Region only if it is made
so, and changing the RDS storage key afterwards replaces the instance. So this
must be in place before the first apply, not added after it.

Production also needs `alarm_emails`: at least one address the alarm topic pages
(MR-04 Stage 2). Each address must confirm AWS's subscription email before it
is paged. What each alarm means, and the first three things to do, is in
`docs/runbooks/incident-response.md`.

### 4. After each apply: what the outputs feed

Run `terraform output` in the root you applied. Both roots export the same
names (`tests/ci/terraform-root-outputs.contract.test.ts`).

| Output | Goes to |
|---|---|
| `cloudfront_domain` | the DNS alias for `domain_aliases[0]` |
| `github_deploy_role_arn` | the GitHub environment's secret `AWS_DEPLOY_ROLE_ARN` |
| `github_build_role_arn` | the GitHub environment's secret `AWS_BUILD_ROLE_ARN` |
| `cloudfront_distribution_id` | the GitHub environment's secret `CLOUDFRONT_DISTRIBUTION_ID` |
| `frontend_bucket` | the GitHub environment's variable `FRONTEND_BUCKET` |
| `readyz_detail` | optional: the GitHub environment's secret `READYZ_TOKEN`, so a failed deploy's smoke test prints which dependency was not ready |
| `first_run_setup` | the one `POST /api/setup/initialize` that creates the first administrator |
| `engine_version_actual` | the IQ record |
| `api_task_boot_contract` | review before the first deploy: what the API task carries |

The GitHub environment is `staging` or `production`, named for the root.

## Topology

- **Postgres is the coordination store. There is no Redis or ElastiCache**
  (decision B6, `docs/LAUNCH_DEFINITION_OF_DONE.md`). The API runs as more than
  one task: two in production, one to two in staging.
  - Sign-in sessions (idle timeout, concurrent-session limit, superseded
    sessions) are shared through `session_activity`. A task that cannot read
    it is reported not ready by `/readyz` (`sessions`).
  - Scheduled jobs that take the lease run once per window across tasks
    (`server/db/scheduledOnce.ts`). `api_max_count` stays at 2 until MR-14
    closes OPS-07, the schedulers that do not take it yet.
  - The sign-in and document rate limits are counted across tasks in
    `rate_limit_counters` (P-129). A task that cannot reach it refuses those
    requests (503) rather than counting alone. The other categories are
    per-task ceilings, in memory.
- **Live co-editing is off.** `ENABLE_COLLAB_CRDT` keeps each open document in
  one process's memory, so it cannot be on while more than one task serves.
  The stack does not set it, and the deploy preflight refuses a task
  definition that does, until F-27 decides how it is coordinated.
- **The edge waits 60 seconds.** CloudFront's `origin_read_timeout` and the
  ALB's `idle_timeout` are both 60 s, under the server's 65 s keep-alive
  (`tests/ci/edge-timeouts.contract.test.ts`). The eCTD compile and the test
  package take about a minute for a 200-leaf IND, so their screens ask with
  `Prefer: respond-async`: the server answers 202 with a job and the screen
  polls it (MR-03 Stage 6, `docs/evidence/D1/2026-11-12-edge-timeouts/`).
- **Keys have replicas in the DR region.** The database, vault and
  release-signing keys are multi-Region, each with an `aws_kms_replica_key`
  through the `aws.dr` provider under the same key policy
  (`terraform/stack/tests/dr.tftest.hcl`). Backups are not yet copied there
  (MR-04 Stage 6).
- **One alarm path.** Every CloudWatch alarm (`terraform/stack/monitoring.tf`)
  notifies one encrypted SNS topic, `c2c-<env>-alarms`, when it fires and when
  it clears. It covers:
  - the ALB, the API and embedding services, RDS and CloudFront;
  - six lines the server writes when something is wrong;
  - five CloudTrail CIS events;
  - a nightly sweep with no finished run in a day.

  The runbook is `docs/runbooks/incident-response.md`, and a rollback is
  `docs/runbooks/rollback.md`.
- **`/readyz` through CloudFront answers `{ ready }` alone.** The detail goes
  to a caller presenting the `readyz_detail` token in `x-readyz-token`, or to
  one inside the task.

### Module tests (offline)

`modules/alb` and `modules/cloudfront` carry `terraform test` suites that mock
the AWS provider, so they need no account or credentials:

```bash
cd terraform/modules/alb   # or modules/cloudfront
terraform init -backend=false
terraform test
```

## Security Notes

- All secrets are stored in AWS Secrets Manager, never in tfvars
- Terraform generates the two database passwords (the owner's and
  `app_service`'s) and stores the composed `verify-full` URLs in Secrets
  Manager. The API task holds only the runtime role's; the owner's is the
  one-off database task's alone
- S3 evidence bucket uses Object Lock (WORM) with 7-year retention
- TLS 1.3 enforced on ALB; CloudFront uses TLS 1.2+
- ECS tasks run in private subnets. The ALB is reachable from CloudFront alone:
  its security group admits CloudFront's origin-facing prefix list on 443, and
  its listener forwards only requests carrying the origin secret header
  (`modules/alb`). CloudFront is the only public entry point.
- Container images use immutable tags + scan-on-push
