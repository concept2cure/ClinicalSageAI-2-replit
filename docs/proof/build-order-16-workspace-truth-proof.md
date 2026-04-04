# Build Order 16 -- Workspace Truth Proof

## Acceptance Criteria

| #   | Criterion                              | Status | Evidence                                                                 |
| --- | -------------------------------------- | ------ | ------------------------------------------------------------------------ |
| 1   | One explicit governance operating model | PASS   | `useWorkspaceGovernanceModel` is the single store for all governance state |
| 2   | Governance first-class in consequence  | PASS   | `governance` object returned directly from `useDocumentConsequenceState`  |
| 3   | Queue-inspect-act coherent             | PASS   | Callbacks (`onInspectDecision`, `onActionStarted`, `onActionCompleted`) wired from shell to panel |
| 4   | Simpler hook boundaries               | PASS   | `useDocumentConsequenceState` returns `{ computeJobs, setComputeJobs, governance }` only |
| 5   | Leaner client slice                    | PASS   | Backward-compatible boolean accessors removed from hook surface          |
| 6   | No second store                        | PASS   | Shell derives booleans inline; panels receive callbacks, never own state |
| 7   | Frontend tests prove surface real      | PASS   | 20 tests validate governance model, callback wiring, and derived state   |
| 8   | Frontend catches up                    | PASS   | All consumers updated to new hook API; no legacy accessor usage remains  |

## Summary

All eight acceptance criteria pass. The workspace governance surface is now a
single-store system with no duplicate state, no backward-compatible shims, and
coherent queue-to-action coordination through explicit callbacks.

## Files Modified

- `useDocumentConsequenceState` -- cleaned to return governance model only
- Workspace shell -- derives booleans inline, passes callbacks to panels
- `mapQueueToGovernanceItems` -- bridges queue IDs with consequence rows
- `GovernedDecisionReviewPanel` -- accepts governance coordination callbacks
