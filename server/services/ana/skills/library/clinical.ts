/**
 * Clinical development skills: the development plan, protocols and their
 * amendments, endpoints, consent, GCP conduct, the study report, the
 * Investigator's Brochure, the special areas (oncology dose optimization,
 * rare disease, vaccines, cell and gene therapy, pediatrics, real-world
 * evidence), and trial operations (registration and results disclosure, data
 * monitoring committees, feasibility and site selection).
 *
 * @module server/services/ana/skills/library/clinical
 */

import { skill, type LibrarySkillSource } from '../types.js';

const E6R3_RECORD = { kind: 'record', id: 'shared/regulatory/ich-e6r3.ts', label: 'ICH E6(R3) structure and E6(R2) crosswalk' } as const;
const M11_RECORD = { kind: 'record', id: 'shared/regulatory/protocol-m11.ts', label: 'ICH M11 protocol headings (levels 1 and 2)' } as const;
const CONSENT_RECORD = {
  kind: 'record',
  id: 'shared/regulatory/informed-consent-elements.ts',
  label: 'Elements of informed consent (21 CFR 50.25, 45 CFR 46.116)',
} as const;
const MODALITY_RECORD = { kind: 'record', id: 'shared/regulatory/modality.ts', label: 'Modality, review centre and pathway frames' } as const;
const DESIGNATIONS_RECORD = {
  kind: 'record',
  id: 'shared/regulatory/special-designations.ts',
  label: 'Special designations and pediatric programs',
} as const;
const FDA_FORMS_RECORD = {
  kind: 'record',
  id: 'server/config/FDAFormsRegistry.ts',
  label: 'Canonical FDA forms (1572, 3454, 3455, 3674) that prepare_fda_form drafts',
} as const;

