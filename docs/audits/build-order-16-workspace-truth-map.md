# Build Order 16 -- Workspace Truth Map

## Summary

Build Order 16 converges workspace governance state into a single operating model.
Five changes establish the new truth surface.

## Changes

### 1. useDocumentConsequenceState cleaned

Backward-compatible boolean accessors (`showGovernedPanel`, `reviewQueueVisible`, etc.)
have been removed. The hook now returns only:

```ts
{ computeJobs, setComputeJobs, governance }
```

All downstream consumers derive booleans from the `governance` model directly.

### 2. Shell derives governed booleans inline

The workspace shell no longer reads pre-computed booleans from the hook.
Instead it derives `showGovernedPanel` and `reviewQueueVisible` from the
governance model inline, keeping the single-store invariant intact.

### 3. Shell passes governance callbacks to GovernedDecisionReviewPanel

Three callbacks flow from the shell into the review panel:

- `onInspectDecision` -- opens the detail inspector for a queued decision
- `onActionStarted` -- marks a governance action as in-flight
- `onActionCompleted` -- finalizes the action and refreshes consequence state

### 4. mapQueueToGovernanceItems bridges queue and consequence

`mapQueueToGovernanceItems` takes queue decision IDs and consequence rows,
producing unified governance items that carry full artifact context.
This eliminates the previous loose coupling where queue items lacked
consequence metadata.

### 5. GovernedDecisionReviewPanel accepts governance coordination callbacks

The panel contract now includes the three coordination callbacks listed above,
enabling the review panel to participate in the governed action lifecycle
without maintaining its own state store.

## Invariant

There is no second state store. Every piece of governance state flows through
`useWorkspaceGovernanceModel` and is derived or passed down from there.
