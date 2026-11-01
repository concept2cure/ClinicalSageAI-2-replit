# The program: how a major filing is run, and how a Concept2Cure project becomes that

**Founder decision P-82, 2026-11-01.** It binds as part of the one plan (`docs/design/ONE_DESIGN_PLAN.md` §1c, package
S11), and under RULE 6 (nothing new; finish what exists).

> The founder: "Study what a professional project manager or program manager would do if assigned the build of a
> major regulatory filing for a phase three successful study after billions of dollars. How would they define that?
> How would they design the project? How would they assign tasks to what niche industry specialists in a human
> world? And what do those all do? How is the project broken into miniature projects based off of area of
> assignment: pharmacovigilance, safety, efficacy, clinical, data management, SAP, biostatistics, chemical
> manufacturing control, all of module 3, all of module 1, all of module 2, 3, 4, 5, the full IND pyramid. How are
> those projects managed? We need to be that. A global project perspective, and have that available."
>
> And: "The study objective is always in, starts with the study protocol, but it's always in all the publicly
> available information relative to the study … all that needs to be cataloged and categorized inside the project.
> Anna should be able to search the history through the web in public domains … as well as get that information
> from customers via uploading … She already does. The user interface is really the last mile."

How this was written: from regulatory program-management practice and the ICH M4 Common Technical Document
structure. Durations are typical ranges, not commitments. Each one varies by product, agency and designation.

---

## 1. The situation a program manager is handed

A pivotal phase 3 study has read out positively. The sponsor now files a marketing application in the United
States, Europe, Japan, Canada and Australia. The filing:
- is typically hundreds of documents;
- is built by a dozen or more specialist functions;
- runs on a schedule measured backwards from a target submission date.

Its scale and cost are such that a missed dependency is measured in months of market time. The program manager
does not write the dossier. They make sure every piece of it exists, is right, is on time and fits the rest.

## 2. Defining it: the program charter

Before any document is written, the program manager and the global regulatory lead agree a charter:

1. **The objective and the target label.** What the product is to be approved for: the indication, the population,
   the dosing and the claims. This is often a target product profile and a draft label. It comes from the protocol's
   primary and secondary objectives and the results. The sponsor has usually already said it publicly, in its trial
   registrations (ClinicalTrials.gov, the EU CTR), its press releases and its publications.
2. **Pathway and designations, by region.** Examples:
   - **US:** an NDA under 505(b)(1) or (b)(2), or a BLA under 351(a), and whether priority review, breakthrough,
     fast track (rolling submission) or accelerated approval apply;
   - **Europe:** the centralised MAA, with accelerated assessment or a conditional authorisation;
   - **Japan:** a J-NDA with PMDA;
   - **Canada:** a New Drug Submission;
   - **Australia:** registration with the TGA.

   Collaborative routes such as Project Orbis and the Access Consortium change the regional order.
3. **Target dates and their order.** Which region files first, and how far behind the others follow.
4. **The agency interactions that gate the filing.** For example:
   - the US pre-NDA or pre-BLA meeting;
   - the EMA pre-submission interaction and rapporteur appointment;
   - PMDA pre-application consultations.

   Their outcomes become agreements and commitments the dossier must honour.
5. **Scope.** Which studies are pivotal and which supportive. Whether there is an integrated summary of safety (ISS)
   and of efficacy (ISE). Pediatric obligations (the US iPSP, the EU PIP compliance check). Whether a REMS or an EU
   risk management plan is needed.
6. **Success criteria, constraints and governance.** The budget and resources. Who decides what. When a decision
   escalates.

## 3. Designing it

### 3.1 The work breakdown: the CTD's modules, crossed with the functions that write them

