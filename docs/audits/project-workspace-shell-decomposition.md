# ProjectWorkspaceShell Decomposition

## Extracted controllers
- `useWorkspaceNavigationState`
- `useGuidedSequenceState`
- `usePlacementAndMoveState`
- `useDocumentConsequenceState`
- `usePhase4Panels`
- `useWorkflowTransitionModel`

Implemented in: `client/src/concept2cure/components/workspace/workspaceShellControllers.ts`.

## What moved
- Core navigation state ownership moved behind controller hooks.
- Guided sequence mode state now owned by dedicated controller.
- Placement/move dialog and pending move state now isolated.
- Consequence compute/governed panel state now isolated.
- Phase 4 overlay state now isolated.

## Outcome
- `ProjectWorkspaceShell.tsx` now composes controllers instead of declaring every orchestration state inline.
