# D0 "after" evidence: the UI after D0

This folder holds the captures and probes that `.design/claude-convergence/D0.md` §7 (Acceptance) asks for, taken
from the code **after** D0. It is the counterpart of `../before/`: the same stack, database, identity, project,
screens, sizes, themes, file names and probes. Where a probe had to change because a class it read was removed, the
change is named below.

## What was run, and against what

- **Commit:** `f2385372331c3f02a7d01b260586bf7a5235a0c9` ("The editor reads as a page: serif text, a quiet outline
  and a one-row ribbon"). This was the head of `concept2cure-v2` when the run began. It is 64 commits after the
  "before" commit `d914c2618`. It carries D0's commits (the guards `78677693b`/`cae6bb0a1`, D0-1 `2270a9f2b`, D0-2
  `bacc0d343`, D0-3 `fafcda621`, D0-4 `1dee898e9`, D0-5 `a1f29d67d` and D0-6 `f9c6f5706`) and the other packages'
  commits that landed in the same span, among them D5-0 `943b78cb7` and D5-1 `94f24dba0` (CMC on the one work-area
  pattern). The branch has moved on since. These captures describe `f2385372`, not the head as it is now.
- **Copy:** the tree came from `git archive f2385372`, extracted into a new, empty scratch directory, so the main tree
  was not touched. `node_modules` was symlinked to the main tree's. `vite.config.ts` was given its own `cacheDir`
  (`.vite-cache` in the copy), as before. `.env` was copied in. It is byte-identical to the one the before run copied.
- **Database:** local Postgres `c2c`. This is the instance at `/var/lib/postgresql/c2c-local` on port 5432, which
  was already running. `pg_ctlcluster 16 main start` reported port 5432 in use by that instance, and it is the one
  that holds `c2c`. The before run's data was still there:
  - user 18, `jm.smith@concept2cure.pro`, default organisation 2;
  - the project row, "[Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque psoriasis (IND)", in organisation 2;
  - six `[Demo …` programmes;
  - 55 rows in 12 tables that carry the project's id: `cmc_provenance_events` 12, `authoring_documents` 12,
    `cmc_source_objects` 10, `vault.documents` 6, `quality_specifications` 5, `cmc_batch_records` 3,
    `stability_studies` 2, and one each in `cdisc_prm_studies`, `c2c_documents`, `submissions`,
    `protocol_documents` and `projects`.

  So the demo was **not reseeded**. The copy's `scripts/db/deploy-migrate.mjs` ran with `RUNTIME_DB_ROLE=app_service`
  and the owner URL as `postgres`.
  - It applied **461 of 461** migration files. One is new since the before run's 460:
    `migrations/20261025_shadow_review_run_coverage.sql`.
  - It refreshed the grants for `app_service`. The role was identified from `RUNTIME_DB_ROLE` and was not minted.
  - The readiness contract passed, including the grant audit: 1328 of 1328 relations.
- **Server:** `PORT=5100 RLS_ENFORCE=on LAUNCH_SCOPE_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=1`, started as
  `tsx server/index.ts` in the copy.
  - The runtime URL was `app_service`'s (`APP_DATABASE_URL`) and the owner URL used `postgres`. The secrets
    (`JWT_SECRET`, `JWT_SECRET_DEV`, `REFRESH_TOKEN_SECRET`, `SESSION_SECRET`) were random.
  - `ALLOWED_ORIGINS=http://127.0.0.1:5100` was also set. The development origin list in
    `server/middleware/enterprise-security.ts` names `:5000` and `:3000` only. Without the setting, the browser's
    `Origin: http://127.0.0.1:5100` got 403 on `/@vite/client` and `/src/main.tsx`, and the login page rendered
    blank. That happened on the first start, which was stopped and restarted with the setting. The before README does
    not name this setting, but the same 403 would have applied there.
  - The server was started three times: the blank first start, the main run, and a short pass for the Projects
    search field. Each time it was stopped the same way, by killing only its own PIDs (the `tsx` wrapper, the node
    process and the esbuild services, four or three of them), each checked by `/proc/<pid>/cwd` being under the copy.
    Postgres was left running.
