# Build Order 18 — Workspace Governance Propagation Proof

## Acceptance Criteria

| #   | Criterion                        | Status | Evidence                                                              |
| --- | -------------------------------- | ------ | --------------------------------------------------------------------- |
| 1   | Shared contract exists           | PASS   | `WorkspaceGovernanceContext` defines provider + hooks + selectors      |
| 2   | Surfaces react to same state     | PASS   | Provider wraps workspace subtree; all children consume single context |
| 3   | No drift between surfaces        | PASS   | Single context, single model instance — no duplicate state            |
| 4   | Legacy adapters retired          | PASS   | `useGovernance.ts` deleted, zero remaining imports                    |
| 5   | No second store introduced       | PASS   | React context only — no Redux, Zustand, or global singleton           |
| 6   | Leaner governance slice          | PASS   | File deleted, selectors centralized into shared module                |
| 7   | Tests prove propagation          | PASS   | 27 tests covering provider, hooks, selectors, and integration        |
| 8   | Frontend catches up to backend   | PASS   | StatusBar + workspace surfaces consume live governance model          |

## Test Coverage Summary

- **Provider tests**: Mounts correctly, passes model to children, unmounts cleanly
- **Hook tests**: `useWorkspaceGovernance` returns model inside provider, `null` outside
- **Strict hook tests**: `useWorkspaceGovernanceStrict` throws outside provider
- **Selector tests**: `selectGovernanceBadge`, `selectAvailableActions`, `selectNeedsAttention` produce correct derivations
- **Integration tests**: StatusBar renders badge from shared context, hides when no provider
- **Deletion tests**: Prior BO tests updated to confirm `useGovernance.ts` no longer exists

## Files Added/Modified

| File                              | Change     |
| --------------------------------- | ---------- |
| `WorkspaceGovernanceContext.tsx`   | Added      |
| Centralized selectors module      | Added      |
| Shell workspace wrapper           | Modified   |
| StatusBar                         | Modified   |
| `useGovernance.ts`                | Deleted    |
| Prior BO test files               | Updated    |