export const CLINICAL_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'clinical',
    name: 'Clinical development',
    description:
      'Planning or checking a drug or biologic clinical development program: what each study must establish and in what order, quality by design under ICH E8(R1), the evidence standard aimed at, and which platform engines answer design, feasibility and precedent questions.',
    disciplines: ['clinical', 'regulatory-strategy'],
    useCases: ['strategy', 'study-design', 'review', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'clinical development',
      'clinical development plan',
      'clinical program',
      'clinical trial design',
      'phase 1',
      'phase 2',
      'phase 3',
      'pivotal trial',
      'registrational trial',
      'ich e8',
      'e8(r1)',
      'quality by design',
      'critical to quality',
      'adequate and well-controlled',
      'substantial evidence',
      'proof of concept',
      'choice of control',
      'multi-regional trial',
      'mrct',
    ],
    tools: [
      'global_ri_evidence_standard',
      'advise_study_design',
      'benchmark_precedent_trials',
      'compare_proposed_design_to_precedent',
      'search_clinical_evidence',
      'explain_design_risk',
      'assess_trial_feasibility',
      'check_guidance_freshness',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E8(R1)' },
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'E10' },
      { kind: 'ich', id: 'E17' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      E6R3_RECORD,
      MODALITY_RECORD,
    ],
    instructions: `
## When this applies
The question is about a clinical development program as a whole: which studies the program needs and in what order, whether a planned study can answer its question, or how a design compares with precedent. The sub-skills carry the method for a protocol, an amendment, endpoints, consent, GCP conduct, the study report, the Investigator's Brochure and the special areas.

## Method
1. Establish the product, its modality, the intended indication and population, and the regions from the program record, not from the wording of the question. Modality decides the review centre and statutory pathway (the modality record); say which you assumed when the record names none.
2. State each study by its objective and the development decision it informs: human pharmacology, exploratory, confirmatory or post-approval. A phase label describes sequence, not purpose. ICH E8(R1) asks that each study's design follow from its question and from what is critical to its quality.
3. Identify the critical-to-quality factors for each study: the design elements and data whose errors would undermine participant protection or the reliability of the result. They carry into the protocol and into risk-based quality management under ICH E6(R3) (Principles 6 and 7).
4. Establish the evidence standard the program is aiming at with \`global_ri_evidence_standard\` for each region (for the US, substantial evidence from adequate and well-controlled investigations, 21 CFR 314.126). Use ICH E10 for the choice of control and ICH E17 when one trial is meant to support several regions.
5. For a design under consideration, frame the hypothesis (superiority, non-inferiority, equivalence) and a planning sample size with \`advise_study_design\`; label the figure a planning estimate for the biostatistician to confirm.
6. Compare with precedent: \`benchmark_precedent_trials\` for sample size, duration and design distributions, \`compare_proposed_design_to_precedent\` for observed effects and agency objections on similar features, and \`search_clinical_evidence\` for comparable registered trials, cited by NCT ID. Use \`explain_design_risk\` for one feature (often the primary endpoint). Report low-evidence notes as returned.
7. For operational feasibility (recruitment, completion, competing trials) run \`assess_trial_feasibility\`; it answers whether the trial can be run, not whether the endpoint will succeed.
8. Currency: ICH E6(R3) is the GCP guideline in force and supersedes E6(R2). Cite E6(R3) by the section numbering in the E6(R3) record, never by E6(R2) numbers. Check the currency of any guideline a draft cites with \`check_guidance_freshness\`.
9. Before citing an ICH guideline's content, confirm it with \`lookup_ich_guideline\`. Refer to an FDA guidance by its topic and confirm it with \`lookup_fda_guidance\`; when the lookup holds nothing on the topic, say the guidance needs confirming.
10. Hand the specific work to the sub-skill: protocol design, amendments, endpoints and COAs, consent, GCP operations, the study report, the IB, oncology dose optimization, rare disease, vaccines, cell and gene therapy, pediatrics, real-world evidence.

## Before answering
- Each study is named with its objective and the decision it informs.
- Every figure comes from a named engine output or the program's own data; planning estimates are labelled as such.
- Precedent is cited by NCT ID or engine record, and the absence of an agency objection is not presented as acceptance.
- E6(R3) is cited by its own numbering; FDA guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether the evidence will support approval is the agency's determination; which studies to run and their final design are the sponsor's.
- The final sample size and analysis are the biostatistician's.
- AnA does not sign, approve or submit anything on her own authority.
`,
  }),

  skill({
    key: 'clinical.protocol-design',
    name: 'Protocol design and review',
    description:
      'Writing or reviewing an interventional clinical trial protocol in the ICH M11 structure: objectives, endpoints and estimands that align, eligibility, the schedule of activities and the content ICH E6(R3) Appendix B expects, using the platform protocol and study-design engines.',
    disciplines: ['clinical', 'medical-writing'],
    useCases: ['drafting', 'review', 'study-design', 'gap-analysis'],
    segments: ['pharma', 'biotech'],
    surfaces: ['protocol-dev'],
    documentTypes: ['ICH_PROTOCOL'],
    triggers: [
      'protocol design',
      'clinical protocol',
      'trial protocol',
      'study protocol',
      'write a protocol',
      'protocol synopsis',
      'ich m11',
      'm11 template',
      'cesharp',
      'structured protocol',
      'schedule of activities',
      'schedule of assessments',
      'eligibility criteria',
      'inclusion criteria',
      'exclusion criteria',
      'objectives and endpoints',
      'trial schema',
      'spirit checklist',
      'protocol completeness',
      '312.23(a)(6)',
    ],
    tools: [
      'create_protocol_document',
      'bind_protocol_to_study_design',
      'update_protocol_section',
      'add_protocol_objective',
      'define_estimand',
      'add_eligibility_criterion',
      'review_soa_matrix',
      'review_trial_schema',
      'review_protocol_completeness',
      'review_protocol_regulatory_rules',
      'review_protocol_design_gates',
      'derive_ctq_factors',
      'stress_test_protocol',
      'review_spirit_conformance',
      'generate_ctgov_registration_draft',
      'finalize_protocol_document',
    ],
    references: [
      { kind: 'ich', id: 'M11' },
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'E8(R1)' },
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'currency-fact', id: 'ich-m11-cesharp-step4' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      M11_RECORD,
      E6R3_RECORD,
    ],
    instructions: `
## When this applies
Drafting, structuring or reviewing an interventional trial protocol for a drug or biologic, on the Protocol Development screen or with a protocol open. A change to an approved protocol follows the protocol amendments skill.

## Method
1. Establish the trial's question before any text: the development decision it informs, the population, the intervention and comparator, and the regions. Read the program record and any existing protocol; take design inputs from approved sponsor sources and never invent them.
2. Use the ICH M11 structure (M11 reached Step 4; the protocol M11 record holds its level 1 and 2 headings and their purposes). Start a protocol with \`create_protocol_document\` (the clinical kind seeds the M11 sections) and bind it to its study design with \`bind_protocol_to_study_design\`. Several engines read the bound design and return an error when none is bound: say they did not run. Write sections with \`update_protocol_section\`. Keep every required heading; where content does not apply, write a justified not-applicable statement, as the record's limitations describe.
3. Align objectives, endpoints and estimands (M11 section 3, ICH E9(R1)). For each primary and key secondary objective there is one endpoint, its timepoint and an estimand with all five attributes. Record objectives with \`add_protocol_objective\` and construct or check each estimand with \`define_estimand\`. The analyses in section 10 must estimate those estimands; sample size and multiplicity belong to the biostatistics skills.
4. Eligibility (M11 sections 5.2 and 5.3): each criterion is verifiable at screening and justified by safety or by the scientific question, and the population is no narrower than that question needs (ICH E8(R1)). Record criteria with \`add_eligibility_criterion\`; thresholds come from approved sources.
5. Schedule of activities and schema (M11 sections 1.3 and 1.2): every assessment an endpoint or safety evaluation needs is scheduled with its window, and nothing is collected without a purpose. Check with \`review_soa_matrix\` and \`review_trial_schema\`.
6. Check content in this order, reporting each engine's counts and findings verbatim: \`review_protocol_completeness\` (the finalize gate), \`review_protocol_regulatory_rules\` (the rule pack: M11, E6(R3), E8(R1), E9(R1), and for a US IND 21 CFR 312.23(a)(6)), then \`review_protocol_design_gates\` (the design's gates). A not-assessed rule is not a pass.
7. Quality by design: \`derive_ctq_factors\` returns critical-to-quality factor seeds from the design. They are default seeds for the sponsor to rate, not an assessed risk.
8. Use \`stress_test_protocol\` to select the regulatory stress scenarios worth running on the design.
9. For a reporting-guideline check run \`review_spirit_conformance\`; report per-item statuses and the tool's note that SPIRIT 2013 has been superseded by SPIRIT 2025.
10. When registration is in view, \`generate_ctgov_registration_draft\` drafts the registry record from the protocol.
11. \`finalize_protocol_document\` reports whether the protocol can be finalized and the gaps. It does not finalize: a person signs in the protocol workspace.

## Pitfalls reviewers raise
- The primary endpoint worded differently in the synopsis, the objectives and the statistical section.
- An estimand with no intercurrent-event strategy, or an analysis that does not estimate it.
- Endpoint assessments missing from the schedule, or assessments that serve no objective.
- Dose modification, stopping or unblinding rules left vague.
- A safety-reporting section that does not match the sponsor's safety procedures.

## Before answering
- Every heading discussed is the M11 heading and number from the record; E6(R3) is cited by its own numbering.
- Engine outputs are reported verbatim, including not-assessed and not-run results.
- No threshold, visit window or sample size appears that the program's sources or an engine did not supply.

## Not AnA's to decide
- The design and the protocol's approval are the sponsor's; the IRB/IEC and the regulator review it.
- Whether an M11-formatted protocol is accepted in a given region needs confirming for that region.
- AnA does not finalize or sign a protocol.
`,
  }),

  skill({
    key: 'clinical.protocol-amendments',
    name: 'Protocol amendments',
    description:
      'Classifying, documenting and submitting a change to an approved clinical trial protocol: a summary of changes with a rationale for each, versioning, the consent and IB consequences, US IND protocol amendments and EU substantial modifications through CTIS.',
    disciplines: ['clinical', 'regulatory-operations'],
    useCases: ['lifecycle-change', 'drafting', 'review', 'submission-assembly'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'protocol amendment',
      'protocol amendments',
      'amend the protocol',
      'amended protocol',
      'amendment to the protocol',
      'summary of changes',
      'change in protocol',
      'changes in protocol',
      '312.30',
      'substantial modification',
      'substantial modifications',
      'non-substantial modification',
      'urgent safety measure',
      'apparent immediate hazard',
      'protocol redline',
      'protocol version',
      'amendment rationale',
    ],
    tools: [
      'create_protocol_amendment',
      'add_amendment_change',
      'review_protocol_redline',
      'review_amendment',
      'review_protocol_design_gates',
      'generate_ctgov_registration_draft',
    ],
    references: [
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'M11' },
      { kind: 'currency-fact', id: 'eu-ctis-only-trials' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      M11_RECORD,
      E6R3_RECORD,
    ],
    instructions: `
## When this applies
A change to a protocol that is already approved or in use: deciding what kind of change it is, documenting it, and getting it reviewed and authorised before it is implemented.

## Method
1. Establish what is changing and why, the version it changes, the trial's phase, the regions, and the IND or CTA under which it runs. Work from the current approved version on record, never from memory.
2. Open the amendment with \`create_protocol_amendment\`. Pass the amendment type and the affects-consent and affects-risk flags only when the sponsor has assessed them; an omitted flag is stored as not declared, which is right until a person decides. Add each change with \`add_amendment_change\`: section, previous text, proposed text and its own rationale.
3. Compare the recorded versions with \`review_protocol_redline\` and quote its per-section changes. The package carries a summary of changes (each change, its section, its rationale), a tracked-changes version and a clean version under a new version number and date. In M11 the Amendment Details front matter and section 12.3 hold the amendment history.
4. Classify the impact with \`review_amendment\`: IRB/IEC review status and, for IND studies, the 21 CFR 312.30 status. Relay undetermined and sponsor-determination-required statuses as returned.
5. US: a change in protocol that 312.30 covers is submitted to the IND as a protocol amendment and may be implemented once it has been submitted to FDA and approved by the IRB. A change made to eliminate an apparent immediate hazard to subjects may be implemented at once, with FDA and the IRB informed afterwards (21 CFR 312.30, 56.108, 312.66).
6. EU: a substantial modification is submitted through CTIS, the only entry point for EU trials, and is implemented only after it is authorised. Urgent safety measures are the exception: taken without prior authorisation and notified afterwards. Whether a change is substantial is the sponsor's assessment under the Clinical Trials Regulation; confirm the current EU guidance on what counts before advising.
7. Check and name each consequence:
   - Consent: when information participants rely on changes (procedures, risks, burden, duration), the consent form is updated; whether enrolled participants re-consent is the IRB/IEC's determination (informed consent skill).
   - IB: a safety-driven change usually rests on new safety information that also belongs in the IB (IB skill).
   - DMC: when the change follows a data monitoring committee recommendation, the package records the recommendation and the sponsor's decision.
   - Design: re-run \`review_protocol_design_gates\` on the amended design.
   - Registration: when outcomes, eligibility or enrollment change, regenerate the registry draft with \`generate_ctgov_registration_draft\`.
8. A change to the primary endpoint, the primary population or the primary analysis can make the trial a different study from the one planned, and one made after unblinded data have been seen threatens its interpretability. Say so, and recommend agency discussion before such a change.

## Pitfalls reviewers raise
- A summary of changes without a rationale for each change, or one that does not match the redline.
- A change implemented before IRB/IEC approval or authorisation.
- New risks or procedures with no consent update.
- Sites working to different protocol versions.

## Before answering
- Each change is stated with section, previous text, proposed text and rationale.
- The condition for implementation is stated for each region in scope.
- Engine statuses are relayed as returned, never upgraded to a yes or no.

## Not AnA's to decide
- The type and substantiality of a change are the sponsor's declaration; approval and re-consent are the IRB/IEC's; authorisation is the regulator's.
- AnA does not submit an amendment or sign for the sponsor.
`,
  }),

  skill({
    key: 'clinical.endpoints-and-coas',
    name: 'Endpoints and clinical outcome assessments',
    description:
      'Choosing and justifying trial endpoints, especially those measured by clinical outcome assessments (PRO, ClinRO, ObsRO, PerfO): concept of interest, context of use, fitness for purpose, meaningful within-patient change, biomarker endpoints and where an endpoint sits in the hierarchy.',
    disciplines: ['clinical', 'biostatistics'],
    useCases: ['study-design', 'strategy', 'review', 'agency-interaction'],
    triggers: [
      'clinical outcome assessment',
      'clinical outcome assessments',
      'coa',
      'patient-reported outcome',
      'patient-reported outcomes',
      'pro instrument',
      'clinro',
      'obsro',
      'perfo',
      'concept of interest',
      'content validity',
      'meaningful within-patient change',
      'meaningful change threshold',
      'responder definition',
      'endpoint selection',
      'choice of endpoint',
      'endpoint hierarchy',
      'surrogate endpoint',
      'label claim',
    ],
    tools: [
      'select_coa_type',
      'advise_coa_selection',
      'plan_coa_development',
      'assess_coa_validation',
      'assess_coa_fit_for_purpose',
      'determine_meaningful_change',
      'position_coa_endpoint',
      'classify_biomarker',
      'explain_design_risk',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ich', id: 'E8(R1)' },
    ],
    instructions: `
## When this applies
Selecting a primary or secondary endpoint, deciding how a concept should be measured, or judging whether a clinical outcome assessment (COA) can support an endpoint and a labeling claim. Estimand construction and multiplicity belong to the biostatistics skills.

## Method
1. Establish the concept of interest (which aspect of how a patient feels, functions or survives the treatment should change) and the context of use (population, trial design, endpoint position and the claim sought). Everything after this is judged against those two.
2. Decide who can validly report the concept with \`select_coa_type\`: a PRO when patients can report their own experience, an ObsRO when an observer reports observable behaviour for patients who cannot, a ClinRO when clinical judgement is needed, a PerfO for a standardized task. Use \`advise_coa_selection\` when the person needs the framework explained.
3. Decide between an existing instrument and new development with \`plan_coa_development\`; it flags modifications that would invalidate earlier validation.
4. Weigh the evidence: \`assess_coa_validation\` for measurement properties, content validity in the target population first; \`assess_coa_fit_for_purpose\` for this context of use, including recall period and mode of administration. Report gaps as returned.
5. For interpretation, take the meaningful within-patient change from \`determine_meaningful_change\`: anchor-based evidence is primary, distribution-based estimates are supportive. Report its threshold as returned; never propose one.
6. Place the endpoint with \`position_coa_endpoint\` (primary, key secondary, secondary or exploratory, and whether a claim is feasible). Subjective endpoints are weaker in open-label designs; multiplicity across the hierarchy goes to biostatistics.
7. For a biomarker or surrogate endpoint, classify it with \`classify_biomarker\` and state the evidentiary burden its use implies. Accelerated approval rests on an endpoint reasonably likely to predict clinical benefit (21 CFR 314 Subpart H; 21 CFR 601 Subpart E); whether one is, is the agency's call.
8. For the regulatory risk of a specific endpoint, run \`explain_design_risk\`; absence of objection is not acceptance.
9. FDA's COA framework sits in its patient-focused drug development guidance series, its guidance on patient-reported outcome measures and its guidance on multiple endpoints. Name them by topic, confirm with \`lookup_fda_guidance\`, and note that engines may cite earlier versions. Agreement on a COA endpoint is sought through COA qualification or the program's milestone meetings.

## Pitfalls reviewers raise
- An instrument validated in a different population with no content-validity evidence for this one.
- A responder threshold resting on distribution-based estimates alone.
- A recall period that does not fit the disease course or dosing.
- A switch from paper to electronic administration without evidence of equivalence.
- Claim wording broader than the concept the instrument measures.

## Before answering
- The concept of interest and context of use are stated before any recommendation.
- Every threshold, grade or position is the engine's output, quoted as returned.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether an endpoint or claim is acceptable is the agency's; COA qualification is an agency decision.
- The endpoint hierarchy is the sponsor's choice; psychometric analysis is for qualified measurement scientists.
`,
  }),

  skill({
    key: 'clinical.study-report',
    name: 'Clinical study reports (ICH E3)',
    description:
      'Writing or reviewing a clinical study report in the ICH E3 structure: synopsis, disposition, efficacy on the pre-specified population, safety by MedDRA SOC and PT, narratives, causality wording, and the consistency checks that keep text, tables and other documents in agreement.',
    disciplines: ['clinical', 'medical-writing'],
    useCases: ['drafting', 'review', 'analysis'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_CSR'],
    triggers: [
      'clinical study report',
      'clinical study reports',
      'csr',
      'csrs',
      'ich e3',
      'e3 structure',
      'csr synopsis',
      'study report synopsis',
      'study report',
      'subject disposition',
      'participant disposition',
      'patient narrative',
      'patient narratives',
      'safety narratives',
      'meddra version',
      'adverse event tables',
      'tables listings and figures',
      'tlfs',
      'in-text tables',
    ],
    tools: [
      'get_csr_template',
      'medical_writing_guidance',
      'narrate_statistical_result',
      'code_meddra',
      'draft_safety_narrative',
      'check_numerical_integrity',
      'reconcile_dossier_numbers',
      'check_dossier_consistency',
      'build_abbreviation_list',
      'medical_writing_review',
    ],
    references: [
      { kind: 'ich', id: 'E3' },
      { kind: 'ich', id: 'M1' },
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'standard', id: 'cfr_314' },
    ],
    instructions: `
## When this applies
Drafting, structuring or checking a clinical study report for an interventional study, or one of its parts: synopsis, disposition, efficacy and safety results, narratives.

## Method
1. Establish the inputs before writing: final protocol and amendments, the SAP version, database lock, the approved tables, listings and figures, the MedDRA version used for coding, and the data cut-off. Text is written from approved outputs, never from memory or estimate.
2. Use the ICH E3 structure: \`get_csr_template\` returns the E3 body or the standalone synopsis, and \`medical_writing_guidance\` (document type csr) the conventions. E3 is a guideline, not a fixed template (its Q&A says so): keep its headings and order where they fit, adapt where the study calls for it, and say what was adapted.
3. Synopsis (E3 section 2): self-contained and consistent with the body, figure for figure.
4. Disposition (E3 section 10): account for every participant from screening onward by arm: screen failures where the study records them, randomised, treated, completed and discontinued with reasons. Report protocol deviations and the analysis sets as the SAP defines them.
5. Efficacy (E3 section 11): the primary analysis on the pre-specified population and estimand, with the sensitivity analyses the SAP planned. Keep pre-specified and post hoc analyses apart. State each result through \`narrate_statistical_result\`, which flags multiplicity and exploratory status.
6. Safety (E3 section 12): exposure; adverse events by system organ class and preferred term, by arm, with severity and relatedness; deaths, serious adverse events, discontinuations for adverse events and other significant events; laboratory and vital-sign findings. State the MedDRA version once and use it throughout. Code verbatim terms only with \`code_meddra\`; when it reports license_required or no_match, say so and never supply a code.
7. Narratives: draft each with \`draft_safety_narrative\` from structured case facts, in one order for every narrative: exposure timeline, the event, its management, outcome, causality. Report the missing fields the tool lists; never fill them.
8. Causality wording attributes the judgement to its assessor: "assessed by the investigator as related", "considered by the sponsor as not related". Never state causality as fact.
9. Subgroups: present results by age, sex and race where the SAP or E3 calls for it; for a US NDA the integrated summaries present effectiveness and safety by these subgroups (21 CFR 314.50(d)(5)).
10. Before release: \`check_numerical_integrity\` on the draft, \`reconcile_dossier_numbers\` across protocol, SAP, CSR and Module 2, \`check_dossier_consistency\` against the project, \`build_abbreviation_list\`, and \`medical_writing_review\` (document type csr) for heading coverage. Heading coverage is not completeness.

## Pitfalls reviewers raise
- Figures in the text that differ from the tables.
- Conclusions drawn from a post hoc analysis or a non-primary population without saying so.
- Deaths or serious events in the tables with no narrative, or narratives that contradict the listings.
- A MedDRA version not stated, or mixed versions in one report.
- A disposition that does not reconcile from screening to completion.

## Before answering
- Every number traces to an approved output or an engine result; candidates from the consistency checks are adjudicated, not ignored.
- Causality and expectedness are attributed to the person who assessed them.
- The MedDRA version and the analysis population are stated where results are given.

## Not AnA's to decide
- The interpretation of results belongs to the sponsor's clinical and statistical leads; causality assessments belong to the investigator and the sponsor's medical reviewers.
- AnA does not alter data, approve the report or sign it.
`,
  }),

  skill({
    key: 'clinical.investigator-brochure',
    name: "Investigator's Brochure",
    description:
      "Writing, updating or reviewing an Investigator's Brochure under ICH E6(R3) Appendix A: the information investigators need for safe conduct, the reference safety information used for expectedness, and when and how revisions are made and communicated.",
    disciplines: ['clinical', 'medical-writing', 'safety'],
    useCases: ['drafting', 'review', 'lifecycle-change'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_IB'],
    triggers: [
      "investigator's brochure",
      'investigator brochure',
      'investigators brochure',
      'ib update',
      'update the ib',
      'ib revision',
      'ib edition',
      'ib addendum',
      'reference safety information',
      'expectedness assessment',
      'guidance for the investigator',
      'summary of data and guidance',
    ],
    tools: [
      'search_all_documents',
      'read_vault_document',
      'medical_writing_guidance',
      'code_meddra',
      'check_dossier_consistency',
      'medical_writing_review',
      'generate_document',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'E2F' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      E6R3_RECORD,
      { kind: 'record', id: 'server/services/market-specs/ib-outline-detail.ts', label: "The platform's IB outline (front matter and sub-sections)" },
    ],
    instructions: `
## When this applies
Writing a first Investigator's Brochure (IB), updating one for new nonclinical, clinical or safety information, or reviewing one before it goes to investigators, IRBs/IECs or regulators.

## Method
1. Establish the edition being written, the edition it supersedes, the data cut-off and the sources: nonclinical reports and summaries, clinical results, safety database outputs and the formulation description. Find them with \`search_all_documents\` and read them with \`read_vault_document\`; every statement traces to a source.
2. ICH E6(R3) Appendix A sets the IB's content. The platform's IB outline follows it: summary; introduction; physical, chemical and pharmaceutical properties and formulation; nonclinical studies; effects in humans; summary of data and guidance for the investigator. Use \`medical_writing_guidance\` (document type ib) for conventions and confirm Appendix A content with \`lookup_ich_guideline\` before citing it.
3. Present data concisely, objectively and without promotion. Explain what nonclinical findings mean for humans and how the dose and regimen follow from the data, so an investigator can make an independent benefit-risk judgement.
4. Make the guidance-for-the-investigator section actionable: the identified and potential risks, what to monitor, how to recognise and manage overdose and adverse reactions, and the precautions that follow.
5. Keep a clearly identified reference safety information (RSI) section: the reactions the sponsor considers expected for expectedness assessment, each with its basis. Express terms as MedDRA preferred terms through \`code_meddra\`; when it reports license_required, say so and do not supply codes.
   - US: an adverse event is unexpected for IND safety reporting when it is not listed in the IB, or not at the specificity or severity observed (21 CFR 312.32).
   - EU: treat a change to the RSI as a substantial modification, authorised through CTIS before it is used for expectedness; confirm against the current EU guidance on reference safety information.
   - The DSUR uses the IB edition in effect at the start of its reporting period as its reference (ICH E2F); record which edition that was.
6. Revision: review the IB on the cycle the sponsor's procedures set (at least annually is the long-standing GCP expectation) and revise it when significant new information arises. Significant new safety information reaches investigators promptly, not at the next edition (in the US, 21 CFR 312.55). The IND annual report describes IB revisions and includes the revised IB (21 CFR 312.33).
7. Check consistency with \`check_dossier_consistency\` against the protocol, the nonclinical summaries and the latest DSUR (doses, exposure margins, risks), and heading coverage with \`medical_writing_review\` (document type ib). Coverage is not completeness.
8. Produce the formatted document with \`generate_document\` (document type ib) from approved section content; producing it is not approving it.

## Pitfalls reviewers raise
- An RSI that is out of date, not clearly identified, or lists reactions without a basis.
- Guidance for the investigator that restates data but gives no management advice.
- Nonclinical findings listed without their relevance to humans.
- Risks in the IB that the protocol's safety monitoring does not address.

## Before answering
- The edition, the edition superseded and the data cut-off are stated.
- Every safety statement traces to a source document; expectedness is the sponsor's documented judgement.
- E6(R3) is cited by its own numbering (Appendix A), never by E6(R2) section 7.

## Not AnA's to decide
- What is expected, and the release of each edition, are the sponsor's decisions by its medically qualified reviewers; authorisation of an EU RSI change is the member states'.
- AnA does not approve or release an IB.
`,
  }),

  skill({
    key: 'clinical.informed-consent',
    name: 'Informed consent',
    description:
      'Designing, drafting and reviewing informed consent forms and the consent process: the 21 CFR 50.25 elements and Common Rule elements from the platform record, ICH E6(R3) consent principles, readability, assent and permission for children, electronic consent and re-consent.',
    disciplines: ['clinical'],
    useCases: ['drafting', 'review', 'gap-analysis'],
    documentTypes: ['ICH_ICF'],
    triggers: [
      'informed consent',
      'informed consent form',
      'consent form',
      'consent forms',
      'icf',
      'icfs',
      '50.25',
      'elements of informed consent',
      'consent elements',
      're-consent',
      'reconsent',
      'assent',
      'parental permission',
      'econsent',
      'electronic consent',
      'electronic informed consent',
      'key information section',
      'consent readability',
      'legally authorized representative',
      'short form consent',
    ],
    tools: [
      'design_informed_consent',
      'create_consent_form',
      'update_consent_element',
      'review_consent_completeness',
      'review_informed_consent',
      'assess_readability',
    ],
    references: [
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'E18' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      CONSENT_RECORD,
      E6R3_RECORD,
    ],
    instructions: `
## When this applies
Designing the consent process for a trial, drafting or revising a consent form, checking a form before IRB/IEC submission, or deciding what a protocol change means for consent.

## Method
1. Establish the regime: FDA-regulated (21 CFR 50, drugs, biologics and devices alike), the Common Rule (45 CFR 46) for HHS-conducted or -supported research, or both; the EU Clinical Trials Regulation; ICH E6(R3) (Principle 2 and Annex 1 §2.8). Establish whether the trial is an applicable clinical trial; when unknown, that is a question to ask, not a missing element. Establish the population: adults who can consent, children, adults unable to consent, emergency settings.
2. Take the element set from the platform record of consent elements, never from memory: the 21 CFR 50.25(a) basic elements on every form, the 50.25(b) additional elements when appropriate, the 50.25(c) ClinicalTrials.gov statement for an applicable clinical trial, and the Common Rule-only elements (key information first, future use, commercial profit, return of results, genome sequencing) when the Common Rule applies. \`design_informed_consent\` returns the framework for the study's features.
3. Draft in the platform: \`create_consent_form\` seeds the element rows from the record, and \`update_consent_element\` writes each element's content with its source. Use language the participant can understand and no exculpatory language (21 CFR 50.20). Risks, procedures, visits and duration match the current protocol and IB.
4. Review in two passes: \`review_consent_completeness\` for the form's element rows, and \`review_informed_consent\` for the wording of a draft against 50.25 and E6(R3) Annex 1 §2.8. Its matching is cue-based: "not found" means the wording was not found, not that the form is deficient.
5. Readability: score the text with \`assess_readability\` for a patient audience. No regulation fixes a grade level; the IRB/IEC's target applies.
6. Special populations: for children, parental permission and assent under 21 CFR 50 Subpart D; for adults unable to consent, a legally authorized representative as applicable law defines; for emergency research, the exception in 21 CFR 50.24, which is narrow and governed by the IRB and FDA; for participants who do not read the form's language, a translated form or a short-form process the IRB approves.
7. Electronic consent: identity verification, how understanding is checked, how the signed record is retained, and Part 11 for electronic signatures. Name FDA's guidance on electronic informed consent by topic; it needs confirming before citing.
8. Re-consent: significant new findings that may affect willingness to continue are given to participants (21 CFR 50.25(b)(5)); a protocol change to participant-facing information leads to a revised form. Whether and when enrolled participants re-consent is the IRB/IEC's determination.
9. Genomic sampling and future use of samples follow ICH E18 considerations alongside the Common Rule elements.
10. Documentation: a signed and dated written form (21 CFR 50.27) unless the IRB waives documentation under 21 CFR 56.109(c).

## Pitfalls reviewers raise
- A confidentiality statement that does not say FDA may inspect the records.
- No ClinicalTrials.gov statement on a form for an applicable clinical trial.
- Risks that do not match the IB or the protocol.
- No statement on compensation and treatment for injury in research above minimal risk.
- Technical wording, or language that waives the participant's rights.

## Before answering
- Each element is cited by its paragraph from the record, and the regime it comes from is named.
- Tool findings are reported as found or not found, not as compliant or deficient.
- E6(R3) consent content is cited as Annex 1 §2.8, never by an E6(R2) number.

## Not AnA's to decide
- The IRB/IEC approves the form and decides on re-consent, waivers and the readability target; the investigator obtains consent.
- Whether a form meets local law outside the US is for the sponsor's qualified reviewers.
- AnA never signs or approves a consent form.
`,
  }),

  skill({
    key: 'clinical.gcp-operations',
    name: 'GCP operations and inspection readiness',
    description:
      'Running a trial under ICH E6(R3): obligations by role, risk-based quality management and monitoring, essential records and the trial master file, protocol deviations, sponsor oversight, data governance, and readiness for a GCP inspection.',
    disciplines: ['clinical', 'quality-systems'],
    useCases: ['review', 'gap-analysis', 'strategy'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['QMS_GCP_COMPLIANCE'],
    triggers: [
      'good clinical practice',
      'gcp',
      'gcp compliance',
      'ich e6',
      'e6(r3)',
      'risk-based monitoring',
      'risk-based quality management',
      'monitoring plan',
      'centralized monitoring',
      'source data verification',
      'protocol deviation',
      'protocol deviations',
      'important protocol deviation',
      'serious breach',
      'essential records',
      'essential documents',
      'trial master file',
      'tmf',
      'inspection readiness',
      'bimo inspection',
      'form 483',
      'sponsor oversight',
      'delegation log',
      'form fda 1572',
      'ctq factors',
    ],
    tools: [
      'check_guidance_freshness',
      'advise_gcp',
      'design_monitoring_plan',
      'plan_essential_documents',
      'classify_protocol_deviation',
      'report_protocol_deviation',
      'review_deviation_trends',
      'assess_gcp_compliance',
      'assess_inspection_readiness',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'E8(R1)' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      { kind: 'currency-fact', id: 'ich-e6r3-annex2-step4' },
      { kind: 'currency-fact', id: 'eu-e6r3-effective' },
      { kind: 'currency-fact', id: 'eu-e6r3-annex2-effective' },
      E6R3_RECORD,
    ],
    instructions: `
## When this applies
Questions about conducting a trial under GCP: who is responsible for what, how quality and monitoring are planned, what records must exist, how a deviation is handled, and whether a sponsor, CRO, site or IRB is ready for inspection.

## Method
1. Establish the role asking (sponsor, CRO, investigator site, IRB/IEC), the trial's phase and design, the regions, and what is wanted: a plan, an assessment, a deviation decision or inspection preparation.
2. ICH E6(R3) is in force and supersedes E6(R2). Cite it by the numbering in the E6(R3) record (11 Principles; Annex 1 §1 IRB/IEC, §2 investigator, §3 sponsor, §4 data governance; Appendix C essential records), never by E6(R2) numbers. Annex 2 adds considerations for decentralised, pragmatic and real-world-data elements, and its effective dates differ by region. Check any cited guideline's currency with \`check_guidance_freshness\` rather than from memory.
3. Obligations by role: \`advise_gcp\` returns the principles or one domain (sponsor, investigator, IRB/IEC) with citations. Delegation of tasks to service providers leaves responsibility with the sponsor (Annex 1 §3.9 sponsor oversight, §3.6 agreements).
4. Quality management: identify what is critical to quality and the risks to it (Annex 1 §3.10, §3.10.1), and keep controls proportionate to those risks (Principle 7). \`design_monitoring_plan\` returns a monitoring mix, key risk indicators and visit guidance from the trial's design factors; a factor left out is not scored. Monitoring is Annex 1 §3.11.4.
5. Essential records: \`plan_essential_documents\` returns the trial master file and investigator site file plan by trial stage, with retention guidance (Appendix C; in the US, 21 CFR 312.57 and 312.62).
6. Deviations: classify with \`classify_protocol_deviation\` (important or not, reportability); a fact left out is not read as false. Record with \`report_protocol_deviation\`, passing severity and safety impact only when a person has stated them. Trend with \`review_deviation_trends\` and report its signals and null shares as returned. Investigator compliance is Annex 1 §2.5 and sponsor handling of non-compliance §3.12. In the EU a serious breach has its own notification duty under the Clinical Trials Regulation; the clock applies only when a person has determined the breach is serious.
7. Data governance: computerised systems fit for purpose and validated, audit trails reviewed, blinding protected in data flows (Annex 1 §4, including §4.1 on blinding and §4.3 on computerised systems).
8. Compliance assessment: \`assess_gcp_compliance\` grades each principle; what is unverified stays unverified.
9. Inspection readiness: \`assess_inspection_readiness\` for the target (sponsor, CRO, investigator, IRB) returns prioritized gaps, common Form FDA 483 observations for that target and the traceability checks to run.
10. Confirm specific E6(R3) content with \`lookup_ich_guideline\` before quoting it.

## Pitfalls reviewers raise
- A trial master file filed in arrears, or missing delegation and training records.
- A monitoring plan that is not traceable to the identified risks.
- Deviations logged but not assessed for impact, not trended, or closed without effective CAPA.
- Oversight of service providers asserted but not documented.
- E6(R2) section numbers cited as the guideline in force.

## Before answering
- Every E6(R3) citation names a section that exists in the record.
- Severity, reportability and readiness come from the engines or from a person, never from AnA's own judgement.
- Not-assessed inputs are reported as not assessed.

## Not AnA's to decide
- Whether a deviation is a serious breach, and what is reported to authorities, are the sponsor's and investigator's determinations; CAPA adequacy is for their quality function.
- Inspection findings are the inspectorate's. AnA does not sign attestations or responses.
`,
  }),

  skill({
    key: 'clinical.oncology-dose-optimization',
    name: 'Oncology dose optimization',
    description:
      'Optimizing the dosage of an oncology drug or biologic before registrational trials: dose-finding design, backfill and expansion cohorts, exposure-response for efficacy and safety, randomized comparison of doses and choosing the recommended phase 2 dose rather than defaulting to the MTD.',
    disciplines: ['clinical', 'clinical-pharmacology'],
    useCases: ['study-design', 'strategy', 'analysis', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    therapeuticAreas: ['oncology'],
    triggers: [
      'dose optimization',
      'dosage optimization',
      'project optimus',
      'rp2d',
      'recommended phase 2 dose',
      'randomized dose comparison',
      'dose-finding',
      'dose finding',
      'dose escalation',
      'boin',
      'mtd',
      'maximum tolerated dose',
      'backfill cohort',
      'backfill cohorts',
      'dose expansion',
      'optimal biological dose',
      '3+3',
    ],
    tools: [
      'select_dose_finding_design',
      'design_dose_finding',
      'review_dose_escalation_design',
      'design_backfill_strategy',
      'assess_dose_exposure_response',
      'select_exposure_response_dose',
      'design_randomized_dose_comparison',
      'select_rp2d',
      'assess_project_optimus_alignment',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E4' },
      { kind: 'ta-profile', id: 'oncology' },
    ],
    instructions: `
## When this applies
An oncology program choosing its dosage: designing dose escalation, deciding what data to collect below the maximum tolerated dose, comparing doses, or justifying the dose taken into registrational trials.

## Method
1. Establish the modality and mechanism, the treatment setting (line of therapy, adjuvant or metastatic), the dose levels studied so far, and the PK, pharmacodynamic, safety and activity data in hand. FDA's Oncology Center of Excellence initiative Project Optimus set the expectation that dosage is optimized before registration rather than set at the MTD.
2. Escalation design: \`select_dose_finding_design\` recommends a design for the context (model-assisted or model-based designs over 3+3 where appropriate, time-to-event variants for late-onset toxicity). \`design_dose_finding\` computes the BOIN boundaries and decision table; \`review_dose_escalation_design\` reads the rules from a bound protocol and marks engine defaults the sponsor has not chosen. Report all of them verbatim.
3. Below the MTD: \`design_backfill_strategy\` plans backfill or expansion cohorts at cleared dose levels to gather PK, pharmacodynamic, biomarker, tolerability and activity data while escalation continues.
4. Exposure-response for both efficacy and safety: \`assess_dose_exposure_response\` characterizes the relationships and the therapeutic window; \`select_exposure_response_dose\` recommends the lowest dose reaching the efficacy plateau within the safety bound and contrasts it with the MTD. Never estimate an optimized dose by hand (ICH E4).
5. Randomized comparison: \`design_randomized_dose_comparison\` designs a comparison of two or more doses (arms, allocation, activity and tolerability endpoints, timing relative to registration).
6. Tolerability over time counts, not only first-cycle dose-limiting toxicity: dose modifications, interruptions and discontinuations over several cycles, low-grade chronic toxicities and patient-reported tolerability.
7. Dose for phase 2: \`select_rp2d\` integrates MTD, exposure, target engagement, longitudinal tolerability and activity across levels, without defaulting to the MTD.
8. Program check: \`assess_project_optimus_alignment\` returns gaps against the expectations, given the program's stage and setting.
9. FDA's guidance on optimizing the dosage of oncology drugs is the reference. Name it by topic and confirm it with \`lookup_fda_guidance\`; several engines cite an earlier draft, so confirm the current version before citing it as draft or final. Raise the dosage plan at a milestone meeting with the agency before the registrational trial.

## Pitfalls reviewers raise
- The MTD taken forward by default, with no comparison of lower doses.
- One dose studied, or doses compared without randomization.
- Exposure-response characterized for efficacy but not for safety.
- Tolerability judged on the first cycle only.

## Before answering
- Every dose, boundary, probability and recommendation is an engine output quoted verbatim, with engine defaults named as defaults.
- The data the recommendation rests on (levels, patients per level, cycles observed) are stated.
- Guidance is named by topic and its version confirmed or marked unconfirmed.

## Not AnA's to decide
- The dose taken forward is the sponsor's decision; whether the dosage is adequately optimized is the agency's view.
- Escalation decisions during a trial belong to the safety review committee the protocol names.
`,
  }),

  skill({
    key: 'clinical.rare-disease-development',
    name: 'Rare disease development',
    description:
      'Developing a drug or biologic for a rare disease: natural history, endpoints in heterogeneous diseases, efficient designs for small populations, external controls and Bayesian borrowing, the evidence standard and designations.',
    disciplines: ['clinical', 'regulatory-strategy'],
    useCases: ['strategy', 'study-design', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    therapeuticAreas: ['rare_disease'],
    triggers: [
      'rare disease',
      'rare diseases',
      'orphan disease',
      'ultra-rare',
      'natural history study',
      'natural history data',
      'external control',
      'external control arm',
      'externally controlled trial',
      'historical control',
      'small population',
      'small populations',
      'single-arm trial',
      'bayesian borrowing',
      'n-of-1',
      'heterogeneous phenotype',
    ],
    tools: [
      'plan_rare_disease_program',
      'design_natural_history_study',
      'assess_rare_disease_endpoint',
      'assess_small_population_design',
      'design_external_control',
      'plan_bayesian_borrowing',
      'review_external_control_plan',
      'global_ri_evidence_standard',
      'assess_pathway_eligibility',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E10' },
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ta-profile', id: 'rare_disease' },
      DESIGNATIONS_RECORD,
    ],
    instructions: `
## When this applies
A program for a rare disease where the usual trial assumptions do not hold: few patients, heterogeneous or poorly characterized disease course, no established endpoint, randomization hard to justify or to recruit.

## Method
1. Establish what is known: prevalence and how many patients can be enrolled, seriousness, the disease course and its heterogeneity, existing natural history data, validated endpoints, biomarkers, and whether randomization is feasible. Unknowns are listed as unknowns.
2. Program plan: \`plan_rare_disease_program\` returns the evidence-generation strategy, the control strategy and the sequence of agency interactions for the facts given.
3. Natural history: when the course is not characterized well enough to design a trial or choose an endpoint, \`design_natural_history_study\` designs the study for its intended use (endpoint development, external control, feasibility).
4. Endpoint: \`assess_rare_disease_endpoint\` ranks endpoint strategies for heterogeneous disease (validated endpoint, within-patient change, responder index, surrogate, time to event) with the validation each needs. COA development follows the endpoints and COAs skill.
5. Design: \`assess_small_population_design\` ranks designs for the disease's features (crossover, randomized withdrawal, N-of-1, adaptive, externally controlled).
6. External control: \`design_external_control\` grades the source's suitability and lists the bias sources and safeguards; for a protocol with a bound design, \`review_external_control_plan\` reports which planned elements are stated. ICH E10 explains why external controls are prone to bias; check comparability of populations, time zero, endpoint ascertainment and changes in care over time.
7. Borrowing: \`plan_bayesian_borrowing\` selects a borrowing method and covers effective sample size, prior-data conflict and type I error. Borrowing is pre-specified and agreed, never chosen after seeing data.
8. Evidence standard: \`global_ri_evidence_standard\` returns the standard for the region. FDA has guidance on demonstrating substantial evidence with one adequate and well-controlled trial plus confirmatory evidence; name it by topic and confirm with \`lookup_fda_guidance\`, as for FDA's rare disease and external control guidance.
9. Designations: \`assess_pathway_eligibility\` checks orphan, breakthrough, fast track or accelerated approval criteria against stated answers; the designations record lists the programs.

## Pitfalls reviewers raise
- An external control whose population, time zero or endpoint measurement does not match the trial.
- Natural history data too sparse or too old to serve as a comparator.
- Endpoints that miss what matters in a heterogeneous disease, or lack content validity.
- Borrowing chosen or tuned after data were seen.

## Before answering
- Every figure (effective sample size, enrollable patients, grades) is an engine output or program data.
- The limits of any external comparison are stated alongside it.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether an external control or a single trial can be adequate is the agency's judgement; designations are granted by the agency.
- The program's design is the sponsor's decision.
`,
  }),

  skill({
    key: 'clinical.vaccines',
    name: 'Vaccine clinical development',
    description:
      'Planning the clinical program for a preventive vaccine: efficacy trials or immunobridging, immunogenicity endpoints and correlates of protection, lot-to-lot consistency, reactogenicity and safety follow-up, and special populations.',
    disciplines: ['clinical'],
    useCases: ['strategy', 'study-design'],
    segments: ['biotech'],
    therapeuticAreas: ['vaccines'],
    triggers: [
      'vaccine trial',
      'vaccine trials',
      'vaccine clinical program',
      'vaccine efficacy',
      'vaccine platform',
      'correlate of protection',
      'correlates of protection',
      'immunobridging',
      'lot consistency',
      'lot-to-lot consistency',
      'seroconversion',
      'seroresponse',
      'reactogenicity',
      'solicited adverse events',
      'immunogenicity endpoint',
      'maternal immunization',
      'age de-escalation',
      'geometric mean titer',
    ],
    tools: [
      'assess_vaccine_platform',
      'design_vaccine_clinical_program',
      'assess_correlate_of_protection',
      'assess_lot_consistency',
      'plan_vaccine_special_populations',
      'lookup_fda_guidance',
    ],
    references: [{ kind: 'ta-profile', id: 'vaccines' }, MODALITY_RECORD],
    instructions: `
## When this applies
A preventive vaccine program deciding how to show that the vaccine protects and is safe: efficacy trials or immunobridging, which immune measures can serve as endpoints, how manufacturing consistency is shown clinically, and how special populations are reached.

## Method
1. Establish the pathogen, the platform, the target population, the disease's seriousness and incidence, whether an accepted correlate of protection exists, and whether a field efficacy trial is feasible. In the US, preventive vaccines are reviewed by CBER as biologics licensed under section 351 (modality record).
2. Platform: \`assess_vaccine_platform\` states how much prior platform knowledge carries over to a new antigen and the platform's risks.
3. Program: \`design_vaccine_clinical_program\` returns the efficacy-or-immunobridging decision, per-phase objectives, immunogenicity endpoint definitions and the safety database and follow-up for the facts given. Its reference success criterion comes from one disease context; the criterion for this pathogen is set and agreed with the agency.
4. Correlates: \`assess_correlate_of_protection\` classifies a proposed correlate and whether it can serve as a threshold or surrogate. A threshold accepted for one pathogen does not transfer to another.
5. Immunogenicity endpoints depend on validated assays; the assay and its validation are settled before the data that rely on them are generated.
6. Lot consistency: when a clinical lot-consistency study is needed, \`assess_lot_consistency\` designs the equivalence comparison. The margin and the lots are pre-specified; whether the study is needed is a product-specific question for the agency.
7. Safety: solicited local and systemic reactions over a defined post-vaccination window, unsolicited events, serious events and adverse events of special interest for the platform and pathogen, with follow-up long enough for the risks in view. FDA's guidance on toxicity grading for healthy volunteers in vaccine trials is named by topic and confirmed with \`lookup_fda_guidance\`, as are other CBER vaccine guidances.
8. Special populations: \`plan_vaccine_special_populations\` covers pediatric age de-escalation, maternal immunization, older adults and immunocompromised people, including platform contraindications. Pediatric obligations follow the pediatrics skill.

## Pitfalls reviewers raise
- Immunobridging proposed without an accepted correlate or a justified bridge.
- Immunogenicity data from an assay validated after the samples were tested.
- Safety follow-up too short for the platform's known or theoretical risks.
- Lot-consistency margins chosen after the data.

## Before answering
- Endpoints, thresholds, margins and sample sizes are engine outputs or program data, quoted as returned.
- A threshold or criterion from another pathogen or context is not presented as applying here.
- CBER guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether immunobridging or a correlate is acceptable, and whether a lot-consistency study is required, are the agency's decisions, often with advisory committee input.
- The program design is the sponsor's.
`,
  }),

  skill({
    key: 'clinical.cell-and-gene-therapy',
    name: 'Cell and gene therapy development',
    description:
      'Classifying and developing cell and gene therapies (ATMPs): regulatory classification and pathway, first-in-human and dose considerations, CAR-T specifics, long-term follow-up, shedding and vector immunity, and comparability across manufacturing changes.',
    disciplines: ['clinical', 'regulatory-strategy', 'cmc'],
    useCases: ['strategy', 'study-design', 'gap-analysis'],
    segments: ['biotech'],
    therapeuticAreas: ['gene_cell_therapy'],
    triggers: [
      'gene therapy',
      'cell therapy',
      'cell and gene therapy',
      'atmp',
      'atmps',
      'car-t',
      'car t',
      'aav vector',
      'lentiviral vector',
      'long-term follow-up',
      'ltfu',
      'genome editing',
      'vector shedding',
      'insertional mutagenesis',
      'hct/p',
      'section 361',
      'atmp classification',
      'cytokine release syndrome',
      'icans',
    ],
    tools: [
      'classify_atmp',
      'select_atmp_pathway',
      'assess_gene_therapy_requirements',
      'assess_cell_therapy_manufacturing',
      'assess_cart_requirements',
      'assess_atmp_comparability',
      'search_drug_labels',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ta-profile', id: 'gene_cell_therapy' },
      { kind: 'standard', id: 'phs_351' },
      { kind: 'ich', id: 'S12' },
      { kind: 'ich', id: 'Q5E' },
      MODALITY_RECORD,
    ],
    instructions: `
## When this applies
A cell or gene therapy program: how the product is classified, which pathway applies, what the first clinical studies need, and what manufacturing and follow-up obligations shape the clinical program.

## Method
1. Establish the product: cell source (autologous or allogeneic), manipulation, genetic modification and vector (integrating or not, AAV, lentiviral, genome editing), route and delivery, indication, and the jurisdictions in scope.
2. Classification: \`classify_atmp\` returns the EU ATMP category under Regulation (EC) No 1394/2007, the US framework (a biologic licensed under PHS Act section 351, or an HCT/P regulated solely under section 361 and 21 CFR Part 1271 when all its criteria are met) and the Japanese category. In the US, cell and gene therapies are reviewed by CBER (modality record). Formal classification is the agency's: the CAT's scientific recommendation in the EU, FDA's determination in the US.
3. Pathway and programs: \`select_atmp_pathway\` returns the pathway and the expedited programs to consider per jurisdiction (RMAT, breakthrough, PRIME and others) and the mandatory requirements.
4. Product-type requirements: \`assess_gene_therapy_requirements\` (vector profile, nonclinical biodistribution and shedding, clinical requirements, long-term follow-up), \`assess_cell_therapy_manufacturing\` (GMP, starting materials, release testing, potency, chain of identity) and \`assess_cart_requirements\` (CAR-T manufacturing, cytokine release syndrome and ICANS monitoring and grading). Report outputs as returned.
5. Clinical design points to settle: starting dose and its units from nonclinical data; staggered dosing of the first participants; that administration is often single and irreversible, so randomization, washout and dose-ranging are limited; pre-existing immunity to the vector; delayed adverse events, including malignancy, in the follow-up; shedding studies. Long-term follow-up duration follows FDA's guidance on long-term follow-up after gene therapy, named by topic and confirmed with \`lookup_fda_guidance\`.
6. Manufacturing changes during development: \`assess_atmp_comparability\` designs the comparability exercise (ICH Q5E principles). A potency assay matched to the mechanism is needed before pivotal data rely on the product.
7. Approved precedents and their risk management: confirm any statement about REMS, boxed warnings or monitoring requirements for an approved product against its current labeling with \`search_drug_labels\`; engine statements about approved products may be out of date.

## Pitfalls reviewers raise
- No potency assay reflecting the mechanism of action by the time pivotal lots are made.
- Process changes between clinical stages without a comparability plan.
- A long-term follow-up plan missing or too short for the vector's integration risk.
- Dose expressed in units that differ between nonclinical and clinical documents.

## Before answering
- Classification, pathway, follow-up durations and testing panels are engine outputs, quoted as returned with their citations.
- Statements about approved products are confirmed against current labeling or marked unconfirmed.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Classification, designations and the adequacy of comparability are the agency's determinations.
- The platform composes small-molecule Module 3 for a US IND only; AnA can advise on cell and gene therapy CMC, but the platform does not compose that Module 3.
`,
  }),

  skill({
    key: 'clinical.pediatrics',
    name: 'Pediatric development',
    description:
      'Planning pediatric development for a drug or biologic: ICH E11(R1) age groups, US pediatric study plans and EU paediatric investigation plans, extrapolation under ICH E11A, age-appropriate formulations, pediatric dosing and the ethical safeguards for children.',
    disciplines: ['clinical', 'regulatory-strategy', 'clinical-pharmacology'],
    useCases: ['strategy', 'study-design', 'drafting', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['US_PSP', 'EU_PIP'],
    triggers: [
      'pediatric',
      'pediatrics',
      'paediatric',
      'pediatric study plan',
      'initial pediatric study plan',
      'ipsp',
      'pediatric investigation plan',
      'paediatric investigation plan',
      'pip',
      'prea',
      'bpca',
      'written request',
      'pediatric extrapolation',
      'ich e11',
      'e11a',
      'pediatric formulation',
      'age-appropriate formulation',
      'pediatric dose',
      'pediatric dosing',
      'neonates',
    ],
    tools: [
      'global_ri_pediatric_plan',
      'assess_pediatric_requirements',
      'design_pediatric_investigation',
      'classify_pediatric_age',
      'assess_pediatric_extrapolation',
      'select_pediatric_dose',
      'select_pediatric_formulation',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E11(R1)' },
      { kind: 'ich', id: 'E11A' },
      { kind: 'ich', id: 'S11' },
      DESIGNATIONS_RECORD,
    ],
    instructions: `
## When this applies
A drug or biologic program planning, writing or revising its pediatric development: the regulatory plan, the studies by age group, extrapolation from adults, formulation and dose.

## Method
1. Establish the indication and whether the condition occurs in children, the age range concerned, the adult data in hand, whether the product has orphan designation, and the markets. In the US, PREA requires pediatric assessment for certain applications unless waived or deferred, and BPCA offers exclusivity for studies FDA requests in a Written Request; in the EU, Regulation (EC) No 1901/2006 requires an agreed PIP, a waiver or a deferral (special designations record).
2. Plan posture and timing: \`global_ri_pediatric_plan\` returns, per market, whether a plan is required, its name, when it is due and the next steps. \`assess_pediatric_requirements\` returns obligations, incentives, ethical requirements and timelines. Report due timings as returned; never state one from memory.
3. Plan content: \`design_pediatric_investigation\` lays out the PSP or PIP: quality and formulation, nonclinical (juvenile toxicity per ICH S11 where needed), clinical studies by age group, and the waiver or deferral case.
4. Age groups: classify with \`classify_pediatric_age\` (ICH E11(R1) groups, with developmental pharmacology for each). The upper bound of adolescence differs by region.
5. Extrapolation: \`assess_pediatric_extrapolation\` judges similarity of disease and of exposure-response between adults and children and the studies that follow. ICH E11A is the harmonised framework; the engine may cite earlier regional frameworks, so state which basis applies.
6. Dose: \`select_pediatric_dose\` selects a scaling method (allometric, maturation-adjusted, physiologically based) for the age group and elimination route. Doses for pediatric studies come from the engine and the program's data, never from simple weight scaling assumed by AnA.
7. Formulation: \`select_pediatric_formulation\` ranks age-appropriate forms and checks excipients for the age groups.
8. Ethics: parental permission and child assent (21 CFR 50 Subpart D in the US), minimal-risk limits, blood-volume limits and IRB/IEC pediatric expertise. Consent wording follows the informed consent skill.
9. FDA's pediatric guidances (study plans, extrapolation, ethics) are named by topic and confirmed with \`lookup_fda_guidance\`.

## Pitfalls reviewers raise
- A pediatric plan submitted late against its market's timing.
- Extrapolation claimed without evidence that disease and exposure-response are similar.
- A formulation unsuitable for the youngest age group, or excipients of concern for it.
- Doses for neonates or infants scaled from adults without maturation.

## Before answering
- Age groups, timings, doses and waiver positions are engine outputs, quoted as returned.
- The market each obligation belongs to is named.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Waivers, deferrals and agreement of a PSP or PIP are FDA's and the EMA's (on the PDCO's opinion) decisions.
- Whether research with children is approvable is the IRB/IEC's determination.
`,
  }),

  skill({
    key: 'clinical.real-world-evidence',
    name: 'Real-world evidence',
    description:
      'Designing and judging studies that use real-world data for regulatory decisions: the regulatory question, target trial emulation, fitness of the data source, confounding and bias control, and whether the evidence is likely to be acceptable for its purpose.',
    disciplines: ['clinical', 'biostatistics'],
    useCases: ['study-design', 'strategy', 'analysis', 'review'],
    triggers: [
      'real-world evidence',
      'real world evidence',
      'rwe',
      'real-world data',
      'real world data',
      'rwd',
      'target trial emulation',
      'target trial',
      'propensity score',
      'propensity scores',
      'claims data',
      'electronic health records',
      'registry data',
      'observational study',
      'confounding by indication',
      'immortal time bias',
      'data source fitness',
      'pragmatic trial',
    ],
    tools: [
      'advise_rwe_design',
      'select_rwe_design',
      'design_target_trial',
      'score_rwe_data_source',
      'design_propensity_analysis',
      'assess_rwe_bias_risk',
      'assess_rwe_regulatory_acceptability',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E8(R1)' },
      { kind: 'ich', id: 'M14' },
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'currency-fact', id: 'ich-e6r3-annex2-step4' },
    ],
    instructions: `
## When this applies
A program proposing to use real-world data (claims, electronic health records, registries) or real-world evidence for a regulatory purpose: effectiveness for a new indication, safety, an external comparator, or support for another decision. External controls for a rare disease trial also follow the rare disease skill.

## Method
1. Establish the regulatory question and purpose first: what decision the evidence is meant to support, in which region, and what a randomized trial answering the same question would look like. Acceptability depends on the purpose.
2. Design: \`advise_rwe_design\` explains the options and guardrails; \`select_rwe_design\` recommends a design for the causal question and data features; \`design_target_trial\` writes the target trial emulation protocol (eligibility, treatment strategies, assignment, time zero, follow-up, outcome, causal contrast, analysis) and flags design-level biases.
3. Data source: \`score_rwe_data_source\` scores relevance and reliability for the question. Outcome and exposure definitions need validation in that source.
4. Confounding: \`design_propensity_analysis\` selects the estimation and application method and its diagnostics for the target estimand; \`assess_rwe_bias_risk\` inventories selection, information and confounding biases with mitigations and a sensitivity plan.
5. Pre-specification: protocol and analysis plan are final, and ideally registered, before outcome data are analysed; the analytic dataset's provenance is documented, and patient-level data can be made available to the agency.
6. Acceptability: \`assess_rwe_regulatory_acceptability\` grades the plan against evidence requirements for the stated purpose and authority. FDA's framework and guidances on real-world data and evidence are named by topic and confirmed with \`lookup_fda_guidance\`.
7. ICH context: E8(R1) treats real-world data as one design option chosen for the question; ICH E6(R3) Annex 2 covers real-world data within interventional trials; ICH M14 covers pharmacoepidemiological safety studies using real-world data. Confirm their status before citing.

## Pitfalls reviewers raise
- Immortal time from a time zero that does not match treatment start.
- Prevalent users compared with new users.
- Outcomes taken from codes with no validation in the source.
- Analyses run before the protocol was final, or many analyses with one reported.
- No active comparator where one was available.

## Before answering
- The regulatory question and purpose are stated before design advice.
- Scores, grades, E-values and diagnostics thresholds are engine outputs, quoted as returned.
- Residual confounding and the limits of the data are stated alongside any conclusion.

## Not AnA's to decide
- Whether the evidence is adequate for its purpose is the agency's judgement.
- Data access, licensing and privacy obligations are for the sponsor and the data holder.
`,
  }),

  skill({
    key: 'clinical.trial-transparency',
    name: 'Trial registration and results disclosure',
    description:
      'Registering a clinical trial and disclosing its results: ClinicalTrials.gov duties for an applicable clinical trial, WHO and ICMJE registration, EU transparency at method level, the Form FDA 3674 certification, redaction of personal data and confidential information for publication, and data-sharing commitments.',
    disciplines: ['clinical', 'regulatory-operations', 'medical-writing'],
    useCases: ['drafting', 'review', 'submission-assembly', 'gap-analysis'],
    triggers: [
      'trial registration',
      'clinical trial registration',
      'clinicaltrials.gov',
      'clinicaltrials.gov registration',
      'clinicaltrials.gov results',
      'results reporting',
      'results disclosure',
      'results posting',
      'fdaaa 801',
      '42 cfr part 11',
      'applicable clinical trial',
      'responsible party',
      'primary completion date',
      'who ictrp',
      'prospective registration',
      'trial transparency',
      'clinical trial transparency',
      'transparency rules',
      'commercially confidential information',
      'anonymisation report',
      'policy 0070',
      'clinical data publication',
      'data sharing statement',
      'individual participant data',
      'form fda 3674',
    ],
    tools: [
      'generate_ctgov_registration_draft',
      'review_who_ictrp_record',
      'search_clinical_evidence',
      'search_eu_ctis',
      'prepare_fda_form',
      'lookup_fda_guidance',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'currency-fact', id: 'eu-ctis-only-trials' },
      CONSENT_RECORD,
      FDA_FORMS_RECORD,
      {
        kind: 'record',
        id: 'server/services/global-ri/clinical-trial-disclosure.ts',
        label: 'Registration and results-disclosure obligations by market (US, EU, WHO and ICMJE)',
      },
    ],
    instructions: `
## When this applies
A trial must be registered, its results posted or its documents published, with redaction and data-sharing commitments. CTIS mechanics are the EU clinical trials skill's, the lay summary the plain-language skill's, publication practice the reporting-guidelines skill's, and the consent form's ClinicalTrials.gov statement the informed consent skill's.

## Method
1. Establish the trial from the program record: the product and its approval status, phase, whether it is interventional and controlled, the countries with sites, the sponsor and funders, the IND or IDE that covers it, and its own dates (first participant enrolled, primary completion, end of trial). Duties attach to these facts.
2. US: whether the trial is an applicable clinical trial under 42 USC 282(j) (FDAAA 801) and 42 CFR Part 11, and who the responsible party is (the sponsor, or a principal investigator it designates). The definition turns on product type, phase or device study type, US nexus and control; work through ClinicalTrials.gov's published definitions with the person and say the determination is theirs. Funder policies can reach trials the statute does not (NIH's policy for trials it funds, for example), so ask about funding.
3. Find what is already registered before drafting: \`search_clinical_evidence\` for the NCT record and \`search_eu_ctis\` for the EU trial number. One trial has one record per registry, and each record lists the others' identifiers as secondary identifiers.
4. Draft the record from the protocol: \`generate_ctgov_registration_draft\` returns the FDAAA 801 data elements with completeness findings, and \`review_who_ictrp_record\` the WHO Trial Registration Data Set, item by item. Report missing items as returned; sponsor, dates, ethics review and the sharing statement are supplied at registration, never invented. ICMJE journals publish a trial only if it was registered by the time the first participant enrolled, whatever the statute requires.
5. Deadlines: no AnA tool computes a trial's registration or results due dates, so never state one. The responsible party applies the registry's current rules to the trial's own dates, including any certification to delay results; say which dates the deadline runs from and ask for them.
6. Results (participant flow, baseline characteristics, outcome measures, adverse events) come from the final analysis and agree with the CSR and any publication; a figure that differs is resolved before posting.
7. Form FDA 3674 certifies compliance with the ClinicalTrials.gov requirements and accompanies certain applications and submissions; confirm which with \`lookup_fda_guidance\`. \`prepare_fda_form\` (form FDA_3674) drafts it from the NCT number and the certification basis the person states; AnA never chooses the basis or signs.
8. EU: under Regulation (EU) No 536/2014 trial information becomes public through CTIS, and a summary of results and a lay summary follow the end of the trial. Run \`check_regulatory_currency\` on CTIS and report the fact; take what is published, when, and what may be deferred from EMA's current transparency rules.
9. Redaction, for CTIS and for agency publication of clinical data (EMA's Policy 0070, Health Canada's public release of clinical information):
   - personal data of participants and staff are anonymised by a documented method with an assessment of re-identification risk;
   - commercially confidential information is proposed narrowly, each redaction justified; results, safety data and design are generally public;
   - the agency decides on the proposal.
10. Data sharing: the plan to share individual participant data, in the registry and the manuscript's data sharing statement, matches what the consent form allows for future use and the sponsor's policy, and is tracked as a commitment.

## Pitfalls reviewers raise
- Registration after enrolment began, or a primary outcome changed in the registry without explanation.
- Results not posted, or posted figures that disagree with the CSR or the publication.
- Results or safety data redacted as commercially confidential.
- A data-sharing promise the consent form does not permit.

## Before answering
- Applicable-trial status, the responsible party and every due date are the responsible party's; no date appears that the person or the registry did not supply.
- Registry gaps are reported as the tools returned them.

## Not AnA's to decide
- What is registered, redacted and posted, and when, is the responsible party's; agencies decide on redaction proposals.
- AnA does not register a trial, post results or sign a certification.
`,
  }),

  skill({
    key: 'clinical.data-monitoring-committees',
    name: 'Data monitoring committees',
    description:
      'Independent data monitoring committees (DMC, DSMB, IDMC): when a trial needs one, the charter, membership and independence, open and closed sessions, firewalls around comparative interim data, stopping guidelines and handling recommendations. Boundaries come from the statistical engines and the adaptive and interim analyses skill.',
    disciplines: ['clinical', 'biostatistics', 'safety'],
    useCases: ['study-design', 'drafting', 'review'],
    triggers: [
      'independent data monitoring committee',
      'monitoring committee',
      'dmc charter',
      'dsmb charter',
      'idmc charter',
      'data monitoring committee charter',
      'data safety monitoring board',
      'data and safety monitoring board',
      'dmc membership',
      'dmc members',
      'dmc meeting',
      'dmc recommendation',
      'closed session',
      'open session',
      'closed report',
      'open report',
      'independent statistician',
      'independent statistical group',
      'unblinded statistician',
      'reporting statistician',
      'unblinded interim data',
      'interim data firewall',
      'stopping guidelines',
    ],
    tools: ['lookup_fda_guidance', 'lookup_ich_guideline', 'generate_statistical_document', 'review_interim_operating_characteristics'],
    references: [
      { kind: 'ich', id: 'E9(R1)' },
      { kind: 'ich', id: 'E20' },
      { kind: 'ich', id: 'E6(R3)' },
      E6R3_RECORD,
    ],
    instructions: `
## When this applies
Deciding whether a trial needs an independent data monitoring committee (DMC, also DSMB or IDMC), writing its charter, choosing members, running its sessions, protecting comparative interim data and acting on its recommendations. The statistics of interim analyses (boundaries, alpha spending, operating characteristics, simulations) are the adaptive and interim analyses skill's.

## Method
1. Establish the trial from the protocol and SAP: the population and its vulnerability, the endpoints, size and duration, planned interim analyses, blinding, the product's known safety concerns and the regions.
2. Decide whether a DMC is needed and record why. It is most clearly warranted for large randomised trials with mortality or major morbidity endpoints, planned interim efficacy analyses, high-risk interventions, vulnerable populations, or long trials where early data could change what participants are told. US research under the exception from informed consent in emergency settings requires one (21 CFR 50.24). A short, low-risk trial of symptomatic endpoints often needs none. FDA's guidance on data monitoring committees and EMA's guideline on them set expectations: name them by topic and confirm FDA's current version with \`lookup_fda_guidance\`. ICH E9 describes the committee's role; confirm its wording with \`lookup_ich_guideline\` before quoting.
3. Keep the DMC distinct from a dose-escalation safety review committee, an endpoint adjudication committee and a steering committee: their members, data and authority differ. Say which the question concerns.
4. Membership and independence: clinicians expert in the disease and intervention, at least one statistician experienced in interim monitoring, and others the trial calls for (an ethicist, a patient representative). Members have no financial or intellectual stake in the outcome, take no part in conduct, and declare interests at appointment and throughout.
5. The charter: scope (safety only, or safety and efficacy), membership and conflicts, meetings, quorum and how recommendations are reached, open and closed report content and who prepares it, data access controls, to whom recommendations go, records, and the stopping guidelines by reference to the protocol and SAP. \`generate_statistical_document\` drafts a charter (document type dsmb_charter) or an interim analysis plan (interim_analysis_plan) from the design parameters; the draft is the sponsor's to complete and approve.
6. Sessions: in the open session the sponsor and steering committee may hear pooled data and conduct issues (enrolment, data quality, adherence). In the closed session only members and the reporting statistician see results by arm. Closed minutes stay with the committee until the trial is unblinded.
7. Firewalls: comparative reports are prepared by a statistician or group independent of the trial team, with documented access controls. Sponsor staff who see comparative interim data take no further part in the trial's conduct or analysis. A breach is documented with its effect on the trial's integrity.
8. Stopping guidelines: efficacy and futility boundaries come from the statistical engine, never from AnA. On a protocol with a bound design, \`review_interim_operating_characteristics\` reports the recorded boundaries and their operating characteristics; quote them as returned. Boundaries guide the committee's judgment; safety monitoring often has none, and the committee weighs the totality of the data.
9. Recommendations: continue, modify (eligibility, monitoring, dose) or stop for benefit, harm or futility. The DMC recommends; the sponsor decides and documents its decision. A modification follows the protocol amendments skill, and new safety information the safety-reporting methods.

## Pitfalls reviewers raise
- Members tied to the sponsor or investigators, or no statistician.
- Sponsor trial staff with access to comparative interim data.
- A charter silent on who receives a recommendation and how it is acted on.
- Stopping guidance in the charter that differs from the protocol and SAP.

## Before answering
- The need for a DMC is reasoned from the trial's features; guidance is named by topic and marked confirmed or unconfirmed.
- No boundary, information fraction or error rate appears unless an engine returned it.

## Not AnA's to decide
- Establishing a DMC, its members and charter are the sponsor's decisions; the recommendations are the committee's, and acting on them the sponsor's.
- AnA never interprets unblinded comparative interim data for a sponsor.
`,
  }),

  skill({
    key: 'clinical.trial-feasibility-and-sites',
    name: 'Trial feasibility, country and site selection',
    description:
      'Choosing countries and sites for a clinical trial and qualifying its investigators: feasibility evidence and enrollment forecasts, regional data needs, competing trials, investigator qualification and screening, and the documents investigators sign before a site is activated (Form FDA 1572, financial disclosure, device investigator agreements).',
    disciplines: ['clinical'],
    useCases: ['strategy', 'study-design', 'review'],
    triggers: [
      'trial feasibility',
      'feasibility assessment',
      'site feasibility',
      'feasibility questionnaire',
      'site selection',
      'country selection',
      'country and site selection',
      'investigator selection',
      'investigator qualification',
      'site qualification',
      'site qualification visit',
      'pre-study visit',
      'site initiation visit',
      'site activation',
      'study start-up',
      'statement of investigator',
      'financial disclosure',
      'part 54',
      'form fda 3454',
      'form fda 3455',
      'investigator agreement',
      'clinical trial agreement',
      'recruitment rate',
      'enrollment rate',
      'debarment',
      'disqualified investigator',
      '312.120',
    ],
    tools: [
      'get_regulatory_timeline',
      'assess_trial_feasibility',
      'search_clinical_evidence',
      'search_eu_ctis',
      'forecast_enrollment',
      'review_enrollment_forecast',
      'screen_restricted_party',
      'prepare_fda_form',
      'lookup_fda_guidance',
      'create_irb_submission',
      'add_irb_site',
    ],
    references: [
      { kind: 'ich', id: 'E6(R3)' },
      { kind: 'ich', id: 'E5(R1)' },
      { kind: 'ich', id: 'E17' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
      E6R3_RECORD,
      FDA_FORMS_RECORD,
    ],
    instructions: `
## When this applies
Planning where a trial runs and with whom: countries, sites, feasibility, enrollment forecasts, qualifying investigators and collecting what they sign before a site is activated. Conduct after activation (monitoring, essential records, delegation, deviations) is the GCP operations skill's; consent is the informed consent skill's.

## Method
1. Establish what the protocol demands of a site: the population and the eligibility criteria that most limit it, procedures, equipment and specialist staff, investigational product storage and handling, target enrollment and timelines, and the regulators who will review the data.
2. Countries: choose for the population and for what each regulator needs, not only for speed. Consider ethnic factors that could change the product's effect (ICH E5) and how one trial supports several regions (ICH E17); whether local standard of care fits the comparator; how foreign data are accepted (for FDA, a foreign study not under an IND is judged under 21 CFR 312.120); and import of the product. \`get_regulatory_timeline\` (pathway eu_cta) returns EU review-clock goals as planning anchors; the EU application follows the EU clinical trials skill.
3. Feasibility from evidence: \`assess_trial_feasibility\` returns completion and discontinuation rates of comparable trials, realised enrollment of completed comparators and active competing trials, or says evidence is insufficient. \`search_clinical_evidence\` and \`search_eu_ctis\` list competing trials, cited by identifier. Report counts as returned.
4. Site feasibility: a questionnaire and, where needed, a qualification visit establish patients meeting the key criteria (from site records, not impressions), competing studies, staff, facilities, ethics timelines and past performance.
5. Enrollment: \`forecast_enrollment\` gives time to target from per-site rates and activation times the sponsor supplies; on a protocol with a bound design, \`review_enrollment_forecast\` reads the site accrual plan by country. Never supply or assume a site rate.
6. Investigator qualification (ICH E6(R3) Annex 1 §2.1 and §2.2; sponsor's investigator selection §3.7): a current CV and licence, GCP and protocol training, adequate time, staff and facilities, and access to the population. Under a US IND the sponsor obtains what 21 CFR 312.53 lists; for a device study, 21 CFR 812.43.
7. Screening: \`screen_restricted_party\` checks a name against the SAM.gov exclusions list only, and needs the organization's connector. FDA's debarment list and its records of disqualified or restricted clinical investigators are checked separately; an empty SAM.gov result covers that list alone.
8. What the investigator signs or supplies:
   - US IND: Form FDA 1572, the Statement of Investigator. \`prepare_fda_form\` (form FDA_1572) drafts it from the investigator, facility, laboratory, IRB and sub-investigator details the person gives. How a non-US site handles the 1572 is confirmed with FDA's guidance on the form via \`lookup_fda_guidance\`.
   - Financial disclosure: collected from each investigator before participation; in the marketing application the sponsor certifies on Form FDA 3454 or discloses on Form FDA 3455 (21 CFR Part 54), which \`prepare_fda_form\` also drafts.
   - Device IDE: a signed investigator agreement (21 CFR 812.43) instead of a 1572.
   - Everywhere: the clinical trial agreement and budget (Annex 1 §3.6 and §3.5) and the protocol signature page; in the EU, investigator and site suitability documents go in the Part II dossier.
9. Ethics review: open the IRB submission with \`create_irb_submission\` and, for a single-IRB multi-site study, add each site with \`add_irb_site\`. Whether single-IRB review is required depends on funding and regulation; confirm it.
10. A site is activated only when approvals, signed documents, training and supplies are in place (records: GCP operations skill).

## Pitfalls reviewers raise
- A standard of care that does not match the comparator, or a population unlike the intended users.
- Forecasts built on unverified site estimates.
- A 1572 that omits a sub-investigator, laboratory or IRB actually used.
- Financial disclosure gathered at the application rather than before participation.

## Before answering
- Feasibility figures and forecasts are engine outputs with their inputs stated.
- Each signed document is named with the regulation requiring it and its market.

## Not AnA's to decide
- Country, site and investigator selection are the sponsor's; ethics committees and regulators approve.
- AnA does not sign or certify a form, and never fills a financial interest or qualification the person did not state.
`,
  }),
];
