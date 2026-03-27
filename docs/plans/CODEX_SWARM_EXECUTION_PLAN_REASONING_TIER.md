# Codex Swarm Execution Plan — Reasoning Tier

**Status:** Active execution blueprint  
**Date:** 2026-03-27

---

## Mission

Build a production-safe, beta-safe, selective Reasoning Tier program for Concept2Cure that can host HRM-class recursive reasoning as an optional backend without destabilizing governed artifact flows.

---

## Workstream Order (Mandatory)

### Phase 0 — Truth Before Ambition
Owner: Repo Truth Reconciliation Agent

Deliverables:
- `docs/audits/REASONING_TIER_REPO_TRUTH_2026-03-27.md`

Exit criteria:
- route governance truth table complete
- stale documentation mismatches enumerated
- beta-blocking bypass paths named

---

### Phase 1 — Architecture & Service Boundary
Owners: Reasoning Tier Architecture Agent + Service Boundary Agent

Deliverables:
- `docs/architecture/REASONING_TIER_ARCHITECTURE.md`
- `docs/architecture/HRM_SERVICE_BOUNDARY.md`
- `docs/architecture/REASONING_TIER_DATA_CONTRACTS.md`
- `docs/architecture/REASONING_TIER_FAILURE_MODES.md`

Exit criteria:
- no hidden coupling to product DB tables
- no direct writes from reasoning service
- strict fail-closed contracts

---

### Phase 2 — Conversation OS Integration Design
Owner: Conversation OS / AnA Integration Agent

Scope:
- map selective triggers to conversation-os plan/scout/proposal flows
- list explicit non-go areas

Exit criteria:
- integration diagram + route insertion points
- policy guard points documented

---

### Phase 3 — Governed Artifact Contract Enforcement
Owner: Governed Artifact Contract Agent

Scope:
- define proposal-to-governed-artifact conversion constraints
- ensure no silent finalization from reasoning outputs

Exit criteria:
- contract test list authored
- failure modes mapped to fail-closed outcomes

---

### Phase 4 — Benchmark Before Integration
Owner: Evaluation & Benchmarking Agent

Deliverables:
- `docs/evals/REASONING_TIER_BENCHMARK_PLAN.md`
- `docs/evals/REASONING_TIER_GOLDEN_TASKS.md`

Exit criteria:
- golden tasks + scoring rubric complete
- beta threshold recommendations complete

---

### Phase 5 — Beta/GA Gate Definitions
Owners: Beta Safety + Launch Gates Agent, QA/Regression Agent

Deliverables:
- `docs/release/REASONING_TIER_BETA_GATES.md`
- `docs/release/REASONING_TIER_GA_GATES.md`

Exit criteria:
- no-go blockers explicit
- route governance requirements codified

---

## Immediate Priority Backlog

P0:
1. Reconcile BETA readiness doc to current route truth.
2. Resolve CERV2 ZIP governance parity decision.
3. Add route governance coverage CI check.

P1:
1. Implement Reasoning Tier gateway adapter contracts.
2. Add shadow-mode execution path in Conversation OS.
3. Add benchmark harness scaffolding.

P2:
1. Multi-backend reasoning mode selection.
2. Cost-aware admission control policies.

---

## What Not To Build Yet

- Broad HRM wiring into all agent flows.
- CUDA stack dependencies in Node monolith.
- UI surfaces that expose model internals instead of business actions.
- GA claims before benchmark and gate evidence package.

---

## Rollback Strategy

- Maintain feature flags per action class.
- Keep fallback non-Reasoning Tier path always available.
- Disable Reasoning Tier by policy without redeploy.
- Preserve normal governed artifact/export flows independent of reasoning availability.

