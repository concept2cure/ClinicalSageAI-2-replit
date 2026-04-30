# PHASE 2 · MDX — Claude Code Implementation Handoff

**Date:** 2026-04-29
**Audience:** Claude Code, running inside the `concept2cure-v2` repo
**Source of truth:** the unzipped design-system folder you (the human operator) just dropped into the v2 repo
**Goal:** mirror every Phase 2 (MDX workstream) UI surface from this design system into the v2 codebase, wire the canonical tokens, and delete the legacy MDX UI it replaces

---

## 0 · What just happened (context for Claude Code)

The human operator did this, today:

1. Opened the canonical Concept2Cure design-system project.
2. Hit **Share → Download as ZIP**.
3. Unzipped it on their laptop into a folder named with today's date.
4. Copied/loaded that folder into the `concept2cure-v2` git working tree under a new dated folder, e.g.:

   ```
   concept2cure-v2/
   └── design-system-2026-04-29/
       ├── CLAUDE.md
       ├── HANDOFF.md
       ├── README.md
       ├── SKILL.md
       ├── colors_and_type.css
       ├── preview/
       └── ui_kits/
           ├── home/
           ├── mdx/         ← the focus of this handoff
           ├── ana_ri/
           └── ectd_coauthor/
   ```

This dated folder is **read-only by convention.** You read from it, you do not write to it. When the designer ships a new revision, the human will drop a new dated folder next to this one (e.g. `design-system-2026-05-12/`); at that point the project's `CLAUDE.md` will be updated to point `design-system/` (a symlink or a copy) at the latest dated folder. Until that swap happens, **this is the single source of truth.**

> **First thing you do every session:** confirm which dated folder is current. Look for a `design-system/` symlink at the repo root. If there isn't one, ask the human which dated folder to read from. Do not guess.

For the rest of this document I will write `<DS>/` to mean "the current design-system folder" — substitute the actual dated path.

---

## 1 · Read order (do not skip — this is the regression you ship if you do)

Open these files, in this order, before you write a single line of v2 code:

```
1. <DS>/CLAUDE.md                        ← non-negotiables, token-import warning, phase routing
2. <DS>/HANDOFF.md                       ← phase status, surface contracts (master document)
3. <DS>/README.md                        ← voice, tone, visual foundations, iconography rules
4. <DS>/colors_and_type.css              ← canonical token surface (you will import this directly)
5. <DS>/ui_kits/mdx/index.html           ← script-load order; this is your component graph
6. <DS>/ui_kits/mdx/data.jsx             ← MDX_NAV_V2, MDX_PROGRAMS, MDX_SUGGESTIONS, etc.
7. <DS>/ui_kits/mdx/data-workbench.jsx   ← TASKS, VAULT_*, VALIDATION_*, SUBMISSIONS, TEMPLATES
8. <DS>/ui_kits/mdx/data-presub.jsx      ← Q-Sub data (Pre-Sub manager)
9. <DS>/ui_kits/mdx/data-validator.jsx   ← per-section eSTAR rule detail
10. <DS>/ui_kits/mdx/data-editors.jsx    ← PMA + CER editor data shapes
11. <DS>/ui_kits/mdx/Icons.jsx           ← Lucide-derived icon set used by every surface
12. <DS>/ui_kits/mdx/Shell.jsx           ← 3-column shell (rail + main + AnA dock)
13. <DS>/ui_kits/mdx/Surfaces.jsx        ← Overview · 510(k) · PMA · CER (entry) · Precedent
14. <DS>/ui_kits/mdx/CerWorkbench.jsx    ← CER 7 sub-tabs (Overview, Equivalence, GSPR, Lit, Signals, PMS, Generator)
15. <DS>/ui_kits/mdx/Workbench.jsx       ← Tasks, Vault, Validation Center, Submissions, Templates, Analytics
16. <DS>/ui_kits/mdx/PreSub.jsx          ← Pre-Sub / Q-Sub manager
17. <DS>/ui_kits/mdx/EstarEditor.jsx     ← 510(k) section editor (3-pane Cursor-style)
18. <DS>/ui_kits/mdx/DocumentEditor.jsx  ← shared 3-pane editor primitive used by PMA + CER editors
19. <DS>/ui_kits/mdx/EditorSurfaces.jsx  ← PMA editor + CER editor (composed from DocumentEditor)
20. <DS>/ui_kits/mdx/ProjectHome.jsx     ← per-program home (the "live dossier" entry surface)
21. <DS>/ui_kits/mdx/App.jsx             ← root component; wires nav state, dossier routing, AnA
22. <DS>/ui_kits/mdx/app.css             ← every MDX style. Class-name prefixed; safe to import 1:1
```

