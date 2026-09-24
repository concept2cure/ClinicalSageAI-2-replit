# D1: B1, B2, B3 and B5 — the production task definition can boot, 2026-09-24

> **Reconciled 2026-09-24** with a parallel implementation of the same lane
> (`docs/evidence/W2/2026-09-23b/README.md`, section "Reconciliation"). Two things
> recorded here no longer hold on trunk: the container health check probes `/healthz`,
> not `/readyz`, and `tests/boot_contract.tftest.hcl` is the merged suite. The vendored
> RDS bundle this lane added had been dropped by `.gitignore` and is now committed.


**Launch row:** D1 hosted production (`docs/LAUNCH_DEFINITION_OF_DONE.md`).
**Brief:** `docs/evidence/W2/2026-09-23/README.md`, items B1, B2, B3 and B5, in
the order the brief's "Order of work" section gives. The B9 session left
`environments/production` and `modules/ecs-fargate` to this lane.

**Offline proof only.** Terraform 1.9.8, `hashicorp/aws` 5.70.0 and
`hashicorp/random` 3.6.3, each downloaded from releases.hashicorp.com and
checked against HashiCorp's published SHA-256 sums. They were served from a
local filesystem mirror, because this environment's egress policy refuses
registry.terraform.io. The providers were mocked. No AWS credentials were used,
nothing was applied, and nothing was created.

## Before: the committed composition against the preflight's own list

`before-HEAD-against-preflight.txt` is a scratch copy of HEAD with one
read-only output added. It was rendered under the same mocks and compared with
the list in `.github/workflows/deploy-aws.yml`:

- The API task definition carried **3 of the 12** names the preflight
  requires: `DATABASE_URL`, `JWT_SECRET` and `CONCEPT2CURE_SIGNER_MODE`. It
  lacked `RLS_ENFORCE`, `APP_DATABASE_URL`, `REFRESH_TOKEN_SECRET`,
  `MFA_ENCRYPTION_KEY`, `AUDIT_HMAC_KEY`, `AUDIT_HMAC_SECRET`,
  `CONNECTOR_ENCRYPTION_KEY`, `AI_SENSITIVE_DATA_POLICY_MODE` and
  `AI_PROVIDER_PLACEMENT_APPROVALS`, and it had no `APP_URL`.
- `DATABASE_URL` was the RDS-managed master secret, which is JSON (B1).
- The database name was `concept2cure-ri` (B2).
- The health check was `wget -qO- http://localhost:5000/api/health` (B5).

## The change

| Item | Fix |
|---|---|
| **B1** | Terraform owns both database passwords (`random_password`, 40 alphanumeric characters, so no URL-encoding is needed). It composes `DATABASE_URL` for the owner role and `APP_DATABASE_URL` for `app_service`, each `postgresql://…/concept2cure_ri?sslmode=verify-full`, and stores both in Secrets Manager. `modules/rds` takes an optional `master_password`. When it is set, RDS no longer writes its JSON secret, and `master_user_secret_arn` is null. The brief's option (a): the app is unchanged. |
| **B2** | `concept2cure_ri`. `modules/rds` validates `database_name` against RDS's rule, so a hyphen now fails at plan instead of at `CreateDBInstance`. |
| **B3** | Every name the preflight requires is in the API task definition. Keys are root variables with no default, validated for length (≥ 32) and for the pairs that must differ (refresh ≠ JWT; audit key ≠ audit secret). `RLS_ENFORCE=on` and `AI_SENSITIVE_DATA_POLICY_MODE=enforce` are plain values. `APP_URL` is `https://` plus the CloudFront custom domain the production variables already require. `APP_SERVICE_DB_PASSWORD` rides in the API task, because the migrate task is derived from it and mints `app_service`. |
| **B4** | Not decided here. `ai_provider_placement_approvals` is a required variable with no default and no example value, validated as a JSON object. It is the founder's compliance decision. |
| **B5** | The image's own probe, `node -e` against `/readyz` (`Dockerfile.optimized` `HEALTHCHECK`). |
| **Worker (B7)** | Its `DATABASE_URL` was the same JSON secret and now uses the composed secret. Whether the worker exists at all is still the founder's decision. |

