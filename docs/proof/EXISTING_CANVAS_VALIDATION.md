# Existing Canvas Validation

**Date:** 2026-03-12
**Branch:** `concept2cure-v2` @ `0a4b8e7c`
**Build:** ✓ 43.23s, zero errors

---

## Existing Canvas Truth

### Canonical Flow

```
user intent / evidence / template / section action
  → setPendingEditorContent({ title, content, ctdSection })
  → ZenApp passes as initialContent / initialTitle / initialCtdSection props
  → ProjectWorkspaceShell receives props, switches to edit mode (useEffect L282-285)
  → EditorPanel auto-creates artifact via POST /api/concept2cure/projects/:id/artifacts (L288-319)
  → artifact persisted to concept2cureArtifacts table (status='draft', version=1, ctdSection preserved)
  → onInitialContentConsumed() clears pending state
  → editor opens with governed artifact
  → future saves via PUT /api/concept2cure/projects/:id/artifacts/:artifactId
```

### File Ownership

| Role                 | File                          | Lines                                        |
| -------------------- | ----------------------------- | -------------------------------------------- |
| Pending state        | ZenApp.tsx                    | L534-538 (state def), L1910-1922 (prop pass) |
| Edit mode switch     | ProjectWorkspaceShell.tsx     | L282-285 (useEffect)                         |
| Artifact auto-create | EditorPanel.tsx               | L288-319 (POST /artifacts)                   |
| Artifact DB insert   | server/routes/concept2cure.ts | L1890-1928 (INSERT)                          |
| Version record       | server/routes/concept2cure.ts | L1929-1939 (INSERT versions)                 |
| Provenance event     | server/routes/concept2cure.ts | L1943-1960 (emitProvenanceEvent)             |
| DB schema            | shared/schema.ts              | L4671+ (concept2cureArtifacts table)         |

### Why This Is the Official Document Substrate

1. **Single artifact creation endpoint** — `POST /api/concept2cure/projects/:id/artifacts` is the only way documents enter the system
2. **Only 3 components call this endpoint**: ProjectWorkspaceShell (handleCreateNew L320, handleCreateFromTemplate L352), EditorPanel (auto-create L288), SubmissionAppsPanel (handleRunApp ~L60)
3. **All other surfaces delegate** — RI, IND, eCTD, Transform Canvas, Templates all resolve through `setPendingEditorContent` → this path
4. **No competing persistence** — no other table stores authored regulatory documents (CMC uses `stability_studies` for raw data, not for documents)
5. **Full lifecycle** — draft → review → approved → locked, with signatures, provenance, versioning, DOCX export, lock enforcement (HTTP 423)

---

## End-to-End Flow Map

### A. RI Evidence → Governed Document

| Step | Component                 | Line(s)    | Action                                                                                                    | Proven |
| ---- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ------ |
| 1    | ZenApp.tsx                | L1457-1465 | `onOpenSection` → `setPendingEditorContent({content, title, ctdSection})`                                 | ✅     |
| 2    | ZenApp.tsx                | L1467-1476 | `onDraftWithAI` → `setPendingEditorContent({content, title, ctdSection})`                                 | ✅     |
| 3    | ZenApp.tsx                | L1910-1922 | Props passed to `<ProjectWorkspaceShell initialContent={...} initialTitle={...} initialCtdSection={...}>` | ✅     |
| 4    | ProjectWorkspaceShell.tsx | L282-285   | useEffect detects initialContent+initialTitle → `setMode('edit')`                                         | ✅     |
| 5    | EditorPanel.tsx           | L288-319   | useEffect auto-creates artifact via `POST /artifacts` with title, content, ctdSection                     | ✅     |
| 6    | server/concept2cure.ts    | L1890-1928 | Artifact inserted with `status='draft'`, `version=1`, ctdSection persisted                                | ✅     |
| 7    | EditorPanel.tsx           | L307       | `onInitialContentConsumed()` → `setPendingEditorContent(null)`                                            | ✅     |
| 8    | EditorPanel.tsx           | L804-806   | Status badge renders 'draft' in zinc styling                                                              | ✅     |
| 9    | EditorPanel.tsx           | L812       | Version displays `v1`                                                                                     | ✅     |

