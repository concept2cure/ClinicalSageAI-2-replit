# MR-04 — Operate, observe and recover: alarms, detective controls, DR

| | |
|---|---|
| Phase | Phase 1 (stages 1–4), Phase 2 (stage 5, WAF in count mode), Phase 3 (stage 5 block switch, stage 6), Backlog (stage 7) |
| Highest open severity at head | P1 |
| Human testing | Not observable in testing. No finding here stops a tester completing a launch journey. Without alarms, though, a failure a tester hits shows up only if someone reads the logs. Until stage 2 lands, have one person watch the API logs and `GET /api/health/background-jobs` (`server/startup/inline-endpoints.ts:222-255`) during every test session (OPS-06, SEC-11). |
| Owner | mixed. Engineering writes the Terraform, workflows and tests. The founder supplies the alert destination, the Sentry DSN, the DR region, RPO/RTO, the approvers and the WAF posture. Someone with AWS access runs the staging drills. |
| Effort | L–XL in total: S + M + M + M + S + L + S |
| Depends on | MR-03 (OPS-01 first real apply and staging deploy; DATA-13 production Postgres version; SEC-08 ElastiCache/`REDIS_URL`), MR-02 (OPS-18 Checkov gating under Rule 0; F-22 evidence store), F-4, F-21, F-25 |
| Findings | 5 total — open 5 · partially fixed 0 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

When production breaks, someone is paged within five minutes, and the page
says what broke. The page covers a dead API task, a 5xx burst, a database
under pressure, a nightly retention or audit-chain sweep that failed or never
ran, and an audit-integrity incident. Every request, network flow and API call
in the AWS account leaves a log that an incident responder can use to scope an
incident. Threat detection runs on the account. The database and Vault have
each been restored once in staging, from real backups, with a measured RPO and
RTO that the company has written down and approved. A GxP buyer's vendor
qualification can be answered with evidence, not intentions: tested backup and
restore (21 CFR 11.10(c), Annex 11 §7.2), monitored systems, and logged access.

## Why it matters

- **An outage today is found by the customer.** Terraform has no
  `aws_cloudwatch_metric_alarm`, no `aws_sns_topic` and no dashboard. Sentry is
  optional and unset by default (`terraform/environments/production/variables.tf:181-184`).
  A dead API task, or a nightly retention sweep that fails, stays silent until a
  pilot user reports it. No SLA can be signed against that.
- **A Part 11 audit-chain break pages nobody.** The audit-chain sweep raises its
  incident through `reportSecurityAlert` (`server/jobs/auditChainIntegritySweep.ts:484-497`).
  That alert reaches a person only through `SECURITY_ALERT_WEBHOOK_URL`
  (`server/services/security-alerts.ts:15`), which no Terraform and no deploy
  workflow provisions. In production it is a console line that nothing watches.
- **Backup and restore are claimed, not proven.** RDS has 35-day in-region PITR
  and Multi-AZ, but no restore has ever been run against RDS. The only drill
  restores a toy `dr_proof` schema into a `postgres:16` container while RDS runs
  15. The DR document lists production RPO, RTO, PITR policy and KMS
  break-glass as "TBD" (`docs/operations/database-disaster-recovery.md:72-76`).
  Annex 11 §7.2 requires periodically tested backups. A buyer will ask for the
  last test report.
- **An incident cannot be scoped.** Without ALB access logs, CloudFront logs,
  VPC flow logs or GuardDuty, the company cannot say which records an attacker
  touched, or that none were. For GxP records that is a legal exposure, and it
  is the first page of every security questionnaire.
- **One choice in this order must be made before the first `terraform apply`.**
  The database and Vault KMS keys are single-region today. Making them
  multi-region after apply replaces the RDS instance (`terraform/stack/database_keys.tf:13-15`).
  If MR-03 applies first, cross-region recovery costs a data migration.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| OPS-06 | STILL_OPEN | P1 | None. Failures are found only by testers or log readers. | No alarm, SNS or dashboard resource in `terraform/`; `sentry_dsn` defaults to `""` (`terraform/stack/variables.tf:424-431`); `server/startup/env.ts:104-110` only warns. |
| SEC-11 | STILL_OPEN | P1 | None. | No WAF, GuardDuty, Config, flow log or alarm; ALB logs off (`terraform/modules/alb/variables.tf:40-43`, `terraform/stack/main.tf:363-374`); `SECURITY_ALERT_WEBHOOK_URL` unprovisioned (`server/services/security-alerts.ts:15`). |
| OPS-15 | STILL_OPEN | P1 | None. | No GuardDuty, Security Hub, Config, flow logs, access logs, WAF or budgets in any `*.tf`; `terraform/modules/cloudfront/main.tf:149-156` "No WAF yet" with `#trivy:ignore:AWS-0011`. |
| OPS-14 | STILL_OPEN | P1 (tested restore); P2 (cross-region) | None. | No `aws_backup*`, replication or `aws_kms_replica_key`; drill restores `scripts/ops/dr-fixture.sql` (`scripts/ops/dr-restore-drill.sh:73-112`) on `postgres:16` (`.github/workflows/database-dr-restore-proof.yml:30-32`). |
| DATA-19 | STILL_OPEN | P3 | None. | `scripts/ops/dr-restore-drill.sh` still targets the `dr_proof` schema; `app_service` and `audit_archiver` are cluster-wide, with no per-environment naming. |

