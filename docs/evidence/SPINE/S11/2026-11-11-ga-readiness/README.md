# S11 for GA: what was built, checked as production runs it and as a customer sees it (2026-11-11)

The founder, 2026-11-11: "focus entirely on getting what we built surfaces correctly on the UI and working for GA."
Package S11 (and S1, S9 for one line each, as on 2026-11-10). Nothing new: every change below finishes or repairs
something S11 already put on the screen.

## What already exists

Everything checked here is S11's own, by its evidence folder: owners and due dates (`../2026-11-05-owners-and-due-dates/`),
due for you and the content plan's join (`../2026-11-05-plan-step/`), workstreams, schedule line and the Projects line
(`../2026-11-05-portfolio-line/`), the global schedule built by Reporting (`../2026-11-09-global-schedule/`), the
strategy and the reschedule (`../2026-11-10-strategy-and-reschedule/`). No capability was added.

## How it was checked

Earlier walks ran with the server connected as a database superuser, where row-level security is inert. This time:

- the database on trunk's set (`deploy-migrate`, 470 of 470), with the runtime role minted by it (`app_service`:
  NOSUPERUSER, NOBYPASSRLS);
- the server as that role (`APP_DATABASE_URL`), `RLS_ENFORCE=on`, the launch gate enforcing
  (`LAUNCH_SCOPE_ENFORCE=on`, `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`);
- three people: the project's owner, a viewer in the same organisation, a member of another organisation.

## What was found, and what was done

| # | Found | Done |
|---|---|---|
| 1 | **A 510(k) plan read as a three-week schedule.** That filing type (and De Novo, PMA, NDA, BLA, MAA, J-NDA) has task hours but no typical durations on record, so the plan laid hours end to end and showed it like a forecast; the Projects card said "On schedule". Durations are regulatory content with a cited source and are not invented here | The engine's schedule now says what its dates rest on (`durations`: typical, hours-only, mixed). An hours-only plan says, in plain sight: "These are the earliest possible dates, not a forecast. … Allow for review cycles, testing and waiting time when you set the target date." Its Projects line reads "On schedule against minimum dates". |
| 2 | **A viewer was offered every task's status dropdown**; choosing one failed with a refusal. (Assign, Edit, State the strategy and Use the schedule's date were already hidden.) | Statuses are shown, not offered, to a person who may not change the project (a viewer, an archived project), in the rows and in the task sheet. |
| 3 | A viewer's refused due-date change said "do not allow this assignment" | It says "do not allow changing this task's due date". |
| 4 | Internal wording on the screen: "the engine's", "work-breakdown key", "The engines hold no review clock" | Said in the customer's words: "the standard one for this filing type", "its typical duration", "No agency review clock is on record for this filing type", "tracked by their own items". |
| 5 | Three explanatory paragraphs above the plan | The method is one quiet disclosure, "How these dates are worked out". |
| 6 | "1 of 58 tasks have an owner" | "1 of 58 task has an owner". |
| 7 | Workstream names wrapped at 1440 while the lead column stood empty | Column widths; "0 of 7 done". |
| 8 | The strategy's form was titled and submitted as the objective's | Opened from the strategy it reads "Record the project's regulatory strategy" / "Record strategy". |
| 9 | The schedule line's track was an image with focusable children | The track is a named group; each dot is an image with its own name and date, reachable by keyboard. Applied to the global schedule's track too (the same markup, in the same file). |
| 10 | Two of S11's own walk scripts had gone stale (the strategy now opens the Plan step; Projects remembers the List view) | Both follow the app as it is. |

Not defects: under the runtime role with row-level security enforced, every S11 read and write behaved as it did as a
superuser. No 5xx on any walk.

## Access, in the running app (`access.txt`)

- **Another organisation's member**: sees no projects; the plan, the objective and its strategy answer 404; the
  portfolio batch answers `unavailable` and nothing else; a status change, an objective write and a due-date change
  are each refused with 404. Nothing changed.
- **A viewer in the same organisation**: reads the plan, the portfolio line and the objective; a status change, an
  objective write, a due-date change and a task create are each refused with 403. Nothing changed.

## Proof