- **Identity:** `jm.smith@concept2cure.pro`, the before run's user 18, an admin of organisation 2 ("Concept2Cure
  Therapeutics", enterprise plan). Sign-in went through the UI at `/concept2cure/login`. The session idles out after
  15 minutes, so the run signed in again through the UI before its last pass.
- **Project used:** `c2ed888d-2958-4332-b186-e81482f2ceec`, the same project as before.
- **Browser:** Playwright with Chromium 1243, the same build as before. The sizes were **1440×900** and **390×844**
  (390 with `isMobile: true, hasTouch: true`). Each size was captured light and dark. Dark was set through
  `localStorage` `c2c-v2-prefs` = `{…, dark: true}`.

## Screens and files

Every file is named `<screen>-<width>-<theme>.png`. There are 16 screens × 2 widths × 2 themes, which makes 64 files,
the same set as `../before/`. Each is a full-page screenshot when the document is 4000px tall or less, which was 62 of
the 64. `project-390-*` are the two exceptions, as before.

The 16 screens were reached exactly as before (same routes, same clicks):

| Screen (§7 list) | File key | How it was reached |
|---|---|---|
| Home | `home` | `/concept2cure` with no project open |
| Projects | `projects` | `/concept2cure/projects` |
| Project page of "[Demo · Biotech] C2C-101" | `project` | `/concept2cure/project-home?program=<id>`, which opens on the Author stage |
| CMC | `cmc` | `/concept2cure/cmc?program=<id>` |
| Submission Center | `submission-center` | `/concept2cure/submission-center?program=<id>` |
| Communication | `communication` | `/concept2cure/communication-center?program=<id>` |
| Vault | `vault` | `/concept2cure/vault?program=<id>` |
| Tasks | `tasks` | `/concept2cure/tasks?program=<id>` |
| Quality | `quality` | `/concept2cure/quality?program=<id>` |
| RBM | `rbm` | `/concept2cure/rbm?program=<id>` |
| Reporting & analytics | `reporting-analytics` | `/concept2cure/insights?program=<id>` |
| The editor, opened from the project | `editor` | Project page, then the first document's **Open** (2.3 Quality Overall Summary), then `/concept2cure/document-authoring` |
| ⌘K open | `cmdk` | Home, then Ctrl+K |
| New project | `new-project` | Projects, then **New project** (the `.npw` wizard) |
| The "Log communication" drawer (C2CForm) | `log-communication` | Communication, then **Log communication** |
| A conversation (for check 12) | `conversation` | `/concept2cure/conversation-thread?program=<id>`, a new, empty conversation with its composer |

Two more files, `submission-center-after-biostatistics-1440-{light,dark}.png`, record check 5's order case:
the project page, then Biostatistics (`.pj-about-link`), then Submission Center (rail), in one session.

`editor-390-light` was taken twice. On the first pass the probe ran before the document outline had rendered: it
counted 12 chips where every other size and theme counted 61. The screen was re-captured once, and the file and probe
here are the second pass. Nothing else was retaken.

**Unreachable:** nothing in the §7 list. As before, a conversation *with turns* was not created, because no model key
was set. Check 12 used the new-conversation composer.

**What changed under the probe:**
- CMC's "This work flows into" row (`.cm-connect`) and its "What to do now" band are gone. D5-1 (`94f24dba0`)
  deleted them and D0-6 (`f9c6f5706`) deleted their rules. That is the "after D3 and D5" state check 10 names. So
  `p10_flowsInto` has no CMC entry. The six destinations were clicked through the doors that
  `docs/evidence/DESIGN/D5/2026-11-01/README.md` ("Capability kept") names for them.
- CMC's sub-tabs moved from `.cm-subtab` to the one `.tabs`/`.tab` row.

## Probes (`probes.json`)

