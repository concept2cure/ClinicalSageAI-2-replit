---
name: concept2cure-design
description: Use this skill to generate well-branded interfaces and assets for Concept2Cure.RI (regulatory intelligence for life sciences), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. Visual language is Claude.ai-faithful (warm cream canvas + Claude orange + Styrene/Tiempos) re-skinned for biotech/pharma reviewer workflows.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key files to consult:
- `colors_and_type.css` — the token surface. Claude.ai-exact OKLCH values, shadcn-compatible semantic layer (`--background`, `--foreground`, `--primary`, etc.), raw Claude scales (`--bg-000`, `--text-100`, `--accent-main-100`), and the licensed Styrene B / Tiempos Text / Copernicus font stack with sensible fallbacks.
- `README.md` — voice & tone, visual foundations, iconography, content examples.
- `assets/` — brand mark, agency + compliance logos.
- `preview/` — at-a-glance specimen cards for every token category.
- `ui_kits/home/` — front-door Home screen (rail + greeting + AnA briefing + launcher + ⌘K palette). Start here for any "dashboard / overview / home" work.
- `ui_kits/ana_ri/` — hi-fi React recreation of the product. Use components as reference for real surfaces.
- `ui_kits/ectd_coauthor/` — 3-pane artifact workbench (tree · chat · artifact). Reference for any System-Aware Artifact surface.

Non-negotiables (from `README.md`):
- **Sentence case** everywhere, **no emoji**, **no exclamation marks**.
- Body = 13px, max title = 18–24px. Never shout.
- Claude orange (`#d97757`) is the only strong color — used sparingly.
- 200ms ease-out motion. No bounce, no spring, no overshoot.
- Lucide icons only. Never mix icon systems.
