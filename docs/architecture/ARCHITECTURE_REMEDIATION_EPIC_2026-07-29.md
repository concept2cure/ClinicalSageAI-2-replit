# Architecture Remediation Epic — Enterprise / GxP Readiness

**Epic ID:** ARCH-REM-001  
**Priority:** Critical  
**Status:** Proposed — feature freeze and baseline approval required  
**Document owner:** Architecture control tower  
**Last updated:** 2026-07-29  
**Target outcome:** Establish canonical tenant, transaction, command, governance,
schema, lifecycle, and AI execution foundations before further feature growth.

## 1. Operating decision

This is a remediation program, not a generic defect backlog. Systemic findings
must be corrected in the canonical infrastructure and then adopted by bounded
domains. Teams must not patch each feature independently or mass-implement the
target architecture before its contracts and decision records are approved.

The existing [GA readiness plan](../GA_READINESS_PLAN.md) remains the product
release plan. This epic is its architecture and assurance control plan. Existing
readiness reports are evidence inputs, not proof that a control is effective.

### Non-negotiable constraints

1. Security, policy, review, approval, export, and submission gates fail closed.
2. No experimental service writes directly to regulated artifact tables.
3. No new infrastructure path is enabled by default before benchmark and
   recovery evidence exists; use a feature flag while migrating.
4. A control is not complete because code exists. Completion requires executable
   evidence, an owner, and an approved rollback procedure.
5. Every data contract records tenant ownership, transaction ownership,
   authorization, audit/provenance behavior, and idempotency semantics.
6. Production data must not be copied into remediation test fixtures.

## 2. Program governance

### Roles

| Role | Accountability |
|---|---|
| Architecture control tower | Repository truth, contract approval, branch/worktree allocation, merge order, exceptions, and release gates |
| Security and tenancy owner | Tenant-context contract, RLS posture, pool contamination controls, and adversarial isolation evidence |
| Governance and observability owner | Governed mutations, audit/provenance controls, evidence collection, SLOs, and alerting |
| Domain owner | Migration of one bounded domain to approved foundations and domain-specific verification |
| Independent reviewer | Challenges control design and signs phase-exit evidence; may not approve their own implementation |
| Quality/compliance owner | Validation plan, traceability matrix, Part 11/Annex 11 evidence, deviations, and release disposition |

The control tower begins with at most the tenancy and governance/observability
implementation workstreams. Retrieval, workflow/compute, and evaluation/release
workstreams may start only after their interface contracts are approved.

### Status vocabulary

Every work item uses one of: `discovery`, `contract proposed`, `contract
approved`, `implementing`, `evidence review`, `accepted`, or `blocked`. “Done” is
not a valid status. All items begin in `discovery`; this plan makes no claim that
the described vulnerabilities or controls have already been exhaustively proven.

### Required work-item fields

Each implementation issue must include:

- stable control/work-item ID and category;
- severity, accountable owner, estimate, and dependencies;
- affected entry points and data stores;
- current-state evidence with repository revision;
- approved target contract and threat/failure model;
- acceptance criteria and executable verification command;
- rollout flag, compatibility period, rollback trigger, and rollback steps;
- evidence artifact location and independent reviewer.

Exceptions must identify compensating controls, approver, expiry date, and a
linked removal issue. Expired exceptions fail the release gate.

## 3. Phase gates and deliverables

Phases are ordered by dependency rather than calendar. Later discovery may run
read-only, but implementation cannot cross the listed entry gate.

### Phase 0 — Freeze and protect

**Purpose:** Produce a reproducible baseline before architecture changes.

| ID | Deliverable | Acceptance evidence |
|---|---|---|
| P0-01 | Feature freeze, protected release branch, mandatory review, and infrastructure architecture review | Repository settings export and approved change policy |
| P0-02 | Database schema snapshot and migration lineage | Checksummed schema-only dump, migration manifest, restore verification, and environment metadata |
| P0-03 | OpenAPI/API, command, and AI-tool registry snapshots | Versioned, checksummed artifacts with generation commands and drift checks |
| P0-04 | Architecture/current-state map | Runtime boundaries, trust boundaries, data flows, stores, external dependencies, and owners |
| P0-05 | Performance and reliability baseline | Reproducible workload, latency/error/resource measures, dataset description, and run metadata |
| P0-06 | Rollback strategy | Restore point, deployment rollback, schema compatibility window, decision owner, and rehearsal record |

