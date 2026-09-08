# MDX Workstream — Medical Device and Diagnostics

Entered from the home rail by clicking **Medical Device and Diagnostics**. The workstream is a focused workspace with its own left rail (pathway navigation), a secondary tab bar (Overview · 510(k) · PMA · CER · Precedent), and a right-docked AnA panel.

## Layout

**Three columns:**

| Column | Width | Content |
|---|---|---|
| Rail | 260 / 56 px | Workstream nav + back to home |
| Main | fluid | TopBar · TabBar · page |
| AnA Dock | 380 / 44 px | Context, suggestions, chat |

Both side columns collapse. Content stays readable between 1200 and 1600 px. Below 1200 px the AnA dock should auto-collapse (future).

## Surfaces

1. **Overview** — portfolio health strip + active program cards. Click a program to jump into its pathway workspace with that program in context (topbar pill, AnA dock context block).
2. **510(k) Submissions** — 7-stage pipeline strip, predicate search table with similarity scoring, SE matrix (subject vs predicate, verdict per attribute), eSTAR 20-section checklist with blocker highlighting.
3. **PMA Submissions** — 10-phase workflow grid, pivotal-trial metrics, 6 PMA module cards (Preclinical, Clinical, Manufacturing, Labeling, Stats, Financial).
4. **CER Generator** — FAERS/MAUDE/Literature signal table with inclusion status, literature-by-year bar chart, CER section checklist (Article 61), AnA generation plan.
5. **Precedent Intelligence** — saved queries + cross-agency pattern summary.

## Data model

All content lives in `data.jsx` so surfaces are pure presentation. Swap the arrays to drive different programs. The contract:

- `MDX_NAV_ITEMS` — rail items (workstream, work, system groups)
- `MDX_PROGRAMS` — device programs (title, pathway, stage, readiness, owners, blocker)
- `MDX_HEALTH` — portfolio metric cards
- `K510_STAGES`, `K510_PREDICATES`, `K510_SE_ROWS`, `K510_ESTAR` — 510(k) pathway
- `PMA_PHASES`, `PMA_MODULES`, `PMA_TRIAL_METRICS` — PMA pathway
- `CER_SIGNALS`, `CER_LITERATURE`, `CER_EXPORT` — CER generator
- `MDX_SUGGESTIONS` — AnA suggestions keyed by `activeNav`

## Tokens and shell

Mirrors the home kit — same `--bg-000` warm cream, terracotta accent, 13px body, Styrene B / Tiempos Text stack. Serif reserved for metric values. The only MDX-specific additions are tab bars, 7-node stage strips, predicate tables, the SE-matrix grid, and the right AnA dock.

## Non-negotiables (inherited from `/README.md`)

- Sentence case everywhere. No Title Case. No ALL CAPS except 10px metadata.
- No emoji. No exclamation marks.
- 200ms ease-out motion.
- Claude orange one focal point per view — used on active stage node, selected predicate row, active phase, AnA suggestion hover.
- Lucide icons, 1.75 stroke, 16 px.

## Phase status

Phase 2 of the product rollout. Preceded by `ui_kits/home/` (the front door). `HANDOFF.md` carries the full contract Claude Code follows when implementing.
