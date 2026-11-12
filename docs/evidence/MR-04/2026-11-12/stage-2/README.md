# MR-04 Stage 2: one alarm path that pages a person (2026-11-12)

Closes the engineering part of OPS-06, and the alarm and alert items of SEC-11. The founder's inputs and the staging
drills are still open (see "Not done here").

## What already exists

- **In the AWS stack:**
  - No `aws_cloudwatch_metric_alarm`, `aws_sns_topic` or `aws_cloudwatch_log_metric_filter` anywhere in `terraform/`
    (searched by resource type).
  - Container Insights is on in the ECS cluster (`terraform/modules/ecs-fargate/main.tf:10`).
  - The Part 11 trail delivers to a CloudWatch log group (`terraform/modules/compliance-evidence/main.tf:277`). The
    module already exports its name as `names.log_group`.
  - The ALB module already exports `alb_arn_suffix` and `api_target_group_arn_suffix`.
- **`infra/alerts/background-jobs.yml` and `orchestrator.yml`:** Prometheus Alertmanager rules over `/api/metrics`
  (`server/services/background-jobs-metrics.ts`). Nothing in the AWS stack runs Prometheus or scrapes `/api/metrics`,
  so in AWS these rules page no one.
  - They are not changed here. Whether a Prometheus deployment is kept beside CloudWatch is a decision, and until
    then the two rule sets are each other's only overlap. The overlap is the stale-sweep rules.
- **`server/services/security-alerts.ts`:** logs a `[SECURITY]` line and copies it to `SECURITY_ALERT_WEBHOOK_URL` when
  that is set. Nothing provisions the webhook.
- **`server/db/scheduledOnce.ts`:** `runScheduledOncePerWindow` records each windowed run in `scheduled_job_claims`. It
  reported nothing outside the database.
- **`docs/operations/uptimerobot-setup.md`:** a Replit-era keep-awake pinger. It is not an alarm path.
- **`docs/runbooks/`:** no incident or rollback runbook. `deploy-aws.yml` already has the `rollback` job (MR-03
  OPS-23), which the rollback runbook now documents.

## What changed

| File | Change |
|---|---|
| `terraform/stack/monitoring.tf` | New, in the stack, not a new module. Contents below. |
| `terraform/stack/variables.tf` | `alarm_emails` (each an address; production needs at least one) and `alb_p95_latency_alarm_seconds` (default 10). |
| `terraform/modules/ecs-fargate/outputs.tf` | `api_log_group_name`. |
| `terraform/environments/{production,staging}/{main.tf,variables.tf,terraform.tfvars.example}` | `alarm_emails` passed through. Production's has no default and requires at least one address; staging's defaults to none. |
| `server/db/scheduledOnce.ts` | After a run's finish is recorded, one EMF line: C2C/Jobs `JobSucceeded`, dimension `JobName`. |
| `server/services/security-alerts.ts` | The line is `[SECURITY] [alert:<kind>] <message>`, so the alarm can match reported alerts only. |
| `terraform/stack/tests/monitoring.tftest.hcl` | New: 10 runs. |
| `terraform/stack/tests/{boot_contract,dr}.tftest.hcl` | An SNS ARN mock and an `alarm_emails` value, which production now requires. |
| `docs/runbooks/incident-response.md`, `docs/runbooks/rollback.md` | New. |

`terraform/stack/monitoring.tf` contains:
- an SNS topic encrypted under its own KMS key, which grants `cloudwatch.amazonaws.com` Decrypt and GenerateDataKey*;
- an email subscription per address;
- 28 alarms, each notifying the topic on ALARM and on OK;
- 6 application log filters and 5 CloudTrail filters.

**Departures from the work order, with reasons:**
1. **A file in the stack, not `terraform/modules/monitoring/`.** It reads the stack's own locals and keys, and CLAUDE.md
   RULE 6 prefers finishing what exists to adding a module.
2. **One metric and one alarm per log line, not one shared `JobFailure`.** Each needs different first actions, and the
   runbook is written per alarm. `AUDIT INTEGRITY FAILURE` still has its own filter and alarm, as asked.
