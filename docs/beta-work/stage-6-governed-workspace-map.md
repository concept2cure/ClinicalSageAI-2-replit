# Stage 6 — Governed Workspace and Document Lifecycle Hardening

Stage: Stage 6 — Governed Workspace and Document Lifecycle Hardening  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `40004a38` (`40004a38`) as pre-Stage-6 baseline  
Stage 6 implementation commit: `b540c9f5` (`b540c9f5`)  
Stage 6 validation snapshot commit: `b540c9f5` (`b540c9f5`)

## Scope reviewed

- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/workspace/GovernedDocumentPanel.tsx`
- `client/src/concept2cure/components/editor/EditorPanel.tsx` (handoff and inspector surfaces)
- `client/src/concept2cure/ZenApp.tsx` (parent integration and state return)
- `server/routes/concept2cure.ts` (artifact lifecycle backend endpoints)

## Mission boundary (enforced)

- No orchestration model rewrite.
- No deletion of governed lifecycle paths.
- Only safe subordinate extraction/cleanup that preserves behavior contracts.

## Beta-critical governed workspace flows (mapped)

| Flow | Primary frontend evidence | Backend evidence | Stage 6 status |
|---|---|---|---|
| Create new document | `ProjectWorkspaceShell.tsx` `handleCreateNew`, `handleCreateFromTemplate`, dialog create handlers | `concept2cure.ts` `POST /projects/:projectId/artifacts` | Protected + smoke-covered |
| Open existing artifact | `openArtifactId` effect + `tryOpenForEdit` gating + `setSelectedDocId`/`setMode('edit')` | `concept2cure.ts` artifact list/read + versions/provenance endpoints | Protected + smoke-covered |
| Active context updates | `onActiveDocumentChange` effect using active artifact + content excerpt | N/A (context propagation is shell-to-parent contract) | Protected + smoke-covered |
| Place / relocate in dossier | `PlacementDialog`, `handlePlacementConfirm`, cleanup wrapper | `PUT /projects/:projectId/artifacts/:artifactId/placement` | Protected + smoke-covered |
| Editor handoff | `EditorPanel` receives `initialContent`, `openArtifactId`, inspector target, consume callbacks | Artifact CRUD + versions endpoints | Protected + smoke-covered |
| Review / provenance / audit entry | `documentTab` switch sets `editorInitialInspector`, `GovernedDocumentPanel` opens and routes diff/inspector flows | `GET /.../provenance`, `GET /.../versions`, status/rollback routes | Protected + smoke-covered |
| Export access | Shell routes to editor/governed surfaces; editor invokes export actions | `POST /artifacts/export-docx|pdf|pptx` + audit report exports | Protected + smoke-covered |
| Return without state loss | `localStorage` persistence/restore key `c2c_last_artifact_${projectId}` + parent consume callbacks in ZenApp | N/A | Protected + smoke-covered |

## Workspace responsibility map (ProjectWorkspaceShell)

1. **Core orchestration state machine (must stay in shell):**
   - mode (`dashboard`/`browse`/`edit`)
   - selected artifact + gating (`tryOpenForEdit`)
   - document tab -> inspector routing
   - placement/move workflow state
   - phase panel/router state
2. **Parent integration contracts (must stay in shell):**
   - `onInitialContentConsumed`, `onOpenArtifactConsumed`
   - `onActiveDocumentChange`
   - `onNavigate` handoff paths
3. **Data + lifecycle hooks (must stay in shell):**
   - artifact load/create/update orchestration
   - placement confirmation + post-refresh
   - local state restore behavior

## Safe extraction candidates vs no-go zones

### Safe in Stage 6 (subordinate extraction only)

- `SectionRequirementsPanel` was extracted to:
  - `client/src/concept2cure/components/workspace/SectionRequirementsPanel.tsx`
- Rationale:
  - Pure child presentation/interaction unit with local UI-only toggle state.
  - No ownership of shell mode, artifact lifecycle, editor handoff, or placement state machine.

### No-go (explicitly retained in shell)

- `tryOpenForEdit` + escalation gating
- `documentTab`/`editorInitialInspector` synchronization effect
- `onActiveDocumentChange` effect and excerpt generation
- `openArtifactId`/`initialContent` consume contracts
- placement/move orchestration and `handlePlacementConfirmWithCleanup`
- `DocumentModeProvider` + workflow-stage capability envelope

## Stage 6 implementation performed

1. Extracted `SectionRequirementsPanel` into standalone child component file.
2. Updated `ProjectWorkspaceShell.tsx` to import/use extracted child + shared `SectionMetrics` type.
3. Left all orchestration responsibilities in place.

No behavior contract changes were intentionally introduced.

