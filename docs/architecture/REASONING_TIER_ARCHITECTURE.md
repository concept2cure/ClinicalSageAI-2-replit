# Reasoning Tier Architecture (Selective, Beta-Safe)

**Status:** Proposed (Phase 1 architecture baseline)  
**Date:** 2026-03-27

---

## 1. Objective

Introduce a **separate Reasoning Tier service boundary** that can host HRM-class recursive/hierarchical reasoning for high-stakes regulatory tasks, without destabilizing:

- governed artifact workflows,
- provenance/audit guarantees,
- export governance behavior,
- beta product reliability.

---

## 2. Non-Negotiable Principles

1. **Not default intelligence path** (selective invocation only).
2. **No direct DB writes** from Reasoning Tier into product databases.
3. **Fail-closed contracts**: uncertain or failed runs do not silently become accepted artifacts.
4. **Governance in product app**: final artifact decisions remain in Concept2Cure app layer.
5. **Regulated explainability**: all outputs must include evidence, uncertainty, and stop reason.

---

## 3. Service Topology

```text
Client/UI Action
   -> Conversation OS (Node/TS orchestration + policy)
   -> Reasoning Tier Gateway Adapter (Node/TS)
   -> Reasoning Tier Service (isolated process/container)
   <- Structured Reasoning Result
   -> Proposal creation (Conversation OS)
   -> Human accept/reject path
   -> Governed artifact registration (if accepted)
```

### Separation of concerns

- **Conversation OS / Node app** owns identity, org/project context, policy checks, artifact acceptance, audit writeback.
- **Reasoning Tier service** owns heavy reasoning computation only.

---

## 4. In-Scope Actions (Selective Triggers)

Reasoning Tier invocation allowed for:
1. Cross-artifact contradiction scan.
2. Reviewer challenge simulation.
3. Evidence reconciliation across versions/studies.
4. High-stakes strategy memo analysis.
5. Pre-acceptance consistency checks.

Explicitly out-of-scope:
- routine drafting,
- basic Q&A,
- standard retrieval,
- export rendering,
- routine form assembly.

---

## 5. Request/Response Lifecycle

1. User/system requests high-stakes action in Conversation OS.
2. Conversation OS validates context + policy + feature flag.
3. Adapter submits normalized request to Reasoning Tier.
4. Reasoning Tier returns structured result with confidence/failure metadata.
5. Conversation OS converts result into proposal candidate.
6. Human (or policy-approved automation class) accepts/rejects.
7. Accepted outputs become governed artifacts via existing governance paths.

---

## 6. Reliability/Safety Controls

- Hard timeout per action class.
- Circuit breaker and fallback path.
- Retry with idempotency key.
- Response size limits.
- Structured stop reasons (`timeout`, `insufficient_evidence`, `policy_denied`, etc.).
- Mandatory `human_review_required` signaling for regulated actions.

---

## 7. Rollout Plan (Architecture-Level)

- **Stage A:** Shadow mode (no product writeback).
- **Stage B:** Proposal-only mode (human approval required).
- **Stage C:** Controlled production (selected orgs/workspaces).
- **Stage D:** GA candidate after benchmark + gate thresholds pass.

---

## 8. Integration Anchors

Primary orchestration anchor: `server/routes/conversation-os.ts` + Conversation OS services.

No direct integration to export routes in early phases.

---

## 9. Open Decisions

1. Which backend(s) to host in Reasoning Tier (HRM OSS vs verifier loop hybrid).
2. SLA targets per action class.
3. Human review policy granularity by action severity.
4. Cost controls and admission thresholds.

