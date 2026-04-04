# Build Order 23 — Nav Source Governance Activation

## Architecture

Nav affordance is a pure selector over the governance model and transition map.
No side effects, no async calls — just a deterministic derivation of gate status.

## Proactive vs Reactive

- **Proactive**: Nav items know their gate status before the user clicks.
  `selectNavGovernanceAffordance` computes tooltip, disabled state, and badge
  at render time so the UI reflects governance constraints immediately.

- **Reactive**: Blocked clicks are still handled by the shell preflight
  (`runTransitionPreflight`) as a safety net. This catches edge cases where
  state changes between render and click.

## Single Source of Truth

The governance chain is linear and non-duplicated:

```
selectNavGovernanceAffordance
  -> runTransitionPreflight
    -> selectVerifyGate / selectPublishGate
```

All three layers read from the same governance model and transition map.
Nav, shell, and gate selectors cannot drift because they share a single
data path. No parallel state, no copied logic.
