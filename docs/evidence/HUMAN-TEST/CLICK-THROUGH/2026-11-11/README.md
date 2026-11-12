# Walk of every launch screen in the running app (2026-11-11)

Launch row **D2** (the launch catalog works in the app) and founder decision **P-122** (the UI shows the work).
Session `session_01E8btkB8mcLirW4rNvsMNxK`, at the founder's direction of 2026-11-11: "focus entirely on getting what
we built surfaced correctly on the UI and working for GA".

Trunk `31047492b7`. Nobody had pushed since 2026-11-10 16:00 UTC, so this is the first look at the app with every
P-122 restoration merged.

## What already exists (RULE 3)

Nothing was built for the walk.
- **The app and its data** are the founder's Codespace, made here by trunk's own scripts as
  `../2026-11-06/README.md` ("How to rerun it") says: `.devcontainer/post-create.sh` and `post-start.sh`, PostgreSQL
  16 with pgvector, `RLS_ENFORCE=on`, the app as the `app_service` role. From an empty database: the Lumen account
  (416 records created), the demo packs, the project-management pack.
- **`walk.cjs`** (this folder) opens a list of screens as a demo person through `POST /api/auth/dev-login` and
  records, for each: a screenshot, every API answer of 400 or more, every console error, the headings, tabs,
  controls and closed disclosures, and any words that say a read failed. `../2026-11-06/clickcrawl.cjs` clicks
  every control; this one reads every screen. Neither replaces the other.
- No AI provider key is set here, so AnA's drafting and Shadow Review answer 503, as they should.

## What was walked

| Run | As | Screens | Failed requests | Console errors |
|---|---|---|---|---|
| Lumen account, LMN-201 (biologic IND) | Lumen lead | 26: Home, Projects, the project page's six steps, Tasks, Communication, Vault, Authoring, Review, Protocol, Submission Center and its four screens, Quality, CMC, RBM, Biostatistics, Reporting, Compliance reports, Admin | 0 | 0 |
| Development organisation, NeuroPanel-Dx 510(k) | Rhea Reviewer | 16: the project page, the twelve device screens, Submission Center, Vault, Quality | 3 on 2 screens (below) | 2 |
| Development organisation, C2C-201 (small-molecule IND) | Rhea Reviewer | 13: the project page, CMC's eight other tabs, RBM, Biostatistics, Tasks, Communication | 0 | 0 |

All at 1440×900. The Lumen run was repeated with a 2,400 px window to read each screen whole. Not walked: 390 px,
dark, the other demo people, and any control beyond the tabs and steps named.

## What the screens show

Every screen opened and showed its work. Home, Projects, the project page, Vault, Submission Center, Quality and CMC
read as ONE_DESIGN_PLAN §2 describes: a title, one line, one primary action, tabs, the record. Quality has nine
tabs with the server's figures above them; CMC nine; RBM ten; Submission Center eight; the Vault six.

## Found, and what became of each

| # | Found | Outcome |
|---|---|---|
| 1 | **Projects showed two of the three portfolio figures** the plan names: no average readiness, because the server sent none. | **Fixed** (`81fdef65dd`): the server measures it over every selected project and the page shows it. Tests on a real SQL engine. Seen in the running app after the restart: see "After the restart". |
| 2 | **Reporting's landing offered one pack while 20 reports could be run**, on the Catalog tab only. | **Fixed** (`bdb639850e`): the landing says how many and opens the catalog. Walked. `../../../DESIGN/P-122/reporting/`. |
| 3 | **Reporting's catalog printed stored codes**: "USA_OLAW · iacuc coordinator, ra lead, qa". | **Fixed** (`bdb639850e`): "US · OLAW · For IACUC coordinator, regulatory affairs lead, quality assurance", on cards and in both filters. Walked. |
| 4 | **Plan step, "Use the schedule's date": a refusal carrying only a code was shown as its words** ("The due date was not changed: FORBIDDEN."). Found by `ci:error-envelope`, red on trunk. | **Fixed** (`d886ad0282`). |
| 5 | **The twelve device screens are in the earlier design.** `device-engineering-1440.png`: an uppercase eyebrow ("WORKSTREAM · CLASS II · 510K · …"), four filled stat tiles, tag chips. ONE_DESIGN_PLAN §2 retires each. Device engineering also says "No engineering documents yet" directly above "13 hard blockers" on thirteen listed documents. | **Open, and the largest gap from "looks like Claude".** No design package's paths cover `client/src/concept2cure/mdx/**`; it needs its own slice (D-package work under R1/F1 paths, screen by screen, with its ledger). Not started here. |
| 6 | Device 510(k) screen: `503` on `/api/predicate-intelligence/candidates` and `/se-matrix`. | **Correct here.** The screen says predicate intelligence is not configured and that openFDA could not be reached; this sandbox has no route to openFDA. Check it once with network. |
| 7 | Diagnostics screen: `404` on `/api/ivdr/gspr-checklist/:program/matrix` for a device with no GSPR matrix yet. | **Open, low.** The screen says "Not yet assessed" and offers to start the matrix. A read of nothing-yet should answer 200 with an empty matrix, not 404, so the console is clean. |
| 8 | Quality's SOP register at 1440: the "Next review" heading and its dates were cut off by the row's actions. | **Closed by another session** (`c832199513`, D7, pushed after this walk's measurement): a record's actions are on their own line under its facts, and the table has no actions column. Re-measured in the running app at `2cdfe99657`: the table is 1,040 px in its 1,040 px box and "Next review" spans 1,236 to 1,344 px, in full. This session had measured the earlier build (a 1,081 px table, 41 px covered) and asked the founder to choose a fix on 2026-11-12; the founder chose tighter cells. **Not applied:** the column no longer needs it. The question should have been re-measured at head before it was asked. |
| 9 | Vault's Library: six filters sit above the list, so one document shows above the fold at 900 px; binder folder names are truncated in a 220 px tree. | **Open, low** (S6's files). |
| 10 | Reporting: regional reports' "not offered" reasons use stored values ("a nda or bla filing"); the catalog's count lines use internal words ("unregistered", "uncomputed"). | **Open, low.** In `../../../DESIGN/P-122/reporting/README.md`. |

