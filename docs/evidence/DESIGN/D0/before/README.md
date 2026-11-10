# D0 "before" evidence: the UI as it was before D0

This folder holds the captures and probes that `.design/claude-convergence/D0.md` §7 (Acceptance) asks for, taken
from the code **before** D0. The "after" captures go beside it under `docs/evidence/DESIGN/D0/`.

## What was run, and against what

- **Commit:** `d914c261843077a738f4482c64bcc27ad7fa2713` ("protocolDevSurfaceWrites test: the comment cases within
  the file's line limit"). This is the parent of D0's first commit.
- **Copy:** the tree came from `git archive d914c2618`, extracted into a scratch directory, so the D0 build in the
  main tree was not touched. `node_modules` was symlinked to the main tree's. `vite.config.ts` was given its own
  `cacheDir` so React did not load twice. `.env` was copied in.
- **Database:** local Postgres `c2c`. The copy's `scripts/db/deploy-migrate.mjs` ran with `RUNTIME_DB_ROLE=app_service`:
  460 of 460 migration files were applied, and grants were refreshed for `app_service`.
- **Server:** `PORT=5100 RLS_ENFORCE=on LAUNCH_SCOPE_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=1`. The runtime
  role was `app_service` and the owner URL used `postgres`. The secrets were random. The server was stopped
  afterwards: only its own PIDs, each checked by `/proc/<pid>/cwd`.
- **Identity:** `jm.smith@concept2cure.pro` was created by the copy's `scripts/seed-admin.mjs` (the seed-admin step of
  `scripts/dev/up.mjs`) as user 18. It is an admin of organisation 2, "Concept2Cure Therapeutics", on the enterprise
  plan. Sign-in went through the UI at `/concept2cure/login`.
- **Demo data:** `scripts/demo/launch-demo/seed.mjs --pack all --base-url http://127.0.0.1:5100 --email
  jm.smith@concept2cure.pro`. The biotech pack created 197 records. The MDX pack completed
  its 36 steps, ending with the NeuroPanel-Dx 510(k) project. The lumen pack created 37 records. No pack failed. The seed reported "Every demo area is open on the enterprise plan", so `--plan` was not needed and no
  area stayed locked. Steps that need a second signer (`OQ_SIGNER_EMAIL`) were recorded as "not executed" by the
  seed itself.
- **Project used:** `c2ed888d-2958-4332-b186-e81482f2ceec`, "[Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque
  psoriasis (IND)".
- **Browser:** Playwright with Chromium 1243. The sizes were **1440×900** and **390×844** (390 with
  `isMobile: true, hasTouch: true`). Each size was captured light and dark. Dark was set through `localStorage`
  `c2c-v2-prefs` = `{…, dark: true}`, which renders `.c2c-v2.dark[data-theme=dark]`.

## Screens and files

Every file is named `<screen>-<width>-<theme>.png`, for 16 screens × 2 widths × 2 themes, which makes 64 files. Each
is a full-page screenshot when the document is 4000px tall or less, which was 62 of the 64. Most screens scroll
inside `.page`, so the file is the size of the viewport.

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

Two more files, `submission-center-after-biostatistics-1440-{light,dark}.png`, record check 5's order case.

**Unreachable:** nothing in the §7 list. A conversation *with turns* was not created. No model key was set, and
creating one would add a record that the "after" captures on this same database would then show. Check 12 used the
new-conversation composer instead.

`CMC`, `Submission Center` and `Communication` need an open project. Without one they redirect to Projects. That is
why every project-scoped screen carries `?program=<id>`.

## Probes (`probes.json`)

`probes.json` holds the following sections:

- `summary`: the headline numbers for each screen, size and theme.
- `screens`: the full measurement for each screenshot, with the same key as the file.
- `orderAndBehaviour`: check 5's order case and the click results for checks 9 and 10.
- `supplementary`: three re-measurements, explained below.
- `requestDbContext`: the request-context check.
- `failingApiResponses`: every `/api` response of 400 or above that the browser received during the capture. There
  were **none**, on any screen, size or theme.

