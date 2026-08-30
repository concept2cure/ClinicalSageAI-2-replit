/**
 * Medical Device & IVD Regulatory — Reference Data & Citations
 * ============================================================================
 *
 * Pure knowledge entries backing `medical-device-knowledge.ts`: the consensus
 * standards table, the 21 CFR reference map, and the per-function citation
 * lists. NO logic lives here — only verbatim primary-source reference data, so
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
  '860.93': { key: '21 CFR 860.93', title: 'Reclassification / De Novo classification process' },
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

/** Citations backing `classifyDevice`. */
export const CLASSIFY_CITATIONS: Citation[] = [
  { source: '21 CFR 860.3', note: 'Defines Class I (general controls), Class II (special controls), Class III (premarket approval).' },
  { source: '21 CFR 860.7', note: 'Determination of safety and effectiveness; reasonable assurance standard.' },
  { source: 'EU MDR 2017/745 Annex VIII', note: 'Classification rules 1-22 for medical devices (Class I/IIa/IIb/III).' },
  { source: 'EU IVDR 2017/746 Annex VIII', note: 'Classification rules 1-7 for IVDs (Class A/B/C/D).' },
  { source: 'IMDRF N9 / Essential Principles', note: 'Globally harmonized risk-based classification framework.' },
];

/** Citations backing `selectDevicePathway`. */
export const PATHWAY_CITATIONS: Citation[] = [
  { source: '21 CFR 807.81', note: 'When a 510(k) premarket notification submission is required.' },
  { source: '21 CFR 807.100', note: 'FDA action on a 510(k): substantial equivalence (SE) vs not-SE (NSE).' },
  { source: '21 CFR 860.93', note: 'De Novo classification process for novel low/moderate-risk devices.' },
  { source: '21 CFR 814.20', note: 'PMA application content for Class III devices.' },
  { source: '21 CFR 814.104', note: 'Humanitarian Device Exemption (HDE) application.' },
  { source: 'FD&C Act §513(f)(2)', note: 'De Novo request statutory basis.' },
  { source: 'FD&C Act §515 / §520(m)', note: 'PMA and HDE statutory bases.' },
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
