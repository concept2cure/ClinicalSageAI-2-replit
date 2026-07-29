# GA Readiness Audit — Infrastructure, Deployment & CI/CD

**Scope:** Containers, Terraform IaC, Kubernetes/Helm, CI/CD pipelines, runtime config & secrets.
**Date:** 2026-06-14
**Auditor:** Infrastructure/Deploy/CI-CD specialist (net-new from source)
**Repo:** /home/user/ClinicalSageAI-2-replit

---

## Executive Summary

The production deployment path (Terraform → ECR → ECS Fargate → ALB/CloudFront, secrets via AWS Secrets Manager, RDS with encryption/Multi-AZ/35-day backups/Object-Lock evidence bucket) is **well-architected and notably mature** for a regulated (21 CFR Part 11) workload. Encryption at rest, private subnets, no-public-IP tasks, OIDC-based deploy (no long-lived AWS keys), deployment circuit breakers, and least-ish-privilege IAM are all present. The optimized Docker image is multi-stage, runs as a non-root user, and has a healthcheck.

However, **GA is gated by several reproducibility and supply-chain integrity gaps** that are standard production blockers regardless of how good the cloud topology is:

1. **Production runs mutable `:latest` image tags** in the ECS task definitions — no digest pinning, no rollback-by-tag guarantee, and a race between `build-push` and `force-new-deployment`.
2. **Every GitHub Action is pinned to a floating tag (`@v4`, `@v1`, `@master`)**, not a commit SHA — supply-chain risk for a pipeline that holds AWS deploy credentials.
3. **The deploy workflow's only quality gate is `npm run lint` + `npm test`** — the rich CI guardrails, CodeQL, Semgrep, Trivy, and Checkov are NOT in the deploy critical path, and several security scans are `continue-on-error: true` (advisory only).

None of these are architectural; they are config hardening. **Verdict: CONDITIONAL** — deployable, but the image-pinning and action-pinning blockers should be closed before GA.

### Findings by severity

| Severity | Count |
|----------|-------|
| BLOCKER  | 2 |
| HIGH     | 6 |
| MEDIUM   | 7 |
| LOW      | 4 |

---

## BLOCKERS

### [BLOCKER] Production ECS uses mutable `:latest` image tags — no digest pinning, no reproducible rollback
**Files:**
- `terraform/environments/production/main.tf:114-115` — `api_image = "...:latest"`, `worker_image = "...:latest"`
- `.github/workflows/deploy-aws.yml:104,107,117,120` — builds & pushes both an immutable `$IMAGE_TAG` AND `:latest`, then ECS deploy targets the task def which references `:latest`.

**Impact:** The ECS task definitions (`ecs-fargate/main.tf:131,181`) consume `var.api_image`/`var.worker_image` which Terraform wires to `:latest`. The deploy job (`deploy-aws.yml:137-143`) does `aws ecs update-service --force-new-deployment` — this re-pulls whatever `:latest` points to *at pull time*. There is no guarantee the running tasks match the git tag that triggered the deploy, no atomic rollback (rolling back the git tag does not change `:latest`), and a concurrent push can poison an in-flight deploy. For a 21 CFR Part 11 system, "which exact build is in production?" must be answerable by digest. This breaks build reproducibility and auditability.

**Fix:** Render a new task definition per deploy that references the immutable `$IMAGE_TAG` (or, better, the image digest), register it, and `update-service --task-definition`. Stop pushing/consuming `:latest` for production. Drive image tags into Terraform via a variable or use `aws-actions/amazon-ecs-deploy-task-definition` with the digest.

### [BLOCKER] No GitHub Action is pinned to a commit SHA — deploy pipeline holds AWS prod credentials
**Files (representative):**
- `.github/workflows/deploy-aws.yml:47,52,77,84,132,161,206` — `actions/checkout@v4`, `actions/setup-node@v4`, `aws-actions/configure-aws-credentials@v4`, `aws-actions/amazon-ecr-login@v2` (all floating tags).
- `.github/workflows/terraform-compliance.yml:25` — `bridgecrewio/checkov-action@master` (worst case: tracks a moving branch).
- `.github/workflows/pr-checks.yml:17` — `returntocorp/semgrep-action@v1` (deprecated org, floating tag).
- `.github/workflows/ci.yml` — all `uses:` lines on `@v4`/`@v5`/`@v3` tags.

