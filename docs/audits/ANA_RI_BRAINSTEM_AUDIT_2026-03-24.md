# AnA 1.0 RI Brainstem / Kernel Audit (Concept2Cure OS)

**Date:** 2026-03-24  
**Scope:** Agent orchestration, model/tool routing, workflow execution, planning/reasoning, memory, adaptive scheduling

## Executive Summary

AnA 1.0 RI has a **solid orchestration foundation** but is currently a **hybrid of static rules + selective multi-agent pipelines** rather than a fully autonomous kernel.

What is strong today:
- Intent- and submission-aware prompt orchestration is implemented and production-usable.
- A centralized AI Gateway exists with policy checks, provider fallback, audit logging, and task-based routing.
- A robust sequential multi-agent council (Drafter → Statistician → Critic → Synthesizer) is implemented with retries, failover, and tamper-proof audit logging.
- Tool registry + persistent tool-run audit trail exists.
- Working memory summaries exist for long-thread compression.

What is missing for “Brainstem/Kernel maturity”:
- No single global planner policy that chooses among *all* orchestrators, tools, and workflows via optimization.
- Core workflow orchestration still uses in-memory execution state for one major path (not fully durable/distributed scheduler semantics).
- Intent routing in AnA RI is still mostly regex/rule-based rather than confidence-calibrated model-based routing.
- No explicit budget-aware, SLA-aware, or reward-driven adaptive scheduler (ML/RL loop absent).
- Shared multi-agent blackboard memory/protocol is partial; memory is available but not yet unified across all agent systems.

## Current State by Capability

## 1) Agent Orchestration

### Implemented
- **AnA RI orchestrator** composes system prompt from detected intent, submission type, role, document actions, and continuity context. It injects command capabilities for action execution.
- **Multi-Agent Council** runs a deterministic 4-stage pipeline with retry/backoff and provider failover.
- **Agent Swarm route** exists as an orchestration surface for role-based agent assignment and HITL states.

### Gap
- There are multiple orchestrators (AnA RI prompt orchestrator, workflow orchestrator, council/swarm) but no single “meta-orchestrator” arbitration layer.

## 2) Model / Provider Routing

### Implemented
- **AI Gateway** centralizes model selection, policy checks, health tracking, fallback, and audit logging.
- Task-based provider preferences are declared by task type.
- Deterministic mode and routing strategies are implemented.

### Gap
- Routing is policy/rule configured, but not feedback-learning from outcome quality + cost + latency over time.
- Legacy/parallel provider router patterns still exist in codebase (risk of split-brain routing behavior).

## 3) Workflow Management & Planning

### Implemented
- Workflow orchestrator supports templates, sequenced steps, audit trail, blockers, result aggregation.
- Cross-object payload assembly and recommendation/readiness engines provide structured reasoning outputs.

### Gap
- In-memory workflow execution store is still used in this orchestration path; this limits distributed resilience and recovery.
- Planning is template/sequential and lacks dynamic replanning policy under uncertainty.

## 4) Tool Calling

### Implemented
- Tool registry has typed definitions, aliasing, OpenAI function conversion, and execution audit persistence (`chat_tool_runs`).
- AnA RI exposes command embedding for actionful responses.

### Gap
- Tool-chain safety controls are not globally enforced at planner level (e.g., allow/deny by risk context, dynamic privilege policy, bounded chaining depth).

## 5) Memory Management

### Implemented
- Working memory service summarizes conversation into structured blocks (objective, locked facts, decisions, open questions, next actions, artifacts, exclusions).
- Refresh thresholds and storage/retrieval methods are defined.

### Gap
- Memory is not yet a shared, first-class blackboard across all orchestrators/agents with explicit read/write contracts and conflict resolution.

## 6) Adaptive Scheduling

### Implemented
- Retries, fallbacks, and provider health checks exist.

### Gap
- No explicit adaptive scheduler optimizing for objectives (quality/cost/latency/risk) using learned policies.
- No closed-loop reward instrumentation tying orchestration decisions to downstream regulatory outcomes.

## Maturity Assessment (AnA 1.0 RI Kernel)

- **Orchestration:** 7/10
- **Model/Tool Routing:** 7/10
- **Workflow Durability:** 6/10
- **Planning/Autonomy:** 5/10
- **Shared Memory:** 5/10
- **Adaptive Scheduling:** 4/10

