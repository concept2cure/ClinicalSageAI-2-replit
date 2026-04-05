# Build Order 23 — Nav Source Governance Activation Proof

## Acceptance Criteria

### 1. Nav sources proactively reflect gate status
**PASS** — `selectNavGovernanceAffordance` computes badge, tooltip, and disabled
state at render time. Nav items display governance status before any click.

### 2. Nav uses declarative policy
**PASS** — `selectNavGovernanceAffordance` is a pure selector deriving status
from governance model and transition map. No imperative gate checks in handlers.

### 3. Nav and shell do not drift
**PASS** — Both use `runTransitionPreflight` from the same governance chain.
Single data path prevents divergence between proactive nav and reactive shell.

### 4. Blocked state provides guidance
**PASS** — Blocked nav items show a `tooltip` explaining why and a `badgeLabel`
indicating the required action (e.g., "Review needed").

### 5. No second state
**PASS** — Gate status is derived, not stored. No parallel state machine,
no cached gate results, no local overrides.

### 6. Leaner slice
**PASS** — Verify bypass via `browse_list` fixed. Both verify nav click and
guided sequence verify stage now route through `verify_review` gate.

### 7. Tests prove activation
**PASS** — 20 tests cover all NavGateStatus values (ready, review_needed,
blocked, ungated), both entry paths, and shell preflight fallback.

### 8. Governance at point of nav
**PASS** — Governance is enforced where the user makes the decision (the nav
item), not after navigation has started. Blocked transitions never begin.