**Impact:** A floating tag (`@v4`, `@master`) lets the action publisher (or anyone who compromises their repo/tag) ship new code into a workflow that assumes the AWS deploy role (`secrets.AWS_DEPLOY_ROLE_ARN`) and can push to ECR / update ECS. `@master` in `terraform-compliance.yml` is the highest exposure — it runs on every `terraform/**` PR and pulls HEAD of a third-party action. This is a classic supply-chain attack surface for an environment with production cloud credentials.

**Fix:** Pin every `uses:` to a full commit SHA (`actions/checkout@<40-char-sha> # v4.2.2`). Prioritize the credentialed workflows (`deploy-aws.yml`, `terraform-compliance.yml`, `cerv2-staging-deploy.yml`). Add Dependabot for `github-actions` to manage SHA bumps. Replace deprecated `returntocorp/semgrep-action`.

---

## HIGH

### [HIGH] Security/quality scans are advisory-only (`continue-on-error: true`) in CI
**File:** `.github/workflows/ci.yml`
- `:318` SBOM generation `continue-on-error: true` (acceptable — value-add).
- `:337` **Trivy filesystem scan (deps + secrets)** `continue-on-error: true` — a leaked secret or CRITICAL CVE does NOT fail the build.
- `:347` **Trivy config scan (Dockerfile/IaC)** `continue-on-error: true` — IaC misconfig does NOT fail.

**Impact:** Trivy is configured with `exit-code: '1'` and `severity: CRITICAL,HIGH` but the `continue-on-error` neutralizes it — findings are reported but never block merge. Secret scanning and CRITICAL-CVE gating are therefore effectively off for the merge gate.

**Fix:** Remove `continue-on-error` from the two Trivy steps (keep it only on SBOM). If false positives are an issue, use `.trivyignore` with documented justifications rather than disabling the gate wholesale.

### [HIGH] Production deploy bypasses the real CI gate
**File:** `.github/workflows/deploy-aws.yml:42-63`
**Impact:** The `test` job that gates `build-push` only runs `npm run lint` and `npm test`. The substantial governance/security guardrails in `ci.yml` (RLS parity, SAML fail-closed, tenant isolation, password hygiene, security-pattern checks, CodeQL, Semgrep, Trivy) are NOT prerequisites for a production deploy — they run on push/PR but a tag push (`tags: v*`) can deploy even if those are red on the branch. Deploy gating relies on the assumption that the tagged commit already passed CI, but nothing enforces it.

**Fix:** Require the full CI workflow (and CodeQL/Semgrep) as a deploy prerequisite, or gate the `deploy-aws` workflow on a successful CI run for the same SHA (e.g., `workflow_run` dependency or a required-status-check on the release branch).

### [HIGH] Inconsistent SAST enforcement; CodeQL hard-gate not verifiable from source
**Files:**
- `.github/workflows/semgrep.yml:32-44,60-64` — runs `set +e ... exit 0`, then a later step fails on findings, so this one IS blocking. **But** `pr-checks.yml:16-19` runs a *different* Semgrep (`returntocorp/semgrep-action@v1`, `config: p/ci`) with no explicit failure handling, and it is not part of `ci.yml`'s required job set.
- `.github/workflows/codeql.yml` — uploads results but there is no in-repo declaration that CodeQL `analyze` is a required status check; whether it blocks merge depends on GitHub branch-protection settings not present in source.

**Impact:** SAST coverage exists but enforcement is inconsistent and partly dependent on branch-protection config that cannot be verified from the repo. For GA, "is a CRITICAL CodeQL/Semgrep alert merge-blocking?" must be a deterministic, documented gate.

