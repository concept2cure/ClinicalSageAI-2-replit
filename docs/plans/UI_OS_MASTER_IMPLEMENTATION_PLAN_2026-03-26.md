# Concept2Cure UI OS Master Implementation Plan

**Date:** 2026-03-27
**Status:** AWAITING FINAL APPROVAL — do not implement until approved
**Branch:** `concept2cure-v2`

---

## 1. Executive Summary

Concept2Cure has most of the hard product built: governed artifacts, review/readiness surfaces, submission workflows, specialist workbenches, a real regulatory intelligence layer (RIM), and a powerful AI assistant (AnA). What it lacks is one clean map of how a person moves through it.

The current sidebar mixes global destinations (Projects) with project-local workflow (Dossier, Documents, Review, Biostats, Submissions) at the same hierarchy level. The LayoutMode system has 60+ values, 27 of which are dead redirects. The onboarding introduces Dr. Sage and AnA as separate personas and shows agent architecture before the user has done anything useful. There is no Apps launcher page, no Artifacts browse page, and no Setup destination.

**This plan restructures the platform into:**
- 6 calm global destinations (New, Search, Projects, Apps, Artifacts, Setup)
- 5 project tabs (Overview, Work, Vault, Review, Submit)
- 1 universal guide (AnA)
- A first-time journey that ends with a real output, not abstract slides

**No new backend work required.** All APIs already exist. This is a frontend navigation and shell restructure.

---

## 2. Repo Truth Summary

### What Already Exists and Works

| Asset | File | Verdict |
|-------|------|---------|
| Governed artifact lifecycle (D→R→A→L) | `GovernedDocumentPanel.tsx` | **Preserve.** Core IP. |
| 7-tab review/readiness surface | `ReviewReadiness.tsx` | **Preserve.** Maps to Review project tab. |
| Section readiness + export | `SubmissionReadiness.tsx` | **Preserve.** Maps to Submit project tab. |
| 3-pane document workspace | `ProjectWorkspaceShell.tsx` (1822 lines) | **Preserve.** Maps to Work project tab. |
| 6 document-producing apps | `SubmissionAppsPanel.tsx` | **Preserve.** Nucleus of Apps page. |
| Virtual file tree | `ProjectFileTree.tsx` | **Preserve.** Nucleus of Vault tab. |
| Context-aware AI assistant | `AnaPersistentPanel.tsx` | **Preserve.** Persistent AnA. |
| Cross-project artifact search | `GlobalDocumentSearch.tsx` | **Preserve.** Patterns reusable for Artifacts page. |
| 7-section settings | `ZenSettings.tsx` | **Preserve.** Content reusable for Setup page. |
| Project creation | `ProjectSwitcher.tsx` (NewProjectModal) | **Preserve.** |

### What Is Duplicated

- **Project dashboard x2**: `ProjectDashboard.tsx` + `ProjectHomeDashboard.tsx` — consolidate into Overview tab
- **Onboarding x3**: `FirstRunExperience.tsx` + `IndustryModeSelector.tsx` + `QuickStartWizard.tsx` — consolidate into one flow
- **Review x2**: `ReviewReadiness.tsx` + `ProjectReadinessDashboard.tsx` — keep ReviewReadiness as primary

### What Is Mislabeled

- "Documents" as global sidebar item → should be Work (project-local)
- "Dossier Map" as global sidebar item → should be sub-view inside Work
- "Biostats" as global sidebar item → should be app in Apps launcher
- "Submissions" as global sidebar item → should be Submit (project-local)
- `layoutMode: 'artifacts'` demoted to redirect → should be real global destination
- `layoutMode: 'document-vault'` demoted to redirect → should be Vault project tab

### What Must Be Demoted

- Reports as standalone global/project layer → redistribute to Overview, Review, Submit
- PlatformHome 12-module catalog → references dead destinations, replace with clean landing
- Dr. Sage persona → remove, single AnA identity
- Agent architecture in onboarding → remove from user-facing flow

---

