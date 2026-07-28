# Chapter 10 — Infrastructure, deployment and operability

**Verdict: one deployment path is genuinely well engineered. Eight others exist alongside it,
most of them dead. Nothing in the repository would let an on-call engineer recover from a
data-loss event, because no recovery has ever been written down or rehearsed.**

---

## 10.1 Nine deployment targets, one coherent

| Target | Artifacts present | Coherent? |
|---|---|---|
| **AWS ECS Fargate** | `Dockerfile.optimized` + `.github/workflows/deploy-aws.yml` (30 KB) + `terraform/` (**28 `.tf`**, `environments/{production,staging}`, 8 modules) | ✅ **Yes — the real one** |
| Google App Engine | `app.yaml` (nodejs20, F2) | ⚪ orphaned |
| Vercel | `.vercelignore`, `docs/deployment/VERCEL_DEPLOY.md` | ⚪ orphaned |
| Replit | `.replit`, `replit.nix`, `.replit-ci.yml` | 🔴 **dead** (§10.5) |
| Helm | `charts/concept2cure-app/`, `charts/trialsage-cer/` | ⚪ unreferenced by any workflow |
| Stray Helm values | `helm/values-local.yaml` — **a values file with no chart beside it** | 🔴 confusing |
| Raw Kubernetes | `infra/k8s/bff-with-predicate-shadow.yaml` | ⚪ one-off |
| docker-compose | `docker-compose.yml` + `.beta` / `.e2e` / `.staging` variants | ✅ local/dev, legitimate |
| Python side-services | `services/` (Celery + `api.py`), `workers/artifact-compute/` | ⚠️ partially wired |

**The ECS path is well built and deserves credit.** `deploy-aws.yml` uses OIDC credentials
rather than long-lived keys, pushes to ECR, pins task-definition revisions, runs schema
migration as a **one-off ECS task that gates the service roll** (`deploy-api` and
`deploy-worker` both `needs: migrate`), and finishes with a smoke-test job. That is a
correct, careful pipeline.

`Dockerfile.optimized` is likewise good: multi-stage, non-root `appuser`, and a
`HEALTHCHECK` pointed at **`/readyz`** rather than `/api/health`, with the reasoning written
in a comment immediately above it — *"a down database or a positively-verified missing
schema."*

That comment is the problem. Chapter 14 §G1-2 shows `/readyz` returns **200 `ready:true`**
over a database missing `auth_users`, `auth_refresh_tokens`, `roles`, `permissions`,
`user_roles` and `licenses`, because three branches of `server/startup/services.ts` never set
schema readiness. **The container orchestrator's only health signal is a probe that does not
detect the failure it was repointed to detect.** The infrastructure is correct; the thing it
depends on is not.

**The seven orphaned targets are not free.** An operator inheriting this repo sees nine ways
to deploy and no statement of which is real. `docs/guides/REPLIT_README.md:167` actively
presents a dead one as live.

## 10.2 Disaster recovery does not exist

Searched the entire `docs/` tree for disaster-recovery, RPO, RTO, backup, restore, postmortem
and incident documents. **There are none.**

| Capability | State |
|---|---|
| DR plan | ❌ absent |
| RPO / RTO defined anywhere | ❌ absent |
| Backup procedure | ❌ absent |
| **Restore ever rehearsed** | ❌ **never** |
| Incident history / postmortems | ❌ none |

The only acknowledgement is in the seller's own readiness document
(`PRODUCT_READINESS_ASSESSMENT.md:123-125`), as an **unchecked** owner action: *"Rehearse
backup / restore before first data… Confirm Neon PITR/branching is on; run one real `pg_dump`
+ restore into a scratch branch so there's a proven way back."*

**This is a G2 blocker and it is not negotiable.** You cannot sign an availability or
data-durability commitment you have never tested. It is also, notably, one of the cheaper
items on the remediation list — a rehearsal and a runbook is weeks, not months.

Two aggravating factors specific to this codebase:

1. **Booting the application mutates the schema** (§LP-09b — `ensureCoreTables.ts` creates 7
   tables at boot; verified 702 → 717). A rollback to a previous image therefore cannot be
   assumed to leave the database in a previous state.
2. **A from-scratch rebuild is known-incomplete** (Chapter 05 §5.3.1) — so "restore from
   backup" and "reprovision from source" are both unproven paths today.

## 10.3 Observability — good primitives, unproven pipeline

