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
| 2 | Projects detail        | In design — do not build  | —                       | —                                                                           |
| 3 | Artifact workbench     | In design — do not build  | —                       | —                                                                           |
| 4 | Auth (login / signup)  | In design — do not build  | —                       | —                                                                           |
| 5 | Admin surfaces         | **Ready to implement**    | `ui_kits/mdx/`          | Replaces `mdx/_stubs/ComingSoon.tsx` route for `admin` (Phase 4 below)      |
| 6 | MDX · Engineering      | **Ready to implement**    | `ui_kits/mdx/`          | Replaces `InDesignSurface` route for `engineering` (Phase 4 below)         |
| 7 | MDX · UDI / labeling   | **Ready to implement**    | `ui_kits/mdx/`          | Replaces `InDesignSurface` route for `udi` (Phase 4 below)                 |
| 8 | MDX · Post-market      | **Ready to implement**    | `ui_kits/mdx/`          | Replaces `InDesignSurface` route for `postmarket` (Phase 4 below)          |
| 9 | MDX · Analytics        | **Ready to implement**    | `ui_kits/mdx/`          | Replaces `InDesignSurface` route for `analytics` (Phase 4 below)           |
|10 | MDX · AnA memory    | **Ready to implement**    | `ui_kits/mdx/`          | Replaces `InDesignSurface` route for `memory` (Phase 4 below)              |

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

## Open questions

Add unresolved questions here with your initials and the date. The designer answers by updating this file and the relevant `ui_kits/` surface.

- **2026-05-21 · CC** — Phase 7.1 Activity detail: kit has six tabs (State · Documents · Evidence · Workflow · Provenance · Audit). The four read-only routes called out for the first PR don't surface per-document state or per-activity audit history, so PR 1 ships only the State tab. Documents needs either an artifacts-per-activity endpoint or the existing artifacts feed filtered by `activityKey`; Audit needs `/api/pdev/.../provenance` (or the existing audit log filtered by `resourceId`). Should these tabs ship in 7.2 alongside the mutation pipeline, or earlier as a second read-only PR that adds the documents/audit endpoints first?
- **2026-05-21 · CC** — Token shim (`--border-100`, `--border-200`, `--error-text`) currently scoped to `.pdev-shell` in the v2 port to avoid polluting the global token surface. The PDEV kit's `styles.css` declares them at `:root`. Per the design system's "Tokens from `colors_and_type.css` only" rule, should these be absorbed into `colors_and_type.css` as canonical aliases (and the shim deleted), or do they stay shim-only?

---

## Phase 4 · MDX lifecycle + system surfaces — implementation contract

### What ships

Six surfaces that today route to `mdx/_stubs/ComingSoon.tsx` (rendered via
`<InDesignSurface>`). After Phase 4:

| Rail id      | Source of truth                              | Replaces                                      |
| ------------ | -------------------------------------------- | --------------------------------------------- |
| engineering  | `ui_kits/mdx/surfaces/Engineering.jsx`       | `MDX_STUBS.engineering` entry + stub route    |
| udi          | `ui_kits/mdx/surfaces/Udi.jsx`               | `MDX_STUBS.udi` entry + stub route            |
| postmarket   | `ui_kits/mdx/surfaces/Postmarket.jsx`        | `MDX_STUBS.postmarket` entry + stub route     |
| analytics    | `ui_kits/mdx/surfaces/Analytics.jsx`         | `MDX_STUBS.analytics` entry + stub route      |
| memory       | `ui_kits/mdx/surfaces/Memory.jsx`            | `MDX_STUBS.memory` entry + stub route         |
| admin        | `ui_kits/mdx/surfaces/Admin.jsx`             | `MDX_STUBS.admin` entry + stub route          |

### Code changes Claude Code makes to land Phase 4

