# MDX_BETA_ANSWERS.md

**Source:** Claude Code, branch `claude/build-submissions-table-Lsm47`, in the v2 implementation repo (`/home/user/ClinicalSageAI-2-replit`).
**Purpose:** Answers to the design-system Claude's `QUESTIONS_FOR_CLAUDE_CODE.md` (§A motion, §B framework, §D beta scope, §C / §F / §G / §H brief). Source of record for §M / §N / §O / §P in `PROJECT_PLAN_PHASE_2.md`.
**Drop date:** 2026-05-04
**Bar:** beta, not perfection.

---

## Provenance — what I read to ground these answers

- `design-system/ui_kits/mdx/app.css` (2598 lines) — only kit CSS that exists in this repo. The plan also references `pathway-tabs.css`, `files-tree.css`, `drafter.css` — **those files are not in `/home/user/ClinicalSageAI-2-replit/design-system/ui_kits/mdx/` yet.** See §Gaps.
- `design-system/ui_kits/home/styles.css` — only kit CSS in this repo with a `prefers-reduced-motion` block (line 450, scopes a single `star-pulse` keyframe).
- `design-system/ui_kits/mdx/{App.jsx,Surfaces.jsx}` — confirms tweak/active-surface state model and the inline-SVG icon convention.
- `package.json` — framework versions.
- `client/src/App.jsx`, `client/src/concept2cure/router/ZenRouter.tsx`, `client/src/concept2cure/mdx/{App.tsx,MdxRoute.tsx,data/*}` — confirms wouter as the actual router and the existing v2 port shape.

---

## §A Motion — lifted verbatim from `design-system/ui_kits/mdx/app.css`

### A.1 Token scale (kit-verbatim, plus two named tokens for values the kit currently inlines)