Reading these is not optional. Every selector, every state machine, every prop name in your v2 port has to match. The `data-*` files in particular carry shape contracts that the API layer will eventually back — get the shapes right on day one or you pay for it on day thirty.

---

## 2 · What "Phase 2 MDX" ships

The MDX workstream is the 510(k) / PMA / CER / Pre-Sub regulatory operating system. From the v2 home rail, the user clicks the **MDX** rail item and lands on `ui_kits/mdx/index.html`'s top surface.

### 2.1 Shell (always rendered)

**Three-column layout** — see `Shell.jsx`:

| Column        | Width (open / collapsed)  | Owner                     |
| ------------- | ------------------------- | ------------------------- |
| Left rail     | 260px / 56px              | `Shell.jsx > <MDXRail/>`  |
| Main          | flex 1                    | `App.jsx > <Surface/>`    |
| AnA dock      | 380px / 44px              | `Shell.jsx > <AnaDock/>`  |

Above main: a 48px **TopBar** (breadcrumbs + global search + filter / bell / help) and a 44px **TabBar** (5 primary surface tabs with live counts). Both rail + tabs share `activeNav` state.

**Rail groups** (data: `MDX_NAV_V2` in `data.jsx`):
- *Workstream* — Overview, 510(k) Submissions, PMA Submissions, CER Generator, Precedent Intelligence
- *Workbench* — Tasks and Reviews, Document Vault, Validation Center, Pre-Sub Manager, Submission Center, Templates
- *Intelligence* — Analytics, Claude Memory
- *System* — Admin and Access

### 2.2 The five primary surfaces (shown in `<TabBar/>`, owned by `Surfaces.jsx`)

| Tab          | Source file        | What it renders |
| ------------ | ------------------ | --------------- |
| Overview     | `Surfaces.jsx`     | Portfolio health (4 KPIs) + Programs grid/list with view-mode toggle, pathway + status filter chips |
| 510(k)       | `Surfaces.jsx`     | 7-stage strip · predicate search w/ multi-select · SE matrix (single + multi-predicate) · eSTAR 20-section checklist |
| PMA          | `Surfaces.jsx`     | 10-phase grid · 4 trial KPIs · 6 module cards (3-col) |
| CER          | `Surfaces.jsx` → delegates to `CerWorkbench.jsx` | 7 sub-tabs (see 2.3) |
| Precedent    | `Surfaces.jsx`     | Saved queries + cross-agency precedent patterns |

### 2.3 CER sub-tabs (`CerWorkbench.jsx`)

| Sub-tab     | Data                                        |
| ----------- | ------------------------------------------- |
| Overview    | `CER_SIGNALS`, `CER_LITERATURE`, `CER_EXPORT` (export plan) |
| Equivalence | `CER_EQUIV_DEVICES`, `CER_EQUIV_MATRIX`     |
| GSPR        | `CER_GSPR` (Annex I conformity table)       |
| Literature  | `CER_LITERATURE` + per-year search corpus   |
| Signals     | `CER_SIGNALS` (FAERS / MAUDE / Lit / Eudamed) |
| PMS         | `CER_PMS_KPIS`, `CER_PMS_COMPLAINTS`, `CER_PMCF_STUDIES`, `CER_PMS_TIMELINE` |
| Generator   | Section checklist + "Generate CER" workflow |

### 2.4 Workbench surfaces (`Workbench.jsx`)

| Surface             | What it does                                          | Drawer / detail it opens                       |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Tasks and Reviews   | Kanban + list, by owner, with metrics                 | inline edit                                    |
| Document Vault      | Folders × file table · version history side rail      | file detail w/ version timeline                |
| Validation Center   | Portfolio matrix + rule list                          | **`<ValidatorDrawer/>`** — per-section eSTAR detail with current/expected, evidence trail, fix-path actions |
| Submission Center   | Pipeline strip · submissions list                     | gate status + cover letter + e-sig + ESG receipt |
| Templates           | Index of reusable doc templates                       | template detail                                |
| Analytics           | Time-series + cohort charts                           | drilldown                                      |

