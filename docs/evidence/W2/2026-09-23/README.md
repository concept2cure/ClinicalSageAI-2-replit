# W2 / D1 — what the Terraform actually does, and the brief for the next session (2026-09-23)

**Row:** D1 (hosted production). **Workstream:** W2.
**Summary:** the D1 row says "code side done 2026-09-21". That is true of the
application: `npm run db:provision` is proven on an empty database, and the
image carries the PDF/A toolchain. **It was not true of the Terraform.** Until
this date `terraform validate` had never run. The 2026-09-20 evidence says so:
"`terraform` is not installed so even `terraform validate`/`fmt` could not run".
Once it did run, the production environment did not validate. With that fixed,
the configuration still cannot produce a task that boots. This folder records
what was verified and hands D1's infrastructure work to a W2 session as an
ordered brief.

## Verified here (Terraform 1.9.8, hashicorp/aws 5.70.0 from a local provider mirror; no AWS credentials)

| File | Shows |
|---|---|
| `terraform-validate-production-before.txt` | At `b6d7a7d7b~1`: **Error: Invalid for_each argument** in `modules/secrets` (it iterated a sensitive map). Production could not even be planned. |
| `terraform-validate-production-after.txt` | After `b6d7a7d7b`: `Success! The configuration is valid.` |
| `terraform-validate-staging.txt` | Staging validates, but it holds only a VPC and the evidence bucket (B8). |

"Valid" means the configuration is well-formed. It does not mean an `apply`
would succeed, or that the task it creates would boot. B1–B10 below are the
reasons it would not.

## Done on 2026-09-23 (`b6d7a7d7b`)

- **Production release signing is `kms`** (decision recorded in SOP-SEC-001 §2a, v0.3).
  `terraform/environments/production/release_signing.tf` defines:
  - the key: RSA_4096, SIGN_VERIFY, multi-Region, alias `alias/fda-signing-key-2026`;
  - the key policy: account principals may administer the key and may Verify
    and read the public key, but the administration statement grants no
    `kms:Sign`; only the ECS task role may Sign.

  The API and worker task definitions carry the signer variables.
- **The secrets module iterates secret names, not the sensitive map.** That is
  the validate fix above.
- **The ECS module takes `api_environment` / `worker_environment`**, plain
  variables appended to the task definition.

## The brief: what stands between this Terraform and D1's acceptance line

D1's acceptance line: one AWS environment from
`terraform/environments/production`, image promoted by `deploy-aws.yml`, and
`/readyz` 200 with schema, ana, redis and worker all `ok`.

Each item states the defect, the file, why it fails, the proposed fix and who
decides. **Verified** means read in the code or reproduced here. **Unverified**
means it is an inference to confirm at plan or apply time.

### B1 — `DATABASE_URL` is a JSON credential, not a URL (verified)
- **Where:** `environments/production/main.tf`, in both `api_secrets` and
  `worker_secrets`: `DATABASE_URL = module.rds.master_user_secret_arn`.
- **Why it fails:** `modules/rds` sets `manage_master_user_password = true`.
  RDS then stores the master secret as JSON (`{"username":…,"password":…}`),
  and ECS injects that JSON string verbatim as `DATABASE_URL`. The app reads
  `DATABASE_URL` as a connection string (`server/startup/env.ts`), so it cannot
  connect.
- **Fix, in either shape:**
  - (a) Terraform owns the credentials. Set
    `manage_master_user_password = false` and use a `random_password`. Store
    composed `postgresql://…@${module.rds.address}:5432/<db>?sslmode=verify-full`
    URLs as Secrets Manager secrets for both roles.
  - (b) Keep the AWS-managed master and add app support for `PG*` component
    variables.

  (a) keeps the app unchanged. **Decider:** W2 session. Record it in the SOP.

### B2 — `database_name = "concept2cure-ri"` is not a legal RDS name (verified in code; AWS rule to confirm at plan)
- **Where:** `environments/production/main.tf`, in the `module "rds"` block.
- **Why it fails:** RDS for PostgreSQL `DBName` allows letters, digits and
  underscores, starting with a letter. The hyphen fails `CreateDBInstance`.
  `validate` does not check this.
- **Fix:** `concept2cure_ri`, and every URL built in B1 uses the same name.

### B3 — the task definition lacks what the deploy preflight requires (verified)
- **Where:** `modules/ecs-fargate/main.tf` together with the production
  `api_secrets`.
- **Why it fails:** `deploy-aws.yml`'s preflight refuses a task definition
  missing any of these (it would also fail at boot):
  - `RLS_ENFORCE`, which must be exactly `on`;
  - `APP_DATABASE_URL`, the non-superuser `app_service` role;
  - `REFRESH_TOKEN_SECRET` (≥32 characters, different from `JWT_SECRET`);
  - `MFA_ENCRYPTION_KEY`, `AUDIT_HMAC_KEY`, `AUDIT_HMAC_SECRET`,
    `CONNECTOR_ENCRYPTION_KEY`;
  - `AI_SENSITIVE_DATA_POLICY_MODE`, `AI_PROVIDER_PLACEMENT_APPROVALS`
    (see B4).

  Production Terraform today provides only `DATABASE_URL` (broken, B1),
  `JWT_SECRET` and `OPENAI_API_KEY`.
