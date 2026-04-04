# Build Order 17 — Governance Action Wiring Architecture

## Action Flow

```
User clicks expand
  -> onInspect fires
  -> governance.inspectDecision(id)
  -> model surface = 'inspecting'

User clicks action button
  -> onActionStart fires
  -> governance.startAction(id, actionType)
  -> model surface = 'acting'

Mutation completes (success or error)
  -> onActionComplete fires
  -> governance.completeAction(id, result)
  -> model surface = 'result'
  -> query invalidation refreshes queue + history
```

## Query Architecture

StatusBar uses one `useFabricDecisions` call. Blockers and decisions are derived inline
from the single query result via `selectPromotionBlockersFromFabric`. No separate hooks.
No adapter layer. No dual-fetch.

## Invalidation

After `onActionComplete`, a single `refetchAll` invalidates the Fabric query cache.
Both the queue panel and the status bar re-render from the same refreshed data.

## Data Ownership

- **Fabric query** — owns all governance decision data
- **Governance model** — owns surface state (inspecting / acting / result)
- **DecisionRow** — owns no state, invokes callbacks at lifecycle boundaries
- **Panel** — threads callbacks, does not interpret governance state
- **Shell** — binds model methods to callback props
