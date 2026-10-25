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

## Pass 2 — each feature in its project step (next)

The founder's model is that features live inside the client's workflow. Project home already scopes each
step to the program. Pass 2 completes it:

1. Open a project on the first step with work to do, not always Author.
2. Each step states, in one line, what to do now, from the program's own reads (no inferred status).
3. Each step lists the existing tools that belong to it (Author: the editor, protocol development, CMC /
   Module 3 composition; Submit: Submission Center's builder, IND forms and 1571, readiness, gateway; Respond:
   agency letters), each **opened with this project's context** or not offered — the defect that deleted
   `PJ_STAGE_TOOLS` on 2026-10-15 was a tool opened without its context.
4. Plan & features' "when to use / start with / next" guidance moves into those steps.

Pass 2 starts from this file's What already exists, and its slice names the step, the tool and the context
each tool is opened with.
