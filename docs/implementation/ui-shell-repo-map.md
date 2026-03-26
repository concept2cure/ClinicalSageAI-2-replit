# UI Shell Repo Map (Read-Only Scout)

## Scope
Read-only mapping of live shell/IA implementation seams used to execute canonical shell convergence.

## Primary shell entry points
- `client/src/concept2cure/router/ZenRouter.tsx` — authenticated routing gateway into Concept2Cure app surfaces.
- `client/src/concept2cure/ZenApp.tsx` — effective runtime shell orchestrator (left rail, canvas routing, right utilities, command palette, persistent AnA).
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` — primary left-rail nav + project/conversation navigation.

## Project/document workspace seams
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` — project-level workspace framing, document browse/edit transitions, governed panel integration.
- `client/src/concept2cure/components/editor/EditorPanel.tsx` — governed document studio internals (versions/provenance/review/signatures/export mechanics).

## Existing utility/persistence surfaces
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — persistent AnA surface.
- `client/src/concept2cure/components/command/ZenCommandPalette.tsx` — global command/search surface.
- `client/src/concept2cure/components/workspace/ProjectSidebar.tsx` — contextual right rail.

## Reports / review / submission seams
- Reports render mode currently driven from `ZenApp.tsx` (`report-engine` layout mode mapping).
- Review + submissions routes also converge through `ZenApp.tsx` mode switch and `ProjectWorkspaceShell.tsx` navigation callbacks.

## Duplicate/shell-drift findings
- Global and workflow nav labels were mixed in sidebar, causing IA drift (project/workflow/global nouns overlap).
- Top bar context was not globally persistent in shell-level frame.
- Right utility drawer state existed but was not consistently surfaced as an always-on shell affordance.

## File ownership recommendations

### Evolve in place
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`

### Merge / converge
- Navigation mapping in `ZenApp.tsx` + nav rendering in `ZenSidebar.tsx` (single canonical nav contract).
- Project workspace mode controls in `ProjectWorkspaceShell.tsx` toward canonical project/document IA tabs.

### Deprecate (behavioral, not file deletion yet)
- Legacy/demoted nav aliases that map to removed worlds in `ZenApp.tsx` (retain compatibility redirects, avoid surfacing in UI).

### Leave untouched in this pass
- `EditorPanel.tsx` governance internals (already handles versions/provenance/review/signature/export behaviors).
- auth/legal routes in `ZenRouter.tsx` except compatibility.
