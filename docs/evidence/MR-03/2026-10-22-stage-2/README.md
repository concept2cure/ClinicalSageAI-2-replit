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
| C | OPS-13, application half: one converter limiter, 503 with Retry-After | done |
| B | OPS-28, SEC-18: boot refusals | done |
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
| Production boot refusals | `server/startup/env.ts` (`PROD_FORBIDDEN_FLAGS`, `AUTH_BOUNDARY_MODE`, `SECURITY_SELF_TEST_NONBLOCKING`) | Refuses the mock, experimental and demo route flags in production | Refuse `ENABLE_TEST_ROUTES` (honoured as a "smoke test" hatch), or any override on the hosted deployment |
| Override refusal in the pipeline | `deploy-aws.yml` preflight (`*_ACCEPT_*` by name, `AUDIT_*` exactly `true`) | Refuses a revision the pipeline registers if it carries an override | Stop a revision registered or edited outside the pipeline; name `ENABLE_TEST_ROUTES` |
| Manifest guard | `scripts/ci/check-compose-boot-contract.mjs` | Holds both production compose stacks to the boot contract; refuses `SECURITY_SELF_TEST_NONBLOCKING`; pins `AUDIT_REQUIRE_ENFORCE=true` | Refuse the route flags; read the Helm values. **Extended by slice B**, not duplicated |
| Audit enforcement | `server/startup/audit-enforcement.ts` | Fails closed on a missing trail, a failed immutability probe or a disabled sweep, when `AUDIT_REQUIRE_ENFORCE=true` | Fail closed by default in production |

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

## Slice C: one converter limiter, and a busy converter answered 503

**What changed.**

- **`server/services/conversion-slots.ts`** (new) exports
  `withConversionSlot(kind, fn)`. It is one process-wide, first-come
  first-served limiter:
  - `CONVERTER_MAX_CONCURRENCY` slots (default 2);
  - a bounded wait of `CONVERTER_QUEUE_TIMEOUT_MS` (default 120000);
  - past that wait it throws `ConversionCapacityError` (503, `retryAfterSeconds`
    30). A request is never dropped and never answered with an empty result;
  - the timeout bounds the wait for a slot, never a running conversion.

  It reuses the AI gateway's `Semaphore` (`server/services/ai-gateway/concurrency.ts`)
  rather than copying it. A timer aborts the wait, using the semaphore's
  existing abort, which removes a waiter without dispatching it.
- **Nesting cannot deadlock.** A conversion started while its async context
  already holds a slot runs under that slot (`AsyncLocalStorage`). No wrapped
  converter calls another today; this keeps it that way.
- **Wrapped:**
  - LibreOffice (`pdf-converter.ts` `runLibreOffice`);
  - the python3 DOCX→PDF pipeline, including its soffice and Ghostscript
    children, as one process group (`docx-pdf-pipeline.ts`);
  - OCRmyPDF, now also `--jobs 1`, so one slot is one worker
    (`integrations/ocrmypdf/client.ts`);
  - veraPDF (`integrations/verapdf/client.ts`, and the PDF/A pipeline's
    validation);
  - Ghostscript (the PDF/A conversion in `ectd/pdfa-pipeline.ts`, and
    `pdf-compression-service.ts`).
- **Not wrapped:** the 5-second `--version` probes. They convert nothing, and a
  probe refused for capacity would read as "binary absent": a busy converter
  disguised as a missing one.
- **A busy converter is not a different outcome:**
  - `finalizePdfA` and the veraPDF validation rethrow it rather than return
    "unchanged" or a validation note. The packager would otherwise ship a leaf
    as not-PDF/A on the strength of a queue.
  - A compression batch stops rather than failing each later file after its
    own wait.
  - A compile records no failed compilation for it.
  - The submission service does not wrap it as `DISPATCH_BLOCKED`.
- **One HTTP mapping.** `respondIfConverterBusy` (`server/lib/api-response.ts`)
  answers 503 with `Retry-After` and the error's own sentence ("The document
  converter is busy… Try again in about 30 seconds.").
  - It is called by `serverError` and by the global `errorHandler`
    (`server/src/mw/observability.ts`), in production too, where a 5xx message
    would otherwise read "Internal server error".
  - The eCTD export, preview and validate routes and the submissions routes
    call it too, because they classify errors themselves.
- **The callers that now see a rejection:**
  - `ocrService.ocrPdf` and the intake pipeline propagate it. Before, every
    OCR failure resolved `applied: false`.
  - The feature-flagged veraPDF advisory (`pdfValidationAttachment.ts`)
    records "veraPDF skipped" with the busy sentence as its reason.

**Built by a delegated agent, reviewed here.** The agent was cut off by a usage
limit before it could report or run the wider suites. Every change was read
here, and everything below was run here except `raw/c1`–`c4` and `c6`, which
are the agent's.

**Verified by making it fail.**

- **The cap** (`raw/c1`, `raw/c2`). `conversion-slots.test.ts` was run against
  HEAD's converters with the module absent: 11 of 12 failed, with five and
  eight children alive at once. After: 12/12.
- **The 503** (`raw/c3`, `raw/c4`). Before the mapping, `serverError`, the
  global handler, the three export routes and the compile route answered 500.
  After, they answer 503 with `Retry-After`, as do the submissions routes:
  8/8.
- **Mutants** (`raw/c6`), seven, each failing its test:
  - re-entrancy removed;
  - PDF/A or veraPDF turning a refusal into a result;
  - the batch continuing;
  - the probe taking a slot;
  - `--jobs 1` lost;
  - the veraPDF client spawning outside a slot.