3. **The security-alert pattern.** The work order matches `[SECURITY]`. That prefix is also printed for every blocked
   CORS origin and every refused prototype-pollution key (`server/middleware/enterprise-security.ts`). A public
   endpoint sees those all day, and an alarm that fires all day trains people to ignore it.
   - `reportSecurityAlert`'s line now carries `[alert:<kind>]`, and the filter matches that.
   - `tests/security-alerts.test.ts` was updated to the new line.
4. **The EMF line carries `Timestamp` and `Unit`.** CloudWatch's embedded metric format requires `_aws.Timestamp`. The
   line in the work order omits it.
5. **No worker alarms.** There is no worker service: this repository builds no worker image, and every scheduler runs
   in the API task. The embedding service gets the running-task, CPU and memory alarms instead.
6. **Not done: Sentry fail-closed** (steps 6 and 7, for `sentry_dsn`). Whether errors go to Sentry at all is the
   founder's decision: Sentry under a DPA, or CloudWatch only (MR-03 NEW-3, MR-04 NEW-1). Making a DSN mandatory first
   would decide it.

## Evidence

- **`monitoring-red.txt`:** `monitoring.tftest.hcl` against the stack before the change. 0 passed, 1 failed (no topic
  and no alarms declared), the rest skipped.
- **`monitoring-green.txt`:** after the change, 10 of 10. The runs:
  1. every alarm notifies the topic on ALARM and OK, and each address is subscribed;
  2. CloudWatch may use the topic's key;
  3. the ALB, ECS, RDS and CloudFront alarms watch the right metric, dimensions and threshold. The connections
     threshold is 720 for db.m6g.large: 8 GiB / 9531392 × 80%;
  4. the log filters match the exact lines the server writes, each with its alarm;
  5. the five CloudTrail CIS filters, each with its alarm;
  6. the two stale-sweep alarms;
  7. production refuses an empty `alarm_emails`;
  8. production refuses a value that is not an address;
  9. staging may have none;
  10. every alarm has a runbook section and links to it.
- **`monitoring-mutations.txt`:** each guarantee broken in a scratch copy. The run that guards it fails each time:
  - the key without CloudWatch's grant;
  - the production validation removed;
  - the security filter widened to `[SECURITY]`;
  - no `ok_actions`;
  - stale alarms that treat a missing day as fine;
  - the CloudTrail filters dropped.
- **`runbook-check-red.txt`:** one runbook section renamed. The run fails and names the alarm that has no section.
- **`emf-red.txt` and `emf-green.txt`:** `server/db/__tests__/scheduledOnce-job-succeeded-metric.test.ts`.
  - **Before:** the success case fails, and the four "writes nothing" cases pass, as they must: the job throws, the
    window was claimed, the lease is held elsewhere, or the finish was not recorded.
  - **After:** 5 of 5.
  - The three once-per-window suites that use the function still pass, 9 of 9.
- **`server-suites.txt`:** the server suites around the change pass: 84 files, 890 tests. They include the EMF test, `tests/security-alerts.test.ts`, every `server/jobs` test, the once-per-window suites, `server/middleware` and the root contract.
- **`stack-suite.txt`:** every `terraform/stack` test file after the change.
- **`roots.txt`:** both roots and bootstrap validate from their lock files; `fmt -check` is clean.
- **`preflight-proof.txt`:** the deploy preflight against the rendered task definition.

## Not done here

- **The founder's inputs (MR-04 NEW-1):**
  - the addresses for `alarm_emails` (production does not apply without one);
  - the on-call rota (the runbook's rota table says it is not named);
  - the Sentry decision.
- **The staging drills (step 10), which need MR-03's staging deploy.** Each must page within 5 minutes:
  - stop the API task;
  - block the database security group;
  - force a retention-sweep failure;
  - write `AUDIT INTEGRITY FAILURE in test`;
  - disable the retention sweep for a day to trip the stale-sweep alarm.

  These are the only proof that a page actually arrives. A mocked apply cannot show it.
- **Each address must confirm** AWS's subscription email before it is paged. The apply cannot do that.
