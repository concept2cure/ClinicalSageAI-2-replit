# Incident response: what each alarm means and the first three things to do

Every CloudWatch alarm the stack creates (`terraform/stack/monitoring.tf`, MR-04 Stage 2) publishes to one SNS topic,
`c2c-<environment>-alarms`, when it fires and when it clears. Each address in the root's `alarm_emails` is subscribed
by email. An address that has not confirmed AWS's subscription email is not paged.

- **Owner of every alarm:** the on-call engineer on the rota below. The rota and the alert destination are the
  founder's to name (MR-04 NEW-1), and **neither is named yet**. Until they are, the owner is the founder.
- **Each alarm's description links here by its name:** the section headings below are the alarm names without the
  `c2c-<environment>-` prefix. `terraform/stack/tests/monitoring.tftest.hcl` fails if an alarm has no section.
- **Where to look first, in any incident:**
  - `GET /readyz` with the `x-readyz-token` header (`terraform output readyz_detail`) names the dependency that is
    not ready.
  - The API's log group is `/ecs/c2c-<environment>/api`.
  - `GET /api/health/background-jobs` shows each scheduler's last run.

## On-call rota

| Week of | Primary | Secondary |
|---|---|---|
| (not yet named: MR-04 NEW-1) | founder | none |

## Audit-integrity alerts: one path

An `AUDIT INTEGRITY FAILURE` line pages through the same topic as every other alarm. It has its own filter and its own
alarm (`log-audit-integrity-failure`), so it is never folded into a general error count. It is the one alarm that is
**always an incident**: the 21 CFR Part 11 audit chain did not verify. Two other routes are not a second paging path:
- `SECURITY_ALERT_WEBHOOK_URL`, when it is set, copies the `[SECURITY]` alert to a webhook;
- `process.emitWarning`.

## Service health

### alb-target-5xx
The API answered more than 10 5xx responses in 5 minutes, two periods running.
1. Read the API log group for `"level":"error"` in the window, and find the route and the error.
2. Check `/readyz` detail: a dependency that is down (database, scanner, storage) shows there.
3. If a deploy preceded it, roll back (`docs/runbooks/rollback.md`).

### alb-elb-5xx
The load balancer answered 5xx itself: no healthy target, or a target that closed the connection or timed out at 60 s.
1. Check `alb-healthy-hosts` and `ecs-api-running-tasks`: are tasks running and passing `/healthz`?
2. In ECS, read the API service's events for failed health checks or tasks stopping.
3. If requests run past 60 s, find the route in the API log. Long work belongs behind `Prefer: respond-async` (MR-03
   Stage 6).

### alb-healthy-hosts
Fewer healthy API targets than `api_desired_count` for 3 minutes, or no data.
1. Read the ECS service's events and the stopped tasks' `stoppedReason`.
2. Check that the database is reachable from the tasks (the security group, RDS status).
3. If a deploy started it, roll back (`docs/runbooks/rollback.md`).

### alb-p95-latency
The API's p95 response time has been above `alb_p95_latency_alarm_seconds` (default 10 s) for 15 minutes.
1. Check `rds-cpu` and `rds-connections`, and the RDS Performance Insights top SQL.
2. Check `ecs-api-cpu` and `ecs-api-memory`.
3. Find the slow routes in the API log. A compile or assembly should be running as a job, not inline.

### ecs-api-running-tasks
Fewer API tasks running than desired for 5 minutes, or Container Insights stopped reporting.
1. Read the service's events and the stopped tasks' reasons: out of memory, a failed health check, an image pull, or a
   boot refusal.
2. A task that refuses to boot logs why on its first lines. The production boot refuses an unsafe configuration by
   design.
3. If a deploy started it, roll back (`docs/runbooks/rollback.md`).

### ecs-api-cpu
The API service's average CPU has been above 85% for 15 minutes.
1. Find the work in the API log: compile, OCR, PDF/A conversion and embedding calls are the heavy paths.
2. Check whether autoscaling has reached `api_max_count`.
3. If one tenant's job is the cause, decide with the founder whether to pause it.