## Already done at head — do not redo

No finding in this order is fixed. These parts of the original evidence are
already in place. Build on them and do not re-implement them:

- RDS storage, snapshots and Performance Insights use the customer-managed
  `aws_kms_key.database`. Task secrets use `aws_kms_key.secrets`
  (`terraform/stack/database_keys.tf:36-57`; `terraform/stack/main.tf:119`, `:357`; commit `5ef2787a5`).
- Sentry can be plumbed: `sentry_dsn` passes into the task definition when it
  is set (`terraform/stack/main.tf:338`; commit `19d2be04a`). Stage 2 makes it
  mandatory and does not re-plumb it.
- A multi-region CloudTrail trail with CloudWatch Logs and a CMK exists
  (`terraform/modules/compliance-evidence/main.tf:262-351`, trail at `:316`).
  RDS logs and pgaudit are on (`terraform/modules/rds/main.tf:61`, `:116-120`).
- RDS has Multi-AZ, deletion protection, a final snapshot and 35-day backup
  retention in production (`terraform/modules/rds/main.tf:46-54`;
  `terraform/environments/production/main.tf:60`).
- ECS Container Insights is on (`terraform/modules/ecs-fargate/main.tf:9`).
  Stage 2 adds the alarms that read it.
- `docs/operations/database-disaster-recovery.md` exists. The audit's "no DR
  runbook" was partly wrong. Stage 4 fills its TBD rows. Do not write a second
  DR document.
- Job-claim rows (`scheduled_job_claims`, OPS-07) already exist. Stage 2's
  staleness metric is emitted from them.

## Work, in order

Two findings, OPS-06 and SEC-11, each prescribe an alarm stack, in different
places. Two findings, OPS-15 and SEC-11, each prescribe the same detective
controls, in different places. This order builds each control once:

- **One per-environment alarm module.** It lives at `terraform/modules/monitoring`
  and holds the SNS topic, metric alarms and log metric filters, CloudTrail CIS
  filters included. It is not a second set in `terraform/stack/detective_controls.tf`.
- **One account-level baseline module.** It lives at `terraform/modules/security-baseline`
  and holds GuardDuty, Security Hub, Config and budgets. It is instantiated once
  per AWS account behind `var.manage_account_baseline`. Under F-4 (separate
  staging and production accounts) that means once per environment root. If
  the accounts are ever shared, exactly one root sets the flag. GuardDuty
  detectors and Config recorders are one per account and region, so a second
  instance fails to apply.
- **Config delivers to a dedicated, KMS-encrypted bucket in that module.** It
  does not deliver to the compliance-evidence bucket. This leaves the evidence
  bucket's Deny statements (`terraform/modules/compliance-evidence/main.tf:231`)
  untouched. SEC-11 step 3 is therefore not done.
- **Audit-integrity incidents page through one path:** a log metric filter,
  then a CloudWatch alarm, then SNS. Do not also wire a webhook. Leave
  `SECURITY_ALERT_WEBHOOK_URL` unprovisioned, and record this decision in
  `docs/runbooks/incident-response.md`.

### Stage 1 — Multi-region keys before the first apply (Phase 1 · S · engineering, DR region from the founder) — closes part of OPS-14

This stage must land before MR-03 runs the first `terraform apply`. After apply,
changing the RDS storage key replaces the instance.

1. Re-confirm OPS-14 at the current head (statuses here are from 94b4f9238).
   Confirm the stack has still never been applied: `deploy-aws.yml` has no
   runs, and no state exists for the environment. If it has been applied, stop.
   Re-plan this stage as a key migration and tell the founder.
2. Get the DR region from the founder (NEW-2 below, constrained by F-25). The
   recommendation is `us-west-2`, which keeps data in the US.
3. Set `multi_region = true` on `aws_kms_key.database` (`terraform/stack/database_keys.tf:36`)
   and `aws_kms_key.vault` (`terraform/stack/vault_storage.tf:33`).
   `aws_kms_key` for release signing already has it (`terraform/stack/release_signing.tf:45`).
4. Add a provider alias `aws.dr` with `region = var.dr_region` in
   `terraform/environments/production/main.tf` and `terraform/environments/staging/main.tf`.
   Declare it in `configuration_aliases` in `terraform/stack/versions.tf` and
   pass it into the stack. Add `dr_region` to both environments' `variables.tf`.