- **Fix:**
  - Add each key to `module "secrets"` as a sensitive root variable with **no
    default**, so apply stops until the founder supplies it. Generate the
    values as in SOP-SEC-001 §4.
  - Put `RLS_ENFORCE=on` in `api_environment` / `worker_environment`.
  - `APP_DATABASE_URL` is the B1 composed secret for `app_service`.
  - The migrate task, which `deploy-aws.yml` derives from the API task
    definition, also needs `APP_SERVICE_DB_PASSWORD`, so the installer mints
    the role as `LOGIN NOSUPERUSER NOBYPASSRLS`. **Unverified:** confirm that
    `db:migrate:deploy` creates the role on a fresh RDS, as
    `scripts/db/provision-test-db.sh` does locally through install-fresh.

### B4 — which AI provider may see which data classes is the founder's decision (verified requirement)
- `AI_PROVIDER_PLACEMENT_APPROVALS` declares, per provider:
  - region and zero-retention status;
  - the approved data classes, including `pii` and `phi`;
  - the approved intended uses.

  `AI_SENSITIVE_DATA_POLICY_MODE=enforce` makes that declaration binding.
- These are compliance decisions (BAA status, D6), not engineering defaults.
- **Fix:** make both required root variables with **no default**. Record the
  founder's values and date in the evidence.
- `OPENAI_API_KEY` is the only provider secret wired today. Whether production
  uses it, Anthropic (BAA owed under D6), or both is part of the same decision.

### B5 — the ECS health check calls `wget`, which the image does not have (verified)
- **Where:** `modules/ecs-fargate/main.tf`, the API `healthCheck`, which runs
  `wget -qO- http://localhost:${port}/api/health`.
- **Why it fails:** the image (`Dockerfile.optimized`, `node:22-slim`) installs
  `curl`, not `wget`. The check therefore always fails, so every task is
  unhealthy and the service circuit breaker rolls the deploy back.
- **Fix:** use the image's own probe, which is `node -e` against `/readyz`
  (`Dockerfile.optimized` `HEALTHCHECK`), on `var.api_container_port`. A
  health check against `/readyz` also makes ECS agree with D1's acceptance
  line.

### B6 — no Redis exists, but D1's acceptance line requires `redis: ok` (verified)
- Nothing under `terraform/` creates ElastiCache.
- With `REDIS_URL` unset, readiness reports `redis: "skipped"`
  (`server/startup/inline-endpoints.ts`), so the acceptance line cannot be met.
- **Decider: founder.** Either add ElastiCache (TLS, in the private subnets) or
  amend D1's line to accept `skipped`, with the consequence stated (rate
  limits and caches become per-instance).

### B7 — Terraform declares a worker with nothing to run (verified)
- `terraform/` declares a `c2c-production-worker` ECS service and a `worker`
  ECR repository.
- `deploy-aws.yml` says (TODO(infra)) that no worker image or entrypoint
  exists; the old Celery worker was deleted on 2026-08-13 (D9).
- D1's acceptance line wants `worker: ok`.
- **Decider: founder.** Either land a real worker entrypoint, or remove the
  service and ECR repository from Terraform and amend the line.

### B8 — staging has no compute or database (verified)
- `environments/staging` is a VPC plus the evidence bucket.
- The staging evidence D2 and D3 still owe (fresh-organisation screenshots, the
  two-tenant contract against the production image) needs a staging ECS
  service and RDS.
- **Fix:** give staging the same module composition as production, at smaller
  sizes. It needs its own KMS key: the same `release_signing.tf` with a staging
  alias.

### B9 — the ALB accepts traffic from the internet on 80 and 443 (verified; also open under D6)
- **Where:** `modules/alb/main.tf`, ingress rules with `cidr_blocks = ["0.0.0.0/0"]`.
- **Why it matters:** CloudFront fronts the ALB, so anyone who reaches the ALB
  directly bypasses whatever CloudFront enforces.
- **Fix:** allow only the CloudFront origin-facing managed prefix list and add
  an origin secret header. Plan this together with the client-IP single source
  (`ci:client-ip-single-source`, F-24).

### B10 — pinned RDS minor `engine_version = "15.4"` (unverified)
- Old minors are retired from RDS on a schedule. Confirm "15.4" is still
  creatable in `us-east-1` at plan time.
- Otherwise pin a supported 15.x (or 16.x, matching the CI images: pgvector
  pg15 in `ci.yml`, PostgreSQL 16 locally), set
  `auto_minor_version_upgrade`, and record the choice.

## Order of work for the W2 session

1. **B1 + B2 + B3** in one change. Proof: `terraform validate`, and a
   `terraform plan` whose rendered API task definition names every preflight
   variable. Run the preflight's own `jq` query against the plan JSON.
2. **B5.** Proof: the plan shows the health check on `/readyz`.
3. Put **B4, B6 and B7** to the founder as three explicit decisions, each with
   a recommended option. Do not default any of them.
4. **B8** once 1–3 hold. **B9** alongside D6.
5. Founder: AWS account, pipeline IAM role, DNS, secret values,
   `terraform apply`. File the apply log and the readiness JSON here, as D1's
   evidence column requires.

The founder runs `terraform apply` from the steps above. This session did not,
and had no credentials to.

## Follow-up (2026-09-24)

B1–B3 and B5 are fixed in `docs/evidence/W2/2026-09-23b/`. Two corrections to
this brief: B5's fix is `/healthz`, not `/readyz` (readiness in a container
check replaces tasks it cannot heal); and B7's premise is wrong — `/readyz`'s
`worker` is the API's in-process queue, so Redis (B6) decides it. The updated
ordered list and founder decisions are in that folder's README.
