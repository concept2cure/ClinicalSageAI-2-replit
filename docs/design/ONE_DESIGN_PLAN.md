# One design, one plan — Concept2Cure is Claude for life sciences

**Decided by the founder, 2026-10-31 (P-78). Absolute.** It binds every developer, every Claude Code session, every
Codex, Copilot or Cursor agent, every subagent, workflow, cron job and automation, from any tool. Nobody builds
outside this plan, and nobody breaches it. `CLAUDE.md` RULE 5, `AGENTS.md` and the Copilot instructions point here.
`npm run ci:one-design-plan` in `.husky/pre-push` enforces it, with no bypass.

> The founder: "This platform should look like Anthropic built this. It should match how Claude is designed
> entirely, from projects to the canvas to the editor to the details. This is basically Claude for life sciences."
> And: "everyone must work from the same design and goals and never breach your plans. Never build anything outside
> of the plans and to bring the code base beneath the UI fully to life inside this new UI framework."

---

## 1. The goal

1. **It looks and works like Claude.** Concept2Cure looks and works like Claude (claude.ai): projects, the project,
   the conversation, the canvas, the editor and every detail, as if Anthropic built it for regulatory affairs in
   life sciences.
2. **The whole codebase lives in that UI.** Every capability the server, engines and data already provide is
   reachable, usable and honest in the new UI. Nothing built beside it, nothing left unreachable beneath it. A
   capability with no UI caller is reached by its package (R1) or retired by a founder decision. It is never
   duplicated.
3. **Nothing is built outside the plan.** A new screen, API mount or table exists only when this plan's ledger
   approves it. Everything else is converging, completing, reaching or repairing what exists (CLAUDE.md RULE 3 and
   RULE 4).

## 1a. What the product is: the spine (founder decision P-79, 2026-11-01)

> The founder: "The system should be obviously centered around document building, ECTD, filing, formatting it
> correctly, like ECTD 4.0 … with the Viva parity tools, our DMS, and Anna's ability to do all of this, just like
> Claude." "A project is where everything starts." (Full record: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-79.)

**The centre of the product** is the document and its filing. A document is built, formatted correctly and filed in
eCTD (3.2.2 and 4.0). Vault is the document management system, built to compete with Veeva. AnA does the work in
conversation, as Claude does. Every package in §3 serves that path. Nothing beside it is built.

**The spine, in the order a person meets it:**

1. **The project and its goal.** Every piece of work starts in a project. The project states what it is for: the
   application and the question it must answer. An example is "show that the small molecule meets its primary
   endpoint, and file the IND".
2. **The data room.** This is the project's catalog of everything: historical records, study data, documents and
   sources. Items get in by upload, from AnA's paperclip, from Vault, and from study-conduct capture. Each item is
   immutable once captured. A change is a new version, never an overwrite. Its lineage (who, what, when, from where,
   superseding what) is kept in perpetuity.
3. **The protocol.** It holds the hypothesis, the primary, secondary and tertiary endpoints, and the estimands. The
   data room reads its items against the protocol and the goal.
4. **The evidence.** Biostatistics and the safety profile are computed by deterministic engines from the catalog's
   data, against the protocol's endpoints (RULE 2).
5. **AnA writes.** AnA is the medical and regulatory writer. It narrates the evidence into the document (a CSR,
   Module 2.5 and 2.7, an IB, a briefing book and others), citing each figure's source. A person reads what AnA
   wrote, edits it, or directs AnA to strengthen it. When the data do not support a request, **AnA pushes back**: it
   says so, says what the data do support, and cites the engine result or source behind its answer. AnA's expertise
   covers:
   - regulatory affairs and medical writing;
   - clinical science and safety, including pharmacovigilance;
   - EDC and ePRO data;
   - data management.
6. **The one editor** (RULE 4). Review, comments, versions and signatures happen here, for every document type and
   every client type.
7. **eCTD and filing.** The document is assembled, formatted, validated and dispatched in eCTD 3.2.2 and 4.0, with
   each region's Module 1.
8. **Vault, throughout.** Vault holds every document and version with its lifecycle, seals, fixity and audit
   trail.

**Featured work areas.** Two work areas are profiled beside the spine:
- **CMC.** Module 3 composition for the IND, plus a data-capture environment used during study conduct.
- **Risk-based monitoring.** It runs over the project's study data.

Biostatistics is the project's evidence, reached from the project, not from the rail.

**Clients and regions.**
- Clients: medical device and diagnostics, biotech, and big pharma. Each is a document-type catalog (RULE 4).
- Regions: the United States, Europe, Japan, Canada and Australia.
- China is not now. The NMPA code that exists stays as it is and is not extended.

### What already exists (RULE 3), by spine step

Read at HEAD on 2026-11-01. "Unverified" marks what the search found but did not run.