| Module | What it holds | Written mainly by |
|---|---|---|
| **1 — Regional** | Forms (FDA 356h), cover letter, user fee, patent and exclusivity, financial disclosure, debarment, labeling (prescribing information, medication guide, carton and container), REMS, pediatric, environmental assessment, meeting minutes. In the EU, Japan, Canada and Australia, each region's own Module 1 (the EU's SmPC, package leaflet and RMP among them). | Regulatory affairs, with the regional leads and labeling |
| **2 — Summaries** | 2.3 Quality overall summary. 2.4 and 2.6 nonclinical overview and summaries. 2.5 Clinical overview. 2.7.1–2.7.6: biopharmaceutics, clinical pharmacology, efficacy, safety, references and synopses. | Medical writing, with CMC, nonclinical, clinical pharmacology, clinical and safety |
| **3 — Quality (CMC)** | 3.2.S drug substance, 3.2.P drug product, 3.2.A appendices, 3.2.R regional. Stability, validation and facilities, which must be ready for pre-approval inspection. | CMC regulatory with the manufacturing, analytical and stability teams |
| **4 — Nonclinical reports** | Pharmacology, pharmacokinetics and toxicology study reports. | Nonclinical / toxicology |
| **5 — Clinical reports** | Tabular listing. Each study's clinical study report and its appendices. The ISS and ISE. The study datasets (SDTM, ADaM, define.xml, reviewer's guides). Site-level data for inspections. Literature. | Clinical, medical writing, biostatistics, programming, data management, safety |

### 3.2 The miniature projects: workstreams

The program manager runs the filing as a set of workstreams. Each has:
- a lead;
- a scope: its documents, analyses and decisions;
- its own schedule inside the integrated one;
- a status;
- its risks.

| Workstream | What it does |
|---|---|
| **Regulatory strategy and Module 1** | Owns the pathway, the agency interactions, the regional Module 1s, the forms and the cover letters. Leads the review cycle once filed. |
| **Clinical and medical writing** | Writes the clinical study reports, the clinical overview (2.5), the efficacy and safety summaries (2.7.3, 2.7.4) and the patient narratives. Owns the story the data tell. |
| **Biostatistics and statistical programming** | Owns the SAP, the tables, listings and figures, and the integrated analyses for the ISS and ISE. Produces the analysis datasets and their define.xml. Every number in the dossier comes from here. |
| **Data management** | Locks the database. Codes events and medications (MedDRA, WHODrug). Reconciles safety data. Delivers SDTM. |
| **Safety and pharmacovigilance** | Integrates safety across studies. Writes or reviews the SAE narratives. Owns the risk management plan or REMS, and the post-approval safety reporting plan. |
| **Clinical pharmacology** | Writes 2.7.1 and 2.7.2: pharmacokinetics, PK/PD, population PK, exposure–response. Supports dose justification and labeling. |
| **Nonclinical** | Writes Module 4 and the 2.4 and 2.6 summaries. |
| **CMC** | Writes Module 3 and the 2.3 quality summary. Owns stability data cut-offs and inspection readiness for the facilities. |
| **Labeling** | Writes the prescribing information and the SmPC from the company core data sheet. Negotiates the label in review. |
| **Publishing and submission operations** | Builds the eCTD: granularity, hyperlinks, bookmarks, validation, the gateway. Owns the sequence and its lifecycle. |
| **Quality and inspection readiness** | Audits sites and vendors. Checks the trial master file is complete. Prepares for inspections. |

### 3.3 The integrated schedule and its critical path

The schedule is built backwards from the target submission date.

**The clinical chain** is usually the critical path, and every link waits on the one before:
1. last patient, last visit;
2. database lock;
3. top-line results;
4. final tables, listings and figures;
5. the clinical study reports;
6. the integrated summaries;
7. Module 2.7, then 2.5;
8. labeling;
9. dossier quality control;
10. publishing and validation;
11. submission.

**CMC runs beside it**, and can become critical. Its stability data cut-off, process validation and facility
readiness have their own long lead times.

**Gates:**
- the dossier freeze;
- the submission readiness review;
- the go / no-go decision.

### 3.4 Who does what: roles and RACI