### 2.5 Pre-Sub Manager (`PreSub.jsx`)

Q-Sub manager: pipeline (Plan → Submit → Meeting → Minutes → Commitments) · Q-Sub list · detail panel with question authoring, FDA response matching, commitment tracking.

### 2.6 Editors (the "live dossier")

Three editors, all sharing the **3-pane Cursor-style workbench** primitive:

| Editor          | File                  | Owner               |
| --------------- | --------------------- | ------------------- |
| 510(k) eSTAR    | `EstarEditor.jsx`     | self-contained       |
| PMA module      | `EditorSurfaces.jsx`  | composes `<DocumentEditor/>` |
| CER section     | `EditorSurfaces.jsx`  | composes `<DocumentEditor/>` |

Layout (every editor): **left** = section tree (volumes → sections → checklist) · **center** = block-level rich text canvas with inline citation chips, comments gutter, validation flags · **right** = Claude conversation panel + quick actions (mode picker, tool list).

Routes (from non-editor surfaces) into the editor:
- Validation Center drawer → "Open §11 in editor" → 510(k) editor at `sectionId: 11`
- Pre-Sub commitment → "Open §X in editor"
- CER Workbench → "Open §6 in editor" → CER editor

### 2.7 Project home (`ProjectHome.jsx`)

Per-program landing page. Reached by clicking a program card on Overview, a row in 510(k), or any "Open program" link. Header: program code · pathway · status. Body: readiness summary · gate log · activity feed · entry-points into all five primary surfaces scoped to that program.

---

## 3 · Wiring — exact steps, in order

### Step 1 · Confirm the design-system folder is in the working tree

```bash
ls concept2cure-v2/design-system-2026-04-29/ui_kits/mdx/
```

Expected output (alphabetical):
```
App.jsx  CerWorkbench.jsx  DocumentEditor.jsx  EditorSurfaces.jsx
EstarEditor.jsx  Icons.jsx  PreSub.jsx  ProjectHome.jsx
Shell.jsx  Surfaces.jsx  Workbench.jsx  app.css
data-editors.jsx  data-presub.jsx  data-validator.jsx
data-workbench.jsx  data.jsx  index.html
```

Plus `<DS>/colors_and_type.css` at the design-system root. **If any of these are missing, stop and ask the human to re-extract the ZIP.** Do not start porting from a partial mirror.

### Step 2 · Wire the canonical token surface

This is the bug that broke 2026-04-26. Read it twice.

In v2's root CSS entry (today: `client/src/index.css` or wherever the Tailwind / global stylesheet lives), import the canonical token file **directly from the design-system folder**, before any component CSS:

```css
/* client/src/index.css — top of file */
@import "../../design-system-2026-04-29/colors_and_type.css";

/* ...everything else after... */
```

Then immediately delete `client/src/concept2cure/design/zen.css` (or whatever the legacy token file is called). Do not copy the canonical file's contents into v2's own CSS — that re-introduces the regression class. Token edits must propagate from `<DS>/colors_and_type.css` automatically.

**Verification (mandatory, every time):**
1. `npm run dev` (or whatever boots v2).
2. Open the running app. DevTools → Elements → `<html>` or `<:root>`.
3. In the Computed pane, search for `--accent-100`. It must resolve to `#d97757`.
4. Search for `--bg-000`. It must resolve to `#faf9f5`.
5. If either is blank, the import is missing or scoped wrong. **Fix this before doing anything else.** No further work proceeds until tokens resolve.

### Step 3 · Decide CSS strategy (one of two)

Your best option is **Option A**. Use Option B only if v2's build genuinely cannot consume a flat global stylesheet.

**Option A — verbatim CSS import (preferred).** Configure the v2 build to import `<DS>/ui_kits/mdx/app.css` as a regular stylesheet whenever the MDX route is mounted. Class-name collisions are not a concern: every selector in `app.css` is namespaced (`.rail-`, `.tab-`, `.val-`, `.vd-`, `.vault-`, `.subm-`, `.pe-`, `.de-`, `.cew-`, `.ph-`, `.q-`, etc.) specifically so it does not clash with v2's existing styles.