| Step | What exists, by path | What it does not do yet |
|---|---|---|
| 1. Project and goal | Projects and the project page: `client/src/concept2cure/v2/surfaces/Projects.tsx` and `Project*.tsx`. The project's "Start work in this project": `ProjectCoreWork.tsx`. The project-anchoring principle: `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` §0. A `projectGoal` pathway value (`first_ind`, `cmc`) filters templates in `server/routes/concept2cure.ts`. | The project does not hold a stated goal (the question it must answer) that the data room, the protocol and AnA read. Unverified whether New project asks for one. |
| 2. Data room | Capture, with a sha256 source record and a supersede chain: `server/services/clinical-regulatory-evidence/`. Processing status: `shared/data-room-processing-status.ts`. Retrieval: `server/services/data-room-retrieval.ts`. Data origins and attribution: `client/src/concept2cure/lineage/`. In the editor: `editor/DataRoomSourcesPanel.tsx`. Lineage routes: `server/routes/data-lineage.ts`, `decision-lineage.ts`. Design: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`. Lineage plan: `LINEAGE_END_TO_END_PLAN_2026-09-25.md`. | Lineage does not hold end to end. The plan's own verified hops show the break: Vault upload drops lineage (hop A2), and extraction carries no extractor version (A3). Their LX and PF fixes are this step's work. The `.xpt`, `.sas7bdat` and Dataset-JSON readers were deferred on 2026-10-08, so EDC and ePRO data are not read as data. |
| 3. Protocol | Study design and protocol: `server/services/study-design/`, `server/services/protocol-development/`, `surfaces/ProtocolDev*.tsx`. Amendments and deviations: `server/services/protocol-amendments/`, `protocol-deviations/`. Study data in the editor: `editor/StudyDataSource.tsx`, `StudyDataBuild.tsx`, `server/services/csr/csr-study-data.ts`. | The data room does not read its items against the protocol's endpoints and the goal. |
| 4. Evidence | Biostatistics engines: `server/services/biostatistics-bridge/`, `ana-biostats/`, `biostatistics-judgment/`. Screens: `surfaces/Biostatistics.tsx`, `BiostatWorkbench.tsx`. CDISC conformance: `server/services/cdisc/`. Safety: `surfaces/SafetyNarrative.tsx`, `server/services/pharmacovigilance/`, `shared/schema/ind-safety-reports.ts`. | Endpoint results are not computed from the catalog's study data for the protocol's endpoints in one path. |
| 5. AnA writes | AnA: `server/services/ana/`. Defensibility assessment (`assess_defensibility`, in scope since 2026-10-31): `server/services/ana/ana-launch-scope.inventory.json`. Amendments in the editor: `docs/design/EDITOR_ANA_AMENDMENTS_2026-10-26.md`, `editor/DraftAlternatives.tsx`. Citations: `editor/citationNode.ts`. The CSR path: `docs/design/CSR_END_TO_END_2026-10-29.md`. | Push-back is not one stated behaviour: refusing a claim the data do not support, saying what they do support, and citing the source. |
| 6. The one editor | `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `DocumentWorkbench.tsx`. Its design is package D4. | See D4. |
| 7. eCTD and filing | eCTD services: `server/services/ectd/`. The eCTD 4.0 (RPS) message builder, packager and validator: `server/services/ectd/ectd4/`. eCTD 4.0 routes (`/v4/validate`, `/v4/forward-compat`, controlled vocabularies): `server/routes/ectd-v4.ts`. Compile: `server/routes/ectd-compile.ts`. Regional rules: `server/services/ectd/ectd-regional-rules.ts`. Gateways: `server/services/submission-gateways/`. Screens: `surfaces/SubmissionCenter.tsx`, `EctdCompile.tsx`, `EctdFiledState.tsx`. Design: `docs/design/FILING_SPINE.md`. | Regional depth is uneven. In `ectd-regional-rules.ts`, FDA appears 48 times, PMDA 28, EMA 16, Health Canada 3 and TGA once. Unverified whether Canada's and Australia's Module 1 can be built. Transmit is wired but not proven (launch row D7). |
| 8. Vault | Services: `server/services/vault/` (66 files), `shared/schema/vault.ts`. About 40 `surfaces/Vault*.tsx` screens: versions, lifecycle, seals, fixity, relationships, review routes, annotations, the data-room filing. A Veeva Vault connector: `server/integrations/veeva-vault/`. | The 2026-07 competitive audit scored Vault 1.7/5 against Veeva's 4.9/5 (`docs/audit-2026-07/13-competitive/etmf-and-regulated-document-management-vault-dms.md`). That audit's gaps are this step's parity list. |
| CMC | Services and API: `server/services/cmc/` (60 files), `server/api/cmc/`, `shared/schema/cmc-os.ts`. Composition boundary: `server/services/cmc/composition-scope.ts` (P-28). Screens: `surfaces/CmcModule.tsx`, `CmcModule3Build.tsx`, `CmcPlaceIntoSubmission.tsx`. Professional-tier licensing: `db/migrations/20260824_cmc_professional_tier.sql`. | The study-conduct data capture is not presented as its own half of the work area. Licensing is a founder question. |
| Risk-based monitoring | Services: `server/services/rbm/`. Routes: `server/routes/mdx-rbm*.ts`. Screens: `surfaces/Rbm*.tsx`, `RbmIngest.tsx`. Decision P-76. Design: `docs/design/RBM_NAVIGATION_PROJECT_SETUP_2026-10-30.md`. | It is not on the one work-area pattern (D7). |

**S1: where the project's objective lives** (decided 2026-11-01 under P-80 and P-82, after RULE 3 found three
existing stores):

| Store | What it is | Role |
|---|---|---|
| `project_charters` and its `objectives` section in `charter_sections` (`shared/schema/project-charter.ts`, `server/routes/charters.ts`) | The program charter. Each section is versioned and content-hashed (21 CFR 11.70(b)), with its status transitions logged. | **The objective of record.** It is immutable with a whole history, as the founder asked, and it is P-82's charter. |
| `project_intelligence_profiles` (`server/services/client-intelligence-memory.ts`) | AnA's understanding of the project: strategy, indication, population, primary endpoints, decisions, open questions. Read on every turn (`server/services/lumen-context/intelligence-prefix.ts`). | **AnA's catalogue.** It gains the charter's objective in the same per-turn project block. |
| `ana_client_objectives` (`server/routes/client-intelligence.ts`) | The organisation's goals tracker. Project-admitted since `edcbf4f3da`. | Stays the company-goals tracker. |

To finish:
1. The charter route reads a project's charter, and records a new version of its objectives section, with the
   source of each objective: the protocol section, the trial registry entry or the sponsor's release.
2. The project page's "About this project" card shows the objective and its source.
3. New project asks for the objective.
4. AnA proposes the objective from the protocol and the public record, and a person confirms it. Unverified: that
   `charter_sections` is on every applier.

**Open for the founder** (P-79 does not decide these):
1. Is CMC licensed separately?
2. Does the CMC composition boundary widen beyond small-molecule Module 3 for a US IND?
3. Do the clinical-dataset readers come back for EDC and ePRO data?

## 1b. The significance of a project (founder decision P-81, 2026-11-01)

> The founder: "It's her job to bring their science to life, to reality, and to get approved and to be used. We are a
> major bridge from concept to the idea to cure."

A project is the whole regulatory life of a product, worked in one place:
- by a team;
- with AnA growing in it;
- through assembly, publishing and submission;
- with the agency's answers coming back into it.