## After the restart

The app was restarted on the changed server code and Projects was opened again.
- **On the page** (`projects-average-readiness-1440.png`, the Lumen lead): "4 active projects · 0% average
  readiness · 0 filings due within 60 days". Each of the four cards reads "Dossier readiness 0%", so 0% is the
  measured mean, not an absent figure.
- **From the API, on PostgreSQL as the `app_service` role under RLS:** `GET /api/c2c/projects?limit=3` as Rhea
  Reviewer answered a page of 3 with `hasMore: true` and
  `counts: { total: 8, averageReadiness: 0, readinessMeasured: 8, readinessState: "measured" }`. So the average
  covers the five projects that are not on the page.
- No request failed and the console was clean.

## Phone width, 2026-11-12

The walk above was at 1440 px. On 2026-11-12, with trunk at `82dfba5042`, the same app was walked at 390×844:
LMN-201's 26 screens as the Lumen lead and the device project's 12 as Rhea Reviewer.

- **How:** `walk.cjs` for what each screen shows, and `phone-width/probe-cutoff.cjs` for every control that runs
  past the screen's edge, with whether a person can still reach it by scrolling its own container sideways. Results:
  `phone-width/biotech-390.json`, `phone-width/device-390.json`.
- **LMN-201, 26 screens:** no failed request, no console error, and no page scrolls sideways as a document.
- **No control is out of reach on any of the 38 screens.** Before D8 slice 2 there was one: the Pre-Sub manager's
  "Ask AnA to start a Q-Sub" ran from 284 to 472 px (`docs/evidence/DESIGN/D8/slice-2/`).
- **Strips that scroll sideways by design** hold the rest on most screens: the project's steps (`.seg`), the tab
  rows of Vault, Submission Center, Quality, CMC, Reporting and Communication, the starter prompts
  (`.sp-starters`), the editor's ribbon and the IND checklist's forms table.

Three places where a whole working area scrolls sideways, which is not the design:

| # | Where | What a person meets at 390 px | Whose |
|---|---|---|---|
| P1 | Administration | The page's own container scrolls: the later tabs (API keys, Skills, Settings, at 374–644 px), the member filter (to 747 px), each member's row (65–716 px) and a member's actions ("Remove from organization", "Designate as QMS approver"). `phone-width/admin-console-390.png` shows the tab row starting to run off; the rest is below the first screen and is in `phone-width/biotech-390.json` | Client administration (`01T2woo…`) |
| P2 | Protocol | The section's working area (`.pd-work`) scrolls: "Draft with AnA" is at 461–596 px and "Save section" at 294–418 (`phone-width/biotech-390.json`) | Protocol and R1 (`01QoxbLdKp…`) |
| P3 | 510(k), PMA and Diagnostics | The device page's container (`.page`) scrolls: the pathway tabs run to 710 px, and on the 510(k) screen 47 controls are past the edge, "Refine query with AnA" and "Export SE matrix as CSV" among them. | D8, this lane: the next slice |

Not walked at phone width: the other demo people, dark mode outside the device screens, and any control beyond a
screen's tabs and steps.

## A mistake during the work

The first push of these fixes was refused by the pre-push warning ratchet: `TypeCard` had gone one branch over the
complexity limit and a template literal kept an escaped apostrophe. Both were mine, and I had not linted the changed
files before committing. Fixed in `19dabf8cf8`; every changed file is back at trunk's warning count.
