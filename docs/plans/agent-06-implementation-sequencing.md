# Agent 06 — Implementation Sequencing & Risk Control

**Date:** 2026-03-27

---

## 1. Phased Implementation Plan

### Phase 0: Naming Lock & Spec Update (This Sprint)

**Scope:** Update canonical spec. Write plan documents. No production code.

| File | Action |
|------|--------|
| `docs/architecture/CONCEPT2CURE_CANONICAL_UI_IA_AND_SHELL_SPEC.md` | Rewrite to match locked 6-item global / 5-tab project model |
| `docs/plans/agent-01` through `agent-06` + master plan | Write all plan files |

**Risk:** None. Documentation only.

---

### Phase 1: Sidebar Restructure

**Scope:** Replace ZenSidebar content. Add project tabs block. Update ZenApp nav wiring.

| File | Action | Risk |
|------|--------|------|
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` (745 lines) | **Major rewrite.** Remove Workflow group (Dossier, Documents, Review, Biostats, Submissions). Replace with 6 global items (New, Search, Projects, Apps, Artifacts, Setup). Add Current Project block with 5 tabs when project active. | **Medium.** Self-contained component with clear props interface. |
| `client/src/concept2cure/ZenApp.tsx` lines 345-427 | Add `'apps'`, `'artifacts-center'`, `'setup'`, `'vault'` to LayoutMode type. | **Low.** Type addition only. |
| `client/src/concept2cure/ZenApp.tsx` lines 1784-1845 | Simplify activeNavId mapping to 6 global + 5 project items. | **Medium.** Many legacy mappings to clean up. |
| `client/src/concept2cure/ZenApp.tsx` lines 1861-1934 | Update onNavigate switch: add cases for `'apps'`, `'artifacts-center'`, `'setup'`, `'vault'`, `'overview'`, `'work'`, `'submit'`. | **Medium.** Central handler. |

**Validation:** Sidebar renders 6 global items. Project tabs appear/disappear with project selection. All global items navigate to correct layout mode.

**Rollback:** Git revert on ZenSidebar.tsx + ZenApp.tsx changes.

---

### Phase 2: New Global Destination Pages

**Scope:** Create 3 new page components. Wire into ZenApp render switch.

| File | Action | Risk |
|------|--------|------|
| `client/src/concept2cure/pages/AppsPage.tsx` | **New file.** Card grid with 3 groups. Reuse SubmissionAppCandidate definitions from ctdHierarchy.ts. Use WorkspaceCanvas layout. | **Low.** New file, no existing code changed. |
| `client/src/concept2cure/pages/ArtifactsPage.tsx` | **New file.** Artifact browser with tab filters (All/Drafts/In Review/Approved/Submission Ready). Reuse GlobalDocumentSearch API + status badge patterns. | **Low.** New file. |
| `client/src/concept2cure/pages/SetupPage.tsx` | **New file.** Full-page settings. Extract section content from ZenSettings.tsx (Profile, Org, Notifications, Security, Appearance, Integrations, Help). | **Low.** New file. ZenSettings modal stays functional as fallback. |
| `client/src/concept2cure/ZenApp.tsx` lines 2152-2719 | Add render cases for `layoutMode === 'apps'`, `'artifacts-center'`, `'setup'`. Lazy-load new pages. | **Medium.** Adding to large render switch but not modifying existing cases. |

**Validation:** Click Apps → see 3 groups of app cards. Click Artifacts → see artifact browser with filters. Click Setup → see settings sections.

---

### Phase 3: Project Shell — Vault Tab + Overview Enhancement

**Scope:** Create Vault page. Enhance ProjectHomeDashboard for Overview tab.

| File | Action | Risk |
|------|--------|------|
| `client/src/concept2cure/pages/VaultPage.tsx` | **New file.** Compose from ProjectFileTree (file browser) + upload dropzone + search/filter bar. Focus on evidence/files view. | **Low.** New file. |
| `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` (~120 lines) | **Enhance.** Replace 4 old workflow cards with: readiness snapshot, recent artifacts, next recommended actions, "resume where you left off." Use useReadinessScore + useWorkspaceSummary hooks. | **Low.** Small file, clear scope. |
| `client/src/concept2cure/ZenApp.tsx` | Add render case for `layoutMode === 'vault'` pointing to VaultPage. | **Low.** |

**Validation:** Project tab "Vault" shows file browser with upload. "Overview" shows enriched project home with readiness and next actions.

---

### Phase 4: LayoutMode Cleanup

**Scope:** Clean up dead/demoted modes. Simplify DEMOTED_REDIRECTS.

| File | Action | Risk |
|------|--------|------|
| `client/src/concept2cure/ZenApp.tsx` lines 818-855 | Update DEMOTED_REDIRECTS: `'artifacts'` → `'artifacts-center'` (un-demote). `'document-vault'` → `'vault'` (un-demote). Keep all other demoted redirects for backward compat. | **Low-Medium.** Backward compat preserved. |
| `client/src/concept2cure/ZenApp.tsx` lines 345-427 | Comment/document which modes are active vs legacy. Do not remove legacy type values yet (breaks type safety for saved states). | **Low.** |

**Validation:** All existing URLs still work. No 404s or blank screens. `npm run typecheck` passes.

---

### Phase 5: Onboarding Rewrite

**Scope:** Replace FirstRunExperience with value-first 7-step flow.

| File | Action | Risk |
|------|--------|------|
| `client/src/concept2cure/components/enablement/FirstRunExperience.tsx` (582 lines) | **Major rewrite.** New 7 steps: Welcome → Setup → Create Project → Land in Overview → AnA Tour → First Action → Checkpoint. Remove Dr. Sage, auto-advance, agent architecture. Single AnA identity. | **Medium.** Large rewrite but self-contained behind localStorage flag. |
| `client/src/concept2cure/ZenAppWithSession.tsx` | May need adjustment to first-run detection routing. | **Low.** |

**Validation:** New user (clear localStorage) sees welcome → setup → project creation → project overview → AnA guidance → suggested first action → checkpoint. Existing users unaffected.

---

### Phase 6: Spec Update & Polish

**Scope:** Update canonical spec. Clean up PlatformHome. Final validation.

| File | Action | Risk |
|------|--------|------|
| `docs/architecture/CONCEPT2CURE_CANONICAL_UI_IA_AND_SHELL_SPEC.md` | Rewrite to match locked model. | **None.** Documentation. |
| `client/src/concept2cure/components/home/PlatformHome.tsx` (443 lines) | Update 12 module cards to remove dead references. Route quick actions to Apps/Projects/Setup instead of demoted destinations. | **Low.** |

---

## 2. File-Level Work Packages

| Phase | New Files | Modified Files | Total Touches |
|-------|-----------|---------------|---------------|
| 0 | 7 plan docs | 1 spec doc | 8 |
| 1 | 0 | 2 (ZenSidebar, ZenApp) | 2 |
| 2 | 3 (AppsPage, ArtifactsPage, SetupPage) | 1 (ZenApp) | 4 |
| 3 | 1 (VaultPage) | 2 (ProjectHomeDashboard, ZenApp) | 3 |
| 4 | 0 | 1 (ZenApp) | 1 |
| 5 | 0 | 2 (FirstRunExperience, ZenAppWithSession) | 2 |
| 6 | 0 | 2 (spec, PlatformHome) | 2 |

**ZenApp.tsx is touched in Phases 1-4.** Each phase makes targeted, non-overlapping changes to different sections of the file.

---

## 3. Regression Hotspots

| Hotspot | Why | Mitigation |
|---------|-----|------------|
| `ZenApp.tsx` onNavigate handler (line 1861) | Central switch for all navigation. Wrong case = broken nav. | Test every nav item after Phase 1. |
| `ZenApp.tsx` render switch (line 2152) | Adding new cases could conflict with existing conditional rendering. | Add new cases at top of switch, before existing ones. |
| `AnaPersistentPanel` dual render (lines 2618, 2729) | Changing layout modes could leave AnA without render path. | Verify AnA visible on every layout mode after each phase. |
| Phase 4 overlay system in ProjectWorkspaceShell | SubmissionAppsPanel is both a Phase 4 overlay AND will be sourced for AppsPage. Keep overlay functional for in-workspace use. | Don't remove overlay. AppsPage is additive. |
| `localStorage.concept2cure_first_run_complete` | Onboarding rewrite must respect existing flag. | Check flag first. Only show new onboarding to users who haven't completed any onboarding. |

---

## 4. Validation Checklist

- [ ] Sidebar shows exactly 6 global items in collapsed and expanded modes
- [ ] Project tabs (5) appear when project is active, disappear when deselected
- [ ] Projects page renders and lists projects
- [ ] Apps page renders with 3 groups of cards
- [ ] Clicking an app with active project creates artifact or opens workspace
- [ ] Clicking an app without project prompts project selection
- [ ] Artifacts page renders with filters and loads from API
- [ ] Setup page renders all settings sections
- [ ] Vault tab shows file tree with upload for active project
- [ ] Overview tab shows readiness snapshot and next actions
- [ ] Work tab shows ProjectWorkspaceShell (3-pane editor)
- [ ] Review tab shows ReviewReadiness (7-tab surface)
- [ ] Submit tab shows SubmissionReadiness (checklist + export)
- [ ] AnA visible on every screen (global and project)
- [ ] Search overlay opens from sidebar and ⌘K
- [ ] First-time user: welcome → setup → project → overview → tour → action → checkpoint
- [ ] Existing user: lands on Projects or last project, onboarding skipped
- [ ] All demoted layout modes still redirect correctly (no 404s)
- [ ] `npm run typecheck` passes
- [ ] `npm run dev` starts without errors

---

## 5. Recommended First Build Phase

**Phase 1: Sidebar Restructure.** Everything else depends on the sidebar being correct. It's the foundation of the entire navigation model. Two files to touch (ZenSidebar + ZenApp), clear scope, testable immediately.