| Part | What already exists, by path | What is to finish |
|---|---|---|
| AnA knows the project and the person | Memory: `server/services/memory/`, `memory-orchestrator.ts`, `memory-context-assembler.ts`, `memory-consolidation-job.ts`, `client-intelligence-memory.ts`. Project intelligence: `server/services/intelligence/project-intelligence-service.ts`. The user profile and interactions: `server/services/ana-context-router.ts` (`buildUserContext`, `recordUserInteraction`). Memory acceptance: `server/services/ana-ri/memory-acceptance.ts`. Memory routes: `server/routes/mdx-ana-memory.ts`. Question flows: `server/services/ana/intelligence-questions/`. | One AnA that carries each project's knowledge and the person's preferences into every turn. It asks the questions that find what is missing, and pushes back (S4). |
| The team on licensed seats | Seats: `server/services/seat-licensing.ts`, `server/services/licensing/`. Sharing: `server/routes/c2c/project-sharing.ts`, `server/services/project-sharing-access.ts`, `shared/project-sharing.ts`. Screens: `surfaces/ProjectTeamSharing.tsx`, `ProjectTeamResponsibilities.tsx`. | Seats and the team shown and used in the project page (S9, on D3's layout). |
| Tasks: what is due, and what is mine | Tasking: `server/services/tasking/`, `server/routes/c2c/tasks.ts`. Screens: `surfaces/TaskBoard.tsx`, `TaskAssignmentControls.tsx`, `v2/TaskTray.tsx`. Deadlines: `server/services/ana/deadline-radar.ts`. | Each person's due work for the project, by date, in the project and in Tasks (S9). |
| Extract commitments | The capability, registered with no handler: `server/services/ana-capability-registry.ts` (`extract-commitments`). The risk tier: `server/services/ai-governance/risk-tiers.ts`. Fulfilment: `server/services/ha-interactions/commitment-fulfilment.ts`, `server/routes/commitment-fulfil-route.ts`, `surfaces/CommitmentFulfilment.tsx`, `CommitmentRow.tsx`. AnA's commitment tools (`create_regulatory_commitment`, `review_commitment_portfolio`, `fulfill_regulatory_commitment`) are held for `lifecycle-mgmt` in `ana-launch-scope.inventory.json`. Proposing an agency letter's questions: G3. | The handler: AnA proposes, a person confirms, each commitment lands with its source, owner and due date, and shows as due work (S9). |
| The plan, its schedule and its goals | `surfaces/ProjectPlan.tsx`, `PlanAssign.tsx`. Milestones: `server/routes/protocol-milestones.ts`. Schedule of events: `server/routes/project-schedule-of-events.ts`. The milestone and progress columns of `regulatory_programs`. The objective: S1. | The project's goals and schedule, with progress against them visible on the project (S9, S1). |
| Assembly, publishing and submission | The editor's assembly: `editor/AuthoringAssemblyBuild.tsx`, `assemblyBuild*.ts`. eCTD: S5. | See S5. |
| The agency's communications come back | `surfaces/AgencyInbox.tsx`, `CommunicationCenter.tsx`, `HaqManager.tsx`, `ProjectRespond.tsx`. Correspondence: `server/routes/regulatory-correspondence.ts`, `server/services/company-documents/`. Agency responses: `server/routes/c2c/agency-responses.ts`. Design: `docs/design/CORRESPONDENCE_CONVERGENCE_2026-10-29.md`. | Each letter lands in the project. Its questions go to Respond, and its commitments go to tasks (S10, S9). |

## 1c. The project is the program (founder decision P-82, 2026-11-01)

A major filing is run as a program. The study of how a program manager does it, and of how a project becomes that
from what exists, is `docs/design/THE_PROGRAM_2026-11-01.md`. It binds with this plan. In short:
- the charter (the objective, target label, pathways, region order, agency interactions, scope, governance);
- the work breakdown (the CTD modules crossed with the functions);
- workstreams as sections of the one project;
- the integrated schedule backwards from the target date, with its critical path;
- a RACI and a content plan per leaf;
- the logs;
- the review cycle;
- a global schedule and portfolio.

It is finished from:
- the submission pyramid engine (`services/regulatory/SubmissionPyramidEngine.ts`);
- the charter (`project_charters`);
- tasking, the team, the timelines and Submission Center's leaves.

It is shown in the project's Plan step. Package S11.

Work projects (CMC, biostatistics, risk-based monitoring and others) are projects of their own under the product
program. Their deliverables are mapped to the downstream documents they feed (P-83, the study's §7a). Package S12.

## 2. The design (binding)

The colour, type and spacing tokens already exist in `design-system/colors_and_type.css`, and they are Claude's
palette. Keep them. This section decides how they are used.

**Character.** The product is calm, typographic and conversation-first, with generous whitespace and almost no
chrome. The content leads and the frame stays quiet:
- one primary action per view;
- sentence case everywhere;
- status colour only for meaning;
- Claude orange (`--accent-main-100`) used sparingly: the send button, the spark, focus, and one primary action.

**Type.** The system sans is the UI face, at 14–15 px for body text. Lora is the reading serif. It sets:
- the greeting;
- page titles where Claude uses them;
- assistant prose;
- documents.

No display sizes inside content. Anthropic's own typefaces are proprietary and are not used; this pairing is the
licensed equivalent.

**Sidebar.** The sidebar is collapsible and holds, in order:
1. the brand and the primary "New conversation" action;
2. the places: Home, Projects, Tasks, Communication, Vault and Submission Center;
3. the work areas: CMC / Module 3, Risk-based monitoring, Quality, Reporting & analytics (Biostatistics is reached
   from the project, §1a; RULE 4 admits no new rail entry);
4. Recents: recent conversations and projects, as Claude lists them;
5. the account, at the bottom.

The active item takes a soft fill.

**Home.** A centred serif greeting and one large rounded composer (radius about 20 px, a hairline border, a soft
shadow, attach, and an orange send button). A few quiet starter suggestions sit below. Nothing else is above the
fold.

**Projects.** The page holds the title, a search field, one "New project" button and a grid of calm cards. Each card
shows the name, a one-line description and when it was updated. Filters stay quiet. There are no readiness bars and
no stat strip.

**A project.** This is Claude's project page:
- **Main column:** the name, a one-line description, the composer ("How can I help with this project?") and the
  project's conversations.
- **Right column (about 320 px), "Project knowledge":** the project's documents, sources, team and key facts, each as
  a quiet card.
- **The regulatory work:** Plan, Evidence, Author, Review, Submit and Respond, documents, filing state and the work
  areas. All of it stays one click away, in a quiet segmented control and sections below the composer, never as
  banners above it.

**Conversation.** A centred reading column. AnA's prose is set in the serif, the person's turns are quiet, and
artifacts and citations appear inline.

**Canvas.** This is Claude's artifact: the conversation on the left, the document on the right in an artifact panel.
The panel has a slim header (title, version, copy/download/share, close) and renders the document with reading
margins in the serif. Every way of opening a document opens this view.

**Editor.** There is one editor, `client/src/concept2cure/v2/editor/` (RULE 4). It is a quiet, centred writing
surface:
- the toolbar is minimal and the outline appears on demand;
- review, comments, versions, signatures, filing and export live in an inspector that slides in, not in permanent
  panels.

**A work area.** CMC, Biostatistics (opened from the project), Tasks, Vault, Submission Center, Communication,
Quality, RBM and Reporting share one page pattern:
- a header with the title, one line of description, one primary action and quiet secondary actions;
- content in the canonical list, table and card styles;
- guidance in AnA and in the composer's suggestions, not on the page.

**Details.**
- Buttons have radius 8 px, are 32–36 px tall and are ghost by default. Cards have radius 12 px and a hairline
  border, with no heavy shadows. Inputs have radius 8–10 px. Icons are 16–18 px with a thin stroke.
- Motion is 150–200 ms ease-out, with no bounce.
- An empty state is one sentence and one action.
- Numbers are formatted. Copy is calm and plain.

**Retired patterns.** Nobody adds these. Each package removes them from its own screens:
- uppercase coloured eyebrow labels ("CMC — MODULE 3 OPERATING SYSTEM", "PROJECT — COLLABORATION");
- "What to do now / NEXT STEP" guidance boxes, which move into AnA and the composer;
- "THIS WORK FLOWS INTO" destination chip rows;
- a large serif answer banner on every screen; at most one remains, where the answer is the screen;
- stat tiles and percentages as permanent chrome;
- ids, enum values, table or function names and snake_case on screen;
- "Coming later" roadmap text;
- per-document-type cards or screens, and a second editor or canvas (RULE 4).

**Zero capability loss.** This is not negotiable (`.claude/skills/claude-ui-design-principles.md`). Every metric,
workflow, verdict and action a removed element gave stays reachable: through the conversation, an inspector, a quiet
section or ⌘K. Each package files a ledger of every removed element and where it now lives.

## 3. The work packages

There is one ledger, `docs/design/one-design-plan.json`, and the gate reads it. A package's **status** decides
whether work may be committed under it:
- `open`: commits are accepted;
- `queued`: it waits for the packages it depends on;
- `closed`: it is done and accepts no more work;
- `parked`: the founder parked it.

| ID | Package | Depends on | Status |
|---|---|---|---|
| D0 | **Foundations.** The canonical page header, card, button set, segmented control, empty state, inspector, artifact panel and composer, built from the tokens. The retired classes are removed from the shared CSS. | — | open |
| D1 | **Shell, Home and the conversation.** The sidebar with Recents, the greeting and composer, the conversation thread, the top bar, ⌘K, the task tray and notifications. | — | open |
| D2 | **Projects.** The grid of cards, search, quiet filters, and the New project flow. | — | open |
| D3 | **The project page.** The main column and composer, Project knowledge, the quiet stages, documents, filing state and work-area doors. | — | open |
| D4 | **The canvas and the editor.** The artifact panel beside the conversation, and the quiet editor with the inspector. One editor. | — | open |
| D5 | **Work areas I.** CMC / Module 3 and Biostatistics on the one page pattern. | — | open |
| D6 | **Work areas II.** Tasks, Communication and Vault. | — | open |
| D7 | **Work areas III.** Submission Center, Quality, Risk-based monitoring, and Reporting & analytics. | — | open |
| R1 | **Reach.** Every server capability with no UI caller is reached in its package's screen, or retired by a founder decision. The inventory and each reach are filed under `docs/evidence/DESIGN/R1/`. | — | open |
| F1 | **Repairs.** Defects in shipped behaviour, such as the 2026-10-31 running-app audit findings. Repairs add no screen, mount or table. | — | open |
| L1 | **Launch rows** D1–D10 of `docs/LAUNCH_DEFINITION_OF_DONE.md`, as defined there. | — | open |
| DATA | **Demo data.** `scripts/demo/**`, `data/seeds/**` and their evidence. | — | open |
| PLAN | **This plan and its gate.** It changes only by founder decision. | — | open |
| S1 | **Project and goal.** The project states its goal: the application and the question it must answer. The data room, the protocol and AnA read it. | — | open |
| S2 | **Data room catalog and lineage.** Immutable capture, versions never overwritten, and lineage kept in perpetuity: the LX and PF fixes of `LINEAGE_END_TO_END_PLAN_2026-09-25.md`, and the catalog of `DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md`. | — | open |
| S3 | **Protocol to evidence.** Hypothesis, endpoints and estimands from the protocol. The engines compute biostatistics and safety from the catalog's data. | — | open |
| S4 | **AnA the writer.** AnA narrates evidence with citations, takes direction, and pushes back when the data do not support a claim. | — | open |
| S5 | **eCTD and filing.** eCTD 3.2.2 and 4.0 assembly, validation and dispatch. Module 1 for the US, EU, Japan, Canada and Australia. | — | open |
| S6 | **Vault, at Veeva parity.** The 2026-07 audit's gaps, closed on the existing Vault. | — | open |
| S7 | **CMC.** Module 3 composition and study-conduct data capture, as one work area. | — | open |
| S8 | **Risk-based monitoring.** It runs over the project's study data. | — | open |
| S9 | **Team, tasks, commitments and schedule** (P-81). The team on licensed seats. Each person's due work. Extract commitments. The project's goals and schedule, and progress against them. | — | open |
| S10 | **The agency's communications back into the project** (P-81). Each letter lands in the project, its questions go to Respond, and its commitments go to tasks. | — | open |
| S11 | **The program plan** (P-82). The project's pyramid gets per-project progress, owners and back-scheduled due dates. It joins the content plan, has its critical path, and appears in the Plan step. The portfolio and the global schedule. | — | open |
| S12 | **Work projects and their downstream deliverables** (P-83). CMC, biostatistics, RBM and the other work projects under the product program. Each deliverable is versioned with lineage and mapped to the downstream sections it feeds. A new version flags the sections that used the old one. | — | open |

Each spine package (S1–S8) starts with its "What already exists" section (RULE 3), built from §1a and extended by its
own searches, filed under `docs/evidence/SPINE/<ID>/`. Its UI work is done on the §2 design. When a screen is in a
queued design package's files, the S package changes only behaviour there, never the layout.

Each design package (D0–D7) runs its own work in this order:
1. **Spec.** Append `## <ID> spec` to `.design/claude-convergence/<ID>.md`. For each screen it says what the screen
   is today, Claude's pattern, the change (by file), the capabilities kept, and the acceptance checks.
2. **Build.**
3. **Evidence.** File before-and-after screenshots at 1440 px and 390 px of the running app, in light and dark, under
   `docs/evidence/DESIGN/<ID>/`, with the capability-kept ledger.
4. **Review.** The six-lens design review: design, accessibility (WCAG 2.2 AA), microcopy, motion, design system and
   honest state.
5. **Close.** The founder or the lead marks it `closed` in the ledger, under `Plan: PLAN`.

### 3a. Progress log (founder decision P-100, 2026-11-05)

Each session records what it delivered here, under its package, while the coordinator is unavailable. An entry is
facts only: commits by SHA, evidence by path, what was found, and what is next. It changes no package's scope,
status or ownership; closing a package stays §3 step 5.

#### R1 — Reach (session `session_01QoxbLdKp1MgbXvCfgSkkJr`)

**Delivered**

- **Inventory**, `df6d18838` and `73ff95ac3`, `docs/evidence/DESIGN/R1/2026-11-01-inventory/`.
  - **Method.** The server's own route table, traced at boot. Every route is matched against the client's API path
    literals (an exact pass and a base-constant pass), then given the production gate's own verdict
    (`launchScopeApiVerdict`).
  - **Size.** 3,923 handlers under `/api`. 1,230 are called by a screen (exact) and 510 probably are. 2,183 have no
    caller found by either pass.
  - **Served but not called: 341.** These are the reach candidates. S3 69, S5 29, S4 26, S10 8, others smaller;
    209 sit in files no package claims.
  - **Called but refused in production: 182.** 148 are out-of-scope and 34 unattributed. Most callers are locked
    screens; any that are launch screens are F1.
  - **No caller at all: 171 route files.** These are retirement candidates, for the founder to decide.
- **Reach: protocol review comments**, `cd7777ec6` and `d914c2618`,
  `docs/evidence/DESIGN/R1/2026-11-01-protocol-review-comments/`. The Reviews tab now leaves a comment and resolves
  one, through the existing governed routes:
  - `POST /api/protocol-reviews/documents/:id/comments`;
  - `PATCH /api/protocol-reviews/comments/:id/resolve`.

  It was used in the running app: a project created through New project, protocol CDI02 started, a comment left and
  resolved (201, 201), with no failed request. Three new tests fail without the change and pass with it.
- **F1 repair**, `059c0fa07`. The protocol view assembler copied every review comment onto every reviewer. With two
  reviewers each comment showed twice; with none, no comment showed. It now returns them once, as `reviewComments`.

- **F1 repair** (2026-11-05), `adae369de`. Amendments showed a status derived from their dates: under review read as
  submitted, and approved, rejected and implemented all read as "decided". The declared risk impact was never read,
  so "no impact" showed as "not declared". The assembler now reads both, and returns `nextStatuses` from the
  service's own transition table.
- **Reach: amendment changes and status** (2026-11-05), `606ebfd03`,
  `docs/evidence/DESIGN/R1/2026-11-05-protocol-amendments/`.
  - "Add a change" while the amendment is a draft, and "Change status" offering only the moves the server allows,
    through `POST …/amendments/:id/changes` and `PATCH …/amendments/:id/status`.
  - Used in the running app: Draft → Submitted → Under review → Approved, each 201.
- **F1 repair** (2026-11-05), `d3b5d7721`. Each CAPA action carried its deviation's id, so no action could be
  addressed and two actions collided. Each now has its own id. Deviations also carry `closeBlockers`, the server
  closure gate's own reasons. The register mappers moved to `pdev-view-registers.ts`, in the same folder (a split,
  not an addition).
- **Reach: CAPA and the signed deviation close** (2026-11-05), `0c8e8e45f`,
  `docs/evidence/DESIGN/R1/2026-11-05-protocol-deviations/`.
  - New on the deviation card: "Add a CAPA action", "Update status" on each action, and "Close deviation" through
    the platform's one signing ceremony. While the gate would refuse, the close is held and the gate's reasons are
    shown.
  - Used in the running app: the close was signed (201). Its `electronic_signatures` row records meaning approval,
    the reason and password authentication.
  - The first walk caught a request-shape error: the shared ceremony takes `password` at the top level. The unit
    test had encoded my assumption, and now asserts the ceremony's contract.
- **F1 repair** (2026-11-05), `72e36cb06`. The view assembler:
  - derived a milestone's status from its dates, so missed and cancelled read as pending;
  - ran a second urgency rule beside the timeline engine;
  - printed DATE columns as `Date.toString()`.

  It now reads the recorded status, uses `milestoneBucket` (and the second rule is deleted), and prints
  YYYY-MM-DD.
- **Reach: milestone status** (2026-11-05), `6bbd1bafe`, `docs/evidence/DESIGN/R1/2026-11-05-protocol-milestones/`.
  "Update status" on each milestone, with the engine's buckets and the recorded status. Used in the running app:
  First patient in recorded as Met (201).
- **Reach: the protocol's engine reads** (2026-11-05), `docs/evidence/DESIGN/R1/2026-11-05-protocol-engine-reads/`.
  - **Risk register:** the `summarizeRiskRegister` line; the screen's own "extreme" threshold is deleted.
  - **Deviation trends:** `trendDeviations` signals.
  - **EU substantiality:** per amendment, the engine's own sentence, never "non-substantial".

  All three were used in the running app. The trend read's shape was wrong in the first test, and the running app
  caught it.
- **Handed to D4** (2026-11-05). Informed consent exists twice: the `informed_consent` document type, and
  `/api/protocol-consent`, whose 7 routes have no caller. Its element checklist, completeness and signed approval
  are that document type's validation. Under Rule 4 they belong in the one editor, not a protocol panel. Whether
  the two records converge is the D4 owner's or the founder's decision.

**L1 (row D2): the founder's CSR demo** (2026-11-05 and 11-06)

- **Rehearsal**, `4c38889a4`, `docs/evidence/D2-CSR/2026-11-05-lmn201-demo-rehearsal/`.
  - The CSR path walked in the running app as author, reviewer and approver, on the Lumen LMN-201 demonstration pack.
  - It ran from the Vault source's signed approval to assembly's gap list.
  - Found R-1 to R-4 and handed them to the CSR lane (`011Dpx…`).
- **R-1 and R-3 closed** (2026-11-06), `78ce793a7`. The lane fixed them (`b3c176b34d`, `0180e0eec2`). The re-walk on
  trunk confirmed both and wrote nothing.
  - The run-of-show lost its two workarounds.
  - It gained a verified way to show §11.1 and §11.4 live without freezing.
- **Blocked**: drafting, the scientific review of drafted text, e-sign and placement. They need a model key, which
  this environment does not have.

**Finding shared with the design lead**

In production `LAUNCH_SCOPE_ENFORCE` defaults to on (`server/services/entitlements/launch-scope.ts:42-45`). So
screens outside the launch scope show "not in this release", and their APIs answer 403. Local runs in development do
not show this. The design lead now walks the demo with enforcement on.

**Earlier, before this plan (now D1's)**

`4a5cc0d22` (2026-10-31): Home leads with the greeting and the composer, and the sidebar gained Search and Recents.
The D1 spec was written on top of it, and D1 owns those files.

**Next**

S3's protocol records are reached:
- review comments;
- amendments: changes, status and substantiality;
- deviations: CAPA and the signed close, and trends;
- milestones;
- the risk summary.

Informed consent is with D4.

Correction to the line written here at first: S5's behaviour is held by RIM (`COORDINATION.md`). So R1's S5
reaches go to RIM as route, caller and test; they are not built here. S3's remaining candidates (the statistics
thread and the SAP's versions, comments and lock in `biostatPlatform.ts`) are a statistical analysis plan, which is a
document type. Under Rule 4 they are a convergence with the one editor, which is D4's or the founder's call, as
informed consent was.

#### F1 — Repairs, for spine step 2: the data room's lineage (session `session_01QoxbLcnW5jPvJSjjKQtvTA`)

**Delivered** (2026-11-05)

- **The founder-path walk is green again**, `e0e32d099`. LX-00 (`tests/lineage/founder-path-lineage.pglite.test.ts`)
  had been red on trunk since 2026-11-01, failing 6 of its 15 cases. Two product changes of that day were right, and
  the walk had not followed them:
  - `3cacf2e15`: a Shadow Review covers only the leaves it read, so the walk's database needed
    `20261025_shadow_review_run_coverage.sql`, and its seeded run needed to name its leaves;
  - `a58029e99`: archiving needs a reason. The walk now states one, and checks the audit row records it.

  It is 15 of 15 after the change. No baseline entry changed.
- **A Data Room upload's bytes survive a deploy and are read from every API task**, `fbc2a1773` (LX-02, the bytes
  half), `docs/evidence/SPINE/S2/2026-11-05-capture-bytes-durable/`.
  - **Before.** Every upload lived only on the serving Fargate task's own disk (`STORAGE_PROVIDER=s3`, up to two
    tasks, no volume). So the other task could not read it, and each deploy erased it.
  - **Now.** The bytes go to the byte store first. The store and object are recorded in
    `file_uploads.storage_provider` and `storage_object_id` (`migrations/20261105_file_uploads_durable_object.sql`),
    and `loadUploadedFile` reads them, for its 30 callers.
  - **Kept.** `storage_path` stays the tenancy key, and the working copy stays for the path-based tools.
  - **Evidence.** Red without the fix and green with it. The walk's baseline went from 13 to 12, and its ceiling
    from 15 to 12.