| Capability | State |
|---|---|
| Structured logging | ✅ Pino via `server/utils/logger.ts`, with centralised PHI/credential redaction using a nested-key walker (Pino's fixed-path `redact.paths` would not suffice). Genuinely well done. |
| Logger adoption | ⚠️ **463** server files import the logger; **156** still contain `console.log`, **702 occurrences**. Tracked in `docs/LOGGING_MIGRATION.md`; `no-console` is `warn`, not `error`. |
| Metrics | ✅ Prometheus-style, 15+ domain metric modules, `/api/metrics` behind auth or `METRICS_TOKEN` |
| Tracing | ✅ OpenTelemetry (`services/telemetry/opentelemetry.ts`) |
| Error tracking | ⚠️ Sentry wired on both server and client — but `SENTRY_DSN` is an **unchecked** go/no-go item in the seller's own list. It has never been proven to page a human. |
| Health probes | ⚠️ `/healthz`, `/readyz`, `/api/health`, `/api/health/full` exist and are mounted fast-path before security middleware — good design, undermined by §10.1 |
| **Alerting** | 🔴 `infra/alerts/orchestrator.yml` — **one file, 6 alerts, one subsystem.** The submission-orchestrator gateway pages at `>0` in 10 minutes with an explicit regulatory-hazard rationale, which is exactly right — and nothing else in the platform has any alert at all. |
| SLOs / error budgets | ⚠️ referenced in three documents, never consolidated |
| Runbooks | ✅ 5 in `docs/runbooks/` + 12 in `docs/operations/` — reasonable coverage, none for DR |

**The honest summary:** an on-call engineer has good logs and metrics for a system they are
already looking at, and almost no way to be told to look. Alerting covers one subsystem;
paging has never been proven end-to-end.

Also worth flagging from the boot log: the application's own scheduler reported
`{"overall":"failing"}` for its security posture at startup, unprompted. Whatever that
aggregate is measuring, nothing surfaces it to an operator.

## 10.4 Background work is in-process, not isolated

- **6 cron schedules** start inside the `listen()` callback (`server/index.ts:229-249`).
  Two are on by default (external-intelligence sweep, schedule-of-events sweep); the
  audit-chain integrity sweep defaults on in production when `AUDIT_TRAIL_ENABLED=true`.
- **Only 2 Bull queues exist** (`cer-generation`, `c2c-report-subscription-sweep`). There is
  no dedicated worker process and no separate worker container command — **everything runs
  in-process with the API.** A heavy report generation competes with request serving, and
  scaling the API scales the schedulers with it.
- **`initializeParallelServices` uses `Promise.allSettled`**, so a subsystem that fails to
  start degrades **silently**. Combined with each `register-*.ts` route family being wrapped
  in try/catch, a production deploy can come up missing a whole route family or a background
  service and report healthy.
- **3 of 5 `server/workers/` modules have no importer**; `jobs/retentionCron.ts` has no
  scheduler caller at all (a Part 11 retention control — Chapter 07 §7.3).
- Redis is optional everywhere: absent, the rate limiter silently degrades to **in-memory**,
  which is per-instance and therefore not a cluster-wide limit. That is a correctness gap in
  any multi-instance deployment, and `SECURITY.md` claims *"rate limiting on all endpoints."*

## 10.5 Dead configuration that actively misleads

`.replit-ci.yml` is a 3.4 KB **GitLab CI** file (`workflow.rules`, `$CI_PIPELINE_SOURCE`,
`$CI_COMMIT_BRANCH`) sitting in a GitHub Actions repository. It references a root
`jest.config.js` **which does not exist** (the real one is `scripts/jest.config.js`) and
declares dev/staging/prod deploys to `*.trialsage.com` via `scripts/deploy-{dev,staging,prod}.sh`
that nothing invokes. Nothing in the repo references it except
`docs/guides/REPLIT_README.md:167`, which presents it as live. The repo's own GA-readiness
audit already flagged it.

## 10.6 CI/CD hygiene

Covered in Chapter 08 and Chapter 11; the infrastructure-specific items:

- **Zero of 137 GitHub Actions `uses:` references are SHA-pinned.** `terraform-compliance.yml`
  carries `TODO(GA-blocker)` comments acknowledging it and noting the Checkov action was
  previously on `@master`.
- **21 workflows**, of which the Trivy *config* scan and Semgrep are advisory
  (`continue-on-error`) over acknowledged HIGH/CRITICAL IaC backlogs. The Trivy *filesystem*
  scan and Checkov (`soft_fail: false`) **are** blocking — a sensible split.
- `neon-preview-db.yml` carries **four** `continue-on-error: true` steps and invokes
  `npm run test:unit --if-present` — **a script that does not exist**, so it silently no-ops.

## 10.7 Priority actions

| # | Action | Sev | Gate | Effort |
|---|---|---|---|---|
| 1 | **Fix `/readyz`** so the container healthcheck detects the failure it was repointed to detect (Chapter 15 item 0.5) | **P0** | G1 | 4 h |
| 2 | **Write and rehearse DR** — RPO/RTO, a real `pg_dump` + restore into a scratch branch, a runbook. Account for boot-time schema mutation. | **P1** | G2 | 3 weeks |
| 3 | **Prove alerting pages a human**, then extend beyond the one subsystem that has alerts | P1 | G2 | 2 weeks |
| 4 | **Make silent subsystem failure loud** — `Promise.allSettled` plus per-family try/catch means a deploy can come up missing route families and report healthy. Fail the boot, or emit a metric an alert can fire on. | P1 | G2 | days |
| 5 | **Delete the 7 orphaned deployment targets** and `.replit-ci.yml`; correct `REPLIT_README.md` | P2 | G2 | 1 day |
| 6 | **Move background work out of the API process** — a dedicated worker container for the Bull queues and crons | P2 | G2 | weeks |
| 7 | Require Redis in production so rate limiting is cluster-wide, or correct the `SECURITY.md` claim | P2 | G2 | days |
| 8 | SHA-pin all 137 Actions; fix `neon-preview-db.yml`'s reference to the nonexistent `test:unit` | P2 | G2 | hours |
| 9 | Finish the logger migration (156 files, 702 `console.log` occurrences) and set `no-console` to `error` | P3 | — | weeks |