**Exit gate:** Baselines are reproducible from the locked revision, rollback has
been rehearsed in a non-production environment, and the control tower approves
the first two implementation workstreams.

#### Phase 0 baseline capture command

After generated API contracts and registries have been refreshed, capture their
tracked source/artifact fingerprints together with schema, migration, ADR, and
architecture-control fingerprints:

```bash
npm run architecture:baseline
npm run architecture:baseline:verify
```

The generated `docs/architecture/baselines/remediation-baseline.json` records the
Git revision, categorized repository-relative paths, byte lengths, and SHA-256
digests. It intentionally does not copy contract or schema contents into the
manifest. Store an approved baseline on the protected release branch and require
review for changes. Verification fails on revision drift and on added, removed,
or modified inventoried artifacts when run with
`node scripts/architecture/capture-remediation-baseline.mjs --verify <path>
--strict-revision`. The npm verification command checks artifact drift but does
not require the capture commit to equal `HEAD`, because committing the manifest
necessarily advances the branch. Recapture is an explicit baseline approval,
not an automatic CI repair.

For an approval candidate, start from a clean reviewed revision and run
`npm run architecture:baseline:release`. This variant refuses capture when any
tracked or untracked non-ignored file is present, preventing draft contracts
from entering release evidence. Committing the newly generated manifest is the
subsequent reviewed baseline-change step.

### Phase 1 — Security and multi-tenant integrity (P0)

#### Tenant context and RLS contract

- Inventory every HTTP, job, queue, CLI, WebSocket, tool, and internal service
  entry point that can read or mutate tenant-owned data.
- Remove request-scoped and global database fallbacks for tenant-owned access.
- Require a validated tenant principal; missing, malformed, or conflicting
  context is rejected before data access.
- Verify RLS for every tenant-owned table and every read/mutation path, including
  privileged roles and background work.
- Production startup accepts only `RLS_ENFORCE=on`; absent, `off`, `shadow`, or
  unknown values terminate startup. Non-production overrides must be explicit,
  environment-scoped, and observable.

#### Connection-pool safety contract

- Acquire a connection, begin the request transaction, set tenant context with
  transaction-local scope, perform work, and commit/rollback before release.
- If context setup, work, rollback, or reset verification fails, destroy rather
  than recycle the connection.
- Prove isolation under concurrent tenants, cancellation, timeout, driver error,
  rollback failure, and pool reuse. Include sentinel values that make leakage
  detectable without exposing production data.

**Exit gate:** No known tenant-owned access bypasses the canonical context; an
adversarial test suite demonstrates no cross-request disclosure or mutation under
normal and injected-failure conditions; production boots fail closed unless RLS
is on. Zero findings is established by evidence, not search results alone.

### Phase 2 — Transaction integrity

Create a mutation inventory covering projects, artifacts, versions, tasks,
audit, memory, AI provenance, notifications, and outbox writes. For every
mutation specify:

- atomic transaction boundary and owning service;
- allowed side effects and their ordering;
- partial-commit and rollback behavior;
- stable idempotency key, uniqueness enforcement, and retry semantics;
- audit/provenance records written in the same transaction;
- external effects emitted through a transactional outbox or an explicitly
  approved compensating protocol.

**Deliverable:** One approved transaction-boundary specification plus contract,
fault-injection, duplicate-delivery, and rollback tests.

**Exit gate:** Critical mutations cannot partially commit, retries cannot create
duplicate regulated effects, and audit/provenance cannot claim an effect that did
not commit.

### Phase 3 — Command framework

1. Audit each handler for signature, validation, authorization, Part 11 impact,
   audit behavior, transaction, rollback, response, and idempotency.
2. Establish one generated or mechanically checked contract joining command ID,
   schema, handler, authorization policy, prompt/tool exposure, documentation,
   and tests. Registry drift fails CI.
3. Replace regex-only command interpretation with structured JSON Schema
   validation, explicit coercion rules, payload/depth/command-count limits,
   duplicate prevention, and batch schemas. Untrusted model output never becomes
   executable without validation and authorization.
4. Define dispatcher modes: atomic, compensating, best effort, and dry run.
   Each response identifies the requested mode, per-command disposition,
   committed effects, compensation status, audit correlation ID, and whether the
   result is safe to retry.

