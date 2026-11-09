# Concept2Cure.RI — Design System

The visual and verbal system behind **Concept2Cure Regulatory Intelligence** and **AnA 1.0 RI** — an enterprise regulatory-intelligence platform for life sciences (biotech, pharma, medtech, CRO). Ambition: what Harvey did for law, C2C does for life sciences.

## Source materials

Pulled and distilled from:
- **Repo** — `concept2cure/ClinicalSageAI-2-replit` @ branch `concept2cure-v2`
  - `CLAUDE.md` — 42KB of non-negotiable product/design rules
  - `client/src/index.css`, `client/src/concept2cure/design/zen.css` — canonical CSS vars
  - `client/src/design-system/tokens.ts`, `motion.ts` — token definitions
  - `client/src/component-registry.ts` — 28 governed components
  - `client/src/concept2cure/components/**` — ~60 feature directories
  - `client/src/assets/logos/**` — regulatory agency + partner marks
- **Authoritative design principles** — `.claude/skills/claude-ui-design-principles.md` (12 principles), `chat-first-design.md`, `motion-discipline.md`, `microcopy-tone.md`, `accessibility-enforcement.md`, `regulatory-compliance-ux.md`

The reader may not have access to this repo — store full paths here for re-fetching.

## The product

**Concept2Cure.RI** is a React + TypeScript (Vite) app; the entire client lives under `client/src/concept2cure/` with `ZenApp.tsx` as the shell. It surfaces **AnA 1.0 RI** — a chat-first regulatory-intelligence assistant that sits on top of the **RIM** (Regulatory Intelligence Model), a proprietary non-LLM layer that accumulates regulatory judgment over time.

### Primary surfaces
1. **App shell** (`ZenApp`) — thin icon rail + top bar + conversation-centered empty state + bottom composer. This is the *one* canonical UI.
2. **AnA chat** (`AnaPersistentPanel`) — the product. Every capability is invoked through it; there is no "new screen" for features.
3. **Editor** (`UnifiedDocumentEditor` / ProseMirror / TipTap) — serif reading surface for regulatory documents.
4. **Auth** (`ZenLogin`, `ZenSignup`) — calm split-screen sign-in.

### Governed components (28)
Primitives (Button, Badge, Input, Textarea, Card, Dialog, Tabs, Select, Alert, Table, Progress, Tooltip, DropdownMenu, Switch, Checkbox, Skeleton), Layout (WorkspaceHeader, WorkspaceHeaderRich, PageTitleHeader, WorkspaceCanvas, WorkspaceStatusBadge, SectionPanel), State wrappers (DataStateWrapper, LoadingState, ErrorState), Patterns (ConversationBubble, MetricCard, ActionBar, EmptyState). The registry is the single source of truth — raw `<button>` / `<input>` are forbidden.

---

## Content fundamentals

**Voice is reviewer-grade, not marketing-grade.** The product speaks to regulatory professionals whose work is audited under 21 CFR Part 11 / GxP. Every string must feel factual enough to survive an FDA inspection.

- **Second person, direct.** "You". Avoid "we" unless referring to the company.
- **Sentence case everywhere** — titles, headings, buttons, menu items, labels, chips and table headers. Never Title Case. Never ALL CAPS. No stylesheet uppercases text (`client/src/concept2cure/v2/__tests__/foundationsSentenceCase.test.ts`). The guard allows one rule, `.rd-chip::first-letter`, which capitalises only a chip's first letter so that a printed value reads in sentence case. Text that must read in capitals, such as an agency acronym or a code, is written in capitals. Title Case is the target too: 25 `text-transform: capitalize` rules remain in 12 sheets (2026-11-09), held so the count only falls (`client/src/concept2cure/v2/__tests__/foundationsReadmeClaims.test.ts`).
- **Active voice, specific verbs.** "Draft Section 2.5", not "Let's get started with drafting!".
- **No exclamation marks. No emoji.** Ever. Not in UI, not in copy, not in empty states. Emoji in a regulatory tool reads as unprofessional and will break client trust.
- **No cheerleading.** No "", "Awesome!", "You're all set!". The system never celebrates — it confirms.
- **No "Are you sure?"**. Trust the user. Destructive actions get a calm confirmation dialog with a clear action label, not a panicked one.
- **Status is factual.** "Drafting", "In review", "Approved", "Blocked", "Locked", "Ready" — these are the workflow states, and they appear as quiet chips (`.rd-chip`), not neon badges.
- **Microcopy is specific.** Empty states describe what will appear, not "Nothing here yet!". Errors say what failed and what to try — never "Oops!" or "Something went wrong".
- **Time-of-day greeting is the only warmth.** "Good morning, {firstName}" on the home surface — once, subtle, no follow-up fluff.
- **Numbers over adjectives.** "Reviewed by 12 reviewers across 4 agencies" beats "comprehensively reviewed".

