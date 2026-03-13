# Canvas Baseline Validation Report

**Date**: 2026-03-13
**Branch**: `concept2cure-v2`
**Build**: Clean — 43.30s, zero errors

---

## A. Canonical Workspace Truth

**Canonical workspace**: `ProjectWorkspaceShell.tsx`

- File: `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- Role: 3-pane orchestrator (left rail, center editor, right inspector)
- Modes: `list` | `edit`
- Left rail modes: `dossier` | `templates` | `outline` | `files`
- Right panels: Phase 4 inspector panels (Transform, Verification, Twin, Apps)
- Artifact lifecycle: creates, selects, places, delegates editing to EditorPanel

**Entry point**: `ZenApp.tsx` renders `<ProjectWorkspaceShell>` when `layoutMode === 'regulatory-workspace'` AND `riViewMode === 'editor'`

**No competing workspace exists.** All paths route to this single shell.

## B. Canonical Editor Truth

**Canonical editor**: `EditorPanel.tsx`

- File: `client/src/concept2cure/components/editor/EditorPanel.tsx`
- Role: Artifact CRUD + governed editing via `UnifiedDocumentEditor` (TipTap)
- Creates artifacts: POST `/api/concept2cure/projects/:id/artifacts`
- Saves versions: PUT `/api/concept2cure/projects/:id/artifacts/:aid`
- Loads trust data: signatures, provenance count, integrity verification
- Inspector panels: Intelligence, Provenance, Compare, Audit (single drawer at a time)
- Overflow actions: Save, Export DOCX, Sign & Approve, Status change, AI actions, Claim check, Set CTD, Export audit

**No parallel editor exists.** `UnifiedDocumentEditor` is the sole TipTap instance.

## C. Canonical Artifact/Document Lifecycle Truth

```
Surface (RI/IND/eCTD/CMC/Template)
  → content generated
  → artifact created in concept2cureArtifacts table
  → version record created
  → provenance event emitted
  → EditorPanel opens artifact
  → user edits in TipTap
  → save creates new version
  → provenance/compare/audit available
  → placement in CTD dossier tree
  → sign & approve lifecycle
  → lock/unlock lifecycle
  → DOCX export
