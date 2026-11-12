# Nonclinical 2.4 and 2.6, and the Investigator's Brochure: what already exists, what is broken, and what waits

**Status:** map and questions, 2026-11-12. No design is chosen and nothing was built. **Decisions it sits under:**
P-74 item 2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`), P-55 R-1, RULES 2 to 6, P-122. **Row:** D2. **Session:**
`…01LjrcEe8y`. **Read at** `6920b28226`, read-only, by five readers and a critic (workflow `wf_ea905c23-a66`); the
critic re-checked 24 of the readers' claims against the code, 21 held, and its three corrections are applied below.

This is the "What already exists" that RULE 3 asks for before any design. Every piece below exists. The work to
come is to complete, reach, fix or converge it. Nothing here is to be built new.

## The short version

- **Composition exists and is model-free.** One composer for 2.4 (`buildM24NonclinicalOverview`) and one for 2.6
  (`server/services/preclinical/m26-nonclinical-summaries.ts`). They print stored values and compute nothing. AnA's
  two in-scope tools reach them through one governed reader, which takes only the open project's finalized studies
  and refuses figures supplied in the conversation.
- **That path cannot work on a deployed database.** The register it reads, `nonclinical_studies`, is created by a
  migration no deploy runs. And at launch nothing can put a study in it: the screen and the tool that create a study
  are both outside the catalog.
- **Launch already asks for the result.** An original IND is refused dispatch without leaves at 2.4, 2.6, 4.2.1 to
  4.2.3 and 1.14.4.1 (`server/services/ectd/required-sections.ts:308-318`). Today a person writes those in the
  editor, with AnA drafting prose. No composed 2.4 or 2.6 becomes a document the editor opens.
- **The report ingest breaks RULE 2 as it stands.** One model call extracts 20 fields, the NOAEL among them, and a
  second step copies seven of them into the governed register with nobody confirming a value. It is flag-off and
  refused in a release, so it harms no one today. None of P-74's four prerequisites is met for it.
- **The two screens are outside the catalog and locked in a release.** RULE 4 asks that their functions live in the
  one editor, for the 2.4, 2.6 and brochure document types. P-122 lets neither be removed without a founder
  decision and a test that the editor delivers the same.
- **An Investigator's Brochure is a document type already.** It is started from the IND plan or the template picker
  and worked in the one editor with the generic review, sign, export and file-to-Vault. What does not exist: an
  edition record, a data cut-off, the reference safety information, distribution to sites with acknowledgement.

## What already exists

Searched by the readers: preclinical, nonclinical, toxicology, tox, GLP, SEND, pharmacology, ADME, safety
pharmacology, genotox, FIH, first-in-human, NOAEL, MABEL, HED, IND-enabling, m4, module-4, m2_4, m2_6, m24, m26,
study report, investigator brochure, investigators_brochure, IB, 1.14.4.1, reference safety information, RSI, across
`server/routes`, `server/api`, `server/src`, `server/services`, `migrations`, `db/migrations`, `shared`,
`client/src/concept2cure`, `scripts` and AnA's tools and skills. Deleted files: `git log --all --diff-filter=D` on
`*rochure*`, `*nonclinical*`, `*preclinical*` finds five, among them
`client/src/concept2cure/v2/fixtures/investigator-brochure-data.ts` (`144488f041`) and
`client/src/modules/Module4NonclinicalPage.jsx` (`83fa7f6cfb`). The clone is shallow, so the search is partial.

### The report ingest (outside the catalog, flag off, refused in a release)

| Path | What it does today | What it does not | Who reaches it |
|---|---|---|---|
| `server/routes/preclinical.ts` | Takes one PDF by multipart upload (memory, 50 MB, byte check and malware scan, :176-199) and a ctd_programs id (:216). | No Vault document, data-room entry or project. Keeps no bytes: sourcePdfId is a caller string or a minted id (:233-236). | Mounted with authenticateToken at server/bootstrap/register-regulatory-routes.ts:447-448. No client caller. 503 unless PRECLINICAL_INGEST_ENABLED=true. |
| `server/services/preclinical/preclinical-extractor.ts` | Reads text through the shared OCR service and refuses unreadable, partly read or over-60,000-character reports (:90-125). One call, ai.structured (:147): alias claude-opus-4, taskType structured_output, temperature 0. | Sends no schema to the model (:152), though the prompt says "matches the supplied schema" and names 6 of 20 fields. Records no page for any value. Passes no organization or user to the gateway. | ingestStudy only. |
| `server/services/preclinical/preclinical-extraction-schema.ts` | Zod shape: NOAEL, LOAEL and MTD as strings, numeric safety-margin multiples, the model's own confidence. | No length caps against the varchar(50) columns, no date format, no primary pharmacology type. | Extractor, bridge, server/services/authoring/nonclinical-study-report-builder.ts:36. |
| `server/services/preclinical/preclinical-ingest-service.ts` | Inserts every extraction into ctd_nonclinical_studies (:96-124). When registration is requested, bridges in a second transaction with a chained audit row (:174-208). | Writes no audit row for the extraction. Holds no review state. Nothing reads the stored LOAEL, MTD, target organs or confidence. | The route. |
| `server/services/preclinical/preclinical-governed-bridge.ts` | Creates a nonclinical_studies row, status planned, with number, title, type, species, GLP, facility and NOAEL (:59-70), and a derived_from provenance link. | Drops key findings, duration, LOAEL, MTD, target organs and margins. Writes "GLP not stated" as false (:65), which 2.6.7 prints as non-GLP. | Ingest service. |
| `server/services/preclinical/nonclinical-program-loader.ts` | The one reader of ctd_nonclinical_studies, organization-checked through the parent program (:135-160). load-nonclinical-studies-for-project.ts and preclinical-intel-loader.ts read through it. | Reads nothing unless PRECLINICAL_REVIEWER_ENABLED=true. | AnA load_nonclinical_program (AnaToolExecutor.ts:5733, hidden under launch scope); the reviewer simulator (reviewer-simulator.service.ts:232); orchestrator Mode A (server/routes/submission-orchestrator.ts:688), refused outside development (:574-585). |
| `server/services/preclinical/m26-nonclinical-summaries.ts` | Deterministic 2.6 narrative, tabulated worksheets, gap list and completeness; nonclinical-m24-adapter.ts does the same for 2.4. No model. | Reads no database and assesses no readiness. | AnA draft_nonclinical_overview_m2_4 and draft_nonclinical_summaries_m2_6, through server/services/ana/module2-nonclinical-inputs.ts; server/services/nonclinical/m26-m4-view.ts behind /api/nonclinical-summary. |
| `server/services/preclinical/fih-dose-engine.ts` | HED, MRSD and MABEL, unrounded, refusing invalid input. Its Km table agrees with FDA 2005 Table 1 as I recall it (guidance not opened). | Not pinned to a published worked example: the tests recompute the same formula (__tests__/fih-dose-engine.test.ts:87-90). Never fed from records. | AnA compute_fih_dose over stated inputs (AnaToolExecutor.ts:5599); server/services/toxicology/toxicology-knowledge.ts:889. |
| `server/services/preclinical/tox-findings-classifier.ts` | Eight regex rules with cited references; escalates on adverse correlates; unknown findings are indeterminate. | Has no reference set: the tests assert its own outputs. No record path supplies findings. | AnA classify_tox_findings over stated inputs. |
| `server/services/preclinical/nonclinical-program-requirements.ts` | ICH M3(R2) and S-series battery, and gaps against listed studies. | Reads no records. | AnA assess_nonclinical_program; server/services/ana/nonclinical-safety-tool.ts (requirement list only). |
| `server/services/preclinical/nonclinical-safety-assessment.ts` | Integrated readiness verdict over the engines. | Nothing in production code calls it. | Tests only. AnA's assess_nonclinical_safety uses nonclinical-safety-tool.ts, which always answers not_assessed. |
| `server/services/preclinical/feature-flags.ts` | Both flags are on only for the literal 'true'. | Set in no env example or deploy config I found. | Route, ingest service, loader. |
| `migrations/0005_csr_knowledge_database.sql, migrations/20260508_preclinical_provenance.sql, migrations/20260610_nonclinical_send.sql` | Create ctd_programs and ctd_nonclinical_studies (0005:556, :695; provenance columns in 20260508) and nonclinical_studies and send_datasets (20260610:21, :48). | None of the three files is in C2C_MIGRATION_FILES. All are in scripts/ci/migration-deploy-path-baseline.json: install-fresh applies them, a deploy does not. | In the set: db/migrations/20260716_nonclinical_display.sql (scripts/db/migration-set.mjs:725) and the parent-scoped RLS (:84). nonclinical_studies has organization_id integer NOT NULL; ctd_nonclinical_studies has none and is scoped through ctd_programs (db/migrations/20260813_child_table_parent_scoped_rls.sql:309). |

### Composing 2.4 and 2.6, and the path to the eCTD

| Path | What it does today | What it does not | Who reaches it |
|---|---|---|---|
| `server/services/m2-summary-builders.ts` | buildM24NonclinicalOverview (:453), the only 2.4 composer, fed by server/services/preclinical/nonclinical-m24-adapter.ts:152. Prints supplied NOAELs (:513); inputSectionKeys are Module 4 section codes (:580). | Draws no safety conclusion (:479, :534). | AnA draft_nonclinical_overview_m2_4, inScope (server/services/ana/AnaToolExecutor.ts:5675). The package run's m2.4 step (server/services/submission-package-orchestrator.ts:1676) always skips: the program run passes no studies (server/routes/submission-orchestrator.ts:324). |
| `server/services/ana/module2-nonclinical-inputs.ts` | The R-1 reader: the open project's program, its submissions, then studies finalized, or in_reporting for an IND (:57-66). Refuses studies or findings supplied in the call (:106). Returns the summary with row ids and a snapshot hash (:131). | Saves no document (:123); passes no substance name or findings (:129-130). | The two inScope draft tools, class read (server/services/ana/tool-authorization.register.json). |
| `server/routes/nonclinical-summary.routes.ts` | GET projects 2.6 subsection presence, 4.2.x percent finalized and a SEND rollup. POST /document renders the composed 2.6 to HTML and inserts a coauthor_documents row (:124). | Reads every org study in any status (server/services/nonclinical/nonclinical-service.ts:209-243). The Module 4 row reads study status, not leaves. The saved row has no project, version or leaf. | GET: client/src/concept2cure/v2/surfaces/Nonclinical.tsx:325, a surface outside LAUNCH_SURFACE_IDS. POST: tests only. |
| `server/routes/nonclinical.ts` | Governed registry: creates a study (derives ctd_section, links provenance), sets status, records a declared SEND package, runs the SEND readiness gate. | No route edits a study's fields. Nothing writes duration_label, key_finding or finding_class. No link to a Vault document or leaf. | Nonclinical.tsx:302,366,520 (locked surface); AnA create_nonclinical_study and review_send_readiness (hiddenApp, server/services/ana/ana-launch-scope.inventory.json). PATCH status (:162) and PUT send (:184): no caller. |
| `server/services/authoring/nonclinical-study-report-builder.ts` | A model drafts each section of a Module 4 study report from an extracted study (:116, :438). | Not tied to a governed study. | buildNonclinicalStudyReport: nothing. Its ctdSection and disciplineFor serve server/services/authoring/m4-nonclinical-qc.ts:32. |
| `server/services/toxicology/toxicology-knowledge.ts` | Deterministic calculators behind inScope AnA tools (compute_fih_dose, calculate_safety_margin, classify_tox_findings, calculate_ttc, design_*); one Km table (:887-895). | Read no records, write no document; labelled stated inputs (AnaToolExecutor.ts:5604). | AnA chat. |
| `server/services/authoring/builtin-authoring-templates.ts` | The document start's catalog (server/routes/authoring.router.ts:1176; client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx:219). Offers 2.4 (registry:ICH_NONCLIN_OVERVIEW, component:nonclinical_overview, IND m2.4), 2.6 (registry:ICH_NONCLIN_SUMMARY, IND m2.6.1-7) and Module 4 (ICH_CTD_M4, component:nonclinical_study_report, IND m4.2.x). | The editor shows no nonclinical function for these types. 2.4's entries overlap; the CSR's pair was deduplicated (:150). The picker groups by the project's filing, not client type (client/src/concept2cure/v2/surfaces/AuthoringTemplatePicker.tsx:74-80); client type is the registry's segment filter (:137). | Launch: Authoring's New document. |
| `server/services/ectd/stf-generator.ts` | The eCTD path. CTD codes pass a shape rule (shared/regulatory/placement-vocabulary.ts). Leaves point at coauthor_documents or vault_documents (server/services/ectd/leaf-document-tables.ts:31-50). Study id and STF tag are entered at placement (AuthoringPlaceIntoFiling.tsx:216, VaultPlaceIntoSubmission.tsx:405, SubmissionSeqWorkspaces.tsx:385, all in client/src/concept2cure/v2/surfaces). The packager emits one STF per study (server/services/submission-gateways/regional-packager.ts:1299); Module 4 files need one, except 4.3 (shared/regulatory/ectd-leaf-rules.ts:57-62). | Nothing prefills section or study id from a registry study. | Launch: Submission Center. |

### The screens, the one editor and the document start

| Path | What it does today | What it does not | Who reaches it |
|---|---|---|---|
| `client/src/concept2cure/v2/surfaces/Nonclinical.tsx` | Live, no fixture. GET /api/nonclinical/studies (:301): study list (:689). GET /api/nonclinical-summary (:324): header figures (:644), SEND rollup (:720), Module 4 placement bars (:798), 2.6.1 to 2.6.7 states (:821). 'Add study' governed form, POST .../studies (:520). 'Run SEND conformance', GET .../studies/:id/send-readiness (:366). Derived queue (:403), four starters (:649), 'Draft M2.6 summary' ask (:667), AnA context (:624). | No upload, report ingest, status change or SEND entry. Not project-scoped. Module 4 rows open the project's Author step (v2/registryModel.ts:964); 2.6 rows open the editor naming no document or section (:832). | UI_SURFACES shared/constants/ui-surface-registry.ui-v2.ts:935; SURFACE_VIEWS v2/surfaceViews.ts:490; not on the rail (v2/registryModel.ts:168). In a release ⌘K omits it (v2/Shell.tsx:1219) and its address shows the lock panel (v2/LaunchScopeGate.tsx:35). Enforcement off: ⌘K page search, program-journey chips (v2/surfaces/BiopharmaJourney.tsx:141), address. |
| `client/src/concept2cure/v2/surfaces/InvestigatorBrochure.tsx` | One live read, GET /api/investigator-brochure (:77): required-sections-ready percentage and counts (:174); the ICH E6(R3) Appendix A section tree with Ready, Partial or Missing inputs, descriptions and 'Needs:' gaps (:188). 'Ask AnA' draft prompt (:141). Method note (:234). AnA context with documentType ICH_IB (:108). | No write, upload, navigation or document (onNav unused, :72). Drops the response's meta: provisioned, pendingStore, productName, sources. Organization-wide. | UI_SURFACES shared/constants/ui-surface-registry.ts:807; SURFACE_VIEWS v2/surfaceViews.ts:468. No in-app navigation names it: ⌘K page search and address only, enforcement off. Locked in a release. |
| `client/src/concept2cure/v2/surfaces/PdevSurfaces.tsx` | pdev-nonclinical mounts the pdev kit's nonclinical workstream: IND-enabling activity states, evidence and provenance (client/src/concept2cure/pdev/hooks/usePdevData.ts:277). | Not Module 4, SEND, 2.6 or the IB. | pdev Overview workstream cards (:77); AnA navigation (shared/navigation/index.ts:238). pdev is outside launch: locked in a release. |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` | The one editor, over the authoring store. One type-specific section: isCsrTemplateId(docTemplateId) mounts StudyDataBuild, the 'Build from the study's data' disclosure (:5099; v2/editor/StudyDataBuild.tsx:138). Outline (:4357), filing gaps (:4529), per-section template guidance (:5329), AnA context (:2168). | Nothing type-specific for a 2.4, 2.6 or IB document. | Launch surface document-authoring (shared/constants/launch-scope.ts, Authoring app); the conversation canvas mounts it (v2/editor/DocumentCanvas.tsx). |
| `client/src/concept2cure/v2/surfaces/ProjectBiotechPlan.tsx` | The document start. The project's Plan step lists the filing's document templates (:121-128; v2/surfaces/ProjectPlan.tsx:167); the editor's 'New document' dialog holds the template picker (v2/surfaces/AuthoringCreateExport.tsx:269). The types exist as data: nonclinical_overview, 2.4 (server/services/market-specs/document-template-library.ts:271); investigators_brochure (:408); ICH_NONCLIN_SUMMARY, 2.6 (shared/regulatory/global-document-registry.ts:512). | I did not open the running picker to confirm the three are offered for a project. | Both hosts are launch surfaces (project-home, document-authoring). |
| `scripts/ci/one-product-baseline.json` | Lists investigator-brochure (:52), nonclinical (:63) and pdev-nonclinical (:74). LAUNCH_APPS lists none (shared/constants/launch-scope.ts:52-271). | It never grows: a removed id returns only with a founderDecisions entry (scripts/ci/check-one-product.ts:33). | ci:one-product, pre-push. |