**Exit gate:** Every enabled command has a synchronized contract and automated
positive/negative tests; malformed or unauthorized batches fail closed; mode
semantics are verified under injected failures.

### Phase 4 — Document governance

Route status, approval, promotion, placement, version, freeze, signature, export,
and submission changes through a single governed mutation boundary. Direct SQL
or ORM writes for these transitions are prohibited by architecture tests. The
boundary must preserve tenant context, authorization, reason, signature/evidence,
audit/provenance, transactionality, and idempotency.

**Exit gate:** The mutation inventory and architecture tests show no unapproved
direct lifecycle write path.

### Phase 5 — Workflow state machine

Adopt an explicit versioned lifecycle (initial candidate: Draft → Review →
Approved → Locked → Released → Superseded → Archived). The approved contract—not
this example—defines valid transitions. Each transition evaluates policy,
authorization, required evidence, audit, Part 11 controls, reason, approvals,
transaction behavior, and reversal/compensation rules.

**Exit gate:** All lifecycle entry points use the engine; illegal and stale-state
transitions are rejected; concurrency, signature, rollback, and audit tests pass.

### Phase 6 — AnA runtime

| Area | Required remediation evidence |
|---|---|
| Prompt builder | Ordered source/provenance trace for system, developer, tenant, project, artifact, memory, conversation, evidence, commands, policy, and output constraints; conflict rules; duplication and token-budget metrics |
| Tool execution | Complete inventory of schemas, RBAC, mutation class, external calls, timeout/retry/idempotency policy, observability, audit, and output handling |
| Agent loop | Duplicate detection, deterministic termination ceilings, tool ranking policy, result pruning, context budget, bounded retries, and loop-exhaustion behavior |
| Memory | Scope contract for working, long-term, conversation, project, organization, and user memory; tenant isolation, versioning, expiry, conflict resolution, consent/retention, and grounding |

**Exit gate:** One trace correlates prompt inputs, model/provider/version and
parameters, tool authorization/execution, evidence, memory changes, token/cost
accounting, and persisted artifacts without logging disallowed sensitive content.
Prompt-injection, memory-poisoning, loop, timeout, and replay tests pass.

### Phase 7 — Canonical database schema

Audit foreign keys, indexes, duplicate tables, nullability, uniqueness/check
constraints, triggers, partitioning, sequences, migration history, tenant keys,
and dead schema. Resolve findings through approved ADRs and reversible migrations.

**Exit gate:** A canonical schema ownership map exists; schema contract tests and
representative query plans pass; deprecated objects have migration and retention
decisions rather than silent deletion.

### Phase 8 — Canonical migration system

Select one migration lineage through the ADR process. Fresh install and upgrade
must use the same deterministic ordering and ledger. Heuristic ordering,
duplicate suppression, and “retry until successful” behavior are prohibited.

**Exit gate:** Empty-install, supported-version upgrade, rollback/restore, and
drift tests produce the expected checksummed schema in clean environments.

### Phase 9 — AI gateway

Approve contracts for provider abstraction, streaming event shape, fallback
eligibility, bounded retries, timeouts/cancellation, token and cost accounting,
model selection, context limits, observability, caching, and determinism. A
fallback may not weaken residency, privacy, validation, or model-approval policy.

**Exit gate:** Provider contract and fault-injection suites pass, policy-ineligible
fallbacks fail closed, streams terminate cleanly, and accounting reconciles.

### Phase 10 — Performance

Measure N+1 behavior, large queries, missing indexes, memory, CPU, latency,
serialization, streaming, prompt construction, embedding generation, and cache
behavior against the Phase 0 workload. Define SLOs and capacity thresholds before
optimization. Benchmarks record revision, environment, dataset, concurrency,
warm-up, repetitions, percentiles, and error rate.

**Exit gate:** Critical-path SLOs and regression budgets are approved and enforced
in a stable performance environment; alternate paths remain flagged until they
meet correctness and recovery gates as well as speed targets.

### Phase 11 — Dead code

Inventory unused routes, services, migrations, React components, endpoints, AI
tools, providers, and utilities. Confirm runtime registration, dynamic imports,
operational scripts, retention duties, and legal holds before removal. Archive
required evidence and publish compatibility notices where applicable.