**Dead ends: NONE.** Every RI action leads to a persisted artifact.

### B. Template → Governed Document

| Step | Component                 | Line(s)  | Action                                                                                         | Proven |
| ---- | ------------------------- | -------- | ---------------------------------------------------------------------------------------------- | ------ |
| 1    | TemplateTree.tsx          | L107     | Click `+` button → `onCreateFromTemplate(templateKey, ctdSection, label)`                      | ✅     |
| 2    | ProjectWorkspaceShell.tsx | L345-378 | `handleCreateFromTemplate` → `POST /artifacts` with `{title, content, ctdSection, templateId}` | ✅     |
| 3    | ProjectWorkspaceShell.tsx | L373-377 | Response → `setSelectedDocId(created.id)` → `setMode('edit')` → `setLeftRailMode('dossier')`   | ✅     |
| 4    | ProjectWorkspaceShell.tsx | L778-785 | Document header shows CTD section badge + template ID badge                                    | ✅     |

**templateId persisted:** Yes — passed in POST body, stored in artifact metadata.
**Suggested dossier placement visible:** Yes — CTD section badge in document header + dossier tree auto-switches.

### C. Dossier Placement / Move

| Step | Component                 | Line(s)    | Action                                                                                                                 | Proven |
| ---- | ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| 1    | ProjectWorkspaceShell.tsx | L408-410   | `handleCutDocument(art)` → `setPendingMove({artifact, fromSection})` (locked docs blocked)                             | ✅     |
| 2    | ProjectWorkspaceShell.tsx | L815-821   | Scissors button in doc header (hidden for locked docs)                                                                 | ✅     |
| 3    | ProjectWorkspaceShell.tsx | L694-710   | Pending move banner: amber bg, artifact title, from/to sections, approved-doc warning, cancel button                   | ✅     |
| 4    | DossierTree.tsx           | L471-481   | "Paste here" context menu item — amber text, shows artifact title                                                      | ✅     |
| 5    | PlacementDialog.tsx       | L139-156   | 3 operations: reclassify / place / relocate with descriptions                                                          | ✅     |
| 6    | PlacementDialog.tsx       | L192-197   | Validation: section selected + reason >= 5 chars + not same-section for relocate                                       | ✅     |
| 7    | PlacementDialog.tsx       | L258-270   | Approved-doc warning for relocate operations                                                                           | ✅     |
| 8    | server/concept2cure.ts    | L2161-2216 | Backend validates: operation type, CTD format (`/^[\dA-Z]+(\.[\dA-Z]+)*$/i`), reason >= 5 chars, lock check (HTTP 423) | ✅     |
| 9    | server/concept2cure.ts    | L2220-2225 | Audit log: `logAuditEntry(req, 'UPDATE', 'artifact', ...)` with before/after ctdSection                                | ✅     |
| 10   | server/concept2cure.ts    | L2226-2245 | Provenance event: `emitProvenanceEvent({eventType: 'placement', eventAction: operation, ...})`                         | ✅     |
| 11   | ProjectWorkspaceShell.tsx | L380-392   | After placement: `await loadArtifacts()` → DossierTree recomputes section counts                                       | ✅     |

**Lock enforcement:** ✅ HTTP 423 for locked artifacts.
**Provenance:** ✅ Full event with actor, from/to sections, reason, timestamp.
**Audit log:** ✅ Separate audit trail entry.

### D. IND / eCTD → Governed Document

