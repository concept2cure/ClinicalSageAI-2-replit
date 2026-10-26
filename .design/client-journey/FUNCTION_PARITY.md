# Function parity: folding the catalogue into the core product

Audit date: 2026-10-25. Branch `concept2cure-v2`. This page answers the founder's rule: "we must not lose any functionality that is in our apps catalog, but take all that and place it in the core product."

## How to read this

Each catalogue entry that duplicates another, or that was marked for retirement, is checked one function at a time against the part of the core product that should hold it (its canonical). File-and-line evidence is given on both sides. A function is **present** when the canonical already does it, **partial** when the canonical does some of it, and **missing** when the canonical does not do it at all. **Real today** means the function works on a tenant's own data now, not only on demo data, a catalogue promise or a route that nothing calls. An entry is safe to fold only when every function that is real today is present in its canonical. Every other function must be carried over first, or dropped by a recorded decision.

## Summary

| Measure | Count |
|---|---|
| Catalogue items audited | 71, grouped under 37 canonical homes. Four homes are "retire" and have no canonical: coverage, submission-twin, authoring-engine, intelligence-catalog |
| Functions found | 779 |
| Present in the canonical | 143 (18%) |
| Partial in the canonical | 343 (44%) |
| Missing from the canonical | 239 (31%) |
| Not applicable (plumbing, defects to drop, or capabilities no screen ever had) | 54 (7%) |
| Functions real on tenant data today | 439 of 779 (56%) |
| Partial or missing functions that are real today and must be carried | 319 of 582 |
| Partial or missing functions that are not real today (catalogue promises, routes with no caller, demo-only stores, defects) | 263 of 582 |
| Items safe to fold today | 12 (11 folds, plus 1 retirement: authoring-engine) |
| Items that need carry-over first | 59 (56 folds and 3 retirements) |

Three things in these numbers need a decision before the work starts.

- Eight of the 59 blocked items are held back only by functions that do not work on real data today: program-journey, client-portal, orchestration, the four PDEV workstreams and cer-generator. The audit still holds them back because each carries something with no home yet: reference content, an external-access model, approval gates, a working activity drill, or a second CER backend.
- Eight canonicals are themselves outside the launch catalogue: nda-cockpit, labeling-pi, precedent-intelligence, pdev, pv-cockpit, rbm, inconsistency and deep-research. Twelve items fold into them: nda-bla, labeling-smpc, insight-synthesis, the four PDEV workstreams, pharmacovigilance, safety-signal, clinical-ops, pdev-contradictions and evidence-engine. Those folds consolidate the functions but do not put them into the core product. For each home, admitting it to the launch catalogue, or moving its functions to a project step, is a founder decision under Rule 2.
- Two canonicals are themselves being folded elsewhere: nda-cockpit into Submission Center, and csr-workflow into document authoring. The items merged into them follow them.

## Carry over before folding

Each line below is one function marked partial or missing, written as: the function; where it is now (the merged item, with the file and line); where it goes (the canonical, and the place in the journey where it should appear); and whether it is real today. A line that says "drop" or "nothing to carry" is a decision to confirm, not work to do. The four retirement candidates have no canonical, so their functions are placed in section 5.

### Into document authoring (`document-authoring`: DocumentAuthoring.tsx and DocumentWorkbench.tsx)

#### From `batch-draft`
Batch Draft writes accepted prose straight into a filing copy (coauthor_documents) instead of the authoring source. In the same change, retire the accept route (`batch-draft-routes.ts:437`) and name `AuthoringAssemblyBuild.tsx` as its replacement. Do not carry the 240-character redraft seed.

- [ ] See every draftable section across the filing copies, with status and completion %. From `BatchDraft.tsx:223-262`. Goes to: a multi-section picker in the editor's assembly build target (`AuthoringAssemblyBuild.tsx:58-61`) that reads authoring sections. Completion % has no canonical source and is not invented. Real today.
- [ ] Select all, clear or toggle sections, with more than 20 refused. From `BatchDraft.tsx:304-316,692-694`. Goes to: the same picker, which must allow any subset of sections. The limit of 20 already exists (`assemblyDraftQueue.ts:66-68`). Real today.
- [ ] Choose the framework: ICH clinical, 510(k), PMA, EU MDR, CER or general. From `BatchDraft.tsx:195-202,700-708`. Goes to: the document's template or rule pack, which sets the framework in the editor. Device, EU MDR and CER frameworks are missing from editor drafting today. Real today.
- [ ] Draft up to 20 sections in parallel. From `BatchDraft.tsx:354-440`. Goes to: concurrency behind the assembly queue, if wanted. AnA's batch_draft_sections already runs five at a time in conversation. Real today.
- [ ] Redraft a document that already has text. From `BatchDraft.tsx:382`, `batch-draft-routes.ts:181-191`. Goes to: the editor's AI draft, sending the section's full saved text as context. AnA's batch_draft_sections already does this. Real today.
- [ ] Live progress (drafted, in flight, accepted), announced to screen readers. From `BatchDraft.tsx:757-768`. Goes to: the assembly build's per-candidate status (`AuthoringAssemblyBuild.tsx:28-44`). No further work is named. Real today.
- [ ] Review each draft as a card with its model, time taken and word count. From `BatchDraft.tsx:812-870`. Goes to: the editor's AI draft panel, adding time and word count if wanted. Real today.
- [ ] After an accept, tell AnA's conversation what was saved. From `BatchDraft.tsx:522-528`. Goes to: optionally, post the accept receipt into the conversation from the editor (today the editor shows a toast). Real today.
- [ ] Run metrics: median time to draft and words proposed. From `BatchDraft.tsx:786-799`. Goes to: optionally, the assembly summary (`assemblyDraftQueue.ts:77-78`). Real today.
- [ ] Start a new batch and re-read the section list. From `BatchDraft.tsx:770-781`. Goes to: the assembly build's Stop and Retry (`AuthoringAssemblyBuild.tsx:40-42`). No further work is named. Real today.
- [ ] AnA sees the batch state and can draft several sections. From `BatchDraft.tsx:575-638`. Goes to: the editor's AnA context, which should publish the build target's selection and phase. Real today.

#### From `csr-workflow`
No product path creates a CSR build job today, so the job-driven functions below cannot work on real data.

- [ ] See the ICH E3 sections with required marks. From `BiopharmaProject.tsx:500-545`. Goes to: required marks on E3 headings in the editor outline when the document is a CSR. Real today.
- [ ] See each E3 section as drafted or not started, from the build job. From `BiopharmaProject.tsx:306-324`. Goes to: the CSR document in the editor, once a path creates jobs. Not real today.
- [ ] Study title and CSR build progress %. From `BiopharmaProject.tsx:452-458`. Goes to: the CSR document header, or the project Draft step. Not real today.
- [ ] Flag every required E3 section that is still empty as a blocker. From `BiopharmaProject.tsx:519-522`. Goes to: a check inside the CSR in the editor, reusing m5-clinical-qc (`authoring-pdf.routes.ts:115`). Not real today.
- [ ] Preview a saved CSR job's output and import it. From `BiopharmaProject.tsx:513-517,571-573`. Goes to: a 'csr' import source in the editor or on the project Draft step. Today the only import sources are vault and data-room. Not real today.
- [ ] Corpus coverage strip. From `BiopharmaProject.tsx:90-131`. Goes to: the CSR's editor view, behind the evidence-graph flag. Not real today (the flag is off).
- [ ] FDA finding counts and the verified outcome on each E3 row. From `BiopharmaProject.tsx:359-377,525-545`. Goes to: the CSR's editor view, behind the same flag. Not real today.
- [ ] FDA findings panel, with "ask AnA to trace". From `BiopharmaProject.tsx:134-200`. Goes to: the CSR's editor view, behind the flag. crl-library holds the searchable list. Not real today.
- [ ] Verified regulatory outcome card and traceability path. From `BiopharmaProject.tsx:206-300`. Goes to: the CSR's editor view, behind the flag. Not real today.
- [ ] AnA sees the board. From `BiopharmaProject.tsx:384-445`. Goes to: the editor's published context when a CSR is open, with the job state and the E3 blockers. Real today.

#### From `doc-journey`
Do not carry the organisation-wide read: `doc-journey-view-assembler.ts:104-122` ignores the project and document read scope. Fix the route's 42P01 fallback (`doc-journey.routes.ts:45-47`), which returns an empty list instead of an error.

- [ ] See one document's lifecycle stages, with when, who and version. From `DocJourney.tsx:274,435-470`. Goes to: a Journey rail in the editor beside History, Signatures and Audit, using the assembler with a docId and the editor's read scope. Real today.
- [ ] Lifecycle KPIs. From `DocJourney.tsx:415-433`. Goes to: the Journey rail header. Real today.
- [ ] A read-only snapshot for each stage. From `DocJourney.tsx:472`. Goes to: the Journey rail. Real today.
- [ ] AnA selects a stage by name. From `DocJourney.tsx:359-378`. Goes to: a select-stage action on the Journey rail. Real today.
- [ ] AnA sees the lifecycle summary. From `DocJourney.tsx:286-354`. Goes to: the editor's published context. Real today.

#### From `ectd-coauthor`
This is the sixth editor over coauthor_documents. The id 'ectd-coauthor' is also an AnA prompt key, an alias and an entitlement id. Repoint each of those before the id is retired. Also repoint `submission_center.moduleId` (`app-registry.ts:83`) to 'submission-center'.

- [ ] Browse the filing copies as an M1–M5 backbone with status. From `EctdCoauthor.tsx:293,431-450`. Goes to: the editor's filing outline and the Submission Center Builder (`SubmissionSeqWorkspaces.tsx:572-714`). No further work is named. Real today.
- [ ] Search the tree by title or section number. From `EctdCoauthor.tsx:240,479-485`. Goes to: optionally, text search over the editor's document list. The Builder already searches. Real today.
- [ ] Edit a filing copy's text directly, with a reason. From `EctdCoauthor.tsx:384-427`. Goes to: migrate coauthor_documents rows that have no authoring source into authoring_documents, then retire the direct PUT. Edits happen in the editor. Real today.
- [ ] Open a filing copy that carries a verdict, read-only. From `EctdCoauthor.tsx:1003-1010`. Goes to: the placed text, shown read-only from its Builder row in Submission Center. Real today.
- [ ] Readiness roll-up across filing copies. From `EctdCoauthor.tsx:571-584`. Goes to: the Project home dossier card (`ProjectHome.tsx:1446-1449`). No further work is named. Real today.
- [ ] eCTD structural validation on one document. From `EctdCoauthor.tsx:612-632`. Goes to: Submission Center's rule-pack required-section check for each sequence. No further work is named. Not real today (it reads coauthor_sections, which nothing writes).
- [ ] ICH M4 compliance score. From `EctdCoauthor.tsx:633-655`. Goes to: nothing to carry, because module presence is derived from the rule pack for each sequence. Not real today.
- [ ] AnA screen actions: search, open a tab, open a document. From `EctdCoauthor.tsx:478-560`. Goes to: the editor's open-document, open-section and find actions. No further work is named. Real today.
- [ ] AnA action chips: validate, compile, route, export. From `registryModel.ts:567`. Goes to: the editor's chips and the Submission Center chips (`registryModel.ts:560-566,599`). No further work is named. Real today.
- [ ] AnA's eCTD co-author prompt, selected by the 'ectd-coauthor' key. From `module-intelligence.ts:1383-1386,1437,1451,1463`. Goes to: keep the key as prompt-only, or remap it to a key the canonical owns. Real today.
- [ ] The grant switches on the Dossier Workflow, Dossier Manager, Document Editor and Cross-jurisdictional prompts. From `lumen-instruction-engine.ts:741-800`. Goes to: add document-authoring and submission-center to those lists. Real today.
- [ ] AnA's 'ectd' alias and the ectd intent open this screen. From `callable-apps.ts:72`, `message-intent.ts:103`. Goes to: remap both to submission-center. Real today.

#### From `source-tracer`
Repoint Project home's "Trace a claim to its source" link (`ProjectHome.tsx:694-697`).

- [ ] List every section, across documents, that has citations. From `SourceTracer.tsx:120,290-310`. Goes to: a cross-document list of citations to changed or superseded sources at the project Review step. Real today.
- [ ] Totals: sections cited, citations, changed, unresolved. From `SourceTracer.tsx:166-168`. Goes to: the same Review-step list. Real today.
- [ ] Show the checksum recorded at cite time and the current checksum. From `SourceTracer.tsx:333-338`. Goes to: both checksums displayed in the editor's Sources rail. Real today.
- [ ] Ask AnA to review every section whose source changed. From `SourceTracer.tsx:271-281`. Goes to: the Review-step list. Real today.
- [ ] AnA selects a traced section. From `SourceTracer.tsx:141-165`. Goes to: the editor's open-section action. No further work is named. Real today.
- [ ] AnA sees citation standing across documents. From `SourceTracer.tsx:170-219`. Goes to: the counts from the Review-step list, published in the project's AnA context. Real today.

#### From `doc-canvas`
Administration must refuse the retired id at the module toggle, or alias it to document-authoring.

- [ ] Collaborative editing (a catalogue promise). From `20260220_user_intelligence_platform.sql:90`. Goes to: the editor's presence, section locks, Access, Tasks and Send for review. Correct the "real-time collaboration" wording. Not real today.
- [ ] AnA's document-editor prompt for medical-writing organisations. From `module-intelligence.ts:930-932,1391,1439,1459`. Goes to: map 'document-authoring' to it, or keep 'doc-canvas' as a prompt-only key. Real today.
- [ ] The dossier-workflow and document-editor prompts, switched on by the grant. From `lumen-instruction-engine.ts:741-783`. Goes to: add document-authoring and the launch ids to authoringModules and editorModules. Real today.

#### From `regulatory-workspace` (safe to fold; these are optional)
- [ ] The project's CTD section tree with status. From `BiopharmaProject.tsx:596,722-742`. Goes to: optionally, section workflow status in the editor outline, from authoring section records. Not real today.
- [ ] Readiness % and sections blocked by dependencies. From `regulatory-workspace-routes.ts:181-280`. Goes to: only if authoring sections gain a dependency record. Not real today.
- [ ] Project open-comment and linked-evidence counts. From `regulatory-workspace-routes.ts:227-285`. Goes to: optionally, project totals at the Review step. Not real today.
- [ ] AnA sees the tracked tree. From `BiopharmaProject.tsx:638-677`. Goes to: the editor's open-document context. No further work is named. Not real today.

