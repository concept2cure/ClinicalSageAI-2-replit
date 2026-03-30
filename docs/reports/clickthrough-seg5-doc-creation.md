# Click-Through Audit Segment 5: Document Creation Flows

**Auditor perspective:** Biotech client evaluating ClinicalSageAI
**Date:** 2026-03-30
**Branch:** concept2cure-v2

---

## Executive Summary

Six document creation flows were traced end-to-end. The system has **two distinct document tables** (`concept2cure_artifacts` and `documents`) with **two separate creation pipelines** that do not converge. The primary artifact pipeline (used by most flows) is well-validated with Zod schemas, audit logging, provenance events, and RIM signal capture. The secondary document-authoring pipeline also has validation and audit logging. The IND AutoDraft wizard is a fully wired 4-step flow. The main concern is the **absence of a "New Document" button on ProjectHomeDashboard** -- the primary landing page uses a chat-first paradigm with no direct creation affordance.

| Flow | Verdict |
|------|---------|
| 1. New Document from Project Home | **FAIL** -- No creation button exists |
| 2. New Document from Section Workspace / Dossier Map | **PASS** -- Working creation path |
| 3. Template-Based Creation | **CONDITIONAL PASS** -- UI exists but templates are client-side only; no API fetch |
| 4. IND AutoDraft Wizard | **PASS** -- Full 4-step pipeline wired |
| 5. Document from Chat | **PASS** -- Multiple chat-based creation paths |
| 6. Server Document Creation Routes | **PASS** -- Two validated routes with audit trails |

---

## Flow 1: New Document from Project Home

### Entry Point
- **File:** `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx`
- **Button:** NONE

### Finding

ProjectHomeDashboard is a deliberately minimal "context strip" (per code comments: "Deliberately minimal. No dashboards, no data grids, no analytics widgets."). It shows:
- Project name + type badge
- Up to 3 recent documents (clickable to open, not to create)
- A `ProjectComposeBar` with mode chips: Ask, Draft, Review, Compare
- 4 conversation starter prompts (context-aware)

There is **no "New Document" or "Create" button**. The compose bar's "Draft" mode (line 55) prepends a prompt prefix to chat but does not trigger document creation. Conversation starters like "Help me get started" similarly feed into the chat.

**The only document creation from project home is indirect: clicking "Draft" mode chip sends a prompt to AnA chat.**

### Verdict: **FAIL**

A biotech user landing on Project Home has no obvious way to create a new document. They must either:
1. Navigate to Tools landing (sidebar) and click "New Document"
2. Use the chat to generate content, then save/open in editor
3. Navigate to Dossier Map and click "+ Create" on a section

This is a design choice (chat-first), but it may confuse users expecting a direct "New Document" action.

---

## Flow 2: New Document from Section Workspace / Dossier Map

### 2A. DossierMap -- Create for Section

- **File:** `client/src/concept2cure/components/workflow/DossierMap.tsx`, lines 332-341
- **Button text:** `+ Create` (appears on hover for sections with no artifacts)
- **Visibility:** Only visible when `!hasArtifacts && onCreateForSection`

**Handler chain:**
1. `onClick={() => onCreateForSection(sec.code, sec.title)}`
2. Parent (`ZenApp.tsx`, line 3041-3049):
   ```
   setPendingEditorContent({ title: sectionTitle, content: '', ctdSection: sectionCode })
   setRiViewMode('editor')
   setLayoutMode('regulatory-workspace')
   ```
3. This opens `EditorPanel` with `initialContent=""`, `initialTitle=sectionTitle`, `initialCtdSection=sectionCode`
4. No API call at this point -- the document is **not persisted until the user saves in the editor**

**Post-creation screen:** Opens the regulatory workspace with EditorPanel loaded with a blank document pre-tagged with the CTD section code.

### 2B. SectionWorkspace -- Create Draft

- **File:** `client/src/concept2cure/components/workflow/SectionWorkspace.tsx`, lines 274-343
- **Button text:** "Create Draft" (line 277) or "Create Document" (line 343)
- **Visibility:** When `section.status === 'not-started'` and `onCreateDraft` is provided

**Handler:** Calls `onCreateDraft()` callback from parent. Same flow as 2A -- sets pending editor content and navigates to editor.

### Verdict: **PASS**

Both paths correctly navigate to the editor with CTD section pre-populated. The document is created on first save, which is a reasonable UX pattern (no empty documents in the DB).

---

## Flow 3: Template-Based Creation

### Entry Point
- **File:** `client/src/concept2cure/components/submission/TemplateLibrary.tsx`
- **Accessible via:** Tools Landing > "Templates" button

### Templates Available (14 total, hardcoded in TEMPLATES array lines 64-337)

