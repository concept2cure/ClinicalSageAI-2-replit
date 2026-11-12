# MR-04 Stage 3, steps 4 to 6: flow logs and access logs (2026-11-12)

This closes the logging items of OPS-15 and of SEC-11: the VPC flow log, the ALB access log, CloudFront's access log,
and S3 server access logs for the vault and frontend buckets. The account baseline is not done here; see "Not done
here".

## What already exists

- **`terraform/modules/vpc-secure`:** the VPC, its subnets, the NAT gateway, and the S3 and KMS endpoints. There was no
  `aws_flow_log` anywhere in `terraform/`. Checkov's CKV2_AWS_11 failed on `aws_vpc.this`.
- **`terraform/modules/alb`:** already took `access_logs_bucket`, and turned `access_logs` on when it was not empty
  (`main.tf:41-45`). The stack passed nothing, so no request was logged by the load balancer.
- **The stack's other buckets:** vault, frontend and evidence. Each has a public-access block and versioning. The vault
  and evidence buckets use a customer-managed key, and the frontend uses SSE-S3, with an inline `#trivy:ignore:AWS-0132`
  and a reason. That is the precedent the ALB log bucket follows.
- **`modules/cloudfront`:** the distribution, the frontend bucket, and a WAF ACL. It had no `logging_config` and no v2
  log delivery.
- **The evidence bucket:** its header documents a recursive-logging loop that was fixed once. It is not given server
  access logging here, because the trail's data events already record its reads and writes.
- **The CloudTrail log group** (`modules/compliance-evidence`): encrypted under a key that CloudWatch Logs may use for
  that group only. The flow-log key follows its policy.

## What changed

| File | Change |
|---|---|
| `terraform/modules/vpc-secure/main.tf` | Adds `aws_flow_log.this`: ALL traffic, 60-second aggregation, to `/aws/vpc/<name>/flow-logs`. The group is kept `flow_log_retention_days` (at least 365), under its own rotating key, which `logs.<region>.amazonaws.com` may use for that group only. The delivery role can be assumed only by `vpc-flow-logs.amazonaws.com`, for this account, and writes only to that group. Output `flow_log`. |
| `terraform/modules/vpc-secure/variables.tf` | `name` (default `c2c`) and `flow_log_retention_days` (default 365; less is refused). |
| `terraform/modules/vpc-secure/tests/*.tftest.hcl` | New: `flow_logs.tftest.hcl`. The two existing files get ARN-shaped mocks, which the new resources need. |
| `terraform/modules/alb/outputs.tf` | Output `access_logs` (enabled, bucket). |
| `terraform/modules/alb/tests/alb_timeouts.tftest.hcl` | Access logs are on with a bucket and off without one. Both runs pass at HEAD too: the module already behaved this way. They pin it. |
| `terraform/stack/access_logs.tf` | New: the ALB log bucket. Contents below. |
| `terraform/stack/access_logs.tf` (step 6) | One access-log bucket, built like the ALB's, apart from everything it describes. CloudFront's v2 access log goes to `cloudfront/`, through a delivery source on the distribution, a JSON destination and a delivery, made in us-east-1. S3 server access logs for the vault and frontend buckets go to `s3/vault/` and `s3/frontend/`. The bucket policy admits `logging.s3.amazonaws.com` for those two buckets only, and `delivery.logs.amazonaws.com` for this account's delivery sources only, each under its own prefix. |
| `terraform/stack/tests/{boot_contract,dr,monitoring}.tftest.hcl` | ARN overrides for the distribution, the access-log bucket and the delivery destination, which the v2 delivery validates. |
| `terraform/stack/main.tf` | `module.vpc` gets `name = local.long`. `module.alb` gets `access_logs_bucket`, taken from the bucket policy so the ALB is created after ELB may write. |
| `terraform/stack/variables.tf` | `access_log_retention_days` (default 365; less is refused). |
| `terraform/stack/tests/detective_controls.tftest.hcl` | New, under the name the work order gives it. |

The ALB log bucket in `terraform/stack/access_logs.tf` is:
- private, owner-enforced and versioned;
- encrypted with SSE-S3, which is the only encryption ALB log delivery supports. That is excepted inline for AWS-0132,
  with the reason;
- expired after `access_log_retention_days`, with old versions expired after 30 days;
- written only by the region's ELB account and the log-delivery service, and only under `alb-logs/AWSLogs/<account>/`;
- refused over anything but TLS.

**What is not decided here:** how long access logs are kept is a records-retention decision. 365 days is the floor the
flow logs take from CIS and the security audit, and it is a variable.

## Evidence

- **`flow-logs-red.txt`:** the module's new test against trunk before this change (`4ae245bd9`). It fails: there is no flow log.
- **`detective-controls-red.txt`:** the stack's new test against trunk before this change (`4ae245bd9`). It fails: there is no flow log under the
  environment's name, and no ALB log bucket.
- **`detective-controls-green.txt`:** after the change, 7 of 7:
  1. the VPC logs ALL traffic to `/aws/vpc/c2c-production/flow-logs`, kept a year;
  2. the ALB writes to the stack's bucket;
  3. the bucket is private, SSE-S3, versioned and expiring;
  4. only ELB writes, under the account's prefix, and only over TLS;
  5. a shorter retention is refused;
  6. CloudFront and the vault and frontend buckets log to the access-log bucket, which is none of the buckets it
     describes;
  7. that bucket admits only its two writers, for this account, over TLS.
- **`vpc-secure-suite.txt`** and **`alb-suite.txt`:** both module suites after the change. They include the existing
  private-path and CloudFront-only tests.
- **`stack-suite.txt`**, **`roots.txt`** and **`preflight-proof.txt`:** as for Stages 1 and 2.
- **`trivy-inline-ignores.txt`:** `ci:trivy-inline-ignores --root terraform`, run before commit, because without `--root` it reads tracked files only. Both new AWS-0132 exceptions sit on the blocks they name.
  Trivy itself could not be run here: its releases and images are refused by this session's network policy. The
  blocking scan runs in CI.
- **`checkov-diff.txt`:** Checkov 3.4.5 over `terraform/`, before and after.
  - CKV_AWS_18 (bucket access logging) now passes for the vault bucket. The frontend bucket's logging is configured
    in the stack (`aws_s3_bucket_logging.frontend`), against a bucket the cdn module creates. Checkov does not link the
    two, so it still reports that bucket. `detective_controls.tftest.hcl` asserts the logging.
  - CKV2_AWS_11 (VPC flow logging) now passes.
  - The two new log buckets fail exactly the checks the existing buckets already fail: event notifications,
    cross-region replication, and the bucket's own access log. They also fail a customer-managed key, which log
    delivery cannot use, as the frontend bucket does.

## Not done here

- **Steps 2 and 3, the account baseline:** GuardDuty with its S3, RDS and runtime features; Security Hub with FSBP and
  CIS; the Config recorder and rules; budgets. This waits on the founder's account layout (F-4), which decides where
  `manage_account_baseline` is true, and on the budget ceiling and its recipients.
- **The staging proof:** log objects appearing within 15 minutes of a smoke test. It needs the staging deploy.