### The Investigator's Brochure

| Path | What it does today | What it does not | Who reaches it |
|---|---|---|---|
| `server/services/market-specs/document-template-library.ts` | The one IB outline, `investigators_brochure` (:407-421), basis ICH E6(R3) Appendix A labelled recall: three front-matter headings, body 1–6, sub-sections 4.1–4.3 and 5.1–5.3 (server/services/market-specs/ib-outline-detail.ts:10-27). | No `ctdSection`, no RSI heading, no edition or cut-off field. | Launch: `GET /api/authoring/templates` (server/routes/authoring.router.ts:1176); AnA chat template (server/services/ana-ri/document-templates.ts:433); seed `crossagency_ib`. Pinned by tests/regulatory/ib-one-outline.test.ts. |
| `server/services/authoring/ind-authoring-templates.ts` | Turns the IND plan deliverable `phase5.investigator_brochure` into an editor template: root 1.14.4.1 plus eight working headings from server/services/ind/ctd/authoring-guidance.ts:552-561, RSI and version control among them. | Does not use the canonical outline. | Launch: the project's Plan (client/src/concept2cure/v2/editor/IndDocumentLibrary.tsx:92). The Lumen demo starts it and sends it for review (scripts/demo/launch-demo/packs/lumen.mjs:170, :305). |
| `server/services/authoring/ib-builder.ts` | `IB_STRUCTURE` (:99-116); a deterministic gap engine (:301, :338, :352); `buildInvestigatorBrochure` (:220), which drafts each section through the model gateway (:411-424) or string templates. | Reads no store, saves nothing, creates no editor document. | Gap engine: the route and assembler. `buildInvestigatorBrochure`: tests only. |
| `server/services/authoring/investigator-brochure-view-assembler.ts` | One EXISTS probe per store for the organisation (:117-157: `nonclinical_studies`, `clinical_ops.studies`, `clinical_studies`, `adverse_events`, `risk_management_plans`, `cmc_module3_sections`), giving four booleans, a verdict per section and a percentage. | No project, product or study scope. Reads no content and no IB document. | Only server/routes/investigator-brochure.routes.ts:97. Seven PGlite cases. |
| `server/routes/investigator-brochure.routes.ts` | `GET /api/investigator-brochure` only (:89); mounted at server/bootstrap/register-inline-routes.ts:997. | No write, no project parameter. | Only the locked screen (InvestigatorBrochure.tsx:78). |
| `server/services/ana/skills/library/clinical.ts` | Skill `clinical.investigator-brochure` (:457-527): edition, cut-off, RSI, the DSUR's reference edition, annual review; drafts with `draft_authoring_document`. `generate_document` refuses an IB (server/services/ana/generate-document-refusals.ts:35). | No IB-specific tool. The text is a model draft. | AnA conversation, launch. |
| `shared/regulatory/regional-module1.ts` | Places the IB at 1.14.4.1 for a US IND (:297). The Vault's text rule (server/services/vault/vault-filing.service.ts:258) and the IND amendment category (server/services/ind-lifecycle/ind-amendment-service.ts:238-243) use it. | Does not record which edition a sequence carried. | Launch: Vault, Submission Center. |
| `shared/constants/domain/tmf-reference-model.ts` | Zone 2 essential artifact `investigators_brochure` (:76); Vault ingest type `IB` (shared/constants/domain/vault-taxonomy.ts:111). | No acceptance, receipt or acknowledgement artifact. | The eTMF inside the Vault (client/src/concept2cure/v2/surfaces/vaultTmf.ts:175). |
| `server/services/ind-lifecycle/ind-annual-report-service.ts` | Annual report section "Investigator's Brochure Revisions" (:261-273), from `ibChanges` typed into the request or the sponsor's "none" statement. | Reads no version history. The DSUR is headings only (server/services/safety-reports/psur-dsur-service.ts:84). Expectedness carries a free-text `rsi_reference`. | Launch: IndLifecycle.tsx:1104. |
| `server/routes/authoring.router.ts` | The one editor's lifecycle for every type: freeze :5392, export :6899, file-to-vault :7160, workflow :7300, sign :7738. Vault versions compare in VaultVersionCompare.tsx. | Nothing IB-specific; client/src/concept2cure/v2/editor has no IB match. | Launch. |

