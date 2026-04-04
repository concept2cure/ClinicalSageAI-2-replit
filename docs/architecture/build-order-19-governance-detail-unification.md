# Build Order 19 — Governance Detail Unification Architecture

## Data Flow

```
Shell (useFabricDecisions)
  │
  ├─ useEffect ──▸ governanceModel.setFabricDetail(data)
  │
  ▼
GovernanceContext (fabricEntries, fabricLoading)
  │
  ├──▸ StatusBar        reads governanceModel.fabricEntries
  ├──▸ Detail Panel     reads governanceModel.fabricEntries
  └──▸ Action handlers  mutate shared state, invalidate query in shell
```

## Single Source of Truth

The shell is the only component that calls `useFabricDecisions`. All other
components consume fabric data through the governance context. There are no
parallel fetches — the shell owns the query lifecycle.

## Centralized Selectors

- `selectSelectedGovernanceDetail` — picks the active detail from fabricEntries
- `selectBlockerSummary` — derives blocker count and severity from fabricEntries

Selectors live in the context module. Leaf components never derive these values
locally, ensuring consistent computation across StatusBar and detail panels.

## Invariants

1. No component below the shell may call `useFabricDecisions`
2. All detail data flows through `governanceModel.fabricEntries`
3. Mutations invalidate the shell-level query; the model updates on re-fetch