### ecs-api-memory
The API service's average memory has been above 85% for 15 minutes. clamd shares the task (about 1.3 GB, twice that
during a signature reload).
1. Check for tasks stopped with `OutOfMemoryError` in the service's events.
2. Find large uploads or packages in the API log.
3. If it persists, raise `api_memory` through Terraform. Never raise it by hand in the console.

### ecs-embeddings-running-tasks
Fewer embedding tasks running than `embedding_desired_count` for 5 minutes.
1. Read the embedding service's events: model download, memory, or a failed health check.
2. Search and drafting that need embeddings degrade while it is down. Check `/readyz` detail.
3. Restore it before working on anything else that depends on retrieval.

### ecs-embeddings-cpu
The embedding service's CPU has been above 85% for 15 minutes.
1. Find the batch that is embedding: a corpus or Vault ingest.
2. Confirm that requests still complete. Slow is acceptable; failing is not.
3. If it is sustained, size `embedding_cpu` or `embedding_desired_count` through Terraform.

### ecs-embeddings-memory
The embedding service's memory has been above 85% for 15 minutes.
1. Check for stopped tasks with `OutOfMemoryError`.
2. Find the batch sizes in the embedding log group.
3. If it is sustained, size `embedding_memory` through Terraform.

### rds-cpu
The database's CPU has been above 80% for 15 minutes.
1. Open Performance Insights and find the top SQL by load.
2. Check for a sweep or migration running at the time (`GET /api/health/background-jobs`).
3. If it is one query, find its route. If it is sustained load, plan an instance-class change, which is a Terraform
   change with a maintenance window.

### rds-free-storage
The database has under 10 GiB of storage free. Storage autoscales up to `rds_max_allocated_storage`. This fires when
growth is faster than that, or when the ceiling is near.
1. Check `FreeStorageSpace` against the allocated and maximum storage.
2. Find what grew: tables, or WAL from a stuck replication slot.
3. Raise `rds_max_allocated_storage` through Terraform if the growth is real.

### rds-freeable-memory
The database has under 256 MiB of freeable memory.
1. Check `rds-connections`: each connection costs memory.
2. Check Performance Insights for memory-heavy queries (sorts, hashes).
3. If it is sustained, plan an instance-class change.

### rds-connections
Database connections are above 80% of the instance class's `max_connections`.
1. Count tasks × pool size. Each API task holds a pool, and a held request connection (`retainRequestDbClient`) lasts
   for the length of its job.
2. Look for leaked connections: `pg_stat_activity` rows `idle in transaction`.
3. If the load is real, plan a larger class. Do not raise `max_connections` past what the memory supports.

### cloudfront-5xx-rate
More than 5% of requests at the edge answered 5xx, for 10 minutes.
1. If `alb-elb-5xx` or `alb-target-5xx` also fired, start there: the origin is failing.
2. If not, check the CloudFront distribution's origin settings and the origin-secret header (the ALB refuses a request
   without it).
3. A 504 at the edge means a request ran past 60 s. Find its route.

## Lines the server wrote

### log-retention-sweep-failed
`Scheduled retention sweep failed`: the nightly retention sweep threw.
1. Read the line's `error` field and the lines before it in the API log.
2. The claim is given back, so a later tick retries the same day. Check whether `job-stale-retention-sweep` follows.
3. A retention decision that cannot be applied is a records issue. Tell the founder the same day.

### log-audit-chain-check-failed
`Audit chain integrity check failed`: the audit-chain sweep itself threw before it could verify. This says nothing
about the chain's integrity. The check did not run.
1. Read the error. Usually the database or `AUDIT_HMAC_KEY` was unavailable.
2. Fix the cause, and confirm the next run in `GET /api/health/background-jobs`.
3. If it does not run within the day, `job-stale-audit-chain-integrity-sweep` fires.

