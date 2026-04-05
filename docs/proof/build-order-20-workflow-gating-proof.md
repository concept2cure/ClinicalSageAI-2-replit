# Build Order 20 — Workflow Gating Proof

## Acceptance Criteria

### 1. Verify and publish gated by governance data

- `selectVerifyGate` returns `blocked` when escalated items or blockers exist.
- `selectVerifyGate` returns `review_required` when pending items exist.
- `selectVerifyGate` returns `allowed` when governance is clean.
- `selectPublishGate` chains on verify gate + publish-specific outcome.
- **PASS**

### 2. Next actions are explicit and priority-ordered

- `selectNextActions` returns `resolve_escalated` (high) when escalations present.
- `selectNextActions` returns `fix_blockers` (high) when blockers present.
- `selectNextActions` returns `review_pending` (medium) when pending items exist.
- `selectNextActions` returns `revisit_deferred` (low) for deferred items.
- `selectNextActions` returns `proceed_to_verify` (low) when everything is resolved.
- **PASS**

### 3. Manual refresh exists

- `requestRefresh` is exposed on the model.
- `setRefreshFn` stores the shell-provided refetch function.
- Shell wires `fabricQuery.refetch` through `setRefreshFn`.
- StatusBar calls `requestRefresh` to reload governance data.
- **PASS**

### 4. Same actionability across surfaces

- All selectors are pure functions of `WorkspaceGovernanceViewModel`.
- Any consumer receiving the same model gets identical gate status and next actions.
- **PASS**

### 5. No second fetch or state

- Gates and next actions derive from existing `fabricEntries` + `queueCounts`.
- No additional API calls, no duplicated state stores.
- **PASS**

### 6. Tests prove it

- 25 tests cover gate logic, next-action ordering, refresh wiring, and edge cases.
- **PASS**