- **The migration set completes on a non-superuser applier**, `a3d874ae5`,
  `docs/evidence/D1/2026-11-05-schema-create-grants/`.
  - **Before.** `review_route_writer` (`20261023_review_routes.sql`) and `tenant_record_purger`
    (`20261029k_tenant_offboarding_custody.sql`) own SECURITY DEFINER functions but were granted only `USAGE` on
    public. Changing a function's owner needs `CREATE` there. On PostgreSQL 15+ applied as the RDS master (not a
    superuser), every deploy halted at 432, then 454, of 462.
  - **Now.** Each is amended in place (RULE 1), as its three sibling owner roles already were. The set applies 462
    of 462 and replays clean.
- **The Data Room says a refusal as itself**, `b61a8b345`, `docs/evidence/SPINE/S2/2026-11-05-data-room-refusals/`.
  - Not licensed, not in this release, a role, an unconfirmed organization, a project not found and an expired
    session each read as themselves, with no retry, through the one read classifier, as the Vault's read does.
    Only a failure to answer keeps the retry.
  - Used in the running app at 1440 and 390 wide, with the gate's own 403 bodies. The upload change was used there
    too: an adopt after the server's working copy was deleted succeeds from the durable copy, and an upload written
    the old way answers 410.

- **The walk follows the sent package where it is kept**, `131aa7d0c`,
  `docs/evidence/SPINE/S2/2026-11-05-walk-follows-sent-package/`. LX-12's bytes half was fixed on 2026-10-29
  (`3cab286e12`, the kept copy in the byte store, named by `metadata.sentPackage`). The walk still read the staging
  file the send removes by design, so it stayed red. The check now follows the recorded key. It fails on a missing
  package and passes as written. The baseline went from 12 to 11.

