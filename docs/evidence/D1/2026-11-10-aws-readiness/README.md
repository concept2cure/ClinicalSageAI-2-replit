# D1 — what stands between this repository and AWS, re-measured at head (2026-11-10)

Row **D1** (Hosted production), work order `docs/work-orders/MR-03-first-deploy-staging-to-production.md`, session
`…01QoxbLaF`. The founder: *"focus on getting us ready to run on AWS."* The work order's status table dates from
`94b4f9238`. This re-measures it at `59dc4f9f58` and lands the one decided piece of AWS work nobody held: P-11, the WAF.

## What already exists (RULE 3)

- **`terraform/`**: one `stack` with two thin roots (`environments/{staging,production}`), modules for the VPC, ALB,
  CloudFront, ECS Fargate, RDS, ECR, secrets, compliance evidence, the embedding service and GitHub's OIDC deploy roles,
  and the `bootstrap` state bucket. There are offline `terraform test` suites, run by `.github/workflows/terraform-tests.yml`.
- **`.github/workflows/deploy-aws.yml`**:
  - the one deploy path (MR-03 Stage 4): `rc-*` builds and verifies on staging, and `v*` promotes the verified digest to
    production with no build;
  - a `rollback` dispatch;
  - `ci-verdict` refuses a SHA whose CI, Semgrep and CodeQL runs did not pass.
- **`.github/workflows/provision-database.yml`**: provisions the empty RDS database.
- **`scripts/ops/terraform-preflight-proof.mjs`**: the deploy's preflight, run against the rendered task definitions.
- **CI's image jobs** (`ci.yml`): Production Image Boot, Blank DB Provisioning + Deploy Migration and Production Boot Smoke.
- **The founder's list:** MR-03 Stage 5, and the D1 row of `docs/LAUNCH_DEFINITION_OF_DONE.md`.
- **P-11** (`docs/LAUNCH_DEFINITION_OF_DONE.md`): a WAF on CloudFront at launch, decided 2026-10-01. It was handed to the
  CloudFront holder (`docs/work-orders/README.md`, "the WAF is decided") and never built: `terraform/` held no
  `aws_wafv2_*`, and the distribution carried `#trivy:ignore:AWS-0011` as a pending founder decision.

## What was run, and what passed

| Check | Result | File |
|---|---|---|
| CI's Terraform matrix at head: init, validate, test | 117 pass (stack 84, cloudfront 11, deploy roles 10, compliance 5, alb 4, vpc 3); all validate | `terraform-matrix-at-head.txt` |
| Both environment roots, `-lockfile=readonly` | valid | same |
| The deploy preflight proof | every check holds, including the API task's refusal of the owner credentials (OPS-16 done) and 54 job×action IAM pairs | run in this session; CI runs it on every push |
| Deploy contracts (`tests/ci/deploy-*.contract.test.ts`) | 3 files pass | `npx vitest run tests/ci/` |
| CI on GitHub (run 42538903005) | Production Image Boot, Blank DB Provisioning, Production Boot Smoke, Security Scan and the Codespace job **pass** | GitHub |
| The WAF, red then green | trunk's module with the new tests: 11 passed, 1 failed; with the change: 15 of 15 | `waf-red.txt`, `waf-green.txt` |
| The matrix with the WAF | 121 pass; all validate | `terraform-matrix-with-waf.txt` |
| Trivy 0.67.2 over `terraform/`, HEAD vs the change | the two AWS-0011 findings are gone, nothing new. Other findings this local Trivy reports at HEAD are ones CI's Security Scan passes: inline-ignore handling differs between versions. | `trivy-terraform-head-vs-waf.txt` |

Toolchain: Terraform 1.11.4 (CI's version), with `hashicorp/aws` 5.100.0 and `hashicorp/random` 3.6.3, the versions the lock
files pin. All three were downloaded from `releases.hashicorp.com`, checked against HashiCorp's SHA256SUMS, and installed
from a local filesystem mirror. The Terraform registry is not reachable from this session. Runs used a scratch copy of the
repository, so no `.terraform/` reached the tree. The AWS provider is mocked, as in CI. **Nothing was applied: there is no
AWS account or credential in this session.**

## The WAF (P-11), as built

- **Where:** `aws_wafv2_web_acl.this` (scope `CLOUDFRONT`) in `terraform/modules/cloudfront/main.tf`, attached through the
  distribution's `web_acl_id`. Its ARN is the module output `web_acl_arn`.
- **The rules:**
  - `AWSManagedRulesAmazonIpReputationList` and `AWSManagedRulesKnownBadInputsRuleSet` block;
  - a per-IP rate rule blocks over `waf_rate_limit_per_5_minutes` (default 2000; validated at least 100);
  - `AWSManagedRulesCommonRuleSet` counts (`waf_common_rule_set_action = "count"`), as P-11 decides for the first two
    weeks.
- **One deliberate difference from P-11's text:** the body-size rule. P-11 says the common set's body-size rule is
  "excluded on the upload and AnA paths". `SizeRestrictions_BODY` refuses any body over 8 KB, and that also refuses the
  editor's JSON saves and other ordinary requests, not only uploads and AnA. So it counts on **every** path, also when the
  set is switched to block, and the app keeps its own body limits. The two weeks of counted matches show which paths a
  scoped body rule could safely cover. That rule is a later change, made from data.
- **The region:** a precondition refuses any provider region but `us-east-1`. A CloudFront web ACL exists only there; both
  environments default to it (F-25 still confirms the region).
- **Cost:** about $10 a month plus request charges, as P-11 states.

## Blocked, by name

1. **Trunk CI is red**, and the deploy runs only a SHA whose whole `ci.yml` run concluded success. Latest finished run:
   - Secret scan: 8 findings, and 3 credentials recorded as live;
   - Lint;
   - Integration Tests;
   - Test: 447 of 79,560 failing.

   It is owned by the MR-02 lanes. Until a trunk SHA is green, no deploy can run.
2. **The founder's inputs** are in MR-03's 2026-11-10 checklist: accounts, region, domain and certificates, SMTP, keys,
   B4, NEW-3, retention, revoking the live credentials, and the apply.
3. **Not done here (engineering):**
   - MR-03 Stage 6 (OPS-17);
   - Stage 7 steps 2–4 and 8;
   - wiring `READYZ_TOKEN` into the task and the smoke test;
   - the switch of the common rule set to block, two weeks after the first apply.

## Also landed: MR-03 Stage 7 steps 5 and 6

| Finding | Commit | Red | Green |
|---|---|---|---|
| OPS-22, public `/readyz` expensive and chatty | `5e8a7317ce` | 5 hits ran 5 queries, 10 concurrent ran 10, and the detail went to everyone (`readyz-red.txt`: 7 failing) | 35/35 across the readyz suites (`readyz-green.txt`) |
| OPS-29, metrics token compared with `===` | `8a5eb16b27` | the source check fails on `===` (`metrics-token-red.txt`) | 11/11 (`metrics-token-green.txt`) |

`readyz-virus-scan`'s 30 s boundary case runs with `READYZ_CACHE_MS=0`. It pins the scanner's own cache, which the verdict
cache would otherwise extend by up to 5 s; its assertions are unchanged.