### What the five readers missed, found by the critic

| Path | What it does today | What it does not | Who reaches it |
|---|---|---|---|
| `server/services/ectd/required-sections.ts` | An original IND must carry leaves at 2.4, 2.6 and 4.2.1 to 4.2.3 (:308-318), and 1.14.4.1 from the region profile (shared/regulatory/regional-module1.ts:297). A missing one is an error (server/services/ectd/assess-dispatch-readiness.ts:148-151). | Checks that a leaf exists, not its source. | Launch: Submission Center's dispatch verdict. |
| `server/services/report-os/research-compliance-report-providers.ts` | Report nonclinical.study_send_register counts nonclinical_studies by status, and SEND rows declared passed (:259-262). | No project scope and no status rule. Not run against a database without the table. | Launch: Reporting's 'Nonclinical & CMC readiness' bundle (client/src/concept2cure/v2/surfaces/Insights.tsx:396). |
| `server/services/vault/document-catalog-governance.service.ts` | AnA's description of a Vault document is stored as suggested until a person confirms or corrects it, each step with a chained audit row (:225, :433). The Vault already has kind 'nonclinical' and a Module 4 folder (shared/constants/domain/vault-taxonomy.ts:148, :249). | Holds no typed study field and links no document to a nonclinical_studies row. Key-data shape not read. | Launch: Vault (client/src/concept2cure/v2/surfaces/VaultCatalogRecord.tsx:31-40). |
| `server/routes/iacuc.ts` | Governed animal-use protocols, cohorts and signed committee reviews (:104-230). nonclinical_studies has a foreign key to it (migrations/20260610_nonclinical_send.sql:24), and study links write provenance_links (server/services/nonclinical/nonclinical-service.ts:61, :65). | Neither creating migration is on a deploy (scripts/ci/migration-deploy-path-baseline.json:62-63). | Mounted (server/bootstrap/register-inline-routes.ts:402). Three hidden AnA tools (server/services/ana/AnaToolExecutor.ts:11251). No client caller. |
| `server/services/ana/skills/library/nonclinical.ts` | Six skills (:20-415) steer AnA through program, toxicology, safety pharmacology, starting dose, ADME and 2.4/2.6. In-scope tools no reader named: select_tox_species, design_toxicokinetics, design_adme_program, design_genotox_battery, design_repro_tox_study, assess_carcinogenicity_need and three safety-pharmacology assessments. | Their engines (server/services/nonclinical-adme, safety-pharmacology, toxicology) call no model (grep) and read no record. Not checked tool by tool. | Launch: AnA (server/services/ana/ana-launch-scope.inventory.json, inScope). |
| `server/services/templates/nonclinical-templates.ts` | Placeholder forms for 4.2.1, 4.2.2, 4.2.3, 2.6 and a starting-dose justification (:42-185). | Not the composer's outline, nor the registry's 2.6 blueprint (server/services/regulatory/registry/blueprints/nonclinicalSummaryBlueprint.ts:13). The tool tells the model to fill the placeholders (server/services/ana/AnaToolExecutor.ts:5700). | Launch: AnA get_nonclinical_template (AnaToolExecutor.ts:5683). |
| `server/routes/authoring-pdf.routes.ts` | POST /m4-nonclinical/qc checks a set of Module 4 reports for coverage, sections, placement, GLP and duplicates (:80-87). | Reads the request body, not records. | Mounted (server/bootstrap/register-ind-lifecycle-routes.ts:38). No client caller. |
| `server/services/ind/ctd/lifecycle-document-types.ts` | The original IND's IB entry, with a model generation prompt (:1199-1216). Also a legacy IB template (server/routes/concept2cure-ib-template.ts:13) and a static tile promising 2.6 tables generated from study reports (client/src/concept2cure/v2/surfaces/AuthoringEngine.tsx:64-66). | Callers of the prompt and the legacy template: not traced. | Not determined. The tile's surface is locked (scripts/ci/one-product-baseline.json:9). |