### Into the NDA cockpit (`nda-cockpit`, itself folding into Submission Center)

#### From `nda-bla`
- [ ] Author the ISS/ISE (5.3.5.3). From the catalogue row `20260220_user_intelligence_platform.sql:85`. Goes to: a link from the cockpit's module rows and from the Submit step into the editor's NDA or BLA outline. Not real today.
- [ ] Author the REMS (1.16). From the catalogue row. Goes to: the same link. Not real today.
- [ ] Author the labeling (1.14). From the catalogue row. Goes to: the same link. Not real today.
- [ ] CTD Modules 1–5 ready for filing, including a PDUFA clock. From the catalogue row. Goes to: a PDUFA clock, which needs a recorded FDA acceptance date that nothing reads today. Not real today.
- [ ] AnA prompt for NDA or BLA organisations (the 'nda-bla' key). From `module-intelligence.ts:378-390,1451`, `lumen-instruction-engine.ts:759-768`. Goes to: remap it together with 'ectd-coauthor', and add the launch ids to the instruction lists. Real today.

### Into Submission Center (`submission-center`: SubmissionCenter.tsx, SubmissionSeqWorkspaces.tsx and the Submission Center app)

#### From `maa-cockpit`
Converge global-ri onto region-profile-service first. Retire c2c_maa_module1_components by amending its creating migration in place (Rule 1). Whether non-US marketing applications are in launch scope is a founder decision.

- [ ] Pick a non-US market and see its regional Module 1 list. From `MaaCockpit.tsx:44-45,150-162,181-201`. Goes to: region profiles for MHRA, TGA, Health Canada and Swissmedic, so that the Planner and the dispatch gate can read them, at the Submit step. Reconcile the NMPA list with the cn profile. Real today.
- [ ] Mark a Module 1 component assembled or outstanding. From `MaaCockpit.tsx:116-127`. Goes to: placed leaves in the Builder. Export the existing ticks, or show them to the organisation, before the store is retired. Real today.
- [ ] Module 1 readiness, n of N. From `MaaCockpit.tsx:59-60,134-145`. Goes to: a Module 1 check for MHRA, TGA, Health Canada and Swissmedic, plus an enforced NMPA check, through the dispatch gate. Real today.
- [ ] Ask AnA for the market's Module 1 checklist and what is missing. From `MaaCockpit.tsx:213-224`. Goes to: add CH and CN to the global_ri_strategy_brief markets, and add a placed-versus-required read for the market's sequence. Real today.
- [ ] AnA sees the market and its assembled state. From `MaaCockpit.tsx:69-114`. Goes to: placed-versus-required Module 1 coverage in Submission Center's AnA context. Real today.
- [ ] The API-only assess and checklist routes. From `global-ri/module1.routes.ts:18-38`. Goes to: re-home the registry's /api/global-ri claim. Retire the routes once the requirement data lives in region profiles. Real today.

#### From `nda-cockpit`
- [ ] CTD M1–M5 completeness, with each module's least-advanced section. From `NdaCockpit.tsx:162-168,627-660`. Goes to: converge the three counting rules (this screen, dossier-read and ectd-compile) into one, on Submit and the Project home dossier. Real today.
- [ ] Headline figure and answer-first lead. From `NdaCockpit.tsx:166-168,360-366`. Goes to: nothing beyond that convergence. Real today.
- [ ] Module 1 admin worklist with status, flag and note. From `NdaCockpit.tsx:191-203,664-702`. Goes to: migrate the c2c_nda_m1_docs rows, for example to tasks on the Submit step. Real today.
- [ ] Add a Module 1 placeholder entry. From `NdaCockpit.tsx:240-249`. Goes to: a task, if still wanted. The Builder places real documents. Real today.
- [ ] Refuse-to-File risk log and the high-risk KPI. From `NdaCockpit.tsx:172-186,718-745`. Goes to: Shadow Review findings for each sequence. Migrate or export the c2c_nda_rtf rows. Real today.
- [ ] Log a filing risk by hand. From `NdaCockpit.tsx:225-237`. Goes to: a human-recorded risk on a sequence at Submit, as an audited act. Today the screen claims an audit row that it does not write. Real today.
- [ ] PDUFA clock tab. From `NdaCockpit.tsx:708-717`. Goes to: nothing to move, because the clock needs an FDA receipt store first. Not real today.
- [ ] BLA workbench: compute and save assessments. From `BlaAssessmentWorkbench.tsx:33-36,54-70`. Goes to: mount the workbench at the Plan or Submit step of a biologic project, and repoint AnA's refusal message (`AnaToolExecutor.ts:6090-6098`). Real today.
- [ ] Inspect a saved BLA assessment. From `BlaAssessmentWorkbench.tsx:50-52,78-84`. Goes to: with the workbench. Real today.
- [ ] Sign a saved BLA assessment (Part 11). From `BlaAssessmentWorkbench.tsx:71-77`. Goes to: with the workbench. Real today.
- [ ] Organisation-wide list of BLA assessments. From `NdaCockpit.tsx:213-215,767-790`. Goes to: beside the workbench, or in Reporting & analytics. Real today.
- [ ] Open a CTD module in the Dossier. From `NdaCockpit.tsx:633,684`. Goes to: Project home module rows that open the module's sections. Real today.
- [ ] Ask AnA for filing readiness and mitigation plans. From `NdaCockpit.tsx:568-582`. Goes to: a "draft a mitigation plan" entry on the shadow-review findings or on the dispatch verdict. Real today.

#### From `shadow-review`
Submission Twin's reviewer challenges should converge here as well.

- [ ] Organisation-wide latest run for each lens. From `ShadowReview.tsx:81,109-119`. Goes to: Reporting & analytics, if kept, naming each run's sequence. Real today.
- [ ] Gate scores with band, gate name and score basis. From `ShadowReview.tsx:21-23,128-137,321-345`. Goes to: scoreBasis and gate names in the run history (`SubmissionSeqWorkspaces.tsx:1636-1637`). Real today.
- [ ] Answer-first verdict, including the elevated-score warning. From `ShadowReview.tsx:221-259`. Goes to: the warning in the canonical run detail. Real today.
- [ ] Provenance label (findings are model-assisted, scores are deterministic). From `ShadowReview.tsx:380-383`. Goes to: ShadowFindingList. Real today.
- [ ] Ask AnA to fix one finding. From `ShadowReview.tsx:366-370`. Goes to: "Fix with AnA", or "open the Builder at leafRef", on each finding. Real today.
- [ ] Open the co-author to fix the content. From `ShadowReview.tsx:391`. Goes to: the Builder sources, which open document authoring. No further work is named. Not real today (the link is dead).
- [ ] AnA switches lens and sees the scores. From `ShadowReview.tsx:88-107,149-216`. Goes to: a "select lens" action in the Shadow Review workspace. Real today.

#### From `device-submission` (a launch surface: this fold changes a shipping screen)
Drop the invented target-authority label, the hard-coded "Package" pass and the row chips that default to zero.

- [ ] List device submission packages. From `Workbench.tsx:514-680`. Goes to: one store for device filings (c2c_submission_packages or estar_submissions), with migration, in the Portfolio device filings (`SubmissionCenter.tsx:579-600`). Real today.
- [ ] Filter packages by status. From `Workbench.tsx:565-575`. Goes to: a filter on the Portfolio device-filings table, if wanted. Real today.
- [ ] Pipeline counts across seven stages. From `Workbench.tsx:600-618`. Goes to: the eSTAR status chips. No further work is named. Not real today.
- [ ] Transmit gate for each package. From `Workbench.tsx:718-757`. Goes to: a gate on each eSTAR tracker row, read from EstarFilingPanel's filing readiness. Real today.
- [ ] Milestone activity log. From `Workbench.tsx:759-769`. Goes to: an event history on the eSTAR filing record. Real today.
- [ ] AnA's create_submission_package command. From `command-executor.ts:2004-2045`. Goes to: retire it, or repoint it onto the device-filing store, in the same change. Real today.
- [ ] Transmit or view a receipt. From `Workbench.tsx:700-714`. Goes to: nothing to carry, because the button only sends AnA a prompt. Not real today.
- [ ] Ask AnA what is blocking a package. From `Workbench.tsx:691-697`. Goes to: AnA's assemble_device_submission, assess_dispatch_readiness and scan_project_risks. No further work is named. Real today.

#### From `device-validation` (a launch surface)
Low-severity blockers render as "Pass" (`Workbench.tsx:492`). That is a defect and is not carried.

- [ ] Organisation-wide list of open blockers. From `Workbench.tsx:334-505`. Goes to: Reporting & analytics, if a portfolio blocker list is kept. Real today.
- [ ] Filter blockers by severity. From `Workbench.tsx:341-345`. Goes to: with that list. Real today.
- [ ] Filter blockers by program. From `Workbench.tsx:344,418-420`. Goes to: nothing real, because the filter always returns nothing. A project filter belongs with the list, if it is kept. Not real today.
- [ ] Readiness by program. From `Workbench.tsx:403-454`. Goes to: Insights portfolio readiness and the Project home dossier. No further work is named. Real today.
- [ ] KPI cards. From `Workbench.tsx:388-400`. Goes to: Insights totals and the digest counts. No further work is named. Real today.
- [ ] Export the report as CSV. From `Workbench.tsx:364-380`. Goes to: with the list, if kept. Real today.
- [ ] Ask AnA to triage blockers. From `Workbench.tsx:381-386`. Goes to: an organisation-wide triage, if kept. Drop the hard-coded count. Real today.

### Into labeling (`labeling-pi`, outside the launch catalogue)

#### From `labeling-smpc`
The labeling-pi registry entry must claim /api/labeling-smpc. Any re-keying amends the creating migrations in place.

- [ ] SmPC QRD section tree with status. From `SmpcLabeling.tsx:85-89,189-210`. Goes to: LabelingPi's SmPC tab, moved ahead of the USPI empty and error branches (`LabelingPi.tsx:545-561`). Real today.
- [ ] SmPC readiness roll-up. From `SmpcLabeling.tsx:158-170`. Goes to: the same fix. Real today.
- [ ] Advance a section's QRD status. From `SmpcLabeling.tsx:71,95-106`. Goes to: the check phase of the 'smpc' document in the editor, as an audited act with a reason. Today it is neither audited nor reasoned. Real today.
- [ ] AnA sees SmPC completeness. From `SmpcLabeling.tsx:118-151`. Goes to: SmPC state published whether or not the USPI read succeeds. Real today.
- [ ] Ask AnA to draft an SmPC section from the USPI. From `SmpcLabeling.tsx:219-226`. Goes to: an SmPC-tab prompt, or the smpc document's editor. Real today.

### Into precedent intelligence (`precedent-intelligence`, outside the launch catalogue)

#### From `insight-synthesis` (safe to fold)
- [ ] AdComm trend analysis. From the catalogue row `20260220_user_intelligence_platform.sql:97`. Goes to: nothing real to move. A trend view, if wanted, belongs with the precedent read. Not real today.
- [ ] Competitive intelligence. From the catalogue row. Goes to: never built. The nearest is AnA's assess_regulatory_landscape. Not real today.
- [ ] Cross-study analysis. From the catalogue row. Goes to: never built. It belongs with Reporting & analytics and the ISS/ISE build. Not real today.

### Into Project home (`project-home`)

#### From `dossier` (safe to fold)
Repoint every onNav('dossier') caller: `Nonclinical.tsx:799`, `NdaCockpit.tsx:633,684`, `AgencyMeetings.tsx:662` and `BiopharmaJourney.tsx:162,169`.

- [x] Readiness for each CTD section. A2.7: ProjectArtifactReadiness's Artifact section status table, reached by ProjectDossier, carries the old artifact rollup, total/status counts, weakest status and each section's own update date. One canonical artifact reader uses the exact accepted project/anchor/client scope; unknown artifact statuses remain not assessed. Governed section details and module dates stay separate. Proof: `projectArtifactReadiness.test.tsx`, `projectDossierParity.test.tsx`, `dossier-support.pglite.test.ts`, `projects-dossier.test.ts`, native `project-dossier-destinations.e2e.ts`.
- [x] Summary counts. A2.6: in-review and drafted totals on DossierReadinessCard sum the server's home rows only; added-market rows stay separate. No new percentage is computed. Proof: `projectDossierDetails.test.tsx`, `projectHomeReadiness.test.tsx` and native `project-dossier-details.e2e.ts`.
- [x] AnA reads section readiness. A2.7: dossierFacts includes one canonical artifactReadiness source with section counts/status/date/totals, plus supportingReadiness.sectionTracking and governed sections. Semantic validation rejects inconsistent counts/summary/dates; missing/malformed reads stay unavailable rather than zero. Proof: `projectArtifactReadiness.test.tsx`, `projectDossierParity.test.tsx` and scoped SQL/route tests above.

#### From `program-journey`
Move PJ_STAGES (`BiopharmaJourney.tsx:129-193`) into Plan, StageBand or a shared constant before the file is deleted.

