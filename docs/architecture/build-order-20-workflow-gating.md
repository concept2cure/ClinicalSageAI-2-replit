# Build Order 20 — Workflow Gating Architecture

## Gating

Selectors (`selectVerifyGate`, `selectPublishGate`) derive gate status from shared `fabricEntries` and `queueCounts` on the `WorkspaceGovernanceViewModel`. No additional fetch or state required — gates are pure computations over existing data.

## Next-Action Recommendations

`selectNextActions` produces a priority-ordered list of recommended actions from the same governance view-model. Priorities: `high` (resolve escalated, fix blockers), `medium` (review pending), `low` (revisit deferred, proceed to verify).

## Manual Refresh

The shell provides its `fabricQuery.refetch` function to the model via `setRefreshFn`. The model stores it internally. Any consumer (e.g. StatusBar) calls `requestRefresh` to trigger a reload. Single refresh path — no duplicate fetch mechanisms.

## Selector Contract

All selectors are pure functions accepting `WorkspaceGovernanceViewModel` as their sole input. No side effects, no internal state, no direct API calls. This guarantees identical results across every surface that consumes them.

## Files

- Model: governance view-model with gate selectors + next-action selector + refresh wiring
- Shell: wires `fabricQuery.refetch` into model, renders StatusBar
- StatusBar: displays next actions with priority indicators + verify gate badge
