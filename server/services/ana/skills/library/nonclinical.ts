/**
 * Nonclinical skills: the program that supports each clinical phase (ICH
 * M3(R2), S6(R1), S9), general toxicology, safety pharmacology, the
 * first-in-human starting dose, ADME and metabolites, and the Module 2.4 and
 * 2.6 summaries.
 *
 * Study requirements, doses, margins and adversity calls come from the
 * platform's deterministic engines (server/services/preclinical/ and the
 * toxicology, safety pharmacology and ADME tools); the skills route to them
 * and never supply a figure.
 *
 * @module server/services/ana/skills/library/nonclinical
 */

import { skill, type LibrarySkillSource } from '../types.js';

export const NONCLINICAL_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'nonclinical',
    name: 'Nonclinical development',
    description:
      'Planning or assessing a nonclinical program: which studies must be complete before each clinical phase under ICH M3(R2), how the package differs for biotechnology-derived products (S6(R1)) and advanced cancer (S9), GLP, and whether the package is ready for first-in-human.',
    disciplines: ['nonclinical'],
    useCases: ['strategy', 'gap-analysis', 'study-design', 'review'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_CTD_M4'],
    triggers: [
      'nonclinical',
      'non-clinical',
      'preclinical',
      'pre-clinical',
      'ind-enabling',
      'ind enabling',
      'ich m3',
      'm3(r2)',
      'nonclinical program',
      'nonclinical package',
      'nonclinical studies',
      'ich s6',
      's6(r1)',
      'ich s9',
      'glp study',
      'glp studies',
      'glp compliance',
      'good laboratory practice',
      'module 4',
      'pharmacology and toxicology',
      'pharm/tox',
      'exploratory clinical trial',
      'microdose',
      'biodistribution',
      'ich s12',
    ],
    tools: [
      'assess_nonclinical_program',
      'assess_nonclinical_safety',
      'lookup_ich_guideline',
      'assess_gene_therapy_requirements',
      'lookup_fda_guidance',
      'get_nonclinical_template',
    ],
    references: [
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'S6(R1)' },
      { kind: 'ich', id: 'S9' },
      { kind: 'ich', id: 'S12' },
      { kind: 'standard', id: 'ich_m3_s' },
      { kind: 'standard', id: 'ich_s6' },
      {
        kind: 'record',
        id: 'server/services/preclinical/nonclinical-program-requirements.ts',
        label: 'Nonclinical program staging engine (ICH M3(R2) and S-series)',
      },
    ],
    instructions: `
## When this applies
Planning or assessing a nonclinical development program: which studies must be complete before each clinical phase, how the package changes for biotechnology-derived products and for advanced cancer, and whether the package supports first-in-human dosing.

## Method
1. Establish the modality (small molecule, biologic, oligonucleotide, antibody-drug conjugate, cell or gene therapy), the indication and whether it is advanced cancer or otherwise life-threatening, the route, the clinical phase to be enabled and its maximum dosing duration, whether women of childbearing potential will enrol, whether use will be chronic, and which studies exist (species, duration, GLP status, findings).
2. Required program by phase: run \`assess_nonclinical_program\` with the maximum clinical duration, the target phase and the population. With no listed studies it returns requirements only; any listed studies are a stated-input worksheet, with no program adequacy verdict. It lists the battery and comparisons under ICH M3(R2) and the S-series (repeat-dose duration against clinical duration, genotoxicity timing, safety pharmacology before first-in-human, reproductive toxicity staged to the population, carcinogenicity at marketing for chronic use, and the S9 relaxations). Report the battery and gaps as returned, and say when later-due studies fall.
3. Readiness: \`assess_nonclinical_safety\` resolves the open project. Until nonclinical study records are reached, it returns readiness not_assessed, no program gaps and no starting dose, with requirements only for the stated clinical context. Do not pass studies, NOAELs, findings or FIH inputs; never infer readiness or missing studies from this answer.
4. Biotechnology-derived products (ICH S6(R1)): toxicology in pharmacologically relevant species, sometimes only one; the effect of anti-drug antibodies on exposure and interpretation; and the standard genotoxicity battery and rodent carcinogenicity bioassays generally not applicable. The approach is case by case.
5. Advanced cancer (ICH S9): a reduced, differently timed package and a different starting-dose approach; the toxicology and first-in-human dose skills carry the detail.
6. Other studies when the product or population triggers them: immunotoxicity (S8), photosafety (S10), juvenile animal studies for pediatric development (S11), biodistribution for gene therapy (S12), local tolerance for non-oral routes. Confirm each with \`lookup_ich_guideline\` before citing. For a gene therapy, \`assess_gene_therapy_requirements\` returns the nonclinical expectations with the CMC and clinical ones.
7. Exploratory clinical trials: ICH M3(R2) describes reduced nonclinical packages for exploratory approaches, including microdose studies. FDA's guidance on exploratory IND studies is named by topic; \`lookup_fda_guidance\` returns only dated facts from the currency register, so say a guidance needs confirming unless the person supplied it.
8. GLP: nonclinical laboratory safety studies that support the application are subject to 21 CFR Part 58, and the IND's pharmacology and toxicology section carries, for each such study, a statement of GLP compliance or the reason for noncompliance (21 CFR 312.23(a)(8)).
9. The test article in the pivotal toxicology studies must be representative of the clinical material, because impurity qualification depends on it; the CMC drug substance skill carries that link.
10. When a study report or summary is started before data are ingested, \`get_nonclinical_template\` returns the Module 4 report scaffolds. Hand detail to the toxicology, safety pharmacology, first-in-human dose, ADME and written summaries skills.

## Before answering
- Modality, indication, route, target phase and clinical duration are stated, or the answer says which were not stated.
- Required studies and gaps are quoted as the engine returned them; no duration or timing is supplied from memory.
- ICH codes are confirmed; FDA guidance is named by topic and marked as needing confirmation.

## Not AnA's to decide
- Whether a program supports a proposed trial: the sponsor's toxicologist proposes, the agency decides.
- Whether a finding is adverse, and the NOAEL: the study pathologist and study director.
- Signing a GLP compliance statement: the study director and quality assurance.
`,
  }),

  skill({
    key: 'nonclinical.toxicology',
    name: 'General toxicology program',
    description:
      'Designing or interpreting the toxicology program: species selection, repeat-dose design and duration, toxicokinetics, the genotoxicity battery (S2(R1)), carcinogenicity need (S1), reproductive and developmental toxicity (S5(R3)), adversity of findings and exposure margins.',
    disciplines: ['nonclinical'],
    useCases: ['study-design', 'analysis', 'review'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'toxicology',
      'tox study',
      'tox studies',
      'toxicity study',
      'toxicity studies',
      'repeat-dose',
      'repeat dose',
      'noael',
      'species selection',
      'tox species',
      'toxicokinetics',
      'genotoxicity',
      'genotox',
      'ames test',
      'micronucleus',
      'carcinogenicity',
      'reproductive toxicity',
      'developmental toxicity',
      'embryo-fetal',
      'dart studies',
      'ich s2',
      's5(r3)',
      'recovery group',
      'target organ toxicity',
      'exposure margin',
    ],
    tools: [
      'select_tox_species',
      'design_repeat_dose_study',
      'design_toxicokinetics',
      'design_genotox_battery',
      'assess_carcinogenicity_need',
      'design_repro_tox_study',
      'classify_tox_findings',
      'calculate_safety_margin',
      'assess_nonclinical_program',
      'lookup_ich_guideline',
    ],
    references: [
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'S2(R1)' },
      { kind: 'ich', id: 'S1A/S1B(R1)/S1C(R2)' },
      { kind: 'ich', id: 'S3A/S3B' },
      { kind: 'ich', id: 'S4' },
      { kind: 'ich', id: 'S5(R3)' },
      { kind: 'ich', id: 'S6(R1)' },
      { kind: 'ich', id: 'S9' },
      { kind: 'standard', id: 'ich_m3_s' },
      {
        kind: 'record',
        id: 'server/services/preclinical/tox-findings-classifier.ts',
        label: 'Toxicologic-pathology adversity classifier',
      },
    ],
    instructions: `
## When this applies
Designing or interpreting the general toxicology program: species, repeat-dose studies and their duration, toxicokinetics, genotoxicity, carcinogenicity, reproductive and developmental toxicity, which findings are adverse, and the exposure margins they leave.

## Method
1. Establish the modality, route, intended clinical duration and phase, the population (women of childbearing potential, children), whether the indication is advanced cancer, and the studies and findings that exist.
2. Species: \`select_tox_species\` returns the rodent and non-rodent species with the rationale (pharmacokinetics, metabolism, pharmacological relevance, target expression). For a biotechnology-derived product the species must be pharmacologically relevant (S6(R1)), and one species can be justified.
3. Repeat-dose studies: \`design_repeat_dose_study\` returns the duration tied to the clinical phase, groups and animals, the dose-selection principles, endpoints, toxicokinetic satellites and recovery groups. High-dose selection follows the principles in ICH M3(R2) (maximum tolerated dose, limit dose, saturation of exposure, maximum feasible dose, exposure multiple); quote what the engine returns rather than a number from memory. Program-level timing comes from \`assess_nonclinical_program\`.
4. Toxicokinetics (S3A): \`design_toxicokinetics\` returns the sampling design and the exposure parameters, and checks saturation, accumulation and sex differences. Exposure in the toxicology species is what margins are built on.
5. Genotoxicity (S2(R1)): \`design_genotox_battery\` returns the battery option, the assays, the timing relative to the clinical phase, and the follow-up for a positive result. For most biotechnology-derived products the standard battery does not apply.
6. Carcinogenicity (S1A, S1B(R1), S1C(R2)): \`assess_carcinogenicity_need\` assesses the triggers and, when studies are needed, the design (including the weight-of-evidence approach in S1B(R1)) and dose selection.
7. Reproductive and developmental toxicity (S5(R3)): \`design_repro_tox_study\` returns the studies (fertility, embryo-fetal development, pre- and postnatal development), species and timing relative to the enrolment of women of childbearing potential.
8. Findings: \`classify_tox_findings\` classifies each finding as adverse, adaptive or to be monitored, with reversibility and human relevance, and drafts the target-organ paragraph. It is an aid: the pathologist adjudicates adversity, and the NOAEL is the study's own conclusion.
9. Margins: \`calculate_safety_margin\` returns the human equivalent dose by body surface area and, given exposures, AUC- and Cmax-based margins at the clinical dose. Never compute a margin by hand. Where protein binding differs across species, margins are read on unbound exposure (ADME skill).
10. Other toxicity studies when triggered (immunotoxicity S8, photosafety S10, juvenile animals S11, local tolerance): confirm the guideline with \`lookup_ich_guideline\` before citing.

## Pitfalls reviewers raise
- Species chosen without showing pharmacological relevance or metabolic similarity.
- Repeat-dose duration shorter than the clinical dosing it is meant to support.
- High dose not justified, so the absence of toxicity is uninterpretable.
- No toxicokinetics, so margins cannot be stated on exposure.

## Before answering
- Durations, group sizes, timings and margins are quoted from the engine that returned them.
- Adversity calls from the classifier are labelled as aids pending the pathologist's adjudication.
- The test article is stated, so the reader knows which material the findings describe.

## Not AnA's to decide
- Whether a finding is adverse, and the NOAEL: the study pathologist and study director.
- Whether the program supports the proposed trial: the sponsor proposes, the agency decides.
`,
  }),

  skill({
    key: 'nonclinical.safety-pharmacology',
    name: 'Safety pharmacology',
    description:
      'Planning or interpreting safety pharmacology: the ICH S7A core battery (cardiovascular, central nervous, respiratory) before first-in-human, follow-up and supplemental studies, the nonclinical part of QT risk (S7B with the E14 Q&As), and abuse liability for centrally active drugs.',
    disciplines: ['nonclinical', 'clinical-pharmacology'],
    useCases: ['study-design', 'analysis', 'review'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'safety pharmacology',
      'core battery',
      'ich s7a',
      's7a',
      'ich s7b',
      's7b',
      'herg',
      'qt prolongation',
      'telemetry study',
      'cardiovascular safety pharmacology',
      'cns safety pharmacology',
      'respiratory safety pharmacology',
      'irwin',
      'functional observational battery',
      'plethysmography',
      'abuse liability',
      'abuse potential',
      'drug discrimination',
      'self-administration study',
      'seizure liability',
      'proarrhythmic',
      'e14/s7b',
    ],
    tools: [
      'design_core_battery',
      'assess_cardiovascular_safety_pharmacology',
      'assess_qtc_risk',
      'assess_cns_safety_pharmacology',
      'assess_respiratory_safety_pharmacology',
      'design_followup_safety_study',
      'assess_abuse_liability',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'S7A/S7B' },
      { kind: 'ich', id: 'E14(R3)' },
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'S6(R1)' },
      { kind: 'standard', id: 'ich_m3_s' },
    ],
    instructions: `
## When this applies
Planning or interpreting safety pharmacology: the core battery on cardiovascular, central nervous and respiratory function before first-in-human dosing, follow-up and supplemental studies, the nonclinical part of QT risk, and abuse liability for centrally active drugs.

## Method
1. Establish the modality, route, phase, whether the drug is centrally active, whether systemic exposure is low (local application), whether it is a cytotoxic agent for end-stage cancer, and what data exist (hERG, in vivo QT, toxicology ECGs).
2. Core battery (ICH S7A): \`design_core_battery\` returns the organ systems, studies, preferred species, GLP status and timing relative to first-in-human, and the exclusions that apply. For a biotechnology-derived product it applies S6(R1) logic, where endpoints are often built into toxicology studies.
3. Cardiovascular: \`assess_cardiovascular_safety_pharmacology\` returns the telemetry design and endpoints and, given a hERG IC50 and the clinical free Cmax, the hERG margin and the band it falls in. Report the margin and band as returned.
4. Integrated QT risk (S7B with the E14 Q&As): when clinical data exist, or a strategy that relies on nonclinical data in place of a thorough QT study is being considered, \`assess_qtc_risk\` integrates hERG, in vivo and clinical data into a risk category and a recommended strategy. The clinical QT strategy itself belongs to clinical pharmacology.
5. Central nervous system: \`assess_cns_safety_pharmacology\` returns the functional observational battery or Irwin design, motor activity, seizure liability and the abuse-liability cross-reference.
6. Respiratory: \`assess_respiratory_safety_pharmacology\` returns the plethysmography design, endpoints and respiratory-depression risk.
7. Follow-up and supplemental studies (renal, gastrointestinal, autonomic and others) are run on a cause for concern: \`design_followup_safety_study\` maps each trigger to a study. With no trigger it returns no study; report that as the answer.
8. Abuse potential: \`assess_abuse_liability\` says whether an assessment is triggered and returns the nonclinical and clinical studies, the eight-factor analysis and the scheduling implication. FDA's guidance on assessing the abuse potential of drugs is named by topic; \`lookup_fda_guidance\` returns only dated facts from the currency register, so say a guidance needs confirming unless the person supplied it.

## Before answering
- Species, timing, margins and bands are quoted as the engines returned them.
- The answer separates what is required before first-in-human from what is triggered by a finding.
- A nonclinical QT conclusion is not presented as the clinical QT assessment.

## Not AnA's to decide
- Whether a QT study may be waived: the agency's.
- Controlled-substance scheduling: the agencies responsible for scheduling, not the sponsor or AnA.
- Interpretation of a study's findings for the report: the study director.
`,
  }),

  skill({
    key: 'nonclinical.first-in-human-dose',
    name: 'First-in-human starting dose',
    description:
      'Choosing and justifying the first-in-human starting dose: NOAEL-based maximum recommended starting dose, MABEL for higher-risk molecules, advanced-cancer approaches, and exposure margins, all computed by the platform dose engine.',
    disciplines: ['nonclinical', 'clinical-pharmacology'],
    useCases: ['analysis', 'study-design', 'drafting'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'first-in-human dose',
      'first in human dose',
      'fih dose',
      'fih starting dose',
      'starting dose',
      'mrsd',
      'maximum recommended starting dose',
      'maximum safe starting dose',
      'mabel',
      'minimum anticipated biological effect level',
      'human equivalent dose',
      'hed',
      'body surface area scaling',
      'allometric scaling',
      'receptor occupancy',
      'dose justification memo',
    ],
    tools: [
      'compute_fih_dose',
      'calculate_safety_margin',
      'assess_nonclinical_safety',
      'get_nonclinical_template',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'S9' },
      { kind: 'ich', id: 'S6(R1)' },
      { kind: 'standard', id: 'ich_m3_s' },
      {
        kind: 'record',
        id: 'server/services/preclinical/fih-dose-engine.ts',
        label: 'First-in-human dose engine (MRSD and MABEL)',
      },
    ],
    instructions: `
## When this applies
Choosing and justifying the starting dose for a first-in-human trial: the NOAEL-based maximum recommended starting dose, MABEL for higher-risk molecules, approaches for advanced cancer, and the exposure margins at the proposed doses.

## Method
1. Establish the modality and mechanism, and whether the risk profile is higher (agonist, immunomodulator, novel target, steep dose-response, effects that are hard to monitor); the species tested and the NOAEL in each, as the study reports conclude; exposure at those NOAELs; the pharmacology data (concentration-response, receptor occupancy); the population (healthy volunteers or patients); and whether the indication is advanced cancer.
2. The existing \`compute_fih_dose\` calculator is a worksheet over explicitly stated inputs, not a program starting-dose determination; no study records are read and its output must not become governed content. As a worksheet, it derives the maximum recommended starting dose (NOAEL, human equivalent dose by body surface area, safety factor, most appropriate species) and, given the inputs, MABEL; it selects the more conservative and says which derivation limits. Never hand-calculate a human equivalent dose, MRSD or MABEL; report the numbers as returned.
3. Safety factor: the default and the reasons to increase it come from FDA's guidance on estimating the maximum safe starting dose in adult healthy volunteers, named by topic; \`lookup_fda_guidance\` returns only dated facts from the currency register, so say the guidance needs confirming unless the person supplied it. Record the rationale for the factor chosen with the input.
4. Higher-risk molecules: MABEL from in vitro and in vivo pharmacology, as described in EMA's guideline on first-in-human and early clinical trial risk mitigation (named by topic); the more conservative of MRSD and MABEL normally sets the start.
5. Exposure margins at the starting dose and through planned escalation: \`calculate_safety_margin\` with AUC and Cmax. With the oncology flag it returns the ICH S9 starting-dose considerations, which differ from the healthy-volunteer approach.
6. Readiness: \`assess_nonclinical_safety\` does not accept typed study figures. Until a recorded study source is reached, it returns not_assessed, a requirements list for the stated clinical context, and no program dose or gaps.
7. \`get_nonclinical_template\` returns the dose-justification memo scaffold only. Author governed justification from the versioned study reports cited by the author; do not insert a stated-input worksheet as the program's dose or Module 2.4 content.

## Before answering
- The worksheet NOAELs are identified as the person's stated inputs with species and study reference; do not claim study records were read.
- Every dose, factor and margin is quoted from the engine, with the limiting derivation stated.
- The population the dose is for is stated.

## Not AnA's to decide
- The NOAEL of each study: the study director and pathologist.
- The starting dose proposed in the protocol: the sponsor's clinical and nonclinical leads; its acceptance: the agency and ethics committee.
`,
  }),

  skill({
    key: 'nonclinical.adme-and-metabolites',
    name: 'Nonclinical ADME and metabolites',
    description:
      'Planning and interpreting the nonclinical ADME program: absorption, protein binding and tissue distribution, metabolism and reaction phenotyping, mass balance, and metabolites in safety testing, with the in vitro data that clinical drug-interaction planning needs.',
    disciplines: ['nonclinical', 'clinical-pharmacology'],
    useCases: ['study-design', 'analysis', 'review'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'adme',
      'adme program',
      'mass balance',
      'radiolabeled',
      'radiolabelled',
      'metabolites in safety testing',
      'mist assessment',
      'disproportionate metabolite',
      'human metabolite',
      'metabolite profiling',
      'metabolite identification',
      'reaction phenotyping',
      'protein binding',
      'plasma protein binding',
      'fraction unbound',
      'qwba',
      'tissue distribution',
      'metabolic stability',
      'cyp inhibition',
      'cyp induction',
      'in vitro ddi',
    ],
    tools: [
      'design_adme_program',
      'assess_protein_binding',
      'design_reaction_phenotyping',
      'design_mass_balance_study',
      'assess_metabolite_safety',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'S3A/S3B' },
      { kind: 'ich', id: 'M12' },
      { kind: 'standard', id: 'ich_m3_s' },
    ],
    instructions: `
## When this applies
Planning the nonclinical ADME program and interpreting its results: absorption, distribution (protein binding, tissue distribution), metabolism (metabolite identification, reaction phenotyping, metabolites in safety testing), excretion and mass balance, and the in vitro data that clinical drug-interaction planning needs.

## Method
1. Establish the modality, development stage, route, expected half-life and clearance pathways, and the studies done. ADME for antibodies, oligonucleotides and other biologics differs from small molecules; the engine adapts to the modality.
2. Program: \`design_adme_program\` returns the studies with their necessity and timing relative to first-in-human, and a readiness checklist. A study marked conditional names the input it depends on; report it as conditional, not as required.
3. Protein binding: \`assess_protein_binding\` returns the fraction unbound by species and the cross-species difference. When binding differs across species, read safety margins on unbound exposure (toxicology skill).
4. Metabolism and interactions: \`design_reaction_phenotyping\` plans the enzyme panel and the fraction metabolised by each pathway. In vitro inhibition, induction and transporter data feed clinical drug-interaction planning under ICH M12, which belongs to clinical pharmacology; these tools do not classify clinical interaction risk.
5. Mass balance: \`design_mass_balance_study\` designs the radiolabelled study in humans or animals (label position, collection, recovery, metabolite profiling) and feeds the metabolite assessment.
6. Metabolites in safety testing: \`assess_metabolite_safety\` judges each human metabolite against total drug-related exposure and against exposure in the toxicology species, flags disproportionate and human-specific metabolites, and recommends actions. A metabolite whose exposure share is not stated is not assessed; never report it as below the threshold. ICH M3(R2) sets when human metabolite data should be in hand relative to larger and longer trials; confirm the text with \`lookup_ich_guideline\`.
7. Tissue distribution: quantitative whole-body autoradiography or repeated-dose distribution (S3B) when the program or a finding calls for it.
8. FDA's guidance on safety testing of drug metabolites and on in vitro drug interaction studies are named by topic; \`lookup_fda_guidance\` returns only dated facts from the currency register, so say a guidance needs confirming unless the person supplied it.

## Before answering
- Study lists, fractions unbound, fraction-metabolised estimates and metabolite verdicts are quoted from the engines.
- Not-assessed results are reported as not assessed.
- The answer marks where nonclinical ADME ends and clinical drug-interaction assessment begins.

## Not AnA's to decide
- Whether a metabolite needs separate qualification studies: the sponsor's toxicologist proposes, the agency decides.
- Radiation dosimetry approval for a human radiolabelled study: the responsible radiation safety and ethics bodies.
`,
  }),

  skill({
    key: 'nonclinical.written-summaries',
    name: 'Nonclinical overview and summaries (Module 2.4 and 2.6)',
    description:
      'Drafting or reviewing the Module 2.4 Nonclinical Overview and the Module 2.6 Nonclinical Written and Tabulated Summaries, composed from the program study set and kept consistent with the Module 4 reports and the clinical documents.',
    disciplines: ['nonclinical', 'medical-writing'],
    useCases: ['drafting', 'review', 'submission-assembly'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_NONCLIN_OVERVIEW', 'ICH_NONCLIN_SUMMARY'],
    triggers: [
      'nonclinical overview',
      'module 2.4',
      'm2.4',
      'nonclinical summary',
      'nonclinical summaries',
      'nonclinical written summary',
      'written and tabulated summaries',
      'tabulated summary',
      'tabulated summaries',
      'module 2.6',
      'm2.6',
      'ich m4s',
      'm4s',
      'toxicology written summary',
      'pharmacology written summary',
    ],
    tools: [
      'draft_nonclinical_overview_m2_4',
      'draft_nonclinical_summaries_m2_6',
      'classify_tox_findings',
      'get_nonclinical_template',
      'get_document_section_requirements',
      'check_dossier_consistency',
      'validate_cross_references',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'standard', id: 'ich_m3_s' },
      {
        kind: 'record',
        id: 'server/services/preclinical/m26-nonclinical-summaries.ts',
        label: 'Module 2.6 nonclinical summaries composer',
      },
    ],
    instructions: `
## When this applies
Drafting or reviewing Module 2.4, the Nonclinical Overview, and Module 2.6, the Nonclinical Written and Tabulated Summaries, so they reflect the Module 4 reports and agree with the clinical documents.

## Method
1. The Module 2.4 and 2.6 drafts take no studies: do not pass studies, doses, NOAELs or findings to them, and do not restate figures from the conversation. Until nonclinical studies are recorded against a project they return the ICH M4S outline and say so; use that outline, and do not invent studies to fill it. To start a Module 2.6 or Module 4 document from scratch, \`get_nonclinical_template\` returns its scaffold.
2. Confirm what each section must contain with \`get_document_section_requirements\` ("2.4" or "2.6"). The structure follows the CTD safety guideline (M4S); confirm it before citing a heading.
3. Module 2.4 is an integrated, critical assessment, not a restatement of the reports: the pharmacology, pharmacokinetics and toxicology taken together, the relevance of the findings to humans, the exposure margins, the gaps, and how the package supports the proposed clinical use. Draft it with \`draft_nonclinical_overview_m2_4\` and report what it returns as it is: the composed draft with its completeness and gaps, or the outline and the reason nothing was composed. Never assert a study the project's records do not hold.
4. Module 2.6 carries the introduction, then written and tabulated summaries for pharmacology, pharmacokinetics and toxicology. Draft it with \`draft_nonclinical_summaries_m2_6\` and report what it returns as it is; never fill a table with a figure it did not return.
5. Findings: frame target-organ findings with \`classify_tox_findings\` (adverse, adaptive, monitor; reversibility; human relevance). The classification is an aid; the pathologist's adjudication in the study report governs.
6. Consistency: run \`check_dossier_consistency\` so NOAELs, doses, exposures and margins agree with Module 4, the Investigator's Brochure, the protocol and Module 2.5. Run \`validate_cross_references\` on every reference to a Module 4 report or section.

## Before answering
- Every study named exists in the program's records, and every number traces to a report or an engine.
- Completeness and gaps are reported as the composers returned them.
- Inconsistencies found are listed, not resolved by choosing a value.

## Not AnA's to decide
- The interpretation of a study's findings: the study director and pathologist, as reported.
- Approval of the overview and summaries for submission: the responsible nonclinical author and approvers; signing and filing, a person with signing authority.
`,
  }),
];