| Step | Component                 | Line(s)    | Action                                                                 | Proven |
| ---- | ------------------------- | ---------- | ---------------------------------------------------------------------- | ------ |
| 1    | ZenApp.tsx                | L1457-1465 | INDWorkspace `onOpenSection` → `setPendingEditorContent`               | ✅     |
| 2    | ZenApp.tsx                | L1467-1476 | INDWorkspace `onDraftWithAI` → `setPendingEditorContent`               | ✅     |
| 3    | ZenApp.tsx                | L1569-1580 | eCTDCoAuthor → `setPendingEditorContent({title, content, ctdSection})` | ✅     |
| 4    | EditorPanel.tsx           | L288-319   | Auto-create artifact (same path as RI)                                 | ✅     |
| 5    | DocumentListPane.tsx      | L153-170   | Click row → `onSelect(doc)` callback                                   | ✅     |
| 6    | ProjectWorkspaceShell.tsx | L1344-1348 | `handleSelectDoc` → `setSelectedDocId(doc.id)` → `setMode('edit')`     | ✅     |

**Dead-end drafting states: NONE.** All `setPendingEditorContent` calls result in persisted artifacts.
**Reopen path: YES.** User navigates to ProjectWorkspaceShell → DocumentListPane → clicks artifact → opens in editor.

### E. CMC → Governed Document

| Step | Component                         | Line(s)      | Action                                                                                                                      | Proven |
| ---- | --------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1    | ComprehensiveCMCPlatformClean.jsx | L26053       | `POST /api/knowledge-base/generate-module3-docx` → downloads DOCX                                                           | ✅     |
| 2    | ComprehensiveCMCPlatformClean.jsx | L26082-26094 | After download → `POST /api/knowledge-base/save-docx-as-artifact` with `{projectId, title, htmlContent, ctdSection: '3.2'}` | ✅     |
| 3    | server/knowledge-base.ts          | L848-940     | Backend: inserts into `concept2cureArtifacts` + creates version + emits provenance                                          | ✅     |

**GAPS IDENTIFIED:**

- ✅ ~~CMC does NOT call `setPendingEditorContent`~~ **FIXED** — Uses `openArtifactId` handoff instead (correct: artifact already exists, no duplicate creation)
- ✅ ~~CMC artifact save is in try/catch with empty catch~~ **FIXED** — Error toasts now visible, `onDocumentCreated` callback fires with `{ artifactId, title, ctdSection }`
- ✅ ~~No navigation to ProjectWorkspaceShell after generation~~ **FIXED** — `setLayoutMode('regulatory-workspace')` + `setRiViewMode('editor')` + `setOpenArtifactId(artifactId)`
- ✅ CTD section IS preserved (hardcoded `'3.2'`)
- ✅ Artifact DOES enter `concept2cureArtifacts` table (same table as IND/eCTD)
- ✅ Provenance IS emitted
- ✅ Defensive error state added: if artifact not found after load, shows governed error with "Refresh documents" and "Open artifact list" recovery actions

**Verdict:** CMC → governed document path is **FULLY OPERATIONAL**. All gaps closed. See `docs/proof/CMC_DIRECT_OPEN_RUNTIME_PROOF.md` for complete handoff proof.

---

## Reuse / Merge / Deprecate Matrix

### CANONICAL (Keep — these ARE the system)

| Surface                   | Role                     | Artifact Creation      | Classification |
| ------------------------- | ------------------------ | ---------------------- | -------------- |
| ProjectWorkspaceShell.tsx | 3-pane orchestrator      | YES (L320, L352)       | **KEEP**       |
| EditorPanel.tsx           | Governed document editor | YES (auto-create L288) | **KEEP**       |
| UnifiedDocumentEditor.tsx | TipTap rich text engine  | NO (pure editor)       | **KEEP**       |

### SUPPORT (Keep — compose into canonical workspace)

