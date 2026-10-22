# MR-03 Stage 4: a staging target, build once, promote by digest, roll back on failure

Launch row **D1**. Work order
[`MR-03`](../../../work-orders/MR-03-first-deploy-staging-to-production.md),
Stage 4 (OPS-10, OPS-21, OPS-23). Branch `concept2cure-v2`. Session
`…session_01GSjEDJLuZsEzPa9PnVg1yF` (lane W2/D1).

| Slice | What | State |
|---|---|---|
| A | OPS-21: the frontend bucket versions; one SPA delivery path on the hosted deployment, pinned | done |
| B | OPS-23: roll back on a failed smoke test; a `rollback_taskdef` dispatch; the migration's duration recorded | done |
| C | OPS-10: target resolution, per-environment settings, build once on staging, promote the staging-verified digest to production | next |

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

## Slice B: a failed release rolls back, and a rollback can be asked for

**What changed** (`.github/workflows/deploy-aws.yml`).

- **`deploy-api` records what to return to.** It reads the revision the
  service runs before it moves anything, and refuses to roll if it cannot
  read one. It exports that as `previous_td_arn`, beside the revision it
  rolls.
- **A `rollback` job.** It runs after `deploy-api` and the smoke test, in the
  production environment.
  - When the smoke test fails after a successful roll, it returns the service
    to `previous_td_arn`.
  - On a `workflow_dispatch` with `rollback_taskdef`, it returns the service
    to that revision, and runs alone: `ci-verdict`, `test` and
    `security-gate` skip, and everything after them with them.
  - It refuses, changing nothing, a revision of another family, anything that
    is not a revision ARN, the revision that just failed, or one with no API
    container. It waits for the service to settle, checks it ended on the
    revision it was sent to, and warns when that revision names its image by
    tag.
  - Its comment says why automatic is safe: the migration set is additive
    (Rule 1), so the previous code runs on the migrated schema, and
    `ci:migration-drop-safety` refuses a non-additive change before it ships.
- **The migration step records its start, end and duration** in the job
  summary, from an EXIT trap, so a refusal or a deadline records them too.

**Verified by making it fail.**

- **At head** (`raw/b1`): the new
  `tests/ci/deploy-rollback.contract.test.ts` cannot load, because there is
  no rollback job.
- **After:** 24/24. The job conditions go through the runner simulator; the
  rollback and capture steps run as shell against a stubbed `aws`.
- **Six mutants** (`raw/b2`), each caught by the case that exists for it:
  - the smoke-failure clause removed;
  - a rollback when `deploy-api` failed;
  - `ci-verdict` running on a rollback request;
  - the capture moved after `update-service`;
  - the EXIT trap removed;
  - the post-rollback check removed.
- **Everything else that reads the workflow** (`raw/b3`):
  - the `tests/ci` and deploy schema-contract suites, 689/689;
  - six gates;
  - the preflight proof, every check. That includes every AWS call each job
    makes being granted to the role it assumes: 41 job×action pairs, up from
    38.

## Not shown here

- Slice C is not done yet; its section follows when it lands.
- **A rollback against AWS** (Stage 5's acceptance). The acceptance case is a
  staging dispatch with a broken readiness URL.
- Anything against AWS (Stage 5).
