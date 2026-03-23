# Document Loop Proof Pack

> **Status**: REAL — All primary generation paths produce governed artifacts.
> **Date**: 2026-03-22
> **Commit**: ccb28ec (Phase 3 complete)

---

## Chain Under Proof

**Intent → Generation → Artifact → Editor → Project → Placement → Lifecycle → Audit**

Every entry below proves one or more links in this chain.

---

## 1. Chat Generation → Artifact

### ChatPanel (Split-screen workspace)

| Item | Value |
|------|-------|
| **Click path** | Open project → Workspace → Chat panel (left side) → Send message → AI responds with code block > 200 chars |
| **Artifact type** | `document_section` or `risk_heatmap` |
| **Project context** | Active project from ProjectContext |
| **Backend endpoint** | `POST /api/chat` (AI Gateway) → client calls `POST /api/concept2cure/projects/:projectId/artifacts` |
| **What it proves** | Chat-generated content persists to DB, not just React state |
| **DB tables touched** | `concept2cure_artifacts`, `concept2cure_artifact_versions`, `concept2cure_provenance_events`, `regulatory_audit_logs` |
| **File** | `client/src/concept2cure/components/chat/ChatPanel.tsx:514-548` |

### AnaPersistentPanel (All screens)

| Item | Value |
|------|-------|
| **Click path** | Any screen → AnA chat → Send message → AI responds → Click "Save to Vault" (download icon) |
| **Artifact type** | `document_section` |
| **Project context** | `contextProfile.projectId` from parent component |
| **Backend endpoint** | `POST /api/cortex/chat` → client calls `POST /api/concept2cure/projects/:projectId/artifacts` |
| **What it proves** | Primary chat surface creates real artifacts; auto-extraction for code blocks > 200 chars |
| **File** | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx:455-480, 807-830` |

### ZenChat (510(k), PMA modules)

| Item | Value |
|------|-------|
| **Click path** | 510(k) or PMA module → Chat → AI generates artifact → Click "Save to Vault" |
| **Artifact type** | Per `CortexArtifact.format` (markdown, code, table, chart, form) |
| **Project context** | `projectId` prop |
| **Backend endpoint** | `POST /api/cortex/chat` → `useDocumentActions().saveArtifact()` → `POST /api/concept2cure/projects/:projectId/artifacts` |
| **What it proves** | Module-specific chat creates governed artifacts with CTD section mapping |
| **File** | `client/src/concept2cure/components/chat/ZenChat.tsx:1051-1109` |

---

## 2. eCTD Draft → Artifact

| Item | Value |
|------|-------|
| **Click path** | eCTD Co-Author → Select section → Click "Draft with RI" |
| **Artifact type** | `regulatory_document` |
| **Project context** | `docState.id` (project ID from eCTD document) |
| **Backend endpoint** | `POST /api/knowledge-base/generate-ind-section` → `POST /api/knowledge-base/save-docx-as-artifact` |
| **What it proves** | AI-drafted eCTD sections are persisted as governed artifacts with CTD section codes |
| **DB tables touched** | `concept2cure_artifacts` (status=draft, version=1), `concept2cure_artifact_versions`, provenance events |
| **File** | `client/src/concept2cure/components/coauthor/eCTDCoAuthor.tsx:1120-1150` |

---

## 3. IND Draft → Artifact

### Via ZenApp onDraftWithAI

| Item | Value |
|------|-------|
| **Click path** | IND Workspace → Select section → Click "Draft with RI" |
| **Artifact type** | `regulatory_document` |
| **Project context** | `activeProjectId` from ZenApp state |
| **Backend endpoint** | `POST /api/knowledge-base/generate-ind-section` → content passed to EditorPanel as `initialContent` → EditorPanel calls `POST /api/concept2cure/projects/:projectId/artifacts` |
| **What it proves** | IND section drafting calls real AI, creates artifact, opens populated editor |
| **File** | `client/src/concept2cure/ZenApp.tsx:2363-2395` (first instance), `EditorPanel.tsx:575-600` (auto-create) |

### Via useGenerateINDSection hook

| Item | Value |
|------|-------|
| **Click path** | Any UI calling `useGenerateINDSection()` |
| **Backend endpoint** | `POST /api/knowledge-base/generate-ind-section` → auto-saves via `POST /api/knowledge-base/save-docx-as-artifact` |
| **What it proves** | Hook-level generation auto-persists as artifact |
| **File** | `client/src/concept2cure/hooks/useDocumentFactory.ts:68-105` |

---

## 4. Document Factory / Export → Artifact

### IND Package (DOCX)

| Item | Value |
|------|-------|
| **Click path** | Generate IND Package → Download DOCX |
| **Backend endpoint** | `POST /api/knowledge-base/generate-ind-package` with `saveAsArtifact: true` |
| **What it proves** | Download flow also creates DB artifact — no download-only path |
| **File** | `client/src/concept2cure/hooks/useDocumentFactory.ts:114-130` |

### CMC Module 3 (DOCX)

| Item | Value |
|------|-------|
| **Click path** | CMC Platform → Generate Module 3 → Download DOCX |
| **Backend endpoint** | `POST /api/knowledge-base/generate-module3-docx` with `saveAsArtifact: true` |
| **What it proves** | CMC export creates governed artifact with CTD section 3.2, provenance events for generation + source_input |
| **File** | `client/src/concept2cure/hooks/useDocumentFactory.ts:160-177`, `server/routes/knowledge-base.ts:660-730` |

---

## 5. Populated Editor Handoff

| Item | Value |
|------|-------|
| **Click path** | Any generation → Editor opens |
| **Mechanism** | EditorPanel receives `initialContent` + `initialTitle` → calls `POST /api/concept2cure/projects/:projectId/artifacts` → sets `activeArtifact` from response → UnifiedDocumentEditor renders content |
| **Guard** | `initialContentConsumedRef` prevents double-creation |
| **What it proves** | Editor never opens empty after generation; content comes from DB artifact |
| **File** | `client/src/concept2cure/components/editor/EditorPanel.tsx:575-600` |

---

## 6. Project Visibility

| Item | Value |
|------|-------|
| **Click path** | Project Workspace → Files panel (left rail) |
| **Mechanism** | `ProjectFileTree` renders artifacts from `GET /api/concept2cure/projects/:projectId/artifacts` |
| **What it proves** | All created artifacts appear in project file tree, categorized by type/status/CTD section |
| **Reopen** | Click artifact in file tree → EditorPanel loads via `openArtifactId` |
| **Persistence** | Survives page refresh — data from DB, not React state |
| **File** | `client/src/concept2cure/components/workspace/ProjectFileTree.tsx`, `EditorPanel.tsx:492-514` |

---

## 7. Lifecycle State

| Item | Value |
|------|-------|
| **States** | `draft` → `review` → `approved` → `locked` |
| **Enforcement** | `PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/status` |
| **Role-based** | author: draft→review only; reviewer: +approve; admin: all transitions |
| **Regressions** | Require `reason` (min 5 chars) |
| **Attestation** | Required for approve/lock — creates e-signature |
| **Lock** | `locked` prevents all edits; sets `lockedAt`, `lockedById` |
| **File** | `server/routes/concept2cure.ts:4164-4540` |

---

## 8. Provenance / Audit Events

| Item | Value |
|------|-------|
| **Creation** | `emitProvenanceEvent({ eventType: 'generation', eventAction: 'ai_generate' \| 'human_create' })` |
| **Edit** | `emitProvenanceEvent({ eventType: 'transformation', eventAction: 'human_edit' })` with version delta |
| **Status change** | `emitProvenanceEvent({ eventType: 'status_change' })` with previous/new status |
| **Export** | `emitProvenanceEvent({ eventType: 'export' })` |
| **Audit log** | `logAuditEntry(req, action, entityType, entityId, previousState, newState)` with SHA-256 integrity hash |
| **Feedback** | `POST /api/concept2cure/feedback` → `ai_feedback` table + audit trail |
| **Tables** | `concept2cure_provenance_events`, `regulatory_audit_logs`, `ai_feedback` |
| **File** | `server/routes/concept2cure.ts:175-231, 394-434` |

---

## Removed / Guarded

| Item | Status | Action Taken |
|------|--------|--------------|
| `DEMO_ECTD_DOCUMENT` section data | **Removed** | ~130 lines of fake Lemizumab data deleted |
| `regulatoryAIServicePhase3.ts` | **Deleted** | Stub returning empty objects |
| `server/routes/drafting.ts` | **Deleted** | Stub returning empty draft strings |
| `ClientPortalV3` + all V3 files | **Deleted** | 15 files, 7,209 lines of dead code |
| Mission Control | **Labeled experimental** | Response headers: `X-Data-Source: in-memory-experimental` |
| Console.info feedback | **Fixed** | All 3 chat surfaces now persist to DB |
