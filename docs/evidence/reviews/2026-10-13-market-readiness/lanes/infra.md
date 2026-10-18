## Lane: Infra, CI/CD, operations

### Readiness score: 3.5/10
The design is well above average: one Terraform composition, OIDC-scoped deploy roles, deploys pinned to an image digest, database migration as a one-off ECS task, a boot contract enforced both at plan time and in the deploy preflight, and CloudFront as the only way to reach the ALB. None of it has been proven in AWS:
- `deploy-aws.yml` and `provision-database.yml` have **0 runs, ever** (GitHub API).
- Terraform has only been tested with mocks.
- CI on `concept2cure-v2` has been **red for about 500 consecutive runs** since 2026-09-23 08:36 UTC.
- The state bucket name is already taken.
- There are no alarms, no autoscaling, no staging promotion path, no DR proof against RDS, and schedulers run twice (once per replica).

A first `terraform apply` + deploy would hit several hard blockers (listed below).

### What is genuinely strong (keep)
- **One Terraform composition.** `terraform/stack/*` with thin env roots (`environments/{production,staging}/main.tf`). Plan-time validations mirror the app's boot refusals (`stack/variables.tf:151-298`, `stack/main.tf:143-154`). `terraform-tests.yml` runs `terraform test` (mocked) for alb, cloudfront, compliance-evidence, github-deploy-roles and stack, plus `validate` for both envs and a preflight proof against the rendered task definition. All green 2026-09-28 (run 36453995713).
- **GitHub OIDC with no stored keys, split into two roles** (`modules/github-deploy-roles/main.tf:62-129`):
  - The deploy role is trusted only for `environment:production`.
  - The build role can only push to ECR.
  - RunTask is limited to the migrate/provision families; PassRole is limited to ecs-tasks.
- **Deploy pipeline shape** (`deploy-aws.yml`):
  - Image pinned by digest; the preflight checks the boot contract by name and value, and refuses `*_ACCEPT_*` overrides and deterministic-AI flags.
  - Migrate runs as a one-off Fargate task from the checked revision before the service rolls.
  - Task-definition ARN race check; circuit breaker with rollback; smoke test hits `/readyz` through CloudFront.
  - `deploy-migrate.mjs` holds `pg_advisory_lock` and a `lock_timeout` (`scripts/db/deploy-migrate.mjs:335-365`).
- **Edge:**
  - The ALB admits only CloudFront's prefix list plus an origin-secret header, TLS 1.3 policy, no :80 listener, `drop_invalid_header_fields` (`modules/alb/main.tf:23-85,117-142`).
  - CloudFront has an SPA security-headers policy, and the SPA-routes function is scoped to the S3 behaviour only (`modules/cloudfront/main.tf:92-147`).
- **Crypto and records:**
  - Customer-managed KMS keys for state, evidence and vault; the vault key policy denies human decrypt.
  - RDS encrypted, `rds.force_ssl=1`, `sslmode=verify-full` with a pinned CA (`modules/rds/main.tf:58,77-80`).
  - Evidence bucket Object Lock COMPLIANCE 7y; multi-region CloudTrail with log validation, a CMK and CloudWatch delivery (`modules/compliance-evidence/main.tf`).
  - Asymmetric KMS release-signing key; the task role is the only signer (`stack/release_signing.tf`).
- **App runtime:**
  - Fail-closed production refusals (`server/startup/env.ts:33-102`, signer, storage, RLS, audit, AI-placement postures).
  - Liveness and readiness are cleanly separated: `/healthz` for ECS, `/readyz` for the smoke test (reasoning at `modules/ecs-fargate/main.tf:161-188`).
  - `keepAliveTimeout` 65s is above the ALB idle timeout (`server/index.ts:247`).
  - Graceful drain (`server/startup/shutdown.ts`).
  - pino JSON logs with redaction plus a console bridge; `x-request-id` (`server/src/mw/observability.ts:83`); Sentry `beforeSend` scrubber, fail-closed (`server/utils/sentry.ts`).
  - Operator metrics endpoints are behind platform-admin or token auth (`server/startup/operator-endpoints.ts`).
- **Dockerfile:**
  - Multi-stage, non-root `appuser`.
  - veraPDF download is SHA-256 verified, and a build-time PDF/A round-trip proof runs (`Dockerfile.optimized:87-105`).
  - Bundle production-import check (`:24`); RDS CA bundle.
