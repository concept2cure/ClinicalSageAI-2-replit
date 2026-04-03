# Governed Document Call-Sites Audit v1

> Date: 2026-04-03  
> Purpose: Map every call-site that makes or consumes governed document decisions  
> Target architecture: `docs/architecture/governed-document-decision-fabric-v1.md`  
> Action categories: **Reuse** (wire to fabric as-is), **Adapt** (refactor to use fabric), **Deprecate** (remove once fabric is live)

---

## 1. Shared Types

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `shared/types/document-contract.ts` | `CanonicalDocumentContract`, `GovernedDocumentActionContract` (14+ fields) | **Adapt** — Fabric types extend/replace `GovernedDocumentActionContract` | Adapt | HIGH — Imported by concept2cure.ts, authoring.router.ts, workspace components. Must co-exist during migration. |
| `shared/types/decision-architecture.ts` | `FormalDecisionRecord`, `DecisionReceipt`, `AuthorityBoundaryEntry` | **Reuse** — Fabric `GovernedDecisionReference` wraps `DecisionReceipt` | Reuse | MEDIUM — Used by kernel, authoring-actions, workspace hooks. Stable interface. |
| `shared/types/regulatory-operating-model.ts` | `CanonicalSubmissionRecord`, `CanonicalResponsePackage` | **Reuse** — Fabric `RegulatoryContextBinding` references these | Reuse | LOW — Consumed by Communication Center and submission routes. No changes needed. |
| `shared/types/communication-center.ts` | `PublishOpsServiceState` (13 states), `SubmissionCenterItemState` (8 states) | **Adapt** — Fabric `PublishGateDecision` replaces manual state checks | Adapt | MEDIUM — Communication Center routes + client components depend on these enums. States remain; gating logic moves to fabric. |
| `shared/types/orchestration.ts` | `ReadinessAssessment`, `ReadinessBlocker`, `WorkflowExecution` | **Adapt** — Fabric `LifecycleReadinessState` + `GovernedBlockingReason` supersede | Adapt | MEDIUM — Used by workflow components and submission readiness. Types can be aliased during migration. |
| `shared/types/authoring-context.ts` | `AuthoringContextPack`, `ReadinessSnapshot`, `PreflightResult` | **Adapt** — Fabric `GovernedDocumentContext` subsumes `AuthoringContextPack` | Adapt | HIGH — Deep dependency in authoring.router.ts (174KB). Must co-exist; gradual field migration. |

---

## 2. Control-Plane

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `server/src/control-plane/kernel.ts` | Request-level policy evaluation (immutability, bias, identity, scientific integrity) | **Reuse** — Fabric evaluator calls kernel for policy-level checks | Reuse | LOW — Clean interface. Fabric wraps, does not replace. |
| `server/src/control-plane/decision-log.ts` | In-memory sliding window of kernel decisions (5000 cap) | **Reuse** — Fabric adds document decisions to same log | Reuse | LOW — Append-only. Adding a new decision type is safe. |
| `server/src/control-plane/persistent-queries.ts` | PostgreSQL hash-chain verification for tamper evidence | **Reuse** — `governed-decision-service.ts` persists through this | Reuse | LOW — Core infrastructure. Fabric is a new consumer, not a modifier. |
| `server/src/control-plane/policy-bundle.ts` | Static policy config (v1.3.0, enforce/shadow mode) | **Reuse** — Fabric respects enforce/shadow mode from policy bundle | Reuse | LOW — Read-only dependency. |
| `server/src/control-plane/rule-catalog.ts` | 5 rules with regulatory references | **Adapt** — Add document governance rules to catalog | Adapt | LOW — Additive change. Existing rules unchanged. |
| `server/src/control-plane/self-test.ts` | 3 validation checks | **Adapt** — Add fabric self-test checks | Adapt | LOW — Additive. |
| `server/src/control-plane/audit-report.ts` | Compliance health scoring | **Adapt** — Include document governance metrics | Adapt | LOW — Additive. Extend scoring to include blocked-document counts. |
| `server/src/control-plane/register-core-routes.ts` | Mounts `/api/control-plane` routes | **Adapt** — Mount fabric inspection endpoints | Adapt | LOW — Additive route registration. |

---

## 3. CMC Lane

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `server/api/cmc/module3OperatingSystemRoutes.ts` | Source-to-section compilation, approval gating, contradiction blocking, export readiness (`allApproved && noStale && noCriticalContradictions`) | **Adapt** — Replace inline readiness checks with `governedDocumentEvaluator.evaluate()`. Retain domain-specific compilation logic. | Adapt | HIGH — Central CMC route file. Inline governance logic is interleaved with compilation logic. Must extract carefully. |
| `server/api/cmc/module3OperatingSystemRoutes.ts` (approval gate) | Blocks operations on unresolved critical contradictions | **Adapt** — `readiness-gates.ts` handles contradiction blocking | Adapt | MEDIUM — Gate logic is clear but tightly coupled to CMC contradiction model. Fabric must accept CMC contradiction data as input. |
| `server/api/cmc/module3OperatingSystemRoutes.ts` (version snapshots) | Version snapshots, provenance events, lineage tracking | **Reuse** — Versioning stays in CMC; fabric receives version context via `document-context-resolver` | Reuse | LOW — Versioning is domain-specific to CMC. No change needed. |

