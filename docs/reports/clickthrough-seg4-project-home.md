# Click-Through Audit: Segment 4 — Project Home Dashboard (Workspace)

## 1. Project Home Dashboard

- **File**: `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx:157`
- **Design**: Deliberately minimal — "AnA-first. The chat IS the product."
- **What user sees**:
  - Project name + type badge (IND, NDA, BLA, 510K, PMA, etc.)
  - Quiet doc count + "N in review" status
  - 4 context-aware suggested prompt buttons
  - ProjectComposeBar for direct message input
  - Search + Settings icon buttons
- **Data fetched**:
  - `GET /api/concept2cure/projects/{id}/artifacts` (line 168) — via `apiRequest`, real DB query
  - `useIntelligenceDashboard(projectId)` (line 177) — intelligence data for prompt context
- **Actions**: Suggested prompts feed into AnA chat via `onSuggestedPrompt`
- **Verdict**: **PASS** — Real data, context-aware prompts, minimal by design

### Issue: No "New Document" Button
- The dashboard has NO create button — this is intentional (chat-first design)
- Users must navigate to Dossier Map or use AnA to create documents
- **Verdict**: **CONDITIONAL PASS** — Intentional but may confuse first-time users

---

## 2. Submission Readiness

- **File**: `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx`
- **Data fetched**:
  - `GET /api/project-sections?projectId={id}` (line 125) — section statuses
  - `GET /api/concept2cure/projects/{id}/artifacts` (line 137) — artifact list
  - `GET /api/ind/status/{id}` (line 153) — IND-specific status
  - `GET /api/ind/device-status/{type}/{id}` (line 166) — device-specific status
- **Uses**: `DataStateWrapper` for loading/error/empty states, `apiRequest` for all calls
- **Section statuses mapped**: approved, locked, blocked, drafting, data_gathering, revision, in_review, not-started
- **Fix actions**: View, Create, Unblock, Continue Draft, Add Data, Revise, Proceed to Review
- **Verdict**: **PASS** — Real data, proper loading states, actionable per-section status

---

## 3. Dossier Map

- **File**: `client/src/concept2cure/components/workflow/DossierMap.tsx`
- **What user sees**: CTD module tree (Modules 1-5) with section statuses
- **Data**: Real section statuses from API + artifact overlay
- **Default structure**: Full CTD hierarchy (Module 1 Admin, Module 2 Summaries, Module 3 Quality, Module 4 Nonclinical, Module 5 Clinical)
- **Actions**:
  - Click section → `onSectionClick(code)` → navigates to SectionWorkspace
  - Hover reveals "+ Create" button per section (line 332) → `onCreateForSection(code, title)`
- **Uses**: `DataStateWrapper`, `apiRequest`, `WorkspaceHeader`, `SectionPanel` — all governed components
- **Verdict**: **PASS** — Real data, full CTD structure, proper component usage

---

## 4. Section Workspace

- **File**: `client/src/concept2cure/components/workflow/SectionWorkspace.tsx`
- **What user sees**: Section header with status badge + tabs (Content, Issues, Evidence, Versions)
- **Props**: `section` (SectionMeta), `content`, `issues`, `evidence`, `versions`
- **Actions**:
  - "Create Draft" / "Create Document" for not-started sections
  - "Submit for Review" via `onSubmitForReview`
  - "Open in Editor" via external link
- **Status types**: not-started, drafting, in-review, approved, blocked, locked
- **Uses**: `WorkspaceHeaderRich`, `WorkspaceTabBar`, `WorkspaceStatusBadge`, `EmptyState` — all governed
- **Verdict**: **PASS** — Proper workflow states, governed components

---

## 5. Project Workspace Shell

- **File**: `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- **Layout**: Left panel (File/Dossier/Template/Outline tree, 220px) + Center (browse or edit) + Right (Inspector)
- **Key panels**:
  - `ProjectFileTree` — file browser
  - `DossierTree` — CTD section tree
  - `TemplateTree` — template browser
  - `DocumentOutlineTree` — heading outline
  - `EditorPanel` (lazy loaded, line 99) — document editor
  - `DocumentListPane` — document list
  - `ProjectDashboard` — analytics
  - `ReviewPulseDashboard` — review activity
  - `GovernedDocumentPanel` — document governance
- **Feature flag**: `ENABLE_GOVERNED_DND = false` — drag-and-drop groundwork
- **Uses**: `DocumentModeProvider` for mode-based capabilities (read-only, edit, review, etc.)
- **Verdict**: **PASS** — Comprehensive workspace with proper lazy loading and mode management

---

## 6. Project-Level Navigation (Tabs)

- Navigation is handled by sidebar modes in `ZenSidebar.tsx`, not tabs within project home
- Available modes: Documents, Dossier, Readiness, Submit, etc.
- Each mode triggers `onNavigate(mode)` which changes the center panel content

### Known Issue from Segment 2
- "Overview" sidebar nav maps to wrong layout ID → falls back to projects list instead of project overview
- "Submit" sidebar nav ID missing from layout map → also falls through

**Verdict**: **CONDITIONAL PASS** — Navigation works but 2 sidebar items route incorrectly

---

## Summary

| Screen | Verdict | Issue |
|--------|---------|-------|
| Project Home Dashboard | **PASS** | Minimal by design, real data |
| No Create Button | **CONDITIONAL** | Intentional chat-first, may confuse users |
| Submission Readiness | **PASS** | Real data, proper states, actionable |
| Dossier Map | **PASS** | Full CTD tree, real data |
| Section Workspace | **PASS** | Proper workflow states, governed components |
| Workspace Shell | **PASS** | Comprehensive layout, lazy loading |
| Project Navigation | **CONDITIONAL** | 2 sidebar items route incorrectly |

**Critical Issues**: None (sidebar routing issues documented in Segment 2)