**Exit gate:** Every candidate is deleted, retained with justification/owner and
expiry, or quarantined behind a documented compatibility boundary.

### Phase 12 — Verification system

Add architecture, tenant-leak, race, transaction, migration, load, prompt
regression, golden-output, command-contract, RLS, memory-poisoning, and agent-loop
tests. Map every critical control to automated tests and retained run evidence.
Golden outputs must distinguish deterministic assertions from reviewed
non-deterministic quality ranges.

**Exit gate:** The control traceability matrix contains no unmapped critical
control, flaky critical test, or unexplained skipped test.

### Phase 13 — Enterprise readiness

Assess SOC 2, HIPAA, 21 CFR Part 11, Annex 11, and GDPR applicability with
qualified legal/compliance review. Verify audit integrity, backups, restore,
disaster recovery, high availability, encryption, key rotation, secrets, access
review, retention, incident response, and vendor controls. Do not equate a passing
technical test with certification or regulatory compliance.

**Exit gate:** Approved validation and traceability packs, restore/DR exercises,
open-risk acceptance, and quality release disposition exist for the intended use
and deployment model.

### Phase 14 — Technical-debt register

Maintain one evidence-linked register categorized by security, architecture,
performance, reliability, maintainability, scalability, and compliance. Each
entry carries severity, owner, estimate, dependencies, acceptance criteria,
target milestone, and aging. Duplicate observations link to one root issue.

**Exit gate:** No unowned critical/high item, expired exception, or critical item
without scheduled disposition remains.

### Phase 15 — Bounded-domain migration

After canonical contracts are accepted, migrate AnA, Documents, Projects, RIM,
CMC, CSR, CER, Vault, Submission, Workflow, Users, Identity, Audit,
Notifications, AI Gateway, and Memory behind explicit APIs. Each domain owns its
data and can be contract-tested independently. This is logical separation first;
service extraction requires a separate reliability and operational justification.

**Exit gate:** Dependency rules are mechanically enforced, cross-domain writes
use approved contracts, and each domain passes independent contract and recovery
tests. Legacy paths are removed only after measured parity and rollback windows.

## 4. Dependency and release map

```text
P0 Baseline
  ├── P1 Tenant/RLS/pool safety ──┐
  └── P2 Transaction contract ────┼── P3 Command contract
                                  ├── P4 Governed documents ── P5 Lifecycle
                                  └── P6 AnA runtime ───────── P9 AI gateway

P0 ── P7 Schema decisions ── P8 Migration pipeline
P0 ── P10 Performance baseline
Approved contracts ── P11 Dead-code removal
All controls ── P12 Verification ── P13 Enterprise evidence
Continuous: P14 debt register
P1–P9 approved foundations ── P15 bounded-domain migration
```

No phase number alone authorizes release. A production candidate must satisfy all
applicable earlier gates and the final acceptance criteria below.

## 5. Initial control backlog

| ID | Severity | Initial owner | Status | Depends on | Acceptance summary |
|---|---|---|---|---|---|
| REM-000 | Critical | Control tower | discovery | — | Freeze, snapshots, reproducible baselines, and rehearsed rollback approved |
| REM-101 | Critical | Security/tenancy | discovery | REM-000 | All tenant-owned entry points require canonical tenant context |
| REM-102 | Critical | Security/tenancy | discovery | REM-101 | Failed cleanup poisons connection; concurrency/failure leak tests pass |
| REM-103 | Critical | Security/tenancy | discovery | REM-000 | Production refuses any RLS mode except `on`; RLS matrix passes |
| REM-201 | Critical | Architecture | discovery | REM-000, REM-101 | Mutation inventory and transaction-boundary specification approved |
| REM-202 | Critical | Governance | discovery | REM-201 | Outbox/idempotency/rollback fault tests pass for critical mutations |
| REM-301 | High | Command platform | discovery | REM-101, REM-201 | Registry/handler/schema/policy/test/doc drift is CI-failing |
| REM-302 | High | Command platform | discovery | REM-301 | Structured parser and bounded batch modes pass adversarial tests |
| REM-401 | Critical | Document governance | discovery | REM-201, REM-301 | No unapproved direct lifecycle mutation remains |
| REM-501 | Critical | Workflow | discovery | REM-401 | Single versioned state machine enforces all transitions |
| REM-601 | High | AnA platform | discovery | REM-101, REM-201, REM-301 | Prompt-to-artifact trace and bounded agent execution verified |
| REM-701 | High | Data architecture | discovery | REM-000 | Canonical schema decisions and ownership map approved |
| REM-801 | High | Data architecture | discovery | REM-701 | Deterministic install/upgrade/drift/restore tests pass |
| REM-901 | High | AI gateway | discovery | REM-601 | Provider, fallback, stream, retry, and accounting contracts pass |
| REM-1001 | High | Performance/SRE | discovery | REM-000 | Critical-path SLO and capacity regression gates approved |
| REM-1201 | Critical | Quality | discovery | control implementations | Critical-control traceability has complete executable evidence |
| REM-1301 | Critical | Quality/compliance | discovery | REM-1201 | Validation, DR, security, and intended-use release evidence approved |