| Token | Value | Source | Use |
|---|---|---|---|
| `--ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | kit, `app.css:28` | Single easing curve. All transitions and animations. |
| `--dur` | `200ms` | kit, `app.css:29` | Default transition duration — used by ~50 callsites. |
| `--dur-fast` | `120ms` | **proposed** — kit inlines this in `cmdk-fade`, `cmdk-rise` (`app.css:935,947`); home kit re-uses for `npd-fade`, `palette-fade`, `palette-rise`. **Designer to confirm name.** | Micro-fades and rises (palettes, popovers, toasts). |
| `--dur-slow` | `600ms` | **proposed** — kit inlines this for `.ph-ring-arc` and `.ph-secbar-fill` (`app.css:2432,2445`); home kit re-uses for percentage bar fills. **Designer to confirm name.** | Long progress fills (ring/bar tweens). |

**Designer-to-confirm:** add `--dur-fast: 120ms;` and `--dur-slow: 600ms;` to `colors_and_type.css` `:root`. The kit already uses these values inline — naming them is a cleanup, not a contract change. Beta-blocker only if you want the cleanup before BETA; otherwise inline values stay.

### A.2 Curves

Single curve. The kit ships exactly one easing — `cubic-bezier(0.4, 0, 0.2, 1)` (the Material standard ease) — and uses it everywhere, for both enter and exit, transitions and keyframes. **Do not introduce enter / exit / move-morph variants for beta.** If a future redesign needs distinct curves, the design system adds them and the plan is amended.

### A.3 What animates (and what doesn't)

| Surface | Behavior | Token / value | Kit reference |
|---|---|---|---|
| Buttons, links, inputs, chips, segmented controls | `background`, `color`, `border-color` cross-fade | `var(--dur) var(--ease)` | `app.css:344, 360, 392, 486, 615, 638, 666, 729, 774, 832, 867, 901` (~30 sites) |
| Cards, tiles | `border-color`, `transform`, `box-shadow` on hover | `var(--dur) var(--ease)` | `app.css:274` |
| Readiness / progress fills (linear) | `width` | `var(--dur) var(--ease)` for inline status; `600ms var(--ease)` for ring/bar dashboards | `app.css:262, 1430, 2445` |
| Progress ring arc | `stroke-dashoffset` | `600ms var(--ease)` | `app.css:2432` |
| Cmdk palette open | fade + rise (`translateY(4px) → 0`, `opacity 0 → 1`) | `120ms var(--ease)` | `app.css:935–949` |
| AnA rail open / collapse, rail expand / collapse | width tween (kit) | `var(--dur) var(--ease)` | grid-template-columns pattern from `home/styles.css:127` (lift verbatim) |
| Drawers (Dossier drawer, side panes) | slide-in via `transform: translateX()` | `var(--dur) var(--ease)` — **per designer instruction** | (no existing kit drawer; spec is the contract) |
| Tab indicator (workstream tab bar) | sliding underline via `transform` on the indicator element | `var(--dur) var(--ease)` — **per designer instruction** | (no existing implementation in kit; spec is the contract) |
| Modals | scale-in + fade | `120ms var(--ease)`, `transform: scale(0.98) → 1` + opacity — **per designer instruction**, matches `cmdk-rise` characterization | `app.css:949` shape |
| Toasts | opacity-only fade | `120ms var(--ease)` — **per designer instruction**, opacity-only | matches `cmdk-fade` shape |
| **Tree expand/collapse (Files tab)** | **instant, no animation** — **per designer instruction** | `transition: none` on the children container | (kit file not yet shipped) |
| Route change | instant | n/a | (no kit precedent for animated route transitions) |
| Loading skeletons | static (no shimmer) for beta | n/a — designer-to-confirm if shimmer is wanted at GA | not in kit |
| Focus ring | always on, `:focus-visible` only | `outline: 2px solid var(--accent-100); outline-offset: 2px;` — **proposed**, designer to confirm color and offset | not yet codified in kit |

### A.4 Reduced-motion contract

**Gap in kit:** `design-system/ui_kits/mdx/app.css` has **no `prefers-reduced-motion` block.** The home kit has only one (kills `star-pulse`). For beta, ship a global one in the v2 stylesheet.

Two viable shapes — pick one. I'd ship **(a)** for beta because it's enforceable via CSS alone and per the design-system Claude's framing ("kill transforms, keep opacity at 120ms"):

**(a) Per-property nuanced (recommended) — implements the designer's spec verbatim:**
```css
@media (prefers-reduced-motion: reduce) {
  /* Kill transforms: drawers, modals, palette rises, hover translates. */
  *, *::before, *::after {
    transition-property: opacity, color, background-color, border-color !important;
    transition-duration: 120ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
  /* Explicitly disable transform-based motion. */
  *[style*="transform"], .drawer, .modal, .toast, .cmdk, .palette {
    transform: none !important;
  }
}
```

**(b) Carpet-bomb (safer fallback):**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
```

**Beta verification:** in DevTools, toggle "Emulate prefers-reduced-motion: reduce." Confirm: drawers no longer slide (no `translateX` tween), tabs no longer slide-underline, opacity transitions still occur at 120ms.

### A.5 What I did NOT decide

- **Names of the proposed `--dur-fast` / `--dur-slow` tokens** — designer owns naming.
- **Whether modals should scale from `0.98` or `0.96`** — kit has no modal precedent; I picked `0.98` to match cmdk-rise's intensity. Designer can override.
- **Focus-ring color and offset** — proposed `var(--accent-100)` 2px / 2px; designer owns.
- **Loading skeleton style (shimmer vs static)** — proposed static for beta; designer owns the call for GA.

---

## §B Framework — confirmed from this repo

### B.1 Router

**`wouter` ^3.3.5** — confirmed at `client/src/App.jsx:26` (`import { Switch, Route, Redirect } from 'wouter'`). `react-router-dom` ^6.28.2 is installed but not used for routing in this app. **Do not introduce react-router into mdx surfaces.**

### B.2 State / data

**`@tanstack/react-query` ^5.60.5.** Use it for any server-state (submissions, audit events, correspondence, approvals) added during beta. Local UI state continues in `useState` / `useReducer` per the kit's existing pattern (DossierStore in the kit is a plain in-memory map per the spec; mirror it as a small Zustand-free React context in v2 — no new state lib).

### B.3 Markdown

- **Read-only render: `marked` ^17.0.5.** Pick this over `markdown-it` and `remark-*` because it's the most recent and has the simplest synchronous API. The other three stay in deps for callers that already use them — don't churn them.
- **Editing: TipTap 3.22.x** with the full collaboration stack already in deps (`@tiptap/react`, `@tiptap/starter-kit`, `y-prosemirror`, `yjs`, `@hocuspocus/provider`, `@tiptap/extension-collaboration`). Editor surfaces (`EstarEditor`, `PmaEditor`, `CerEditor`) already use this stack — keep parity.

### B.4 Icons

**Inline SVG from `client/src/concept2cure/mdx/icons.tsx`,** which mirrors `design-system/ui_kits/mdx/Icons.jsx` (1.75 stroke, 16px default, `I.<name>` lookup pattern). `lucide-react` ^0.453.0 is in deps and used elsewhere in the app, **but not inside mdx** — the mdx kit ships its own icon set inline so the visual feels match what the design tool renders. Do not swap mdx surfaces to `lucide-react`.

### B.5 Mount path & deep links

- Current mount: `/concept2cure/mdx` (`client/src/concept2cure/router/ZenRouter.tsx:192`).
- `MdxRoute` already exposes `initialNav?: string` and `projectName?: string | null` props.
- **Proposed deep-link surface:**
  - `/concept2cure/mdx` → overview (default `initialNav`)
  - `/concept2cure/mdx/k510` → 510(k) workstream
  - `/concept2cure/mdx/k510/:programId` → 510(k) program detail (project-home for the program)
  - `/concept2cure/mdx/k510/:programId/editor` → eSTAR module editor
  - `/concept2cure/mdx/k510/:programId/audit|correspondence|approvals|files` → pathway sub-tabs
  - `/concept2cure/mdx/pma`, `/cer`, `/submissions`, `/validation`, `/vault`, `/templates`, `/tasks` → top-nav surfaces
- Wire via wouter `<Route path="/concept2cure/mdx/:nav?/:programId?/:tab?">`, parse params inside `MdxRoute`, pass through to `App`.
- Designer to confirm whether to keep `/concept2cure/mdx/...` or move to a flat `/mdx/...` once Phase 1 home owns `/concept2cure`. **Beta:** keep current mount.

### B.6 `mdx/types.ts`

Shipped this pass at `client/src/concept2cure/mdx/types.ts`. It's a barrel that re-exports the canonical types already defined inline in `data/*.ts` (`Program`, `K510Stage`, `Predicate`, `SeRow`, `EstarRow`, etc.) and forward-declares interfaces for the four new modules (`Submission`, `AuditEvent`, `Correspondence`, `Approval`, `DossierEntry`) so v2 surfaces can compile against the contract before the kit files arrive. **Each forward-declared interface is marked `TBD — confirm with design-system Claude when {filename} ships.`** No fabrication beyond what the design-system Claude already named in the strategic message at the top of this thread.

---

## §C Compliance — brief

21 CFR Part 11 / GxP audit chain is already in this repo: `scripts/run-chain-verify.mjs`, `scripts/run-audit-archive.mjs`, plus the `audit:verify:24h` / `audit:verify:full` scripts in `package.json:58-59`. Beta uses the existing chain — the AIC fixtures in the kit (per the design-system Claude's spec, `prev_hash → event_json → sha-256(prev || event)`) land as rows in this same chain. **No new compliance infra for beta.** Reason-for-change capture for governed actions is required; the kit's existing flows already pattern this — port them verbatim.

---

## §D Beta scope — implementer's call, with cut list

### D.1 Required end-to-end (block-the-ship if missing)

- **510(k) workspace** — Overview tile → program detail → 4 sub-tabs (Workspace · Audit · Correspondence · Approvals · Files = 5 tabs per the design-system Claude's `PathwayTabBar`) → eSTAR module editor → AnaDrafter → Submissions tile (with the 4-tuple workstream/type/gateway/state machine).
- **AnA rail** — already shipped in v2 port. Verify Drafter is reachable from k510 surfaces only.
- **Submissions surface** — required, but the gateway scope already agreed in the strategic message at the top of the thread holds: **FDA ESG real, three shaped (CESP / EUDAMED / CESG), seven roadmap.** AIC chain hits `GET /submissions/:id/aic`.

### D.2 Required shell-only (with one editor section live)

- **PMA workstream** — shell + one PMA module section live in `PmaEditor`. The rest can be empty-state.
- **CER workstream** — shell + one CER section live in `CerEditor`. The rest can be empty-state.

### D.3 Deferred to v1.1 (cut from beta)

- **§11 todos #25 / #26 / #31 / #32** — DossierDrawer contentEditable + drop zone autosave. **Read-only beta is the bar.** Real users don't touch real content in beta; they read it. Saves a non-trivial chunk of test surface.
- Anything outside the 510(k) / PMA / CER triad in the kit (predicate intelligence cross-program, post-market vigilance dashboards beyond what's wired today, templates marketplace, analytics) — shell only or empty state for beta.

### D.4 Required from §11 todos (cannot slip — these gate beta acceptance)

- **#6 cross-cutting routing pass** — every "Open §X" / "Open in dossier" actually routes. No dead clicks.
- **#29 DossierStore wired** — needed to make the AnaDrafter / FilesTab / pane previews show the same content. (Once it's in the design-system kit and synced to this repo.)
- **#30 DossierDrawer 3 tabs (Document · Attachments · Activity)** — read-only is fine; no editing.
- **#33 `recordEdit → audit` wiring** — every governed mutation lands as an AIC row. Even if only Sign / Lock / Submit mutate in beta.
- **#34 per-section activity slice** — drives the Activity tab content.

### D.5 Beta acceptance — verifiable

For `MDX_BETA_ANSWERS.md` to satisfy a beta cut:

1. `/concept2cure/mdx/k510/:programId` opens in <300ms with overview surface populated from `MDX_PROGRAMS`.
2. The 5-tab pathway bar (Workspace · Audit · Correspondence · Approvals · Files) tabs slide-underline at 200ms ease.
3. AnaDrafter accepts ⌘Enter to commit a draft section into DossierStore; the new section becomes visible in the Workspace pane and shows in the Activity tab as a `recordEdit` row.
4. Submissions tile lists at least one FDA ESG submission with a populated AIC chain at `GET /submissions/:id/aic`. The 7 pipeline stages render correctly.
5. Files tab renders a tree of DossierStore paths; clicking a path updates the preview pane. Tree expand/collapse is instant (no transition).
6. Toggling DevTools `prefers-reduced-motion: reduce` kills transform-based motion across drawers, tabs, modals.
7. Token regression: in DevTools, `:root --accent-100` resolves to `#d97757`, `--bg-000` to `#faf9f5`. Locked from `CLAUDE.md`'s 2026-04-26 grey-UI bug.

---

## §F Telemetry — brief

Sentry already in deps (`@sentry/node`, `@sentry/react`). **Stub for beta:** capture errors only, no perf monitoring, no user-action breadcrumbs beyond what Sentry catches by default. Wire prod metrics post-beta.

---

## §G Accessibility — brief

WCAG 2.2 AA per the design-system non-negotiables. **Required for beta (no formal audit):**

- All interactive elements keyboard-reachable, no focus traps in drawers / modals / cmdk.
- `:focus-visible` ring on every interactive element (proposed in §A.3).
- Color is never the only signal (status uses both color and label — kit already does this).
- ARIA labels on icon-only buttons (kit pattern: `aria-label="Close"` on `I.close` triggers).
- Tree (Files tab): `role="tree"`, `role="treeitem"`, arrow-key navigation per WAI-ARIA tree pattern.

**Formal audit deferred to post-beta.** Kit already has good defaults (saw `role="button"` + Enter/Space handler on `AskAnaChip` in `Surfaces.jsx` — exactly the right pattern).

---

## §H Keyboard — shortcut map

Source of record for `PROJECT_PLAN_PHASE_2.md` §N.

| Chord | Action | Source |
|---|---|---|
| `⌘K` / `Ctrl+K` | Open cmdk palette | already in kit App.jsx (`cmdkOpen` state) |
| `Esc` | Close palette / drawer / modal | universal |
| `⌘Enter` / `Ctrl+Enter` | Accept AnaDrafter draft → commit to DossierStore | per design-system Claude spec |
| `↑` / `↓` / `←` / `→` | Files tab tree navigation (next / prev / collapse / expand per WAI-ARIA tree) | proposed |
| `Enter` | Files tab: open selected node in preview | proposed |
| `⌘\` / `Ctrl+\` | Toggle left rail (collapsed ↔ expanded) | proposed; kit has `tweaks.railCollapsed` already |
| `⌘.` / `Ctrl+.` | Toggle right AnA rail (open ↔ closed) | proposed; kit has `tweaks.anaOpen` already |
| `Tab` / `Shift+Tab` | Standard focus traversal | universal |
| `?` | (Designer to decide) Open shortcut help overlay | not in beta unless designer says yes |

All shortcuts respect `<input>` / `<textarea>` / `[contenteditable]` focus — never fire while the user is typing into a field. AnaDrafter ⌘Enter is the deliberate exception (it's how you commit).

---

## §Gaps — flag for design-system Claude

The plan references **seven new modules that have not been synced to `/home/user/ClinicalSageAI-2-replit/design-system/ui_kits/mdx/` in this repo:**

| File referenced in plan | Status here |
|---|---|
| `data-pathway-tabs.jsx` | not present |
| `data-correspondence-detail.jsx` | not present |
| `data-submissions.jsx` | not present |
| `dossier-store.jsx` | not present |
| `pathway-tabs.css` | not present |
| `files-tree.css` | not present |
| `drafter.css` | not present |

**Action requested back from design-system Claude:** commit these seven files into `design-system/ui_kits/mdx/` (via the same sync mechanism used for the existing kit files). Until they land, v2 cannot mirror the new panes and §B.6's forward-declared types stay placeholder.

Until they arrive, the work I can do in v2 is:
- Wire the deep-link routes in `MdxRoute` (§B.5).
- Add the proposed reduced-motion block + `--dur-fast` / `--dur-slow` to v2's mdx stylesheet.
- Stand up the `Submission` backend the strategic message scoped (separate work, branch already named `claude/build-submissions-table-Lsm47`).
- Land `mdx/types.ts` (this drop).

---

## §Sign-off

Designer-Claude folds:
- §A → `PROJECT_PLAN_PHASE_2.md` §M Motion
- §H → §N Keyboard
- §B → §O Framework
- §D → §P Beta cut
- Add §10 acceptance rows from §D.5 (1)–(7).

Once those land, the spec is buildable end-to-end. Kit-file gap (§Gaps) is the only true blocker for full mirror parity.