---

## 4. Communication Center Lane

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `server/routes/concept2cure-communication-center.ts` (PublishOps) | 13-state PublishOps lifecycle management | **Adapt** — State transitions gated by `export-publish-gates.ts` `evaluatePublish()` | Adapt | MEDIUM — 13 states remain; transition guards move to fabric. Must map each transition to a `GovernedMutationIntent`. |
| `server/routes/concept2cure-communication-center.ts` (Submission Center) | 8-state submission item management | **Adapt** — Submission readiness computed by fabric instead of manual flag | Adapt | MEDIUM — Similar pattern to PublishOps. 8 states remain; readiness computation centralizes. |
| `server/routes/concept2cure-communication-center.ts` (dispatchReady) | Manual boolean flag — no auto-computation | **Deprecate** — Replace with computed `PublishGateDecision.eligible` from fabric | Deprecate | HIGH — Any code reading `dispatchReady` directly must switch to fabric query. Search all consumers before removal. |
| `server/routes/concept2cure-communication-center.ts` (authority profiles) | Authority profile management, visibility tier enforcement | **Reuse** — Authority profiles feed into `placement-authority.ts` as input | Reuse | LOW — Data source, not a decision maker. No structural change. |

---

## 5. Workspace Consequence Layer (Client)

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `client/src/concept2cure/components/workspace/GovernedDocumentPanel.tsx` | Status/audit/governance/lineage/versions tabs | **Adapt** — Consume `GovernedDecisionSummary` from fabric inspection API instead of assembling locally | Adapt | MEDIUM — UI structure stays; data source changes from multiple hooks to single API call. |
| `client/src/concept2cure/components/workspace/WorkspaceReadinessStrip.tsx` | Compliance score, pending reviews display | **Adapt** — Consume pre-computed consequences from fabric | Adapt | MEDIUM — Currently computes readiness client-side. Must switch to server-provided `LifecycleReadinessState`. |
| `client/src/concept2cure/components/workspace/PlacementDialog.tsx` | Reclassify/place/relocate with justification | **Adapt** — Call fabric `evaluate()` with placement intent; display `PlacementAuthorityDecision` | Adapt | LOW — Dialog structure unchanged. Backend call changes. |
| `client/src/concept2cure/components/workspace/` (buildDocumentConsequenceRows) | Tracked document consequence display | **Adapt** — Render `DownstreamOperatingConsequence[]` from fabric instead of computing locally | Adapt | MEDIUM — Must ensure fabric consequence types cover all current row types. |
| `client/src/concept2cure/components/workspace/` (usePromotionBlockers hook) | Client-side promotion blocker computation | **Deprecate** — Replace with fabric API call returning `GovernedBlockingReason[]` | Deprecate | MEDIUM — Hook consumers must migrate to new data shape. Blocker reasons are now typed enums, not ad-hoc strings. |
| `client/src/concept2cure/components/workspace/` (useGovernanceDecisions hook) | Client-side governance decision assembly | **Deprecate** — Replace with fabric inspection API | Deprecate | MEDIUM — Same migration pattern as usePromotionBlockers. |

---

## 6. Governed Mutation Paths

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `server/routes/concept2cure.ts` (artifact CRUD) | Artifact create/read/update/delete with `resolveGovernedContext()` contract validation | **Adapt** — Replace `resolveGovernedContext()` with `documentContextResolver.resolve()`. Replace inline gate checks with evaluator call. | Adapt | CRITICAL — 429KB monolith. Scattered governance checks across many route handlers. Highest-risk migration target. Must be surgical. |
| `server/routes/concept2cure.ts` (14+ export gate checks) | Inline export eligibility checks in export route handlers | **Deprecate** — Replace with single `exportPublishGates.evaluateExport()` call | Deprecate | HIGH — 14+ checks must be cataloged and verified present in fabric before removal. Missing a check = compliance regression. |
| `server/routes/concept2cure.ts` (resolveGovernedContext) | Per-route context resolution for governance | **Deprecate** — Replaced by `document-context-resolver.ts` | Deprecate | HIGH — Called from multiple route handlers. Must ensure fabric resolver produces superset of current context. |
| `server/routes/authoring.router.ts` | Traditional document lifecycle (create/export/submit/sign/freeze) | **Adapt** — Lifecycle transitions call fabric evaluator. Retain execution logic. | Adapt | HIGH — 174KB monolith. Lifecycle transitions are interleaved with business logic. Fabric handles gate evaluation; router retains execution. |
| `server/routes/authoring-actions.ts` | `GovernanceBoundaryService` transitions (`advisory` -> `governed_draft` -> `approved` -> `locked` -> `submission_ready`) | **Adapt** — `GovernanceBoundaryService` delegates readiness evaluation to `readiness-gates.ts`. Retains transition execution. | Adapt | HIGH — Core governance boundary. Must not break transition semantics. Fabric evaluates; service executes. |
| `server/routes/authoring-actions.ts` (AI action handlers) | `promote-artifact` with contradiction check + governed context | **Adapt** — AI action handlers call evaluator with promote intent | Adapt | MEDIUM — Clear call-site. Contradiction check moves to fabric readiness gate. |

