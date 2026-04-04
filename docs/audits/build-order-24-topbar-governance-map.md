# Build Order 24 — Top-Bar Governance Map

## WorkspaceContextBars: navAffordances Prop

WorkspaceContextBars accepts a `navAffordances` prop typed as
`Record<string, NavGovernanceAffordance>`, where each key is a nav item ID
and the value is the computed affordance for that item.

## Nav Item Governance Badges

Each nav item renders a governance badge when an affordance is present:

- **Badge tone colors**: red (blocked), amber (warning/gated), green (ready).
- **Tooltip**: describes the gate condition (e.g., "Review required before publish").
- **Disabled state**: items with a blocking gate are visually dimmed and non-interactive.
- **`data-gate-status` attribute**: set on each nav item element for test hooks and
  automation (values: `blocked`, `gated`, `ready`, `none`).

## Shell Passes Affordances as Props

The shell computes verify and publish affordances via `selectNavGovernanceAffordance`
and passes them into WorkspaceContextBars as the `navAffordances` prop.
WorkspaceContextBars performs no fetching or state computation — it is a pure
rendering surface for governance state.

## Click Behavior (Unchanged)

Click handling is not modified by this change. The existing path remains:

1. User clicks a nav item.
2. `onNavItemClick` fires in WorkspaceContextBars.
3. Shell receives the event and calls `applyWorkflowTransition`.
4. `applyWorkflowTransition` runs the canonical governance preflight check.
5. Transition proceeds or is blocked based on preflight result.

The badge is informational — it tells the user the gate state before they click.
The actual enforcement still happens in the shell preflight.