### Examples (lifted from the codebase)

| Good                                           | Bad                                       |
| ---------------------------------------------- | ----------------------------------------- |
| "What's on your mind?"                         | "Hey! How can I help you today? 👋"       |
| "Browse all capabilities →"                    | "See more awesome features!"              |
| "Draft → Review → Verify → Publish"            | "Your journey to submission! 🚀"          |
| "Section 2.5 — in review by J. Chen"           | "Almost done! 🎉"                          |
| "Submission readiness: 87% — 3 items blocking" | "Looking good! Just a few more things..." |

### Example prompts (home cards)

Seed content is drawn from `config/domain-prompts.ts` — 106 prompts across 19 domain groups. The 4 defaults on the home surface today are: *CTD section*, *510(k) precedent*, *biostat SAP*, *submission readiness*.

---

## Visual foundations

### Motif
**Calm, intelligent, restrained.** A reviewer's desk, not a marketing site. Warm cream paper, terracotta ink for actions, olive for approval, amber for review. The visual vocabulary is *Anthropic Claude* — intentional; the product openly claims inspiration.

### Color
- **Canvas** is warm cream `#faf9f5`, not white. Cards sit on it with a hairline. White (`--canvas-elevated`) is reserved for what floats: the composer, menus and dialogs. This single decision sets the whole tone.
- **Accent** is terracotta `#d97757` — used sparingly, only for the primary call-to-action, brand marks, and focus rings. Never decoratively.
- **AI persona** is a muted blue `#6a9bcc` — used exclusively for the AnA assistant avatar, typing dots, and assistant message bubbles.
- **Status** colors are earthy, never saturated: olive `--success` (`#5e6d49`), amber `--warning` (`#955d22`), red `--error` (`#b63939`). Each clears 4.5:1 on the page and on its own `--*-muted` fill, which is the chip's (`scripts/ci/check-token-contrast.mjs`). Status colour always sits beside its words or an icon.
- **Neutrals** are *stone*, not gray — warm undertone. 11 steps from `#ffffff` to `#141413`. Text default is `#141413` (near-black, never `#000`).
- **Gradients** exist but are reserved for the logo / icon mark (blue→darker-blue with gold DNA helix). Never used for backgrounds of cards, buttons, or sections.

