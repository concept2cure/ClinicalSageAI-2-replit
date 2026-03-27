# Concept2Cure UI OS Restructure — Phase 1-3 Detailed Report

**Date:** 2026-03-27
**Branch:** `concept2cure-v2`
**Commits:** 12 commits from `f1dff33a` to `229ebcf9`
**Files changed:** 31 files, +5,488 / -595 lines

---

## Executive Summary

Phases 1-3 transformed Concept2Cure from a module-sprawl sidebar with 11+ competing nav items into a calm, 6-item global shell with 5 project tabs, a track-aware apps launcher, a real artifacts browser, and a functioning project overview dashboard. No backend changes were required. All APIs already existed.

---

## Phase 0: Planning Sprint

### Commits
- `f1dff33a` — 7 plan documents + revised canonical spec

### Deliverables
| File | Purpose |
|------|---------|
| `docs/plans/agent-01-repo-truth-audit.md` | Audited 20+ files: what exists, duplicated, mislabeled |
| `docs/plans/agent-02-shell-and-navigation.md` | Designed 6-item global rail + 5 project tabs |
| `docs/plans/agent-03-object-model-and-naming.md` | Reconciled Artifacts/Documents/Files/Vault/DMS |
| `docs/plans/agent-04-first-time-user-journey.md` | Designed 7-step onboarding flow |
| `docs/plans/agent-05-apps-and-swimlanes.md` | Mapped 16 apps into 3 groups + 7 role swim lanes |
| `docs/plans/agent-06-implementation-sequencing.md` | 6-phase plan with file targets and risk |
| `docs/plans/UI_OS_MASTER_IMPLEMENTATION_PLAN_2026-03-26.md` | Synthesized master plan (14 sections) |
| `docs/architecture/CONCEPT2CURE_CANONICAL_UI_IA_AND_SHELL_SPEC.md` | Revised spec: v1 (8-item global) → v2 (6-item global) |

### Key Decisions Made
- Global rail locked: New, Search, Projects, Apps, Artifacts, Setup
- Project tabs locked: Overview, Work, Vault, Review, Submit
- "Documents" removed as global destination → lives inside Work
- "Reports" removed as global destination → redistributed to Overview/Review/Submit
- "Submissions" → "Submit" in project context
- AnA = single AI identity (Dr. Sage removed from onboarding plan)
- Apps = real global destination with 3 groups

---

## Phase 1: Sidebar Restructure

### Commits
- `afad3292` — Initial sidebar restructure
- `d76ee886` — Hardening: real pages replacing placeholders

### Files Changed

**`client/src/concept2cure/components/sidebar/ZenSidebar.tsx`** (786 lines, major rewrite)

Before:
```
Collapsed: Logo, New chat, Projects, [separator], Dossier, Documents, Review, Submissions, Settings
Expanded: Brand, New chat, Search, [Pinned], [Recent], [General], Workflow group (Dossier Map, Documents, Vault, Review, Reports, Biostats, Submissions)
```

After:
```
Collapsed: Logo, [+New], Search, Projects, Apps, Artifacts, Setup, [separator], Overview, Work, Vault, Review, Submit (if project active), [Account]
Expanded: Brand, NewDropdown, Search/Projects/Apps/Artifacts/Setup, [separator], Current Project Block (name + badge + 5 tabs), [separator], Pinned/Recent projects, Account
```

Changes made:
- Removed entire "Global Operating Nav" / "Workflow" group (Dossier Map, Documents, Review, Biostats, Submissions)
- Added 6 global nav items with correct icons and nav IDs
- Added NewDropdown component (Plus → dropdown: New Chat, New Project, New Artifact)
- Added Current Project Block with 5 project tabs (only visible when project active)
- Added IconBtn reusable component for collapsed mode
- Preserved: ProjectRow, ConvoRow, WorkspaceGroup, submission badges, status dots, search, mobile backdrop, account footer

**`client/src/concept2cure/ZenApp.tsx`** (2700+ lines, surgical edits)

Changes at 5 locations:
1. **LayoutMode type** (~line 351): Added `'apps'`, `'artifacts-center'`, `'setup'`, `'vault'`
2. **PRIMARY_NAV_ID_BY_LAYOUT** (~line 448): Added mappings for all new layout modes + editor/regulatory-workspace
3. **SIDEBAR_NAV_TO_LAYOUT** (~line 3095): Added mappings: overview→project-home, work→documents, vault→vault, review-tab→review, submit→submissions
4. **onNavigate handler** (~line 2020): Added cases for new nav IDs
5. **DEMOTED_REDIRECTS** (~line 904): Added vault-workspace→vault, document-vault→vault

**New pages created:**