```ts
// client/src/concept2cure/mdx/MdxRoute.tsx
import "../../../design-system-2026-04-29/ui_kits/mdx/app.css";
```

**Option B — convert to CSS modules / Tailwind.** Mechanically translate each rule. **Do not change values.** The kit's spacing, radii, motion durations, and shadow elevations are the design. If a value seems wrong, raise it to the designer; do not silently round.

### Step 4 · Mirror the JSX, file-by-file

For each `.jsx` file under `<DS>/ui_kits/mdx/`, create one v2 module that re-implements it 1:1 in TypeScript + React. Suggested target tree:

```
client/src/concept2cure/mdx/
├── MdxRoute.tsx                  ← imports App + provides routing
├── shell/
│   ├── Shell.tsx                 ← from Shell.jsx
│   ├── MdxRail.tsx
│   ├── TopBar.tsx
│   ├── TabBar.tsx
│   └── AnaDock.tsx
├── surfaces/
│   ├── Overview.tsx              ← from Surfaces.jsx
│   ├── K510Surface.tsx
│   ├── PmaSurface.tsx
│   ├── PrecedentSurface.tsx
│   └── cer/
│       ├── CerSurface.tsx        ← entry; delegates to CerWorkbench
│       ├── CerWorkbench.tsx      ← from CerWorkbench.jsx
│       ├── CerOverview.tsx
│       ├── CerEquivalence.tsx
│       ├── CerGspr.tsx
│       ├── CerLiterature.tsx
│       ├── CerSignals.tsx
│       ├── CerPms.tsx
│       └── CerGenerator.tsx
├── workbench/
│   ├── TasksSurface.tsx          ← from Workbench.jsx
│   ├── VaultSurface.tsx
│   ├── ValidationSurface.tsx     ← includes ValidatorDrawer
│   ├── SubmissionsSurface.tsx
│   ├── TemplatesSurface.tsx
│   └── AnalyticsSurface.tsx
├── presub/
│   └── PreSubManager.tsx         ← from PreSub.jsx
├── editors/
│   ├── EstarEditor.tsx
│   ├── PmaEditor.tsx
│   ├── CerEditor.tsx
│   └── DocumentEditor.tsx        ← shared primitive
├── projectHome/
│   └── ProjectHome.tsx
├── data/
│   ├── nav.ts                    ← from data.jsx (MDX_NAV_V2, MDX_NAV_GROUPS, MDX_STUBS, MDX_SUGGESTIONS, ANA_MODES, ANA_TOOLS)
│   ├── programs.ts               ← MDX_PROGRAMS, MDX_HEALTH
│   ├── k510.ts                   ← K510_STAGES, K510_PREDICATES, K510_SE_ROWS, K510_ESTAR
│   ├── pma.ts                    ← PMA_PHASES, PMA_MODULES, PMA_TRIAL_METRICS
│   ├── cer.ts                    ← CER_SIGNALS, CER_LITERATURE, CER_EXPORT, CER_GSPR, CER_EQUIV_*, CER_PMS_*, CER_PMCF_STUDIES
│   ├── workbench.ts              ← from data-workbench.jsx
│   ├── presub.ts                 ← from data-presub.jsx
│   ├── validator.ts              ← from data-validator.jsx (ESTAR_SECTIONS, ESTAR_DETAIL)
│   └── editors.ts                ← from data-editors.jsx (PMA_EDITOR_*, CER_EDITOR_*, EDITOR_*)
└── icons.tsx                     ← from Icons.jsx
```

