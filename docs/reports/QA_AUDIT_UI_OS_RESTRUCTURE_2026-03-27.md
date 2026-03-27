# QA Audit Report: UI OS Master Restructure

**Auditor:** Independent QA (Claude Code)
**Date:** 2026-03-27
**Scope:** Phases 0-3 of the UI OS Master Implementation Plan
**Branch:** `concept2cure-v2`

---

## Scorecard

| # | Section | Score (1-10) | Notes |
|---|---------|:---:|-------|
| 1 | Global Shell (6 items) | **9** | All 6 items present in both collapsed and expanded modes. No extras, no missing items. |
| 2 | Project Shell (5 tabs) | **9** | All 5 tabs render correctly. Appear when project active, hidden when not. |
| 3 | Canonical Object Model | **8** | Naming largely correct. Minor residual: "Documents" in layoutMode references, VaultPage upload button disabled with "coming soon." |
| 4 | Apps Launcher | **9** | All 3 groups implemented. Track-aware sorting. Recommended section. Disabled when no project. |
| 5 | Artifacts Browser | **9** | Tab filters (All/Drafts/In Review/Approved/Submission Ready). Search. Cross-project API fetch. DataStateWrapper used correctly. |
| 6 | Overview Dashboard | **9** | Readiness score ring, pipeline summary (4-status), recent artifacts, quick nav to all project tabs. |
| 7 | Naming Reconciliation | **7** | Sidebar correctly uses "Work" not "Documents." "Submit" not "Submissions." But SetupPage not created (modal redirect). No audit of all downstream labels. |
| 8 | First-Time User Journey | **N/A** | Phase 5 -- not yet implemented. No preparatory work observed. |
| 9 | Implementation Sequencing | **9** | Phases 0-3 followed in correct order. Dependencies respected. ZenApp touched in targeted, non-overlapping sections. |
| 10 | QA Standards | **7** | DataStateWrapper, apiRequest, ARIA labels, focus-visible, data-testid all present. No evidence of typecheck run or E2E validation. |

---

## Overall Grade

**Weighted Average: 8.4 / 10**

Weighting: Sections 1-6 at 15% each (core deliverables = 90%), Section 7 at 5%, Section 9 at 3%, Section 10 at 2%. Section 8 excluded.

| Weight | Section | Score | Weighted |
|--------|---------|-------|----------|
| 15% | Global Shell | 9 | 1.35 |
| 15% | Project Shell | 9 | 1.35 |
| 15% | Canonical Object Model | 8 | 1.20 |
| 15% | Apps Launcher | 9 | 1.35 |
| 15% | Artifacts Browser | 9 | 1.35 |
| 15% | Overview Dashboard | 9 | 1.35 |
| 5% | Naming Reconciliation | 7 | 0.35 |
| 3% | Implementation Sequencing | 9 | 0.27 |
| 2% | QA Standards | 7 | 0.14 |
| **100%** | | | **8.71** |

**Rounded Overall Grade: 8.7 / 10**

---

## Top 5 Strongest Adherences

### 1. Sidebar: Exact 6+5 Structure (Score: 9/10)

The sidebar implements precisely the 6 global items specified in the master plan -- New (with dropdown: Chat, Project, Artifact), Search, Projects, Apps, Artifacts, Setup -- with no extras and no holdovers from the old Workflow group (Dossier, Documents, Review, Biostats, Submissions are all gone). Both collapsed (icon strip) and expanded (full labels) modes match the spec blueprint almost exactly, including the visual separator between global nav and project block.

### 2. Project Tabs: Correct Conditional Rendering (Score: 9/10)

The "Current Project Block" with 5 tabs (Overview, Work, Vault, Review, Submit) appears in the sidebar only when `activeProject` is truthy and disappears cleanly when no project is selected. The submission type badge renders alongside the project name. This matches the master plan's Section 4 exactly. The collapsed mode also shows the 5 project tab icons only when a project is active, with a divider line separating them from global nav.