## 3. Final Global Shell Map

```
GLOBAL LEFT RAIL (6 items)
──────────────────────────
  [ClinicalSage Logo]
  ──────
  + New           → dropdown: Chat, Project, Artifact
  🔍 Search       → overlay: projects, artifacts, files, apps, chats
  📁 Projects     → destination page: project list
  ✨ Apps          → destination page: 3-group launcher
  📄 Artifacts    → destination page: governed outputs browser
  ⚙ Setup         → destination page: org/user/integration config
  ──────
  [Account/Profile]
```

### What's NOT in the global rail

- Documents (lives inside Work)
- Dossier (lives inside Work)
- Review (project tab)
- Submissions (project tab, renamed Submit)
- Biostats (app in Apps)
- Reports (redistributed)
- Vault (project tab)
- Admin (absorbed into Setup)

---

## 4. Final Project Shell Map

```
CURRENT PROJECT BLOCK (appears when project active)
────────────────────────────────────────────────────
  [Project Name] [510(k) badge]
  ────
  Overview    → project summary, readiness, next actions
  Work        → 3-pane editor (files/dossier/templates | editor | governed panel)
  Vault       → file browser, upload, evidence
  Review      → quality, compliance, readiness, audit, traceability (7 tabs)
  Submit      → section completeness, readiness checklist, export package
```

### Tab → Renderer Mapping

| Tab | Layout Mode | Component | Exists? |
|-----|-------------|-----------|---------|
| Overview | `project-home` | `ProjectHomeDashboard` (enhanced) | Yes, needs enrichment |
| Work | `documents` | `ProjectWorkspaceShell` | Yes |
| Vault | `vault` | `VaultPage` (new) | New — compose from ProjectFileTree |
| Review | `review` | `ReviewReadiness` | Yes |
| Submit | `submissions` | `SubmissionReadiness` | Yes |

---

## 5. Canonical Object & Naming Model

| Term | Meaning | Where Shown | Where NOT Shown |
|------|---------|-------------|-----------------|
| **Artifact** | Governed output/record. Versioned, status-tracked (D→R→A→L), auditable. | Artifacts global page, GovernedDocumentPanel, Review tab, Submit tab | Don't use when user is actively authoring (use "document") |
| **Document** | Editable artifact in Work. The user-facing word for "the thing I'm writing." | Work tab: document list, editor, "Create Document" | Not a global destination. Not in sidebar. |
| **File** | Uploaded/imported source material. Not governed in D→R→A→L lifecycle. | Vault tab: file browser, upload, evidence packs | Not mixed with artifact governance language. |
| **Vault** | Project workspace for files and linked artifacts in storage/evidence context. | Project tab. Vault drawer utility. | Not a global destination. |
| **DMS** | Backend document management capability. | Nowhere in UI. | Never as a label, heading, or nav item. |
| **Dossier** | CTD structure (Modules 1-5). | Inside Work as "Section Map" or "Dossier" sub-view. | Not a sidebar item. Not a global destination. |
| **Report** | Generated deliverable/summary. | Overview (readiness snapshot), Review (compliance/audit reports), Submit (submission report), Apps (Audit Report app). | Not a standalone destination or project tab. |
| **Submission** | Act of finalizing and filing. | Submit project tab. Submission type badges. | Not a global destination. |

---

## 6. First-Time User Journey Map

```
Step 1: Welcome
  "Welcome to Concept2Cure"
  [Create your first project] ← primary CTA
  AnA: "I'm AnA, your regulatory intelligence guide."

Step 2: Guided Setup
  Client track (Pharma/Biotech or Device/Diagnostics)
  Role (5 options)
  Submission type (8 options, filtered by track)
  Agency/region
  Organization name (optional)
  AnA summarizes: "Got it — 510(k) for FDA."

Step 3: Create First Project
  Project name (required)
  Sponsor, product (optional)
  Submission type (pre-filled)
  Optional file upload
  → Project created via API

Step 4: Land in Overview
  Project summary card
  Readiness snapshot (fresh)
  Next recommended actions
  AnA: "Here's your project home."

Step 5: AnA Tab Tour
  One AnA message explaining 5 tabs
  Optional tooltip highlights

Step 6: First Successful Action
  AnA suggests context-appropriate action:
  - Pharma: "Create Clinical Overview"
  - Device: "Open 510(k) Workspace"
  - Any: "Upload source documents" or "Draft first section"
  → App launches, first artifact created

Step 7: Confidence Checkpoint
  "You're all set ✓"
  Continue to Work / Vault / Apps / Overview
```

