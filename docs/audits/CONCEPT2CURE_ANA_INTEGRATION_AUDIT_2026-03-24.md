# Concept2Cure + AnA Integration / Service / Tooling Audit (2026-03-24)

Status: SUPERSEDED
Canonical: No
Supersedes: —
Superseded By: CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md
Related Reports: CMC_AnA_Integration_Audit_2026-03-25.md


## Scope
This audit covers the runtime layers that connect the AI OS to external systems and operational execution:
- Concept2Cure and AnA API integration surfaces
- Service execution and orchestration layers
- Enterprise connector and tool-invocation pathways
- Build/test/deploy and MLOps-adjacent lifecycle controls

---

## Executive Summary

### Current state (high level)
- **Strong foundation exists** for regulated AI operations: tenant-aware Concept2Cure APIs, 21 CFR Part 11-oriented audit events, AI gateway abstraction, and broad command-based execution in AnA RI.
- **Critical maturity gap remains** in enterprise integrations: the `/api/integrations` layer is currently an in-memory simulation with no persistent connector registry, no secret vault integration, and no provider-grade health/SLA telemetry.
- **Tooling is broad but fragmented**: many scripts/workflows exist for CI, audits, and deployment, but there is no single platform-level integration scorecard/KPI pack that continuously measures connector reliability, sync latency, and execution success rates end-to-end.

### Future-state direction
Move from “feature-complete integration APIs” to **“operationally reliable integration platform”** by implementing:
1. Durable connector control plane (DB + secret manager + token lifecycle)
2. Governed job orchestration for sync and action execution (idempotent, replayable, observable)
3. Unified AI + integration observability (cost, latency, failure domains, compliance)
4. Formal MLOps controls for model/prompt/policy versioning and drift-response workflows

---

## Layer-by-layer Audit

## 1) API & Integration Surface Layer

### Current state
- `Concept2Cure` route stack applies rate limiting, auth, tenant context, and organization checks globally at router level, which is the right baseline for regulated multi-tenant APIs.
- The same surface includes explicit audit logging helper logic with integrity hash generation and persistence to `regulatoryAuditLogs`.
- `AnA RI` exposes structured endpoints for chat, artifact generation, evaluation, observability, and command execution (project/doc/task operations).
- `Enterprise Integrations` route exists but uses an **in-memory Map per tenant** and simulated connection tests/sync behavior.

### Strengths
- Security middleware chain and tenant scoping are already present on core Concept2Cure flows.
- AnA RI API is modular and broad enough to function as an orchestration facade.
- External integration taxonomy is already modeled (OAuth/API key/SAML/passthrough), enabling a migration to production connectors without API redesign.

### Gaps / Risks
- In-memory connector state is non-durable and cannot satisfy regulated auditability or operational continuity.
- Connector APIs currently do not enforce explicit auth middleware within the route module itself, relying on upstream mounting context.
- OAuth callback flow is placeholder-level (no token exchange/rotation/persistence).
- Connection tests are synthetic and not provider-specific.

### Enhancements (priority)
1. **Replace in-memory integration store** with `integrations` + `integration_credentials` + `integration_sync_jobs` tables.
2. **Add connector contract layer** per provider (capabilities, required fields, health checks, rate policies).
3. **Implement secure secret handling** (KMS/Vault/SOPS-backed envelope encryption).
4. **Add OAuth token lifecycle services** (refresh rotation, expiry alarms, revocation tracking).
5. **Promote integration tests from structure-level to behavior-level** with mocked provider adapters.

### Future-state goal
A connector control plane with durable state, auditable credential operations, real provider tests, and per-tenant governance policies.

---

## 2) Service Execution & Action Layer

### Current state
- `AnA RI /execute` dispatches to a command executor covering project/document/task/review/milestone operations.
- Command executor writes primarily via SQL calls and artifact tagging workflows.
- Artifact generation bridges AI output to governed persistence through artifact tagging + quality/evidence checks.

### Strengths
- Action surface is comprehensive enough for hybrid human-AI workflows.
- Artifact generation path explicitly positions output as governed artifacts, not chat-only advice.
- Logging hooks exist for generation events and observability.

### Gaps / Risks
- Command execution is switch-based and tightly coupled; extension risk rises as command count grows.
- No explicit idempotency key strategy for potentially retried execution commands.
- Limited centralized policy checks before command execution (role/purpose/context constraints per command).
- No explicit dead-letter/replay model for failed high-impact actions.

### Enhancements (priority)
1. **Introduce command bus abstraction** with declarative command metadata (authZ scope, idempotency, audit level).
2. **Add idempotency keys** for mutating commands (`create_*`, `update_*`, `revert_*`).
3. **Add execution receipts** (immutable result envelopes with pre/post state hashes).
4. **Queue long-running commands** and expose async status endpoints.
5. **Add policy guardrail layer** for command risk classes (read/write/regulated-write).