## What is broken, by who can reach it

### Reachable at launch (repairs, open now)

| # | Defect | Where |
|---|---|---|
| L1 | **The governed register is on no deploy.** AnA's `draft_nonclinical_overview_m2_4` and `draft_nonclinical_summaries_m2_6` (in scope) and the Reporting bundle "Nonclinical & CMC readiness" read `nonclinical_studies`. Its creating migration, and the two it depends on (`iacuc_protocols`, `provenance_links`), are in `scripts/ci/migration-deploy-path-baseline.json`: install-fresh applies them, a deploy does not. The later `db/migrations/20260716_nonclinical_display.sql` is in the set and its own comment says it is "ordered after" a file that is not. Not run against a deployed database. | `migrations/20260610_nonclinical_send.sql`, `20260610_iacuc_animal_governance.sql`, `20260610_financial_disclosure_21cfr54.sql:90`; `scripts/db/migration-set.mjs:725` |
| L2 | **`classify_tox_findings` (in scope, "engine: deterministic") states correlates the input did not.** Thyroid follicular cell hyperplasia is returned adverse "due to adverse correlates" with none given, and its summary says the finding "defines the NOAEL". "Hypertrophy without necrosis" is escalated by the word necrosis. "No tubular necrosis" is classified adverse. And the unsafe direction: an adenoma or carcinoma given as a correlate does not escalate an adaptive finding. Each was run by this session. | `server/services/preclinical/tox-findings-classifier.ts:83-84, 111, 175-183` |
| L3 | **The engines are checked only against themselves.** The first-in-human dose engine's tests recompute its own formula; the classifier's assert its own outputs. Neither is pinned to a published worked example (the biostatistics audit of 2026-10-11 is the precedent). | `server/services/preclinical/__tests__/fih-dose-engine.test.ts:87-90` |
| L4 | **Model-written Module 4 content is offered**, against the product's own statement that nothing drafts Module 4: an AI-draftable nonclinical study report in the template catalog, and `get_nonclinical_template`'s placeholder forms that the tool tells the model to fill. Each is a model step with no PQ. | `server/services/market-specs/medicinal-working-templates.ts:46-66`; `server/services/ana/AnaToolExecutor.ts:5700`; `server/services/ana/generate-document-refusals.ts:30` |
| L5 | **Legacy import files a brochure at 1.15**, which is Promotional Material; the brochure is 1.14.4.1. Another lane holds that folder. | `server/services/legacy-importer/detector.ts:153-154`; `shared/regulatory/regional-module1.ts:303` |

