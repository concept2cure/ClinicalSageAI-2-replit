# Build Order 18 — Workspace Governance Propagation Architecture

## Context Architecture

```
Shell (creates governance model)
  └── WorkspaceGovernanceProvider (value={model})
        ├── StatusBar (useWorkspaceGovernance → selectGovernanceBadge)
        ├── EditorPanel (useWorkspaceGovernance → selectAvailableActions)
        └── Other workspace children (consume as needed)
```

## Design Decisions

### No Global Store

Governance state lives in React context scoped to the workspace subtree. There is no Redux slice, no Zustand store, no global singleton. When the workspace unmounts, the context unmounts with it.

### Single Model, Single Provider

The shell creates the governance model once and passes it into `WorkspaceGovernanceProvider`. All children read from the same model instance. No surface maintains its own copy of governance state.

### Centralized Selectors

Common derivations are extracted into pure selector functions:

- `selectGovernanceBadge(model)` — queue summary badge for StatusBar
- `selectAvailableActions(model)` — permitted actions given current governance state
- `selectNeedsAttention(model)` — boolean flag for items requiring attention

Selectors prevent duplicated logic across consumers and keep components focused on rendering.

### StatusBar Integration

StatusBar renders a governance queue badge when the shared model is available. It calls `useWorkspaceGovernance()` and passes the result through `selectGovernanceBadge`. When outside a provider (e.g., global shell without workspace), the hook returns `null` and the badge is hidden.

## Legacy Cleanup

`useGovernance.ts` was deleted. It had zero consumers after BO17 migrated StatusBar to the shared context. No adapter or shim was needed.