Headlines (1440 light unless stated; dark gave the same counts):

1. **Uppercase**, using §7's formula on `.c2c-v2 *`:
   - Home 3, Projects 17, project 19, CMC 13, Submission Center 11, Communication 5.
   - Vault 99, Tasks 5, Quality 21, RBM 7, Reporting 10, editor 65, ⌘K 5, New project 6, drawer 6, conversation 2.
   - At 390 each count is about one lower.
   - The quoted cases are all present: "WORKSPACE" (Projects `.ph-eyebrow`), "DEPLOY A SKILL", "TURN ONE OFF HERE" and
     "WRITE A SKILL" (project page `.btn.small`), and "PLANNING" (Submission Center `.rd-chip`).
   - The largest sources are `.rd-chip` (73 on Vault, 61 in the editor), `.rail-group-h` and table headers.
2. **Orange fills** (`background-color` = `--accent-strong`, without the three send buttons).
   - Every screen counts at least 3 before any content: the account avatar "JS", the organisation mark "CT" and the
     notification badge "10" all fill with `--accent-strong`. `countExcludingShellChrome` leaves those three out.
   - Without that chrome:
     - Tasks 2: "New task" and "Mark the tasks that gate the milestone".
     - CMC 2: the `.reg-cta` "Ask AnA" and "Advance the next section".
     - Submission Center 1: "Open the sequences". There was no `.reg-cta` on it in this seeded state.
     - Communication 2: "Log communication" and "Review the inbox".
     - The drawer open: 3.
     - Vault 3: "Add files", "Seal this Vault…" and "Open in editor".
     - Reporting 4: "Build the BLA assembly pack", the "Enterprise" tier, "Find" and the "Report" tab.
     - Editor 2: "Saved" and "Build document".
     - Home 1 ("New project"), Projects 1, New project 1 ("Continue"), Quality 1 ("New controlled document") and
       RBM 1 (`.rbm-ana-send`).
     - Project page 0 and conversation 0.
3. **Root type:**
   - `.c2c-v2` font-size is `13px` on every screen, size and theme. D0 asks for 14px.
   - `.ph-title` is `system-ui` 24px/600 (Projects, Tasks and New project) and `.sp-title` is `system-ui` 23px/600
     (Submission Center and Communication). It does not change at 390. D0 asks for Lora 26/500, and 22 at 390.
4. **Buttons:**
   - `.btn` is 32px. The editor also has 23 at 30px.
   - `.btn.small` is 32px, `text-transform: uppercase`, `letter-spacing: 0.625px`.
   - The drawer's `.de-btn` is 43.5px at 1440 and 61px at 390.
   - At 390 with touch, `.btn` stays 32px on Projects, the project page and Tasks. The editor's buttons are 44px.
   - Hovering `.btn.primary` gives `transform: matrix(1, 0, 0, 1, 0, -1)`, a 1px lift, on Projects ("New project")
     and Tasks ("New task").
5. **Cards:**
   - Project page `.pj-card`: `radius 12px, padding 16px 18px`. `.pj-card-h`: `bg rgb(245,244,238)` (dark
     `rgb(43,43,41)`), `padding 12px 16px`.
   - Submission Center **loaded directly**: `.pj-card` `radius 8px, padding 14px`.
   - Submission Center **after the project page, then Biostatistics, in one session**: `radius 12px, padding 16px 18px`.
   - So the card's look depends on which screens were visited first.
6. **Chips, tables, tabs:**
   - `.rd-chip` is 10.5px/600 uppercase. The source "Biotech" and "active" render "BIOTECH" and "ACTIVE", and
     "Planning" renders "PLANNING".
   - `.reg-tbl th` (CMC) is 10px uppercase on `rgb(245,244,238)`.
   - The active tab has a 2px orange `border-bottom` (`rgb(217,119,87)`), not `--text-100`, on:
     - CMC `.cm-subtab[data-on]`
     - Submission Center `.sc-ws`
     - Communication `.cc-tab`
     - Quality `.qms-tab`
     - RBM `.reg-tab`
   - CMC's tab row is one line and scrolls (`overflow-x: auto`).
   - RBM's tab row wraps: 2 rows at 1440 and 7 rows at 390. Submission Center's wraps to 4 rows at 390.