- **A flaky test, found and fixed here** (`raw/c5`). One test asserted which of
  three conversions was refused. Each writes its input file before it queues,
  so the order depends on the filesystem; it failed on its first run here. It
  now asserts what holds in any order, and the fixed 20 ms waits became a wait
  until both holders run. Six consecutive runs passed 12/12, and all four new
  files pass 20/20.
- **Every related suite** (`raw/c5`). `vitest related` over the changed modules
  is 1,521 files, because `api-response.ts` is imported nearly everywhere:
  19,564 passed and 86 failed in 37 files. **The same 86 tests fail with the
  change stashed**, test name for test name. The causes are this container's
  environment and schema (reporting PDF fonts, AS2 signing, a journey's
  missing relation), not converters.
- **Lint:** eslint on the 17 changed and new files reports 0 errors. The
  pre-push hook's warning ratchet and typecheck run on push.

## Slice B: production refuses test routes, and the hosted deployment refuses every override

**The decision (P-43, `docs/LAUNCH_DEFINITION_OF_DONE.md`).** The work order's
step 7 makes every `*_ACCEPT_*` override a boot refusal whenever
`NODE_ENV=production`, with a CI escape variable. Done literally, that stops the
canonical self-host install. `docker-compose.yml`, "the install SKU", runs
production mode on an HMAC signer and a local volume, and states both through
these variables. So, decided under the CPO mandate, the line is drawn by where
the process runs:

- **On an ECS task (the hosted deployment)** the boot refuses any `*_ACCEPT_*`
  set to anything but `false`, and `AUDIT_REQUIRE_ENFORCE=false`.
  - The task is recognised by `ECS_CONTAINER_METADATA_URI_V4`, which the ECS
    agent sets and a task definition cannot remove.
  - The deploy preflight already refused these by name, but only for revisions
    the pipeline registers.
- **A self-hosted install keeps its written acceptances.**
- **`ENABLE_TEST_ROUTES` is refused in every production boot**, and production
  never mounts the test routes.
- **Audit enforcement is the production default.** Only an explicit
  `AUDIT_REQUIRE_ENFORCE=false` turns a missing trail, a failed immutability
  probe or a disabled sweep into a warning.

**Departures from the work order, and why:**

- **No CI escape variable.** The CI single-container boots are not ECS tasks,
  so they boot without one, and an escape would be one more override to guard.
- **`STORAGE_ACCEPT_LOCAL_DISK` stays in `docker-compose.beta.yml`.** The beta
  stack has no object store, and its storage is MR-08's.
- **The manifest check refuses the flags every production boot refuses.** Those
  are the mock, experimental, demo and test route flags and
  `SECURITY_SELF_TEST_NONBLOCKING`. The `*_ACCEPT_*` overrides are not
  refused there, because these manifests are self-hosted.

**What changed.**

- `server/startup/env.ts`:
  - `ENABLE_TEST_ROUTES` joins `PROD_FORBIDDEN_FLAGS`;
  - `testRoutesEnabled` is false in production;
  - new `refuseHostedOverrides`, applied after the existing production
    refusals. The rule is the name's shape, so a later override is covered.
- `server/startup/audit-enforcement.ts`: `requiresEnforce` is on in production
  unless the value is `false`; outside production it is on only when `true`.
  The docstrings and one refusal message now say so.
- `scripts/ci/check-compose-boot-contract.mjs` (extended, not a new script):
  - a production app service may not carry any `PROD_FORBIDDEN_FLAGS` entry in
    any form; the list is read from `env.ts`, so the two cannot drift;
  - the Helm values files (`charts/<chart>/values*.yaml`, `helm/*.yaml`) are
    checked wherever an `env:` map sets `NODE_ENV=production`, including its
    `extra` map.
- `deploy-aws.yml`: the preflight refuses `ENABLE_TEST_ROUTES` by name. Its
  audit wording no longer calls enforcement opt-in.

**Verified by making it fail.**

- **Before** (`raw/b1`): 16 of the new tests fail on the pre-change code.
  - These include `ENABLE_TEST_ROUTES` booting and mounting, each override
    and a hypothetical `SOME_FUTURE_ACCEPT_RISK` booting on ECS, and the three
    unset-enforcement cases;
  - the controls pass: an ECS boot with no override, an override set to
    `false`, a self-hosted boot with acceptances, and test routes outside
    production.
- **After** (`raw/b2`): 41/41.
  - The modules' related tests pass 118/118, and `server/startup` passes
    211/211.
  - eslint reports 0 errors, with warnings per file unchanged.
- **The guard** (`raw/b3`, `raw/b4`):
  - the new self-test cases fail on the old guard (3); the self-test passes
    60/60 after, and the repository passes;
  - with `ENABLE_TEST_ROUTES` planted in `docker-compose.yml` and in the
    chart's `env.extra`, the guard refuses both and exits 1. Both files were
    restored.
- **The preflight** (`raw/b5`): it accepts the task definition slice A renders,
  and refuses the same definition with `ENABLE_TEST_ROUTES=true`, naming it.
- **Mutants** (`raw/b6`), eight, each failing its test:
  - the flag dropped from the list;
  - the mount arm restored;
  - ECS never detected;
  - only an exact `true` counted;
  - `AUDIT_REQUIRE_ENFORCE=false` accepted on ECS;
  - enforcement opt-in again;
  - the guard skipping the route flags;
  - the guard ignoring Helm's `extra`.

## Not shown here

- **The load half of OPS-13:** 20 concurrent DOCX→PDF conversions plus two
  OCR jobs on staging, with no task stopped. This is Stage 5, after F-4.
- **Scale-out in a real account.** The policies are asserted at plan time
  only. The ceiling is 2 until OPS-07 closes.
