# Information architecture: the client journey

Date 2026-10-25, revised the same day for the founder's rule on the catalogue and again after a code check of the
draft; direction clarified on 2026-10-26 below. Launch row D2. Owner: the founder. Companion to `DESIGN_BRIEF.md` (this folder) and
`docs/design/CLIENT_JOURNEY_2026-10-25.md` (passes 1–5, committed through `f8e0d3210`). Evidence:
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/`.

This document gives every catalogue entry and screen the product has (139 items, each read in code and checked by a
second reader) one home in the product. For each it says whether a client can use it there today and, if not,
exactly what it needs first. It builds nothing. Every row extends, completes, reaches or converges something that
exists (Rule 3).

Quoted strings and line numbers are from `f8e0d3210`. The uncommitted "program" → "project" wording sweep in the
working tree (task 13) already changes some of them: for example `OPEN_PROGRAM_LABEL` (`programAction.ts:44`) reads
"Choose or create a project" there. Where this document proposes client copy, it is the copy after that sweep.

**The founder's rule** (2026-10-25, recorded as P-47): "we must not lose any functionality that is in our apps
catalog, but take all that and place it in the core product, and get away from calling the needed functionality and
features apps." This document applies it as follows:

- **No item is retired.** Every capability of every item has a home: a place, a project step, a document's build,
  AnA, or administration.
- **A duplicate is folded, not dropped.** It goes into its canonical capability, and each of its functions is first
  shown to exist there or carried over. Only the empty shell is removed, and the commit that removes it names the
  reachable replacement by path and the gate that proves it (working agreement). No shell is removed until the
  function-parity audit (`FUNCTION_PARITY.md`, this folder) confirms its row. A function that cannot be carried as it
  is goes on the founder's list (section 5.9) with its reason; it is never dropped inside a table cell.
- **Specialized capabilities are features, not standalone apps.** A client sees a place, a step, a document's tools,
  or AnA doing something. An
  administrator sees *features* in Subscription & features (today labelled "Plan & features"; renamed so that "Plan"
  means only the project's first step, section 9). The central-service exception clarified below governs standalone identities.
- **Shown when it works.** A capability is shown to a client in its home once it works on the client's real data.
  Until then its home names it in words on the step's *Coming later* line, with no button (P-47;
  `ProjectComingLater.tsx`). A fixture, demo or screenless capability is placed now and shown later.
- **Launch scope is a sequencing fact** (Rule 2). An item outside `LAUNCH_SURFACE_IDS` is placed now and admitted to
  clients by the founder's decision once it works. Section 8 gives the order, and names a slice for every item that is
  not live now.

### Accepted direction and implementation boundary (2026-10-26)

**Accepted founder direction:** move specialized former "apps" into the core product's project workflow screens.
Reserve standalone app identities for standardized central services, with **Projects, Submission Center, Tasking,
Vault, CMC, RBM, and Study and Protocol Design** named as examples. A therapeutic specialty, device discipline,
filing pathway or calculation does not acquire a separate app identity because it has an existing surface or
catalogue row. Its functions are reached in the relevant project step or document, using the shared service owner.
This extends P-47; it does not replace this placement map or section 8's order with another architecture plan.

**Recommendations, not additional founder approvals:** retain shared homes for **Authoring with Review/Approval**,
**Reporting & analytics**, and **organisation administration, access and audit**. These functions already exist;
the recommendation is to use their existing owners across workflows. It does not authorize new apps, rail entries,
commercial grants or scope expansion. Reporting and Authoring retain their earlier recorded launch decisions.
Communication and Quality also retain their existing homes and safeguards; their absence from the latest examples
does not retire them. The founder's examples identify a central-service boundary, not an exhaustive replacement menu.

#### Existing central-service owners

Paths below are under `client/src/concept2cure/v2/` unless qualified. This is an ownership map, not a claim that
every service is admitted, complete, entitled or shown on the rail.

| Founder-named central service | Existing owner | How a project uses it / current limit |
| --- | --- | --- |
| Projects | `surfaces/Projects.tsx`, `surfaces/ProjectHome.tsx`, `surfaces/ProjectPlan.tsx`, `surfaces/ProjectStages.tsx` | The canonical project and its six steps; extend the filing plan and work packages here. |
| Submission Center | `surfaces/SubmissionCenter.tsx`, `surfaces/ProjectMarkets.tsx`; `shared/constants/launch-scope.ts` | Submit and Respond carry the project, market and sequence into the existing filing workflow; validation, approval and dispatch gates stay with it. |
| Tasking (currently labelled Tasks) | `surfaces/TaskBoard.tsx`, `surfaces/PlanAssign.tsx`, `OpenWork.tsx` | Assigned work and source-linked deliverables use the same tasks. This direction does not create a second task service or change the current label by itself. |
| Vault | `surfaces/Vault.tsx`, `editor/ProjectFilesPanel.tsx` | Evidence and document versions use the same governed records; project context and access checks travel with each hand-off. |
| CMC | `surfaces/CmcModule.tsx`, `surfaces/CmcModule3Build.tsx`; `server/services/cmc/composition-scope.ts` | Plan/Author reach the existing service. Its small-molecule US IND composition boundary and commercial verdict remain in force. |
| RBM | `surfaces/Rbm.tsx`, `surfaces/RbmSurfaces.tsx` | Evidence/study conduct reaches the existing study-linked monitoring work when ready and admitted; section 5.1 and slice 25 still name its record-linking and readiness gaps. |
| Study and Protocol Design | `surfaces/ProtocolDev.tsx`, `surfaces/ProtocolDevDesign.tsx`, `surfaces/ProtocolDevWorkspace.tsx` | Plan/Author use the existing protocol and study-design workspace. Its current `protocol-dev` ownership under Authoring does not require a parallel app, study store or editor; section 7's protocol convergence still applies. |

#### Tailoring inside a project

The same workflow screens reveal the work that applies to the selected project, using:

- **Product type:** the recorded drug, biologic, device, IVD or other supported product context; a tenant's industry
  preference alone does not establish the product's facts.
- **Pathway and stage:** the recorded filing/application type, pathway and current lifecycle or document stage;
  reuse the existing filing catalogue, pyramids and work-package compiler.
- **Jurisdiction:** the project's selected markets and supported pathway/version. A reference rule or market option
  is not evidence that a product meets it or that a service supports it.
- **Role and records:** the person's actual permissions and assigned work, and the accessible project, study,
  document and sequence records. A workstream's discipline label does not grant access. Missing facts and failed
  reads remain explicit; they do not become default eligibility, readiness or a zero count.

Tailoring changes placement and context, not authorization. Keep server scope, organisation/project isolation,
commercial entitlements, governed lifecycle, provenance, review/signature and export/dispatch safeguards. AnA calls
the same canonical engines and records; a relocated calculator keeps its stated-input basis and unknown inputs.
Before removing a former screen, route or identity, prove every function in its reachable replacement, preserve
bookmarks and `@` handles through the existing routing contracts, and name the parity/reachability test by path.

There are two kinds of thing, and only two:

- **Places**: the few destinations a person goes to on their own: Home, Projects, Tasks, Communication, Vault, and the
  work areas CMC / Module 3, Quality, Reporting & analytics (later Biostatistics and Risk-based monitoring).
- **Features**: everything else. A feature has no front door. It appears inside a project at the step where it is
  needed, inside a place at the moment it is needed, inside a document at the moment of its build where it is needed,
  or as something AnA does there. It is named for what it does there.

Two screens hold features without being either: the project, whose six steps are where most features live, and the
conversation, where AnA works beside every step. Neither is a rail entry.

**The 139 items, as verified.** Realness: 32 work on real data end to end, 71 work in part, 19 render sample or demo
data, 17 have no screen. In the launch catalog: 53; outside it: 86. Homes in this document: 9 places (Home, the bare
base, has no inventory row), the project and the conversation (2), 3 features inside a place, 19 project-step
features, 18 document-build features, 6 AnA actions, 10 administration items, and 72 duplicates folded into a
canonical item. Status: 25 live now, 5 ready to place, 36 need work to show, 1 platform only, 72 fold in.

### Status vocabulary

Every row in section 5 carries exactly one status.

| Status | Meaning |
| --- | --- |
| LIVE NOW | Reachable in the home this row names, today, placed by passes 1–5 or before them, and honest on real data. The row can still name what is left to complete; where a client meets a false or always-empty state on it today, the row names the slice 0 fix. |
| READY TO PLACE | Works, or works in part and says so, on a client's real data, and is in the launch catalog, but is reached today from somewhere other than its home. Placing it in its home is wiring only, and the row names the slice that does it. |
| NEEDS WORK TO SHOW | Not yet true on a client's real data, or outside the launch catalog. The row says exactly what is missing before a client sees it. Where a client can reach it today with a defect, the row says what slice 0 hides or fixes first. |
| PLATFORM ONLY | A tool for the platform's own operators. It is placed under platform administration and is never shown to a client. |
| FOLD IN | A duplicate. The row names its canonical, each function it carries over and where each goes, and the state of the carry-over (section 5.8). |

**An AnA action** (section 5.6) has no screen and no surface of its own. It is LIVE NOW when every tool and command it
names is in AnA's launch scope (`server/services/ana/ana-launch-scope.inventory.json`, decided at run time by
`anaCapabilityInLaunchScope`, `server/services/ana/ana-launch-scope.ts:59-67`) and AnA runs it beside the step today.
Its "In launch scope" cell then reads "no (its AnA tools: yes)", because the surface the inventory once gave it is
outside the catalog while its tools are not.

## What already exists

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `client/src/concept2cure/v2/registryModel.ts` `RAIL_CORE`, `NAV_HIDDEN`, `DEEP_LINK_ALIASES` | The rail: five places, then *Work areas* (pass 1). Surfaces kept off the rail. AnA's navigation aliases; `ind-lifecycle` → `ind-checklist`; `mdx` → `device-workstream` (`registryModel.ts:963`). | Three aliases land on surfaces outside the release: `biopharma` → `program-journey`, `intelligence` → `global-ri`, `safety` → `pv-cockpit`. An alias carries no step and no "no project open" fallback. |
| `shared/constants/ui-surface-registry.ts` (121 surfaces) | Each surface's id and `label`, which the breadcrumb (`Shell.tsx:559`), the page title (`Surfaces.tsx:412`), ⌘K and Plan & features show. | Most labels are the old catalogue names ("IND lifecycle", "510(k) workbench", "PV cockpit", "Vault (DMS)", section 9). |
| `client/src/concept2cure/v2/Shell.tsx` `AccountMenu` (`:314`, items `:344-380`) | Account; Admin, Plan & features, Access requests (administrators); Licensing (platform administrators); Usage & limits, Billing, the client type, View all plans, Set up a workspace, Codebase coverage, Get help (opens the conversation), Log out (every member). | Codebase coverage, offered to every member, opens a lock. "Plan & features" and "View all plans" use "plan" for the subscription while the project's first step is Plan. |
| `client/src/concept2cure/v2/Shell.tsx` `TopBar` (`:519`), `ProjectChip` (`:486-516`), `CmdK` (`:635`) | The breadcrumb; the open project's chip, which opens the project (or Projects when none is open); ⌘K. ⌘K searches all 121 registry surfaces and lists up to 25 matches under a "Surfaces" header, a locked one with its lock reason (`:715-760`). With an empty query its "Jump to" lists the first eight registry entries: Projects, Plan & features, Artifacts center, Project home, Document editor & authoring, Regulatory workspace (locked), Vault (DMS), Review & approval. | ⌘K is a catalogue for clients: it lists features that are folded, not yet shown or locked, by their old names (Submission twin, 510(k) workbench, Device & diagnostics workbench, PV cockpit, Biostat workbench, Program journey, Inconsistency Intelligence, Intelligence catalog, AnA Authoring Engine). |
| `client/src/concept2cure/v2/V2App.tsx`, `routing.ts` | One route per surface, `/concept2cure/:surfaceId`; Home is the bare base; an unknown segment renders an honest scaffold. | The address bar shows internal ids, `/concept2cure/apps` among them. |
| `client/src/concept2cure/v2/shellProject.ts` | The open project, per tab (sessionStorage) and on the URL as `?program=<uuid>`; `openProjectHome`. | The open step is kept nowhere: a project with documents opens on Author whichever step a person left from. |
| `client/src/concept2cure/v2/navParams.ts` `stashNavParamsForTarget`, `consumeNavParams`; `editorTarget.ts` | Validated, one-shot, TTL-bounded hand-offs to a surface (a sequence, a transmittal, a section) and to the editor (a document, a family: `k510`, `pma`, `cer`, `ivdr`). Project home consumes only `workId`, which opens Review (`ProjectHome.tsx:1467-1470`). | No hand-off names a step other than Review. |
| `client/src/concept2cure/v2/surfaces/Surfaces.tsx` `Home`; `surfaces/HomeSections.tsx`; `surfaces/HomeSetup.tsx`; `client/src/concept2cure/v2/OpenWork.tsx`; `taskTarget.ts` | Home: *Set up your organisation* for a new organisation's administrator (pass 5), *Your projects*, *Your open items* (pass 5: tasks assigned to you, approvals you sign, reviews, the same groups as the top bar's drawer), *Ask AnA*, *Recent conversations*. A task opens on Tasks (`tasks?taskId=…`, `taskTarget.ts:22-26`); approvals and reviews open the review board (`OpenWork.tsx:148-187`). | No Quality training, periodic reviews or access requests among the open items. Nothing reads a task's `sourceEntityType` `filing_deliverable` (`PlanAssign.tsx:35`), so an assigned deliverable opens the task, not the deliverable or its document. |
| `client/src/concept2cure/v2/fixtures/project-home-data.tsx` `PJ_LIFECYCLE`; `surfaces/ProjectComingLater.tsx` `ComingLater` | The six steps, each with "what to do now", device wording, and Submit's and Respond's *Coming later* line: words, no button (`project-home-data.tsx:324-337`). | Plan, Evidence, Author and Review have no *Coming later* line. Respond's line names agency meetings, which fold into Communication and Plan. |
| `surfaces/ProjectHome.tsx` (`chooseStage`, `ProjectWorkPanel`, `StartConversation`, `ProjectConversations`), `ProjectStages.tsx`, `ProjectPlan.tsx` (`IndPhaseDoor`, `MyWorkLine`), `PlanAssign.tsx`, `ProjectMdxWorkflow.tsx`, `ProjectMarkets.tsx`, `ProjectRespond.tsx`, `ProjectDossier.tsx`, `ProjectSide.tsx` | Each step's content and its feature doors (passes 2–3); Plan's deliverables, Assign, team, tasks and a "My work" section; a project with no documents opens on Plan. The side column `aside.pj-step-side` beside every step holds AnA's start box and the project's conversations, and on Author the readiness card, the skills AnA follows here (`ProjectSkills`), and Memory and Instructions cards (pass 4). | The Memory and Instructions cards read nothing: they always say "No project memory yet" and "No custom instructions yet" (`ProjectSide.tsx:24-42`), a store this screen cannot read rendered as empty. |
| `editor/IndDocumentLibrary.tsx` `IndFilingPlan`; `GET /api/authoring/ind-document-catalog`; `server/services/regulatory/pyramids/*` | The IND plan of work as 8 phases, 50 tasks and 93 deliverables, every one with a template; each started by "Create from template" and opened by "Open {title} · {status}"; phase doors to CMC / Module 3 (phase 3), IND forms (phase 7) and Submit (phase 8). Pyramids also exist for the IND amendment, annual report and safety supplement, NDA, BLA, MAA, J-NDA, 510(k), De Novo and PMA. | Only the IND plan is projected into Plan. A phase's "m started" counts editor documents matched by template or title (`IndDocumentLibrary.tsx:26-30`), so work kept elsewhere (a Module 3 composed in CMC) is not counted. |
| `editor/DocumentWorkbench.tsx` | The one editor (Authoring surface and AnA's canvas, pinned by `scripts/ci/check-canvas-path.mjs`). Side rail: comments, history, sources, signatures, audit, exports, vault, tasks, access. *Send for review* (`SendForReviewDialog.tsx`, `DocumentWorkbench.tsx:71`), `AuthoringAssemblyBuild`, `TemplateGuidance`, the figure and claims checks. | No tool is chosen by document type. No way back to the project other than the top bar's project chip. |
| `editor/savedTemplateContext.ts`; `shared/authoring/recorded-template-source.ts` | The open document's `template_id` and recorded template source (`docTemplateContext`), whose `entryId` is `registry:<id>`, `component:<id>`, an IND deliverable id, `section:<CTD code>` or `module:<M>`. | Not mapped to a document kind. |
| `shared/regulatory/filing-document-classes.ts`; `shared/regulatory/global-document-registry.ts`; `server/services/authoring/builtin-authoring-templates.ts`, `ind-authoring-templates.ts` | The governed document's `doc_type`; every registry id; 22 component templates, 174 registry preparation templates and 200 IND templates, each with a stable id. | No template for a device label or IFU, a USPI, an agency response or a payer dossier. |
| `server/services/ana/ana-launch-scope.inventory.json`; `ana-launch-scope.ts` | Which AnA tools and commands run in this release: 619 tools and 74 commands listed in scope; 172 tools and 41 commands listed under `hiddenApp`. A tool listed there still runs when any surface it serves is in `LAUNCH_SURFACE_IDS` (`anaCapabilityInLaunchScope`, `:59-67`), so the device tools of `device-presub`, `device-postmarket`, `device-software`, `device-clinical-studies`, `device-udi`, `device-diagnostics`, `device-510k`, `device-cer`, `labeling` and `risk` run in production today. | — |
| `shared/constants/launch-scope.ts`; `useSurfaceAvailable`; `LaunchScopeGate` | Which surfaces a client may open; the lock panel for the rest. Communication's module keeps its tier ("no new organisation grant"); CMC / Module 3 lists no module ("pricing is the founder's call"). | A self-serve organisation, created at the free tier, sees Communication and CMC / Module 3 on its rail and meets a lock on both. |
| `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx` (surface id `apps`) | Plan & features, administrators only (pass 1). | Non-device cards still carry an Open button. |
| `client/src/concept2cure/v2/catalogWorkflows.ts`; `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx`; `shared/constants/launch-scope.ts` | Groups subscription feature rows under existing `LAUNCH_APPS` owners, with when/start/next guidance; preserves the original group indices for governed switches. | Catalogue regrouping is presentation, not completed placement inside project workflows, and makes no access or admission decision. |
| `shared/navigation/callable-apps.ts`; `client/src/concept2cure/v2/appMentions.tsx`; `server/services/ana-ri/message-intent.ts`, `server/services/ana-ri/invoked-apps-block.ts` | One shared `@` capability vocabulary, labels and legacy aliases drive composer suggestions, server intent/context and tool selection. | The internal `app` name is not approval for a standalone product destination. Removing or renaming handles without migrating both consumers would lose callable functionality. |
| `client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx`; `client/src/concept2cure/v2/surfaces/ProjectPlan.tsx`; `client/src/concept2cure/v2/shellProject.ts` | Existing recorded product/pathway work packages, feature-availability checks and project/step continuity are the integration spine. | The MDX compiler currently receives `markets: []`; discipline labels are not role/access predicates. Non-IND/non-device Plan coverage and jurisdiction/record tailoring are incomplete. |
| `docs/design/FEATURE_AND_SERVICE_INVENTORY.md`; `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/cleanup/inventory-plan.md` | Existing function/service inventory and ordered convergence/parity work, including the client-journey hand-offs. | Neither replaces this canonical placement map, proves all function carry-over complete, nor authorizes deletion without a reachable replacement. |
| `shared/constants/deferred-capability-inventory.ts`; `docs/SURFACE_DECISIONS_2026-10-08.md` | Earlier converge decisions, kept here. | — |
| `parity-batches.json` (a working file of this session, not in the repository) | The input of the function-parity audit. | Batched against the pre-correction canonicals (section 5.8); `FUNCTION_PARITY.md` does not exist yet. |

Searches run for this document, beyond the inventory's own per-item searches: the rail, `NAV_HIDDEN`,
`DEEP_LINK_ALIASES`, `PJ_LIFECYCLE`, `ComingLater`, `chooseStage`, `consumeNavParams`, `IndPhaseDoor`, `MyWorkLine`,
`pj-step-side`, `ProjectSide`, `OpenWork`, `taskTarget`, `filing_deliverable`, `HomeSetup`, `ProjectChip`, `CmdK`,
`AccountMenu`, `template_id`, `templateSource`, `entryId`, `doc_type`, `EDITOR_TARGET_DOC_TYPES`, the editor's
`rail ===` values, `?program=`, `stashNavParamsForTarget`, `OPEN_PROGRAM_SURFACE`, `WORK_DESTINATIONS`, `documentKind`,
`adequacy`, every registry `label` quoted in section 9, and the AnA launch-scope inventory for every tool named below.
`git log --all --diff-filter=D` on `*DocumentTools*`, `*DocTools*`, `*ForThisDocument*`, `*ToolRail*`, `*FeatureDoor*`,
`*StageTools*`, `*DocumentKind*` and `client/**/*Rail*`. Deleted predecessors of per-document tools:
`components/workspace/INDRightRail.tsx` (section-specific context tabs, `6a25ab34d`, 2026-05-01),
`routes/authoring/documents/[docId]/RightRail/GuidancePanel.tsx` (`bb243dfad`, 2026-04-28), `PJ_STAGE_TOOLS`
(2026-10-15), and, from the inventory, `components/editor/InconsistencyPanel.tsx` (`e5a74a4df`),
`SourceTraceabilityPanel.tsx`, `components/biostats/AnaBiostatsPanel.tsx` (`e5a74a4df`),
`components/ana/SafetyNarrativeAffordance.tsx` (`2895218b8`) and `LabelingAuthoringPane.tsx` (`2895218b8`). The
editor's per-section guidance (`TemplateGuidance`) is the surviving successor of the first two. A placement below that
restores one of the others is a reach, not a build. Nothing found already chooses tools by document type. "CMC
adequacy", named by the founder for later, has no catalogue item and no code by that name; it is placed in CMC /
Module 3 (section 5.1) and listed last (section 8).

**2026-10-26 continuation check** (code snapshot `7eec0035`): re-read the placement/handoff, filing cleanup plan,
feature/service inventory, launch owners, project workflow composition, catalogue grouping and shared mention
consumers. `git log --all --diff-filter=D` on the client-journey, placement-map, callable-apps, catalogWorkflows and
inventory names returned no matching deletions in this checkout. It is shallow, so this check does not establish
full-history absence; the earlier historical deletion references above are retained as reported.

**Current placement gaps:** subscription grouping still leaves specialized functions to reach from their real
project step; Evidence has files/Vault but not its planned device clinical-study door; Plan coverage outside US IND
and device packages needs extension; and market/role/record tailoring is not complete merely because product/pathway
work packages exist. These are completions of the named owners, not reasons for another catalogue or app shell.

## Corrections to the inventory

Each with its reason. Everything else follows the verified inventory.

1. **No retirements** (the founder's rule). The four retire-candidates get homes:
   `authoring-engine` folds into the editor (`document-authoring`); `intelligence-catalog` folds into Admin
   (`admin-console`), with the trust badge kept on every AnA result; `submission-twin` folds into Submission Center,
   each of its functions going to its own canonical home; `coverage` becomes a platform-operator tool beside Platform
   licensing (PLATFORM ONLY).
2. **`pyramid`**: project step Plan → fold into `project-home` (Plan). Plan exists (pass 3) and reads the IND pyramid
   through `ind-document-catalog`. The screen's remaining value (other filing types, critical path, progress) reaches
   Plan by extending its projection, not by a second screen with a type picker.
3. **`pdev`**: project step Plan → fold into `project-home` (Plan). Its own row assumed Plan was unbuilt; its four
   workstream rows, verified after Plan existed, say PDEV converges onto Plan's deliverables. One model of "what an
   IND needs" (zero duplication).
4. **Chains are flattened**, so each duplicate names its final canonical: `csr-author` → `document-authoring` (the
   inventory names `csr-workflow`, which itself folds into the editor); `nda-bla` → `submission-center` (via
   `nda-cockpit`); `pdev-cmc`, `pdev-nonclinical`, `pdev-clinical`, `pdev-regulatory` → `project-home` (via `pdev`).
5. **`change-assessment`**: document workspace → a feature inside Quality (section 5.3). Its trigger is the impact step
   of a change record in Quality (`quality/ChangeControl.tsx`); the documents it leads to are written in the editor.
6. Where the inventory says `ProjectPlan.tsx` or `PlanAssign.tsx` are uncommitted, they are committed (`c693a7260`).
   The side column beside every step (pass 4, `b648b01bf`) and Home's open items and setup checklist (pass 5,
   `f8e0d3210`) are committed too.
7. **Duplicates counted.** The brief counts 67 duplicates: the inventory's merge-into kind. This document folds 72:
   those 67, three of the four retire-candidates (correction 1; `coverage` is placed, not folded), and `pyramid` and
   `pdev` (corrections 2, 3). The brief's figure is corrected to 72 when it is next edited.
8. **"Hidden with its surface" is not true of every tool the AnA inventory lists as hidden.** A listed tool runs in
   production when any surface it serves is in `LAUNCH_SURFACE_IDS` (What already exists). Of the tools this document
   names, the ones that are hidden today are `trace_fact_to_source`, `start_deep_investigation` and
   `check_deep_investigation`, Submission Twin's five (`assemble_briefing_book`, `assess_claim_evidence_integrity`,
   `get_submission_readiness_twin`, `predict_change_impact`, `simulate_reviewer_challenges`), and agency meetings'
   `prepare_meeting_package` and `review_ha_interaction` with its three commitment tools. The rows below say so.
9. **Status.** Six rows the draft held LIVE NOW are not reachable in the home this document gives them:
   `device-diagnostics` and `device-clinical-studies` (home Evidence, door only on Plan), `device-cer`, `device-510k`
   and `device-pma` (home the document build, door only on Plan), and `protocol-dev` (home the protocol document,
   reached only from Author's button). Four are READY TO PLACE; `device-pma` and `device-diagnostics` show untrue states
   today and NEED WORK TO SHOW.

## 1. Site map

Every route is `/concept2cure/<surface-id>`; the id is the registry id (`shared/constants/ui-surface-registry.ts`).
Home is the bare base. The open project travels on every route as `?program=<uuid>`. The project home is a surface,
not a nested route: its six steps are states of one screen. Door labels below are today's; section 9 gives each its
job name.

```
/concept2cure                                    Home
├── /concept2cure/projects                       Projects (rail)
│   └── /concept2cure/project-home?program=…     A project (one surface; the step is in-page state)
│       ├── Plan      phase doors → /cmc (phase 3), /ind-checklist (phase 7), Submit step (phase 8);
│       │             non-IND, non-device filing → Author step ("Open Author");
│       │             device workstreams → /device-510k, /device-pma, /device-cer, /device-diagnostics,
│       │                     /device-clinical-studies, /device-engineering, /device-software, /device-postmarket,
│       │                     and the steps Evidence ("Open project evidence"), Author ("Open project documents")
│       │                     and Respond ("Open agency responses");
│       │             tasks → /tasks ("Open task board"; "Open My work")
│       ├── Evidence  doors → /vault ("Open in Vault"); the IND document library in Project files; the data room
│       ├── Author    doors → /document-authoring ("Open in Authoring"), /protocol-dev ("Protocols
│       │                     (organisation-wide)"), /cmc ("CMC / Module 3", US IND drug)
│       ├── Review    doors → /review ("Open the review board"), /tasks ("Open task board")
│       ├── Submit    Markets header → /dispatch-readiness ("Open readiness"), /ectd-compile ("Compile and
│       │                     download", the project's own application type), /ind-checklist ("IND forms", US IND),
│       │                     /submission-center ("Add a market", eCTD drug filings; "Open Submission Center");
│       │             each market row → /submission-center on that market ("Open")
│       └── Respond   doors → /communication-center, /submission-center (response sequence)
│       (beside every step: AnA's start box and the project's conversations → /conversation-thread)
├── /concept2cure/tasks                          Tasks (rail)
├── /concept2cure/communication-center           Communication (rail)
├── /concept2cure/vault                          Vault (rail)
├── Work areas
│   ├── /concept2cure/cmc                        CMC / Module 3
│   ├── /concept2cure/quality                    Quality
│   └── /concept2cure/insights                   Reporting & analytics
│       └── /concept2cure/compliance-reports     Audit and compliance reports (from the canvas)
├── /concept2cure/conversation-thread            The conversation (from Home, a project and Get help; not on the rail)
├── /concept2cure/document-authoring             The editor (opened on a document; never from the rail)
├── Top bar                                      breadcrumb; the open project's chip → /project-home (or /projects
│                                                when none is open), the way back from the editor; Your work
│                                                drawer; ⌘K
└── Account menu
    ├── Account                                  the person's own account panel
    ├── /concept2cure/admin-console              Admin (administrators)
    ├── /concept2cure/apps                       Plan & features (administrators); to read Subscription & features,
    │                                            addressed /concept2cure/features (section 12)
    ├── /concept2cure/master-licensing           Licensing (platform administrators); to read Platform licensing
    ├── /concept2cure/access-requests            Access requests (administrators)
    ├── /concept2cure/usage                      Usage & limits (every member)
    ├── /concept2cure/billing                    Billing (every member; invoices to be administrators only)
    ├── /concept2cure/licensing                  View all plans (every member); with usage, billing, access
    │                                            requests and features, to become Subscription & billing, with tabs
    ├── /concept2cure/onboarding                 Set up a workspace (first run)
    ├── /concept2cure/coverage                   Codebase coverage (every member today, and a lock); to move
    │                                            beside Platform licensing (slice 0)
    ├── /concept2cure/conversation-thread        Get help
    └── /concept2cure/audit-trail                Audit and integrity (no entry today; READY TO PLACE in Admin
                                                 and Quality)

When the founder admits them, under Work areas:
    /concept2cure/biostat-workbench              Biostatistics
    /concept2cure/rbm                            Risk-based monitoring
```

Every other surface id still resolves, from a bookmark or an old link, to its own screen or to `LaunchScopeGate`'s
plain lock panel. After slice 0, ⌘K no longer lists them (section 2). No door to one is added to a place, a step or
a document until its row in section 5 says LIVE NOW; the few a client reaches today with a defect (from Plan's device
workstreams, ⌘K or Plan & features) are named in slice 0. When a duplicate is folded, its id becomes an alias of its
canonical (section 12), so old links arrive where the job now lives.

## 2. Navigation model

**Primary: the rail.** Home, Projects, Tasks, Communication, Vault; then *Work areas*: CMC / Module 3, Quality,
Reporting & analytics (pass 1). Two more work areas join only by the founder's decision. No feature is ever a rail
entry. A rail entry never opens a lock: a self-serve organisation, created at the free tier, holds neither
Communication (a standard-tier module) nor CMC / Module 3 (no launch module), so both open a lock on its first day
today. Decision 1 (section 8) settles it before slice 0 closes: grant both at signup, or take a place the organisation
does not hold off its rail and name it in Subscription & features.

**Secondary: the project's steps.** Plan, Evidence, Author, Review, Submit, Respond, as a `nav` with
`aria-current="step"`. Each step's band says what to do now and offers the next step (pass 2). A project with no
documents opens on Plan; a step chosen by a person, AnA (`project-home.set-stage`) or a hand-off is never overridden
(pass 3). AnA's start box and the project's conversations sit beside every step (pass 4). The open step is kept with
the open project (slice 2), so a person who leaves a step through a door comes back to it.

**Tertiary: feature doors.** Inside a step, a door is one button named for the job ("Compose Module 3 in CMC /
Module 3"). The same job has one name wherever its door appears (section 9). A door is shown only when
`useSurfaceAvailable` admits the surface and the filing is served by it (the `isUsInd` and `cmcComposes` pattern).
Inside a document, the editor's side rail gains one tab, *For this document*, listing the document type's tools by
build phase (section 6). A door opens on the open project and, from the editor, on the open document. The way back is
the top bar's project chip (`ProjectChip`, `Shell.tsx:486-516`); today it opens the project on its default step (Plan
with no documents, Author otherwise), so a person who started a document from Plan comes back to Author. Slice 2 keeps
the step with the open project so the chip returns to it.

**What is not shown yet.** A placed feature that does not yet work on real data has no door. Its step, or its
document's tab, names it on the *Coming later* line, in words.

**Utility.** The account menu holds administration. The top bar's *Your work* drawer and Home's *Your open items*
answer "what needs me" from one source (`OpenWork.tsx`). AnA works inside the step or the document, never as
navigation. ⌘K is a way to reach what a person can already see, not a catalogue: after slice 0 it lists places, the
project's steps and the features already shown, each by its placed name (section 9); a folded id resolves to its
canonical; a feature not yet shown is not listed; with an empty query, "Jump to" lists the places. Today it lists
every registry surface, locked ones included, by their old names (What already exists).

**AnA's navigation.** `navigate_to` resolves through `DEEP_LINK_ALIASES`. An alias must not land on a lock:
`biopharma` resolves to `projects` (slice 0, done). `intelligence` and `safety` stay navigation targets. Under the
launch scope the server gives every registered surface outside the release a `launch-scope` lock
(`navigation-entitlements.ts`); the shell forwards those to AnA as locked screens (`V2App` `AnaLockPublisher`), so
`list_app_screens` leaves them out and `navigate_to` refuses them and AnA answers in the conversation instead. Removing
the two targets would also remove the three `intelligence.*` screen actions and the `pv` → `safety` feature alias,
which is a loss, not a fix. `navigationReachability.test.ts` now pins the rule that makes this hold: every target
opens in the release or resolves to a registered surface the launch scope can lock for AnA. The conversation's
reference chips no longer open a lock: "evidence" opens the Vault and "module" the project
(`conversationRefChipsNoLock.test.ts`); no production path sets a turn's chips today.

**Never in the navigation.** A catalogue of features for clients (⌘K included); a second door to the same job under
another name; a door to a screen that shows sample data; a door to a lock.

## 3. Content hierarchy

Order on each screen is top to bottom. "Live" means present after passes 1–5. "To add" names the row in section 5 that
brings it, with its status.

### Home

1. Greeting, one line.
2. **Set up your organisation**, for a new organisation's administrator until all three are done: *Record your company
   details*, *Invite your team* (each opening its tab in Admin), *Create your first project* (New project); a failed
   read says "Could not be checked". Live (pass 5).
3. **Your projects**: each opens the project through `openProjectHome`. With none: what a project is, its six steps,
   one way to start, and the first-run welcome's other ways beside it. Live.
4. **Your open items**: tasks assigned to you (deliverables assigned on Plan among them), approvals you sign, reviews.
   Live (pass 5). Today a task opens on Tasks (`tasks?taskId=…`), and approvals and reviews open the review board. To
   add (slice 5): a task assigned from a Plan deliverable opens the project's Plan on that deliverable, or the editor on
   its working copy once one exists; Quality's read-and-understood training and due periodic reviews (`quality`); an
   access request, for an administrator (`access-requests`). Later: a recorded guidance change that touches an open
   project's documents (`reg-change`, slice 28).
5. **Ask AnA**: the composer, run controls behind *AnA settings*. Live. To add: "Since you were last here"
   (`ana-command`, slice 29).
6. **Recent conversations**. Live.

### Project home

1. Header: *All projects*; the project's name in the serif `.pj-title`; the status line. Live. To add: the sequence in
   progress (brief: Modify); *Reports for this project*, opening Reporting & analytics scoped to the project
   (`insights`, wiring).
2. The step tracker (six steps), then the band: what to do now, and *Next: {step}*. Live.
3. The open step's body (below) in the main column; beside it, AnA's start box and the project's conversations, and on
   Author the readiness card, the skills AnA follows here, and the Memory and Instructions cards. Live (pass 4). The
   Memory and Instructions cards read nothing and always say "No … yet"; slice 0 makes them say they are not read on
   this page until a project-id read exists.
4. Each step's *Coming later* line: what this step will hold once it works, in words. Live on Submit and Respond,
   where both lines are out of date (section 4, flow J); slice 1 rewrites them and adds the line on Plan, Evidence,
   Author and Review, each naming only that step's rows in section 5 that are not yet shown.

### Plan: what this filing needs, who does it, by when

1. Band: "See every document this filing needs. Start each from its template, and assign it to a person with a due
   date." Next: Evidence. Live.
2. **What this filing needs.** A US IND: *What this IND needs*, with the target submission date beside it, then
   `IndFilingPlan`, eight phases headed "{n}. {phase name}" with "n documents · m started". Phase 1 reads "1. Program
   Planning", a catalogue name with "program" in it (slice 1 renames it). Each deliverable has "Create from template"
   (then "Open working copy"), "Open {title} · {status}" for each working document already matched to it, *Assign*,
   and "Work with AnA" ("Prepare with AnA" for a form or data file); its assignment reads "Assigned to Dana Ruiz, due
   Nov 13, 2026" (`PlanAssign.tsx:111-115`). Phase doors: *Compose Module 3 in CMC / Module 3* (phase 3, within the
   composition boundary), *Prepare Forms 1571, 1572 and 3674 in IND forms* (phase 7), *Place approved documents in the
   sequence on Submit* (phase 8). Live. A device or diagnostic filing: its workstreams (`ProjectMdxWorkflow`), each
   opening its feature or step, with *Assign* and "Prepare this work with AnA"; no target date is shown. Live. Any
   other filing: the target date and one sentence saying the list is available for US INDs and device filings in
   this release, with "Open Author". Live.
3. **Team**: responsibilities and sharing. Live.
4. **Tasks**: the project's tasks from every store, with "Open task board". Live.
5. **My work**: "Your work is not filtered to this project yet. My work lists it for every project", with "Open My
   work" (`ProjectPlan.tsx:59-77`). Live, and misnamed: slice 1 renames it, slice 5 filters it to the project.
6. To add, each with its row: on phase 1's "Regulatory pathway assessment" deliverable (task "Define product
   profile"), *Ask AnA which pathway and filing order fit* (`strategic-advisor`, `global-ri`, LIVE NOW as AnA; a named
   suggestion to add, slice 28), *See how products like this fared* (`precedent-intelligence`, slice 18), *Decide which
   agencies to file with, and in what order* (`filing-strategy`, slice 28); phase 2 *Request the Pre-IND meeting* and
   the briefing book (`agency-meetings` fold, slice 12); phase 4 *See the GLP studies and what Module 4 still needs in
   Nonclinical* (`nonclinical`, slice 9); phase 5 *See what each IB section still needs* on the IB deliverable
   (`investigator-brochure`, slice 7) and *Finalize protocol (5.3.5)* opening the protocol workspace (`protocol-dev`,
   convergence 5, slice 11); phase 6 *Check the summaries against each other* on the "Cross-consistency QC report"
   deliverable (`inconsistency`, slice 16); each deliverable's development activity and evidence (`pdev` fold, slice
   13); the plans of the IND amendment, annual report and safety supplement (`pyramid` fold, slice 13); for a device
   filing, a Pre-Sub destination (`device-presub`, slice 12) and the human-factors package opening its file
   (`human-factors`, slice 19).

### Evidence: the sources the documents are written from

1. Band. Next: Author. Live.
2. **Project files**: the project's Vault read, *Open in Vault*, the IND document library lane. Live.
3. **Data room**: every way a source enters the project; adopting a file from a conversation. Live.
4. To add: for a device project, the evidence work packages' doors (the same `ProjectMdxWorkflow` rows, filtered to
   evidence packages): `device-diagnostics`, `device-clinical-studies` (slice 6; reached today from Plan),
   `device-engineering`, `device-software`, `human-factors` (slice 19); for a study, *Open risk-based monitoring for
   this study* (`rbm`, when admitted, slice 25); the project's research runs (`deep-research`, slice 29); cited answers
   from the project's sources (`evidence-search`, slice 29). The hidden *Trace a claim to its source* button goes with
   the `source-tracer` fold (slice 17).

### Author: draft the filing's documents

1. Band. Next: Review. Live.
2. **Documents**: each opens in the editor by id; *Open in Authoring*; *Protocols (organisation-wide)* (stale:
   protocols are project-scoped since `20261014_protocol_program_scope.sql`; slice 0 renames it); *CMC / Module 3* for
   a US IND drug (slice 1 gives it Plan's name for the same job, *Compose Module 3 in CMC / Module 3*). Live.
3. **Module completion** (`ProjectDossier`), each module row opening its newest document. Live.
4. Records in this project; activity. Live.
5. Side column: readiness, the skills AnA follows here, Memory and Instructions (slice 0), AnA, conversations. Live.

### Review: review, approve and sign

1. Band. Next: Submit. Live.
2. **Reviews**: documents in this project sent for review, each opening its document; *Open the review board*. Live.
3. **Tasks and approvals** from the project's unified work view, with "Open task board". Live.
4. To add: *Check the project's documents against each other* (`inconsistency`, slice 16); *Citations to superseded
   sources* across the project's documents (`source-tracer` fold, slice 17).

### Submit: build, check and send each market's submission

1. Band. Next: Respond. Live.
2. **Markets.** The section header holds the actions (`ProjectMarkets.tsx:419-460`): *Open readiness*; *Compile and
   download* (an eCTD filing; it compiles the submission of the project's own application type, and another market's
   sequence is compiled from that sequence's Dispatch tab); *IND forms* (a US IND); *Add a market* (an eCTD drug
   filing; the project's lead or an organisation manager); *Open Submission Center*. Below it, one row per market with
   the server's verdict, what the platform can carry for that market, and its application number (a governed write,
   P-44); each row's one button is "Open", whose accessible name is "Open {market} in the Submission Center"
   (`:283`). For a device project a note says device filings use their own pathways and no eCTD market is added
   here. Live.
3. *Coming later*: today's line names registrations, market access and pharmacovigilance, the variation classifier,
   IND annual-report tracking, and regulatory intelligence, precedent and agency meetings
   (`project-home-data.tsx:324-329`). Slice 1 rewrites it to name only the Submit rows not yet shown, in plain words.
4. To add: every sequence of the project listed (brief: Modify); the readiness detail inline under each market row
   (`dispatch-readiness`, slice 15); what was sent and acknowledged on the Dispatch rows (`gateway-transmittals`, slice
   15); the market's registration number, status and renewal date (`registrations`, slice 22); the market's next
   sequence after approval (`lifecycle-mgmt`, slice 22).

### Respond: answer the agency

1. Band. Respond has no next step. Live.
2. **Add the agency's letter**. Live.
3. **The agency's open communications**: the project's inbox, each letter holding its questions and a Part 11 signed
   response to each; *Draft response with AnA*. Live.
4. **Start a response sequence** in Submission Center, its type set to response. Live.
5. *Coming later*: "Agency meetings and precedent responses." Live, and out of date: agency meetings fold into
   Communication and Plan (`agency-meetings`). Slice 1 rewrites it to name precedent responses and FDA's Pre-Sub
   feedback, the step's rows not yet shown.
6. To add: *Awaiting a response* filter (`haq-manager` fold, slice 12); for a device project, FDA's Pre-Sub feedback
   and its commitments (`device-presub`, slice 12); *Check the trial master file before an inspection* (`etmf`, slice
   24); commitments carried into Plan's deliverables (`pdev-fda-interactions` fold, slice 12); precedent responses
   (`precedent-intelligence`, slice 18).

### The document build (the editor)

1. Header: the document's title, its type (from its template, section 6), its lifecycle state.
2. Outline (section tree) and the section being written, with its template guidance.
3. The assembly build: the plan, completion gaps, *Draft empty eligible sections with AnA*.
4. Side rail, live: comments, history, sources, signatures, audit, exports, vault, tasks, access. To add: *For this
   document*, the type's tools by phase (sources, outline, draft, check, review, place in sequence), with its own
   *Coming later* line (slice 6); *Journey* beside history (`doc-journey` fold, slice 17).
5. *Send for review* (`SendForReviewDialog.tsx`); an approver applies the Approval e-signature to a frozen version; the
   approved copy is placed into a sequence in Submission Center.

## 4. User flows

Each flow says what happens today and marks what a slice adds.

**A. A new client's first project.** Home → *Set up your organisation*: *Record your company details*, *Invite your
team*, *Create your first project* → New project, filings built and validated here first → the project opens on
**Plan** → *What this IND needs*, by phase → *Create from template* on the Investigator's Brochure → *Open working
copy* → the editor opens the IB working copy → AnA drafts a section from the project's sources → back to the project
by the top bar's project chip, which today opens it on Author (the project now has a document). To add: *For this
document* shows the IB's tools at the sources phase (slices 6, 7); the chip returns to Plan, the step the person left
from (slice 2). On its first day a self-serve organisation sees Communication and CMC / Module 3 on its rail and both
are locked, until decision 1.

**B. Assign and receive work.** Plan → a deliverable → *Assign* → drawer: person, due date, note → one task in the
task store, scoped to the project, with source `filing_deliverable` → the row reads "Assigned to Dana Ruiz, due Nov
13, 2026" → Dana's Home lists it under *Your open items* → she opens it → Tasks, on that task (`tasks?taskId=…`).
From there she goes to the project's Plan herself, and starts the deliverable with *Create from template* if no one has.
To add (slice 5): the open item opens Plan on that deliverable, or the editor on its working copy once one exists.

**C. Build a document.** Editor → sources (sources rail, Vault, AnA) → outline (template, assembly plan) → draft (AnA or
by hand) → check (figure and claims checks, completion gaps, the type's checks) → *Send for review* → review → an
approver signs the frozen version → Submit places it into the sequence.

**D. Review and sign.** Home *Your open items* or the Review step → *Open the review board* → a document → comment,
approve, request changes with a reason, or decline → an approver applies the Approval e-signature in the authoring
workspace, against the frozen version (`Review.tsx:673,723`). Decisions recorded on the review board are not
electronic signatures.

**E. Submit a US IND.** Plan phase 7, or Submit's Markets header → IND forms (Plan's door reads *Prepare Forms 1571,
1572 and 3674 in IND forms*, Submit's reads *IND forms*; slice 1 gives both Plan's name) → 1571, 1572, 3674, cover
letter, Letter of Authorization → Submit → the US row's *Open* → Submission Center on that submission → place approved
documents → the Markets header's *Open readiness* (what blocks dispatch) → the header's *Compile and download* (the
project's own application type) → sign and dispatch → what was sent and acknowledged (to add on the Dispatch rows,
slice 15).

**F. The agency writes.** The project's **Respond** step, or Communication (to add: every project's letters, each
opening on its project's Respond) → *Draft response with AnA* per question → sign each response → *Start a response
sequence* → Submit.

**G. A device 510(k).** Plan → device workstreams → evidence packages open engineering, software and clinical
studies (human factors after slice 19) → *Open eSTAR assembly* (predicates, SE comparison, sections) → sections
written in the editor → Submit → the eSTAR export and its assembly verdict in Submission Center.

**H. The CMC lead's day.** Rail → CMC / Module 3 → registers (specifications, stability, batches, methods) → for a US
IND project, compose Module 3 → approve → place into the project's submission. The project's Plan does not show phase
3 started: its count matches editor documents by template or title (`IndDocumentLibrary.tsx:26-30`), and CMC's
composition is kept in `concept2cure_artifacts`, which the count does not read. To add (slice 4): the count reads the
composed Module 3.

**I. An administrator.** Account menu → *Admin* (members, roles, project access, API keys, settings) or
*Plan & features* (what the subscription includes; to add: each card names the step or document where the feature is
used, with no Open button). In Admin, "Grant access" (project access), "Edit scopes", "Change setting" and "Audit a
member" only send AnA a prompt that no tool or command can carry out; slice 0 takes them off, and the administration
session gives each a governed path. To add (slice 5): a member's access request arrives among the administrator's open
items.

**J. A feature that is placed but not yet shown.** A person on Submit reads today's *Coming later* line,
"Registrations, market access and pharmacovigilance; the variation classifier; IND annual-report tracking; regulatory
intelligence, precedent and agency meetings.", and finds no button. After slice 1 the line names only Submit's rows
not yet shown, in plain words (for example, "Registration numbers and renewal dates for each approved market; the
next sequence after approval"). Asking AnA in the side column answers what in-scope tools can answer today (for
example, how a post-approval change is classified, with the in-scope `classify_post_approval_change`). A bookmark to
the feature's own screen opens the plain lock panel, which says it is not in this release; after slice 0, ⌘K does not
list it.

## 5. Where every feature lives

All 139 ids, each exactly once. "The client sees" is the name in place: a verb phrase where it is a door. "In launch
scope" is whether the item's surface is in `LAUNCH_SURFACE_IDS`; where its AnA tools are in AnA's launch scope while the
surface is not, the row says so. "Slice n" is the slice of section 8 that does the work.

### 5.1 Places

| id | The client sees | Realness | In launch scope | Status | Where it is reached, and what is left or missing |
| --- | --- | --- | --- | --- | --- |
| `projects` | Projects (rail) | works | yes | LIVE NOW | Rail and Home's *Your projects* (pass 1). Left: be the one target of "Choose or create a project" (`OPEN_PROGRAM_SURFACE` in `programAction.ts:47` still names `mission-control`; slice 0); a sponsor filter for consultancies and a pathway filter for device clients (from the folds in section 5.8, slice 2). |
| `tasks` | Tasks (rail) | works | yes | LIVE NOW | Rail, Home's *Your open items*, Plan's task list (passes 1, 3, 5). Left: each work item labelled with its source (so `device-tasks` folds); a task assigned from a Plan deliverable opening Plan on it, or the editor on its working copy (nothing reads `filing_deliverable` today); Plan's "My work" section and "Open My work" renamed and filtered to the project; Quality's training and periodic reviews and an administrator's access requests among the open items (all slice 5); registry label "Tasks & collaboration" (slice 1). |
| `communication-center` | Communication (rail) | partial | yes | LIVE NOW | Rail (pass 1); its inbox is the Respond step's. Left: a self-serve organisation, created at the free tier, does not hold this standard-tier module and meets a lock on its rail entry on the first day (decision 1, before slice 0 closes); a cross-project letter list, each letter opening on its project's Respond step; meetings and commitments on one store, with a way to log one (from `agency-meetings`, slice 12); registry label "Communication Center" and stale registry text ("not a rail item") (slice 1). Its FDA loop tab already says the CRL countdown is not available. |
| `vault` | Vault (rail) | works | yes | LIVE NOW | Rail; Evidence's *Open in Vault*. Left: the project read includes AnA's drafts (`concept2cure_artifacts` rows outside CMC) with their signature state, so `artifacts-center` and `device-vault` fold (slice 4); *Place a legal hold* on a project or document (from `setup`); its eTMF button stays hidden until `etmf` is shown; registry label "Vault (DMS)" (slice 1). |
| `cmc` | CMC / Module 3 (work area) | works | yes | LIVE NOW | Rail (pass 1); Author's *CMC / Module 3* for a US IND drug (pass 2); Plan's *Compose Module 3 in CMC / Module 3* (pass 3). Left: its empty state's "Choose or create a project" opens `mission-control`, outside the release (slice 0); the launch catalog lists no CMC module (pricing is the founder's), so a free-tier organisation meets a lock on its rail entry (decision 1); Author's door renamed to Plan's name for the same job (slice 1); Plan's phase 3 count does not see a composed Module 3, which is kept in `concept2cure_artifacts` (slice 4). CMC adequacy, named by the founder for later, belongs here when it is defined (slice 31). |
| `quality` | Quality (work area) | works | yes | LIVE NOW | Rail. Left: an *Audit and integrity* entry (`audit-trail`, administration session); a link to compliance reports from the controlled-document register and periodic reviews; training and periodic reviews among Home's open items (slice 5); registry label "Quality & Assurance" (slice 1); stale "live ?? fixture" header comments in four files. |
| `insights` | Reporting & analytics (work area) | works | yes | LIVE NOW | Rail. Left: *Reports for this project* on the project header, opening the canvas scoped to the project (wiring); revoke and supersede a finalised report (from `report-governance`), device pathway counts and submission pace (from `device-analytics`) (slice 26); the portfolio roll-up is enterprise-gated. |
| `biostat-workbench` | Biostatistics (work area, when admitted) | partial | no | NEEDS WORK TO SHOW | Named by the founder for later (slice 30). Missing: recorded plans listed per organisation and study; plans and calculators bound to the project's study design (`cdisc_prm_studies` through biostat-bridge), not to an AnA thread; Biostatistics' study-design bridge and governed-document list absorbed; admission; then the rail's *Work areas*. Its engines (`compute_sample_size`, `assess_statistical_defensibility`, `forecast_enrollment`) already answer in AnA. |
| `rbm` | Risk-based monitoring (work area, when admitted) | partial | no | NEEDS WORK TO SHOW | Slice 25. Missing: a way to start RBM for a project's study, from Evidence; `program_id` linked to the project instead of labelled from the assessment title; the registry's `apiPrefixes` (`/api/mdx-rbm` and the write paths); `clinical-ops` folded in, after one study record is chosen; admission; then the rail's *Work areas*. |

### 5.2 The project and the conversation

| id | The client sees | Realness | In launch scope | Status | Where it is reached, and what is left or missing |
| --- | --- | --- | --- | --- | --- |
| `project-home` | A project, in six steps: Plan, Evidence, Author, Review, Submit, Respond | works | yes | LIVE NOW | From Projects, Home and the top bar's project chip (passes 2–4). Slice 0: Author's Memory and Instructions cards read nothing and always say "No project memory yet" and "No custom instructions yet" (`ProjectSide.tsx:24-42`); they say these are not read on this page until a project-id read exists (the `ProjectSkills` card beside them is unaffected). Left: the open step kept with the open project, so the chip and every door return to it, and folded aliases landing on the step where their job is (slice 2); a *Coming later* line on Plan, Evidence, Author and Review, and Submit's and Respond's lines rewritten to today's truth (slice 1); Plan's phase 1 name "Program Planning" (slice 1); the registry row's label "Project home", notes and `apiPrefixes` are stale (they omit `/api/c2c/projects`, its main read). |
| `conversation-thread` | Ask AnA; Recent conversations; Get help | works | yes | LIVE NOW | Home (pass 1), beside every project step (pass 4), the editor's *ask AnA to draft*, notifications, the account menu's *Get help*. Left: one composer instead of three (Home, project, thread); *What AnA remembers* (from `ana-memory`, slice 29). |

### 5.3 Features inside a place

| id | The client sees | Realness | In launch scope | Status | Where it is reached, and what is left or missing |
| --- | --- | --- | --- | --- | --- |
| `compliance-reports` | Run an audit or compliance report (inside Reporting & analytics) | works | yes | LIVE NOW | Reporting's canvas and the audit trail's toolbar. Left: a link from Quality's controlled-document register and periodic reviews; a cross-link with the audit trail's live chain check (their jobs differ: live status against a sealed period report). |
| `device-postmarket` | Run post-market surveillance and CAPA (inside Quality); per device, from Plan's workstream | partial | yes | NEEDS WORK TO SHOW | Reached today from a device project's Plan workstream *Open surveillance* (pass 3). Slice 0: its signals, PMS plan and CAPA board read across projects, the leak slice 0 also closes for `device-engineering`, so they are hidden until keyed; its documents panel is hard-coded to `EMPTY_DOCS` (`const documents = EMPTY_DOCS` in `PostmarketSurface.tsx`), so it says the project's post-market documents are not read here yet instead of showing none. Missing (slice 21): the documents panel reading `/api/post-market/programs/:id/documentation-status`, which exists; the existing `capa-mdr` write routes reached from the screen (AnA's `create_complaint`, `open_device_capa`, `triage_capa_mdr_queue` and `read_vigilance_timeline` already run in production, because the surface is in the launch catalog; the screen itself has no write); the FSN draft from `ivd-completeness`; then Quality's organisation-wide complaint, MDR-clock and CAPA queue. |
| `change-assessment` | Decide whether a device change needs a letter to file, a new 510(k) or a Notified Body notification (at the impact step of a change record in Quality) | fixture-or-demo | no | NEEDS WORK TO SHOW | Correction 5; slice 21. Missing: its table on the deploy applier (Rule 1: put it in the set, in `public` with `organization_id INTEGER NOT NULL`, before the final sweep pair); the engine called from the change record's impact step (`ChangeControl.tsx`, "Assess impact on product, process, validation and filings"); the result saved; a "new 510(k)" outcome starting a `US_510K_MOD` filing whose Plan lists what it needs; admission. Its AnA tools (`establish_governed_fact`, `list_governed_facts`, `preview_fact_impact`) are hidden with it. |

### 5.4 Project steps

#### Plan

When: the project is created, and whenever the team asks what the filing still needs. Already here (pass 3): the IND
deliverables with "Create from template", "Open {title} · {status}", *Assign* and "Work with AnA"; the phase doors to
CMC / Module 3, IND forms and Submit; device workstreams; team; tasks; "My work"; the target date (not for a device
filing).

| id | The client sees | Realness | In launch scope | Status | Trigger | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `device-presub` | Prepare a Pre-Sub for FDA, then log FDA's feedback | partial | yes | NEEDS WORK TO SHOW | Before a 510(k), De Novo or PMA is written; again when FDA's written feedback arrives | Reached today by ⌘K and Plan & features. Slice 0: the commitment and dossier-link buttons call a handler no caller passes (`PreSubManager.tsx:139,329`), so they do nothing; they are hidden until wired. "New Q-Sub" only sends AnA a prompt; AnA's `create_q_sub` runs in production (with `write_q_sub_section`, `update_q_sub_commitment_rolled_in` and the `q_sub.create` command, because the surface is in the launch catalog), so the button says it asks AnA. Missing (slice 12): its hook asks by project (the route already filters by program; the list today is not the project's); a Pre-Sub destination in the device workstreams (`WORK_DESTINATIONS`); a form over `q_sub.create`; FDA's feedback and commitments shown at Respond; one store for agency meetings (convergence 6). |
| `filing-strategy` | Decide which agencies to file with, and in what order | partial | no | NEEDS WORK TO SHOW | A project planned for more than one market, before a market is added on Submit (IND Plan phase 1) | Slice 28. Three client/server shape mismatches fixed (today it reports "No recorded divergences" when divergences exist) and the test that mocks the wrong shapes; four answers converged onto one Plan panel (this screen, Global RI's reliance recommender, Registrations' strategy tab, `crossJurisdictionalEngine`); the prediction-calibration tab moved to Reporting; admission. Meanwhile AnA answers in Plan's side column with the in-scope command `analyze_jurisdictions` and the in-scope tools `global_ri_strategy_brief` and `global_ri_reliance_pathways`. |
| `precedent-intelligence` | See how products like this fared with the agency | partial | no | NEEDS WORK TO SHOW | Choosing the pathway or predicate, and estimating CRL, RTF or AdComm risk before authoring (IND Plan phase 1); again when the agency writes (Respond) | Slice 18. Its objection store has no writer; one CRL source with `crl-library` (ADR 0013 names this engine, but only the evidence graph can hold letter text, so the authority is revisited); predicate search into `device-510k`'s predicate table; the claim check (`POST /check-claim`) into the check phase of the 510(k) SE section and the Clinical Overview; admission. Its commands (`check_claim`, `recommend_strategy`, `search_precedents`) are hidden with it. Meanwhile AnA's in-scope `lookup_regulatory_precedents` and `compare_submission_against_precedent`. |

#### Evidence

When: the sources a filing is written from come into the project. Already here: project files, the IND document
library lane, the data room.

| id | The client sees | Realness | In launch scope | Status | Trigger | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `device-diagnostics` | Record IVDR evidence: classification, analytical and clinical performance | partial | yes | NEEDS WORK TO SHOW | An IVD project's analytical-performance, clinical-performance and performance-evaluation work packages | Reached today from Plan's device workstreams (*Open IVDR evidence*, pass 3) and from ⌘K. Slice 0: with no project open it reads "Stage 4 of 7 — Notified body review" with three stages ticked (`IvdSurface.tsx:48,133-163`); it says no project is selected instead. Slice 6: the same door on Evidence and in the PER's *For this document*. Then: the readiness panel from `ivd-completeness` (slice 19). Its AnA tools (`classify_ivd_device`, `record_analytical_performance_study` and five more) already run in production. |
| `device-clinical-studies` | Record the clinical studies behind this filing | partial | yes | READY TO PLACE | A device project's clinical-evidence work package | Reached today from Plan's device workstreams (*Open clinical studies*, pass 3). Place (slice 6): the same door on Evidence and in the 510(k) and PMA documents' sources phase. Left: one study register per project (four stores hold studies today, convergence 13); its RBQM attention panel belongs to Risk-based monitoring. AnA's `create_clinical_study`, `log_study_ae`, `log_study_deviation` and `record_endpoint_result` already run in production. |
| `device-engineering` | Build the risk file and design-control trace: risk file, design-control trace, DHF, changes, nonconformances | partial | yes | NEEDS WORK TO SHOW | Design-controls, risk-management and manufacturing-transfer work packages | Reached today from Plan's workstream, but five panels read organisation-wide, so it shows other projects' records: four stores with no `program_id` (510(k) DHF sections, design controls, change requests, non-conformances) and the documents-in-flight panel, which reads `concept2cure_artifacts` by organisation although the table has `project_id`. Hide those panels until keyed (slice 0). Missing (slice 19): `program_id` on those stores (additive, `IF NOT EXISTS`) and the artifacts read filtered by its existing `project_id`; the editable risk and design-control registers folded in (`risk`, `design-controls`). |
| `device-software` | Check the software and cybersecurity documentation | partial | yes | NEEDS WORK TO SHOW | A device with software (SaMD, or a cyber device under FD&C 524B), when the software-cybersecurity package is assembled | Reached today from Plan's workstream; its empty state is a dead end. Slice 0: *Ask AnA to add a lifecycle item* in the empty state, because AnA's `create_software_lifecycle_item` already runs in production. Missing (slice 19): create and edit on the screen over the existing POST and PATCH routes. |
| `human-factors` | Build the usability engineering file | partial | yes | NEEDS WORK TO SHOW | The human-factors-usability work package, before summative testing | No door from a project: the package falls through to *Open project evidence*; reached by ⌘K and Plan & features. Slice 0: its read returns the organisation's first file (`files[0]`, `server/routes/human-factors.ts:92,457`), which may be another project's, so the file panels are hidden until keyed, with a line saying why. Missing (slice 19): a program id on `hf_engineering_files`; the package mapped to this surface in `WORK_DESTINATIONS`; *Start the usability file* over the existing POST. Meanwhile AnA's in-scope `design_human_factors_study`. |

#### Author

When: a document is opened, started or drafted. Already here: documents, the protocol workspace, CMC / Module 3,
module completion.

| id | The client sees | Realness | In launch scope | Status | Trigger | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `document-authoring` | Open in the editor; Create from template | works | yes | LIVE NOW | Whenever a person opens or creates a document to write, review or sign | Author's documents, Plan's *Create from template* and *Open {title} · {status}* (pass 3), AnA's canvas. Left: the *For this document* tab (section 6, slice 6); registry label "Document editor & authoring" and Author's "Open in Authoring" (slice 1). Any change keeps the AnA-draft → canvas → editor → vault gate (`docs/design/ANA_DOCUMENT_CANVAS.md`). |

#### Review

When: a draft has been sent for review. Already here: the project's reviews, the review board, tasks and approvals.

| id | The client sees | Realness | In launch scope | Status | Trigger | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `review` | Review documents on the review board | works | yes | LIVE NOW | A draft is sent for review and must be commented on, approved or sent back | Review step; Home's approvals and reviews. Left: a reviewer opened from a document sees its threads and verdict in the editor; *Awaiting my review* as a filter on Tasks (slice 5); the approval checkpoints of `orchestration` (fold, slice 15); registry label "Review & approval" (slice 1). |
| `inconsistency` | Check the project's documents against each other | partial | no | NEEDS WORK TO SHOW | Before documents go to review; when a governed value (dose, n, shelf life) changes; IND Plan phase 6 "Summaries cross-consistency QC" | Slice 16. Findings keyed by project (they are keyed by organisation today, so a second project's findings would mix in); attached to phase 6's existing "Cross-consistency QC report" deliverable, which has a template; change propagation needs `factId` (null today); `pdev-contradictions` and Submission Twin's narrative drift folded in; admission. Within one document the editor's figure-consistency check already runs, and AnA's in-scope `check_dossier_consistency` and `check_numerical_integrity` answer in the side column. |

#### Submit

When: approved documents go into a market's sequence. Already here: the Markets header's *Open readiness*, *Compile
and download*, *IND forms*, *Add a market* and *Open Submission Center*; each market row's verdict, application
number and *Open*.

| id | The client sees | Realness | In launch scope | Status | Trigger | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `submission-center` | Build this market's sequence in Submission Center | works | yes | LIVE NOW | The project's documents are approved and placed into a market's sequence | Each market row's *Open* ("Open {market} in the Submission Center"), the Markets header's *Open Submission Center* and *Add a market*, Respond's *Start a response sequence*; off the rail (pass 1). Left: every sequence listed on Submit; the device filing's row as the home of the package gate and milestone log (`device-submission` fold, slice 14); the row's door named for its job (slice 1). |
| `dispatch-readiness` | Check what stops this sequence being sent | works | yes | LIVE NOW | A compiled, validated sequence; "can we send it?" | *Open readiness* in the Markets header. Left: the gate detail inline under each market row (`MarketGateDetail`, `DispatchReadiness.tsx`); the one verdict for every readiness question (`orchestration`, `submission-twin`, `pdev-ind-assembly` folds) (slice 15); registry label "Dispatch readiness" and the door's name (slice 1). |
| `ectd-compile` | Compile and download | works | yes | LIVE NOW | The sequence's leaves are placed and approved | The Markets header (an eCTD filing; it compiles the project's own application type), each sequence's Dispatch tab (how another market's sequence is compiled), CMC's Build tab after the final-export gate. Left: the spec-version and code-list reference panel (`ectd-publishing` fold, slice 15). |
| `ind-checklist` | Prepare Forms 1571, 1572 and 3674 in IND forms | partial | yes | LIVE NOW | A US IND's Module 1 is the last piece before compile; later, each amendment or annual report | The Markets header's *IND forms* (pass 2), Plan's phase 7 (pass 3), a Submission Center sequence. Left: one name for the two doors to this job, and the registry label "IND lifecycle" (slice 1); count Vault-placed leaves; the cover letter, LOA, right of reference and briefing book downloads merged into the governed documents the IND catalogue already templates (phase 7 "Draft cover letter", phase 2 "Prepare briefing package"), not new documents (slices 12, 15); one IND-ready verdict (convergence 7, slice 15); the IND safety report card, withheld under P-32, shown with `pv-cockpit`'s clock (slice 10). |
| `gateway-transmittals` | See what was sent and whether the agency acknowledged it | partial | yes | NEEDS WORK TO SHOW | After transmit, while waiting for the gateway and agency acknowledgements | Slice 15. Reached from a notification or AnA, not from the project. Missing: status, ACK, AS2 receipt and technical rejection on the Dispatch tab's transmission rows (or each row linked with `stashNavParamsForTarget`); a technical rejection that works for sequence transmittals (today it only takes a sequence off a package's filed history); catalogue copy that still advertises a gateway roster and governed transmit. |
| `lifecycle-mgmt` | Start a supplement, variation or renewal as the market's next sequence | partial | no | NEEDS WORK TO SHOW | After approval, when a post-approval change, renewal or periodic report falls due | Slice 22. CMC changes converged on CMC / Module 3's `cmc_change_control` (two stores today); one renewal source with `registrations`; the false "governed submissions" banner removed; admission. Its AnA tools (`create_lifecycle_obligation`, `regulatory_deadline_radar`, `review_lifecycle_calendar`) are hidden with it. Meanwhile AnA's in-scope `classify_post_approval_change`, `classify_post_submission_change` and `plan_lifecycle_management`. |
| `registrations` | Record the market's registration number, status and renewal date | partial | no | NEEDS WORK TO SHOW | A market is approved | Slice 22. The application number already has a governed write on the market row (P-44). Missing: status and renewal date on the same row; the portfolio grid (product by country, renewals due) as a report in Reporting; renewals converged with `lifecycle-mgmt`; its strategy tab into `filing-strategy`; admission. |

#### Respond

When: the agency writes. Already here: add the letter, the project's inbox with signed per-question responses, draft
with AnA, start a response sequence.

| id | The client sees | Realness | In launch scope | Status | Trigger | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `etmf` | Check the trial master file before an inspection | partial | no | NEEDS WORK TO SHOW | An announced GCP or BIMO inspection of a trial in this application | Slice 24. One eTMF store (the screen writes `tmf_artifact_filings`; AnA and the Report-OS pack read `tmf_files`, whose migration no deploy applies); the trial taken from the project's studies; the existing `inspections` routes (no client caller) at the same moment; the essential documents behind CSR 16.1 offered at the CSR's sources phase; admission. |

### 5.5 Inside a document build

By document type, with the build phase: sources, outline, draft, check, review, place in sequence. A type with no item
whose primary home is there says which features serve it; section 6 lists every tool per type.

#### IND deliverables

No item has its primary home here. IND forms (`ind-checklist`) is a Submit feature reached from Plan's phase 7;
CMC / Module 3 composes phase 3; the editor's 200 IND templates serve the rest.

#### CSR

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `crl-library` | Check this section against FDA's past objections | check | partial | no | NEEDS WORK TO SHOW | Slice 18. A decision on its flag and a corpus load (the graph is the only CRL source that can hold letter text); one CRL source with `precedent-intelligence`; admission. Also serves the protocol, SAP, Clinical Overview (2.5), a briefing book and an agency response. AnA's in-scope `search_clinical_regulatory_evidence` reads the same graph. |

#### Protocol

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `protocol-dev` | Write the protocol in the protocol workspace: schedule of assessments, risks, budget, amendments, consent | draft | works | yes | READY TO PLACE | Reached today only from Author's "Protocols (organisation-wide)", a stale name (slice 0 renames it). Place (slice 6): the door in the protocol's and the ICF's *For this document*. Left: Plan's *Finalize protocol (5.3.5)* starts a second protocol document in the editor, so the two protocol paths converge (convergence 5, slice 11); registry label "Protocol development" (slice 1). Also serves ICFs and amendments. |
| `research-admin` | Check committee approvals, coverage analysis and the study team's training | check | partial | no | NEEDS WORK TO SHOW | Slice 24. Only the CITI matrix is wired. Missing: CITI status as a "trained, expiring" mark beside each person on Plan's team; the coverage analysis and committee requirements at the protocol's check; the cross-protocol overviews are already Reporting's "Research administration pack"; a founder decision on serving university research offices (about 60 of its 75 AnA tools serve them); admission. |

#### SAP

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `biostatistics` | Draft the statistics from the study design | draft | works | no (its AnA tools: yes) | NEEDS WORK TO SHOW | Slice 11. It writes into the SAP, protocol section 10 or CSR 9.7 being drafted (today `saveToAuthoring` creates a separate document); protocol-dev's *Open in Biostatistics* drafts in place instead of opening a lock; restoring the deleted in-workspace panel (`AnaBiostatsPanel.tsx`) is a reach. Its placement is nearly free: AnA's in-scope `generate_statistical_document` already drafts with the same engine. Also serves a DSMB charter and the sample-size rationale. |

#### ICF

No item has its primary home here: the protocol workspace (`protocol-dev`) holds the consent and IRB package.

#### Investigator's Brochure

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `investigator-brochure` | See what each IB section still needs | sources | partial | no | NEEDS WORK TO SHOW | Slice 7. Its readiness scoped to the project; its copy says "IB authoring" for a read-only readiness view; entry from Plan's IB deliverable (phase 5, m1.14.4.1) and the IB's *For this document*; admission. |

#### Module 2 summaries

No item has its primary home here. The nonclinical tools serve 2.4 and 2.6, the CRL check serves 2.5, CMC / Module 3
is the source of 2.3 (section 6).

#### Module 3

No item has its primary home here: CMC / Module 3 is a place (`cmc`), opened from Plan's phase 3, Author and the
Module 3 document's draft phase.

#### Module 4 and 2.6

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `nonclinical` | See the GLP studies, SEND conformance and what Module 4 and 2.6 still need | sources | partial | no | NEEDS WORK TO SHOW | Slice 9. The stale "sample" pill removed; its Module 4 rows repointed from `dossier` to the project; a Plan phase 4 door like CMC's; admission, with a boundary like CMC's (Module 4 has no work area or composition boundary). Its AnA tools (`create_nonclinical_study`, `load_nonclinical_program`, `review_send_readiness`) are hidden with it. |

#### Labeling, prescribing information, SmPC

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `labeling-pi` | Negotiate the label with the agency, then generate the SPL | review, place in sequence | partial | no | NEEDS WORK TO SHOW | Slice 22. The store is keyed by organisation (one USPI per organisation); it needs a product or project key, amended in the creating migration (Rule 1); the SmPC section-status write carried from `labeling-smpc`; admission with marketing applications, which are outside the composition boundary. Its negotiation moment is Respond, at end of review. |

#### Safety narratives, IND safety reports, DSUR, PBRER

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `pv-cockpit` | See this case's reporting clock and screen it for signals | sources | partial | no | NEEDS WORK TO SHOW | Slice 10. Case intake (recording an adverse event) has no screen and no tool, and every safety feature depends on it: a founder decision; two expedited-clock engines converged into one, shown on IND forms' safety-report card; AnA's navigation target stops promising line listings and E2B composition it does not have (`build_sae_line_listing` and `compose_e2b_icsr` are hidden with it); the route claims of `pharmacovigilance` moved here; admission (the IND sponsor's 21 CFR 312.32 part first). |
| `safety-narrative` | Draft this case's narrative | draft | fixture-or-demo | no (its AnA tool: yes) | NEEDS WORK TO SHOW | Slice 10. The composer is a client port in `fixtures/`: three generators converged on `server/services/ana/safety-narrative.ts` (AnA's in-scope `draft_safety_narrative`) and the port deleted; the deleted in-document affordance (`SafetyNarrativeAffordance.tsx`) reached; its routes, claimed by the out-of-scope `pharmacovigilance` row, refused in production until moved; admission. |

#### CER

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `device-cer` | Gather literature and vigilance, map the GSPRs, export the CER | sources, check, place in sequence | partial | yes | READY TO PLACE | Reached today from Plan's device workstream *Open clinical evaluation* (pass 3). Place (slice 6): the same door in the CER's and the GSPR checklist's *For this document*. Left: the Equivalence tab cannot record Article 61(5) equivalence; registry label "CER generator (EU MDR)" (slice 1). AnA's `assess_stored_cer`, `record_literature` and the `gspr.mapping.upsert` command already run in production. |

#### 510(k) and eSTAR

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `device-510k` | Choose predicates, build the SE comparison, assemble the eSTAR | sources, place in sequence | partial | yes | READY TO PLACE | Reached today from Plan's device workstream *Open pathway work* and *Open eSTAR assembly* (pass 3). Place (slice 6): the editor door in the 510(k) documents' *For this document*. Left: predicate search falls back to openFDA when the shadow service is down, and should say so where it does; registry label "510(k) workbench" (slice 1). Its AnA tools (`compose_510k_summary`, `generate_se_matrix`, `suggest_predicate_devices` and more) already run in production. |

#### PMA

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `device-pma` | See which PMA modules are written, then export the package | outline, place in sequence | partial | yes | NEEDS WORK TO SHOW | Reached today from Plan's device workstream (pass 3) and ⌘K. Slice 0: when no phase is active it still reads "Phase 1 of N" (`Math.max(activeIdx, 0)`, `PmaSurface.tsx:67,137`), and earlier phases are ticked complete from a derived stage (`:53-55`); it states only the recorded stage, and none when none is recorded. Then: trial metrics read `clinical_ops.studies`, empty for most organisations, so its empty state says no trial data is recorded; the editor door (slice 6); registry label "PMA submissions" (slice 1). |

#### Pre-Sub and briefing book

No item has its primary home here. The device Pre-Sub is a Plan feature (`device-presub`); the IND briefing book is
already an editor document from Plan's phase 2 ("Pre-IND briefing document" and "Meeting request package" have
templates), and IND forms' engine (`ind-checklist`) also assembles one as a download; agency meetings fold into
Communication (`agency-meetings`). Slice 12 merges the paths.

#### Agency response

No item has its primary home here. Each answer is held on its letter in Respond and signed there; AnA drafts it.

#### Orphan and pediatric designation requests

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `orphan` | Check eligibility and write the designation request | draft | fixture-or-demo | no (its AnA tools: yes) | NEEDS WORK TO SHOW | Slice 23. `US_ORPHAN` and `EU_ORPHAN` templates exist and the editor writes the request; the screen's register has no deployed store (a new table goes in `public` with `organization_id INTEGER NOT NULL`, before the final sweep pair, Rule 1); a granted designation recorded on the project; no filing type or template for a rare pediatric disease request; admission. Meanwhile AnA's in-scope `assess_orphan_designation` and `plan_rare_disease_program`. |
| `pediatric` | Work out PREA and PIP obligations; write the iPSP or PIP | outline | fixture-or-demo | no | NEEDS WORK TO SHOW | Slice 23. First, whatever is decided: on save the form claims an audit entry while nothing is saved (`BiopharmaSpecialty.tsx:270` against `:285-294`); it is outside the release, so no client reaches it today. Then: obligations as dated tasks through `lifecycle_obligations`; the `US_PSP` and `EU_PIP` templates in the editor; admission. |

#### Payer dossier

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `market-access` | Prepare the value dossier, coverage and coding case | draft | fixture-or-demo | no (its AnA tool: yes) | NEEDS WORK TO SHOW | Slice 23. No AMCP, HTA or coding-request template exists, so a payer dossier cannot be opened; adding one is new catalogue content (founder); the coding classifier and dossier-completeness engines need a caller; admission. Meanwhile AnA's in-scope `value_dossier_guidance` from a market's row. |

#### Device labeling and UDI

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `labeling` | Write the label and IFU: symbols, UDI placement, translations | draft, check | partial | yes | NEEDS WORK TO SHOW | The Labeling work package opens Author, not this screen; reached by ⌘K and Plan & features. Slice 0: it shows the organisation's first labeling document, not the project's (`Labeling.tsx:136-137`), so its record panels are hidden until the read takes the project, with a line saying why; "Warnings and precautions" is a permanent empty state over a read that does not exist, so it says it is not available yet. Missing (slice 20): the read scoped to the project; the existing `POST /labeling`, `POST /:id/symbols` and `GET /:id/coverage` wired; the package pointed here; a label or IFU template id so the document's type is known (section 6). AnA's `create_labeling_document`, `add_labeling_symbol` and `add_labeling_translation` already run in production. |
| `device-udi` | Check each label's UDI against the device's UDI record | check | partial | yes | NEEDS WORK TO SHOW | Slice 20. Missing: the registration-udi package pointed here; `program_id` passed to `useUdi`; `onOpenEditor` passed so a row opens its label; reads the label store `labeling` edits. AnA's in-scope `validate_udi` meanwhile, and `create_udi_record` already runs in production. |

#### Every governed document

| id | The client sees | Phase | Realness | In launch scope | Status | What is left or missing |
| --- | --- | --- | --- | --- | --- | --- |
| `decision-lineage` | See the decision trail behind this version | review | partial | no | NEEDS WORK TO SHOW | Slice 17. Neither of its two lineage models reads the launch editor's approvals and signatures; one model chosen over them before it sits beside `RecordHistory`; the organisation-wide chain check goes to the audit trail; admission. |

### 5.6 AnA does it

An AnA action has no screen. AnA runs it beside the step or the document, on the project's facts, with deterministic
engines; AnA narrates and never supplies the figure (Rule 2). Its status follows the AnA rule in the status vocabulary.

| id | The client sees | Realness | In launch scope | Status | Where, and what is left or missing |
| --- | --- | --- | --- | --- | --- |
| `global-ri` | Ask which pathway, fees, timelines and regional requirements apply | partial | no (its AnA tools: yes) | LIVE NOW | Beside every step (pass 4), through AnA's 26 in-scope `global_ri_*` tools, which AnA's skills already call. Left: a named suggestion at Plan phase 1 and when a market is added on Submit (slice 28); its market data (MHRA, TGA, Health Canada, Swissmedic) extending the region profiles (`maa-cockpit` fold, slice 22); the browser screen's API stays refused in production. |
| `strategic-advisor` | Ask AnA for a pathway, expedited-program and filing-order recommendation | no-surface | no (its AnA tools: yes) | LIVE NOW | Beside Plan (pass 4), through the in-scope tools `global_ri_strategy_brief` and `global_ri_reliance_pathways`, the six deterministic tools in `server/services/ana/regulatoryStrategyTools.ts` (`assess_expedited_program`, `plan_fda_meeting`, `assess_orphan_designation`, `select_505_pathway`, `assess_rolling_submission`, `compare_global_pathways`), and the in-scope command `analyze_jurisdictions`. Left: a named suggestion on phase 1's "Regulatory pathway assessment" deliverable (task "Define product profile") (slice 28); recording the chosen pathway and designations on the project, which has no write path today (slice 28). |
| `evidence-search` | Ask what our sources say, with the passages cited | works | no | NEEDS WORK TO SHOW | Evidence step; a document's sources phase. Slice 0: the conversation's "evidence" chips, which open this locked screen today, are retargeted. Missing (slice 29): its provenance-logged cited answer offered by AnA scoped to the open project, or converged onto the Vault search AnA already uses; admission. |
| `deep-research` | Research a question in the literature and registries | partial | no | NEEDS WORK TO SHOW | Evidence step; a document's sources phase. Slice 29. Missing: two engines converged (`/api/deep-research` jobs and AnA's `start_deep_investigation` and `check_deep_investigation`, hidden with this surface); `projectId` passed; the project's runs listed on Evidence; the synthesis filed to Vault; connector credentials in Admin's settings; admission. AnA's in-scope `search_literature` meanwhile. |
| `reg-change` | Flag guidance that changed since this document was drafted | fixture-or-demo | no (its AnA tool: yes) | NEEDS WORK TO SHOW | A document drafted earlier is reopened. Slice 28. Missing: a caller of the in-scope `guidance_change_radar` from the editor's check phase; a notice among Home's open items when a recorded change touches an open project's documents; the gap analysis or update as a task. Its demo worklist is on the founder's list (section 5.9). |
| `ana-command` | What changed since I was last here, and what to do next | partial | no | NEEDS WORK TO SHOW | Home and the project. Slice 29. Missing: AnA tool definitions over the existing `/orchestration` routes (none exists); its role lens for filtering recommendations; its portfolio ranking is Reporting's; its "recorded to the audit trail" copy not shown until the audit rows are verified; admission. Its pre-submission go/no-go is on the founder's list (section 5.9). |

### 5.7 Administrators

| id | The client sees | Realness | In launch scope | Status | Where, and what is left or missing |
| --- | --- | --- | --- | --- | --- |
| `apps` | Subscription & features (account menu, administrators; today "Plan & features") | works | yes | LIVE NOW | Pass 1. Slice 0: a card for a feature that is not shown loses its Open button (only device features suppress it today). Left: each card names the step or document where the feature is used; the label renamed and the address shown as `/concept2cure/features` (slice 1, section 12); "Workflows" wording in its loading, error and empty states and in Setup's module panel (slice 1); a tab of Subscription & billing (administration session). |
| `licensing` | Compare subscriptions (today "View all plans") | works | yes | LIVE NOW | Account menu; lock panels. Left: it becomes Subscription & billing (subscription, usage, invoices, features, requests as tabs); checkout, DTC checkout and the billing portal accept any member while the lock panel says buying is not theirs to do (a server role gate); one pricing source (`server/services/billing.ts`) for both client copies (administration session); registry label "Plans & licensing" (slice 1). |
| `usage` | Usage & limits | works | yes | LIVE NOW | Account menu, every member. Left: a tab of Subscription & billing; the rate card reads `GET /api/billing/rate-limits`; AnA says inline when a member nears a cap (administration session). |
| `access-requests` | Access requests | works | yes | LIVE NOW | Account menu, administrators. Left: each request among the administrator's open items (no notification exists, so a request can sit unseen; slice 5); a tab of Subscription & billing. |
| `admin-console` | Admin | partial | yes | LIVE NOW | Account menu. Slice 0: "Grant access" (project access), "Edit scopes", "Change setting" (session timeout included) and "Audit a member" (`AdminAccess.tsx:406,524,545,690`) only send AnA a prompt that no tool or command can carry out; they are taken off, and the page header's "Every action below emits a 21 CFR Part 11 audit entry" is said only of actions that do. Left (administration session): a governed path for each of the four (settings through Setup's writers, `setup` fold; a member's actions through the audit trail; project-access grants and role scopes through a governed write, which does not exist); its Settings tab mounts Setup's governed writers; an AnA tools list beside AnA skills (`intelligence-catalog` fold); its audit band links to the audit trail; the unrouted `AdminConsole` export deleted after re-homing the validation kit card and the audit link; registry label "Admin console" (slice 1). |
| `audit-trail` | Audit and integrity | works | yes | READY TO PLACE | Only ⌘K or a deep link reaches it. Place (administration session): an entry in Admin and in Quality; the Part 11 console's chain verdict as a second banner line (`part11-console` fold); registry label "Audit trail" (slice 1). Each record's own history already shows in place (`RecordHistory`). |
| `onboarding` | Set up a workspace (first run) | works | yes | LIVE NOW | Home's first-run welcome and the account menu. Home's setup checklist (pass 5) covers the same first steps through Admin's tabs and New project. Left: the account-menu entry limited to administrators or removed after first run; pricing read from the server; *Fill from a document* as its first step (`onboarding-ingest` fold) (administration session). |
| `master-licensing` | Platform licensing (platform administrators) | works | yes | LIVE NOW | Account menu for platform administrators. Left: the menu's "Licensing" and the registry's "Master licensing" both read "Platform licensing" (slice 1). |
| `identity-console` | Single sign-on and provisioning | partial | yes | NEEDS WORK TO SHOW | From Setup and the onboarding security step. Missing: a founder decision on whether a client's own administrator operates SSO and SCIM (administration session). If yes, its writes join Admin's read-only "SSO + provisioning" tab; if not, it stays a platform tool beside Platform licensing and is not sold as a card. |
| `coverage` | Codebase coverage (platform administrators only) | partial | no | PLATFORM ONLY | Correction 1. Today every member's account menu offers it and it opens a lock. Slice 0: the entry moves behind platform administration beside Platform licensing. Left: its readiness column derived from code or labelled "declared"; the surface count corrected (121). Never shown to a client. |

### 5.8 Fold into

Each duplicate goes into one canonical item; the client sees only the canonical. "Functions, and where each goes" lists
every function the inventory and its second reader found in code. The function-by-function audit
(`FUNCTION_PARITY.md`, this folder, when filed) confirms each against the canonical before the fold, and any function
it finds that is not listed here is added to the row. Its input, `parity-batches.json`, still groups by the
pre-correction canonicals: `csr-author` under `csr-workflow`, `nda-bla` under `nda-cockpit`, the four `pdev-*` under
`pdev`, and four "(retire)" groups; it has no group for `pyramid`, nor for `pdev` into `project-home`. It is re-batched
against the canonicals of this section before the audit runs: the flattened chains (correction 4), `authoring-engine`
under `document-authoring`, `intelligence-catalog` under `admin-console`, `submission-twin` under `submission-center`
(each of its functions checked against its own home), `pyramid` and `pdev` under `project-home`, and `coverage` out
of the audit (it is placed, not folded). Catalogue rows are deprecated, never deleted (`organization_modules`
cascades); the id becomes an alias of its canonical (section 12). A store a fold retires is removed by amending the
migration that creates it, with a dated note, never by an appended DROP (Rule 1).

Carry-over:

- **Carried (unverified)**: the second reader found every function already in the canonical. The parity audit has not
  confirmed it, so the row is unproven until `FUNCTION_PARITY.md` confirms it.
- **To carry**: the named functions move first. A parenthesis names the only thing left to carry ("key", "label").
- **To carry, admission**: the named functions move first, and the carried functions need the founder's admission
  before a client sees them, because they are outside the launch catalog, whether or not their canonical is in the
  release.

No shell is removed and no catalogue row deprecated, whatever its carry-over, until `FUNCTION_PARITY.md` confirms its
row. A function not carried as it is goes on the founder's list (section 5.9).

#### Into Projects

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mission-control` | Projects | partial | no | `projects` | Portfolio list → Projects. Create a project → Projects' New project, on the canonical store (it would create one in a second store). "Choose or create a project" target → `OPEN_PROGRAM_SURFACE` = `projects` (slice 0). Readiness and blockers per project → the project's readiness card and the dispatch verdict; its nine-dimension readiness engine may later score the project if it reads `regulatory_programs`. | FOLD IN | To carry |
| `device-workstream` | Projects, filtered by pathway | works | yes | `projects` | Device portfolio list → Projects. Pathway filter (510(k), PMA, CER) → a filter on Projects for device clients (Projects already has workstream tabs and device-family mapping). Portfolio health strip → a summary on Projects, unrecorded readiness reading "Not recorded", not 0%. The `mdx` alias now reaches `projects` with its MDX filter (A2.8); the separate device-workstream target remains until A2.10 parity. Its commands `evidence_sufficiency.assess` and `reviewer_simulation.run`, which run in production, keep their claim on the device project. | FOLD IN | To carry |
| `cro-portfolio` | Projects, grouped by sponsor | partial | no | `projects` | Every sponsor served, with contract and SOW status → a sponsor filter on Projects (needs a sponsor key on projects and on `/api/c2c/projects`; today the sponsor name is the organisation's). Studies and submissions per sponsor → the filtered project list. Onboarding a sponsor (client workspace, SOW, contract dates) → Admin. | FOLD IN | To carry |
| `filings-catalog` | New project's filing picker | partial | no | `projects` | Browse every filing type → `RegistryPicker` (has it, with search). What a filing is and how it is built → the picker's "how you'll build it" copy. Ask AnA when a filing is required, what it contains, what evidence it needs → the picker's prompt. Its lifecycle loop → the picker. Start → the wizard creates the project (this screen's Start opened a blank editor). | FOLD IN | To carry |

#### Into the project (Plan, Author, Respond)

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `program-journey` | A project's six steps | fixture-or-demo | no | `project-home` | Stage map from candidate to lifecycle → the six steps. What each stage needs → each step's "what to do now" and Plan's deliverables. Its stage-to-feature map → this document's placements. Stage 9's post-approval list → Submit's rows and *Coming later* line. AnA's `biopharma` alias → `projects` (slice 0). | FOLD IN | Carried (unverified), except the alias |
| `dossier` | Module completion on Author | partial | no | `project-home` | CTD section status (ready, in review, draft) → `ProjectDossier` (`ModuleCompletion`, readiness card). Its out-of-scope callers (Nonclinical's Module 4 rows, the NDA cockpit, Agency meetings) → repointed to the project. | FOLD IN | Carried (unverified); callers to repoint |
| `dossier-map` | Module completion on Author | partial | no | `project-home` | Module grid M1–M5 → `ModuleCompletion`; anything the grid shows that `ModuleCompletion` lacks moves into `ProjectDossier.tsx` first; then `/api/dossier-map`, the screen and the row go together, and `Dossier.tsx`'s link points at Author. | FOLD IN | To carry |
| `haq-manager` | *Awaiting a response* on Respond | works | no | `project-home` | Letters still needing an answer → Respond's inbox (has). A response per question, Part 11 signed → `AgencyResponses` (has). The `responseRequired` filter → added to Respond's inbox. The stale P-32 note in `launch-scope.ts` corrected. The alias lands on the open project's Respond step, or on Projects when no project is open (section 12). | FOLD IN | To carry (one filter) |
| `client-portal` | A shared project, read-only, for a sponsor's own users | partial | no | `project-home` | See the projects a partner runs → a role-scoped, read-only Projects and project for external users. Documents shared with them → a share-to-client action at Review (none exists). Recent updates → the project's activity. Post-login redirect for client users → a screen they can open (slice 0; today a lock). External users at all: a founder access decision. | FOLD IN | To carry, admission |
| `pyramid` | Plan: what this filing needs | partial | no | `project-home` | Correction 2. Every phase and task by filing type → Plan (the IND through `ind-document-catalog`; the IND amendment, annual report and safety supplement next; NDA, BLA, MAA and J-NDA with marketing applications; 510(k), De Novo and PMA are served by the device workstreams). Who does each → Assign (has). Critical path and progress (`PyramidAnalytics`) → Plan's per-phase counts from `unified_tasks` assignments, per project. Its per-organisation progress (`pyramid_task_progress`, one row set per organisation and filing type) is on the founder's list (section 5.9); retiring the table amends its creating migration (Rule 1). AnA's `pyramid.*` actions → `project-home.set-stage` plan. AnA's `plan_submission`, which asks a model for a module map and timeline (a Rule 2 defect), reads the pyramid engine instead. | FOLD IN | To carry |
| `pdev` | Plan: development activities on each deliverable | partial | no | `project-home` | Correction 3. Activity state, owner, dependencies and the blocks-IND flag → Plan's deliverables (state as task state, owner as Assign). Evidence attached and confirmed under Part 11 → the deliverable's evidence from Vault. Each activity's AI draft → AnA drafting in the editor (documents, not `pdev_ai_drafted_document` artifacts). IND readiness → the one dispatch verdict. Contradictions → `inconsistency`. FDA stream → Communication and Respond. Workflow kickoff and decisions (`pdev.workflow.*`) → engine runs AnA starts. Bound to the open project (no `indPrograms[0]` fallback). | FOLD IN | To carry, admission |
| `pdev-cmc` | Plan, phase 3 (Module 3) | fixture-or-demo | no | `project-home` | Correction 4. CMC activity state, owner, evidence and what each must produce for Module 3 → phase 3 deliverables and CMC / Module 3's registers; each activity's document (for example 3.2.S.4) opens in the editor or CMC composition. `program_type` matched case-insensitively first. Distinct from `cmc`, which composes. | FOLD IN | To carry, admission |
| `pdev-nonclinical` | Plan, phases 1 and 4 (nonclinical) | fixture-or-demo | no | `project-home` | Correction 4. DRF, GLP toxicology, PK/PD, species justification, safety margins, study reports and dose rationale → phase 1 "Assess nonclinical gaps" and phase 4 deliverables; attaching a GLP report from Vault moves the matching deliverable; the study register stays Nonclinical's. | FOLD IN | To carry, admission |
| `pdev-clinical` | Plan, phase 5 (clinical) | fixture-or-demo | no | `project-home` | Correction 4. Clinical development plan, synopsis and full protocol, endpoint rationale, statistical assumptions, IB, safety monitoring → phase 5 deliverables (protocol outline, design and estimands, endpoints, eligibility, safety monitoring plan, IB, *Finalize protocol*); the full protocol opens the canonical protocol. Site access and trial start-up have no IND deliverable and carry as project tasks. | FOLD IN | To carry, admission |
| `pdev-regulatory` | Plan, phases 1, 2 and 7 (regulatory) | fixture-or-demo | no | `project-home` | Correction 4. Strategy memo → phase 1 "Draft IND strategy". INTERACT and Pre-IND requests and briefing books → phase 2, the meeting request in Communication and the briefing book as an editor document. FDA questions, minutes and the feedback tracker → Communication and Respond. IND checklist, module map, cover letter, Modules 1–5 → mirror IND forms and Plan's phases, not ticked by hand. Clearance → IND forms' 30-day clock. | FOLD IN | To carry, admission |

#### Into the editor (`document-authoring`)

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `batch-draft` | *Draft empty eligible sections with AnA*; AnA's batch drafting in the conversation | partial | no | `document-authoring` | Draft several sections at once in a document → `AuthoringAssemblyBuild`'s *Draft empty eligible sections with AnA*, sequential, on a document started from a template (the editor needs one). Draft several sections at once without a chosen template, in parallel → only AnA's in-scope `batch_draft_sections`, in the conversation; the editor does not carry it. Accept the good ones → each reviewed before it is accepted in the editor. The coauthor accept path is removed in the same change; two tests pin the screen. | FOLD IN | Carried (unverified) |
| `csr-workflow` | The CSR's ICH E3 map and its checks, in the editor | partial | no | `document-authoring` | Which E3 sections are drafted → the editor's E3 template tree (has). "Required and still empty" → a blocker at the CSR's check phase, from `ICH_E3_STRUCTURE` through `m5-clinical-qc` (today a stateless POST). Bring drafted sections into the editor → the editor itself. CRL findings per E3 section → `crl-library` at check. | FOLD IN | To carry |
| `csr-author` | The CSR in the editor | no-surface | no | `document-authoring` | Correction 4. Its AnA prompt key → the launch id (convergence 2). Structuring against E3 and checking tables against the TLFs → as `csr-workflow`. | FOLD IN | To carry (key) |
| `doc-journey` | *Journey* beside history in the editor | partial | no | `document-authoring` | One document's path from first draft through review, approval and freeze → its assembler, taking a document id instead of the organisation's latest, rendered in the editor's rail; its `42P01`-to-empty fallback fixed on the way. | FOLD IN | To carry |
| `ectd-coauthor` | The editor; module placement in Submission Center | partial | no | `document-authoring` | Write a section in its eCTD module → the editor with its IND section templates. Check against ICH M4 structure → Submission Center's Validation. Module placement → Submission Center's Builder. `coauthor_documents` content migrated into the canonical store before the row is deprecated. | FOLD IN | To carry |
| `source-tracer` | Citations in the editor's sources rail; *Citations to superseded sources* on Review | works | no | `document-authoring` | Each claim traced to its cited source → the editor's sources rail (has). Whether the source has been replaced since → the same rail's standing (has). The cross-document list → the Review step. AnA → the in-scope `trace_provenance`; `trace_fact_to_source`, hidden with this surface, moves its claim to the editor. Evidence's hidden *Trace a claim to its source* button goes in the same change. | FOLD IN | To carry |
| `doc-canvas` | The editor; AnA's canvas | no-surface | no | `document-authoring` | Write from a template with collaborators, versions and e-signature → the editor (has). Its AnA prompt keys (organisations holding only launch modules lose the editor prompt today) → launch ids (convergence 2). | FOLD IN | To carry (keys) |
| `regulatory-workspace` | The editor's outline | fixture-or-demo | no | `document-authoring` | CTD section tree with status, dependencies and comment counts → the editor's outline, read from `/api/authoring/docs/:id/sections` (not `project_sections`, filled only by the demo seed). Related intelligence beside a section → `TemplateGuidance` and *For this document*. | FOLD IN | To carry |
| `authoring-engine` | One line in the template picker: what AnA drafts for this document, and the checks it runs | fixture-or-demo | no | `document-authoring` | Correction 1. What AnA can draft per document type → one line of help per template in `AuthoringTemplatePicker`. Which checks run before a draft is promoted → the check phase lists the checks the editor runs (figure consistency, claims, completion gaps). Its Templates tab (a count) → the template picker. Its Automations tab names checks no code runs ("Tabular summary sync", "Cross-reference integrity") → the founder's list (section 5.9). The removal commit names `AuthoringTemplatePicker.tsx`. | FOLD IN | To carry (help line) |

#### Into Vault

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `artifacts-center` | Vault, *Drafted by AnA* | works | yes | `vault` | Find any document AnA drafted, in any project → the Vault's project read including `concept2cure_artifacts` rows outside CMC (`server/routes/c2c/project-vault.ts`, a server change). Whether the current version is signed → signature state as a Vault filter. Download; open in the editor → the Vault's own actions. The Live Drive hand-off after AnA saves a draft (`V2App.tsx:686`) → retargeted in the same change. The draft's trail → the document's history. | FOLD IN | To carry |
| `device-vault` | Vault | works | yes | `vault` | Every document of a device project, with versions, audit trail and upload → Vault (`VaultVersions`, `RecordHistory`, upload); authored drafts by the same read as `artifacts-center`. Now (slice 0): the unbacked "SHA-256 chained / 7-year retention" subtitle comes off, and so does the *Export manifest* button, which only sends AnA a prompt no tool carries out; a project's export manifest is on the founder's list (section 5.9). | FOLD IN | To carry |

#### Into Tasks

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `device-tasks` | Tasks, with each item's source | partial | yes | `tasks` | Device submission work items across projects → Tasks, which reads the same store. What blocks a filing → Tasks' blocked items. Its four KPI cards and "not on this board" count (`/api/submission-ops/unified-work`) → checked against Tasks and added if missing. Each item's source → labelled on Tasks. The removal names `TaskBoard.tsx`. | FOLD IN | To carry |
| `team-workspace` | Tasks, Review, the editor's comments | no-surface | no | `tasks` | Assign tasks → Plan's Assign and Tasks. Reviews and approvals → Review. Co-edit and comment → the editor. | FOLD IN | Carried (unverified) |

#### Into Communication

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `agency-meetings` | Communication's Meetings; *Request the Pre-IND meeting* from Plan phase 2 | partial | no | `communication-center` | Request a meeting (Pre-IND, Type A–D, EOP2, pre-NDA/BLA, Q-Sub, Scientific Advice) → Communication's create path over `ha_interactions` (the store decision; widening its CHECKs for Q-Sub and notified bodies is conditional on `pg_get_constraintdef`, Rule 1), with a door from Plan phase 2. Briefing book and questions → the IND catalogue's existing "Pre-IND briefing document" (phase 2, task "Prepare briefing package", already templated, so Plan already creates it as an editor document), filled by `assembleBriefingBook` (IND forms' engine): one document from three paths (Plan's template copy, IND forms' download, PDEV's draft). Its PDF → IND forms' briefing-book PDF (the same route). Minutes and commitments → Communication's meetings and commitments, and Respond. AnA's `prepare_meeting_package`, `review_ha_interaction` and the three commitment tools, hidden with this surface today → Communication's claim (Communication is in the launch catalog, so they then run). | FOLD IN | To carry |
| `pdev-fda-interactions` | Communication and Respond | fixture-or-demo | no | `communication-center` | One FDA timeline per IND → Communication, per project. Apply FDA commitments to the IND plan → an AnA action at Respond running the deterministic rollup over Communication's commitments and writing to Plan's deliverables (`pdev.fda_feedback.*`). Its `q_sub` and `fda_communications` reads → the founder's list (section 5.9): both stores retire into `ha_interactions` under convergence 6. AnA's `pdev.fda_feedback.*` and `pdev.program.fda_interactions` commands already run in production, because they also serve `device-presub`. | FOLD IN | To carry |

#### Into Submission Center, readiness and compile

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shadow-review` | The sequence's Shadow review tab | partial | no | `submission-center` | Simulated reviewer's refuse-to-file and complete-response risks per sequence → the per-sequence tab, which runs under `/api/submissions` (has). Its criticals → named blockers in readiness. Only what the professional-tier row sells changes. | FOLD IN | Carried (unverified) |
| `device-submission` | Submission Center, the device filing's row | partial | yes | `submission-center` | Device packages across projects → Submission Center's portfolio (eSTAR tracker). Transmit gate → the eSTAR assembly verdict on the row. Milestone log → the row's history. New package (including a notified-body package) → a new sequence in Submission Center; whether it prepares a notified-body package is confirmed in the parity audit. Now: the invented "NB · TÜV" and "FDA · ESG" target labels come off (slice 0). | FOLD IN | To carry |
| `device-validation` | Readiness for the device filing | partial | yes | `submission-center` | Every open blocker stopping a device filing → the eSTAR filing-readiness panel and the `/api/510k/estar/assemble` verdict on the row (has). The cross-project blockers view → a Reporting report over the canonical verdicts, not `c2c_blockers`, which has one live writer: correspondence intake (`POST /api/regulatory-correspondence/correspondence/intake` → `computeCorrespondenceIssueImpact`, `operating-layer.ts`) opens a blocker for an issue flagged as blocking, and only when the project has an open submission package; `runAutomationSweep` is reached only through `POST /api/submission-ops/automation/run`, which has no client caller. Its catalogue claim "the only blockers view" is corrected. Now (slice 0): its header claims eSTAR required-field rules across "every program" while the page reads none (`Workbench.tsx:363`), its triage prompt hard-codes "the 3 blockers" (`:383`), and its list is usually empty, not always; each is corrected, and the empty list says blockers are not recorded here and where each filing's readiness is. | FOLD IN | To carry |
| `maa-cockpit` | The market sequence's regional Module 1 requirements, in Submission Center | partial | no | `submission-center` | Which regional Module 1 pieces each agency requires (EMA, PMDA, MHRA, TGA, Health Canada, Swissmedic, NMPA) → `required-sections.ts` and the region profiles, extended from Global RI's data (today only FDA, EU and Japan map). Tick off what is assembled → measured against placed leaves. Its hand ticks are on the founder's list (section 5.9); retiring `c2c_maa_module1_components` amends its creating migration (Rule 1). | FOLD IN | To carry, admission |
| `nda-cockpit` | Submission Center for an NDA or BLA | partial | no | `submission-center` | Module completeness → one definition (the project's approved sections and the required-section profile's placed leaves converge first). Module 1 administrative list (356h) → the US NDA/BLA required sections. Refuse-to-file risk list → shadow-review findings at the readiness check. BLA 351(a)/(k) assessment (`BlaAssessmentWorkbench`, imported only here) → Plan of a biologic project. PDUFA clock → after a recorded-action store exists (the `evaluateRegulatoryClock` pattern; a new table in `public` with `organization_id INTEGER NOT NULL`, before the final sweep pair, Rule 1). | FOLD IN | To carry, admission |
| `nda-bla` | Submission Center for an NDA or BLA | no-surface | no | `submission-center` | Correction 4. ISS/ISE, REMS, labeling and Modules 1–5 → the NDA and BLA plans on Plan, documents in the editor, labeling in `labeling-pi`. Its live AnA prompt key → the launch id now (convergence 2). | FOLD IN | To carry (key now; the rest with admission) |
| `submission-twin` | Readiness, Shadow review and the consistency check, each in its own home | partial | no | `submission-center` | Correction 1. All five of its AnA tools are hidden with it today. Readiness and fragility score (`get_submission_readiness_twin`) → the one dispatch verdict (P-33). Simulated reviewer challenges → the per-sequence Shadow review. Narrative drift between documents → the consistency check at Review (`inconsistency`). Claim-to-evidence integrity → the claims check at a document's check phase. Impact of a change → `predict_change_impact` at the check phase, rebased on a deterministic engine (a founder decision whether it becomes an AnA action). Its three AnA tools that return model-made scores (`assess_claim_evidence_integrity`, `simulate_reviewer_challenges`, `predict_change_impact`) are rebased in the same change (Rule 2); `assemble_briefing_book` moves to the briefing book's claim. | FOLD IN | To carry |
| `orchestration` | Readiness on Submit; approvals on Review; workflow runs AnA starts in a step | partial | no | `dispatch-readiness` | Readiness score and blockers → the dispatch verdict. Human checkpoints → the review board and Tasks. Predefined workflow runs → started by AnA inside the step where each applies (its stream events are already handled). The runs have no home yet: orchestration reads the integer project spine, not the project (`launch-scope.ts`), and is not re-exposed until it reads the project. | FOLD IN | To carry, admission |
| `ectd-publishing` | Compile and download, with its reference panel | partial | no | `ectd-compile` | Which eCTD specification version and code lists a sequence is validated against → a reference panel in compile and validate; AnA answers a spec question in place. Deprecating the row amends `20260810`'s keep-list and heal step in place (Rule 1), because that step clears the flag on every deploy. | FOLD IN | To carry |
| `pdev-ind-assembly` | Compile and download; plan progress on Plan | fixture-or-demo | no | `ectd-compile` | Module-by-module readiness → the dispatch verdict. Compile → compile and download. A per-phase count → Plan's "n documents · m started" (has), relabelled as plan progress. The PDEV compile path is inert; compiling is `ectd-compile`'s. | FOLD IN | To carry (label) |
| `ind-lifecycle` | IND forms | partial | no | `ind-checklist` | The same component; the alias resolves. The registry label "IND lifecycle", which `ind-checklist` still shows, becomes "IND forms" (slice 1). | FOLD IN | Carried (unverified) |
| `ind-filing` | IND forms | no-surface | no | `ind-checklist` | Forms 1571 and 1572, annual reports → IND forms (1571, 1572, 3674, cover letter, amendments, annual-report gaps, the 30-day clock). The Pre-IND meeting → agency meetings (Communication). A clinical hold letter → Respond. Its live AnA prompt key, chosen for every recorded IND → `ind-checklist`, keeping the same intelligence. | FOLD IN | To carry (key) |

#### Into CMC / Module 3, the protocol workspace and the device features

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cmc-wizard` | CMC / Module 3 | no-surface | no | `cmc` | Drug substance, drug product, stability, batch analysis → CMC / Module 3's registers and composition. Its keys in `lumen-instruction-engine.ts` and `app-registry.ts` → `cmc`; `getCmcWizardIntelligence` wired to `cmc` or deleted. Its 2026-02 description's claims (ICH Q1–Q14, process validation) go beyond the composition boundary → the founder's list (section 5.9). | FOLD IN | To carry (keys) |
| `report-engine` | *Compare to similar studies*, at the protocol's check | partial | no | `protocol-dev` | Check a synopsis against similar studies → the protocol's check phase over `benchmarkDesign` (`GET /api/clinical-regulatory-evidence/design-evidence` has no caller) and AnA's in-scope `compare_proposed_design_to_precedent`. Save recommendations into a document → AnA inserts them into the protocol in the editor. CSR-library aggregates → a lens in Reporting. `/api/analytics/analyze-protocol-text` is deleted, not left with a caller. Its attrition-adjusted N, computed from a 15% placeholder, → the founder's list (section 5.9) (Rule 2). | FOLD IN | To carry |
| `protocol-designer` | The protocol workspace | no-surface | no | `protocol-dev` | Objectives, endpoints, eligibility and schedule of assessments to ICH E6/E8 → the protocol workspace (has). SAP and adaptive-design parts → the SAP and Biostatistics. Its gating key in `app-registry.ts` → `protocol-dev`. | FOLD IN | To carry (key) |
| `510k-submission` | 510(k) and eSTAR | no-surface | no | `device-510k` | Predicate analysis, SE comparison, eSTAR → `device-510k` (has). Performance-testing matrix → confirmed in the parity audit. The medtech default AnA key → the launch id; the latent `substantial_equiv` lock removed with it. | FOLD IN | To carry (key) |
| `pma-submission` | PMA | no-surface | no | `device-pma` | Module status and package → `device-pma`. Clinical evidence → `device-clinical-studies`. Post-approval surveillance → `device-postmarket`. Package readiness → Submission Center's device row. Its key remapped with the other legacy ids (harmless today). | FOLD IN | To carry (key) |
| `cer-generator` | Clinical evaluation (CER) | no-surface | no | `device-cer` | Literature, PMCF plan, benefit-risk → `device-cer`'s literature, PMS/PMCF and generator tabs. Its rate-limit table has no reader. | FOLD IN | Carried (unverified) |
| `ce-marking` | Clinical evaluation (CER); IVDR evidence; the device filing's row | no-surface | no | `device-cer` | Clinical evaluation and GSPR mapping → `device-cer`. IVDR performance evaluation → `device-diagnostics`. Notified Body submission → the device filing's row in Submission Center. The AnA key chosen for a recorded CER → the launch id. | FOLD IN | To carry (key) |
| `ivd-completeness` | IVDR evidence, with its readiness panel | partial | yes | `device-diagnostics` | Whether the technical file is complete for the Notified Body, and the PER status → the readiness panel, read per project. The Annex VIII classification save → the classification panel. The FSN draft, the only one in the product → post-market (`device-postmarket`). | FOLD IN | To carry |
| `design-controls` | Engineering evidence, design-control trace | partial | yes | `device-engineering` | Design inputs traced to outputs, verification and validation → engineering's trace panel (needs `program_id` on `c2c_design_controls` and a V&V write path). DHF completeness → the DHF panel. | FOLD IN | To carry |
| `risk` | Engineering evidence, risk file (ISO 14971) | partial | yes | `device-engineering` | Hazards, harms, severity and probability, controls with verification, residual risk → engineering's risk panel carrying the writes (POST with the open project; reads `?program_id=`, which the route supports; rows written with no project assigned). The benefit-risk sections cite the register. AnA's `create_risk_item` and `add_risk_control`, which already run in production (`risk` is in the launch catalog) → engineering's claim. | FOLD IN | To carry |

#### Into Reporting & analytics, Quality and the conversation

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `device-analytics` | Reporting & analytics, device lens | partial | yes | `insights` | Portfolio counts, submission pace and saved report runs across device projects → Reporting's portfolio roll-up (enterprise-gated today) and its runs. Per-project counts → a device project's header. | FOLD IN | To carry |
| `report-governance` | Reporting & analytics, a run's evidence panel | partial | no | `insights` | Verify a report's integrity and provenance → the run's evidence panel. Seal → finalize (has). Revoke or supersede with a justification → added to report-os (no route exists). AnA's `generate_report`, writing `intelligent_reports`, converges onto report-os. | FOLD IN | To carry |
| `analytics-hub` | Reporting & analytics | no-surface | no | `insights` | Submission metrics and quality KPIs → Reporting's report types. Team throughput and budget → confirmed in the parity audit. Timeline forecasting → the founder's list (section 5.9): a model-made figure (Rule 2). Kept for subscription history. | FOLD IN | To carry (confirm) |
| `training` | Quality, read-and-understood training | fixture-or-demo | no | `quality` | Read and acknowledge a controlled SOP → Quality's read-and-understood training (has). Learning paths and certifications → the founder's list (section 5.9): no store, sample data only. A new user's way in → Home's setup checklist and first-run welcome (pass 5); no guided tour (the brief's anti-reference). | FOLD IN | Carried (unverified), except the founder's list item |
| `qmp` | Quality, section gates applied at a document's check | partial | no | `quality` | Which document sections must pass which gate → a Quality register, applied at the check phase of a CER, CSR or protocol. Critical-to-quality factors → the RBM and protocol-dev implementations (not a third). | FOLD IN | To carry, admission |
| `compliance-monitor` | Quality; audit and compliance reports; the audit trail | no-surface | no | `quality` | Part 11 controls and the audit trail → `audit-trail` and `compliance-reports`. Training matrix → Quality's training. Deviations and CAPAs → Quality and `device-postmarket`. Kept for subscription history. | FOLD IN | Carried (unverified) |
| `ana-memory` | *What AnA remembers*, in the conversation | partial | no | `conversation-thread` | See, verify or correct what AnA remembers → the per-person profile, which is real, shown in the conversation and account. Organisation memory governed by an administrator → once `client_memory_entries` has a writer. The atom list, reading a store nothing writes, never says "AnA remembers nothing". | FOLD IN | To carry |

#### Into features outside the release (they fold when their canonical is admitted)

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clinical-ops` | Risk-based monitoring's study overview | fixture-or-demo | no | `rbm` | Enrolment and sites needing on-site monitoring → RBM's study overview and site risk (it already reads RBM's table). Record a deviation → one deviation register (three today). Studies → one study record (four stores hold studies today; one is chosen first, convergence 13). | FOLD IN | To carry, admission |
| `pharmacovigilance` | The safety tools of the safety documents | partial | no | `pv-cockpit` | Signals and periodic reports needing action → `pv-cockpit`'s lists. The aggregate-report cycle → the DSUR or PBRER sources phase. Its route claims (`/api/pharmacovigilance`, `/api/safety-narratives`, the IND safety report and ICSR routes) → moved to `pv-cockpit`, not dropped. Its "Log a signal" form → wired to `POST /signals`; the hand-typed PRR it shows beside computed ones → the founder's list (section 5.9). | FOLD IN | To carry, admission |
| `safety-signal` | The safety tools of the safety documents | no-surface | no | `pv-cockpit` | Screen adverse-event data for signals → `pv-cockpit`'s disproportionality screen and AnA's in-scope `detect_safety_signal`. Keep expedited and periodic reports on time → the one reporting clock. | FOLD IN | To carry, admission |
| `evidence-engine` | AnA's literature search | no-surface | no | `deep-research` | Find and appraise the literature a document cites → AnA's in-scope `search_literature` and deep research; recording a reference → `device-cer`'s literature tab for a CER. Meta-analysis and GRADE → the founder's list (section 5.9): no deterministic engine exists. | FOLD IN | To carry, admission |
| `insight-synthesis` | One precedent read at Plan and Respond | no-surface | no | `precedent-intelligence` | Precedents, CRLs, AdComm trends, competitors → the one precedent read at Plan and Respond. Cross-study analytics → Reporting. | FOLD IN | To carry, admission |
| `pdev-contradictions` | The cross-document check | fixture-or-demo | no | `inconsistency` | Contradictions by severity and review state → the consistency check, keyed by project; those touching the open document → the editor's check phase. | FOLD IN | To carry, admission |
| `labeling-smpc` | Prescribing information, SmPC tab; the SmPC document's check | partial | no | `labeling-pi` | QRD section status from missing to final → `labeling-pi`'s SmPC tab, carrying the status write (`POST /api/labeling-smpc`); SmPC readiness → the check phase of the SmPC document (the `smpc` template exists). | FOLD IN | To carry, admission |

#### Into administration

| id | After the fold, the client sees | Realness | In launch scope | Canonical | Functions, and where each goes | Status | Carry-over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `setup` | Admin, Settings | works | yes | `admin-console` | Organisation name and client type, records retention, legal holds, gateway accounts, session timeout, PDF/A, letterhead and company documents → Admin's Settings tab, mounted once with the governed writers. The GAMP 5 validation kit card → back in Settings (its only UI is the unrouted `AdminConsole` export). Legal holds → also from Vault. Gateway accounts → also at Submit, the first time a sequence is transmitted. The identity console link → Admin. | FOLD IN | To carry |
| `template-library` | Admin, Company documents | partial | no | `admin-console` | Load the company's Word house style → Admin's company documents (`CompanyDocumentSettings`), applied at editor export too (today only reports and correspondence use it). Verified specs that are not company designs migrate first. "Templates" then means content templates only. | FOLD IN | To carry |
| `intelligence-catalog` | Admin: AnA's tools, allowed or not; a trust level on each AnA result | fixture-or-demo | no | `admin-console` | Correction 1. Which tools AnA can run → a list beside AnA skills in Admin, over `GET /api/ana-tool-policy/catalog` (per-organisation allow and deny), from the live registry rather than the design-kit port. How far to trust each → `PedigreeBadge` on each result (kept; Evidence, readiness and Shadow review import it). `DetResultCard`, `ValidationSummaryPanel` and `CitationChips` in the same file have no consumer and go. | FOLD IN | To carry |
| `part11-console` | Audit and integrity | works | yes | `audit-trail` | Both audit hash chains verify → a second line of the audit trail's banner. The never-switchable guarantee → already on the audit trail. | FOLD IN | To carry (one line) |
| `billing` | Subscription & billing, Invoices | works | yes | `licensing` | Invoices → a tab gated to administrators on the server (`/api/billing/invoices` returns them to any member today); with no Stripe customer it says billing is not set up, not "no invoices". Usage → the Usage tab. | FOLD IN | To carry |
| `onboarding-ingest` | *Fill from a document*, the setup wizard's first step | partial | yes | `onboarding` | Upload a document; AnA proposes organisation and first-project details with quotes; approve what is saved → the wizard's first step. Approved project name and indication → the discovery record (`PATCH /api/onboarding/discovery`), which `ProjectDiscoveryHandoff` already carries into New project (no unaudited project write). | FOLD IN | To carry |

### 5.9 Functions not carried as they are: the founder's list

The rows above carry every function they name, except these. Each is a function a folded item shows or claims today
that its canonical cannot carry as it is, because it is untrue, model-made or outside a boundary. None is dropped by a
session: the founder decides each before the slice that removes its item's shell, and until then the shell stays.

| Function | From | Why it is not carried as it is | What would carry it | Decided before |
| --- | --- | --- | --- | --- |
| The checks "Tabular summary sync" and "Cross-reference integrity" on the Automations tab | `authoring-engine` | No code runs either check; carrying the names would advertise checks that do not run. | An engine for each; each then becomes a check-phase tool in section 6. | slice 6 |
| Learning paths and certifications | `training` | No store; the screen shows sample data. Training of record is Quality's read-and-understood record, which is carried. | A store and a training-record engine. | slice 27 |
| Meta-analysis and GRADE | `evidence-engine` | No deterministic engine exists; a model-made figure breaks Rule 2. | A deterministic engine. | slice 29 |
| Timeline forecasting | `analytics-hub` | A model-made figure (Rule 2). | A deterministic schedule engine over recorded dates (`forecast_enrollment` covers enrolment only). | slice 26 |
| The ICH Q1–Q14 and process-validation claims of its 2026-02 description | `cmc-wizard` | Beyond CMC / Module 3's composition boundary (small-molecule Module 3 for a US IND, P-28). | Widening the boundary, a founder decision. | slice 3 |
| An attrition-adjusted N | `report-engine` | Computed from a fixed 15% placeholder, not a recorded rate (Rule 2). | A recorded attrition assumption fed to the in-scope `compute_sample_size`. | slice 11 |
| The demo worklist of guidance changes | `reg-change` | Demo data; no change is recorded for a client. | The guidance-change radar recording a change per project; the list is then real. | slice 28 |
| A pre-submission go/no-go | `ana-command` | A second verdict beside the one dispatch verdict per sequence (P-33). | Nothing: the dispatch verdict answers the question, and AnA narrates it. | slice 29 |
| Reads of `q_sub` and `fda_communications` | `pdev-fda-interactions` | Both stores retire into `ha_interactions` (convergence 6, decision 7). | The migration into `ha_interactions`; the FDA timeline then reads it. | slice 12 |
| Hand ticks of each regional Module 1 piece | `maa-cockpit` | A tick is a claim nothing checks; placed leaves measure the same thing. | Nothing, if placed leaves suffice. | slice 22 |
| Progress per organisation and filing type (`pyramid_task_progress`) | `pyramid` | Two projects of one filing type would share one progress; Plan's progress is per project. | Nothing, if per-project progress suffices. Its rows are migrated or the table removed by amending its creating migration (Rule 1). | slice 13 |
| *Export manifest* | `device-vault` | The button only sends AnA a sentence; no tool builds a manifest. | A manifest export over Vault's project read. | slice 4 (slice 0 removes only the button, which does nothing) |
| A hand-typed PRR shown beside computed ones | `pharmacovigilance` | A typed figure beside engine figures (Rule 2). | Nothing: `POST /signals` and `pv-cockpit`'s disproportionality screen compute it. | slice 10 |

## 6. The document build

There is one editor, `DocumentWorkbench`. It already knows which document is open and, for most documents, what kind
it is. This section says how, and which existing features appear in its side rail, at which phase, for each kind. Only
existing features are listed.

### How the editor knows a document's type

1. **Its template.** A working copy started from a template (Plan's *Create from template*, the template picker, AnA
   drafting from a template) records `template_id` and `provenance.templateSource`, which the editor already reads as
   `docTemplateContext` (`readSavedTemplateContext`). The source's `entryId` names the type:
   `registry:<GLOBAL_REGISTRY id>` (for example `registry:ICH_IB`, `registry:EU_CER`, `registry:US_510K`; 174 registry
   ids have a preparation template), `component:<document template id>` (22 component templates, for example
   `component:clinical_study_report`), or an IND catalogue entry (a deliverable id, `section:<CTD code>`,
   `module:M3`; every one of the 93 IND deliverables has a template).
2. **Its filing class**, when no template is recorded: the governed document's `doc_type`
   (`filing-document-classes.ts`: `csr`, `protocol`, `ib`, `sap`, `icf`, `dsur`, `psur`, `ind_safety_report`,
   `ind_annual_report`, `ind_amendment`, `briefing`, `orphan`, `psp`, `designation`, `fast_track`, `rmat`, `pas`,
   `cbe`, `annual_report`, `pader`, `rems`), or a hand-off's family (`editorTarget.ts`: `k510`, `pma`, `cer`, `ivdr`).
3. **Otherwise unknown.** *For this document* then says: "This document has no recorded template, so no
   document-specific tools are offered." It shows what every document has.

A registry id or class not named below is still a known kind: its tab lists what every document has and says that no
document-specific tools are offered for it yet.

What this needs, and nothing more: one pure function beside `editorTarget.ts` that maps those identities to the kinds
below (a test per kind), and one tab in the existing side rail, *For this document*, listing the kind's tools by phase.
Each tool is a feature door: one button named for the job, gated by `useSurfaceAvailable`, opening on this project and
this document and returning to it (the step and document travel as section 12 says). A tool not yet shown appears on
the tab's *Coming later* line, in words, with no button. A kind outside a feature's boundary says so in words: CMC /
Module 3 refuses a biologic, a marketing application or a non-US clinical-trial application by name, and the tab says
the same. No new store, no new screen.

### The phases, as the editor has them today

| Phase | In the editor today |
| --- | --- |
| Sources | Sources rail; vault rail; source import; AnA reading the project's files. |
| Outline | The template's outline and per-section guidance (`TemplateGuidance`); the assembly plan and its completion gaps (`AuthoringAssemblyBuild`). |
| Draft | AnA drafts a section; *Draft empty eligible sections with AnA*; the canvas. |
| Check | Figure consistency, claims check, completion gaps. |
| Review | *Send for review* (`SendForReviewDialog.tsx`, `DocumentWorkbench.tsx:71`); comments; an approver's signature (§11.50 against a frozen version); history; audit. |
| Place in sequence | The approved copy is placed by Submission Center's Builder; vault; exports. |

### Tools by document kind

"Live" means the tool works and is reached today elsewhere; it appears in *For this document* once slice 6 lands.
"Slice n" means it appears when that slice of section 8 lands; until then it is on the tab's *Coming later* line.

**Every document.** The phases above, live. *Journey* beside history (`doc-journey`, slice 17). At check: *Flag
guidance that changed since this was drafted* (`reg-change`, slice 28); *Check against the project's other documents*
(`inconsistency`, slice 16). At sources: *Ask what our sources say* (`evidence-search`) and *Research the literature*
(`deep-research`), slice 29. At review: *See the decision trail behind this version* (`decision-lineage`, slice 17).

**IND deliverables** (an IND catalogue entry; `module:M1`, `section:m1.*`; `component:cover_letter`).
- Outline: the deliverable's phase and assignment on Plan. Live.
- Draft: Forms 1571, 1572 and 3674, cover letter, Letter of Authorization (`ind-checklist`). Live. The cover letter
  and the Pre-IND briefing document already have templates and start as editor documents from Plan; IND forms
  assembles them as downloads too, and slices 12 and 15 make the download fill the governed document instead.
- Place in sequence: *Place approved documents in the sequence on Submit*. Live.
- Sources: the deliverable's development activity and evidence (`pdev` fold, slice 13).

**IND amendment and annual report** (`registry:US_IND_AMENDMENT`, `registry:US_IND_ANNUAL`; `ind_amendment`,
`ind_annual_report`).
- Draft: IND forms' amendments and annual-report gaps (`ind-checklist`). Live.
- Outline: the amendment's and annual report's plan of work on Plan (`pyramid` fold, slice 13).

**CSR** (`registry:ICH_CSR`, `component:clinical_study_report`, IND `section:m5.3.5.*`; `csr`).
- Outline: the full ICH E3 tree with per-heading guidance. Live.
- Draft: AnA drafts from the project's sources. Live. Patient narratives, 14.3.3 (`safety-narrative`, slice 10).
  Statistical methods, 9.7 (`biostatistics`, slice 11).
- Check: required E3 headings still empty (`csr-workflow` fold, slice 8). FDA's past objections by E3 section
  (`crl-library`, slice 18).
- Sources: the essential documents behind 16.1 from the trial master file (`etmf`, slice 24).
- Place in sequence: CSR source readiness in Submission Center's compile (`ectd-compile`). Live.

**Protocol** (`registry:ICH_PROTOCOL`, `component:protocol`; `protocol`).
- Draft: *Write the protocol in the protocol workspace*: schedule of assessments, risks, budget, amendments, consent
  (`protocol-dev`). Live. The statistics section (`biostatistics`, slice 11).
- Check: the ICH E9, E10 and M11 design gates in the same workspace. Live. *Compare to similar studies*
  (`report-engine` fold, slice 11). FDA's past objections (`crl-library`, slice 18). Committee approvals, coverage
  analysis and the team's training (`research-admin`, slice 24).

**SAP** (`registry:ICH_SAP`, `component:statistical_analysis_plan`; `sap`).
- Draft: AnA drafts the statistical document from the bound design (`generate_statistical_document`, in AnA's launch
  scope). Live. *Draft the statistics from the study design* in place (`biostatistics`, slice 11).
- Check: FDA's past objections (`crl-library`, slice 18).

**ICF** (`registry:ICH_ICF`, `component:informed_consent`; `icf`).
- Draft: the protocol workspace's consent tab and IRB package (`protocol-dev`). Live.

**Investigator's Brochure** (`registry:ICH_IB`, `component:investigators_brochure`, IND m1.14.4.1; `ib`).
- Draft: AnA drafts open sections from the linked 2.4, 2.5 and 2.7 summaries. Live.
- Sources: *See what each IB section still needs* (`investigator-brochure`, slice 7); the nonclinical studies it draws
  on (`nonclinical`, slice 9).

**Module 2 summaries** (`component:quality_overall_summary`, `nonclinical_overview`, `clinical_overview`,
`clinical_summary`; `registry:ICH_QOS`, `ICH_NONCLIN_OVERVIEW`, `ICH_NONCLIN_SUMMARY`, `ICH_CLIN_OVERVIEW`,
`ICH_CLIN_SUMMARY`; IND `section:m2.*`).
- 2.3, sources: the product's records in CMC / Module 3 (`cmc`). Live.
- 2.4 and 2.6, sources: the GLP studies and SEND status (`nonclinical`, slice 9).
- 2.5, check: FDA's past objections (`crl-library`) and a claim checked against precedent (`precedent-intelligence`),
  slice 18.
- All, check: the summaries against each other (`inconsistency`, slice 16), its findings attached to IND phase 6's
  "Cross-consistency QC report" deliverable, which already exists.

**Module 3** (`component:drug_substance`, `component:drug_product`, `registry:ICH_M3_DS`, `ICH_M3_DP`, IND
`section:m3.*`, `module:M3`; `component:impd`).
- Draft: *Compose Module 3 in CMC / Module 3* (`cmc`), within the composition boundary (US IND, small molecule). Live.
  For a biologic or a marketing application CMC refuses by name, and the tab says so. An IMPD
  (`component:impd`) is an EU clinical-trial dossier, outside the boundary: its tab says CMC / Module 3 does not
  compose it, and offers what every document has.
- Place in sequence: CMC's place-into-submission. Live.

**Module 4 and 2.6** (IND `section:m4.*`, `module:M4`; `registry:ICH_NONCLIN_SUMMARY`).
- Sources: the GLP studies, SEND conformance and what Module 4 still needs (`nonclinical`, slice 9).

**Labeling, PI, SmPC, package leaflet** (`component:smpc`, `component:pil`; no USPI template exists).
- Review and place in sequence: label negotiation and SPL (`labeling-pi`), with SmPC readiness at check
  (`labeling-smpc` fold), slice 22. The package leaflet's tools come with the SmPC's.

**Safety: IND safety report, DSUR, PBRER** (`registry:US_IND_SR`, `component:dsur`, `registry:ICH_DSUR`,
`component:pbrer`, `registry:EU_PSUR`; `ind_safety_report`, `dsur`, `psur`).
- Draft: AnA's in-scope safety tools (`draft_safety_narrative`, `detect_safety_signal`,
  `plan_aggregate_safety_report`). Live.
- Sources and draft: the reporting clock and signal screen (`pv-cockpit`) and the case narrative (`safety-narrative`),
  slice 10.

**EU risk management plan** (`component:risk_management_plan`). A marketing-application document: its tools come
with marketing applications (`pv-cockpit`, `labeling-pi`, slice 22); until then the tab says so, and AnA's in-scope
safety tools answer beside it.

**Post-approval filings (US)** (`pas`, `cbe`, `annual_report`, `pader`, `rems`; `registry:US_NDA_SUPP`,
`US_BLA_SUPP`, `US_CBE`, `US_NDA_ANNUAL`, `US_PADER`, `US_REMS`).
- Check: how the change is classified (AnA's in-scope `classify_post_approval_change`). Live.
- Place in sequence: the market's next sequence (`lifecycle-mgmt`), the registration it renews (`registrations`), the
  PADER's case data (`pv-cockpit`) and the REMS's label (`labeling-pi`), slices 10 and 22.

**CER and GSPR checklist** (`registry:EU_CER`, `component:gspr_checklist`; family `cer`).
- Sources: literature, signals and the PMS/PMCF feed (`device-cer`). Live.
- Check: GSPR matrix and CER structure (`device-cer`). Live.
- Place in sequence: CER export (`device-cer`). Live.
- Sources: benefit-risk from the risk file (`device-engineering`), slice 19; use-related hazards (`human-factors`),
  slice 19.

**510(k) and eSTAR** (`registry:US_510K`, `US_510K_MOD`, `US_510K_IVD`, `US_CDX_510K`, `component:k510_summary`;
family `k510`).
- Sources: predicates and the SE comparison (`device-510k`). Live. Clinical studies (`device-clinical-studies`). Live.
  Engineering, software and human-factors evidence (`device-engineering`, `device-software`, `human-factors`), slice 19.
- Draft: the labeling section (`labeling`), slice 20.
- Check: a claim checked against precedent (`precedent-intelligence`), slice 18. For a modified device
  (`US_510K_MOD`), whether the change needed a new 510(k) (`change-assessment`), slice 21.
- Place in sequence: eSTAR export and its assembly verdict (`device-510k`, `submission-center`). Live.

**De Novo** (`registry:US_DE_NOVO`, `US_DE_NOVO_IVD`). No pathway feature maps De Novo today (`PATHWAY_FEATURES` in
`ProjectMdxWorkflow.tsx` names 510(k), PMA, MDR and IVDR). Its documents are written from the template; Plan's device
workstreams serve its evidence. Clinical studies (`device-clinical-studies`). Live.

**PMA** (`registry:US_PMA`, `US_PMA_SUPP`, `US_PMA_IVD`, `US_CDX_PMA`; family `pma`).
- Outline: which 814.20 modules are written (`device-pma`), after its slice 0 fix. Live.
- Sources: the pivotal trial (`device-clinical-studies`). Live.
- Check: for a supplement, whether the change needs one and of which kind (`change-assessment`), slice 21.
- Place in sequence: the PMA package export (`device-pma`). Live.

**IVDR performance evaluation report and GSPR checklist** (`component:performance_evaluation_report`,
`registry:EU_PER`, `component:ivdr_gspr_checklist`; family `ivdr`).
- Sources: classification, analytical and clinical performance (`device-diagnostics`), after its slice 0 fix. Live.
- Check: GSPR matrix and Notified Body completeness (`ivd-completeness` fold), slice 19.

**Device PSUR** (`registry:EU_PSUR_DEVICE`, `EU_PSUR_IVD`).
- Sources: the vigilance timeline (AnA's `read_vigilance_timeline`, which runs in production). Live. Complaints, CAPAs
  and the post-market documents (`device-postmarket`), slice 21.

**Pre-Sub and briefing book** (`registry:US_QSUB`, `US_PRE_IND`, `US_TYPE_A_MEETING`, `US_TYPE_B_MEETING`,
`US_TYPE_C_MEETING`; `briefing`; IND phase 2's "Pre-IND briefing document" and "Meeting request package").
- Draft: the template, from Plan's phase 2. Live. The IND briefing book engine in IND forms (`ind-checklist`), a
  download today, filling the same governed document in slice 12.
- Draft and review: the Pre-Sub package and FDA's feedback (`device-presub`), slice 12.
- Review: *Request the meeting* in Communication (`agency-meetings` fold), slice 12.

**Agency response.** Not an editor document today: each answer is held on its letter in Respond, drafted with AnA and
signed there (live). Precedent responses (`precedent-intelligence`, slice 18).

**Designation requests** (`registry:US_ORPHAN`, `EU_ORPHAN`, `US_PSP`, `EU_PIP`, `US_BTD`, `US_FAST_TRACK`,
`US_RMAT`; `orphan`, `psp`, `designation`, `fast_track`, `rmat`).
- The templates exist and the editor writes them. Live. Eligibility for an expedited program (AnA's in-scope
  `assess_expedited_program`) and for orphan designation (`assess_orphan_designation`). Live.
- Eligibility and obligations on the project (`orphan`, `pediatric`), slice 23.

**Payer dossier.** No template exists, so no document of this kind can be opened. `market-access`, slice 23.

**Device label and IFU.** No template identifies a label today; the Labeling work package opens Author. In slice 20: a
label template id (or registry id) so the kind is known, then *Write the label and IFU* (`labeling`) at draft and
*Check each label's UDI* (`device-udi`) at check.

## 7. Convergence plan

The duplicate groups, ordered by how much a client feels them today. Each names the canonical, what moves (the rows of
section 5.8), the store or route convergence it needs, and the slice of section 8 that does it. Server-side convergence
of a store is its own change (brief, Out of scope); this section says what each needs.

Two rules bind every store named here (Rule 1). A store that retires is removed by amending the migration that creates
it, with a dated note saying what was removed, why and by which change; never by an appended DROP, which every deploy
would revert or replay. A new table (the orphan register, a recorded-action store for the PDUFA clock, any other) goes
in `public` with `organization_id INTEGER NOT NULL`, inserted before the final sweep pair, so the tenant sweep gives it
a policy; a widened CHECK on a table another file also defines is conditional on `pg_get_constraintdef`.

1. **Opening and creating a project.** Canonical: `projects`, `project-home`. Moves: `mission-control`,
   `device-workstream`, `cro-portfolio`, `filings-catalog`, `program-journey`, `dossier`, `dossier-map`,
   `client-portal`. Why first: CMC's and every device feature's empty state send a client to a locked screen that would
   create a project in another store; AnA's "take me to biopharma" lands on a locked, empty screen; a client user signs
   in to a lock. Store and route: `regulatory_programs` is the one program store; `OPEN_PROGRAM_SURFACE` = `projects`;
   `/api/c2c/projects` gains a sponsor key and filter; `/api/dossier-map` is deleted with its screen; the client-user
   redirect points at a screen they can open; an alias carries the step where the job now is, and lands on `projects`
   when no project is open. Slice 0 (the redirect, `OPEN_PROGRAM_SURFACE`, AnA's `biopharma` alias), then slice 2.
2. **AnA's prompt keys.** Canonical: the launch ids (`ind-checklist`, `device-510k`, `device-pma`, `submission-center`,
   `device-cer`, `cmc`, `document-authoring`, `protocol-dev`). Moves: the legacy keys of `ind-filing`,
   `510k-submission`, `pma-submission`, `nda-bla`, `ce-marking`, `cmc-wizard`, `doc-canvas`, `protocol-designer`,
   `csr-author`, `cer-generator`. Why: `module-intelligence.ts` `detectActiveModule` returns legacy keys for every
   recorded IND, NDA, BLA, 510(k), PMA, De Novo and CER, and `lumen-instruction-engine.ts` lists only legacy ids, so an
   organisation holding only launch modules gets no Document Editor, Dossier Workflow, Dossier Manager or
   cross-jurisdictional prompt blocks. Store and route: none; remap keeping the same intelligence; the rows stay
   deprecated for subscription history. Slice 3.
3. **Documents and where they are kept.** Canonical: `document-authoring` and `vault`. Moves: `batch-draft`,
   `csr-workflow`, `csr-author`, `doc-journey`, `ectd-coauthor`, `source-tracer`, `doc-canvas`, `regulatory-workspace`,
   `authoring-engine` into the editor; `artifacts-center`, `device-vault` into the Vault. Why: AnA's drafts are kept in
   `concept2cure_artifacts`, which the Vault does not list and Author does not read; device clients see a second vault.
   Store and route: `coauthor_documents` content migrated into the canonical store; `project_sections` serves nothing;
   the Vault's project read includes every `concept2cure_artifacts` row of the project; the Live Drive hand-off is
   retargeted in the same change; Plan's phase 3 count reads the composed Module 3; the AnA-draft → canvas → editor →
   vault gate holds throughout. The Vault half is slice 4; the editor half is slices 6 (`authoring-engine`), 8 (the CSR
   and the editor's folds) and 17 (`source-tracer`, `doc-journey`); the keys of `doc-canvas` and `csr-author` are
   slice 3.
4. **Plan.** Canonical: `project-home`'s Plan step. Moves: `pyramid`, `pdev`, `pdev-cmc`, `pdev-nonclinical`,
   `pdev-clinical`, `pdev-regulatory`; the plan-progress count of `pdev-ind-assembly`. Why: two models of what an IND
   needs, and a third progress store. Store: progress is `unified_tasks` assignments (Plan already);
   `pyramid_task_progress` (per organisation and type) is on the founder's list (section 5.9); PDEV's activity state
   becomes the deliverable's task state; the IND amendment, annual report and safety supplement pyramids are projected
   like the IND's; AnA's `plan_submission` reads the pyramid engine instead of asking a model. Slice 13; the plan
   progress label of `pdev-ind-assembly` is slice 15.
5. **Protocol authoring.** Canonical: `protocol-dev` as the protocol's workspace. Moves: `report-engine`,
   `protocol-designer`; Plan's *Finalize protocol (5.3.5)* opens the workspace instead of starting a second protocol
   document. Why: Author's protocol button and Plan's deliverable open two different protocols over two stores. Store:
   `protocol_documents` and the editor's protocol documents become one; which holds the text is this convergence's
   design question, and the AnA-draft → canvas → editor path must still open a protocol in the one editor. Slice 11
   (Author's door is renamed in slice 0).
6. **Agency interactions.** Canonical: `communication-center` for every project's letters and meetings; the project's
   Respond step for answering. Moves: `haq-manager`, `agency-meetings`, `pdev-fda-interactions`; the device Pre-Sub's
   store (`device-presub` keeps its place on Plan). Why: four stores hold one relationship with the agency, and the
   Meetings tab cannot create a meeting. Store: letters stay in `concept2cure_agency_communications`; meetings and
   commitments in `ha_interactions` (a founder store decision); `c2c_agency_meetings`, `q_submissions`, `q_sub_*` and
   `fda_communications` retire after migration; widening `ha_interactions`' CHECKs is conditional on
   `pg_get_constraintdef` (Rule 1); one briefing-book engine (`assembleBriefingBook`) filling the IND catalogue's
   existing "Pre-IND briefing document", so three paths (Plan's template copy, IND forms' download, PDEV's draft) become
   one document. Slice 12, after decision 7.
7. **Submission verdicts.** Canonical: `submission-center`, with `dispatch-readiness` (the one dispatch verdict per
   sequence, P-33), `ectd-compile` and `ind-checklist`. Moves: `device-submission`, `device-validation`,
   `shadow-review`, `submission-twin`, `orchestration`, `pdev-ind-assembly`, `ectd-publishing`, `ind-lifecycle`,
   `ind-filing`; with admission, `nda-cockpit`, `nda-bla`, `maa-cockpit`; the follow-up actions of
   `gateway-transmittals`. Why: a device client sees two lists of its submissions; IND forms can show a readiness that
   disagrees with Submit's. Store: three IND-ready verdicts (`evaluateIndReadiness`, the dispatch verdict, PDEV's
   registry) become the dispatch verdict; two module-completeness definitions (`dossier-read.ts` counting approved
   sections, the required-section profile counting placed leaves) become one; the package model and `c2c_blockers` serve
   no client path; region profiles extended from Global RI's data; Submission Twin's model-scoring tools rebased. Slice
   14 (device), slice 15 (sequences and `gateway-transmittals`), slice 22 (the three folds that wait for admission);
   `ind-lifecycle`'s label is slice 1 and `ind-filing`'s key slice 3.
8. **Device evidence registers.** Canonical: `device-engineering`, `device-diagnostics`, `device-510k`, `device-pma`,
   `device-cer`. Moves: `design-controls`, `risk`, `ivd-completeness`, `510k-submission`, `pma-submission`,
   `cer-generator`, `ce-marking`; `device-udi` reads the label store `labeling` edits. Why: a device project's evidence
   view shows records of other projects. Store: `program_id` on `c2c_design_controls`, `hf_engineering_files` and
   engineering's four panels' stores (additive, `IF NOT EXISTS`); `risk_items` rows with no project assigned; the IVDR
   completeness read takes a project; the labeling read takes the project. Slice 0 hides the panels that read across
   projects; slices 19 and 20 key them; the legacy keys of the four no-surface items are slice 3. `device-tasks` moves
   with Tasks (convergence 12) and `device-analytics` with Reporting (convergence 11).
9. **Consistency and precedent.** Canonical: `inconsistency`, `precedent-intelligence`, `deep-research`. Moves:
   `pdev-contradictions`, `insight-synthesis`, `evidence-engine`; Submission Twin's narrative drift. Store: findings
   keyed by project, not organisation; one CRL source (the evidence graph or the precedent engine's writerless objection
   store, revisiting ADR 0013); two deep-research engines into one. Slices 16, 18 and 29.
10. **Administration.** Canonical: `admin-console`; `licensing` as Subscription & billing; `audit-trail`; `onboarding`.
    Moves: `setup`, `template-library`, `intelligence-catalog`, `billing`, `part11-console`, `onboarding-ingest`;
    `usage`, `apps` and `access-requests` become tabs of Subscription & billing. Route: server role gates on
    `/api/billing/checkout`, `/dtc-checkout`, `/portal` and `/invoices`; one pricing source; the AnA tool policy read in
    Admin; a governed path for each of Admin's four prompt-only actions. The administration session, alongside the
    slices.
11. **Reporting.** Canonical: `insights`. Moves: `report-governance`, `device-analytics`, `analytics-hub`. Store:
    report-os is canonical; AnA's `generate_report` stops writing `intelligent_reports`; a revoke route is added. Slice
    26.
12. **Tasks, Quality and the conversation.** Canonical: `tasks`, `quality`, `conversation-thread`. Moves:
    `device-tasks`, `team-workspace` into Tasks; `training`, `compliance-monitor`, `qmp` into Quality; `ana-memory` into
    the conversation. Store: Tasks already reads the store `device-tasks` reads, and `team-workspace` has no screen;
    nothing to migrate for Quality (training has no store). Slice 5 (Tasks), slice 27 (Quality), slice 29
    (`ana-memory`).
13. **Outside the release, when admitted.** Studies: the four stores that hold studies (`clinical_ops.studies`,
    `clinical_studies`, `cdisc_prm_studies` and `protocol_documents`) become one study record, and three deviation
    stores one register; then `clinical-ops` into `rbm` (slice 25). Safety: `pharmacovigilance`, `safety-signal` into
    `pv-cockpit`; two expedited-clock engines into one; three narrative generators into
    `server/services/ana/safety-narrative.ts`. Labeling: `labeling-smpc` into `labeling-pi`; `c2c_labeling_pi` gains a
    product key, amended in place (Rule 1). Lifecycle: `cmc_change_controls` into CMC / Module 3's `cmc_change_control`;
    one renewal source. eTMF: `tmf_artifact_filings` and `tmf_files` into one. Lineage: one model over the editor's
    approvals. Safety is slice 10; labeling and lifecycle slice 22; eTMF slice 24; lineage slice 17.

## 8. Order of work

**2026-10-26 continuation:** the central-service direction above governs every slice without resetting this order.
A2.1–A2.9 are implemented. Project Author preserves governed section detail, artifact counts/states/section
dates and the old map's recorded tracking modules on their own bases. Incoming A2.7 folds dossier bookmarks
through the shared step-aware resolver onto Author, or Projects without a selection; standalone screens,
HTTP routes and identities are retired while stored data/subscriptions remain. Its native/retirement proof
is in `slice-A2/A2.7/`. Concurrent A2.7b carries raw tracking identities, signed states, unknown observations
and unmapped rows with shared label/placement/stat validation in one typed
`supportingReadiness.sectionTracking` source, alongside the canonical top-level `artifactReadiness`.
Supporting-source failures remain explicit; failed scope revalidation refuses the response. Its 163-test/native/build qualification
belongs to the pre-merge snapshot. Combined proof in `slice-A2/A2.7b/merged/` records 294 tests
in 27 files, two native flows and the production build passing; mandatory publication gates still apply.
A2.8 routes the existing MDX alias to Projects using `projects.filter {workstream: 'MDX'}`.
Its red/green routing and native portfolio proof is in `slice-A2/A2.8/README.md`;
the reconciled concurrent changes pass 398 tests in 30 suites, both native flows
and the production build (`slice-A2/A2.8/merged/`). Earlier source qualifications remain separate;
the existing device-workstream shell, target and catalogue remain for A2.10.
A2.9 retires twelve duplicate HTTP writes and their unreachable creation helpers while preserving core intake,
stored readers/updates and the two deferred internal rule/quota owners. Its source-owner/retained-route contract,
427-test regression, 20 real database audit checks, native wizard/12-404 flow and build are recorded in
`slice-A2/A2.9/`. Next is **A2.10** (`SLICE_A2_PLAN.md`), each remaining fold gated by function parity.
After A3–A5, the first direct specialized-feature placement is A6's existing device clinical-studies door on
Evidence. Reuse `ProjectMdxWorkflow.tsx`'s recorded scope and availability contract and `shellProject.ts`'s return
path; prove placement, unavailable/wrong-project behavior and return to Evidence before any former destination folds.

Vertical slices, each one a session can build and prove on its own, most client value first. Every item that is not
LIVE NOW in section 5 is named under "Rows" in the slice that shows, places or folds it; a slice 0 fix on the way is
named in slice 0 as well. Each slice names the rows it moves, the work (each a completion of something that
exists), whether it needs the founder's admission (Rule 2), and its evidence. Every slice's evidence goes under
`docs/evidence/D2-CLIENT-JOURNEY/<date>/<slice>/`: a test shown failing on the case it exists to catch, then passing;
screenshots at 1280 px and 390 px on a freshly provisioned organisation using its own data, never the demo seed; and
the affected test set against the same set at the previous commit. No slice removes a folded item's shell before
`FUNCTION_PARITY.md` confirms its row and the founder has decided its section 5.9 items.

### Slice 0: what a client meets today that is false, locked or a dead end

Small items, no admission, each on a path a client reaches today (fail closed, never fabricate). Rows: `coverage`
(PLATFORM ONLY); the slice 0 fixes below are also named in their own rows.

Locks and dead ends:
- `OPEN_PROGRAM_SURFACE` = `projects` (CMC's and every device feature's empty state open a locked screen today).
- AnA's `biopharma` alias → `projects`; `intelligence` and `safety` no longer navigate to locks
  (`navigationReachability.test.ts`); the conversation's "evidence" chips retargeted.
- Client users' post-login redirect → a screen they can open.
- ⌘K lists only places, the project's steps and features already shown, by their placed names; a folded id resolves
  to its canonical; "Jump to" with an empty query lists the places.
- Plan & features: a card for a feature not shown loses its Open button.
- *Codebase coverage* off every member's account menu, beside Platform licensing for platform administrators.
- Decision 1 applied on the rail: Communication and CMC / Module 3 granted at signup, or off the rail of an
  organisation that does not hold them and named in Subscription & features.
- Admin's "Grant access", "Edit scopes", "Change setting" and "Audit a member" stop sending a prompt nothing carries
  out; its header's Part 11 claim is said only of actions that make one.
- `device-presub`'s commitment and dossier-link buttons, which call a handler no caller passes, hidden; "New Q-Sub"
  says it asks AnA (AnA's `create_q_sub` runs in production).
- `device-software`'s dead-end empty state offers *Ask AnA to add a lifecycle item* (`create_software_lifecycle_item`
  runs in production).

Untrue, always-empty or cross-project states:
- Panels that show other projects' records hidden until keyed, each with a line saying why: `device-engineering`'s four;
  `device-postmarket`'s signals, PMS plan and CAPA board; `human-factors`' file panels (`files[0]`); `labeling`'s
  record panels (the organisation's first document).
- `device-postmarket`'s documents panel and `labeling`'s "Warnings and precautions" say they are not read here yet,
  instead of an empty list.
- `device-pma` states only a recorded phase and ticks no phase it does not know; `device-diagnostics` with no project
  open says none is selected.
- `device-validation`'s header claim, its hard-coded "the 3 blockers" prompt and its always-empty list corrected.
- `device-vault`'s unbacked subtitle and its *Export manifest* button removed; `device-submission`'s invented target
  labels removed.
- Author's Memory and Instructions cards say they are not read on this page.
- Author's "Protocols (organisation-wide)" reads "Write the protocol in the protocol workspace".

Evidence: one test per item, red on `f8e0d3210`; a walk of a freshly provisioned self-serve organisation that reaches
no lock from any rail entry, door or ⌘K result.

### A. One way into each place, and back

1. **Names a client reads.** The registry labels of section 9, which the breadcrumb, the page title, ⌘K and
   Subscription & features all read; one name per job (Author's CMC door and Submit's IND forms door take Plan's
   names; every step door and the twelve device workstream doors take their job names); "Plan & features" →
   "Subscription & features", "View all plans" → "Compare subscriptions", "Licensing" → "Platform licensing", and the
   "Workflows" wording in Subscription & features' states and Setup's module panel; the address
   `/concept2cure/features` (section 12); Plan's "My work" and "Open task board"; the IND catalogue's phase 1 name
   "Program Planning" → "Planning", in the catalogue so Plan and AnA read one name; Submit's and Respond's *Coming
   later* lines rewritten to today's truth, and Plan, Evidence, Author and Review given theirs. Rows: `ind-lifecycle`
   (its label was the last thing to carry). Admission: none. Evidence: a test that no client-visible label, door or
   *Coming later* line contains a word from section 9's "Not in client copy" list or names a folded feature as live,
   red on `f8e0d3210` ("Plan & features", "PV cockpit", "Agency meetings" on Respond).
2. **Projects: one way in, and back to the right step** (convergence 1). Rows: `mission-control`,
   `device-workstream`, `cro-portfolio`, `filings-catalog`, `program-journey`, `dossier`, `dossier-map`,
   `client-portal`. Work: creating a project writes the canonical store only; a pathway filter and a portfolio summary
   on Projects ("Not recorded", never 0%); a sponsor key on projects and on `/api/c2c/projects`, and a sponsor filter;
   the filing picker carries the catalogue's "how you'll build it" copy and AnA prompt; `dossier`'s callers repointed;
   anything `dossier-map`'s grid shows that `ModuleCompletion` lacks moved into `ProjectDossier.tsx`, then
   `/api/dossier-map` and its screen go together; the open step kept with the open project in `shellProject.ts`'s
   per-tab channel, so the project chip and every door return to it (the nav-params stash is TTL-bounded and would not
   outlive an editing session); an alias that carries a step and lands on Projects when no project is open, applied to
   this slice's folds and to every later fold; `mdx` → `projects`. Admission: none, except external sponsor users
   (`client-portal`, decision 2). Evidence: a person who starts a document from Plan comes back to Plan by the chip
   (red today: Author); "Choose or create a project" from every former door writes one row in `regulatory_programs`; a
   folded alias with no project open lands on Projects.
3. **AnA's prompt keys** (convergence 2). Rows: `ind-filing`, `510k-submission`, `pma-submission`, `ce-marking`,
   `cmc-wizard`, `doc-canvas`, `cer-generator`; the keys of `nda-bla`, `protocol-designer` and `csr-author` (their
   other functions are slices 22, 11 and 8). Work: `detectActiveModule` and `lumen-instruction-engine.ts` remapped to
   the launch ids with the same intelligence; `getCmcWizardIntelligence` wired to `cmc` or deleted; the latent
   `substantial_equiv` lock removed; `510k-submission`'s performance-testing matrix confirmed by the parity audit.
   Admission: none. Evidence: an organisation holding only launch modules gets the editor and dossier prompt blocks for
   a recorded IND, 510(k) and CER (red today).
4. **Every document in Vault** (convergence 3, the Vault half). Rows: `artifacts-center`, `device-vault`. Work: the
   Vault's project read includes `concept2cure_artifacts` rows outside CMC with their signature state
   (`server/routes/c2c/project-vault.ts`); *Drafted by AnA* as a Vault filter; the Live Drive hand-off after AnA saves
   a draft (`V2App.tsx:686`) retargeted in the same change; Plan's phase 3 count reads the Module 3 composed in CMC
   (flow H). Admission: none. Evidence: a draft AnA saved appears in its project's Vault with its signature state (red
   today); a composed Module 3 shows phase 3 started.
5. **Tasks: every source, and assigned work opens where it is done** (convergence 12, the Tasks part). Rows:
   `device-tasks`, `team-workspace`. Work: each item labelled with its source; `device-tasks`' four KPI cards and its
   "not on this board" count checked against Tasks and added if missing; a task whose source is `filing_deliverable`
   opens Plan on that deliverable, or the editor on its working copy once one exists; Plan's "Your tasks" filtered to
   the project; *Awaiting my review* as a filter on Tasks; Quality's read-and-understood training and due periodic
   reviews, and an administrator's access requests, among the open items. Admission: none. Evidence: Dana opens her
   assigned IB deliverable from Home and lands on its working copy (red today: the task); an access request appears
   among the administrator's open items.
6. **The document knows its type** (foundation of the document build). The kind map beside `editorTarget.ts` and the
   *For this document* tab, listing from the first day only the tools that are live (IND forms, Compose Module 3,
   Place in sequence on Submit, the protocol workspace, the device features' doors) and a *Coming later* line per kind;
   the same device doors on Evidence for the evidence packages. Rows: `device-cer`, `device-510k`,
   `device-clinical-studies`, `protocol-dev` (READY TO PLACE, placed here), `device-pma`, `device-diagnostics` (placed
   after their slice 0 fixes), `authoring-engine` (folded: one line of help per template in `AuthoringTemplatePicker`,
   and the check phase lists the checks the editor runs; its Automations decided under section 5.9); `ind-checklist`
   and `cmc` gain the editor door. Admission: none. Evidence: a test per kind (red with no map); a test that the tab
   offers only available tools and names the rest in words; an IB, a CSR and a 510(k) section at both widths; a device
   project's Evidence step opening its clinical studies.

### B. The IND document build

7. **Investigator's Brochure.** Rows: `investigator-brochure`, at the IB's sources phase and on Plan's IB deliverable
   (phase 5), its readiness scoped to the project, its copy corrected. AnA's drafting of open sections from 2.4, 2.5 and
   2.7 is live already. Admission: yes (decision 3). Evidence: the readiness read refuses another project's studies (red
   on the organisation-wide read); a real IB working copy with its readiness.
8. **CSR and the editor's folds.** Rows: `csr-workflow` and `csr-author` (the E3 "required and still empty" blocker at
   the CSR's check phase, from `ICH_E3_STRUCTURE` through `m5-clinical-qc`; CRL findings per E3 section wait for slice
   18), `batch-draft` (the screen removed, `AuthoringAssemblyBuild` named; template-free batch drafting stays AnA's
   `batch_draft_sections`), `regulatory-workspace` (the outline's status, dependency and comment counts from
   `/api/authoring/docs/:id/sections`), `ectd-coauthor` (`coauthor_documents` content migrated into the canonical store;
   the ICH M4 check is Submission Center's Validation, module placement its Builder). Admission: none (the functions
   land in the editor). Evidence: a CSR with an empty required heading cannot be sent for review and names the heading;
   a coauthor document opens in the editor with its content.
9. **Nonclinical, Module 4 and 2.6.** Rows: `nonclinical` (at the sources phase of Module 4, 2.4 and 2.6; a Plan phase
   4 door; the sample pill and the `dossier` rows corrected), `pdev-nonclinical` (a GLP report attached from Vault moves
   its deliverable). Admission: yes, with a boundary like CMC's (decision 4). Evidence: the register shows only the
   project's studies; a Module 4 deliverable started from Plan opens with its studies beside it.
10. **Safety narratives and the IND safety report.** Rows: `safety-narrative` (three generators converged on
    `server/services/ana/safety-narrative.ts`, the fixtures port deleted, the deleted in-document affordance reached) at
    the draft phase of CSR 14.3.3, the IND safety report and the DSUR; `pv-cockpit` (its 312.32 clock on IND forms'
    safety-report card, one clock engine); `safety-signal`, `pharmacovigilance` (route claims moved; the "Log a signal"
    form wired to `POST /signals`). Admission: yes, the IND sponsor's part only; case intake is a founder decision, and
    until it exists a narrative is drafted from case facts in the project's sources (decision 5). Evidence: a narrative
    drafted from a source listing, every fact traced; the clock agrees with `calculateReportingDeadline` on the 7- and
    15-day cases.
11. **Protocol and SAP, with the statistics in the document.** Convergence 5 (Plan's *Finalize protocol (5.3.5)* opens
    the protocol workspace). Rows: `report-engine` (*Compare to similar studies* at check over `benchmarkDesign`, the
    broken route deleted), `protocol-designer` (its functions, already in the workspace), `biostatistics` (drafting in
    place into the SAP, protocol section 10 and CSR 9.7, so protocol-dev's *Open in Biostatistics* no longer opens a
    lock). The statistics placement is nearly free: its engine is AnA's in-scope `generate_statistical_document`.
    Admission: none for the in-document statistics drawn through AnA; yes for the `biostatistics` surface itself
    (decision 6). Evidence: one protocol per project whichever door opens it; a SAP section whose every number comes
    from the engine.
12. **The Pre-IND meeting and its briefing book** (IND phase 2). Rows: `agency-meetings` (request from Plan phase 2,
    meetings and commitments in Communication on `ha_interactions`), `pdev-fda-interactions` (commitments into Plan's
    deliverables), `haq-manager` (*Awaiting a response* on Respond, ready now), `device-presub` (its project filter, a
    workstream destination, a form over `q_sub.create`, feedback at Respond). The briefing book is not a new document:
    Plan's phase 2 already creates "Pre-IND briefing document" and "Meeting request package" from their templates, so
    the work merges three paths into that one governed document (Plan's template copy, IND forms'
    `assembleBriefingBook` download, PDEV's draft). Admission: the store decision only (decision 7); the folds land in
    Communication, which is in the release. Evidence: one meeting visible on Plan, Communication and Respond from one
    row; the briefing book downloaded from IND forms is the governed document's approved version; the CHECK widening
    replays on a database holding the wider rows (Rule 1).
13. **Plan for the IND's later sequences.** Rows: `pyramid` (the IND amendment, annual report and safety supplement
    plans in Plan; `plan_submission` reading the engine; per-organisation progress decided under section 5.9), `pdev`,
    `pdev-cmc`, `pdev-clinical`, `pdev-regulatory` (activity state, evidence and blocks-IND on deliverables).
    Admission: yes for PDEV's functions (decision 8). Evidence: an amendment project's Plan lists its pyramid's
    deliverables; two projects of one type keep separate progress.

### C. Submit: one verdict per sequence

14. **Device filings in Submission Center** (convergence 7, device part). Rows: `device-submission` (device packages
    across projects in Submission Center's portfolio; the transmit gate as the eSTAR assembly verdict on the row; the
    milestone log as the row's history; a new package, a notified-body package included once the parity audit confirms
    it, as a new sequence), `device-validation` (every open blocker on the eSTAR filing-readiness panel; the
    cross-project blockers view as a Reporting report over the canonical verdicts). Admission: none. Evidence: a device
    client sees one list of its submissions (red today: two).
15. **Sequences: readiness, transmittals and IND forms** (convergence 7). Rows: `dispatch-readiness` (the gate detail
    inline under each market row), `gateway-transmittals` (status, ACK, AS2 receipt and technical rejection on the
    Dispatch rows; rejection working for sequence transmittals), `ectd-publishing` (the reference panel; `20260810`'s
    keep-list and heal step amended in place, Rule 1), `shadow-review` (criticals as named blockers in readiness),
    `orchestration` (readiness into the verdict; checkpoints into the review board and Tasks; its runs placed in
    the steps once it reads the project), `submission-twin` (each function to its home; its model-scoring tools rebased,
    Rule 2), `pdev-ind-assembly` (its count relabelled as plan progress); with `ind-checklist`'s Vault-placed leaves,
    its downloads filling the governed documents, and one IND-ready verdict. Admission: none for the in-release rows;
    yes for orchestration's runs and Submission Twin's rebased functions (decision 9). Evidence: IND forms and Submit
    give the same verdict for the same sequence (red where they can disagree today); a technical rejection of a sequence
    transmittal is recorded and shown on its row.

### D. Review: consistency and precedent

16. **The project's documents against each other.** Rows: `inconsistency` (keyed by project, at Review, at each
    document's check and on IND phase 6's existing "Cross-consistency QC report" deliverable), `pdev-contradictions`;
    Submission Twin's narrative drift. Admission: yes (decision 10). Evidence: a dose stated differently in the IB and
    the protocol is found for this project and not for another.
17. **Sources and the trail at review.** Rows: `source-tracer` (*Citations to superseded sources* on Review),
    `doc-journey` (*Journey* in the editor), `decision-lineage` (one model over the editor's approvals and signatures).
    Admission: yes for `decision-lineage` (decision 10). Evidence: a superseded source is listed with every citing
    section; a signed version shows its trail.
18. **Precedent at the check phase, at Plan and at Respond.** Rows: `crl-library`, `precedent-intelligence`,
    `insight-synthesis`: one CRL source with real letter text (the flag decision and a corpus load), the claim check in
    the 510(k) SE section and 2.5, precedent responses at Respond. Admission: yes (decision 10). Evidence: an objection
    shown with its source letter; an empty corpus says so, never "no objections".

### E. Device evidence, device lifecycle, post-approval, study conduct

19. **Device evidence true to the project** (in the release). Rows: `device-engineering` (keyed), `risk` and
    `design-controls` (folded; writes carry the project), `human-factors` (program id, package mapped, *Start the
    usability file*), `device-software` (create and edit on the screen), `ivd-completeness` (folded into
    `device-diagnostics`). Can run beside group B: it touches `client/src/concept2cure/mdx/` and its routes only.
    Admission: none. Evidence: two device projects in one organisation each see only their own records (red today).
20. **Device labeling and UDI** (in the release). Rows: `labeling` (the read scoped to the project; its existing routes
    wired; the package pointed there; a label or IFU template id), `device-udi` (project-scoped, opening its label).
    Admission: none. Evidence: a label's UDI checked against the device's record, both of this project.
21. **Device post-market and change.** Rows: `device-postmarket` (the documents panel reading the existing
    documentation-status route; the `capa-mdr` writes from the screen; the panels keyed; the FSN draft; Quality's
    queue), `change-assessment` (on the applier, called from the change record, the result saved, a new 510(k) starting
    a `US_510K_MOD` filing). Admission: yes for `change-assessment` (decision 11). Evidence: a complaint opens a CAPA
    and starts its MDR clock; a change record's decision is saved and audited.
22. **Drug post-approval.** Rows: `lifecycle-mgmt`, `registrations` (on the market row), `labeling-pi` (a product key)
    and `labeling-smpc`, `nda-cockpit`, `nda-bla`, `maa-cockpit`. Admission: yes, and marketing applications widen the
    composition boundary (decision 11). Evidence: an approved market's renewal becomes its next sequence; two products
    keep two labels.
23. **Designations and market access.** Rows: `pediatric` (its false audit message fixed first), `orphan` (a store
    deployed in `public` with `organization_id INTEGER NOT NULL`; the designation on the project), `market-access` (a
    template is new catalogue content). Admission: yes (decision 11). Evidence: a PREA obligation becomes a dated task;
    nothing claims an audit entry it did not write.
24. **Trial records.** Rows: `etmf` (one store, the `inspections` routes reached, CSR 16.1 sources), `research-admin`
    (CITI on Plan's team, coverage analysis at the protocol's check), after the founder decides whether university
    research offices are served. Admission: yes (decision 11). Evidence: an inspection-readiness index from this
    project's trial only.
25. **Risk-based monitoring.** Rows: `rbm` (started from a project's study on Evidence, linked to the project),
    `clinical-ops` (folded after one study record and one deviation register are chosen); then the rail's *Work areas*.
    Admission: yes (decision 11). Evidence: a project's study opens its first risk assessment; one deviation is
    recorded once.

### F. Reporting and Quality

26. **Reporting** (convergence 11). Rows: `report-governance` (verify, seal, and a revoke or supersede route with a
    justification; AnA's `generate_report` onto report-os), `device-analytics` (pathway counts and submission pace in
    the portfolio roll-up; per-project counts on a device project's header), `analytics-hub` (its report types
    confirmed by the parity audit). Admission: none (the functions are Reporting & analytics' own). Evidence: a
    finalised report revoked with a justification stays readable, marked revoked; device counts read the canonical
    projects.
27. **Quality** (convergence 12, the Quality part). Rows: `training` (read-and-understood training is Quality's
    already), `compliance-monitor` (already in the audit trail, compliance reports and Quality), `qmp` (section gates as
    a Quality register applied at the check phase of a CER, CSR or protocol). Admission: yes for `qmp`'s gates.
    Evidence: a section gate blocks a CER's check phase until it passes.

### G. Intelligence as AnA actions

28. **AnA at the moment of the decision.** Named suggestions in the side column: Plan phase 1's "Regulatory pathway
    assessment" deliverable (`strategic-advisor`, `global-ri`; `filing-strategy`'s AnA path, then its Plan panel once
    its shape mismatches are fixed); a market added on Submit (`global-ri`); the check phase of a reopened document
    (`reg-change`, with a notice among Home's open items); recording the chosen pathway and designations on the project
    (a governed write on the project record). Rows: `filing-strategy`, `reg-change`. Admission: none for the in-scope
    tools; yes for `filing-strategy`'s panel. Evidence: a suggestion appears only where its trigger holds; an answer's
    figures trace to the engine.
29. **Research, cited answers and continuity.** Rows: `evidence-search` (cited answers scoped to the project),
    `deep-research` with `evidence-engine` folded (one engine, runs on Evidence, synthesis to Vault), `ana-command`
    ("since you were last here"), `ana-memory` (*What AnA remembers*). Admission: yes. Evidence: a cited answer whose
    every passage is from this project's sources; an empty memory never says "AnA remembers nothing".

### H. Named by the founder for later

30. **Biostatistics work area.** Rows: `biostat-workbench` (plans listed per study and bound to the project's study
    design; `biostatistics`' bridge and document list absorbed; then the rail). Admission: yes (decision 13).
31. **CMC adequacy.** Placed in CMC / Module 3. It has no catalogue item and no code by that name today; its
    definition is the founder's, and the slice begins with its "What already exists" section (Rule 3) over CMC /
    Module 3's registers and the CMC knowledge record (`server/services/cmc/knowledge/cmc-regulatory-record.json`).

### Administration, alongside (one session, any time after slice 1)

Rows: `audit-trail` (READY TO PLACE: Admin and Quality entries), `part11-console`, `setup`, `template-library`,
`intelligence-catalog`, `billing`, `onboarding-ingest` (folds), `identity-console` (after decision 12). Work:
Subscription & billing with tabs (`licensing`, `usage`, `billing`, `apps`, `access-requests`) and its server role gates
on checkout, DTC checkout, the billing portal and invoices; one pricing source; a governed path for each of Admin's four
prompt-only actions (settings through Setup's writers; a member's actions through the audit trail; project-access
grants and role scopes through a governed write, which does not exist yet); the onboarding entry limited to
administrators. `coverage` moved in slice 0. Evidence: a member cannot fetch invoices or start checkout; an
administrator reaches the audit trail from Admin and Quality; changing the session timeout writes an audited setting.

### Decisions the order needs, in the order it needs them

1. Whether a self-serve organisation is granted Communication and CMC / Module 3 at signup (a pricing decision), or
   they leave its rail until held (slice 0).
2. Whether external sponsor users get a read-only project (`client-portal`, slice 2).
3. Admission of IB readiness as an IND document tool (slice 7).
4. Admission of Nonclinical / Module 4, with Module 4's boundary (slice 9).
5. Admission of the IND sponsor's safety part, and whether case intake is built (slice 10).
6. Admission of the Biostatistics surface for in-place drafting (slice 11).
7. The store for agency meetings and commitments (`ha_interactions` recommended; slice 12).
8. Admission of PDEV's functions onto Plan (slice 13).
9. Orchestration's workflow runs in the steps; Submission Twin's rebased scores, and whether `predict_change_impact`
   becomes an AnA action (slice 15).
10. Admission of the consistency check, the decision trail and one CRL source (slices 16–18).
11. Change assessment, drug post-approval and marketing applications (widening the composition boundary), designations,
    market access (new catalogue content), eTMF, research administration (serving university research offices) and
    Risk-based monitoring (slices 21–25), each when its slice is ready.
12. Whether a client's administrator operates SSO and SCIM (administration session).
13. The Biostatistics work area and CMC adequacy, last (slices 30, 31).

Standing: each item of section 5.9, decided before the slice in its last column.

## 9. Naming conventions

- **Places are nouns**: Home, Projects, Tasks, Communication, Vault; work areas CMC / Module 3, Quality, Reporting &
  analytics (and, when admitted, Biostatistics, Risk-based monitoring).
- **Steps are single nouns**: Plan, Evidence, Author, Review, Submit, Respond. "Plan" means only the project's first
  step; the subscription is "Subscription" (Subscription & features, Subscription & billing, Compare subscriptions).
- **Doors are verb phrases naming the job.** A door that leaves the step names the job and then the place it is done
  in: "Compose Module 3 in CMC / Module 3", "Prepare Forms 1571, 1572 and 3674 in IND forms", "Place approved
  documents in the sequence on Submit". A door that stays with the document names only the job: "Check this section
  against FDA's past objections", "See what each IB section still needs". A door never names only its destination
  ("Open in Authoring", "Open readiness").
- **One job, one name.** The same job has the same door name wherever its door appears. Today two jobs have two names
  each: Author's "CMC / Module 3" and Plan's "Compose Module 3 in CMC / Module 3"; Submit's "IND forms" and Plan's
  "Prepare Forms 1571, 1572 and 3674 in IND forms". Slice 1 gives both the Plan name.
- **States are plain words, never colour alone**: Not started; Started; Assigned to Dana Ruiz, due Nov 13, 2026; In
  review; Changes requested; Approved; Signed; Placed in sequence 0003; Sent; Acknowledged. Unrecorded is "Not
  recorded", never 0%. A failed read is "Could not be checked", never an empty list. A store a screen cannot read is
  "Not read here yet", never "No … yet".
- **Not yet shown** is the step's or the document's *Coming later* line, in words, with no button. A locked screen
  reached by a bookmark says it is not in this release. Never "Coming soon", never a disabled button.
- **Not in client copy**: app/apps for a specialized feature, workflow (for a feature), suite, cockpit, workbench, engine, hub, twin,
  intelligence (as a product name), module (except a CTD module and CMC / Module 3), program (use project), plan (for
  the subscription). Sentence case throughout. Internal ids (`apps`, `LAUNCH_APPS`) are not words a person reads and
  keep their names; where an id would show in the address bar, an alias shows a word instead (section 12).

### Surface names

The registry label is what the breadcrumb (`Shell.tsx:559`), the page title (`Surfaces.tsx:412`), ⌘K and Subscription
& features show today. Until slice 1 changes it there, a rename elsewhere is not done.

| Surface | Registry label today | Other names in use today | Client label | Where it changes |
| --- | --- | --- | --- | --- |
| `apps` | Plan & features | Apps, Workflows (its loading, error and empty states; Setup's module panel) | Subscription & features (administrators) | Slice 1 |
| `licensing` | Plans & licensing | View all plans | Compare subscriptions; with `usage`, `billing`, `access-requests` and `apps`, Subscription & billing, with tabs | Slice 1; tabs in the administration session |
| `usage`, `billing` | Usage & limits; Billing | — | Tabs of Subscription & billing | Administration session |
| `master-licensing` | Master licensing | Licensing (account menu) | Platform licensing | Slice 1 |
| `tasks` | Tasks & collaboration | My work (Plan's section, "Open My work"), "Open task board", Tasking | Tasks; Plan's section "Your tasks" | Slice 1 (the rail already says Tasks) |
| `communication-center` | Communication Center | — | Communication | Slice 1 (the rail already says Communication) |
| `vault` | Vault (DMS) | — | Vault | Slice 1 |
| `quality` | Quality & Assurance | — | Quality | Slice 1 |
| `project-home` | Project home | — | The project's name | Slice 1 |
| `document-authoring` | Document editor & authoring | "Open in Authoring" | The editor | Slice 1 |
| `review` | Review & approval | "Open the review board" | The review board | Slice 1 |
| `protocol-dev` | Protocol development | "Protocols (organisation-wide)" | The protocol workspace | Slice 0 (Author's door), slice 1 (label) |
| `ind-checklist` | IND lifecycle | "IND forms" (Submit), "Prepare Forms 1571, 1572 and 3674 in IND forms" (Plan) | IND forms | Slice 1 |
| `dispatch-readiness` | Dispatch readiness | "Open readiness" | Readiness | Slice 1 |
| `submission-center` | Submission center | The market row's "Open" | Submission Center | Slice 1 |
| `gateway-transmittals` | Gateway transmittals | — | Sent to the agency | Slice 15 |
| `haq-manager` | Health authority questions | — | Awaiting a response (a filter on Respond) | Slice 12 |
| `agency-meetings` | Agency meetings | Respond's *Coming later* line | Meetings (in Communication) | Slice 1 (the line), slice 12 |
| `device-cer` | CER generator (EU MDR) | "Open clinical evaluation" | Clinical evaluation (CER) | Slice 1 |
| `device-510k` | 510(k) workbench | "Open pathway work", "Open eSTAR assembly" | 510(k) and eSTAR | Slice 1 |
| `device-pma` | PMA submissions | "Open pathway work", "Open filing documents" | PMA | Slice 1 |
| `device-diagnostics` | Device & diagnostics workbench | "Open IVDR evidence" | IVDR evidence | Slice 1 |
| `device-engineering` | Device engineering | "Open engineering evidence" | Engineering evidence | Slice 1 |
| `device-postmarket` | Post-market vigilance | "Open surveillance" | Post-market surveillance and CAPA | Slice 1 |
| `risk` | Risk management | Risk management (ISO 14971) | Risk file (ISO 14971); kept apart from Risk-based monitoring | Slice 19 (fold) |
| `labeling` | Labeling | — | Label and IFU; kept apart from Prescribing information | Slice 20 |
| `report-engine` | Protocol analysis | Report engine | Compare to similar studies (a protocol check) | Slice 11 |
| `biostat-workbench`, `biostatistics` | Biostat workbench; Biostatistics | — | Biostatistics (one name) | Slice 30 |
| `inconsistency` | Inconsistency Intelligence | — | Check the project's documents against each other | Slice 16 |
| `pv-cockpit`, `pharmacovigilance` | PV cockpit; Pharmacovigilance | — | The safety report's clock and signal screen | Slice 10 |
| `audit-trail`, `part11-console` | Audit trail; 21 CFR Part 11 console | — | Audit and integrity | Administration session |
| `template-library` | Template library | — | Company documents (Admin); "templates" means content templates only | Administration session |
| `intelligence-catalog` | Intelligence catalog | — | AnA's tools (Admin); a trust level on each result | Administration session |
| `submission-twin` | Submission twin | — | Not a name a client sees: its jobs are readiness, Shadow review and the consistency check | Slice 15 |
| `coverage` | Codebase coverage | — | Not shown to clients | Slice 0 |
| IND catalogue, phase 1 | — | "1. Program Planning" on Plan | "1. Planning" | Slice 1 (in the catalogue) |

After slice 0, ⌘K lists only surfaces a client can use, so a registry label of a folded or not-yet-shown surface is
not seen by a client; it is renamed when its row is shown or folded.

### Door names

Today's label, and the job name slice 1 gives it. A device door's name depends on the pathway the project files.

| Where | Today | Job name |
| --- | --- | --- |
| Evidence | Open in Vault | Add or find files in Vault |
| Author | Open in Authoring | Find or start a document in the editor |
| Author | Protocols (organisation-wide) | Write the protocol in the protocol workspace |
| Author | CMC / Module 3 | Compose Module 3 in CMC / Module 3 |
| Plan (non-IND, non-device filing) | Open Author | See this filing's documents on Author |
| Plan | My work; Open My work | Your tasks; See your tasks in Tasks |
| Plan, Review | Open task board | See all tasks in Tasks |
| Review | Open the review board | Review documents on the review board |
| Submit header | Open readiness | Check what stops sending |
| Submit header | IND forms | Prepare Forms 1571, 1572 and 3674 in IND forms |
| Submit header | Open Submission Center | See every sequence in Submission Center |
| Submit market row | Open ("Open {market} in the Submission Center") | Build the {market} sequence in Submission Center |
| Device workstream | Open engineering evidence | Build the risk file and design-control trace |
| Device workstream | Open project evidence | Add this work's sources on Evidence |
| Device workstream | Open project documents | Write this work's documents on Author |
| Device workstream | Open software evidence | Check the software and cybersecurity documentation |
| Device workstream | Open agency responses | Answer the agency on Respond |
| Device workstream | Open surveillance | Run post-market surveillance and CAPA |
| Device workstream | Open pathway work | 510(k): Choose predicates and build the SE comparison; PMA: See which PMA modules are written; MDR: Gather literature and map the GSPRs; IVDR: Record classification and performance evidence |
| Device workstream | Open eSTAR assembly | Assemble the eSTAR |
| Device workstream | Open filing documents | PMA: Export the PMA package; MDR: Export the CER; IVDR: Assemble the technical documentation |
| Device workstream | Open clinical evaluation | Write the clinical evaluation (CER) |
| Device workstream | Open clinical studies | Record the clinical studies behind this filing |
| Device workstream | Open IVDR evidence | Record analytical and clinical performance (IVDR) |

"Compile and download", "Add a market", "Create from template", "Assign", "Work with AnA" and "Prepare this work
with AnA" already name their jobs and stay.

## 10. Component reuse map

No new visual component. Every placement reuses one of these.

| Pattern | Existing component | Used for |
| --- | --- | --- |
| Feature door | The pass 2–3 doors: `IndPhaseDoor` (`ProjectPlan.tsx`), `IndFormsDoor` (`ProjectMarkets.tsx`), Author's CMC button, `WORK_DESTINATIONS` (`ProjectMdxWorkflow.tsx`); `useSurfaceAvailable` | Every door in a step and in *For this document*, named as section 9 says. |
| Not yet shown | `ComingLater` (`ProjectComingLater.tsx`), `PJ_LIFECYCLE.later` and `laterDevice` | Each step's and each document kind's *Coming later* line. |
| Step tracker and band | `ProjectStages.tsx`, `StageBand` (`pj-stageband-next`) | The six steps and *Next*. |
| Step side column | `aside.pj-step-side` (`.pj-grid`, `.pj-side`), `StartConversation`, `ProjectConversations` (`ProjectHome.tsx`), `ProjectSide`, `ProjectSkills` | AnA beside every step; named AnA suggestions (slice 28). |
| Step section | `.pj-sec`, `.pj-sec-h` | Every block in a step. |
| List row | `.cdl-row` | Deliverables, letters, tasks, tools in *For this document*. |
| Open items | `client/src/concept2cure/v2/OpenWork.tsx` (assigned, approvals, review groups), `taskTarget.ts` | Home and the top bar's drawer; Quality training, access requests and guidance notices join it; a deliverable's task opens Plan or the editor (slice 5). |
| Setup checklist | `HomeSetup.tsx` | A new organisation's first steps. |
| Assign | `PlanAssign.tsx` (`AssignAction`, `AssignmentLine`, `usePlanAssignments`); `editor/AssignReviewDialog.tsx` (`createAssignedTask`, `useAssigneeRoster`) | Plan's deliverables, device workstreams, PDEV's activities. |
| Drawer, dialog | `C2CForm`, `useDialog` | Assign, Request the meeting, Pre-Sub. |
| Governed write | `GovernedConfirmDialog`, `EsignModal` | Approvals, responses, revoke a report, a change assessment. |
| Honest states | `EmptyState`, `ErrorState` (`dataConnect.tsx`), `LaunchScopeGate` | Every empty, failed or not-in-release state. |
| Live reads | `useLiveData`, `useLiveRows` | Every list. |
| Device workstreams | `ProjectMdxWorkflow.tsx` (`mdxProjectPlan`, `WORK_DESTINATIONS`) | Plan, and the Evidence filter of the same rows. |
| Project tasks | `ProjectWorkPanel` (`ProjectHome.tsx`), `MyWorkLine` (`ProjectPlan.tsx`) | Plan, Review; Plan's "Your tasks" (slices 1, 5). |
| Market rows | `MarketsBody`, `IndFormsDoor` (`ProjectMarkets.tsx`), `useProgramMarkets` (`programSequence.ts`), `MarketGateDetail` (`DispatchReadiness.tsx`) | Submit's header and rows, readiness, registrations, next sequence. |
| Agency inbox | `AgencyInbox.tsx`, `AgencyResponses.tsx` | Respond and Communication. |
| Module completion | `ProjectDossier.tsx` (`ModuleCompletion`, `DossierReadinessCard`) | Author, the side column; replaces `dossier` and `dossier-map`. |
| Editor rail | `DocumentWorkbench.tsx` rail tabs, `SendForReviewDialog.tsx`, `AuthoringAssemblyBuild`, `TemplateGuidance`, `RecordHistory` | *For this document*, *Journey*, the decision trail. |
| Template identity | `readSavedTemplateContext`, `editorTargetDocLabel`, `filing-document-classes.ts` | The document kind. |
| Template picker | `AuthoringTemplatePicker.tsx` | What AnA drafts for each template (from `authoring-engine`). |
| Hand-offs and the way back | `openProjectHome`, `shellProject.ts`, `stashNavParamsForTarget`, `editorTarget.ts`, `ProjectChip` (`Shell.tsx`) | Opening a project, a sequence, a transmittal, a document; returning to the step a door was opened from (slice 2). |
| Trust level | `PedigreeBadge` (`intelligence/Intelligence.tsx`) | On each AnA result; kept from the Intelligence catalog. |
| Toast and status | `useToast`, `role="status"` | Confirmations, never celebrations. |

## 11. Content growth plan

- **A new filing type** gets a Plan by extending Plan's projection to its pyramid (`services/regulatory/pyramids/*`)
  or its device work packages. It never gets a screen of its own. Until it has one, Plan says plainly that its list is
  not available in this release.
- **A new document type** is known by its template id and registry id. It gains tools by adding entries to the kind
  map behind *For this document*. A type with no template has no tools, and says so.
- **A feature that starts to work** moves from NEEDS WORK TO SHOW (or READY TO PLACE) to LIVE NOW in its home named in
  section 5: its words leave the *Coming later* line, its door appears and ⌘K lists it by its placed name, in the same
  change, with its status re-earned on real data. Admission adds a door, never a rail entry, except a work area the
  founder names.
- **The rail** grows only through an explicit placement/admission decision for a standardized central service.
  The previously queued additions are Biostatistics and Risk-based monitoring. The 2026-10-26 service examples do
  not automatically add or duplicate rail entries; specialized features stay inside their mapped workflow homes.
- **A duplicate found later** goes into section 5.8 with its canonical and its functions before anything else is built.
- **A function found later** in a folded item (by the parity audit or a client) is added to its fold row and carried
  before the shell is removed; one that cannot be carried as it is goes on the founder's list (section 5.9).
- **A new store** for any placement goes in `public` with `organization_id INTEGER NOT NULL`, before the final sweep
  pair; a store that retires is removed by amending its creating migration (Rule 1).
- **Many projects.** Projects gains filters (sponsor, filing type, device pathway) and search; Home shows the most
  recent projects, open items and conversations, each with a way to the full list.
- **Many documents.** Plan groups by phase with counts; Author lists by module with module completion; Vault filters by
  kind, state and source (including *Drafted by AnA*).
- **Many open items.** Home groups them by kind (to write, to review, to sign, to read, to decide), each group with a
  count and a way to Tasks.
- **This document** is re-read whenever a surface is added, renamed, folded or shown; the inventory row and this
  placement change in the same commit.

## 12. URL strategy

- **One pattern.** `/concept2cure/<surface-id>`, the id being the registry id
  (`shared/constants/ui-surface-registry.ts`). Home is `/concept2cure`. An unknown id renders an honest scaffold.
- **The open project is on the URL** as `?program=<uuid>` (`shellProject.ts`), kept across surfaces; a copied link
  opens that project. Only a program UUID is read or written.
- **Steps are not routes.** The project home is one surface. A link with no step opens the project on its default
  step: Plan with no documents, Author otherwise. The step a person is on is kept with the open project in the tab
  (`shellProject.ts`'s per-tab channel), so the top bar's project chip, and every door's way back, return to it (slice
  2). The nav-params stash alone cannot carry it: it is consumed once and TTL-bounded, and would not outlive an editing
  session, and project home reads only `workId` from it today (`ProjectHome.tsx:1467-1470`). A `?step=` read once
  would also make a step linkable; launch needs only the return.
- **Doors** navigate to the feature's surface with `?program=` kept; a specific record (a sequence, a transmittal, a
  section) travels through `stashNavParamsForTarget`, consumed once and time-bounded. A document travels to the editor
  through the editor-target channel (`editorTarget.ts`), not the URL.
- **Aliases** (`DEEP_LINK_ALIASES`) keep old links working and never land on a lock or on an empty project screen:
  `biopharma` → `projects`; `intelligence` and `safety` stop being navigation targets until their features are shown
  (with `navigationReachability.test.ts`); `ind-lifecycle` → `ind-checklist` and `task-board` → `tasks` stay; `mdx`,
  which resolves to `device-workstream` today (`registryModel.ts:963`), → `projects` when that folds. When a duplicate
  is folded, its id becomes an alias of its canonical, so bookmarks and notifications still arrive. An alias whose
  canonical is the project carries the step where the job now is and needs an open project: `haq-manager` → the
  project's Respond step, `dossier` and `dossier-map` → Author, `pyramid`, `pdev` and `pdev-*` → Plan; with no project
  open it lands on Projects, never on the project screen's "No project selected". Today an alias carries neither, so
  `haq-manager` → `project-home` would show "No project selected", or open on Plan or Author (slice 2). Others:
  `device-vault` and `artifacts-center` → `vault`, `part11-console` → `audit-trail`, `device-tasks` → `tasks`.
- **No id with "app" in the address bar.** Subscription & features keeps its id `apps`, but the address a person sees
  and copies is `/concept2cure/features`: `features` is an alias of `apps` for reading a link, and the path the shell
  writes for `apps` (slice 1). No other id a client can reach contains the word.
- **Administration** keeps its ids (`admin-console`, `apps`, `licensing`, `usage`, `billing`, `access-requests`,
  `audit-trail`, `onboarding`, `master-licensing`); Subscription & billing is one surface with tabs, and the other ids
  open it on their tab.
