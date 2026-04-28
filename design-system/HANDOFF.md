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

## Phase status

| # | Surface                | Status                    | UI kit                  | Replaces (in `client/src/concept2cure/`)                                    |
| - | ---------------------- | ------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| 1 | Home screen            | **Ready to implement**    | `ui_kits/home/`         | `ZenApp.tsx` shell + `AppsPage.tsx` + `IndustryAwareApp.tsx` home state      |
| 2 | MDX workstream         | **Ready to implement**    | `ui_kits/mdx/`          | `components/medtech/**` home + any `*510kPage*`, `*PMAPage*`, `*CERPage*`   |
| 3 | Projects detail        | **Ready to implement**    | `ui_kits/ana_ri/`       | `ZenApp.tsx` project-scoped shell + per-project chat/doc merge surfaces     |
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

## Phase 3 · Projects detail — implementation contract (scaffold)

### What ships

The canonical per-project workspace. Replaces `ZenApp.tsx`'s project-scoped view and the document-chat fork under `IndustryAwareApp.tsx`. Reference: `ui_kits/ana_ri/` (chat-first project shell) + `ui_kits/ectd_coauthor/` (3-pane artifact workbench) — Projects is the merge of these two patterns.

**Open for the designer to resolve before implementation:**
- [ ] **RIM framing.** The repo-side `CLAUDE.md` describes Concept2Cure as a 3-layer RIM (Regulatory Information Management) system — Projects is the layer where document state, chat state, and submission state converge. That framing is not yet in this project's README/CLAUDE. **Action: paste the RIM section from the repo's `client/src/**/CLAUDE.md` into our `README.md` so the Projects surface can be designed against it.** Until then, Projects will land as a chat-first + artifact-tab shell without the deeper RIM model.
- [ ] **Program density assumption.** Phase 2 assumed 20–60 programs per tenant (drove the grid→list auto-switch at >12). Projects inherits this assumption — confirm before designing the project list surface.
- [ ] **Document/chat convergence sprint.** Referenced in the repo CLAUDE.md but not here. If there's a specific sprint already scoped, share the scope so this phase mirrors the team's plan instead of re-deriving it.

### Layout (provisional, to be finalized after RIM framing lands)

- **Project header** — project name, code, pathway, lead, owners, due, readiness. Same visual vocabulary as program cards in MDX Overview.
- **Left pane** — project nav: Overview · Chats · Artifacts · Tasks · Submissions · Timeline. Collapsible.
- **Main** — surface for the active pane. Chat surface lifts from `ui_kits/ana_ri/`. Artifact surface lifts from `ui_kits/ectd_coauthor/`.
- **Right pane** — AnA dock, scoped to the project. Same state machine as MDX (first-visit expand, pulse on nudge).

### Non-goals for Phase 3

- Engineering / UDI / Post-market deep surfaces (Phase 4).
- Cross-project search (Phase 5 alongside Admin).
- Submission center (already hinted in home rail; phase TBD).

### Acceptance checklist (Phase 3, provisional)

- [ ] Project header matches MDX program card vocabulary (status chip, readiness bar, blocker row, owner initials, due pill).
- [ ] Left pane nav persists across route changes; collapse state persists to `localStorage`.
- [ ] Chats pane reuses the `ana_ri/` components 1:1; artifact pane reuses `ectd_coauthor/`.
- [ ] AnA dock respects the MDX-derived state machine (first-visit expand, pulse nudge, collapsed default afterward).
- [ ] Legacy `ZenApp.tsx` project-scoped routes are deleted; feature flags removed.
- [ ] All token usage goes through `colors_and_type.css`. No hard-coded values.

---

## Open questions

Add unresolved questions here with your initials and the date. The designer answers by updating this file and the relevant `ui_kits/` surface.

*(none yet)*

---

## Changelog

- **2026-04-23 (PM)** — Phase 2 MDX refinements: Grid/List toggle on Overview (auto >12), pathway + status filter chips, unified status vocab across strip/grid/chips (idle/active/blocked/complete), predicate table multi-select driving multi-column SE matrix, AnA dock first-visit + pulse-nudge state machine, rail stubs render InDesignSurface. Phase 3 Projects contract scaffolded pending RIM framing.
- **2026-04-23** — Phase 2 MDX workstream shipped. 5 surfaces (Overview, 510k, PMA, CER, Precedent), 11 rail items, 3-column shell with collapsible rail + AnA dock. Home rail `mdx` item + launcher tile now both point to `../mdx/index.html`.
- **2026-04-21** — Phase 1 home screen finalized. Rail grew from 10 to 15 items (added Quality and Lifecycle, AnA Memory, Audit and Compliance; Reporting renamed to Reports). Precedent Intelligence removed from the rail per product direction — it will live inside the MDX workstream in a later phase.