**Overall kernel maturity:** **5.7/10** (strong production scaffolding; not yet autonomous goal-driven brainstem).

## Enhancements Needed (Prioritized)

## Priority 0 (Immediate: 2–4 weeks)

1. **Create a Kernel Decision Record (KDR) for every orchestration turn**
   - Persist: selected orchestrator, selected model/tool chain, alternatives considered, confidence, cost/latency/risk budget.
   - Why: enables observability + supervised learning corpus for future adaptive scheduler.

2. **Unify routing through one gateway contract**
   - Consolidate active codepaths to one policy authority for model selection/fallback.
   - Why: avoid inconsistent routing logic and policy drift.

3. **Add policy guardrails for tool chains**
   - Enforce max chain depth, privileged-tool gating, argument schema hard-fail, risk-tier allowlists.
   - Why: reduce tool injection and unsafe escalation paths.

## Priority 1 (Near term: 1–2 quarters)

4. **Implement a meta-orchestrator arbitration layer**
   - Inputs: task class, urgency, compliance criticality, token budget, context size, confidence needs.
   - Outputs: execution plan selecting among: direct single-model response, AnA orchestrator, workflow orchestrator, council run, swarm run.

5. **Durable workflow state standardization**
   - Move remaining in-memory workflow execution state to DB-backed durable state machine.
   - Add lease/heartbeat semantics for distributed workers.

6. **Shared memory contract (blackboard-lite)**
   - Introduce normalized memory entities: `facts`, `assumptions`, `decisions`, `open_questions`, `constraints` with provenance.
   - Agents must read from and write to this shared contract.

7. **Confidence-calibrated intent routing**
   - Replace/augment regex-only intent classification with lightweight model classifier + confidence threshold fallback.

## Priority 2 (Mid term: 2–3 quarters)

8. **Adaptive scheduler v1 (contextual bandit before RL)**
   - Optimize model/tool/orchestrator selection under multi-objective score:
     `score = quality_weight*Q - cost_weight*C - latency_weight*L - risk_weight*R`
   - Start with contextual bandits and offline policy evaluation.

9. **Goal-driven planner with replanning loop**
   - Planner emits explicit plan graph (steps, dependencies, success criteria, rollback).
   - Replan on confidence drop, tool failure, or contradiction detection.

10. **Protocolized inter-agent collaboration**
   - Standardize messages (`proposal`, `critique`, `evidence_request`, `decision`) and add negotiation/consensus rules.

## Suggested “Kernel v2” Reference Architecture

- **Kernel Router:** global task triage + budget/risk policy
- **Planner:** goal decomposition, constraint-aware planning, replanning
- **Executor:** durable workflow runtime, step leasing, retries, compensation
- **Tool Broker:** capability registry + policy enforcement + sandbox class
- **Memory Fabric:** shared blackboard with provenance and contradiction flags
- **Evaluator:** response quality, factuality, compliance risk scoring
- **Adaptive Scheduler:** learned policy for orchestrator/model/tool selection
- **Governance Plane:** immutable audit logs + policy versioning + human override

## Data / Telemetry Needed to Enable Autonomy

Minimum events to log per step:
- `task_received`, `planner_selected`, `orchestrator_selected`, `model_selected`, `tool_called`, `step_completed`, `step_failed`, `replanned`, `human_override`, `artifact_accepted/rejected`.

Minimum labels/rewards:
- Reviewer acceptance, rework count, critical deficiency count, latency percentile, token cost, hallucination/citation failures.

Without this data, adaptive scheduling cannot be trained or safely validated.

## Risks if left as-is

- Static routing may overpay or underperform for complex workloads.
- Multiple orchestration pathways can diverge in governance behavior.
- Incomplete shared-memory contracts can cause inconsistent agent outputs.
- Lack of learned scheduling can cap quality and operational efficiency at scale.

## Recommended Next Milestone

**“Kernel Stabilization Sprint” (6 weeks)**
- Week 1–2: unify routing contract + KDR event schema + chain guardrails.
- Week 3–4: durable workflow state migration + shared memory contract v1.
- Week 5–6: contextual-bandit scheduler pilot behind feature flag for one task family (`regulatory_review`).

This sequence maximizes safety and observability first, then introduces adaptivity with controlled blast radius.
