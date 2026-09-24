# W2 / D1 — from Terraform to a task that can boot (2026-09-23 → 2026-09-24)

**Row:** D1 (hosted production). **Workstream:** W2. **Status: still blocked.**
D1's acceptance line needs a real AWS environment and a `/readyz` 200 from it.
Neither exists, and this session had no AWS account. This change removes every
blocker that can be removed and proven without one. It proves each fix red, then
green, on real PostgreSQL, a real `npm ci --omit=dev` tree, and a mocked
`terraform apply`. The rest are listed in order below, with what each needs.

Brief this continues: `docs/evidence/W2/2026-09-23/README.md` (B1–B10). Method:
an understand pass (5 readers plus a critic) and an adversarial review
(4 lenses, each finding refuted or reproduced). Every surviving finding is fixed
below, or listed as open with its reason.

## What was wrong, and what proves it is fixed

| # | Defect | Fix | Evidence (this folder) |
|---|---|---|---|
| B1 | `DATABASE_URL` was the RDS-managed secret, a JSON document, and the execution role could not read it anyway | Terraform owns both credentials (48 alphanumerics each) and composes `postgresql://…?sslmode=verify-full` URLs for the owner and for `app_service`, stored through `module.secrets`, so they fall inside the execution role's grant | `preflight-before.txt`, `proof-after.txt`, `terraform-test.txt`; the assertions are shown failing in `terraform-test-assertions-can-fail.txt` |
| B2 | `concept2cure-ri` is not a legal RDS DBName | `concept2cure_ri`, validated in `modules/rds` | `terraform-test.txt` |
| B3 | The task definition lacked 9 of the preflight's variables; `RLS_ENFORCE` and `APP_URL` were unset | One `boot_secrets` / `boot_environment` list, shared by API and worker (the migration task is cloned from the API one). New secrets have no default, with ≥32-character validations, `refresh ≠ jwt` and `audit seal key ≠ chain key` | Before: the pipeline's own preflight refuses (`preflight-before.txt`). After: it accepts (`proof-after.txt`) |
| B5 | The health check called `wget`, which the image lacks | `node` exec-form probe of **`/healthz`** (liveness), not `/readyz`. `/readyz` latches AnA at boot, and during a Multi-AZ failover it would get every task replaced. Grace period 120 s | `proof-after.txt` step 5 runs the check against a stub that routes by path: live-but-not-ready passes, `/healthz` 503 fails, a closed port fails |
| B11 *(new)* | Node's 144 bundled roots include no Amazon RDS CA, so `verify-full` could never connect | After reconciliation (below): the bundle is vendored at `assets/rds-ca/` (the parallel session's design), and `NODE_EXTRA_CA_CERTS` and `PGSSLROOTCERT` point at it; `rds.force_ssl=1`; `ca_cert_identifier` pinned. This change also committed the bundle, which `.gitignore` had dropped | `rds-ca-bundle.txt` (the bundle's facts); `rds-ca-vendored-bundle-missing.txt`; `tests/schema-contract/rds-ca-bundle.contract.test.ts`. `proof-must-fail.txt` covers the build-time fetch this change first used, which has since been replaced |
| B12 *(new)* | **The production image could not load its own bundle.** `server/vite.ts` imported `vite` at top level; the bundle keeps packages external; the image installs `--omit=dev`. Every container exited `ERR_MODULE_NOT_FOUND` before any app code ran. No job saw it, because every job that boots `dist/` has devDependencies installed | `vite` is imported inside `setupVite()` and loads its own config, so the dev path leaves the bundle entirely. New gate `ci:server-bundle-prod-imports` (+ `:selftest`), run in `production-boot-smoke` **and** in the Dockerfile's builder stage | `image-boot-vite-before.txt` (the gate red, the boot on a real `--omit=dev` tree dies on `vite`), `image-boot-vite-after.txt` (it gets through every import-time gate to the database connect; the gate is green; the dev server still works) |
| B13 *(new)* | Minting `app_service` as the RDS master failed every time: `ALTER ROLE … NOSUPERUSER` is refused to a non-superuser, and `080_gcc` has always created the role by then | Superuser-only attributes are named only when the connecting role is a superuser. The result is read back, and a role the connecting user cannot make safe is **refused** | `alter-role-rds-master.txt`, on a real RDS-shaped (CREATEROLE, non-superuser) owner |
| B14 *(new)* | The app_service password went to CloudWatch in plaintext: `log_statement=ddl` logs `ALTER ROLE … PASSWORD '…'` | A SCRAM-SHA-256 verifier computed client-side, so the plaintext never reaches the server | `scram-verifier.txt`: plaintext sent → red; the verifier equals PostgreSQL's own computation byte for byte; RFC 7677 known answer |
| B15 *(new)* | A crash exited 0, so ECS recorded a failed boot as a clean stop | `gracefulShutdown(…, exitCode)`; `uncaughtException` exits 1 | `image-boot-vite-after.txt` §3 and §7 |
| B16 *(new)* | Sign-in would 403 on any domain outside a hard-coded list: `csrfProtection` compares `Origin` to `ALLOWED_ORIGINS`, which was not set | `APP_URL` and `ALLOWED_ORIGINS` are both `https://<first domain alias>`: one input, so they cannot disagree with the domain browsers use. Each alias is validated to be a lowercase hostname, since `Origin` is compared by string equality | `terraform-test-must-fail.txt` (recorded against the earlier `app_url` form; the alias rules have their own must-fail runs in `terraform-test.txt`) |
| B17 *(new)* | `AI_PROVIDER_PLACEMENT_APPROVALS` passed Terraform but crash-looped every task | The variable validation mirrors the app's parser and its contradiction rule | `placement-approvals-oracle.txt`: the app's own parser agrees on all 8 test values |
| review | The preflight checked one revision and `deploy-api` rolled whatever was latest at its start | The preflight publishes the ARN it checked; `migrate` and `deploy-api` derive from that ARN; `deploy-api` refuses if the family moved | `revision-pinning.txt`, with 3 mutations, each caught |
| review | Service-before-listener race on a first apply | `depends_on = [module.alb]` on `module "ecs"` | `terraform-apply-ordering.txt` (graph with the edge and without it) |
| review | The worker's `ignore_changes` pinned it to its first revision for good, because no pipeline deploys it | Removed for the worker; kept for the API | `terraform-test.txt` |
| review | The proof's `sslmode` check was a regex that a comment satisfied, and the mock gave every secret one ARN | Assertions now run on rendered values, secret ARNs are distinct, and there are value-level checks on both URLs and for secret leakage into `environment` | `terraform-test-assertions-can-fail.txt` |

Also: `deploy-aws.yml`'s preflight moved into `migrate`, ahead of the production
DDL. Both ECS services ignore Terraform's `task_definition`, because the pipeline
owns the API revision. The Docker `HEALTHCHECK` comment was corrected: ECS never
reads it. `package.json` regained `db:provision`, which `25a793e0f` had dropped
four minutes after it was added. `.github/workflows/terraform-tests.yml`
runs the Terraform tests and the proof on every push that touches these paths.

How to re-run: `cd terraform/environments/production && terraform init -backend=false && terraform test`, then
`node scripts/ops/terraform-preflight-proof.mjs --no-init`, and
`node scripts/build-server.mjs && npm run ci:server-bundle-prod-imports`.

## Reconciliation with a parallel implementation (2026-09-24)

Session `…01AiwZKG` built B1–B3, B5 and the RDS CA without a lane claim, and
pushed `752a09ab1` and `63fbf452f` while this change was unpushed. The two
versions were nearly identical in the modules, and zero duplication means one
had to go. The merge (`docs/evidence/W2/2026-09-24-b1-b5/` is the other record):

| Question | Kept | Why |
|---|---|---|
| Container health check | `/healthz` (this change) | Theirs probed `/readyz`. A readiness probe makes ECS replace tasks it cannot heal: AnA's verdict latches at boot, and a Multi-AZ failover would replace every task at once |
| `APP_URL` | Theirs: from `domain_aliases[0]` | One input rather than a second variable plus a rule tying them together. `ALLOWED_ORIGINS` now derives from it too |
| `APP_SERVICE_DB_PASSWORD` | Theirs: on the API task, so the migrate clone re-aligns `app_service` every deploy | The API never mints, and `APP_DATABASE_URL` already holds the password, so it adds no exposure. The mint is now safe on RDS (B13) and sends no plaintext (B14). Never on the worker, never a plain variable (asserted) |
| Required-names list | Theirs: `terraform test` reads it from `deploy-aws.yml` | A single source. The proof's drift check was deleted |
| RDS CA | Theirs: vendored under `assets/rds-ca/` | No network at build time, and it follows the repo's vendoring policy. Their `.pem` had never been committed (`.gitignore`), and this change commits it. Their contract test gained "tracked by git" and `PGSSLROOTCERT` cases, and the proof's CA step was deleted |
| CI workflow | Theirs: `terraform-tests.yml` (production, alb, cloudfront, staging) | It gained the preflight proof as a job, plus concurrency. `terraform-boot-contract.yml` was deleted |
| Everything else in this table above | This change | Theirs had no counterpart |

## Still between this and D1, in order

Each item names the files it touches and says whether it is verified or inferred.

1. **First provision of the empty RDS database has no path** (verified). RDS
   accepts only the ECS tasks' security group. The image has neither `psql` nor
   `drizzle-kit`. `migrate` exits 3 on an empty database, and its remedy text
   ("run install-fresh from a checkout") cannot reach a private instance.
   Proposed: a `provision` target in `Dockerfile.optimized` (FROM builder, plus
   `postgresql-client`, plus the RDS bundle with both CA variables re-declared).
   Run it from a `workflow_dispatch` job as a one-off task on the API service's
   network configuration, with `DATABASE_OWNER_URL` = the `database_url` secret
   and `APP_SERVICE_DB_PASSWORD` = the `app_service_db_password` secret (both
   already in the execution role's grant), and a hard deadline. **Next in this lane.**
2. **Deploy OIDC role and the CloudFront distribution id** are not in Terraform
   (inferred). `AWS_DEPLOY_ROLE_ARN` is a repository secret that nothing creates.
3. **Trivy config gate** in `deploy-aws.yml` blocks on HIGH/CRITICAL IaC findings
   that `.trivyignore` does not cover (inferred: nobody has run it on this tree).
   Run it, then fix each finding or record it with a reason.
4. **compliance-evidence module apply errors** (inferred). The CMK has no policy
   for CloudTrail or Logs, there is no bucket policy, the SSE names an alias
   nothing creates, and the names are hard-coded `ros-staging-*`. The ECS boot is
   not blocked, but the apply log would not be clean.
5. **First-apply order**: an empty account needs the ECS service-linked role;
   create the services at `desired_count 0` until an image exists. `engine_version
   "15.4"` must be confirmed creatable, and `startPeriod` measured on a cold
   Fargate boot (inferred).
6. **Lock file platforms**: the committed `.terraform.lock.hcl` has hashes for
   linux_amd64 and darwin only (from the local mirror). This session's egress
   refuses `registry.terraform.io`. With registry access, run
   `terraform providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_amd64 -platform=darwin_arm64 -platform=windows_amd64`.
7. **Known exposures, recorded rather than designed:**
   - The API task carries the owner credential. `ensureCoreTables` runs DDL on
     it at every boot, and `server/routes/tenants-simple.ts` serves routes through
     a `postgres.js` client on it, outside RLS. That is a second DB client (zero
     duplication) and a tenant-isolation question for D3's owner.
   - `NODE_EXTRA_CA_CERTS` adds all 108 RDS roots to every outbound TLS call.
     Narrowing it to the region's bundle, or passing `sslrootcert` in the URL,
     needs every DB client verified first (`postgres.js` included). Not done.
   - `AI_GATEWAY_DETERMINISTIC=true` is not refused in production, and `/readyz`
     counts it as serving.
   - FDA ESG SFTP cannot transmit from the image: `ssh2-sftp-client` is not a
     dependency, and absence is refused with `NOTHING_TRANSMITTED`. For the D7 lane.
   - Nothing in the deploy asks `/readyz`. The smoke test probes `/api/health`
     (B9's lane, `…01GSjEDJ`, is changing that).

## Founder decisions (not defaulted)

| Decision | Options | Recommendation |
|---|---|---|
| **B4 — AI provider and placement** | OpenAI only, fail-closed approvals · Anthropic under a BAA (D6; needs `ANTHROPIC_API_KEY` wired) · Bedrock via the task role (AWS BAA) | Boot D1 on the fail-closed value `{"openai":{"region":"global","zeroRetentionApproved":false,"approvedDataClasses":[],"approvedIntendedUses":[]}}`. It boots, and no PII or PHI leaves. The test run `accepts_the_fail_closed_interim_approvals` accepts it, and so does the app's parser. Keys must be gateway provider names, with region `global` for openai and anthropic, or every sensitive dispatch is denied. Decide the PHI-capable provider under D6. |
| **B6 + B7 — Redis and the worker** (one question) | ElastiCache, TLS, private subnets · no Redis, and amend D1 to accept `skipped` | `/readyz`'s `worker` is the API's in-process Bull queue, not the ECS worker service, so Redis alone decides `worker: ok`. Choose ElastiCache: two API tasks need a shared rate-limit and queue store. It needs one code fix first: Bull ignores `rediss://`. **Delete the ECS worker service and its ECR repo either way.** It has no entrypoint, so with the full boot contract it would run a second API with duplicate schedulers. |
| **Entry topology** (with B9) | DNS → ALB directly · keep CloudFront (origin cert, prefix list, origin header, `TRUST_PROXY_HOPS=2`, SPA fallback) | B9's lane owns this. Either way the founder supplies the domain and ACM certificate, and `app_url` must be that exact origin. |
| **Audit trail on first boot** | `AUDIT_TRAIL_ENABLED=true` + `AUDIT_REQUIRE_ENFORCE=true` from day one · defer | Enable both, and add them to `boot_environment` and the preflight. Not set here, because it is a Part 11 posture decision. |
| **Document storage** | S3 (`STORAGE_PROVIDER=s3`, private, versioned, KMS) · local disk | S3 before any customer upload. Local disk is ephemeral, and the 2 tasks do not share it. |
| **D1 "ok" semantics** | Status 200 as today · strict: `schemaState` and `anaState` `ready`, not deterministic | Strict. |

Also owed by the founder, as before: the AWS account, DNS/ACM, secret values,
and the `terraform apply` whose log and readiness JSON go here.
