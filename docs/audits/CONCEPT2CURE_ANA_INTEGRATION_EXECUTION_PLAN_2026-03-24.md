# Concept2Cure + AnA Integration Execution Plan (Post-Audit)

> Status: ACTIVE
> Canonical: Yes
> Supersedes: —
> Superseded By: —
> Related Reports: BETA_READINESS_MASTER.md; CONCEPT2CURE_ANA_INTEGRATION_AUDIT_2026-03-24.md


**Date:** 2026-03-24  
**Scope:** Integration / Service / Tooling layers that connect AnA + Concept2Cure to external systems and enterprise execution flows.

---

## 1) Plan Objective
Move from a hardened integration API surface to a **fully governed integration operating model** with:
- Reliable connector lifecycle controls
- Regulated-grade auditability and replayability
- Measurable SLO/KPI operations
- Phased rollout with explicit acceptance gates

---

## 2) Current Delivery Snapshot

### Completed in recent implementation cycles
- Durable connector control plane with DB-backed storage + fallback.
- Route-level auth, tenant context, org enforcement, and rate limiting.
- Idempotent mutation semantics with execution receipts.
- Sync run capture, connector/per-service health APIs, and KPI summary endpoint.
- Provider catalog and provider-required configuration validation.
- Expanded route-level test coverage for core control-plane workflows.

### Remaining gaps from audit
- Externalized idempotency and policy counters (currently in-memory for cache/replay).
- Real provider API probes (current checks remain mostly contract/config-based).
- Secret manager-backed credential storage (KMS/Vault indirection).
- Async orchestration and retry policy framework for long-running sync workloads.
- Unified AI + integrations dashboard with SLO alerting and incident runbooks.

---

## 3) Execution Phases

## Phase A — Reliability & Governance Foundation (0–4 weeks)

### A1. Externalize idempotency + replay state
- **Action:** Move idempotency cache from in-memory map to Redis.
- **Acceptance criteria:**
  - Idempotent replay survives process restarts.
  - Deterministic behavior across horizontal instances.
  - Replay TTL and eviction policy configurable.
- **Primary KPI:** duplicate mutation rate < 0.5%.

### A2. Credential governance hardening
- **Action:** Introduce `credential_ref` model with encrypted secret references (no plaintext secrets in integration config payloads).
- **Acceptance criteria:**
  - No sensitive fields returned by any integration endpoint.
  - Secret rotation flow documented and tested.
- **Primary KPI:** 100% connectors using secret references.

### A3. Audit closure completeness
- **Action:** Add explicit audit events for every mutating action path (including failures and policy blocks).
- **Acceptance criteria:**
  - Success + failure audit pairs visible for connect/disconnect/sync and configuration updates.
  - Audit query by tenant/action/integration returns complete lifecycle.
- **Primary KPI:** audit coverage = 100% for mutation endpoints.

---

## Phase B — Operational Scale (4–8 weeks)

### B1. Connector job orchestration
- **Action:** Introduce async job execution pattern for sync operations with queue-backed workers and retry policies.
- **Acceptance criteria:**
  - `/sync` returns job ID + status endpoint.
  - Retries include bounded backoff and dead-letter classification.
- **Primary KPI:** sync success rate > 98% for healthy providers.

### B2. Provider probe framework
- **Action:** Replace generic tests with provider-specific test adapters.
- **Acceptance criteria:**
  - Each catalog provider defines probe strategy and minimum required credential set.
  - Health endpoint includes provider probe status + last probe reason.
- **Primary KPI:** false-positive “healthy” rate < 2%.

### B3. SLO dashboarding
- **Action:** Create shared ops dashboard for connector status, sync outcomes, and AI+integration routing errors.
- **Acceptance criteria:**
  - p95 sync duration, success rate, stale connector count visible per tenant.
  - Alert policies for stale connectors and repeated sync failures.
- **Primary KPI:** MTTD < 5 minutes for sustained failures.

---

## Phase C — Regulated Operations Maturity (8–12 weeks)

### C1. Change management gates
- **Action:** Add CI contract tests per provider and promote-gate checks for integration route changes.
- **Acceptance criteria:**
  - Any provider contract break fails CI.
  - Release notes auto-include integration compatibility matrix.
- **Primary KPI:** zero unplanned connector regressions per release.

### C2. Incident & replay workflows
- **Action:** Implement operator replay tools for failed syncs and auditable manual remediation.
- **Acceptance criteria:**
  - Replay requests produce signed execution receipt and full audit chain.
  - Runbook-driven remediation workflow tested in staging game-day.
- **Primary KPI:** MTTR < 30 minutes for replay-eligible failures.

### C3. Compliance evidence automation
- **Action:** Build periodic export bundle for integration controls and audit proofs.
- **Acceptance criteria:**
  - Automated monthly evidence package generation.
  - Includes policy, audit events, connector health timelines, and incident summaries.
- **Primary KPI:** compliance evidence prep time reduced by 70%.

---

## 4) Work Breakdown Structure (WBS)

## Epic 1 — Connector Runtime Hardening
- Externalized idempotency cache (Redis)
- Secret reference model + migration
- Provider credential policy checks

## Epic 2 — Sync Orchestration Runtime
- Queue-backed sync jobs
- Retry/backoff + dead-letter
- Sync result signing and replay endpoints

## Epic 3 — Observability and SRE
- KPI/SLO telemetry standardization
- Alert routing and on-call dashboards
- Tenant-level reliability scorecards

## Epic 4 — Compliance & Evidence
- Mutation/failure audit normalization
- Evidence bundle automation
- Quarterly resilience + compliance game-days

---

## 5) Delivery Governance

- **Cadence:** weekly implementation review + fortnightly risk review.
- **Entry criteria for each phase:** tests green, no critical security findings, migration/backout plan approved.
- **Exit criteria for each phase:** acceptance criteria met + KPI thresholds achieved for two consecutive weeks.

---

## 6) Immediate Next Sprint Backlog (Ready Now)

1. Redis-backed idempotency service abstraction + adapter wiring.
2. Secret reference data model (`integration_credentials`) and endpoint contract update.
3. Provider probe interface + initial adapters for Slack, Jira, SharePoint.
4. `/sync` async job skeleton with job status endpoint.
5. Dashboard data contract for integration KPI panel.

---

## 7) Risk Register (Initial)

- **R1: Token leakage risk** if any route logs raw connector config.
  - Mitigation: strict log scrubbing and centralized serializer.
- **R2: False health signals** from non-provider-specific tests.
  - Mitigation: provider probe adapters + SLA confidence labels.
- **R3: Inconsistent replay behavior** during scale-out.
  - Mitigation: externalized idempotency + deterministic request fingerprinting.
- **R4: Compliance drift** if mutation failures are not audited.
  - Mitigation: mandatory audit wrapper and contract tests.

---

## 8) Decision Log Hooks

Add ADRs for:
- Idempotency backend selection (Redis vs DB).
- Credential reference architecture.
- Sync orchestration engine (queue and retry semantics).
- Health probe policy and SLO definitions.