- [ ] Program identity, including modality and pathway. From `BiopharmaJourney.tsx:420-437`. Goes to: modality and pathway in Project home's identity facts. Not real today.
- [ ] Filing target label, date and agency. From `BiopharmaJourney.tsx:439-447`. Goes to: the target date on the device Plan branch as well. A target label needs a field, or a decision to drop it. Not real today.
- [ ] Nine-stage program arc. From `BiopharmaJourney.tsx:456-472`. Goes to: Plan reference content. Any per-stage progress needs a deterministic source. Not real today.
- [ ] Each stage's agency gate. From `BiopharmaJourney.tsx:476-492`. Goes to: gate text on Plan or StageBand. Not real today.
- [ ] Each stage's key deliverables. From `BiopharmaJourney.tsx:511-521`. Goes to: the deliverables of the non-IND stages, as Plan reference content. Not real today.
- [ ] The capabilities that serve each stage. From `BiopharmaJourney.tsx:523-533`. Goes to: keep the map as reference for placing each catalogue feature in a step. Not real today.
- [ ] Agency interactions at each stage. From `BiopharmaJourney.tsx:550-562`. Goes to: reference content on Plan or Respond. Not real today.
- [ ] Ask AnA to do a stage's work. From `BiopharmaJourney.tsx:564`. Goes to: suggested prompts in each step's AnA box. Not real today.
- [ ] CTD readiness by module, with a door to the NDA cockpit. From `BiopharmaJourney.tsx:569-590`. Goes to: a door on Submit, only if the NDA cockpit's functions survive their own fold. Not real today.
- [ ] Agency review clock. From `BiopharmaJourney.tsx:592-607`. Goes to: a drug and biologic review clock on Submit or Respond, computed from the filed date. Not real today.
- [ ] Predicted health-authority questions, with confidence. From `BiopharmaJourney.tsx:609-622`. Goes to: AnA on Respond, through simulate_challenges and scan_deficiencies. Any confidence must come from an engine. Not real today.
- [ ] Cross-module contradiction. From `BiopharmaJourney.tsx:624-640`. Goes to: AnA's scan_contradictions on Author or Review. Not real today.
- [ ] Open blockers with owner and due date. From `BiopharmaJourney.tsx:642-655`. Goes to: Submit's market blockers and ProjectWorkPanel. There is no source for RTF risk per module. Not real today.
- [ ] AnA selects a stage or switches the segment. From `BiopharmaJourney.tsx:265-294`. Goes to: repoint the actions and the nav entry to project-home. Not real today.
- [ ] AnA reads the program and its stages. From `BiopharmaJourney.tsx:303-351`. Goes to: Project home's AnA context. No further work is named. Not real today.
- [ ] Record a journey and advance a stage (audited routes). From `program-journey.routes.ts:67,117`. Goes to: nothing to carry as a write. Whether to keep the routes is a founder decision. Not real today.

#### From `dossier-map` (safe to fold)
In one change, delete /api/dossier-map, DossierMap.tsx, the registry and nav entries and the catalogue row, and repoint the "Start Dossier Map" action and capability.

- [x] Section chips under each module. A2.7: ProjectDossier's Tracked CTD sections view reuses the old map assembler's real `project_sections` percentages and section labels. This corrects A2.6's imprecise description of that source as artifact-derived. The view is separate from governed sections and artifact rollups; Vault keeps the editable tree. Proof: tracking assembler PGlite tests, `dossierMapProgramScope.test.tsx`, `projectDossierParity.test.tsx`, native `project-dossier-destinations.e2e.ts`.
- [x] Ask AnA for the critical path to filing. A2.6: ModuleCompletion on Author calls the existing onAsk with the exact question. Native `project-dossier-details.e2e.ts` proves the conversation prefill without a model request or dossier write.
- [x] AnA reads module completeness and the section lists. A2.7: the old section-tracking modules/percentages/labels are in dossierFacts as their own read, as are the artifact rollups and governed section facts. No client-computed mean replaces the canonical filing figure. Proof: `projectDossierParity.test.tsx` and `dossier-support.pglite.test.ts`.

#### From `haq-manager`
Retire the second HAQ store (`server/routes/c2c/haq-sessions.ts`, which has no client caller) in the same change.

- [ ] See only the letters still awaiting a response. From `HaqManager.tsx:50`. Goes to: an "awaiting a response" filter on Respond's InboxStep. Real today.
- [ ] AnA reads the awaiting count and due dates. From `HaqManager.tsx:54-75`. Goes to: Project home's AnA facts while Respond is open. Real today.
- [ ] Be told when every letter that needed a response is closed. From `HaqManager.tsx:90-95`. Goes to: with the filter. Real today.

#### From `client-portal`
First, a founder or scope decision. `redirectUtils.ts:31` sends every client user to this screen, so the redirect must change in the same change.

- [ ] An external client sees their programs. From `ClientPortal.tsx:177-199`. Goes to: a read-only external mode of Projects and Project home, scoped to the client's role. Not real today.
- [ ] Documents shared with me. From `ClientPortal.tsx:201-221`. Goes to: a share-to-client act at Review, and a client-visible filter. Not real today.
- [ ] Recent updates. From `ClientPortal.tsx:222-235`. Goes to: the external mode, reading project activity filtered for a client. Not real today.
- [ ] Choose a client workspace. From `ClientPortal.tsx:67-79`. Goes to: a picker scoped to the caller's grants. Not real today.
- [ ] CRO staff preview what a client sees. From `ClientPortal.tsx:121-128`. Goes to: "view as client" from Project home or administration. Not real today.

### Into Submission Readiness (`dispatch-readiness`)

#### From `orchestration`
The Submission Twin readiness score belongs in the same convergence.

- [ ] 0–100 readiness score. From `Orchestration.tsx:167-208`. Goes to: nothing, because the canonical's dispatch verdict replaces a second score. Not real today.
- [ ] The readiness engine's blockers. From `readiness-engine.ts:382-500`. Goes to: stale approved content and unrouted documents as Review checks, or dropped by decision. Not real today.
- [ ] Validation findings, including CMC contradictions. From `Orchestration.tsx:1352-1358`. Goes to: CMC contradictions on CMC / Module 3 at compose or approve, or at Submit. Not real today.
- [ ] Re-evaluate on demand. From `Orchestration.tsx:1325-1343`. Goes to: a "check again" action on each market's verdict. Not real today.
- [ ] List workflow runs. From `Orchestration.tsx:471-488`. Goes to: background work that AnA starts inside a step, with status shown in that step's conversation. No hook exists yet. Not real today.
- [ ] Read a run's steps and outputs. From `Orchestration.tsx:1086-1137`. Goes to: with the runs. Not real today.
- [ ] Start a run from a template. From `Orchestration.tsx:333-388`. Goes to: AnA, inside the step the template serves. Not real today.
- [ ] Retry or replay a run. From `Orchestration.tsx:876-890`. Goes to: the same. Not real today.
- [ ] Cancel a run. From `Orchestration.tsx:527-561`. Goes to: the same. Not real today.
- [ ] Human approval gates. From `Orchestration.tsx:1143-1240`. Goes to: the Review step and Tasks, after adding an approval_checkpoints source to unified work. Not real today.
- [ ] Approve or reject a gate. From `Orchestration.tsx:661-705`. Goes to: with the gate list. Not real today.
- [ ] Metrics. From `Orchestration.tsx:715-730`. Goes to: the awaiting-approval count moves with the gates. Not real today.
- [ ] Ask AnA for a pre-dispatch evaluation. From `Orchestration.tsx:967`. Goes to: AnA's assess_dispatch_readiness. No further work is named. Not real today.
- [ ] AnA switches the view or selects a run. From `Orchestration.tsx:735-853`. Goes to: the run and gate facts follow their new homes. Repoint the nav target. Not real today.
- [ ] PDEV approval-chain commands offered here. From `pdev-command-handlers.ts:1048-1200`. Goes to: scope decide and status to Review and Tasks when the gates move. Not real today.

### Into the audit trail (`audit-trail`)

#### From `part11-console`
Remove the id from LAUNCH_SHELL_SURFACES, the segment lists and the demo script.

- [ ] Live verdict for the second chain (audit_events). From `Part11Console.tsx:133,229-243`. Goes to: a second verdict in Audit trail's chain banner, from GET /api/part11/audit-trail/chain-integrity. Real today.
- [ ] AnA reads both chain verdicts. From `Part11Console.tsx:153-203`. Goes to: the audit_events verdict in Audit trail's AnA facts. Real today.

### Into Projects (`projects`: Projects.tsx, the New project wizard and Project home)

#### From `filings-catalog`
Deprecate the catalogue row by amending its creating migration in place (Rule 1).

- [ ] Search by description and workflow label, with the segment named on each result. From `FilingsCatalog.tsx:160-170,238-260`. Goes to: RegistryPicker's match rule in the New project wizard. Real today.
- [ ] Category descriptions. From `FilingsCatalog.tsx:277-305`. Goes to: under each category heading in RegistryPicker. Real today.
- [ ] List every filing type, including those not offered. From `FilingsCatalog.tsx:290-299`. Goes to: nothing to add, because showing an unoffered filing as startable would be wrong. Real today.
- [ ] Filing description as visible text. From `FilingsCatalog.tsx:138-146`. Goes to: the card, or the chosen-filing note. Real today.
- [ ] Filing detail: authority, format, CTD module. From `FilingsCatalog.tsx:59-64,86-95`. Goes to: a chosen-filing detail in wizard step 1 or 2. Real today.
- [ ] Lifecycle loop: stages, review clock, return loop. From `filings-catalog-data.ts:118-168`. Goes to: the wizard's chosen-filing detail and the Plan step, labelled as authored reference. Real today.
- [ ] "How you'll build it". From `FilingsCatalog.tsx:56-58`. Goes to: a filing-specific review-step note (`Projects.tsx:936-939`). Real today.
- [ ] Ask AnA about a filing type. From `FilingsCatalog.tsx:119`. Goes to: an Ask AnA button on the chosen filing, with the filing published in the wizard's AnA context. Real today.
- [ ] Links to run the whole loop. From `FilingsCatalog.tsx:122-130`. Goes to: already reached inside the project. The journey link is not needed. Real today.
- [ ] AnA sees the segment, search and selection. From `FilingsCatalog.tsx:179-211`. Goes to: the wizard's state, published in the projects AnA context. Real today.

#### From `device-workstream`
Do not carry listPrograms' missing access, deleted and archived filters.

- [ ] Pathway filter with counts. From `Overview.tsx:73,85,91-103`. Goes to: a program_type filter on Projects for device clients. Real today.
- [ ] Status filter with counts. From `Overview.tsx:188-213`. Goes to: counts for each status on Projects. Real today.
- [ ] Health strip: the pathway split and in-flight count. From `Overview.tsx:30-54,107-142`. Goes to: the Projects summary line. Real today.
- [ ] Device class, pathway and days to filing on the card. From `Overview.tsx:251-305`. Goes to: the Projects card, or Project home. Real today.
- [ ] Next blocker for each program. From `Overview.tsx:290-305`. Goes to: metadata->>'blocker' in GET /api/c2c/projects, or Project home's unified work. Real today.
- [ ] Owners, description and last activity. From `Overview.tsx:306-315`. Goes to: render p.activity on Projects. The team is shown on Project home. Real today.
- [ ] Ask AnA chip on each program. From `Overview.tsx:263-268`. Goes to: projects.open-program and Project home AnA. No further work is named. Real today.
- [ ] Readiness report across device programs. From `Overview.tsx:114-121`. Goes to: Projects' "at risk this week" prompt. No further work is named. Real today.
- [ ] Client Review Room. From `ClientReviewZone.tsx`. Goes to: a mount on Project home that passes the integer projects.id, not the UUID. Real today.
- [ ] AnA's evidence_sufficiency.assess and reviewer_simulation.run commands. From `mdx-command-handlers-phase2.ts:411-600`. Goes to: reclassify them to project-home or device-510k before the surface leaves launch scope. Real today.
- [ ] Two AnA guided tours. From `demo-scripts.ts:285-287,355-357`. Goes to: retarget them to 'projects' with the MDX filter. Real today.
- [ ] The AnA target and the /concept2cure/mdx alias. From `index.ts:194`, `registryModel.ts:960`. Goes to: alias both to 'projects'. Real today.
- [ ] Remembered grid or list view. From `Overview.tsx:64-79`. Goes to: optionally, Projects, with storage access wrapped in try/catch. Real today.

#### From `cro-portfolio`
Settle cro_clients versus clients as the sponsor key first.

- [ ] Sponsor roster. From `CroPortfolio.tsx:378-424`. Goes to: a sponsor filter on Projects. Fix the company-type map so device and diagnostic sponsors are not labelled Biotech. Real today.
- [ ] Portfolio metrics. From `CroPortfolio.tsx:334-352`. Goes to: a CRO summary on Projects, or Reporting & analytics. Real today.
- [ ] Submission lifecycle roll-up. From `CroPortfolio.tsx:355-375`. Goes to: the same. Real today.
- [ ] Select a sponsor. From `CroPortfolio.tsx:157-185`. Goes to: a sponsor filter, with a sponsor parameter on projects.filter. Real today.
- [ ] Sponsor detail: lead and SOW. From `CroPortfolio.tsx:427-473`. Goes to: administration (the client workspace record). Real today.
- [ ] Sponsor studies. From `CroPortfolio.tsx:475-532`. Goes to: the sponsor's projects, or administration. Real today.
- [ ] Sponsor regulatory submissions. From `CroPortfolio.tsx:534-630`. Goes to: mapped onto the submission spine and shown in Submission Center. Real today.
- [ ] Onboard a sponsor. From `CroPortfolio.tsx:104-156`. Goes to: administration, creating a client workspace through POST /api/clients. It is the only client-creation screen in the product. Real today.
- [ ] Ask AnA which sponsor submissions are at risk. From `CroPortfolio.tsx:287-296`. Goes to: sponsor facts in Projects' AnA context. Real today.
- [ ] AnA context with sponsor facts. From `CroPortfolio.tsx:214-272`. Goes to: Projects' context, with the same PII exclusions. Real today.
- [ ] AnA target "CRO portfolio". From `index.ts:187`. Goes to: alias it to 'projects'. Real today.

#### From `mission-control`
Before deprecating, confirm whether any tenant has programs in the mission_control store.

- [ ] List programs from the mission_control store. From `MissionControl.tsx:269-277`. Goes to: migrate them into regulatory_programs, or show that none exist. Real today.
- [ ] Product characterisation (modality, INN, route, ATC, phase, orphan status, expedited programmes). From `MissionControl.tsx:519-581`. Goes to: new regulatory_programs fields, edited on Project home. Derive the review centre from modality. Real today.
- [ ] "Choose or create a project" lands on this screen. From `programAction.ts:41-47,84`. Goes to: set OPEN_PROGRAM_SURFACE to 'projects'. Real today.
- [ ] Regulatory frame from modality. From `MissionControl.tsx:595-604`. Goes to: frameSummary in the Project home header. Real today.
- [ ] CMC section model for the modality. From `MissionControl.tsx:628-654`. Goes to: the CMC / Module 3 work area. Real today.
- [ ] Readiness by dimension. From `MissionControl.tsx:656-679`. Goes to: optionally, the engine pointed at regulatory_programs. Not real today.
- [ ] Blockers with severity. From `MissionControl.tsx:681-693`. Goes to: Project home unified work. No further work is named. Not real today.
- [ ] Next actions. From `MissionControl.tsx:695-707`. Goes to: ProjectStages guidance. No further work is named. Not real today.
- [ ] Artifacts behind the score. From `MissionControl.tsx:714-728`. Goes to: project documents. No further work is named. Not real today.
- [ ] Risk register. From `MissionControl.tsx:730-744`. Goes to: a decision on whether project risk belongs on Project home. Not real today.
- [ ] Stale dependencies. From `MissionControl.tsx:746-759`. Goes to: Project home source-changes. No further work is named. Not real today.
- [ ] Decisions log. From `MissionControl.tsx:761-774`. Goes to: a link to DecisionLineage.tsx from Project home. Not real today.
- [ ] AnA target "Mission control". From `index.ts:181`. Goes to: alias it to 'projects'. Real today.

