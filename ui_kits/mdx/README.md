# MDX kit — Phase 4 surfaces

This kit is the source-of-truth for the six MDX surfaces that ship in Phase 4 of the Concept2Cure.RI rollout: **device engineering · UDI and labeling · post-market vigilance · analytics · AnA memory · admin and access**.

Open `index.html` to review the surfaces side-by-side with the existing MDX shell.

## Layout

```
ui_kits/mdx/
├── index.html              Harness · loads React + Babel + every surface
├── app.css                 Canonical class library — mirrored 1:1 from
│                           client/src/concept2cure/mdx/app.css
├── surfaces.css            Phase 4 additions on top of app.css. Merge into
│                           app.css when porting (banners line up).
├── tokens-shim.css         3 missing tokens (--border-100, --border-200,
│                           --error-text). Move into colors_and_type.css
│                           when porting (see HANDOFF.md step 6).
├── icons.jsx               Lucide set — same names + shapes as icons.tsx
├── shell.jsx               Rail + TopBar + TabBar + AnA seam (compressed)
├── ask-ana-chip.jsx        Inline "ask AnA about this" affordance
├── app.jsx                 Harness composer · toast surfaces AnA handoff
├── data/                   Fixture data — schema contract for every hook
│   ├── nav.js              Rail items + suggestions + AnA modes
│   ├── programs.js         Portfolio (same 14 programs as codebase)
│   ├── engineering.js      DHF · trace · risks · ECRs · NCs
│   ├── udi.js              Devices · labels · symbols · MRI · issues
│   ├── postmarket.js       Signals · MDRs · CAPAs · PMS · trends
│   ├── analytics.js        KPIs · phases · blockers · reviewers · usage
│   ├── memory.js           Atoms · categories · ingestion · effects
│   └── admin.js            Members · roles · grants · SSO · keys · audit
└── surfaces/
    ├── Engineering.jsx
    ├── Udi.jsx
    ├── Postmarket.jsx
    ├── Analytics.jsx
    ├── Memory.jsx
    └── Admin.jsx
```

## Non-negotiables, enforced

Every surface in here was authored against `README.md` and `SKILL.md`:

- Sentence case in all strings (titles, headings, buttons, menu items)
- No emoji, no exclamation marks, no cheerleading copy
- 13px body, 28px serif `--font-serif` page title (Claude.ai cadence)
- Claude orange (`--accent-100`) used at most once per screen
- Lucide icons only (set lives in `icons.jsx`, same as `icons.tsx`)
- Numbers over adjectives — every status line cites counts, never adjectives
- 200ms ease-out motion, no bounce, no spring

## Harness vs. codebase

The kit harness runs in the browser via Babel-standalone:
- Each `.jsx` is wrapped in an IIFE so top-level `const`s don't collide
  (in-browser Babel evaluates all scripts in shared scope).
- Each `data/*.js` exposes its exports via `window.X = X` for the harness;
  in the codebase port these become ESM `export const` statements.
- `onAskAna` is wired to a kit-only toast that shows the message text;
  in the codebase port it routes through `useAnaChat` → `/api/ana-ri/stream`.

When Claude Code mirrors the kit, drop the IIFE wrappers and the window-global
plumbing — the surfaces become straight TSX modules.

See `HANDOFF.md > Phase 4` for the full implementation contract per surface.
