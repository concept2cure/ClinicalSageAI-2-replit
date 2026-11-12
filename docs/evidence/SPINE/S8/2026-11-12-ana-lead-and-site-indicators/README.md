# Risk-based monitoring: AnA leads the screen, and the board shows the readings it already held (2026-11-12)

Launch row D2. Plan packages **D7** (D7-C, the work-area pattern for RBM, `.design/claude-convergence/D7.md` §C) and
**S8** ("risk-based monitoring … runs over the project's study data"). The founder, 2026-11-12: *"Finish the RBM
module — enhance the UI experience and place AnA chat prominently more, seek to offer everything from CluePoints. Do
not build a new module ever, this is building out what we have."*

Nothing new was added: no screen, route file, service, table, mount, engine or AnA tool (RULE 6). Every change
finishes an existing file. What would need something new is listed at the end, for a founder decision.

## What already exists (RULE 3)

Searches run: `rbm`, `RBM`, `risk-based`, `KRI`, `QTL`, `RACT`, `central monitoring`, `site risk`, `oversight`,
`patient profile`, `signal` across `client/src`, `server/routes`, `server/services`, `server/api`, `shared/schema*`,
`migrations/`, `db/migrations/`, the AnA tool inventory (`server/services/ana/ana-launch-scope.inventory.json`), the
plan (`docs/design/ONE_DESIGN_PLAN.md`), the design record for this screen (`.design/claude-convergence/D7.md` §C)
and the earlier evidence (`docs/evidence/SPINE/S8/2026-11-11-site-risk-from-study-data/`,
`docs/evidence/D2-RBM-NAVIGATION/`).

| Path | What it does | What it did not do |
|---|---|---|
| `client/…/surfaces/Rbm.tsx` | The work area: project picker, ten tabs, the live board, its own AnA conversation grounded on the board | Was not on the work-area pattern (plan §1a: "It is not on the one work-area pattern (D7)"): an uppercase eyebrow, a three-sentence description, a "PROJECT" caption, four link cards; AnA closed was a sideways strip; below 1100px her panel dropped under the whole board |
| `client/…/surfaces/RbmSurfaces.tsx` `RbmAnaDock` | AnA's real streaming conversation for the study, with Part 11 sign-offs | A 352px panel titled "AnA — RBM co-monitor"; printed her answer as raw text, so `##`, `-` and `**` reached the reader; said "the same 9 RBM tools", a count nothing keeps true |
| `client/…/surfaces/RbmSurfacesA.tsx`, `RbmSurfacesB.tsx` | The ten tabs: overview, risk review report, RACT, KRIs, QTLs, central monitoring, patient profiles, site risk, site oversight, monitoring plan; every write goes to the server and the board is re-read | Every tab was handed the conversation's sender (`onAsk`) and only the report used it; the KRI tab said "per-site … drilldown [is] not implemented"; notes printed `kriStatus()`, `buildRiskReview`, `generate_rbm_report`, `MIN_COHORT`, `site_visit`; site oversight was captioned with another vendor's product name; central monitoring's note described the scan as it was before `7e4284cc5` |
| `server/services/rbm/site-risk-engine.ts` | Scores each site from the study's own site-level indicator readings and stores every reading behind the composite, with its band, on the row (`metadata.indicators`) | — |
| `server/routes/mdx-rbm-board.ts` | The board read-model the screen renders | Sent only the counts of those readings (`basis`: "1 red · 1 amber"), so no screen could show which indicator, at what value |
| `server/services/rbm/risk-report.ts` `renderRiskReviewMarkdown` | The risk review as text; the board has always carried it (`reportMarkdown`) | No screen offered it as a file: "Ask AnA to export markdown" was the only way |
| `server/services/rbm/central-statistical-monitoring.ts`, `metric-ingestion.ts`, `rbm-engine.ts`, `rbm-actuator.ts` | The engines: cross-site outliers per indicator, patient anomaly scoring, extract loads with provenance, KRI and QTL banding, versioned and signed assessments and plans | Unchanged here |
| `client/…/styles/app-v2.css`, `journey-v2.css` | The shared work-area header (`.ph`), tabs (`.tabs`), docked inspector and drawer (`.de`), two-column split (`.wa-split`), starters (`.sp-starter`), composer chrome | RBM used none of them |

