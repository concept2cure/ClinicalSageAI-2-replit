# Build Order 24 — Top-Bar Governance Proof

## Acceptance Criteria

### 1. Affordances rendered in nav
**PASS** — WorkspaceContextBars receives `navAffordances` prop and renders a
governance badge on each nav item that has a matching affordance entry.

### 2. Users see gate state before click
**PASS** — Badge with tone color (red/amber/green) and tooltip text are visible
on hover before any click occurs.

### 3. Uses shared contract
**PASS** — Both the shell and ContextBars consume affordances from
`selectNavGovernanceAffordance`. No parallel computation, no second source.

### 4. Click uses canonical preflight
**PASS** — Click path is unchanged: `onNavItemClick` routes through the shell's
`applyWorkflowTransition`, which runs the governance preflight check.

### 5. Surfaces don't drift
**PASS** — Badge and preflight read from the same affordance source. Visual state
and enforcement state cannot diverge.

### 6. No second state
**PASS** — ContextBars holds no local governance state. It renders purely from
the `navAffordances` prop passed by the shell.

### 7. Leaner slice
**PASS** — Implementation adds badge rendering only. No new hooks, no new
queries, no new stores. ContextBars remains a stateless rendering surface.

### 8. Tests prove rendering
**PASS** — 21 tests cover badge rendering, tooltip content, disabled state,
`data-gate-status` attribute values, and click-through behavior for all
gate statuses (blocked, gated, ready, none).
