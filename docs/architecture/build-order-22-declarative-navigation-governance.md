# Build Order 22 — Declarative Navigation Governance

## Architecture

**Declarative gating.** The `governanceGate` field on `WorkflowTransition` defines which gate applies. Values: `'verify_review'` | `'publish_package'`. Transitions without the field are ungated.

**Single enforcement point.** `applyWorkflowTransition` checks `transition.governanceGate`. If present, it calls `runTransitionPreflight` with the gate value before executing. All navigation sources (sidebar, toolbar, command palette, chat actions) converge here.

**Nav helper.** `isTransitionGovernanceAllowed` lets any nav source check whether a gated transition is currently permitted. Sidebar items and buttons call this to render disabled state without duplicating preflight logic.

**No new fetch or state.** All governance information derives from the shared governance model already loaded in the workspace context. The `governanceGate` field is a static property of the transition definition; `isTransitionGovernanceAllowed` reads existing governance state. No additional API calls or React state atoms are introduced.

## Flow

```
User action -> resolve WorkflowTransition
  -> transition.governanceGate exists?
     No  -> execute transition immediately
     Yes -> runTransitionPreflight(gate) -> pass? -> execute : block with reason
```