| ID | Name | Category | CTD Section | Complexity |
|----|------|----------|-------------|------------|
| `ind-cover-letter` | IND Cover Letter | IND | 1.2 | Simple |
| `ind-investigator-brochure` | Investigator's Brochure (IB) | IND | -- | Complex |
| `ind-clinical-protocol` | Clinical Study Protocol | IND | 5.3 | Complex |
| `nda-clinical-overview` | Clinical Overview (2.5) | NDA | 2.5 | Complex |
| `nda-quality-overall-summary` | Quality Overall Summary (2.3) | NDA | 2.3 | Complex |
| `nda-nonclinical-overview` | Nonclinical Overview (2.4) | NDA | 2.4 | Complex |
| `nda-clinical-summary-efficacy` | Summary of Clinical Efficacy (2.7.3) | NDA | 2.7.3 | Complex |
| `nda-clinical-summary-safety` | Summary of Clinical Safety (2.7.4) | NDA | 2.7.4 | Complex |
| `510k-cover-letter` | 510(k) Cover Letter | 510k | -- | Simple |
| `510k-substantial-equivalence` | Substantial Equivalence Discussion | 510k | -- | Moderate |
| `maa-clinical-expert-report` | Clinical Expert Report | MAA | 2.5 | Complex |
| `gen-risk-management` | Risk Management Plan | General | -- | Moderate |
| `gen-csr-synopsis` | CSR Synopsis | General | -- | Moderate |

### Template Actions

Two buttons in the detail panel (lines 492-512):
1. **"Use Template"** -- calls `onSelectTemplate?.(selectedTemplate)`
2. **"AI Generate"** -- calls `onGenerateFromTemplate?.(selectedTemplate)` (only if `aiGenerable: true`, which is ALL templates)

### Key Issue

**There is no API endpoint to fetch templates.** All 14 templates are hardcoded in the client-side `TEMPLATES` constant. The callbacks `onSelectTemplate` and `onGenerateFromTemplate` are props -- their implementation depends on the parent component wiring.

**No `/api/templates` endpoint exists.** Templates are purely client-side data structures defining section outlines and metadata. They provide structure scaffolding but do not populate the editor with pre-written content.

### Verdict: **CONDITIONAL PASS**

The template browser UI is complete and functional. Templates define sections with guidance annotations. However:
- Templates are static client-side data (no API, no DB table)
- No dynamic template management (admins cannot add/edit templates)
- "AI Generate" button's behavior depends entirely on parent wiring -- it is not clear the parent always provides `onGenerateFromTemplate`

---

## Flow 4: IND AutoDraft Wizard

### Entry Point
- **File:** `client/src/concept2cure/components/editor/INDAutoDraftWizard.tsx`
- **Accessible via:** Tools Landing > "Document Builder" > (parent wires this as the builder view)
- **Dialog-based:** Opens as a modal dialog

### Step 1: Upload Sources (lines 350-471)

- **Drop zone + file input:** Accepts PDF, DOCX, DOC, XLSX, TXT, CSV
- **Upload button:** "Upload N files" -- disabled when no pending files
- **API endpoint:** `POST /api/knowledge-base/ind-autodraft/upload` (multipart/form-data)
  - **Auth:** Manual Bearer token from sessionStorage/localStorage (line 189-196) -- raw `fetch()` used because `apiRequest` sets Content-Type to JSON
  - **Server:** `server/routes/knowledge-base.ts`, line 1700
  - **Processing:** Extracts text from PDFs (pdf.js-extract), DOCX (mammoth), TXT, CSV. XLSX gets placeholder text.
  - **Response:** `{ sessionId, files: [{name, size, extractedLength, detectedType}], detectedMetadata: {drugName, indication, phase} }`
  - **Session storage:** In-memory `Map<string, session>` (volatile, not persisted)
- **Auto-detection:** Metadata (drug name, indication, phase) auto-populated from source content
- **"Continue" button:** Enabled only when `uploadedFiles.length > 0`

### Step 2: Configure (lines 474-580)

- **Fields:** Drug name (required for step 3), Indication, Phase, Sponsor
- **Module selection:** Checkboxes for Modules 1-5 (all selected by default)
- **Validation:** "Continue" disabled if `selectedModules.length === 0 || !drugName.trim()`
- **No API call** on this step

### Step 3: Generate (lines 582-643)

- **Trigger:** "Generate N modules" button calls `handleGenerate()`
- **API endpoint:** `POST /api/knowledge-base/ind-autodraft/generate`
  - **Server:** `server/routes/knowledge-base.ts`, line 1804
  - **Payload:** `{ sessionId, projectId, modules: number[], metadata: {drugName, indication, phase, sponsor} }`
  - **Processing:**
    1. Retrieves session from in-memory map
    2. Imports AI gateway + IND section registry
    3. Filters `IND_SECTIONS` to selected modules
    4. Builds source context from uploaded files (truncated: 15K per file, 80K total)
    5. For each section: calls `gw.route()` with `taskType: 'document_drafting'`, system prompt with source context, `temperature: 0.3`, `maxTokens: 8192`
    6. Saves each section as a `concept2cureArtifacts` row with `type: 'regulatory_document'`, `category: 'document'`, `status: 'draft'`
    7. Creates artifact version + provenance event
  - **Response:** `{ sections: [{code, title, content, wordCount, sourceCount, artifactId}] }`
