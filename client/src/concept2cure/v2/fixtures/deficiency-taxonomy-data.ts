/** Deficiency taxonomy and draft-coverage gap analysis for Reviewer's Eye. */

export type DeficiencySeverity = 'critical' | 'major' | 'minor';
export type DeficiencyLikelihood = 'very_likely' | 'likely' | 'possible' | 'unlikely';
export type SubmissionType = 'ind' | 'nda' | 'bla' | '510k' | 'pma' | 'de_novo' | 'cer' | 'ectd' | 'general';
export type AgencyKey = 'fda' | 'ema' | 'pmda' | 'mhra' | 'health_canada' | 'swissmedic' | 'tga' | 'nmpa' | 'anvisa';
export type GapStatus = 'present' | 'weak' | 'missing';

export interface DeficiencyPattern {
  id: string;
  cat: string;
  sub: string;
  title: string;
  sev: DeficiencySeverity;
  lk: DeficiencyLikelihood;
  subs: SubmissionType[];
  ag: AgencyKey[];
  signal: string;
  mit: string;
}

export interface DeficiencyPatternResult extends DeficiencyPattern {
  status: GapStatus;
  matchRatio: number;
}

export interface DeficiencyGapResult {
  patterns: DeficiencyPatternResult[];
  total: number;
  present: number;
  weak: number;
  missing: number;
  completeness: number;
  criticalOpen: number;
}

