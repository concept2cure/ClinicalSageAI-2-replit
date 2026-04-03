# Governed Document Decision Fabric v1

> Architecture Decision Record  
> Date: 2026-04-03  
> Status: Proposed  
> Namespace: `server/src/control-plane/`  
> Shared Types: `shared/types/governed-document-fabric.ts`

---

## 1. Overview

The Governed Document Decision Fabric is a shared evaluation and decision layer for all document governance operations in Concept2Cure. It centralizes the logic that determines whether a document can be promoted, exported, published, placed, or mutated -- and persists every decision for regulatory inspection.

The fabric lives inside the existing `server/src/control-plane/` namespace and is consumed by every lane that makes governed document decisions: CMC Module 3, Communication Center, authoring workflows, and the workspace consequence layer.

---

## 2. Problem Statement

Today, multiple subsystems evaluate document readiness, placement authority, and export eligibility independently:

| Subsystem | What It Decides | How It Decides | Problem |
|---|---|---|---|
| **Control-Plane kernel** (`kernel.ts`) | Request-level policy (immutability, bias, identity, scientific integrity) | 5 rules in `rule-catalog.ts`, policy bundle v1.3.0 | No document-lifecycle awareness; evaluates requests, not documents |
| **CMC Module 3** (`module3OperatingSystemRoutes.ts`) | Source-to-section compilation, approval gating, contradiction blocking | `allApproved && noStale && noCriticalContradictions` | Bespoke logic; not reusable outside CMC |
| **Communication Center** (`concept2cure-communication-center.ts`) | PublishOps (13-state), Submission Center (8-state), dispatch readiness | `dispatchReady` is a manual boolean flag | No auto-computation; no integration with CMC readiness; no shared gates |
| **Authoring Router** (`authoring.router.ts`, `authoring-actions.ts`) | Lifecycle transitions (`advisory` -> `governed_draft` -> `approved` -> `locked` -> `submission_ready`) | `GovernanceBoundaryService` | Separate from control-plane decision log |
| **Artifact CRUD** (`concept2cure.ts`) | 14+ export gate checks, `resolveGovernedContext()` contract validation | Inline checks in route handlers | Logic not shared; duplicated across routes |
| **Workspace Consequence** (client-side) | Compliance score, pending reviews, promotion blockers | `usePromotionBlockers`, `useGovernanceDecisions` hooks | Client reconstructs decisions the server already made |

**Core problems:**

1. **Duplicated evaluation logic.** Each lane re-implements readiness checks, contradiction blocking, and export gating with subtly different rules.
2. **No shared decision vocabulary.** CMC says "allApproved"; Communication Center says "dispatchReady"; authoring says "submission_ready". These are the same concept expressed differently.
3. **Decisions are not uniformly persisted.** The control-plane has `decision-log.ts` (in-memory, 5000-cap) and `persistent-queries.ts` (hash-chain), but document governance decisions from CMC and authoring bypass both.
4. **No consequence propagation.** When a document's governance state changes, downstream systems (workspace UI, export gates, submission readiness) must be notified. Today this is ad-hoc.
5. **Inspection gap.** Auditors cannot answer "why was this document blocked from export?" without reading code. Decisions must be inspectable at runtime.

---

## 3. Architecture Decision

### ADR-001: Extend control-plane, do not create a new namespace

The Governed Document Decision Fabric is an extension of `server/src/control-plane/`. Rationale:

- The control-plane already owns policy evaluation, decision logging, and hash-chain persistence.
- Document governance decisions are a specialization of control-plane policy, not a separate concern.
- Reusing the existing namespace avoids a new dependency graph and keeps the decision log unified.

### ADR-002: Canonical shared types in a single file

All document governance types live in `shared/types/governed-document-fabric.ts`. Every consumer (CMC, Communication Center, authoring, workspace) imports from this single source. No lane defines its own governance types.

### ADR-003: Evaluator pattern, not middleware

The fabric is a set of callable services, not Express middleware. Routes call the evaluator explicitly and receive a typed decision object. This keeps control flow visible and testable.

### ADR-004: Decisions are append-only and inspectable

Every governance decision is persisted through the existing control-plane hash-chain (`persistent-queries.ts`). Decisions carry a `decisionRef` that can be queried by auditors.

### ADR-005: Consequence generation is server-side

The server computes all downstream consequences of a governance decision. The client renders consequences; it does not compute them.

---

## 4. Module Map

All new modules live in `server/src/control-plane/`:

