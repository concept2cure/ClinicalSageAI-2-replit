# The client's way in: projects first, features inside the project

Date: 2026-10-25. Launch row **D2** (the launch catalog a new organisation's client sees and can use).
Canonical branch `concept2cure-v2`. Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/`.

## What the founder found

The founder tested the product as a client and could not use it. In their words: the project management
screen opened on "a screen layover start that I'd never seen before that doesn't work", the regular project
screen behind it was confusing, and "I have no idea what we're doing with apps, what the apps do, how to use
them, when to use them." What was built are features that belong inside a client's regulatory project. The
only durable work areas are Risk-based monitoring, CMC, Biostatistics, Communication, Tasking, Projects and
Vault (with Quality and Reporting, per `IND_CROSS_FUNCTIONAL_WORK_2026-10-23.md`). A person should understand the
sequence on arrival and not have to make "a whole bunch of random selections".

A session reproduced the founder's path on a freshly provisioned local install, signed in as a new client
(screenshots under `before/` in the evidence directory). It found:

1. **The "apps".** The left rail's second entry was *Workflows*, the module catalog renamed from *Apps* on
   2026-10-23. It lists 87 features, each a card with a price tier and an Open button, grouped under seven work
   areas and an "Additional capabilities" tail of 50. It is an app store, whatever its heading says.
2. **The overlay.** Home's primary button, "Start a new Biotech & Pharma project", replaces the screen with the
   New project wizard. Its first step shows 43 filing types in one wall of grey cards, most tagged "Author
   documents for this market", which read as disabled. Cancel lands on the regular Projects screen.
3. **The rail.** Twelve entries in no order of work, collapsed by default to unlabelled icons, with two pairs
   sharing a glyph (Tasking / My work, Communication / Conversation).
4. **Home.** A chat page: AnA's run controls ("AnA drives", "Demos", "Between steps", a paragraph of
   ceilings) open in the composer, four AnA starters, four shortcuts of which "Program journey" opens an empty
   screen for an organisation that has a project, and "Explore workflows" into the catalog.
5. **The project.** The model the founder describes is already there: Project home's five steps, Evidence →
   Author → Review → Submit → Respond. It opens on Author, says nothing about what to do next, and the
   features that belong to each step are listed in the catalog, not in the step.

## Decisions, 2026-10-25 (founder)

Asked three questions after the findings above, the founder chose:

- **Left rail:** Home, Projects, Tasks, Communication, Vault, then *Work areas*: CMC / Module 3, Quality,
  Reporting & analytics. Submission Center opens from a project's Submit step. The catalog and Conversation
  leave the rail. This replaces the rail the founder kept on 2026-10-16 and 2026-10-17 (P-36's note).
- **Risk-based monitoring and Biostatistics:** stay off the rail until each is in the launch catalog (Rule 2).
- **First screen:** Home, as a "start here" page: your projects, your tasks, Ask AnA, your conversations.

## Decisions of the design interview, 2026-10-25 (founder)

Recorded here so later sessions build on them (Rule 2). The founder's direction that followed — "we must not lose
any of one functionality that is in our apps catalog", every feature placed in the core product and none called an
app — is recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md` P-47 and supersedes decision 11.

| # | Decision | Status |
| --- | --- | --- |
| 1 | The primary user is the regulatory lead at a small biotech filing a first US IND. | Basis of every pass |
| 2 | A project is one application across its life; a later application (an NDA after the IND) is a linked project. | Open. An unreached store exists: `concept2cure_project_links` and `/api/concept2cure/projects/:id/linked` (kinds `parent_ind`, `child_nda`); on no deploy path, keyed to integer projects, no client. The wizard also still creates stand-alone IND-amendment and annual-report projects. |
| 3 | Six steps, Plan → Evidence → Author → Review → Submit → Respond: a guide, never a gate. | Done, pass 3 |
| 4 | Plan holds what the filing needs by module, the team, the target date and the tasks; Assign creates a task in the one task store. | Done, pass 3 |
| 5 | The steps first; AnA's start box and the project's conversations beside the open step. | Done, pass 4 |
| 6 | Each new submission is a sequence; Submit lists every sequence; the header names the sequence in progress. | Open |
| 7 | AnA is an assistant inside every step, never the navigation. | Held by passes 1–5 |
| 8 | The rail's work areas cover work across all projects; inside a project the same work is scoped to it. | Done for the rail, pass 1; scoping per area open |
| 9 | Home lists your open items, and a new organisation's three-step setup. | Done, pass 5; the projects named on each item, pass 6 |
| 10 | Device wording on a device project; a consultancy filters its projects by sponsor client. | Device wording on Plan, Author, Submit; Respond, Evidence and Review open. Sponsor filter open: project admission is pinned to the current client workspace, which v2 cannot switch. |
| 11 | Unreleased features hidden from everyone. | Superseded by P-47 for released features (each is placed, none lost). Out-of-release names still offered in the "@" menu and the account menu: open. |
| 12 | "Project" everywhere; "program" leaves the visible text. | Client text in progress; server-supplied text (phase labels such as "Program Planning", error sentences) open |
| 13 | A scripted first session, run for real. | Done, pass 6 |

## What already exists

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `client/src/concept2cure/v2/registryModel.ts` `RAIL_CORE`; `Shell.tsx` `Rail`, `AccountMenu` | The rail's list and the account menu. Entries open screens, some through the validated screen-action bus (`applies`). | No grouping; twelve flat entries. |
| `client/src/concept2cure/v2/V2App.tsx` `Prefs.railCollapsed` | Persists rail state; default collapsed. Prefs are written whole, so the default is serialised into every stored pref (the same defect `liveDriveDefault` re-reads once). | — |
| `client/src/concept2cure/v2/surfaces/Surfaces.tsx` `Home`, `HomeLeadProgram` | Greeting, one "lead programme" line, the composer seeding `conversation-thread`, the first-run welcome, `SEGMENT_CONTEXT.actions` shortcuts, "Explore workflows". | No list of projects, tasks or conversations. |
| `client/src/concept2cure/v2/onboardingWelcome.ts` | First-run welcome: two client-type starters, workspace discovery, start from a document. | — |
| `server/routes/chat/threads.ts` `listThreads` (no params) | The caller's own recent conversations, titled by their first message. | Had **no client caller**. |
| `client/src/concept2cure/v2/surfaces/projectThreads.ts`, `ProjectHome.tsx` `ProjectConversations` | A project's own conversations, resumable. | — |
| `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`; action `tasking.filter` | The org task board; `mine` filter by the signed-in person. | — |
| `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx` (`Apps`, id `apps`) | The live module catalog: plan, quotas, lock reasons, governed enable/disable. | Not a place a client works from. |
| `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` `RegistryPicker`; `Projects.tsx` `NewProjectWizard` | Filing picker on the server's offer (`build_and_sequence` / `author_only` / `not_offered`), hiding the not-offered behind search. | Did not order by the offer; every offered filing in one grid. |
| `client/src/concept2cure/v2/fixtures/project-home-data.tsx` `PJ_LIFECYCLE` | The five project steps and their one-line descriptions (allow-listed reference config). | — |
| `ProjectHome.tsx` stages | Evidence, Author, Review, Submit, Respond, each scoped to the program. | No "what to do now" or tools per step. `PJ_STAGE_TOOLS`, a per-step tool list, was **deleted 2026-10-15**: its one entry opened the editor with no letter (replaced by `ProjectRespond.tsx`). |
| `client/src/concept2cure/v2/surfaces/BiopharmaJourney.tsx` (`program-journey`) | Program journey; empty for every program a client creates (only the demo seed fills it). | Deferred by `WORKFLOW_DISCOVERY_2026-10-23.md`. Not restored. |

Searched: the rail, account menu, Home, landing, welcome, onboarding, catalog, apps, workflows, journey,
start-here, getting-started, recents, threads, task board and filing picker, by component, route, surface id
and CSS class; `git log --all --diff-filter=D` (full history, fetched for this) over Home, Landing, StartHere,
GettingStarted, AppLauncher, AppsCatalog, CapabilityBrowser, ProgramJourney and WorkflowGuide. Deleted: the
2026-10-23 `CapabilityBrowser` overlay (converged onto the catalog, not restored) and pre-v2 marketing landing
pages and an `ectd/WorkflowGuide` under the 2026-01 legacy archive. No earlier start-here Home existed.

## Pass 1 — the way in (this change)

Each change completes or reaches something that exists; nothing new is built beside it.

- **Rail** (`RAIL_CORE`, `Rail`): five places, then a *Work areas* group with a heading (a rule when
  collapsed). Tasking and My work are one entry, **Tasks**. No two entries share an icon.
- **Where each removed entry is reached** (working agreement: a removal names its reachable replacement):
  - the catalog → account menu **Plan & features**, organisation administrators only (`Shell.tsx`
    `AccountMenu`); still in ⌘K and at its unchanged id `apps`; `shellNav.test.tsx`, `cmdkLicenseGating.test.tsx`.
  - Submission Center → a project's Submit step (`ProjectMarkets`), ⌘K, deep link; `launch-scope` unchanged.
  - My work → the board's own **My tasks** filter, and Home's **Your tasks**; `shellNav.test.tsx`,
    `homeStartHere.test.tsx`.
  - Conversation → Home's **Recent conversations** (the first client caller of the recents route) and each
    project's own list; ⌘K; `homeStartHere.test.tsx`, `shellNav.test.tsx`.
- **Rail starts open** with labels, except at phone width; a pref serialised under the old default is re-read
  once (`railDefault: 2`), a collapse made afterwards is kept; `liveDriveDefaults.test.tsx`.
- **Home** (`Surfaces.tsx`, its sections in `HomeSections.tsx`): *Your projects* (each opens its Project home through the one
  `openProjectHome` helper the portfolio now uses too; with none, what a project is, its five steps from
  `PJ_LIFECYCLE`, and one way to start, with the first-run welcome's other ways beside it), *Your tasks*,
  *Ask AnA* (run controls behind **AnA settings**), *Recent conversations*. The per-segment shortcuts
  (`SEGMENT_CONTEXT.actions`) and "Explore workflows" are removed; their only reader was Home.
- **Catalog** retitled **Plan & features** (surface registry, AnA's navigation list, lock panel copy); its
  content, entitlement logic and governed writes are unchanged.
- **New project** (`RegistryPicker`): a tab leads with the filings **built and validated here** (not "submitted": transmission is not proven, D7)
  (`build_and_sequence`); the rest are one press away under **More filing types** — not called
  documents-only, because a filing that creates an application without being it (a Pre-IND meeting) has no
  tier stated. A search lists everything, as before. Cards are white, not the disabled-looking grey.

Unchanged: entitlements, launch scope, module grants, routes, server code and data.

## Pass 2 — each feature in its project step (done, same day)

Project home already scopes each step to the program; pass 2 completes it. Evidence:
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass2/`.

1. **Opening step.** A project with no documents opens on Evidence; with documents, or when its list could not be
   read, on Author. A step chosen by a person, AnA (`project-home.set-stage`), the MDX workflow or a handoff is never
   overridden (`ProjectHome` `chooseStage`).
2. **What to do now** on each step (`PJ_LIFECYCLE.now`, `nowDevice`): one sentence of guidance about the step, never
   a claim about the program. A filing that builds no sequence gets no Submit sentence about sequences; its
   `NotSequencedState` says what its Submit step is.
3. **Next step**: the band offers the next step (`StageBand`, reusing the band's unused `pj-stageband-next` styles),
   so the five steps read as a sequence. Respond has none.
4. **Tools in their step**, each opened on this project (both screens read the open program) and only where it
   serves the filing — the lesson of the deleted `PJ_STAGE_TOOLS`:
   - Author: **CMC / Module 3** for a US IND whose product is recorded as a drug (the composition boundary).
   - Submit: **IND forms** (1571, cover letter, Letter of Authorization; P-32) for a US IND. They were reached only
     from inside a Submission Center sequence.
   The rule "a US IND" is one function, `isUsInd`, moved from `SubmissionCenter.tsx` to `programSequence.ts`.

Not done, and why: the remaining tools already sit in their step (Evidence: Vault, data room, source tracer;
Author: editor, protocols; Review: review board, tasks; Submit: Submission Center, readiness, compile; Respond:
agency letters, Communication). Plan & features keeps its "when to use" guidance for administrators; the client
reads the step's own sentence instead.

## Pass 3 — Plan: what the filing needs, who does it, by when (done, same day)

The founder's next finding was the deeper one: "I didn't know how to flow into an actual document build." A new
project's Author step said "No documents in this project yet. Ask AnA in the box above to draft one" and offered the
editor with nothing open. The founder decided (decisions 3 and 4 of the design interview) that a project has six
steps, Plan first, and that Plan shows what the filing needs, the team, the target date and the tasks, with "Assign"
on a deliverable creating a task in the existing task store. Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass3/`.

### What already exists (for Plan)

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `services/regulatory/pyramids/*.ts` (IND, IND amendment, annual report, safety supplement, NDA, BLA, MAA, JNDA, 510(k), De Novo, PMA) | The plan of work per filing type: phases → tasks → deliverables bound to CTD sections. | Shown only on the out-of-scope Pyramid screen; its progress (`/api/v1/pyramids/:type/progress`) is per organisation and type, not per project. |
| `server/services/authoring/ind-document-catalog*.ts`, `GET /api/authoring/ind-document-catalog` | The IND pyramid projected as 8 phases and 93 deliverables, each with a built-in template (`builtin-authoring-templates.ts`, 21 document templates plus 200 IND templates). | — |
| `client/src/concept2cure/v2/editor/IndDocumentLibrary.tsx` | Lists those deliverables, sections and module outlines with search and filters; per entry: open this project's working copy, create one from the template, find a source, work with AnA. | Reached only from a lane of the editor's and Evidence's project-files panel. No assignment. |
| `client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx` | A device project's workstreams (`shared/regulatory/work-packages.ts`), each opening its existing feature. | Sat above the steps; no assignment. |
| `client/src/concept2cure/v2/editor/AssignReviewDialog.tsx` `createReviewTask`, `useAssigneeRoster` | The one task create for a person (POST `/api/tasks/tasks`), confirmed only on the server's own task id; the roster read. | Review-specific wording. |
| `client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities.tsx` `useProjectTeam` | The verified team and the numeric `projects.id` behind the program (`verifiedProjectId`), the key the project's work view reads tasks by. | Rendered on Author. |
| `ProjectHome.tsx` `ProjectWorkPanel`, `MyWorkLine` | The project's tasks from every store; a line to the person's own tasks. | Rendered on Author. |
| `regulatory_programs.target_submission_date` | Read by the project record. | No route writes it; Plan shows it read-only. |
| Deleted: the 2026-10-08 Plan tab (`58876cf3a`, slice F2) | Held nothing that could be opened. | — |

Searched: plan, pyramid, deliverable, work package, workstream, document catalog, template, assign, task create,
roster, target date, by component, route, table and surface id; `git log --all --diff-filter=D` on ProjectPlan,
PlanStep, Pyramid, Deliverable and ProjectSchedule. Deleted predecessors, none of them a project step: a pyramid
template picker, `components/ectd/ECTDPyramidTemplateSelector.jsx`, and its `ectdPyramidService.js` (removed with
the pre-v2 UI on 2026-05-01 and 2026-04-01); `concept2cure/hooks/useDeliverable.ts` (a disconnected island, 2026-06-02);
`services/regulatory/globalPyramids.ts` (dead code, 2026-08-02). The picker's job, starting a deliverable from its
template, is what `IndDocumentLibrary` already does; Plan reaches it.

### What changed

- **Six steps.** `PJ_LIFECYCLE` gains Plan first (with device wording); "plan" stops being Submit's alias, and AnA's
  `project-home.set-stage` names it. A project with no documents opens on Plan.
- **What this IND needs** (`ProjectPlan.tsx`, `IndFilingPlan` in `IndDocumentLibrary.tsx`): the same catalogue read,
  entries and template copies as the library, grouped by phase with "n documents · m started". Each phase a feature
  composes opens it on this project: Module 3 → CMC / Module 3 within its composition boundary (not for a biologic),
  Module 1 → IND forms, QA Review & Submission → Submit. The library stays in the editor's project files.
- **A device project's Plan** is its workstreams (`ProjectMdxWorkflow`, moved from above the steps).
- **Any other filing** is told the list is available for US INDs and device filings in this release, and where its
  documents are. No list is invented.
- **Assign** (`PlanAssign.tsx`): one task for one person with a due date, through `createAssignedTask` (the review
  create, generalised; `createReviewTask` keeps its words). The task carries `projectId` = the verified `projects.id`
  (never a `Number()` of the program UUID), `moduleType` Plan, and its origin `filing_deliverable` /
  `<program uuid>:<deliverable id>`; the assignment is read back from `/api/tasks/tasks/by-module/Plan` by those
  columns, never by title. Not offered to a viewer, nor while the project id is unverified. The project's task list
  is read again after each Assign.
- **Team and tasks** moved from Author to Plan; Author keeps documents, module completion, records and activity.

Not done, and why: the per-project progress of NDA, BLA and MAA plans (their pyramids exist, but progress is stored per
organisation and type, so two projects would share it; a per-project store is a server change of its own); editing the
target date (no route writes it).

## Pass 4 — the steps first, AnA beside the open step (done, same day)

Decision 5. The start box and the project's conversations sat above the steps (FILING_SPINE.md §2), so on a first
screen the steps began about 690 px down. They now sit in a side column beside every step, outside the step switch,
so a half-typed message survives a change of step as before; Author's readiness and skills cards join the same
column. What already existed: `.pj-grid/.pj-main/.pj-side` (app-v2.css), used only by Author; `StartConversation` and
`ProjectConversations` (ProjectHome.tsx); `ProjectSide.tsx`. Nothing new was built; the three composers (Home, project,
thread) are still three, and converging them is its own change. Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass4/`.

## Pass 5 — Home lists your open items; a new organisation's setup (done, same day)

Decision 9. What already existed: the top bar's "Your work" (`TaskTray.tsx`) read and grouped exactly what Home
needed — tasks assigned to you, approvals you sign, reviews — inside a drawer; the company-documents profile
(`/api/client-branding/company-documents`), the organisation read (`/api/organizations/:id`, `activeUsers`), Admin &
access's Settings and Members tabs and their `admin-console.open-tab` action, and the New project wizard. The groups
and reads moved to `OpenWork.tsx`, used by the drawer and Home alike; the checklist (`HomeSetup.tsx`) reads each
step's fact strictly and opens the screen where it is done. Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass5/`.

## Pass 6 — the first session, run for real (done, same day)

Decision 13. A scripted first session in a real browser, every step a click or a keystroke: sign in as the
regulatory lead of a new organisation, create an IND project, add a source on Evidence, assign a document on Plan
to a person with a due date, start it from its template, ask AnA to draft it, save a revision, send it for review,
and see what is left on Home, on the project and on the reviewer's Home. It is the second test in
`tests/e2e/golden-customer-journey.e2e.ts`, which CI already runs on a fresh database (`tier5-browser-smoke.yml`).

What already existed: that file's governed journey (the same records, driven by API calls in a browser session);
`founder-critical-path.e2e.ts` and `biotech-founder-path.e2e.spec.ts` (neither is in CI; the first skips itself when
sign-in fails). The first-session test reuses the golden journey's sign-in and identities.

Run for real, it found two defects, both fixed here:

- **A new person's first Send for review offered no reviewer.** The `/api` limiter counts every path with a
  `document`/`documents` segment in a 20-a-minute bucket meant for generation, export and download. The Vault's
  metadata reads were moved out of it on 2026-10-08; the project's document list, a document's outline, the editor's
  review requests, comments and tracked-change decisions, and the source-coverage summary were not. One first session
  used the bucket up, the review-requests read was refused, and the dialog said who had been asked was unknown, so no
  one could be chosen. Those reads joined the Vault's in the metadata bucket (600 a minute per person, still
  fail-closed), renamed `document_metadata` (`server/middleware/redisRateLimiter.ts`,
  `server/config/platform-limits.ts`). Section text, downloads, exports and every write keep the 20-a-minute ceiling.
- **Home's open items could not tell projects apart.** The same document assigned in two projects was listed twice,
  identically. Each item now names its project (`server/services/tasking/my-work.ts`, moved out of the route so it is
  tested on real SQL; joined within the caller's organisation only), and tasks due the same day come in a fixed
  order, newest assignment first. The top bar's "Your work" shows the same rows, and a row says the module's words
  (the existing `clModLabel`), not the identifier a task is stored under (`submission-center`, `cmc`, `mdx`).

The what-exists critic also found Home's setup checklist offered to administrator roles the server refuses
(`business_admin`, `platform_admin`); it now follows the company read's own `canManage`.

Not fixed here, seen on the way: the editor's draft request reads "Draft preparation Target Product Profile …" (the
section's code is spliced into the sentence). Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/first-session/`.

## Pass 6 — the CMC work area says what to do, and reaches what we built (done, same day)

Passes 1–5 reorganised the way IN and touched no work area. Opened as a client, CMC /
Module 3 was still nine nouns in a tab strip: *"I was very dismayed to see the CMC UI and
the lack of features we have built that are not showing."* Two complaints, both true.

What already existed: the rail reaches CMC under *Work areas* (`RAIL_CORE`, pass 1) and
the Author step offers it where it composes (`ProjectHome.tsx` `ProjectDocuments`,
`cmcComposes`) — the navigation was never the gap. `CMC_NAV` held nine `{id, label, icon}`
entries and the only sentence beside each was its screen's own `CmHead meta`, which says
what the screen HOLDS, not what to do on it. `StageBand` (`ProjectStages.tsx`, pass 2)
already renders "what this step is / what to do now / next step" over `LifecycleStage`
`{id, label, icon, blurb, now}`, and `RecordHistoryPanel` (`cmcRecordHistory.tsx`,
2026-10-18) already renders one register record's §11.10(e) history with honest states.
Sixteen registers had that panel; specifications did not.

A reachability sweep over all 99 CMC routes against every file in `client/src` found three
built capabilities with no screen — stability trending, process capability, and the
specification revision log. The first is the sharpest: the Stability tab's own AnA starter
has offered "Show every study trending toward a limit" the whole time, with the
deterministic answer reachable only in chat.

What changed: `CmcNavItem` gains `blurb` and `now`, rendered by **`StageBand`** rather than
a second band, with the destinations in the order the work is done so "Next" reads as the
path through Module 3; `now` keeps the steps' rule (guidance, never a claim about the
program) under a test. The three engines get doors on the screens they belong to —
a Trend action per stability study, `CmProcessCapability` on Batch records, and the
specification's history **through the one panel**, by giving its existing route the envelope
`register-history` answers (`readSpecificationHistory`) plus the actor's name, tenant
ownership and fail-closed 503; `store` travels with every payload because `sealed: false`
means different things in the two stores. Specifications and Batch records gained the
`openProgramAction(nav)` door their "Open a program" empty states told clients to use.
And a specification's limits can be edited at all: `buildSpecUpdate` encoded only objects
while the create encodes four `jsonb` columns unconditionally, so a plain criterion edit
answered 500 — the encoding now follows the column.

Not done, and why: `POST /sections/:p/:k/refresh` stays without a client caller, recorded
in the reachability test with the door that serves it (`/build-section/:p/:k`, which also
bridges the compile to its governed artifact); converging the two is its own change.
Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass6/`.
