# Build Order 22 — Declarative Navigation Proof

## Acceptance Criteria

### 1. Gating is declarative
**PASS.** Governance gating is expressed via the `governanceGate` field on `WorkflowTransition`. No imperative branching on transition keys.

### 2. All nav sources use the same path
**PASS.** Sidebar, toolbar, command palette, and chat actions all route through `applyWorkflowTransition` for execution and `isTransitionGovernanceAllowed` for UI state.

### 3. Coherent gating UX
**PASS.** Every navigation source runs the same `runTransitionPreflight` when a governance gate is present. Users see identical blocking behavior regardless of how they trigger the transition.

### 4. No drift between sources
**PASS.** One `governanceGate` field per transition definition is the single source of truth. Adding or removing a gate requires changing one property in one place.

### 5. No second state
**PASS.** No additional React state atoms, no local governance caches. `isTransitionGovernanceAllowed` reads from the existing shared governance model.

### 6. Leaner code
**PASS.** Removed hardcoded key check from the shell. Gate enforcement is now a generic lookup on the transition definition, reducing branching and maintenance surface.

### 7. Tests prove enforcement
**PASS.** 20 tests cover: gated transitions blocked without clearance, gated transitions allowed with clearance, ungated transitions unaffected, `isTransitionGovernanceAllowed` returns correct state, `getGovernanceGatedTransitions` lists correct keys.

## Result

7/7 acceptance criteria passed. Declarative navigation governance is complete.
