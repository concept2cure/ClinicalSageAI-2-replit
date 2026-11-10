# S11 step 6b: the global schedule in Reporting & analytics (2026-11-09)

**Package:** S11 (P-82; `docs/design/THE_PROGRAM_2026-11-01.md` §5 and §9 step 6). **Session:** the reporting session
(`session_011HLkYC…`, lane L11), which holds Reporting & analytics. **The ask:** THE_PROGRAM §5, "One global schedule.
It shows each region's filing date and review clock side by side", and §8, "Reporting & analytics holds the global
schedule and the portfolio". S11's step 6a session left 6b proposed to this holder
(`../2026-11-05-portfolio-line/README.md`, "Step 6b … not built, proposed").

## What already exists (RULE 3)

Searched: `global schedule`, `schedule`, `timeline`, `portfolio`, `reviewClock`, `review clock`, `PDUFA`, `MDUFA`,
`ScheduleLine`, `PortfolioLine`, `usePortfolioLines`, `pyramids/by-project`, `overview.programs`, `programChoices`,
`portfolio_rollup`, `RODashboard`, and `Gantt`, `*imeline*` and `*chedule*` in deleted history
(`git log --all --diff-filter=D`; none in Reporting).

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The engine's dates | `services/regulatory/SubmissionPyramidSchedule.ts` (`backSchedule`, `scheduleSummary`) | Each project's tasks back-scheduled from its target date, and the plan in a few figures | — |
| The agency's clock | `server/routes/pyramid.routes.ts` `reviewClock`, from `server/services/market-specs/regulatory-timelines.ts` and the IND's 30 days | Calendar days from the target date to the decision goal | — |
| The batch read | `GET /api/v1/pyramids/by-project?refs=` (`portfolioLine`) | The portfolio line on Projects: type, target, summary, for up to 100 projects | Carried no start, no filing and no clock, so a chart could not be drawn from it |
| The line | `surfaces/PyramidProject.tsx` `ScheduleLine` (the Plan step), `PortfolioLine` (Projects) | One project's line; one quiet line of words | Nothing across projects |
| Reporting's cross-project answer | `surfaces/Insights.tsx` `roRouteReply` → `RODashboard` kind `portfolio` | The Enterprise readiness board, reached from the find field and a suggestion | No schedule |
| The projects the reader can open | `overview.programs` (`server/routes/insights-canvas-routes.ts` `programChoices`) | The program picker's list | — |

## What changed (`c0729896d7`, `3707064475`, both `Plan: S11`)

No new screen, mount, table or file.

- **The read:**
  - `portfolioLine` also carries `filing`, `start` (the back-schedule's first day) and `reviewClock`;
  - they are the single read's own values, which the route test checks against the single read;
  - admission is unchanged.
- **The chart:** `GlobalSchedule` in `PyramidProject.tsx`, beside `PortfolioLine` and `ScheduleLine`. It reuses the Plan
  step's `.py-line` marks.
  - One row per project on one shared date axis, sorted by target date:
    - the work from its start to the target submission (filled dot);
    - the agency's clock, dashed to its decision goal;
    - the next phase to complete;
    - today, the same mark in every row.
  - Each row names its filing and agency, and where its plan stands, in the portfolio line's own words.
  - A project that cannot be drawn is named, with the reason.
  - A failed read is said. Over 100 projects, it says it shows the first 100.
- **Reporting** (`Insights.tsx`):
  - The find field routes "schedule", "timeline", "milestones", "clock", "dates" and "when" to it.
  - A fourth suggestion asks "When does each project file?".
  - It answers in the canvas, as the portfolio board does, over the projects the reader can open.
  - It is not gated to Enterprise: it shows the plan lines Projects shows every reader.
  - A row's name opens that project.
- **Found in the walk, fixed in `3707064475`:**
  - the review clock rendered as a solid line;
  - a double rule sat under the heading.
  See "Found".

## Red first (`red/`)

| File | What it shows |
|---|---|
| `red-server.txt` | The route test's two new cases fail on the old handler: the line has no filing, start or clock (`expected undefined to be 'us_ind'`), 2 of 28 |
| `red-ui.txt` | `reportingGlobalSchedule.test.tsx` fails 9 of 9. The component is not exported, and there is no "When does each project file?" suggestion |

## Green (`green/`)

`suites.txt` covers all 62 Reporting, Projects, Plan-step and pyramid test files and the engine's
`pyramidBackSchedule.test.ts`: 633 of 633 pass. Also:
- the route test passes 28 of 28;
- `ci:pushed-typecheck`: 0 errors;
- ESLint: no file's warning count rose. The schedule's dashboard was taken out of `RODashboard` so that function did
  not pass 100 lines;
- `ci:undefined-css-classes`, `ci:check-phantom-tokens` and `ci:surface-text-ramp` pass;
- `ci:one-design-plan`: inside the plan.

## The walk, in the running app

The method is the Reporting re-walk's (`docs/evidence/DESIGN/D7/2026-11-08-reporting-rewalk/`):
- a `git archive` copy of the commit, on port 5100, with `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on` and dev sign-in;
- the local `clinicalsage` database, migrated forward by the copy's `deploy-migrate` (runtime role `c2c`, not a
  superuser, no RLS bypass);
