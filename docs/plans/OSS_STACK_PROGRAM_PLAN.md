# OSS Stack Program Plan (Control Tower)

## Mission
Introduce Docling, Unstructured, Qdrant, Byaldi (pilot), OPA, OpenTelemetry, Langfuse, Temporal, and E2B (pilot) in a beta-safe, governed, auditable way without destabilizing regulated artifact workflows.

## Why each addition belongs (and moat impact)

| Capability | Why it belongs in Concept2Cure | User/business value | Moat impact |
|---|---|---|---|
| Docling | Higher-fidelity document structure extraction for regulated artifacts | Better section/table extraction quality | Direct |
| Unstructured fallback | Resilience across format edge cases and parser failures | Lower ingestion failure rate | Indirect |
| Qdrant | Production-grade vector retrieval with metadata filtering | Better evidence recall/precision | Direct |
| Byaldi (pilot) | Potential multimodal retrieval lift for figure/table-heavy submissions | Optional recall improvements | Indirect (unproven) |
| OPA | Centralized policy decisions with explicit contracts | Stronger governance consistency and auditability | Direct |
| OpenTelemetry | Unified tracing backbone | Faster incident/debug and trust in system behavior | Indirect |
| Langfuse | LLM-specific traces/evals | Better quality governance for model-driven paths | Direct |
| Temporal | Durable, resumable, cancellable workflows | Reliability for long-running regulatory jobs | Direct |
| E2B (pilot) | Isolated execution for risky compute transforms | Safer experimentation and compute containment | Indirect |

## Control-tower + focused workstreams

### Worktree / branch map
- `wt-control-tower` → `chore/oss-stack-control-tower`
- `wt-ingestion-plane` → `feat/ingestion-docling-unstructured`
- `wt-governance-observability` → `feat/governance-opa-otel-langfuse`
- `wt-retrieval-evidence` → `feat/retrieval-qdrant-byaldi-pilot`
- `wt-workflow-compute` → `feat/workflow-temporal-e2b-pilot`
- `wt-evals-release` → `feat/evals-release-gates-oss-stack`

### Concurrency rule
- Start with **3 active sessions max**: control tower, ingestion, governance/observability.
- Open retrieval/workflow/evals sessions only after contracts are approved.

## Ranked implementation plan (value, risk, effort, moat)

| Rank | Workstream | Value | Risk | Effort | Moat | Notes |
|---|---|---:|---:|---:|---:|---|
| 1 | Ingestion (Docling + Unstructured fallback) | High | Medium | Medium | High | Best early impact on artifact quality |
| 2 | Governance/observability (OPA design + OTel/Langfuse) | High | Medium | Medium | High | Required before broad plane expansion |
| 3 | Retrieval/evidence (Qdrant baseline) | High | Medium | Medium | High | Depends on ingestion contracts |
| 4 | Workflow durability (Temporal) | Medium-High | Medium | High | High | Start with non-interactive long jobs |
| 5 | Eval/release harness | High | Low-Medium | Medium | High | Converts quality claims into measurable gates |
| 6 | Byaldi pilot | Medium | High | Medium-High | Medium | Strictly benchmark-gated, not default path |
| 7 | E2B pilot | Medium | High | Medium | Medium | Strict isolation and governance boundary required |


## Supervisor audit loop (mandatory)
- Every workstream merge candidate is audited by the control-tower supervisor before merge.
- Required pre-merge audit command: `npm run oss:supervisor:audit`.
- Audit output must be attached to PR description for each workstream branch.
- If audit fails, branch cannot merge until findings are remediated.

## Feature flags (must exist before behavior changes)
- `oss.ingestion.docling_primary`
- `oss.ingestion.unstructured_fallback`
- `oss.retrieval.qdrant_enabled`
- `oss.retrieval.byaldi_pilot`
- `oss.policy.opa_decisions`
- `oss.obs.langfuse_enabled`
- `oss.workflow.temporal_enabled`
- `oss.compute.e2b_pilot`

## Benchmark-gated capabilities
- Byaldi pilot (must beat baseline retrieval quality without governance regressions).
- E2B pilot (must demonstrate bounded execution, audit traceability, and policy compliance).
- Any default-path migration from incumbent retrieval/policy/workflow behavior.

## What not to build yet
- No default-path Byaldi or E2B.
- No hard cutover from in-app policy engine to OPA before policy-decision contract and fallbacks are validated.
- No direct integration from parser/retrieval pilots into regulated artifact writes.

## Merge order
1. Repo truth + architecture/contracts + release gates docs (this phase)
2. Ingestion contract + adapter scaffolding (feature-flagged)
3. Governance/observability adapters + trace schema
4. Qdrant retrieval adapter + evidence payload contract implementation
5. Temporal workflow scaffolding for long-running jobs
6. Pilot gates/evals and optional Byaldi/E2B controlled experiments

## Rollback strategy (program-level)
- Every OSS subsystem remains independently disable-able via feature flags.
- Preserve incumbent path until gates are met and burn-in windows pass.
- Rollback by disabling target flag and routing to incumbent path.
- Never rollback by mutating audit/provenance history.


## Swarm execution board
- Use `docs/plans/OSS_STACK_WORKSTREAM_EXECUTION_BOARD.md` as the supervisor playbook for step-by-step multi-agent execution and checkpointing.


## Current implementation status
- ✅ Medical writing checklist gating added (`oss:medwrite:check`) with summary helper in `server/services/evals/medicalWritingCoverage.ts`.
- ✅ Medical writing checklist checks added (`oss:medwrite:check`) with draft assessment helper in `server/services/evals/medicalWritingQualityService.ts`.
- ✅ Life-sciences regulatory UAT catalog checks added (`oss:reg:check`) with coverage summary helper in `server/services/evals/regulatoryTaskCoverage.ts`.
- ✅ Human testing scorecard sync tooling added (`oss:scorecard:sync`) with UAT metrics service in `server/services/evals/uatMetricsService.ts`.
- ✅ GA readiness evaluator added in `server/services/evals/gaReadinessService.ts` with tests for beta/ga pass-fail logic.
- ✅ GA/human-testing scaffolds added (`docs/evals/*`, human UAT plan/runbook, `oss:eval:check`, `oss:ga:check`).
- ✅ Supervisor audit loop tooling in place (`oss:supervisor:audit`, `oss:checkpoint`).
- ✅ Phase 1 ingestion slice started with parser arbitration scaffold in `server/services/ingestion/`.
- ⏳ Next: wire adapters behind non-default route/service boundary with contract tests.
