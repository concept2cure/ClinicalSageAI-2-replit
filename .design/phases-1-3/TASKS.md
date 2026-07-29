# Build Tasks: Phases 1–3 — Home · MDX · Projects

Generated from: `design-system/HANDOFF.md` + `ui_kits/home/` + `ui_kits/mdx/`
Date: 2026-05-27

Rule: ship each phase completely — every surface, every token, legacy deleted — before the next.
Token surface already wired: `client/src/index.css` → `@import "../../design-system/colors_and_type.css"` ✅

---

## Foundation

- [ ] **T-00 Token verification**: Confirm live DevTools `:root` resolves `--accent-100 = #d97757` and `--bg-000 = #faf9f5`. Fix any scoping bug before any component work. _Prereq for all phases._

---

## Phase 1 · Home screen

Source: `design-system/ui_kits/home/` — `App.jsx` · `data.jsx` · `Icons.jsx` · `Extras.jsx` · `styles.css`
Replaces: `Concept2CureHome.tsx` · `ZenApp.tsx` shell · `AppsPage.tsx` · `IndustryAwareApp.tsx` home state

- [ ] **P1-01 Home data**: Port `ui_kits/home/data.jsx` → replace `components/concept2cure-home/data.tsx`. Copy `NAV_ITEMS` (15, exact order/ids/labels), `NAV_SUB` (sub-drawers per nav), `MODULE_TILES` (12), `RECENT_ACTIVITY`, `DASHBOARD_METRICS`, `SUGGESTIONS` verbatim. _Modifies: `data.tsx`._

- [ ] **P1-02 Icons**: Merge `ui_kits/home/Icons.jsx` icon set into `components/concept2cure-home/icons.tsx`. Add any missing Lucide-derived icons used by the kit. _Modifies: `icons.tsx`._

- [ ] **P1-03 Rail + shell**: Port the fixed icon rail (15 items, 4 tier groups, collapse toggle → `localStorage`, sub-drawer 200ms ease-out height+opacity) and the outermost page shell from `App.jsx`. _Replaces: `Concept2CureHome.tsx` shell section._

- [ ] **P1-04 Main canvas**: Port greeting (good morning/afternoon/evening + firstName), composer + 5 suggestion pills, AnA briefing card, 4-metric dashboard strip, 12-tile module launcher, recent activity feed. All strings verbatim from `data.jsx`. _Replaces: main content section of `Concept2CureHome.tsx`._

- [ ] **P1-05 ⌘K palette**: Port `<CommandPalette>` from `Extras.jsx` — lists all 15 nav items, keyboard nav (↑↓ + Enter + Esc), 120ms ease-out opacity + 4px translateY. _Modifies: `CommandPalette.tsx` (already exists, likely needs rework)._

- [ ] **P1-06 Home styles**: Import `design-system/ui_kits/home/styles.css` directly into the home component (or configure vite to resolve it). Do not copy values — import the file. _New import._

- [ ] **P1-07 Legacy delete**: Remove `ZenApp.tsx`, `AppsPage.tsx`, `IndustryAwareApp.tsx` home-state fork, and industry home dashboards in `components/biologics|medtech|pharma|cro|biotech/` where they rendered the home screen. Remove all feature flags that gate old vs new home. _Deletes 5–10 files._

- [ ] **P1-08 Phase 1 acceptance**: Run every item on the HANDOFF Phase 1 checklist (rail order, collapse persistence, sub-drawer, ⌘K, greeting, copy verbatim, 13px body, orange once, no emoji/exclamation, legacy deleted, no hard-coded hex). _Verification only._

---

## Phase 2 · MDX workstream

Source: `design-system/ui_kits/mdx/` — `shell.jsx` · `app.jsx` · `surfaces/*.jsx` · `data/` · `styles.css` · `surfaces.css`
Replaces: legacy `*510kPage*` / `*PMAPage*` / `*CERPage*` routes; `components/medtech/**` home surfaces

- [ ] **P2-01 MDX shell**: Port 3-column shell (rail 260/56px · main · AnA dock 380/44px, TopBar 48px, TabBar 44px, tab+rail sync on `activeNav`) from `shell.jsx`. Both rail and dock collapse independently; states persisted in `localStorage`. _Modifies: `mdx/shell/` (existing shell likely needs rework)._