- **CI hygiene:**
  - All actions pinned to commit SHAs.
  - gitleaks over full history; blocking Trivy fs+config scans; CodeQL; SBOM; dependency-risk ledger.
  - Many gates carry selftests.
  - The CI boot smoke boots `dist/index.js` with `NODE_ENV=production`, RLS on, as a non-superuser role (reached `/readyz`=200 in 6s on the last green run, 35838048262).

### Workflow table
Statuses are for `concept2cure-v2` as of 2026-09-29.

| Workflow | Trigger | Blocking? | Latest on concept2cure-v2 | Notes |
|---|---|---|---|---|
| ci.yml | push all branches, PR, merge_group, nightly | Nothing blocks landing (direct push, no required checks evident) | **FAILURE.** ~500 runs since 09-23 09:00, **0 green**. Last green 2026-09-23T08:36 (35838048262) | HEAD 454c3ad3: Lint fails 4 guardrails (proof tier, audit_logs fixtures, org path params, requestDb adoption). Test fails 4 files / 5 tests (e.g. `tests/routes/export-governance-fail-closed.test.ts`, `haq-correction.journey`). This **skips Build, Prod Boot Smoke, Blank-DB, Integration, Release-evidence**. No `concurrency` cancel. Last green critical path ≈ 50 min; ~110 runner-min per push. Nightly strict job exits 1 by design (`ci.yml:2186-2208`). |
| deploy-aws.yml | `v*` tag, dispatch | Gates prod | **Never run (0 runs)** | Its `test` job (`npm run lint`, `npm test`, `:101-104`) would fail today. No staging stage. |
| provision-database.yml | dispatch | – | **Never run** | Needed once before the first deploy |
| terraform-tests.yml | push on terraform/** | – | success 2026-09-28 | Mocked tests plus validate |
| terraform-compliance.yml (Checkov) | PR only | – | 0 runs on branch; last any-branch run 2026-06-15 failed | **Dormant under Rule 0 (no PRs)** |
| database-dr-restore-proof.yml | weekly, paths | – | success 2026-09-28 | pg_dump/restore of a **fixture schema** in a CI container, not RDS |
| tier5-browser-smoke.yml | push/PR | – | success (HEAD) | Real install-fresh plus e2e smoke |
| codeql.yml | push/PR/weekly | – | success | |
| semgrep.yml | push/PR/weekly | **continue-on-error** | success | Advisory only |
| c2c-agent.yml | push/PR/weekly | – | success | Repeats CI's typecheck and ESLint (~6 min per push) |
| repo-health-baseline-refresh.yml | push | – | success | **Commits a refreshed baseline to the canonical branch after every push** (`:64-65`), so any regression that lands becomes the new baseline |
| cerv2-staging-deploy.yml | dispatch / `rc-*` (docker/Vercel) | – | never run | Dead |
| ci-staging-integration.yml | dispatch (LocalStack) | – | last 2026-07-29 failure; never green | Dead |
| neon-provisioning.yml | weekly | – | failure, 0/6 green | Dead (Neon is not the target DB) |
| neon-preview-db, pr-checks, danger, db-schema-validation, ops-audit-plan, test-assembly | PR only | – | dormant (last runs on branch 2026-03 or earlier) | 0 open PRs; Rule 0 makes them unreachable |
| prune-agent-branches.yml | dispatch/path | – | 1 run, success 08-17 | |
| release-evidence.yml | workflow_call | – | only reached when CI is green | |

**ci:\* scripts cross-reference** (script at `scratchpad/infra/xref.py`):
- 234 `ci:*` scripts; 156 are referenced by some workflow or `.husky/pre-push` (25 by pre-push).
- **78 are referenced nowhere.** 70 of those are `:list`, `:strict`, `:write`, `:selftest` or baseline variants.
- 8 base gates are orphaned: `ci:ui-kits`, `ci:dead-audit-tables`, `ci:duplicate-exported-types`, `ci:reg-reference-single-copy`, `ci:report-branch-drift`, `ci:tenant-isolation`, `ci:tenant-isolation-justifications`, `ci:route-ownership-matrix`. Variants of the last three run.

**Pre-push:** about 28 node gates plus lint of changed files plus an incremental typecheck ("~45 s warm … ~5 min" per `.husky/pre-push:575-583`), so roughly **2–7 min per push**. It runs **no tests**, which is why red code lands. The evidence that CI is being ignored is ~100 pushes/day continuing through 500 red runs.

**End-to-end path:** commit → CI (advisory) → `v*` tag → deploy-aws rebuilds from source → migrate → prod → smoke.
- Missing: a staging stage, promotion of the CI-tested artifact, automated rollback on smoke failure, and a frontend/API ordering guarantee.
- Manual approval depends on protection rules on the GitHub `production` environment (UNVERIFIED; the API refused the environments query).

### First-deploy blocker list (in order)
1. **Founder inputs:**
   - AWS account(s) and topology (staging and prod in separate accounts?).
   - Region.
   - Domain plus DNS control.
   - Two ACM certificates covering the alias: one for the ALB (regional) and one for CloudFront (us-east-1).
   - SMTP provider: SES production access plus DKIM/SPF. Port 465 is enforced.
   - `OPENAI_API_KEY` (only OpenAI is wired; see OPS-11).
   - The `AI_PROVIDER_PLACEMENT_APPROVALS` JSON.
   - Budget.
2. **Rename the state bucket.** `c2c-terraform-state` already exists (S3 returns `AccessDenied` with `x-amz-bucket-region: eu-west-1`), while both backends point to it in us-east-1 (`environments/*/main.tf:19-23`, `bootstrap/variables.tf`). Suffix every global bucket name with the account ID (`stack/main.tf:9-10`, `vault_storage.tf:29`).
3. Apply the bootstrap.
4. **Fix the RDS version.** `rds_engine_version = "15.4"` (`environments/production/main.tf:55`) is a 2023 minor release, very likely no longer creatable on RDS (UNVERIFIED), and a pinned minor fights auto-minor-upgrade. Use a major-only `"16"` or `"17"`, gp3, and an explicit `auto_minor_version_upgrade`.
5. Set `worker_desired_count = 0`, or delete the worker service and ECR repo (no image or command exists; OPS-08).
6. Make CI green. The deploy's `test` job runs the same `npm test` and `npm run lint`.
7. Build `Dockerfile.optimized` in CI at least once. **No workflow has ever built it.** Add `workers/artifact-compute` and `python3-docx` (OPS-09).
8. `terraform apply` production with a placeholder `image_tag`. The API service will fail until the first deploy; that is expected.
   - If the account already has a GitHub OIDC provider, set `create_github_oidc_provider=false`.
9. Point DNS for the alias at CloudFront.
10. Set the repo secrets `AWS_DEPLOY_ROLE_ARN`, `AWS_BUILD_ROLE_ARN` and `CLOUDFRONT_DISTRIBUTION_ID` from the outputs. Create the GitHub environment `production` with required reviewers and a tag/branch policy.
11. Run `provision-database.yml`.
12. Dispatch `deploy-aws.yml`.
13. Run `npm run pilot:verify-otp` against a real inbox.
14. Add the missing launch config: `MCP_ENABLED` (+`MCP_PUBLIC_URL`), `ECTD_REQUIRE_PDFA=true`, `SENTRY_DSN` (OPS-11).

### Findings

**OPS-01 · P0 · Never applied, never deployed**
- Evidence: GitHub API shows `deploy-aws.yml` total_count=0 and `provision-database.yml` 0. Terraform tests use a mocked provider (comments at `stack/main.tf:251-256`). The only tag is `v1.0.0`.
- Impact: every AWS-side assumption is untested. A customer date cannot be committed.
- Fix: stand up staging end to end (WO-2 to WO-4) and file the apply and deploy logs.
- Effort: L. Dependencies: OPS-02, 03, 04, 08, 09.

**OPS-02 · P0 · Canonical branch permanently red; nothing gates landing**
- Evidence:
  - About 500 of 500 CI runs failed since 2026-09-23 09:00.
  - September 1–23: 5 green out of the 300 runs sampled.
  - The HEAD failures are listed above.
  - The Build, Boot-Smoke and Release-evidence jobs are skipped because of `needs`.
- Impact: release impossible today (deploy re-runs `npm test`). "Validated state" cannot be claimed for GxP.
- Fix: fix the 5 tests and 4 guardrails. Freeze tags unless the CI check for that SHA is green. Add `concurrency: cancel-in-progress` for non-canonical refs. Stop the bot baseline refresh (OPS-18).
- Effort: M.

**OPS-03 · P0 · Terraform state bucket name is taken**
- Evidence: `curl https://c2c-terraform-state.s3.amazonaws.com/` returns `AccessDenied`, region eu-west-1. The other planned names currently return `NoSuchBucket`.
- Impact: bootstrap fails; or, if the bucket is the founder's, the backend fails on the region mismatch.
- Fix: account-suffixed names in bootstrap vars and both backends.
- Effort: S.