**Delivered** (2026-11-06)

- **The local database the repository provisions can run the migration set**, `70d52cc76`,
  `docs/evidence/D1/2026-11-06-local-db-applier-rights/`.
  - **Before.** `scripts/setup-local-db.sh` (run at every session start) gave its applier role `CREATEDB` only. On
    a fresh cluster, `deploy-migrate` stopped at 214 of 462.
  - **Now.** The role gets `CREATEROLE NOSUPERUSER` and owns its database, as the RDS master does. Two fresh
    clusters: trunk's script halts at 214, the fixed one completes (1,023 tables). Every session that must open the
    running app (RULE 4) needs this.
- **The editor's citation catalogue says a refusal as itself**, `f0809d977`,
  `docs/evidence/SPINE/S2/2026-11-06-citation-catalogue-refusals/`. The **Cite a source** picker showed "Module access
  denied" with **Try again** for a plan without the feature. Through the one read classifier, a refusal is now
  worded and not retryable, and the picker offers no retry for it. This completes the D4 hand-off of 2026-11-05.
  All 36 suites that render the editor pass (511).

**Found**

- A fresh machine also needs `postgresql-16-pgvector` and `npm ci` before the session-start hook runs. That is a
  cloud-environment setup script, not a repository change. A personal environment that does this was proposed on
  2026-11-06. The request could not be shown in the Claude mobile app version in use, so nothing was saved.