5. Add `aws_kms_replica_key` resources in the DR region for `database`, `vault`
   and `release_signing` (`terraform/stack/release_signing.tf:41`). Each replica
   carries the same key policy as its primary. The vault policy's human-decrypt
   denial (`terraform/stack/vault_storage.tf:37-67`) must be carried over unchanged.
6. Add `terraform/stack/tests/dr.tftest.hcl` (mocked providers, as in the
   existing stack tests). For this stage it asserts that `multi_region` is true
   on all three keys and that the three replicas exist. Run it at HEAD, record
   the failure, implement, and run it again until green. Stage 6 extends this file.

**Acceptance**

- `terraform test` in `terraform/stack` fails at HEAD on the missing replicas
  and `multi_region = false`, and passes after the change. Both outputs are
  filed under `docs/evidence/MR-04/<date>/`.
- `terraform plan` for staging shows three `aws_kms_replica_key` resources in
  the DR region and no change to any key already in state. There is none,
  because the stack has never been applied.
- MR-03's first-apply checklist names this stage as a precondition.

### Stage 2 — One alarm path that pages a person (Phase 1 · M · mixed) — closes OPS-06; closes the alarm and alert items of SEC-11

1. Re-confirm OPS-06 and SEC-11 at the current head (statuses here are from 94b4f9238).
2. Founder: name the alert destination (one or more email addresses, or a pager
   HTTPS endpoint), name the on-call owner, and create a Sentry project and
   supply its DSN (NEW-1).
3. Add the outputs the alarms need:
   - `aws_lb.this.arn_suffix` and `aws_lb_target_group.api.arn_suffix` to
     `terraform/modules/alb/outputs.tf`.
   - `api_log_group_name` (`aws_cloudwatch_log_group.api.name`, `terraform/modules/ecs-fargate/main.tf:18`)
     to `terraform/modules/ecs-fargate/outputs.tf`. Add the worker's log group
     name too if the worker writes its own group.
   - `identifier` (`aws_db_instance.this.identifier`) to `terraform/modules/rds/outputs.tf`.
4. Create `terraform/modules/monitoring/{main.tf,variables.tf,outputs.tf}`:
   - **Topic.** `aws_sns_topic.alarms`, encrypted with a KMS key whose policy
     grants `cloudwatch.amazonaws.com` `kms:Decrypt` and `kms:GenerateDataKey*`.
     Use either a dedicated key in the module, or `aws_kms_key.secrets` with
     that statement added. Without the grant, alarms fire and never publish.
     Add one `aws_sns_topic_subscription` per entry of `var.alarm_emails`
     (`list(string)`). Every alarm below sets `alarm_actions` and `ok_actions`
     to the topic.
   - **ALB.** `HTTPCode_Target_5XX_Count`, Sum > 10 per 300 s, 2 of 2
     datapoints. `HTTPCode_ELB_5XX_Count`, Sum > 5 per 300 s.
     `HealthyHostCount`, Minimum < `var.api_desired_count` for 3×60 s,
     `treat_missing_data = "breaching"`. `TargetResponseTime` p95 above a
     threshold set in a variable.
   - **ECS** (`ECS/ContainerInsights`, dimensions `ClusterName` =
     `module.ecs.cluster_name` and `ServiceName` = `module.ecs.api_service_name`).
     `RunningTaskCount` Minimum < `var.api_desired_count` for 5×60 s. Service
     CPU and memory utilisation. Repeat these for the worker service.
   - **RDS.** `CPUUtilization` > 80 for 3×300 s. `FreeStorageSpace` < 10 GiB.
     `FreeableMemory` < 256 MiB. `DatabaseConnections` > 80% of the instance
     class's `max_connections`.
   - **CloudFront.** `5xxErrorRate`, Average > 5 for 2×300 s, dimensions
     `DistributionId = module.cdn.distribution_id` and `Region = Global`.
     CloudFront metrics exist only in `us-east-1`. Under F-4 that is the
     primary region. Otherwise, create this alarm through a `us-east-1` alias.
   - **Application log metric filters.** Put these on every log group the
     emitting service writes to: the API group, plus the worker group if jobs
     run there. Publish to namespace `C2C/Jobs`, metric `JobFailure`, and alarm
     on Sum >= 1 per 300 s. The patterns are the exact lines the code emits:
     - `Scheduled retention sweep failed` (`server/jobs/retentionCron.ts:410`)
     - `Audit chain integrity check failed` (`server/jobs/auditChainIntegritySweep.ts:615`)
     - `AUDIT INTEGRITY FAILURE` (`server/jobs/auditChainIntegritySweep.ts:486`), with its own alarm
     - `External intelligence sweep crashed` (`server/jobs/externalIntelligenceSweep.ts:52`)
     - `[SECURITY]` (`server/services/security-alerts.ts:33`)
     - `security posture transitioned` together with `failing` (`server/services/securityHealthScheduler.ts`, `runOnce`)
   - **CloudTrail CIS filters**, on the trail's log group
     (`terraform/modules/compliance-evidence/main.tf:277`; export its name if
     it is not already an output): root login, IAM policy change, KMS key
     disable or schedule-deletion, security-group change, and console sign-in
     failures. Each gets an alarm on the topic.
