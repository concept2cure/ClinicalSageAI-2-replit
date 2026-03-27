# Agent 01 — Repo Truth Audit

**Date:** 2026-03-27
**Scope:** Shell, sidebar, routing, onboarding, workspace, review, submission, artifact, vault surfaces

---

## 1. What Exists Now

### Shell & Sidebar

| File | Lines | Role |
|------|-------|------|
| `client/src/concept2cure/ZenApp.tsx` | 2700+ | Main application shell. Owns LayoutMode state (60+ values), onNavigate handler, render switch (lines 2152-2719), activeNavId mapping (lines 1784-1845). |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | 745 | Left rail. Collapsed: icon strip (New chat, Projects, Dossier, Documents, Review, Submissions, Settings). Expanded: Brand + New chat + Search + project groups (Pinned, Recent, General) + Workflow group (Dossier Map, Documents, Review, Biostats, Submissions) + user footer. |
| `client/src/concept2cure/router/ZenRouter.tsx` | ~200 | Route definitions. `/concept2cure` (main), `/concept2cure/project/:projectId` (project), `/concept2cure/project/:projectId/510k`, `/concept2cure/project/:projectId/pma`, `/concept2cure/onboarding`. |

### Workspace

| File | Lines | Role |
|------|-------|------|
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 1822 | 3-pane layout. Left rail modes: Files/Dossier/Templates/Outline. Center: Dashboard/Browse/Edit. Right: GovernedDocumentPanel. Phase 4 overlays: Transform Canvas, Verification, Program Twin, Submission Apps, Review Pulse. |
| `client/src/concept2cure/components/workspace/ProjectDashboard.tsx` | ~200 | Project overview with pipeline health, activity, CTD coverage. |
| `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` | ~120 | 4 workflow step cards: Dossier, Documents, Review, Submissions. |
| `client/src/concept2cure/components/workspace/ProjectFileTree.tsx` | ~300 | Virtual folder tree: drafts, generated, dossier, evidence, cmc, ind, ectd, clinical, audit, final. |

### Governance & Artifacts

| File | Role |
|------|------|
| `client/src/concept2cure/components/workspace/GovernedDocumentPanel.tsx` | Status workflow D→R→A→L. 7 tabs: Status, Audit, Versions, Snapshots, Threads, Governance, Lineage. Rationale/attestation modals. |
| `client/src/concept2cure/components/artifacts/ArtifactPanel.tsx` | Right-side artifact viewer. 20+ artifact types. Actions: Download, Share, Copy, Edit, History. |
| `client/src/concept2cure/components/workspace/GlobalDocumentSearch.tsx` | Cross-project artifact search modal. Status + project filters. Capped at 50 results. Uses `GET /api/concept2cure/artifacts`. |

### Review & Submission

| File | Role |
|------|------|
| `client/src/concept2cure/pages/ReviewReadiness.tsx` | 7-tab review surface: Quality Center, Compliance, AnA Predictions, Readiness Score, Evidence Confidence, Audit Trail, Traceability. |
| `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx` | Section readiness checklist. Status mapping (approved/locked/signed → ready). Export Package button at 100%. |
| `client/src/concept2cure/components/readiness/ProjectReadinessDashboard.tsx` | 6 sub-tabs: Overview, Modules, Blockers, Guidance, Workflows, Continuity. |
| `client/src/concept2cure/components/submission/SubmissionReadinessValidator.tsx` | CTD Module 1-5 validation. Check categories: completeness, formatting, cross-ref, language, e-sig, metadata. |

### Apps & Specialist Tools

| File | Role |
|------|------|
| `client/src/concept2cure/components/workspace/SubmissionAppsPanel.tsx` | 6 app cards: Evidence Memo, Protocol Rationale, Clinical Overview, Module 3 Builder, Risk-Benefit Analysis, Audit Report. Creates governed drafts via `/api/concept2cure/projects/:id/artifacts`. |
| `client/src/concept2cure/models/ctdHierarchy.ts` | ICH CTD Module 1-5 hierarchy. DossierNode types. SubmissionAppCandidate interface. |

