# Concept2Cure Convergence Plan: AnA-First Product Model

**Date:** 2026-03-27
**Status:** PLANNING ONLY — no implementation until approved
**Branch:** `concept2cure-v2`

---

## 1. Inventory of All Competing Surfaces

### Project "Home" Surfaces (4 competing)

| Surface | Layout Mode | What It Shows | Type |
|---------|-------------|---------------|------|
| ProjectHomeDashboard | `project-home` | Readiness line + recent artifacts + quick nav | Dashboard home |
| FullDocumentBuilder | `documents` | 5-step CSR/CTD generation wizard | Tool wizard |
| ProjectWorkspaceShell | `regulatory-workspace` (riViewMode=editor) | 3-pane document studio | Tool workspace |
| AnaPersistentPanel (full) | `workspace` | Full-screen chat + project knowledge sidebar | Conversational home |

### Document Creation Paths (8 competing)

| Path | Entry Point | Destination |
|------|-------------|-------------|
| NewDocumentDialog | Button in ProjectWorkspaceShell | EditorPanel (inside shell) |
| Quick inline input | "New" button in shell header | EditorPanel (inside shell) |
| Template tree click | Left rail template browser | EditorPanel (inside shell) |
| Submission Apps | App card → "Create Governed Draft" | Artifact created, user opens manually |
| AnA draft insert | AnA generates > 100 chars → "Insert" | EditorPanel (via pendingEditorContent) |
| RI Copilot precedent | "Draft from Precedent" button | EditorPanel (inside shell) |
| FullDocumentBuilder | 5-step wizard (type → agencies → info → generate → review) | Standalone wizard (NOT EditorPanel) |
| Open existing artifact | Click in file tree / document list | EditorPanel (inside shell) |

### Guide Identities (2 competing)

| Identity | Where Rendered | Visible? |
|----------|---------------|----------|
| AnaPersistentPanel | Bottom bar (compact) or center (full) on most screens | Yes |
| DrSageGlobalLayer | **Fixed floating button, bottom-right, ALL screens** | **Yes — visible right now on every page** |

**Critical finding: Dr. Sage is NOT just code debt. It is actively rendered as a floating sparkles button on every screen, competing with AnA.**

---

## 2. What Gets Kept

| Asset | Reason |
|-------|--------|
| **AnaPersistentPanel** | The conversational core. Becomes the primary project interface. |
| **EditorPanel** | The canonical document editing surface. Every creation path converges here. |
| **ProjectWorkspaceShell** | The serious operational studio (file tree, dossier, templates, governed panel). Becomes "Productivity Tools." |
| **GovernedDocumentPanel** | Core IP — status workflow, audit, versions, provenance, signatures. |
| **ReviewReadiness** | Regulatory compliance surface. Stays as Review tab. |
| **SubmissionReadiness** | Filing surface. Stays as Submit tab. |
| **SubmissionAppsPanel** | App definitions for governed draft creation. Stays inside tools. |
| **AppsPage** | Global launcher. Stays as global destination. |
| **ArtifactsPage** | Global browser. Stays as global destination. |
| **SetupPage** | Settings launcher. Stays as global destination. |
| **VaultPage** | Project file browser. Stays as Vault tab. |
| **FirstRunExperience** | Value-first onboarding. Stays. |

---

## 3. What Gets Demoted

| Asset | Current Role | New Role |
|-------|-------------|----------|
| **FullDocumentBuilder** | Primary `documents` layout mode renderer | Moved inside Productivity Tools as "Document Builder" option. Not the default Work experience. |
| **RICopilotHome** | Sub-view of regulatory-workspace | Accessible from AnA or Apps, not a default landing. |
| **DrSageGlobalLayer** | Global floating button on every screen | **REMOVED from render tree.** AnA is the single guide. |
| **DrSagePanel, DrSagePersonality, WorkflowEngine** | Active components | Files retained but import removed from ZenApp. |
| **`workspace` layout mode** | Legacy chat-first view with knowledge panel | Redirect to `project-home`. The new AnA-first home replaces this. |

---

## 4. What Becomes "Productivity Tools"

A single secondary surface, launched intentionally from the project home. Contains everything the user needs when they want to stop talking and start making.

### Productivity Tools Contents

