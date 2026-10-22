# MR-03 Stage 4: a staging target, build once, promote by digest, roll back on failure

Launch row **D1**. Work order
[`MR-03`](../../../work-orders/MR-03-first-deploy-staging-to-production.md),
Stage 4 (OPS-10, OPS-21, OPS-23). Branch `concept2cure-v2`. Session
`…session_01GSjEDJLuZsEzPa9PnVg1yF` (lane W2/D1).

| Slice | What | State |
|---|---|---|
| A | OPS-21: the frontend bucket versions; one SPA delivery path on the hosted deployment, pinned | done |
| B | OPS-23: roll back on a failed smoke test; a `rollback_taskdef` dispatch; the migration's duration recorded | next |
| C | OPS-10: target resolution, per-environment settings, build once on staging, promote the staging-verified digest to production | open |

## Re-confirmed at head before starting

At `31c2f1c2c`:

- **OPS-10 is open.** `deploy-aws.yml` runs on `v*` tags and dispatch, for
  production only. `build-push` builds the image on every production deploy,
  so there is no staging stage and no promotion. Nothing rolls back
  automatically.
- **OPS-21 is open.**
  - The frontend bucket (`terraform/modules/cloudfront`, `aws_s3_bucket.frontend`)
    has no versioning.
  - `deploy-frontend` rebuilds the bundle with `npm run build`, beside the copy
    inside the image (`/app/dist/public`).
  - `deploy-frontend` already waits for `deploy-api`.
- **OPS-23 is open.** `deploy-api` deploys by task-definition ARN and its
  comments describe a rollback. There is no rollback job, no
  `rollback_taskdef` input, and no record of how long the migration took.

## What already exists (Rule 3)

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| The deploy | `.github/workflows/deploy-aws.yml` | Gates on CI, Semgrep and CodeQL for the SHA (`ci-verdict`). Builds, scans with Trivy and pushes a digest-pinned image. Preflights both task definitions and pins their ARNs. Migrates through a one-off task, rolls the API by revision ARN, publishes the frontend and smoke-tests `/readyz` through CloudFront | Target staging; build once and promote; roll back; record the migration's duration |
| A staging deploy | `.github/workflows/cerv2-staging-deploy.yml` | **Not at head.** The work order's step 9 asked to delete it; it is already gone (this clone's shallow history does not reach the deletion) | — |
| The staging stack | `terraform/environments/staging`, `terraform/stack` with `environment = "staging"` | Names every resource apart from production (`c2c-stg-api`, `c2c-staging`, `c2c-staging-api`, `c2c-staging-migrate`). Its own deploy role trusts `environment:staging` | Receive a deploy: nothing targets it |
| GitHub roles | `terraform/modules/github-deploy-roles` | A deploy role trusted by the GitHub environment, and a build role trusted outside it (`v*` tags, the branch) | Admit `rc-*` tags. Let production read the staging repository |
| Image repository | `terraform/modules/ecr` | Immutable tags, a lifecycle policy | Grant another account read access |
| SPA delivery | `terraform/modules/cloudfront` (default behaviour → `s3-frontend`; the API paths → `alb-api`), `server/startup/frontend.ts` (`serveStatic` in production) | On the hosted deployment CloudFront serves the SPA from the bucket, and only API paths reach the ALB, which admits CloudFront alone. The server serves the image's copy, which is a self-hosted install's only delivery path | Version the bucket |
| Rollback by revision | `deploy-api`'s comments | Name `update-service` to a prior revision as the rollback | Do it |
| Workflow simulator | `tests/ci/workflow-harness.ts`, `workflow-expression.ts` | Evaluate job and step conditions as the runner does | Give a job's outputs to the conditions that read them |

## Slice A: one SPA delivery path, and a publish that can be reverted

**What changed.** `terraform/modules/cloudfront`:

- `aws_s3_bucket_versioning.frontend`: enabled.
- A lifecycle rule keeps previous versions for 90 days, then expires them, and
  clears incomplete multipart uploads after 7 days.
- Two runs in `tests/alb_origin.tftest.hcl`:
  - `the_spa_is_served_from_the_bucket_alone`: the default behaviour is the
    bucket, and every ALB behaviour is a path the server answers as an API;
  - `a_bad_publish_can_be_reverted`: versioning is on, and previous versions
    are kept at least 30 days.

**A departure from step 5, and why.** Step 5 says to stop the API serving
`dist/public` in production if it does. It does, but a production self-hosted
install (compose) has no CloudFront, so stopping it would leave that install
with no frontend at all. On the hosted deployment the server's copy is already
unreachable: CloudFront sends only API paths to the ALB, and the ALB admits
CloudFront alone. So the hosted deployment has one SPA path, the bucket. The
first run pins that, so the server's copy cannot become a second path. The
remaining duplication, two builds of one bundle, is slice C's: the bucket gets
the bundle out of the image it deploys.

**Verified by making it fail** (`raw/a1`).

- **At head:** `a_bad_publish_can_be_reverted` fails, because there is no
  versioning resource. `the_spa_is_served_from_the_bucket_alone` passes,
  because the single path already holds; the run pins it.
- **After:** the module passes 11/11, the stack 74/74, and every root
  validates.
- **Mutants, each caught by its own run:**
  - an ALB behaviour claiming `/assets/*`;
  - previous versions kept 7 days;
  - versioning suspended.

## Not shown here

- Slices B and C are not done yet; their sections follow when they land.
- Anything against AWS (Stage 5).
