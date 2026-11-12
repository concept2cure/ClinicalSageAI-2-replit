# D7-B Quality: one work area, no app chrome, no cards (2026-11-06)

Package **D7** (`.design/claude-convergence/D7.md` §B). Completes `client/src/concept2cure/quality/App.tsx`.

The founder, 2026-11-06: *"We don't have apps anymore. We just have the core product. The quality is a major part of
the product. I just don't want separate apps or cards."* Quality was the last work area that still read as an app of
its own: its own topbar with crumbs and an "Ask AnA" button, a "Workstream" eyebrow over a serif "Quality system"
title, four stat tiles, nine per-document-type cards, and icon tabs. Each register tab repeated the same: its own
title, its own "Ask AnA" and its own tiles.

## What already exists (RULE 3)

Searches run: `quality/App.tsx`, `quality/SopRegister.tsx`, `quality/ChangeControl.tsx`, `quality/QmsRecords.tsx`,
`quality/Kpi.tsx`, `quality/TrainingCoverage.tsx`, `quality/ControlledDocumentDialogs.tsx`, `quality/app.css`;
`qms-topbar|qms-head|qms-eyebrow|qms-kpi|qms-tpl|qms-tab` across `client/src`; the work-area rules in
`v2/styles/app-v2.css` (`[data-work-area]`, `.ph`, `.sp-starters[data-layout=row]`, `.tabs`, `.pj-sec-h`, `.sec-sub`,
`.seg`); the CMC and Vault work areas that already follow D5 §WA.

| Piece | Path | Before | After |
|---|---|---|---|
| Shell | `quality/App.tsx` | `.qms-topbar` (crumbs, "Ask AnA"), `.qms-tabbar` with icons, `.qms-page-inner` max 1240 | `.page-inner[data-work-area=quality]`: `header.ph` ("Quality", one sentence), the starter row, `.tabs` (text only, same keyboard handling), then the tab. The one editor takes the page unchanged when a document is open. |
| SOP register | `quality/SopRegister.tsx` | Eyebrow, serif title, 3-line description, two header buttons, four `Kpi` tiles, "Build from the Quality system library" with nine cards | One `section.pj-sec` "Controlled documents": the figures as one sentence (`qms-register-figures`), the status filter as a `.seg`, "New controlled document" as the one primary |
| Training | `quality/TrainingCoverage.tsx` | The fourth tile carried coverage | The section's own line carries it (`qms-coverage-figure`) |
| Change control | `quality/ChangeControl.tsx` | Own eyebrow and h1, "Ask AnA for a health check", four tiles, two form cards | The lifecycle section carries the figures and "Raise change request"; the health check is a starter; the two forms are quiet buttons |
| Records (CAPA … management reviews) | `quality/QmsRecords.tsx` | Own eyebrow and h1, "Ask AnA", tiles | One section per register: its figures as one line, its one create |
| Tile component | `quality/Kpi.tsx` | Rendered the tiles | **Deleted**: nothing renders a tile now. Its outcome, the figures, is the sentence in each section head (`QualityWorkArea.test.tsx`, `SopRegisterApproval.test.tsx`, `sopRegisterReadHonesty.test.tsx` pin it). |
| New controlled document | `quality/ControlledDocumentDialogs.tsx` | Template option showed the label only | Each option shows its number prefix; the chosen template's description is the line beneath; choosing one names an untitled document after it, as the card did |
| Styles | `quality/app.css` | Topbar, head, eyebrow, tiles, cards, old tab bar, five uppercase rules | Deleted; section heads take D0's sans section size; `.qms-page` gives no gutters of its own (`.page-inner` does) |

## Capability kept (nothing removed without its replacement)

| Removed | Where its outcome lives now |
|---|---|
| Topbar "Ask AnA" (`ASK_STARTER[tab]`) | The first starter, "Give me a read-out on …", same prompt per tab |
| "Ask AnA for a pre-inspection check" | The second starter, same prompt (`PRE_INSPECTION_PROMPT`) |
| Change control's "Ask AnA for a health check" | The third starter on that tab, same prompt (`HEALTH_CHECK_PROMPT`) |
| Records tabs' "Ask AnA" (`config.ask`) | The first starter (`ASK_STARTER` already spreads `QMS_RECORD_ASK`) |
| Four SOP tiles, each with its unread arm | The register sentence: "The register could not be read." / "Reading the register…" / nothing for an empty register / "N controlled documents: … ; none overdue for review." |
| Coverage tile | The training section's line, same words: the server's average, or why there is none, never 0% |
| Change-control and record tiles | Each section's figure line; an empty change log says "No changes in the log yet." (finding 112: no vacuous "none overdue") |
| Nine library cards | The template field of the one "New controlled document": nine types, each with its prefix and description (RULE 4: a document type is data) |

## Deviations from D7.md §B, and why

1. **The figures go in the register section's `.sec-sub`, not the header's `ph-sub`.** The header is shared by eight
   tabs; SOP figures under it would be wrong on the other seven. Each register states its own.
2. **The one create is in its section's `.pj-sec-acts`, not `.ph-acts`.** D5 §WA's rule for tabbed areas whose create
   differs per tab; it keeps each create beside the register it adds to, with no cross-component lifting.
3. **No "Pre-inspection check" header button.** The starter is the same request; two doors to one prompt is the
   duplication the pattern removes.
4. **Starter labels keep acronyms** ("SOP register", "CAPA") where D7.md lower-cased the whole tab name.

## Acceptance (measured in the running app)

The app was run locally (Postgres 16, RLS on, the runtime role, `ALLOW_DEV_AUTH`). The walk was
`w3-design.cjs` (helpers in `lib.cjs`, password from the environment). Measurements are in `w3-design.log.json`.

| Check | 1440 light | 1440 dark | 390 light | 390 dark |
|---|---|---|---|---|
| `h1` on the page | `Quality` only | same | same | same |
| Second topbar / tiles / type cards | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Uppercase text in the work area | none | none | none | none |
| Page scrolls sideways | 0px | 0px | 0px (was +520px) | 0px |
| Title on one line | 33px | 33px | 28px | 28px |
| API errors / page errors | none | none | none | none |

On each tab (Change control, CAPA, Management reviews), the page still has one `h1`, and the starters follow the tab.
The template field offered the nine types with their prefixes, from "Quality manual (QM-)" to "Training curriculum
(TC-)". Choosing the first set Title "Quality manual" and type `manual`.

Tests: red before the change (`red.txt`, 19 failing across the five suites that pin the new layout), green after
(`green.txt`: 30 files, 330 tests across `quality/**`, `sopRegisterReadHonesty`, `anaDrivesWave4`). Gates:
`ci:undefined-css-classes`, `ci:one-product`, `ci:check-phantom-tokens`, `ci:check-shell-css-collisions`,
`ci:design-system` and `ci:surface-text-ramp` (regenerated: `.qms-tb-btn` left the ramp) pass.
`ci:check-css-selector-shadowing` fails identically on the base, in files this change does not touch.

## Not done here (next, same package)

- **Register rows are 192px tall** (`shots/w3-sop-1440-light.png`): every row action is stacked in the last cell.
  D7-B item 6 (Open, the next step, and "More" revealing the rest in the row) touches about 40 test sites and is the
  next commit.
- The boxed sub-panels that remain inside the tabs (periodic review, the change-control lifecycle strip, "How to raise
  a change") are reviewed in the sweep that follows this commit.

## Screens

`shots/`: the SOP register at 1440 and 390, light and dark; Change control and CAPA at 1440; Change control at 390;
"New controlled document" with a template chosen.