- `jm.smith@concept2cure.pro`, organisation 1;
- Chromium at 1440×900 and 390×844, light and dark.

Organisation 1 had one project, C2C-101, so one row would not show a schedule across projects. `seed-projects.mjs`
created four more through the product's own API (`POST /api/c2c/projects`), as S11's step 6a walk did:

| Project (title) | Code | Filing, target |
|---|---|---|
| WALK-GS-IND | WALK | IND, Feb 1, 2027 |
| WALK-GS-510K | WALK-GS-510K | 510(k), Apr 30, 2027 |
| WALK-GS-NDA | WALK-4YHD | NDA, Sep 15, 2027 |
| WALK-GS-NOTARGET | WALK-4YKW | IND, no target date |

Reporting names a project by its code, as the portfolio board does.

`capture.cjs` opens Reporting on C2C-101 and clicks "When does each project file?". At each size and theme it records:
the rows' words and marks, the caption, the off-schedule note, overflow, orange fills, script errors and 5xx responses.
In the light theme it also:
- asks the find field "show the filing timeline";
- opens C2C-101 from its row.

### Found, at `c0729896d7` (`found/`)

- **The agency's clock was drawn solid.** `.py-line-clock` was a 2px dashed border-top with a 1px radius, painted
  solid by Chromium, in the faint `--border-strong` (`found/clock-solid-zoom.png`, the NDA row). The caption says "the
  dashed part is the agency's review clock", so the words and the chart disagreed.
  - The same rule draws the Plan step's `ScheduleLine`, so the Plan step read the same way.
  - Fixed: the dashes are drawn (`repeating-linear-gradient`) in `--text-400`.
- **A double rule under the heading:** the dashboard head's rule, then the first row's. Rows are now separated between
  each other, with one rule under the list.

### Fixed, at `3707064475` (`fixed/`, `probes.json`)

At 1440 and 390, light and dark:
- the find result reads "The schedule covers the 5 projects you can open, each from its own plan's dates and its
  agency's published review clock.";
- four rows, sorted by target date:
  1. WALK: "IND · FDA", "21 tasks past due · Planning by Sep 3, 2026", in the warning colour;
  2. WALK-GS-510K: "510K · FDA (CDRH)", with the MDUFA decision (day 90) on Jul 29, 2027;
  3. C2C-101: "Investigational New Drug Application · FDA", Study may proceed (day 30) on May 31, 2027;
  4. WALK-4YHD: "NDA · FDA (CDER/CBER)", with the PDUFA action date (day 304) on Jul 15, 2028;
- "Not on the schedule: WALK-4YKW (no target date)";
- today is the same mark in every row (11.65% along);
- 0 page and 0 document overflow, no script errors, no 5xx;
- at most one orange fill (the header's primary).

The find field's "show the filing timeline" gives the same schedule. C2C-101's name opens
`/concept2cure/project-home?program=e89b7009-…` (`opened-*-light.png`). `planstep.cjs` shows the Plan step's clock
dashed too (`fixed/plan-step-line-1440-light.png`).

The filed `capture.cjs` takes its view's options as one object, and `seed-projects.mjs` uses `console.info`, both for
the lint ratchet. Otherwise they are the scripts that ran.

## Not covered here

- **Phase completions other than the next.** The batch read carries only the next one, so the global chart shows
  the work, the next phase, the filing and the clock. The Plan step shows every phase.
- **Short schedules.** The NDA and 510(k) schedules span about four and three weeks. The engine's non-IND pyramids
  carry hours, not elapsed durations (`../2026-11-05-portfolio-line/README.md`, "Found on the way"). That is content
  work for the engine's owner, not done here.
- **Short clocks at 390.** An IND's 30-day clock is under its dots at 390 on a two-year axis. Its date is in the dot's
  label and title.
- **A project's people** (THE_PROGRAM §5, "the people it depends on") are not shown. Leads are not recorded (§6).
- No model key is set, so nothing here exercises AnA.
