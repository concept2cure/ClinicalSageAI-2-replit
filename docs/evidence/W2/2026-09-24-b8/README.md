# D1: B8 — staging is production's composition, 2026-09-24

**Launch row:** D1 hosted production. Every row whose remaining evidence is "on
staging" depends on this: D2 (fresh-organisation screenshots), D3 (the
two-tenant contract against the production image), D4 (the staging OQ
execution) and D8 (the connector from a second machine).

**Brief item B8** (`../2026-09-23/README.md`): "staging has no compute or
database … give staging the same module composition as production, at smaller
sizes. It needs its own KMS key." B1–B3 and B5, which the brief orders before
it, landed earlier the same day (`../2026-09-24-b1-b5/`).

## One composition, two thin roots

Copying production's 250 lines into staging would have left two compositions
to drift apart, and the day they drift is the day staging stops proving
anything about production. The repo's working agreement also forbids it (zero
duplication). Nothing had been applied (D1 still owes the AWS account), so no
state has to move.

- `terraform/stack/` holds the one composition: networking, ECR, the composed
  database credentials, Secrets Manager, RDS, the ALB, ECS, the evidence
  bucket, CloudFront and the release-signing KMS key, with every input
  validation.
- `environments/production` and `environments/staging` are thin roots. Each
  owns its backend, its provider, its sizes and retention, and its secret
  values, and nothing else.
- **Production is unchanged in substance.** Every resource keeps the name it
  had: `c2c-production`, `c2c-prod-*`, `c2c/production/*` and
  `alias/fda-signing-key-2026`. The sizes, Multi-AZ, 35-day backups, deletion
  protection and seven-year COMPLIANCE evidence lock are unchanged.
- **Staging** is the same composition at smaller sizes and is disposable:
  single-AZ, 7-day backups, deletion allowed, and a 30-day GOVERNANCE evidence
  lock. It has its own names (`c2c-staging`, `c2c-stg-*`, `c2c/staging/*`),
  its own KMS key under `alias/fda-signing-key-2026-staging`, and no worker
  until B7 is decided. It runs the production posture: `NODE_ENV=production`,
  `RLS_ENFORCE=on`, and the full boot contract.

## Tests (`terraform/stack/tests/boot_contract.tftest.hcl`, 10 of 10, `green-stack-tests.txt`)

- The B1–B5 contract runs, as before, for production.
- **`staging_carries_every_name_the_deploy_preflight_requires`**: staging's
  task definition satisfies the same preflight list, read from
  `deploy-aws.yml`, with the same posture and database wiring.
- **`staging_is_distinct_from_production`**: every staging resource name
  carries "stg" or "staging", and staging signs under its own alias.
- **`production_names_are_the_ones_the_deploy_workflow_targets`**: the six
  names `deploy-aws.yml` hard-codes (`ECR_API_REPO`, `ECS_CLUSTER`,
  `ECS_API_SERVICE`, `ECS_API_TASK_FAMILY`, `ECS_API_CONTAINER_NAME`,
  `FRONTEND_BUCKET`) are each read out of the workflow and compared with what
  Terraform creates. A deploy into a name Terraform did not create would
  otherwise be found only by the deploy.

Production and staging both `validate`. B9's `modules/alb` (4/4) and
`modules/cloudfront` (8/8) still pass (`green-roots-and-modules.txt`).
`.github/workflows/terraform-tests.yml` now tests `terraform/stack` and
validates both environments on every push.

## Shown failing first

| Mutant | Failing run(s) |
|---|---|
| S1: production's cluster, service and family renamed (`c2c-production-v2`) | `production_names_are_the_ones_the_deploy_workflow_targets` |
| S2: staging signs under the production alias | `staging_is_distinct_from_production` |
| S3: staging's evidence bucket hard-coded to production's | `staging_is_distinct_from_production` |
| S4: `REFRESH_TOKEN_SECRET` dropped (B3) | the preflight-names run, for production **and** staging |
| S5: `DATABASE_URL` back on the RDS JSON secret (B1) | the URL run for production, and the staging contract run |

Each is one file in this directory. The fix was reverted in place, the suite
run, and the file restored.

## Not done

- **The deploy workflow still targets production only.** `deploy-aws.yml`
  hard-codes production's names. Deploying to staging needs the workflow
  parameterized by environment, or a staging copy, which is a separate change.
  The names test is what will keep that change honest.
- **Apply.** The founder applies each environment against the AWS account, then
  runs `install-fresh` once against each new database.
- **B4, B6, B7** are still the founder's decisions, and staging inherits them.
- **B10** (`15.4`) is unverified until plan against a real account. Staging
  pins the same engine version on purpose.