`probes.json` has the same top-level keys as `../before/probes.json`, in the same order: `what`, `commit`, `stack`,
`identity`, `project`, `sizes`, `themes`, `summary`, `screens`, `orderAndBehaviour`, `failingApiResponses`,
`supplementary`, `requestDbContext`.

The in-page probe is the before run's, unchanged except for these additions. Each is marked `AFTER:` in the script:
- `.tab` is added to `p6_tabRows` and `p13_segRows`, for CMC's row.
- `p12_composer.*.borderIsBorderToken` records whether the border is `--border`.
- `p15_pageBg` records the page colour that check 15 compares the composer against.
- `interactive.p7_focus_c2cInput.accent000` and `.boxShadowHasAccent000` record check 7's "ring in the `--accent-000`
  colour".
- `screens[projects-*].interactive.p7_focus_pjSearch` measures the Projects search field (`.pj-search-i` and its
  `.pj-search` wrapper), before and after focus. §7 names this field, and the before probe's `.c2c-input` turned out to
  be the Client select. It was taken in a short extra pass on the same stack: the server was started again from the
  same copy, signed in through the UI, and stopped the same way, three PIDs.
- In `orderAndBehaviour`:
  - `light.p10_bandsPresent` is new.
  - Each entry of `light.p10_flowsIntoClicks` now names its `door`.
  - `light.p9_cmcAdvance.clicked` is new.
  - `<theme>.apiFailures` holds the `/api` responses of 400 or above seen during that pass.
- `supplementary.cmcActiveSubtab_newProjectAtLoad_cmdkWrapper.*.cmcActiveSubtab` reads `.tabs .tab[aria-selected=true]`,
  because `.cm-subtab[data-on]` no longer exists. Its `selector` field says which one was read.

`p7_focus_cmdk` reads the `.cmdk-in` wrapper exactly as before. The ⌘K `<input>` itself is in
`supplementary.cmdkInputFocused`, also as before.

### Headlines

These are for 1440 light unless stated. **Dark gave the same counts on every screen and size.** The before value is
in brackets.