```

**Single creation endpoint**: `POST /api/concept2cure/projects/:id/artifacts`
**Single save endpoint**: `PUT /api/concept2cure/projects/:id/artifacts/:aid`
**CMC alternate save**: `POST /api/knowledge-base/save-docx-as-artifact` (same table)

## D. Real vs Partial Component Matrix

| Component                      | File                                           | Real & Wired | Notes                                     |
| ------------------------------ | ---------------------------------------------- | :----------: | ----------------------------------------- |
| ProjectWorkspaceShell          | `workspace/ProjectWorkspaceShell.tsx`          |      ✅      | 3-pane orchestrator, all modes functional |
| EditorPanel                    | `editor/EditorPanel.tsx`                       |      ✅      | Full CRUD, versioning, inspector panels   |
| UnifiedDocumentEditor          | `editor/UnifiedDocumentEditor.tsx`             |      ✅      | TipTap rich text engine                   |
| DossierTree                    | `workspace/DossierTree.tsx`                    |      ✅      | CTD hierarchy, placement, drag targets    |
| TemplateTree                   | `workspace/TemplateTree.tsx`                   |      ✅      | Template-based artifact creation          |
| DocumentOutlineTree            | `workspace/DocumentOutlineTree.tsx`            |      ✅      | Live heading outline from active doc      |
| DocumentListPane               | `workspace/DocumentListPane.tsx`               |      ✅      | Browse/select artifacts                   |
| PlacementDialog                | `workspace/PlacementDialog.tsx`                |      ✅      | CTD section assignment                    |
| DocumentProvenancePanel        | `provenance/DocumentProvenancePanel.tsx`       |      ✅      | Real API, event timeline                  |
| DocumentVersionCompare         | `provenance/DocumentVersionCompare.tsx`        |      ✅      | Real diff, rollback capability            |
| DocumentAuditReport            | `provenance/DocumentAuditReport.tsx`           |      ✅      | Full audit trail, export                  |
| RegulatoryIntelligencePanel    | `intelligence/RegulatoryIntelligencePanel.tsx` |      ✅      | Strategy + evidence panels                |
| RegulatoryTransformCanvas      | `workspace/RegulatoryTransformCanvas.tsx`      |      ✅      | Transform pipeline, delegates to editor   |
| GoldenDossierVerificationPanel | `workspace/GoldenDossierVerificationPanel.tsx` |      ✅      | Reads DB, completeness checks             |
| ProgramTwinPanel               | `workspace/ProgramTwinPanel.tsx`               |      ✅      | Program state from DB                     |
| SubmissionAppsPanel            | `workspace/SubmissionAppsPanel.tsx`            |      ✅      | App launcher, creates artifacts           |
| RICopilotHome                  | `ZenApp.tsx` (inline)                          |      ✅      | Drafts via pendingEditorContent           |

## E. Broken / Misleading / Duplicate Paths

### Fixed Gaps (previously broken, now resolved)

| Issue                                  | Status   | Fix                                         |
| -------------------------------------- | -------- | ------------------------------------------- |
| CMC save → no editor auto-open         | ✅ FIXED | `openArtifactId` handoff chain              |
| CMC error toast invisible              | ✅ FIXED | Error toasts + `onDocumentCreated` callback |
| `openArtifactId` consumed too early    | ✅ FIXED | Consumption only after `setActiveArtifact`  |
| No error state when artifact not found | ✅ FIXED | `openArtifactNotFound` governed error UI    |

### Remaining Gaps (to harden)

| Issue                                                                        | Severity | Action                                                                                           |
| ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Trust indicators fetched but not rendered in editor toolbar                  | Medium   | Add trust strip: version, signatures, provenance count, integrity                                |
| RI panel `onCreateDocument` not wired when opened from EditorPanel inspector | Low      | RI "Save as Strategy Memo" button does nothing in inspector mode — only works from RICopilotHome |

### No Duplicate/Competing Surfaces

Every surface has a distinct role. No two surfaces compete to create or edit the same artifact type.

## F. Recommended Next Build Steps (Existing Canvas Only)

1. **Add trust indicator strip to editor toolbar** — render version, signature count, provenance event count, integrity status inline next to the CTD/status badges. Data is already fetched.
2. **Wire RI inspector `onCreateDocument`** — pass callback to RegulatoryIntelligencePanel when opened from EditorPanel inspector drawer so "Save as Strategy Memo" works everywhere.

No new surfaces. No new editors. No new shells.

---

## G. Implementation Log

| File                                | Change                                                                      | Why                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `EditorPanel.tsx`                   | Added `openArtifactNotFound` state + governed error UI                      | Defensive guard: visible error when artifact not found after CMC handoff         |
| `EditorPanel.tsx`                   | Fixed `openArtifactId` useEffect — retry once, then error                   | Consumption discipline: only consume after successful activation                 |
| `EditorPanel.tsx`                   | Added trust indicator strip to editor toolbar                               | Trust data (version, sigs, provenance, integrity) was fetched but never rendered |
| `ProjectWorkspaceShell.tsx`         | Added `openArtifactId` + `onOpenArtifactConsumed` props + useEffect         | CMC handoff: shell sets selectedDocId + edit mode when openArtifactId arrives    |
| `ZenApp.tsx`                        | Added `openArtifactId` state + CMC callback update + shell prop wiring      | CMC direct-open: artifact ID flows from CMC save to shell to editor              |
| `ComprehensiveCMCPlatformClean.jsx` | `onDocumentCreated` callback fires with `{ artifactId, title, ctdSection }` | CMC bridge: save response feeds directly into openArtifactId handoff             |

## H. Pass / Fail Table

| Criterion                                      | Status  | Evidence                                                                                            |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Document generation opens in current workspace | ✅ PASS | All 5 paths (RI, Template, IND, eCTD, CMC) route to ProjectWorkspaceShell → EditorPanel             |
| Artifact created                               | ✅ PASS | Single endpoint: `POST /api/concept2cure/projects/:id/artifacts` (or CMC's `save-docx-as-artifact`) |
| Editor opens populated                         | ✅ PASS | `initialContent` path auto-creates + opens; `openArtifactId` path selects + opens                   |
| Provenance works                               | ✅ PASS | Inspector drawer: `DocumentProvenancePanel` with real API data                                      |
| Compare works                                  | ✅ PASS | Inspector drawer: `DocumentVersionCompare` with real diff + rollback                                |
| Audit works                                    | ✅ PASS | Inspector drawer: `DocumentAuditReport` with full trail + export                                    |
| Dossier placement visible                      | ✅ PASS | `DossierTree` + `PlacementDialog` for CTD section assignment                                        |
| Biotech handoff works                          | ✅ PASS | IND `onOpenSection` → `pendingEditorContent` → artifact created → editor opens                      |
| eCTD handoff works                             | ✅ PASS | eCTD `onOpenSection` → `pendingEditorContent` → artifact created → editor opens                     |
| CMC handoff works                              | ✅ PASS | CMC save → `openArtifactId` → editor opens exact artifact by ID                                     |
| No duplicate canvas introduced                 | ✅ PASS | Zero new shells, editors, or workspaces created                                                     |
| Trust indicators visible                       | ✅ PASS | Version, signature count, provenance count, integrity state in editor toolbar                       |
| Error state for failed handoff                 | ✅ PASS | `openArtifactNotFound` renders governed error with recovery buttons                                 |

## I. Open Gaps

| Gap                                       | Severity | Notes                                                                                                                                       |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| RI inspector `onCreateDocument` not wired | Low      | "Save as Strategy Memo" button in RI panel does nothing when RI is opened from EditorPanel inspector drawer (works fine from RICopilotHome) |

No critical gaps remain. The canonical canvas is fully operational.