Mirror rules (these are the same rules from `<DS>/HANDOFF.md` §"How Claude Code consumes this kit", repeated here so you don't have to context-switch):

1. **One v2 component per JSX function in the kit.** Same name (TypeScript-cased if needed), same prop shape, same JSX structure.
2. **Class names verbatim.** `.vd-finding`, `.val-prog-card`, `.rail-item`, `.subm-pipeline`, `.q-row` — every selector survives the port. The CSS depends on them.
3. **Copy strings verbatim.** Every label, pill text, empty-state message, suggestion phrase. Sentence case. No emoji. No exclamation marks. The voice is in `<DS>/README.md` — re-read it if you find yourself "improving" copy.
4. **Interaction behavior.** Keyboard shortcuts (⌘K, Esc to close drawers, arrow keys in matrix), focus management, dismiss-on-outside-click rules — all preserved.
5. **State location.** The kit puts state at `App.jsx` (nav, active program, dossier route, AnA dock visibility) and at each surface (filters, view mode, drawer open). Mirror that. Resist the urge to lift state into Redux unless v2's existing patterns demand it.

### Step 5 · Wire data sources

In the kit, every `data-*.jsx` file is a `window.X = [...]` mock. In v2, replace each with a real data source:

| Kit global             | v2 binding                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `MDX_NAV_V2` etc.      | static config — port to `data/nav.ts` and re-export                     |
| `MDX_PROGRAMS`         | `useQuery(['programs'])` against the programs endpoint                  |
| `K510_PREDICATES`      | `useQuery(['predicates', programId])`                                   |
| `K510_ESTAR`           | `useQuery(['estarChecklist', programId])`                               |
| `ESTAR_DETAIL`         | `useQuery(['estarDetail', programId])`                                  |
| `VALIDATION_*`         | `useQuery(['validation', { sev, prog }])`                               |
| `VAULT_FILES`          | `useQuery(['vaultFiles', { folder, filter, query }])`                   |
| `SUBMISSIONS`          | `useQuery(['submissions'])`                                             |
| `TASKS`                | `useQuery(['tasks', { owner, view }])`                                  |
| `PMA_EDITOR_CONTENT`   | `useQuery(['pmaSection', programId, sectionId])`                        |
| `CER_EDITOR_CONTENT`   | `useQuery(['cerSection', programId, sectionId])`                        |
| `EDITOR_COMMENTS` etc. | `useQuery(['comments', editorId, sectionId])`                           |

For the first port, **keep the kit's mock data as fixtures** (port the arrays into TypeScript constants in `data/*.ts`) and wire the React Query calls to return those fixtures via `queryFn: () => Promise.resolve(MOCK)`. This decouples "ship the UI" from "stand up the API" — the API team backfills endpoints against the fixture shape, and the UI does not change when they swap.

**Shape contracts (do not drift):**
- All IDs are opaque strings. No assumptions about format.
- All dates are ISO 8601 calendar dates (`YYYY-MM-DD`) — regulatory dates are timezone-free.
- All "when" / "since" fields are pre-formatted relative-time strings in the kit; on the server side these come from a `ts: ISODateTime` field and are formatted at render time.
- Status enums are closed sets, listed inline in each `data-*.jsx`. Do not add values without a designer review.

### Step 6 · Wire AnA (the right rail)

`<AnaDock/>` in `Shell.jsx` is a contextual chat panel. Its props:
- `activeNav` — drives `MDX_SUGGESTIONS[activeNav]` (the suggestion chips above the composer)
- `programContext` — pinned program (code, title, pathway, status) shown at the top
- `onAsk(prompt)` — bubbles a user prompt up to the AnA backend
- `onJumpToDossier(target)` — bubbles a "open this in the editor" signal up to the route layer

In v2, `onAsk` calls the existing AnA chat endpoint; `onJumpToDossier` navigates to the editor route with the right query params (program, section, optional block).

The collapsed-state pulse (`ana-pulse` keyframe) runs **only** when there is at least one blocked program in the user's portfolio. Drive it from a derived selector over `MDX_PROGRAMS`, not from a manual toggle.

### Step 7 · Wire the editors as the "live dossier" target

Every action that reads "Open §X in editor" routes to the corresponding editor:

| From                                          | Routes to                                          |
| --------------------------------------------- | -------------------------------------------------- |
| Validator drawer fix-path button (510(k))     | `EstarEditor` at `sectionId`                       |
| Validator drawer fix-path (PMA)               | `PmaEditor` at `sectionId` (e.g. `5.1`)            |
| Validator drawer fix-path (CER)               | `CerEditor` at `sectionId`                         |
| CER Workbench → Generator → "Open §6"         | `CerEditor`                                        |
| Pre-Sub commitment → "Open §X"                | matching editor by program type                    |
| Project home → "Open authoring"               | matching editor                                    |

The v2 router decides which editor to mount based on the program's `pathway` (`k510` → EstarEditor, `pma` → PmaEditor, `cer` → CerEditor). The editor receives `{ programId, sectionId, blockId? }` and is responsible for fetching its own content + comments + validation.

### Step 8 · Wire `<TweaksPanel/>` only if the v2 product runs with the in-app design knobs

The kit doesn't ship Tweaks for MDX. Skip Step 8.

---

## 4 · What to delete (Phase 2 cleanup target)

When the new MDX surfaces are wired, behind a feature flag, and an internal QA pass has signed off — **and not before** — delete:

```
client/src/concept2cure/components/medtech/**
  ↳ but keep any reusable primitives that aren't MDX-specific

client/src/concept2cure/pages/*510kPage*.tsx
client/src/concept2cure/pages/*PMAPage*.tsx
client/src/concept2cure/pages/*CERPage*.tsx
client/src/concept2cure/pages/*PrecedentPage*.tsx

client/src/concept2cure/design/zen.css
  ↳ replaced by colors_and_type.css

any feature flag in src/featureFlags.ts that toggled "new mdx" / "old mdx"
```

Cleanup rules:
- Delete in the **same PR** that flips the flag on for production. No parallel UI paths.
- Grep for every import of every deleted file. Update or delete the importers in the same diff.
- If a deleted file had a test, delete the test too. Migrate test cases to the new component if the test asserted business logic; drop pure-snapshot tests.

What to **keep** for now (these belong to other phases):
- Auth surfaces (`pages/LoginPage.tsx`, etc.) — Phase 5
- Admin surfaces — Phase 6
- The legacy Home shell (`ZenApp.tsx`) — Phase 1 (already in flight per `<DS>/HANDOFF.md`)
- Inner per-device detail views that don't render any of the 5 primary MDX surfaces

---

## 5 · Acceptance checklist (run before opening the PR)

Copy this checklist into the PR description and tick each box.

### 5.1 Token surface (the regression test — every phase, every time)
- [ ] `<DS>/colors_and_type.css` is imported once at the v2 app root, before any component CSS.
- [ ] Live DevTools confirms `--accent-100` resolves to `#d97757`.
- [ ] Live DevTools confirms `--bg-000` resolves to `#faf9f5`.
- [ ] `client/src/concept2cure/design/zen.css` is deleted, not just emptied.
- [ ] `grep -rn "#d97757\|#faf9f5" client/src/concept2cure/mdx/` returns zero hits (all colors via `var(--…)`).

### 5.2 Shell
- [ ] Rail renders all 14 MDX nav items in the four groups, exact order from `MDX_NAV_V2`.
- [ ] Rail collapses to 56px; state persists in localStorage.
- [ ] AnA dock collapses to 44px; state persists independently.
- [ ] AnA pulse keyframe runs only when ≥1 program has `status: 'blocked'`.
- [ ] TopBar global search opens the cross-program palette (Cmd/Ctrl-K).
- [ ] TabBar live counts match the data they reference (e.g. PMA tab count = `MDX_PROGRAMS.filter(p => p.pathway === 'pma').length`).

### 5.3 Overview
- [ ] 4 portfolio KPIs render from `MDX_HEALTH`.
- [ ] Programs section toggles between Grid and List; `localStorage['mdx.viewMode']` persists the choice.
- [ ] Pathway and status filter chips work as multi-select with live counts.
- [ ] Program card click routes to its pathway surface AND pins the program in the topbar context AND in the AnA dock.

### 5.4 510(k) surface
- [ ] 7-stage strip uses the four states (idle / active / blocked / complete) from the unified status vocab; never uses pathway codes as status.
- [ ] Predicate table multi-select drives the SE matrix into multi-column mode (subject pinned as anchor).
- [ ] eSTAR row with `blocker: true` renders with `--error-muted` background.
- [ ] Clicking an eSTAR row opens the Validator drawer for that section (cross-link).

### 5.5 PMA surface
- [ ] 10-phase grid uses `grid-template-columns: repeat(10, 1fr)` regardless of viewport.
- [ ] 4 trial KPIs render from `PMA_TRIAL_METRICS`.
- [ ] 6 module cards render with status, doc count, description.
- [ ] Module card → "Open in editor" routes to `PmaEditor` at the right sectionId.

### 5.6 CER (7 sub-tabs via `CerWorkbench`)
- [ ] Sub-tab switcher renders all 7 tabs in order: Overview · Equivalence · GSPR · Literature · Signals · PMS · Generator.
- [ ] Equivalence sub-tab swaps the matrix from single → multi-predicate when a second device is selected.
- [ ] GSPR sub-tab renders all chapters from `CER_GSPR` with verdict pills.
- [ ] Signals sub-tab severity uses only `serious` / `non-serious` chips; inclusion uses `included` / `excluded` / `review`.
- [ ] PMS sub-tab renders KPIs · complaint queue · PMCF studies · timeline.
- [ ] Generator sub-tab "Generate" CTA routes to `CerEditor`.

### 5.7 Workbench
- [ ] Tasks: Kanban + List view, filterable by owner.
- [ ] Vault: folder × file table, version history rail, capacity bar.
- [ ] Validation Center: program matrix + rule list. **Clicking a program card OR a rule row opens `<ValidatorDrawer/>`.**
- [ ] Validator drawer renders all 20 eSTAR sections, errors-first ordering, status dots, finding counts.
- [ ] Each finding shows: rule reference (FDA cite) · current → expected comparison cells · evidence trail (with version + approval status pills) · fix-path action buttons.
- [ ] Validator drawer "Open §X in editor" buttons route to the correct editor.
- [ ] Submission Center: pipeline strip · submissions list · detail with gate status, cover letter, e-sig pill, ESG receipt.
- [ ] Templates: index + detail.

### 5.8 Pre-Sub Manager
- [ ] Pipeline strip renders all 5 stages (Plan → Submit → Meeting → Minutes → Commitments).
- [ ] Q-Sub list filterable by status.
- [ ] Q-Sub detail panel shows authoring surface for questions, FDA response matching, commitment tracking.
- [ ] "Open §X" on a commitment routes to the right editor.

### 5.9 Editors (live dossier)
- [ ] `EstarEditor` renders the 3-pane layout (section tree / canvas / Claude rail).
- [ ] `PmaEditor` and `CerEditor` are composed from the shared `DocumentEditor` primitive; same layout, different data.
- [ ] Citation chips inside blocks resolve to the source ID (e.g. `FR-8812` → CER signal).
- [ ] Comments gutter pins each comment to its `blockId`; resolves on click.
- [ ] Validation flags inside the editor match the rules from the Validator drawer (same IDs, same severity).
- [ ] Claude conversation rail loads `EDITOR_SEED_MESSAGES` on first open; mode picker defaults to Opus 4.5.
- [ ] Quick actions render from `EDITOR_QUICK` / `PMA_EDITOR_QUICK` / `CER_EDITOR_QUICK`.

### 5.10 Project home
- [ ] `<ProjectHome/>` renders for any program when its card / row is clicked.
- [ ] Header shows code · pathway · status from `MDX_PROGRAMS`.
- [ ] Body has readiness summary, gate log, activity feed, surface entry-points.

### 5.11 Voice + density
- [ ] Sentence case everywhere. No Title Case. No ALL CAPS except 10px metadata labels.
- [ ] No emoji except the AnA `✻` sparkle (U+273B).
- [ ] No exclamation marks.
- [ ] Body text 13px. Max title 24px.
- [ ] Claude orange (`--accent-100`) appears once per screen — never as a generic accent on multiple elements.
- [ ] All transitions 200ms ease-out. No bounce, no spring.
- [ ] Lucide icons only (via `Icons.jsx` mirror).

### 5.12 Cleanup
- [ ] Every file listed in §4 is deleted.
- [ ] Feature flags around the legacy MDX UI are removed.
- [ ] No dead code paths or orphan imports remain.

---

## 6 · The cross-cutting "live dossier" routing pass

Phase 2 is **only really shipped** when every action that reads "Open §X" or "View evidence" routes the user into the correct editor with the right state. This is a pass you do AFTER the surfaces compile and render, not before:

1. Grep your v2 port for every `onJumpToDossier`, `onOpenEditor`, `onAttachEvidence`, `onAuthorSection` prop.
2. Confirm each one resolves to a real route (not a `console.log` placeholder).
3. Click through the kit running locally (`<DS>/ui_kits/mdx/index.html`) to map every action's expected destination, then mirror that mapping in v2.
4. Verify the editor receives the right `{ programId, sectionId, blockId? }` triple.
5. Verify the editor's section tree highlights the requested section on mount.
6. Verify the validation flag on the requested block is in view (scroll-into-view on mount).

This pass is item 6 on the designer's outstanding todo list and **gates Phase 2 sign-off**.

---

## 7 · Phase 2 features beyond the kit ship — open work

These are flagged in the designer's outstanding todos:

- **Gap 5 — Submission ESG receipt + AIC log.** Submission Center already has the pipeline + submissions list + cover letter + e-sig stub, but the FDA ESG receipt detail view and the Acknowledgement-of-Receipt log are still in design. Do not mock these in v2 — wait for the next design-system drop.
- **Cross-cutting dossier routing.** Item 6 above. Ports happen now; the routing pass happens last.

When the next design-system drop arrives, the human will create a new dated folder. At that point you re-run §1 (read order) against the new folder, scan `<DS>/HANDOFF.md`'s changelog for what changed, and apply the diff.

---

## 8 · Escalation

If anything in this document is ambiguous, or if v2's framework / build / a11y constraints force a deviation from the kit, **stop and raise it to the human operator**. Do not resolve UI trade-offs unilaterally. The human passes the question to the designer (this project's seat); the designer updates `<DS>/HANDOFF.md` and the affected `ui_kits/` files; the human drops a new dated folder; you re-port the affected surface from the new folder.

