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
- **Sentence case everywhere** — titles, headings, buttons, menu items. Never Title Case. Never ALL CAPS except 10px metadata labels.
- **Active voice, specific verbs.** "Draft Section 2.5", not "Let's get started with drafting!".
- **No exclamation marks. No emoji.** Ever. Not in UI, not in copy, not in empty states. Emoji in a regulatory tool reads as unprofessional and will break client trust.
- **No cheerleading.** No "", "Awesome!", "You're all set!". The system never celebrates — it confirms.
- **No "Are you sure?"**. Trust the user. Destructive actions get a calm confirmation dialog with a clear action label, not a panicked one.
- **Status is factual.** "Drafting", "In review", "Approved", "Blocked", "Locked", "Ready" — these are the workflow states, and they appear as quiet stone-colored pills, not neon badges.
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
- **Canvas** is warm cream `#faf9f5`, not white. White is reserved for *elevated* surfaces (cards, popovers). This single decision sets the whole tone.
- **Accent** is terracotta `#d97757` — used sparingly, only for the primary call-to-action, brand marks, and focus rings. Never decoratively.
- **AI persona** is a muted blue `#6a9bcc` — used exclusively for the AnA assistant avatar, typing dots, and assistant message bubbles.
- **Status** colors are earthy, never saturated: olive success `#788c5d`, warm amber warning `#d97706`, muted red error `#dc3545`.
- **Neutrals** are *stone*, not gray — warm undertone. 11 steps from `#ffffff` to `#141413`. Text default is `#141413` (near-black, never `#000`).
- **Gradients** exist but are reserved for the logo / icon mark (blue→darker-blue with gold DNA helix). Never used for backgrounds of cards, buttons, or sections.

### Type
- **Chrome** (buttons, menus, labels, nav) — system sans (`-apple-system, Inter, …`). Deliberate: chrome disappears.
- **Long-form reading** (chat response, editor) — serif (`Lora` in the web client, `Georgia` in ProseMirror). Brings gravitas.
- **Mono** — `JetBrains Mono` for code, IDs, citations.
- **Size is tiny.** `text-lg` (18px) is the *max* title size outside marketing. Body is 13px. Metadata is 10px uppercase tracking-wider. Never shout.
- **Weight** tops at 600. 700+ is forbidden in chrome.

### Spacing, radius, borders
- **4px grid.** Tokens: 2/4/6/8/12/16/20/24/32/40/48/64/80.
- **Radius**: 6px (chips) / 8px (buttons, inputs) / 12px (cards) / 16px (chat composer, large panels) / 24px (dialogs) / full (avatars, pills).
- **Borders are barely visible** — `#e8e6dc` or `#f4f3ee`. The content is the interface; frames don't compete with it.

### Shadows & elevation
- Warm, subtle, never dramatic. All shadows use `rgb(20 20 19 / 0.05)` max. A card lifts 1–2px on hover, never more.
- No colored drop-shadows. No inner shadows except `inset 0 2px 4px` on form fields if at all.
- `--shadow-glow` (terracotta 10% alpha, 20px) exists only for the primary button `:focus` and the chat composer `:focus-within`.

### Backgrounds
- **Solid**, flat, warm cream. No patterns. No textures. No illustrations. No gradient meshes.
- Sidebar is `--canvas-muted` (`#f4f3ee`); page is `--canvas` (`#faf9f5`); cards are `--canvas-elevated` (`#ffffff`). That 3-layer shift does all the work.

### Animation & motion
Per the `motion-discipline` skill: **200ms ease-out by default. No bounce. No spring. No overshoot.**
- `transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1)` is the global default.
- Entrances: fade + 4–8px slide-up, 200ms.
- `prefers-reduced-motion` kills all animation to 1ms.
- Typing dots on AnA use a 2s pulse — the only rhythmic motion in the product.
- Buttons: no scale on hover. Avatars: no scale. Cards: 1px translateY(-1px). That is the entire motion vocabulary.

