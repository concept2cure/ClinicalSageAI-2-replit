/**
 * @fileoverview Clinical Study Report (CSR) & Module 5 clinical document templates.
 * @module server/services/templates/clinical-csr-templates
 *
 * Blank structured scaffolds for the Module 5 clinical documents that close the
 * "refuse-to-file" Module 5 gap for NDA/BLA dossiers: the ICH E3 Clinical Study
 * Report (full 16-section body + synopsis), the integrated summaries of safety
 * and efficacy (ISS / ISE, 5.3.5.3), and the clinical-study protocol. These are
 * the start-from-scratch counterpart to the deterministic composers: an author
 * or ANA fills the [PLACEHOLDER] tokens.
 *
 * Each entry matches the shape of `NonclinicalTemplate` in
 * `nonclinical-templates.ts` so the two libraries share the same
 * discovery/fetch path and the same ANA tool ergonomics.
 *
 * @compliance ICH E3 (Structure and Content of Clinical Study Reports);
 *             ICH E6(R3) GCP; ICH M4E(R2) (CTD Efficacy); ICH E9 (statistics);
 *             FDA IND/NDA Module 5 organization (21 CFR 314.50).
 */

import { renderE3Scaffold } from '../ind/ctd/index.js';

/**
 * The CSR body is the ICH E3 overlay's scaffold (ind/ctd/csr-e3-guidance.ts),
 * not a hand-kept outline. The hand-kept one stopped at second-level headings,
 * had no §11.4.2.x, §12.2.x, §12.3.x, §12.4.x, §14.x, §16.1.x or §16.2.x, and
 * labelled §14 "[IN_TEXT_TABLES]" — E3 §14 is the tables NOT included in the
 * text (tests/regulatory/csr-e3-overlay.test.ts).
 */
const CSR_HEADER = `CLINICAL STUDY REPORT (ICH E3)

STUDY TITLE: [STUDY_TITLE]
STUDY NUMBER: [STUDY_NUMBER]    PROTOCOL VERSION/DATE: [PROTOCOL_VERSION]
INVESTIGATIONAL PRODUCT: [DRUG_NAME]    INDICATION: [INDICATION]
PHASE: [PHASE]    SPONSOR: [SPONSOR]
DEVELOPMENT PHASE / GCP STATEMENT (ICH E6): [GCP_STATEMENT]`;

export interface ClinicalTemplate {
  id: string;
  name: string;
  title: string;
  template_name: string;
  region: string;
  version: string;
  description: string;
  module_number: string;
  sectionCode: string;
  granule_id: string;
  category: string;
  content: string;
}