```
server/src/control-plane/
├── kernel.ts                          # EXISTING — request-level policy evaluation
├── decision-log.ts                    # EXISTING — in-memory sliding window (5000 cap)
├── persistent-queries.ts              # EXISTING — PostgreSQL hash-chain verification
├── policy-bundle.ts                   # EXISTING — static policy config (v1.3.0)
├── rule-catalog.ts                    # EXISTING — 5 rules with regulatory references
├── self-test.ts                       # EXISTING — 3 validation checks
├── audit-report.ts                    # EXISTING — compliance health scoring
├── register-core-routes.ts            # EXISTING — mounts /api/control-plane
│
├── governed-document-evaluator.ts     # NEW — Central orchestrator
├── document-context-resolver.ts       # NEW — Resolve full governed context for a document
├── readiness-gates.ts                 # NEW — Evaluate lifecycle readiness states
├── placement-authority.ts             # NEW — Canonical placement decisions
├── export-publish-gates.ts            # NEW — Export/publish eligibility evaluation
├── document-consequence-engine.ts     # NEW — Downstream consequence generation
└── governed-decision-service.ts       # NEW — Decision persistence + inspectability
```

### Module Responsibilities

#### `governed-document-evaluator.ts` — Central Orchestrator

The single entry point for all governed document evaluations. Routes and services call `evaluateGovernedDocument()` and receive a `GovernedDocumentEvaluation`.

```
Input:  GovernedMutationIntent (what the caller wants to do)
Output: GovernedDocumentEvaluation (decision + blockers + warnings + consequences)
```

Internally delegates to the other fabric modules:

1. Calls `document-context-resolver` to build full context
2. Calls `readiness-gates` to evaluate lifecycle state
3. Calls `placement-authority` if placement/reclassification is requested
4. Calls `export-publish-gates` if export or publish is requested
5. Calls `document-consequence-engine` to compute downstream effects
6. Calls `governed-decision-service` to persist the decision

#### `document-context-resolver.ts` — Context Resolution

Replaces the scattered `resolveGovernedContext()` calls in `concept2cure.ts`. Builds a `GovernedDocumentContext` from:

- Document metadata (artifact record, version, section code)
- Current lifecycle stage (from `GovernanceBoundaryService`)
- Active contradictions (from CMC contradiction architecture)
- Approval state (section-level and document-level)
- Staleness indicators (source changes since last compilation)
- Regulatory context binding (agency, submission type, module)
- RIM signals (pattern hits, risk level, confidence)

#### `readiness-gates.ts` — Lifecycle Readiness

Evaluates whether a document meets the requirements for its current or requested lifecycle stage. Produces a `LifecycleReadinessState` with:

- Current stage and requested stage
- Blocking reasons (typed as `GovernedBlockingReason[]`)
- Warnings (typed as `GovernedWarning[]`)
- Gate pass/fail for each readiness dimension

Gate dimensions:
- **Approval completeness** — all required approvals present
- **Contradiction resolution** — no unresolved critical contradictions
- **Staleness** — no stale source data
- **Compliance scan** — no unresolved compliance findings above threshold
- **Signature requirements** — electronic signatures where required (21 CFR Part 11)

#### `placement-authority.ts` — Placement Decisions

Canonical authority for document placement, reclassification, and relocation. Produces a `PlacementAuthorityDecision`. Replaces the ad-hoc logic in `PlacementDialog` (client) and scattered route handlers.

Evaluates:
- Is the target location valid for this document type?
- Does the caller have authority to place here?
- Are there conflicts with existing documents at the target?
- What downstream consequences does this placement create?

#### `export-publish-gates.ts` — Export and Publish Eligibility

Consolidates the 14+ export gate checks from `concept2cure.ts` and the `dispatchReady` flag from Communication Center. Produces `ExportGateDecision` and `PublishGateDecision`.

Export gates:
- Lifecycle stage >= `approved`
- No unresolved critical contradictions
- No stale source data
- Compliance scan passed
- Required signatures present
- Format validation passed

Publish gates (superset of export):
- All export gates pass
- PublishOps state is eligible (not `draft`, `recalled`, or `suspended`)
- Agency-specific validation passed
- Submission package integrity verified

#### `document-consequence-engine.ts` — Consequence Generation

Given a governance decision, computes all downstream operating consequences. Produces `DownstreamOperatingConsequence[]`.