### Onboarding

| File | Lines | Role |
|------|-------|------|
| `client/src/concept2cure/components/enablement/FirstRunExperience.tsx` | 582 | 7-step onboarding: Welcome, Dr. Sage intro, AnA intro, Role selection (5 roles), Submission type (8 types), AI Team + Automation Level, Ready to Go. Screens 0-2 auto-advance after 6 seconds. |
| `client/src/concept2cure/components/onboarding/IndustryModeSelector.tsx` | ~300 | 3-step: Industry (5 types), Role (8 roles), Confirm. |
| `client/src/concept2cure/components/wizard/QuickStartWizard.tsx` | ~400 | 5-step: Industry, Submission Type, Product Info, Regions & Timeline, Summary. |
| `client/src/concept2cure/components/onboarding/CTDProjectWizard.tsx` | ~500 | 5-step: Basics, Region, Upload, Compliance Check, Confirm. |

### Settings & Search

| File | Role |
|------|------|
| `client/src/concept2cure/components/settings/ZenSettings.tsx` | 7-section modal: Profile, Organization, Notifications, Security, Appearance, Integrations, Help. |
| `client/src/concept2cure/components/command/ZenCommandPalette.tsx` | ⌘K command palette. 6 categories: Recent, Submissions, Tools (25+), Mission Control (11+), AI Actions (3), Settings (2). |

### AnA

| File | Role |
|------|------|
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Rendered in 2 locations in ZenApp. Full mode (workspace layout, line 2618) and compact/full mode (all other layouts, line 2729). Context-aware greeting. 4 AI providers, 6 intent lenses. |

### Files That DO NOT EXIST

- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx` — referenced in planning prompt but does not exist
- `client/src/concept2cure/components/workspace/OperatingSystemRegistryPanel.tsx` — does not exist

---

## 2. What Is Duplicated / Overlapping

| Duplication | Details |
|-------------|---------|
| **Project dashboard x2** | `ProjectDashboard.tsx` (workspace internal) AND `ProjectHomeDashboard.tsx` (workflow). Both show project overview with different card sets. |
| **Onboarding x3** | `FirstRunExperience.tsx`, `IndustryModeSelector.tsx`, `QuickStartWizard.tsx` all collect role + submission type + industry. Unclear which runs when. |
| **Review surface x2** | `ReviewReadiness.tsx` (7-tab page) AND `ProjectReadinessDashboard.tsx` (6-tab component). Overlapping readiness/compliance content. |
| **Search x2** | `GlobalDocumentSearch.tsx` (artifact search modal) AND `ZenCommandPalette.tsx` (⌘K command search). Neither is a proper global search destination. |
| **Settings as modal only** | `ZenSettings.tsx` is a modal overlay. No settings destination page exists. |
| **PlatformHome references dead modules** | 12 module cards in `PlatformHome.tsx` reference destinations like SnowGlobe, Collaboration Hub, Training Center that are demoted/dead. |

---

## 3. What Is Mislabeled

| Current Label | Problem | Correct Label |
|---------------|---------|---------------|
| "Documents" in sidebar | Conflates global and project-local. Sidebar shows it as global destination but it only makes sense inside a project. | Should be "Work" tab inside project shell. |
| "Dossier Map" in sidebar | Project-specific CTD structure shown as global nav item. | Should be a sub-view inside Work tab. |
| "Biostats" in sidebar | Specialist tool shown as global nav peer of Projects. | Should be an app in Apps launcher. |
| "Submissions" in sidebar | Project-specific finalization lane shown as global nav. | Should be "Submit" tab inside project shell. |
| "Review" in sidebar | Project-specific quality center shown as global nav. | Should be "Review" tab inside project shell. |
| `layoutMode: 'artifacts'` | Currently demoted and redirects to `'documents'` (line 833 DEMOTED_REDIRECTS). | Should be a real global destination. |
| `layoutMode: 'document-vault'` | Demoted and redirects to `'documents'`. | Vault should be a project tab, not a dead redirect. |

---

## 4. What Should Be Preserved

| Asset | Why |
|-------|-----|
| **GovernedDocumentPanel** | Real D→R→A→L governance with provenance, versions, snapshots, lineage, attestations. Core IP. |
| **ReviewReadiness** (7-tab) | Genuine quality/compliance/readiness surface. Maps directly to "Review" project tab. |
| **SubmissionReadiness** | Real section-level readiness with export. Maps directly to "Submit" project tab. |
| **SubmissionAppsPanel** (6 apps) | Real document-producing app definitions with CTD placement. Nucleus of Apps page. |
| **ProjectWorkspaceShell** (3-pane) | Excellent document authoring surface. Maps directly to "Work" project tab. |
| **ProjectFileTree** | Virtual folder tree with status badges. Nucleus of Vault tab. |
| **AnaPersistentPanel** | Context-aware AI assistant with intent lenses and workstream tracking. |
| **ZenSidebar** project list | Pinned/Recent/General project grouping with submission type badges and nested conversations. |
| **NewProjectModal** | Project creation with 8 submission types, 7 regions, sponsor/product fields. |
| **ZenSettings** content | 7 well-organized settings sections. Content reusable for Setup page. |
| **GlobalDocumentSearch** | Cross-project artifact search. API and filter logic reusable for Artifacts page. |

---

## 5. What Must Change

| Current State | Required Change |
|---------------|-----------------|
| Sidebar "Workflow" group (Dossier, Documents, Review, Biostats, Submissions) | Remove entirely. Replace with 6 global destinations. |
| No "Current Project" block in sidebar | Add project block with 5 tabs when project is active. |
| 60+ LayoutMode values in ZenApp | Reduce to ~20 active modes. Add `'apps'`, `'artifacts-center'`, `'setup'`, `'vault'`. |
| No Apps destination page | Create `AppsPage.tsx` from SubmissionAppsPanel definitions + specialist tools. |
| No Artifacts destination page | Create `ArtifactsPage.tsx` from GlobalDocumentSearch patterns + browsing UI. |
| No Setup destination page | Create `SetupPage.tsx` from ZenSettings content extracted to page form. |
| No Vault project tab | Create `VaultPage.tsx` from ProjectFileTree + upload + search. |
| `ProjectHomeDashboard` shows 4 old workflow cards | Enhance for Overview tab: readiness snapshot, recent artifacts, next actions. |
| `FirstRunExperience` has Dr. Sage / AnA dual intro + 6s auto-advance | Rewrite to: Welcome → Setup → Create Project → Overview → AnA Tour → First Output → Checkpoint. Single AnA identity. |
| `PlatformHome` references 12 dead/demoted modules | Replace with clean landing that routes to Projects / Apps / recent work. |
| `activeNavId` mapping (60+ entries) | Simplify to match 6 global items + 5 project tabs. |

---

## 6. Unresolved Risks

1. **ZenApp.tsx is 2700+ lines** — surgical edits are high-risk. Any change to LayoutMode, onNavigate, or render switch could break multiple flows.
2. **AnaPersistentPanel renders in 2 separate JSX locations** — refactoring sidebar/shell may break one render path.
3. **Phase 4 overlay system in ProjectWorkspaceShell** — SubmissionAppsPanel is currently a Phase 4 overlay. Moving it to a global page means the overlay launcher needs rewiring.
4. **Three onboarding components** — unclear which actually runs on first login. Need to consolidate without breaking existing users who already completed onboarding.
5. **`GET /api/concept2cure/artifacts`** — currently used by GlobalDocumentSearch. Need to verify it supports the filters required for the Artifacts destination page.
