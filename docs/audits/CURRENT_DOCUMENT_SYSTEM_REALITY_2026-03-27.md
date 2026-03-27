# Current Document System Reality

**Date:** 2026-03-27
**Purpose:** Repo-truth gate — what the code actually proves about the document system today.

---

## 1. Document Creation Paths

| # | Path | Trigger File | Trigger | Destination | Converges to EditorPanel? |
|---|------|-------------|---------|-------------|--------------------------|
| 1 | NewDocumentDialog | `ProjectWorkspaceShell.tsx:313-717` | "+" button in shell header | Creates artifact via API, opens in EditorPanel | **YES** |
| 2 | Quick inline input | `ProjectWorkspaceShell.tsx:1866` | Inline title input in browse mode | Creates artifact, opens in EditorPanel | **YES** |
| 3 | Template tree click | `ProjectWorkspaceShell.tsx` (template rail) | Click template in left rail | Creates artifact from template, opens in EditorPanel | **YES** |
| 4 | SubmissionApps | `SubmissionAppsPanel.tsx` | "Create Governed Draft" card | Creates artifact via API, user must manually open | **PARTIAL** — artifact created but not auto-opened in editor |
| 5 | AnA draft insert | `ZenApp.tsx:1151` | AnA generates >100 chars, user clicks "Insert" | Sets `pendingEditorContent` → flows to EditorPanel via `initialContent` prop | **YES** |
| 6 | RI Copilot precedent | `RICopilotHome.tsx` → `ZenApp.tsx:2731-2733` | "Draft from Precedent" button | Sets `pendingEditorContent` → flows to EditorPanel | **YES** |
| 7 | FullDocumentBuilder | `FullDocumentBuilder.tsx:349-356` | "Open in Editor" button after wizard completes | Calls `onOpenInEditor(content, title, ctdSection)` → sets `pendingEditorContent` → flows to EditorPanel | **YES** (since Phase D convergence) |
| 8 | Open existing artifact | `ProjectWorkspaceShell.tsx` (file tree click) | Click artifact in file list or dossier tree | Opens directly in EditorPanel | **YES** |

**Convergence assessment:** 7 of 8 paths converge to EditorPanel. Path #4 (SubmissionApps) is the remaining gap — it creates the artifact but doesn't auto-navigate to the editor.

---

## 2. EditorPanel Capabilities (What's Real)

**File:** `client/src/concept2cure/components/editor/EditorPanel.tsx` (3,249 lines)

### Inspector Panels (18 types — all real)
| Panel | ID | What It Does |
|-------|----|-------------|
| Intelligence | `intelligence` | AI suggestions, claim analysis |
| Provenance | `provenance` | Document source tracing, generation metadata |
| Compare | `compare` | Version diff between artifact versions |
| Audit | `audit` | Full audit trail, 21 CFR Part 11 events |
| Data Room | `dataroom` | Project evidence browser |
| Inconsistency | `inconsistency` | Contradiction detection across sections |
| Health | `health` | Document health score |
| Versions | `versions` | Version history list |
| Batch AI | `batch-ai` | Multi-section AI rewrite/expand/summarize |
| Cross-Ref | `crossref` | Cross-reference management |
| Comments | `comments` | Comment threads on document |
| Review | `review` | Review state and actions |
| Reviewers | `reviewers` | Reviewer assignment panel |
| Submission Readiness | `submission-readiness` | Readiness for this document |
| Compliance Scanner | `compliance-scanner` | Real-time compliance check |
| AnA Memory | `ana-memory` | Project intelligence context |
| Proof | `proof` | Evidence proof chain |
| GA Readiness | `ga-readiness` | General availability readiness |

### Lifecycle States Visible in Editor
- Status shown in header: `activeArtifact.status || 'draft'` (line 231)
- States recognized: `draft`, `review`, `approved`, `locked`
- Signature workflow exists: approval sets status to `approved` (line 1344)
- Lock check: `locked` status prevents editing (line 1411)
- Approved warning: editing approved doc shows reset warning (line 1414)
- AI actions gated: only available when status is `draft` or `review` (line 1432)

### What's Real vs What's Stub
- **Real:** TipTap editor, artifact CRUD, version creation, AI slash commands (rewrite/expand/summarize/regulatory/references), inspector panels, provenance, compare, audit, export
- **Real:** Signature capture, reviewer assignment, compliance scanning
- **Needs Polish:** Lifecycle stages (Draft/Review/Verify/Publish) exist as capabilities spread across 18 inspector panels but are NOT grouped into a visible staged workflow

---

## 3. Workspace Shell Layout (What the User Sees Today)

**File:** `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` (2,675 lines)