### Mounted, with no caller

| # | Defect | Where |
|---|---|---|
| M1 | `POST /api/nonclinical-summary/document` composes 2.6 from every study of the organization in any status, planned and cancelled included, and saves a draft, with no write-role gate and no audit row. P-55 R-1 says never. | `server/routes/nonclinical-summary.routes.ts:124`; `server/services/nonclinical/nonclinical-service.ts:209-243` |
| M2 | Two routes compose or render Module 2 content from the request body, the defect `POST /m2/qos` was retired for. | `server/routes/submission-orchestrator.ts:979-1002`; `server/routes/authoring-pdf.routes.ts:36-59` |
| M3 | A second NOAEL parser, and it is wrong: "1,000 mg/kg/day" reads as 0 and "NOAEL < 50 mg/kg" as 50, where the dose engine reads 1000 and refuses. Genotoxicity detection is also written twice. | `server/services/preclinical/preclinical-intel-loader.ts:42-48, 78`; `fih-dose-engine.ts:91` |
| M5 | Three study-type to 4.2.x maps disagree on immunotoxicity and on an unknown type. The register's is the one a composed table would print. | `server/services/nonclinical/nonclinical-logic.ts:15-26`; `server/services/preclinical/nonclinical-program-loader.ts:40-65`; `server/services/authoring/nonclinical-study-report-builder.ts:322-352` |
| M4 | The ingest writes under any program id; isolation rests on RLS alone. The extractor never sends its schema to the model, so a misnamed key is stored as "not stated". "GLP not stated" is written as not GLP. | `preclinical-ingest-service.ts:96-99`; `preclinical-extractor.ts:152`; `preclinical-governed-bridge.ts:65` |