### Into eCTD compile (`ectd-compile`)

#### From `ectd-publishing`
Re-register its three surface actions under ectd-compile. Amend 20260810's keep-list and heal step in place.

- [ ] Choose the eCTD version. From `PublishingCenter.tsx:149,322-326`. Goes to: a reference panel in EctdCompile, defaulting to the sequence's version. Real today.
- [ ] FDA Regional IG OID. From `PublishingCenter.tsx:329-333`. Goes to: the same panel. Real today.
- [ ] The spec versions the package is qualified against. From `PublishingCenter.tsx:338-361`. Goes to: beside the validation findings (`EctdCompileDtdEvidence.tsx`). Real today.
- [ ] v3.2.2 vocabularies with code counts. From `PublishingCenter.tsx:370-393`. Goes to: the panel. Real today.
- [ ] Browse a v4.0 code list. From `PublishingCenter.tsx:396-402`. Goes to: the panel. Real today.
- [ ] Filter codes. From `PublishingCenter.tsx:403-407`. Goes to: the panel. Real today.
- [ ] Retry a failed read. From `PublishingCenter.tsx:349`. Goes to: the panel, with a retry for the code-list error too. Real today.
- [ ] AnA context for the reference. From `PublishingCenter.tsx:207-261`. Goes to: EctdCompile's context (`EctdCompile.tsx:1135-1234`). Real today.
- [ ] AnA target. From `index.ts:233`. Goes to: alias it to ectd-compile. Real today.

#### From `pdev-ind-assembly`
Retire the PDEV compile path (the route, the UI and the AnA command) together.

- [ ] Mandatory and all-document counts. From `Assembly.tsx:131-145`. Goes to: the IND Plan step, with plan progress. Real today.
- [ ] Missing mandatory documents, by activity state. From `Assembly.tsx:146-160`. Goes to: the IND Plan step, as plan progress. Real today.
- [ ] AnA's pdev.ind_assembly.compile command, offered in production. From `pdev-command-handlers.ts:882-960`. Goes to: delete it, or move it to hiddenApp. Not real today.
- [ ] AnA's pdev.program.ind_assembly read. From `pdev-command-handlers.ts:265-286`. Goes to: retire it with the surface. Real today.
- [ ] AnA target. From `index.ts:216`. Goes to: alias it to ectd-compile. Real today.

### Into Licensing (`licensing`)

#### From `billing`
- [ ] Invoice list. From `UsageBilling.tsx:462-528`. Goes to: Licensing, under the plan status (administration). Gate the route to billing admins, state "billing not set up" when there is no customer record, and page through invoices. Real today.
- [ ] Session usage window. From `UsageBilling.tsx:375-410`. Goes to: stays on 'usage' (the same component), or is embedded in Licensing. Real today.
- [ ] Weekly limit buckets. From `UsageBilling.tsx:411-458`. Goes to: the same. Real today.
- [ ] Rate limits by tier. From `UsageBilling.tsx:545-604`. Goes to: Licensing's plan cards, or stays on usage. Real today.
- [ ] "Learn more" AnA prompt. From `UsageBilling.tsx:417-429`. Goes to: beside the usage card. Real today.
- [ ] Billing entry in the account menu for every member. From `Shell.tsx:371`. Goes to: point it at Licensing, offered to billing admins only. Real today.
- [ ] AnA billing.open-tab and invoice facts. From `UsageBilling.tsx:281-335`. Goes to: invoice facts in Licensing's context. Retire billing.open-tab. Real today.
- [ ] AnA target "Billing". From `index.ts:243`. Goes to: alias it to licensing. Real today.

### Into product development (`pdev`, outside the launch catalogue)

#### From `pdev-cmc`, `pdev-nonclinical`, `pdev-clinical` and `pdev-regulatory`
The four workstreams run on one host (`pdev/App.tsx`) and share their functions. Each line covers all four unless a line says otherwise. None of these functions is real on client data today: `usePdevData.ts:146` keeps only 'IND' while New project writes 'ind', pdev is outside the launch catalogue, and AI drafting needs metadata.projectId, which nothing writes. Gates that name the ids are `surfaceReachability.test.ts:85-88`, `check-surface-discoverability.mjs:89-92` and `dump-v2-surfaces.spec.tsx:88-89`.

- [ ] List the workstream's activities (14 CMC, 11 nonclinical, 10 clinical, 18 regulatory). From `Workstream.tsx:279-349`. Goes to: the drill, held inside pdev, or activity state moved onto the Plan step's IND deliverables (`ProjectPlan.tsx:134-138`). Repoint "View workstream" (`App.tsx:529`). Not real today.
- [ ] Progress by stage. From `Workstream.tsx:158-178`. Goes to: with the drill. Not real today.
- [ ] Filter activities by state. From `Workstream.tsx:110-114,251-277`. Goes to: with the drill. Not real today.
- [ ] Grid or list view. From `Workstream.tsx:43-64`. Goes to: with the drill. It is presentation only and may be dropped. Not real today.
- [ ] Ask AnA to summarise the workstream. From `Workstream.tsx:215-223`. Goes to: where the drill lands. Not real today.
- [ ] AnA filter and view actions on the board. From `surface-actions.ts:1043-1110`. Goes to: re-keyed to the surviving id. Update `anaDrivesWave6.test.tsx:175`. Not real today.
- [ ] AnA sees the workstream screen. From `pdev/App.tsx:299-319,458-461`. Goes to: published under the surviving id. Not real today.
- [ ] Command-palette rows. From `ui-surface-registry.ui-v2.ts:1082,1099,1116,1133`. Goes to: removed or aliased with the ids. Not real today.
- [ ] AnA navigation targets. From `shared/navigation/index.ts:212-215`. Goes to: dropped, or repointed with a workstream parameter. Not real today.
- [ ] Open an activity sheet. From `ActivityDetail.tsx:240-273`. Goes to: opened from wherever the list lands. Not real today.
- [ ] Change an activity's state under a governed reason. From `ActivityDetail.tsx:274-305`, `pdev-routes.ts:415-582`. Goes to: with the sheet. Regulatory checklist and Module 1 items mirror ind-checklist instead. Not real today.
- [ ] Override the dependency gate. From `pdev-routes.ts:409-447`. Goes to: the sheet sends force with the reason, or the hint is removed. Not real today.
- [ ] Set owner, reviewer and due date. From `pdev-routes.ts:400-412`. Goes to: the Plan step's assignment (`PlanAssign.tsx`). Not real today.
- [ ] Required documents for each activity, with eCTD destination. From `ActivityDetail.tsx:309-344`. Goes to: the Plan step's IND deliverables. CMC opens CMC / Module 3. Nonclinical opens in document authoring, because the 'nonclinical' surface is outside launch. The protocol opens in protocol-dev and the IB in document authoring. The regulatory cover letter and Module 1 go to ind-checklist. INTERACT, pre-IND, briefing books and minutes need communication-center. Not real today.
- [ ] Governed AI draft of a required document. From `AiDraftWorkbench.tsx:50-62`. Goes to: the deliverable opened in its home editor instead. Four gaps must be closed: projectId is never written, evidence ids are never sent, Provenance has no open action, and the drafted artifact cannot be opened. Not real today.
- [ ] See the evidence linked to an activity. From `ActivityDetail.tsx:346-395`. Goes to: with the sheet, after the response-shape fix (`pdev-routes.ts:959` against `usePdevData.ts:311`). Not real today.
- [ ] Attach evidence. From `EvidencePicker.tsx:77-137`. Goes to: with the sheet, sending the reason in the POST body. Not real today.
- [ ] Detach evidence. From `ActivityDetail.tsx:375-393`. Goes to: with the sheet, fixing the key and the reason. Not real today.
- [ ] Approval chain. From `ActivityDetail.tsx:406-531`. Goes to: with the sheet, or converged onto the editor's review path. Not real today.
- [ ] Provenance trace. From `ActivityDetail.tsx:533-606`. Goes to: with the sheet, with a null confidence shown as unknown rather than 0%. Not real today.
- [ ] Audit trail for each activity. From `ActivityDetail.tsx:609-631`. Goes to: with the sheet, after the field mapping is fixed (`types.ts:249-255` against `pdev-provenance-trace.ts:80-86`). Not real today.
- [ ] Regulatory only: record IND clearance. From `pdev-routes.ts:535-545`, `pdev-clearance.ts`. Goes to: Submission Center's IND lifecycle, beside the 30-day clock. A screen path must exist before the drill goes. Not real today.

### Into the device CER (`device-cer`)

#### From `cer-generator`
The mounted, uncalled /api/cer backend must be converged onto device-cer or deleted, with device-cer named as the replacement.

- [ ] Generate a whole CER (MDR, IVDR, UK, Swiss). From `cer-routes.ts:585-627`. Goes to: device-cer's cerv2 sections, or deleted. Not real today.
- [ ] List and open stored CER reports. From `cer-routes.ts:444,504`. Goes to: a reader in device-cer, if any tenant holds cer_reports. Not real today.
- [ ] Attach a scored clinical evidence source. From `cer-routes.ts:628-662`. Goes to: device-cer's Literature and clinical data area, if wanted. Not real today.
- [ ] FAERS narrative by NDC. From `cer-routes.ts:304-395`. Goes to: nothing for a device CER. Name the Signals tab as the replacement. Not real today.
- [ ] Benefit-risk analysis. From the catalogue row. Goes to: the section in the editor, with assess_benefit_risk_balance reached from it if wanted. Not real today.
- [ ] AnA assess_stored_cer reads the legacy store. From `submission-center-tool-defs.ts:810-822`. Goes to: repointed to the cerv2 sections. Not real today.
- [ ] Project knowledge-source app id. From `knowledge-sources.ts:234`. Goes to: accept or translate 'device-cer'. Not real today.
- [ ] AnA prompt keys. From `module-intelligence.ts:1391-1395`, `lumen-instruction-engine.ts:747`. Goes to: re-keyed to device-cer. Not real today.
- [ ] 'cer' app gating. From `app-registry.ts:94`. Goes to: moduleId 'device-cer'. Update `app-registry.test.ts:20`. Not real today.
- [ ] Rate-limit keys for each tier. From `billing-dashboard.ts:536-572`. Goes to: re-keyed or dropped. Not real today.

#### From `ce-marking`
- [ ] Annex II/III technical documentation. From the catalogue row. Goes to: the existing manifest and assemble routes (`submissions.ts:1576-1600,1688-1760`), reached from an MDR project's Submit step. Not real today.
- [ ] IVDR performance evaluation. From the catalogue row. Goes to: keep device-cer's hand-off to device-diagnostics. Not real today.
- [ ] GSPR mapping decisions. From the catalogue row. Goes to: an on-screen decision with justification in the GSPR tab, over the existing route. Not real today.
- [ ] Notified Body submission. From the catalogue row. Goes to: nothing transmits today. This is a product decision. Not real today.
- [ ] AnA treats a CER filing as a device project. From `module-intelligence.ts:1379,1451`. Goes to: re-key 'cer' to a key that still resolves to medical-device intelligence. Real today.
- [ ] Submission and cross-jurisdiction prompts. From `lumen-instruction-engine.ts:765,799`. Goes to: re-keyed to device-cer and device-submission. Not real today.

### Into Reporting & analytics (`insights`)

#### From `device-analytics`
- [ ] Program KPI cards. From `mdx-analytics.ts:278-299`. Goes to: regulatory_programs status counts on every tier, scoped to accessible projects. Real today.
- [ ] AnA acceptance rate. From `mdx-analytics.ts:286-298`. Goes to: Reporting & analytics, or the device 510(k) step. Real today.
- [ ] 24-month submission pace. From `mdx-analytics.ts:315-329`. Goes to: Reporting & analytics. Real today.
- [ ] Open blockers by root cause. From `mdx-analytics.ts:302-312`. Goes to: an organisation-wide aggregation in the portfolio view. Real today.
- [ ] Ask AnA from a blocker cause. From `AnalyticsSurface.tsx:235-242`. Goes to: on that aggregation. Real today.
- [ ] Opened from the device project's feature list. From `mdx-project-features.ts:24`. Goes to: Reporting & analytics, changing the feature list and the Projects app list in one commit. Real today.
- [ ] Server facets with no caller. From `mdx-analytics.ts:67-262`. Goes to: transmittal timing to Submission Center, clinical roll-ups to the device clinical step, and pathway counts to the portfolio. Real today.

#### From `report-governance`
- [ ] List the intelligent_reports register. From `ReportGovernance.tsx:168-195`. Goes to: the ana-ri generate_report command converged onto report-os runs. Existing rows need a read-only home. Real today.
- [ ] Verify integrity. From `ReportGovernance.tsx:198-208`. Goes to: with the convergence. Real today.
- [ ] Provenance atom count. From `ReportGovernance.tsx:210-216`. Goes to: with the convergence. Real today.
- [ ] Indemnification-attestation count. From `ReportGovernance.tsx:89-93`. Goes to: retired, or a field on the run evidence panel. Founder decision. Real today.
- [ ] Seal a draft with a justification. From `ReportGovernance.tsx:185-187`. Goes to: Insights finalize, after the converged writer is in place and existing drafts are migrated or closed. Real today.
- [ ] Revoke a sealed report. From `ReportGovernance.tsx:188-190`. Goes to: revoke and supersede of a finalized run, reusing the governed revoke-signature command. Real today.
- [ ] AnA generate_report (ana-ri), the register's only writer. From `command-executor.ts:4428-4463`. Goes to: retired, or repointed onto report-os, in the same change. Real today.
- [ ] AnA reads the register state. From `ReportGovernance.tsx:106-163`. Goes to: Insights publishes run-register counts. Real today.
- [ ] Routes with no caller. From `intelligent-reports.ts:61-500`. Goes to: supersede moves with revoke. Drift-check and compliance-validation skip the ownership check; fix or delete them. Not real today.

