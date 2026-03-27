# Document System Final Validation

**Date:** 2026-03-27
**Branch:** concept2cure-v2
**Controlling Spec:** `docs/plans/FINAL_DOCUMENT_SYSTEM_PROJECT_AND_BUILD_PLAN_2026-03-27.md`

---

## Validation Trace (10 Steps)

### 1. Open Project
**Route:** Login → ZenApp → Projects → Select project
**What happens:** `setActiveProjectId(id)` → `setLayoutMode('project-home')`
**What user sees:** ProjectHomeDashboard — light context strip with project name, type, readiness one-liner. AnA is primary.
**File:** `ZenApp.tsx` (project-home layout), `ProjectHomeDashboard.tsx`
**Status:** PASS — conversational first, no dashboard noise

### 2. Talk to AnA
**Route:** AnA is always available via AnaPersistentPanel
**What happens:** User types in AnA. Context includes project type, submission type, active section code.
**What user sees:** AnA responds with regulatory intelligence, suggested actions, document generation
**File:** `AnaPersistentPanel.tsx`, `server/routes/ana-ri.ts`, `server/services/ana-ri/orchestrator.ts`
**Status:** PASS — AnA is the single visible guide. Dr. Sage removed (import commented out at ZenApp.tsx:149)

### 3. Open Tools
**Route:** Click "Tools" tab in sidebar (was "Work") or "Open Tools" from project home
**What happens:** `setLayoutMode('documents')` → renders ToolsLanding
**What user sees:** Curated workbench with 10 capabilities:
- Continue: Recent Documents (resume cards with status badges)
- Create: New Document, Document Builder, Templates
- Manage: Dossier Map, Vault / Data Room
- Finalize: Review, Submit, HAQ Response
**File:** `ToolsLanding.tsx`, `ZenApp.tsx` (documents layout renderer)
**Status:** PASS — FullDocumentBuilder is one tool card, not the destination. Tools feels like a workbench, not a dashboard.

### 4. Create/Resume/Generate Document
**Paths verified:**
| Path | Trigger | Converges to EditorPanel? |
|------|---------|--------------------------|
| Resume recent artifact | Click artifact in ToolsLanding | YES — `setOpenArtifactId` → workspace → EditorPanel |
| New Document | Tools → Create → NewDocumentDialog | YES — creates artifact, opens in EditorPanel |
| Document Builder | Tools → Builder → FullDocumentBuilder → "Open in Editor" | YES — `pendingEditorContent` → EditorPanel |
| Templates | Tools → Templates → template tree | YES — creates from template in EditorPanel |
| AnA draft | AnA generates content → "Insert" | YES — `pendingEditorContent` → EditorPanel |
| Precedent draft | RI Copilot → "Draft from Precedent" | YES — `pendingEditorContent` → EditorPanel |
| Existing artifact | Click in file tree or dossier | YES — opens in EditorPanel |
**File:** `ZenApp.tsx`, `ToolsLanding.tsx`, `FullDocumentBuilder.tsx`, `ProjectWorkspaceShell.tsx`
**Status:** PASS — all creation paths converge to EditorPanel. No dead-end builders.

### 5. Edit in EditorPanel
**What user sees:**
- TipTap rich text editor (center pane)
- Document title, CTD section, status badge in header
- **Visible lifecycle pipeline:** Draft → In Review → Approved → Published (line 2454)
- AI slash commands: /ai-rewrite, /ai-expand, /ai-summarize, /ai-regulatory, /ai-references
- Batch AI panel for multi-section operations
**File:** `EditorPanel.tsx` (3,249 lines)
**Status:** PASS — canonical editing surface. Lifecycle pipeline already visible.

### 6. Review / Collaborate
**Inspector ribbon group: "Review"**
- Comments: thread-based comment system
- Review: reviewer mode toggle
- Reviewers: assignment panel
- History: version history
- Compare: diff between versions
**Status transition:** Draft → In Review (user clicks "In Review" in lifecycle pipeline)
**File:** `EditorPanel.tsx` (ribbon lines 2259-2267)
**Status:** PASS — review capabilities exist and are grouped under "Review" stage in ribbon

### 7. Verify / Source-Trace
**Inspector ribbon group: "Verify"**
- Provenance: document source tracing, generation metadata
- Cross-Refs: cross-reference management
- Issues: contradiction/inconsistency detection
- Compliance: real-time compliance scanning
- Evidence: proof chain linking claims to source documents
**File:** `EditorPanel.tsx` (ribbon lines 2269-2276), `DocumentProvenancePanel.tsx`, `DocumentVersionCompare.tsx`
**Status:** PASS — verification capabilities exist and are grouped under "Verify" stage in ribbon