Deleted history (`git log --all --diff-filter=D` on `*Rbm*`, `*rbm*`): the three retirements the 2026-10-30 record
already lists; nothing that this work rebuilds.

## What changed

**AnA leads the screen** (`Rbm.tsx`, `RbmSurfaces.tsx`, `rbm-v2.css`, `app-v2.css`; D7-C with the founder's
direction of 2026-11-12 in place of its "closed by default").

- The header is the one work-area header: back to the project, the title, one sentence that carries the study's
  size ("…for the study: 8 sites, 12 subjects scored."), the project picker and an **AnA** button. The eyebrow and
  the "PROJECT" caption are gone (plan §2, retired patterns).
- Where the window has room (1024px and wider) the conversation is **open on arrival**, in the shared docked
  inspector (360px; 400px from 1600px). The page frame widens to 1440px, since it holds a board and a
  conversation side by side. Before the first turn it asks "What should we look at in LMN-201?", says which
  tab it is reading and offers that tab's suggestions. Her answers render as prose through `AnaMarkdown`, the one
  renderer every other host uses, in the reading serif.
- The header's AnA button closes and opens it. **Closed, her composer and the tab's suggestions sit directly under
  the title**; a question opens the conversation and sends. There is one composer on the screen at any time.
- On a narrow window the conversation no longer drops under the board: it waits behind that composer and opens as
  the shared drawer (scrim; Escape closes it).
- The composer is the shared composer chrome with the screen's one orange control, the send button.
- **Every finding goes to AnA from where it is shown**: an attention item, an indicator, a breached or approaching
  limit, a signal, a subject, a site, a site's oversight, the plan's actions. The button sends a question that
  names the item. AnA answers from the board she is grounded on and from the monitoring tools; no figure is typed
  into the question that she would have to trust.
- The ten tabs are the shared tabs, all visible: one row where they fit, wrapping where they do not, a scrolling
  row on a phone. The four doors (project, Vault, tasks, biostatistics) stay, as one
  quiet line (P-122: nothing a screen offered is removed).

**The board shows the readings it already held** (`mdx-rbm-board.ts`, `rbmBoard.ts`, `RbmSurfacesA.tsx`,
`RbmSurfacesB.tsx`).

- The board sends each site's indicator readings as the engine stored them (`sites[].indicators`: indicator,
  value, unit, the engine's band, limits, direction, data cut-off). It computes nothing, checks each entry on its
  own, and guesses no band.
- **Site risk** gains "Indicators by site": every site against every indicator read there, the reading and its
  band in each cell. The band is written as well as coloured, and a site that has not read an indicator says "Not
  read". The screen never bands a value: a cell takes the band the engine stored.
- **Key risk indicators** gain "By site" on an indicator that any site has read: each site's latest reading, worst
  first, with the data cut-off. The note no longer says a per-site view is not implemented; it still says limits
  derived statistically and readings by country are not available.
- **Risk review report** gains "Download": the report text the board carries, as a Markdown file named for its
  date. "Ask AnA to export markdown" and "Print" stay.