| Role | Accountable for |
|---|---|
| Program / project manager | The integrated schedule, the logs, the cadence and the status. The one view of the whole. |
| Global regulatory lead | The strategy, the agency interactions, and the decision to file. |
| Regional regulatory leads | Their region's Module 1, procedure and questions. |
| Medical writing lead | The clinical documents and summaries, their consistency, and their review rounds. |
| Clinical lead (physician) | The medical interpretation of efficacy and safety. |
| Biostatistics lead | The analyses, their correctness and the SAP. |
| Statistical programming lead | The datasets and outputs, and their traceability. |
| Data management lead | Lock, coding, reconciliation and SDTM. |
| Safety physician / PV lead | Integrated safety, narratives, and the RMP or REMS. |
| Clinical pharmacology lead | PK, PK/PD and dose. |
| Nonclinical lead | Module 4 and its summaries. |
| CMC regulatory lead | Module 3, its summary, and inspection readiness. |
| Labeling lead | The label and its negotiation. |
| Publishing lead | The eCTD build, validation and dispatch. |
| QA lead | Audits and inspection readiness. |

Each deliverable has a RACI: who is Responsible, who is Accountable, who is Consulted and who is Informed.

### 3.5 The content plan: every document, tracked

The content plan is the dossier's table of contents with management fields. For each document (leaf) it records:
- its CTD placement and the regions it is reused in;
- its owner, author, reviewers and approver;
- what it depends on (an ISS waits on the integrated datasets);
- its due date, status and version;
- its review rounds and its QC, which checks every number against its source;
- its sign-off.

## 4. Managing it

- **Cadence.**
  - A weekly core team meeting, run from the integrated schedule.
  - Workstream stand-ups.
  - A governance review at each gate.
- **Status.** Each workstream reports red, amber or green against its milestones, and the program shows the whole.
  Document status rolls up by module.
- **Logs.**
  - Risks, each with an owner and a mitigation.
  - Issues.
  - Decisions: who decided what, and why.
  - Actions, each with an owner and a date.
- **Change control.** A change to scope, data or a document already approved goes through change control, and the
  schedule shows its knock-on effects.
- **Capacity.** Each role's load across the program, and across the portfolio when people serve several filings.
- **After filing: the review cycle.** The agency's letters become the work.
  - In the US: the filing communication around day 60–74, then information requests with response deadlines,
    mid-cycle and late-cycle meetings, an advisory committee if needed, labeling negotiation, and agreed
    post-marketing requirements and commitments.
  - In the EU: the day 120 list of questions and the clock stop, then the day 180 list of outstanding issues, then
    the CHMP opinion.
  - Japan, Canada and Australia have their own cycles.

  Each question needs an owner and a dated response. Each commitment becomes tracked work, often for years.

## 5. The global project perspective

- **One dossier, many markets.** One core dossier (Modules 2–5) is written once and placed into each market's
  sequence with that market's own Module 1. That is how `docs/design/FILING_SPINE.md` already models markets.
- **One global schedule.** It shows each region's filing date and review clock side by side.
- **A portfolio view across projects.** For the head of regulatory: every program's next milestone, its status, and
  the people it depends on.

## 6. What already exists in Concept2Cure (RULE 3)

Read at HEAD on 2026-11-01. "Not reached" means the server has it and no v2 screen calls it.

