# Phase 2 Build Order #2 — Fabric Assimilation Architecture

## Date: 2026-04-03
## Baseline: Build Order #1 (commits 56f98fb, 74ec0ae, 5e90337)
## Sprint: Fabric Assimilation, RIM Learning Loop, Truth-Surface Convergence

---

## Problem Statement

Build Order #1 created a shared governed document decision fabric with:
- 7 control-plane modules
- Canonical shared types
- Cross-lane integrations (CMC, Communication Center, generic placement)
- Decision persistence + inspection endpoints
- 52 passing tests

The risk after Build Order #1 was **split-brain governance**: the fabric existed but wasn't universally consumed. RIM didn't learn from fabric decisions. Chat/AnA didn't know about governed state. UI hooks surfaced partial truth from legacy endpoints.

---

## Architecture Decisions

### AD-1: Fabric evaluation produces RIM + UI hints in a single pass

The `evaluateGovernedDocument()` orchestrator now produces three output layers in one call:
1. **Governance evaluation** (readiness, placement, gates, consequences, decision)
2. **RIM context hints** (`RIMContextHints`) — what RIM needs to know about the decision
3. **UI presentation hints** (`UIPresentationHints`) — what the workspace needs to render

This eliminates the need for downstream consumers to re-derive governance truth.

### AD-2: RIM ↔ Fabric bridge is explicit, not magical

The bridge is a dedicated module (`server/services/intelligence/fabric-signal-bridge.ts`) that:
- Provides `interceptFabricDecision()` — fabric → RIM direction (fire-and-forget)
- Provides `buildRIMContextForFabric()` — RIM → fabric direction (query signals)
- Uses existing RIM infrastructure (`integrateSignal`, `querySignals`, `getSignalSummary`)
- Does NOT create circular imports — only imports from sibling RIM modules

### AD-3: Chat context enrichment is compact and bounded

The chat envelope (`server/services/ana-ri/governed-context-envelope.ts`) provides:
- `formatFabricStateForPrompt()` — pure function, max 800 chars
- `buildGovernedContextEnvelope()` — async evaluation + formatting
- Does NOT dump raw evaluation payloads into prompts

### AD-4: New hooks are additive, not replacing

`useFabricDecisions` and `useFabricSummary` are new canonical hooks that query the fabric decision API. They sit alongside `usePromotionBlockers` and `useGovernanceDecisions` — no breaking changes. Selector functions (`selectPromotionBlockersFromFabric`, `selectGovernanceDecisionBadge`) derive UI state from fabric data.

---

## Module Map

### New Modules

| Module | Purpose | Layer |
|--------|---------|-------|
| `server/services/intelligence/fabric-signal-bridge.ts` | RIM ↔ Fabric bidirectional bridge | Intelligence |
| `server/services/ana-ri/governed-context-envelope.ts` | Chat context enrichment | Chat/AnA |
| `client/src/concept2cure/hooks/useFabricState.ts` | Canonical fabric hooks + selectors | Client |

### Modified Modules

| Module | Changes | Purpose |
|--------|---------|---------|
| `shared/types/governed-document-fabric.ts` | Added `RIMContextHints`, `UIPresentationHints` | Shared types |
| `server/src/control-plane/governed-document-evaluator.ts` | Generates RIM + UI hints | Evaluator |

---

## Data Flow

```
                    ┌──────────────────────────┐
                    │ evaluateGovernedDocument()│
                    │  (single entry point)     │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
              ▼                  ▼                   ▼
     GovernedDocument    RIMContextHints     UIPresentationHints
     Evaluation          (for RIM bridge)    (for workspace/hooks)
              │                  │                   │
              │                  ▼                   │
              │     interceptFabricDecision()        │
              │     (fabric → RIM signal)            │
              │                  │                   │
              │                  ▼                   │
              │     RIM signal-capture               │
              │     (working memory → persistence)   │
              │                                      │
              │                  ▲                   │
              │     buildRIMContextForFabric()       │
              │     (RIM → fabric query)             │
              │                                      │
              ▼                                      ▼
     formatFabricStateForPrompt()     useFabricDecisions()
     (chat/AnA context)               useFabricSummary()
              │                       selectPromotionBlockersFromFabric()
              ▼                       selectGovernanceDecisionBadge()
     AnA system prompt                       │
                                             ▼
                                    Workspace UI rendering
```

---

## Gap Resolution

| Gap | Description | Resolution | Status |
|-----|-------------|-----------|--------|
| 4 | GovernanceBoundaryService readiness duplication | Authority overlap mapped; fabric is canonical readiness authority; boundary service documented as orchestrator that should delegate | MAPPED (full consolidation is Build Order #3) |
| 5 | resolve/evaluate dual-call redundancy | Evaluator internally resolves context; documented that routes should call evaluator once | DOCUMENTED |
| 6 | RIM not integrated into fabric | Bidirectional bridge created (interceptFabricDecision + buildRIMContextForFabric) | RESOLVED |
| 7 | Workspace UI doesn't render GovernedFabricState | UIPresentationHints added to evaluation; useFabricState hooks created | RESOLVED |
| 8 | Chat-first design wiring | GovernedContextEnvelope created with formatFabricStateForPrompt | RESOLVED |
| 9 | Hooks don't surface fabric state | useFabricDecisions, useFabricSummary, selector functions created | RESOLVED |
| 10 | RIM interceptors unaware of fabric decisions | interceptFabricDecision bridges fabric → RIM signals | RESOLVED |
