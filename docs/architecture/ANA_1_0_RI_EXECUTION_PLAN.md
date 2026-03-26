# AnA 1.0 RI — Execution Plan (Continuation)

## Purpose

This document continues the audit work and translates it into an actionable build plan with concrete deliverables, sequencing, and acceptance criteria.

## Current Build Baseline

Delivered runtime primitives now include:

- A versioned microkernel policy bundle with enforce/shadow modes.
- Request-time cross-cutting evaluation (governance, security, observability).
- Structured decision traces with rule IDs and versions.
- In-process kernel decision logging buffer for rapid operational inspection.

## Workstream Plan


## Implemented in this continuation

- Policy bundle versioning and operating mode (`enforce`/`shadow`) are now implemented in code.
- Identity-exempt route patterns are now explicit in policy.
- In-process decision summary capability is now available for operational triage.
- Kernel and decision-log unit tests are now added for deterministic behavior checks.

- Control-plane operations endpoints added for summary/policy/recent/simulate/clear under `/api/control-plane/kernel/*`.
- Persistent summary endpoint added: `/api/control-plane/kernel/summary/persistent?hours=N`.
- Audit-report endpoint added: `/api/control-plane/kernel/audit-report?hours=N` with maturity scoring + recommendations.
- Rule-catalog endpoint added: `/api/control-plane/kernel/rules` with regulatory references per control.
- Regulatory Affairs/Medical Writing guardrails added for scientific-integrity risk terms and high-risk CER/510(k)/eCTD/CMC route controls.

## WS-1: Governance Hardening

### Deliverables

1. **Bias control pack v1.2**
   - Calibrated dictionaries by domain context.
   - Human override workflow and rationale capture.
2. **Policy version lifecycle**
   - Draft, staged, active, and retired bundle states.
   - Activation guardrails with rollback references.

### Acceptance Criteria

- Every reviewed request has an explicit reviewer action and rationale.
- Policy changes are immutable and traceable by bundle ID/version.

## WS-2: Security Convergence

### Deliverables

1. **Actor identity integrity checks**
   - Resolve actor from auth principal first, fallback headers second.
2. **Tenant boundary assertions**
   - Hard-fail on mismatched tenant claim vs request scope.

### Acceptance Criteria

- 100% of API requests carry authenticated actor context or are explicitly exempt.
- Tenant mismatch events are denied and captured in kernel logs.

## WS-3: Observability + Audit Persistence

### Deliverables

1. **Persistent decision sink**
   - Move from memory buffer to DB-backed append-only table.
2. **Operational dashboards**
   - Decision rates (allow/review/deny), top flags, policy drift indicators.

### Acceptance Criteria

- ≥ 99% decision event persistence success for API traffic.
- Queryable dashboard panels for 24h/7d/30d windows.

## WS-4: Control Plane Productization

### Deliverables

1. **Plugin interface**
   - Register/deregister rule packs by capability domain.
2. **Shadow simulation mode at scale**
   - Compare enforced vs hypothetical decisions prior to rollout.

### Acceptance Criteria

- Plugin packs can be enabled per tenant without code changes.
- Shadow-vs-enforce delta report generated for each policy release.

## Timeline (RI)

- **Sprint A (Week 1-2):** WS-1 + WS-2 foundations.
- **Sprint B (Week 3-4):** WS-3 persistence + dashboards.
- **Sprint C (Week 5-6):** WS-4 pluginization + shadow rollout reports.

## Delivery Risks and Mitigations

1. **Risk:** false-positive bias flags interrupt workflows.  
   **Mitigation:** deploy in shadow mode first, measure precision/recall against reviewer feedback.

2. **Risk:** log persistence introduces latency.  
   **Mitigation:** async queue and batched writes with backpressure metrics.

3. **Risk:** policy bundle sprawl across tenants.  
   **Mitigation:** signed policy manifests and central approval workflow.

## Definition of Done (Continuation)

- [ ] Decision persistence table live and append-only.
- [ ] Review queue + override workflow available.
- [ ] Tenant-scoped policy bundle activation implemented.
- [ ] Shadow-vs-enforce comparison report automated.
- [ ] Cross-cutting dashboard delivered to operations.



## Persistence rollout notes (WS-3 kickoff)

- Added migration: `db/migrations/20260324_ana_kernel_decision_log.sql`.
- Added optional runtime persistence sink controlled by `ANA_KERNEL_PERSIST=true`.
- Default mode remains non-persistent + in-memory buffer to avoid rollout regressions.
- Recommended rollout path:
  1. apply migration in staging,
  2. enable `ANA_KERNEL_PERSIST=true` in staging,
  3. verify write volume/latency,
  4. enable in production with alerting.