export const DEFICIENCY_TAXONOMY: DeficiencyPattern[] = [
  { id: 'CLIN-001', cat: 'Clinical', sub: 'Efficacy', title: 'Inadequate Primary Endpoint Justification', sev: 'critical', lk: 'very_likely', subs: ['ind', 'nda', 'bla'], ag: ['fda', 'ema'], signal: 'The clinical relevance of the primary endpoint has not been adequately justified.', mit: 'Provide a systematic review of endpoint validation literature and regulatory precedent for endpoint acceptance.' },
  { id: 'CLIN-002', cat: 'Clinical', sub: 'Efficacy', title: 'Insufficient Evidence of Clinical Benefit', sev: 'critical', lk: 'likely', subs: ['nda', 'bla'], ag: ['fda', 'ema'], signal: 'The demonstrated effect size does not meet the threshold for clinical significance.', mit: 'Pre-specify clinically meaningful difference thresholds with clinical justification; add responder analyses.' },
  { id: 'CLIN-003', cat: 'Clinical', sub: 'Safety', title: 'Inadequate Safety Database', sev: 'critical', lk: 'likely', subs: ['nda', 'bla'], ag: ['fda', 'ema'], signal: 'The safety database does not meet ICH E1 exposure requirements.', mit: 'Ensure ICH E1 exposure thresholds are met (300/100/1500 rule); include an integrated safety summary.' },
  { id: 'CLIN-004', cat: 'Clinical', sub: 'Safety', title: 'Unresolved Safety Signal', sev: 'critical', lk: 'very_likely', subs: ['nda', 'bla', 'ind'], ag: ['fda', 'ema', 'pmda'], signal: 'The applicant has not adequately addressed the observed signal of [adverse event].', mit: 'Provide mechanistic analysis of the safety signal with dose-response and time-to-onset analyses.' },
  { id: 'STAT-001', cat: 'Statistical', sub: 'Design', title: 'Inadequate Statistical Analysis Plan', sev: 'major', lk: 'likely', subs: ['ind', 'nda', 'bla'], ag: ['fda', 'ema'], signal: 'The SAP does not adequately address the handling of missing data.', mit: 'Finalize the SAP before database lock; define estimands per ICH E9(R1) and pre-specify sensitivity analyses.' },
  { id: 'STAT-002', cat: 'Statistical', sub: 'Analysis', title: 'Multiplicity and Type I Error Concerns', sev: 'major', lk: 'likely', subs: ['nda', 'bla'], ag: ['fda', 'ema'], signal: 'The familywise type I error rate has not been adequately controlled.', mit: 'Implement a pre-specified hierarchical testing strategy; document alpha allocation across comparisons.' },
  { id: 'CMC-001', cat: 'CMC', sub: 'Manufacturing', title: 'Insufficient Process Validation', sev: 'critical', lk: 'likely', subs: ['nda', 'bla'], ag: ['fda', 'ema'], signal: 'Process validation data are insufficient to demonstrate control of critical process parameters.', mit: 'Provide commercial-scale process validation reports and process-capability analyses for critical quality attributes.' },
  { id: 'CMC-002', cat: 'CMC', sub: 'Quality', title: 'Inadequate Specification Justification', sev: 'major', lk: 'likely', subs: ['nda', 'bla'], ag: ['fda', 'ema'], signal: 'The proposed specification limits are not supported by sufficient batch data.', mit: 'Justify specifications using clinical, stability, and batch-analysis data (ICH Q6A/Q6B).' },
  { id: 'REG-001', cat: 'Regulatory', sub: 'Filing', title: 'Refuse to File — Incomplete Application', sev: 'critical', lk: 'possible', subs: ['nda', 'bla', '510k', 'pma'], ag: ['fda'], signal: 'The application does not contain sufficient information to permit a substantive review.', mit: 'Run an internal pre-filing completeness audit against 21 CFR 314.50 and eCTD validation tools.' },
  { id: 'REG-002', cat: 'Regulatory', sub: 'Labeling', title: 'Labeling Deficiencies', sev: 'major', lk: 'very_likely', subs: ['nda', 'bla'], ag: ['fda'], signal: 'The proposed labeling includes claims not supported by substantial evidence.', mit: 'Ensure every labeling claim is traceable to clinical data; follow PLR format requirements.' },
  { id: 'NC-001', cat: 'Nonclinical', sub: 'Toxicology', title: 'Insufficient Nonclinical Safety Package', sev: 'critical', lk: 'likely', subs: ['ind'], ag: ['fda', 'ema'], signal: 'The nonclinical safety package does not support the proposed duration of clinical dosing.', mit: 'Align the nonclinical program with ICH M3(R2) timing; justify species selection and provide NOAEL/MABEL dose basis.' },
  { id: 'DEV-001', cat: 'Device', sub: 'Predicate', title: 'Inadequate Predicate Device Comparison', sev: 'critical', lk: 'very_likely', subs: ['510k'], ag: ['fda'], signal: 'The applicant has not adequately demonstrated substantial equivalence to the predicate device.', mit: 'Provide a comprehensive feature-by-feature predicate comparison table addressing every technological difference.' },
  { id: 'DEV-002', cat: 'Device', sub: 'Performance', title: 'Insufficient Performance Testing', sev: 'major', lk: 'likely', subs: ['510k', 'pma', 'de_novo'], ag: ['fda'], signal: 'Biocompatibility testing is not complete per ISO 10993 requirements.', mit: 'Align testing with recognized consensus standards and complete the ISO 10993 biocompatibility evaluation.' },
  { id: 'CER-001', cat: 'CER', sub: 'Clinical Evaluation', title: 'Insufficient Clinical Evidence in CER', sev: 'critical', lk: 'very_likely', subs: ['cer'], ag: ['ema'], signal: 'The clinical data identified and appraised are insufficient to demonstrate conformity.', mit: 'Conduct a systematic literature review per MEDDEV 2.7/1 Rev 4 and include a PMCF plan for residual uncertainties.' },
  { id: 'PMA-001', cat: 'Device', sub: 'PMA Clinical', title: 'Insufficient PMA Clinical Evidence', sev: 'critical', lk: 'very_likely', subs: ['pma'], ag: ['fda'], signal: 'The clinical evidence does not provide reasonable assurance of safety and effectiveness.', mit: 'Design the pivotal study with FDA alignment via a pre-submission meeting; power it with statistical justification.' },
  { id: 'PMA-002', cat: 'Device', sub: 'PMA Manufacturing', title: 'Inadequate PMA Manufacturing Controls', sev: 'critical', lk: 'likely', subs: ['pma'], ag: ['fda'], signal: 'The applicant has not demonstrated adequate design controls per 21 CFR 820.', mit: 'Provide a complete design history file per 21 CFR 820.30 and process validation for all critical steps.' },
  { id: 'DNV-001', cat: 'Device', sub: 'De Novo Classification', title: 'Inadequate Risk-Benefit Profile for De Novo', sev: 'critical', lk: 'very_likely', subs: ['de_novo'], ag: ['fda'], signal: 'The identified risks are not adequately mitigated by the proposed special controls.', mit: 'Enumerate all identified risks with corresponding special controls; map risks to controls per ISO 14971.' },
  { id: 'DNV-002', cat: 'Device', sub: 'De Novo Evidence', title: 'Insufficient Performance Data for Novel Device', sev: 'major', lk: 'likely', subs: ['de_novo'], ag: ['fda'], signal: 'The bench testing does not adequately characterize the novel technology.', mit: 'Develop a comprehensive bench-testing protocol aligned with recognized standards; add human-factors data.' },
  { id: 'CER-002', cat: 'CER', sub: 'Equivalence', title: 'Inadequate Equivalence Demonstration', sev: 'critical', lk: 'very_likely', subs: ['cer'], ag: ['ema'], signal: 'The equivalence demonstration does not address all three dimensions (technical, biological, clinical).', mit: 'Demonstrate equivalence across all three dimensions per MEDDEV 2.7/1 Rev 4 with data-access evidence.' },
  { id: 'CER-003', cat: 'CER', sub: 'PMCF', title: 'Insufficient PMCF Plan', sev: 'major', lk: 'likely', subs: ['cer'], ag: ['ema'], signal: 'The PMCF plan does not adequately address the identified residual risks.', mit: 'Design the PMCF study to address every residual risk with endpoints, sample size and follow-up duration (MDCG 2020-7/8).' },
  { id: 'DOC-001', cat: 'Document Quality', sub: 'Writing', title: 'Poor Narrative Quality', sev: 'major', lk: 'likely', subs: ['ind', 'nda', 'bla', '510k', 'pma', 'cer'], ag: ['fda', 'ema', 'pmda'], signal: 'The benefit-risk discussion does not clearly articulate the clinical significance.', mit: 'Develop a clear narrative arc: problem → evidence → conclusion → benefit-risk; ensure cross-module consistency.' },
  { id: 'GLOBAL-001', cat: 'Global', sub: 'Multi-Regional Trials', title: 'Regional Consistency of MRCT Results Not Demonstrated', sev: 'major', lk: 'likely', subs: ['nda', 'bla', 'ind'], ag: ['pmda', 'nmpa', 'ema', 'fda'], signal: 'The applicant has not demonstrated consistency of the treatment effect in the [region] subpopulation.', mit: 'Pre-specify a regional consistency assessment per ICH E17 and size the regional subpopulation to support it.' },
  { id: 'GLOBAL-002', cat: 'Global', sub: 'Foreign Data Acceptability', title: 'Ethnic-Factor / Bridging Strategy Absent for Foreign Data', sev: 'major', lk: 'likely', subs: ['nda', 'bla'], ag: ['pmda', 'nmpa'], signal: 'The applicability of the foreign clinical data to the [region] population has not been justified.', mit: 'Provide an ICH E5 ethnic-factor analysis (intrinsic and extrinsic); add a bridging study where needed.' },
  { id: 'CMC-NITROSAMINE-001', cat: 'CMC', sub: 'Mutagenic Impurities', title: 'Nitrosamine / Mutagenic-Impurity Risk Assessment Missing or Incomplete', sev: 'critical', lk: 'very_likely', subs: ['nda', 'bla', 'ectd'], ag: ['fda', 'ema', 'mhra', 'health_canada', 'swissmedic', 'pmda'], signal: 'A risk evaluation for the presence of N-nitrosamine impurities has not been provided.', mit: 'Perform a nitrosamine risk assessment across API, excipients and process; apply the ICH M7 TTC/(Q)SAR framework.' },
  { id: 'GMP-CERT-001', cat: 'CMC', sub: 'GMP / Inspection', title: 'GMP Certification / Inspection Readiness Not Established', sev: 'critical', lk: 'likely', subs: ['nda', 'bla', 'general'], ag: ['anvisa', 'nmpa', 'health_canada', 'tga'], signal: 'A valid GMP certificate for the proposed manufacturing site has not been provided.', mit: 'Initiate GMP certification / inspection scheduling early; leverage MRA / reliance agreements where recognised.' },
  { id: 'PV-RMP-001', cat: 'Pharmacovigilance', sub: 'Risk Management', title: 'Risk Management Plan / Pharmacovigilance Plan Inadequate', sev: 'major', lk: 'likely', subs: ['nda', 'bla'], ag: ['ema', 'mhra', 'health_canada', 'tga', 'swissmedic'], signal: 'The safety specification does not adequately reflect the important risks of the product.', mit: 'Build the safety specification and PV plan per ICH E2E; tie each important risk to a proportionate activity.' },
  { id: 'LABEL-LOCAL-001', cat: 'Labeling', sub: 'Regional Labeling', title: 'Country-Specific Labeling / Language Requirements Not Met', sev: 'major', lk: 'likely', subs: ['nda', 'bla', 'general'], ag: ['health_canada', 'swissmedic', 'pmda', 'anvisa'], signal: 'The product information does not conform to the required [region] template.', mit: 'Map labeling to each region’s product-information template early; plan certified translations and bilingual layouts.' },
];