## The test, committed this time

`terraform/environments/production/tests/boot_contract.tftest.hcl` (moved to `terraform/stack/tests/` the same day by B8, `../2026-09-24-b8/`, where it also covers staging) has seven
runs, all passing (`after-boot-contract-test.txt`).

The required names are **read out of `deploy-aws.yml`** with a regex, so the
workflow stays the only list. If that script is reformatted, the regex errors
and the test fails, rather than passing against a stale copy. Refusals use
`expect_failures`, so they are green tests.

New workflow `.github/workflows/terraform-tests.yml`. It runs `terraform init
-backend=false`, `validate` and `test` on every push to `concept2cure-v2` that
touches `terraform/**` or `deploy-aws.yml`, for production and the two B9
module suites, and validates staging. Before it, no Terraform check ran in CI:
`terraform-compliance.yml` triggers only on pull requests, which this
repository does not use. The workflow has not been run from here. Its first run
on GitHub is its proof.

## Shown failing first

Each mutant reverts one fix in place, runs the suite, and restores the file:

| Mutant | Reverts | Failing run | File |
|---|---|---|---|
| M1 | `DATABASE_URL` back on the RDS JSON secret | `the_database_urls_are_urls_not_the_rds_json_secret` | `M1-B1-json-secret.txt` |
| M2 | `concept2cure-ri` | plan refused by the `database_name` validation | `M2-B2-hyphenated-name.txt` |
| M3 | `REFRESH_TOKEN_SECRET` dropped | the preflight-names run, with "Missing: REFRESH_TOKEN_SECRET" | `M3-B3-missing-secret.txt` |
| M4 | the `wget` health check | `the_health_check_is_the_images_own_probe_on_readyz` | `M4-B5-wget.txt` |
| M5 | the preflight gains `EXAMPLE_NEW_REQUIREMENT` | the preflight-names run, with "Missing: EXAMPLE_NEW_REQUIREMENT", which proves it reads the workflow | `M5-workflow-list-grows.txt` |

Also still green (`after-validate-and-module-tests.txt`): production and
staging `validate`, `modules/alb` 4/4, `modules/cloudfront` 8/8.

## Not done, and why

- **B4, B6, B7** are the founder's decisions, as the brief says. They are not
  defaulted.
- **B8** (staging compute): the brief orders it after 1–3 hold. They now hold
  offline.
- **B10** (`engine_version = "15.4"`): unverified until plan against a real
  account.
- **The first provision** is still a one-time `node scripts/db/install-fresh.mjs`
  against the new instance, out of band (`deploy-aws.yml` exit 3 says so).
- **Found while doing this, fixed the same day (`../2026-09-24-rds-ca/`): RDS TLS trust.** In production the app
  verifies the database certificate against Node's trust store
  (`server/db/ssl.ts`, `rejectUnauthorized: true`). The RDS CA is not a public
  root. Measured: AWS's published bundle
  (`truststore.pki.rds.amazonaws.com/global/global-bundle.pem`, 108
  certificates, including the us-east-1 RSA2048/RSA4096/ECC384 G1 roots) has
  none of its certificates in Node's built-in root store (by SHA-256
  fingerprint or subject). `scripts/db/connection.mjs` says to supply it through
  `NODE_EXTRA_CA_CERTS`. The image (`Dockerfile.optimized`) installs only
  Debian's `ca-certificates`, and the task definition sets no
  `NODE_EXTRA_CA_CERTS`. Unless the image gains the RDS bundle, the API will
  fail its first database connection with a certificate error. This is recorded
  as the next D1 item, not fixed here. It changes the image, and the bundle's
  provenance needs recording the way the DTD vendoring policy does.

## Reproduce

Install Terraform 1.9.8 and the two providers (a mirror works:
`provider_installation { filesystem_mirror { … } }`). Then:

    cd terraform/environments/production && terraform init -backend=false && terraform test
