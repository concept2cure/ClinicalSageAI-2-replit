/**
 * Medical Device & IVD Regulatory — Reference Data & Citations
 * ============================================================================
 *
 * Pure knowledge entries backing `medical-device-knowledge.ts`: the consensus
 * standards table, the 21 CFR reference map, the per-function citation lists,
 * and the fixed entries the engine selects from: study types, performance
 * data, PMA modules, non-eSTAR and EU technical-documentation sections, the
 * MDR Class I aspects and the SE open steps (moved here 2026-11-08 to bring the
 * engine under the size ceiling). NO logic lives here — only reference data, so
 * the deterministic engine next door stays auditable and this table stays
 * reviewable on its own.
 *
 * Same grounding as the engine module (see its header for the full source
 * list): 21 CFR Parts 807/812/814/860, EU MDR 2017/745, EU IVDR 2017/746,
 * MEDDEV 2.7/1 rev 4, FDA program guidances, and the ISO/IEC/IMDRF consensus
 * standards catalog.
 *
 * @module server/services/medical-device/medical-device-knowledge-data
 */

/** A regulatory citation reference. */
export interface Citation {
  /** Short source key, e.g. "21 CFR 807.92". */
  source: string;
  /** Human-readable description of what the citation supports. */
  note: string;
  /** Regulator-hosted URL the statement was checked against (a currency fact's `sourceUrl`). */
  url?: string;
  /** currency-registry fact id when a date in the statement is read from that fact. */
  factId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Reference data tables — explicit element interfaces, NO `as const`.
// ────────────────────────────────────────────────────────────────────────────

export interface StandardRef {
  id: string;
  title: string;
  scope: string;
  jurisdiction: 'US' | 'EU' | 'international';
}

/** Harmonized / consensus standards frequently cited in device submissions. */
export const STANDARDS: StandardRef[] = [
  {
    id: 'ISO 13485:2016',
    title: 'Medical devices — Quality management systems — Requirements for regulatory purposes',
    scope: 'Quality management system (QMS) across the device life cycle.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 14971:2019',
    title: 'Medical devices — Application of risk management to medical devices',
    scope: 'Risk management process; risk/benefit and overall residual risk acceptability.',
    jurisdiction: 'international',
  },
  {
    id: 'IEC 62304:2006+A1:2015',
    title: 'Medical device software — Software life cycle processes',
    scope: 'Software life-cycle for software in a medical device and SaMD; safety classes A/B/C.',
    jurisdiction: 'international',
  },
  {
    id: 'IEC 60601-1:2005+A1+A2',
    title: 'Medical electrical equipment — Part 1: General requirements for basic safety and essential performance',
    scope: 'Basic safety and essential performance of medical electrical equipment.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 10993-1:2018',
    title: 'Biological evaluation of medical devices — Part 1: Evaluation and testing within a risk management process',
    scope: 'Biocompatibility evaluation driven by nature/duration of body contact.',
    jurisdiction: 'international',
  },
  {
    id: 'IEC 62366-1:2015+A1:2020',
    title: 'Medical devices — Part 1: Application of usability engineering to medical devices',
    scope: 'Usability/human-factors engineering process and use-related risk control.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 11135:2014',
    title: 'Sterilization of health-care products — Ethylene oxide',
    scope: 'Validation and routine control of EO sterilization.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 11137 (series)',
    title: 'Sterilization of health-care products — Radiation',
    scope: 'Validation and routine control of radiation sterilization.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 11607 (series)',
    title: 'Packaging for terminally sterilized medical devices',
    scope: 'Sterile barrier system materials, design, and validation.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 15223-1:2021',
    title: 'Medical devices — Symbols to be used with information to be supplied by the manufacturer',
    scope: 'Labeling symbols.',
    jurisdiction: 'international',
  },
  {
    id: 'ISO 20916:2019',
    title: 'In vitro diagnostic medical devices — Clinical performance studies using specimens from human subjects',
    scope: 'Good study practice for IVD clinical performance studies.',
    jurisdiction: 'international',
  },
  {
    id: 'CLSI EP-series',
    title: 'CLSI evaluation protocols (EP05, EP06, EP09, EP12, EP17, EP25, EP28)',
    scope: 'IVD analytical performance: precision, linearity, method comparison, detection limit, reference intervals.',
    jurisdiction: 'US',
  },
];

export interface CfrRef {
  key: string;
  title: string;
}

export const CFR: Record<string, CfrRef> = {
  '860.3': { key: '21 CFR 860.3', title: 'Definitions (Class I/II/III)' },
  '860.7': { key: '21 CFR 860.7', title: 'Determination of safety and effectiveness' },
  /* 2026-10-05: this entry was keyed '860.93' and titled "Reclassification / De
     Novo classification process". 21 CFR 860.93 is "Classification of implants,
     life-supporting or life-sustaining devices". De Novo is Subpart D. */
  '860-D': { key: '21 CFR 860 Subpart D (860.200-860.260; content 860.220)', title: 'De Novo classification' },
  '807.81': { key: '21 CFR 807.81', title: 'When a premarket notification submission is required' },
  '807.87': { key: '21 CFR 807.87', title: 'Information required in a premarket notification submission' },
  '807.92': { key: '21 CFR 807.92', title: '510(k) summary content' },
  '807.100': { key: '21 CFR 807.100', title: 'FDA action on a 510(k) — SE/NSE determination' },
  '814.20': { key: '21 CFR 814.20', title: 'PMA application content' },
  '814.104': { key: '21 CFR 814.104', title: 'HDE application' },
  '812.20': { key: '21 CFR 812.20', title: 'IDE application' },
  '812.3': { key: '21 CFR 812.3(m)', title: 'Significant risk device definition' },
};

// ────────────────────────────────────────────────────────────────────────────
// Per-function citation lists — one list per engine entry point.
// ────────────────────────────────────────────────────────────────────────────

/* 2026-10-15: CLASSIFY_CITATIONS backed classifyDevice, which is deleted (see
   medical-device-knowledge.ts); classification cites its rules per row in
   market-specs/device-classification.ts. */

/** Citations backing `selectDevicePathway`. */
export const PATHWAY_CITATIONS: Citation[] = [
  { source: '21 CFR 807.81', note: 'When a 510(k) premarket notification submission is required.' },
  { source: '21 CFR 807.100', note: 'FDA action on a 510(k): substantial equivalence (SE) vs not-SE (NSE).' },
  { source: '21 CFR 860 Subpart D (860.200-860.260; content 860.220)', note: 'De Novo classification into class I or II for a device with no legally marketed predicate.' },
  { source: '21 CFR 814.20', note: 'PMA application content for Class III devices.' },
  { source: '21 CFR 814.104', note: 'Humanitarian Device Exemption (HDE) application.' },
  { source: 'FD&C Act §513(f)(1) / §513(f)(2)', note: 'A device of a new type is class III by operation of 513(f)(1); 513(f)(2) is the De Novo request.' },
  { source: '21 CFR 862.9-892.9', note: 'Limitations of 510(k) exemption, per classification panel; reserved class I devices need a 510(k).' },
  { source: 'FD&C Act §513(g)', note: 'Request for FDA\'s view of a device\'s classification and applicable requirements.' },
  { source: 'FD&C Act §515 / §520(m)', note: 'PMA and HDE statutory bases; a HUD serves not more than 8,000 individuals in the US per year.' },
];

/** Citations backing `assessSubstantialEquivalence`. */
export const SE_CITATIONS: Citation[] = [
  { source: '21 CFR 807.100(b)', note: 'Substantial-equivalence criteria: same intended use; same technological characteristics, or different characteristics that do not raise different questions of safety/effectiveness and are shown to be as safe and effective.' },
  { source: 'FDA 510(k) Program Guidance (2014)', note: 'Six-step SE decision-making flowchart for premarket notifications.' },
  { source: '21 CFR 807.92', note: '510(k) summary content including SE comparison.' },
  { source: '21 CFR 807.87', note: 'Information required in a 510(k) submission.' },
];

/** Citations backing `designDeviceClinicalEvidence`. */
export const CLINICAL_CITATIONS: Citation[] = [
  { source: '21 CFR 814.20(b)(6)', note: 'PMA must contain valid scientific evidence of safety and effectiveness.' },
  { source: '21 CFR 860.7', note: 'Valid scientific evidence; reasonable assurance standard.' },
  { source: '21 CFR 812', note: 'Investigational Device Exemption for clinical investigations of significant-risk devices.' },
  { source: 'EU MDR 2017/745 Article 61 & Annex XIV', note: 'Clinical evaluation and clinical investigations (PMCF).' },
  { source: 'MEDDEV 2.7/1 rev 4', note: 'Clinical evaluation methodology (literature route, equivalence, gap analysis).' },
  { source: 'EU IVDR 2017/746 Annex XIII', note: 'Performance evaluation: scientific validity, analytical and clinical performance.' },
  { source: 'FDA RWE for Devices Guidance (2017)', note: 'Use of real-world evidence to support device decisions.' },
];

/** Citations backing `assessEssentialPrinciples`. */
export const GSPR_CITATIONS: Citation[] = [
  { source: 'EU MDR 2017/745 Annex I', note: 'General Safety and Performance Requirements (GSPR) for medical devices.' },
  { source: 'EU IVDR 2017/746 Annex I', note: 'General Safety and Performance Requirements (GSPR) for IVDs.' },
  { source: 'IMDRF Essential Principles', note: 'Globally harmonized essential principles of safety and performance.' },
  { source: 'ISO 14971:2019', note: 'Risk management — foundational to GSPR Chapter I.' },
  { source: 'ISO 13485:2016', note: 'Quality management system supporting GSPR conformity.' },
];

/** Citations backing `planDeviceSubmission`. */
export const SUBMISSION_CITATIONS: Citation[] = [
  { source: '21 CFR 807.87', note: 'Required content of a 510(k) premarket notification.' },
  { source: '21 CFR 814.20', note: 'Required content/modules of a PMA application.' },
  { source: 'FDA eSTAR Program', note: 'Electronic submission template for 510(k)/De Novo (and IVD).' },
  { source: 'FDA Q-Submission Program Guidance (2023)', note: 'Pre-Submission strategy.' },
  { source: 'EU MDR Annex II/III', note: 'Technical documentation and post-market surveillance documentation.' },
  { source: 'IMDRF ToC', note: 'Harmonized non-IVD/IVD table of contents for submissions.' },
];

// ────────────────────────────────────────────────────────────────────────────
// Fixed entries the engine selects from (moved from the engine, 2026-11-08).
// ────────────────────────────────────────────────────────────────────────────

/** A determinate finding with severity for gap/requirement reporting. */
export interface Finding {
  id: string;
  severity: 'info' | 'recommendation' | 'requirement' | 'critical';
  statement: string;
  citation?: Citation;
}

export interface ClinicalStudyRecommendation {
  studyType: 'none (non-clinical sufficient)' | 'literature/clinical evaluation' | 'real-world evidence' | 'feasibility (first-in-human)' | 'pivotal' | 'IVD clinical performance';
  rationale: string;
  designNotes: string;
  citation: Citation;
}

/** The study types `designDeviceClinicalEvidence` recommends, by the fact that selects each. */
export const CLINICAL_STUDIES: Record<'feasibility' | 'ivd' | 'pivotal' | 'none' | 'literature' | 'rwe', ClinicalStudyRecommendation> = {
  feasibility: {
    studyType: 'feasibility (first-in-human)',
    rationale:
      'A small early feasibility / first-in-human study confirms basic safety, refines the device and the ' +
      'procedure, and informs the pivotal design before committing to the confirmatory trial.',
    designNotes:
      'Limited enrollment (commonly 10-30 subjects), often a single arm with safety endpoints and exploratory ' +
      'effectiveness; in the US this is a significant-risk study requiring an approved IDE (21 CFR 812). FDA ' +
      'Early Feasibility Study (EFS) program may apply.',
    citation: { source: 'FDA Early Feasibility Study Guidance', note: 'EFS / first-in-human device studies.' },
  },
  ivd: {
    studyType: 'IVD clinical performance',
    rationale:
      'For an IVD, the pivotal evidence is a clinical performance study establishing diagnostic accuracy ' +
      '(sensitivity, specificity, predictive values) against a clinical reference/comparator.',
    designNotes:
      'Define the intended-use population, comparator/reference method, and clinical decision thresholds; ' +
      'power for the primary accuracy estimate with acceptable confidence-interval width. Follow ISO 20916.',
    citation: { source: 'ISO 20916:2019 / EU IVDR Annex XIII', note: 'IVD clinical performance study.' },
  },
  pivotal: {
    studyType: 'pivotal',
    rationale:
      'A pivotal (confirmatory) clinical investigation provides the primary valid scientific evidence of a ' +
      'reasonable assurance of safety and effectiveness for the labeled indication.',
    designNotes:
      'Prospective, hypothesis-testing; randomized/controlled where feasible (or a justified objective ' +
      'performance criterion / performance goal). Pre-specify the primary endpoint, success criteria, sample ' +
      'size, and statistical analysis plan; for US significant-risk studies an approved IDE is required.',
    citation: { source: '21 CFR 814.20(b)(6) / 21 CFR 812', note: 'Pivotal clinical evidence under IDE.' },
  },
  none: {
    studyType: 'none (non-clinical sufficient)',
    rationale:
      'Non-clinical performance testing is expected to support the submission; a dedicated clinical trial is ' +
      'not anticipated for this pathway/risk profile.',
    designNotes:
      'Compile bench performance, biocompatibility, sterility, electrical safety/EMC, software V&V, and human ' +
      'factors as applicable; document any reliance on recognized consensus standards.',
    citation: { source: 'FDA 510(k) Program Guidance (2014)', note: 'Most 510(k)s rely on non-clinical data.' },
  },
  literature: {
    studyType: 'literature/clinical evaluation',
    rationale:
      'A systematic literature review can support (or substitute for) primary data where a well-characterized ' +
      'device type and indication have substantial published evidence, particularly via the equivalence route ' +
      'in the EU.',
    designNotes:
      'Pre-specify search strategy, appraisal, and weighting (MEDDEV 2.7/1 rev 4); demonstrate device equivalence ' +
      '(technical, biological, clinical) if relying on third-party data.',
    citation: { source: 'MEDDEV 2.7/1 rev 4', note: 'Literature route for clinical evaluation.' },
  },
  rwe: {
    studyType: 'real-world evidence',
    rationale:
      'Fit-for-purpose real-world data (registries, EHR, claims) can generate real-world evidence to support ' +
      'expanded indications, post-market study commitments, or, in select cases, premarket decisions.',
    designNotes:
      'Assess data relevance and reliability (completeness, provenance, accuracy); pre-specify the analysis to ' +
      'control bias and confounding. RWE supports PMCF/post-market surveillance in the EU.',
    citation: { source: 'FDA RWE for Devices Guidance (2017)', note: 'Real-world evidence to support regulatory decisions.' },
  },
};

/** The evidence hierarchy `designDeviceClinicalEvidence` returns, in order. */
export const EVIDENCE_HIERARCHY: string[] = [
  '1. Risk analysis (ISO 14971) identifying clinical questions to be answered.',
  '2. Non-clinical evidence (bench, biocompatibility, sterility, software V&V, animal where applicable).',
  '3. Systematic literature review / clinical evaluation of the device type and indication.',
  '4. Feasibility / first-in-human data (if novel or high-risk).',
  '5. Pivotal clinical investigation (or IVD clinical performance study) for confirmatory evidence.',
  '6. Real-world evidence and post-market follow-up (PMCF/PMPF) for the total product life cycle.',
];

/** The performance data `assessSubstantialEquivalence` lists: bench always, the others by device property. */
export const SE_PERFORMANCE_DATA: Record<'bench' | 'patientContacting' | 'sterile' | 'hasSoftware' | 'isIVD', Finding> = {
  bench: {
    id: 'PERF-BENCH',
    severity: 'requirement',
    statement:
      'Non-clinical bench performance testing comparing the subject device to the predicate against the same ' +
      'design specifications and recognized consensus standards.',
    citation: { source: '21 CFR 807.87', note: '510(k) content — performance data.' },
  },
  patientContacting: {
    id: 'PERF-BIOCOMPAT',
    severity: 'requirement',
    statement: 'Biocompatibility evaluation per ISO 10993-1, scoped to the nature and duration of body contact.',
    citation: { source: 'ISO 10993-1:2018', note: 'Biological evaluation of medical devices.' },
  },
  sterile: {
    id: 'PERF-STERILE',
    severity: 'requirement',
    statement: 'Sterilization validation (ISO 11135 / ISO 11137), packaging/sterile-barrier (ISO 11607), and shelf-life data.',
    citation: { source: 'ISO 11135 / ISO 11137 / ISO 11607', note: 'Sterility and packaging validation.' },
  },
  hasSoftware: {
    id: 'PERF-SOFTWARE',
    severity: 'requirement',
    statement:
      'Software documentation per FDA Premarket Software guidance (documentation level), verification & ' +
      'validation, and cybersecurity documentation (SBOM, threat model).',
    citation: { source: 'FDA Premarket Software / Cybersecurity Guidance', note: 'Software in a 510(k).' },
  },
  isIVD: {
    id: 'PERF-IVD',
    severity: 'requirement',
    statement:
      'IVD analytical performance (precision, linearity, detection limit, interference, method comparison per ' +
      'CLSI EP protocols) and, where claims require, clinical performance (sensitivity/specificity, PPV/NPV).',
    citation: { source: 'CLSI EP-series', note: 'IVD analytical/clinical performance.' },
  },
};

export interface SubmissionSection {
  sectionId: string;
  title: string;
  contents: string;
  citation: Citation;
}

/** The PMA modules `planDeviceSubmission` lists for PMA and IDE-then-PMA. */
export const PMA_SECTIONS: SubmissionSection[] = [
  {
    sectionId: 'pma-summary',
    title: 'PMA Summary & Indications',
    contents: 'Summary of safety and effectiveness, indications for use, and device description.',
    citation: { source: '21 CFR 814.20(b)(3)', note: 'PMA summary.' },
  },
  {
    sectionId: 'pma-nonclinical',
    title: 'Non-Clinical Laboratory Studies (Module)',
    contents:
      'Bench, biocompatibility, sterility, shelf-life, software, electrical safety/EMC, and animal studies (with ' +
      'GLP statements per 21 CFR 58).',
    citation: { source: '21 CFR 814.20(b)(6)(i)', note: 'Non-clinical studies module.' },
  },
  {
    sectionId: 'pma-clinical',
    title: 'Clinical Investigations (Module)',
    contents:
      'Pivotal clinical study report(s), protocols, statistical analyses, and safety/effectiveness results ' +
      'constituting the valid scientific evidence.',
    citation: { source: '21 CFR 814.20(b)(6)(ii)', note: 'Clinical investigations module.' },
  },
  {
    sectionId: 'pma-manufacturing',
    title: 'Manufacturing Information (Module)',
    contents: 'Manufacturing methods, facilities, and QSR/QMSR controls (supports the PMA preapproval inspection).',
    citation: { source: '21 CFR 814.20(b)(4)', note: 'Manufacturing information.' },
  },
  {
    sectionId: 'pma-benefit-risk',
    title: 'Benefit-Risk & Labeling',
    contents: 'Benefit-risk determination and proposed labeling/IFU.',
    citation: { source: 'FDA Benefit-Risk Factors Guidance (2019)', note: 'Benefit-risk for PMA.' },
  },
];

/**
 * The administrative section of a non-eSTAR US filing. The form differs by
 * pathway, so it is stated per pathway rather than assumed:
 *   HDE  — the CDRH Premarket Review Submission Cover Sheet (FDA 3514) and an
 *          eCopy; no MDUFA user fee (HDE applications are fee-exempt).
 *   BLA  — Form FDA 356h, the BLA's own application form and cover sheet.
 *   other (an undetermined pathway) — no form is named; it depends on the pathway.
 */
export const NON_ESTAR_ADMIN: Record<'HDE' | 'BLA' | 'other', SubmissionSection> = {
  HDE: {
    sectionId: 'admin',
    title: 'Administrative / Cover Letter and CDRH Premarket Review Submission Cover Sheet',
    contents:
      'Cover letter, CDRH Premarket Review Submission Cover Sheet (Form FDA 3514), applicant/contact info, and ' +
      'the eCopy. HDE applications are exempt from MDUFA user fees.',
    citation: { source: '21 CFR 814.104; FD&C Act §745A(b) (eCopy); FD&C Act §738(a)(2)(B)', note: 'HDE administrative content.' },
  },
  BLA: {
    sectionId: 'admin',
    title: 'Administrative / Cover Letter and Form FDA 356h',
    contents:
      'Cover letter, Form FDA 356h (the application form and cover sheet for a BLA), applicant/contact and ' +
      'establishment information, and user-fee payment confirmation.',
    citation: { source: '21 CFR 601.2', note: 'BLA application form.' },
  },
  other: {
    sectionId: 'admin',
    title: 'Administrative / Cover Letter',
    contents:
      'Cover letter and applicant/contact info. The application form depends on the pathway: a 510(k) or De Novo ' +
      'is an eSTAR, which carries the cover-sheet data; an HDE or PMA uses the CDRH cover sheet (FDA 3514); a BLA ' +
      'uses Form FDA 356h. Determine the pathway first.',
    citation: { source: 'FDA eSTAR Program', note: 'Administrative content depends on the pathway.' },
  },
};

/** The sections every non-eSTAR plan (HDE, BLA, undetermined) carries after the administrative one. */
export const NON_ESTAR_SECTIONS: SubmissionSection[] = [
  {
    sectionId: 'iface',
    title: 'Indications for Use & Device Description',
    contents:
      'Indications-for-use statement (Form FDA 3881), device description, principles of operation, components, ' +
      'and proposed labeling/IFU.',
    citation: { source: '21 CFR 807.87(e)-(f)', note: 'Device description and labeling.' },
  },
  {
    sectionId: 'risk',
    title: 'Risk Management',
    contents: 'ISO 14971 risk management summary/file (hazard analysis, risk controls, residual-risk evaluation).',
    citation: { source: 'ISO 14971:2019', note: 'Risk management.' },
  },
  {
    sectionId: 'bench',
    title: 'Non-Clinical / Bench Performance Testing',
    contents:
      'Performance bench testing per design specifications and recognized consensus standards; declarations of ' +
      'conformity to standards as applicable.',
    citation: { source: '21 CFR 807.87(g)', note: 'Performance data.' },
  },
];

/** The EU technical documentation sections; `source` is appended to the regulation's name ('MDR', 'IVDR' or 'MDR or IVDR'). */
export const EU_TECHNICAL_DOCUMENTATION: Array<{ sectionId: string; title: string; contents: string; source: string; note: string }> = [
  {
    sectionId: 'eu-description',
    title: 'Device Description & Specification',
    contents: 'Device description, variants/accessories, intended purpose, intended users/patients, and prior generations.',
    source: ' Annex II/III §1',
    note: 'Device description and specification.',
  },
  {
    sectionId: 'eu-labeling',
    title: 'Information Supplied by the Manufacturer (Label & IFU)',
    contents: 'Labels, IFU, and packaging in required languages; UDI assignment.',
    source: ' Annex II/III §2',
    note: 'Labeling and instructions for use.',
  },
  {
    sectionId: 'eu-design',
    title: 'Design & Manufacturing Information',
    contents: 'Design stages, manufacturing processes, and sites; supplier/subcontractor controls.',
    source: ' Annex II/III §3',
    note: 'Design and manufacturing information.',
  },
  {
    sectionId: 'eu-gspr',
    title: 'GSPR Conformity Checklist',
    contents:
      'General Safety and Performance Requirements checklist mapping each applicable requirement to the ' +
      'standards/evidence demonstrating conformity (see assessEssentialPrinciples).',
    source: ' Annex I',
    note: 'GSPR conformity demonstration.',
  },
  {
    sectionId: 'eu-riskbenefit',
    title: 'Benefit-Risk Analysis & Risk Management',
    contents: 'ISO 14971 risk management file and the overall benefit-risk determination.',
    source: ' Annex I §1-8',
    note: 'Risk management and benefit-risk.',
  },
  {
    sectionId: 'eu-verification',
    title: 'Product Verification & Validation',
    // The engine completes this with the IVD or non-IVD evaluation it plans.
    contents: 'Pre-clinical/bench data, biocompatibility, sterility, software, electrical safety, and ',
    source: ' Annex II/III §6',
    note: 'Verification and validation.',
  },
  {
    sectionId: 'eu-pms',
    title: 'Post-Market Surveillance Documentation',
    contents:
      'PMS plan, PSUR (Class IIa/IIb/III) or PMS report (Class I), PMCF/PMPF plan, and trend/vigilance reporting.',
    source: ' Annex III',
    note: 'Post-market surveillance documentation.',
  },
];

/** The aspect a notified body assesses for a declared MDR Class Is, Im or Ir device. */
export const MDR_CLASS_I_ASPECT: Readonly<Record<'Is' | 'Im' | 'Ir', string>> = {
  Is: 'sterility (establishing, securing and maintaining sterile conditions)',
  Im: 'metrology (conformity with the metrological requirements)',
  Ir: 'reprocessing (cleaning, disinfection, sterilisation, maintenance and functional testing for reuse)',
};

/** What the open steps of `assessSubstantialEquivalence` (1, 4 and 5) ask, for a rationale that names them. */
export const SE_OPEN_STEP: Readonly<Record<string, string>> = {
  predicateRecalledForSafety: 'whether the predicate was removed from the market for safety reasons',
  differentQuestionsOfSafetyEffectiveness:
    'whether the different technological characteristics raise different questions of safety and effectiveness',
  performanceDataDemonstratesEquivalence:
    'whether the performance data show the device is as safe and effective as the predicate',
};

/** The IVD performance section of a non-eSTAR or De Novo plan. */
export const IVD_PERFORMANCE_SECTION: SubmissionSection = {
  sectionId: 'ivd-perf',
  title: 'IVD Analytical & Clinical Performance',
  contents:
    'Analytical performance (precision, linearity, LoD/LoQ, interference, method comparison per CLSI EP) and ' +
    'clinical performance (sensitivity/specificity, predictive values) with reference/comparator method.',
  citation: { source: 'CLSI EP-series / ISO 20916', note: 'IVD performance.' },
};

/** The sections a non-eSTAR plan carries when their device fact is true, undetermined while it is unstated. */
export const NON_ESTAR_CONDITIONAL: Array<{
  fact: 'patientContacting' | 'sterile' | 'hasSoftware' | 'isIVD';
  condition: string;
  section: SubmissionSection;
}> = [
  {
    fact: 'patientContacting',
    condition: 'the device contacts the patient',
    section: {
      sectionId: 'biocompat',
      title: 'Biocompatibility',
      contents: 'ISO 10993-1 biological evaluation plan/report scoped to contact type and duration.',
      citation: { source: 'ISO 10993-1:2018', note: 'Biological evaluation.' },
    },
  },
  {
    fact: 'sterile',
    condition: 'the device is supplied sterile',
    section: {
      sectionId: 'sterile',
      title: 'Sterilization, Shelf Life & Packaging',
      contents: 'Sterilization method and validation (ISO 11135/11137), sterile barrier (ISO 11607), shelf-life/aging.',
      citation: { source: 'ISO 11135 / ISO 11137 / ISO 11607', note: 'Sterility and packaging.' },
    },
  },
  {
    fact: 'hasSoftware',
    condition: 'the device contains software',
    section: {
      sectionId: 'software',
      title: 'Software & Cybersecurity',
      contents:
        'Software documentation per FDA Premarket Software guidance (documentation level), IEC 62304 life-cycle ' +
        'artifacts, V&V, and cybersecurity (threat model, SBOM, IEC 81001-5-1).',
      citation: { source: 'FDA Premarket Software / Cybersecurity Guidance', note: 'Software documentation.' },
    },
  },
  { fact: 'isIVD', condition: 'the device is an IVD', section: IVD_PERFORMANCE_SECTION },
];