### 8. Publish / Export
**Inspector ribbon group: "Publish"**
- Audit Trail: full 21 CFR Part 11 audit events
- Submission: submission readiness for this document
- Health: document health score
- Readiness: GA readiness assessment
**Status transition:** Approved → Locked (Published)
**Export:** PDF/DOCX/ZIP via `cerv2-export-routes.ts`, governed by `exportGovernance.ts` (5-record chain)
**Signature:** Electronic signature capture on approval
**File:** `EditorPanel.tsx` (ribbon lines 2278-2284), `exportGovernance.ts`
**Status:** PASS — publish capabilities exist and are grouped under "Publish" stage in ribbon

### 9. Dossier / Submission Readiness
**Route:** Tools → Dossier Map or Submit tab
**What user sees:**
- DossierTree: CTD section tree with per-section document count and status
- DossierMap: visual module hierarchy
- SubmissionReadiness: readiness checklist with section status + export trigger
- Artifact placement: `ctdSection` field links documents to dossier positions
**File:** `DossierTree.tsx`, `DossierMap.tsx`, `SubmissionReadiness.tsx`
**Status:** PASS — dossier placement and readiness are visible and real

### 10. Return to Project Context
**Route:** Click "Home" breadcrumb or sidebar Overview tab
**What happens:** `setLayoutMode('project-home')`
**What user sees:** Back to AnA conversational home with updated project context
**Status:** PASS — clean return path exists from every surface

---

## Weave Parity Verification

| # | Weave Use Case | C2C Status | Evidence |
|---|---------------|------------|---------|
| 1 | AI-native drafting | **MATCHED** | indCopilot, AnA RI, authoring-actions, SubmissionApps |
| 2 | AI template authoring | **MATCHED** | FullDocumentBuilder (now one tool in Tools), template tree |
| 3 | Data Room / Ask | **MATCHED** | `/api/evidence/ask` endpoint created, wired to ForesightRAGService |
| 4 | Dossier Manager | **MATCHED** | DossierTree with live artifacts, ctdSection placement |
| 5 | Submission Builder | **MATCHED** | SubmissionReadiness + ectd-compile + ectd-export |
| 6 | Review | **MATCHED** | Comments, reviewers, compare, versions — grouped as "Review" stage |
| 7 | Verification | **MATCHED** | Provenance, cross-refs, inconsistency, compliance — grouped as "Verify" stage |
| 8 | Governed publish/export | **MATCHED** | Export governance (5-record), PDF/DOCX/ZIP, status lifecycle |
| 9 | HAQ response | **MATCHED** | HAQManager component with ingest → AI-draft → review → editor workflow |
| 10 | Collaboration | **PARTIALLY MATCHED** | Governance + reviewer assignments + audit trail. Real-time co-editing not yet implemented. |

**Parity: 9 of 10 MATCHED. 1 PARTIALLY MATCHED (real-time co-editing — Weave doesn't clearly show this either).**

---

## Surfaces Simplified / Merged / Demoted / Expanded

| Action | What | File |
|--------|------|------|
| **SIMPLIFIED** | "Work" → "Tools" label | `ProjectWorkspaceShell.tsx:217` |
| **SIMPLIFIED** | Inspector ribbon: AI/Review/Compliance/Audit → Draft/Review/Verify/Publish | `EditorPanel.tsx:2248-2285` |
| **MERGED** | FullDocumentBuilder from standalone destination → one tool inside Tools | `ZenApp.tsx` (documents renderer) |
| **MERGED** | HAQ workflow into Tools sub-view | `ZenApp.tsx` (toolsSubView 'haq') |
| **EXPANDED** | Tools landing with 10 curated capabilities | `ToolsLanding.tsx` (new) |
| **EXPANDED** | Data Room / Ask endpoint | `evidence-ask.ts` (new) |
| **EXPANDED** | HAQ Manager component | `HAQManager.tsx` (new) |
| **EXPANDED** | IND/eCTD/CMC project module routes | `projectModuleRoutePolicy.ts` |

---

## Locked Rules Verification

| Rule | Status |
|------|--------|
| AnA is the single visible guide | PASS — Dr. Sage removed, AnA is only AI surface |
| Project home is conversational first | PASS — ProjectHomeDashboard is light strip + AnA |
| Tools is secondary and intentional | PASS — requires explicit navigation from home |
| EditorPanel is canonical | PASS — all 7+ creation paths converge here |
| Every creation path → EditorPanel | PASS — no dead-end builders remain |
| No duplicate document worlds | PASS — FullDocumentBuilder demoted to one tool |
| No dead-end builders | PASS — builder output → EditorPanel via pendingEditorContent |
| No silent handoffs | PASS — all transitions are explicit navigation |
| No fake buttons | PASS — every tool in Tools routes to a real destination |
| Draft/Review/Verify/Publish visible | PASS — lifecycle pipeline in editor + ribbon groups match stages |
