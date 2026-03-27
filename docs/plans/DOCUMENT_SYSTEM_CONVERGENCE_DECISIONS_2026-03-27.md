# Document System Convergence Decisions

**Date:** 2026-03-27
**Purpose:** Freeze what gets kept, simplified, merged, demoted, expanded, and removed.

---

## 1. KEEP (No Changes)

| Component | File Path | Reason |
|-----------|----------|--------|
| AnaPersistentPanel | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Single visible guide identity |
| EditorPanel | `client/src/concept2cure/components/editor/EditorPanel.tsx` | Canonical editing surface — 3,249 lines of real capability |
| ProjectWorkspaceShell | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Machine room — 2,675 lines of operational capability |
| GovernedDocumentPanel | Inside ProjectWorkspaceShell | Core IP — status workflow, audit, versions, provenance, signatures |
| ReviewReadiness | `client/src/concept2cure/components/workflow/ReviewReadiness.tsx` | Review surface — stays as Review tab |
| SubmissionReadiness | `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx` | Submit surface — stays as Submit tab |
| VaultPage | `client/src/concept2cure/pages/VaultPage.tsx` | Vault tab — file browser |
| Export governance | `server/services/compute/exportGovernance.ts` | 5-record governed export chain |
| Dossier/placement logic | `ProjectWorkspaceShell.tsx` dossier rail + DossierMap | CTD section tree + artifact placement |
| Generation guard | `server/services/generation-guard.ts` | Runtime tracing for artifact pipeline |
| CanonicalDocumentContract | `shared/types/document-contract.ts` | Shared contract for all generation paths |

---

## 2. SIMPLIFY / RELABEL

| What | Old | New | File(s) | Change |
|------|-----|-----|---------|--------|
| Project tab label | "Work" | "Tools" | `ZenSidebar.tsx` (tab label), `ZenApp.tsx` (nav mapping) | Change label string in PROJECT_TABS constant |
| FullDocumentBuilder role | Default `documents` mode destination | One tool inside Tools landing | `ZenApp.tsx` (documents layout renderer) | Wrap in Tools landing instead of rendering directly |
| Inspector panel organization | 18 flat panels | 4 lifecycle stage groups (Draft/Review/Verify/Publish) | `EditorPanel.tsx` (inspector ribbon) | Group ribbon items into 4 sections |
| Layout mode labels | `regulatory-workspace`, `documents` | Keep internally but user never sees these | No user-facing change needed — these are code-level |

---

## 3. MERGE

| Source | Destination | Mechanism | File(s) |
|--------|------------|-----------|---------|
| FullDocumentBuilder output | EditorPanel | Already done: `onOpenInEditor` → `pendingEditorContent` → EditorPanel `initialContent` prop | `FullDocumentBuilder.tsx:349`, `ZenApp.tsx:860` |
| SubmissionApps governed draft | EditorPanel | After artifact creation, set `openArtifactId` to auto-open in editor | `SubmissionAppsPanel.tsx`, `ProjectWorkspaceShell.tsx` |
| All document creation paths | EditorPanel | 7 of 8 already converge. Fix path #4 (SubmissionApps) | See creation paths table in reality doc |
| Review/Verify/Publish | Unified lifecycle in editor | Group inspector panels into 4 stages with stage indicator | `EditorPanel.tsx` inspector ribbon |

---

## 4. DEMOTE

| What | Current Role | New Role | Mechanism | File(s) |
|------|-------------|----------|-----------|---------|
| DrSageGlobalLayer | Was global floating button | **Already removed** — import commented out | Line 149 of ZenApp.tsx already has `// import DrSageGlobalLayer` | No change needed |
| FullDocumentBuilder as default | Primary `documents` layout renderer | One tool card inside Tools landing page | Change `documents` layout to render Tools landing, with builder as one option | `ZenApp.tsx` documents renderer |
| RICopilotHome | Sub-view of regulatory-workspace | Accessible from AnA or deep research, not default landing | Keep but don't render as primary | `ZenApp.tsx` riViewMode handling |
| Machine-room controls in workspace | Multiple operating layers + workbench bars visible by default | Operating layers and workbench bars hidden behind explicit tool invocation | `ProjectWorkspaceShell.tsx` — default to simpler view | Existing code, just change defaults |
| 50+ dead layout modes in LayoutMode type | Type bloat with ~30 demoted modes | Already redirected via DEMOTED_REDIRECTS | `ZenApp.tsx:909-939` — already handled | No change needed |