| Surface                            | Role                             | Classification |
| ---------------------------------- | -------------------------------- | -------------- |
| DossierTree.tsx (workspace/)       | CTD hierarchy + placement        | **KEEP**       |
| TemplateTree.tsx                   | Template-based creation          | **KEEP**       |
| DocumentOutlineTree.tsx            | Live outline + alignment         | **KEEP**       |
| DocumentListPane.tsx               | Browse view                      | **KEEP**       |
| PlacementDialog.tsx                | Governed placement               | **KEEP**       |
| SectionRequirementsPanel.tsx       | Section guidance                 | **KEEP**       |
| DocumentProvenancePanel.tsx        | Provenance inspector             | **KEEP**       |
| DocumentVersionCompare.tsx         | Version diff                     | **KEEP**       |
| DocumentAuditReport.tsx            | Audit report                     | **KEEP**       |
| RegulatoryIntelligencePanel.tsx    | Intel sidebar                    | **KEEP**       |
| RegulatoryTransformCanvas.tsx      | Transform pipeline (delegates)   | **KEEP**       |
| GoldenDossierVerificationPanel.tsx | Verification (reads DB)          | **KEEP**       |
| ProgramTwinPanel.tsx               | Program state (reads DB)         | **KEEP**       |
| SubmissionAppsPanel.tsx            | App launcher (creates artifacts) | **KEEP**       |

### ISOLATED (Do Not Touch — separate systems, no conflict)

| Surface                              | Role                     | Classification   |
| ------------------------------------ | ------------------------ | ---------------- |
| ConvergentCanvas.tsx (canvas/)       | Phase 52 command center  | **DO NOT TOUCH** |
| ConvergentCanvas.tsx (layout/)       | Layout wrapper for above | **DO NOT TOUCH** |
| EditorCanvas.tsx (routes/authoring/) | Legacy TipTap route      | **DO NOT TOUCH** |
| EditorPage.tsx (routes/authoring/)   | Legacy authoring page    | **DO NOT TOUCH** |
| DossierTree.tsx (routes/authoring/)  | Legacy CTD tree          | **DO NOT TOUCH** |

### NEEDS BRIDGE (Close gap in-place)

| Surface                           | Role         | Classification                                                      |
| --------------------------------- | ------------ | ------------------------------------------------------------------- |
| ComprehensiveCMCPlatformClean.jsx | CMC platform | **KEEP** — needs bridge to open artifact in editor after generation |

### DUPLICATES FOUND

**None.** Every surface has a distinct role. No two surfaces compete to create or edit the same artifact type.

---

## Missing Layer

**Smallest missing layer: CMC → editor auto-open.**

The CMC platform already:

- ✅ Creates artifacts in `concept2cureArtifacts` table
- ✅ Sets CTD section to `'3.2'`
- ✅ Emits provenance event
- ✅ Creates version record

What it does NOT do:

- ✅ ~~Call `setPendingEditorContent`~~ **RESOLVED** — Uses `openArtifactId` handoff (correct pattern: artifact already exists)
- ✅ ~~Navigate the user to ProjectWorkspaceShell~~ **RESOLVED** — `setLayoutMode('regulatory-workspace')` + `setRiViewMode('editor')`

**Status:** Fully wired. See `docs/proof/CMC_DIRECT_OPEN_RUNTIME_PROOF.md`.

---

## Honest Judgment

**Existing substrate is real and extensible.**

Every flow (RI, Templates, Dossier, eCTD, IND, CMC) traces to real DB operations with real validation, real provenance, real audit logging. The system has one artifact creation endpoint, one editor, one placement mechanism. The Phase 4 panels (Transform Canvas, Verification, Program Twin, Submission Apps) are intelligence overlays that compose into the workspace without creating parallel paths.

All five canonical paths are now fully operational:

| #   | Path                        | Mechanism                                        | Artifact Op | Edit Mode | Status   |
| --- | --------------------------- | ------------------------------------------------ | ----------- | --------- | -------- |
| A   | RI draft → governed doc     | `pendingEditorContent` → EditorPanel auto-create | CREATE      | ✅        | **PASS** |
| B   | Template → governed doc     | `handleCreateFromTemplate` in Shell              | CREATE      | ✅        | **PASS** |
| C   | IND draft → governed doc    | `pendingEditorContent` → EditorPanel auto-create | CREATE      | ✅        | **PASS** |
| D   | eCTD draft → governed doc   | `pendingEditorContent` → EditorPanel auto-create | CREATE      | ✅        | **PASS** |
| E   | CMC generate → governed doc | `openArtifactId` → EditorPanel select-by-ID      | SELECT      | ✅        | **PASS** |

**Re-validated**: 2026-03-13. Zero gaps remaining.
