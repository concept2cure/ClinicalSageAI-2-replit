# Build Order 19 — Governance Detail Unification Map

## Summary

Single-fetch unification of governance detail data. One `useFabricDecisions` call
in the shell replaces parallel fetches across the workspace subtree.

## Changes

### 1. StatusBar no longer calls useFabricDecisions

StatusBar previously fetched fabric decisions independently. It now reads from
`governanceModel.fabricEntries`, eliminating the parallel fetch entirely.

### 2. Governance model extended

New fields added to the governance model:

- `fabricEntries` — cached fabric decision data pushed from the shell
- `fabricLoading` — loading state mirrored from the shell's query
- `setFabricDetail` — setter used by the shell to sync fetched data into the model

### 3. Shell fetches and syncs to model

The workspace shell calls `useFabricDecisions` once and syncs results into the
governance model via a `useEffect` that invokes `setFabricDetail(data)`.
All downstream consumers read from the model, never from a second hook call.

### 4. Context exports centralized selectors

The governance context now exports:

- `selectSelectedGovernanceDetail` — derives the currently selected detail entry
- `selectBlockerSummary` — derives a summary of blocking governance items

These selectors keep derivation logic out of leaf components.

### 5. Single useFabricDecisions call in the workspace subtree

Only the shell invokes the hook. StatusBar, detail panels, and any other consumers
read exclusively from the governance model propagated through context.

## Result

One fetch, one model, one context propagation path. No duplicate queries, no
competing caches, no stale-data divergence between StatusBar and detail panels.