### Accepted implementation evidence

| Control | Revision status | Executable evidence | Scope note |
|---|---|---|---|
| REM-103 production startup posture | Implemented; evidence review pending | `npx vitest run --config vitest.config.ts server/db/__tests__/rlsEnforcement.test.ts server/config/__tests__/environment.test.ts` | Production now unconditionally rejects missing, invalid, `off`, and `shadow` modes; this does not by itself prove every table policy is correct |
| REM-102 contaminated connection disposal | Implemented; evidence review pending | `npx vitest run --config vitest.config.ts server/db/__tests__/poolInstrumentation-tenant-scope.test.ts server/middleware/__tests__/lazy-request-db-client.test.ts` | Promise/callback pool paths and the lazy request client destroy connections after uncertain setup/cleanup; supported transaction aliases apply tenant scope; live driver leak/failure testing remains outstanding |
| REM-101 request database fallback removal | Implemented for canonical request helpers and instrumented pool; wider entry-point inventory pending | `npx vitest run --config vitest.config.ts server/db/__tests__/requestDb.test.ts server/db/__tests__/poolInstrumentation-tenant-scope.test.ts server/middleware/__tests__/tenantContext-bootstrap.contract.test.ts` | Request helpers reject missing clients, pool operations reject missing scope, and authentication establishes a JWT-claimed bootstrap scope before membership authorization; route-mount and non-HTTP entry-point review remains outstanding |

Estimates are intentionally absent until Phase 0 establishes scope and owners
decompose these controls into implementation issues. Assigning dates before the
inventories and contracts exist would create false precision.

## 6. Evidence package convention

Each phase publishes an immutable manifest containing:

- repository revision and dirty-state check;
- environment/tool versions and non-secret configuration fingerprint;
- commands, exit codes, timestamps, and test report hashes;
- input fixture/dataset version and generated artifact hashes;
- linked deviations, exceptions, reviewer, and approval timestamp;
- rollback/recovery result where the phase changes persistent state.

Evidence containing regulated, personal, security-sensitive, or secret material
must be redacted or stored in the approved evidence system; the repository keeps
only the manifest and authorized references.

## 7. Final acceptance criteria

The platform is not represented as enterprise or GxP ready until all are true for
the declared intended use and deployment boundary:

1. Tenant data cannot leak across requests, including connection and cleanup
   failures, as demonstrated by adversarial isolation evidence.
2. Every regulated mutation is governed, audited, authorized, transactional, and
   idempotent according to an approved contract.
3. Every enabled command has a validated schema, authorization policy,
   synchronized registry/handler/documentation, and automated tests.
4. Fresh schema creation, supported upgrades, drift detection, and restore are
   deterministic and reproducible.
5. AnA execution is traceable from governed prompt inputs through model and tool
   execution to memory changes and persisted artifacts.
6. Document lifecycle transitions are enforced by one versioned workflow engine,
   not ad hoc SQL or ORM updates.
7. Critical paths have passing load, concurrency, fault-injection, recovery, and
   security tests with retained evidence.
8. Part 11, audit integrity, provenance, backup/DR, and other applicable claims
   map to approved executable evidence rather than implementation assertions.
9. All critical/high residual risks have quality-approved disposition, owners,
   expiry where applicable, and documented compensating controls.

Approval of this epic authorizes controlled discovery and contract work only. It
does not itself assert that Concept2Cure is compliant, validated, or enterprise
ready.