---

## 7. Apps Launcher Architecture

### Strategy & Evidence

| App | Repo Source |
|-----|------------|
| Deep Research | `layoutMode: 'deep-research'` |
| Precedent Intelligence | `PrecedentIntelligenceDashboard` (ZenApp line 195) |
| Evidence Memo | `SubmissionAppsPanel` (evidence_memo, CTD 5.3) |
| Protocol Rationale | `SubmissionAppsPanel` (protocol_rationale, CTD 5.3.5) |
| Risk-Benefit Analysis | `SubmissionAppsPanel` (risk_benefit_analysis, CTD 2.5) |

### Builders

| App | Repo Source |
|-----|------------|
| Clinical Overview | `SubmissionAppsPanel` (clinical_overview, CTD 2.5) |
| Module 3 Builder | `SubmissionAppsPanel` (regulatory_document, CTD 3.2.S) |
| Safety Narrative | `SafetyNarrativePage` (ZenApp line 229) |
| 510(k) Workspace | `EmbeddedCERV2Page` (ZenApp line 62) |
| PMA Workspace | `EmbeddedPMAWorkspace` (ZenApp line 64) |
| CER Generator | External route `/cerv2?mode=cer` |
| Audit Report | `SubmissionAppsPanel` (audit_report, CTD 1.3) |

### Specialist Studios

| App | Repo Source |
|-----|------------|
| CMC | Concept exists, currently demoted. CMC-tuned Work view. |
| Biostatistics | `BiostatPlatformDashboard` + `AnaBiostatsPanel` |
| Clinical | Stub — via AnA + evidence tools |
| Device | Stub — via 510(k)/PMA/CER apps |

---

## 8. Persona Swim Lanes

| Role | Primary Path | Primary Tabs | Key Apps |
|------|-------------|-------------|----------|
| **Regulatory Lead** | Projects → Overview → Work → Review → Submit | All 5 | Evidence Memo, Clinical Overview |
| **Medical Writer** | Projects → Work → Review | Work, Review | Clinical Overview, Module 3 Builder, Safety Narrative |
| **CMC Specialist** | Projects → Apps → CMC → Work → Vault → Review | Work, Vault, Review | CMC Studio, Module 3 Builder |
| **Biostatistician** | Projects → Apps → Biostatistics → Work → Review | Work, Review | Biostatistics Studio |
| **Device Lead** | Projects → Apps → 510(k)/PMA/CER → Vault → Review → Submit | All 5 | 510(k), PMA, CER Generator |
| **QA / Reviewer** | Projects → Review → Submit | Review, Submit | (rarely uses apps) |
| **Executive / PM** | Projects → Overview → Artifacts (global) | Overview | (rarely uses apps) |

---

## 9. Sidebar Redesign Blueprint

### Expanded Mode

```
[ClinicalSage Logo]        [Collapse ←]
────────────────────────────────────────
[+ New]                     (full-width button)
────────────────────────────────────────
  🔍 Search
  📁 Projects
  ✨ Apps
  📄 Artifacts
  ⚙ Setup
════════════════════════════════════════
  CURRENT PROJECT (if active)
  [Project Name]  [510(k)]
  ────
  🏠 Overview
  ✏️ Work
  📦 Vault
  ✓ Review
  📤 Submit
  [Switch project]
════════════════════════════════════════
  ★ PINNED
    Project Alpha [IND]
    Project Beta  [NDA]
  ────
  RECENT
    Project Gamma [510(k)]
    Project Delta [PMA]
════════════════════════════════════════
  [Avatar] User Name
           user@org.com    [⚙]
```

