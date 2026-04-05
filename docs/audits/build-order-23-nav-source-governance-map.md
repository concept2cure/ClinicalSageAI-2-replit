# Build Order 23 — Nav Source Governance Map

## Core Selector

`selectNavGovernanceAffordance` derives gate status from the transition map and governance model.

- **Inputs**: current lifecycle stage, transition map, governance model
- **Outputs**: `tooltip`, `disabled`, `badgeLabel`, `badgeTone`
- **Derived statuses**: `ready` | `review_needed` | `blocked` | `ungated`

## Fixes Applied

### 1. Verify Nav Click

Previously the nav click for Verify bypassed governance by routing through `browse_list`.
Now fixed to route through the `verify_review` gate, ensuring governance is enforced
before the user can enter the Verify stage.

### 2. Guided Sequence Verify Stage

The guided sequence step for Verify also bypassed governance. Fixed to use the same
`verify_review` gate so both entry paths are governed identically.

## Shell Integration

The shell computes two affordances via `useMemo`:

- `verifyNavAffordance` — gate status for the Verify nav item
- `publishNavAffordance` — gate status for the Publish nav item

Both call `selectNavGovernanceAffordance` with the relevant transition, ensuring
the nav items proactively reflect whether the user can proceed.

## Type Definition

```typescript
type NavGateStatus = 'ready' | 'review_needed' | 'blocked' | 'ungated';
```

- **ready**: gate conditions met, nav enabled
- **review_needed**: gate partially met, nav enabled with warning badge
- **blocked**: gate conditions not met, nav disabled with tooltip explaining why
- **ungated**: no governance applies to this transition