#### From `analytics-hub`
- [ ] Submission metrics. From the catalogue row, implemented in `mdx-analytics.ts:278-329`. Goes to: the same carry-over as device-analytics. Real today.
- [ ] Quality KPIs. From the catalogue row. Goes to: Insights presets and compliance reports. No further work is named. Not real today.
- [ ] Budget tracking. From the catalogue row. Goes to: nothing exists. Founder decision. Not real today.

### Into the PV cockpit (`pv-cockpit`, outside the launch catalogue)

#### From `pharmacovigilance`
Keep pv-cockpit on the hidden PV reporting tools' inventory entry.

- [ ] Signals auto-screened from the organisation's adverse events. From `pharmacovigilance-board.routes.ts:141-198`. Goes to: pv-cockpit's signal list. Render overview.activeSignals. Real today.
- [ ] Lead answer naming the highest-PRR signal. From `BiopharmaSpecialty.tsx:1099-1116`. Goes to: with the list. Real today.
- [ ] Aggregate reports in cycle. From `BiopharmaSpecialty.tsx:1259-1281`. Goes to: the DSUR or PSUR document at gather-sources. Until then, render overview.upcomingDeadlines. Real today.
- [ ] Log a signal on this screen only. From `BiopharmaSpecialty.tsx:1071-1095`. Goes to: a defect. Remove it, or wire it to POST /signals without a typed PRR. Not real today.
- [ ] AnA adjudicate and continue-PSUR prompts. From `BiopharmaSpecialty.tsx:1213-1236`. Goes to: pv-cockpit. Real today.
- [ ] AnA reads the signals and the cycle. From `BiopharmaSpecialty.tsx:1124-1159`. Goes to: pv-cockpit's context. Fix its precedence defect (`PvCockpit.tsx:166-169`). Real today.
- [ ] Claims on the IND safety-report, ICSR and narrative APIs. From `ui-surface-registry.ui-v2.ts:1224-1238`. Goes to: pv-cockpit's registry row. Dropping them breaks P-32. Real today.
- [ ] Link from the journey's Lifecycle and PV stage. From `BiopharmaJourney.tsx:190`. Goes to: repointed to pv-cockpit. Real today.

#### From `safety-signal`
Set the 'pharmacovigilance' app's moduleId (`app-registry.ts:93`) to pv-cockpit.

- [ ] Screen the organisation's own adverse events. From `pharmacovigilance-board.routes.ts:141-198`. Goes to: the same carry-over as above. Real today.
- [ ] FAERS integration. From `AnaToolDefinitions.ts:616-619`. Goes to: nothing has to move. It is optional as a pv-cockpit prompt. Real today.
- [ ] CIOMS form generation. From the catalogue row. Goes to: ICSR generation in Submission Center's IND safety reports (P-32). Not real today.
- [ ] Aggregate safety reporting. From `pharmacovigilance-routes.ts:387-466`. Goes to: the DSUR or PSUR gather-sources phase. Real today.

### Into setup (`onboarding`)

#### From `onboarding-ingest`
- [ ] Upload a company or program document. From `OnboardingIngest.tsx:46-72`. Goes to: the first action of the wizard's Organization step. Real today.
- [ ] AnA proposes values, each with its quote. From `proposal-extraction.ts:47-57`. Goes to: with the upload and its proposal store. Real today.
- [ ] Review proposals: edit, approve, skip, bulk-approve. From `OnboardingProposalReview.tsx:96-119`. Goes to: the Organization step. Real today.
- [ ] Apply approved values under a reason. From `onboarding-proposals.ts:155-331`. Goes to: the same step, prefilling its fields. Decide on one industry field. Real today.
- [ ] See what was applied and what was not. From `OnboardingIngest.tsx:258-284`. Goes to: the Organization step. Real today.
- [ ] Program and contact proposals are shown but never written. From `onboarding-proposals.ts:236-246`. Goes to: name and indication written to the discovery record through PATCH /api/onboarding/discovery. Real today.
- [ ] AnA's readiness tool sends people to this flow. From `AnaToolDefinitions.ts:584-586`. Goes to: renamed to setup's Organization step. Real today.
- [ ] AnA reads the ingest state. From `OnboardingIngest.tsx:107-170`. Goes to: the wizard's context. Real today.
- [ ] Home's "Upload a document to start" starter. From `onboardingWelcome.ts:59-66`. Goes to: repointed to 'onboarding'. Real today.

### Into Quality (`quality`)

#### From `qmp`
Bringing plans back reverses the 2026-10-08 decision and needs /api/quality claimed by a launch surface. This is a founder decision.

- [ ] See the organisation's quality-management plans. From `QmpWorkspace.tsx:159`. Goes to: a plan tab in Quality (`quality/App.tsx:50`). Real today.
- [ ] Create a plan under a reason. From `QmpWorkspace.tsx:96-108,225`. Goes to: with the plan tab. Real today.
- [ ] Activate a plan. From `QmpWorkspace.tsx:369`. Goes to: with the plan tab. Real today.
- [ ] Archive the active plan. From `QmpWorkspace.tsx:366-367`. Goes to: with the plan tab. Real today.
- [ ] Delete an unused plan. From `QmpWorkspace.tsx:370`. Goes to: with the plan tab. Real today.
- [ ] Plan dashboard. From `QmpWorkspace.tsx:380-419`. Goes to: with the plan tab. It is always empty until gates can be written. Real today.
- [ ] Ask AnA to explain a plan. From `QmpWorkspace.tsx:342`. Goes to: with the plan tab. Real today.
- [ ] AnA sees the plan register. From `QmpWorkspace.tsx:277-324`. Goes to: Quality's context. Real today.
- [ ] Plan detail read (API). From `quality-management-api.ts:408-490`. Goes to: optionally, the tab's detail. Not real today.
- [ ] Traceability matrix (API). From `tenant-traceability.ts:88-516`. Goes to: decided with the plan tab. Not real today.
- [ ] Organisation QMP settings (API). From `tenant-config.ts:140-146`. Goes to: administration, if plans return. Not real today.
- [ ] Author section gates and CTQ factors. From `tenant-section-gating.ts:88-91`. Goes to: never built. Gates would go to the plan tab, and CTQ factors would converge with RBM and protocol-dev. Not real today.
- [ ] Check sections against plan gates. From `tenant-quality-validation.ts:35,131`. Goes to: each document's governed check phase. Not real today.

#### From `compliance-monitor` (safe to fold)
- [ ] Training matrix. From the catalogue row. Goes to: nothing delivered. Read-and-understood coverage is the training of record. Not real today.
- [ ] Deviation tracking. From the catalogue row. Goes to: Quality's deviation link resolving to the converged register. Not real today.
- [ ] CAPA management. From the catalogue row. Goes to: nothing delivered. There is no CAPA write screen. Not real today.

#### From `training` (safe to fold)
- [ ] Role-based learning paths. From `Training.tsx:34,113-135`. Goes to: nothing working to move. Not real today.
- [ ] Continue a path with AnA. From `Training.tsx:115`. Goes to: nothing. Not real today.
- [ ] Certifications. From `Training.tsx:159-181`. Goes to: nothing. Not real today.
- [ ] AnA sees the screen. From `Training.tsx:46-79`. Goes to: nothing. Not real today.

### Into IND forms (`ind-checklist`)

#### From `ind-filing` (safe to fold)
- [ ] Pre-IND meetings. From the catalogue row. Goes to: the briefing book is already here. The meeting record sits in agency-meetings, which is outside launch, so it is a separate decision. Not real today.
- [ ] Clinical holds. From the catalogue row. Goes to: never delivered. Recording a hold is new work and a founder decision. Not real today.
- [ ] AnA's IND prompt through the 'ind-filing' key. From `module-intelligence.ts:1451`. Goes to: nothing is reached, because only /api/cortex/chat uses it. Leave it untouched. Not real today.

### Into RBM (`rbm`, outside the launch catalogue)

#### From `clinical-ops`
Admitting RBM, or moving both screens into a project step, is a founder decision.

- [ ] All-studies site-risk roster with country. From `ClinicalOps.tsx:722-744`. Goes to: an all-studies view, plus country on the board's site rows. Real today.
- [ ] Highest-risk site in the queue. From `ClinicalOps.tsx:614`. Goes to: a site item in buildAttentionFeed, or the Sites ranking accepted instead. Real today.
- [ ] Studies with enrolment. From `ClinicalOps.tsx:686-705`. Goes to: one canonical study record. Not real today.
- [ ] "Behind enrolment" queue items. From `ClinicalOps.tsx:395-406`. Goes to: with the study record. Not real today.
- [ ] Protocol deviations across studies. From `ClinicalOps.tsx:772-818`. Goes to: protocol-dev's deviation register. Not real today.
- [ ] Record a deviation. From `ClinicalOps.tsx:427-489`. Goes to: protocol-dev's "Report deviation". Not real today.
- [ ] DSMB and interim reviews. From `ClinicalOps.tsx:758`. Goes to: no backend exists. Not real today.
- [ ] AnA starters (enrolment, deviations, DSMB, database lock). From `ClinicalOps.tsx:603-608`. Goes to: with the study record and the deviation register. Real today.
- [ ] AnA sees the screen in the main conversation. From `ClinicalOps.tsx:500-586`. Goes to: the same. Real today.
- [ ] Study operations API with no screen. From `clinical-operations-routes.ts:165-790`. Goes to: decided with the study record. Attribute the prefix in the registry. Not real today.

### Into the conversation (`conversation-thread`)

#### From `ana-memory`
- [ ] See how AnA is tuned to me. From `AnaMemory.tsx:107,208-219`. Goes to: a read-only "What AnA remembers" panel in account settings or beside the conversation. Real today.
- [ ] "Things I got wrong" ledger. From `AnaMemory.tsx:223-232`. Goes to: the same panel, including the project-scoped profile. Real today.
- [ ] Organisation memory atoms. From `AnaMemory.tsx:119`. Goes to: held until a writer exists. Not real today.
- [ ] Filter atoms. From `AnaMemory.tsx:243-252`. Goes to: with the list. Not real today.
- [ ] Verify an atom. From `AnaMemory.tsx:136-149`. Goes to: with the list. Not real today.
- [ ] Supersede an atom (API). From `mdx-ana-memory.ts:201`. Goes to: with the list. Not real today.
- [ ] See superseded atoms. From `AnaMemory.tsx:282-292`. Goes to: with the list. Not real today.
- [ ] List and pin conversations (API). From `mdx-ana-memory.ts:246,288,314`. Goes to: pinning on /api/chat/threads, if wanted. Not real today.

### Into administration (`admin-console`)

#### From `template-library`
- [ ] Template list with source file and confidence. From `TemplateLibrary.tsx:607-623`. Goes to: verified templates not behind a design migrated into named designs, with the source file shown. Real today.
- [ ] Extraction confidence. From `TemplateLibrary.tsx:558-566`. Goes to: shown beside the warnings in the letterhead designer. Real today.
- [ ] Discard an unsaved extraction. From `TemplateLibrary.tsx:569`. Goes to: a revert-draft control in the designer. Real today.
- [ ] Full page preview: heading sizes, spacing, sample table. From `TemplateLibrary.tsx:109-171`. Goes to: CompanyLetterheadPreview. Real today.
- [ ] Full specification readout. From `TemplateLibrary.tsx:175-235`. Goes to: a readout of the attributes the designer omits. Real today.
- [ ] Detected form fields. From `TemplateLibrary.tsx:648-660`. Goes to: design detail, or a founder confirmation that they are not needed. Real today.
- [ ] Named Word styles. From `TemplateLibrary.tsx:661-672`. Goes to: design detail. Real today.
- [ ] Mark a template verified. From `TemplateLibrary.tsx:393-409`. Goes to: not carried as a toggle. Lock PUT and DELETE on rows that back a design. Real today.
- [ ] Render a specimen to PDF. From `templates.ts:253-262`. Goes to: a PDF proof beside the Word proof. Real today.
- [ ] Ask AnA to adjust a template. From `TemplateLibrary.tsx:441-445`. Goes to: nothing. The designer fields are the edit path. Not real today.
- [ ] Ask AnA to apply a template to a document. From `TemplateLibrary.tsx:737-739`. Goes to: the editor's publish phase, where export applies the active design. Not real today.
- [ ] docTypes chip. From `TemplateLibrary.tsx:629`. Goes to: drop. Not real today.
- [ ] ai-actions template handlers. From `shared-utils.ts:212,257-258`. Goes to: retired, or repointed at company designs. Not real today.
- [ ] AnA selects a template. From `TemplateLibrary.tsx:279-323`. Goes to: optionally, a select-design action. Real today.
- [ ] AnA sees the library state. From `TemplateLibrary.tsx:459-515`. Goes to: company-design state in admin-console's context. Real today.

#### From `setup`
- [ ] Rename the organisation under a reason. From `AdminSurfaces.tsx:435-447`. Goes to: a Profile card in admin-console Settings. Real today.
- [ ] Choose the client type. From `AdminSurfaces.tsx:472-483`. Goes to: admin-console Settings. Real today.
- [ ] Open the Identity console. From `AdminSurfaces.tsx:536`. Goes to: a link on the SSO tab. Real today.
- [ ] Choose the gateway account. From `GatewayAccountsSetting.tsx:100-150`. Goes to: mounted in Settings, and offered at Submit on the first transmit. Real today.
- [ ] Gateway account status. From `GatewayAccountsSetting.tsx:166-180`. Goes to: with that mount. Real today.
- [ ] Session timeout and concurrent sessions. From `SessionPolicySetting.tsx:56-98`. Goes to: mounted in Settings, replacing the row that only asks AnA. Real today.
- [ ] Require PDF/A. From `PdfARequirementSetting.tsx:90-129`. Goes to: mounted in Settings. Real today.
- [ ] See the retention period. From `RetentionPeriodCard.tsx:193`. Goes to: mounted in Settings. Real today.
- [ ] Set the retention period. From `RetentionPeriodCard.tsx:130-181`. Goes to: mounted in Settings. Real today.
- [ ] List, place and lift legal holds. From `LegalHoldsCard.tsx:140-240`. Goes to: mounted in Settings, with "Place legal hold" also in Vault. Real today.
- [ ] Ask AnA to summarise the configuration. From `AdminSurfaces.tsx:300-376`. Goes to: admin-console's context. Real today.
- [ ] GAMP 5 validation kit. From `AdminSurfaces.tsx:1762-1874`. Goes to: a card in Settings. Not real today.