- `ci:canvas-path` read green all four days the walk was red. Its founder-walk link is static by design; the walk's
  result exists only in CI's Test job. That job can be red for days while every push lands.
- `server/routes/__tests__/authoringSelectedSources.pglite.test.ts` fails 12 cases at trunk, before this change.
- `ctd_onboarding_documents` (`server/routes/ctd-onboarding.ts`, read by `readLocalUploadBuffer`) keeps its bytes on
  local disk, the same class of defect.
- ~~A path-based AnA tool on the other task finds no working copy of an upload.~~ Corrected 2026-11-05: no prompt,
  context builder or tool result gives the model an upload's path (searched `server/services/ana`,
  `server/routes/ana-ri`, the context builders). The only stream read of an upload goes through `loadUploadedFile`,
  which is durable now. The tools' refusal already steers uploads to the file-id tools. Nothing to repair.
- Bytes already erased in production cannot be backfilled. Rows written before this change read as before.
- **LX-06 is half-built under another name.** `draft_authoring_document` takes `sourceReferences` (Vault-document
  receipts). They are verified inside the save transaction and recorded in `provenance.projectSourceReferences`
  with figure and claim checks (`server/services/authoring/authoring-from-draft.ts`). They are not recorded as
  sentence-level spans. The walk passes a differently shaped `sources[]`, so its two `ana-draft` notes are stale.
  Recording spans, and walking the Data Room → Vault → receipt → document path, is S4's work with S2.
- **Handed on.**
  - D3: the Evidence step's "What to do now" box is a retired pattern.
  - ~~D4: `editor/useProjectSourceCatalog.ts` does not classify refusals.~~ Done here 2026-11-06 (`f0809d977`).
  - D0: a refusal is drawn in the error tone.
  - R1: the CTD onboarding routes (`/api/ctd/*`) have no caller.
- **The local database.** Running the migration set needs pgvector created by a superuser, `CREATEROLE` on the
  applier, and the applier owning the database, as the RDS master does. `scripts/setup-local-db.sh` does not yet
  set these up.

**Next**

Two items listed here earlier were already done, as found on 2026-11-05: a failed Data Room record refuses with
503, and the client keeps `sourceId`. What remains, file list first:
1. LX-06's span half, with S4: verified receipts recorded as sentence-level spans, and the walk following the
   Data Room → Vault → receipt → document path;
2. LX-12's other half, with RIM, which holds the submission service: a transmittal names its sequence (no
   `sequence_id` on `submission_transmittals`);
3. LX-10's seal half, for the lane working on Authoring's filing path. `633822c083` records each filed section's
   revision. Nothing on the Vault side yet names the seal: neither the Vault row nor its chained audit row carries
   `frozen_documents.content_hash`. That gap is the walk's `file-to-vault/filing-names-sealed-version` and
   `walk-back/vault-leaf-to-seal`.

#### F1 — Repairs: the unverified repair commits, run natively (session `session_01QoxbLb8fV1RgQvaa8JHYku`)

**Delivered** (2026-11-05)

- **The repairs written without dependencies were run for real.** About 45 F1 and CSR commits (2026-11-02 to 11-04,
  author `concept2cure`) were made with no `node_modules` and no network. Their evidence called their tests "pending".
  - **Run.** `npm ci`, then Vitest over the 29 test files they added or changed.
  - **Result.** 555 of 560 at `ccc797bd`.
  - **Passed natively:** the shared-platform repairs, namely the export render snapshot, workspace config and its
    isolation, regional applicability, the submission resolver, navigation entitlements and AnA's context cache;
    and the CSR server checks.
  - **Typecheck.** `typecheck-no-regression`: 0 errors.
  - **Evidence.** `docs/evidence/F1/2026-11-05-unverified-repairs-run-natively/`.
