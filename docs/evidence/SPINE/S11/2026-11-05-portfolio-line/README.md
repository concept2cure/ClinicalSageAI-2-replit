# S11: the Plan step's workstreams and schedule line, and the portfolio line on Projects (2026-11-05)

Package S11 (P-82; `docs/design/THE_PROGRAM_2026-11-01.md` §5, §8 items 3–4, §9 step 6). Asked by the design
continuation session (`011Dpx…`) after step 4 (`../2026-11-05-plan-step/`):

1. §8 item 3, **Workstreams**: one quiet list, a row per workstream with its lead, progress, next milestone and date,
   and a status word, each opening to its tasks. A device plan whose workstreams have no work-breakdown key says so.
2. §8 item 4, **The schedule**: one calm line from the work's start through submission and the agency's review clock,
   milestones as dots, today as a mark, the critical path darker, details on hover.
3. Step 6a, **the portfolio line on Projects**: each card one quiet line from the same engine.
4. Step 6b, the global schedule in Reporting & analytics: **not built**. A proposal to its holder (below).

## What already exists

Searched: `workstream`, `lead`, `milestone`, `phase`, `.complete`, `estimateTimeline`, `TaskTimeline`,
`fdaMilestone`, `regulatoryDeadlineDays`, `review clock`, `targetDecisionDays`, `getTimeline`, `PDUFA`, `MDUFA`,
`portfolio`, `cardLine`, `PROJECT_CARD_SELECT`, `homeFigures`, `due_date`, `next milestone`, the launch gate's prefix
claims. Deleted history (`git log --all --diff-filter=D`) on `*ortfolio*`, `*Gantt*`, `*imeline*`, `*Workstream*`:
nothing.

| What | Path | What it does today | What it does not |
|---|---|---|---|
| Workstreams | The pyramid's phases (`services/regulatory/pyramids/*.ts`): every phase of every pyramid ends in a `<phase>.complete` task (checked for all 11 types). Step 2's work breakdown lists tasks by phase (`Pyramid.tsx` `PyWorkBreakdown`, which takes `focusPhase`) | Tasks per phase, with status, owner and dates (steps 2–3) | No row per workstream with its lead, milestone and status |
| Workstream leads | §6: "Workstream leads and a RACI per deliverable are not recorded." | — | So a workstream's lead is read as the owner of its completing task (step 3's owner), and the plan says so |
| Device workstreams | `surfaces/ProjectMdxWorkflow` | Its own items, with Assign | No work-breakdown key (step 4) |
| The schedule's dates | Step 3: `backSchedule` (engine), `schedule` on `GET /api/v1/pyramids/by-project/:ref` | Every task's start and due | No line drawn |
| The agency's review clock | `server/services/market-specs/regulatory-timelines.ts` (`getTimeline`): published goals and milestones for 510(k), De Novo, PMA, NDA/BLA (PDUFA), EU MAA, EU CTA, EU MDR/IVDR, PMDA device; the IND pyramid's own `phase8.submit` (`regulatoryDeadlineDays: 30`, 21 CFR 312.40) | Day offsets from submission, with caveats (goals, clock stops) | Not reached by the plan. None for J-NDA or the IND amendment, annual report and safety report |
| The portfolio's read | `GET /api/c2c/projects` (`server/routes/c2c/projects.ts`, page of cards from `server/services/c2c/project-portfolio.ts`), `cardLine` and the card's `due_date` in `surfaces/Projects.tsx` (D2 §1.4 item 10: "the S11 projection is not blocking, because `cardLine` falls back") | Title, one line, code, updated, target | Nothing about the plan's state. The route that serves the page is not an S11 file |
| The launch gate | `shared/constants/ui-surface-registry.ts`: project-home claims `/api/v1/pyramids/by-project`; prefixes are shared by every surface (`server/middleware/moduleEntitlementGate.ts`) | — | So a batch read under that prefix is served without a registry change |
| Reporting & analytics | Held by the Reporting session (`011HLkY…`, D7/L11) | — | Not touched here |

## What changed

No new screen, mount, table or store. One new read handler on an existing router, under a prefix the launch gate
already serves.