### On the two locked screens

| # | Defect | Where |
|---|---|---|
| S1 | "Run SEND conformance" sends the study number where the route needs the row id: it answers 400, or reads another study. | `client/src/concept2cure/v2/surfaces/Nonclinical.tsx:366` |
| S2 | "Add a GLP study" never sends `glpCompliant`, so each study is stored as not GLP under a header that counts GLP studies. | `Nonclinical.tsx:510-520` |
| S3 | The form, the empty state and AnA's context say "the report is classified, SEND is queued". Creating a study does neither. A starter presupposes a rejection no read reported; the live queue is labelled "sample"; a card names a validator the platform does not run. | `Nonclinical.tsx` |
| S4 | A study created on the screen can never reach 2.4 or 2.6: the form sends no submission and nothing calls the status route, so it stays planned and unlinked. | `Nonclinical.tsx:510-520`; `server/routes/nonclinical.ts:162` |
| S5 | The brochure screen's "Ready" and its percentage mean a row exists somewhere in the organization. It cannot tell an unprovisioned skeleton from a real verdict. It reads `clinical_ops.studies` and `clinical_studies`, not the study store P-75 chose. | `server/services/authoring/investigator-brochure-view-assembler.ts:117-157, 249-262`; `InvestigatorBrochure.tsx:174` |
| S6 | The registry cannot hold primary pharmacology: the type list and the CHECK lack it, so 2.6 completeness stops at 80. Duration, key finding, dose levels and target-organ findings have no writer, so composed tables show dashes. | `shared/schema/nonclinical.ts:24-34`; `migrations/20260610_nonclinical_send.sql:28-30` |

