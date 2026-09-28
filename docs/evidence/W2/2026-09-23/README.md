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

---

## Stability records: every change is audited in its own transaction (row D1, same workstream)

**Scope:** `server/src/routes/stability.router.ts` (mounted at `/api/stability`),
`scripts/ci/check-column-reachability.mjs`. Reference database `c2c_full`
(see the 2026-09-22 README for how it is built). The founder asked on
2026-09-23 for the follow-up recorded in the 2026-09-22 README: "about twenty
other stability handlers still audit after COMMIT".

**Why D1:** the row requires that the provisioned schema answers the server's
SQL and that governed records fail closed. The stability router is mounted in
production. Several of its routes failed on every deployed database, and most
of its writes were unaudited or audited after commit. No v2 client screen calls
it; the regulated user-facing path is `/api/cmc/stability-studies`. It is still
a live, authenticated API surface over GxP records.

### What was proved (real database, before → after)

| Claim | Evidence |
|---|---|
| **A failed audit left a committed, unaudited change; now it rolls the change back.** With the audit insert failing, the old router kept a condition edit, a result and a CAPA and wrote no audit record for any of them. The new router keeps none. | `stability-audit-failure-rolls-back.txt` |
| **Every mutating route now writes exactly one audit record in the change's transaction.** Old: condition add/delete, timepoint add, actual sampling date, test spec change, result edit and delete were never audited, and an **unsigned** edit and an unsigned result **persisted** before the 500. New: `audit+1` on every write, and unsigned writes are refused (401) before a connection is taken. | `stability-audited-writes.txt` |
| **Fabricated data is gone.** The excursion import ignored the file and stored two hard-coded readings (26.5, 28.2 °C); it now stores what the file says (31.5). The results import answered 200 "temporarily unavailable" with a transaction left open; it now imports, all or nothing. The sample barcode was 17 bytes of placeholder text served as `image/png`; it is now a real Code 128 PNG. `PATCH /capa/<unknown>` answered 200; now 404. | `stability-audited-writes.txt` |
| **Saves that could never succeed now work.** In-use and OOT-rule saves used `ON CONFLICT` targets no migration creates (42P10, 42704) and failed on every call. They now update or insert under the study lock. | `stability-audited-writes.txt` |
| **Linking a test to its method no longer wipes its specification.** The handler wrote all three fields from the body, so a method-only change set `spec_low` and `spec_high` to NULL. It now changes only the fields sent. | `stability-audited-writes.txt` ("patch test method only") |
| **Cross-tenant writes are refused.** Foreign keys bypass RLS, and child rows take the caller's tenant, so tenant 1 could file a CAPA, a condition and an audit record under tenant 2's study. A 200/500 split also revealed whether a UUID was a study anywhere. Every study-scoped write now loads the study with an explicit tenant predicate first (`ownStudy`). The answer is 404 either way, and nothing is written. | `stability-review-findings.txt` |
| **Protocol apply works, and applies whole or not at all.** Its timepoint insert used `$4` as both an integer and text (42P08), so every protocol with a timepoint failed after its conditions had already committed. The whole apply is now one transaction, and the audit record carries the applied content. | `stability-review-findings.txt` |
| **A condition delete records the results it destroys by cascade.** Before, the audit record held only the condition row. | `stability-review-findings.txt` |
| **Attribution comes from the signed-in principal only.** `collected_by` was taken from the body, so a sample could be recorded as collected by someone else. Now 400. | `stability-review-findings.txt` |
| **A model no longer writes governed label text.** `POST /ai/label` gave the model only the study id, not its data. It then wrote the answer into `label_storage`, which feeds P.8, as a JSON object; on failure it wrote the "unavailable" placeholder. It is retired (410). | `stability-review-findings.txt` |
| **The column guard missed columns added only by `_legacy` migrations.** Result review, the pending list and result-to-sample linking read or wrote five `stab_results` columns (`status`, `reviewed_by`, `reviewed_at`, `reject_reason`, `sample_id`) that only `db/migrations/_legacy/031` and `035` add. They failed with 42703 on every deployment, and nothing reported it, because the guard skipped `_legacy`. It now reads `_legacy` as never-applied. On the old router it names exactly those five columns; on this tree it is clean. Those four routes now return 501 and state that nothing was changed. | `ci:column-reachability`; contract test "knows a column added only by db/migrations/_legacy as never applied" |
| **An earlier test of mine proved nothing.** `stability-router-honesty.test.ts` mocked `'../../db'`, which from that folder is `server/src/db`, a path that does not exist. So "no connection was taken" held vacuously. The mock now targets `server/db`. Against the old router 12 of its 20 cases fail, every one added by this change; all 20 pass on this one. | `server/src/routes/__tests__/stability-router-honesty.test.ts` |

Merged with upstream `83849bfdd` (tenant-scoped result edit/delete, IAM-11) and
`2b65d6f7c` (bounded, byte-checked uploads, IAM-14). Both are kept: the result
handlers use upstream's tenant predicate and payload shape inside the one
transaction pattern, and both imports use upstream's upload guard. Upstream's
`stability-results-object-authz` and `stability-upload-guards` tests pass unchanged.

Removed, each with its replacement named at the site:
- `PATCH /tests/:id` was unreachable, because `PATCH /tests/:testId` matches first.
- `PATCH`/`DELETE /studies/results/:id` were second copies of `/results/:resultId`. The PATCH also reset `created_at` on every edit.
- `aiRecommendLabelStorage` is replaced by `simpleShelfLifeT90`.