**Fix:** Standardize on one Semgrep invocation, ensure CodeQL `analyze` is a required status check, and document branch-protection rules in-repo (settings-as-code or a documented checklist). Treat HIGH/CRITICAL as blocking.

### [HIGH] `docker-compose.yml` / `.beta.yml` default DB connection is `sslmode=prefer` (plaintext-capable)
**Files:** `docker-compose.yml:74`, `docker-compose.beta.yml:70`
**Impact:** `sslmode=prefer` falls back to **unencrypted** if the server doesn't offer TLS, and the bundled `pgvector/pgvector:pg15` image ships TLS off by default (acknowledged in the inline comment). For the beta environment used for "Human Testing & QA" (`docker-compose.beta.yml:3`), regulated/PII data could traverse the bridge network in plaintext. The comment defers TLS hardening as a follow-up — that follow-up is a GA prerequisite for any env handling real data.

**Fix:** For beta/staging that touch real data, bind-mount certs + enable `ssl=on` on Postgres and set `sslmode=require` (or `verify-full`). The production RDS path already enforces encryption, so this is scoped to the compose-based environments.

### [HIGH] Hardcoded credentials in staging compose; docker.sock mounted into e2e worker
**Files:**
- `docker-compose.staging.yml:29` `POSTGRES_PASSWORD: ros_staging_secret`; `:68` `NEO4J_AUTH: neo4j/ros-staging`; `:107` same password embedded in the Airflow DSN.
- `docker-compose.e2e.yml` (worker service) mounts `/var/run/docker.sock:/var/run/docker.sock`.

**Impact:** Static, committed passwords in staging normalize secret-in-VCS practice and are reused across services. The `docker.sock` bind-mount in the e2e worker grants container-escape-to-host (host-root-equivalent) capability; if e2e ever runs untrusted PR code, this is an RCE-to-host vector.

**Fix:** Move staging secrets to env interpolation (`${...}`) like the base compose; never commit literals. Remove or tightly scope the `docker.sock` mount in e2e (rootless/DinD sidecar, or remove if unused).

### [HIGH] `docker-compose.staging.yml` runs a `privileged: true` container
**File:** `docker-compose.staging.yml:96` — the `kind` (Kubernetes-in-Docker) service is `privileged: true`.
**Impact:** Privileged containers disable most kernel isolation (full device access, can manipulate host). KinD legitimately needs it, but it means the staging stack must never run on a shared/multi-tenant host or alongside untrusted workloads. Combined with `localstack-pro:latest`, `cp-kafka:latest`, and `neo4j:5-enterprise`, this staging stack is not reproducible and elevates host risk.
**Fix:** Isolate the privileged KinD service to a dedicated CI runner; pin all staging image tags to digests; document the trust boundary.

---

## MEDIUM

### [MEDIUM] `:latest` / floating image tags throughout non-prod compose stacks
**Files:** `docker-compose.staging.yml:6` `localstack-pro:latest`, `:46`/`:57` `cp-kafka:latest`/`cp-zookeeper:latest`; `docker-compose.yml:166` `ghcr.io/berriai/litellm:main-latest`, `:179` `openpolicyagent/opa:latest`.
**Impact:** Non-reproducible builds; "works on my machine" drift; a poisoned upstream tag affects every `up`. Less severe than prod but still a reproducibility gap.
**Fix:** Pin to specific versions or digests across all compose files.

### [MEDIUM] Dockerfile base image not digest-pinned
**File:** `Dockerfile.optimized:3,20` — `FROM node:20-slim` (tag, not digest).
**Impact:** `node:20-slim` is a moving tag; two builds of the same commit can produce different base layers, undermining reproducibility and the audit trail for a regulated build. (The `apt-get install` of LibreOffice/ocrmypdf at `:26-35` is also unversioned, compounding drift.)
**Fix:** Pin `FROM node:20-slim@sha256:<digest>`. Optionally pin apt package versions for the Part 11 reproducibility story.

