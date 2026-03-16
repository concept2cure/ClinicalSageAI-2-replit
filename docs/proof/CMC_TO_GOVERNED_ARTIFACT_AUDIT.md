# CMC → Governed Artifact Audit

**Date:** 2026-03-12
**Branch:** `concept2cure-v2` @ `0a4b8e7c`

---

## What Is Real Now

### CMC Export Entry Points

**Client-side (ComprehensiveCMCPlatformClean.jsx L26030-26100):**

1. User clicks "Generate Module 3 DOCX" button (`data-testid="button-generate-module3"`)
2. Builds payload from `cmcData.drugSubstances[0]` + `cmcData.drugProducts[0]` + `cmcData.project`
3. Calls `POST /api/knowledge-base/generate-module3-docx` — downloads DOCX blob to user's machine
4. **Then** calls `POST /api/knowledge-base/save-docx-as-artifact` with `{projectId, title, htmlContent, ctdSection: '3.2'}`

### knowledge-base Routes

**`POST /api/knowledge-base/generate-module3-docx`** (server/routes/knowledge-base.ts L464-770):

- Generates DOCX from structured CMC data
- Has OPTIONAL `saveAsArtifact` parameter in request body — **client does NOT send this**
- If `saveAsArtifact && artifactProjectId`: inserts into `concept2cureArtifacts`, creates version, emits provenance
- Returns binary DOCX blob

**`POST /api/knowledge-base/save-docx-as-artifact`** (server/routes/knowledge-base.ts L845-940):

- **This is what the client actually calls** (L26082)
- Inserts into `concept2cureArtifacts` with `status='draft'`, `version=1`, `ctdSection`
- Creates version record in `concept2cureArtifactVersions`
- Emits provenance event (`eventAction: 'docx_save_as_artifact'`)
- Returns `{ success: true, data: { artifactId, title, version: 1 } }`

### Artifact Save Path — Proven Real

```
ComprehensiveCMCPlatformClean.jsx L26082:
  POST /api/knowledge-base/save-docx-as-artifact
  body: {
    projectId: project?.id || cmcData?.project?.id,
    title: `Module 3 – Quality (CMC): ${drug_name}`,
    htmlContent: "<h1>Module 3 – Quality (CMC): ...</h1>...",
    ctdSection: '3.2',
    type: 'regulatory_document'
  }

server/routes/knowledge-base.ts L875-886:
  INSERT INTO concept2cure_artifacts:
    artifactId, projectId, organizationId, type='regulatory_document',
    category='document', title, content=htmlContent, contentHash,
    version=1, ctdSection, status='draft', createdById

  INSERT INTO concept2cure_artifact_versions:
    artifactId (DB id), organizationId, version=1, content, contentHash

  emitKBProvenanceEvent:
    eventType='generation', eventAction='docx_save_as_artifact'
```

### CTD Placement

**Preserved:** Yes — hardcoded as `'3.2'` in both client (L26088) and backend (L882).

---

## What Is Optional / Manual

### Editor Auto-Open: Does NOT Exist

After CMC generates and saves the artifact:

- ❌ No `setPendingEditorContent` call
- ❌ No `setLayoutMode('regulatory-workspace')` navigation
- ❌ No `setRiViewMode('editor')` switch
- ❌ No redirect to ProjectWorkspaceShell
- ✅ Toast notification: "Module 3 DOCX Generated — Document downloaded and saved to project artifacts"

**User must manually:** Navigate to Concept2Cure workspace → find artifact in DocumentListPane → click to open.

### Error Handling: Silent Failures

```jsx
// ComprehensiveCMCPlatformClean.jsx L26096
} catch {
  // Non-critical — DOCX still downloaded
}
```

Artifact save failures are silently swallowed. User sees success toast even if artifact save failed.

---

## What Is Missing

| Gap                     | Description                                                                                                                     | Severity                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Auto-open in editor** | After artifact creation, user should be navigated to workspace with artifact open                                               | HIGH                             |
| **Error visibility**    | Silent catch hides save failures from user                                                                                      | MEDIUM                           |
| **Duplicate save path** | `generate-module3-docx` has unused `saveAsArtifact` backend path; client uses separate `save-docx-as-artifact` endpoint instead | LOW (not a bug, just redundancy) |

---

## Exact Minimal Code Change Required

### Change 1: CMC → Workspace Navigation (Client-side)

**File:** `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx`

The CMC component needs access to `setPendingEditorContent` and `setLayoutMode` from its parent context. Currently it receives no navigation callbacks.

**Required:** Add an `onDocumentCreated` callback prop that the parent (ZenApp) can handle:

```jsx
// In ComprehensiveCMCPlatformClean.jsx, after successful save-docx-as-artifact:
const result = await saveRes.json();
if (result.success && onDocumentCreated) {
  onDocumentCreated({
    artifactId: result.data.artifactId,
    title: result.data.title,
    ctdSection: '3.2',
  });
}
```

**In ZenApp.tsx, where CMC is rendered, add:**

```tsx
onDocumentCreated={({ title, ctdSection }) => {
  setPendingEditorContent({
    title,
    content: null, // will load from DB by artifactId
    ctdSection,
  });
  setLayoutMode('regulatory-workspace');
}}
```

**Alternative (simpler):** Since the artifact is already saved to DB, the callback can just navigate to the workspace and let the user find it in DocumentListPane. No `setPendingEditorContent` needed — just `setLayoutMode('regulatory-workspace')`.

### Change 2: Error Visibility

**File:** `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx`

Replace silent catch with user notification:

```jsx
} catch (saveErr) {
  console.warn('[CMC] Artifact save failed:', saveErr);
  // Don't block — DOCX was already downloaded
}
```

Toast already shows "Document downloaded and saved to project artifacts" — if save fails, the toast message is misleading. Fix: make toast conditional on save success.

### No New Endpoints, No New Surfaces

The `save-docx-as-artifact` endpoint already does everything needed:

- ✅ Inserts artifact
- ✅ Creates version
- ✅ Emits provenance
- ✅ Returns artifactId

The only gap is client-side navigation after the response.