**OPS-04 · P0 (UNVERIFIED availability) · RDS PostgreSQL 15.4 pinned**
- Evidence: `environments/{production,staging}/main.tf:55`; `modules/rds/variables.tf:8`. No `auto_minor_version_upgrade` or `storage_type` (gp2 default).
- Impact: `CreateDBInstance` likely fails with "Cannot find version 15.4"; later, drift or downgrade errors after automatic minor upgrades.
- Fix: `engine_version="16"` (major only), gp3, a param-group family from the major, `copy_tags_to_snapshot`, `iam_database_authentication_enabled`.
- Effort: S.

**OPS-05 · P0 · Public repository with credentials still marked live in git history**
- Evidence: GitHub API reports `visibility: public`. `.gitleaksignore` has 4 `# status: live` entries (HF token, an HS256 token, auth creds). The CI step itself warns (`ci.yml:2138-2144`).
- Impact: live credentials are world-readable. The full infra, security gates and internal docs are public, which regulated buyers' security questionnaires will flag.
- Fix: rotate all 4 now. Founder decision on making the repo private (note the CI cost in the cost section).
- Effort: S.

**OPS-06 · P1 · No monitoring or alerting in AWS**
- Evidence:
  - Zero `aws_cloudwatch_metric_alarm`, `aws_sns_topic` or dashboards in `terraform/`.
  - `SENTRY_DSN`, `OTEL_*`, `METRICS_TOKEN` are not set in the task definition (grep of `terraform/` finds none). The app only *warns* when `SENTRY_DSN` or `REDIS_URL` is missing (`server/startup/env.ts:104-110`).
  - Prometheus rules exist (`infra/alerts/*.yml`) but no Prometheus is deployed. `/api/metrics` is per task behind round-robin.
  - No on-call rota, status page or incident/rollback/DR runbook (`docs/runbooks/` has 8 files, none about operations).
