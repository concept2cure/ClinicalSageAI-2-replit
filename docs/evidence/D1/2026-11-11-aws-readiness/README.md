# D1 — ready to run on AWS: the engineering nobody held after 2026-11-10 (2026-11-11)

Row **D1** (Hosted production), work order `docs/work-orders/MR-03-first-deploy-staging-to-production.md`, session
`…01QoxbLbx`. The task: *"Work to prepare the platform to be run on AWS."* The session of 2026-11-10
(`docs/evidence/D1/2026-11-10-aws-readiness/`) re-measured D1 and listed what engineering was left. This takes the
items on that list that need no founder input and no new table, and one gap found while doing them.

**Nothing was applied: there is no AWS account or credential in this session.** Every proof here is offline.

## What already exists (RULE 3)

- **`terraform/stack`** with two thin roots (`terraform/environments/{staging,production}`), the modules, and
  `terraform/bootstrap`. Its `outputs.tf` already had `first_run_setup`, both deploy role ARNs and the distribution id.
- **`random_password.setup_token`** in `terraform/stack/main.tf`: a generated token held in Secrets Manager and given
  to the API task alone. The readiness token follows it; no new resource type.
- **`server/startup/readyz.ts`** (2026-11-10): the verdict, its 5 s cache of the round trips, and the rule that only a
  `READYZ_TOKEN` holder or a loopback peer reads the detail. Nothing set `READYZ_TOKEN`.
- **`.github/workflows/deploy-aws.yml`**: the preflight (one shell step that refuses a task definition by name), the
  `migrate-preflight` step, and the smoke test's "Readiness through the public URL" step.
- **`scripts/ops/terraform-preflight-proof.mjs`**: runs those steps' own shell against the rendered task definitions,
  with refusal fixtures.
- **`server/services/session-inactivity.ts`** and `migrations/20261001e_session_activity.sql`: sessions shared across
  tasks through Postgres, with a memory fallback that logs a warning.
- **`server/services/hocuspocus-server.ts`**: live co-editing, off unless `ENABLE_COLLAB_CRDT=true`, in-process state.
- **`tests/ci/workflow-harness.ts`**: runs a workflow step's shell against stubbed commands.
- **`tests/db/scheduler-harness.ts`**: a real-PostgreSQL harness with the runtime role and RLS enforcing.
- **CloudFront's `origin_read_timeout = 60`** is pinned by `terraform/modules/cloudfront/tests/alb_origin.tftest.hcl`.
  The ALB's `idle_timeout = 60` was pinned by nothing.

Searched and not found: any `READYZ_TOKEN` in `terraform/` or `.github/`; any `ENABLE_COLLAB_CRDT` in `terraform/`,
`.github/` or `scripts/ops/`; any test naming `idle_timeout` or `keepAliveTimeout`; `engine_version_actual` outside
`terraform/modules/rds`.

## What landed, each red first

| # | What | Red | Green |
|---|---|---|---|
| 1 | **`READYZ_TOKEN` from Terraform to the smoke test** (the rest of OPS-22). The stack generates it, keeps it in Secrets Manager and gives it to the API task alone. The smoke test presents it from the GitHub environment's `READYZ_TOKEN` secret, in a header file. | Stack suite on trunk's Terraform: 83 passed, 1 failed (`readyz-token-stack-red.txt`). The Terraform change against trunk's workflow: the pipeline's own `migrate-preflight` refuses the pair, naming `READYZ_TOKEN` (`readyz-token-preflight-red.txt`). The smoke step on trunk's workflow: 4 of 8 fail (`smoke-readyz-detail-red.txt`). | `terraform-matrix-green.txt`, `preflight-proof-green.txt`, `smoke-readyz-detail-green.txt` (8 of 8) |
| 2 | **Both roots export what the first apply reads.** Staging gains `github_deploy_role_arn`, `github_build_role_arn` and `cloudfront_distribution_id`; both gain `first_run_setup`, `readyz_detail` and `engine_version_actual` (new in the stack, from the RDS module). Staging's `terraform.tfvars.example` now says which output feeds which GitHub value, as production's did. | 12 of 28 fail on trunk (`root-outputs-red.txt`) | 28 of 28 (`root-outputs-green.txt`); both roots and bootstrap validate with `-lockfile=readonly` (`terraform-matrix-green.txt`) |
| 3 | **The topology is declared, and live co-editing is refused** (MR-03 Stage 7 step 8, OPS-20). `terraform/README.md` has a Topology section. The stack sets no `ENABLE_COLLAB_CRDT`; the preflight refuses a task definition that turns it on, as a value or from a secret. | The proof's two new fixtures against trunk's workflow: `NOT refused as it must be`, twice (`preflight-trunk-workflow-red.txt`) | Both refused by name (`preflight-proof-green.txt`) |
| 4 | **A task that cannot read the session store is not ready** (MR-03 Stage 7 step 4, SEC-08, the readiness half). In production `/readyz` reads `session_activity` under the system tenant scope, with the cached round trips; `sessions: down` is a 503. | 6 of 6 fail on trunk (`readyz-session-store-red.txt`) | 6 of 6 (`readyz-session-store-green.txt`); on real PostgreSQL as the runtime role with RLS enforcing, the table present, renamed away and unreadable: 5 of 5, beside the existing cross-task session suite, 4 of 4 (`readyz-session-store-real-postgres.txt`) |
| 5 | **The ALB's 60 s is pinned** (MR-03 Stage 6 step 3, OPS-17). `terraform/modules/alb/tests/alb_timeouts.tftest.hcl`, and `tests/ci/edge-timeouts.contract.test.ts` for the order CloudFront = ALB < keep-alive < headers timeout. | `idle_timeout = 59` in a scratch copy: 4 passed, 1 failed (`alb-idle-timeout-red.txt`). The order's rule refuses five broken orders inside its own suite. | 5 of 5 (`alb-idle-timeout-green.txt`); 7 of 7 (`edge-timeouts-green.txt`) |

