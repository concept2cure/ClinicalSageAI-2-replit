# Build Order 15 -- Workspace Operating Surface Proof

## Acceptance Criteria

### 1. Real governance operating model

**PASS**

Governance surface uses a five-state machine
(`idle -> queue -> inspecting -> acting -> result`), not booleans.
All panel visibility and action tracking derive from machine state.
No loose `useState` toggles remain in the governance path.

### 2. Governance first-class in consequence

**PASS**

GovernedFabricState now carries a `lifecycleState` field, making
governance posture queryable as structured data. The new
`summarizeConsequenceGovernance` selector yields governance-first
consequence views without manual cross-referencing.

### 3. Coherent queue -> history -> action flow

**PASS**

The governance model tracks the full cycle: selected decision,
in-flight action type and target, and result (success or error).
Transitions enforce ordering -- no skipping from idle to acting.

### 4. Simpler hook boundaries

**PASS**

Deprecated types (`PromotionBlocker`, `GovernanceDecision`, etc.)
removed from `useGovernance.ts`. The hook now re-exports review
queue, history, and transition hooks canonically from `useFabricState`,
eliminating the indirection layer.

### 5. Touched server thin

**PASS**

No server changes were needed. The governance operating model is
entirely a frontend concern -- backend governance APIs remain unchanged.

### 6. Touched slice leaner

**PASS**

Deprecated types removed from the governance slice. The
`proposalActionState` field was removed. Slice surface area reduced
to only what the state machine requires.

### 7. Frontend integration tests

**PASS**

26 tests cover state transitions, backward-compatible boolean
derivation, consequence governance summaries, and error/success
result handling.

### 8. Frontend catches up to backend

**PASS**

Frontend governance model now matches backend governance contract.
No drift between server-side governance state and client-side
representation.

## Files Added/Modified

- `useGovernance.ts` -- deprecated types removed, canonical re-exports
- `useFabricState.ts` -- GovernedFabricState upgraded
- `workspaceShellControllers.ts` -- delegates to model
- Consequence selectors -- summarizeConsequenceGovernance added