### Type
- **Chrome** (buttons, menus, labels, nav) — the system sans (`--font-sans`: `system-ui, -apple-system, …`). Deliberate: chrome disappears.
- **Long-form reading** (AnA's answers, the document, page titles) — the serif (`--font-serif`: Lora). Brings gravitas.
- **Mono** — JetBrains Mono (`--font-mono`), only for a regulatory code the person reads (CTD §3.2.S.4.1, a sequence number), never for an internal id.
- **The root is 14px.** `.c2c-v2` sets `font-size: var(--fs-body); line-height: 1.5` (`client/src/concept2cure/v2/styles/app-v2.css`). The `--fs-*` tokens below are declared once, in `colors_and_type.css` §3, and `app-v2.css` declares none. Every size being a token is the target, not yet the fact: 1,200 `font-size` literals of 9–11.5px remain in 29 sheets (2026-11-09), held so the count only falls (`client/src/concept2cure/v2/__tests__/foundationsReadmeClaims.test.ts`).

| Token | Size / line-height | Family, weight | Use |
|---|---|---|---|
| `--fs-greeting` | 32px / 1.2 | Lora 400 | The Home greeting (D1). Declared; no rule reads it yet. |
| `--fs-title` | 26px / 1.25 (22px at 640px and under) | Lora 500, −0.01em | Page title (`.ph-title`): Projects, a project, every work area |
| `--fs-section` | 15px / 1.4 | sans 600 | Section heading (`.pj-sec-h h2`) |
| `--fs-body` | 14px / 1.5 | sans 400 | UI body, the root of `.c2c-v2`, `p`, inputs, tabs |
| `--fs-small` | 13px / 1.5 | sans 400–500 | Secondary lines, table cells, buttons, labels |
| `--fs-caption` | 12px / 1.4 | sans 400–500 | Chips, timestamps, table headers. **The floor:** no new text below 12px; the remaining literals are ratcheted down |
| `--fs-prose` | 16px / 1.65 | Lora 400 | AnA's prose (`.prose-reading`) and documents (`.doc-content`, 1.7) |

- **Weight** stops at 600. 700+ is forbidden in chrome.
- **No uppercase and no positive letter-spacing on labels.** A label is quiet by colour (`--text-300`), not by case.
- The specimen is `preview/type-body.html`.

### Spacing, radius, borders
- **4px grid.** Tokens: 2/4/6/8/12/16/20/24/32/40/48/64/80.
- **Radius**: 6px chips (`--radius-md`) / 8px buttons, inputs and tabs' focus (`--radius-lg`) / 10px the segmented track, its items 8px / 12px cards, menus and the artifact panel (`--radius-xl`) / 16px the centered dialog (`--radius-2xl`) / 20px the composer / full (avatars).
- **Borders are barely visible** — `--border` (`#dad9d4`) for hairlines, `--border-strong` on a hover. A control's edge is `--border-control` (`#7f7d75`), which clears 3:1. The content is the interface; frames don't compete with it.

### Shadows & elevation
- Warm, subtle, never dramatic. Cards have none: a hairline only, and they do not lift on hover (38 `:hover` rules still declare a transform, 2026-11-09; see *Animation & motion*).
- The composer: `0 1px 2px rgb(20 20 19 / .04), 0 6px 20px -8px rgb(20 20 19 / .10)`; in dark, `rgb(0 0 0 / .30)` and `/ .45`. Menus, dialogs and drawers: `--v2-shadow-lg` (`app-v2.css`).
- No colored drop-shadows. No inner shadows except `inset 0 2px 4px` on form fields if at all.
- No glow. `--shadow-glow` is still declared and no v2 stylesheet uses it: focus is an edge, never a glow (see *Hover / press / focus*).

### Backgrounds
- **Solid**, flat, warm cream. No patterns. No textures. No illustrations. No gradient meshes.
- The rail and quiet fills are `--bg-100` (`#f0eee6`); the page and cards are `--bg-000` (`#faf9f5`); the composer, menus and dialogs are `--canvas-elevated` (`#ffffff`, `#30302e` in dark). That 3-layer shift does all the work.

### Animation & motion
Per the `motion-discipline` skill: **200ms ease-out by default. No bounce. No spring. No overshoot.**
- A transition is `var(--dur)` (200ms) with `var(--ease)` (`cubic-bezier(0, 0, 0.2, 1)`), on the properties it changes, never `all`. 110 transitions still name `var(--dur)` without `var(--ease)` (2026-11-09); the count only falls (`client/src/concept2cure/v2/__tests__/foundationsReadmeClaims.test.ts`).
- Entrances: fade + 4–16px of slide, 200ms.
- `prefers-reduced-motion` kills all animation to 1ms.
- Typing dots on AnA use a 2s pulse — the only rhythmic motion in the product.
- Nothing new moves on hover: no `transform`, no scale, no lift, on buttons, cards or avatars. A hover changes fill, edge or ink only. 38 older `:hover` rules still declare a transform (2026-11-09); the count only falls (`client/src/concept2cure/v2/__tests__/foundationsReadmeClaims.test.ts`).

### Hover / press / focus
- **Hover**: background shifts one stone step darker (`--canvas` → `--canvas-muted`), or ink lightens one step. Never opacity-based.
- **Press** (buttons): no visible down-state beyond `:active` darker-bg. No scale.
- **Focus**: a button takes a 2px `--accent-200` outline, offset 2px. A field shows **one** ring: its own `--border-focus` edge plus a 3px `--accent-000` halo, and the global outline steps aside. The composer shows its `--border-focus` edge alone. Never removed.
- **Disabled**: a button at `opacity: .5` with `cursor: not-allowed`; a field at `.6`; the composer's send button at `.4`.

### Iconography
See **ICONOGRAPHY** section below.

### Transparency & blur
- Used exactly once: **command-palette overlay** (`rgba(0,0,0,0.4)` + `backdrop-filter: blur(4px)`).
- Never on cards, never on sidebars. No glassmorphism.

### Imagery
- **No stock photography.** No illustrated heroes. No AI-generated art.
- The only raster-ish assets are **regulatory agency logos** (FDA, EMA, PMDA, Health Canada, MHRA, TGA, NMPA, MFDS, WHO) and **compliance marks** (21 CFR Part 11, ICH GCP, HIPAA, GDPR, ISO, CE). All SVG. All used at small sizes (16–32px) inline, or 80–120px when displayed as a trust strip.
- The brand icon is a blue-gradient rounded square with a gold DNA helix. It is the only piece of "art" in the product.

### Cards
- `.pj-card`: `--bg-000`, a 1px `--border` hairline, radius 12px (`--radius-xl`), padding 16px, no shadow and no header band (`.pj-card-h` is a title row inside the card's own padding). A clickable card's hover is `--bg-050` with a `--border-strong` edge. It does not move. The specimen is `preview/components-cards.html`.

### Layout rules
- **Chat-first**: composer fixed at bottom when active; conversation scrolls above. Content column capped at `--content-max: 768px` — no full-bleed text.
- **Thin icon rail** (56px collapsed, 264px expanded) is the one nav authority. No second sidebar ever.
- **Topbar** is 48px — thin, never larger.
- **Mobile**: panels become fixed overlays on small screens (no nested scroll).

### Density
Professional tool, not a consumer app. Rows compact (`h-8` to `h-10` list items). Every element earns its space. No decorative whitespace padding on professional surfaces.

---

## Canonical classes

Each primitive has one definition, in `client/src/concept2cure/v2/styles/app-v2.css` (the block headed `D0 foundations`). The `.de` drawer family and the toast are the exception: they live in `journey-v2.css`. `__tests__/foundationsOneDefinition.test.ts` holds each primitive it lists to one stylesheet. A retired name is an alias inside the canonical rule's `:is()` list, so the screens that still use it look right meanwhile. It may only lose uses: `__tests__/foundationsRetiredRatchet.test.ts` fails if a count rises. When a count reaches zero, the alias leaves the CSS in the same commit. The owner of each file and its package are in `.design/claude-convergence/D0.md` §4.7.

| Canonical, use this | Retired: never add a use; owners rename theirs | Defined in |
|---|---|---|
| Page header: `.ph` · `.ph-eyebrow` (a quiet context line) · `.ph-title` · `.ph-sub` · `.ph-acts` | `.sp-head` / `.sp-eyebrow` / `.sp-title` / `.sp-state`, `.reg-head` / `.reg-eyebrow` / `.reg-title` / `.reg-sub`, `.cm-head` / `.cm-kicker` / `.cm-title`, `.surface-head` / `.surface-kicker`, `.pj-eyebrow`, and inline `style={{display:'flex',gap:8}}` wrappers around header actions | `app-v2.css` |
| A dynamic context line keeps its text in `.ph-sub` (a document kind and version, an organization's name). A static category label is deleted: the breadcrumb and the rail already say where you are. | Static eyebrows such as "Workspace" and "Project — collaboration" | — |
| Buttons: `.btn.primary` (one per view) · `.btn.ghost` · `.btn` · `.btn.small` | `.reg-cta`, `.landing-newproj`, `.btn.sm` | `app-v2.css` |
| Tabs: `.tabs` / `.tab` (with `role="tab"` and `aria-selected`) | `.reg-tabs` / `.reg-tab`, `.sc-ws`, `.cc-tab`, `.rbm-tabs`, `.ml-tab`, `.pd-tab`, `.ra-tab`, `.rl-tab`, `.adm-tab`, `.company-tabs`, `.rpk-tab`, `.cl-tab`, `.qms-tabbar`. (`.cm-subtab` has gone.) | `app-v2.css` |
| Segmented control: `.seg` / `.seg-b` | `.pj-seg`, `.ml-seg`, `.seg-btn`, `.qms-seg`, `.pdev-seg` | `app-v2.css` |
| Card: `.pj-card` (with `-h`, `-h-go`, `-t`, `-m`, `-r`, `-f`) | `.reg-card`, `.rbm-card`, `.py-card`, `.dj-card`, `.cv-card`, `.lic-card`, `.ph-card` | `app-v2.css` |
| Quiet figures: `.reg-kpis` / `.reg-kpi`. Better still, the figure in the lead sentence, or AnA's `/status`. | Stat tiles: Quality's four tiles, `.metric-card`, `.cv-kpi`, `.ra-kpi`, `.etmf-kpi`, `.ivd-stat`, `.py-stat`, `.rbm-tile`, the Projects stat strip | `app-v2.css` |
| Chip: `.rd-chip` with `tone-ok`, `tone-warn` or `tone-err`. A chip that prints a raw value maps it to a label first. | `.status-pill`, `.sp-tag`, `.reg-pill`, `.ml-chip`, `.pg-badge`, `.rc-chip` | `app-v2.css` |
| Drawer: `.de` (with `data-docked` for an inspector) | `.tb-detail`, the `.tt-panel` chrome, `.pdev-sheet`, `.py-sheet`, `.de-sheet`, `.ana-sheet`, `.adm-drawer`, `.risk-drawer`, RBM's AnA side panel, the editor's comments and history columns | `journey-v2.css` |
| Toast: `C2CToast` (`.de-toast`) | `.cl-toast` | `journey-v2.css` |
| Composer chrome: `.landing-composer`, `.pj-composer`, `.ct-composer`, with the send button `.landing-send` / `.pj-comp-send` / `.ct-comp-send` | Owners' composers join this list rather than keep their own chrome: `.rbm-ana-composer` (D7-C). `.ec-composer` has no owner yet. Only a field that talks to AnA is a composer: a search field, such as Reporting's "Find a report", is `.c2c-input` with a `btn ghost` beside it. | `app-v2.css` |
| Guidance lives in AnA and the composer | `StageBand`'s "What to do now" and "Next step" (`.pj-stageband*`). `CmConnectBar` ("This work flows into") and `.cm-connect*` have gone. | — |
| Composer suggestion: `.sp-starter` (keep) | — | `journey-v2.css` |
| Page container: `.page-inner` (1120px; 16px side gutter at 640px and under) | — | `app-v2.css` |
| Section heading: `.pj-sec-h` with `h2` and `.sec-sub`; a quiet label `.pj-seclbl` | — | `app-v2.css` |
| Fields: `.c2c-input` inline (32px); `.de-input`, `.de-select`, `.de-textarea` in forms (36px), with `.de-label` and `.de-desc` | — | `app-v2.css` |
| Table: `.reg-tbl` | — | `app-v2.css` |
| Empty state: `EmptyState` (`dataConnect.tsx`, `.c2c-empty-state`): one sentence, a hint, one ghost action | — | `app-v2.css` |
| Answer lead: `AnswerLead` (`.al-lead`), quiet. `emphasis="verdict"` is for the one screen where the answer is the screen. | — | `app-v2.css` |
| Centered dialog: `.cl-modal` | `.rbm-modal` | `app-v2.css` |
| Menu: `MenuButton`, `useMenu`, `MenuItem` (`client/src/concept2cure/v2/editor/DownloadMenu.tsx`). See *The one menu*, below. | — | `authoring-v2.css` (`.dlm-*`) |

### The one menu

There is one menu pattern. A menu is built from its parts, never beside them. The parts are in `client/src/concept2cure/v2/editor/DownloadMenu.tsx`:

- **`useMenu`** handles opening and closing, a click outside, and placement. The menu opens in the browser's top layer where there is one, and is placed in fixed coordinates from its button (`placeMenu`, through `menuPlacement.ts` `fixedMenuPlacement`), so no scroll box clips it. It handles the keys: the arrows, Home and End move through the items, Escape closes and returns focus to the button, and Tab closes.
- **`MenuItem`** is a `button[role="menuitem"]` (`.dlm-item`) with its label and an optional note. A disabled item stays reachable (`aria-disabled`), so its reason is read.
- **`MenuButton`** (D4-2 adds it) is the trigger and the menu together: `.dlm` > `button.btn` (`aria-haspopup="menu"`, `aria-expanded`, `aria-controls`) > `.dlm-menu[role="menu"]`.

**What is true today.** `useMenu` and `MenuItem` exist but are not exported, and `MenuButton` does not exist yet. The only menu built from them is `DownloadMenu`. D4-2 exports `useMenu` and `MenuItem`, adds `MenuButton` and a `compact` prop, and changes no behaviour (`.design/claude-convergence/D4.md` §D4.B). Until then, a menu needed elsewhere waits for D4-2. Nobody builds a second one.

Today `.dlm-menu` is `--bg-000`, radius 6px (`--radius-md`), with its own shadow. Its items are 13px, with a 12px note. D4 brings the menu to the canonical set: `--canvas-elevated`, radius 12px, `--v2-shadow-lg`, items 32px tall (44px on a touch screen).

---

## Iconography

**Lucide React** is the production icon library (imported on every screen — `Folder`, `ClipboardList`, `Globe`, `FileText`, `PenLine`, `FlaskConical`, `BookOpen`, `AlertTriangle`, `BarChart2`, `CheckSquare` are shown in `zen-app-constants.ts` alone). Stroke-based, 1.5–2px weight, 16/20/24px.

- **CDN**: `https://unpkg.com/lucide-static@latest/icons/{name}.svg` — use when rendering in mocks outside the React app.
- **In React**: `import { Folder } from 'lucide-react'`.
- **Never mix icon systems.** No Heroicons, no Feather, no Phosphor, no Font Awesome. One stroke style, one library.
- **Never emoji.** Already covered in Content Fundamentals — repeating because the temptation is strong. The product is audited; emoji in the UI is a compliance-UX smell.
- **No custom drawn SVGs** for icons except the brand mark itself (`assets/concept2cure-icon.svg`) and the regulatory agency / partner logos in `assets/logos/`.
- **Unicode arrows are OK** as navigation cues (`→`, `←`) because they're text and scale with font size. Used sparingly.

### Agency & compliance logos (shipped)
All SVG, in `assets/logos/`:
- **Regulatory agencies**: FDA, EMA, PMDA, Health Canada, MHRA, TGA, NMPA, MFDS, WHO, ICH
- **Compliance marks**: 21 CFR Part 11, ICH GCP, HIPAA, GDPR, ISO, CE
- **Partner / standards**: ASCO, NIH, ESMO, HHS, CDC, EPA
- **Brand**: `concept2cure-icon.svg` — the DNA helix on blue gradient

These are displayed as trust strips on auth / marketing surfaces and as inline signal tags inside chat responses (e.g. "FDA precedent found — 2023").

---

## Index

Root of this design system:
- `README.md` — **you are here**
- `SKILL.md` — agent invocation (works as a Claude Code Skill too)
- `colors_and_type.css` — the token surface (CSS custom props + semantic classes)
- `fonts/` — font files (currently **placeholder** — see *Caveats*)
- `assets/` — brand icon + 25 agency/partner/compliance logos
- `preview/` — individual specimen HTML cards for the design-system review tab
- `ui_kits/home/` — **Phase 1, ready to implement.** Front-door Home screen: 15-item rail (4 tiers), time-of-day greeting + composer, AnA proactive briefing, at-a-glance dashboard, module launcher, domain scope switcher, ⌘K palette
- `CLAUDE.md` — source-of-truth pointer read by Claude Code each session
- `HANDOFF.md` — per-phase implementation contracts for Claude Code
- `ui_kits/ana_ri/` — hi-fi recreation of the Concept2Cure.RI product (AnA chat-first shell)
- `ui_kits/ectd_coauthor/` — **System-Aware Artifact Architecture** · 3-pane eCTD Co-Authoring workbench (tree · intelligence · artifact) with provenance hovers, streaming reveal, and focus mode

---

## System-Aware Artifact Architecture

Per the 2026 design spec, every C2C module implements a single canonical pattern:

| Zone | Purpose | Width | Visual |
|---|---|---|---|
| **Tree drawer** | Contextual navigation (eCTD, study, submission) | 240px, collapsible | `--canvas-muted` |
| **Intelligence** | Chat with AnA, tool-use, streaming | 35% of remaining | `--background` (paper) |
| **Artifact** | Live-rendered regulatory work product | 65% of remaining | `--background`, serif |

> **In the app this is the artifact panel** (`.design/claude-convergence/D0.md` §3, "Artifact panel"). The document opens beside the conversation, as `.dcv-expanded` inside `.ct-canvas-pane` (`client/src/concept2cure/v2/styles/authoring-v2.css`). The conversation column is `clamp(340px, 34%, 520px)`, and the panel takes the rest. At 1100px and under, the document takes the screen. The panel's header (`.dcv-bar`) is 48px. It holds the title at 14px/600, the version and project line at 13px `--text-300`, and 32px icon buttons (`.btn.ed-ico`). The document reads in Lora at 16px/1.7 (`--fs-prose`). D4 owns what is inside the panel.

Rules:

- **Asymmetric grid, not centered.** 65/35 split is the default; Focus mode collapses to 100% artifact.
- **Tree first, chat second, artifact largest.** Real estate follows where the user looks longest.
- **Sandboxed artifact pane.** Artifact renders in its own render tree and never inherits chat-stream state — ready to iframe-isolate for 21 CFR Part 11 compliance.
- **Token-level reveal.** Artifact sections fade in with a 80ms stagger on append; a terracotta caret animates at the current write-head.
- **Provenance on hover.** Every artifact paragraph carries a `data-prov` hook that reveals source file, model, confidence, and audit ID. This is the hard requirement for 21 CFR Part 11 traceability.
- **Optimistic edits.** No save buttons. Autosave pill lives in the top bar ("Autosaved · v0.4 · 2 sec ago").
- **No black renderings.** Every artifact (doc, PDF preview, XML, diff) is rendered on `--background` cream, never inverted.
- **Staggered reveals, 200ms ease-out.** Bounce, spring, and overshoot are still forbidden — stagger delay is the only rhythm.

---

## Caveats (and what I need from you)

- **Fonts are decided** (`colors_and_type.css` §3, "Type — families", 2026-07-06): the system sans for chrome, **Lora** for reading and **JetBrains Mono** for codes. Styrene B, Tiempos and Copernicus are commercial and were rejected. The app loads Lora and JetBrains Mono from Google Fonts in `client/index.html`, and the specimens in `preview/` load the same two (`preview/_base.css`).
- **No slide template** was in the repo, so I did not invent a deck. If you have a pitch deck or board deck template, attach it and I'll produce `slides/`.
- **Only one UI kit built** — for the primary product (`ana_ri`). There is no separate marketing website or docs site in the repo. If one exists elsewhere, link it and I'll add a `ui_kits/marketing/`.
- **Logos are the repo's current set.** Several (PMDA, MHRA, NMPA, MFDS, TGA) are very minimal 127-byte placeholder SVGs — they read as tiny text marks, not proper agency logos. If you want polished vector wordmarks, we'll need to source them.
- **Icon font** — I flagged Lucide React, but marketing/static HTML currently pulls icons from `unpkg.com/lucide-static` on demand. If you'd prefer an installed sprite, I can generate one.

## What I need from you to make this perfect

**Please review the Design System tab and tell me:**

1. Is the **stone / terracotta / olive** palette the direction you want, or is the tokens.ts blue/purple version the future? They disagree in the repo; I picked the one that's actually used.
2. Do we have a **marketing website** or **docs site** outside this repo? If so, attach and I'll build the second UI kit.
3. Any **slide template** (pitch, board, all-hands) you want bottled into `slides/`?
