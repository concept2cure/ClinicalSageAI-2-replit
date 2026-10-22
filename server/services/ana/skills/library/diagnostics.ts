/**
 * Diagnostics performance skills: the IVD evidence model (scientific validity,
 * analytical performance, clinical performance), companion diagnostics,
 * biomarkers, the EU IVDR, and US CLIA and laboratory-developed tests.
 *
 * Regulatory and scientific statements are grounded in the platform's IVD
 * knowledge base (server/services/ivd-knowledge/) through its two AnA tools;
 * every performance figure comes from the deterministic IVD and statistics
 * engines named at each step.
 *
 * @module server/services/ana/skills/library/diagnostics
 */

import { skill, type LibrarySkillSource } from '../types.js';

const IVD_KB = 'server/services/ivd-knowledge';

export const DIAGNOSTICS_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'diagnostics',
    name: 'Diagnostics performance',
    description:
      "The evidence model for an in vitro diagnostic: scientific validity of the analyte and condition, analytical performance and clinical performance, all tied to an intended use and grounded in the platform's IVD knowledge base. Sub-skills carry each pillar, companion diagnostics, biomarkers, the EU IVDR, and CLIA and LDTs.",
    disciplines: ['diagnostics', 'device-engineering'],
    useCases: ['strategy', 'gap-analysis', 'review'],
    segments: ['ivd'],
    triggers: [
      'ivd',
      'in vitro diagnostic',
      'in-vitro diagnostic',
      'diagnostic test',
      'diagnostic assay',
      'ivd assay',
      'ivd submission',
      'ivd pathway',
      'ivd evidence',
      'scientific validity',
      'clinical validity',
      'diagnostic performance',
      'test performance',
      'analyte',
      'ivd knowledge base',
      'molecular diagnostic',
      'ngs panel',
      'point-of-care test',
      'self-test',
      'near-patient test',
    ],
    tools: [
      'search_ivd_knowledge',
      'ivd_knowledge_lookup',
      'classify_device',
      'select_device_pathway',
      'assess_scientific_validity',
      'check_regulatory_currency',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'standard', id: 'clsi_ep_suite' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'standard', id: 'cfr_493_clia' },
      { kind: 'record', id: `${IVD_KB}/index.ts`, label: 'IVD knowledge base: the corpus the IVD knowledge tools search' },
      { kind: 'record', id: 'shared/regulatory/device-class.ts', label: 'Device and IVD class vocabularies' },
    ],
    instructions: `
## When this applies
Any question about an in vitro diagnostic's evidence or route: what the test must show, in which order, and which knowledge-base entry or engine answers each part.

## Method
1. Fix the intended use first, in full: what is measured or detected, the specimen type, the condition or physiological state, the role of the result (screening, diagnosis, aid to diagnosis, monitoring, patient selection), the intended population, the user (laboratory professional or lay person) and the setting. Every performance claim is judged against it.
2. Ground regulatory and scientific statements in the platform's IVD knowledge base: \`search_ivd_knowledge\` for entries with their citations, or \`ivd_knowledge_lookup\` when you need an entry's key points and pitfalls. Cite the entry and its source; when nothing is returned, say so instead of answering from memory.
3. Establish the class and route with the engines: \`classify_device\` (framework \`ivdr\` for the EU, \`fda\` for the US pathway) and \`select_device_pathway\` with \`isIVD\` set. When the deciding facts are missing, the result is undetermined; ask for them.
4. Build the evidence in three parts, each with its own sub-skill:
   - Scientific validity: the association between the analyte and the condition. \`assess_scientific_validity\` grades the supporting evidence and lists gaps; report its verdict as returned. Scientific validity is shown, not assumed, even for a well-known analyte.
   - Analytical performance: whether the test detects or measures the analyte correctly (analytical-performance skill).
   - Clinical performance: whether results correspond to the condition in the intended population (clinical-performance skill). Clinical performance means little until analytical performance is established.
5. Companion diagnostics, biomarker programs, the EU IVDR, and US CLIA and laboratory-developed tests each have a sub-skill. Check status-sensitive rules with \`check_regulatory_currency\` before relying on them (for example the vacated US LDT rule, or EUDAMED dates).
6. For a class II IVD, the special controls in the classification regulation or De Novo order often set the evidentiary bar; find them through the knowledge base. Name any FDA guidance on a test type by topic and check it with \`lookup_fda_guidance\`, saying when it cannot be confirmed.

## Before answering
- Every number (precision, detection limits, sensitivity, specificity, sample size, cutoff) came from an engine or the person's data.
- Every regulatory statement names its knowledge-base entry, or says it is unconfirmed.
- The answer says which market it addresses.

## Not AnA's to decide
- Classification, clearance, approval and certification are FDA's and the notified body's.
- The claims in the intended use are the manufacturer's to make and support; AnA does not widen them.
`,
  }),

  skill({
    key: 'diagnostics.analytical-performance',
    name: 'IVD analytical performance',
    description:
      'Planning, computing and reviewing the analytical performance of an IVD: precision (CLSI EP05), linearity and measuring interval (EP06), interference (EP07), method comparison (EP09), detection capability (EP17), stability (EP25), carryover, hook effect, cutoff and metrological traceability (ISO 17511), with every result computed by the engines.',
    disciplines: ['diagnostics'],
    useCases: ['study-design', 'analysis', 'review'],
    segments: ['ivd'],
    documentTypes: ['US_IVD_ANALYTICAL_VALIDATION'],
    triggers: [
      'analytical performance',
      'ivd analytical validation',
      'ep05',
      'ep06',
      'ep07',
      'ep09',
      'ep17',
      'ep25',
      'clsi ep',
      'imprecision',
      'limit of blank',
      'limit of detection',
      'limit of quantitation',
      'lob',
      'measuring interval',
      'reportable range',
      'interference study',
      'cross-reactivity',
      'method comparison',
      'iso 17511',
      'metrological traceability',
      'hook effect',
      'carryover',
      'assay cutoff',
      'reagent stability',
    ],
    tools: [
      'compute_analytical_performance',
      'assess_ivd_analytical_extensions',
      'determine_assay_cutoff',
      'assess_iso17511_traceability',
      'search_ivd_knowledge',
    ],
    references: [
      { kind: 'standard', id: 'clsi_ep_suite' },
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'record', id: `${IVD_KB}/scientific/analytical-performance.ts`, label: 'IVD knowledge base: analytical performance entries (EP05, EP06, EP07, EP09, EP17, EP25, EP28, ISO 17511)' },
    ],
    instructions: `
## When this applies
Designing an analytical study, computing its results, or reviewing an analytical performance report for an IVD or a laboratory test being validated: precision, detection capability, linearity and measuring interval, interference and cross-reactivity, method comparison, carryover and hook effect, stability, cutoff and traceability.

## Method
1. Establish from the intended use the measurand, the specimen types and the claims each study must support (measuring interval, medical decision levels, cutoff, specimen stability, shelf life). Each study supports a named claim.
2. Establish the acceptance criteria the sponsor pre-specified for each study and their basis (clinical requirement, biological variation, state of the art). Pass them to the engines. A tool default (a recovery band, a carryover limit) is never presented as the requirement, and the answer says which criterion was used.
3. Compute with the engines, never by hand:
   - Precision (EP05): \`compute_analytical_performance\` mode \`imprecision\`, from a balanced runs-by-replicates design.
   - Detection capability (EP17): mode \`detection_capability\`, for LoB, LoD and LoQ from blank and low-level replicates.
   - Method comparison (EP09): mode \`method_comparison\`, for bias and regression against the comparator, at medical decision levels when given.
   - Linearity and interference: \`assess_ivd_analytical_extensions\` mode \`recovery\` computes spike-recovery or dilution-linearity recovery against a band. No engine fits an EP06 polynomial linearity evaluation or an EP07 paired-difference interference screen; when the data call for those, say so and present the study's own analysis as the sponsor's, without estimating.
   - Carryover and high-dose hook effect: modes \`carryover\` and \`hook_effect\`.
   - Stability (EP25): modes \`real_time_stability\` and \`accelerated_stability\`. An accelerated result is a projection; say which real-time data support the claim.
   - Cutoff: \`determine_assay_cutoff\` from labelled observations. A cutoff chosen and evaluated on the same data is optimistic; its performance is confirmed on an independent set.
   - Traceability: \`assess_iso17511_traceability\` for the calibration hierarchy, commutability and uncertainty.
   Report every value, interval and verdict verbatim, with the inputs and mode used.
4. Check the design before trusting a result: the number of runs, days, operators, instruments and reagent lots; specimen matrix and concentrations around decision levels; for interference, which substances at which concentrations and why. \`search_ivd_knowledge\` returns the platform's entries on each study type; cite them for design expectations rather than reciting protocol parameters from memory.
5. Tie each result to its claim: the measuring interval rests on linearity and the LoQ, each specimen type on matrix comparison, the shelf life on stability data.

## Pitfalls reviewers raise
- Precision studies with too few runs, days or lots to reflect routine variation.
- Interference tested at concentrations that do not reflect the intended population.
- Method-comparison specimens clustered away from medical decision levels.
- A cutoff set and validated on the same specimens.
- Traceability claimed without commutability of the calibrator.

## Before answering
- No figure in the answer was computed by AnA; each came from a named engine and mode.
- Acceptance criteria are the sponsor's, stated with their source.
- Studies the engines cannot compute are named as such.

## Not AnA's to decide
- Whether performance is acceptable for the intended use is the manufacturer's judgment, then the agency's or notified body's.
- AnA does not alter, exclude or re-run data; outliers are handled by the sponsor's pre-specified rule.
`,
  }),

  skill({
    key: 'diagnostics.clinical-performance',
    name: 'IVD clinical performance studies',
    description:
      'Designing, sizing and analysing IVD clinical performance studies: intended-use population and specimens, the reference standard or comparator, sensitivity and specificity versus positive and negative percent agreement, predictive values, bias control and reporting.',
    disciplines: ['diagnostics', 'biostatistics'],
    useCases: ['study-design', 'analysis', 'review'],
    segments: ['ivd'],
    triggers: [
      'clinical performance',
      'clinical performance study',
      'ivd clinical study',
      'clinical agreement study',
      'sensitivity and specificity',
      'positive percent agreement',
      'negative percent agreement',
      'ppa',
      'npa',
      'clinical reference standard',
      'composite reference standard',
      'comparator method',
      'intended use population',
      'spectrum bias',
      'verification bias',
      'discrepant analysis',
      'discordant results',
      'iso 20916',
      'diagnostic study sample size',
      'archived specimens',
      'banked specimens',
      'leftover specimens',
      'prospective specimen collection',
    ],
    tools: [
      'design_device_clinical_evidence',
      'size_diagnostic_study',
      'compute_diagnostic_accuracy',
      'search_ivd_knowledge',
    ],
    references: [
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'record', id: `${IVD_KB}/scientific/clinical-performance.ts`, label: 'IVD knowledge base: clinical performance, agreement, ROC and study-design entries' },
    ],
    instructions: `
## When this applies
Planning or reviewing a study that shows an IVD's results correspond to the clinical condition in its intended-use population, or computing and interpreting its accuracy figures.

## Method
1. Establish from the intended use the population the test will meet in practice, the specimen types, the setting and the role of the result. The study population mirrors it; a population enriched with clear-cut cases inflates accuracy (spectrum bias).
2. Establish what the test is compared with. Against a clinical reference standard (the best available method for establishing the condition), report clinical sensitivity and specificity. Against a non-reference comparator method, report positive and negative percent agreement, not sensitivity and specificity, and say that agreement is not accuracy. A composite reference standard is pre-specified, with its rule for discordant or missing components.
3. Decide whether clinical data are needed and of what kind with \`design_device_clinical_evidence\` (\`isIVD\` set), then design: prospective collection, archived or leftover specimens, each with its bias risks and the case for representativeness; blinding of test readers to the reference result and of reference assessors to the test result; how invalid and indeterminate results are counted; and reference testing of every subject, since partial verification biases the estimates.
4. Size the study with \`size_diagnostic_study\`: mode \`single_proportion\` for one metric against a performance goal, \`co_primary\` for sensitivity and specificity together given prevalence. Goals, expected performance and prevalence are the sponsor's inputs with their sources; report n and power as returned.
5. Analyse with \`compute_diagnostic_accuracy\` from the 2×2 table: sensitivity and specificity or PPA and NPA with exact confidence intervals, predictive values, likelihood ratios and kappa. Predictive values depend on prevalence; report them at the stated prevalence of the intended use, not only the study's.
6. Report the flow of subjects (enrolled, excluded, invalid, analysed) as the STARD checklist expects, and results by specimen type, site and relevant subgroup.
7. For the EU, clinical performance studies follow the IVDR's performance-study requirements and ISO 20916; ground the specifics with \`search_ivd_knowledge\` and the eu-ivdr skill.

## Pitfalls reviewers raise
- PPA and NPA presented as sensitivity and specificity.
- Specimens selected in a way that excludes difficult cases.
- Discordant results re-tested only when the new test disagreed with the comparator (discrepant analysis).
- Invalid or indeterminate results dropped from the denominator without a pre-specified rule.

## Before answering
- Every accuracy figure and sample size came from the engines, with their inputs.
- The answer says which comparator was used and why the metric names follow from it.

## Not AnA's to decide
- Performance goals are the sponsor's to set; whether observed performance supports the claim is the regulator's to judge.
- AnA does not resolve discordant results or reclassify subjects.
`,
  }),

  skill({
    key: 'diagnostics.companion-diagnostics',
    name: 'Companion and complementary diagnostics',
    description:
      'Co-developing a diagnostic with a drug or biologic: whether the test is a companion or complementary diagnostic, aligning the two programs toward contemporaneous approval, bridging from the clinical trial assay to the final test, and the EU route under the IVDR.',
    disciplines: ['diagnostics', 'regulatory-strategy'],
    useCases: ['strategy', 'study-design', 'agency-interaction'],
    segments: ['ivd', 'pharma', 'biotech'],
    triggers: [
      'companion diagnostic',
      'companion diagnostics',
      'cdx',
      'complementary diagnostic',
      'cdx co-development',
      'drug-diagnostic co-development',
      'codevelopment',
      'contemporaneous approval',
      'clinical trial assay',
      'cdx bridging study',
      'cross-labeling',
      'patient selection assay',
      'biomarker-defined population',
      'biomarker-positive patients',
      'enrichment strategy',
      'enrichment design',
      'follow-on companion diagnostic',
      'investigational ivd',
      'cdx pma',
    ],
    tools: [
      'classify_biomarker',
      'design_cdx_codevelopment',
      'plan_enrichment_strategy',
      'lookup_fda_guidance',
      'search_ivd_knowledge',
      'compute_diagnostic_accuracy',
      'global_ri_companion_diagnostic',
    ],
    references: [
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'record', id: `${IVD_KB}/regulatory/fda-ivd.ts`, label: 'IVD knowledge base: FDA IVD pathways, including companion and complementary diagnostics' },
      { kind: 'record', id: `${IVD_KB}/regulatory/eu-ivdr.ts`, label: 'IVD knowledge base: EU IVDR, including companion diagnostics and the medicines-authority consultation' },
    ],
    instructions: `
## When this applies
A drug or biologic program whose use depends on, or is informed by, a diagnostic test, and the diagnostic program that goes with it: the test's role, alignment of the two programs, the clinical trial assay, bridging, and the US and EU routes.

## Method
1. Establish the biomarker's role from the drug program's own data: \`classify_biomarker\` places it in a BEST category (predictive, prognostic and so on). A companion diagnostic provides information essential for the safe and effective use of the therapeutic (for example selecting patients likely to benefit, identifying patients at increased risk of serious adverse reactions, or monitoring response to adjust treatment); a complementary diagnostic informs benefit-risk without being a condition of use. \`design_cdx_codevelopment\` makes that determination from stated facts; report it with the facts used.
2. Plan the trial around the marker with \`plan_enrichment_strategy\`: whether marker-negative patients are enrolled, stratified or excluded, and what that means for the claim. A biomarker-positive-only trial leaves the effect in marker-negative patients uncharacterized, and the drug label and the test's claim follow from that.
3. Align the programs early. The assay used to select or assign trial patients should be analytically validated before it is used for enrollment. Establish whether the investigational assay needs a study risk determination and an IDE, or whether its information can be included in the drug's IND. FDA's guidances on companion diagnostics, on drug-diagnostic co-development and on investigational IVDs in therapeutic trials set the approach; name them by topic, check them with \`lookup_fda_guidance\`, and ground the specifics with \`search_ivd_knowledge\`.
4. Bridging: when the trial used a clinical trial assay that differs from the final test, a bridging study on trial specimens shows concordance so the clinical result carries over. Compute agreement with \`compute_diagnostic_accuracy\` (PPA and NPA against the clinical trial assay) and report how specimens with missing or invalid results were handled, since they can bias the efficacy estimate in the test-defined population.
5. US route: \`design_cdx_codevelopment\` returns the device pathway, the parallel milestones toward contemporaneous approval, and cross-labeling between the drug and the test. Report the pathway as the engine returned it; a follow-on test for an already approved drug can sometimes take a different route from the first.
6. EU route: \`global_ri_companion_diagnostic\` (region \`EU\`) returns the IVDR classification of a companion diagnostic and the notified body's consultation with the medicines authority or EMA. Align the test's intended purpose with the medicinal product's authorized indication.

## Pitfalls reviewers raise
- The trial assay changed during the trial with no plan to bridge it.
- Specimens not banked from screened patients, so bridging or retrospective analysis cannot be done.
- The marker cutoff chosen after seeing outcome data.
- Marker-negative patients excluded with no rationale for the restricted claim.

## Before answering
- The companion-versus-complementary determination, the pathway and the EU route come from the engines with the facts used.
- Agreement figures come from \`compute_diagnostic_accuracy\`; nothing is estimated.

## Not AnA's to decide
- Whether a test is a companion diagnostic, and its pathway, are FDA's decisions; the medicines authority's or EMA's opinion and the notified body's certificate are theirs.
- Labeling and indications are agreed between the sponsors and the agencies; AnA drafts.
`,
  }),

  skill({
    key: 'diagnostics.biomarkers',
    name: 'Biomarker classification and qualification',
    description:
      "Biomarkers in drug and diagnostic development: BEST category and context of use, fit-for-purpose analytical validation, clinical validation versus clinical utility, and qualification through FDA's Drug Development Tool program or within a single drug program.",
    disciplines: ['diagnostics', 'clinical'],
    useCases: ['strategy', 'study-design', 'analysis'],
    segments: ['ivd', 'pharma', 'biotech'],
    triggers: [
      'biomarker',
      'biomarkers',
      'best resource',
      'biomarker category',
      'predictive biomarker',
      'prognostic biomarker',
      'pharmacodynamic biomarker',
      'safety biomarker',
      'monitoring biomarker',
      'diagnostic biomarker',
      'susceptibility biomarker',
      'context of use',
      'biomarker qualification',
      'drug development tool',
      'ddt qualification',
      'qualification plan',
      'biomarker validation',
      'biomarker assay',
      'fit-for-purpose validation',
      'clinical utility',
      'ich e16',
    ],
    tools: [
      'classify_biomarker',
      'assess_biomarker_analytical_validation',
      'assess_biomarker_clinical_validation',
      'plan_biomarker_qualification',
      'lookup_ich_guideline',
      'search_ivd_knowledge',
    ],
    references: [
      { kind: 'ich', id: 'E16' },
      { kind: 'standard', id: 'clsi_ep_suite' },
      { kind: 'record', id: `${IVD_KB}/scientific/biomarker-validity.ts`, label: 'IVD knowledge base: biomarker validity entries for named markers' },
    ],
    instructions: `
## When this applies
A biomarker used in a drug or diagnostic program: what kind of biomarker it is, what its context of use requires, whether its assay and its clinical association are validated for that use, and whether to seek qualification.

## Method
1. State the context of use first: the biomarker, what it is used for, in which population and at which point in development, and the decision it informs. Everything else scales with it.
2. Classify it with \`classify_biomarker\` into a BEST category (diagnostic, monitoring, pharmacodynamic/response, predictive, prognostic, safety, susceptibility/risk) and read the evidentiary implications it returns. Predictive and prognostic are often confused: a predictive claim needs evidence that the treatment effect differs by marker status, which a single-arm study cannot give.
3. Analytical validation, fit for the context of use: \`assess_biomarker_analytical_validation\` checks accuracy or concordance, precision, analytical sensitivity, analytical specificity, reportable range, robustness and pre-analytical control against the evidence supplied, and returns readiness and gaps. Higher-stakes uses such as patient selection carry stricter expectations; for a test that will select patients, the companion-diagnostics skill applies too.
4. Clinical validation: \`assess_biomarker_clinical_validation\` computes sensitivity, specificity and predictive values from the person's 2×2 table, re-projects predictive values to an intended-use prevalence when one is given, and checks for a pre-specified cutoff and an independent validation set. Keep clinical validity (the marker tracks the condition or outcome) apart from clinical utility (using it improves decisions or outcomes).
5. Qualification: \`plan_biomarker_qualification\` sets out the choice between qualification through FDA's Drug Development Tool program, which makes the biomarker usable across programs for the qualified context of use, and acceptance within a single drug program, with the stages and evidence scaled to the context of use. ICH E16 sets the context, structure and format of qualification submissions for genomic biomarkers; confirm its content with \`lookup_ich_guideline\` before citing it. EMA's qualification of novel methodologies is the EU counterpart; name it and confirm the details before relying on them.
6. Ground marker-specific knowledge (a named oncology or cardiac marker, for example) with \`search_ivd_knowledge\` and cite the entry.

## Before answering
- Category, validation readiness, metrics and qualification stages come from the tools, with their inputs.
- Clinical validity and clinical utility are not conflated.
- A predictive claim rests on a comparison of treatment effect across marker status, or the answer says the evidence is not there.

## Not AnA's to decide
- Qualification is FDA's or EMA's decision; acceptance within a drug program is the review division's.
- The context of use and the cutoff are the sponsor's choices, justified by its data.
`,
  }),

  skill({
    key: 'diagnostics.eu-ivdr',
    name: 'EU IVDR classification and performance evaluation',
    description:
      'Placing an IVD on the EU market under Regulation (EU) 2017/746: Annex VIII classification, the performance evaluation (scientific validity, analytical and clinical performance) and its report, technical documentation, the general safety and performance requirements, the notified body and post-market performance follow-up.',
    disciplines: ['diagnostics', 'regulatory-strategy'],
    useCases: ['strategy', 'drafting', 'gap-analysis', 'submission-assembly'],
    segments: ['ivd'],
    regions: ['EU'],
    documentTypes: ['EU_PER'],
    triggers: [
      'ivdr',
      'eu ivdr',
      '2017/746',
      'performance evaluation',
      'performance evaluation report',
      'performance evaluation plan',
      'scientific validity report',
      'analytical performance report',
      'clinical performance report',
      'ivdr annex xiii',
      'ivdr annex viii',
      'ivdr class',
      'ivdr classification',
      'ivdr notified body',
      'pmpf',
      'post-market performance follow-up',
      'summary of safety and performance',
      'ivdr technical documentation',
      'ivdr gspr',
      'ivdr performance study',
      'legacy ivd',
      'ivdr transition',
      'in-house devices',
      'health institution exemption',
      'common specifications',
    ],
    tools: [
      'classify_device',
      'search_ivd_knowledge',
      'assess_device_evidence_structure',
      'get_device_reviewer_checklist',
      'assess_essential_principles',
      'advise_eu_technical_file_readiness',
      'build_device_blueprint',
      'check_regulatory_currency',
      'generate_declaration_of_conformity',
    ],
    references: [
      { kind: 'standard', id: 'eu_ivdr' },
      { kind: 'standard', id: 'iso_13485' },
      { kind: 'standard', id: 'iso_14971' },
      { kind: 'currency-fact', id: 'eu-eudamed-mandatory' },
      { kind: 'record', id: 'shared/regulatory/device-class.ts', label: 'IVDR classes A to D' },
      { kind: 'record', id: `${IVD_KB}/regulatory/eu-ivdr.ts`, label: 'IVD knowledge base: EU IVDR entries (classification, performance evaluation, transition, notified bodies)' },
    ],
    instructions: `
## When this applies
An IVD intended for the EU market: its class, its conformity-assessment route, the performance evaluation and report, the technical documentation, and the obligations after certification.

## Method
1. Establish the intended purpose as the IVDR requires it: what is detected or measured, the function (screening, diagnosis, monitoring, companion diagnostic and so on), the condition, the population, the intended user, the specimen, and whether the result is qualitative or quantitative. Classification and evidence follow from it.
2. Classify with \`classify_device\` (framework \`ivdr\`), which applies the Annex VIII rules and returns class A, B, C or D with the rule that gave it. When a deciding fact is missing the class is null; ask for it and never state a class. The device-class record holds the four-class vocabulary.
3. The class sets the route: only class A non-sterile devices are self-declared, and the others involve a notified body to the extent their class requires. Confirm the route and the notified body's role with \`search_ivd_knowledge\` and cite the entry.
4. Performance evaluation: plan it, then demonstrate scientific validity, analytical performance and clinical performance, and conclude in the performance evaluation report, kept current through post-market performance follow-up. The diagnostics sub-skills carry each pillar's studies. Gap-check the report with \`assess_device_evidence_structure\` (\`document: 'per'\`), which reports which pillars are covered, and read the notified body's questions with \`get_device_reviewer_checklist\` for a PER.
5. Technical documentation and the general safety and performance requirements: \`assess_essential_principles\` with \`isIVD\` set builds the Annex I matrix; \`advise_eu_technical_file_readiness\` (regulation \`ivdr\`) maps the person's content onto the Annex II and III structure and lists what is missing; \`build_device_blueprint\` for an IVDR technical file gives the whole evidence map. A row not assessed for lack of a stated fact stays not assessed.
6. Companion diagnostics carry a consultation with the medicines authority (companion-diagnostics skill). Performance studies that collect specimens for the study, or have interventional elements, have their own IVDR requirements and follow ISO 20916; ground them with \`search_ivd_knowledge\`.
7. Dates and transitions: the IVDR's transitional provisions have been amended more than once, and EUDAMED obligations are being phased in (currency fact eu-eudamed-mandatory). Never state a deadline from memory; check it with \`check_regulatory_currency\` and the knowledge base's transition entry, and report the status and date as returned.
8. After certification: the post-market surveillance plan, PMPF, vigilance and trend reporting, and the class-dependent periodic safety update report and summary of safety and performance; ground each with \`search_ivd_knowledge\`. \`generate_declaration_of_conformity\` drafts the EU declaration of conformity from the stated inputs and lists missing fields; the manufacturer signs it.

## Pitfalls reviewers raise
- Scientific validity asserted rather than evidenced.
- An intended purpose broader than the clinical performance data support.
- A performance evaluation report not linked to the risk management file and the GSPR matrix.
- No PMPF plan, and no justification for not having one.

## Before answering
- Class, route and dates come from the engines, the currency registry or a cited knowledge-base entry.
- IVDR requirements are kept apart from US ones when both markets are in play.

## Not AnA's to decide
- Conformity assessment and certification are the notified body's; the declaration of conformity is the manufacturer's, signed by it.
- Whether a change to a legacy device is significant is the manufacturer's assessment, which the notified body may challenge.
`,
  }),

  skill({
    key: 'diagnostics.clia-and-ldts',
    name: 'CLIA categorization and laboratory-developed tests',
    description:
      'US laboratory regulation of diagnostic tests: CLIA complexity categories and waivers, what a laboratory must verify or establish before reporting results, and the status of laboratory-developed tests after the 2024 FDA rule was vacated.',
    disciplines: ['diagnostics', 'regulatory-strategy'],
    useCases: ['strategy', 'gap-analysis'],
    segments: ['ivd'],
    regions: ['US'],
    triggers: [
      'clia',
      'clia waiver',
      'clia waived',
      'clia complexity',
      'clia categorization',
      'waived test',
      'moderate complexity',
      'high complexity',
      'certificate of waiver',
      'dual submission',
      'ldt',
      'ldts',
      'laboratory developed test',
      'laboratory-developed test',
      'lab-developed test',
      'ldt rule',
      'ldt final rule',
      'clia-certified laboratory',
      'clia lab',
      'cap accreditation',
      'part 493',
      '42 cfr 493',
      'single-site test',
    ],
    tools: [
      'search_ivd_knowledge',
      'ivd_knowledge_lookup',
      'lookup_fda_guidance',
      'compute_diagnostic_accuracy',
      'compute_analytical_performance',
      'check_regulatory_currency',
    ],
    references: [
      { kind: 'standard', id: 'cfr_493_clia' },
      { kind: 'currency-fact', id: 'us-ldt-final-rule-void' },
      { kind: 'record', id: `${IVD_KB}/regulatory/fda-ivd.ts`, label: 'IVD knowledge base: CLIA categorization and waiver entry' },
      { kind: 'record', id: `${IVD_KB}/legal/legal-ivd.ts`, label: 'IVD knowledge base: laboratory-developed tests and the void 2024 rule' },
    ],
    instructions: `
## When this applies
A US test that will run in a laboratory or at the point of care: its CLIA complexity category and any waiver, what the laboratory must do before reporting patient results, and whether a test is a laboratory-developed test or an IVD that needs FDA review.

## Method
1. Separate the two regimes. FDA regulates IVDs as devices; CLIA (42 CFR Part 493, administered by CMS) regulates the laboratories that test human specimens. A commercially distributed IVD meets both: FDA review for the test, and CLIA requirements for every laboratory that runs it.
2. Complexity: each commercially marketed test is categorized as waived, moderate or high complexity, and FDA assigns the category, usually at clearance or approval. Clearance does not imply waiver. A waiver needs its own demonstration that the test is simple with an insignificant risk of an erroneous result, either by a CLIA waiver application after clearance or by a dual 510(k) and CLIA waiver submission. Ground the criteria and study expectations in \`search_ivd_knowledge\` (or \`ivd_knowledge_lookup\` for the entry's pitfalls); name FDA's waiver guidances by topic and check them with \`lookup_fda_guidance\`.
3. Waiver studies compare results obtained by the intended untrained operators in waived settings with a comparative method, and flex studies stress the test under foreseeable errors. Compute agreement from the person's data with \`compute_diagnostic_accuracy\` (qualitative results) or \`compute_analytical_performance\` mode \`method_comparison\` (quantitative results).
4. Laboratory duties: a laboratory running an unmodified FDA-cleared or approved test of moderate or high complexity verifies the manufacturer's performance specifications before reporting results. A laboratory that modifies such a test, or runs its own test, establishes performance specifications: accuracy, precision, analytical sensitivity, analytical specificity including interfering substances, reportable range, reference intervals, and any other characteristic the test needs. Compute them with \`compute_analytical_performance\` and the analytical-performance skill.
5. Laboratory-developed tests: the 2024 FDA final rule that would have phased in device requirements for LDTs was vacated by a federal court, and FDA reverted the regulation (currency fact us-ldt-final-rule-void). Run \`check_regulatory_currency\` on the LDT topic before advising, and report the status as returned. Never advise that an LDT must meet the rule's phase-out stages; that schedule is void. LDTs remain subject to CLIA.
6. Establish whether the test is in fact an LDT: designed, manufactured and used within a single CLIA-certified laboratory. A test distributed as a kit to other laboratories is an IVD and follows the FDA device pathways (diagnostics and substantial-equivalence skills). Some states run their own review of laboratory tests; confirm the specifics before stating them.
7. Accreditation by an organization CMS has approved is one way a laboratory meets CLIA; name the accreditor the person actually uses rather than assuming one.

## Before answering
- The LDT status statement rests on a currency check run in this turn.
- No complexity category is assigned by AnA; it comes from FDA's categorization or the record the person holds.
- Performance figures come from the engines.

## Not AnA's to decide
- FDA assigns complexity categories and grants waivers; CMS and accrediting organizations inspect laboratories.
- Whether a test falls outside the LDT model is a regulatory and legal judgment for the sponsor's advisers.
- The laboratory director is responsible for the laboratory's test validation and reporting; AnA prepares the analysis.
`,
  }),
];