### 3. Apps Page: Full Spec Compliance (Score: 9/10)

AppsPage implements all 3 groups (Strategy & Evidence: 5 apps; Builders: 7 apps; Specialist Studios: 4 apps) matching the canonical spec exactly. Track-aware sorting via `sortByRelevance()` pushes relevant apps to the top based on the active project's submission type. The "Recommended" section surfaces contextually relevant apps. When no project is active, apps are disabled with a clear amber warning. The app launch handler in ZenApp correctly routes each app to its appropriate destination (deep-research, precedent-intelligence, 510k route, PMA route, CER external, etc.).

### 4. Artifacts Browser: DataStateWrapper + API Integration (Score: 9/10)

ArtifactsPage uses `useQuery` with `apiRequest('GET', '/api/concept2cure/artifacts')` exactly as planned. Tab filters match the spec (All, Drafts, In Review, Approved, Submission Ready). Search filters across title, project name, CTD section, and type. Uses `DataStateWrapper` for loading/error/empty states per the UI State Standards. Tab counts update dynamically. Cross-project browsing is functional.

### 5. Overview Dashboard: All Planned Widgets Present (Score: 9/10)

ProjectHomeDashboard was completely rewritten from the old 4-workflow-card layout. It now shows: (1) a readiness score ring computed from artifact statuses, (2) a pipeline summary with counts per status (Draft/In Review/Approved/Submission Ready), (3) a "Recent Artifacts" list sorted by updatedAt, and (4) quick navigation cards for Work, Vault, Review, Submit. This matches the master plan's Section 6 and Agent 05's specification for the Overview tab.

---

## Top 5 Gaps or Deviations from Plan

### 1. SetupPage Not Created (Deviation from Phase 2)

**Plan said:** Create `SetupPage.tsx` as a full-page destination extracting content from `ZenSettings.tsx` modal. Layout mode `'setup'` should render a real page.

**Actual:** No `SetupPage.tsx` exists. The `setup` layout mode in ZenApp triggers a `RedirectToWorkspace` component that opens the existing `ZenSettings` modal and redirects to `projects`. The sidebar's Setup button calls `onOpenSettings` which opens the modal directly. This means Setup is the only one of the 6 global destinations without a real page. Users clicking "Setup" in the sidebar get a modal overlay, not a calm full-page destination like the other 5.

**Impact:** Medium. Functional but architecturally inconsistent. The plan explicitly listed SetupPage as one of 3 new files in Phase 2.

### 2. VaultPage Upload Button is Disabled ("Coming Soon")

**Plan said:** Vault tab should show "file browser, upload, evidence." Agent 06 validation checklist: "Vault tab shows file tree with upload for active project."

**Actual:** VaultPage has an Upload button that is permanently disabled with `title="File upload coming soon"` and `cursor-not-allowed opacity-60`. The search and browse functionality works, but uploading -- a core Vault action -- is stubbed out.

**Impact:** Medium. Vault is functional as a read-only browser but missing a primary interaction defined in the spec.

### 3. Query Keys Not Registered in queryKeys.ts

**Plan said (UI State Standards):** "Query keys MUST be registered in `queryKeys.ts` -- no ad-hoc string arrays."

**Actual:** ArtifactsPage uses `queryKey: ['global', 'artifacts']`. VaultPage uses `queryKey: ['project', projectId, 'vault-artifacts']`. ProjectHomeDashboard uses `queryKey: ['project', project.id, 'overview-artifacts']`. None of these appear to follow the `queryKeys.domain.method()` pattern mandated by the UI State Standards.

**Impact:** Low-Medium. Functional but violates the codebase's own governance rules and creates maintenance risk with ad-hoc key strings.

### 4. ArtifactsPage Uses Raw `<input>` Instead of `<Input>` Component

**Plan said (Figma Component Contract):** Raw `<input>` is forbidden. Use `<Input>` from the governed component registry.