### Future-state goal
A resilient “action fabric” where all AI-triggered operations are policy-gated, replayable, and forensically auditable.

---

## 3) AI Gateway & Model Routing Layer

### Current state
- AI Gateway centralizes model routing, fallback handling, policy checks, and audit logging.
- Model registry currently enables Anthropic models and disables OpenAI/Moonshot by configuration.
- Policy engine enforces token limits, prompt-injection heuristics, blocked patterns, and request-rate limits.
- Audit logger supports DB persistence with in-memory fallback.

### Strengths
- Single gateway abstraction is the correct architecture for policy and compliance consistency.
- Deterministic mode supports testability and repeatable outcomes in validation contexts.
- Audit schema and indexed persistence enable downstream reporting and incident analysis.

### Gaps / Risks
- Policy state (rate buckets, daily cost) is in-memory; horizontally scaled deployments will diverge.
- Audit logger buffers in memory and swallows persistence errors (non-blocking), which is safe for uptime but risky without alerting/escalation.
- Provider health and fallback are runtime-local; no centralized circuit-breaker state across instances.

### Enhancements (priority)
1. **Externalize policy counters** to Redis/Postgres for multi-instance consistency.
2. **Add SLO alerts** for audit persistence failures, high fallback rates, and latency regressions.
3. **Create model/prompt/policy version manifest** attached to every request for full traceability.
4. **Implement governance tiers** (e.g., “regulated drafting” pinned to validated model set).

### Future-state goal
A globally consistent AI control plane with deterministic governance modes and enterprise observability.

---

## 4) Tooling, Build/Test/Deploy, and MLOps Lifecycle

### Current state
- The repository has extensive npm scripts and CI workflows for lint/test/audit/deploy and regulatory smoke checks.
- Testing includes route-level and service-level suites for Concept2Cure and AnA components.
- Manufacturing digital twin runtime includes model version/drift concepts, indicating MLOps direction.

### Strengths
- CI/CD and security audit hooks are already in place.
- Test surface is broad and includes both contract-style and behavior-focused suites.
- Drift-aware components exist in at least one operational domain.

### Gaps / Risks
- No single platform-wide MLOps runbook links model versions, prompt versions, policy versions, and deployment approvals.
- Integration connector reliability KPIs are not visibly first-class in CI gates.
- Test suites for enterprise integrations appear mostly structural/module-level rather than end-to-end connector behavior.

### Enhancements (priority)
1. **Define AI change management pipeline** (model/prompt/policy diffs + approval + rollout + rollback).
2. **Add integration reliability scorecard** (sync success %, p95 sync latency, auth refresh success %, MTTR).
3. **Introduce contract tests per external connector** with provider-specific fixtures.
4. **Add canary + shadow evaluation for high-risk AI workflows** before broad rollout.
5. **Publish MLOps lifecycle docs** covering retrain/retire/deprecate and incident response.

### Future-state goal
A governed lifecycle where every AI and integration change is measurable, approval-backed, and operationally reversible.

---

## Target Future-State Goals (by horizon)

### 0–90 days (stabilize)
- Persist integration configs/credentials/sync runs in DB.
- Enforce authZ + tenant policy at integration routes.
- Add real connector health probes (at least 3 core systems: Veeva, DocuSign, SharePoint).
- Add idempotency + execution receipts for AnA mutating commands.

### 3–6 months (harden)
- Move policy/rate/cost counters to shared infrastructure.
- Implement async orchestration for long-running connector sync and document actions.
- Standardize audit envelopes across Concept2Cure, AnA, and AI Gateway.
- Add SRE dashboards and alerting for AI/integration control plane SLOs.

### 6–12 months (scale)
- Build connector SDK + certification program for new enterprise integrations.
- Implement full model/prompt/policy registry with promotion stages (dev/stage/prod).
- Add autonomous remediation loops (token refresh failures, sync retries, drift-triggered safe mode).
- Establish quarterly integration resilience game-days and compliance evidence packs.

---

## Suggested KPIs to Track
- Connector uptime and sync success rate by provider and tenant
- Mean/95th latency for connector operations and AnA command execution
- AI gateway fallback rate and policy-block rate
- Audit log persistence success rate and lag
- % of AI actions with complete execution receipt + post-state verification
- Drift detection frequency and time-to-mitigation for model-backed services

---

## Bottom Line
Concept2Cure + AnA already has a strong **regulated intelligence architecture baseline**. The largest gap is moving enterprise integrations and execution workflows from functional API surfaces to **production-grade, durable, policy-governed operations**. With a connector control plane, shared policy state, and formal MLOps governance, this stack can mature into a fully auditable AI operating system for enterprise regulatory execution.