### Collapsed Mode

```
[Logo]
──
[+]
──
[🔍]
[📁]
[✨]
[📄]
[⚙]
══
[🏠]  ← only if project active
[✏️]
[📦]
[✓]
[📤]
══
[👤]
```

---

## 10. Page-by-Page Destination Map

| Destination | Type | Content | New File? |
|-------------|------|---------|-----------|
| **Projects** | Global | Project cards, search/filter, create project | Exists (`ProjectSwitcher`) |
| **Apps** | Global | 3-group card launcher (Strategy, Builders, Studios) | **New:** `pages/AppsPage.tsx` |
| **Artifacts** | Global | Artifact browser with status tabs, project/type filters | **New:** `pages/ArtifactsPage.tsx` |
| **Setup** | Global | Settings sections (Profile, Org, Notifications, Security, Appearance, Integrations, Help) | **New:** `pages/SetupPage.tsx` |
| **Overview** | Project | Summary, readiness snapshot, next actions, recent artifacts | Exists (`ProjectHomeDashboard` — enhance) |
| **Work** | Project | 3-pane: file tree/dossier/templates | editor | governed panel | Exists (`ProjectWorkspaceShell`) |
| **Vault** | Project | File browser, upload, search, evidence packs | **New:** `pages/VaultPage.tsx` |
| **Review** | Project | Quality, compliance, predictions, readiness, evidence, audit, traceability | Exists (`ReviewReadiness` 7-tab) |
| **Submit** | Project | Section readiness checklist, export package | Exists (`SubmissionReadiness`) |

---

## 11. Phased Implementation Sequence

| Phase | Scope | Files Touched | New Files | Risk |
|-------|-------|---------------|-----------|------|
| **0** | Spec + plans (this sprint) | 1 spec doc | 7 plan docs | None |
| **1** | Sidebar restructure | `ZenSidebar.tsx`, `ZenApp.tsx` (type + nav + activeNavId) | 0 | Medium |
| **2** | New global pages | `ZenApp.tsx` (render switch) | `AppsPage.tsx`, `ArtifactsPage.tsx`, `SetupPage.tsx` | Low |
| **3** | Vault + Overview enhancement | `ZenApp.tsx`, `ProjectHomeDashboard.tsx` | `VaultPage.tsx` | Low |
| **4** | LayoutMode cleanup | `ZenApp.tsx` (DEMOTED_REDIRECTS) | 0 | Low |
| **5** | Onboarding rewrite | `FirstRunExperience.tsx`, `ZenAppWithSession.tsx` | 0 | Medium |
| **6** | Polish | `PlatformHome.tsx`, spec doc | 0 | Low |

**Total new files:** 4 pages + 7 plan docs
**Total modified production files:** 6
**Highest-risk file:** `ZenApp.tsx` (2700+ lines, touched in Phases 1-4)

---

## 12. Validation Checklist

### Navigation
- [ ] Sidebar: 6 global items in collapsed and expanded modes
- [ ] Project tabs: 5 tabs appear when project active, disappear when none selected
- [ ] Projects page: lists projects, create works
- [ ] Apps page: 3 groups render, app launch works with/without active project
- [ ] Artifacts page: loads from API, filters work, click opens artifact
- [ ] Setup page: all 7 settings sections render
- [ ] Search overlay: opens from sidebar + ⌘K, finds projects/artifacts/files/apps

### Project Tabs
- [ ] Overview: readiness snapshot, recent artifacts, next actions
- [ ] Work: 3-pane editor functional, dossier sub-view accessible
- [ ] Vault: file tree renders, upload works
- [ ] Review: 7-tab surface renders with real data
- [ ] Submit: readiness checklist renders, export at 100%

### AnA
- [ ] AnA visible on every screen (global and project)
- [ ] Context-aware greeting changes per screen

