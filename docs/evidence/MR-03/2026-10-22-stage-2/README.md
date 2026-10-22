# MR-03 Stage 2: the API task's size, the image, and unsafe boots

Launch row **D1** (hosted production). Work order
[`MR-03`](../../../work-orders/MR-03-first-deploy-staging-to-production.md), Stage 2.
Branch `concept2cure-v2`. Session `…session_01GSjEDJLuZsEzPa9PnVg1yF` (lane W2/D1).

Stage 2 changes code only. The load half of OPS-13 (20 concurrent conversions
on staging, no task replaced) is Stage 5's, after the founder's AWS account
(F-4).

| Slice | Findings | State |
|---|---|---|
| A | OPS-13, Terraform half: task size, stop timeout, init process, heap, autoscaling | done |
| C | OPS-13, application half: one converter limiter, 503 with Retry-After | next |
| B | OPS-28, SEC-18: boot refusals | open |
| D | OPS-19: the image (base pin, `chown`, `BUILD_COMMIT`, PID 1) | open |

## Re-confirmed at head before starting

Every Stage 2 finding was still open at `178f0b477`:

- **Task size.** `api_cpu` 1024 and `api_memory` 6144 in both roots and both
  tfvars examples.
- **Container settings.** No `stopTimeout`, `initProcessEnabled`,
  `memoryReservation`, `NODE_OPTIONS` or autoscaling anywhere in `terraform/`.
  The service ignored only `task_definition`.
- **Image.** `Dockerfile.optimized` runs `FROM node:22-slim` with no digest
  (lines 3, 48), `chown -R appuser:appuser /app` (:219) and
  `CMD ["npm", "run", "start"]` (:238).
- **Test routes in production.** `server/startup/env.ts:149` mounts the test
  routes when `ENABLE_TEST_ROUTES=true`, and `PROD_FORBIDDEN_FLAGS` (:34)
  does not name it.
- **Converters.** No limiter: nothing named `withConversionSlot`,
  `ConversionCapacityError` or `CONVERTER_MAX_CONCURRENCY` exists in
  `server/`.
- **OPS-07 is still open.** The three opt-in schedulers (drift sentinel,
  corpus ingestion, horizon scan) do not take the lease, and
  `scripts/ci/check-scheduler-lease.mjs` does not exist. So production's
  autoscaling ceiling stays at 2, as the work order says.

## What already exists (Rule 3)

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| API task definition and service | `terraform/modules/ecs-fargate/main.tf` | API container plus the clamd sidecar it waits on; liveness check on `/healthz`; the deploy owns the revision (`ignore_changes = [task_definition]`) | Give the drain time to finish; reap converter children; bound Node's heap; scale |
| Scanner memory check | `terraform/stack/main.tf`, the `api_memory - scanner_memory >= 2048` precondition | Refuses a task that leaves the application less than 2048 MiB | Refuse one vCPU in production |
| ALB target group | `terraform/modules/alb` | `deregistration_delay = 30`; outputs the group's ARN | Expose the ARN suffixes a request-count policy needs |
| Graceful shutdown | `server/startup/shutdown.ts` | Drains, then force-exits after `FORCE_EXIT_MS` (12 s) | Run at all after ECS's default 30 s SIGKILL when deregistration takes 30 s |
| FIFO semaphore | `server/services/ai-gateway/concurrency.ts` (`Semaphore`) | Bounds in-flight AI calls; an abort removes a waiter without dispatching it | Know about converters. **Reused by slice C**, not copied |
| Typed HTTP refusals | `server/lib/api-response.ts` (`serverError`), `server/src/mw/observability.ts` (`errorHandler`) | Map errors to envelopes; 500 by default | Answer a busy converter 503 with Retry-After |

## Slice A: the API task, sized and stopped cleanly, and autoscaled

**What changed.**

- **Size, both roots.** `api_cpu` is 2048 and `api_memory` 8192 (defaults and
  tfvars examples). The application now gets 4096 MiB beside clamd's 4096.
  Staging matches production, so the Stage 5 load test on staging says
  something about production. `terraform/stack` refuses `api_cpu < 2048` in
  production through a `terraform_data.boot_contract` precondition; staging
  may run 1024.
- **The API container** (`modules/ecs-fargate`):
  - `stopTimeout = 60`. The 12 s drain and the load balancer's 30 s
    deregistration did not fit in ECS's default 30 s before SIGKILL.
  - `linuxParameters.initProcessEnabled = true`, so PID 1 forwards SIGTERM and
    reaps the converters' children.
  - `memoryReservation` is the task memory less the scanner's.
  - `NODE_OPTIONS=--max-old-space-size=2457`, which is 60% of the API's
    share. A large conversion then fails one request rather than the
    container.
- **Autoscaling** (`modules/ecs-fargate`):
  - an `aws_appautoscaling_target` from `api_desired_count` to the new
    `api_max_count`;
  - two target-tracking policies: average CPU at 60%, and requests per target
    on the API's own target group (new `alb_arn_suffix` and
    `api_target_group_arn_suffix` outputs on `modules/alb`);
  - the service now ignores `desired_count`, which autoscaling owns.
  - The module default ceiling is 6. Both roots set 2 until MR-14 closes
    OPS-07; that change raises it. `terraform/stack` refuses a ceiling below
    the floor.

**Verified by making it fail.**

- **Before** (`raw/a1`): each new run on the pre-change stack, alone, because
  Terraform skips every later run once one fails:
  - `refuses_a_production_api_task_below_two_vcpu`: Missing expected failure;
  - `the_api_container_stops_cleanly_and_bounds_its_heap`: `stopTimeout`
    unsupported, and the init-process, `memoryReservation` and `NODE_OPTIONS`
    assertions failed;
  - `the_api_service_scales_on_cpu_and_requests`: no `api_autoscaling`
    output (Unsupported attribute);
  - `refuses_a_max_count_below_the_desired_count`: Missing expected failure;
  - `staging_may_run_a_one_vcpu_api_task` passes, as it should.
- **After** (`raw/a2`): stack 72/72, modules 26/26, and bootstrap and both
  roots validate from the committed lock files. `terraform fmt -check`
  passes.
- **Mutants** (`raw/a3`), nine, each failing its run:
  - CPU floor lowered to 1024;
  - `stopTimeout` 30;
  - init process off;
  - heap at 80%;
  - ceiling fixed at 6;
  - CPU target 80;
  - request label missing the target group;
  - `desired_count` no longer ignored;
  - ceiling validation loosened.
- **Preflight proof** (`raw/a4`): deploy-aws.yml's own preflight accepts the
  resized task definition, and every other check holds. That includes the
  migrate and provision clones, the 38 job×action IAM pairs and the health
  check.
- **Trivy** (`raw/a5`): `trivy config` with CI's settings exits 0.

**One check is a source read.** A plan cannot observe a `lifecycle` block, so
the run asserts `ignore_changes = [task_definition, desired_count]` by reading
`modules/ecs-fargate/main.tf`. Its first version referenced no object, which
Terraform refuses. It now also references `module.ecs.api_autoscaling`.

## Not shown here

- **The load half of OPS-13:** 20 concurrent DOCX→PDF conversions plus two
  OCR jobs on staging, with no task stopped. This is Stage 5, after F-4.
- **Scale-out in a real account.** The policies are asserted at plan time
  only. The ceiling is 2 until OPS-07 closes.