- [ ] **P2-02 MDX nav data**: Port `MDX_NAV_ITEMS` (11 items, 3 groups), `MDX_PROGRAMS`, `MDX_HEALTH`, `MDX_SUGGESTIONS` (keyed by activeNav) from kit `data/` files verbatim. _Modifies: `mdx/data/`._

- [ ] **P2-03 Overview surface**: Port `Overview.jsx` — 4 health cards + program grid/list (grid ≤12, list >12), Grid/List toggle persisted as `mdx.viewMode`, pathway + status filter chips with live counts, list-row spec (6 cols, `2.4fr 0.9fr 1.6fr 2fr 0.8fr 1fr`). Row/card click pins program + routes to pathway. _Replaces: `mdx/surfaces/Overview.tsx`._

- [ ] **P2-04 510(k) surface**: Port 7-stage strip (idle/active/blocked/complete states), predicate table with checkbox multi-select driving single vs multi-column SE matrix, eSTAR 20-section checklist with `blocker` row style. Wire `useTransition` to stage-advance actions; `useResolve` to blocker resolution; `useAcceptAi` to eSTAR AnA-draft acceptance rows. _Replaces: `mdx/surfaces/K510Surface.tsx`._

- [ ] **P2-05 PMA surface**: Port 10-phase grid (`grid-template-columns: repeat(10, 1fr)`), 4 trial metrics, 6 module cards (3-col). Wire `useTransition` to phase-advance. _Replaces: `mdx/surfaces/PmaSurface.tsx`._

- [ ] **P2-06 CER surface**: Port signal table (FAERS/MAUDE/Literature/Eudamed, severity serious/non-serious, inclusion status), literature-by-year bar chart, CER section checklist, AnA generation plan panel. Wire `useAcceptAi` to section acceptance. _Replaces: `mdx/surfaces/CerSurface.tsx`._

- [ ] **P2-07 Precedent Intelligence surface**: Port saved-queries list + cross-agency pattern summary from `PrecedentSurface.jsx`. _Replaces: `mdx/surfaces/PrecedentSurface.tsx`._

- [ ] **P2-08 AnA dock**: Port context block (pinned program), contextual suggestions (swapped on `activeNav` change), recent activity, composer. First-visit force-expand once (`mdx.visited` key). When collapsed + blocked program exists, add `ana-pulse` keyframe class to sparkle icon. _Modifies: AnA dock in shell._

- [ ] **P2-09 Stub surfaces**: Port `InDesignSurface` component (icon + phase chip + title + one-line description, centered, no CTAs) and apply to `engineering`, `udi`, `postmarket` nav items using `MDX_STUBS` data. _Modifies: `mdx/surfaces/InDesignSurface.tsx`._

- [ ] **P2-10 MDX styles**: Import `design-system/ui_kits/mdx/styles.css` and `surfaces.css` into the MDX app. _New import._

- [ ] **P2-11 e-signature hook wiring**: Replace the direct `EsignModal` open call in eSTAR sign rows with `useSign({ target: 'section:...', reason, reauth: { password, totp } })`. The modal collects credentials and passes them to the trigger; no credentials stored after the call. _Modifies: relevant surface + `EsignModal.tsx`._

- [ ] **P2-12 Legacy delete**: Delete legacy `*510kPage*`, `*PMAPage*`, `*CERPage*` routes and any `components/medtech/**` surfaces that rendered these pathways. Remove feature flags. _Deletes._

- [ ] **P2-13 Phase 2 acceptance**: Run HANDOFF Phase 2 checklist (rail 11 items, tab+rail sync, program card click, stage strip states, predicate multi-select, SE matrix switch, eSTAR blocker row, PMA 10-col grid, CER severity chips, AnA dock suggestions swap per surface, collapse persistence, ✻ sparkle only emoji, no exclamation, legacy deleted). _Verification._

---

## Phase 3 · Projects (list + detail)

Source: `design-system/ui_kits/home/Projects.jsx` · `ProjectsExtras.jsx` · `styles.css`
Replaces: `ZenApp.tsx` project routes · `IndustryAwareApp.tsx` document-chat fork · per-industry project dashboards

### Data & foundation