| The program manager's tool | What exists, by path | What it does not do yet |
|---|---|---|
| The charter | `project_charters` (`migrations/0012_project_charter_timeline.sql`: submission type, region, strategy, critical success factors, timeline phases and commitments with Part 11 signing). `server/routes/charters.ts`, `shared/schema/project-charter.ts`. | Not reached from the project page. |
| The objective | `ana_client_objectives` and its API (`server/routes/client-intelligence.ts`). The public sources: AnA's `web_search` (`server/services/ana/AnaToolDefinitions.ts`), deep research, the public CSR reference library (`server/data/public-csr-reference/`), and the data room's uploads. | It is not keyed to the v2 project, and the read has no project admission (S1). It records no source for the objective. |
| The work breakdown | `services/regulatory/SubmissionPyramidEngine.ts` and `services/regulatory/pyramids/`. One pyramid per application type: IND (and its amendments, annual report and safety supplement), NDA, BLA, MAA, J-NDA, PMA, 510(k), De Novo. Each has phases, tasks with a `role`, estimated hours, dependencies, `criticalPathIds`, CTD `documentBindings`, sub-tasks, risks, guidance and typical timing. Exposed at `/api/v1/pyramids` (`server/routes/pyramid.routes.ts`) and shown by `surfaces/Pyramid.tsx`. | Progress is kept per organisation and application type, not per project. So two NDAs share one board. Not in the launch catalog, and not on the project page. |
| The schedule | Pyramid task timing (`TaskTimeline`). `regulatory_programs.target_submission_date`. `server/services/ind-lifecycle/ind-timeline-service.ts`. `server/routes/protocol-milestones.ts`. Agency review clocks: `server/services/market-specs/regulatory-timelines.ts`. | Nothing schedules the project's tasks backwards from its target date or draws its critical path. |
| Roles and the team | Pyramid `role`, `ResourceAllocation`, `RoleCapacity`. `surfaces/ProjectTeamResponsibilities.tsx` (project lead and owner). Seats: `server/services/seat-licensing.ts`. Sharing: `server/routes/c2c/project-sharing.ts`. | Workstream leads and a RACI per deliverable are not recorded. |
| Tasks | `server/services/tasking/`, `server/routes/c2c/tasks.ts`, `surfaces/TaskBoard.tsx`, `TaskAssignmentControls.tsx`. | A pyramid task is not a person's task with a due date. |
| The content plan | Pyramid `documentBindings` (CTD sections). The project's documents in the one editor. Submission Center's builder lists every sequence's leaves (`surfaces/SubmissionSeqWorkspaces.tsx`). `surfaces/ProjectSectionTracking.tsx`. | The three are not one list with owner, due and status per leaf. |
| Risks | Pyramid `TaskRisk`. Study risks: `server/routes/protocol-risks.ts`. Risk-based monitoring (S8). | No program risk log on the project. |
| Miniature projects | The project hierarchy: `server/routes/project-hierarchy.ts`, `projects.parent_project_id`, `depth`, `path`. | Not reached. |
| The portfolio | Projects. `server/services/c2c/project-portfolio.ts`. `server/services/ind-lifecycle/ind-portfolio.ts`. Reporting & analytics. | No milestone or status across projects. |
| The review cycle | Communication, Respond, the agency inbox and commitments (S9, S10). | See S9 and S10. |

## 7. The decision: the project is the program

1. **Writing workstreams are sections of the filing project. Work projects are projects of their own** (amended by
   P-83, §7a).
   - The workstreams that write the dossier stay views inside the filing project: Module 1, the Module 2 summaries,
     the clinical documents of Module 5, labeling and publishing. Each has its lead, tasks, documents and status.
   - The work that is not document-building, but produces what documents are built from, is its own project under
     the same product program: CMC, a study's biostatistics, its risk-based monitoring, data management, clinical
     pharmacology and nonclinical. Its deliverables are mapped downstream (§7a).
2. **The work breakdown is the project's pyramid.** The project instantiates the pyramid for its application type.
   Progress is kept per project. Each task gets an owner from the team and a due date, scheduled backwards from the
   project's target submission date along the pyramid's dependencies. The critical path is the pyramid's own
   `criticalPathIds`. A task with an owner becomes that person's task (tasking), so it shows as what is due.
3. **The content plan is one list.** It joins:
   - the pyramid's document bindings;
   - the project's documents;
   - the sequence's leaves.

   Each leaf then has its owner, due date, status and the document that fills it.
4. **AnA is the program manager's partner.** It drafts the plan from the pyramid, the objective and the charter. It
   asks the questions a program manager asks ("2.7.4 sits on the critical path and has no author. Who owns it?"). It
   flags slippage and proposes changes. A person confirms each one. The figures (dates, float, hours) come from the
   schedule's arithmetic, not the model (RULE 2).
5. **The objective is catalogued with its source.** AnA reads it from:
   - the protocol in the data room;
   - the public record: trial registries, the sponsor's releases and publications.

   It is recorded with where it came from, and a person confirms it.