- **Progress UI:** Shows percentage + current section name. However, **progress is NOT streamed** -- the `progressPercent` stays at 0 during generation and jumps to 100 on completion. The server processes all sections sequentially in a single request.
- **Error handling:** Displays error message with retry button

### Step 4: Review (lines 646-710)

- **Shows:** List of generated sections with word count, source count
- **Per-section action:** "Open in Editor" button (hover) -- calls `onOpenArtifact(section.artifactId)` which navigates to EditorPanel
- **"Open All" button:** Opens the first generated section
- **"Close" button:** Closes the wizard dialog

### Post-creation: Opens EditorPanel with the generated artifact loaded.

### Verdict: **PASS**

The IND AutoDraft wizard is a complete, well-wired 4-step pipeline. Key strengths:
- Real file processing (PDF, DOCX extraction)
- AI gateway routing (Claude primary, OpenAI fallback)
- Artifacts persisted with audit trail and provenance
- Section-aware CTD generation

Concerns:
- **In-memory session storage** (`autoDraftSessions` Map) -- sessions lost on server restart
- **No progress streaming** -- progress bar is cosmetic (0% then 100%)
- **Raw `fetch()` for upload** bypasses `apiRequest()` auth handling (line 188-198)
- **Auth token from localStorage** in the client-side upload handler (line 189) -- not ideal

---

## Flow 5: Document from Chat

### 5A. Chat Artifact Save + Open in Editor

- **File:** `client/src/concept2cure/components/chat/ZenChat.tsx`, lines 1096-1112
- **Trigger:** User generates content in chat, clicks "Open in Editor" action on artifact
- **Handler:** `handleOpenEditorArtifact(artifact)`
  1. Calls `createDocument({ title, content, documentType })` via `useDocumentActions` hook
  2. This POSTs to `POST /api/document-authoring/documents` (the `documents` table pipeline)
  3. On success, calls `openInEditor(docId)` which navigates to `/editor/:id`
  4. **Fallback:** If document creation fails, navigates to editor with artifact ID

### 5B. Chat Slash Commands

- **File:** `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, line 556
- **`/draft` command:** Mapped to `draft_section_from_context` intent (line 889)
- **Handler (line 2171-2176):** Sends a chat message like "Draft CTD section 2.5: Clinical Overview..." to the AI. The AI response appears in chat as text/markdown. There is no automatic artifact creation -- the user must explicitly save the response.

### 5C. Domain Prompt Buttons

- **File:** `client/src/concept2cure/components/chat/ZenChat.tsx`, lines 578-618
- **Examples:** "Draft IND Cover Letter with Form 1571 references", "Create Device Description document"
- **Flow:** These are suggested prompts that feed into the chat. The AI generates content, and the user can then save it via artifact action buttons.

### 5D. Action Card: "Draft a section"

- **File:** `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, line 1194
- **Intent:** `draft_section` -- sends a prompt to the AI

### Verdict: **PASS**

Chat-based creation works through multiple paths. The primary pattern is:
1. User requests content via chat (natural language, slash command, or domain prompt)
2. AI generates content in the chat stream
3. User saves artifact via action buttons or opens in editor

The "Open in Editor" flow creates a `documents` table entry (via document-authoring pipeline), which is **a different table than the `concept2cureArtifacts` table** used by the direct save flow.

---

## Flow 6: Server Document Creation Routes

### 6A. Artifact Creation (Primary Pipeline)

- **Endpoint:** `POST /api/concept2cure/projects/:projectId/artifacts`
- **File:** `server/routes/concept2cure.ts`, line 4457
- **Middleware:** `guardEmptyContent`, `guardDemoContent` (prevents empty/mock data)
- **Validation:** Zod schema `createArtifactSchema` (line 676-684):
  - `title`: string, 1-200 chars, required
  - `content`: string, 1-1,000,000 chars, required
  - `type`: string, 1-50 chars, required
  - `category`: enum `['document', 'interactive', 'visualization', 'source', 'evidence']`
  - `ctdSection`: string, max 50, optional
  - `metadata`: record, optional
  - `conversationId`: string, optional
- **DB operations:**
  1. INSERT into `concept2cureArtifacts` (line 4497-4514) -- generates `artifact_xxx` ID
  2. INSERT into `concept2cureArtifactVersions` (line 4517-4524) -- version 1
  3. Audit log entry via `logAuditEntry()` (line 4543)
  4. Provenance event via `emitProvenanceEvent()` (line 4552)
  5. RIM signal capture via `interceptArtifactChange()` (line 4578) -- non-blocking
