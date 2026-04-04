# Build Order 24 — Top-Bar Governance Convergence

## Data Flow

Shell computes affordances via `selectNavGovernanceAffordance` and passes them
as the `navAffordances` prop to WorkspaceContextBars. ContextBars renders badges
purely from props — no new fetch calls, no local state, no derived computation.

## Badge Rendering

Each affordance carries a `gateStatus` that determines:

- **Color**: red (blocked), amber (gated), green (ready).
- **badgeLabel**: short text rendered inside the badge.
- **Tooltip text**: longer description of the gate condition.
- **Disabled state**: when `gateStatus` is `blocked`, the nav item is non-interactive.

## Click Path (Unchanged)

1. `onNavItemClick` in WorkspaceContextBars (no change).
2. Shell `applyWorkflowTransition` (no change).
3. Governance preflight executes (no change).

The badge surfaces gate state visually. Enforcement remains in the shell preflight.

## Design Principles

- Prop-driven: ContextBars has zero knowledge of how affordances are computed.
- Single source: shell and badge read from the same `selectNavGovernanceAffordance`.
- No drift: removing the badge changes nothing about enforcement.