- **The engine** (`services/regulatory/SubmissionPyramidSchedule.ts`, split out of `SubmissionPyramidEngine.ts` when
  that file passed 500 lines, RULE 6's "split, don't add"; the engine re-exports it, so no import changed):
  `taskStanding` (past due, should have started, or neither), `phaseGate` (each phase's completing task) and
  `scheduleSummary` (one project's plan in a few figures: done, blocked, past due, late to start, the next phase to
  complete and its date, and one status word: complete, blocked, at risk, on track or unscheduled).
- **The route** (`server/routes/pyramid.routes.ts`):
  - each phase carries `gate`;
  - `GET /api/v1/pyramids/by-project/:ref` carries `reviewClock`. It comes from
    `server/services/market-specs/regulatory-timelines.ts` by pathway (510(k), De Novo, PMA, NDA/BLA, MAA), or from
    the IND pyramid's own 30-day review (`phase8.submit`, 21 CFR 312.40). It is null for J-NDA, the IND variants, or
    no target;
  - **`GET /api/v1/pyramids/by-project?refs=a,b,…`** (1 to 100), the portfolio lines, one read for a page of cards.
    Each ref is admitted as the single read admits it. A project the person may not read, or one of another
    organisation, answers `{ unavailable: true }` and nothing more.

  The route that serves the Projects page itself (`server/routes/c2c/projects.ts`) is not an S11 file and is not
  touched. Hence a second read for the page rather than a field on the first.
- **The Plan step** (`surfaces/PyramidProject.tsx`, `ProjectPlan.tsx`, `fixtures/pyramid-data.ts`,
  `styles/pyramid-v2.css`):
  - **Workstreams** replaces the one "work breakdown" block. Each row shows the phase, its lead, tasks done, its
    completion date and a status word, and opens to that phase's tasks (the same rows, owners and dates as before).
    A device project's plan adds one sentence: its own workstreams have no work-breakdown key, so they are not counted.
  - **The schedule line**: one calm track from the work's start through the submission and the agency's clock. Each
    phase's completion is a dot, with its date on hover and focus. Today is a thin mark, the critical path is the
    darker line, and the clock is dashed. A caption says the dates and the clock's source, and that agency days
    exclude clock stops where they do.
  - The client's `pyStanding` and `pyWorkStatus` are held to the engine's `taskStanding` and `scheduleSummary` by a
    parity test.
- **Projects** (`surfaces/Projects.tsx`, three lines; `PortfolioLine`, `usePortfolioLines` and `PortfolioLinesNote`
  in `PyramidProject.tsx`): each card, and each list row under its target date, shows one quiet line. Examples:
  "On schedule · Pre-IND Engagement by Jan 28, 2027", "21 tasks past due · …", "1 task blocked · …",
  "Not scheduled: no target date", "Plan complete". A filing with no work breakdown shows nothing more than its card
  says. A failed read is said once above the cards.
- `docs/evidence/SPINE/S11/2026-11-05-owners-and-due-dates/walk.cjs`: opens the workstreams where it opened the old
  block, so step 3's walk still runs (re-run green on the rebuilt database).

## Step 6b, the global schedule in Reporting & analytics: not built, proposed

Reporting & analytics is held by the Reporting session (`011HLkY…`, D7/L11). That session is not among the sessions
this account can list, so the proposal could not be sent by message. It is recorded here and in this session's
COORDINATION row, for its holder.

- **The read** already exists: `GET /api/v1/pyramids/by-project?refs=…` gives, per admitted project, the type,
  target and the engine's summary. `GET /api/v1/pyramids/by-project/:ref` gives the dates, the phase completions and
  the review clock. Reporting would pass the program ids it already lists, at most 100 at a time.
- **If Reporting wants one call for the whole organisation** (no ids), the smallest addition is an `?all=1` form of
  the same handler, over the programs the portfolio admits (`getCurrentAccessibleProgramScope`, as `GET /api/c2c/projects` reads them). That would be an S11 change, made on
  request.
- **The screen**: THE_PROGRAM §5, "one global schedule". One row per project, each with its filing, region and
  agency, on one shared date axis. Each row reuses the Plan step's line: phase completions as dots, the submission
  as a filled dot, the review clock dashed to the decision goal, and today as one mark down the whole chart. It is
  sorted by target date, and the status word comes from the summary. Hover gives a dot's date. No figure is computed
  in Reporting: every date is the engine's or the clock's.

## Proof

| Suite | Green | Red without the change |
|---|---|---|
| `tests/services/regulatory/pyramidBackSchedule.test.ts` (engine) and `server/routes/__tests__/pyramid-project-progress.test.ts` (route: gates, clocks, the batch's admission, tenant scope and limits) | 21 + 26 | `red-server.txt`: 20 fail |
| `client/src/concept2cure/v2/__tests__/projectProgramPlan.test.tsx` (workstreams, line, device note, parity with the engine) and `projectsPortfolioLine.test.tsx` (one read per page, each card's words, list rows, a failed read) | 23 + 5 | `red-ui.txt`: 19 fail, and the Projects file does not load |

All 74 client suites that mount Projects, Project home, the Plan step or the pyramid are green (786 tests). ESLint:
no rise on any changed file. `tsc --noEmit -p tsconfig.check.json`: 0 errors.

## The walk, in the running app, at 1440 and 390

`walk.cjs`, on a fresh database (install-fresh, then deploy-migrate 462/462, with pgvector installed first; see
below). The server ran on port 5100 with the launch gate enforcing, after step 3's walk. Its setup went through the
product's own API: WALK-IND-303 (target Feb 1, 2027) and WALK-510K-401 (a 510(k), target Apr 30, 2027) were created,
WALK-IND-301's Planning tasks were marked done, and one WALK-510K-401 task was marked blocked. `walk.json` is its log
(no API 5xx).

1. **WALK-IND-301.**
   - The line has seven phase dots, the submission on Jun 4, 2027, and "Study may proceed (day 30) · Jul 4, 2027".
   - The workstreams read "Planning · No lead · 7 of 7 tasks done · Completed · Done", then "Pre-IND Engagement · … ·
     Completes Jan 28, 2027 · On track", and so on. The last workstream opens to its tasks, "Submit IND" among them.
   - Screenshots `*-01`, `*-02`, `*-03`.
2. **WALK-IND-303.** "27 unfinished tasks are past their dates". Four workstreams are At risk and today sits inside
   the line. `*-04`.
3. **WALK-510K-401.**
   - The caption reads "MDUFA decision by Jul 29, 2027 (FDA (CDRH), FD&C Act §510(k); MDUFA goals …)", and adds that
     the agency's days exclude clock stops.
   - "Device Characterization" is Blocked, and the device note is shown. `*-05`, `*-06`.
4. **Projects.** One batch read for the page:
   - "1 task blocked · Project Planning by Apr 9, 2027" (red, with the words);
   - "21 tasks past due · Planning by Sep 3, 2026" (amber);
   - "Not scheduled: no target date";
   - "On schedule · Pre-IND Engagement by Jan 28, 2027".
   The list view shows the same line under each target date. There is no horizontal scroll at either width.
   `*-07`, `desk-08`.

## Found on the way

- **The walk database.** The first fresh install ran before pgvector was installed. `project_memory_entries` (it has
  a vector column) was then skipped, so every progress read said "not provisioned". The database was rebuilt with
  pgvector present. This is a property of the local setup, not of the product, but it is worth knowing:
  install-fresh reports "134 skipped for pgvector" and still completes.
- **The 510(k) schedule spans three weeks** (Apr 8 to Apr 30, 2027). The engine's 510(k) tasks carry hours but no
  typical durations, and its dependencies run phase to phase, so 42 tasks at 2–8 hours each lay out in 15 working
  days. The same holds for NDA, BLA, PMA, MAA, J-NDA and De Novo. Only the IND family carries elapsed durations. The
  plan says how its dates were reached; giving those pyramids real durations is content work for the engine's owner,
  not done here.
- Leads are not recorded (§6), so a workstream's lead is the owner of its completing task, and the plan says so.

## Not done here

§8 item 1 (the objective card, S1's). AnA's program-manager questions (S4). A RACI per deliverable (§3.4) beyond the
one owner.

## §8 item 1, the objective and strategy at the head of the Plan step: what it needs (not built)

Asked: show S1's objective at the top of the Plan step through the existing read, if that is all it takes; otherwise
write what it needs and stop. It is not all it takes, for three reasons.

1. **The read exists, but nothing on trunk renders it.** `useProjectObjective` (`surfaces/projectSettingsRequest.ts:156`,
   `GET /api/charters/by-project/:ref/objectives`) is tested (`__tests__/projectObjectiveRead.test.tsx`). At
   `cca60356` it has no caller. The About card and New project commits named for S1 (`d516b97167`, `76eae6309d`) are
   not in this clone's history, which is shallow. Whatever they rendered is not at HEAD: no surface imports the hook.
2. **Where it sits is an open design decision.** D3 §4.3 specifies `ProjectObjective`, a function in `ProjectHome.tsx`
   (D3's file), under the project's name. It is "said once" and kept out of the About card. D3 §8 open item 1 leaves
   its place to the design lead. THE_PROGRAM §8 item 1 puts it at the head of the Plan step. Adding it to the Plan
   step as well would say it twice. Adding it only there contradicts D3's spec. That is the lead's call (or the
   founder's, while the lead is out), not this session's.
3. **"The strategy" has no read.** The charter's `regulatory_strategy` and `critical_success_factors`
   (`shared/schema/project-charter.ts:118–119`) are reached by no project read. `server/routes/charters.ts` serves
   `/by-project/:ref/objectives` only. Showing the strategy needs a `regulatory_strategy` section read beside the
   objectives one (S1, in `charters.ts` and `charter-objectives.ts`), admitted the same way.

Once the place is decided:
- **Under the name (D3 §4.3):** D3 renders `ProjectObjective` with the hook as specified, and the Plan step adds nothing.
- **At the head of the Plan step (THE_PROGRAM §8):** `ProjectObjective` is written once (D3's markup) and rendered
  first in `ProjectPlan.tsx` (S11/D3), before "Due for you", and D3's place under the name is dropped. The strategy
  line follows when (3) exists.