- **Response:** 201 with artifact data

### 6B. Document Creation (Document-Authoring Pipeline)

- **Endpoint:** `POST /api/document-authoring/documents`
- **File:** `server/routes/documentAuthoring.routes.ts`, line 557
- **Middleware:** `authenticateJWT`, `documentRateLimiter`
- **Validation:** `insertDocumentSchema.parse()` (Drizzle-generated insert schema)
- **DB operations:**
  1. INSERT into `documents` table (line 580)
  2. If content provided: INSERT into `documentVersions` (line 584-596), UPDATE `documents.currentVersionId`
  3. Audit log via `createAuditLog()` (line 606-620)
- **Response:** 201 with document data

### 6C. IND AutoDraft Generation (Specialized Pipeline)

- **Endpoint:** `POST /api/knowledge-base/ind-autodraft/generate`
- **File:** `server/routes/knowledge-base.ts`, line 1804
- **Validation:** Manual check for `sessionId`, `projectId`, `modules`
- **DB operations:** INSERT into `concept2cureArtifacts` + `concept2cureArtifactVersions` per section
- **Provenance:** Emits via `emitKBProvenanceEvent()`

### Verdict: **PASS**

Both creation routes have:
- Input validation (Zod or Drizzle schema)
- Audit logging (21 CFR Part 11 compliance)
- Proper error handling
- Tenant scoping (organizationId)

---

## Critical Observations

### 1. Dual Document Tables (Architecture Concern)

The system has **two completely separate document storage systems**:

| Aspect | `concept2cureArtifacts` | `documents` |
|--------|------------------------|-------------|
| Used by | Most flows (artifact save, IND AutoDraft, dossier) | Document-authoring pipeline (chat "Open in Editor") |
| ID format | `artifact_xxx` (external) + serial (internal) | Serial only |
| Version table | `concept2cureArtifactVersions` | `documentVersions` |
| Provenance | Yes (emitProvenanceEvent) | Audit log only |
| RIM integration | Yes (interceptArtifactChange) | No |
| Content hash | SHA-256 | Not present |

**Risk:** Documents created via chat "Open in Editor" land in the `documents` table, while documents created via DossierMap, ToolsLanding, or IND AutoDraft land in `concept2cureArtifacts`. They are **not queryable from the same API**. A user could create a document from chat, then not see it in the project's artifact list.

### 2. No "New Document" on Primary Landing Page

ProjectHomeDashboard has zero document creation affordances. The chat-first philosophy means all creation goes through conversation or through the Tools landing page (requires navigation to sidebar > Documents/Tools).

### 3. In-Memory Session Storage for AutoDraft

The `autoDraftSessions` Map in `knowledge-base.ts` stores uploaded file content in server memory. Server restart = lost sessions. This is acceptable for a single-instance deployment but will fail in a multi-instance/load-balanced setup.

### 4. Template Library is Static

All 14 templates are hardcoded in the client. No API exists to manage templates. This limits extensibility -- admins cannot add custom templates without code changes.

### 5. Raw fetch() in AutoDraft Upload

The INDAutoDraftWizard uses raw `fetch()` (line 188-198) with manually extracted auth tokens from localStorage/sessionStorage, bypassing the governed `apiRequest()` utility. This violates the project's own coding standard ("API calls MUST use apiRequest()").

---

## Flow Summary Matrix

| Flow | Entry Point | API Endpoint | DB Table | Audit | Editor After |
|------|-------------|-------------|----------|-------|-------------|
| Project Home | N/A (no button) | N/A | N/A | N/A | N/A |
| DossierMap Create | `DossierMap.tsx:337` | None (deferred to save) | `concept2cureArtifacts` | On save | Yes |
| SectionWorkspace Create | `SectionWorkspace.tsx:275` | None (deferred to save) | `concept2cureArtifacts` | On save | Yes |
| ToolsLanding > New Doc | `ToolsLanding.tsx:62` | None (deferred to save) | `concept2cureArtifacts` | On save | Yes |
| Template Library | `TemplateLibrary.tsx:493` | None (client-side) | Depends on parent | On save | Yes |
| IND AutoDraft | `INDAutoDraftWizard.tsx:90` | Upload + Generate | `concept2cureArtifacts` | Yes | Yes |
| Chat Open in Editor | `ZenChat.tsx:1099` | `POST /api/document-authoring/documents` | `documents` | Yes | Yes |
| Chat Save Artifact | `ZenChat.tsx` via hooks | `POST /api/concept2cure/projects/:id/artifacts` | `concept2cureArtifacts` | Yes | Optional |

---

*Report generated 2026-03-30. Audited against branch concept2cure-v2.*