### Left Rail Modes (5)
| Mode | What It Shows |
|------|-------------|
| `files` | Folder-based view: Drafts, Generated, Dossier, Evidence, CMC, IND, eCTD, Clinical, Audit, Final |
| `dossier` | CTD section tree (M1-M5 with subsections), document count per section, placement actions |
| `templates` | Template library for regulatory sections |
| `outline` | Auto-generated document structure (headings, tables, evidence markers) — only in edit mode |
| `registry` | Operating System Registry Panel — system-level organization |

### Operating Layers (3)
| Layer | Purpose |
|-------|---------|
| `document_studio` | Authoring and document management |
| `vault` | Evidence storage and retrieval |
| `reports` | Readiness dashboards, activity logs |

### Workbench Types (4)
| Workbench | Default Folder |
|-----------|---------------|
| `cmc` | CMC folder |
| `biostats` | Clinical folder |
| `device` | Evidence folder |
| `clinical` | Clinical folder |

### Project Tabs (sidebar navigation)
| Tab | Layout Mode | Component |
|-----|------------|-----------|
| Overview | `project-home` | ProjectHomeDashboard (light context strip + AnA) |
| Tools (was "Work") | `documents` or `regulatory-workspace` | ProjectWorkspaceShell or FullDocumentBuilder |
| Vault | `vault` | VaultPage |
| Review | `review` | ReviewReadiness |
| Submit | `submissions` | SubmissionReadiness |

---

## 4. Artifact Lifecycle States

### In Database (concept2cureArtifacts schema)
Status field accepts: `draft`, `review`, `approved`, `locked`, `archived`

### In UI (GovernedDocumentPanel + EditorPanel)
| State | Badge Color | Can Edit? | Can AI? | Next Action |
|-------|------------|-----------|---------|-------------|
| `draft` | Gray | Yes | Yes | Submit for Review |
| `review` | Orange | Yes (with warning) | Yes | Approve & Sign |
| `approved` | Green | With reset warning | No | Lock / Export |
| `locked` | Dark | No | No | Export only |

### Transitions
- `draft` → `review`: User clicks "Submit for Review"
- `review` → `approved`: Reviewer clicks "Approve & Sign" (captures electronic signature)
- `approved` → `locked`: Status progression (governed)
- `approved` → `draft`: User edits approved doc (reset with warning)

---

## 5. Dr. Sage Status

**Line 149 of ZenApp.tsx:**
```typescript
// import DrSageGlobalLayer from './components/dr-sage/DrSagePanel';
```

**Status: ALREADY REMOVED.** The import is commented out. Dr. Sage is NOT rendered in the current codebase. The ANA_FIRST_CONVERGENCE_PLAN Phase A is already done.

---

## 6. Broken/Incomplete Flows

| # | Issue | Detail | Impact |
|---|-------|--------|--------|
| 1 | SubmissionApps creates artifact without opening editor | Artifact created via API but user must navigate to it manually | Breaks "every path → EditorPanel" rule |
| 2 | Tools landing is FullDocumentBuilder | The `documents` layout mode renders FullDocumentBuilder as the entire view, not as one tool inside a workbench | Violates directive: "FullDocumentBuilder becomes one tool, not the destination" |
| 3 | Lifecycle stages not grouped | Draft/Review/Verify/Publish capabilities exist across 18 inspector panels but aren't presented as one staged system | User can't see "where am I in the process" |
| 4 | Data Room "Ask" endpoint missing | AskDataRoomPanel UI exists (`client/src/components/coauthor/AskDataRoomPanel.jsx`) but `/api/evidence/ask` is a stub | Weave parity gap #3 |
| 5 | HAQ workflow not surfaced | Backend services exist but no visible UI workflow | Weave parity gap #9 |
| 6 | Vault-workspace duplicate renderer removed but route still in LayoutMode type | `vault-workspace` layout mode type still defined though renderer was removed | Tech debt, not user-facing |

---

## 7. Key Files Reference

| File | Lines | Role |
|------|-------|------|
| `client/src/concept2cure/ZenApp.tsx` | 3,466 | Main app shell, all layout routing |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 2,675 | 3-pane workspace (tree | content | inspector) |
| `client/src/concept2cure/components/editor/EditorPanel.tsx` | 3,249 | Canonical editor with 18 inspector panels |
| `client/src/concept2cure/components/builder/FullDocumentBuilder.tsx` | 459 | 5-step CSR/CTD generation wizard |
| `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` | ~200 | Light context strip for project home |
| `client/src/concept2cure/components/workflow/DossierMap.tsx` | ~300 | Visual CTD module hierarchy |
| `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx` | ~400 | Submission readiness checklist + export |
| `client/src/concept2cure/pages/VaultPage.tsx` | ~300 | Project file browser |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | ~500 | Primary AI conversational surface |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | ~500 | Global + project navigation |