7. **Inputs:**
   - The Projects `.c2c-input` on focus: `outline 2px solid` orange, `box-shadow: none`, 30px, 12.5px.
   - The ⌘K `<input>` on focus: `outline 2px solid` orange, 15px (`supplementary.cmdkInputFocused`). D0 asks for
     no ring.
   - The drawer's `.de-input` and `.de-select` are 39.5px and 13px.
   - At 390 with touch, inputs stay under 44px and under 16px on Projects, Vault, the drawer and the conversation.
8. **Empty state:** Communication's "No agency communications yet" is a `.c2c-empty-state` with a `1px dashed` border
   on `rgb(238,236,228)` (dark `rgba(176,174,165,0.16)`). It has 0 orange elements inside.
9. **The answer lead:**
   - `.al-lead` on Tasks, CMC, Submission Center and Communication: `bg rgb(250,240,236)` with a
     `1px solid rgb(245,221,212)` border.
   - `.al-h` is Lora 21px/400.
   - `.al-btn` is filled orange, 38px high, radius 9px.
   - CMC's "Advance the next section" opens `/concept2cure/conversation-thread` ("Talk to AnA"). The "after"
     capture must reach the same place.
10. **Banners:**
    - CMC's "This work flows into" row (`.cm-connect`) has six pill buttons, each `1px solid` border with radius 99px.
    - Clicked one at a time:
      - "Module 3 dossier" did not change the URL and opened no panel.
      - "Document editor" went to `/document-authoring`.
      - "Vault" went to `/vault`.
      - "Project" went to `/projects`.
      - "Tasking" and "Collaborate" each opened the `.cl-modal` panel.
    - CMC's "What to do now" band is a box: `bg rgb(240,238,230)`, a 1px border, radius 8px.
    - The project page's band has no box. Its "Next step" label is uppercase.
11. **Drawer:**
    - "Log communication" opens a **520px** drawer at 1440. At 390 it is 367px, not 100vw, and the footer buttons
      are 159px and 157px, side by side.
    - The drawer has no `backdrop-filter`. Its scrim has `blur(3px)`.
    - In 40 Tab presses, focus never left the drawer. Escape closed it and returned focus to the opener.
    - Under `prefers-reduced-motion: reduce`, `animation-name` is `none`.
12. **Composers:**
    - Home `.landing-composer`: radius 16px, background `--bg-000` (not `--canvas-elevated`), border
      `1px rgb(232,230,220)` and a shadow. On focus the border colour changes and a 3px accent ring is added.
    - Project `.pj-composer`: radius 14px, an orange-tinted border `rgb(245,221,212)`. On focus the border changes
      and a ring is added.
    - Conversation `.ct-composer`: radius 14px. Only its border colour changes on focus.
    - The send buttons are 32px with radius 8px. Disabled, they are orange at opacity 0.5 (Home and project). The
      conversation's is grey at opacity 1.
13. **Phone width:**
    - `.page` scrolls sideways at 390 on Communication (383 against 334), the drawer, Tasks (539 against 334),
      Quality (854 against 334, its tab bar), RBM (348 against 334) and the conversation (370 against 334). The
      other screens fit.
    - The Projects header's "New project" sits beside the title, not on its own row. At load it spans 307.8 to
      427.4 in a 390 viewport, so it is clipped (`supplementary…newProjectAtLoad`).

**Dark (check 15):**
- The active segmented item is `rgb(38,38,36)` on a track of `rgb(48,48,46)`. It is darker than its track, and it is
  not `--bg-200`.