The unkeyed-tables baseline loses `capa`, which was a false positive: the error
string "Failed to update CAPA" read as `UPDATE capa`.

### Second adversarial review (24 agents; each finding verified or refuted independently)

Every confirmed finding is fixed. `stability-second-review.txt` records each one on the reference database, upstream router against this change.

| Finding | Before → after |
|---|---|
| **The shelf-life estimate was a constant.** `GET /ai/t90` read no data; it returned 61.5 months, "high — supports a 24-month shelf life claim", for any id. My first draft of this change had pointed the retired label route at it. | Now `estimateShelfLife` (`server/services/cmc/shelf-life.ts`, the platform's one ICH Q1E engine) runs on the study's recorded results against the test's recorded limit. It proposes 24 m (crossing 28.35 m, capped by Q1E's extrapolation limit), or answers 422 with the reason. `simpleShelfLifeT90` is removed. |
| **Study create invented acceptance criteria.** Assay was set to 95–105 %, Water Content to NMT 5 %, every other unit to "Various", and CQA status by name. The audit record showed none of it. | Stores only what the request supplies; the audit record lists the tests with their limits, units and CQA status. |
| **The study list showed a constant `progress_percent` of 45 %, with last timepoint 0M and next 3M.** | Computed from the timepoints' actual sampling dates. |
| **P.8 push stored "Zone II", 24 months and "Store in a dry place at room temperature" when they were not recorded; refresh filled "IVb".** | These now read `[NOT RECORDED: …]`. The P.8 routes' 404 is no longer answered as a 500. |
| **OOT surveillance invented values.** It set a specification limit (mean ± 3 SD), investigator "System" and a closure date 30 days out. It ran relaxed thresholds (2.5σ, 1.5σ) labelled as Western Electric rules. The study-scoped route returned raw results. | Both routes now use the platform's regression-control-chart engine (`server/services/cmc/stability-trending.ts`) against the recorded criterion, and refuse with a reason when no criterion is recorded. The router's own copy is deleted. |
| **The AI routes gave the model only the study id, and turned a model failure into canned text answered 200.** | The model now gets the study's recorded rows and the deterministic assessments, with an instruction to state nothing else. A failure answers 502, "nothing was generated". Demo text still appears in development only, which is the gateway's own production guard. |
| **Records misstated what was written.** `result_update` recorded the requested change rather than the resulting row. `bulk_assign` listed skipped entries. `results_import` recorded only a count. | Each record now holds what the database wrote. |
| **Protocol apply invented and duplicated data.** Planned dates ran from the day of apply. A timepoint fell back to the first condition, filing a 40 °C pull under 25 °C. `on conflict do nothing` never fired (no unique keys), so a second apply duplicated rows. | Dates now run from the study's start date. An unknown condition is refused with 422 and rolls back. Rows the study already has are not written again, and the audit record holds exactly what was written. |
| **Protocol templates were not audited.** | Recorded in the platform audit trail (`logAuditEvent`) before commit. If that record does not persist, the template is not created. |
| **The excursion import stored in-limit readings as "MINOR" excursions and graded severity by an arbitrary 3-unit rule.** | Only out-of-limit readings are stored. Severity is left unclassified (a quality decision), and the deviation is recorded. |
| **The sparkline plotted missing values as 0, and called any change under 0.5, in any unit, "stable".** | Numeric values only. Change and direction are reported within one storage condition. |
| **Child-by-id writes relied on RLS alone.** PATCH/DELETE of conditions and timepoints, PATCH of tests, CAPAs and assignments, and chain-of-custody writes addressed rows by their own id. | `ownChild`: the row is located under the tenant, its study is locked through `ownStudy`, then the row is locked, so the tenant predicate is explicit and RLS is the second line. |
| **Regressions I introduced in the first pass.** A blank value was stored as `''` (NULL again now). `month: ""` and `hold_time_days: ""` caused 500s. An upper-case UUID gave 404. A blank `collected_by` was refused. CSV rows were misnumbered, and a `,,,` line failed the import. | Fixed. CSV errors now name the true line; blank and delimiter-only rows are skipped. Pass/fail words are read case-insensitively ("Pass", "P", "Conforms"), and an unknown word is refused rather than stored as NULL. |
| **Chain attachments.** The file was written before the sample was checked, and the client filename went into the path. (multer already strips directories, so this was a second line of defence, not an open traversal.) | Sample checked first. Name restricted to `[A-Za-z0-9._-]`. The file is removed if the record rolls back. |

Refuted, 6 findings: the verifiers showed them already fixed in the reviewed file, or not defects.

### Still open (founder decisions, not defects this change can close)

1. **Result review and sample linking.** Making them real needs the five
   columns on an applier (CMC schema work; CMC is outside RULE 2's launch
   catalog). An approval also needs the Part 11 signing path, not a status write.
2. **Two stability stores.** `/api/stability` (`stab_*`) and
   `/api/cmc/stability-studies` (`stability_studies`, the one the v2 UI uses)
   both exist. Zero-duplication says one should be migrated onto the other.
3. **Two OOT methods remain.** Surveillance uses the platform engine. `GET
   /studies/:id/oot/check` still applies the classic Western Electric rules a
   user configures in `stab_oot_rules`, correctly thresholded and labelled.
   Zero duplication says one should go; which one is a quality-method decision.
4. **Attachments go to local disk** (`/mnt/data/uploads`), which does not
   survive a container replacement. They belong in Vault.
5. **Calendar push is not atomic**, because external events cannot join a
   database transaction. Events that were created are now recorded, including
   when a later one fails (502, with the created ids).
