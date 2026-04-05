# Build Order 17 — Governance Action Wiring Map

## Overview

Governance action wiring now flows through real callback control paths, not ornamental props.
All data sourced from a single canonical Fabric query.

## Wiring Changes

### 1. DecisionRow Callback Contract

DecisionRow now invokes three callbacks at meaningful lifecycle points:

- **onInspect** — fired on row expand. This is the entry point into governance inspection.
- **onActionStart** — fired before any mutation begins. Gates the action through the governance model.
- **onActionComplete** — fired on mutation success or error. Closes the governance action loop.

These callbacks are the real control path, not ornamental. The row does not manage governance state internally.

### 2. GovernanceStatusBar Data Source Migration

GovernanceStatusBar migrated from dual legacy hooks (`usePromotionBlockers` + `useGovernanceDecisions`)
to the unified Fabric layer (`useFabricDecisions` + `selectPromotionBlockersFromFabric`).

Single canonical data source. No adapter translation. No stale cache divergence.

### 3. Panel-to-Row Callback Threading

The panel threads governance callbacks to each DecisionRow via props:

- `onInspect` — wired to `governance.inspectDecision`
- `onActionStart` — wired to `governance.startAction`
- `onActionComplete` — wired to `governance.completeAction`

Each row receives its own bound callbacks. No global event bus. No context indirection.

### 4. Shell-to-Panel Model Injection

The shell passes governance model methods as callbacks into the panel:

- `inspectDecision` — transitions model surface to inspecting
- `startAction` — transitions model surface to acting
- `completeAction` — transitions model surface to result, triggers refresh

### 5. Unified Refetch

Single `refetchAll` replaces the previous `refetchBlockers` / `refetchDecisions` dual-refetch pattern.
One invalidation path. One cache boundary. One refresh cycle after action completion.

## Summary

Callbacks flow: Shell (model methods) -> Panel (prop threading) -> DecisionRow (lifecycle invocation).
Data flows: Fabric query -> derived blockers + decisions. No legacy adapters remain in this slice.