- Impact: outages and failed Part 11 sweeps go unseen; SLA commitments are impossible.
- Fix:
  - Alarms: ALB 5xx and target health, ECS running < desired, RDS CPU/storage/connections/replica lag, CloudFront 5xx, log metric filters on `FATAL|CRITICAL`, job heartbeat staleness via EMF → SNS → email/pager.
  - Wire `SENTRY_DSN`.
  - Optional ADOT sidecar.
  - Write the runbooks.
- Effort: M.

**OPS-07 · P1 · In-process schedulers duplicated on every API replica (no leader election)**
- Evidence:
  - Every job starts in the `listen` callback (`server/index.ts:254-291`); `api_desired_count=2`.
  - No advisory lock or leader code in `server/jobs/*`; the only advisory locks are in the credit ledger and audit chain.
  - Retention sweep defaults ON in production (`retentionCron.ts:348`) and hard/soft-deletes with audit rows.
  - External intelligence defaults ON (`externalIntelligenceSweep.ts:33`).
  - Schedule-of-events opens recovery tasks and alerts; task-due notifies; the chain monitor runs every 5 min; the security-health scheduler also runs.
- Impact: duplicate dispositions and audit entries (a Part 11 trail that is confusing to explain), duplicate notifications, doubled external/LLM spend.
- Fix: wrap each job in `pg_try_advisory_lock(job_key)`, or run a single scheduler task (see OPS-08) with `DISABLE_SCHEDULERS=true` on the API.
- Effort: M.

**OPS-08 · P1 · Phantom worker service**
- Evidence: `modules/ecs-fargate/main.tf:196-230,282-306` defines a worker with no `command` and `worker_desired_count = 1` in the prod example. `deploy-aws.yml:34-67` says no worker image exists.
- Impact: a permanently failing ECS service (noise, false alarms). If anyone pushes the API image to the worker repo, a second copy of the API starts with every scheduler running.
- Fix: remove it, or repurpose it as the scheduler singleton (OPS-07).
- Effort: S.

**OPS-09 · P1 · Production image missing the Python DOCX runtime**
- Evidence:
  - `scriptWorker.ts:56,139,188` resolves `workers/artifact-compute/*.py` from `cwd`; `Dockerfile.optimized:114-157` never copies `workers/`.
  - The runtimes `import docx` (python-docx), which the image does not install. CI does install it ("Install document runtime (python-docx + lxml)").
  - The callers are AnA DOCX insert, XML-surgery and script tools (`AnaToolExecutor.ts:7244,7333,7418,7541`).
- Impact: Authoring edits made through AnA fail only in production, and CI cannot see it.
- Fix: `COPY --from=builder /app/workers ./workers`, `apt install python3-docx python3-lxml`, and a build-time smoke of each runtime.
- Effort: S.