Also run, on the final tree:

| Check | Result | File |
|---|---|---|
| CI's Terraform matrix: init, validate, test | 122 pass (stack 84, cloudfront 15, deploy roles 10, alb 5, compliance 5, vpc 3); all validate | `terraform-matrix-green.txt` |
| Both roots and bootstrap, `-lockfile=readonly`; `terraform fmt -check -recursive` | valid; no differences | same |
| The deploy preflight proof | every check holds: the rendered pair accepted, 10 refusals, 54 job×action IAM pairs, the health check | `preflight-proof-green.txt` |
| The two stack assertions that pass on trunk, on a deliberately broken copy (`READYZ_TOKEN` in the database task; `ENABLE_COLLAB_CRDT=true` in the API) | 82 passed, 2 failed: both refuse | `stack-assertions-mutation-red.txt` |
| The startup, readiness and deploy-contract suites together | 58 files, 699 passed, 1 skipped | `readiness-and-deploy-suites-summary.txt` |

The stack suite still counts 84: the new assertions are inside existing runs.

Commits, in the order of the table: `29acce365`, `8fcfad502`, `107530707`, `26e81b20d`, `7310d3083`.

## Decisions made here, and why

- **The readiness token reaches the smoke test as a GitHub environment secret, not through IAM.** The alternative is
  to let the deploy role read the secret. That adds `secretsmanager:GetSecretValue` and a decrypt on the key that
  encrypts every secret to a role that today reads none. The cost of the secret is one more value to set, and it is
  optional: without it the verdict is checked the same and no detail is printed. A value that no longer matches is
  said in the log and changes no verdict.
- **The token is the API's alone**, as `SETUP_TOKEN` is. The database task serves no `/readyz`, so `migrate-preflight`
  now excepts both names, and the stack's test refuses either one in the database task.
- **The session check is production-only**, as the scanner check is, and it reads the table the way the session
  service does. Outside production it reports `skipped`.
- **The memory fallback for a request is unchanged.** MR-03 says the service "must not fall back to process memory
  silently". It is no longer silent: readiness reports it, and the deploy's smoke test fails on it. Refusing every
  request while the store is unreachable would sign everyone out on a database blip. That is a product decision and
  is not taken here.
- **`ENABLE_COLLAB_CRDT` is refused for both environments.** The preflight cannot read the task count from a task
  definition, and staging scales to two.

## Blocked, by name

1. **Trunk CI is red**, and `deploy-aws.yml` deploys only a SHA whose `ci.yml` run concluded success. The MR-02
   lanes own it. Unchanged since 2026-11-10.
2. **The founder's inputs**: MR-03's checklist (accounts, region, domain and certificates, SMTP, keys, B4, NEW-3,
   retention, revoking the live credentials, the apply). Step 6 gains one optional value, `READYZ_TOKEN`.
3. **A founder decision this work found it needs:** MR-03 Stage 7 steps 2–3 share the sign-in and document rate limits
   across tasks through a new table, `public.rate_limit_counters`. Since RULE 6 a new table needs an
   `approvedAdditions` entry under a founder decision. Until then those limits are per task, so a client gets each
   task's allowance: twice the limit on production's two tasks.
4. **Not done here (engineering):** MR-03 Stage 6 steps 2 and 4–9 (long compiles behind the 60 s edge, the SSE
   heartbeat, the MCP deadline); the WAF's switch to block two weeks after the first apply.

## How it was run

Terraform 1.11.4 with `hashicorp/aws` 5.100.0 and `hashicorp/random` 3.6.3, each downloaded from
`releases.hashicorp.com`, checked against HashiCorp's SHA256SUMS and installed from a local filesystem mirror (the
registry is not reachable from this session). Runs used scratch copies of the tree, so no `.terraform/` reached it. The
AWS provider is mocked, as in CI. The real-database suites ran on a local PostgreSQL 16.15; production pins 15, and CI's
database jobs run 15.