### First-Time User
- [ ] New user: welcome → setup → project → overview → tour → action → checkpoint
- [ ] Existing user: skips onboarding, lands on Projects or last project
- [ ] No Dr. Sage. Single AnA identity throughout.

### Backward Compatibility
- [ ] All demoted layout modes redirect correctly
- [ ] No 404s or blank screens from old URLs
- [ ] `npm run typecheck` passes
- [ ] `npm run dev` starts without errors

### Role Paths
- [ ] Regulatory lead: Projects → Overview → Work → Review → Submit
- [ ] Medical writer: Projects → Work → Review
- [ ] CMC specialist: Projects → Apps → CMC → Work → Vault
- [ ] Device lead: Projects → Apps → 510(k) → Work → Submit
- [ ] Executive: Projects → Overview → Artifacts (global)

---

## 13. Risks and No-Go Zones

### Risks

1. **ZenApp.tsx complexity** — 2700+ lines, touched in 4 phases. Mitigation: each phase edits non-overlapping sections. Run typecheck after each phase.
2. **AnaPersistentPanel dual render** — currently renders at lines 2618 and 2729 in ZenApp. Sidebar/shell changes could break one path. Mitigation: verify AnA on every layout mode after Phase 1.
3. **Phase 4 overlay system** — SubmissionAppsPanel lives as overlay in ProjectWorkspaceShell. AppsPage is additive, not replacement. Don't remove overlay.
4. **Three onboarding components** — unclear which runs on first login. Mitigation: audit localStorage flags before Phase 5.
5. **Artifacts API coverage** — `GET /api/concept2cure/artifacts` exists but may need additional filter params for Artifacts page. Verify in Phase 2.

### No-Go Zones

- Do NOT create new backend APIs in this sprint
- Do NOT modify GovernedDocumentPanel, ReviewReadiness, or SubmissionReadiness internals
- Do NOT remove the SubmissionAppsPanel overlay from ProjectWorkspaceShell
- Do NOT delete demoted LayoutMode values (keep for backward compat)
- Do NOT introduce a second AI persona
- Do NOT add more top-level global items beyond the 6 approved
- Do NOT create standalone pages for Reports, Documents, Dossier, or Admin

---

## 14. Approval Gate

**This plan is complete. Implementation must not begin until explicit approval is given.**

Recommended first build phase: **Phase 1 — Sidebar Restructure.**

Everything else (new pages, vault tab, onboarding) depends on the sidebar being correct first.

### Delta Summary (vs. old spec)

| What Changed | Old Spec | This Plan |
|-------------|----------|-----------|
| Global nav | 8 items (AnA Home, Projects, Vault, Documents, Reports, Reviews, Submission, Admin) | 6 items (New, Search, Projects, Apps, Artifacts, Setup) |
| Project nav | 8 items (Overview, Documents, Vault/Evidence, Reports, Tasks, Reviews, Submission, Activity) | 5 items (Overview, Work, Vault, Review, Submit) |
| Apps | Not a destination, specialist modes only | First-class global launcher with 3 groups |
| Artifacts | Not a destination, "artifacts" layout mode demoted | First-class global browser |
| Reports | First-class global + project layer | Redistributed to Overview, Review, Submit |
| Documents | Top-level global destination | Lives inside Work (project-local) |
| Onboarding | Not addressed | 7-step value-first journey |
| AI identity | Multiple (Dr. Sage + AnA) | Single AnA |

### What Became Global
- Apps (new destination)
- Artifacts (un-demoted, new destination)
- Setup (replaces Admin + Settings modal)
- Search (replaces split between CommandPalette and GlobalDocumentSearch)

### What Became Project-Local
- Documents → Work tab
- Dossier Map → sub-view inside Work
- Review → Review tab
- Submissions → Submit tab
- Vault → Vault tab
- Biostats → App in Apps launcher

### What the First-Time User Sees First
Welcome page → guided setup → project creation → project Overview with AnA guidance → first suggested action → confidence checkpoint. No abstract slides. No agent architecture. No dual personas.
