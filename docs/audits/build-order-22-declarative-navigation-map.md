# Build Order 22 — Declarative Navigation Map

## Changes

### 1. WorkflowTransition.governanceGate

Optional field on transition definitions. Accepted values: `'verify_review'` | `'publish_package'`. When present, the transition requires governance preflight before execution. When absent, the transition proceeds without governance overhead.

### 2. Shell: applyWorkflowTransition uses transition.governanceGate

`applyWorkflowTransition` now reads `transition.governanceGate` from the transition definition instead of performing a hardcoded key check. If the field is set, it calls `runTransitionPreflight` with the gate value. If the field is absent, the transition executes immediately.

### 3. isTransitionGovernanceAllowed

Helper function for navigation sources (sidebar, buttons, command palette) to check gate status declaratively. Returns whether the current project state satisfies the governance gate for a given transition, allowing callers to show disabled/enabled state without duplicating logic.

### 4. getGovernanceGatedTransitions

Lists all transition keys that carry a `governanceGate` field. Useful for bulk UI rendering (e.g., dimming all gated actions in a toolbar) and for test assertions that verify the correct transitions are gated.

### 5. Non-gated transitions unchanged

Transitions without a `governanceGate` field follow the same execution path as before. No governance preflight is invoked, no additional checks are performed, and no performance overhead is introduced.

## Summary

Governance gating is now a declarative property of the transition definition rather than an imperative check in the shell. This eliminates drift between navigation sources and centralizes enforcement in the transition model.