- **The CSR screen's tests**, `7048ea80`. Five were out of date with the screen, not wrong about it: Approve now needs
  the saved text read first (F9); the editor mounts other reads; the board read carries an AbortSignal. The CSR lane
  fixed the same suites on trunk the same day (`9eb24c87`), and its version was kept at the merge.
- **Every launch app is reachable by name**, `57eef8e8`.
  - **Risk-based monitoring.** It is in the catalog and the rail (P-76) but had no navigation target, so AnA's
    navigate, the @ menu and the product tour could not open it. It gets one, for the existing `rbm` surface. The
    tour now stops at it and at Biostatistics.
  - **The calculators' label.** "Biostat workbench" broke the client-copy rule; it reads "Design calculators", as
    the page's own heading does. The old name stays an alias.
  - **The account-menu tests.** Their mocked user had no id, so since `0fc881c1` they never read the navigation
    verdicts.
- **Project home's CSS gates**, `3b04e2e3`.
  - `--danger-000` does not exist, so a failed quality count rendered grey. It is `--error` now, and the phantom-token
    baseline shrinks from 9 to 8.
  - The generated text ramp was stale and is regenerated.
  - One shared action row is no longer counted as a stage-CSS clash.
- **Two more test files red on trunk**, `c0476109`: capabilityBrowser (the same id-less mock user), and
  clientCopyNoProgram ("the program's" study designs, now "the project's").
- Pushed through every pre-push gate (`ca751574..80914b5b`).

**Found**

- `0fc881c1` made the navigation read require a signed-in account with an id. Any test that mocks `useAuth` with an
  id-less user and expects the verdicts is red for that reason, not for a product defect. Two files were found and
  fixed; others may exist.
- The whole v2 client and shared suite (1,253 files) does not finish in 50 minutes with `maxWorkers: 1`. Running it
  in parallel shards beside the pre-push typecheck runs the container out of memory.

**Delivered, second round** (2026-11-05)

- **The whole v2 client and shared suite, run natively**: 1,253 files, 14,017 tests, in three shards. 185 tests failed
  in 31 files. All 31 are resolved on trunk:
  - **8 files**, `721aaf8c`: they mocked a signed-in user with no id (the same cause found above);
  - **16 files**, `968759fd`: they pinned a live read as `('GET', path)`, but it now carries its abort signal. Four
    were also fixed by the parallel sweep (`011Dpx…`) and taken from it at the merge;
  - **3 files**, `8c178e79`: each was out of date with a deliberate change. The template read's signal; the claims
    line derived from the current read; approved-only CSR import (`940098aa`);
  - **2 files**, `24dff50f`: the Apps switch fails closed without a catalog; De Novo is its own pathway;
  - **1 file**, `authoringConversationScopeLive`, fixed by the parallel sweep (`565377a1`);
  - **1 file**, `moduleCatalogReconciliation`, a product defect, `5c2a80f2`. The catalog still seeded
    `agency-meetings` after its surface retired (P-39 step 4), so it advertised a toggle for a screen nobody can
    open, and listed Communication twice. The creating migrations were amended in place (RULE 1). The row and its
    subscriptions are kept and deprecated, and a live grant carries to `communication-center`
    (`folded-module-successors.ts`). This is proven on the PGlite replay (`folded-module-grant-continuity`).
- **`ci:launch-scope` was red in CI** ("expected 8 launch apps, parsed 9"). Biostatistics joined by P-77, so the pin
  reads nine, `5c2a80f2`.
- **Reach and copy.** The Vault's "Ask AnA" row is a named group (`94bc12da`), red before and green after. The launch
  screens' registry notes say what each screen does, not "partially built" or "see ui_kits/" (`7a1d1a45`); every
  launch surface is now held to that.
- **Found to be already done**, with no change needed: AnA's `create_labeling_document` project admission (it is
  pinned by `device-tools-admit-program.test.ts`); `advise_device_readiness` carrying `filedCopyDiverged`; the empty
  state's grey box.

**Found, second round**

- The CSR workflow board (not a launch surface) offers a preview on a draft row. The server refuses it as "approvals
  changed", because the row is approved-only since `940098aa`. Handed to the CSR lane in COORDINATION.md.
- Two sessions swept the same suites at once. The hold in COORDINATION.md stopped it for the last six files.

**Next**

1. The server suites, run natively the same way. This run covered the v2 client and shared suites only.
2. The export repair's open acceptance (`docs/evidence/D2-DOCUMENTS/2026-11-04-render-snapshot/`): real Word and
   PDF output, HTTP refusal mapping and a browser walk.

#### S6 — Vault at Veeva parity, with its F1 repairs (session `session_01KnUGoX3g4R4FWKWGc2sTbN`)

The coordinating session is out of tokens. This session works on with the founder's permission of 2026-11-05 ("proceed
with founder permission but note this in the roadmap and your work") and records its work here under P-100. Its holds
are in `.design/claude-convergence/COORDINATION.md`, in the row "Vault parity (`01KnUG…`)". Since the founder's "use
multiple sub agents", slices are built by agents this session briefs, reviews, re-tests and commits; each evidence
README says which checks the lead ran.

**Delivered** (2026-11-05). Each item was shown red first, then green, on real PostgreSQL where the server changed and
in the running app where a screen changed. Where either was not possible, its README says so.

- **The Vault tells its refusals apart** (S6, `3c84ddc6ac`; `docs/evidence/SPINE/S6/2026-11-05-v1-refusals/`). Not
  licensed, not in this release, the person's role, and not found are each said as themselves, through the one read
  classifier (`readFailureFor`). Only a real failure offers a retry. Before, a plan without the Vault read "You don't
  have access … ask an administrator".
- **A CRO's sponsors never mix in the library** (F1, `7d7e2e3b50`; `…/2026-11-05-v2-sponsors/`). Inside a project,
  "All my projects" is that project's sponsor's projects. The sponsor is read from the project's verified anchor,
  never from the request. Every hit names its sponsor, and the relationship finder stays inside the sponsor.
- **No relationship across sponsors** (S6, `64f33aa859`; `…/2026-11-05-v3-relationship-sponsor/`). The server refuses
  one (409 `OTHER_CLIENT`). One recorded before that is now named in its row as another client's, and can be removed
  (S6 V8, `4b9012b842`; `…/2026-11-05-v8-legacy-relationship-sponsor/`).
- **The organisation's governed artifacts stay inside the open project's sponsor** (F1, `1e83af2c96`;
  `…/2026-11-05-v4-artifact-sponsors/`), and name it.
- **AnA reads only what the person can open** (F1, `ae14ab27b0`; `docs/evidence/F1/2026-11-05-ana-vault-tools-scope/`).
  `read_vault_document`, `list_vault_documents`, `compare_vault_versions`, `get_document_versions`,
  `list_governed_documents`, `read_governed_document` and `global_search` filtered by organisation alone. They now read
  the projects the sharing policy admits the person to and, inside a project, that project's sponsor's, by the Vault's
  own narrowing (`narrowToSponsorOf`, moved into the registry read so there is one copy). An id outside reads as a
  missing id, and a check that cannot run is an error, never an empty list.
