# ClinicalSageAI — Complete Screen & Flow Map with Improvement Recommendations

> Generated: 2026-03-28
> Scope: Full client journey from login through submission export

---

## Table of Contents

1. [Complete Screen Inventory](#1-complete-screen-inventory)
2. [Flow Map: Login → Project → Editor → Submission](#2-flow-map)
3. [Navigation State Machine](#3-navigation-state-machine)
4. [Gap Analysis vs Weave.bio](#4-gap-analysis)
5. [Improvement Recommendations](#5-improvement-recommendations)

---

## 1. Complete Screen Inventory

### Screen 1: Login (`ZenLogin.tsx`)

| Element | Detail |
|---------|--------|
| **Layout** | Centered card on warm stone gradient background |
| **Flow** | Email → Password → optional MFA (TOTP 6-digit) |
| **SSO** | Microsoft + Google buttons below form |
| **Post-login** | `computeRedirect()` → `/concept2cure` or `/onboarding` |
| **Error states** | Account lockout after 5 failures (15-min), inline validation |

### Screen 2: Onboarding (`ZenOnboarding.tsx`)

| Element | Detail |
|---------|--------|
| **Steps** | 5-step wizard: Welcome → Role → Organization → Preferences → Complete |
| **Trigger** | First login when `user.onboardingComplete !== true` |
| **Exit** | Redirect to project list |

### Screen 3: Project List (`layoutMode === 'projects'`)

| Element | Detail |
|---------|--------|
| **Layout** | 3-column card grid with search + filter bar |
| **Cards** | Project name, type badge (IND/NDA/CSR/eCTD), description, updated date |
| **Actions** | Click card → `project-home`, "New Project" button → modal |
| **Empty state** | First-project CTA card |

### Screen 4: New Project Modal (`NewProjectModal`)

| Element | Detail |
|---------|--------|
| **Flow** | 3-step wizard: Type selection → Details form → Success confirmation |
| **Types** | IND, NDA, BLA, CSR, eCTD, 510(k), PMA, ANDA, General |
| **On success** | Auto-navigates to `project-home` for new project |

### Screen 5: Project Home (`layoutMode === 'project-home'`)

| Element | Detail |
|---------|--------|
| **Top strip** | `ProjectHomeDashboard` — project name, metadata, quick actions |
| **Main area** | AnA chat (full-width, center-focused) |
| **Right sidebar** | Project Knowledge Panel (artifacts, intelligence, context) |
| **Canvas overlay** | When artifact selected, replaces knowledge sidebar with document preview |

**Quick Actions (from ProjectHomeDashboard):**
- Primary: Create Document, View Dossier
- Secondary: All Documents, AI Intelligence, Submissions, Templates, CSR Authoring, IND Checklist

### Screen 6: Dossier Map (`layoutMode === 'dossier-map'`)

| Element | Detail |
|---------|--------|
| **Layout** | CTD module tree (M1–M5) with section status indicators |
| **Interaction** | Click section → smart routing: if artifact exists → editor, else → section-workspace |
| **Back** | Returns to `project-home` |

### Screen 7: Section Workspace (`layoutMode === 'section-workspace'`)

| Element | Detail |
|---------|--------|
| **Purpose** | Pre-editor staging for a specific CTD section |
| **States** | (a) Artifact exists → "Open in Full Editor" card, (b) No artifact → "Create Document" prompt |
| **Actions** | Open in Editor (→ regulatory-workspace/editor), Create Draft (→ editor with pending content) |
| **Back** | Returns to previous screen |

### Screen 8: Regulatory Workspace (`layoutMode === 'regulatory-workspace'`)

| Element | Detail |
|---------|--------|
| **Toggle** | `riViewMode`: 'intelligence' or 'editor' |
| **Intelligence mode** | RICopilotHome — precedent analysis, evidence search |
| **Editor mode** | `ProjectWorkspaceShell` — the full authoring environment |

### Screen 9: ProjectWorkspaceShell (inside regulatory-workspace)

**The core 3-pane authoring workspace. Has 3 internal modes:**

#### Mode: Dashboard
| Element | Detail |
|---------|--------|
| **Left rail** | Hidden (full width) |
| **Content** | ComputeJobPanel + ProjectDashboard overview |
| **Purpose** | Project-level overview within the workspace |

#### Mode: Browse
| Element | Detail |
|---------|--------|
| **Left rail** | 220px, 5 tabs: Files / Dossier / Outline / Templates / Registry |
| **Content** | DocumentListPane — file browser for selected folder/section |
| **Purpose** | Navigate and select documents |

#### Mode: Edit
| Element | Detail |
|---------|--------|
| **Left rail** | 220px, same 5 tabs |
| **Content** | EditorPanel — full document editor |
| **Document tabs** | Content / Evidence / Versions / Review / Signatures / Provenance / Export |

**Header Stack (5 bars, ~55px total):**
1. **Breadcrumb bar** (h-11): Projects / Type / Name / Dashboard / Files / DocTitle
2. **AnA Shell bar** (h-11): Operating Layers (Document Studio | Evidence | Readiness) + Workbenches (CMC | Biostats | Device | Clinical)
3. **Context band** (h-9): Project / Doc / Reviews in flight / Quick actions
4. **CTD Flow bar** (h-9): Module 1 | Module 2 | Module 3 | Module 5 progress
5. **Project nav** (h-9): Submission Builder | CMC | Clinical/M5 | Verify | Review | Publish | HAQ | Vault | Overview

### Screen 10: EditorPanel (inside ProjectWorkspaceShell edit mode)

| Element | Detail |
|---------|--------|
| **Toolbar** | InspectorRibbon with 4 groups (see below) |
| **Editor** | TipTap-based rich text editor (UnifiedDocumentEditor) |
| **Right inspector** | One panel at a time, w-80 to w-96 |
| **Status bar** | Document lifecycle status with advance/revert controls |

**Ribbon Groups (18 inspector panels):**

| Group | Panels |
|-------|--------|
| **Draft** | AI Assist, Batch AI, Data Room, AnA Context/Memory |
| **Review** | Comments, Review Mode (tracked changes), Reviewers, Version History, Compare |
| **Verify** | Provenance, Cross-Refs, Issues/Inconsistency, Compliance Scanner, Evidence |
| **Publish** | Audit Trail, Submission Readiness, Document Health, GA Readiness |

**Additional inspectors:** Artifact Proof panel

### Screen 11: Submission Readiness (`layoutMode === 'submissions'`)

| Element | Detail |
|---------|--------|
| **Header** | "Submission Readiness" with back button + type badge |
| **Progress** | WorkspaceStatusStrip — "X of Y sections ready" with progress bar |
| **Checklist** | Section-by-section readiness (ready / needs-work / blocked / not-started) |
| **Export** | "Export Package" button (disabled until 100% ready) |

### Screen 12: CSR Workflow (`layoutMode === 'csr-workflow'`)

| Element | Detail |
|---------|--------|
| **Purpose** | CSR-specific section builder with AI draft capabilities |
| **Sections** | Protocol Synopsis, Efficacy, Safety, etc. |
| **Actions** | Smart routing to editor when artifact exists |

### Screen 13: IND Checklist (`layoutMode === 'ind-checklist'`)

| Element | Detail |
|---------|--------|
| **Purpose** | IND/NDA-specific Module 1-5 checklist with section completion tracking |
| **Actions** | Section click → smart routing to editor |

### Screen 14: Task Board (`layoutMode === 'task-board'`)

| Element | Detail |
|---------|--------|
| **Layout** | Sticky header + scrollable task list |
| **Purpose** | Project task tracking and assignment |

### Screen 15: Template Library (`layoutMode === 'template-library'`)

| Element | Detail |
|---------|--------|
| **Layout** | Sticky header + template card grid |
| **Purpose** | Browse and apply document templates |

---

## 2. Flow Map

```
                              ┌──────────────┐
                              │   Login      │
                              │  (ZenLogin)  │
                              └──────┬───────┘
                                     │
                          ┌──────────┼──────────┐
                          ▼                      ▼
                   ┌─────────────┐       ┌──────────────┐
                   │ Onboarding  │       │ Project List  │
                   │ (first use) │       │  (returning)  │
                   └──────┬──────┘       └──────┬────────┘
                          │                      │
                          └──────────┬───────────┘
                                     ▼
                          ┌─────────────────────┐
                          │    Project Home      │
                          │  AnA Chat + Actions  │
                          └──────────┬──────────┘
                                     │
              ┌──────────┬───────────┼───────────┬──────────┐
              ▼          ▼           ▼           ▼          ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐ ┌───────┐ ┌──────────┐
        │ Dossier  │ │  CSR   │ │   IND    │ │ Tasks │ │Templates │
        │   Map    │ │Workflow│ │Checklist │ │ Board │ │ Library  │
        └────┬─────┘ └───┬────┘ └────┬─────┘ └───────┘ └──────────┘
             │            │           │
             └────────────┼───────────┘
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
     ┌──────────────────┐   ┌──────────────────┐
     │ Section Workspace│   │   Direct to      │
     │ (no artifact yet)│   │   Editor         │
     │  "Create Draft"  │   │ (artifact exists)│
     └────────┬─────────┘   └────────┬─────────┘
              │                       │
              └───────────┬───────────┘
                          ▼
              ┌─────────────────────┐
              │ Regulatory Workspace │
              │  ┌─────────────────┐│
              │  │ProjectWorkspace ││
              │  │    Shell        ││
              │  │ ┌─────────────┐││
              │  │ │ EditorPanel │││
              │  │ │ (TipTap +   │││
              │  │ │  18 panels) │││
              │  │ └─────────────┘││
              │  └─────────────────┘│
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Document Lifecycle   │
              │                     │
              │  DRAFT              │
              │    ↓ (quality gate) │
              │  REVIEW             │
              │    ↓ (approve)      │
              │  APPROVED           │
              │    ↓ (lock)         │
              │  LOCKED             │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Submission Readiness │
              │  100% sections ready │
              │       ↓              │
              │  Export Package      │
              └─────────────────────┘
```

---

## 3. Navigation State Machine

### LayoutMode Values (ZenApp.tsx:405)

```typescript
type LayoutMode =
  | 'projects'              // Project list
  | 'project-home'          // AnA chat + dashboard
  | 'regulatory-workspace'  // Editor/Intelligence dual-view
  | 'dossier-map'           // CTD module tree
  | 'section-workspace'     // Pre-editor section view
  | 'submissions'           // Submission readiness checklist
  | 'csr-workflow'          // CSR section builder
  | 'ind-checklist'         // IND module checklist
  | 'task-board'            // Task tracking
  | 'template-library'      // Template browser
  | 'documents'             // Document vault/list
```

### Sidebar → Layout Mapping

```typescript
SIDEBAR_NAV_TO_LAYOUT = {
  'overview': 'project-home',
  'tools': 'documents',
  'dossier': 'dossier-map',
  'submissions': 'submissions',
  'task-board': 'task-board',
  'csr-workflow': 'csr-workflow',
  'ind-checklist': 'ind-checklist',
  'templates': 'template-library',
}
```

---

## 4. Gap Analysis vs Weave.bio

### Features at Parity or Beyond Weave

| Feature | ClinicalSageAI | Weave.bio |
|---------|---------------|-----------|
| AI section generation | ✅ AI Assist + Batch AI | ✅ AI drafting |
| Document editor | ✅ TipTap + 18 inspector panels | ✅ ~8 tools |
| CTD templates | ✅ Template library + dossier map | ✅ eCTD templates |
| Tracked changes | ✅ ReviewMode panel | ✅ Review mode |
| Compliance scanning | ✅ ComplianceScannerPanel | ✅ Basic checks |
| Version control | ✅ VersionTimeline + Compare | ✅ Version history |
| Multi-agency support | ✅ FDA/EMA/PMDA/HC routing | ❌ FDA-focused |
| AI chat assistant | ✅ AnA with persona routing | ❌ No equivalent |
| Regulatory intelligence | ✅ RIM + precedent engine | ❌ No equivalent |
| Biostatistics panels | ✅ Biostats workbench | ❌ Not present |
| Cross-document analysis | ✅ Cross-refs + inconsistency | ⚠️ Limited |
| Submission readiness | ✅ Section-by-section + CTD validation | ✅ Submission checks |
| E-signatures | ✅ Signature panel | ✅ E-signatures |
| Audit trail | ✅ 21 CFR Part 11 compliant | ✅ Audit trail |
| Export (DOCX) | ✅ Export panel | ✅ DOCX/PDF |
| Source traceability | ✅ Provenance panel + evidence | ✅ Source linking |
| Real-time collab | ⚠️ Socket.io (infrastructure ready) | ✅ Live multi-cursor |

### Gaps Remaining

| Gap | Severity | Detail |
|-----|----------|--------|
| **Real-time multi-cursor** | Medium | Socket.io infrastructure exists but no live cursor sharing in editor |
| **Inline source citations** | Low | Provenance panel exists; Weave shows inline source pills in text |
| **eCTD XML export** | Medium | Export panel exists but full eCTD XML packaging unclear |
| **Regulatory body submission portal** | Low | Readiness + export exists; direct gateway submission TBD |

---

## 5. Improvement Recommendations

### Priority 1: Reduce Header Bar Chrome (High Impact)

**Problem:** ProjectWorkspaceShell has 5 stacked header bars consuming ~55px of vertical space. This is the opposite of Claude.ai's minimal chrome principle.

**Recommendation:**
- **Collapse bars 2-4** (AnA Shell, Context Band, CTD Flow) into a single contextual strip that shows on hover or via a toggle
- Keep only Bar 1 (breadcrumb) and Bar 5 (project nav) permanently visible
- Net savings: ~27px vertical space, much calmer visual

```
BEFORE: 5 bars × ~11px = ~55px chrome
AFTER:  2 bars × ~11px = ~22px chrome + expandable context
```

### Priority 2: Eliminate Section Workspace Intermediate Screen

**Problem:** When clicking a section with no existing artifact, users land on `section-workspace` which is a staging screen that just says "Create Document." This is an unnecessary intermediate step.

**Recommendation:**
- When clicking a section with no artifact, show a lightweight inline modal: "Create [Section Title]?" with one-click confirmation
- On confirm, create the artifact immediately and open the editor
- Remove `section-workspace` layoutMode entirely for new documents
- Keep it only for existing artifacts that need the quick-edit textarea (or remove that too)

### Priority 3: Unified Document Creation Flow

**Problem:** Documents can be created from 6+ different entry points (dashboard quick action, dossier map, CSR workflow, IND checklist, template library, AnA chat). Each has slightly different routing.

**Recommendation:**
- Standardize all creation paths to use `pendingEditorContent` → open editor immediately
- Every "Create" action should result in: artifact created → editor opens → user types
- No intermediate screens, no staging areas, no "are you sure" steps
- Match Claude.ai's "type and go" philosophy

### Priority 4: Simplify Left Rail Tab Count

**Problem:** The left rail has 5 tabs (Files, Dossier, Outline, Templates, Registry) plus 3 operating layer buttons. This is heavy cognitive load for a side panel.

**Recommendation:**
- Default to **Files** (most used) with smart sub-sections
- Move **Templates** to a top-level command (accessible via AnA chat `/templates` or project-home quick action only)
- Move **Registry** to the Intelligence toggle (it's a knowledge base, not a file browser)
- Result: 3 tabs: **Files / Dossier / Outline** — clean, focused

### Priority 5: Progressive Inspector Discovery

**Problem:** 18 inspector panels across 4 ribbon groups is powerful but overwhelming on first use. Users may not discover panels they need.

**Recommendation:**
- Show **contextual panel suggestions** based on document lifecycle stage:
  - DRAFT stage: Highlight AI Assist, Data Room, Batch AI
  - REVIEW stage: Auto-surface Comments, Review Mode, Reviewers
  - VERIFY stage: Surface Compliance Scanner, Cross-Refs, Evidence
  - PUBLISH stage: Surface Audit Trail, Submission Readiness, GA Readiness
- Add subtle pulse/badge on the 1-2 most relevant panels for current context
- Already partially implemented (review mode has pulse) — extend to all stages

### Priority 6: Streamline Submission Export

**Problem:** Export Package button on Submission Readiness is disabled until 100%. Users need to fix sections but the path from readiness screen back to the specific section's editor requires multiple clicks.

**Recommendation:**
- Add **"Fix Now"** inline button on each failing section row that opens that section directly in the editor
- Show specific remediation guidance inline (not just "Section is in drafting status")
- Add a **progress tracker** that updates in real-time as sections are completed (via query invalidation)
- Consider a "batch advance" action: advance all qualifying sections from draft → review in one click

### Priority 7: Vault Page Artifact Navigation Fix

**Problem:** The Vault/Documents page's `onOpenDocument` handler doesn't pass `openArtifactId`, meaning clicking a document from the vault may not navigate correctly to the editor.

**Recommendation:**
- Wire `onOpenDocument` to set `openArtifactId` + switch to `regulatory-workspace` in editor mode
- This is a bug fix, not a feature — should be addressed immediately

### Priority 8: Add Inline Source Citations in Editor

**Problem:** Weave.bio shows source citations as inline pills within the document text. Our provenance tracking is in a separate inspector panel.

**Recommendation:**
- Add a TipTap extension for inline citation marks (e.g., `[Source: Protocol v2.1, §4.2]`)
- Citations link to the provenance panel for full detail
- AI-generated content automatically includes source citations
- This is a competitive differentiator if done well

### Priority 9: Real-Time Collaboration Indicators

**Problem:** Socket.io infrastructure exists but no visible collaboration features in the editor.

**Recommendation:**
- Add presence indicators: show which users have the document open (avatar pills in header)
- Add cursor awareness: show other users' cursor positions (colored carets)
- Add section locking: when user A is editing a section, show a soft lock indicator to user B
- Phase this — presence indicators first (low effort), then cursors (medium), then locks (high)

### Priority 10: Keyboard-First Navigation

**Problem:** Power users (regulatory writers spending 8+ hours/day in the tool) need faster navigation than clicking through menus.

**Recommendation:**
- `Cmd+K` / `Ctrl+K` command palette (search documents, switch sections, open panels)
- `Cmd+/` toggle AnA chat
- `Cmd+Shift+E` toggle editor/intelligence mode
- `Cmd+1-4` switch ribbon groups (Draft/Review/Verify/Publish)
- Already partially available via AnA slash commands — surface these in a discoverable way

---

## Summary: Top 5 Quick Wins

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Fix Vault `onOpenDocument` routing | Small | Fixes broken flow |
| 2 | Collapse 5 header bars → 2 + expandable | Medium | Major UX improvement |
| 3 | Skip section-workspace for new documents | Small | Fewer clicks to editor |
| 4 | Contextual inspector highlighting by lifecycle stage | Medium | Better discoverability |
| 5 | Add "Fix Now" buttons on submission readiness rows | Small | Faster remediation loop |

---

*Full codebase references available in source files. See `ZenApp.tsx`, `ProjectWorkspaceShell.tsx`, `EditorPanel.tsx`, `SubmissionReadiness.tsx` for implementation details.*
