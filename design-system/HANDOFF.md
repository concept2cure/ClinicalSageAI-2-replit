# HANDOFF.md — Implementation contract for Claude Code

This file is the **executable brief** for wiring the Concept2Cure Design System into the `concept2cure-v2` codebase. Read `CLAUDE.md` and `SKILL.md` before this file; read this file before touching a single line of product code.

---

## Rules of engagement

1. **The design system in this project is the source of truth.** Not the legacy UI. Not your memory of what the app used to look like. Not your intuition about "what a dashboard usually has".
2. **One phase at a time.** Ship Phase 1 completely — every surface listed below, every token wired, legacy deleted — before starting Phase 2.
3. **Mirror, do not interpret.** Copy the JSX structure, class names, CSS rules, and copy strings from `ui_kits/<surface>/` into the codebase directly. Convert global styles to scoped/Tailwind/CSS-modules as the codebase demands, but keep the **selectors, cascade, and values** identical.
4. **Token-first.** Every color, font, radius, shadow, spacing, and motion value must come from `colors_and_type.css`. If you see a hard-coded `#d97757` or `13px` in a diff, the diff is wrong — reference the token instead.
5. **Delete as you replace.** When a new surface ships, remove the legacy route, page, feature flag, and any dead helpers it made obsolete. Leave no parallel UI paths.
6. **If anything is ambiguous, stop and ask the designer.** Do not fill gaps with guesses. Unresolved questions go into the "Open questions" section at the bottom of this file and wait for a designer response.

---

## How Claude Code consumes this kit

This design system lives in a **separate project**. Claude Code, running in the v2 repo, has shell-level filesystem access — it can only read paths that physically exist in the v2 working tree. So the design system has to be **mirrored into the v2 repo** as a read-only-by-convention folder, and kept in sync.

### The mirror — `design-system/` in the v2 repo

The v2 repo contains a folder at its root called `design-system/`. It is a verbatim copy of this project's files:

```
concept2cure-v2/design-system/
├── CLAUDE.md
├── HANDOFF.md
├── README.md
├── SKILL.md
├── colors_and_type.css
├── preview/
└── ui_kits/
    ├── home/        ← Phase 1 + Phase 3 (Projects lives inside the home kit)
    ├── mdx/         ← Phase 2
    └── …
```

**This folder is read-only by convention.** Claude Code reads it; Claude Code does not edit it. Edits are made in the canonical design-system project (this one) by the designer, and propagate to v2 via the sync job (see below). Any edit Claude Code makes to `design-system/` will be overwritten on the next sync — so don't.

### Per-session read order (do not skip)

Every session that touches UI:

```
1. design-system/CLAUDE.md          ← phase routing, non-negotiables, token-import warning
2. design-system/HANDOFF.md         ← this file: phase status, surface inventory, contracts
3. design-system/colors_and_type.css   ← canonical token surface (must be imported into v2's app root CSS)
4. design-system/ui_kits/<surface>/    ← every JSX + CSS file for the surface you are porting
5. design-system/preview/              ← per-token specimen cards for verification
```

Reading is free; do it for every file referenced in this contract before you start porting. **A single session that ports a surface without reading all of `design-system/ui_kits/<surface>/` first is a session that produces a regression** — that is exactly how the 2026-04-26 token-resolution bug shipped.

### Keeping the mirror fresh

`design-system/` is a snapshot. The canonical source is the design-system project (project id `7f3ac932-8a8b-4582-8748-5d4c31e8d0ed`). A sync job — git submodule, CI workflow, or scheduled rsync — pulls the canonical project's files into `design-system/` on every commit / on a schedule / on designer signal.

If you suspect drift (e.g. a surface in `HANDOFF.md`'s changelog that isn't in the local mirror yet), trigger a re-sync before porting. The mirror's `HANDOFF.md` changelog is the source of truth for "what's the latest" — if its top entry is stale relative to what the designer announced, the mirror needs a refresh.

### Porting a surface — the actual workflow

For each surface listed in the Phase status table:

1. **Read every file** in `design-system/ui_kits/<surface>/`. The full file list for each surface is enumerated in that phase's "Where this lives in the design system" section below.
2. **Mirror the JSX 1:1** into the v2 codebase. Preserve:
   - Component decomposition (one v2 component per JSX function in the kit).
   - Class names exactly as written (`prj-list-row`, `pact-row`, `pcp-mem-row`, etc.). The CSS depends on these.
   - Copy strings — every label, pill text, empty-state message — verbatim from `data.jsx` / inline JSX. Sentence case, no emoji, no exclamation marks.
   - Interaction behavior — keyboard shortcuts, focus management, dismiss rules.
3. **Lift the styles.** Two options, in order of preference:
   - **Import the kit's CSS verbatim** into the v2 build (preferred — single source). The class-name prefixes (`prj-`, `pact-`, `pcp-`, …) are namespaced specifically so they don't collide with v2's existing styles. Configure your build (Vite / webpack / etc.) to resolve `design-system/ui_kits/<surface>/styles.css` as a regular import.
   - If the v2 build forces CSS modules / Tailwind, convert each rule mechanically. **Do not "improve" values** — the kit's spacing, radii, motion durations, and color tokens are the design. If a value is wrong, raise it to the designer before changing it.
4. **Wire `colors_and_type.css` once** at the v2 app root, before any component CSS. Import it directly from `design-system/colors_and_type.css` so token edits propagate automatically. Verify in DevTools that `--accent-100` resolves to `#d97757` and `--bg-000` to `#faf9f5` (this is the regression checklist from `CLAUDE.md`). If they're blank, your import is missing or scoped wrong — fix before continuing.
5. **Run the per-phase acceptance checklist** at the bottom of that phase's section. Every box must be checked before opening a PR. The token-surface verification step is non-negotiable on every phase, every time.
6. **Delete the legacy** files the phase replaces. The "What this replaces" list per phase is the deletion target. Remove feature flags in the same PR.

### When the design changes

The design system is a **living source**. When the designer ships a new revision in the canonical project:

- The sync job propagates the change to `design-system/` in the v2 repo (next sync cycle, or trigger manually).
- `design-system/HANDOFF.md`'s changelog records what changed. Read that first.
- Re-read the affected `design-system/ui_kits/<surface>/` files and re-apply the diff to v2.
- Token changes (any edit to `design-system/colors_and_type.css`) propagate automatically because v2 imports the file directly. **Never copy the file's contents into v2's own CSS** — that freezes the tokens at point-in-time and re-introduces the regression class.

### What Claude Code must not do

- **Do not** recreate Concept2Cure UI from screenshots, memory, or v2's existing legacy code. The kit is the only authority.
- **Do not** edit files inside `design-system/`. The mirror is read-only by convention; edits will be overwritten on the next sync. UI change requests get raised to the human operator, who passes them to the designer (this project's seat). The designer updates the canonical source, the sync propagates.
- **Do not** ship a phase before its acceptance checklist is fully checked. A half-shipped phase blocks the next one.
- **Do not** invent surfaces that aren't in the kit. If v2 needs a screen that isn't designed yet, stop and ask. Phases are sequenced for a reason.

---

## Phase status

| # | Surface                | Status                    | UI kit                  | Replaces (in `client/src/concept2cure/`)                                    |
| - | ---------------------- | ------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| 1 | Home screen            | **Ready to implement**    | `ui_kits/home/`         | `ZenApp.tsx` shell + `AppsPage.tsx` + `IndustryAwareApp.tsx` home state      |
| 2 | MDX workstream         | **Ready to implement**    | `ui_kits/mdx/`          | `components/medtech/**` home + any `*510kPage*`, `*PMAPage*`, `*CERPage*`   |
| 3 | Projects (list + detail) | **Ready to implement**  | `ui_kits/home/` (Projects rail item) | `ZenApp.tsx` project-scoped shell + per-project chat/doc merge + project list state |
| 4 | Artifact workbench     | In design — do not build  | —                       | —                                                                           |
| 5 | Auth (login / signup)  | In design — do not build  | —                       | —                                                                           |
| 6 | Admin surfaces         | In design — do not build  | —                       | —                                                                           |

Everything else in `client/src/concept2cure/` is **legacy** — keep it running until its replacement phase ships, then delete it.

---

## Phase 1 · Home screen — implementation contract

### What ships

The authoritative reference is `ui_kits/home/index.html` + its siblings (`App.jsx`, `data.jsx`, `Icons.jsx`, `home.css`, etc.). Open it in the preview and match it pixel-for-pixel. Specifically:

**Layout**
- Fixed left **icon rail**, 15 items, grouped in 4 tiers with subtle separators: *Domain* (2) → *Work* (4) → *Intelligence* (5) → *System* (4).
- Rail collapses to icon-only via the collapse toggle at the bottom. Collapsed state persists in `localStorage`.
- Active rail item reveals an inline **sub-drawer** (see `NAV_SUB` in `data.jsx` for the exact sub-items per module).
- Main canvas: time-of-day greeting → composer with 5 suggestion pills → AnA proactive briefing card → 4-metric dashboard strip → 12-tile module launcher → recent activity feed.
- `⌘K` anywhere opens a command palette listing all 15 nav items.

**The 15 rail items (exact order, labels, ids)**
From `ui_kits/home/data.jsx` — **copy verbatim, do not rename**:

```
Domain:        mdx, biopharma
Work:          projects, vault, tasking, submission
Intelligence:  protocol, cmc, biostat, quality, reporting
System:        ana_memory, artifacts, audit, admin
```

Labels are in sentence case and match `NAV_ITEMS[].label` exactly. `reporting` is labelled **"Reports"** (renamed from the legacy "Reporting and Analytics and Prediction Modeling"). **Precedent Intelligence does not appear in the rail** — it lives inside the MDX workstream and will ship as part of a later phase.

**Tokens**
- Use `colors_and_type.css` via whatever mechanism the codebase already has for token imports (CSS variables are already the pattern in `client/src/concept2cure/design/zen.css` — replace that file's contents with the tokens from this project).
- Claude orange (`--accent-main-100` / `#d97757`) appears **once per screen**: the active rail indicator. Do not use it elsewhere on Home.
- Background is cream (`--bg-000`). Surfaces are white (`--bg-100`). Borders are `--border-100`.

**Motion**
- Rail hover / active transitions: **200ms ease-out**. No bounce.
- Sub-drawer open: 200ms ease-out, height + opacity.
- ⌘K palette enter: 120ms ease-out, opacity + 4px translateY.

**Copy — exact strings**
Pulled from `data.jsx`. Do not rewrite. Every greeting, every pill, every dashboard label, every module tile tagline, every recent-activity string — verbatim.

### What this replaces

Delete, after Phase 1 ships and is verified:
- `client/src/concept2cure/ZenApp.tsx` (shell) — replaced by the Home layout.
- `client/src/concept2cure/pages/AppsPage.tsx` — replaced by the module launcher + ⌘K palette.
- `client/src/concept2cure/IndustryAwareApp.tsx` home-state fork — the domain switcher in the rail subsumes it.
- Feature flags that toggled between "new" and "old" home surfaces.
- Per-industry home dashboards in `components/biologics/`, `components/medtech/`, `components/pharma/` **only where they rendered the home screen**. The inner domain pages remain until their phases arrive.

### Acceptance checklist (Claude Code must verify before closing Phase 1)

- [ ] All 15 rail items render in the exact order, group, and label from `NAV_ITEMS`.
- [ ] Rail collapses / expands; state persists across reload.
- [ ] Active nav item reveals its `NAV_SUB` drawer inline.
- [ ] `⌘K` opens the command palette with all 15 items and keyboard navigation (arrows + enter + esc).
- [ ] Greeting reads "Good morning/afternoon/evening, {firstName}" based on local time. Never "Hi" or "Hey".
- [ ] Composer placeholder, suggestion pills, and all module-tile strings match `data.jsx` verbatim.
- [ ] Body text is 13px. Max title is 24px. Nothing shouts.
- [ ] Claude orange appears once (active nav indicator). Every other accent is removed.
- [ ] No emoji. No exclamation marks. No "Awesome!" / "Oops!" / "Nothing here yet!" strings anywhere on Home.
- [ ] Legacy home surfaces listed above are deleted from the codebase, not just hidden.
- [ ] `colors_and_type.css` tokens are wired as CSS variables; no hard-coded hex / font-family values in any Home component.

---

## Phase 2 · MDX workstream — implementation contract

### What ships

Authoritative reference: `ui_kits/mdx/index.html` + siblings (`App.jsx`, `Shell.jsx`, `Surfaces.jsx`, `data.jsx`, `Icons.jsx`, `styles.css`). Users reach it from the home rail (`mdx` item) or the launcher tile — both point to `ui_kits/mdx/index.html`. Mirror it pixel-for-pixel.

**Layout**
- Three-column shell: **rail** (260 / 56 px) · **main** · **AnA dock** (380 / 44 px). Main has a 48 px TopBar, a 44 px TabBar, then the page.
- Rail groups: *Workstream* (8) → *Workspace* (2) → *System* (1 back-link). Workstream items are the pathway routes — `overview`, `k510`, `pma`, `cer`, `predicate`, `engineering`, `udi`, `postmarket`.
- TabBar exposes the 5 primary surfaces with live counts on the pathway tabs. Selecting a tab sets `activeNav`; rail and tabs stay in sync.
- AnA dock: context block (pinned to the active program), contextual suggestions (from `MDX_SUGGESTIONS[activeNav]`), recent AnA activity, composer. Collapses to a 44 px icon strip.

**The 5 primary surfaces**
1. **Overview** — 4 portfolio health cards + 4 program cards (2×2). Each program card shows stage progress, next blocker, owners, due pill. Clicking a program jumps to its pathway with that program in context.
2. **510(k)** — 7-node stage strip (Intake → Submit), predicate search table (6 rows · similarity bar · selected/candidate/reviewed/rejected status pills), SE matrix (`180px 1fr 32px 1fr` grid · verdict chips), eSTAR 20-section checklist with `blocker` row style.
3. **PMA** — 10-phase grid (each cell: label · progress bar · pct), 4 trial metrics, 6 module cards (3-col).
4. **CER** — signal table (FAERS/MAUDE/Literature/Eudamed · severity · inclusion status), literature-by-year horizontal bar chart, CER section checklist, AnA generation plan panel.
5. **Precedent Intelligence** — saved-queries list + cross-agency pattern summary. This is the new home of the legacy "precedent" surface pulled out of the main rail.

**Data contract** (from `ui_kits/mdx/data.jsx` — names must match exactly):
```
MDX_NAV_ITEMS           MDX_PROGRAMS            MDX_HEALTH
K510_STAGES             K510_PREDICATES         K510_SE_ROWS         K510_ESTAR
PMA_PHASES              PMA_MODULES             PMA_TRIAL_METRICS
CER_SIGNALS             CER_LITERATURE          CER_EXPORT
MDX_SUGGESTIONS         (keyed by activeNav)
```

**Tokens**
- Same `colors_and_type.css` surface as Home. No new colors. Serif reserved for metric values.
- Claude orange once per view: active stage node · selected predicate row · active PMA phase · AnA send button · suggestion hover. Do not stack focal points.
- Severity uses the semantic scale: serious → `--error-muted / --error`; non-serious → neutral `--bg-200 / --text-300`.

**Motion**
- All transitions 200 ms ease-out.
- Predicate row `:hover` shifts `background` to `--bg-100`; selected row pins to `--accent-000`.
- Stage-node dot gets a 3 px `box-shadow` halo in accent when active — no pulsing.

**Copy — exact strings**
Every pill, metric label, section header, tab label, program title, and blocker string comes from `data.jsx`. Do not paraphrase.

### What this replaces

Delete, after Phase 2 ships:
- Any MDX-specific home surfaces under `client/src/concept2cure/components/medtech/` that rendered a dashboard, program list, or 510(k)/PMA/CER page.
- Any legacy `*510kPage*`, `*PMAPage*`, `*CERPage*` routes and their feature flags.
- Legacy predicate-search UI — subsumed by the in-kit predicate table + `predicate` surface.

Inner MDX utilities (single-device detail views, specific validators) stay until their own phase if they don't overlap the 5 surfaces above.

### Acceptance checklist (Phase 2)

- [ ] Rail renders the 11 MDX items in the exact group/order from `MDX_NAV_ITEMS`. `Back to all modules` links to Home.
- [ ] TabBar and rail stay in sync — clicking either updates the shared `activeNav` state.
- [ ] Clicking a program card on Overview jumps to its pathway surface AND pins it in the topbar context pill AND the AnA context block.
- [ ] 7-stage strip shows the correct node as `active` based on `program.stageIdx`; all prior nodes render as `done` with a check.
- [ ] Predicate table rows are keyboard-focusable; the `selected` row has the accent-muted background.
- [ ] SE matrix verdict chips use the three tokens only: `same` · `equivalent` · `different`. No ad-hoc colors.
- [ ] eSTAR row with `blocker: true` gets the `--error-muted` background and remains a 12 px row.
- [ ] 10-phase PMA grid renders at exactly 10 equal columns regardless of container width (grid-template-columns: repeat(10, 1fr)).
- [ ] CER signal severity uses only `serious` / `non-serious` chips; inclusion uses `included` / `excluded` / `review`.
- [ ] AnA dock suggestions swap when `activeNav` changes (verify all 5 surfaces surface different suggestion sets).
- [ ] AnA dock collapses to 44 px; rail collapses to 56 px; both states persist independently.
- [ ] No emoji except the AnA `✻` sparkle mark (exact character: U+273B). No exclamation marks anywhere.
- [ ] Legacy MDX surfaces listed above are deleted, not hidden.

---

## Phase 2 · MDX paying-client beta (shipped 2026-05-05)

Every kit surface in `ui_kits/mdx/` now reads live data from real backend
endpoints. Branch `claude/deploy-mdx-kits-6sIb9` carries the implementation.
This section is the contract a paying-client beta operator follows on the
v2 cluster.

### Backend surface (server/routes/regulatory-programs.ts + saved-precedent-queries.ts)

`/api/regulatory-programs` — list + get + 9 sidecar endpoints powering
every per-program panel:

| Endpoint | Backs |
|---|---|
| `GET /` | Overview KPIs + program grid; TabBar counts |
| `GET /:id` | ProjectHome header + governance panel |
| `GET /:id/activity` | ProjectHome activity feed (audit_logs by record_id UUID) |
| `GET /:id/milestones` | ProjectHome milestone timeline (derived from q_sub_meetings + section completion + program status) |
| `GET /:id/rim-recommendations` | ProjectHome "Claude recommendations" (derived from required-but-empty sections + open Q-Sub commitments + withdrawn standards refs + in-review-but-incomplete sections) |
| `GET /:id/change-impact` | ProjectHome change-impact panel (audit_logs section edits + section cross-reference scan) |
| `GET /:id/safety-signals` | CerSurface signals table (safety_signals, project-scoped) |
| `GET /:id/literature` | CerSurface literature corpus chart (literature_entries, year-bucketed) |
| `GET /:id/pma-modules` | PmaSurface module cards (cerv2_510k_sections grouped into PMA module taxonomy) |
| `GET /:id/pma-trial-metrics` | PmaSurface KPIs (clinical_ops.studies + .deviations + .endpoint_results) |
| `GET /portfolio-insights` | PrecedentSurface narrative panel (data-derived: pathway clearance ratio + most-common predicate K-numbers + literature density) |

`/api/saved-precedent-queries` — full CRUD over `saved_precedent_queries`
table. Backs PrecedentSurface "Saved queries" panel.

All endpoints tenant-scoped via the global auth + tenant-context
middleware on `/api`. All write endpoints validated with strict Zod
schemas. Mutations write `audit_logs` rows via the global audit
middleware (21 CFR Part 11 §11.10(e) compliant for the new surface).

### Pre-deploy sequence (paying-client beta)

```bash
# 1. Apply schema changes (adds saved_precedent_queries + IV-415 metadata column)
npm run db:push

# 2. Seed programs + Q-Subs (6 programs spanning 510k / pma / cer pathways)
npm run db:seed:mdx-beta

# 3. Seed content data so every kit surface demos with real data
npm run db:seed:mdx-content

# 4. Run smoke suite
npx vitest run tests/mdx-paying-client-smoke.test.ts

# 5. Start dev + walk every surface in browser
npm run dev
```

### Surface coverage after content seed

| Kit surface | Data source | Lights up after seed |
|---|---|---|
| Overview | regulatory_programs | ✓ 6 programs |
| TabBar counts | useMdxPrograms | ✓ |
| K510Surface eSTAR list | cerv2_510k_sections | ✓ 20 sections |
| K510Surface predicates | predicate-intelligence shadow | banner if shadow not configured |
| K510Surface SE matrix | predicate-intelligence shadow | banner if shadow not configured |
| PmaSurface 10-phase grid | program.stageIdx | ✓ derived |
| PmaSurface 6 modules | cerv2_510k_sections grouped by category | ✓ |
| PmaSurface 4 trial KPIs | clinical_ops.studies (set program.metadata.clinicalStudyId) | empty until linked |
| CerSurface sections | cerv2_510k_sections | ✓ |
| CerSurface signals | safety_signals | ✓ 4 signals (IV-415) |
| CerSurface literature | literature_entries | ✓ ~50 entries |
| PrecedentSurface saved queries | saved_precedent_queries | ✓ 4 queries |
| PrecedentSurface narrative | portfolio-insights computation | ✓ |
| PreSubManager list + KPIs | q-submissions service | ✓ 7 Q-Subs |
| PreSubManager detail | q-sub questions/commitments/timeline | ✓ |
| ProjectHome readiness | program.readiness | ✓ |
| ProjectHome tasks | submission-ops/workload (project_work_items) | empty until populated |
| ProjectHome milestones | derived | ✓ |
| ProjectHome RIM recs | derived | ✓ |
| ProjectHome change-impact | audit_logs section edits | empty until edits |
| ProjectHome governance | program.teamMembers | ✓ |
| ProjectHome activity | audit_logs by program UUID | empty until activity |
| Workbench Tasks | submission-ops/workload | empty until populated |
| Workbench Validation | submission-ops/blockers + program join | ✓ |
| Workbench Submissions | c2c_submission_packages | ✓ 5 packages |
| Workbench Templates | /api/templates aggregator | ✓ |
| EstarEditor / PmaEditor / CerEditor | useLiveSections + cerv2-sections PATCH | ✓ all three editors |
| CerWorkbench tabs | composes CerSurface | ✓ |

Vault (`Workbench.jsx > VaultSurface`) is intentionally not wired —
needs its own design pass (concept2cureArtifacts has different auth +
version semantics than the kit's VaultFile shape).

### Production-recommended program metadata

Set on `regulatory_programs.metadata` (jsonb) per program:

| key | who reads it | why |
|---|---|---|
| `clinicalStudyId` | pma-trial-metrics endpoint | binds program to a specific clinical_ops.studies UUID; without it the endpoint falls back to a productName-ILIKE-indication fuzzy match that can pick up wrong studies in orgs running multiple trials |
| `ndcCode` | (future) FAERS lookup | NDC code for FDA adverse-event API queries |
| `programCode` | submissions adapter | preferred display code (falls back to `pkg-{packageId}`) |
| `stage` | submissions adapter | overrides derived stage when richer state is needed |
| `gateErrs`/`gateWarns`/`gateOk` | submissions list | per-package transmit gate counts for the row chips |
| `fileCount` / `bytes` / `cover` / `esig` / `transmitAt` | submissions list | rich row fields; defaults are sensible when absent |

### Auth + audit confirmed paths

- Global auth on `/api`: `server/middleware/setup.ts:62-84` (authMiddleware
  → tenantContextMiddleware → requireTenantContext)
- Global mutation audit: `server/middleware/setup.ts:87` writes `audit_logs`
  with tenant_id, user_id, action (CREATE/UPDATE/DELETE), table_name (URL),
  record_id, new_values, ip_address, user_agent, timestamp

### Smoke suite

`tests/mdx-paying-client-smoke.test.ts` (20 vitest assertions):
route modules load, drizzle schema registered, migration present,
8 client hooks export expected functions, register-inline-routes mounts
both new routes, kit fixtures stay structurally compatible with adapter
outputs, content seed covers every kit-surface table, npm scripts
register both seeds. Run via `npx vitest run tests/mdx-paying-client-smoke.test.ts`.

---

## Phase 2 · MDX refinements (shipped 2026-04-23)

These refinements tightened the kit after the initial Phase 2 ship. Contract addenda:

- **Overview view mode.** Grid on first load when ≤ 12 programs; auto-switches to list when > 12. Toggle (`Grid` / `List`) lives top-right of the Programs section. Preference persists per user in `localStorage` under `mdx.viewMode`.
- **Filter chips.** Two chipsets above the view — pathway (`All / 510(k) / PMA / CER`) and status (`All / Active / Blocked / Idle`) — with live counts. Filters are additive.
- **List row spec.** Columns: `Program (title + code) | Pathway chip | Stage + readiness bar | Next blocker | Lead initials | Due + last activity`. Grid template `2.4fr 0.9fr 1.6fr 2fr 0.8fr 1fr`. Row clicks route the same as grid cards (opens the program in its pathway).
- **Unified status vocabulary.** `idle · active · blocked · complete` applies to stage nodes (510k), phase cells (PMA), and program status chips. Status tokens: idle = `--text-500` on `--bg-100`; active = accent; blocked = `--warning`; complete = `--success`. Never use pathway (k510/pma/cer) as a status — it's orthogonal.
- **Stage strip states.** `idle` (empty dot), `active` (accent dot + accent halo), `blocked` (warning dot + warning halo), `complete` (success dot with check). Always show whichever state the program's `status` + `stageIdx` imply.
- **Predicate table multi-select.** First column is a checkbox. Clicking a row toggles its checkbox. When exactly one predicate is checked, the SE matrix renders in single-predicate mode. When two or more are checked, it swaps to a multi-column matrix (`160px | subject | one column per predicate`) with the subject pinned as the anchor column. Never drop to zero selected — toggling the last one off is a no-op.
- **AnA dock state machine.**
  - `anaCollapsed` default is `true`.
  - On first-ever MDX visit (no `mdx.visited` localStorage key), force-expand once and set the key. Thereafter respect preference.
  - When collapsed and a high-priority nudge exists (today: any blocked program), apply the `ana-pulse` keyframe class to the collapsed sparkle icon. Do not steal focus; do not auto-expand.
- **Rail stubs.** `engineering`, `udi`, `postmarket` render via `InDesignSurface` with data from `MDX_STUBS`. Icon + phase chip + title + one-line description, centered, no CTAs, no "Coming soon" copy.

## Phase 3 · Projects (list + detail) — implementation contract

### Where this lives in the design system

The Projects surface is **inside the home kit**, reachable from the rail (`projects` nav item). Authoritative source files, in load order from `ui_kits/home/index.html`:

```
ui_kits/home/Icons.jsx          ← shared icon set (Lucide-derived)
ui_kits/home/data.jsx           ← shared data (rail items, modules, etc.)
ui_kits/home/Extras.jsx         ← non-Projects extras (other tabs, dialogs)
ui_kits/home/ProjectsExtras.jsx ← Projects Phase 3.5 surfaces (filters, bulk, audit, linked, switcher, notifications, internal search, archive modal)
ui_kits/home/Projects.jsx       ← Projects core (list, detail shell, memory, instructions, files, timeline, config panel)
ui_kits/home/App.jsx            ← shell wiring; renders <ProjectsScreen/> when rail = projects
ui_kits/home/styles.css         ← all Projects styles, prefixed: prj-, pmem-, pinstr-, pfiles-, ptl-, pcp-, pact-, plnk-, parch-, plf-, plb-, ple-, pqs-, pnot-, pis-, pmm-
```

To port: read these files in this order, mirror the JSX structure 1:1 into the v2 codebase, and import `colors_and_type.css` once at the app root **before any component CSS** (see token-import warning in `CLAUDE.md`).

### Surfaces shipped

#### List view (`<ProjectsList/>` in `Projects.jsx`)
- Header: title + count + "New project" CTA + view toggle (grid/list) + bell (notifications) + ⌘K hint.
- **Filter chip rail** (`<ProjectsListFilters/>` from `ProjectsExtras.jsx`). Two rows:
  - Row 1: saved-views pills (default + `+ Save view`) — see `PLF_SAVED_VIEWS` for the exact 4 default views and their filter shapes.
  - Row 2: search input + 5 filter pills (Type / Status / Agency / Owner / Activity) — each opens a checkbox dropdown menu, shows count badge when active. + Clear-all button when any filter set.
- **Bulk action bar** (`<ProjectsListBulkBar/>`) appears above the list when ≥1 row is checked. Count + Archive / Export / Transfer / Delete (danger) + Clear.
- **Row** (`.prj-list-row`): checkbox · star · name · description · type pill · phase progress bar · last activity · ⋯ menu.
- **Empty states** (`<ProjectsListEmpty/>`): zero projects (illustration + 4 onboarding suggestions tagged Setup/Import/Template/Demo) and zero results (clear-filters CTA).

#### Detail view (`<ProjectDetail/>` in `Projects.jsx`)
Header: back · star · project name (editable) · type pill · agency pill · status pill · gear (config) · ⋯ menu.
Tabs: **Chats** (default) · **Memory** · **Instructions** · **Files** · **Timeline** · **Activity** · **Linked**.

- **Chats** — chat list (left) + composer (right). Chat list shows recent threads, pinned, archived.
- **Memory** (`<ProjectMemoryScreen/>`) — toggle, summary card, recent learnings (predicate / clinical / regulatory / process), entry controls.
- **Instructions** (`<ProjectInstructionsScreen/>`) — 5,000-char monospace editor, char counter, active toggle, template picker (`PINSTR_TEMPLATES`: FDA 510(k), EU MDR, ICH M4Q, custom).
- **Files** (`<ProjectFilesScreen/>`) — table with filter chips, sort, group-by, drag-drop affordance, capacity bar. Columns: name · author · when · size · lines.
- **Timeline** (`<ProjectTimeline/>`) — pathway-aware default phases from `PHASE_PRESETS` (510K / IND / NDA / CER). Status dots, connector line, in-progress phase highlighted with accent ring + bar + %, days-to-target in head.
- **Activity** (`<ProjectActivityScreen/>` from `ProjectsExtras.jsx`) — 21 CFR Part 11 audit log. Day-grouped rows, kind chips (Export / File / Memory / Instructions / E-sig / Comment / Lifecycle / Access), each row: time · kind · actor + role + verb + target · IP + e-sig pill + signature hash. "Tamper-evident · SHA-256" integrity badge in head.
- **Linked** (`<ProjectLinkedScreen/>`) — relationship graph + grouped list (Predicate device / Parent IND / Child NDA / Cross-reference / Supplier). Each row: directional arrow (in/out) · other project name · type pill · status pill · via-relationship hint · open/unlink actions.

#### Detail head — more menu (`<ProjectMoreMenu/>` in `Projects.jsx`)
Dropdown from ⋯: Duplicate · Duplicate as template · Export ZIP · Export eCTD · Transfer · separator · Archive · Delete (danger). Click-outside dismiss.

#### Project config panel (`<ProjectConfigPanel/>` in `Projects.jsx`)
Right Sheet, 440px, opens from gear, dismisses on Esc / close button. Tabs:
- **General** — Project name, Submission type (`PCP_SUBMISSION_TYPES`, 9 options), Product, Sponsor, Target agency (`PCP_AGENCIES` as radio chips), Target date, Status (`PCP_STATUSES`, 5 options), Description.
- **Instructions** — 5,000-char textarea (mono), live char counter, "Active" badge, reset.
- **Members** — invite row (email + role select + invite button), member list with role select per row + remove (disabled for last owner), role legend (Owner / Maintainer / Editor / Viewer), SSO group mapping list.
- **Compliance** — 21 CFR Part 11 status card with audit-trail + e-signature counts, integrity pills (Append-only · SHA-256 integrity · Tamper-evident), regulatory lead assignment.
- **Settings** — default templates picker, retention policy, eCTD/ZIP export buttons, danger zone (Archive / Transfer / Delete with type-to-confirm).

#### Modals & overlays
- **Archive / restore / delete modal** (`<ProjectArchiveModal/>`) — three modes (`archive` / `restore` / `delete`). Delete requires typing the project name to confirm. Lists side effects per mode.
- **Project quick switcher** (`<ProjectQuickSwitcher/>`) — ⌘K within Projects. Fuzzy filter, type pill, last-activity meta, ↑↓ + Enter, "Create new project" footer CTA.
- **Notifications** (`<ProjectNotifications/>`) — right sheet from bell. Tabs: All · Unread (count badge). Categories: agency / predicate / supplier / e-sig / mention. Each row: icon · title · sub · when · project link. Mark-all-read in foot.
- **Project internal search** (`<ProjectInternalSearch/>`) — overlay, scoped to one project. Searches Memory + Instructions + Files + Chats. Group headers, kind pills, ↑↓ + Enter to jump.
- **New project dialog** (`<NewProjectDialog/>`) — region → application type → confirm. Driven by `NPD_REGIONS`, `NPD_TYPES`, `NPD_PREVIEWS`, `NPD_DEFAULT_PREVIEW`. Bootstrap preview shows the section/module skeleton each registry id creates.

### Data shapes (verbatim — copy into v2)

The list of projects (`PR_PROJECTS` in `Projects.jsx`) is the seed data — Claude Code should replace it with the live API response, but the **shape** must match. Key fields:

```js
{
  id, name, description, code, pathway,         // 'or-801' | 'or-802' | ...
  type,                                          // '510(k)' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'EU MDR CER' | 'IVDR'
  status,                                        // 'draft' | 'active' | 'in_review' | 'submitted' | 'archived'
  agency,                                        // 'FDA' | 'EMA' | 'PMDA' | 'MHRA' | 'Health Canada'
  owner, owners[], due, lastActivity,
  starred, archived,
  phases: [{ name, status, progress }],          // status: 'completed' | 'in_progress' | 'pending'
  memory: { enabled, summary, learnings[] },
  instructions: string,
  files: [{ name, author, when, size, lines, kind }],
}
```

Saved views, filter pill options, audit-log events, link relationships, and notifications all have authoritative shapes in `Projects.jsx` / `ProjectsExtras.jsx`. Lift them as-is; do not re-derive.

### What this replaces

Delete, after Phase 3 ships and is verified:

- `client/src/concept2cure/ZenApp.tsx` — project-scoped routes, header, tab strip, modal stack.
- The document-chat fork under `IndustryAwareApp.tsx` — Projects is the unified surface.
- Any project-list page that lives outside `AppsPage.tsx` (kept until Phase 1 deletes that file too).
- Per-industry project dashboards under `components/biologics|medtech|pharma|cro|biotech/` **only where they rendered the project workspace**.

Feature flags gating any of the above must be removed in the same PR that deletes the files.

### Non-goals for Phase 3

- Cross-project search (Phase 5 alongside Admin).
- Engineering / UDI / Post-market deep surfaces (Phase 4).
- Submission center (already hinted in home rail; phase TBD).
- The artifact workbench (Phase 4) — Projects deep-links to it but does not own it.

### Acceptance checklist (Claude Code must verify before closing Phase 3)

**Token surface (re-run before every phase, no exceptions):**
- [ ] `colors_and_type.css` is imported once at the app root, before any component CSS.
- [ ] In live DevTools, `:root` resolves `--accent-100` to `#d97757` and `--bg-000` to `#faf9f5`.
- [ ] No hex codes, font-families, or magic spacing values hard-coded in any Projects component.

**List view:**
- [ ] Header bell shows the unread dot (`PNOT_NOTIFS` filter `unread === true`) — not blank.
- [ ] All 4 default saved views render (My active 510(k)s, Pending agency response, Archived, …) with the filter shapes from `PLF_SAVED_VIEWS`.
- [ ] All 5 filter pills work as multi-select dropdowns with count badges; Clear-all only appears when ≥1 filter is set.
- [ ] Bulk-action bar only renders when ≥1 row is checked; rows highlight with the accent-tinted background when checked.
- [ ] Empty states render for both zero-projects (with onboarding suggestions) and zero-results (with clear-filters CTA).

**Detail view:**
- [ ] All 7 tabs render in order: Chats · Memory · Instructions · Files · Timeline · Activity · Linked.
- [ ] Timeline auto-selects the right preset from `PHASE_PRESETS` based on `project.type`.
- [ ] Activity log groups events by day, shows kind chips with counts, e-sig pills, IP + signature hash.
- [ ] Linked tab groups by relationship type, shows directional arrows for in/out links.
- [ ] More menu (⋯) dismisses on click-outside; Delete row uses the danger style (red).

**Config panel:**
- [ ] All 5 tabs render (General / Instructions / Members / Compliance / Settings).
- [ ] Esc and close button both dismiss; clicking outside the sheet does not (intentional — prevents accidental dismiss while editing).
- [ ] Members tab disables the remove button on the last Owner row.
- [ ] Settings danger zone uses the type-to-confirm flow from `<ProjectArchiveModal/>`, not a plain button.

**Overlays:**
- [ ] ⌘K opens `<ProjectQuickSwitcher/>` from anywhere inside Projects; Esc dismisses; ↑↓ + Enter navigate.
- [ ] Bell icon opens `<ProjectNotifications/>` right sheet; All/Unread tabs filter correctly; Mark-all-read clears the unread count.
- [ ] In-project search opens `<ProjectInternalSearch/>` and groups results by source (Memory / Instructions / Files / Chats).
- [ ] Archive modal in `delete` mode disables the confirm button until the typed text matches the project name exactly.

**Cleanup:**
- [ ] Legacy `ZenApp.tsx` project routes deleted. Feature flags removed. No dead code paths.
- [ ] Sentence case everywhere. No emoji. No exclamation marks. 13px body. 200ms ease-out. Lucide icons only.

---

## Open questions

Add unresolved questions here with your initials and the date. The designer answers by updating this file and the relevant `ui_kits/` surface.

### Phase 3 audit — items Claude Code will hit on port (raised by designer 2026-04-29)

The hi-fi prototype at `ui_kits/home/Projects.jsx` is a static, in-memory mock. Porting it surfaces real questions the design doesn't answer. Each item below states **what the prototype does**, **what's ambiguous**, and **the design's intent** so Claude Code has a single source to act on.

**1. Project ID generation.** *Prototype:* `pr-${Date.now().toString(36)}` (`NewProjectDialog.create`, line 1574). *Ambiguous:* not unique under burst create, not server-authoritative, leaks creation time. *Intent:* server-side opaque ID (UUIDv7 or KSUID) returned from the create mutation. Client never invents IDs. The `pr-` prefix is purely visual mock affordance — drop it.

**2. Status enum drift between create and config.** *Prototype:* `NewProjectDialog` writes `status: 'planning'` (line 1588) but `ProjectConfigPanel`'s status select (`PCP_STATUSES`, line 916) only offers `draft / active / in_review / submitted / archived`. A freshly created project's status is therefore unrepresentable in the editor. *Intent:* canonical enum is `draft | active | in_review | submitted | archived`. Map create → `draft`. Drop `planning` everywhere.

**3. `submissionType` slug normalization.** *Prototype:* `type.applicationType.toUpperCase().replace(/[^A-Z0-9]/g, '')` (line 1582) — collapses `510(k)` → `510K`, `EU MDR CER` → `EUMDRCER`, `IVDR` → `IVDR`. *Ambiguous:* this is a one-way display→slug derivation; any DB lookup needs the inverse. *Intent:* server stores a closed enum (`FDA_510K | FDA_PMA | FDA_IND | FDA_NDA | FDA_BLA | EU_MDR_CER | EU_IVDR | …`). The wizard's `NPD_TYPES` table is the canonical source — port it as a static lookup, **don't regenerate slugs by string-mangling display names**.

**4. `targetAgency` vocabulary collision.** *Prototype:* `PCP_AGENCIES` (config panel, line 915) lists `['FDA', 'EMA', 'PMDA', 'Health Canada']`. `NPD_REGIONS` (wizard, line 1361) uses `['FDA', 'EMA', 'MHRA', 'HC', 'PMDA', 'Swissmedic']`. A wizard-created `HC` project will not match the panel's `Health Canada` radio and will show no selection. *Intent:* unify on the wizard's six-agency code list (`FDA | EMA | MHRA | HC | PMDA | Swissmedic`). Update `PCP_AGENCIES` to match. Display labels via `agencyFullName`. Update `Projects.jsx` accordingly when porting; treat the wizard table as canonical.

**5. Mini progress bar = "completed phases" only, not weighted.** *Prototype:* list-row mini bar (line 245) shows `completed / total`, ignoring the `progress` value of the current phase. The full ProjectTimeline header (line 837) uses the same definition. *Ambiguous:* a project at "phase 5 of 9, 60% through it" reads as 44% in both views. *Intent:* keep "completed phases / total" as the at-a-glance metric — it's the contractually meaningful number. Do **not** switch to a weighted blend mid-port. If we want weighted later, that's a Phase 3.5 decision.

**6. `daysToTarget` source of truth.** *Prototype:* hardcoded numbers per project (`daysToTarget: 142`), unrelated to `targetDate`. *Intent:* derive at render time as `differenceInCalendarDays(targetDate, today)`. Negative = overdue (render with `--text-warn` tone). `null` when `targetDate` is unset. Drop the stored field.

**7. Two writers for `instructions`.** *Prototype:* `ProjectInstructionsScreen` (the dedicated tab, line 620) and `ProjectConfigPanel` General-tab textarea (line 927) both edit `project.instructions` with no coordination. *Intent:* single source. The **Instructions tab** is the editor; the **Config panel General tab textarea is read-only** and links out to the Instructions tab on click. Strip the editable textarea from the config panel during port.

**8. `instructions` "active" toggle is local state only.** *Prototype:* `ProjectInstructionsScreen` keeps `active` in `useState`, derived from `!!project.instructions` (line 622). Pause/Save/Save-and-activate flip local state but never write back. *Intent:* `active` is a persisted boolean on the project. Pause = `active: false` (text retained). Save = persist text + `active: true`. The Mini "Active" badge on the panel reads this field, not the text length.

**9. Save handler missing on Config panel.** *Prototype:* `ProjectConfigPanel` (line 924) takes `{ project, open, onClose }` — no `onSave`. Edits are discarded on close. *Intent:* add `onSave(form)` to the prop contract. Wire it to a single PATCH on the project. Close after success. Dirty-state confirm on Esc/close if unsaved edits.

**10. Modal handlers are stubs.** *Prototype:* `onArchive`, `onDelete`, `onExport`, `onTransfer`, `onDuplicate` (lines 208–211, 264, 315, 446, 469) all `() => {}` or `setArchiveTarget(null)`. *Intent:* each is its own server mutation. Wiring expectations:
  - Archive → soft-delete, `status: 'archived'`, hidden from default list, recoverable from a "Show archived" filter.
  - Delete → hard-delete, requires typed confirmation (already in `ProjectArchiveModal`), audit-trail entry.
  - Export ZIP → backend job, returns signed URL, modal shows progress.
  - Transfer → owner-only, picks target workspace, creates audit entry both sides.
  - Duplicate as template → strips chats/files, copies phases + instructions + config, opens template editor.

**11. `targetDate` input type.** *Prototype:* plain text input. *Intent:* `<input type="date">` with locale-aware display. Server stores ISO 8601 (`YYYY-MM-DD`), no timezone (regulatory dates are calendar dates).

**12. `chats` and `files` shapes are mock-only.** *Prototype:* inline arrays with ad-hoc shapes (`{id, title, last}` / `{name, lines, kind}`). *Intent:* both are server-paginated lists, not project fields. Port as separate `useChats(projectId)` / `useFiles(projectId)` queries. The list-row counts (`p.chats.length`, line 250) become a denormalized count on the project payload.

**13. `capacityPct` is unused decoration.** *Prototype:* present on every project, never read by any component. *Intent:* drop the field entirely on port.

**14. `PR_PROJECTS` is mutated in place.** *Prototype:* `NewProjectDialog.create` calls `PR_PROJECTS.unshift(...)` (line 1577) — module-scope mutation, not React state. *Intent:* obvious — server mutation + React Query invalidation. Flagged here only so Claude Code doesn't naively translate the array mutation into a `useState` array on the page component.

— *all items above resolved by designer; no blocking ambiguities remain. Claude Code: treat the intent lines as the contract.*

---

## Changelog

- **2026-04-29** — Phase 3 audit. 14 ambiguities raised and resolved against `ui_kits/home/Projects.jsx`: ID generation, status-enum drift (`planning` vs. canonical 5), submissionType slug normalization, agency vocabulary collision (`HC` vs. `Health Canada`), mini-bar progress definition, `daysToTarget` derivation, dual writers on `instructions`, missing `onSave` on `ProjectConfigPanel`, stub modal handlers, `targetDate` input type, `chats`/`files` shapes, unused `capacityPct`, in-place `PR_PROJECTS` mutation. All resolutions documented in **Open questions**; no blocking items remain before port.
- **2026-04-28** — Phase 3 Projects contract finalized. Full surface inventory: list (filter chip rail, saved views, bulk actions, empty states), detail (7 tabs incl. Activity 21 CFR Part 11 audit log + Linked relationship graph), config panel (5 tabs incl. Members + Settings + danger zone), overlays (⋯ menu, ⌘K quick switcher, notifications sheet, internal search, archive/restore/delete modal). All living under `ui_kits/home/` — `Projects.jsx` (core) + `ProjectsExtras.jsx` (Phase 3.5 surfaces) + `styles.css` (prefixed `.prj-` / `.pmem-` / `.pinstr-` / `.pfiles-` / `.ptl-` / `.pcp-` / `.pact-` / `.plnk-` / `.parch-` / `.plf-` / `.plb-` / `.ple-` / `.pqs-` / `.pnot-` / `.pis-` / `.pmm-`).
- **2026-04-23 (PM)** — Phase 2 MDX refinements: Grid/List toggle on Overview (auto >12), pathway + status filter chips, unified status vocab across strip/grid/chips (idle/active/blocked/complete), predicate table multi-select driving multi-column SE matrix, AnA dock first-visit + pulse-nudge state machine, rail stubs render InDesignSurface. Phase 3 Projects contract scaffolded pending RIM framing.
- **2026-04-23** — Phase 2 MDX workstream shipped. 5 surfaces (Overview, 510k, PMA, CER, Precedent), 11 rail items, 3-column shell with collapsible rail + AnA dock. Home rail `mdx` item + launcher tile now both point to `../mdx/index.html`.
- **2026-04-21** — Phase 1 home screen finalized. Rail grew from 10 to 15 items (added Quality and Lifecycle, AnA Memory, Audit and Compliance; Reporting renamed to Reports). Precedent Intelligence removed from the rail per product direction — it will live inside the MDX workstream in a later phase.