**OPS-10 · P1 · No staging stage; the deployed artifact is not the tested one**
- Evidence:
  - `deploy-aws.yml` hard-codes production names (`:29-78`). The staging Terraform root exists but no workflow targets it.
  - Deploy rebuilds from source and does not require the CI run for that SHA (the boot smoke, integration, e2e and release-evidence gates are all skipped by the deploy path).
- Impact: the first real run of every release is in production. Weak CSV/GxP traceability.
- Fix: parameterize by environment. `rc-*` tag → build once → staging → smoke → approval → promote the same digest to prod. Require the green `Release evidence gate` check on the SHA.
- Effort: L.

**OPS-11 · P1 · Launch-scope config missing from IaC**
- Evidence:
  - `MCP_ENABLED` is absent from `terraform/`, and the router mounts only when it is `'true'` (`server/index.ts:120`), so **the remote MCP connector (launch catalog) is off in AWS** even though CloudFront routes `/mcp`.
  - `ECTD_REQUIRE_PDFA` is absent, so PDF/A enforcement is opt-in (`pdfa-readiness.ts:123`).
  - `REDIS_URL` and `SENTRY_DSN` are absent.
  - Only `OPENAI_API_KEY` is provided; no `ANTHROPIC_API_KEY`, and boot warns about it (`env.ts:112`).
- Impact: launch features are silently absent; submission packages can go out without PDF/A.
- Fix: add them to `boot_environment` and the preflight list. Founder decides the AI providers.
- Effort: S.

**OPS-12 · P1 · Network single points of failure and dead endpoints**
- Evidence (`modules/vpc-secure/main.tf`):
  - One NAT gateway, in `public[0]` (`:57-67`).
  - The S3 gateway endpoint has no `route_table_ids` (`:85-89`), so it does nothing.
  - The KMS interface endpoint has private DNS off (provider default) and its SG has no ingress (`:91-110`), so it is unused but billed.
  - No ECR, Secrets Manager, Logs or STS endpoints.
- Impact: losing AZ-a stops image pulls, secret fetches, SMTP and AI calls in both AZs. S3 vault traffic pays NAT data charges.
- Fix: one NAT per AZ, S3 gateway endpoint associated with the private route table, drop or fix the KMS endpoint, and optionally add ECR/Secrets Manager/Logs endpoints.
- Effort: S.

**OPS-13 · P1 · Sizing and scaling**
- Evidence:
  - No `aws_appautoscaling_*`.
  - The API is 1 vCPU / 2 GB and runs Node plus LibreOffice, a JRE (veraPDF) and ocrmypdf/tesseract/ghostscript in the same task (`Dockerfile.optimized:64-76`).
  - Staging is 0.5 vCPU / 1 GB.
  - No `NODE_OPTIONS`; no converter concurrency limit (UNVERIFIED).
- Impact: OOM kills under concurrent conversions take down live sessions; no burst capacity.
- Fix: 2 vCPU / 4 GB; target tracking on CPU and ALB request count (min 2, max 6); cap the converter semaphore; set `stopTimeout` and `initProcessEnabled`.
- Effort: M.

**OPS-14 · P1 · Disaster recovery unproven**
- Evidence:
  - The DR workflow dumps and restores a `dr_proof.*` fixture (`scripts/ops/dr-restore-drill.sh`), not RDS.
  - No AWS Backup, no cross-region snapshot copy, no vault S3 replication or object lock.
  - The signing key is `multi_region = true`, but no replica exists (`release_signing.tf:192`).
  - No RPO/RTO statement or DR runbook.
  - The vault key cannot be decrypted by humans by design, so restore needs a documented break-glass key-policy change.
- Impact: buyers' DR questionnaire items cannot be answered; one region is a single point of failure.
- Fix: AWS Backup plan with vault lock plus a cross-region copy; S3 CRR for vault and evidence; a staging PITR restore drill with timings; RPO/RTO document; KMS break-glass SOP.
- Effort: L.

**OPS-15 · P1 · SOC 2 account baseline absent**
- Evidence: zero GuardDuty, Security Hub, Config, VPC flow logs, ALB access logs (`access_logs_bucket` default `""`), CloudFront/S3 logging, WAF (explicitly deferred at `modules/cloudfront/main.tf:149-156`) or budgets.
- Impact: evidence gaps for SOC 2 CC6/CC7; weak security questionnaire answers.
- Fix: add them, with WAF in count mode first because of the body-size rules.
- Effort: M.