5. Job staleness:
   - In `server/db/scheduledOnce.ts` `runScheduledOncePerWindow`, after the
     `UPDATE scheduled_job_claims SET finished_at` succeeds, write one
     CloudWatch EMF line to stdout:
     `{"_aws":{"CloudWatchMetrics":[{"Namespace":"C2C/Jobs","Dimensions":[["JobName"]],"Metrics":[{"Name":"JobSucceeded"}]}]},"JobName":<jobName>,"JobSucceeded":1}`.
     The awslogs driver ships it.
   - Add a unit test proving the line is emitted only on success, and not when
     the job throws or the claim is lost. Show the test failing before the change.
   - In the monitoring module, alarm on `JobSucceeded` Sum < 1 over a period of
     86400 s, with `treat_missing_data = "breaching"`, for `retention-sweep` and
     `audit-chain-integrity-sweep`.
6. Wire `module "monitoring"` into `terraform/stack/main.tf` after `module "cdn"`
   (around line 523).
   - Add the stack variable `alarm_emails` and pass it through
     `terraform/environments/{production,staging}/main.tf` and their `variables.tf`.
   - In `terraform/environments/production/variables.tf`, add a validation
     requiring `length(var.alarm_emails) >= 1`.
   - On the existing `sentry_dsn` variable (line 181), add a validation
     requiring `sentry_dsn != ""`.
7. Make Sentry fail closed in production in two places:
   - Add `SENTRY_DSN` to the deploy preflight in `.github/workflows/deploy-aws.yml`,
     next to the `CLAMAV_HOST` check (around line 715), so a production task
     definition without it is refused with `::error`.
   - Change `server/startup/env.ts:104-110` so that a missing `SENTRY_DSN` is
     a startup error when `NODE_ENV=production`, and stays a warning elsewhere.
     Leave the `REDIS_URL` handling to SEC-08 in MR-03.
8. Add `terraform/stack/tests/monitoring.tftest.hcl` (mocked provider, like the
   existing tests):
   - Assert that every alarm in step 4 and step 5 exists with the SNS topic in
     `alarm_actions`, and that the `AUDIT INTEGRITY FAILURE` filter and its alarm exist.
   - Add a production run with `alarm_emails = []` and a run with
     `sentry_dsn = ""`, both using `expect_failures`.
   - Run all of it before adding the module and the validations, and record it
     red. Add the file to `.github/workflows/terraform-tests.yml` (the test step
     is at `:44-80`).
9. Write the runbooks:
   - `docs/runbooks/incident-response.md` lists, for each alarm, the owner and
     the first three actions. It also records the single-path decision for
     audit-integrity alerts.
   - `docs/runbooks/rollback.md` covers redeploying the previous task-definition
     revision with `aws ecs update-service --task-definition <prev>`. It states
     that migrations are forward-only under Rule 1: a rollback redeploys code
     and never reverses schema.
   - Add the on-call rota.
10. Run the staging drills. Each needs MR-03's staging deploy:
    - Set the API desired count to 0 (or stop the task). Confirm the page
      arrives within 5 minutes, then restore the service.
    - Block the DB security group to drive `HealthyHostCount` below desired.
    - Force a retention-sweep failure (for example `ENABLE_RETENTION_SWEEP`
      with a broken policy).
    - Write the line `AUDIT INTEGRITY FAILURE in test` from the API task.
    - Disable the retention sweep for a day to trip the staleness alarm.
    - Throw a test error and find it in Sentry.

**Acceptance**

- `terraform test` passes for `monitoring.tftest.hcl` and fails at HEAD. A
  production plan with an empty `alarm_emails` or an empty `sentry_dsn` is
  refused, and each refusal was shown failing (that is, accepted) before its
  validation was added.
- The `deploy-aws.yml` preflight refuses a doctored task-definition JSON that
  lacks `SENTRY_DSN`. The production boot refuses to start without it, shown in
  a unit test that fails before the change.
- The EMF unit test fails before the change and passes after.
- In staging, each of these pages the subscriber within 5 minutes: stopping the
  API task, blocking the DB security group, a forced retention or audit-sweep
  failure, and the logged `AUDIT INTEGRITY FAILURE` line. A day with no
  retention-sweep success fires the staleness alarm.
- A thrown test error appears in Sentry.
- `docs/runbooks/incident-response.md`, `docs/runbooks/rollback.md` and the
  rota exist, and every alarm name in the module appears in the incident runbook.

