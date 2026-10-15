# F2: five tabs; the start box above them

Launch row **D2**. Slice F2 of `docs/design/FILING_SPINE.md` §7.2.

## What was wrong

- The project page had seven tabs: Plan, Evidence, Author, Review, Submit, Respond and Lifecycle.
- Every tool on Plan and Lifecycle is outside this release. With launch scope enforced, both tabs said "Not in this release" and offered nothing to click (`fixtures/project-home-data.tsx:295-309`).
- Plan's Schedule panel fetched only numeric project ids (`SCHED_IDENT_RE`). The page holds a program UUID, so the panel never loaded for a project opened from Projects. Its "Ask AnA to generate one" asked a model for dated milestones, which breaks CLAUDE.md Rule 2.
- The start box and the project's Conversations sat inside the Author tab. Opening any other tab unmounted a half-typed message. AnA's `set-stage` description had to warn it not to leave Author.

## What changed

- `fixtures/project-home-data.tsx`:
  - `PJ_LIFECYCLE` is now the five tabs, in the order of the work: Evidence, Author, Review, Submit, Respond. The blurbs say what each tab is for.
  - `PJ_STAGE_TOOLS` keeps only Respond. Respond keeps its tools until F15 gives it its own actions.
- `surfaces/ProjectHome.tsx`:
  - The `plan` and `lifecycle` branches are removed, along with `SchedulePanel` and its types and helpers.
  - The start box (`StartConversation`) and the new `ProjectConversations` render above the tabs, outside the stage switch, whenever a project is open and its record loaded. `ProjectConversations` is the Conversations list that used to be in `AuthorWorkspace`, moved unchanged apart from one hint line.
  - `project-home.set-stage` maps `plan` and `lifecycle` to Submit (`STAGE_ALIASES`) and says so in its result.
  - Submit ends with a coming-later line, as text with no button: "Coming later: regulatory intelligence and precedent, agency meetings, registrations and variations, market access and pharmacovigilance."
- `shared/navigation/surface-actions.ts`: the `set-stage` description names the five tabs and the two aliases. The enum still accepts `plan` and `lifecycle`, so AnA calls that use them still resolve. The warning about unmounting the composer is gone, because it is no longer true.
- Tests:
  - `__tests__/projectHomeStages.test.tsx` (new). Eight cases.
  - `projectHomeStageTracker.test.tsx` and `projectHomeLaunchScope.test.tsx` now expect five tabs. Their Plan and Lifecycle cases are dropped; those tabs no longer exist.
  - `projectHomeSchedule.test.tsx` is deleted with the panel it tested.

### The deletion (CLAUDE.md working agreement)

- History search: `git log --all --diff-filter=D -- 'client/**/*Schedule*' 'client/**/*schedule*'` returns nothing, so no earlier schedule component was deleted and rebuilt.
- No other client file calls `/api/concept2cure/projects/:id/schedule-of-events`.
- The server route and AnA's `generate_schedule_of_events` tool are not touched.
- Replacement: none on screen, by the CPO decision in `FILING_SPINE.md` §2 ("Plan and Lifecycle") and §5. Two reasons:
  - The panel never loaded for a program, by reading: `pid` is a UUID or null, and `SCHED_IDENT_RE` is `^(?:proj_)?\d+$`.
  - What Plan promised is named on Submit as coming later. Add a market (F22) and the Planner (F21) take over market choice.

## Runs

| File | Result |
|---|---|
| `red/vitest.txt` | At `4536fe4c`, before the change, with launch-scope verdicts mocked as in production: **8 failed**. Seven tabs; "Not in this release" on Plan; `set-stage` `plan`/`lifecycle` open Plan/Lifecycle; no coming-later line; a Schedule heading; the start box gone on Evidence; Conversations not found above the tabs. |
| `green/vitest.txt` | `projectHomeStages.test.tsx`: **8 passed**. |
| `green/vitest-project-home-and-nav.txt` | Every `projectHome*` suite, the AnA drive suites, `shared/navigation` and `tests/ui` (including the F0 reachability gate): **291 passed, 40 files**. |
| (not filed; too large) | Every test under `client/src/concept2cure/v2`: **4819 passed, 443 files**. `tsc --noEmit -p tsconfig.json`: **0 errors**. |

Gates:
- `ci:launch-scope` is green. On the first attempt it refused a new `PJ_STAGE_ALIASES` import from `fixtures/` for a launch surface. The alias map now lives in `ProjectHome.tsx`.
- `ci:canvas-path`, `ci:surface-discoverability`, `ci:design-system` and `ci:surface-text-ramp` are all green.

## Not done here

- The Respond tab still lists the generic stage tools. F15 replaces them with its three actions.
- Add a market and the Planner on Submit are F22 and F21.