### [MEDIUM] Reference K8s manifest lacks `securityContext` / `runAsNonRoot` / `readOnlyRootFilesystem`
**File:** `infra/k8s/bff-with-predicate-shadow.yaml` — both containers (`:30`, `:74`) set resource requests/limits and liveness/readiness probes (good), but there is **no `securityContext`** at pod or container level: no `runAsNonRoot: true`, no `allowPrivilegeEscalation: false`, no `readOnlyRootFilesystem`, no dropped capabilities, no `seccompProfile`.
**Impact:** Containers may run as root inside the pod; no defense-in-depth against breakout. The file is labeled a "reference" (`:1-9`, "actual production manifests live in the deploy repository") — so the real manifests may differ, **but those production manifests are not in this repo and could not be audited.** That itself is a gap.
**Fix:** Add a hardened `securityContext` to the reference, and bring the real production manifests (or a verifiable pointer) into auditable scope.

### [MEDIUM] K8s manifest passes admin token via plaintext HTTP header literal in probes
**File:** `infra/k8s/bff-with-predicate-shadow.yaml:98-100,109-111` — liveness/readiness probes send `X-Admin-Token: "from-token-secret"` as a hardcoded `httpHeaders` value.
**Impact:** The literal is a placeholder, but the pattern bakes an admin token into the manifest rather than sourcing it from the mounted secret — if copied to prod verbatim, the health endpoint's admin auth is a known constant.
**Fix:** Don't authenticate probes with a static header; expose unauthenticated `/live` `/ready`, or inject the token from the secret via an `exec` probe.

### [MEDIUM] Secret values flow through Terraform state (Secrets Manager `secret_string` from variables)
**Files:** `terraform/modules/secrets/main.tf:12-17` (`secret_string = each.value.value`), fed by `terraform/environments/production/main.tf:59-68` (`jwt_secret`, `openai_api_key` from `var.*`).
**Impact:** Any secret passed as a Terraform variable is written into the state file. State is in S3 with KMS + versioning + public-access-block (`bootstrap/main.tf:38-53`) — good — but plaintext secrets still live in state and in any local `terraform.tfvars`. RDS correctly avoids this via `manage_master_user_password = true` (`rds/main.tf:21`); the app secrets do not.
**Fix:** Create the Secrets Manager *secrets* with Terraform but populate *values* out-of-band (CLI/console/CI) with `ignore_changes = [secret_string]`, or reference a pre-existing secret. Restrict state-bucket read access.

### [MEDIUM] ECS task role S3 policy is broad and shared across API + worker
**File:** `terraform/modules/ecs-fargate/main.tf:79-90` — a single task role grants `s3:GetObject/PutObject/ListBucket` on `var.s3_bucket_arns`, which (`production/main.tf:123-127`) includes the **Part 11 evidence bucket** and the frontend bucket `/*`.
**Impact:** A compromised API or worker task can read/write the evidence and frontend buckets. Object Lock prevents tampering with sealed evidence, but listing/reading regulated artifacts is broader than least-privilege.
**Fix:** Split task roles (API vs worker), scope S3 actions per bucket (write-only to evidence, drop unused read), and consider Object-Lock `s3:x-amz-object-lock-*` conditions.

### [MEDIUM] `terraform-compliance.yml` only plans `staging`; production plan never validated in CI
**File:** `.github/workflows/terraform-compliance.yml:32-37` — Checkov scans all of `terraform/` (good), but `terraform plan` runs only against `environments/staging`, and with `-backend=false` (no state → no drift detection). The production environment is never `validate`/`plan`-checked in CI.
**Impact:** Production IaC changes can merge without a successful plan; drift between staging and prod modules goes uncaught.
**Fix:** Add a production read-only `terraform plan` (state via OIDC) and a scheduled drift-detection job. Surface Checkov SARIF to the Security tab.

---

## LOW

### [LOW] Dev startup scripts print demo credentials and use `sslmode=disable`
**Files:** `start.sh:31,66-67`, `start-platform.sh:47,77-78` — `DATABASE_URL=...sslmode=disable`, and both echo `Login: jm.smith@concept2cure.pro / Password: demo123`. `start-platform.sh:32` hardcodes a Codespaces path (`/workspaces/Concept2Cure.RI-2-replit`).
**Impact:** Dev-only; the scripts correctly mint ephemeral JWT/SESSION secrets when unset (`start.sh:40-47`) — good hygiene — and prod uses `npm run start`, not these. But printed demo creds + `sslmode=disable` must never reach a shared environment.
**Fix:** Keep dev-only; remove the hardcoded path; ensure no deploy path invokes these.