- The composer is `rgb(38,38,36)`, not `#30302e`.
- The neutral chip fill is `rgb(61,61,58)`.

**Checks 14 and 16** (contrast scripts and the guards) are not browser probes, so they were not run here.

### Three re-measurements (`supplementary`)

- The main probe found an active tab only through `.on` or `aria-selected`. CMC marks its active sub-tab with
  `[data-on]`, so it was measured again.
- In `screens[cmdk-*].interactive`, `p7_focus_cmdk` read the `.cmdk-in` wrapper. The focused field is the `<input>`
  inside it, so it was measured again (`cmdkInputFocused`).
- "New project" was measured again at load, before any interaction.

## `REQUEST_DB_CONTEXT_REQUIRED` (the defect reported 2026-10-26)

The question was whether `/api/mdx/qms/*` and the project schedule's unified work fail with "Request-scoped database
context is required".

**What the server log shows.** `d0-before-server.log` has 194 such lines. Each is level 50, `code
REQUEST_DB_CONTEXT_REQUIRED`, thrown by `requestPgClient` (`server/db/requestDb.ts:60`).

| Lines | Log message |
|---:|---|
| 106 | `[mdx-notifications] unread-count failed` |
| 23 | `[submissions-routes] submissions route error` |
| 14 | `[cmc-source-evidence] reading Module 3 register links failed` |
| 11 | `[mdx-qms] doc-list failed` |
| 10 | `[commitment-fulfil-route]` |
| 10 | `[ha-interactions]` |
| 5 | `[mdx-qms] change-list failed` |
| 3 | `[mdx-qms] doc-review-due failed` |
| 3 | `[project-schedule-of-events] loading unified work failed` |
| 2 | `[mdx-qms-training] training-compliance failed` |
| 1 each | `[mdx-qms-training] training-expiring`, `[mdx-qms]` deviation-list, nc-list, supp-list, audit-list and mr-list, and `[authoring-router] loading docs failed` |

**What the browser received.** A dedicated pass recorded every `/api` response and every failed request, with a
server-log window for each step (`requestDbContext` in `probes.json`). It covered Quality and each of its eight
tabs, then the project page's Plan and Review stages, which carry the unified work.

- Every log line in a window matches one request that the **browser itself aborted** (`net::ERR_ABORTED`). Examples
  are `/api/mdx/qms/changes`, `/documents/review-due`, `/training/compliance`, `/deviations`, `/nonconforming`,
  `/suppliers`, `/internal-audits`, `/management-reviews`,
  `/api/concept2cure/projects/<id>/unified-work`, `/api/authoring/docs` and `/api/mdx/notifications/unread-count`.
- The re-issued request for each of those paths returned **200**.
- No response carrying `REQUEST_DB_CONTEXT_REQUIRED` reached the browser. No screen showed it.
- The capture run gave the same result: zero `/api` responses of 400 or above on any screen.

**The mechanism, read from the code.** `bindRequestDbClient` (`server/db/requestDbLease.ts`) ends the request's
database lease on `close`. That clears `req.dbClient`. A handler that runs after the client has gone then reaches
`requestPgClient`, which throws. The route logs the error as a failure and answers 500 to a closed socket.

The aborts come from the client:
- `client/src/main.tsx` renders under `<React.StrictMode>`. In development, StrictMode mounts each effect, cleans it
  up and mounts it again, so each effect's fetch is cancelled once and re-issued.
- Changing a tab or page also cancels the fetches still in flight.

**Verdict at d914c2618.** On this stack the reported failure reproduces only as **server-log noise from cancelled
requests**. No Quality or unified-work read failed for the user.

Two things were **not** verified:
- The `submissions-routes`, `ha-interactions`, `commitment-fulfil-route` and `cmc-source-evidence` lines came from
  the capture run, which did not record aborts. They are presumed to follow the same pattern.
- A user-visible failure under production conditions (no StrictMode) was not tested.

A fix would stop logging work for a client that has already gone as a server error. It belongs to the package that
owns the request lease, not to D0.