### Stage 3 — Detective-control baseline and access logs (Phase 1 · M · mixed) — closes OPS-15 (except WAF); closes the GuardDuty, Config, flow-log and ALB-log items of SEC-11

1. Re-confirm OPS-15 and SEC-11 at the current head (statuses here are from 94b4f9238).
2. Founder: confirm the F-4 account layout. That decides where
   `manage_account_baseline = true` is set. Also confirm the monthly budget
   ceiling and the budget alert recipients (F-4).
3. Create `terraform/modules/security-baseline`. Instantiate it from each
   environment root behind `var.manage_account_baseline`:
   - **GuardDuty.** `aws_guardduty_detector` with `enable = true`, plus
     `aws_guardduty_detector_feature` for `S3_DATA_EVENTS`, `RDS_LOGIN_EVENTS`
     and `RUNTIME_MONITORING` (with `ECS_FARGATE_AGENT_MANAGEMENT`).
   - **Security Hub.** `aws_securityhub_account` and
     `aws_securityhub_standards_subscription` for AWS Foundational Security Best
     Practices and CIS AWS Foundations. The subscriptions are cheap, so enable
     them now. Acting on the scores is Phase 3 work.
   - **Config.** An IAM role with the managed policy `AWS_ConfigRole`,
     `aws_config_configuration_recorder` (all supported resources), and
     `aws_config_delivery_channel` to a dedicated KMS-encrypted log bucket in
     this module. Add `aws_config_configuration_recorder_status` with
     `is_enabled = true`, and these managed rules:
     - `s3-bucket-public-read-prohibited`
     - `s3-bucket-ssl-requests-only`
     - `rds-storage-encrypted`
     - `rds-instance-public-access-check`
     - `cloudtrail-enabled`
     - `restricted-ssh`
     - `vpc-flow-logs-enabled`
   - **Budgets.** `aws_budgets_budget`, monthly COST, with 80% and 100%
     notifications to the named recipients.
4. VPC flow logs. In `terraform/modules/vpc-secure/main.tf`, add
   `aws_flow_log` on `aws_vpc.this` (`:4`) with `traffic_type = "ALL"`. It
   writes to an `aws_cloudwatch_log_group` that is KMS-encrypted with
   `retention_in_days >= 365`. Add an IAM role for flow-log delivery.