### [LOW] `.env.example` ships weak placeholder secrets
**File:** `.env.example:116-118` — `SESSION_SECRET=your-secret-here`, `JWT_SECRET=your-jwt-secret-here-change-in-production`.
**Impact:** Server fails closed on *absent* JWT_SECRET (good, per `:115`), but a *present weak default* copied verbatim is not caught.
**Fix:** Add a startup assertion rejecting known placeholder values; document minimum entropy.

### [LOW] `app.yaml` (Google App Engine) appears to be a stale/unused deploy target
**File:** `app.yaml:1-18` — a GAE `nodejs20` config, while the real prod path is AWS ECS (Terraform + `deploy-aws.yml`).
**Impact:** Two conflicting deploy targets in-repo create ambiguity about the supported production platform; the GAE config is exercised by no CI and may rot.
**Fix:** Remove `app.yaml` or clearly mark it non-production.

### [LOW] `.replit` exposes ~18 internal ports and runs `npm run dev`
**File:** `.replit:2,14-77` (`run = "npm run dev"`, `5000→80`, etc.).
**Impact:** Replit-specific dev/preview surface; broad port exposure and dev-mode run command should not be confused with prod.
**Fix:** None required for GA; ensure Replit is not a customer-facing surface.

---

## What is done well (no action needed)

- **Dockerfile.optimized:** multi-stage build, non-root `appuser` (`:52,58`), `--omit=dev` prod deps, healthcheck (`:61`).
- **OIDC for AWS deploy** (`deploy-aws.yml:27-29,77-79`) — no long-lived AWS keys in CI; `permissions:` minimized; `concurrency` never cancels prod deploys (`:23-25`).
- **RDS** (`rds/main.tf`): `storage_encrypted`, KMS, Multi-AZ, 35-day backups, `deletion_protection`, `skip_final_snapshot=false`, pgaudit, Performance Insights, enhanced monitoring, AWS-managed master password. Strong Part 11 posture.
- **VPC** (`vpc-secure/main.tf`): private subnets for ECS/RDS, NAT egress, S3/KMS VPC endpoints, RDS SG restricted to workload SG only, `assign_public_ip=false` on tasks (`ecs-fargate/main.tf:219,250`).
- **ALB** (`alb/main.tf`): TLS1.3 policy, HTTP→HTTPS 301 redirect, conditional access logs, deletion protection.
- **ECS** deployment circuit breaker + rollback (`ecs-fargate/main.tf:228-231,254-257`), `min_healthy=100`/`max=200` for zero-downtime; healthcheck on API task (`:157-163`).
- **Terraform state** (`bootstrap/main.tf`): S3 + KMS + versioning + public-access-block + DynamoDB locking + `prevent_destroy`.
- **CI guardrails** (`ci.yml`): extensive regulated-data/tenant-isolation/RLS/SAML-fail-closed gates that ARE blocking; security-contract tests deliberately independent of lint (`ci.yml:126-132`); npm-audit with documented allowlist is blocking.
- **Compose base/beta:** resource limits + reservations, log rotation, healthchecks, `SEED_DEMO_USER=false` default, secrets via env interpolation.

---

## GA Verdict: **CONDITIONAL**

The cloud architecture is production-grade and compliance-aware. GA should be blocked only until the two BLOCKERs (immutable image pinning for prod ECS; SHA-pin all GitHub Actions, especially credentialed/`@master` ones) are closed, and the HIGH-severity gate-enforcement items (un-advisory the Trivy scans, route the full CI/SAST gate into the deploy path, fix `sslmode=prefer` for data-bearing compose envs, remove committed staging secrets + docker.sock mount) are remediated. None require re-architecture.