1. **Uppercase** (§7's formula on `.c2c-v2 *`):
   - **0 on 15 of the 16 screens**, at both widths and in both themes. Before, the count was 1 to 99 on every screen.
   - The quoted cases are gone: Projects shows no "WORKSPACE", and the project page's `.btn.small` read "Deploy a
     skill", "Turn one off here" and "Write a skill" (`text-transform: none`). "Planning" renders "Planning".
   - **Quality: 14** [21]. The sources are:
     - `.qms-eyebrow` "WORKSTREAM";
     - four `.qms-kpi .lbl`: "EFFECTIVE DOCUMENTS", "UNDER REVIEW", "REVIEW OVERDUE" and "ACKNOWLEDGEMENT COVERAGE";
     - `.qms-thead` and its cells: "NUMBER", "TITLE", "TYPE", "VERSION", "STATUS", "EFFECTIVE" and "NEXT REVIEW".

     All of them come from `client/src/concept2cure/quality/app.css` (lines 76, 93 and 134). That file is outside
     `client/src/concept2cure/v2/styles/`, which is where D0-3's sweep ran. **Check 1 does not hold on Quality.**
2. **Orange fills** (`background-color` = `--accent-strong`, without the three send buttons):
   - The raw count is still at least 3 on every screen. The account avatar "JS", the organisation mark "CT" and the
     notification badge "10" still fill with `--accent-strong`. Read literally, "≤ 1" holds nowhere.
   - `countExcludingShellChrome` gives:
     - **0:** project page, CMC [2], Submission Center [1], conversation.
     - **1:** Home ("New project"), Projects ("New project"), New project ("Continue"), Communication ("Log
       communication") [2], Tasks ("New task") [2], Quality ("New controlled document"), RBM (`.rbm-ana-send`), ⌘K.
     - **2:** the editor ("Saved", "Build document") [2]. The drawer open: the page's "Log communication" behind the
       scrim and the drawer's `.de-btn.primary` [3].
     - **3:** Vault ("Add files", "Seal this Vault…", "Open in editor") [3].
     - **4:** Reporting ("Build the BLA assembly pack", the "Enterprise" tier, "Find" and the "Report" tab) [4].
   - There is no `.reg-cta` anywhere.
3. **Root type:**
   - `.c2c-v2` font-size is **14px** on every screen, size and theme [13px].
   - `.ph-title` (Projects, New project, CMC, Tasks) and `.sp-title` (Submission Center, Communication, drawer) are
     **Lora 26px/500**, and **22px** at 390 [system-ui 24/600 and 23/600]. **Holds.**
4. **Buttons:**
   - `.btn` is 32px. The exception is the editor's 23 buttons at 30px ("Saved", "Freeze", "E-sign", "Place into
     filing", "Re-file saved text", "New document" …), which is unchanged.
   - `.btn.small` is **28px**, `text-transform: none`, `letter-spacing: normal` [32px, uppercase, 0.625px].
   - `.de-btn` is **36px** [43.5].
   - At 390 with touch, **every `.btn` is 44px**, on every screen that has one [32 on Projects, project and Tasks].
     The `.de-btn` is also 44.
   - Hovering `.btn.primary` leaves `transform: none` on Projects, New project, Tasks, the editor and Reporting [a 1px
     lift].
   - **Holds, except the editor's 30px buttons at 1440.**
5. **Cards:**
   - Project page: 4 `.pj-card` at `radius 12px, padding 16px`. `.pj-card-h` is transparent with `padding 0`.
   - Submission Center **loaded directly**: 2 cards, the same values [8px / 14px].
   - Submission Center **after the project page, then Biostatistics, in one session**: the same values, light and dark.
   - CMC and Projects have the same values.
   - The look no longer depends on which screens were visited first. **Holds.**
6. **Chips, tables, tabs:**
   - `.rd-chip` is **12px/500, `text-transform: none`**, with an upper-case first letter, on Projects (14), Submission
     Center (1), the editor (61) and Vault (79) [10.5px/600 uppercase]. The source "active" renders "Active", and
     "Biotech" and "Planning" render as written.
   - The exception is the project page's six header chips ("C2C-101", "FDA", the indication, "Active", "High
     priority", "Planning"). They are 13px/400 and transparent, as before.
   - `.reg-tbl th` (CMC) is **12px, transparent, `text-transform: none`** [10px uppercase on `rgb(245,244,238)`].
   - The active tab's `border-bottom` is **`--text-100`** (`2px solid rgb(20,20,19)`; dark `rgb(250,249,245)`) on:
     - CMC `.tab` ("Overview")
     - Submission Center `.sc-ws`
     - Communication `.cc-tab`
     - RBM `.reg-tab`
   - It is still orange on:
     - Quality `.qms-tab`: `2px solid rgb(217,119,87)`, from `quality/app.css:278`.
     - Reporting `.rl-tab.on`: filled `--accent-strong`, from `insights-v2.css:185`.
   - Tab rows:
     - CMC's `.tabs` is one row (36px) with `overflow-x: auto`. At 390 it scrolls inside itself: 488 in 302.
     - Submission Center's `.sc-wsbar` is one row at 390 [4 rows].
     - Communication's `.cc-tabs` is one row and scrolls.
     - **RBM's `.reg-tabs.rbm-tabs` still wraps:** 2 rows at 1440 and 7 at 390, from
       `rbm-v2.css:16 .rbm-tabs{flex-wrap:wrap}`.
   - **Holds, except RBM's row, Quality's and Reporting's active tabs, and the project header chips.**
7. **Inputs:**
   - The Projects `.c2c-input` is the **Client `<select>`**, which the before run also measured under that name. On
     focus it shows `outline-style: none` and `box-shadow: rgb(250,240,236) 0 0 0 3px`, which is `--accent-000`
     (dark `rgba(217,119,87,0.12)`). The border turns accent. It is 32px/14px at 1440 and 44px/16px at 390. That is
     one ring [2px solid orange outline, no shadow].
   - **The Projects search field**, which is what §7 names, is `.pj-search-i` inside `.pj-search`. The before run never
     measured it. Here it is in `screens[projects-*].interactive.p7_focus_pjSearch`. Focused, it shows **two rings**:
     - the `<input>` keeps a `2px solid` `--accent-strong` outline (`rgb(173,81,50)`; dark `rgb(232,145,111)`);
     - the wrapper adds the `--accent-000` 3px shadow and an accent border.

     The input is 19.5px/13px inside a 33.5px wrapper at both widths. **Check 7 does not hold on the Projects search.**
   - The ⌘K `<input>` on focus: `outline-style: none`, `box-shadow: none` [2px solid orange outline].
   - The drawer's `.de-input` and `.de-select` are **36px** [39.5].
   - At 390 with touch, **44px/16px holds** for the Projects `.c2c-input`, the drawer's fields and the editor's
     `.c2c-input`. It **does not hold** for:

     | Screen | Element | Height / font size |
     |---|---|---|
     | ⌘K | `<input>` | 22.5 / 15px |
     | Home | `.landing-input` | 15px |
     | Project page | composer textarea | 45 / 15px |
     | Conversation | composer textarea | 36.5 / 15px |
     | Projects | `.pj-search-i` | 19.5 / 13px |
     | Submission Center | `.sc-subpick` | 34 / 13px |
     | Vault | six `.c2c-input` | 44 / 12px |
     | Vault | one `input` | 30 / 12px |
     | Tasks | two `.tb-sel` | 32 / 12px |
     | RBM | `.rbm-study-sel` | 32 / 12.5px |
     | RBM | an `input` | 36 / 12px |
     | Reporting | textarea | 25.5 / 13px |
     | Editor | two `.rse-sel` | 44 / 13px |

8. **Empty state:** Communication's "No agency communications yet":
   - `border-style: none` [1px dashed].
   - 0 orange elements inside.
   - The background is **not transparent**: `rgb(238,236,228)`, dark `rgba(176,174,165,0.16)`. The box renders
     `c2c-empty-state tone-idle`, and the chip tone's fill reaches it. This is the defect that
     `docs/evidence/DESIGN/D5/2026-11-01/README.md` names ("Every empty state in the app had a chip's background").
   - **Does not hold on the background.**
9. **The answer lead:**
   - On Tasks, CMC, Submission Center and Communication, `.al-lead` is **transparent with `border-style: none`** [bg
     `rgb(250,240,236)` with a 1px border].
   - `.al-h` is **system-ui 15px**/600 [Lora 21/400].
   - `.al-btn` is a **hairline ghost**: `1px solid --border`, transparent, 32px, radius 8px [filled orange, 38px,
     radius 9].
   - CMC's "Advance the next section" (`.al-btn`) still opens `/concept2cure/conversation-thread?program=<id>`
     ("Talk to AnA"), the **same destination** as before. **Holds.**
10. **Banners:**
    - CMC has **0** `.cm-connect`, **0** `.pj-stageband`, and none of the retired text ("What to do now", "flows into",
      "NEXT STEP").
    - Each of the six destinations still goes where it went, through its named door:

      | Destination | Door | Result |
      |---|---|---|
      | Module 3 dossier | the **Module 3 build** tab | The active tab goes from Overview to Module 3 build; the URL is unchanged. Before, the pill changed nothing visible. |
      | Document editor | ⌘K **"The editor"** | `/concept2cure/document-authoring?program=<id>` |
      | Vault | the rail | `/concept2cure/vault?program=<id>` |
      | Project | `.pj-back` **"Project"** | `/concept2cure/project-home?program=<id>`. The pill went to `/projects`. |
      | Tasking | the topbar **Task** button | Opens `.cl-modal` "New task … From CMC / Module 3" |
      | Collaborate | the topbar **Collaborate** button | Opens `.cl-modal` "Collaborate … About CMC / Module 3" |

    - The project page's "What to do now" band has no box (transparent, no border, radius 0). Its "Next step" label is
      `text-transform: none` [uppercase]. **Holds.**
11. **Drawer:**
    - "Log communication" opens a **440px** drawer at 1440 [520].
    - Neither the drawer nor its scrim has a `backdrop-filter` [scrim `blur(3px)`].
    - In 40 Tab presses, focus never left the drawer. Escape closed it and returned focus to "Log communication".
    - Under `prefers-reduced-motion: reduce`, `animation-name` is `none` on the drawer and the scrim.
    - At 390 it is **390px, which is 100vw** [367]. The footer buttons "Cancel" and "Log communication" are 171px
      each and 44px high. They sit side by side and together fill the footer row [159 and 157]. **Holds.** They share
      the row rather than stacking, if "full-width" is read as one per row.
12. **Composers:**
    - Home `.landing-composer`, the project's `.pj-composer` and the conversation's `.ct-composer` each have
      **`border-radius: 20px`** [16/14/14].
    - Each is on **`--canvas-elevated`** (`rgb(255,255,255)`; dark `rgb(48,48,46)`) with a **1px `--border`**.
    - Focusing changes **only `borderColor`**, to `--accent-strong`. The before run added a ring on Home and the
      project.
    - Each send button is **32×32**, radius 8px, filled `--accent-strong`. Disabled it is **opacity 0.4** [0.5; the
      conversation's was grey at 1]. **Holds.**
13. **Phone width:**
    - `.page` fits at 390 on **12 of 16** screens. Communication, the drawer and RBM now fit [383, 383 and 348
      against 334].
    - It still scrolls sideways on four screens:

      | Screen | Width against 334 | Cause |
      |---|---|---|
      | CMC | 548 [334] | the Portfolio `.reg-tbl`, 515px wide. CMC fitted before |
      | Tasks | 523 [539] | `.tb-filters`, 507px |
      | Quality | 854 [854] | `.qms-tabbar` has `overflow: visible` |
      | Conversation | 370 [370] | `.ct-engine` "Engine: Balanced" |

    - The Projects header's "New project" is **on its own row, unclipped** (x 197 to 320) [beside the title, clipped at
      427].
    - These segmented rows scroll inside themselves: CMC, Submission Center, Communication and Tasks' `.seg`. These do
      not:
      - Quality's tab bar (`overflow: visible`).
      - RBM's row, which wraps.
      - Projects' Grid/List `.seg`, which at 390 is 4px wide at x 544 to 548, off-screen.
      - Reporting's `.rl-tabs`, which at 390 is 0px wide inside a 60px `.rc-canvas`.

      These last two do not make the page scroll, so the `.page` probe does not count them.
    - **Does not hold on CMC, Tasks, Quality and the conversation.**

**Dark (check 15):**
- Every count above is the same in dark.
- The active segmented item is `rgb(61,61,58)`, which is **`--bg-200`**, on a track of `rgb(48,48,46)`. It is lighter
  than its track [`rgb(38,38,36)`, darker]. This holds on Projects, CMC and Tasks.
- The composer is `rgb(48,48,46)` = **`#30302e`** on a `rgb(38,38,36)` = **`#262624`** page [`rgb(38,38,36)`].
- The neutral chip fill is `rgb(61,61,58)` = **`--bg-200`**. **Holds.**

**Checks 14 and 16** (the contrast scripts and the guards) are not browser probes, so they were not run here.

### The supplementary re-measurements (`supplementary`)

- **CMC's active tab**, Overview, now `.tabs .tab[aria-selected=true]`: `2px solid` `--text-100` in both themes and at
  both widths (`isText100: true`). Before, `.cm-subtab[data-on]` was `2px solid rgb(217,119,87)`.
- **The ⌘K `<input>`** is focused when the palette opens. It shows `outline-style: none` and `box-shadow: none`, at
  15px and 22.5px high, at both widths. The wrapper `.cmdk-in` has no ring either.
- **"New project" at load:**
  - At 1440 it is beside the title (`ownRow: false`), x 1285 to 1408, unclipped.
  - At 390 it is on its own row (`ownRow: true`), x 197 to 320, unclipped [x 307.8 to 427.4, clipped].

## Failing API responses

- **Captures (`failingApiResponses`):** **none**, on any screen, size or theme.
- **Behaviour pass (`orderAndBehaviour.light.apiFailures`):** one. `GET
  /api/cmc/module3-os/build-state/<id>` answered **409 `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`** when check 10 opened CMC's
  Module 3 build tab. C2C-101 is a monoclonal antibody, and CMC's composition boundary
  (`services/cmc/composition-scope.ts`, decision P-28) refuses a biologic by name. The dark pass had none.
- **Request-context pass (`requestDbContext`):** none.

## `REQUEST_DB_CONTEXT_REQUIRED` (the defect reported 2026-10-26)

The same dedicated pass as before covered Quality and each of its eight tabs, then the project page's Plan and Review
stages. It recorded every `/api` response and every failed request, with a server-log window for each step.

- **Browser:**
  - 0 responses of 400 or above. 0 responses carrying the code.
  - 67 requests aborted by the browser (`net::ERR_ABORTED`), the same count as before.
  - 30 watched responses.
  - The one visible-text match is the same as before: "The effectiveness check failed" on the CAPA tab.
- **Server log, that pass:** **0** `REQUEST_DB_CONTEXT_REQUIRED` lines in all 13 windows.
- **Server log, the whole after run:** **0** `REQUEST_DB_CONTEXT_REQUIRED` lines [194].
  - The cancelled-request mechanism the before README described is still visible, under its new wording. There are 57
    level-50 lines, each one of two kinds:
    - "The request ended before its database work ran" (`REQUEST_ENDED`);
    - "Cannot query a released request DB client".
  - By log message:

    | Lines | Log message |
    |---:|---|
    | 25 | `[submissions-routes] submissions route error` |
    | 15 | `[ana-skills] The project's skills could not be read.` |
    | 7 | `[task-board-routes] task board error` |
    | 6 | `[mdx-rbm-board] rbm-programs failed` |
    | 3 | `[cmc-source-evidence] reading Module 3 register links failed` |
    | 1 | `[mdx-qms-training] training-expiring failed` |

  - No such response reached the browser.

## What is still red after D0, by check

| Check | Holds | Where it does not |
|---|---|---|
| 1 Uppercase | 15 of 16 screens | Quality: 14, from `quality/app.css` |
| 2 One orange fill | project page, CMC, Submission Center and the conversation at 0. Home, Projects, New project, Communication, Tasks, Quality, RBM and ⌘K at 1, without the shell chrome | The shell chrome (avatar, organisation mark, badge) on every screen. The editor 2, the drawer 2, Vault 3, Reporting 4 |
| 3 Root type | everywhere | — |
| 4 Buttons | everywhere at 390. `.btn.small`, `.de-btn` and hover | the editor's 23 `.btn` at 30px, at 1440 |
| 5 Cards | everywhere, in either order | — |
| 6 Chips, tables, tabs | chips, CMC's table, and the CMC, Submission Center, Communication and RBM active tabs | RBM's row wraps. Quality's and Reporting's active tabs are orange. The project header's six chips are 13/400 |
| 7 Inputs | the Client select's one ring, ⌘K with no ring, the drawer at 36 | the Projects search shows two rings (input outline + wrapper shadow). The 390 rule fails on 11 screens' fields (the table under check 7) |
| 8 Empty state | no border, no orange | the background (`tone-idle`) |
| 9 Answer lead | all four screens, and the click | — |
| 10 Banners | both gone, all six destinations reached | — |
| 11 Drawer | all of it | — (the footer buttons share the row) |
| 12 Composers | all three | — |
| 13 Phone width | 12 of 16, and "New project" | CMC, Tasks, Quality and the conversation. Projects' `.seg` and Reporting's `.rl-tabs` collapse at 390 |
| 15 Dark | all of it | — |
