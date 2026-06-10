/**
 * @fileoverview Nonclinical & clinical-pharmacology document templates (forms).
 * @module server/services/templates/nonclinical-templates
 *
 * Blank structured scaffolds for the Module 4 study reports and the Module 2.6
 * nonclinical summaries that the existing fallbackTemplates library does not
 * cover, plus a first-in-human dose-justification memo. These are the
 * start-from-scratch counterpart to the deterministic composers (which fill
 * content from data): an author or ANA fills the [PLACEHOLDER] tokens.
 *
 * Each entry matches the shape of `fallbackTemplates` so it can be merged into
 * the same discovery/fetch path.
 *
 * @compliance ICH M4S(R2); ICH M3(R2); FDA 2005 MRSD guidance; ICH E14.
 */

export interface NonclinicalTemplate {
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

export const nonclinicalTemplates: NonclinicalTemplate[] = [
  {
    id: 'tmpl-m4-2-1-pharmacology',
    name: 'Module_4_2_1_Pharmacology',
    title: 'Module 4.2.1 - Pharmacology Study Report',
    template_name: 'Module 4.2.1 - Pharmacology Study Report',
    region: 'FDA',
    version: '4.0',
    description: 'Nonclinical pharmacology study report (primary/secondary PD, safety pharmacology) per ICH S7A/S7B.',
    module_number: '4',
    sectionCode: '4.2.1',
    granule_id: 'm4-2-1-pharmacology',
    category: 'nonclinical',
    content: `MODULE 4.2.1 — PHARMACOLOGY STUDY REPORT

STUDY TITLE: [STUDY_TITLE]
STUDY NUMBER: [STUDY_NUMBER]
TESTING FACILITY: [TESTING_FACILITY]
GLP COMPLIANCE: [GLP_STATUS]

4.2.1.1 PRIMARY PHARMACODYNAMICS
Test system / species: [SPECIES]
Mechanism of action / target: [TARGET]
Key findings: [PRIMARY_PD_FINDINGS]

4.2.1.2 SECONDARY PHARMACODYNAMICS
Off-target effects assessed: [SECONDARY_PD]

4.2.1.3 SAFETY PHARMACOLOGY (ICH S7A core battery)
Cardiovascular: [CV_FINDINGS]
Central nervous system: [CNS_FINDINGS]
Respiratory: [RESP_FINDINGS]
hERG / QT (ICH S7B): [HERG_FINDINGS]

4.2.1.4 PHARMACODYNAMIC DRUG INTERACTIONS
[PD_INTERACTIONS]

CONCLUSION: [PHARMACOLOGY_CONCLUSION]`,
  },
  {
    id: 'tmpl-m4-2-2-pharmacokinetics',
    name: 'Module_4_2_2_Pharmacokinetics',
    title: 'Module 4.2.2 - Pharmacokinetics Study Report',
    template_name: 'Module 4.2.2 - Pharmacokinetics Study Report',
    region: 'FDA',
    version: '4.0',
    description: 'Nonclinical ADME / toxicokinetic study report per ICH S3A/S3B.',
    module_number: '4',
    sectionCode: '4.2.2',
    granule_id: 'm4-2-2-pharmacokinetics',
    category: 'nonclinical',
    content: `MODULE 4.2.2 — PHARMACOKINETICS STUDY REPORT

STUDY TITLE: [STUDY_TITLE]
SPECIES: [SPECIES]   ROUTE: [ROUTE]

4.2.2.1 ANALYTICAL METHODS AND VALIDATION
[BIOANALYTICAL_METHOD]

4.2.2.2 ABSORPTION
Bioavailability, Cmax, Tmax, AUC: [ABSORPTION]

4.2.2.3 DISTRIBUTION
Vd, plasma protein binding, tissue distribution: [DISTRIBUTION]

4.2.2.4 METABOLISM
Metabolite profile, enzymes involved: [METABOLISM]

4.2.2.5 EXCRETION
Routes, half-life, clearance: [EXCRETION]

4.2.2.6 PHARMACOKINETIC DRUG INTERACTIONS
CYP inhibition/induction, transporters: [PK_INTERACTIONS]

CONCLUSION: [PK_CONCLUSION]`,
  },
  {
    id: 'tmpl-m4-2-3-toxicology',
    name: 'Module_4_2_3_Toxicology',
    title: 'Module 4.2.3 - Toxicology Study Report',
    template_name: 'Module 4.2.3 - Toxicology Study Report',
    region: 'FDA',
    version: '4.0',
    description: 'Nonclinical toxicology study report (single/repeat-dose, genotox, repro, carc) per ICH M3(R2)/S2(R1)/S5(R3).',
    module_number: '4',
    sectionCode: '4.2.3',
    granule_id: 'm4-2-3-toxicology',
    category: 'nonclinical',
    content: `MODULE 4.2.3 — TOXICOLOGY STUDY REPORT

STUDY TITLE: [STUDY_TITLE]
STUDY TYPE: [STUDY_TYPE]   SPECIES/STRAIN: [SPECIES]   DURATION: [DURATION]
GLP COMPLIANCE (21 CFR 58): [GLP_STATUS]
DOSE GROUPS: [DOSE_GROUPS]

KEY RESULTS
NOAEL: [NOAEL]    LOAEL: [LOAEL]    MTD: [MTD]
Target-organ findings: [TARGET_ORGAN_FINDINGS]
Adversity (adverse / adaptive / monitor): [ADVERSITY]
Reversibility (recovery cohort): [REVERSIBILITY]
Toxicokinetics (AUC/Cmax by dose): [TK_DATA]
Safety margin vs clinical exposure: [SAFETY_MARGIN]

GENOTOXICITY (if applicable, ICH S2(R1)): [GENOTOX]
REPRODUCTIVE/DEVELOPMENTAL (if applicable, ICH S5(R3)): [DART]

CONCLUSION: [TOX_CONCLUSION]`,
  },
  {
    id: 'tmpl-m2-6-nonclinical-summaries',
    name: 'Module_2_6_Nonclinical_Summaries',
    title: 'Module 2.6 - Nonclinical Written and Tabulated Summaries',
    template_name: 'Module 2.6 - Nonclinical Written and Tabulated Summaries',
    region: 'FDA',
    version: '4.0',
    description: 'Module 2.6 written and tabulated nonclinical summaries per ICH M4S.',
    module_number: '2',
    sectionCode: '2.6',
    granule_id: 'm2-6-nonclinical-summaries',
    category: 'nonclinical',
    content: `MODULE 2.6 — NONCLINICAL WRITTEN AND TABULATED SUMMARIES

2.6.1 INTRODUCTION
[INTRODUCTION]

2.6.2 PHARMACOLOGY WRITTEN SUMMARY
[PHARMACOLOGY_WRITTEN]

2.6.3 PHARMACOLOGY TABULATED SUMMARY
[PHARMACOLOGY_TABLE]

2.6.4 PHARMACOKINETICS WRITTEN SUMMARY
[PK_WRITTEN]

2.6.5 PHARMACOKINETICS TABULATED SUMMARY
[PK_TABLE]

2.6.6 TOXICOLOGY WRITTEN SUMMARY
[TOX_WRITTEN]

2.6.7 TOXICOLOGY TABULATED SUMMARY
[TOX_TABLE]`,
  },
  {
    id: 'tmpl-fih-dose-justification',
    name: 'FIH_Dose_Justification',
    title: 'First-in-Human Dose Justification',
    template_name: 'First-in-Human Dose Justification',
    region: 'FDA',
    version: '4.0',
    description: 'First-in-human starting-dose justification (NOAEL→HED→MRSD vs MABEL) per FDA 2005 MRSD guidance and the EMA MABEL approach.',
    module_number: '2',
    sectionCode: '2.4',
    granule_id: 'fih-dose-justification',
    category: 'nonclinical',
    content: `FIRST-IN-HUMAN DOSE JUSTIFICATION

PRODUCT: [DRUG_NAME]    INDICATION: [INDICATION]

1. MOST SENSITIVE SPECIES AND NOAEL
Species: [SPECIES]    NOAEL: [NOAEL_MG_KG] mg/kg/day    Study: [STUDY_REF]

2. HUMAN EQUIVALENT DOSE (HED) — FDA 2005 Km scaling
HED = NOAEL × (animal Km / human Km) = [HED_MG_KG] mg/kg

3. SAFETY FACTOR
Applied safety factor: [SAFETY_FACTOR]    Rationale: [SF_RATIONALE]

4. MAXIMUM RECOMMENDED STARTING DOSE (MRSD)
MRSD = HED / safety factor = [MRSD_MG_KG] mg/kg = [MRSD_TOTAL_MG] mg (60 kg)

5. MABEL (for pharmacologically high-risk molecules)
Basis: [MABEL_BASIS]    MABEL dose: [MABEL_MG] mg

6. RECOMMENDED STARTING DOSE
Selected dose: [RECOMMENDED_DOSE_MG] mg    Limited by: [LIMITED_BY]
Rationale: [DOSE_RATIONALE]`,
  },
];

const BY_GRANULE: Record<string, NonclinicalTemplate> = Object.fromEntries(
  nonclinicalTemplates.map(t => [t.granule_id, t]),
);
const BY_SECTION: Record<string, NonclinicalTemplate> = Object.fromEntries(
  nonclinicalTemplates.map(t => [t.sectionCode, t]),
);

/** Look up a nonclinical template by granule id or CTD section code. */
export function getNonclinicalTemplate(key: string): NonclinicalTemplate | undefined {
  return BY_GRANULE[key] ?? BY_SECTION[key];
}

/** List the available nonclinical templates (metadata only). */
export function listNonclinicalTemplates(): Array<Pick<NonclinicalTemplate, 'granule_id' | 'sectionCode' | 'title' | 'description'>> {
  return nonclinicalTemplates.map(t => ({
    granule_id: t.granule_id,
    sectionCode: t.sectionCode,
    title: t.title,
    description: t.description,
  }));
}