### Into protocol development (`protocol-dev`)

#### From `report-engine`
- [ ] Paste a protocol synopsis. From `ReportEngine.tsx:617`. Goes to: ProtocolSourceIntake. No further work is named. Real today.
- [ ] Extract the protocol's fields. From `ReportEngine.tsx:404-420`. Goes to: delete the caller of the missing analyser. Real today.
- [ ] Flag N below 60 or duration below 12 weeks. From `ReportEngine.tsx:414-417`. Goes to: the rule pack, only if the founder wants these as rules. Real today.
- [ ] Compare with similar studies. From `ReportEngine.tsx:452-462`. Goes to: an AnA action in the protocol's check phase that runs compare_proposed_design_to_precedent after project_csr_evidence. Not real today.
- [ ] Design Recommendations document. From `ReportEngine.tsx:90-121`. Goes to: superseded by that action. Not real today.
- [ ] Statistical Insights document. From `ReportEngine.tsx:123-162`. Goes to: AnA narration beside the Statistics tab. The 15% attrition figure is not carried. Not real today.
- [ ] IND readiness memo. From `ReportEngine.tsx:256-332`. Goes to: AnA narration on the Compliance tab. Real today.
- [ ] Governed evidence report tabs. From `ReportEngine.tsx:353-388`. Goes to: drop. Not real today.
- [ ] Save the analysis as a Module 5 document. From `ReportEngine.tsx:563-578`. Goes to: the AnA action saves through authoringHandoff. Real today.
- [ ] CSR intelligence library panel. From `ReportEngine.tsx:676-725`. Goes to: a lens in Reporting & analytics. Real today.

#### From `protocol-designer`
- [ ] Statistical analysis plans. From the catalogue row. Goes to: the biostatistics work area (outside launch). Not real today.
- [ ] Adaptive trial frameworks. From the catalogue row. Goes to: biostat-workbench and AnA. Not real today.
- [ ] Grant or revoke the module. From `MasterLicensing.tsx:466`, `app-registry.ts:79`. Goes to: moduleId repointed to protocol-dev, with the row kept as history. Real today.
- [ ] AnA prompts switched on by the grant. From `lumen-instruction-engine.ts:748,777`. Goes to: protocol-dev added to both lists. Real today.

### Into CMC / Module 3 (`cmc`)

#### From `cmc-wizard`
- [ ] ICH Q-series coverage, including Q12–Q14. From the catalogue row. Goes to: do not advertise Q12–Q14 until something checks them. Not real today.
- [ ] Grant or revoke the module. From `app-registry.ts:84`. Goes to: moduleId repointed to 'cmc'. Real today.
- [ ] AnA prompts switched on by the grant. From `lumen-instruction-engine.ts:743,775`. Goes to: 'cmc' added to both lists. Real today.

### Into Inconsistency (`inconsistency`, outside the launch catalogue)

#### From `pdev-contradictions`
- [ ] Contradictions for the program. From `Contradictions.tsx:129-163`. Goes to: Inconsistency's board and scan routes accept the program UUID, and pdev's bridge is scoped to the program. Not real today.
- [ ] Severity and blocking count. From `Contradictions.tsx:81-94,141`. Goes to: with the UUID binding. Real today.
- [ ] Authority state. From `Contradictions.tsx:145-149`. Goes to: with the binding. Real today.
- [ ] Object A against object B. From `Contradictions.tsx:151-155`. Goes to: with the binding. Real today.
- [ ] Type and review state. From `Contradictions.tsx:156-158`. Goes to: with the binding. Real today.
- [ ] Detection date. From `Contradictions.tsx:158`. Goes to: createdAt shown on Inconsistency rows. Real today.
- [ ] Regulatory body. From `Contradictions.tsx:195-196`. Goes to: Inconsistency's overlay label. No further work is named. Not real today.
- [ ] Ask AnA to triage. From `Contradictions.tsx:97-105`. Goes to: with the binding. Real today.
- [ ] AnA sees the registry state. From `pdev/App.tsx:352-375`. Goes to: with the binding. Real today.
- [ ] Open object A or object B. From `Contradictions.tsx:198-217`. Goes to: the conflicting passage, opened from the editor's check panel. Not real today.
- [ ] AnA selects a contradiction. From `Contradictions.tsx:49-76`. Goes to: an inconsistency.select-finding action. Real today.

### Into Vault (`vault`)

#### From `artifacts-center`
- [ ] AnA-drafted artifacts across all projects. From `artifacts-center-routes.ts:187-298`. Goes to: a "Drafted by AnA" branch in the project Vault read covering every artifact, plus an organisation-wide listing. Real today.
- [ ] Kind, format, model and project for each artifact. From `AdminSurfaces.tsx:1621-1678`. Goes to: on the leaf. Real today.
- [ ] Signed on the current version (four states). From `AdminSurfaces.tsx:1680-1703`. Goes to: the Vault read. Real today.
- [ ] Cited-source count and human review. From `AdminSurfaces.tsx:1660-1663`. Goes to: on the leaf. Real today.
- [ ] Governed DOCX download. From `artifacts-center-routes.ts:338-491`. Goes to: Vault's detail pane, for every row. Real today.
- [ ] Open an artifact in the editor. From `AdminSurfaces.tsx:1725-1731`. Goes to: AnA-draft leaves open through authoring.open-document. Real today.
- [ ] CSV index. From `AdminSurfaces.tsx:1563-1603`. Goes to: a CSV manifest of AnA-draft rows. Real today.
- [ ] Follow the work after a Live Drive turn. From `V2App.tsx:675-689`. Goes to: retargeted to 'vault'. Real today.
- [ ] AnA focuses an artifact. From `surface-actions.ts:591-592`. Goes to: a vault focus-document action. Real today.
- [ ] AnA sees the gallery. From `AdminSurfaces.tsx:1483-1523`. Goes to: Vault's context. Real today.
- [ ] Catalogue entry and launch module. From `20260810_reconcile_module_catalog.sql:311`. Goes to: retired. Vault is free at the same tier. Real today.

#### From `device-vault`
Do not carry the unbacked subtitle "SHA-256 chained · 7-year minimum retention".

- [ ] Every document of the device project. From `mdx-vault.ts:107-298`. Goes to: the same AnA-draft branch, across all CTD sections. Real today.
- [ ] Status, version and author on each row. From `VaultSurface.tsx:59-105`. Goes to: on the leaf. Real today.
- [ ] Folder rail by family. From `useVault.ts:157-176`. Goes to: the branch grouped by CTD module. Real today.
- [ ] KPI strip. From `useVault.ts:179-197`. Goes to: a status breakdown for AnA-draft rows. Real today.
- [ ] Filter by framework. From `DocumentsPanel.tsx:111-153`. Goes to: Vault's type and CTD filters. Real today.
- [ ] Ask AnA from each row. From `DocumentsPanel.tsx:272-282`. Goes to: optionally, on AnA-draft leaves. Real today.
- [ ] Detail drawer with content hash. From `VaultSurface.tsx:296-343`. Goes to: hash and author on AnA-draft leaves. Real today.
- [ ] Version history of an authored artifact. From `mdx-vault.ts:358-398`. Goes to: Vault's detail pane. Real today.
- [ ] Recent audit trail. From `mdx-vault.ts:412-439`. Goes to: Vault's detail pane. Real today.
- [ ] Download button (a chat prompt only). From `VaultSurface.tsx:345-357`. Goes to: the export carry-over above. Not real today.
- [ ] Preview button (a chat prompt only). From `VaultSurface.tsx:358-365`. Goes to: the existing viewer. No further work is named. Not real today.
- [ ] Catalogue entry and device feature listing. From `20260810_reconcile_module_catalog.sql:316`. Goes to: retired, removed from the feature list. Real today.

### Into Communication Center (`communication-center`)

#### From `agency-meetings`
Widening the ha_interactions CHECKs must be conditional on `pg_get_constraintdef` (Rule 1).

- [ ] List agency meetings. From `AgencyMeetings.tsx:603-625`. Goes to: c2c_agency_meetings converged onto ha_interactions, or both read until converged, at Plan and Respond. Real today.
- [ ] Meeting detail. From `AgencyMeetings.tsx:628-650`. Goes to: a detail view with a status update. Real today.
- [ ] Request a meeting (governed). From `AgencyMeetings.tsx:326-409`. Goes to: a request form at the Plan step, with Q-Sub, INTERACT, Health Canada, centres and notified bodies admitted. Real today.
- [ ] Meeting count. From `AgencyMeetings.tsx:551-555`. Goes to: Respond or Plan. Real today.
- [ ] Next meeting. From `AgencyMeetings.tsx:419-425`. Goes to: from scheduled_date. Not real today.
- [ ] Open questions and commitments. From `AgencyMeetings.tsx:426-437`. Goes to: from ha_interaction_questions. Not real today.
- [ ] Read the briefing book. From `AgencyMeetings.tsx:652-700`. Goes to: the IND lifecycle briefing book and an editor document. Not real today.
- [ ] Open the briefing-book document. From `AgencyMeetings.tsx:660-665`. Goes to: that specific document in the editor. Not real today.
- [ ] Briefing book PDF. From `AgencyMeetings.tsx:252-324`. Goes to: IND lifecycle already renders it. Not real today.
- [ ] Minutes, agreements and commitments arising. From `AgencyMeetings.tsx:728-753`. Goes to: on the interaction at Respond, with commitments in the register. Not real today.
- [ ] Prepare the meeting with AnA. From `AgencyMeetings.tsx:534-547`. Goes to: a door at Plan. Real today.
- [ ] Draft the briefing book with AnA. From `AgencyMeetings.tsx:701-725`. Goes to: a door on the meeting detail. Real today.
- [ ] AnA opens a named meeting. From `surface-actions.ts:1249-1250`. Goes to: a select-interaction action. Real today.
- [ ] AnA sees meetings and briefing structure. From `AgencyMeetings.tsx:448-515`. Goes to: selected-interaction facts. Real today.
- [ ] Arriving from the journey and the demo script. From `BiopharmaJourney.tsx:549-557`, `demo-scripts.ts:293-294`. Goes to: retargeted. Real today.
- [ ] Catalogue entry. From `20260810_reconcile_module_catalog.sql:328`. Goes to: grants mapped onto communication-center. Real today.

#### From `pdev-fda-interactions`
- [ ] One timeline of every FDA touchpoint. From `FdaStream.tsx:96-138`. Goes to: a chronological view at Respond. Drop the q_sub and fda_communications reads, which are organisation-wide. Real today.
- [ ] Header counts. From `FdaStream.tsx:75-84`. Goes to: commitments not yet in Plan deliverables. Real today.
- [ ] Proposed matches from commitments to plan activities. From `pdev-fda-feedback-rollup.ts:136-169`. Goes to: the same rollup over ha-interaction commitments, as an AnA action at Respond. Real today.
- [ ] Apply a rollup (governed). From `FdaStream.tsx:171-207`. Goes to: a governed apply into Plan deliverables. Real today.
- [ ] AnA reads the stream (command). From `pdev-command-handlers.ts:292-306`. Goes to: repointed to the converged view, or retired. Real today.
- [ ] "Blockers only" (a chat prompt). From `FdaStream.tsx:86-92`. Goes to: optionally, a filter on the commitment register. Not real today.
- [ ] AnA sees the counts. From `pdev/App.tsx:378-395`. Goes to: Communication Center's context. No further work is named. Real today.

### Into device diagnostics (`device-diagnostics`)

#### From `ivd-completeness`
The workbench's store (`20260610_ivd_assessments.sql`) is on no deploy applier, so saving and listing work only where install-fresh ran.

- [ ] IVDR technical-file completeness verdict. From `IvdCompleteness.tsx:101-120`. Goes to: the readiness panel of the IVDR workspace, scoped to the program, at the IVD Submit step. Real today.
- [ ] Stat tiles. From `IvdCompleteness.tsx:229-234`. Goes to: with the panel. Drop the flags tile. Real today.
- [ ] Classification and GSPR items. From `IvdCompleteness.tsx:236-276`. Goes to: status and % beside the existing panels. Real today.
- [ ] Per-study analytical and clinical items. From `ivd-completeness-routes.ts:207,217`. Goes to: the uncalled per-study routes read into the performance panels. Real today.
- [ ] Scientific validity, PER and PMPF. From `ivd-completeness-routes.ts:196`. Goes to: a PER panel. Real today.
- [ ] Ask AnA to build a family's section. From `IvdCompleteness.tsx:268-270`. Goes to: beside the items. Real today.
- [ ] Deterministic Annex VIII classification, saved. From `IvdAssessmentWorkbench.tsx:41-94`. Goes to: the classification panel, with its migration put on C2C_MIGRATION_FILES. Real today.
- [ ] Draft a Field Safety Notice. From `IvdAssessmentWorkbench.tsx:26-39`. Goes to: device post-market at Respond. Real today.
- [ ] List saved IVD records. From `IvdAssessmentWorkbench.tsx:116-123`. Goes to: the workspace. Real today.
- [ ] Read a saved record. From `IvdAssessmentWorkbench.tsx:124-132`. Goes to: the workspace. Real today.
- [ ] Create a verified working copy in Authoring. From `IvdAssessmentWorkbench.tsx:111-112`. Goes to: the workspace. Real today.
- [ ] Refresh, with the double-submit guard. From `IvdAssessmentWorkbench.tsx:65-100`. Goes to: with the forms. Real today.
- [ ] AnA sees the completeness facts. From `IvdCompleteness.tsx:130-176`. Goes to: device-diagnostics' context. Real today.
- [ ] Catalogue entry and feature listing. From `20260810_reconcile_module_catalog.sql:304`. Goes to: grants mapped, and the id removed. Real today.

### Into CSR workflow (`csr-workflow`, itself folding into document authoring)