- [ ] **P3-01 Project data shapes**: Port `PR_PROJECTS` shape, `PLF_SAVED_VIEWS` (4 defaults), `PHASE_PRESETS` (510K/IND/NDA/CER), `NPD_REGIONS`, `NPD_TYPES`, `NPD_PREVIEWS`, `PCP_AGENCIES` (6 canonical: FDA/EMA/MHRA/HC/PMDA/Swissmedic), `PCP_STATUSES` (5: draft/active/in_review/submitted/archived) verbatim from `Projects.jsx`. Apply Phase 3 audit fixes: drop `planning` status, unify agencies on wizard's 6-code list, drop `capacityPct`. _Modifies: `components/concept2cure-projects/data/`._

### List view

- [ ] **P3-02 ProjectsList header + filter rail**: Port header (title + count + "New project" CTA + view toggle + bell with unread dot + ⌘K hint) and `<ProjectsListFilters>` (2-row chip rail: saved views + search + 5 multi-select dropdowns with count badges + Clear-all). _Modifies: `ProjectsList.tsx` + `ProjectsListFilters.tsx`._

- [ ] **P3-03 ProjectsList rows + bulk bar**: Port `.prj-list-row` (checkbox · star · name · desc · type pill · phase progress bar · last activity · ⋯ menu). Port `<ProjectsListBulkBar>` (appears ≥1 checked: count + Archive/Export/Transfer/Delete). Wire row checkbox to bulk-bar visibility. _Modifies: `ProjectsList.tsx` + `ProjectsListBulkBar.tsx`._

- [ ] **P3-04 Empty states**: Port `<ProjectsListEmpty>` — zero-projects variant (illustration + 4 onboarding suggestions: Setup/Import/Template/Demo) + zero-results variant (clear-filters CTA). _Modifies: `ProjectsListEmpty.tsx`._

### Detail view

- [ ] **P3-05 ProjectDetail header + tabs**: Port detail header (back · star · editable name · type/agency/status pills · gear · ⋯ menu) and 7-tab strip (Chats · Memory · Instructions · Files · Timeline · Activity · Linked) in correct order. _Modifies: `ProjectDetail.tsx`._

- [ ] **P3-06 Memory + Instructions tabs**: Port `<ProjectMemoryScreen>` (toggle, summary, learnings by category) and `<ProjectInstructionsScreen>` (5000-char mono editor, char counter, active toggle persisted, template picker from `PINSTR_TEMPLATES`). Config panel General tab instructions field is **read-only** linking to the Instructions tab — fix the dual-writer audit item. _Modifies: `tabs/MemoryTab.tsx` + `tabs/InstructionsTab.tsx`._

- [ ] **P3-07 Files tab**: Port `<ProjectFilesScreen>` (table: name · author · when · size · lines, filter chips, sort, group-by, drag-drop affordance, capacity bar). _Modifies: `tabs/FilesTab.tsx`._

- [ ] **P3-08 Timeline tab**: Port `<ProjectTimeline>` — auto-select `PHASE_PRESETS` preset by `project.type`, status dots (idle/active/blocked/complete), connector line, in-progress phase accent ring + bar + %, `daysToTarget` derived as `differenceInCalendarDays(targetDate, today)` (negative = overdue in `--text-warn`). _Modifies: `ProjectTimeline.tsx`._

- [ ] **P3-09 Activity tab (21 CFR Part 11)**: Port `<ProjectActivityScreen>` — day-grouped rows, kind chips (Export/File/Memory/Instructions/E-sig/Comment/Lifecycle/Access), each row: time · kind · actor+role+verb+target · IP + e-sig pill + signature hash. "Tamper-evident · SHA-256" integrity badge in head. _Modifies: `tabs/ActivityTab.tsx`._

- [ ] **P3-10 Linked tab**: Port `<ProjectLinkedScreen>` — relationship graph + grouped list (Predicate device / Parent IND / Child NDA / Cross-reference / Supplier). Directional arrows in/out, type pill, status pill, open/unlink actions. _Modifies: `tabs/LinkedTab.tsx`._

### Config panel

- [ ] **P3-11 ProjectConfigPanel**: Port 5-tab config sheet (440px, right, Esc + close dismiss, click-outside does NOT dismiss). Add `onSave(form)` prop wired to PATCH. Dirty-state confirm on Esc/close when unsaved. Fix: General tab instructions is read-only. Compliance tab shows audit-trail + e-sig counts + integrity pills + regulatory lead. Settings danger zone uses type-to-confirm. Members tab disables remove on last Owner. _Modifies: `panels/ProjectConfigPanel.tsx`._

### Overlays & dialogs