5. ALB access logs:
   - In `terraform/stack`, create an ALB log bucket. It must use SSE-S3
     (AES256), because ALB log delivery does not support SSE-KMS. Give it a
     public-access block, a lifecycle expiration matching the retention policy,
     and a bucket policy that admits `logdelivery.elasticloadbalancing.amazonaws.com`
     (or the region's ELB account) to `PutObject` under `AWSLogs/<account>/`.
   - Pass `access_logs_bucket = <bucket>.id` into `module "alb"` at
     `terraform/stack/main.tf:363-374`.
   - Add a stack precondition that production sets it. The module default at
     `terraform/modules/alb/variables.tf:40-43` stays `""` for module reuse.
6. CloudFront and S3 access logging:
   - Add `logging_config` to `aws_cloudfront_distribution.this`
     (`terraform/modules/cloudfront/main.tf:157`). Its target bucket needs ACLs
     enabled (`BucketOwnerPreferred`). Alternatively, use CloudFront v2 logging
     via `aws_cloudwatch_log_delivery_source`, `aws_cloudwatch_log_delivery_destination`
     and `aws_cloudwatch_log_delivery`.
   - Add `aws_s3_bucket_logging` for the vault bucket (`terraform/stack/vault_storage.tf`)
     and the frontend bucket, targeting a separate log bucket.
   - Never point the evidence bucket's logging at itself.
     `terraform/modules/compliance-evidence/main.tf:1-15` documents the
     recursive-logging loop that was already fixed once.
7. Tests, made to fail first. Run them all at HEAD, record them red, then
   implement until green:
   - `terraform/modules/vpc-secure/tests` asserts the flow log.
   - `terraform/modules/alb/tests` asserts `access_logs.enabled = true` when a
     bucket is passed.
   - `terraform/stack/tests/detective_controls.tftest.hcl` (mock providers, as
     in `boot_contract.tftest.hcl`) asserts that production passes a non-empty
     `access_logs_bucket`.
   - The CloudFront module tests assert `logging_config`.
   - A `security-baseline` module test asserts the detector and its three
     features, the Config recorder, status and rules, the Security Hub
     standards and the budget.
   - Wire every new test into `.github/workflows/terraform-tests.yml`.
     Re-gating Checkov (`terraform-compliance.yml`) on push to
     `concept2cure-v2` is OPS-18 in MR-02. Do not duplicate it here.
8. Run the Trivy config scan and `ci:trivy-inline-ignores` over the new resources.

**Acceptance**

- Every new tftest run fails at HEAD and passes after the change. Both runs are
  filed as evidence.
- `terraform plan` for staging shows the GuardDuty detector and features, the
  Config recorder and rules, Security Hub with both standards, the VPC flow
  log, the ALB with access logs enabled, CloudFront logging and the budget.
- After apply on staging:
  - `aws guardduty create-sample-findings` produces a finding that is visible
    in Security Hub.
  - Flow-log, ALB and CloudFront log objects appear within 15 minutes of a
    smoke test.
  - A budget notification test reaches the named recipient.
  - The FSBP and CIS scores are exported to `docs/evidence/MR-04/<date>/` as
    the first SOC 2 Type I input (F-21).

### Stage 4 — Prove a restore, and state RPO and RTO (Phase 1 · M · mixed) — closes the P1 core of OPS-14 and the drill half of DATA-19

1. Re-confirm OPS-14 and DATA-19 at the current head (statuses here are from 94b4f9238).
2. Founder decisions (NEW-2): production RPO and RTO, backup retention and
   legal hold, service owner, drill operator and key-access approvers. Record
   them in `docs/operations/database-disaster-recovery.md:66-78`, replacing the
   TBD rows at `:72-76`.
3. Write `docs/operations/kms-break-glass.md`. It names the dual-control
   key-policy change that temporarily grants a named restore role `kms:Decrypt`
   on the vault key (`terraform/stack/vault_storage.tf:37-67`), describes how
   CloudTrail records the change, and describes how it is reverted. Reference
   it from the DR runbook. Do not loosen the standing human-decrypt denial.
4. Add `.github/workflows/staging-rds-pitr-drill.yml`, triggered by
   `workflow_dispatch` and a quarterly schedule. It assumes an OIDC role from
   `terraform/modules/github-deploy-roles` that is scoped to the staging RDS
   identifier. The workflow must:
   - a. Run `aws rds restore-db-instance-to-point-in-time` into a temporary
     instance, and time it.
   - b. Run `scripts/db/deploy-migrate.mjs` in check-only mode against the
     restored instance, and run a read probe as `app_service`. Extend
     `scripts/ops/dr-application-readiness.mjs` so it reads real launch tables,
     not only `dr_proof.*`.
   - c. Restore one noncurrent vault object version, and verify its SHA-256
     against `vault.documents`.
   - d. Record the measured RPO and RTO. Upload the evidence: restore start and
     finish timestamps, the migration level of the restored database, the
     probe result, and the object hash comparison. Delete the temporary
     instance in an `always()` step.
5. Fix the fixture drill so it stops proving a toy (DATA-19):
   - Change `scripts/ops/dr-restore-drill.sh:73-112` to restore a `pg_dump` of
     the provisioned schema, built by running `deploy-migrate` into the CI
     database, instead of `scripts/ops/dr-fixture.sql`. Assert that the
     restored schema fingerprint equals the source fingerprint.
   - Change the service container in `.github/workflows/database-dr-restore-proof.yml:30-32`
     from `postgres:16` to the RDS major version. That is 15 today
     (`terraform/environments/production/main.tf:55`). If MR-03 (DATA-13)
     changes the production version, use whatever it settles on.
   - Delete `scripts/ops/dr-fixture.sql` only when nothing references it.
     `grep -rn dr-fixture` must return no hits.

**Acceptance**

- The fixture drill fails at HEAD on the fingerprint assertion: the toy schema
  does not match a provisioned one. It passes after the change.
- `staging-rds-pitr-drill.yml` completes green and uploads the evidence set in
  step 4d.
- The PITR drill is shown failing once, by pointing it at a nonexistent restore
  time or by corrupting the expected object hash.
- The RPO, RTO and owner rows in `docs/operations/database-disaster-recovery.md`
  are filled in and signed off by the founder. The measured RTO from the drill
  is within the stated RTO, or the stated RTO is revised and the revision is recorded.

### Stage 5 — Edge protection: WAF in count mode, then block (Phase 2 for count, Phase 3 for block · S · mixed) — closes the WAF items of SEC-11 and OPS-15

1. Re-confirm SEC-11 and OPS-15 at the current head (statuses here are from 94b4f9238).
2. Founder: record the WAF decision (NEW-3). The cost is about $5 per month,
   plus $1 per rule per month, plus per-request fees. The recommendation is on,
   in count mode first. For one small FDA-only pilot, deferring it is
   acceptable only if the decision is recorded.
3. Add an `aws` provider alias for `us-east-1`. Add `aws_wafv2_web_acl` with
   `scope = "CLOUDFRONT"`. Its rules:
   - `AWSManagedRulesCommonRuleSet` with `override_action { count {} }`, and
     `SizeRestrictions_BODY` overridden to count.
   - `AWSManagedRulesKnownBadInputsRuleSet`.
   - `AWSManagedRulesAmazonIpReputationList`.
   - A `rate_based_statement` on `/api/auth/*`, for example 2000 requests per
     5 minutes per IP.

   Add `aws_wafv2_web_acl_logging_configuration` writing to an
   `aws-waf-logs-<short>` log group.
4. Add a `web_acl_id` variable to `terraform/modules/cloudfront/variables.tf`
   and set it on `aws_cloudfront_distribution.this`. In the same change, delete
   the `#trivy:ignore:AWS-0011` line and the "No WAF yet" comment at
   `terraform/modules/cloudfront/main.tf:149-156`.
5. Extend the CloudFront module test and `detective_controls.tftest.hcl`. They
   assert `web_acl_id` is set when `enable_waf` is true and that the ACL has
   the four rules. Run them red first. Run Trivy and `ci:trivy-inline-ignores`.
6. Phase 3: review the counted matches over at least two weeks of pilot
   traffic, paying particular attention to document uploads over 8 KB and AnA
   turns. Then switch the managed rule groups to block. Keep the
   `SizeRestrictions_BODY` exclusion scoped down to the upload and AnA routes.

**Acceptance**

- The tests fail at HEAD (no ACL, ignore present) and pass after the change.
- After apply on staging, WAF metrics show requests evaluated. A 9 KB vault
  upload still succeeds. A burst over the rate rule from one IP gets 403 from
  CloudFront.
- Before the switch to block, the review of counted matches is filed as evidence.

### Stage 6 — Cross-region copies and immutable backups (Phase 3 · L · mixed) — closes the remainder of OPS-14

1. Re-confirm OPS-14 at the current head (statuses here are from 94b4f9238).
2. Create `terraform/modules/backup` and wire it from `terraform/stack/main.tf`:
   - a. `aws_backup_vault` in the primary region (KMS = the database key),
     with `aws_backup_vault_lock_configuration` in COMPLIANCE mode after a
     `changeable_for_days` grace period, and `min_retention_days` set to the
     approved retention.
   - b. A DR-region `aws_backup_vault` under the replica key, also locked.
   - c. `aws_backup_plan` with a daily rule, lifecycle `delete_after` set to
     the approved retention, and a `copy_action` to the DR vault.
   - d. `aws_backup_selection` naming the RDS instance ARN (a `module.rds`
     output) and the vault and evidence bucket ARNs. AWS Backup for S3 needs
     versioning, which both buckets have.
   - e. An IAM role for AWS Backup.
3. Add `aws_s3_bucket_replication_configuration`:
   - For the vault bucket (`terraform/stack/vault_storage.tf:76-150`), and, in
     `terraform/modules/compliance-evidence`, for the evidence bucket.
   - The destination buckets live in the DR region. They are versioned and use
     SSE-KMS under the replica keys. The evidence destination has object lock
     in COMPLIANCE mode with the same retention.
   - Add a replication IAM role. The evidence bucket's Deny statements must
     admit that role and nothing else new.
4. Vault object lock (NEW-4). With the records owner, decide whether to enable
   object lock in GOVERNANCE mode on the existing versioned vault bucket via
   `aws_s3_bucket_object_lock_configuration`. Today the task role holds
   `s3:DeleteObject` on that bucket. If lock is approved, record how deletions
   the product legitimately makes interact with retention.
5. Extend `terraform/stack/tests/dr.tftest.hcl` from stage 1. It asserts the
   backup plan's `copy_action` targets the DR region, the vault lock exists,
   both buckets have replication rules, and the evidence destination has object
   lock. Run it at HEAD and record it red.
6. Extend `staging-rds-pitr-drill.yml` with a second job. It restores the
   newest DR-region recovery point into a temporary instance in the DR region,
   and runs the same probe and hash check as stage 4.

**Acceptance**

- The extended `dr.tftest.hcl` fails at HEAD and passes after the change.
- `aws backup list-recovery-points-by-backup-vault` in the DR region shows
  copies within 24 hours of the first apply.
- An object written to the vault bucket appears in the DR bucket. A delete
  against the locked evidence destination is refused.
- The DR-region restore job completes green. Its measured RTO is recorded next
  to the in-region figure in `docs/operations/database-disaster-recovery.md`.

### Stage 7 — Environment-scoped database roles (Backlog · S · engineering) — closes the roles half of DATA-19

1. Re-confirm DATA-19 at the current head (statuses here are from 94b4f9238).
   Find where `app_service`, `gcc_*` and `audit_archiver` are created with
   `grep -rn "CREATE ROLE" scripts/ migrations/`.
2. The hazard: these roles are cluster-global. Provisioning a second database
   on the same cluster with a different password re-sets the password for every
   database on that cluster. `pg_dump` does not carry roles, so a restore into
   a shared cluster inherits whatever the cluster has.
3. Make provisioning fail closed. If the role already exists, and the cluster's
   recorded owning environment is a different one, the provisioning script
   stops with an error naming both environments. It does not re-set the
   password.
4. If the founder wants more than one environment per cluster (NEW-5; under F-4
   this should not arise), suffix the roles per environment. Do this by
   amending the creating migration or provisioning script in place. Add a dated
   header note in that file (Rule 1). Every policy, grant and `SET ROLE` site
   that names the roles must take the name from one constant, not from copies.
5. Add a selftest that provisions two databases on one CI cluster. Show that it
   re-sets the first database's password at HEAD, then show it refused after
   the change.

**Acceptance**

- The two-database selftest shows the password collision at HEAD and a refusal
  after the change.
- The stage 4 drill still passes, with roles recreated from the provisioning
  script, not from the dump.

## Definition of done

- A stopped API task, a 5xx burst, an unhealthy target group, RDS pressure, a
  failed or missing nightly sweep, an `AUDIT INTEGRITY FAILURE` line and a
  CloudTrail CIS event each page a named person within 5 minutes in staging.
  The same module is applied in production, and production cannot be planned
  or deployed without an alarm recipient and a Sentry DSN.
- GuardDuty, Config, Security Hub, VPC flow logs, ALB and CloudFront access
  logs, S3 access logs and a budget are live in every account. Each has a
  tftest that was shown red at `94b4f9238` and is green in `terraform-tests.yml`.
- A staging RDS point-in-time restore and a vault-object restore have run from
  the scheduled workflow. Evidence of measured RPO and RTO is filed, and the
  approved RPO, RTO, owner and break-glass rows replace every TBD in
  `docs/operations/database-disaster-recovery.md`.
- The fixture drill restores the real provisioned schema on the production
  Postgres major version.
- For Phase 3 closure: daily backups are copied to a locked vault in the DR
  region, the vault and evidence buckets replicate, the WAF runs in block mode
  after a recorded review, and a DR-region restore has been demonstrated.
- `docs/work-orders/MR-findings-2026-10-13.json` shows OPS-06, SEC-11, OPS-15,
  OPS-14 and DATA-19 with their closing commits.

## Founder decisions this order needs

- **F-4** (AWS accounts, region, budget ceiling). Stage 3 needs the account
  layout to decide where `manage_account_baseline` is set, and the budget
  ceiling and recipients. Stage 1 needs the primary region.
- **F-25** (data residency beyond `us-east-1`). Constrains the DR region
  chosen in NEW-2. It blocks stage 1 and stage 6.
- **F-21** (SOC 2 Type I and the penetration test). Stage 3's Security Hub
  scores and stage 4's restore report are its first evidence. It does not
  block a stage, but the auditor's scope should be agreed before stage 3's
  evidence is filed.
- **NEW-1: alert destination, on-call owner and Sentry project.** Name one or
  more email addresses or a pager endpoint, the on-call rota, and supply a
  Sentry DSN. Blocks stage 2.
- **NEW-2: DR parameters.** The DR region, production RPO and RTO, backup
  retention and legal hold, service owner, drill operator and key-access
  approvers. The DR region blocks stage 1, which must land before MR-03's first
  apply. The rest blocks stage 4 and stage 6.
- **NEW-3: WAF posture and cost.** On in count mode (recommended), or deferred
  with the reason recorded. Blocks stage 5.
- **NEW-4: Vault bucket object lock.** GOVERNANCE mode or none, decided with
  the records owner. Blocks stage 6 step 4.
- **NEW-5: whether any database cluster will host more than one environment.**
  If not, stage 7 is only the fail-closed guard. Blocks stage 7 step 4.

## Do not

- **Do not apply the stack before stage 1 lands.** Setting `multi_region` on
  the database key after the first apply replaces the RDS instance.
- **Do not build two alarm stacks.** Do not build both
  `terraform/modules/monitoring` and a `terraform/stack/detective_controls.tf`
  with its own SNS topic. Do not page through both a webhook and SNS. There is
  one topic and one path for each signal (zero duplication).
- **Do not instantiate GuardDuty or the Config recorder per environment in a
  shared account.** They are one per account and region, and a second
  instance fails to apply.
- **Do not encrypt the SNS topic with a key that does not grant
  `cloudwatch.amazonaws.com`.** The alarms show ALARM in the console and
  nobody is paged. That is the failure this order exists to remove, and it
  is invisible until stage 2's staging drill.
- **Do not count a green fixture drill as DR evidence.** Do not leave the
  drill on `dr_proof`, on `postgres:16`, or on a container rather than RDS. A
  restore that has never touched RDS is not the tested backup Annex 11 §7.2
  asks for.
- **Do not loosen the vault key's standing human-decrypt denial to make
  restores easier.** Break-glass is a dual-control, time-boxed, CloudTrail-recorded
  change written down in `docs/operations/kms-break-glass.md`. Do not point the
  evidence bucket's access logging at itself, and do not switch WAF to block
  without the counted-match review.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-04/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