**OPS-16 · P1 · API task holds the RDS master credential**
- Evidence: `DATABASE_URL` = `c2c_admin` master URL in `boot_secrets` (`stack/main.tf:43-51,199`). `APP_SERVICE_DB_PASSWORD` is in the API task (`:295-297`). Boot runs DDL (`ensureCoreTables` / `ensureAuthTables`).
- Impact: an RCE in the web tier gets a DB owner that bypasses RLS.
- Fix: give owner credentials only to the migrate/provision task definitions (built from a separate family). Move boot DDL into migrations.
- Effort: M.

**OPS-17 · P1 (UNVERIFIED durations) · Proxy timeouts**
- Evidence: the CloudFront custom origin has no `origin_read_timeout` (default 30s) (`modules/cloudfront/main.tf:172-189`); ALB idle timeout is the default 60s. There are 13 SSE producers; only `ana-ri/stream.ts` sends heartbeats.
- Impact: long exports, conversions and deep-research calls return 504.
- Fix: `origin_read_timeout = 60` (raise the quota for more), set ALB `idle_timeout`, heartbeat every SSE stream, and move long jobs to async.
- Effort: S.

**OPS-18 · P1 · Pre-land gating is structurally absent**
- Evidence:
  - Rule 0 means no PRs, so 11 PR-only workflows are dormant, including Checkov (`terraform-compliance.yml`).
  - Pre-push runs no tests.
  - The bot auto-refreshes the repo-health baseline after every push (`repo-health-baseline-refresh.yml:64-65`).
  - The nightly strict job is designed to fail.
- Impact: gates exist but do not stop regressions (OPS-02 is the result).
- Fix (founder decision): a GitHub merge queue or a ruleset with required checks on `concept2cure-v2`, or a fast test subset in pre-push. Move Checkov and schema validation to `push`. Remove the auto-refresh.
- Effort: M.

**OPS-19 · P2 · Image hygiene**
- Evidence (`Dockerfile.optimized`):
  - `node:22-slim` is not digest-pinned (`:3,48`); apt packages are unpinned.
  - `chown -R /app` after `npm ci` duplicates the node_modules layer (`:175`).
  - Copies 149 MB of `server/` source, including 75 MB of `server/scripts/data` (`:117`).
  - `CMD npm run start` with no init process to reap soffice/gs/java children.
  - No `BUILD_COMMIT` build-arg while `.git` is dockerignored, so `/api/version` reports "unknown" (`server/buildStamp.ts`).
  - Estimated image 2–3.5 GB (UNVERIFIED), which slows Fargate cold starts.
- Fix: digest-pin the base; `COPY --chown`; copy only the runtime assets; `CMD ["node","dist/index.js"]` plus `initProcessEnabled`; `--build-arg BUILD_COMMIT`; OCI labels; Trivy image scan; attach the SBOM.
- Effort: S–M.

**OPS-20 · P2 · Redis not provisioned**
- Evidence: no ElastiCache in Terraform.
  - Rate limits are in-memory per task (`redisRateLimiter.ts:100`).
  - Bull scheduled automation is disabled (`scheduled-jobs.ts:268-272`); the AI action queue is in-memory.
  - socket.io has no Redis adapter (`socketServer.ts:232`).
  - Hocuspocus has no Redis extension and the ALB has no stickiness, so turning on `ENABLE_COLLAB_CRDT` with more than one task splits the document and loses edits.
  - Account lockout is DB-backed, which is fine.
- Fix: ElastiCache t4g.micro Multi-AZ, or formally declare in-memory mode and keep collab off.
- Effort: S–M.

**OPS-21 · P2 · Frontend release coupling**
- Evidence: `deploy-frontend` needs only `[test, security-gate]` (`deploy-aws.yml:711-713`), so it publishes in parallel with, and regardless of, migrate and API deploy. The S3 frontend bucket is unversioned and synced with `--delete`. The SPA is also served by the image with a nonce CSP, while the S3 copy has no `script-src` (duplicate delivery path).
- Fix: frontend `needs: deploy-api`; version the bucket; pick one SPA path.
- Effort: S.

**OPS-22 · P2 · Public `/readyz` is expensive and chatty**
- Evidence: mounted before rate limiting (`server/index.ts:113`). Each hit runs a DB query plus an S3 `isAvailable` call (`store-readiness.ts`) and returns dependency and schema detail on failure.
- Fix: cache the result for 5–10s and return details only with the token.
- Effort: S.

**OPS-23 · P2 · Rollback and migration duration**
- Evidence: no rollback job or runbook. The smoke test fails without reverting. Every migration re-runs on every deploy (CLAUDE.md Rule 1), with 582 files across two trees.
- Fix: a `rollback` dispatch input that updates the service to the previous task definition; track migrate duration.
- Effort: S.