| File | Lines | What it does |
|------|-------|-------------|
| `client/src/concept2cure/pages/AppsPage.tsx` | 268 | 16 app cards in 3 groups, track-aware sorting, recommendations |
| `client/src/concept2cure/pages/ArtifactsPage.tsx` | 196 | Cross-project artifact browser with 5 tab filters, search, API fetch |
| `client/src/concept2cure/pages/VaultPage.tsx` | 194 | Project-scoped file browser grouped by 10 virtual folders |

### QA (Phase 1 Hardening)
- Replaced all 4 placeholder pages (Apps, Artifacts, Setup, Vault) with real components
- Setup nav item → opens ZenSettings modal directly (no dead page)
- NewDropdown: click-outside handler, Escape key, ARIA menu semantics
- Avatar initial safe on empty string
- Search input has aria-label

---

## Phase 2: Overview Dashboard + Naming Reconciliation

### Commits
- `2c53cea9` — Overview dashboard + naming fixes
- `b6d220bb` — QA hardening (24 issues)
- `29339387` — Cross-phase audit (18 issues)
- `a7e1b0fe` — Final audit pass (avatar, a11y, nav mapping)

### A) Overview Tab Restored

**Critical finding:** `ProjectHomeDashboard` had been removed from the render path (line 2610: "ProjectHomeDashboard removed — AnA handles everything via chat"). The Overview tab showed only full-screen AnA chat.

**Fix:** Restored `ProjectHomeDashboard` renderer for `layoutMode === 'project-home'`. Changed AnA from `mode="full"` to `mode="compact"` on project-home.

**`client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx`** (286 lines, full rewrite)

Before: 4 static workflow cards (Dossier Map, Documents, Review, Submissions)

After:
- **Readiness score ring** — SVG donut chart showing % of artifacts approved/locked
- **Artifact pipeline grid** — 4 status cards (Draft, In Review, Approved, Submission Ready) with counts and loading skeletons
- **Recent artifacts list** — Last 5 artifacts with status badges, CTD section, click to Work
- **Quick navigation cards** — 4 cards: Work, Vault, Review, Submit (monochrome, consistent styling)
- **Error handling** — isError state with user-visible message
- **Loading states** — Skeleton pulse for pipeline counts and recent list
- **Accessibility** — aria-labels on all buttons, focus-visible rings, title tooltips on truncated text
- **Data source** — `GET /api/concept2cure/projects/:id/artifacts`, safe response parsing

### B) Naming Reconciliation

**`client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`** (8 changes)

| Line | Before | After |
|------|--------|-------|
| 152 | `'Generated Documents'` | `'Generated'` |
| 172 | `'Vault Layer'` | `'Evidence'` |
| 178 | `'Reports Layer'` | `'Readiness'` |
| 217 | `{ label: 'Documents' }` | `{ label: 'Work' }` |
| 219 | `{ label: 'Reports' }` | `{ label: 'Readiness' }` |
| 1278 | `'Documents'` button | `'Work'` |
| 1658 | `'Reports'` tab | `'Readiness'` |
| 2071 | `'Recent Governed Documents'` | `'Recent Artifacts'` |
| 2623 | `'Documents'` metric | `'Artifacts'` |

**`client/src/concept2cure/pages/ReviewReadiness.tsx`** (1 change)
- `'Documents' / 'Approved Documents'` → `'Artifacts' / 'Approved Artifacts'`

### C) QA Audit Results (3 passes)

| Pass | Agents | Issues Found | Fixed |
|------|--------|-------------|-------|
| Phase 2 QA | 3 parallel | 24 | 24 |
| Cross-phase audit | 3 parallel | 34 | 18 |
| Final deep audit | 1 | 13 | 3 |
| **Total** | **7** | **71** | **45** |

Key fixes:
- DataStateWrapper `emptyIcon` prop doesn't exist → replaced with `emptyTitle`/`emptyDescription`
- Upload button non-functional → disabled with tooltip
- VaultPage DataStateWrapper receiving raw data instead of filtered → fixed
- Status badge colors inconsistent across surfaces → unified
- Tab counts inconsistent for undefined status → normalized with `|| 'draft'` fallback
- Pipeline counts showing 0 during loading → skeleton placeholders
- `PageTitleHeader` `icon` prop doesn't exist → removed

---

## Phase 3: Track-Aware Apps Launcher

### Commits
- `11ef0da9` — Track-aware apps with recommendations
- `3b00bf37` — UX scrub (breathing room, disabled state, badge)
- `229ebcf9` — Critical color bug fix, disabled interaction, null leak

### `client/src/concept2cure/pages/AppsPage.tsx` (268 lines, major enhancement)

