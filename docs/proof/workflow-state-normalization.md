# Workflow State Normalization

## Transition model
Implemented in `WORKFLOW_TRANSITION_MAP` in `workspaceShellControllers.ts`.

Transitions covered:
- project home
- dossier planning
- browse list
- edit document
- verify/review
- publish/package

Each transition defines:
- allowed source states
- destination state
- required context (where needed)
- fallback state

## Safety goals
- Prevent edit without selected document or creation intent.
- Keep publish handoff tied to submission context.
- Ensure fallback behavior is explicit when context is missing.


## Enforcement update
- `ProjectWorkspaceShell` now applies transition-map checks through `applyWorkflowTransition(...)` before moving between dashboard/browse/edit, verify, and publish paths.
- Missing required context now falls back to defined transition fallback states instead of implicit mode drift.