**Actual:** ArtifactsPage line 134 uses `<input type="text" ... className="...">`. VaultPage line 128 does the same. AppsPage does not have a search input (acceptable). The sidebar's project search (line 966) also uses raw `<input>`.

**Impact:** Low. Functional and styled correctly, but violates the Figma Component Contract which is marked as NON-NEGOTIABLE in CLAUDE.md.

### 5. No Evidence of Typecheck or Automated Validation

**Plan said (Agent 06 Validation Checklist):** "`npm run typecheck` passes" and "`npm run dev` starts without errors."

**Actual:** No evidence in the commit history or project artifacts that `npm run typecheck` was run after implementation. No test files were added for the new pages. No screenshot proof collection. The plan called for explicit validation at each phase boundary.

**Impact:** Low-Medium. The code appears well-typed from manual inspection, but the absence of a verifiable typecheck pass means regressions could exist undetected.

---

## Additional Observations

### Minor Items

1. **"Review" nav ID inconsistency:** The sidebar sends `onNavigate?.('review-tab')` for the Review project tab, but the collapsed mode checks `activeNavId === 'review'`. This could cause the active state highlight to fail on the Review tab in collapsed mode.

2. **ProjectHomeDashboard "next actions" not fully implemented:** The plan specified "next recommended actions" as a distinct section. The current implementation shows quick-nav cards (Work, Vault, Review, Submit) which serve a similar purpose but are static. There is no context-aware recommendation engine feeding "next best actions" to the Overview tab.

3. **No "Switch project" link in project block:** The plan's sidebar blueprint showed a "[Switch project]" link in the Current Project block. The implementation does not include this -- users must scroll to the project list below.

4. **Phase 4 (LayoutMode cleanup) partially done:** The DEMOTED_REDIRECTS mapping has been updated to route `'artifacts'` to `'artifacts-center'` and `'document-vault'` to `'vault'` (un-demoting them as planned). However, no evidence of a broader cleanup of the 60+ LayoutMode values.

5. **Sidebar project search is local only:** The sidebar includes a "Search projects..." input that filters the project list. This is separate from the global Search nav item. The plan called for Search to open a unified overlay (merged CommandPalette + GlobalDocumentSearch). The sidebar search is a useful local filter but is additive to the plan, not a violation.

---

## Verdict: Is This Ready for Phase 4 (Onboarding)?

**Yes, with caveats.**

The core structural work -- sidebar, project shell, Apps, Artifacts, Vault, Overview -- is solid and faithfully follows the approved plan. The navigation architecture is correct. The phased implementation was followed in order. The code quality is good, using the right patterns (DataStateWrapper, apiRequest, lazy loading, ErrorBoundary, ARIA attributes).

**Before proceeding to Phase 5 (Onboarding), the following should be addressed:**

| Priority | Item | Effort |
|----------|------|--------|
| **P1** | Create `SetupPage.tsx` as a real full-page destination (not a modal redirect) | 2-3 hours |
| **P1** | Fix Review tab `activeNavId` mismatch between expanded and collapsed sidebar modes | 30 min |
| **P2** | Enable VaultPage upload functionality (connect to existing upload API) | 2-4 hours |
| **P2** | Register all new query keys in `queryKeys.ts` | 30 min |
| **P3** | Replace raw `<input>` with `<Input>` component in ArtifactsPage, VaultPage, sidebar | 30 min |
| **P3** | Run and verify `npm run typecheck` passes | 15 min |
| **P3** | Add "next recommended actions" to Overview (context-aware, not just static nav cards) | 3-4 hours |

**If P1 items are resolved, the implementation is ready for Phase 5 (Onboarding).** P2 and P3 items can be addressed in parallel or during Phase 6 (Polish).

---

*Report generated: 2026-03-27*
*Files audited: 12 planning documents, 5 implementation files, ZenApp.tsx wiring*
*Auditor: Independent QA via Claude Code*