Features added:
- **Track definitions**: `PHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA']`, `DEVICE_TYPES = ['510K', 'PMA', 'DE_NOVO', 'EUA', 'IVDR']` — aligned with canonical SUBMISSION_BADGE
- **App track assignments**: Each of 16 apps declares `tracks[]` — which submission types it's most relevant for
- **Recommended section**: Top 6 matching apps shown with blue highlight + "Best match" badge when project has a submission type
- **Track-aware sorting**: Within each group, matching apps float to top (stable sort with original-order tiebreaker)
- **Track label**: Subtitle shows "Pharma & Biotech" or "Device & Diagnostics" based on submission type
- **Disabled state**: Apps greyed out with `grayscale opacity-60 pointer-events-none` when no project active, with title tooltip
- **Explicit handlers**: ZenApp switch has cases for all 16 app IDs (cmc/clinical/device explicitly handled instead of silent fallthrough)

### QA (Phase 3 Scrub — 3 agents)

| Agent | Focus | Issues Found | Fixed |
|-------|-------|-------------|-------|
| Code quality | Logic, types, dead code | 14 | 9 |
| Navigation wiring | All 16 app ID handlers | 5 | 5 |
| Aesthetics | Visual calm, spacing, badges | 5 | 5 |

Critical bug caught: Color string split was backwards (`colors[0]` is text color class but was assigned to `iconBg`). Would have broken every app card's icon styling.

---

## Total Statistics

### Files Created (new)
| File | Lines | Phase |
|------|-------|-------|
| `docs/plans/agent-01-repo-truth-audit.md` | 149 | 0 |
| `docs/plans/agent-02-shell-and-navigation.md` | 199 | 0 |
| `docs/plans/agent-03-object-model-and-naming.md` | 135 | 0 |
| `docs/plans/agent-04-first-time-user-journey.md` | 204 | 0 |
| `docs/plans/agent-05-apps-and-swimlanes.md` | 193 | 0 |
| `docs/plans/agent-06-implementation-sequencing.md` | 160 | 0 |
| `docs/plans/UI_OS_MASTER_IMPLEMENTATION_PLAN_2026-03-26.md` | 428 | 0 |
| `client/src/concept2cure/pages/AppsPage.tsx` | 268 | 1+3 |
| `client/src/concept2cure/pages/ArtifactsPage.tsx` | 196 | 1 |
| `client/src/concept2cure/pages/VaultPage.tsx` | 194 | 1 |

### Files Modified
| File | Phase | Nature |
|------|-------|--------|
| `ZenSidebar.tsx` | 1 | Major rewrite (sidebar nav) |
| `ZenApp.tsx` | 1+2+3 | Surgical edits (types, renderers, nav, AnA mode) |
| `ProjectHomeDashboard.tsx` | 2 | Full rewrite (overview dashboard) |
| `ProjectWorkspaceShell.tsx` | 2 | 8 naming fixes |
| `ReviewReadiness.tsx` | 2 | 1 naming fix |
| `CONCEPT2CURE_CANONICAL_UI_IA_AND_SHELL_SPEC.md` | 0 | Full revision (v1→v2) |

### QA Coverage
- **12 audit agents** deployed across all phases
- **71 total issues** identified
- **45 issues fixed** (all critical, high, and medium)
- **26 remaining** (low severity: unused props, cosmetic, documentation)
- TypeScript compiles clean after every commit
- All interactive elements have focus-visible rings and aria-labels

---

## What's Not Done Yet (Per Master Plan)

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 0 | Plans + spec | **Complete** |
| Phase 1 | Sidebar restructure | **Complete + hardened** |
| Phase 2 | Overview + naming | **Complete + hardened** |
| Phase 3 | Apps + tracks | **Complete + hardened** |
| Phase 4 | Onboarding rewrite | **Not started** |
| Phase 5 | LayoutMode cleanup (legacy modes) | **Partial** — new modes added, old modes preserved |
| Phase 6 | Polish + PlatformHome cleanup | **Not started** |

---

## Current Navigation State

### Global Rail (6 items) ✅
```
New → dropdown (Chat / Project / Artifact)
Search → command palette overlay
Projects → project list (ProjectSwitcher)
Apps → real page (16 apps, 3 groups, track-aware, recommendations)
Artifacts → real page (cross-project browser, 5 tab filters, search, API)
Setup → opens ZenSettings modal
```

### Project Tabs (5 tabs, visible when project active) ✅
```
Overview → ProjectHomeDashboard (readiness ring, pipeline, recent, quick nav)
Work → ProjectWorkspaceShell (3-pane editor, governed artifacts)
Vault → VaultPage (file tree by folder, search, disabled upload)
Review → ReviewReadiness (7-tab quality/compliance surface)
Submit → SubmissionReadiness (section checklist + export)
```

### AnA Persistent ✅
- Compact mode on Overview, Vault, Review, Submit, Apps, Artifacts
- Full mode on Projects (project list), Deep Research
- Full mode in Work (regulatory-workspace) as inline chat
