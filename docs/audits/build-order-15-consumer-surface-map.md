# Build Order 15 -- Consumer Surface Map

## Summary

Build Order 15 replaces toggle-based governance UI with a proper
WorkspaceGovernanceModel state machine and promotes GovernedFabricState
to first-class operating truth.

## Changes

### 1. WorkspaceGovernanceModel State Machine

Toggle-based governance UI replaced with a five-state machine:

```
idle -> queue -> inspecting -> acting -> result
```

All governance panel visibility, decision selection, and action tracking
are now derived from the current machine state rather than loose booleans.

### 2. GovernedFabricState Upgraded

GovernedFabricState upgraded from optional metadata to first-class
operating truth. A new `lifecycleState` field captures the governance
posture of each fabric entry, making governance status queryable
without reconstructing it from scattered flags.

### 3. summarizeConsequenceGovernance Selector

A new `summarizeConsequenceGovernance` selector provides a
governance-first lens into consequence views. Consumers no longer
need to manually cross-reference governance state with consequence
data -- the selector yields a unified, governance-aware summary.

### 4. Deprecated Types Removed

The following deprecated types were removed from `useGovernance.ts`:

- `PromotionBlocker`
- `GovernanceDecision`
- Other legacy toggle-era type definitions

Removing these eliminates dead contract surface and prevents new code
from depending on obsolete abstractions.

### 5. useGovernance Hook Simplified

`useGovernance` now re-exports review queue, history, and transition
hooks directly from `useFabricState`. This collapses the indirection
layer -- consumers get canonical hooks without routing through a
separate governance adapter.

### 6. workspaceShellControllers Delegation

`workspaceShellControllers` delegates to the governance model instead
of managing loose `useState` booleans. Panel visibility, queue state,
and action tracking are all read from the model, ensuring a single
source of truth for the workspace shell.

## Files Modified

- `useGovernance.ts` -- deprecated types removed, canonical re-exports added
- `useFabricState.ts` -- GovernedFabricState upgraded with lifecycleState
- `workspaceShellControllers.ts` -- delegates to governance model
- Consequence selectors -- summarizeConsequenceGovernance added