export const DEF_AGENCY_KEY: Record<string, AgencyKey> = {
  FDA: 'fda', EMA: 'ema', PMDA: 'pmda', MHRA: 'mhra',
  'Health Canada': 'health_canada', Swissmedic: 'swissmedic',
  TGA: 'tga', NMPA: 'nmpa', ANVISA: 'anvisa',
};

const DEF_STOP = new Set(
  'the a an is are was were be been being have has had do does did will would could should may might shall can for and nor but or yet so at by in of on to up with that this it its from as if not no all'.split(' '),
);

function defKeywords(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !DEF_STOP.has(w));
}

export function c2cDeficiencyGaps(
  text: string,
  subType: SubmissionType,
  agency: string,
): DeficiencyGapResult {
  const contentLower = String(text || '').toLowerCase();
  const agKey: AgencyKey = (DEF_AGENCY_KEY[agency] || String(agency || 'fda').toLowerCase()) as AgencyKey;
  const relevant = DEFICIENCY_TAXONOMY.filter(
    (d) => d.subs.includes(subType) && d.ag.includes(agKey),
  );
  const patterns: DeficiencyPatternResult[] = relevant.map((d) => {
    const checkText = `${d.id}: ${d.title} (${d.sev}) — ${d.mit}`;
    const keywords = defKeywords(checkText);
    const matchCount = keywords.filter((kw) => contentLower.includes(kw)).length;
    const matchRatio = keywords.length > 0 ? matchCount / keywords.length : 0;
    const status: GapStatus =
      matchRatio >= 0.5 ? 'present' : matchRatio > 0 ? 'weak' : 'missing';
    return { ...d, status, matchRatio };
  });
  const total = patterns.length;
  const present = patterns.filter((p) => p.status === 'present').length;
  const weak = patterns.filter((p) => p.status === 'weak').length;
  const missing = patterns.filter((p) => p.status === 'missing').length;
  const completeness =
    total > 0 ? Math.round(((present + weak * 0.5) / total) * 100) : 100;
  const sevR: Record<string, number> = { critical: 0, major: 1, minor: 2 };
  const lkR: Record<string, number> = { very_likely: 0, likely: 1, possible: 2, unlikely: 3 };
  const stR: Record<string, number> = { missing: 0, weak: 1, present: 2 };
  patterns.sort(
    (a, b) =>
      (stR[a.status] - stR[b.status]) ||
      (sevR[a.sev] - sevR[b.sev]) ||
      (lkR[a.lk] - lkR[b.lk]),
  );
  return {
    patterns,
    total,
    present,
    weak,
    missing,
    completeness,
    criticalOpen: patterns.filter((p) => p.sev === 'critical' && p.status !== 'present').length,
  };
}