- [ ] **P3-12 NewProjectDialog**: Port 3-step wizard (region → application type → confirm) from `Projects.jsx`. Use `NPD_REGIONS`, `NPD_TYPES`, `NPD_PREVIEWS`. On create: call `POST /api/projects` → use server-returned ID (not `Date.now()`), set `status: 'draft'`. _Modifies: `modals/NewProjectDialog.tsx`._

- [ ] **P3-13 ProjectMoreMenu**: Port ⋯ dropdown (Duplicate · Duplicate as template · Export ZIP · Export eCTD · Transfer · Archive · Delete danger). Click-outside dismiss. Wire each item to its server mutation stub; Archive/Delete open `<ProjectArchiveModal>`. _Modifies: `ProjectMoreMenu.tsx`._

- [ ] **P3-14 Archive/restore/delete modal**: Port `<ProjectArchiveModal>` 3 modes. Delete mode disables confirm until typed text matches project name exactly. _Modifies: `modals/ProjectArchiveModal.tsx`._

- [ ] **P3-15 ⌘K quick switcher**: Port `<ProjectQuickSwitcher>` — fuzzy filter, type pill, last-activity meta, ↑↓ + Enter, "Create new project" footer CTA. _Modifies: `modals/ProjectQuickSwitcher.tsx`._

- [ ] **P3-16 Notifications sheet**: Port `<ProjectNotifications>` right sheet — All/Unread tabs (count badge), 5 categories, each row: icon · title · sub · when · project link. Mark-all-read. _Modifies: `modals/ProjectNotifications.tsx`._

- [ ] **P3-17 Internal search overlay**: Port `<ProjectInternalSearch>` — scoped to project, searches Memory + Instructions + Files + Chats, group headers, kind pills, ↑↓ + Enter to jump. _Modifies: `modals/ProjectInternalSearch.tsx`._

### Governed-action wiring

- [ ] **P3-18 Claim / transition wiring**: Wire `useClaim` to "claim this project" action in detail header ⋯ menu. Wire `useTransition` to status-pill click (status change dropdown). Pass `target: 'program:<projectId>'` and a user-provided reason. _Modifies: `ProjectDetail.tsx`._

- [ ] **P3-19 Resolve + sign wiring**: Wire `useResolve` to blockers surfaced in the Timeline tab (resolve a blocked phase). Wire `useSign` to the e-signature row in the Compliance tab of `ProjectConfigPanel` — credentials flow through `<EsignModal>`. _Modifies: `ProjectTimeline.tsx` + `panels/ProjectConfigPanel.tsx`._

- [ ] **P3-20 Lock wiring**: Wire `useLock` to the "Lock project" action in the Settings tab danger zone (lock = read-only, no mutations). Requires re-auth via `EsignModal`. _Modifies: `panels/ProjectConfigPanel.tsx`._

### Projects styles + cleanup

- [ ] **P3-21 Projects styles**: The home `styles.css` already covers `.prj-` / `.pmem-` / `.pinstr-` / `.pfiles-` / `.ptl-` / `.pcp-` / `.pact-` / `.plnk-` / `.parch-` / `.plf-` / `.plb-` / `.ple-` / `.pqs-` / `.pnot-` / `.pis-` / `.pmm-` prefixes. Ensure this file is imported in the Projects component tree (if not already loaded via home). _Import only._

- [ ] **P3-22 Legacy delete**: Remove `ZenApp.tsx` project-scoped routes, `IndustryAwareApp.tsx` document-chat fork, per-industry project dashboards in `components/biologics|medtech|pharma|cro|biotech/` where they rendered the project workspace. Remove feature flags. _Deletes._

- [ ] **P3-23 Phase 3 acceptance**: Run HANDOFF Phase 3 checklist (token surface, 7 tabs in order, timeline preset, activity log, linked arrows, config panel 5 tabs, ⌘K switcher, bell sheet, archive delete-confirm, legacy deleted, sentence case, no emoji, 200ms ease-out, Lucide only). _Verification._

---

## Summary counts

| Phase | Tasks | New files | Modified | Deletes |
|-------|-------|-----------|----------|---------|
| Foundation | 1 | 0 | 0 | 0 |
| Phase 1 · Home | 8 | 0 | 5 | 5–10 |
| Phase 2 · MDX | 13 | 1 | 10 | 5–8 |
| Phase 3 · Projects | 23 | 0 | 18 | 5–8 |
| **Total** | **45** | **1** | **33** | **15–26** |