Consequence types:
- **UI consequence** — what the workspace must show/hide/disable
- **Workflow consequence** — what workflow transitions are now available/blocked
- **Notification consequence** — who must be notified
- **Dependent document consequence** — what other documents are affected
- **Submission consequence** — how submission readiness changes

#### `governed-decision-service.ts` — Decision Persistence

Persists every governance decision through the existing control-plane hash-chain. Provides inspection queries for auditors.

Methods:
- `persistDecision(evaluation: GovernedDocumentEvaluation): GovernedDecisionReference`
- `getDecision(decisionRef: string): GovernedDocumentEvaluation`
- `getDecisionHistory(artifactId: string): GovernedDocumentEvaluation[]`
- `getBlockingDecisions(projectId: string): GovernedDocumentEvaluation[]`
- `verifyDecisionChain(artifactId: string): ChainVerificationResult`

---

## 5. Data Flow

### 5.1 Governed Mutation (e.g., promote artifact)

```
Route Handler (concept2cure.ts / authoring-actions.ts / CMC routes)
  │
  ├── 1. Build GovernedMutationIntent
  │     { action: 'promote', artifactId, targetStage, callerId, justification }
  │
  ├── 2. Call governedDocumentEvaluator.evaluate(intent)
  │     │
  │     ├── 2a. documentContextResolver.resolve(artifactId)
  │     │     → GovernedDocumentContext
  │     │
  │     ├── 2b. readinessGates.evaluate(context, targetStage)
  │     │     → LifecycleReadinessState
  │     │
  │     ├── 2c. documentConsequenceEngine.compute(context, decision)
  │     │     → DownstreamOperatingConsequence[]
  │     │
  │     └── 2d. governedDecisionService.persist(evaluation)
  │           → GovernedDecisionReference
  │
  ├── 3. If evaluation.blocked → return 403 with blockers + decisionRef
  │
  └── 4. If evaluation.allowed → execute mutation, return consequences + decisionRef
```

### 5.2 Export Gate Check

```
Export Route (concept2cure.ts export handler)
  │
  ├── 1. Build GovernedMutationIntent { action: 'export', artifactId, format }
  │
  ├── 2. Call governedDocumentEvaluator.evaluate(intent)
  │     │
  │     ├── 2a. Resolve context
  │     ├── 2b. exportPublishGates.evaluateExport(context)
  │     │     → ExportGateDecision
  │     └── 2c. Persist decision
  │
  └── 3. Return ExportGateDecision (pass/fail + reasons + decisionRef)
```

### 5.3 Workspace Consequence Rendering

```
Client: WorkspaceReadinessStrip / GovernedDocumentPanel
  │
  ├── 1. GET /api/control-plane/governed-decisions/:artifactId
  │     → GovernedDecisionSummary (latest evaluation + consequences)
  │
  ├── 2. Render blockers, warnings, consequence rows
  │     (No client-side re-evaluation; server is source of truth)
  │
  └── 3. Action buttons enabled/disabled based on consequences
```

---

## 6. Integration Points

### 6.1 CMC Module 3 Lane

**Current:** `module3OperatingSystemRoutes.ts` has inline `allApproved && noStale && noCriticalContradictions` checks.

**Target:** CMC routes call `governedDocumentEvaluator.evaluate()` with a `GovernedMutationIntent`. The evaluator's `readinessGates` replaces the inline logic. CMC retains its domain-specific compilation and source-to-section mapping but delegates governance decisions to the fabric.

### 6.2 Communication Center Lane

**Current:** `concept2cure-communication-center.ts` has a manual `dispatchReady` boolean and 13-state PublishOps + 8-state Submission Center with no shared gates.

**Target:** Communication Center calls `exportPublishGates.evaluatePublish()` to compute dispatch readiness. The manual flag becomes a computed property. PublishOps state transitions are gated by the fabric.

### 6.3 Authoring Workflow

**Current:** `authoring-actions.ts` uses `GovernanceBoundaryService` for lifecycle transitions independently of the control-plane.

**Target:** `GovernanceBoundaryService` delegates readiness evaluation to `readinessGates`. The boundary service retains transition execution but uses the fabric for gate evaluation. Every transition produces a persisted decision.

### 6.4 Artifact CRUD (concept2cure.ts)

**Current:** 14+ inline export gate checks in route handlers. `resolveGovernedContext()` called per-route.

**Target:** Route handlers call the evaluator once. Context resolution is centralized in `document-context-resolver`. Export gates are centralized in `export-publish-gates`. Inline checks are removed.

### 6.5 Workspace Consequence Layer (Client)

