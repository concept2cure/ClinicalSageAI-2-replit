# Phase 2 Build Order #2 — Authority Overlap Map

## Date: 2026-04-03
## Sprint: Fabric Assimilation, RIM Learning Loop, Truth-Surface Convergence

---

## Summary

The platform has **3 independent readiness computation systems** and **2 governance decision paths** that create split-brain behavior. This map identifies every overlap and assigns canonical ownership.

---

## Authority Overlap Table

| File | Current Responsibility | Data Computed | Duplicates Fabric? | Canonical Owner After Sprint | Action | Risk |
|------|----------------------|---------------|-------------------|------------------------------|--------|------|
| **READINESS COMPUTATION** | | | | | | |
| `server/services/governance-boundary-service.ts` | Semantic boundary transitions (advisory→governed_draft→approved→locked→submission_ready) | Readiness via delegation to readiness-evaluation-service + contradiction checks | YES — fabric's readiness-gates.ts also computes readiness | **Boundary orchestrator** — delegates to fabric for readiness | ADAPT: wrap fabric readiness into boundary checks | MEDIUM |
| `server/services/readiness-evaluation-service.ts` | Rules-driven readiness scoring (org/program-scoped rules) | Score 0-100, isReady boolean, findings[] | YES — fabric's readiness-gates.ts computes same | **Preserved as input** — fabric can consume its rule findings | WRAP: fabric readiness-gates should optionally ingest these findings | MEDIUM |
| `server/src/control-plane/readiness-gates.ts` | Fabric lifecycle readiness (8 levels, scored 0-100) | LifecycleReadinessState with blockers, warnings, confidence | N/A — this IS the fabric | **Canonical readiness authority** | PRESERVE | LOW |
| `server/services/intelligence/readiness-scoring-engine.ts` | RIM readiness scoring | Readiness dimensions + module scoring | Partially — different purpose (intelligence vs governance) | **Intelligence layer** — not governance | PRESERVE as intelligence-only | LOW |
| | | | | | | |
| **GOVERNANCE DECISIONS** | | | | | | |
| `server/src/control-plane/governed-decision-service.ts` | In-memory governed decision persistence | GovernedDecisionRecord (in-memory log) | N/A — this IS the fabric | **Canonical decision log for fabric** | PRESERVE | LOW |
| `server/services/decision-lifecycle-service.ts` | Formal decision records with DB persistence | FormalDecisionRecord with receipts | YES — parallel decision universe | **Formal audit trail** — fabric should bridge to it | ADAPT: fabric decision service should optionally persist here | MEDIUM |
| | | | | | | |
| **CONTEXT RESOLUTION** | | | | | | |
| `server/services/concept2cure/governedDocumentContractService.ts` | Document governance contract resolution (14+ export gate checks) | GovernedDocumentActionContract with export eligibility | YES — fabric's export-publish-gates.ts overlaps export checks | **Contract resolver** — feeds INTO fabric evaluation | ADAPT: fabric should consume contract validation, not duplicate | MEDIUM |
| `server/src/control-plane/document-context-resolver.ts` | Fabric context resolution | GovernedDocumentContext | Complementary to contract service | **Canonical context resolver** for fabric | PRESERVE | LOW |
| | | | | | | |
| **BLOCKERS / CONTRADICTIONS** | | | | | | |
| `server/services/contradiction-engine-service.ts` | Contradiction detection + promotion blocking | Contradiction findings, checkPromotionBlocked() | Partially — fabric readiness-gates takes contradiction count as input but doesn't call this service | **Contradiction authority** — fabric should consume its output | WRAP: fabric readiness-gates should accept contradiction findings | LOW |
| | | | | | | |
| **RIM SIGNALS** | | | | | | |
| `server/services/intelligence/rim-interceptors.ts` | 4 non-blocking signal interceptors | IntelligenceSignal via integrateSignal() | NO — isolated intelligence layer | **Intelligence signal capture** | EXTEND: add fabric decision interceptor | LOW |
| `server/services/intelligence/rim-integration.ts` | Signal integration entry point | RIMIntegrationResult | NO — separate concern | **Signal integration** | EXTEND: add fabric run type | LOW |
| | | | | | | |
| **UI HOOKS** | | | | | | |
| `client/src/concept2cure/hooks/useGovernance.ts` | Frontend governance hooks | PromotionBlocker[], GovernanceDecision[] | YES — queries authoring-actions, not fabric | **Preserved for backward compat** — add canonical fabric hooks alongside | ADAPT: add useFabricState hooks | LOW |
| | | | | | | |
| **WORKSPACE SURFACES** | | | | | | |
| `client/src/concept2cure/components/workspace/documentConsequence.ts` | Consequence row builder with GovernedFabricState | DocumentConsequenceRow[] with optional fabric state | Already integrated (Build Order #1) | **Workspace truth surface** | PRESERVE | LOW |
| `client/src/concept2cure/components/workspace/GovernedDocumentPanel.tsx` | Artifact governance inspector | Status, audit, versions, snapshots | NO — separate concern (audit UI) | **Governance inspector** | FUTURE: show fabric evaluation tab | LOW |
| | | | | | | |
| **CHAT CONTEXT** | | | | | | |
| `server/services/memory-context-assembler.ts` | 3-layer memory for AI prompts | memoryBlock string (3500 char max) | NO — no governance context today | **Memory layer** | EXTEND: inject governed context | LOW |
| `server/services/ana-ri/context-enrichment.ts` | Chat enrichment (slash commands, triggers) | Markdown block + sources | NO — no fabric awareness | **Enrichment layer** | EXTEND: add fabric state enrichment | LOW |

---

## Critical Split-Brain Points

### 1. Readiness truth is computed in 3+ places
- GovernanceBoundaryService → readinessEvaluationService
- Fabric readiness-gates.ts (independent scoring)
- Routes that inline-check readiness conditions

**Resolution**: Fabric readiness-gates becomes canonical. GovernanceBoundaryService wraps it.

### 2. Governed decisions persist in 2 places
- governed-decision-service.ts (in-memory, fabric)
- decision-lifecycle-service.ts (DB-persisted, formal)

**Resolution**: Fabric decisions optionally bridge to formal decision lifecycle for persistence. This is Build Order #3 scope.

### 3. Export eligibility computed in 2 places
- governedDocumentContractService.ts (14 gate checks)
- export-publish-gates.ts (7 gate checks)

**Resolution**: Fabric export gate is canonical. Contract service feeds context but doesn't independently gate.

---

## Canonical Authority Assignment

| Domain | Canonical Owner | Role |
|--------|----------------|------|
| **Lifecycle readiness** | `readiness-gates.ts` (fabric) | Primary readiness truth |
| **Boundary transitions** | `governance-boundary-service.ts` | Orchestrates transitions using fabric readiness |
| **Document context** | `document-context-resolver.ts` (fabric) | Resolves governed context |
| **Document contract** | `governedDocumentContractService.ts` | Produces action contract (feeds into fabric) |
| **Export/publish gates** | `export-publish-gates.ts` (fabric) | Fail-closed export/publish gating |
| **Placement authority** | `placement-authority.ts` (fabric) | CTD placement validation |
| **Consequence generation** | `document-consequence-engine.ts` (fabric) | Downstream consequence production |
| **Decision persistence** | `governed-decision-service.ts` (fabric) | In-memory decision log + inspection |
| **Formal decision audit** | `decision-lifecycle-service.ts` | DB-persisted formal decisions |
| **Contradiction detection** | `contradiction-engine-service.ts` | Contradiction findings (feeds into fabric) |
| **RIM intelligence** | `rim-interceptors.ts` + `signal-capture.ts` | Signal capture + learning |
| **Chat context** | `memory-context-assembler.ts` + enrichment | Prompt context assembly |
| **Workspace surfaces** | `documentConsequence.ts` + hooks | UI truth rendering |
