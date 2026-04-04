# Build Order 15 -- Workspace Operating Surface Convergence

## Architecture

### State Machine: GovernanceSurfaceState

Five canonical states govern the workspace operating surface:

| State       | Description                                      |
| ----------- | ------------------------------------------------ |
| `idle`      | No governance activity; panels hidden            |
| `queue`     | Review queue visible; awaiting selection         |
| `inspecting`| Decision selected; detail view active            |
| `acting`    | Action in flight; UI locked to prevent conflicts |
| `result`    | Action complete; success or error displayed      |

Transitions are unidirectional within a cycle:
`idle -> queue -> inspecting -> acting -> result -> idle`

### View Model Ownership

The governance view model owns all surface state:

- **Queue visibility** -- derived from `state === 'queue'`
- **Selected decision** -- tracked as model property, cleared on return to idle
- **Action tracking** -- in-flight action type and target, locked during `acting`
- **Error/success** -- captured in `result` state, auto-clears on next cycle
- **Governed panel** -- visibility derived from non-idle states

### Backward Compatibility

Legacy consumers depending on boolean flags are supported:

- `showGovernedPanel` -- derived as `state !== 'idle'`
- `reviewQueueVisible` -- derived as `state === 'queue'`

No breaking changes to existing hook contracts.

### Consequence Integration

`summarizeConsequenceGovernance` provides a governance-first lens
into consequence data. It reads `lifecycleState` from
GovernedFabricState and yields a unified summary that includes
governance posture alongside consequence metrics. Consumers get
governance-aware views without manual cross-referencing.