**Words** (`RbmSurfacesA.tsx`, `RbmSurfacesB.tsx`). The notes say what the engines do in a monitor's words: no
function, tool or enum name, no count of tools, no other vendor's product name. Central monitoring's note describes
the scan that runs for the study: indicator by indicator where the sites were scored from the study's indicators,
on the four risk scores where they came from Site Intelligence. The sentence that stood in the header ("Every score
is engine output…") is under the overview's figures.

## Zero capability loss (plan §2, P-122)

| What the screen showed | Where it is now |
|---|---|
| Eyebrow "Clinical — risk-based quality management" | Removed: a retired pattern (plan §2). The title and its sentence say the same. |
| Three-sentence description | One sentence in the header; "Every score is engine output…" under the overview's figures, visible. |
| "PROJECT" caption over the picker | The picker's own accessible name and its first option. The picker is unchanged. |
| "N sites — N subjects scored" under the picker | In the header's sentence. |
| "Linked to" cards (project, Vault, tasks, biostatistics) | The same four buttons, same targets and names, as one quiet line. Not removed. |
| Dock open by default | Still open by default where it fits beside the board. |
| Sideways "AnA" strip when closed | The header's AnA button, and the composer under the title. |
| Dock starters | In the conversation before the first turn; in a row above its composer once it has turns; under the title when it is closed. |
| "On this surface" + tools note | In the conversation before the first turn; the header's subtitle names the study and tab throughout. The count of tools is not repeated. |
| Dock below the board under 1100px | A drawer over the board, opened from the composer or the AnA button. |
| Every tab's notes | All kept, reworded; none deleted. |

## Verified

Red first: the three new test files against the code before this change, 28 of 34 cases fail as they stood then
(`red/new-tests-against-the-old-code.txt`; the six that pass pin behaviour that did not change).

| What | Where | Result |
|---|---|---|
| The board's site readings, pure | `server/routes/__tests__/mdx-rbm-board-site-indicators.test.ts` (4 cases) | Stored order kept; a band never recomputed; a malformed entry dropped alone; none for a Site Intelligence row |
| The header, the conversation open, closed, on a narrow window, and the panel | `client/…/__tests__/rbmAnaLead.test.tsx` (13 cases) | Pass |
| Indicators by site, by-site readings, Ask AnA on each finding, the report file, the words | `client/…/__tests__/rbmBoardFindings.test.tsx` (17 cases) | Pass |
| Every RBM client suite, the board route suites, the report engine, the dock's run-policy note and the retired-name ratchet | 20 files | 266 pass |
| The retired-name ratchet | `foundationsRetiredRatchet.test.ts` | Failed when the new table used `rbm-card` (8 against a baseline of 7); passes on the canonical card. Baselines lowered: `rbm-tabs` 1 → 0 (rule deleted), `reg-tabs` 11 → 10, `reg-tab` 13 → 12 |
| Gates | `ci:undefined-css-classes` (failed on an unstyled class, then fixed), `ci:class-vocabulary`, `ci:surface-text-ramp`, `ci:one-product` | Pass |

**In the running app**, as the Lumen lead on LMN-201 (database provisioned and the Lumen pack seeded from zero in
this session; 1440×900 and 390×844; Chromium):

- Arrival at 1440 (`overview-1440.png`): the header sentence reads "…for the study: 8 sites, 12 subjects scored.";
  the conversation is open beside the board, "LMN-201 · Overview", "What should we look at in LMN-201?", with the
  overview's three suggestions. One composer on the screen. All ten tabs visible.
- "Ask AnA" on the first attention item (`ask-ana-from-a-finding-1440.png`): the question appears as the person's
  turn, naming the signal; the record of her work appears with the turn.
- "Close AnA" (`conversation-closed-1440.png`): the board takes the full width (six figures in one row), and her
  composer and the suggestions sit under the title.
- Site risk (`site-risk-indicators-by-site-1440.png`, `-390.png`): "Indicators by site" lists the eight sites
  against AE reporting lag and Open query aging: 104 "21 Red", "58 Red"; 106 "5 Amber", "16 Amber"; 103 "4 Green",
  "14 Amber"; the other five green. The same readings as the drivers above it.
- Key risk indicators (`kri-by-site-1440.png`): "By site — 8" on the two indicators that sites have read; opened,
  Open query aging lists 104 at 58 days Red first, then the two amber sites, then the green ones, each with the
  data cut-off 2026-11-10. The six indicators with no site rows offer nothing to open.
- Risk review report: "Download" saved `risk-review-2026-11-12.md`, 1,990 bytes, beginning "# Risk Review — ICH
  E6(R3)". The title printed the stored code in capitals ("ICH_E6R3"); `risk-report.ts` now names the framework.
- At 390 (`overview-390.png`, `drawer-390.png`): the conversation is closed on arrival and the composer is the
  first thing under the title; a suggestion opens the drawer and sends; Escape closes it. The tabs are one
  scrolling row.
- All ten tabs at 1440 and three at 390: no console error, no page error, no failed request, and the page does not
  scroll sideways.

**Found by opening it, and fixed:** the progress card covered the greeting, and an empty conversation scrolled to
its end; the header's controls wrapped under the title (the shared input is full width); the conversation named
the study by its full title, three lines long; three indicator cards across ran under the conversation; the
shared tab row hid "Site oversight" and "Monitoring plan" at 1440 with no cue, so the row wraps above phone width
(a departure from D7 §C.4.5, for P-122); the docked panel's header slid under the top bar when the page scrolled.

## Offering what CluePoints offers: where this stands

Read from CluePoints' own published product pages on 2026-11-12 (vendor descriptions, not verified features).
"Have" means the capability is in the product and reached on this screen.

| CluePoints | Here | Status |
|---|---|---|
| Risk assessment (RACT) | Risk assessment tab: CtQ register, likelihood × impact matrix, residual risk, owners, versioned and e-signed, amendments | Have |
| Key risk indicators, sites ranked | KRI tab with limits, trend and, from today, each site's reading; Site risk ranks sites and shows every indicator by site | Have. Not there: limits derived statistically, country level |
| Quality tolerance limits, breaches documented | QTL tab: limits, early-warning band, breach response | Have, upper-bound only. Not there: lower-bound and two-sided limits; a structured breach record |
| Central statistical monitoring (data quality assessment across all clinical data) | Central monitoring: each site-level indicator compared across sites with a robust score; signals raised | Partly. It compares the indicators loaded for the sites, not the subject-level clinical data |
| Signal and action tracking | Signals inbox (triage, investigate, dismiss, escalate) tied to plan actions | Have |
| Site Profile & Oversight Tool | Site oversight: risk joined with open signals, visits scheduled as plan actions | Have. Not there: the visit report, findings, follow-up letter |
| Patient profiles | Patient profiles: subjects ranked by atypicality with the dimensions behind the score | Partly. Not there: the subject's timeline of visits, exposure, adverse events and medications |
| Monitoring plan | Monitoring plan: generated from the RACT, versioned, e-signed, actions tracked | Have. Not there: methods per critical process, SDV/SDR rules |
| Risk review reporting | Risk review report, on screen, printable, downloadable, and from AnA | Have. Not there: a versioned, filed review record |
| Assistant | AnA beside every tab, grounded on the board, running the monitoring tools, with Part 11 sign-off | Have; CluePoints has no equivalent on its RBQM screens |
| Medical & safety review | — | Not there |
| Duplicate-patient detection | — | Not there |
| Audit-trail review (timestamp patterns) | — | Not there |
| Intelligent medical coding (MedDRA, WHODrug) | — | Not there |
| Intelligent query detection, queries posted to the EDC | — | Not there |

**Each "not there" needs something RULE 6 forbids a session to add** (an engine, a table, a route file or an AnA
tool), so each is a founder decision (`approvedAdditions`, `Plan: PLAN`, `Founder-Decision: P-<n>`). In the order a
paying monitoring team would feel them:

1. Central monitoring over subject-level data (labs, adverse events, visit dates): a new engine over the data room's
   study data. The largest gap against CluePoints' core claim.
2. The subject timeline in patient profiles: reads the same study data; no new engine, but a new read.
3. Lower-bound and two-sided QTLs, and a structured breach record: a column and an engine change.
4. Duplicate-patient detection and audit-trail review: new engines.
5. Medical & safety review, medical coding, query detection: new modules. The founder's instruction of today rules
   these out ("do not build a new module ever").

## Open

- **AnA's answers were not exercised.** This container has no AI provider, so every turn answered "No AI provider
  is configured for this deployment, so AnA cannot answer" (HTTP 503 from `/api/ana-ri/stream`). What was verified
  is that each question is sent, appears as the person's turn, and that the failure is said plainly. That her
  answer renders as prose is covered by the component test only.
- The downloaded report still names the project by its record id ("Program: a581182c-…"): the report engine is
  given no project name. Not changed here.
- The site names in a signal or an indicator carry the demo's "[Demo · Lumen]" prefix; that is the seed's naming.
- Dark theme and the governed approval dialogs were not re-walked; their markup is unchanged.
- The scoring weights and tier cut-offs are still one person's call (2026-11-11 record); unchanged.
- Site names: the study data names a site by its number only.
- A change to a KRI's limits still does not rescore the sites until "Recompute site risk" or the next load.
- The whole-project typecheck could not run in this container (the compiler was killed for memory at 15 GB); the
  changed files were typechecked on their own. The pre-push gate runs the whole check.
- HawkScan did not run: no `HAWK_API_KEY` in this environment.
