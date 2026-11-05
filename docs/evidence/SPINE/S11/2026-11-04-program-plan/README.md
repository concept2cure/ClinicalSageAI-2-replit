# S11 step 2: the project's program plan, with its own progress (2026-11-04)

Package S11 (founder decision P-82; `docs/design/THE_PROGRAM_2026-11-01.md` §7.2, §9 step 2): the submission
pyramid is the project's work breakdown, its progress is kept per project, and it is shown in the project's Plan step.

## What already exists

Searched: `pyramid`, `SubmissionPyramid`, `TaskProgress`, `calculateProgress`, `getCriticalPath`, `estimateTimeline`,
`pyramid_task_progress`, `PlanAssign`, `IndFilingPlan`, `ProjectPlan`, `/api/v1/pyramids`, and the launch registry's
`apiPrefixes`.

| What | Path | What it did | What it did not |
|---|---|---|---|
| The work breakdown engine | `services/regulatory/SubmissionPyramidEngine.ts`, `services/regulatory/pyramids/*.ts` | One pyramid per filing type (IND and its amendment, annual report and safety supplement; NDA, BLA, MAA, J-NDA, PMA, 510(k), De Novo): phases, tasks with role, hours, dependencies, critical path, CTD bindings, risks; `calculateProgress`, `getCriticalPath`, `estimateTimeline` | Nothing per project |
| Its routes | `server/routes/pyramid.routes.ts` | `GET /api/v1/pyramids/:type`, `GET/PATCH /api/v1/pyramids/:type/progress` in the feature store, one row per organisation and type | Progress per project: two NDAs shared one board. It refused "In progress" and "In review" (it accepted `in_progress`, not the engine's `in-progress`, and had no `review`) |
| Its screen | `client/src/concept2cure/v2/surfaces/Pyramid.tsx`, `PyramidAnalytics.tsx` | A type picker, dashboard, work breakdown, task sheet and analytics | Outside the launch catalog; no project; roles printed as ids |
| The Plan step | `surfaces/ProjectPlan.tsx`, `editor/IndDocumentLibrary.tsx` (`IndFilingPlan`), `surfaces/PlanAssign.tsx` | What an IND needs, document by document, each assignable to a person with a due date (a task in `unified_tasks`); the device workstreams | The work that produces the documents (the pyramid's tasks), its critical path, its progress |

## What changed

- `pyramid.routes.ts`: `GET /api/v1/pyramids/by-project/:ref` and `PATCH …/progress/:taskId`, project-admitted
  (read, write), the pyramid the recorded filing resolves to (`metadata.submissionTypeId`, else `program_type`,
  through `shared/regulatory/submission-type-bridge.ts`; a filing with none says so), progress under the key
  `project:<program>:<type>` beside the per-type rows. Statuses are the engine's `TaskStatus`. A store whose table is
  absent answers "not provisioned" through the ORM's wrapped error.
- `PyramidProject.tsx` (split from `Pyramid.tsx`): the Plan step's "Program plan": the progress line, the work
  breakdown on demand, each task's status written to the project's route (reverted and said when refused), and the
  task sheet. `ProjectPlan.tsx` places it after the filing's documents.
- `fixtures/pyramid-data.ts`: every role the pyramids name has a label (`pyRoleLabel`; a later one reads in words).
- `shared/constants/ui-surface-registry.ts` (R1, its own commit): project-home claims `/api/v1/pyramids/by-project`, so
  production serves it.
- `styles/pyramid-v2.css` (F1, its own commit): at phone width a task's name has its own line.

## The walk, in the running app

`walk.cjs`, against the fresh install on port 5100 (`LAUNCH_SCOPE_ENFORCE=on`, `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`):
production's launch gate is on, so the route is shown served. `walk.json` is its log; screenshots in `screenshots/`.

1. C2C-101 (IND), Plan step: "Program plan · IND — Investigational New Drug work breakdown", "0 of 58 tasks done ·
   critical path 0% done · about 326 hours of work remaining". `01-c2c101-program-plan.png`
2. The work breakdown opened; "Define product profile" set to In progress: `PATCH` answered 200. `02-…`
3. Reloaded: it reads In progress. `03-…`
4. LMN-201 (another IND): the same task is To do. The progress is the project's, not the filing type's. `04-…`
5. NeuroPanel-Dx (510(k)): its own plan, "7 phases, 42 tasks". `05-…`. ONC-221 (NDA) is not in this tenant.
6. 390 wide: no horizontal scroll; each task's name on its own line. `07-…`
7. The task set back to To do, so a re-run starts from the same state.

## Found on the walk, and fixed before landing

- The first run answered 500: the read named a `regulatory_programs.submission_type_id` column that does not exist
  (intake keeps the exact filing in `metadata.submissionTypeId`; `serializeProgramDetail` lifts it). The unit test had
  mocked the SQL; it now pins the expression.
- On the older dev database (no `project_memory_entries`) the read answered 500, not "not provisioned": Drizzle wraps
  the driver's error, so `42P01` is on `cause`. Both pyramid routes now read it there; a test holds it.
- Roles printed as ids ("project_manager", "toxicologist"). Labels for all of the engine's roles; a guard test.
- At 390 px the 110 px role column left a task's name a word per line under the role text.

## Other regions: found 2026-11-05, not landed

The engine also holds work breakdowns for Health Canada (NOC), the TGA (AUST R), PMDA, Swissmedic, ANVISA and EU CE
marking (`services/regulatory/globalPyramids.ts`). None resolves through the registry, and today none can be reached:
New project offers no filing in those markets. `GET /api/submissions/market-support` answers `not_offered` for an
NDA or BLA to Health Canada, the TGA, Swissmedic, ANVISA, PMDA or MHRA, and for a Canadian CTA or device licence,
because the platform has no filing outline there. The one non-FDA filing it offers is an EU MAA (author-only), which
already resolves to the engine's MAA pyramid. No project in either database has a non-FDA agency on a US filing type.

So the program plan's reach into those markets (a registry map to the canonical global configs, and a rule that a US
pyramid is a project's plan only when FDA is its agency) was written, tested and walked, then not landed: it would
reach nothing, and its regulatory pairings would go unexercised. Its patch is kept with this session. What it waits
on is the market itself, a filing outline for each one: "Add a market" (F22), a founder decision. Content found while
reading them, for that review: the alias configs share their canonical's tasks, so `TGA_CTN` lists PI and CMI (a
registration's), `EU_CE_IVDR` classifies by the MDR's rule, and `PMDA_CTN` is the Shonin plan.

## Not done here (S11's later steps)

Owner and due date per pyramid task, back-scheduled from the target date along the dependencies (step 3, with S9);
the content plan joined (pyramid bindings, documents, leaves); AnA's program-manager questions (S4); the portfolio line
(step 6). The NDA plan was not walked: the fresh tenant has no NDA project.