**OPS-24 · P2 · Deployment-target sprawl**
- The canonical path is `Dockerfile.optimized` → ECR → ECS/Fargate via `terraform/stack` and `deploy-aws.yml`.
- Recommend deleting:
  - `charts/` (2 charts), `helm/`, `infra/k8s/`
  - `app.yaml` (GAE) and the `.replit` `[deployment]` block
  - `docker-compose.staging.yml` (localstack-pro, kafka, neo4j, kind, airflow) and `cerv2-staging-deploy.yml` (Vercel)
  - `ci-staging-integration.yml`, `neon-provisioning.yml`, `neon-preview-db.yml` and the Neon step in `c2c-agent.yml`
  - `deploy/localai` (outside Rule 2 scope)
- Trim `docker-compose.yml` extras: tika, grobid, opensearch, temporal, `litellm:main-latest`, `opa:latest`.
- Effort: S.

**OPS-25 · P2 · CI weight and latency**
- Evidence: ~80–100 CI runs/day; ~110 runner-min per ci.yml run plus other workflows, about 150 per push; last-green job durations: Lint 12.7m, Test 29m, Coverage 34.5m. No cancel. c2c-agent duplicates typecheck and ESLint. 78 orphaned scripts.
- Fix: concurrency cancel, drop the duplicates, path filters.
- Effort: S.

**OPS-26 · P2 · Terraform hygiene**
- Provider constraints `>= 5.0` are unbounded; staging has no `.terraform.lock.hcl`; the prod lock records `~> 5.70` while config says `>= 5.0`.
- `dynamodb_table` backend argument is deprecated in newer Terraform (use `use_lockfile`).
- Task-role S3 grant puts object actions on the bucket ARN, so it is dead (`ecs-fargate/main.tf:79-90`).
- RDS SG is described as "EKS workloads"; VPC names are `ros-part11-*`.
- Fixed `final_snapshot_identifier`.
- The ECR lifecycle never expires `sha-*` and `provision-*` tags.
- Secrets use the default 30-day recovery window (staging recreate conflicts).
- No rotation plan for the CloudFront origin secret.
- `us-east-1` is hard-coded 19 times.
- Effort: S.

**OPS-27 · P2 · pgaudit is inert**
- Evidence: `pgaudit.log` is set (`modules/rds/main.tf:97-101`), but `shared_preload_libraries` does not include pgaudit and no `CREATE EXTENSION pgaudit` appears in migrations.
- Impact: Part 11 tags imply DB write auditing that does not happen.
- Fix: preload the library plus create the extension, or remove the parameter.
- Effort: S.

**OPS-28 · P2 · Test routes can be mounted in production**
- Evidence: `ENABLE_TEST_ROUTES=true` mounts test routes in production (`server/startup/env.ts:133-134`). It is not in `refuseForbiddenProductionPosture` or the deploy preflight.
- Fix: refuse it at boot and in the preflight.
- Effort: S.

**OPS-29 · P3 · Metrics token comparison**
- Evidence: `METRICS_TOKEN` is compared with `===` (`operator-endpoints.ts:31`).
- Fix: `timingSafeEqual`.
- Effort: S.

**OPS-30 · P3 · Performance Insights deprecation**
- Performance Insights is being superseded by CloudWatch Database Insights; plan the move.

### Cost (us-east-1, on-demand, order of magnitude)
**Production as defined: about $370–450/month**
| Item | Monthly |
|---|---|
| RDS t3.medium Multi-AZ + 50 GB gp2 | ~$120 |
| Fargate API 2×(1 vCPU/2 GB) | ~$72 |
| NAT | $33 + data ≈ $40–50 |
| ALB | ~$22 |
| KMS interface endpoint (unused) | ~$15 |
| CloudWatch (Container Insights, logs, CloudTrail→CWL) | ~$25–50 |
| CloudFront | ~$5–15 |
| Secrets Manager | ~$5 |
| KMS keys | ~$5 |
| S3 / ECR | <$15 |

- **Staging:** about $150–180/month.
- **Hardened** (second NAT, WAF, GuardDuty/Config/Security Hub, 2 vCPU/4 GB tasks, ElastiCache, AWS Backup cross-region): **about $0.9–1.2k/month for both environments.** LLM API spend dominates beyond that.
- **Waste:**
  - Unused KMS endpoint.
  - Unrouted S3 endpoint (causes NAT charges).
  - Phantom worker.
  - Duplicated external-intelligence and LLM sweeps (OPS-07).