#### From `csr-author`
Map csr-author grants to csr-workflow and repoint `clinical_csr.moduleId` (`app-registry.ts:87`).

- [ ] AnA prompt routing keyed on csr-author. From `lumen-instruction-engine.ts:741-783`, `module-intelligence.ts:1391-1395`. Goes to: csr-workflow added to the lists and to the doc-canvas case. Real today.
- [ ] CSR narrative generation. From the catalogue row. Goes to: the board opened inside the CSR document in document authoring. Not real today.
- [ ] Safety tables and efficacy analysis. From the catalogue row. Goes to: §11 drafted in the editor. No table generation exists. Not real today.
- [ ] Appendix management. From the catalogue row. Goes to: never built. Founder decision. Not real today.

### Into 510(k) (`device-510k`)

#### From `510k-submission`
Map grants and repoint `substantial_equiv.moduleId` (`app-registry.ts:91`).

- [ ] AnA's default device intelligence key for medtech organisations. From `module-intelligence.ts:1377-1381,1440,1451,1458`. Goes to: remapped or aliased to device-510k. Do not delete it. Real today.
- [ ] Performance testing matrix. From the catalogue row. Goes to: never built. Founder decision, or a statement that eSTAR §17–19 covers it. Not real today.

### Into device engineering (`device-engineering`)

#### From `design-controls`
- [ ] The organisation's design inputs. From `DesignControls.tsx:155`. Goes to: rows rendered in device-engineering, after an additive program_id column is added. Real today.
- [ ] Traceability matrix. From `DesignControls.tsx:479-509`. Goes to: the design-controls section. Real today.
- [ ] Gap breakdown and the "close the first gap" action. From `DesignControls.tsx:448-476`. Goes to: the same section. Real today.
- [ ] Nine-element ISO 13485 §7.3 checklist. From `DesignControls.tsx:108-137,512-534`. Goes to: the unreached engine `server/services/regulatory/design-controls.ts`. Real today.
- [ ] Add a design input. From `DesignControls.tsx:261-302`. Goes to: a form that records the program id. Real today.
- [ ] Per-row AnA asks. From `DesignControls.tsx:472-529`. Goes to: the same section. Real today.
- [ ] "Store not provisioned" state. From `DesignControls.tsx:416-431`. Goes to: the trace panel reports 42P01. Real today.
- [ ] AnA context for the DHF. From `DesignControls.tsx:324-389`. Goes to: device-engineering's context. Real today.
- [ ] Record V&V results. From the catalogue row. Goes to: never built. A write route and UI in device-engineering. Not real today.

#### From `risk`
- [ ] Organisation-wide hazard register. From `Risk.tsx:154`. Goes to: every row shown. The write sends programId, and the orphaned rows are assigned. Real today.
- [ ] 5×5 matrix with initial and residual views, zones and legend. From `Risk.tsx:670-700`. Goes to: device-engineering's heatmap. Real today.
- [ ] Hazard detail. From `Risk.tsx:719-736`. Goes to: a drawer, with the missing columns added to the query. Real today.
- [ ] Risk-file metrics and lead. From `Risk.tsx:590-666`. Goes to: the existing `iso-14971-risk.ts` engine. Real today.
- [ ] Add a hazard. From `Risk.tsx:430-458`. Goes to: a form that sends programId. Real today.
- [ ] Add a risk control. From `Risk.tsx:464-493`. Goes to: hazard rows. Real today.
- [ ] Accept residual risk. From `Risk.tsx:500-520`. Goes to: a governed human act. Real today.
- [ ] A hazard's controls and verification. From `Risk.tsx:738-764`. Goes to: render text device-engineering already receives. Not real today.
- [ ] Verification-of-effectiveness evidence. From the catalogue copy. Goes to: fields over PATCH /api/mdx/risk-controls/:id. Not real today.
- [ ] Benefit-risk line and drafting asks. From `Risk.tsx:713-717`. Goes to: device-engineering. Real today.
- [ ] AnA drives the matrix. From `surface-actions.ts:502-545`. Goes to: re-registered, with two demo tours retargeted. Real today.
- [ ] AnA screen context. From `Risk.tsx:364-424`. Goes to: device-engineering. Real today.
- [ ] AnA entity context for a selected hazard. From `Risk.tsx:177-183`. Goes to: set on hazard selection. Real today.
- [ ] Residual scoring, control status, risk summary (API). From `mdx-risk-management.ts:201-386`. Goes to: reached from device-engineering. Real today.

### Into Tasks (`tasks`)

#### From `device-tasks` (safe to fold; these are optional)
- [ ] List-view columns. From `Workbench.tsx:287-327`. Goes to: optional. Not real today.
- [ ] "Mine" filter. From `Workbench.tsx:196-199`. Goes to: owner id on cards from other stores, so that My tasks includes them. Not real today.
- [ ] Four KPI cards. From `Workbench.tsx:206-216`. Goes to: an optional KPI row. Not real today.
- [ ] Ask AnA from a card. From `Workbench.tsx:247-253`. Goes to: an optional Ask AnA on OtherStoreTaskDetail. Not real today.
- [ ] Card flags. From `Workbench.tsx:260-281`. Goes to: optional. Not real today.
- [ ] Overdue work for each owner. From `operating-layer.ts:223-231`. Goes to: optional, in Analytics. Not real today.

#### From `team-workspace` (safe to fold)
- [ ] Review workflows. From the catalogue row. Goes to: the Review step. No further work is named. Not real today.
- [ ] Real-time co-editing. From the catalogue row. Goes to: built but switched off (`featureFlags.ts:74-81`). Do not describe it as live. Not real today.
- [ ] Comment threads. From the catalogue row. Goes to: Review and the editor's comment rail. Not real today.
- [ ] Approval chains. From the catalogue row. Goes to: Review. Not real today.

### Into deep research (`deep-research`, outside the launch catalogue)

#### From `evidence-engine` (safe to fold)
- [ ] Record found literature. From the catalogue row. Goes to: AnA's record_literature and device-cer. Not real today.
- [ ] PICO extraction. From the catalogue row. Goes to: never built. Do not advertise it. Not real today.
- [ ] Meta-analysis. From the catalogue row. Goes to: never built as a tool. Correct AnA's Evidence Engine prompt (`module-intelligence.ts:1326`). Not real today.
- [ ] GRADE. From the catalogue row. Goes to: the same prompt correction (`:1316`). Not real today.
- [ ] Evidence gap analysis. From the catalogue row. Goes to: AnA's detect_evidence_gaps. Not real today.

### Into PMA (`device-pma`)

#### From `pma-submission`
- [ ] Post-approval surveillance. From the catalogue row. Goes to: never built. A known gap. Not real today.
- [ ] AnA's Dossier Manager prompt, gated on 'pma-submission'. From `lumen-instruction-engine.ts:758-767`. Goes to: device-pma added to submissionModules. This one-line change makes the fold safe. Real today.

## Safe to fold today

For each of these items, every function that is real today is already in the canonical. The evidence pair shows where the function is now and where the canonical already does it. "Before removing" is housekeeping, not a carry-over.

| Item | Into | Evidence pair | Before removing |
|---|---|---|---|
| regulatory-workspace | document-authoring | No function is real: v2 projects never write project_sections (`projectIntakeRequest.ts:34`). Opening a section: `BiopharmaProject.tsx:754` maps to `DocumentWorkbench.tsx:4146-4215` | Optional carry-overs read authoring sections |
| insight-synthesis | precedent-intelligence | Precedent mining: catalogue row `:97` maps to `PrecedentEngine.tsx:245-258`. CRL and RTF patterns map to `PrecedentEngine.tsx:465-485` | Keep the row deprecated, never deleted (FK cascade). The cross-study half lands on insights |
| dossier | project-home | No function is real (numeric id only, `Dossier.tsx:44-51`). The module map maps to `ProjectDossier.tsx:187-221` | Repoint the onNav('dossier') callers |
| dossier-map | project-home | Module completeness: `DossierMap.tsx:205-222` maps to `ProjectDossier.tsx:159-221` | Delete the route, assembler, registry and nav entries and catalogue row in one change |
| compliance-monitor | quality | Part 11 status maps to `Part11Console.tsx:128-134`. Audit analysis maps to `AdminSurfaces.tsx:695` and `ComplianceReports.tsx:42` | Keep the id on the knowledge-source allow-list for now |
| training | quality | The guided tour, `Training.tsx:89`, maps to `V2App.tsx:817` | None |
| ind-lifecycle | ind-checklist | The same component (`surfaceViews.ts:482-483`). The alias is `registryModel.ts:955` | Keep the alias for old links |
| ind-filing | ind-checklist | Forms map to `IndFormsPanel.tsx:267,295,415`. Annual reports map to `IndLifecycle.tsx:1091-1093` | Leave `module-intelligence.ts` untouched |
| device-tasks | tasks | Off-board work: `Workbench.tsx:175-188` maps to `TaskBoard.tsx:1057-1068`. New task: `Workbench.tsx:154-159` maps to `TaskBoard.tsx:971,747` | Delete only TasksSurface. Retarget `demo-scripts.ts:290` |
| team-workspace | tasks | Assignment maps to `TaskBoard.tsx:1723-1724,1864` and `PlanAssign.tsx` | Optionally drop the dead module-intelligence case |
| evidence-engine | deep-research | Literature search maps to `DeepResearch.tsx:293` | Correct the always-on Evidence Engine prompt |

authoring-engine, a retirement candidate, is also marked safe. Its conditions are in section 5.

## Former retirement candidates

These four items had no canonical. Each of their functions is placed in the product, or dropped with a reason.

### `coverage`: an engineering view, not a customer capability
The decision is the operator's: move it behind platform admin next to Licensing, or delete it and name `tests/ui/surface-registry-coverage.test.ts` and `scripts/ci/check-launch-scope.mjs` as the gates that already watch the registry.

| Function | Real today | Where it goes |
|---|---|---|
| Surface counts by readiness | No | A platform-admin tab, with readiness derived or labelled "declared" |
| "Backend connected" indicator | No | Drop or relabel. It only checks for a token |
| Filter by navigation tier | Yes | The operator tab, if kept |
| Search surfaces | Yes | The operator tab, if kept |
| Surface cards | Yes | The operator tab, if kept |
| Open a built surface | Yes | Already done by the rail, ⌘K and Plan & features |
| Cross-cutting concerns list | Yes | The operator tab, if kept |
| Ask AnA which surfaces are unwired | Yes | Drop, or keep with the operator tab |
| "Codebase coverage" menu entry for every user | Yes | Remove. If kept, gate it to platformAdmin |
| Command-palette row | Yes | Remove with the surface, or make it admin-only |

### `submission-twin`
Every score the twin shows is made by a model. Rule 3 history: the twin's dashboard was deleted twice before (`3ea8cc863`, `7a144fd1e`).

| Function | Real today | Where it goes |
|---|---|---|
| Load a package by id | Yes | Not needed. The package is the sequence open in Submission Center |
| Readiness and fragility scores | No | Submission Readiness inside Submit (`DispatchReadiness.tsx:328`). Drop the scores |
| Full twin assessment | No | If kept, an AnA check in the document check phase, scored deterministically |
| Narrative drift | No | Inconsistency and the document check. Today that means the AnA tools scan_document_citations and reconcile_device_documents |
| Simulated reviewer challenges | No | AnA, for meeting and response preparation, built from deterministic patterns |
| Change impacts | No | Founder decision: an AnA action in the editor built on preview_fact_impact |
| Next best artifact | No | The Project plan step's "What this filing needs" |
| AnA assemble_briefing_book | Yes | Reclassed to a launch surface (document-authoring or communication-center). Drop step 3b |
| AnA tools over the twin | No | Retire, or rebase on deterministic engines |
| Agent-mode chips | Yes | Already on ectd-compile and submission-center. Delete the entry |
| AnA reads the twin state | No | Nothing to carry |
| History and claims reads with no caller | No | Retire with the routes |

### `authoring-engine` (safe to retire)
Retire it before, or together with, the c2c-template migration in the admin-console group. Remove its surface actions (`surface-actions.ts:1012,1026`) and the registry's stray apiPrefixes.

| Function | Real today | Where it goes |
|---|---|---|
| Pipeline description | No | Drop. It is a static description |
| Twelve document types | No | The template picker already shows real metadata (`AuthoringTemplatePicker.tsx:5-35`) |
| Ask AnA to draft a CTD document | Yes | AnA and the document workspace |
| Template count | Yes | template-library's list header today, then the named designs in admin-console |
| Link to the template library | Yes | admin-console Settings |
| Four GxP automations | No | Drop. The real counterparts are AnA tools and the protocol finalize gate |
| Navigation shortcuts | Yes | Each target is its own place |
| AnA page context | Yes | Remove with the page |
| AnA surface actions | Yes | Remove with the page |

### `intelligence-catalog` (not safe yet)
Do not delete `Intelligence.tsx` wholesale. `PedigreeBadge` is imported by `Evidence.tsx:4`, `DispatchReadiness.tsx:3` and `ShadowReview.tsx:4`.

| Function | Real today | Where it goes |
|---|---|---|
| Browse AnA's deterministic tools by wave and domain | Yes | A read-only tools list in administration over GET /api/ana-tool-policy/catalog. Missing today |
| Trust-level legend | Yes | Keep PedigreeBadge, moved with its vocabulary and styles. Show the legend in the admin list |
| Filter tools | Yes | The admin list. Missing today |
| AnA filter action | Yes | Re-register it on the admin list, or remove it |
| Click a tool to ask AnA | Yes | The conversation already does this. Optionally add Ask AnA on admin rows |
| AnA screen context | Yes | Not needed |

## Per-group detail

Counts per merged item, followed by the functions the canonical already holds and the functions marked not applicable. The columns are: functions (Fns), present (Pres.), partial (Part.), missing (Miss.), not applicable (N/a), real today (Real), and whether the item can be folded today (Fold).

### document-authoring
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| batch-draft | 16 | 5 | 11 | 0 | 0 | 16 | No |
| csr-workflow | 13 | 3 | 4 | 6 | 0 | 5 | No |
| doc-journey | 7 | 2 | 3 | 2 | 0 | 7 | No |
| ectd-coauthor | 14 | 1 | 9 | 3 | 1 | 12 | No |
| source-tracer | 10 | 4 | 5 | 1 | 0 | 10 | No |
| doc-canvas | 8 | 4 | 1 | 2 | 1 | 3 | No |
| regulatory-workspace | 6 | 2 | 4 | 0 | 0 | 0 | Yes |

