# D4-7: the review board, the document journey and the authoring engine on D0's page pattern (2026-11-09)

**The spec.** `.design/claude-convergence/D4.md` §D4.J. The other D4 screens take the one work-area page pattern
(plan §2, D0 §3):
- a `.ph` header with one primary;
- canonical list and table content;
- guidance in AnA.

## Before

- **Review board:**
  - a "Project · review" eyebrow;
  - three bordered filter buttons, with an inline `on` style;
  - a project toggle that read "Only {project}" or "All projects · {project}";
  - "THREADS & CHANGE REQUESTS — ASSIGNED TO YOU · {PROJECT}", uppercased by CSS.
- **Document journey:**
  - a "Workspace · authoring" eyebrow;
  - an orange "Continue with AnA";
  - "Open in editor" as a small button in the stage pane, which opened the editor's list (F1, below).
- **Authoring engine:**
  - a "Biotech & Pharma · authoring" eyebrow;
  - an orange "Draft with AnA" beside the page's primary;
  - a row of bordered claim pills.

## What already exists (RULE 3)

- **`surfaces/Review.tsx`.** `PageHead`, `ScopeBar` and `openReviewDocument`.
- **`surfaces/ReviewThreads.tsx`.** The inbox and its heading.
- **`surfaces/DocJourney.tsx`.** The journey, its quiet figures (`.reg-kpis`, already D0's) and the read-only preview.
- **`surfaces/AuthoringEngine.tsx`.** The static explainer.
- **D0's primitives** (app-v2.css), all reused:
  - `.ph`, `.ph-title`, `.ph-sub` and `.ph-acts`;
  - `.seg` and `.seg-b`;
  - `.pj-sec-h` with `h2` and `.sec-sub`;
  - `.btn.ghost` and `.btn.primary`.
- **D0 §4.2.17** already neutralised `.scaf-note`, the engine's orange-ruled banners. D0 already made `.reg-kpi`
  borderless.

Nothing new is added. One rule is added (`.rv-scopes`, the scopes' row) and one is retired: the phone rule that wrapped
the old project toggle.

## The change

| Screen | Now |
|---|---|
| **Review board** | `PageHead` has no eyebrow, and its action slot is `.ph-acts`. The three scopes are one `.seg` group labelled "Show reviews", with `.seg-b`, `aria-pressed` and `data-on`, and no inline style. The project switch is a second `.seg` labelled "Projects": "This project" and "All projects", with the project named in the first item's tooltip and never by its id. The inbox heading is `.pj-sec-h` with "Threads and change requests assigned to you" and its counts in `.sec-sub`. |
| **Document journey** | `.ph` with no eyebrow. "Continue with AnA" is `btn ghost`. The page's one primary is "Open in editor" in `.ph-acts`, which opens this document (F1) and is shown once, only when there is a document. The stage pane's duplicate button and its `.dj-stage-acts` rule are gone. The preview's prose takes the editor's type: `var(--font-serif)`, `var(--fs-prose, 16px)` and line height 1.7. The paper's ink stays. |
| **Authoring engine** | `.ph` with no eyebrow. "Draft with AnA" is `btn ghost` in `.ph-acts`, and the systems tab's "Draft this" is `btn ghost small`. The claims are quiet words with a check, at `--fs-small`, not bordered pills. The one primary stays "Open the document editor". |

**Departures:**
- **The project switch is two items with fixed labels, not one toggle.** The spec writes one
  `btn ghost small rv-scope-program` whose label is `{onlyProgram ? 'This project only' : 'All projects'}`. A toggle
  whose label changes with its state is announced backwards: "All projects, toggle button, not pressed" while every
  project is showing (WAI-ARIA APG, button pattern). A ghost button also has no pressed look once the inline style
  goes. Two `.seg-b` items keep both labels fixed and use D0's pressed style.
- **The journey's "Open in editor" moved to the header, not copied there.** One primary, once.

## Red, then green

- **Red at HEAD:**
  - `red-at-head-review.txt`: reviewBoard › "the work-area page pattern (D4-7)", 4 of 4 failing (the eyebrow present,
    no "Show reviews" group, no "Projects" group, no section heading);
  - `red-at-head-journey-look.txt`: docJourneyPreviewIsHonest › the eyebrow present, and no editor-type rule;
  - `red-at-head-engine.txt`: authoringEnginePage, the eyebrow present, and the pill rule.
- **Tests re-pointed, because they pinned names this change moves:**
  - `reviewBoard`: four cases find "This project" or "All projects", and read the project's name from the tooltip.
    The RR5 guarantee (never the id) is kept.
  - `reviewRoutePhoneWidth`: the wrap rule for the old toggle is replaced by the `.seg` markup, which scrolls inside
    itself.
- **Green:**
  - 47 suites that render these screens or read their stylesheets, 570 of 570;
  - the D0 stylesheet-wide suites, 22 files, 317 of 317.
- **Gates:** `ci:undefined-css-classes`, `ci:check-css-selector-shadowing`, `ci:surface-text-ramp` and
  `ci:design-system` pass. ESLint warnings per file equal trunk's.

## In the running app

`d47.cjs`, `d47-review.json`, `d47-journey-engine.json` and the screenshots. The walk stack ran this tree's
`client/src`, `shared/` and the journey assembler.

| Case | Result |
|---|---|
| Review 1440 light and dark | No eyebrow, and no visible uppercase text. The scopes are `.seg`; the pressed item is `--bg-000` in light and `--bg-200` in dark, not the accent. The project switch reads "This project", with the project in its tooltip. The inbox heading is in sentence case, "0 threads · 0 tasks". |
| "Requested by me" (1440 light) | Pressed, and the board is read again as `/api/review/board?scope=requested&programId=c2ed888d…`. |
| Review 390 | No sideways page scroll. The scopes' `.seg` is 359 px of content in 358 px and scrolls inside itself. The project switch wraps to its own line. |
| Journey 1440 light and dark | No eyebrow. One primary, "Open in editor". The four figures have `0px none` borders and no fill. "Open in editor" lands in the page placement on this document (F1). |
| Engine 1440 light | No eyebrow. One primary, "Open the document editor". "Draft with AnA" is a transparent `btn ghost`. The claims have no border and no radius, at 13 px. |

The review board ran with the launch scope enforced. The journey and the engine are outside the launch scope (behind
the flag, `shared/constants/launch-scope.ts`), so they ran on the same stack with `LAUNCH_SCOPE_ENFORCE=off`, and the
server was then restarted with it on.

**Not walked:** the preview's prose type. The walk database's journey has one stage, "Created", which renders the
brief table, not the document page. The rule is pinned by `docJourneyPreviewIsHonest` › "sets the preview prose in the
editor's type".

## Seen, not changed here

- **Review 390.** The inbox counts wrap inside `.sec-sub` ("0 threads · 0" / "tasks") beside a two-line heading.
  `.pj-sec-h` is D0's shared row, so the fix is for D0.
- **Engine.** The pipeline's "Draft" and "Validate" cards are tinted (accent and success fills). §D4.J limits this
  screen to the header, chip and banner migrations. Whether to retire the static page is §D4.M's founder question.
- **Journey.** The current stage reads in the accent in the rail ("Created", and its dot), and in `--warning` in the
  figures. That is the journey's stage tone, not a §D4.J item.