## 7a. Work projects and their downstream deliverables (founder decision P-83, 2026-11-01)

> The founder: "There's a couple non-document build projects that then are producing documents downstream. There might
> be a CMC project. There might be a biostatistics project. There might be a risk-based monitoring project. And all
> those projects have deliverables downstream. And that needs to be thought about and mapped."

**The shape.** A product program (the molecule, biologic or device) is the parent. Under it sit two kinds of project:
- **Work projects** produce evidence and data: CMC, each study's biostatistics, its risk-based monitoring and its data
  management, clinical pharmacology, nonclinical.
- **Filing projects** build documents and file them: the IND and its amendments, the NDA or BLA, the MAA, the J-NDA,
  the NDS.

A work project often feeds several filings. One drug substance's CMC supports the IND, the NDA and the MAA. The
existing hierarchy holds this shape: the project rollup service's Program → Project → Study → Sub-project, and the
project hierarchy route.

**The map.** Each work project lists its deliverables. For each deliverable it records:
- what the deliverable is;
- its version: a data-room item with its lineage;
- its owner and due date;
- the downstream documents and sections it feeds, in which filing projects.

A downstream section records the deliverable version it was written from. When a new version lands (a new stability
data cut, a re-run TLF, a revised SAP), the sections that used the old one are flagged for review. That is change
propagation, and it already exists (`server/services/ana/changePropagationTools.ts`). The integrated schedule's
critical path crosses projects. For example: the stability data cut, then 3.2.P.8, then the NDA's submission date.

| Work project | Deliverable | Feeds (downstream document · CTD place) |
|---|---|---|
| **CMC** | Batch analyses, certificates of analysis | 3.2.S.4.4 and 3.2.P.5.4 batch analyses. The IB's drug-product description. The EU IMPD. Clinical supply release in the TMF. |
| | Specifications, analytical methods and their validation | 3.2.S.4.1–4.3 and 3.2.P.5.1–5.3. The 2.3 quality overall summary. |
| | Stability studies and their data cuts | 3.2.S.7 and 3.2.P.8. The label's storage and shelf life (Module 1). The IND annual report's CMC update. |
| | Process development and validation | 3.2.S.2 and 3.2.P.3. Readiness for the pre-approval inspection. |
| | Changes during development | IND information amendments. Comparability in 3.2. Post-approval supplements and variations. |
| **Biostatistics** | Study design and sample size | The protocol's statistics section. Briefing packages (end of phase 2, pre-NDA). |
| | The SAP and its amendments | The SAP filed with the CSR (16.1.9). The protocol. |
| | Randomisation | CSR 16.1.7. |
| | Analysis datasets (ADaM), define.xml, the reviewer's guide | Module 5 study datasets. |
| | Tables, listings and figures | CSR sections 11, 12 and 14, and listings 16.2. The 2.7.3 and 2.7.4 tables. The label's clinical studies and adverse reactions sections. |
| | Integrated analyses (ISS, ISE) | 5.3.5.3. 2.7.3, 2.7.4 and 2.5. |
| | Interim analyses and DMC reports | The DMC charter in the TMF. The CSR. Protocol amendments. |
| **Risk-based monitoring** | Risk assessment, key risk indicators, quality tolerance limits | The monitoring and quality risk management plans in the TMF. The CSR's data quality assurance section (9.6) and its report of tolerance-limit deviations. |
| | Central monitoring signals and actions | Protocol deviations: CSR 10.2 and listing 16.2.2. Site audits and inspection readiness. |
| | Site risk | Site-level data for the agency's inspections (Module 5). |
| **Data management** | Locked database, SDTM, define.xml, the reviewer's guide | Module 5 study datasets. CRFs (16.3). Coding versions named in the CSR. |
| **Safety and pharmacovigilance** | SAE narratives, integrated safety, aggregate reports | CSR 14.3.3 and 16.2.7. The ISS. The DSUR. The RMP or REMS (Module 1). The label's warnings and adverse reactions. |
| **Clinical pharmacology** | PK, PK/PD and population PK reports | 5.3.3 and 5.3.4. 2.7.2. The label's clinical pharmacology and dosing. |
| **Nonclinical** | Study reports | Module 4. 2.4 and 2.6. The IB's nonclinical sections. |
| **Clinical operations** | The TMF, site lists, investigators, financial disclosure | CSR 16.1.4. Module 1 (1572s, financial disclosure). Site data for inspections. |

