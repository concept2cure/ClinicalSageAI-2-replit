# Build Order 17 — Governance Action Wiring Proof

## Acceptance Criteria

### 1. Panel drives governance model

**PASS** — Callbacks invoked at inspect, action start, and action complete lifecycle points.
DecisionRow fires onInspect/onActionStart/onActionComplete which propagate through
the panel to governance model methods. No direct model access from row components.

### 2. Queue and consequence converge

**PASS** — Both queue items and consequence entries use the same `governance.inspectDecision`
pathway. Single inspection entry point regardless of originating surface.

### 3. Queue -> inspect -> act -> update coherent

**PASS** — Model state transitions are sequential and deterministic:
inspecting -> acting -> result. Each transition gated by the corresponding callback.
No state can be skipped. No parallel transitions on the same decision.

### 4. StatusBar off legacy adapters

**PASS** — `useFabricDecisions` is the sole data source. `usePromotionBlockers` and
`useGovernanceDecisions` legacy hooks are no longer imported or referenced in StatusBar.

### 5. Simpler hook boundaries

**PASS** — Single data source via Fabric query. No dual-refetch pattern.
One `refetchAll` replaces separate `refetchBlockers` + `refetchDecisions` calls.
Hook count in the governance slice reduced.

### 6. No second store

**PASS** — No parallel Zustand store, no context-based governance cache, no local
component state duplicating Fabric query results. Single source of truth maintained.

### 7. Frontend tests prove flow real

**PASS** — 22 tests cover the callback wiring: inspect triggers model transition,
action start gates mutation, action complete triggers refresh, status bar reads
from Fabric, and legacy hooks are absent from imports.

### 8. Touched slice leaner

**PASS** — Legacy adapter imports (`usePromotionBlockers`, `useGovernanceDecisions`,
`refetchBlockers`, `refetchDecisions`) removed from all files in the governance
action wiring slice. Net reduction in import surface and hook complexity.

## Verdict

All 8 acceptance criteria pass. Governance action wiring is callback-driven,
single-sourced from Fabric, and tested across 22 frontend assertions.