### log-audit-integrity-failure
`AUDIT INTEGRITY FAILURE`: the audit chain did **not** verify. Treat it as a security incident under 21 CFR Part 11.
1. Do not change data. Record the time, and the organizations and ranges the line names.
2. Export the chain head anchored in the evidence bucket (`AUDIT_ANCHOR_BUCKET`), and compare it with the database.
3. Tell the founder at once. The founder decides on customer notification.

### log-external-intelligence-sweep-crashed
`External intelligence sweep crashed`: the nightly regulatory-intelligence fetch (FDA, EMA, MHRA, TGA, NCBI) threw.
1. Read the error: usually an upstream source that is down or rate-limited.
2. The data is a day stale; nothing governed depends on it being current.
3. If it repeats on three nights, find the failing source and raise it.

### log-security-alert
`[SECURITY] [alert:<kind>]`: the server reported a security event (`reportSecurityAlert`). Examples are a tenant
impersonation that was blocked, a retention action refused, and an audit-integrity failure.
1. Read the `kind` and the detail on the same line.
2. Find the user and the organization in the request log around it.
3. If it was an attempt rather than a defect, tell the founder, and keep the log lines (export them before the
   group's retention runs out).

### log-security-posture-failing
`security posture transitioned … → failing`: the security-health scheduler's overall posture went to failing.
1. The line's `failingChecks` names the checks that failed.
2. Fix each named check. The scheduler logs the transition back when they pass.
3. If a failing check is the scanner or the audit key, uploads or signing are refused until it is fixed.

## Account activity (CloudTrail, CIS AWS Foundations)

### trail-root-activity
The account's root user did something. Nobody should use root.
1. Find the event in the trail's log group (`/aws/cloudtrail/c2c-<env>-part11-evidence`): what was done, and from
   where.
2. If nobody on the rota did it, treat it as a compromise. Rotate the root credentials and check MFA.
3. Record it in the security log.

### trail-iam-policy-change
An IAM policy was created, changed, attached or detached.
1. Find the event and its principal.
2. If it was not a Terraform apply by the deploy role, find who made it and why.
3. Revert anything made by hand. Terraform is the only way policies change.

### trail-kms-key-disabled-or-deleted
A KMS key was disabled or scheduled for deletion. The database, vault, secrets and release-signing keys are all
customer-managed, so this can make data unreadable.
1. Find the key and the principal.
2. If it was not intended, cancel the deletion (`aws kms cancel-key-deletion`) or re-enable the key at once.
3. Tell the founder.

### trail-security-group-change
A security group was created, deleted, or had a rule added or removed.
1. Find the group and the principal.
2. A change made outside Terraform is drift. Revert it with a plan and apply.
3. If the change opened anything to `0.0.0.0/0`, treat it as an incident.

### trail-console-sign-in-failure
A console sign-in failed.
1. Find the user name and the source IP.
2. A single failure is a typo. Repeated failures are an attempt: check that the user's MFA is on.
3. If the user does not exist, the attempt is against the account. Record it.

## A sweep that stopped

Each finished run of a windowed job writes C2C/Jobs `JobSucceeded` (`server/db/scheduledOnce.ts`). These fire when a
day passes without one. A job that stopped logs no error, so this is the only signal that it has.

### job-stale-retention-sweep
No finished retention sweep in the last day.
1. `GET /api/health/background-jobs`: is it running, failing, or disabled (`ENABLE_RETENTION_SWEEP=false`)?
2. Read the API log for `Scheduled retention sweep failed`.
3. If it is disabled by intent, that is a records decision for the founder. Record it, and silence the alarm in
   Terraform, not in the console.

### job-stale-audit-chain-integrity-sweep
No finished audit-chain integrity sweep in the last day. The Part 11 chain has gone unchecked for that long.
1. `GET /api/health/background-jobs`: is it running, failing, or disabled (`ENABLE_AUDIT_CHAIN_CHECK=false`)?
2. Read the API log for `Audit chain integrity check failed`.
3. Restore it the same day. Until it runs, tampering would go undetected.
