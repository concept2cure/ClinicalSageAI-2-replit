# Build Order 16 -- Workspace Truth Convergence

## Data Flow

```
useWorkspaceGovernanceModel (single store)
  --> governance model object
      --> shell derives booleans inline (showGovernedPanel, reviewQueueVisible)
      --> shell passes callbacks to GovernedDecisionReviewPanel
          - onInspectDecision
          - onActionStarted
          - onActionCompleted
```

No intermediate state holders exist between the governance model and the UI panels.

## Queue-Consequence Bridge

`mapQueueToGovernanceItems` performs the mapping:

- Input: queue decision IDs + consequence rows from the governance model
- Output: unified governance items with full artifact context

This bridge ensures that every item in the review queue carries the consequence
metadata needed for informed decision-making, without duplicating state.

## Single Store Invariant

There is no second state store. `useWorkspaceGovernanceModel` is the sole source
of governance truth. The shell reads from it, derives what it needs, and passes
callbacks down. Panels never maintain independent governance state.

Previous boolean accessors on `useDocumentConsequenceState` have been removed
to enforce this invariant at the API level.