### Duplicates (RULE 3, zero duplication)

Two study stores (`ctd_nonclinical_studies`, the extraction's; `nonclinical_studies`, the governed one, canonical
by P-55). Three eligibility rules over the governed register (R-1, the screen's, Reporting's). Four brochure
templates carrying two outlines; three codings of the brochure's front matter. Two essential-documents libraries
(recorded in `docs/evidence/D2-ETMF/2026-11-11-e1-review/`).

## What can be done now, and what waits

P-74: "Each is worked only after the one before it lands." The eTMF is not admitted; the Vault parity lane holds it
(E4, "not applicable", the URS and OQ, admission; P-124).

- **Open now: repairs.** L1 to L5 are defects in what launch already offers, and M1 to M5 and S1 to S5 are defects
  in code that exists. A repair admits nothing. The Rule 2 audit's 2.4/2.6 slice went the same way (`2ea66f6cf2`,
  `Plan: F1`). No plan package names these files; they fall under R1, F1 and L1. No coordination row holds them,
  except the editor (D4, and a Codex hold of 2026-11-06 on `DocumentWorkbench.tsx`), `AnaToolExecutor.ts` (the Anna
  runtime), `migration-set.mjs` (a one-commit turn) and `server/services/legacy-importer/**`.
- **Waits for the eTMF's admission, or for the founder to reorder:** admitting anything outside the catalog. That
  is the report ingest, and the fate of the two screens.
- **Not a repair, and the founder's:** the questions below.

## Slices, in a conservative order

Each is one commit, each check seen failing first, each with evidence under `docs/evidence/D2-NONCLINICAL/<date>/`.