### Hover / press / focus
- **Hover**: background shifts one stone step darker (`--canvas` → `--canvas-muted`), or ink lightens one step. Never opacity-based.
- **Press** (buttons): no visible down-state beyond `:active` darker-bg. No scale.
- **Focus**: 2px offset outline in `--accent` for keyboards; or `box-shadow: 0 0 0 3px var(--accent-subtle)` for form fields. Never removed.
- **Disabled**: `opacity: 0.5; pointer-events: none;`. Always.

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
- Background `#ffffff` on a `#faf9f5` canvas. Border `1px solid #f4f3ee` (almost invisible). Radius `12px` (`--radius-lg`). Shadow `--shadow-xs` resting; `--shadow-sm` on hover, with `translateY(-1px)`. Padding `1.5rem`.

### Layout rules
- **Chat-first**: composer fixed at bottom when active; conversation scrolls above. Content column capped at `--content-max: 768px` — no full-bleed text.
- **Thin icon rail** (56px collapsed, 260px expanded) is the one nav authority. No second sidebar ever.
- **Topbar** is 48px — thin, never larger.
- **Mobile**: panels become fixed overlays on small screens (no nested scroll).

### Density
Professional tool, not a consumer app. Rows compact (`h-8` to `h-10` list items). Every element earns its space. No decorative whitespace padding on professional surfaces.

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
- `ui_kits/ectd_coauthor/` — **superseded by Phase 9.** Reference only — single-section conversational prototype.
- `ui_kits/authoring/` — **Phase 9.** Universal document authoring · two modes (Conversation + Workbench) over one document model, driven by `(doc_type × agency)` rule packs. Replaces every per-pathway editor.

---

## System-Aware Artifact Architecture

Per the 2026 design spec, every C2C module implements a single canonical pattern:

| Zone | Purpose | Width | Visual |
|---|---|---|---|
| **Tree drawer** | Contextual navigation (eCTD, study, submission) | 240px, collapsible | `--canvas-muted` |
| **Intelligence** | Chat with AnA, tool-use, streaming | 35% of remaining | `--background` (paper) |
| **Artifact** | Live-rendered regulatory work product | 65% of remaining | `--background`, serif |

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

- **Fonts not shipped.** Production uses **Lora** (serif body, Google Fonts — freely usable), plus an apparent intent to use **Styrene B** (display) and **Tiempos Text** (serif prose) — those two are commercial Klim Type Foundry families, identical to Anthropic's Claude. I fell back to **Inter** + **Source Serif Pro** + **JetBrains Mono** (all Google Fonts). **Please confirm the licensed display/serif choice** or upload the font files and I'll wire them in.
- **No slide template** was in the repo, so I did not invent a deck. If you have a pitch deck or board deck template, attach it and I'll produce `slides/`.
- **Only one UI kit built** — for the primary product (`ana_ri`). There is no separate marketing website or docs site in the repo. If one exists elsewhere, link it and I'll add a `ui_kits/marketing/`.
- **Logos are the repo's current set.** Several (PMDA, MHRA, NMPA, MFDS, TGA) are very minimal 127-byte placeholder SVGs — they read as tiny text marks, not proper agency logos. If you want polished vector wordmarks, we'll need to source them.
- **Icon font** — I flagged Lucide React, but marketing/static HTML currently pulls icons from `unpkg.com/lucide-static` on demand. If you'd prefer an installed sprite, I can generate one.

## What I need from you to make this perfect

**Please review the Design System tab and tell me:**

1. Is the **stone / terracotta / olive** palette the direction you want, or is the tokens.ts blue/purple version the future? They disagree in the repo; I picked the one that's actually used.
2. Do we have a **marketing website** or **docs site** outside this repo? If so, attach and I'll build the second UI kit.
3. Font licensing — confirm Styrene B / Tiempos, or pick alternatives, or let me keep Inter / Source Serif Pro.
4. Any **slide template** (pitch, board, all-hands) you want bottled into `slides/`?