| Tool | Source Component | Purpose |
|------|-----------------|---------|
| **Recent Documents** | From ProjectWorkspaceShell browse mode | Resume work on existing artifacts |
| **Create Document** | NewDocumentDialog | Start a blank or template-based document |
| **Document Builder** | FullDocumentBuilder | Multi-step CSR/CTD wizard |
| **Templates** | TemplateTree | Browse and use templates |
| **Dossier Map** | DossierTree / DossierMap | CTD section navigation |
| **Vault** | VaultPage | Files and evidence browser |
| **Review** | ReviewReadiness | Quality, compliance, audit |
| **Submit** | SubmissionReadiness | Readiness checklist + export |

### How It's Accessed

From the AnA-first project home:
- "Open Tools" button → enters Productivity Tools mode
- Equivalent to the current "Work" project tab, but repositioned as secondary

---

## 5. The Single Edit Path

Every document creation flow must end in EditorPanel:

```
AnA draft insert ─────────────┐
NewDocumentDialog ────────────┤
Template tree ────────────────┤
RI Copilot precedent ─────────┤──→ EditorPanel
Submission App draft ──────────┤
FullDocumentBuilder output ───┤
Open existing artifact ───────┘
```

**FullDocumentBuilder** is currently the one exception — it's a standalone wizard that doesn't converge into EditorPanel. Fix: after the wizard's "Review" step, open the generated document in EditorPanel for editing.

---

## 6. Implementation Sequence

### Phase A: Remove Dr. Sage (Immediate — beta blocker discovered)

**The audit revealed Dr. Sage is actively visible on every page as a floating button. This contradicts the "AnA is the single guide" rule and is a beta-visible issue.**

1. Remove `import DrSageGlobalLayer` from ZenApp.tsx (line 149)
2. Remove `<DrSageGlobalLayer ... />` from ZenApp.tsx JSX (line 3303)
3. Do NOT delete the dr-sage/ files yet (keep for reference)

**Files:** ZenApp.tsx only
**Risk:** Low — DrSage is an independent overlay, removing it breaks nothing

### Phase B: Make AnA the Project Home (Core change)

1. When `layoutMode === 'project-home'`:
   - Center: AnA in full conversational mode (not compact)
   - Top: light project context strip (name, type, readiness one-liner)
   - Bottom or side: "Open Tools" button
   - Remove the current dashboard-heavy ProjectHomeDashboard

2. AnA greeting becomes context-aware:
   - "Working on {project}. You have {n} artifacts, {x} in review. What would you like to do?"
   - Suggested actions: "Draft a document", "Open recent", "Check readiness", "Open tools"

**Files:** ZenApp.tsx (AnA mode logic), ProjectHomeDashboard.tsx (simplify to context strip)
**Risk:** Medium — changes the emotional landing of the product

### Phase C: Rename "Work" to "Tools" in Sidebar

1. Change project tab label from "Work" to "Tools"
2. `SIDEBAR_NAV_TO_LAYOUT` mapping: `tools → 'documents'` (or new mode)
3. `PRIMARY_NAV_ID_BY_LAYOUT`: adjust accordingly

**Files:** ZenSidebar.tsx, ZenApp.tsx
**Risk:** Low — label change only

### Phase D: Converge FullDocumentBuilder Output into EditorPanel

1. After FullDocumentBuilder wizard completes, instead of showing a standalone review step, navigate to EditorPanel with the generated content as `pendingEditorContent`
2. This makes the builder a creation tool, not a separate document world

**Files:** FullDocumentBuilder.tsx, ZenApp.tsx (documents mode handling)
**Risk:** Medium — changes builder's exit behavior

### Phase E: Update Onboarding Suggested Actions

1. "Start in Work" → "Talk to AnA" (default — just close onboarding, land in AnA home)
2. "Open Tools" replaces any tool-specific action for pharma track
3. "Open 510(k) Workspace" stays (it's a real destination)

**Files:** FirstRunExperience.tsx
**Risk:** Low

---

## Summary

**The product becomes:**

```
Project opens
    ↓
AnA (conversational home)
    ↓
User chooses:
    ├── Keep talking to AnA
    ├── "Open Tools" → Productivity Tools surface
    │     ├── Recent Documents
    │     ├── Create Document
    │     ├── Document Builder
    │     ├── Templates
    │     ├── Dossier Map
    │     ├── Vault
    │     ├── Review
    │     └── Submit
    └── Click suggested action
         ├── "Draft a document" → EditorPanel
         ├── "Check readiness" → Review
         └── "Open recent" → Tools → browse
```

**No code was changed. This is a plan only.**