**Current:** `usePromotionBlockers` and `useGovernanceDecisions` hooks reconstruct decisions client-side.

**Target:** Hooks call a single API endpoint that returns pre-computed `GovernedDecisionSummary` from the fabric. Client renders; server decides.

### 6.6 RIM Integration

**Current:** RIM signals are captured by interceptors but not consumed by governance gates.

**Target:** `document-context-resolver` includes RIM signal summary in `GovernedDocumentContext`. Readiness gates can factor RIM risk signals into gate evaluation (e.g., high-risk RIM signal triggers a warning, not a block).

---

## 7. Shared Vocabulary

All types defined in `shared/types/governed-document-fabric.ts`:

### Core Decision Types

| Type | Purpose |
|---|---|
| `GovernedMutationIntent` | What the caller wants to do (action, target, justification) |
| `GovernedDocumentContext` | Full resolved context for a document at evaluation time |
| `GovernedDocumentEvaluation` | Complete evaluation result (decision + blockers + warnings + consequences + ref) |
| `GovernedDecisionSummary` | Lightweight version for API responses and UI consumption |
| `GovernedDecisionReference` | Persistent reference to a stored decision (id + hash + timestamp) |

### Gate Types

| Type | Purpose |
|---|---|
| `LifecycleReadinessState` | Result of readiness gate evaluation for a lifecycle stage |
| `ExportGateDecision` | Result of export eligibility evaluation |
| `PublishGateDecision` | Result of publish eligibility evaluation |
| `PlacementAuthorityDecision` | Result of placement/reclassification authority check |

### Reason and Warning Types

| Type | Purpose |
|---|---|
| `GovernedBlockingReason` | Why a mutation is blocked (typed, with regulatory reference) |
| `GovernedWarning` | Non-blocking advisory (typed, with suggested action) |
| `DownstreamOperatingConsequence` | What changes downstream as a result of this decision |

### Binding Types

| Type | Purpose |
|---|---|
| `RegulatoryContextBinding` | Links a document to agency, submission type, module, section |
| `GovernedLifecycleStage` | Union type of all lifecycle stages across all lanes |

### Enumerations

```typescript
type GovernedAction =
  | 'create' | 'update' | 'delete'
  | 'promote' | 'demote' | 'lock' | 'unlock'
  | 'place' | 'reclassify' | 'relocate'
  | 'export' | 'publish' | 'dispatch'
  | 'sign' | 'freeze' | 'recall';

type GovernedLifecycleStage =
  | 'advisory' | 'governed_draft' | 'in_review'
  | 'approved' | 'locked' | 'submission_ready'
  | 'published' | 'dispatched' | 'recalled' | 'archived';

type BlockingCategory =
  | 'approval_incomplete' | 'contradiction_unresolved'
  | 'stale_source' | 'compliance_violation'
  | 'signature_missing' | 'authority_denied'
  | 'lifecycle_invalid' | 'format_invalid'
  | 'dependency_blocked' | 'policy_violation';

type ConsequenceType =
  | 'ui_state' | 'workflow_transition' | 'notification'
  | 'dependent_document' | 'submission_readiness';
```

---

## 8. Decision Persistence Model

### Storage

Governed document decisions are persisted through the existing control-plane hash-chain in `persistent-queries.ts`. Each decision record contains:

| Field | Type | Description |
|---|---|---|
| `decisionId` | `string (UUID)` | Unique decision identifier |
| `decisionHash` | `string` | SHA-256 hash of decision payload |
| `previousHash` | `string` | Hash of previous decision for this artifact (chain) |
| `artifactId` | `string` | Document/artifact being evaluated |
| `projectId` | `string` | Tenant-scoped project |
| `action` | `GovernedAction` | What was requested |
| `outcome` | `'allowed' \| 'blocked' \| 'warning'` | Decision result |
| `blockers` | `GovernedBlockingReason[]` | Why blocked (if blocked) |
| `warnings` | `GovernedWarning[]` | Non-blocking advisories |
| `consequences` | `DownstreamOperatingConsequence[]` | Downstream effects |
| `evaluatorVersion` | `string` | Version of the fabric that made this decision |
| `callerIdentity` | `string` | Who requested the evaluation |
| `justification` | `string \| null` | Caller-provided justification |
| `timestamp` | `ISO 8601` | When the decision was made |
| `regulatoryContext` | `RegulatoryContextBinding` | Agency/module/section context |

### Hash Chain