export const clinicalTemplates: ClinicalTemplate[] = [
  {
    id: 'tmpl-m5-3-5-1-csr',
    name: 'Module_5_3_5_1_Clinical_Study_Report',
    title: 'Module 5.3.5.1 - Clinical Study Report (ICH E3)',
    template_name: 'Module 5.3.5.1 - Clinical Study Report (ICH E3)',
    region: 'ICH',
    version: '4.0',
    description:
      'Full ICH E3 Clinical Study Report body — every heading E3 numbers (§1–§16, to 16.1.12 and 16.2.8), one placeholder per heading. Use for the pivotal study reports under 5.3.5.1; get_document_section_requirements gives what belongs under each heading.',
    module_number: '5',
    sectionCode: '5.3.5.1',
    granule_id: 'm5-3-5-1-csr',
    category: 'clinical',
    content: `${CSR_HEADER}\n\n${renderE3Scaffold()}`,
  },
  {
    id: 'tmpl-m5-3-5-1-csr-synopsis',
    name: 'Module_5_3_5_1_CSR_Synopsis',
    title: 'Clinical Study Report Synopsis (ICH E3 §2)',
    template_name: 'Clinical Study Report Synopsis (ICH E3 §2)',
    region: 'ICH',
    version: '4.0',
    description:
      'The standalone ICH E3 Section 2 synopsis (typically ≤3 pages) summarizing objectives, methods, results, and conclusions of a single study.',
    module_number: '5',
    sectionCode: '5.3.5.1',
    granule_id: 'm5-3-5-1-csr-synopsis',
    category: 'clinical',
    content: `CLINICAL STUDY REPORT — SYNOPSIS (ICH E3 §2)

NAME OF SPONSOR: [SPONSOR]
NAME OF INVESTIGATIONAL PRODUCT: [DRUG_NAME]
TITLE OF STUDY: [STUDY_TITLE]
STUDY NUMBER: [STUDY_NUMBER]    PHASE: [PHASE]
INVESTIGATOR(S) / STUDY CENTRE(S): [INVESTIGATORS_CENTRES]
PUBLICATION (REFERENCE): [PUBLICATION]
STUDIED PERIOD (first/last enrolment): [STUDY_PERIOD]

OBJECTIVES: [OBJECTIVES]
METHODOLOGY (design, blinding, randomization): [METHODOLOGY]
NUMBER OF PATIENTS (planned and analysed): [N_PATIENTS]
DIAGNOSIS AND MAIN CRITERIA FOR INCLUSION: [INCLUSION_SUMMARY]
TEST PRODUCT, DOSE, MODE OF ADMINISTRATION, BATCH: [TEST_PRODUCT]
DURATION OF TREATMENT: [TREATMENT_DURATION]
REFERENCE THERAPY, DOSE, MODE, BATCH: [REFERENCE_THERAPY]

CRITERIA FOR EVALUATION
  Efficacy: [EFFICACY_CRITERIA]
  Safety: [SAFETY_CRITERIA]
STATISTICAL METHODS: [STATISTICAL_METHODS]

SUMMARY — CONCLUSIONS
  Efficacy results: [EFFICACY_RESULTS]
  Safety results: [SAFETY_RESULTS]
  Conclusion: [CONCLUSION]

DATE OF THE REPORT: [REPORT_DATE]`,
  },
  {
    id: 'tmpl-m5-3-5-3-iss',
    name: 'Module_5_3_5_3_Integrated_Summary_Safety',
    title: 'Module 5.3.5.3 - Integrated Summary of Safety (ISS)',
    template_name: 'Module 5.3.5.3 - Integrated Summary of Safety (ISS)',
    region: 'FDA',
    version: '4.0',
    description:
      'Integrated Summary of Safety — the pooled cross-study safety analysis (5.3.5.3) FDA expects for an NDA/BLA, per the 21 CFR 314.50 integrated-summary requirement and the FDA premarketing safety guidance.',
    module_number: '5',
    sectionCode: '5.3.5.3',
    granule_id: 'm5-3-5-3-iss',
    category: 'clinical',
    content: `INTEGRATED SUMMARY OF SAFETY (ISS)

PRODUCT: [DRUG_NAME]    INDICATION: [INDICATION]
POOLING STRATEGY AND STUDIES INCLUDED: [POOLING_STRATEGY]

1. OVERVIEW OF SAFETY DATABASE
Studies and patients pooled (by phase, control, dose): [SAFETY_DATABASE]

2. EXTENT OF EXPOSURE
Patient-years, dose, duration distribution: [EXTENT_OF_EXPOSURE]

3. DEMOGRAPHICS OF THE SAFETY POPULATION
[SAFETY_DEMOGRAPHICS]

4. ADVERSE EVENTS (POOLED)
Common AEs by SOC/PT, treatment vs control: [POOLED_AES]
Dose- and exposure-relationship: [AE_DOSE_RELATIONSHIP]

5. DEATHS, SERIOUS ADVERSE EVENTS, AND DISCONTINUATIONS
[DEATHS_SAES_DISCONTINUATIONS]

6. ADVERSE EVENTS OF SPECIAL INTEREST (AESI)
[AESI]

7. CLINICAL LABORATORY, VITAL SIGNS, ECG
[LABS_VITALS_ECG]

8. SAFETY IN SPECIAL POPULATIONS AND SUBGROUPS
Age, sex, race, renal/hepatic impairment, drug interactions: [SUBGROUP_SAFETY]

9. INTEGRATED SAFETY CONCLUSIONS / BENEFIT-RISK INPUT
[INTEGRATED_SAFETY_CONCLUSIONS]`,
  },
  {
    id: 'tmpl-m5-3-5-3-ise',
    name: 'Module_5_3_5_3_Integrated_Summary_Efficacy',
    title: 'Module 5.3.5.3 - Integrated Summary of Efficacy (ISE)',
    template_name: 'Module 5.3.5.3 - Integrated Summary of Efficacy (ISE)',
    region: 'FDA',
    version: '4.0',
    description:
      'Integrated Summary of Efficacy — the pooled cross-study efficacy analysis (5.3.5.3) FDA expects for an NDA/BLA, per 21 CFR 314.50.',
    module_number: '5',
    sectionCode: '5.3.5.3',
    granule_id: 'm5-3-5-3-ise',
    category: 'clinical',
    content: `INTEGRATED SUMMARY OF EFFICACY (ISE)

PRODUCT: [DRUG_NAME]    INDICATION: [INDICATION]
STUDIES CONTRIBUTING TO THE EFFICACY EVIDENCE: [EFFICACY_STUDIES]

1. BACKGROUND AND OVERVIEW OF CLINICAL EFFICACY PROGRAM
[EFFICACY_PROGRAM_OVERVIEW]

2. PRIMARY-ENDPOINT EVIDENCE ACROSS STUDIES
Per-study primary results and consistency: [PRIMARY_EVIDENCE]

3. POOLED / META-ANALYTIC EFFICACY ANALYSES
Methods and results: [POOLED_EFFICACY]

4. DOSE-RESPONSE AND DURATION OF EFFECT
[DOSE_RESPONSE]

5. EFFICACY IN SUBGROUPS
Age, sex, race, disease severity, region: [EFFICACY_SUBGROUPS]

6. PERSISTENCE OF EFFICACY / TOLERANCE
[PERSISTENCE]

7. INTEGRATED EFFICACY CONCLUSIONS / BENEFIT-RISK INPUT
[INTEGRATED_EFFICACY_CONCLUSIONS]`,
  },
  {
    id: 'tmpl-m5-3-5-clinical-protocol',
    name: 'Clinical_Study_Protocol',
    title: 'Clinical Study Protocol (ICH E6)',
    template_name: 'Clinical Study Protocol (ICH E6)',
    region: 'ICH',
    version: '4.0',
    description:
      'Clinical study protocol scaffold per ICH E6(R3) Appendix B (Clinical Trial Protocol and Protocol Amendment(s)) — objectives, design, eligibility, treatments, assessments, and statistics. Files under 5.3.5.1 §16.1.1 as a CSR appendix or as the standalone protocol.',
    module_number: '5',
    sectionCode: '5.3.5.1',
    granule_id: 'm5-3-5-clinical-protocol',
    category: 'clinical',
    content: `CLINICAL STUDY PROTOCOL (ICH E6(R3) Appendix B)

PROTOCOL TITLE: [PROTOCOL_TITLE]
PROTOCOL NUMBER: [PROTOCOL_NUMBER]    VERSION/DATE: [VERSION_DATE]
INVESTIGATIONAL PRODUCT: [DRUG_NAME]    INDICATION: [INDICATION]    PHASE: [PHASE]
SPONSOR: [SPONSOR]

1. BACKGROUND AND RATIONALE
[BACKGROUND]

2. OBJECTIVES AND ENDPOINTS
Primary objective / endpoint: [PRIMARY_OBJECTIVE_ENDPOINT]
Secondary objectives / endpoints: [SECONDARY_OBJECTIVES_ENDPOINTS]
Exploratory endpoints: [EXPLORATORY_ENDPOINTS]

3. STUDY DESIGN
Type, blinding, randomization, control, duration, schematic: [STUDY_DESIGN]
Estimands (ICH E9(R1)): [ESTIMANDS]

4. STUDY POPULATION
Inclusion criteria: [INCLUSION_CRITERIA]
Exclusion criteria: [EXCLUSION_CRITERIA]
Withdrawal / discontinuation criteria: [WITHDRAWAL_CRITERIA]

5. TREATMENTS
Investigational product, dose, route, regimen: [TREATMENT_REGIMEN]
Randomization and blinding procedures: [RANDOMIZATION_BLINDING]
Prior and concomitant therapy: [CONCOMITANT_THERAPY]

6. ASSESSMENTS AND SCHEDULE
Efficacy assessments: [EFFICACY_ASSESSMENTS]
Safety assessments: [SAFETY_ASSESSMENTS]
Schedule of activities (visit matrix): [SCHEDULE_OF_ACTIVITIES]

7. STATISTICAL CONSIDERATIONS
Sample size and power: [SAMPLE_SIZE]
Analysis populations: [ANALYSIS_POPULATIONS]
Primary analysis and handling of missing data: [PRIMARY_ANALYSIS_METHOD]
Interim analyses / DMC: [INTERIM_DMC]

8. ETHICS, REGULATORY, AND DATA HANDLING
IRB/IEC, informed consent, GCP, data management, monitoring: [ETHICS_REGULATORY]`,
  },
];

const BY_GRANULE: Record<string, ClinicalTemplate> = Object.fromEntries(
  clinicalTemplates.map(t => [t.granule_id, t]),
);
// Several clinical granules share a CTD section code (e.g. CSR, synopsis, and
// protocol all live under 5.3.5.1; ISS and ISE both under 5.3.5.3). Section
// lookup returns the first registered granule for that code — prefer the
// granule id when a specific document is needed.
const BY_SECTION: Record<string, ClinicalTemplate> = {};
for (const t of clinicalTemplates) {
  if (!BY_SECTION[t.sectionCode]) BY_SECTION[t.sectionCode] = t;
}

/** Look up a clinical (Module 5 / CSR) template by granule id or CTD section code. */
export function getClinicalTemplate(key: string): ClinicalTemplate | undefined {
  return BY_GRANULE[key] ?? BY_SECTION[key];
}

/** List the available clinical templates (metadata only). */
export function listClinicalTemplates(): Array<Pick<ClinicalTemplate, 'granule_id' | 'sectionCode' | 'title' | 'description'>> {
  return clinicalTemplates.map(t => ({
    granule_id: t.granule_id,
    sectionCode: t.sectionCode,
    title: t.title,
    description: t.description,
  }));
}