| # | Slice | Plan / Completes | Holds to ask | Waits on |
|---|---|---|---|---|
| N1 | The tox classifier states only what the input states (L2). **Done 2026-11-12**, `docs/evidence/D2-NONCLINICAL/2026-11-12-tox-classifier/`: tumours escalate, the thyroid's own name is said honestly, nothing stated is missed; negation is deliberately not read. Pinning it to published references is still owed | F1 / `server/services/preclinical/tox-findings-classifier.ts` | none | nothing |
| N2 | One study-type to 4.2.x map (M5); the second NOAEL parser and the second genotoxicity check converge onto the engine's (M3) | F1 / `server/services/nonclinical/nonclinical-logic.ts` | none | nothing |
| N3 | The mounted routes that compose from the request body or from every study in any status are refused or held to R-1, with the write gate and an audit row (M1, M2) | F1 / `server/routes/nonclinical-summary.routes.ts` | none | nothing |
| N4 | The dose engine checked against the published worked examples (L3). **Done 2026-11-12:** `server/services/preclinical/__tests__/fih-dose-engine-agrees-with-fda-2005-table-1.test.ts` holds every species' Km and both published conversion factors of FDA 2005 Table 1 against the engine, with the rat example and the most-sensitive-species step; a wrong rat Km fails three cases. The engine already agreed; the Km table was already one (the toxicology module reads the engine's) | F1 / `server/services/preclinical/fih-dose-engine.ts` | none | nothing |
| N5 | The two screens say only what is true (S1 to S3, S5's skeleton) | F1 / `client/src/concept2cure/v2/surfaces/Nonclinical.tsx` | none | nothing; the screens stay locked |
| N6 | The governed register on the deploy path (L1): three creating migrations into `C2C_MIGRATION_FILES`, before `20260716_nonclinical_display.sql`, each already `IF NOT EXISTS`, public, `organization_id integer NOT NULL`. **Checked 2026-11-12, not safe as a one-line change:** `20260610_financial_disclosure_21cfr54.sql` (which creates `provenance_links`) references `clinical_studies`, whose only creator (`migrations/20260510_notifications_and_clinical.sql`) is on no deploy path either, so adding the file alone would fail every deploy. The precedent is `20260610_irb_submissions.sql` (`scripts/db/migration-set.mjs`, "Registered 2026-09-22"): its hard key to `clinical_studies` was removed in place, with a dated note, before it was registered. The slice needs the same and a replay on real PostgreSQL, which this session's container does not have | L1 / `migrations/20260610_nonclinical_send.sql` | the migration-set turn; tell the Vault parity lane, whose E4 amends a neighbour | question 1; a PostgreSQL replay |
| N7 | A study can be recorded, linked to the project's submission and finalized at launch, and the composed 2.4 and 2.6 become a document the editor opens, with its sources, as that type's section of the one editor (the CSR's `StudyDataBuild.tsx` is the pattern) | R1 / `server/services/preclinical/m26-nonclinical-summaries.ts` | the editor's holders (D4 `01JbQU…`; Codex) | questions 1 and 2 |
| N8 | The brochure's readiness on the brochure document, by project, from the study store P-75 chose | R1 / `server/services/authoring/investigator-brochure-view-assembler.ts` | the editor's holders | questions 2 and 4 |
| N9 | The URS and OQ | L1 | Validation for GA (`01QoxbLcnW…`) for the numbers | N7, N8 |
| N10 | The report ingest: the source is a Vault document, each extracted value is confirmed by a person before the register takes it, and the extraction passes a PQ | R1 / `server/routes/preclinical.ts` | the PQ protocol's owner (S4, `01KZK3…`); P-118 says a change to it needs the founder | the eTMF's admission; question 3 |
| N11 | Admission, and the two screens removed with the test P-122 asks for | L1 with a founder decision | | N7 to N10; question 2 |

## Questions for the founder

1. **Order.** Launch refuses an original IND without 2.4 and 2.6, and the composer that writes them from governed
   studies cannot run on a deployed database or be fed at launch. Is completing that path (N6, N7) a launch repair
   that proceeds now, or item-2 work that waits for the eTMF's admission?
   *This session's reading:* a repair. P-74's order is about admitting areas outside the catalog; 2.4 and 2.6 are
   already demanded inside it. N1 to N5 proceed either way.
2. **The two screens.** P-74 named "the nonclinical and investigator-brochure surfaces". RULE 4, written after it,
   forbids a screen per document type. Do their functions converge into the one editor, for the 2.4, 2.6 and
   brochure documents, and the screens go once a test shows the editor delivers the same (P-122)? And where does the
   study register live: in that editor section, or in a nonclinical work project (S12)?
   *This session's reading:* converge, per RULE 4 and P-101 ("Converge into editor"). Not acted on.
3. **The source report.** Is it a Vault document whose extracted values a person confirms one by one, in place of
   the bare upload that keeps no bytes?
   *This session's reading:* yes. The Vault already stores AnA's description of a document as "suggested" until a
   person confirms or corrects it, with a chained audit row for each step.
4. **The brochure's outline.** Two exist: ICH E6(R3) Appendix A (no reference-safety-information heading) and the
   IND plan's eight working headings (no Appendix A body). Which is the brochure's?
5. **Is IACUC inside this?** The register has a foreign key to `iacuc_protocols`, so its migration is a dependency
   of N6 either way; its screens and tools are outside the catalog.
6. **Primary pharmacology** needs a registry type, which amends a CHECK in a creating migration (RULE 1: in place,
   dated).
7. **The AI-draftable nonclinical study report.** Module 4 reports are the testing facility's. Does that template
   stay in the catalog?

## Not determined

Whether a deployed database holds these tables by another path. Whether production refuses a path no surface
claims (`/api/nonclinical-summary` is claimed by none). Whether the 2.4 and 2.6 catalog templates are AI-draftable,
so whether AnA's editor drafting can write a NOAEL there (the saved-draft figure check is advisory). Whether the
running template picker offers 2.4, 2.6 and the brochure for an IND project: no reader opened the running app.