- **CI cost if the repo goes private:** at the current ~12k runner-min/day, roughly **$2.5–3k/month** at $0.008/min. OPS-25 matters if the repo goes private.

### Recommended work orders
1. **WO-1 Green and gated branch.**
   - Goal: CI green on HEAD and kept green.
   - Scope: fix the 5 tests and 4 guardrails; stop `repo-health-baseline-refresh` auto-commits; add a concurrency cancel; tags allowed only when the `Release evidence gate` check is green; founder decides on merge queue or ruleset.
   - Acceptance: 20 consecutive green CI runs on `concept2cure-v2`; a deliberately failing test blocks tagging (shown failing).
   - Effort: M.
2. **WO-2 First-apply-ready Terraform.**
   - Scope: OPS-03, 04, 08, 12, 26, 27; account-suffixed buckets; per-AZ NAT; S3 endpoint route association; staging lock file; bounded providers.
   - Acceptance: a real `terraform apply` of staging in a fresh account succeeds and the apply log is filed; a second plan shows 0 changes.
   - Effort: M. Depends on founder inputs.
3. **WO-3 Correct production image, built in CI.**
   - Scope: OPS-09, 19; build `--target production` on every canonical push (no push to ECR); smoke each Python runtime, `soffice` and `verapdf` inside the image; Trivy image scan; `BUILD_COMMIT`.
   - Acceptance: CI job builds the image and `docker run` passes a DOCX-insert fixture; `/api/version` shows the SHA.
   - Effort: M.
4. **WO-4 Staging → prod promotion pipeline.**
   - Scope: OPS-10, 21, 23; environment-parameterized deploy; build once, promote the same digest; environment reviewers; rollback input.
   - Acceptance: an `rc-*` tag deploys to staging with `/readyz` green; approving promotes the identical digest to prod; the rollback input restores the previous task definition in under 10 min.
   - Effort: L. Depends on WO-2, WO-3.
5. **WO-5 Scheduler singleton.**
   - Scope: OPS-07 (with OPS-08).
   - Acceptance: with 3 API tasks, each sweep runs exactly once per tick (test using two processes against one DB); the retention audit shows one row per disposition.
   - Effort: M.
6. **WO-6 Observability baseline.**
   - Scope: OPS-06, 22, 29; alarms plus SNS; Sentry; job-staleness EMF; dashboard; status page; on-call; incident and rollback runbooks.
   - Acceptance: killing a staging task and blocking the DB SG each page within 5 min.
   - Effort: M.
7. **WO-7 DR program.**
   - Scope: OPS-14.
   - Acceptance: a staging RDS PITR restore plus vault object restore with measured RPO/RTO, documented and repeated quarterly.
   - Effort: L.
8. **WO-8 SOC 2 AWS baseline.**
   - Scope: OPS-15, 16, 28.
   - Acceptance: Security Hub CIS/FSBP score filed; the API task definition carries no owner or master credential.
   - Effort: M.
9. **WO-9 Launch configuration and secrets.**
   - Scope: OPS-05, 11, 17; rotate the 4 live credentials; add the MCP, PDF/A and Sentry configuration.
   - Acceptance: MCP OAuth handshake from Claude against staging succeeds; a non-PDF/A package is refused.
   - Effort: S.
10. **WO-10 Delete deployment sprawl.**
    - Scope: OPS-24, 25.
    - Acceptance: only one deploy path remains; the workflow count drops by at least 7.
    - Effort: S.
11. **WO-11 Right-size and autoscale.**
    - Scope: OPS-13, 20 (Redis decision).
    - Acceptance: a load test of 20 concurrent conversions has no OOM, and autoscaling adds a task.
    - Effort: M.

### Open questions / needs from the founder
- AWS account(s) and organization; separate staging and prod accounts?
- Region and data residency. Is the existing `c2c-terraform-state` bucket in **eu-west-1** yours?
- Production domain, DNS provider, and who issues the ACM certificates.
- SMTP provider (SES production access) and the sending domain.
- AI providers allowed in production (only OpenAI is wired; does PQ require Claude?) and the placement-approvals JSON.
- Should the repository be public? Rotating the 4 live credentials needs the founder's action.
- Who are the required reviewers on the `production` environment? Tag protection?
- Merge queue or required checks under Rule 0.
- WAF budget and posture.
- Redis yes or no.
- Collaborative editing (CRDT) and the MCP connector in scope for launch?
- RPO/RTO targets, backup retention and cross-region requirement.
- On-call person or rota, status page, support SLA.
- Monthly infrastructure budget ceiling (the estimate is about $1k/month hardened for both environments, plus LLM spend).