The cost of a half-shipped surface compounds. The cost of a fifteen-minute design ping does not.

---

## Appendix A · Quick map — file in kit → file in v2

```
ui_kits/mdx/index.html         → (entry only — replaced by MdxRoute.tsx)
ui_kits/mdx/App.jsx            → mdx/MdxRoute.tsx + state graph
ui_kits/mdx/Shell.jsx          → mdx/shell/Shell.tsx + sub-components
ui_kits/mdx/Surfaces.jsx       → mdx/surfaces/{Overview,K510,Pma,Precedent}Surface.tsx
ui_kits/mdx/CerWorkbench.jsx   → mdx/surfaces/cer/CerWorkbench.tsx + 7 sub-tabs
ui_kits/mdx/Workbench.jsx      → mdx/workbench/{Tasks,Vault,Validation,Submissions,Templates,Analytics}Surface.tsx
ui_kits/mdx/PreSub.jsx         → mdx/presub/PreSubManager.tsx
ui_kits/mdx/EstarEditor.jsx    → mdx/editors/EstarEditor.tsx
ui_kits/mdx/DocumentEditor.jsx → mdx/editors/DocumentEditor.tsx (shared)
ui_kits/mdx/EditorSurfaces.jsx → mdx/editors/{Pma,Cer}Editor.tsx
ui_kits/mdx/ProjectHome.jsx    → mdx/projectHome/ProjectHome.tsx
ui_kits/mdx/Icons.jsx          → mdx/icons.tsx
ui_kits/mdx/data.jsx           → mdx/data/{nav,programs,k510,pma,cer,ana}.ts
ui_kits/mdx/data-workbench.jsx → mdx/data/workbench.ts
ui_kits/mdx/data-presub.jsx    → mdx/data/presub.ts
ui_kits/mdx/data-validator.jsx → mdx/data/validator.ts
ui_kits/mdx/data-editors.jsx   → mdx/data/editors.ts
ui_kits/mdx/app.css            → imported verbatim by MdxRoute.tsx
```

## Appendix B · The unified status vocabulary (re-stated for visibility)

`idle · active · blocked · complete` is the only status set used by stage strips, phase grids, program chips, and submission gates.

| Status   | Token                                  | Use                                     |
| -------- | -------------------------------------- | --------------------------------------- |
| idle     | `--text-500` on `--bg-100`             | not started                             |
| active   | `--accent-100`                         | currently in progress (one per screen)  |
| blocked  | `--warning`                            | gated, requires action                  |
| complete | `--success`                            | finished, locked                        |

Pathway codes (`k510`, `pma`, `cer`) are **orthogonal** to status — never use them as status values.
