# AnA 1.0 RI — Cross-Cutting Layers Audit, Enhancement Plan, and Unified Delivery

## Executive Summary

This audit reviewed two cross-cutting concern groups across the current repository implementation:

1. **Governance, Security, and Observability** (trust, bias detection, auditing, safety, compliance, monitoring, causal tracing).
2. **Control Plane / Kernel Abstractions** (microkernel-style minimal core vs monolithic behavior).

### Result

- The platform already has rich compliance and audit primitives in schema and route-level implementations.
- The runtime layer had a gap: `server/src/mw/observability.ts` was a lightweight stub and did not enforce a unified kernel decision model.
- AnA 1.0 RI is now advanced with a **unified microkernel control-plane primitive**:
  - `server/src/control-plane/kernel.ts`
  - Integrated at runtime via `server/src/mw/observability.ts`

This creates a single request-time decision envelope for governance + security + observability controls, including **causal trace records** for policy outcomes.

---

## Scope and Audit Inputs

### Existing Governance / Compliance Assets

- Extensive audit/compliance tables and types already exist in shared schema (`audit_logs`, `audit_trail`, `audit_events`, `regulatory_audit_logs`, `proof_audit_logs`, and others).  
- Existing architecture docs already articulate Part 11 controls and traceability expectations.

### Existing Runtime Layer Findings

- `server/src/mw/observability.ts` was a stubbed logger and did not provide:
  - causal decision graphing,
  - centralized policy decisioning,
  - cross-cutting risk scoring,
  - unified response annotations for denied/reviewed traffic.

### Existing Control-Plane Findings

- Control logic existed in many domain services/routes but was **distributed** and mostly **monolithic-by-accumulation**.
- No explicit microkernel object owned cross-cutting policy evaluation.

---

## Gap Assessment

| Capability | Before | Risk | AnA 1.0 RI Status |
|---|---|---|---|
| Unified control-plane decision object | Missing | Fragmented policy behavior | ✅ Added |
| Runtime governance + security + observability evaluation | Partial/route-specific | Inconsistent enforcement | ✅ Added |
| Bias risk pre-screening at request boundary | Missing as a shared primitive | Silent fairness risk | ✅ Added (heuristic v1) |
| Causal trace for allow/review/deny decisions | Missing in middleware | Weak forensic explainability | ✅ Added |
| Deterministic deny path for immutable resource violations | Partially route-bound | Potential policy bypass | ✅ Added in kernel |

---

## Unified AnA 1.0 RI Control Plane (Microkernel Pattern)

## 1) Kernel abstraction

**File:** `server/src/control-plane/kernel.ts`

Introduces `AnaMicrokernel` with:

- `KernelEvaluationInput` (method/path/actor/tenant/body snippet/headers)
- `KernelEvaluation` (score, decision, flags, trace, controls)
- `KernelTraceStep` (domain, rule id, rationale, evidence)
- Decision outcomes: `allow | review | deny`

## 2) Cross-cutting domains modeled in one pass

Kernel evaluates:

- **Governance**
  - append-only immutability enforcement for audit resources,
  - bias risk screening using protected-attribute signal terms.
- **Security**
  - actor identity presence checks for API traffic.
- **Observability**
  - request fingerprinting + causal decision trace capture.

## 3) Causal tracing (for enterprise auditability)

Every request now receives trace steps with:

- rule identifier,
- decision,
- rationale,
- evidence snapshot,
- timestamp.

This is designed to support future persistence into `audit_*` tables as an operational telemetry stream.

## 4) Runtime integration

**File:** `server/src/mw/observability.ts`

Upgrades middleware from stub to structured cross-cutting layer:

- request-id generation and response propagation (`x-request-id`),
- kernel execution per request,
- attached request decision object (`req.anaKernelDecision`),
- hard deny response for policy-denied traffic,
- structured success/warn/error logs including kernel score/flags,
- centralized error responses enriched with kernel metadata.

---

## Enhancement Plan (Next 4 iterations)

## Iteration 1 (Done in this delivery)

- ✅ Introduce microkernel decision object and trace model.
- ✅ Integrate request middleware with allow/review/deny decisioning.
- ✅ Add baseline governance/security/observability rules.

## Iteration 2 (Planned)

- Persist kernel traces in durable audit tables (e.g., `audit_events` or dedicated `kernel_decision_log`).
- Add dashboarding by flag type (`bias_risk_detected`, `missing_actor_identity`, etc.).
- Add rule versioning metadata (`rule_version`, `policy_bundle_id`).

## Iteration 3 (Planned)

- Replace heuristic bias term screen with model-assisted fairness evaluator and threshold calibration.
- Add false-positive override workflow with human sign-off and immutable rationale.
- Implement policy simulation mode for safe rollout (“shadow” decisions without enforcement).

## Iteration 4 (Planned)

- Expand kernel plugin architecture for:
  - adaptive scheduling signals,
  - risk-tiered compute allocation,
  - tenant-specific governance boundaries,
  - compliance profile packs (FDA Part 11 / Annex 11 / ISO 14971).

---

## Delivery Notes for AnA 1.0 RI

This delivery **builds and unifies** a cross-cutting runtime layer rather than only documenting recommendations. The implementation is intentionally minimal-core (microkernel-style) so domain modules can remain independent while still inheriting enterprise controls.

### What is production-safe now

- deterministic deny for immutable destructive routes,
- request-id and structured telemetry envelope,
- centralized error payload enrichment,
- explicit causal trace generation for policy decisions.

### What still needs enterprise hardening

- persistent kernel trace storage,
- formal risk-model validation package,
- policy rollout controls (canary/shadow/rollback),
- SOC2-style control evidence exports from runtime logs.

---

## Definition of Done for this RI increment

- [x] Cross-cutting audit completed for requested domains.
- [x] Enhancement plan documented with phased execution.
- [x] Microkernel abstraction created.
- [x] Governance + security + observability unified in a single runtime path.
- [x] Causal trace generation integrated into request lifecycle.
