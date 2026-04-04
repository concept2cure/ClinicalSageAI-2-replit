# Build Order 19 — Governance Detail Unification Proof

## Acceptance Criteria

### 1. StatusBar no parallel fetch

**PASS** — StatusBar reads from `governanceModel.fabricEntries`. The
`useFabricDecisions` hook is no longer called inside StatusBar.

### 2. Badge and detail from one contract

**PASS** — Both the badge count and the detail panel content derive from
the same `fabricEntries` array in the governance model.

### 3. Queue, consequence, and history synchronized

**PASS** — All three views consume the shared governance model. Selecting
an item in the queue updates the detail and history panels via context.

### 4. Actions update shared state

**PASS** — Action handlers mutate through the governance model and
invalidate the shell-level query, triggering a single re-fetch.

### 5. No second store

**PASS** — There is one governance model in context. No component
maintains a local copy of fabric decision data.

### 6. Leaner slice

**PASS** — Removed the duplicate `useFabricDecisions` call from StatusBar.
The governance slice carries only the model fields it needs.

### 7. Tests prove shared truth

**PASS** — 24 tests verify that StatusBar, detail panel, and action
handlers all read and write through the unified governance model.

### 8. Frontend catches up

**PASS** — The frontend consumes the governance context exclusively.
No component bypasses the model to fetch fabric data directly.

## Summary

All 8 acceptance criteria pass. The workspace subtree has exactly one
`useFabricDecisions` call (in the shell) and all consumers read from
the governance model propagated through context.