---

## 7. Governance Services

| File Path | Responsibility Today | Canonical Owner Target | Reuse / Adapt / Deprecate | Blast Radius / Risk Note |
|---|---|---|---|---|
| `server/services/intelligence/rim.ts` | RIM central orchestrator — signal capture, pattern scanning | **Reuse** — Fabric `document-context-resolver` reads RIM signals as input to governance evaluation | Reuse | LOW — RIM is a data source for the fabric, not a consumer. No changes to RIM itself. |
| `server/services/intelligence/signal-capture.ts` | Two-layer signal accumulation (500 max/project) | **Reuse** — Fabric reads signal summaries for risk context | Reuse | LOW — Read-only consumer relationship. |
| `server/services/intelligence/rim-interceptors.ts` | Auto-capture: chat, compliance, artifact, feedback | **Adapt** — Add a fabric interceptor that captures governance decisions as RIM signals | Adapt | LOW — Additive. New interceptor, existing ones unchanged. |
| `server/services/intelligence/readiness-scoring-engine.ts` | Readiness dimensions + module scoring | **Adapt** — Fabric `readiness-gates.ts` consumes readiness scores; scoring engine feeds into fabric context | Adapt | MEDIUM — Current readiness scoring must align with fabric gate dimensions. May need mapping layer. |
| `server/services/intelligence/recommendation-engine.ts` | Next-best action generation | **Reuse** — Recommendations can reference fabric `GovernedBlockingReason` to suggest unblock actions | Reuse | LOW — Enhancement opportunity, not a required change. |
| `server/services/intelligence/judgment-framework.ts` | 6 codified scoring models | **Reuse** — Fabric context includes judgment scores for gate evaluation | Reuse | LOW — Read-only relationship. |
| `server/services/intelligence/pattern-registry.ts` | Regulatory prior knowledge — seed + learned patterns | **Reuse** — Fabric context includes active pattern hits | Reuse | LOW — Read-only relationship. |

---

## Summary Statistics

| Category | Files Audited | Reuse | Adapt | Deprecate |
|---|---|---|---|---|
| Shared Types | 6 | 2 | 4 | 0 |
| Control-Plane | 8 | 4 | 4 | 0 |
| CMC Lane | 3 (same file, 3 concerns) | 1 | 2 | 0 |
| Communication Center Lane | 4 (same file, 4 concerns) | 1 | 2 | 1 |
| Workspace Consequence | 6 | 0 | 4 | 2 |
| Governed Mutation Paths | 6 | 0 | 4 | 2 |
| Governance Services | 7 | 5 | 2 | 0 |
| **Total** | **40 call-sites** | **13** | **22** | **5** |

## Risk Summary

| Risk Level | Call-Sites | Key Files |
|---|---|---|
| CRITICAL | 1 | `concept2cure.ts` (429KB monolith with scattered governance checks) |
| HIGH | 6 | `authoring.router.ts`, `authoring-actions.ts`, `module3OperatingSystemRoutes.ts`, `concept2cure.ts` export gates, `concept2cure.ts` resolveGovernedContext, `dispatchReady` flag |
| MEDIUM | 14 | Shared types, workspace hooks, Communication Center states, readiness scoring alignment |
| LOW | 19 | Control-plane extensions, RIM integration, authority profiles, versioning |

## Migration Priority Order

1. **Phase 1 — Types + Decision Service** (LOW risk): Create `governed-document-fabric.ts` types, `governed-decision-service.ts`. No existing code changes.
2. **Phase 2 — Context Resolver** (HIGH risk): Extract `resolveGovernedContext()` from `concept2cure.ts` into `document-context-resolver.ts`. Dual-run period.
3. **Phase 3 — Readiness Gates** (HIGH risk): Extract CMC + authoring readiness logic into `readiness-gates.ts`. CMC and authoring call fabric.
4. **Phase 4 — Export/Publish Gates** (HIGH risk): Consolidate 14+ export checks + `dispatchReady` into `export-publish-gates.ts`.
5. **Phase 5 — Workspace Migration** (MEDIUM risk): Switch client hooks to fabric inspection API. Deprecate `usePromotionBlockers`, `useGovernanceDecisions`.
6. **Phase 6 — Consequence Engine + Placement** (MEDIUM risk): `document-consequence-engine.ts`, `placement-authority.ts`. Wire workspace consequence rendering.