- **The project's settings select the Vault's words and proposals.**
  - The header names a 510(k), De Novo, EU MDR or IVDR filing through the portfolio's one alias map (F1, `828626a217`;
    `…/2026-11-05-v6-filing-region/`, part A). The seeded 510(k) read "IVD / Diagnostics".
  - Module 1 proposals follow the project's region (S6 V6, `40af70d8b6`; same folder, part B). An EU or JP project is
    given its own heading from the regional Module 1 record, or none and marked for review, never a US heading. US
    proposals are unchanged.
  - A device or diagnostic filing's Required documents names the filing and points to its outline in the Library,
    with no count, and says why (S6 V7 `8e96c86ed2`, F1 `c0c53d40a4`; `…/2026-11-05-v7-device-coverage/`). It said the
    filing had no required-section list.
- **A device project's Vault offers its own vocabulary** at upload and in the filters: its own evidence kinds, and no
  CTD section for a filing that is not CTD-numbered (S6 V9, `c2d6a9774c`; `…/2026-11-05-v9-device-vocabulary/`).
- **A seal shows what it holds** (S6 V5, `4c00273d06`; `…/2026-11-05-v5-seal-binder/`): each sealed version, read from
  the signed record only, opened through the Vault's audited download. This is D6 §8's "binders as a view".
- **AnA writes only where the person may change the project** (F1, `99666f51b8`;
  `docs/evidence/F1/2026-11-05-ana-vault-write-assemble-scope/`). `update_vault_document` wrote a new version of any
  artifact of the organization. It now writes only within the person's scope (inside a project, its sponsor's), and
  only with the project's edit right, asked on the write's own connection as the Vault's writes ask it.
  `assemble_ectd_module_from_artifacts` read the artifacts of any project the model named; it is held to the same
  scope. The shared SQL fragments of the reads were written out, so SQL text carries no interpolation (F1,
  `67e6d2da94`).
- **The Data Room's filing proposal reads the project's region,** as the Vault's ingest does (F1, `0f583e995b`;
  `docs/evidence/F1/2026-11-05-data-room-region/`). So do the CTD filename detector's Module 1 documents: an EMA
  project's cover letter is proposed at 1.0 and its RMP at 1.8.2, a J-NDA's patent status at 1.4, and an FDA form
  number never another region's heading (F1, `303485d77d`; `docs/evidence/F1/2026-11-05-ctd-detector-region/`).
- **Trunk red fixed:** `catalog-actor-scope-wrapper.test.ts` (7 of 11) had a stale mock (S6, `81fbd0702b`;
  `…/2026-11-05-catalog-actor-scope-mock/`).

**Found**

- **A pharma "Risk management plan" is left unfiled.** The device risk-file rule claims the name first and has no
  pharma folder; "RMP" reaches the CTD detector. An ISO 14971 plan and a Module 1 RMP share the name, so which rule
  claims it is a classifier decision, not a one-line fix.
- **The Vault cannot place a document at an eSTAR section** (`filingVocabularyRefusal` accepts CTD codes only), so a
  device filing's outline has no count. This is the MDX journey's lane.
- **Founder questions:**
  - Should the cross-sponsor view with no project open, which today is labelled by sponsor, exist at all for a CRO?
  - Should device coverage follow the rule pack's mandatory flags or the eSTAR mapper's per-device slots? They
    disagree on D4 and D6.
  - Should a seal say when a sealed version has since been superseded? Today it says only what was sealed and whether
    that is intact.
  - Renditions, editable binders and per-client-type retention stay founder decisions (MR-08 Stage 6 step 4,
    `VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, FD3).

**Next**

1. Answers to the founder questions above, which decide this lane's next slices.

## 4. How everyone works

1. **Every commit names its package.** The last paragraph of the message carries the trailer `Plan: <ID>`, for
   example `Plan: D3`. The pre-push gate (`npm run ci:one-design-plan`) refuses a commit with no trailer, with an
   unknown package, or naming a package that is not `open`.
2. **A commit stays inside its package.** Every file it changes must match the package's `paths` in the ledger.
   Tests, `docs/evidence/**` and `.design/**` are always allowed.
3. **Nothing new without the plan.** These must be listed under `approvedAdditions` in the ledger, naming the
   package, before the gate accepts them:
   - a new screen: a `UI_SURFACES` id or a `SURFACE_VIEWS` entry;
   - a new API mount: a `/api/…` path registered in `server/bootstrap/`;
   - a new table: a `CREATE TABLE` in a new migration for a name no existing migration creates.
4. **The plan changes only by founder decision.** A change to this file, the ledger, the gate or the rule text in
   `CLAUDE.md`, `AGENTS.md` or the Copilot instructions carries `Plan: PLAN` and `Founder-Decision: P-<n>`. The
   decision is recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`. No session amends the plan to make room for its own
   work.
5. **There is no bypass.** No environment variable or flag skips the gate. A commit the gate refuses is reworded or
   split. If the plan really is wrong, ask the founder.
6. **Scope, not branches.** Parallel sessions split work by package and file set (RULE 0). They never put two
   sessions on the same file at once.

## 5. RULE 6 — nothing new; finish what exists (founder decision P-80, 2026-11-01)

**The design packages open now.** D1–D7 stop waiting on D0, by the same decision ("Get to it"). Each builds on §2,
and uses D0's components where they have landed. The founder's complaint is the UI, and a parallel session was
already giving Project home Claude's shape (`eab6799360`). Two sessions still never work on the same file at once
(§4.6).

> The founder: "No agent is allowed to build anything new. However, they're allowed to continue and finish and
> conclude with brilliant working UI everything that's in place."

**The vision it serves.** Veeva, Weave Bio, Artos and Certara, merged into one and built by Anthropic as Claude for
life sciences, without ever breaking from Claude's UI. The code for each already exists in this repository:

| Named | What it brings | Where it already is |
|---|---|---|
| Veeva | Regulated content, submissions and quality | Vault (S6), Submission Center (S5), Quality |
| Weave Bio | AI-native IND and submission authoring | AnA (S4) and the one editor (D4) |
| Artos | Drafting from the study's own data | The data room (S2), through the evidence (S3), to AnA (S4) |
| Certara | Biostatistics, modelling, data standards, regulatory writing | The evidence engines and CDISC conformance (S3), AnA (S4) |

**How the gate holds it** (`npm run ci:one-design-plan`, from the ledger's `completesRequired`):
1. Every commit carries `Completes: <path>`, naming a file or folder that existed before it. `Plan: PLAN` commits
   are exempt.
2. A new route file, a new service (folder, or a file directly under `server/services/` or `services/`) and a new
   AnA tool are refused unless `approvedAdditions` lists them. So are a screen, a mount and a table.
3. Splitting a large file is not new. The new file goes inside the folder it came from, and the commit names that
   folder in `Completes:`.

**Before the first line of any work.** Search first (RULE 3) and write "What already exists". The work is then
named as what it is: complete, reach, fix or converge.
