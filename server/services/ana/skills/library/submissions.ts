/**
 * Submissions and regulatory operations skills: planning, assembling,
 * validating and dispatching a submission in the platform, the initial IND and
 * its maintenance, eCTD assembly, answering agency letters, the readiness
 * review, and device submissions in the US and EU.
 *
 * Readiness, verdicts, clocks and validator findings are the platform's
 * engines' output; the methods say which engine and never let AnA originate a
 * verdict, sign, release or transmit (CLAUDE.md Rule 2; decisions P-28, P-32
 * to P-35).
 *
 * @module server/services/ana/skills/library/submissions
 */

import { skill, type LibrarySkillSource } from '../types.js';

export const SUBMISSIONS_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'submissions',
    name: 'Submissions and regulatory operations',
    description:
      'How a submission is planned, assembled, validated and dispatched in the platform, and what a filing requires. Sub-skills cover the initial IND, IND maintenance, eCTD assembly, agency responses, the readiness review and device submissions.',
    disciplines: ['regulatory-operations'],
    useCases: ['submission-assembly', 'strategy', 'gap-analysis'],
    surfaces: ['submission-center'],
    triggers: [
      'submission plan',
      'submission planning',
      'submission center',
      'regulatory operations',
      'reg ops',
      'regulatory submission',
      'filing plan',
      'submission timeline',
      'submission requirements',
      'required documents',
      'what do we need to file',
      'dossier',
      'submission package',
      'review clock',
    ],
    tools: [
      'get_submission_requirements',
      'resolve_regulatory_structure',
      'plan_submission',
      'resolve_submission_plan',
      'get_market_submission_spec',
      'assess_submission_package',
      'list_governed_documents',
      'get_regulatory_timeline',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'ich', id: 'M8' },
      { kind: 'record', id: 'shared/regulatory/regional-module1.ts', label: 'Regional Module 1 for FDA, EMA and PMDA' },
    ],
    instructions: `
## When this applies
The person is planning, assembling, validating or dispatching a submission in the platform, or asking what a filing requires. The sub-skills carry the detail for the initial IND, IND maintenance, eCTD assembly, agency responses, the readiness review and device submissions; this method gives the order of work and where each part lives.

## Method
1. Establish the filing: the application type as the registry names it, the region, the program, and whether it is an original application or a sequence to an existing one. Use the project's recorded submission type rather than inferring it from the question, and say which you used.
2. Establish what the filing requires before assessing what exists. \`get_submission_requirements\` returns the required modules, documents and forms for a submission type and, given what is present, which are missing. \`resolve_regulatory_structure\` returns the rule-resolved CTD structure and review-clock model for a region and application type. \`plan_submission\` produces the module map, regional forms, dependency graph and initial gap list for a new submission. Report each as returned and name the tool that answered.
3. For more than one region, \`resolve_submission_plan\` returns each region's equivalent application, dossier standard, Module 1 path, validation profile and gateway, and whether the platform supports building and submitting it. \`get_market_submission_spec\` holds each market's file-format, naming and governance rules.
4. Assess what exists. \`assess_submission_package\` reads the project's saved package against a confirmed filing type and reports missing content and content awaiting review; it certifies no scientific, signature or technical readiness, and the answer says so. \`list_governed_documents\` lists the governed submission documents with their lifecycle status. A document in draft is not complete, and an unlinked working document may exist that the projection does not show.
5. Review-clock anchors come only from \`get_regulatory_timeline\`, labelled as goals subject to clock stops, not as commitments.
6. The work then runs in the platform's order, and each step has its own method: documents are authored and approved by signature in Authoring and the Vault; they are placed into a sequence (eCTD assembly); the sequence is validated and reviewed; the one dispatch verdict is computed for it (readiness review); a person with signing authority releases it and transmits it.
7. Keep the launch boundaries in view: the platform composes CMC Module 3 only for a small-molecule US IND (decision P-28), and IND safety reports and ICSRs are not transmitted from the platform at launch (decision P-32).

## Before answering
- The requirement set came from a tool, for the named submission type and region.
- Missing, draft, approved and filed are kept distinct.
- Nothing is described as filed, transmitted or accepted unless the platform's record says so.

## Not AnA's to decide
- AnA never signs, approves, releases or transmits a submission. Approval and release are signed acts by people with authority, and transmission requires a person to re-authenticate and sign.
- Whether a submission is acceptable for filing or review is the agency's determination.
`,
  }),

  skill({
    key: 'submissions.ind-initial',
    name: 'Initial IND',
    description:
      'Preparing an original IND: the content 21 CFR 312.23 requires, forms 1571, 1572 and 3674 through the forms tools, cross-references and Letters of Authorization, the IND checklist and the 30-day period before the IND goes into effect.',
    disciplines: ['regulatory-operations'],
    useCases: ['submission-assembly', 'drafting', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    submissionTypes: ['US_IND'],
    regions: ['US'],
    surfaces: ['ind-checklist'],
    triggers: [
      'initial ind',
      'original ind',
      'ind submission',
      'ind application',
      'new ind',
      'commercial ind',
      'research ind',
      'form 1571',
      '1571',
      'form 1572',
      '1572',
      'form 3674',
      '3674',
      '312.23',
      '30-day review',
      '30-day wait',
      'safe to proceed',
      'ind content',
      'introductory statement',
      'general investigational plan',
      'ind checklist',
      'letter of authorization',
      'right of reference',
      'ind cover letter',
    ],
    tools: [
      'get_submission_requirements',
      'resolve_regulatory_structure',
      'assess_submission_package',
      'list_fda_forms',
      'prepare_fda_form',
      'plan_ind_module_authoring',
      'lookup_submission_deficiencies',
    ],
    references: [
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'S6(R1)' },
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'standard', id: 'ich_m3_s' },
      { kind: 'record', id: 'server/services/ind-lifecycle/ind-checklist-view-assembler.ts', label: 'IND checklist: Module 1 forms and placed sections' },
      { kind: 'record', id: 'server/services/cmc/composition-scope.ts', label: 'CMC composition boundary (decision P-28)' },
    ],
    instructions: `
## When this applies
A sponsor is preparing an original IND for a drug or biologic: what 21 CFR 312.23 requires, how forms 1571, 1572 and 3674 are handled, how the content maps to the eCTD, and what the 30-day period means. The IND lifecycle and forms screen in Submission Center is where this work is tracked.

## Method
1. Establish the IND's identity and scope: commercial or research IND, the drug and the indication, the first protocol and its phase, the sponsor (and any US agent), and whether the IND relies by cross-reference on information held elsewhere, such as a drug master file or another IND.
2. Establish the required content with \`get_submission_requirements\` (submission type \`ind\`) and the rule-resolved eCTD structure with \`resolve_regulatory_structure\` (region \`fda\`, application type \`ind\`). 21 CFR 312.23 asks for: the Form FDA 1571 cover sheet; a table of contents; the introductory statement and general investigational plan; the investigator's brochure; the protocols; chemistry, manufacturing and control information; pharmacology and toxicology information; previous human experience; and additional information where it applies. The depth of CMC and nonclinical information scales with the phase and the risk of the first study. ICH M3(R2) sets the nonclinical studies expected before each stage of clinical development, with ICH S6(R1) for biotechnology-derived products.
3. Read the IND screen's state before reporting progress. It shows the Module 1 forms and the sections placed in the filing with their status, and its readiness is the verdict the server's IND readiness engine returns, not a count you make. \`assess_submission_package\` reads the same project's package progress. A drafted section is not complete; a form counts as done only when it is signed with a signature record behind it, or a signed copy the sponsor attested to is filed.
4. Forms. \`list_fda_forms\` shows which forms the registry holds and how fully each is implemented. \`prepare_fda_form\` prepares Form 1571 (the IND application), Form 1572 (Statement of Investigator, one for each investigator) or Form 3674 (the ClinicalTrials.gov certification) as an editable draft from values the person supplies. It never signs or submits: the sponsor's authorised representative signs the 1571, and each investigator signs their own 1572.
5. Cross-references. Content held by someone else, such as a drug master file, is referenced with a Letter of Authorization from its holder on file. A required Module 3 heading with neither a leaf nor a cross-reference covered by a Letter of Authorization blocks the original sequence, and a cross-reference with no Letter of Authorization blocks every sequence of the IND.
6. Module 2 summaries: \`plan_ind_module_authoring\` plans a 2.5 or 2.7 scaffold from structured facts. Supply facts from the program's study records only; the scaffold is a plan, not a verified document.
7. CMC: the platform composes Module 3 for a small-molecule US IND (decision P-28). For a biologic IND, AnA can advise on Module 3 and the sponsor authors it in the editor.
8. Before filing, \`lookup_submission_deficiencies\` (type \`ind\`) lists the deficiencies reviewers most often raise on an IND; check the draft against them.
9. The 30-day period. Under 21 CFR 312.40 an IND goes into effect 30 days after FDA receives it, unless FDA notifies the sponsor that the investigation is on clinical hold, or earlier if FDA notifies the sponsor that it may begin. The date comes from the IND screen's 30-day clock, computed from the recorded receipt date; never compute it yourself. The study also needs IRB approval before it begins.

## Pitfalls reviewers raise
- A first-in-human starting dose without a justification traceable to the nonclinical data.
- Toxicology studies whose duration or species do not support the proposed clinical duration and population.
- CMC information that does not show the clinical material is representative of the material tested in toxicology.
- Protocols without clear stopping rules and safety monitoring for the first cohorts.

## Before answering
- Readiness and dates are the IND screen's verdict and clock, not your own count.
- Every required element was checked against the requirement tool's list, not recollection.
- Forms are described as drafts until signed.

## Not AnA's to decide
- FDA decides whether the investigation may proceed or is placed on clinical hold; the IRB decides on approval.
- AnA does not sign forms, approve sections or submit the IND; the sponsor's authorised people do.
`,
  }),

  skill({
    key: 'submissions.ind-maintenance',
    name: 'IND amendments and annual reports',
    description:
      'Submissions to an IND in effect: protocol amendments (21 CFR 312.30), information amendments (312.31), annual reports (312.33) and the DSUR, and where IND safety reports stand at launch.',
    disciplines: ['regulatory-operations', 'safety'],
    useCases: ['submission-assembly', 'lifecycle-change', 'drafting'],
    segments: ['pharma', 'biotech'],
    submissionTypes: ['US_IND', 'US_IND_AMENDMENT', 'US_IND_ANNUAL'],
    regions: ['US'],
    triggers: [
      'ind amendment',
      'protocol amendment',
      'information amendment',
      'ind annual report',
      '312.30',
      '312.31',
      '312.33',
      '312.32',
      'new protocol',
      'change in protocol',
      'new investigator',
      'immediate hazard',
      'ind serial number',
      'ind safety report',
      'dsur',
      'development safety update report',
      'ind sequence',
      'amend the 1572',
    ],
    tools: [
      'review_amendment',
      'prepare_fda_form',
      'amend_fda_form',
      'generate_dsur_structure',
      'plan_aggregate_safety_report',
      'classify_expedited_reporting',
    ],
    references: [
      { kind: 'ich', id: 'E2F' },
      { kind: 'record', id: 'server/services/ectd/assess-dispatch-readiness.ts', label: 'The one dispatch verdict per sequence, with the IND checks (decision P-33)' },
    ],
    instructions: `
## When this applies
An IND is in effect and the sponsor is submitting to it: a protocol amendment (21 CFR 312.30), an information amendment (312.31), the annual report (312.33) or a DSUR used for annual reporting, or another sequence to the IND.

## Method
1. Establish what changed and classify the submission before drafting it. Each submission to the IND is a numbered sequence with a Form FDA 1571 and a cover letter that says what it contains.
2. Protocol amendments (312.30):
   - A new protocol is submitted before the study begins; the study may begin once the protocol has been submitted to FDA and approved by the IRB.
   - A change in protocol that affects the safety of subjects, the scope of the investigation or its scientific quality is submitted, and may be implemented once it has been submitted to FDA and approved by the IRB. For a Phase 1 protocol the test is whether the change significantly affects the safety of subjects.
   - The exception is a change made to eliminate an apparent immediate hazard to subjects, which may be implemented immediately; FDA is then notified by protocol amendment and the IRB is notified.
   - A new investigator added to a protocol is reported to FDA by protocol amendment.
   When the amendment is a platform record, \`review_amendment\` returns its 312.30 status and the IRB review route as the engine classifies them; relay "undetermined" and "sponsor determination required" exactly as given.
3. Information amendments (312.31) carry essential information that is not a protocol amendment, an IND safety report or an annual report: new toxicology, chemistry or other technical information, or notice that a clinical investigation has been discontinued.
4. Forms. \`prepare_fda_form\` drafts the 1571 for the sequence. \`amend_fda_form\` produces a new draft of an existing form, for example a revised 1572 when an investigator's sites change, with a reason; it never alters an approved version.
5. Annual reports (312.33). The report is due on a schedule anchored to the anniversary of the IND going into effect; take the date from the IND lifecycle record or the sponsor, never from your own count. It covers the status of each study, summary safety information, the general investigational plan for the coming year, changes to the investigator's brochure, Phase 1 protocol modifications not previously reported, significant foreign marketing developments, and outstanding business with FDA. Some sponsors meet it with a DSUR prepared under ICH E2F: \`generate_dsur_structure\` returns the DSUR's sections for the reporting period, and \`plan_aggregate_safety_report\` its cadence and data-lock anchoring. When a DSUR is used, check it against the 312.33 content rather than assuming one covers the other.
6. IND safety reports (312.32). AnA can help classify a case with \`classify_expedited_reporting\` and help draft the report, but IND safety reports and ICSRs are not transmitted from the platform at launch (decision P-32); transmission happens outside the platform. On the dispatch verdict an overdue IND safety report is a warning, never a block on another sequence.
7. Place the sequence's documents through the eCTD assembly method; each amendment's lifecycle operations are computed against the IND's filed state.

## Before answering
- The amendment type, and when the change may be implemented, follow the 312.30 rule above or the engine's classification, not a guess.
- Due dates and clocks came from the IND record or an engine.
- Safety-report transmission is described as outside the platform.

## Not AnA's to decide
- Whether a change affects safety, scope or scientific quality is the sponsor's determination; IRB approval is the IRB's.
- AnA never signs a 1571 or submits a sequence.
`,
  }),

  skill({
    key: 'submissions.ectd-assembly',
    name: 'eCTD assembly and lifecycle',
    description:
      'Placing documents into an eCTD sequence: CTD section, leaf title and granularity, lifecycle operators (new, replace, append, delete), file naming, cross-references, validation findings and regional packaging.',
    disciplines: ['regulatory-operations'],
    useCases: ['submission-assembly', 'review'],
    surfaces: ['ectd-compile'],
    documentTypes: ['ICH_ECTD_BACKBONE'],
    triggers: [
      'ectd',
      'ectd sequence',
      'sequence number',
      'lifecycle operation',
      'lifecycle operator',
      'replace operation',
      'append operation',
      'delete operation',
      'leaf title',
      'granularity',
      'module 1',
      'regional module 1',
      'backbone',
      'index.xml',
      'study tagging file',
      'hyperlinks',
      'bookmarks',
      'ectd v4',
      'ectd 4.0',
      'ectd v3.2.2',
      'ctd section',
      'where does this go',
      'ctd placement',
      'technical rejection',
      'publishing',
    ],
    tools: [
      'advise_ctd_structure',
      'classify_submission_document',
      'get_ctd_module_home',
      'place_into_sequence',
      'compute_lifecycle_operations',
      'check_ectd_cross_references',
      'validate_cross_references',
      'validate_ectd_package',
      'explain_validation_findings',
      'list_validation_rules',
      'list_fda_technical_rules',
      'package_ectd_for_region',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'ich', id: 'M8' },
      { kind: 'record', id: 'shared/regulatory/regional-module1.ts', label: 'Regional Module 1 for FDA, EMA and PMDA' },
      { kind: 'record', id: 'shared/regulatory/ectd-leaf-rules.ts', label: 'eCTD file-name and study tagging file rules' },
      { kind: 'currency-fact', id: 'fda-ectd-v4-accepted' },
      { kind: 'currency-fact', id: 'ema-ectd-v4-cp-optional' },
      { kind: 'currency-fact', id: 'eu-ectd-m1-v311-vc-v82' },
      { kind: 'currency-fact', id: 'pmda-ectd-v4-mandatory' },
    ],
    instructions: `
## When this applies
Documents are being placed into an eCTD sequence: choosing the CTD section, the leaf title and granularity, the lifecycle operator, file naming and cross-references, then validating and packaging for the region. The eCTD compile screen in Submission Center shows the compiled sequence.

## Method
1. Establish the sequence: the application, the region, the sequence and its type, and the state already on file (the prior sequences sent or acknowledged). Lifecycle is relative to that state, so settle it before any leaf is placed.
2. Section placement. For a document whose home is unclear, \`advise_ctd_structure\` explains a module or routes a description to its best-fit module, and \`classify_submission_document\` proposes a section for an uploaded document without changing anything. \`get_ctd_module_home\` returns the region's Module 1 headings and the Module 2 summaries with the modules they draw on. Module 1 is regional and numbered differently by FDA, EMA and PMDA (regional-module1 record); Modules 2 to 5 follow ICH M4. Granularity follows ICH M4: one leaf for each document the structure expects at that heading, never a whole module in one file.
3. Placement is a governed write. \`place_into_sequence\` creates or updates the leaf with the section code, title, lifecycle operator and the source document's table and id, once the person confirms the section in view. The server refuses a frozen or dispatched sequence and a document outside the organisation; relay a refusal verbatim and never claim a placement it declined. A Vault pointer cannot be materialised into the package and is reported as an error at dispatch, so place one only when the person asks for that pointer.
4. Lifecycle operators. \`compute_lifecycle_operations\` diffs the desired leaves against the prior state and returns new, replace, append or delete for each leaf, with every non-new operation pointing at the prior leaf it modifies. Use it rather than choosing operators by hand. An original sequence carries only new leaves; a replace supersedes the earlier version; a delete removes a leaf from the current view, while the agency's record keeps its history.
5. Names and titles. File names follow the eCTD rule the platform enforces: lowercase letters, digits and hyphens, one dot before the extension, within the length limit (ectd-leaf-rules record); the assembler composes names to it. Leaf titles say what the document is so a reviewer can find it, and stay stable across replacements.
6. Cross-references. \`check_ectd_cross_references\` checks that every intra-package reference resolves to a leaf that is present and not deleted; \`validate_cross_references\` checks the CTD section references written inside a document against the project's documents. Resolve both before validating.
7. Validate and explain. \`validate_ectd_package\` runs the deterministic validator over the leaves and returns a verdict and severity-scored findings. \`explain_validation_findings\` turns each finding into its cause and fix without changing it. \`list_validation_rules\` names the rule behind a finding and whether the dispatch gate, the packager or only the agency's validator enforces it. \`list_fda_technical_rules\` holds FDA's published PDF, eCTD and study-data rules and says which of them the platform checks today.
8. Package. \`package_ectd_for_region\` builds the regional backbone and the bundle with its SHA-256. Read its regional-backbone status before saying a package follows the agency's own Module 1; a backbone reused from another region is a placeholder.
9. Format versions. FDA accepts eCTD v4.0 voluntarily alongside v3.2.2; EMA accepts v4.0 optionally for new centralised applications; EU sequences validate against EU Module 1 v3.1.1 and validation criteria v8.2; PMDA requires v4.0 for new applications. \`check_regulatory_currency\` returns each fact's status and dates; cite it rather than recollection.

## Before answering
- Operators came from \`compute_lifecycle_operations\` and findings from the validator, verbatim.
- A placement is described only as the server recorded it.
- Region-specific statements name the region and, for format versions, the currency fact.

## Not AnA's to decide
- The agency's own validation decides technical acceptance; the platform's validator is a pre-check.
- Freezing, releasing and transmitting a sequence are signed acts by people with authority.
`,
  }),

  skill({
    key: 'submissions.agency-response',
    name: 'Responding to agency questions and deficiencies',
    description:
      'Answering what an agency asks of an application: FDA information requests, deficiency letters, complete response and refuse-to-file letters, device additional-information letters, clinical holds and EMA lists of questions. Reading the letter, planning, drafting each answer and assembling the signed package.',
    disciplines: ['regulatory-operations', 'regulatory-strategy'],
    useCases: ['agency-interaction', 'drafting', 'review'],
    triggers: [
      'information request',
      'ir response',
      'ir letter',
      'deficiency letter',
      'deficiency response',
      'complete response letter',
      'crl',
      'refuse to file',
      'refuse-to-file',
      'rtf letter',
      'list of questions',
      'list of outstanding issues',
      'request for supplementary information',
      'additional information request',
      'additional information letter',
      'major deficiency',
      'nse letter',
      'clinical hold letter',
      'clock stop',
      'respond to fda',
      'response to questions',
      'agency questions',
      'day 120',
    ],
    tools: [
      'search_regulatory_correspondence',
      'draft_fda_ir_response',
      'compile_correspondence_response_package',
      'lookup_submission_deficiencies',
      'lookup_regulatory_precedents',
      'validate_cross_references',
      'assemble_crl_premortem_artifact',
      'scan_regulatory_deficiencies',
    ],
    references: [
      { kind: 'record', id: 'shared/regulatory/agency-interaction.ts', label: 'Agency interaction, deficiency and commitment model' },
    ],
    instructions: `
## When this applies
The agency has asked something of an application: an information request, a deficiency letter, a complete response letter, a refuse-to-file letter, a device additional-information or major-deficiency letter, a clinical hold, or an EMA list of questions or of outstanding issues. Covers reading the letter, planning the response, drafting each answer and assembling the package.

## Method
1. Establish the letter itself: which application and sequence it concerns, what kind of letter it is, its date, any response date the letter states or the record holds, and every question in it. \`search_regulatory_correspondence\` finds agency correspondence in the connected mailbox; say so when no mailbox is connected. Never infer a due date; take it from the letter or the record.
2. Parse the questions. For an FDA information request, \`draft_fda_ir_response\` extracts the numbered questions and returns a scaffold for each; if extraction fails, ask for the text in a more structured form. Keep each question verbatim and numbered as the agency numbered it.
3. Plan before drafting. For each question establish its category (clinical, statistical, CMC, nonclinical, labeling, device testing), whether it stands between the application and approval, which CTD sections it affects and what evidence the answer needs: existing data, a new analysis, a new study, or a labeling change. \`compile_correspondence_response_package\` builds the per-issue matrix, the evidence checklist and the unresolved gaps from the structured issues, and reports the package as not ready while any evidence is missing. \`lookup_submission_deficiencies\` and \`lookup_regulatory_precedents\` show how similar questions have been framed and resolved.
4. Draft each response in this structure:
   - the question, verbatim;
   - the applicant's position, briefly;
   - the detailed response, with the data that support it, each figure taken from the study reports or from the engine that computed it;
   - the proposed action, where there is one (updated labeling, a new analysis, a commitment);
   - cross-references to the CTD sections updated or provided with the response, checked with \`validate_cross_references\`.
   Write in a formal, collaborative tone. Answer the question asked, fully. Never dismiss a question or argue that it should not have been asked; where the applicant disagrees, say so plainly, give the evidence, and propose a way forward.
5. Put a summary table at the front: each question, a one-line answer, and where in the response and in the dossier it is answered.
6. For a complete response letter or a refuse-to-file letter, address every deficiency the letter lists, in its order; a resubmission that leaves one unaddressed is incomplete. \`assemble_crl_premortem_artifact\` and \`scan_regulatory_deficiencies\` test the draft text for reviewer triggers that remain; report their confidence and denominator as returned.
7. In the platform, the questions on an agency letter live on the project inbox and are worked in Communication and in Project home's Respond. Each response is approved by a signature from someone other than its author, bound to the exact response text, and an edit after signing ends that approval. The response package assembles only when every response is approved. A commitment made in a response names its letter and question; record it so it can be tracked to fulfilment.

## Before answering
- Every question in the letter has a response, in the agency's order, with the question verbatim.
- No figure appears in a response that the study reports or an engine did not produce.
- Due dates are the letter's or the record's.

## Not AnA's to decide
- AnA drafts. The applicant's authorised people approve each response by signature and submit the package.
- Whether a response resolves a question or deficiency is the agency's determination.
`,
  }),

  skill({
    key: 'submissions.readiness-review',
    name: 'Submission readiness and the dispatch verdict',
    description:
      "The go/no-go on a sequence: the platform's one dispatch verdict, Shadow Review, validator results and the release signature. AnA reports and explains the verdict and its blockers; she never originates, waives or clears one.",
    disciplines: ['regulatory-operations'],
    useCases: ['review', 'submission-assembly'],
    surfaces: ['dispatch-readiness'],
    triggers: [
      'dispatch readiness',
      'ready to dispatch',
      'ready to submit',
      'ready to file',
      'go/no-go',
      'go no-go',
      'submission readiness',
      'shadow review',
      'shadow finding',
      'dispatch gate',
      'dispatch verdict',
      'readiness verdict',
      'release signature',
      'cleared to dispatch',
      'can we submit',
      'can we file',
      'agency validator',
      'external validation',
      'pre-dispatch',
      'final qc',
    ],
    tools: [
      'assess_dispatch_readiness',
      'list_validation_rules',
      'explain_validation_findings',
      'validate_ectd_package',
      'run_shadow_review',
      'assess_pathway_readiness',
      'assess_submission_package',
      'gateway_configuration_status',
      'transmit_submission',
    ],
    references: [
      { kind: 'ich', id: 'M8' },
      { kind: 'record', id: 'server/services/ectd/assess-dispatch-readiness.ts', label: 'The one dispatch verdict per sequence (decision P-33)' },
    ],
    instructions: `
## When this applies
The question is whether a sequence can go to the agency: the platform's dispatch verdict, its blockers and warnings, the Shadow Review, the validator results and the release signature. AnA reports the verdict and explains it; she never originates one.

## Method
1. Establish the sequence by its id; the verdict is per sequence. \`assess_dispatch_readiness\` returns the one dispatch verdict the platform computes on the server from the canonical record: whether the sequence is cleared, every blocker, the warnings and what was not assessed. Report it verbatim. It is the same verdict the Submit tab, Submission Center and the readiness screen show; there is no second verdict to consult, and none is worked out in conversation.
2. Explain each blocker from its source. The verdict brings together:
   - structural validation of the stored leaves (open error-severity findings block);
   - Shadow Review: at least one completed review must have run, and every critical finding must be closed;
   - external, agency-grade validation;
   - the release signature;
   - the required regional Module 1 content and coherent lifecycle operations;
   - for a US IND, a cross-reference with no Letter of Authorization on file, and required Module 3 content in an original sequence.
   \`list_validation_rules\` names the rule behind a finding code and whether the dispatch gate enforces it; \`explain_validation_findings\` gives each finding's cause and fix without changing it; \`validate_ectd_package\` re-runs the structural validator on a leaf set while the person is fixing one.
3. Shadow Review. \`run_shadow_review\` runs a reviewer pass over the assembled sequence and returns severity-scored refuse-to-file and complete-response findings, each with its basis and a fix. A later clean review does not close an earlier critical finding: each critical is closed by a named person's signature, recorded as risk accepted or fixed. When no review could run because every AI provider failed, a person with signing authority who did not author the sequence may sign a waiver; it answers only "no review has run", never waives a critical finding, and lapses when the leaves change.
4. Report warnings and what was not assessed as such: an overdue IND safety report is a warning, not a block; a clinical hold is stated as not assessed on a US IND sequence because nothing in the platform records one.
5. For a non-eCTD pathway (eSTAR, EU MDR or IVDR technical documentation, CTIS, PMDA), \`assess_pathway_readiness\` returns the required-slot gap report for the sequence. \`assess_submission_package\` reports the project's package progress and certifies nothing.
6. After a cleared verdict, \`gateway_configuration_status\` says which gateways are configured for the organisation, and \`transmit_submission\` gives the person the exact next step and the bundle identifiers. Transmission itself requires the person to re-authenticate, give a reason and apply a Part 11 signature on the gateway transmittals screen.

## Before answering
- The verdict, blockers and warnings are quoted from \`assess_dispatch_readiness\`, not summarised into a different verdict.
- Each blocker has its cause and the action that clears it.
- Nothing is called ready, submitted or accepted beyond what the record says.

## Not AnA's to decide
- AnA never clears a gate, waives a review, dispositions a finding, signs a release or transmits. These are signed acts by people with authority, and no AnA tool performs them.
- Acceptance of the submission is the agency's.
`,
  }),

  skill({
    key: 'submissions.device-510k',
    name: '510(k) premarket notification',
    description:
      'Preparing a 510(k) for a device or IVD through eSTAR: the predicate, the substantial-equivalence argument, performance testing summaries, consensus standards, and assembly and readiness in the platform.',
    disciplines: ['regulatory-operations', 'device-engineering', 'diagnostics'],
    useCases: ['submission-assembly', 'drafting', 'gap-analysis'],
    segments: ['device', 'ivd'],
    submissionTypes: ['US_510K', 'US_510K_IVD'],
    regions: ['US'],
    triggers: [
      '510(k)',
      '510k',
      'premarket notification',
      'substantial equivalence',
      'substantially equivalent',
      'predicate device',
      'estar',
      'traditional 510(k)',
      'special 510(k)',
      'abbreviated 510(k)',
      'se comparison',
      'se table',
      'indications for use',
      'performance testing',
      'bench testing',
      'consensus standard',
      'recognized standard',
    ],
    tools: [
      'check_regulatory_currency',
      'analyze_predicate_device',
      'score_predicate_adequacy',
      'lookup_regulatory_precedents',
      'draft_510k_substantial_equivalence',
      'get_biocompatibility_endpoints',
      'get_electrical_standards',
      'assemble_device_submission',
      'advise_device_readiness',
      'get_device_reviewer_checklist',
      'get_regulatory_timeline',
    ],
    references: [
      { kind: 'currency-fact', id: 'fda-estar-510k-mandatory' },
      { kind: 'record', id: 'shared/regulatory/predicate-positions.ts', label: '510(k) predicate strategies and what each commits a submission to' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'standard', id: 'iec_62304' },
      { kind: 'standard', id: 'iec_62366_1' },
      { kind: 'standard', id: 'fdc_524b' },
      { kind: 'standard', id: 'clsi_ep_suite' },
    ],
    instructions: `
## When this applies
A device or IVD is going to FDA by premarket notification: choosing the predicate, building the substantial-equivalence argument, summarising performance testing and standards, and assembling the eSTAR.

## Method
1. Establish the device and its claim: the indications for use, the intended use, the technology, the product code and classification regulation, and whether a change to the sponsor's own cleared device suits a Special 510(k). The 510(k) is filed through eSTAR; \`check_regulatory_currency\` confirms the mandate's status.
2. Predicate. Name candidate predicates with their 510(k) numbers. \`analyze_predicate_device\` returns a predicate's clearance details, indications and technology points. \`score_predicate_adequacy\` ranks candidates on a fixed rubric from the comparison signals you supply and lists the unknown factors, scored zero and never assumed favourable; report its disclaimer with it. Hold to the predicate-positions record: a primary predicate with the same intended use carries the comparison; additional predicates serve a device with several intended uses, or one intended use with features drawn from devices that share it; indications from one device and technology from another (a split predicate) is not accepted; a reference device supports a test method and is not a predicate. \`lookup_regulatory_precedents\` shows how comparable devices were cleared.
3. The substantial-equivalence argument. \`draft_510k_substantial_equivalence\` returns the comparison structure and the table format; draft each section from the sponsor's device data. The argument answers, in order: is the intended use the same; are the technological characteristics the same; where they differ, do the differences raise different questions of safety and effectiveness; and do the performance data show the device is as safe and effective as the predicate. A difference that raises different questions is not bridged by more testing; it points to a De Novo.
4. Performance testing summaries. For each test give the standard or method, the acceptance criteria set before testing, the samples (finished devices, or a justified equivalent), the results against the criteria and the conclusion. Where a recognised consensus standard is used, declare conformity and say which parts apply. \`get_biocompatibility_endpoints\` returns the endpoints for the contact category and duration; \`get_electrical_standards\` returns the applicable IEC 60601 standards. Software, cybersecurity and usability evidence follow their own standards (IEC 62304, the cybersecurity requirements for cyber devices, IEC 62366-1); risk management follows ISO 14971; an IVD's analytical studies follow the CLSI EP methods.
5. Assembly. \`assemble_device_submission\` (pathway 510(k)) reads the open project's device sections, their review status and the official eSTAR template, and returns whether an official eSTAR can be produced and every blocker; report it verbatim, and say so when its content source is not specific to the project. \`advise_device_readiness\` gives section completeness and prioritised next steps. \`get_device_reviewer_checklist\` lists the questions a reviewer asks of each section.
6. Review clocks are planning anchors from \`get_regulatory_timeline\`, never commitments.

## Pitfalls reviewers raise
- Indications for use broader than the predicate's without data for the difference.
- Test summaries without acceptance criteria, or on samples not representative of the finished device.
- Missing software, cybersecurity or biocompatibility documentation for a device that needs it.
- Comparison tables that list differences without saying why each does not raise different questions.

## Before answering
- The predicate position and every score, completeness figure and blocker came from a named tool.
- Each technological difference is addressed by data or a stated rationale.
- The eSTAR is not called complete unless the assembly engine can produce an official eSTAR.

## Not AnA's to decide
- FDA decides substantial equivalence; the sponsor chooses the predicate and signs the submission.
- AnA does not transmit to FDA; the sponsor files the eSTAR.
`,
  }),

  skill({
    key: 'submissions.device-de-novo-and-pma',
    name: 'De Novo requests and PMA applications',
    description:
      'Preparing a De Novo classification request or a premarket approval application for a device or IVD: entry conditions, content, special controls, the modular PMA, and readiness in the platform.',
    disciplines: ['regulatory-operations', 'device-engineering', 'diagnostics'],
    useCases: ['submission-assembly', 'drafting', 'gap-analysis'],
    segments: ['device', 'ivd'],
    submissionTypes: ['US_DE_NOVO', 'US_PMA', 'US_DE_NOVO_IVD', 'US_PMA_IVD'],
    regions: ['US'],
    triggers: [
      'de novo',
      'de novo request',
      'de novo classification',
      'special controls',
      'pma',
      'premarket approval',
      'pma application',
      'original pma',
      'modular pma',
      'pma module',
      'pma shell',
      'advisory panel',
      'reasonable assurance of safety and effectiveness',
      'pma readiness',
      'class iii submission',
    ],
    tools: [
      'plan_device_submission',
      'design_device_clinical_evidence',
      'advise_pma_readiness',
      'assemble_device_submission',
      'advise_device_readiness',
      'get_device_reviewer_checklist',
      'lookup_regulatory_precedents',
      'get_regulatory_timeline',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'currency-fact', id: 'fda-estar-denovo-mandatory' },
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'standard', id: 'cfr_820_qmsr' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'record', id: 'shared/regulatory/pathway-cautions.ts', label: "Cautions a program's own answers raise against a pathway" },
      { kind: 'record', id: 'shared/regulatory/predicate-positions.ts', label: '510(k) predicate strategies and what each commits a submission to' },
    ],
    instructions: `
## When this applies
A device or IVD is going to FDA as a De Novo classification request or a premarket approval application: its entry conditions, content, special controls, the modular PMA, and readiness.

## Method
1. Confirm the route's entry conditions before building content (pathway-cautions and predicate-positions records). A De Novo needs either no legally marketed device to compare to, or a not-substantially-equivalent determination on a 510(k) already filed, and asks FDA to classify the device into Class I or II. A device that is Class III by its risk goes by PMA. When the record pairs De Novo with Class III, or with a named predicate, raise the contradiction first.
2. Required content. \`plan_device_submission\` returns the content for the chosen pathway (De Novo content under 21 CFR 860 Subpart D, PMA content under Part 814), with an indicative timeline and a Pre-Submission strategy. A De Novo is filed through eSTAR (currency fact).
3. De Novo specifics. The request carries the classification the sponsor proposes, the risks to health the device presents, and for each risk its mitigation: general controls, and for Class II the special controls the sponsor proposes, each tied to the risk it mitigates and to the evidence (testing, labeling, clinical data) that shows the control works. Benefit-risk is argued for the device itself, not by comparison with a predicate. A granted De Novo creates a classification regulation, with its special controls, that later devices of the type must meet and can use as a predicate.
4. PMA specifics. A PMA must show, from valid scientific evidence, a reasonable assurance of safety and effectiveness: the device description, nonclinical laboratory studies, the clinical investigations, labeling, and the manufacturing information FDA reviews against the QMSR, with a pre-approval inspection. \`design_device_clinical_evidence\` returns whether clinical data and an IDE are needed and the evidence plan; report a null as not determined. A modular PMA submits sections as they are completed, under a shell agreed with FDA in advance; the final module completes the application.
5. Readiness. \`advise_pma_readiness\` reports completeness across the PMA module structure and the missing modules. \`assemble_device_submission\` (pathway De Novo or PMA) reads the open project's sections and returns what can be produced and every blocker. \`advise_device_readiness\` covers the De Novo eSTAR. Report them verbatim. \`get_device_reviewer_checklist\` lists the questions reviewers ask of a De Novo or a PMA.
6. Precedent. \`lookup_regulatory_precedents\` finds granted De Novos and approved PMAs for similar devices, including the special controls FDA set; confirm against the classification database or the granted order before citing one.
7. Review clocks are planning anchors from \`get_regulatory_timeline\`. Manufacturing and quality-system statements are made against the QMSR; \`check_regulatory_currency\` confirms its status, and removed QSR sections are never cited as current.

## Pitfalls reviewers raise
- Special controls that do not map to the identified risks, or are too vague to test against.
- A De Novo that relies on a predicate-style comparison instead of a benefit-risk argument for the device.
- A PMA whose clinical data do not support every claim in the proposed labeling.
- Manufacturing sections not ready for the pre-approval inspection.

## Before answering
- The route was checked against its entry conditions before content was discussed.
- Completeness figures and blockers are the engines'.
- Each special control is tied to a named risk.

## Not AnA's to decide
- FDA grants or declines a De Novo and approves or denies a PMA; an advisory panel advises FDA and does not decide.
- AnA does not transmit to FDA; the sponsor signs and files.
`,
  }),

  skill({
    key: 'submissions.eu-technical-documentation',
    name: 'EU MDR and IVDR technical documentation',
    description:
      'Building EU MDR or IVDR technical documentation (Annex II and III), the GSPR checklist, the EU declaration of conformity, notified body interaction and EUDAMED registration for a device or IVD.',
    disciplines: ['regulatory-operations', 'device-engineering', 'diagnostics'],
    useCases: ['submission-assembly', 'gap-analysis', 'drafting'],
    segments: ['device', 'ivd'],
    regions: ['EU'],
    documentTypes: ['EU_MDR_TECHDOC', 'EU_IVDR', 'EU_DOC'],
    triggers: [
      'technical documentation',
      'technical file',
      'mdr technical documentation',
      'ivdr technical documentation',
      'annex ii',
      'annex iii',
      'gspr',
      'gspr checklist',
      'general safety and performance requirements',
      'essential principles',
      'declaration of conformity',
      'eu declaration of conformity',
      'notified body',
      'notified body review',
      'ce marking',
      'ce mark',
      'eudamed',
      'basic udi-di',
      'single registration number',
      'srn',
      'conformity assessment',
      'udi registration',
    ],
    tools: [
      'classify_device',
      'advise_eu_technical_file_readiness',
      'assess_pathway_readiness',
      'build_pathway_manifest',
      'assess_essential_principles',
      'assess_device_evidence_structure',
      'get_device_reviewer_checklist',
      'generate_declaration_of_conformity',
      'check_regulatory_currency',
      'search_eudamed',
    ],
    references: [
      { kind: 'standard', id: 'eu_mdr' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'currency-fact', id: 'eu-eudamed-mandatory' },
      { kind: 'record', id: 'shared/regulatory/device-class.ts', label: 'US, MDR and IVDR risk classes, declared and rule-derived' },
    ],
    instructions: `
## When this applies
A device or IVD is being placed on the EU market under the MDR or the IVDR: building the technical documentation (Annexes II and III), the GSPR checklist, the declaration of conformity, the notified body's review and the EUDAMED registrations.

## Method
1. Establish the class and the conformity assessment route first; they decide whether a notified body is involved and what it assesses. \`classify_device\` (framework \`mdr\` or \`ivdr\`) gives the class with the rule that produced it. A declared Is, Im or Ir device involves a notified body for that aspect only (device-class record). Do not build a file for a class the rules have not settled.
2. Structure. The technical documentation follows Annex II: device description and specification; information supplied by the manufacturer; design and manufacturing information; the general safety and performance requirements; benefit-risk analysis and risk management; product verification and validation. Annex III covers post-market surveillance. \`advise_eu_technical_file_readiness\` (regulation MDR or IVDR) reports which sections are present and missing. For a sequence in the platform, \`assess_pathway_readiness\` and \`build_pathway_manifest\` (pathway EU MDR or IVDR) give the required-slot gap report and the ordered table of contents.
3. GSPRs. \`assess_essential_principles\` builds the conformity matrix: for each requirement whether it applies, the standard or evidence that shows conformity, and whether it is addressed or a gap. A requirement whose device property was not stated is not assessed, never "not applicable"; every requirement marked not applicable carries a justification. A harmonised standard gives a presumption of conformity only for the requirements it covers.
4. Clinical and performance evidence. The clinical evaluation (MDR) or performance evaluation (IVDR: scientific validity, analytical performance, clinical performance) is the core of the file. \`assess_device_evidence_structure\` checks a CER, PER or risk management file against its regulated structure; \`get_device_reviewer_checklist\` lists what a notified-body reviewer asks of a CER or PER. Risk management follows ISO 14971, and the quality management system ISO 13485.
5. Declaration of conformity. \`generate_declaration_of_conformity\` returns the structured declaration from the manufacturer, product, Basic UDI-DI, class, route, notified body and standards, or the fields still missing; relay a missing list exactly. The manufacturer signs it once the conformity assessment is complete.
6. EUDAMED. Actor registration (which gives the single registration number), UDI and device registration, and notified body certificates are EUDAMED modules being made mandatory; run \`check_regulatory_currency\` for which are mandatory, from when, and the deadline for legacy devices, rather than stating dates. \`search_eudamed\` finds registered devices for comparison, cited by their EU identifier; relay an unavailable status as returned.
7. Notified body interaction. Answer each question the notified body raises with the section and evidence that address it, and record the changes made to the file in response.

## Before answering
- The class and route were established before the file's content.
- Every gap and verdict is the engine's, verbatim; nothing is called conforming that the tools did not show.
- EUDAMED and other dated obligations cite the currency fact.

## Not AnA's to decide
- Conformity and CE marking are the manufacturer's responsibility, on the notified body's certificate where the route requires one; the notified body decides on its certificate.
- AnA does not sign the declaration of conformity.
`,
  }),
];