Present: refusing a truncated draft (`authoring.router.ts:132`). Editing before accept, discard and accept with lineage (`AuthoringAiDraft.tsx:471-499,566-570,533`). The accept receipt and retry (`DocumentWorkbench.tsx:3902-3933`). Opening a CSR section and asking AnA to draft it (`DocumentWorkbench.tsx:2692,4577-4582`). CSR chips (`registryModel.ts:560-566`). Opening a document in the editor, and continuing with AnA (`:4577-4582,6456,4486`). The AnA pane (`:4577-4582`). Citation standing, "ask what changed", unsupported claims and the citation audit (`:736-790,6050-6054`, `authoringOversight.ts:20`, `:5667-5700`). Template start, Word and PDF, versions and e-signatures (`AuthoringCreateExport.tsx:104-126`, `DownloadMenu.tsx:374-375`, `:5495,3479,5623,4486,5638`). Opening a section and AnA open-section (`:4146-4215,2692`).
Not applicable: the 'ectd-coauthor' entitlement id (repoint submission_center.moduleId). The doc-canvas toggle (refuse the id, or alias it).

### nda-cockpit
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| nda-bla | 5 | 0 | 4 | 1 | 0 | 1 | No |

### submission-center
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| maa-cockpit | 6 | 0 | 6 | 0 | 0 | 6 | No |
| nda-cockpit | 14 | 0 | 7 | 6 | 1 | 13 | No |
| shadow-review | 10 | 3 | 5 | 2 | 0 | 9 | No |
| device-submission | 10 | 1 | 6 | 2 | 1 | 7 | No |
| device-validation | 8 | 0 | 5 | 2 | 1 | 6 | No |

Present: switching lens, findings ranked by severity, and re-running a lens (`SubmissionSeqWorkspaces.tsx:1544-1554,1502-1531`, `ShadowFindingDisposition.tsx:250-299`). Starting a new submission (`SubmissionCenter.tsx:333-349`).
Not applicable: the cockpit's AnA tab switching (covered by submissions.set-workspace). The invented target-authority label (drop it). The program and section columns of blockers (that store has no such fields).

### labeling-pi
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| labeling-smpc | 5 | 0 | 4 | 1 | 0 | 5 | No |

### precedent-intelligence
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| insight-synthesis | 6 | 2 | 1 | 2 | 1 | 1 | Yes |

Present: precedent mining, and the CRL and RTF patterns (`PrecedentEngine.tsx:245-258,465-485`). Not applicable: the module toggle (the row stays deprecated).

### project-home
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| dossier | 4 | 1 | 3 | 0 | 0 | 0 | Yes |
| program-journey | 18 | 1 | 11 | 5 | 1 | 0 | No |
| dossier-map | 4 | 1 | 2 | 1 | 0 | 0 | Yes |
| haq-manager | 17 | 14 | 1 | 2 | 0 | 17 | No |
| client-portal | 5 | 0 | 1 | 4 | 0 | 0 | No |

Present: the module map, the readiness ring and module completeness (`ProjectDossier.tsx:104-221`). For haq-manager, fourteen functions run through the same AgencyInboxList and AgencyResponses on Respond (`ProjectRespond.tsx:165-176`): the letter card, AnA draft, triage and close, the generated task, recording a question, writing a response, e-signature approval, recording a commitment, withdrawing a question, classifying the CTD section, assigning an owner, marking a letter as asking nothing, the response history and the response package.
Not applicable: switching between BLA and NDA records (a project is one program).

### dispatch-readiness
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| orchestration | 15 | 0 | 7 | 8 | 0 | 0 | No |

### audit-trail
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| part11-console | 3 | 1 | 2 | 0 | 0 | 3 | No |

Present: verifying the audit_logs ledger chain (`AdminSurfaces.tsx:706,590-635,1010-1029`).

### projects
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| filings-catalog | 13 | 3 | 8 | 2 | 0 | 13 | No |
| device-workstream | 18 | 5 | 7 | 6 | 0 | 17 | No |
| cro-portfolio | 12 | 1 | 1 | 10 | 0 | 12 | No |
| mission-control | 16 | 3 | 9 | 4 | 0 | 9 | No |

Present: segment tabs (`AnaVerbs.tsx:265-276`). Starting a filing and going back (`Projects.tsx:378-466,496-498`). Listing and opening programs, average readiness, creating a program, honest states and AnA context (`Projects.tsx:1139,1095-1102,1405,1459-1473,1201-1280`). Opening the portfolio. Creating and selecting a program, and the mission-control AnA context (`Projects.tsx:378-466,1310`).

### ectd-compile
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| ectd-publishing | 9 | 0 | 1 | 8 | 0 | 9 | No |
| pdev-ind-assembly | 11 | 5 | 5 | 0 | 1 | 8 | No |

Present: module readiness (`EctdModuleReadiness.tsx:100-118`). The PDEV figure counts activity state, so show it on the Plan step as plan progress. Diagnosing gaps (`EctdCompile.tsx:1415,1542`). Compiling (`EctdCompile.tsx:1101`). The no-project warning (`:1385-1393`). AnA context (`:1135-1234`).
Not applicable: force-compile (the canonical compile has no readiness floor, so retire it).

### licensing
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| billing | 10 | 2 | 6 | 2 | 0 | 10 | No |

Present: the current plan, and "View all plans" or "Manage billing" (`LicensingSurface.tsx:281-300,240-244`).

### pdev
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| pdev-cmc | 24 | 3 | 16 | 5 | 0 | 1 | No |
| pdev-nonclinical | 24 | 3 | 16 | 5 | 0 | 1 | No |
| pdev-clinical | 24 | 3 | 16 | 5 | 0 | 1 | No |
| pdev-regulatory | 25 | 3 | 17 | 5 | 0 | 1 | No |

Present in each of the four: workstream progress (`pdev/surfaces/Overview.tsx:124-183`). The AnA workstream read, where the same command is scoped to 'pdev', so drop the four ids from the inventory group. The closed activity registry (AnA pdev.registry.list, inScope).

### device-cer
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| cer-generator | 15 | 5 | 5 | 5 | 0 | 1 | No |
| ce-marking | 7 | 1 | 3 | 3 | 0 | 1 | No |

Present: writing the CER and governed export (`GeneratorTab.tsx:1-17`, `useCerExport.ts:149`). Literature search, record and screen (`useCerLiterature.ts:5-8`). The PMCF plan (`useCerPostMarket.ts:113`). The structure check (`useCerStructure.ts:151`). device-cer's own module row. Clinical evaluation (`CerSurface.tsx`, `ProjectMdxWorkflow.tsx:27`).

### insights
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| device-analytics | 12 | 1 | 3 | 4 | 4 | 8 | No |
| report-governance | 9 | 0 | 6 | 3 | 0 | 8 | No |
| analytics-hub | 6 | 0 | 2 | 1 | 3 | 3 | No |

Present: saved report runs (`InsightsRunsPanel.tsx:134-196`).
Not applicable: peer cycle time, reviewer velocity and per-tool AnA usage (none has a data source). The pathway filter (only "All" works). Team performance (its home is Tasks, `TaskBoard.tsx:799-804`). Forecasting (refused under Rule 2). Subscription history (keep the row).

### pv-cockpit
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| pharmacovigilance | 9 | 1 | 4 | 4 | 0 | 8 | No |
| safety-signal | 8 | 1 | 3 | 1 | 3 | 5 | No |

Present: the hidden SAE line-listing and E2B tools, already classed to pv-cockpit. The expedited-report clock, the overdue count and the compliance matrix (`PvCockpit.tsx:129-144,292-335`).
Not applicable: the subscription toggle (keep it as history). The module-intelligence mapping (it has no effect). The app moduleId (set it to pv-cockpit).

### onboarding
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| onboarding-ingest | 9 | 0 | 5 | 4 | 0 | 9 | No |

### quality
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| qmp | 14 | 0 | 0 | 13 | 1 | 8 | No |
| compliance-monitor | 6 | 0 | 3 | 0 | 3 | 0 | Yes |
| training | 5 | 0 | 0 | 4 | 1 | 1 | Yes |

Not applicable: CER project quality metrics (501 by design). Part 11 status and audit-trail analysis (in administration and Reporting). The knowledge-source id. The guided tour (in the shell, `V2App.tsx:817`).

### ind-checklist
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| ind-lifecycle | 11 | 11 | 0 | 0 | 0 | 11 | Yes |
| ind-filing | 6 | 3 | 2 | 1 | 0 | 0 | Yes |

Present: all eleven ind-lifecycle functions run in the same component (`IndLifecycle.tsx`, `IndFormsPanel.tsx`, `IndApplicantIdentity.tsx`): the checklist, the 30-day clock, the cover letter, forms 1571, 1572 and 3674, program facts, the briefing book, the LoA and right of reference, the annual report, amendments, AnA drafting, and links to Vault and Submission Center. Forms, annual reports and end-to-end IND management (`IndLifecycle.tsx:433`).

### rbm
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| clinical-ops | 14 | 4 | 5 | 5 | 0 | 6 | No |

Present: enhanced-tier sites and visit scheduling (`RbmSurfacesB.tsx:384-460`). Recompute (`:341-360`). Central monitoring (`:107,203`). Risk drivers (`:363`).

### conversation-thread
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| ana-memory | 10 | 2 | 2 | 6 | 0 | 3 | No |

Present: asking AnA what she remembers, and whether a fact is still accurate (`ConversationThread.tsx:1239`).

### admin-console
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| template-library | 18 | 3 | 8 | 7 | 0 | 14 | No |
| setup | 14 | 2 | 3 | 9 | 0 | 13 | No |

Present: upload and extract (`CompanyDocumentSettings.tsx:53`). Save and stage a design (`:137`, `CompanyGovernedDesigns.tsx:42-52`). The Word proof (`:138-139`). The second-factor policy (`AdminAccess.tsx:683-688`). Company documents, which is the same component (`AdminAccess.tsx:701`).

### protocol-dev
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| report-engine | 12 | 2 | 7 | 3 | 0 | 8 | No |
| protocol-designer | 10 | 4 | 3 | 1 | 2 | 2 | No |

Present: asking AnA to refine, and the protocol AnA context (`ProtocolDev.tsx:66-131,239`). The Document, Objectives, Eligibility and SoA tabs (`ProtocolDevWorkspace.tsx:44-47`).
Not applicable: the unreachable module-intelligence key (drop it). The knowledge-source app id (replace or remove it).

### cmc
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| cmc-wizard | 10 | 5 | 2 | 1 | 2 | 2 | No |

Present: 3.2.S, 3.2.P, stability, batch analysis and process validation (`CmcModule.tsx:2195-2236,1395,2020-2088,2143`).
Not applicable: biologics (refused under P-28). The unreachable CMC-wizard prompt (wire it to 'cmc', or delete it).

### inconsistency
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| pdev-contradictions | 12 | 1 | 9 | 2 | 0 | 9 | No |

Present: the honest empty state (`Inconsistency.tsx:495-510`).

### vault
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| artifacts-center | 12 | 1 | 7 | 4 | 0 | 12 | No |
| device-vault | 18 | 4 | 12 | 0 | 2 | 15 | No |

Present: honest states (`Vault.tsx:191-208`). Selection, upload, AnA context and the load error (`Vault.tsx:1211-1220,787-845,1232-1321`).
Not applicable: the export-manifest prompt (do not carry it). The uncalled single-artifact read.

### communication-center
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| agency-meetings | 17 | 1 | 8 | 8 | 0 | 11 | No |
| pdev-fda-interactions | 8 | 1 | 1 | 6 | 0 | 7 | No |

Present: loading, empty and error states (`CommunicationCenter.tsx:158-187`).

### device-diagnostics
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| ivd-completeness | 15 | 1 | 4 | 10 | 0 | 15 | No |

Present: honest states and the project guard (`IvdSurface.tsx:197-249`, `MdxSurfaceHost.tsx:449-460`).

### csr-workflow
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| csr-author | 7 | 1 | 2 | 2 | 2 | 3 | No |

Present: the ICH E3 board (`BiopharmaProject.tsx:306-555`). Not applicable: the catalogue toggle (map grants) and app gating (repoint clinical_csr).

### device-510k
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| 510k-submission | 7 | 3 | 1 | 1 | 2 | 3 | No |

Present: predicate analysis, SE comparison and eSTAR (`K510Surface.tsx:120-145,635-735,738-820`). Not applicable: the catalogue toggle (map grants) and app gating (repoint substantial_equiv).

### device-engineering
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| design-controls | 9 | 0 | 5 | 4 | 0 | 8 | No |
| risk | 14 | 0 | 5 | 9 | 0 | 12 | No |

### tasks
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| device-tasks | 11 | 4 | 6 | 0 | 1 | 4 | Yes |
| team-workspace | 6 | 1 | 2 | 2 | 1 | 1 | Yes |

Present: board cards from other stores, off-board work, New task and AnA context (`TaskBoard.tsx:1093-1155,1057-1068,971,860-910`). Assignment (`TaskBoard.tsx:1723-1724,1864`).
Not applicable: the demo tour stop (retarget it to 'tasks'). The entitlement toggle (keep it as history).

### deep-research
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| evidence-engine | 7 | 1 | 1 | 4 | 1 | 1 | Yes |

Present: literature search (`DeepResearch.tsx:293`). Not applicable: the legacy ids (remove or remap them in three places).

### device-pma
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| pma-submission | 4 | 2 | 2 | 0 | 0 | 1 | No |

Present: pivotal-trial clinical evidence, and the manufacturing and QMS modules (`PmaSurface.tsx:196-268`).

### Retirement candidates (detail in section 5)
| Item | Fns | Pres. | Part. | Miss. | N/a | Real | Fold |
|---|---|---|---|---|---|---|---|
| coverage | 10 | 0 | 0 | 6 | 4 | 8 | No |
| submission-twin | 12 | 1 | 5 | 1 | 5 | 3 | No |
| authoring-engine | 9 | 0 | 1 | 0 | 8 | 6 | Yes |
| intelligence-catalog | 6 | 0 | 2 | 3 | 1 | 6 | No |