1. **Port six new surface files** into `client/src/concept2cure/mdx/surfaces/`
   as TSX. Each kit JSX file is a 1:1 starting point — drop the IIFE wrapper,
   convert `window.X = ...` imports to ES module imports, type the props
   (props shape is documented in each file's header comment).
2. **Port six new data files** from `ui_kits/mdx/data/{engineering,udi,
   postmarket,analytics,memory,admin}.js` into `client/src/concept2cure/mdx/data/`
   as TS. These are the fixture shapes — they describe the schemas the live
   hooks must produce. Each top-level export becomes a TS `interface` +
   `export const`; the kit harness uses them as window globals, the codebase
   imports them as ESM.
3. **Update `mdx/data/nav.ts`** — remove the six entries from `MDX_STUBS`.
   The `MDX_NAV_V2` list keeps the same ids, labels, icons, and group order
   (no rename, no reorder).
4. **Update `mdx/App.tsx`** — add six `case` arms in the surface switch,
   mirroring the existing K510 / PMA / CER pattern:
   ```ts
   case 'engineering': surface = <EngineeringSurface program={programForContext} onAskAna={askAna} />; break;
   case 'udi':         surface = <UdiSurface onAskAna={askAna} />; break;
   case 'postmarket':  surface = <PostmarketSurface onAskAna={askAna} />; break;
   case 'analytics':   surface = <AnalyticsSurface onAskAna={askAna} />; break;
   case 'memory':      surface = <MemorySurface onAskAna={askAna} />; break;
   case 'admin':       surface = <AdminSurface onAskAna={askAna} />; break;
   ```
5. **Merge `ui_kits/mdx/surfaces.css`** into `mdx/app.css` under the
   matching surface banner. The kit file is structured exactly the way
   `app.css` is — banners, selector order, and value formatting all match.
6. **Move `ui_kits/mdx/tokens-shim.css` tokens** (`--border-100`,
   `--border-200`, `--error-text`) **into `design-system/colors_and_type.css`**
   under "Raw Claude scales". They're referenced throughout `app.css` and
   belong with the canonical surface, not in a per-kit shim.
7. **Wire each surface to live data.** The shape contract is the kit fixture
   in `mdx/data/<surface>.ts`. Per surface:

#### Engineering (`/api/mdx/engineering/:programId`)
Returns `{ dhf: ENG_DHF[], trace: ENG_TRACE[], risks: ENG_RISKS[], ecrs: ENG_ECRS[], issues: ENG_ISSUES[] }`.
The risk acceptability lookup `ENG_RISK_ACCEPT` is org-wide policy and may
live in `c2c_risk_policy` (one row per org). The heatmap reads from there.

#### UDI (`/api/mdx/udi`)
Returns `{ devices: UDI_DEVICES[], labels: UDI_LABELS[], symbols: UDI_SYMBOLS[],
issues: UDI_ISSUES[], mri: UDI_MRI[] }`. Issues are computed server-side from
label artifacts × symbol glossary × MRI matrix.

#### Post-market (`/api/mdx/postmarket`)
Returns `{ metrics: PV_METRICS[], signals: PV_SIGNALS[], mdrs: PV_MDRS[],
capas: PV_CAPAS[], pms: PV_PMS_PLAN[], trends: PV_TRENDS[] }`. Signal source
feeds (MAUDE, FAERS, EUDAMED, support, social, literature) are existing
ingestion jobs — wire those into `c2c_vigilance_signals`.

#### Analytics (`/api/mdx/analytics`)
Returns `{ kpis: ANL_KPIS[], phases: ANL_CYCLE_PHASES[], blockers: ANL_BLOCKERS[],
reviewers: ANL_REVIEWERS[], usage: ANL_ANA_USAGE[], pace: ANL_PACE_24M[] }`.
Reviewer cohort data joins to public FDA decision data
(`fda_510k_decisions`, `fda_pma_approvals`) by product code.

#### AnA memory (`/api/mdx/memory`)
Returns `{ categories: MEM_CATEGORIES[], atoms: MEM_ATOMS[], ingest: MEM_INGEST[],
effects: MEM_EFFECTS[] }`. New tables: `c2c_memory_atoms`,
`c2c_memory_ingestion_jobs`, `c2c_memory_effects`. The `pinned`,
`importance`, `scope`, `supersedes`, and `verified` fields all index.

#### Admin (`/api/mdx/admin`)
Returns `{ kpis: ADM_KPIS[], members: ADM_MEMBERS[], roles: ADM_ROLES[],
grants: ADM_GRANTS[], sso: ADM_SSO, apiKeys: ADM_API_KEYS[], audit: ADM_AUDIT[],
settings: ADM_SETTINGS[] }`. Every mutation on this surface MUST emit a
21 CFR Part 11 audit entry; the admin audit pane reads from
`audit_logs WHERE actor_role IN ('admin') OR action LIKE 'admin.%'`.

### Tokens, copy, motion — all unchanged

- All six surfaces use only tokens declared in `colors_and_type.css` + the
  shim (`--border-100`, `--border-200`, `--error-text`).
- Claude orange (`--accent-100`) appears at most **once per screen** as an
  active selection or focal CTA. Already enforced in each surface; do not
  add extra accent usages during the port.
- Body 13px, max title 28px serif (`--font-serif`) — matches the rest
  of the MDX kit.
- Motion: 200ms ease-out, no bounce — single global rule already in app.css.
- Lucide icons only; the kit's `icons.tsx` already covers the new glyphs
  (`pin`, `upload`, `key`, `link`, `shield`, `trendingDown`). Port any
  additions verbatim.
- No emoji, no exclamation marks. Verified in every string.

### Acceptance checklist

- [ ] Six rail entries route to the new surfaces — no path falls through
      to `<InDesignSurface>` anymore.
- [ ] `MDX_STUBS` is empty (`{}`); the type signature reflects that.
- [ ] Each surface fetches live data via its hook and falls back to the
      ported fixture during load and on error (matches K510Surface's
      `live ?? fixture` pattern).
- [ ] No hard-coded colors / radii / fonts in any of the six surfaces —
      all values come from tokens.
- [ ] `colors_and_type.css` includes `--border-100`, `--border-200`,
      `--error-text` under "Raw Claude scales". The kit's
      `tokens-shim.css` is deleted.
- [ ] Existing K510 / PMA / CER / Precedent / Overview / Workbench
      surfaces unchanged. (Phase 4 is additive only.)
- [ ] No new icon library introduced; Lucide remains the only icon source.
- [ ] No console errors on any of the six routes.

---

## Inbound work — PDEV → IND (PR #550)

- **Status:** Draft PR #550 opened in `concept2cure/ClinicalSageAI-2-replit` — `PDEV_IND_DESIGN_BRIEF.md` (691 lines) imported to this project root.
- **Backend posture:** Registry · schema · services · routes (14) · AnA commands (20) · audit · governance are merged. UI is the only gap.
- **Recommended phase number:** **Phase 7 — PDEV workstream.** Cross-cuts CMC + Nonclinical + Clinical + Regulatory; rail-slotted under the Domain tier alongside `mdx` and `biopharma`.
- **Surface inventory:** 13 surfaces (Program dashboard · Workstream drill-down · Activity detail with 6 tabs · IND assembly · AI drafting workbench · Evidence picker · FDA interaction stream · Contradiction registry · Provenance trace · Approval chain detail · AnA dock PDEV context · Reason-for-change dialog · New PDEV program wizard).
- **Closed enums:** 4 workstreams · 5 stages · 14 activity lifecycle states · 5 eCTD modules · contradiction + workflow-status enums + 20 AnA commands. Activity registry (52 entries) fetched at runtime from `GET /api/pdev/registry` — do not hard-code into `data.jsx`.
- **Per-surface state-pill color map:** documented in `PDEV_IND_DESIGN_BRIEF.md §5`.
- **Build sequence:** 10 sub-phases (7.0 → 7.9), each independently shippable.
- **Open questions awaiting designer call:** 8 items in `PDEV_IND_DESIGN_BRIEF.md §9` — rail position, default view mode, provenance export shape, approval-chain configuration, reason-min-length affordance, suggestion ranking, superseded pill treatment, overview empty-state choice.

When PR #550 merges, Phase 7 is the next phase to ship — slotted between the in-design Phase 4 (artifact workbench) and Phase 5 (auth). The brief's `§8 Acceptance checklist` is the contract Claude Code verifies against.

---

## Changelog

- **2026-06-02** — MDX June bundle landed into the v2 mirror (`ui_kits/mdx/`): `PathwayPanes.jsx`, `FilesTreePane.jsx`, `AnaDrafter.jsx`, `dossier-store.jsx`, `data-pathway-tabs.jsx`, `data-correspondence-detail.jsx`, `data-submissions.jsx`, `pathway-tabs.css`, `files-tree.css`, `drafter.css` — with corrected Approvals/Audit field shapes. Reconciliation packet (rev-3, docs 00–06 + `files/`) added under `_sync/reconciliation-2026-06-02/`. Refreshes the stale 2026-04-29 snapshot so sessions stop diffing against old files. Execution-model + CI/ship-gate rules (one branch, ship on concept2cure-v2; check the live branch before porting) landed at the top of the repo-root CLAUDE.md. The Files tab is already live in `client/src/concept2cure/mdx/` — verify-and-deploy, no port.
- **2026-05-20** — Phase 7 PDEV kit shipped to `ui_kits/pdev/` (8 surfaces + 3 overlays + universal confirm dialog). Answered "yes to all" on 8 brief open questions; see `ui_kits/pdev/PHASE_7_INSTALL.md §6` for resolved defaults. Inbound work card (PR #550) closed.
- **2026-05-20** — PDEV → IND design brief inbound (PR #550). Imported `PDEV_IND_DESIGN_BRIEF.md` (691 lines) to project root. Awaiting designer review of 8 open questions (§9) before Phase 7 kit construction begins. See "Inbound work — PDEV → IND" above for the surface inventory + acceptance contract.
- **2026-05-14** — Phase 6 diagnostic-client surfaces shipped: IVD pathway, EU IVDR, CDx co-development (paired drug-device timeline), LDT compliance (FDA 2024 rule phase tracker). New rail group "Diagnostics" between Workbench and Intelligence.
- **2026-05-14** — Phase 5 must-have-for-beta surfaces shipped: Document vault (full), e-signature flow (`<EsignModal>`), audit log viewer, notifications inbox, templates (medtech corpus), quality system, ESG transmittal extension contract.
- **2026-05-14** — Phase 4 MDX lifecycle + system surfaces shipped: device engineering, UDI and labeling, post-market vigilance, analytics, AnA memory, admin and access. All six rail items now resolve to real designs (`ui_kits/mdx/surfaces/*.jsx`) instead of falling through to `<InDesignSurface>`. New per-surface data shapes documented above.
- **2026-04-21** — Phase 1 home screen finalized. Rail grew from 10 to 15 items (added Quality and Lifecycle, AnA Memory, Audit and Compliance; Reporting renamed to Reports). Precedent Intelligence removed from the rail per product direction — it will live inside the MDX workstream in a later phase.
