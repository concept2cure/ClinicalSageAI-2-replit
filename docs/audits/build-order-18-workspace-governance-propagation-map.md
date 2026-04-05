# Build Order 18 — Workspace Governance Propagation Map

## Summary

BO18 introduces `WorkspaceGovernanceContext` as the single shared governance model for workspace surfaces, replacing the legacy `useGovernance.ts` hook. All consumers now read from a React context scoped to the workspace subtree.

## Components

### 1. WorkspaceGovernanceContext.tsx

- Defines React context, provider (`WorkspaceGovernanceProvider`), and consumer hooks
- `useWorkspaceGovernance()` — returns governance model or `null` when outside provider
- `useWorkspaceGovernanceStrict()` — throws if consumed outside provider (dev safety)
- NOT a global store — scoped to the workspace subtree via React context

### 2. Shell (Workspace Root)

- Shell creates the governance model and wraps the workspace in `WorkspaceGovernanceProvider`
- Model value flows down to all workspace children without prop drilling

### 3. StatusBar

- Consumes shared context via `useWorkspaceGovernance()`
- Uses `selectGovernanceBadge()` selector to derive queue summary badge
- No local governance state — reads exclusively from the shared model

### 4. useGovernance.ts (DELETED)

- Legacy hook removed — zero consumers remained after BO17 migrated StatusBar
- File deletion confirmed; no remaining imports across the codebase

## Centralized Selectors

| Selector                   | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `selectGovernanceBadge`    | Derives queue summary badge for StatusBar        |
| `selectAvailableActions`   | Computes permitted actions from governance state |
| `selectNeedsAttention`     | Boolean flag for items requiring user attention  |

## Test Updates

- Prior BO tests updated to account for `useGovernance.ts` file deletion
- 27 tests cover provider mounting, hook consumption, selector derivations, and propagation
- No regressions in existing workspace test suites

## Files Changed

- **Added**: `WorkspaceGovernanceContext.tsx`, centralized selectors
- **Modified**: Shell (provider wrapping), StatusBar (context consumption)
- **Deleted**: `useGovernance.ts`
- **Updated**: Prior BO test files referencing deleted hook