Each decision's `decisionHash` = SHA-256 of `(previousHash + decisionId + artifactId + action + outcome + timestamp)`. This provides tamper evidence consistent with the existing control-plane approach in `persistent-queries.ts`.

### Inspection Queries

| Endpoint | Returns |
|---|---|
| `GET /api/control-plane/governed-decisions/:artifactId` | Latest evaluation + full decision history |
| `GET /api/control-plane/governed-decisions/:artifactId/blockers` | Current active blockers |
| `GET /api/control-plane/governed-decisions/project/:projectId/blocked` | All blocked documents in project |
| `GET /api/control-plane/governed-decisions/:artifactId/verify` | Hash-chain verification result |
| `GET /api/control-plane/governed-decisions/:artifactId/timeline` | Decision timeline for audit |

---

## 9. Inspection API

The fabric exposes inspection endpoints mounted under the existing `/api/control-plane` prefix via `register-core-routes.ts`.

### Endpoints

```
GET  /api/control-plane/governed-decisions/:artifactId
     → GovernedDecisionSummary (latest) + GovernedDocumentEvaluation[] (history)

GET  /api/control-plane/governed-decisions/:artifactId/blockers
     → GovernedBlockingReason[] (current active blockers)

GET  /api/control-plane/governed-decisions/:artifactId/consequences
     → DownstreamOperatingConsequence[] (current active consequences)

GET  /api/control-plane/governed-decisions/project/:projectId/blocked
     → { artifactId, blockers, decisionRef }[] (all blocked documents)

GET  /api/control-plane/governed-decisions/:artifactId/verify
     → { valid: boolean, chainLength: number, breaks: ChainBreak[] }

GET  /api/control-plane/governed-decisions/:artifactId/timeline
     → GovernedDocumentEvaluation[] (ordered by timestamp)

POST /api/control-plane/governed-decisions/evaluate
     Body: GovernedMutationIntent
     → GovernedDocumentEvaluation (dry-run evaluation without persistence)
```

### Audit Report Integration

The existing `audit-report.ts` compliance health scoring is extended to include:

- Count of blocked documents by blocking category
- Count of decisions in last 24h / 7d / 30d
- Hash-chain integrity status
- Top blocking reasons across the project

---

## Appendix A: Migration Path

### Phase 1 — Types + Evaluator Shell
1. Create `shared/types/governed-document-fabric.ts` with all types
2. Create `governed-document-evaluator.ts` with evaluate() that delegates to existing logic
3. Create `governed-decision-service.ts` wired to existing `persistent-queries.ts`

### Phase 2 — Context Resolution
4. Create `document-context-resolver.ts` extracting logic from `concept2cure.ts` `resolveGovernedContext()`
5. Wire evaluator to context resolver

### Phase 3 — Gate Consolidation
6. Create `readiness-gates.ts` extracting logic from CMC + authoring
7. Create `export-publish-gates.ts` extracting 14+ checks from `concept2cure.ts`
8. Create `placement-authority.ts` extracting logic from `PlacementDialog` backend handlers

### Phase 4 — Consequence Engine
9. Create `document-consequence-engine.ts`
10. Wire workspace consequence layer to fabric API instead of client-side computation

### Phase 5 — Lane Integration
11. CMC routes call evaluator instead of inline checks
12. Communication Center computes `dispatchReady` via fabric
13. Authoring actions delegate gate evaluation to fabric
14. `concept2cure.ts` export routes use fabric

### Phase 6 — Inspection API
15. Mount inspection endpoints
16. Extend audit-report.ts
17. Wire workspace hooks to inspection API

---

## Appendix B: Relationship to Existing Systems

```
┌─────────────────────────────────────────────────────────────────┐
│                     Control-Plane (existing)                     │
│  kernel.ts  decision-log.ts  persistent-queries.ts  policy.ts   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │          Governed Document Decision Fabric (NEW)            ││
│  │                                                             ││
│  │  evaluator ──┬── context-resolver                           ││
│  │              ├── readiness-gates                             ││
│  │              ├── placement-authority                         ││
│  │              ├── export-publish-gates                        ││
│  │              ├── consequence-engine                          ││
│  │              └── decision-service ──► persistent-queries     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
        ▲               ▲               ▲               ▲
        │               │               │               │
   CMC Lane    Comm Center Lane   Authoring Lane   Artifact CRUD
        │               │               │               │
        └───────────────┴───────────────┴───────────────┘
                                │
                    Workspace Consequence Layer
                         (client-side)
```