- Red/green (`red.txt`): 7 tests fail without the client and tasking changes, among them the viewer's status, the
  customer wording, the keyboard semantics and the refusal's words. New: the engine's `durations` for all eleven
  pyramids; the route's `durations` on the plan and on the portfolio line; the minimum-dates note and the card's words.
- 86 client suites that mount these surfaces: 900 tests pass. 14 server and engine suites: 327 pass.
- ESLint: no rise on any of the 17 changed files. `tsc --noEmit -p tsconfig.check.json`: 0 errors.
- All four S11 walks re-run green as the runtime role (`rewalk.json`): owners and due dates (11 steps), the Plan step
  (7), workstreams, line and Projects (10), strategy and reschedule (9).

Screenshots (`screenshots/`): the IND plan at 1440 (`desk-plan-*`) and 390 (`phone-plan-*`); the 510(k) plan with its
minimum-dates note (`desk-device-*`, `phone-device-*`); a viewer's task sheet (`desk-viewer-sheet.png`); Projects at
1440 and 390.

## Left for their owners

- **Typical durations for the seven hours-only pyramids** (the engine's content owner; cited sources only). Until
  then those plans say they are minimum dates.
- **Reporting (`011HLkY…`)**: the global schedule shows the same hours-only projects. The batch line now carries
  `durations`; the chart could say "minimum dates" for those rows as the Plan step does.
- **Project page (`01FTWc…`)**: the objective route is read twice on the page; a viewer's project page asks
  `GET /api/submissions?programId=` and is answered 403 (seen in the browser's network log; not S11's).
- **The Plan step now has two things called a schedule**: S11's line inside "Program plan", and the "Schedule" section
  (`ProjectSchedule.tsx`: section owners, milestone tasks, the roll-up). They do different jobs; whether they should
  read as one is the design lead's.

## Second pass, 2026-11-12

The founder, 2026-11-12: continue toward GA readiness, "completing what we have, enhancing, hardening". Still S11's own
work, plus one line in tasking (S9) beside the reschedule this lane added there.

| Found | Done |
|---|---|
| **A person whose deadline was moved by someone else was not told.** A reassignment notifies its new owner; the due-date change added on 2026-11-10 did not | After the change commits, the task's owner gets "Due date changed: <task> · Now due <date>" (`task_update`). Their own change is not announced to them; an unconfirmed commit announces nothing; a failed notice never fails the change. |
| **The global schedule in Reporting & analytics drew hours-only projects like forecasts** (handed to Reporting on 2026-11-11; their hold on S11's files is released, and the chart is in S11's file) | Under the chart: "Earliest possible dates, not a forecast: <projects>. Typical task durations are not on record for this filing type yet…". Nothing is said when no row is hours-only. |
| `PyramidProject.tsx` passed the 500-line lint limit | The portfolio line and the global schedule are split into `surfaces/PyramidPortfolio.tsx` (same folder, re-exported, so no import changed). |

Proof: `task-assignment.pglite.test.ts` (the owner is told, after the commit; not for their own change; not on an
unconfirmed commit) and `reportingGlobalSchedule.test.tsx` (the note names the rows; absent when none). 74 client
suites that mount these surfaces pass (767 tests). ESLint: no rise.

In the running app, as the runtime role with RLS enforced: a colleague moved the owner's "Submit IND" a day earlier;
the owner's notification reads "Due date changed: Submit IND · Now due 2027-06-02", and the owner's own change back
produced none. Reporting & analytics, "When does each project file?": four rows, and the note names the 510(k)
project (`desk-global-schedule.png`, `phone-global-schedule.png`; no horizontal scroll at 390).

## Dark mode, 2026-11-12

The earlier "dark" capture had not switched the app's own theme (it reads `c2c-v2-prefs`, not the browser's colour
scheme). Re-done with the theme on, at 1440 and 390, on the IND plan, the 510(k) plan, a task sheet and Projects:
every text node's colour against its nearest opaque background meets WCAG AA (4.5:1, or 3:1 for large text), none
below; the schedule line, its dots and the status words read on the dark surface (`screenshots/dark-*.png`). Nothing
needed changing.