---

## 5. EXPAND

| Capability | What to Build | Source Components | Target |
|-----------|--------------|-------------------|--------|
| **Tools Landing Page** | A curated workbench showing 10 capabilities: resume, recent, create, builder, templates, dossier, vault, review, submit, HAQ | New component or modification to `documents` layout mode in ZenApp | `ZenApp.tsx` or new `ToolsLanding.tsx` |
| **Data Room / Ask** | Wire AskDataRoomPanel UI to ForesightRAGService backend; create `/api/evidence/ask` endpoint | `client/src/components/coauthor/AskDataRoomPanel.jsx`, `server/services/foresight-rag-service.ts` | New route + endpoint wiring |
| **HAQ Manager** | Visible workflow: ingest questions → organize → AI-draft responses → review → export | `server/services/regulatory-precedent-intelligence/ema-question-taxonomy-service.ts` (backend) | New component in Tools |
| **Editor lifecycle stages** | Group 18 inspector panels into 4 stages (Draft/Review/Verify/Publish) with stage indicator in header | `EditorPanel.tsx` inspector ribbon | Modify ribbon grouping |
| **Dossier section readiness** | Derive section status from live artifact data (not hardcoded) | `ProjectWorkspaceShell.tsx` dossier rail, `concept2cureArtifacts` table | Query artifacts by ctdSection |

---

## 6. REMOVE

| What | File Path | Why |
|------|----------|-----|
| `vault-workspace` renderer | Already removed from `ZenApp.tsx` | Duplicate — redirects to `vault` via DEMOTED_REDIRECTS |
| `review-readiness` standalone renderer | Already removed from `ZenApp.tsx` | Duplicate — redirects to `review` via DEMOTED_REDIRECTS |
| 9 fake apps from AppsPage | Already removed: evidence-memo, protocol-rationale, risk-benefit, clinical-overview, module3-builder, audit-report, cmc, clinical, device | No real destinations |
| `window.location.href` shell escapes | Already fixed in `ZenApp.tsx` | CER and 510k now route in-shell |

---

## 7. IMPLEMENTATION SEQUENCE

### Block 1: Convergence (Phases 1-3)

| Step | What | Files | Risk |
|------|------|-------|------|
| 1a | Create Tools landing component | New `ToolsLanding.tsx` or modify `ZenApp.tsx` documents renderer | Medium — changes default Tools experience |
| 1b | Rename "Work" → "Tools" in sidebar | `ZenSidebar.tsx` tab label | Low — label only |
| 1c | Make FullDocumentBuilder one card in Tools | `ZenApp.tsx` documents layout | Medium |
| 2a | Fix SubmissionApps → EditorPanel convergence | `SubmissionAppsPanel.tsx` | Low |
| 3a | Add lifecycle stage indicator to EditorPanel header | `EditorPanel.tsx` | Medium — new UI element |
| 3b | Group inspector panels into 4 lifecycle stages | `EditorPanel.tsx` ribbon | Medium |

### Block 2: Parity (Phases 4-6)

| Step | What | Files | Risk |
|------|------|-------|------|
| 4a | Create `/api/evidence/ask` endpoint | New route in `server/routes/` | Medium — new backend |
| 4b | Wire AskDataRoomPanel to endpoint | `AskDataRoomPanel.jsx` | Low — UI exists |
| 4c | Surface Ask in Tools vault section | Tools landing | Low |
| 5a | Derive dossier section readiness from DB | `ProjectWorkspaceShell.tsx` dossier rail | Medium |
| 5b | Make submission readiness visible in Tools | Tools landing Submit card | Low |
| 6a | Create HAQ Manager component | New component | Medium — new UI |
| 6b | Wire to ema-question-taxonomy service | Backend wiring | Low |

### Dependencies
- Block 1 has no external dependencies
- Block 2 step 4a (Ask endpoint) can run in parallel with Block 1
- Block 2 step 6a (HAQ) depends on Block 1 (needs Tools landing to surface it)
- Final validation waits for all above