**What already carries a deliverable downstream**, by path:
- CMC's registers compose Module 3 (`surfaces/CmcModule3Build.tsx`, `CmcPlaceIntoSubmission.tsx`,
  `CmcSectionEvidence.tsx`, `server/services/cmc/`).
- Biostatistics writes governed statistical documents (`server/services/ana-biostats/document-generator.ts`,
  `workflow-integrator.ts`).
- Risk-based monitoring builds its risk review (`server/services/rbm/risk-report.ts`).
- The editor builds a CSR from the study's frozen tables (`editor/StudyDataBuild.tsx`).
- The pyramid's IND has "feeds into" dependencies (`crossSubmissionDeps` in `pyramids/ind-pyramid.ts`).
- The project rollup (`server/services/project-rollup-service.ts`) and hierarchy (`server/routes/project-hierarchy.ts`)
  hold the parent and child shape.
- Change propagation flags what a change touches.

What is missing:
- the deliverable list of a work project;
- its "feeds" links to the downstream sections;
- the flag on a downstream section when a new version lands;
- the program's map across its projects.

**In the UI (no new screen).**
- A program is a project like any other; its project page shows its projects and the map.
- A work project opens on its work area: CMC, Biostatistics or Risk-based monitoring, bound to it, through its
  doors (`ProjectCoreWork.tsx`). Its project page shows a quiet "Feeds" list: each deliverable, its version and
  where it goes.
- A filing project's documents show, in the editor's inspector, the upstream deliverables each section was written
  from, and flag a newer one.

## 8. The UI: Claude's shape, the program's substance

Nothing here is a new screen (RULE 4, RULE 6). Each item lands in an existing place:

- **The project page's Plan step** (`surfaces/ProjectPlan.tsx`) becomes the program plan, in this order:
  1. **The objective and the strategy.** One quiet card, from the objective and the charter.
  2. **Due for you.** The signed-in person's next tasks in this project, by date.
  3. **Workstreams.** One quiet list. Each row is one workstream: its name, lead, documents done out of total, next
     milestone and date, and a status word (on track, at risk, blocked). Colour appears only where the status means
     something. A row opens to show its tasks and documents; a document opens in the one editor.
  4. **The schedule.** One calm horizontal line from today through submission and the agency's review clock. It shows
     milestones as dots, today as a mark, and the critical path as the darker line. Details appear on hover.
- **The project's "About this project" card** carries the objective and the team on seats.
- **Tasks** (`surfaces/TaskBoard.tsx`) answers "what is required of me by this date", across projects.
- **Projects** shows, in each card's one line, the next milestone. Reporting & analytics holds the global schedule
  and the portfolio.
- **The conversation** is where AnA asks, proposes and pushes back. Guidance is never a banner on the page (§2 of
  the plan).

## 9. Package S11 and the build order

**S12, work projects and their deliverables** (P-83): finish the hierarchy, the rollup and change propagation into
the map in §7a. Its order follows S11's.

**S11, the program plan:** bind the pyramid to the project; give it per-project progress; let it assign and
back-schedule; join it to the content plan; show it in the Plan step.

The order:
1. **S1:** the project's objective, with its source.
2. **S11:** per-project pyramid progress. The store keys on the project, and the existing per-type rows stay
   readable as they are.
3. **S11 with S9:** owner and due date per task, back-scheduled from the target date. Owned tasks appear in tasking.
4. **S11 with D3:** the Plan step's program plan (§8).
5. **S4:** AnA's program-manager questions and proposals.
6. **S11:** the portfolio line on Projects, and the global schedule in Reporting & analytics.

Each step names the existing path it completes (`Completes:`). Each files its evidence under
`docs/evidence/SPINE/S11/`.
