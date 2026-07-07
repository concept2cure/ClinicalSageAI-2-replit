/**
 * Precedent Intelligence fixture data -- ported verbatim from kit
 * app/precedent-engine.jsx.
 *
 * Grounded in the route schemas (SearchSchema / IngestSchema fields) from
 * server/routes/precedent-engine.ts + services/precedent-engine.
 */

/* ── Types ── */

export interface PrecedentResult {
  clearanceNumber: string;
  deviceName: string;
  applicant: string;
  decisionDate: string;
  clearanceType: string;
  decisionOutcome: string;
  productCode: string;
  therapeuticArea: string;
  cycle: number;
  match: number;
  riskFactors: string[];
  predicateKNumber: string | null;
}

export interface RiskFactor {
  label: string;
  severity: 'high' | 'medium' | 'low';
  note: string;
}

export interface RiskAnalysis {
  overall: string;
  score: number;
  factors: RiskFactor[];
}

export interface Strategy {
  recommendation: string;
  predicate: string;
  rationale: string[];
  altPathways: { p: string; when: string }[];
}

export interface ClaimResult {
  verdict: 'supported' | 'unsupported';
  confidence: number;
  precedents: string[];
  note: string;
}

export interface PatternAnalysis {
  title: string;
  rate: string;
  items: string[];
}

export interface PeQuery {
  submissionType: string;
  therapeuticArea: string;
  indication: string;
  productCode: string;
}

/* ── Fixture data ── */

export const PE_RESULTS: PrecedentResult[] = [
  { clearanceNumber: 'K221847', deviceName: 'GlucoSense CGM 14-day', applicant: 'NeoSensor Medical', decisionDate: '2024-03-12', clearanceType: 'Traditional 510(k)', decisionOutcome: 'SE', productCode: 'QBJ', therapeuticArea: 'Diabetes', cycle: 112, match: 0.94, riskFactors: ['Sensor drift at day 12–14'], predicateKNumber: 'K201233' },
  { clearanceNumber: 'DEN200047', deviceName: 'ContinuGlu iCGM', applicant: 'Aurora Dx', decisionDate: '2023-08-01', clearanceType: 'De Novo', decisionOutcome: 'Granted', productCode: 'QBJ', therapeuticArea: 'Diabetes', cycle: 198, match: 0.88, riskFactors: ['Special controls — accuracy stratification'], predicateKNumber: null },
  { clearanceNumber: 'K193201', deviceName: 'DermaPatch CGM', applicant: 'Meridian', decisionDate: '2022-11-19', clearanceType: 'Traditional 510(k)', decisionOutcome: 'SE', productCode: 'QBJ', therapeuticArea: 'Diabetes', cycle: 134, match: 0.81, riskFactors: ['Adhesive biocompatibility'], predicateKNumber: 'K180992' },
  { clearanceNumber: 'K212290', deviceName: 'AccuTrend Flash', applicant: 'Bright Devices', decisionDate: '2024-01-08', clearanceType: 'Special 510(k)', decisionOutcome: 'SE', productCode: 'QBJ', therapeuticArea: 'Diabetes', cycle: 64, match: 0.77, riskFactors: [], predicateKNumber: 'K221847' },
];

export const PE_RISK: RiskAnalysis = {
  overall: 'moderate',
  score: 0.42,
  factors: [
    { label: 'Accuracy sub-analysis by age band', severity: 'high', note: '3 of 4 predicates received an accuracy-stratification request; pre-empt with the age-band MARD table.' },
    { label: 'Sensor drift at day 12–14', severity: 'medium', note: 'Recurring across CGM predicates; include the day-14 stability dataset.' },
    { label: 'Cybersecurity (premarket)', severity: 'medium', note: '2023 guidance level; SBOM + threat model expected.' },
  ],
};

export const PE_STRATEGY: Strategy = {
  recommendation: 'Traditional 510(k)',
  predicate: 'K221847',
  rationale: [
    'K221847 is the closest cleared predicate (0.94) with the same product code (QBJ) and 14-day wear claim.',
    'A Traditional 510(k) citing K221847 avoids the De Novo special-controls burden seen in DEN200047.',
    'Expected review cycle ~110–130 days based on the predicate cohort.',
  ],
  altPathways: [{ p: 'De Novo', when: 'If no valid predicate for the ML classifier delta' }],
};

export const PE_CLAIM: ClaimResult = {
  verdict: 'supported',
  confidence: 0.86,
  precedents: ['K221847', 'K193201'],
  note: 'The "14-day wear" claim is supported by two SE predicates with equivalent wear duration; ensure the human-factors validation matches K221847.',
};

export const PE_PATTERNS: Record<string, PatternAnalysis> = {
  crl: { title: 'CRL trigger patterns', rate: '—', items: ['Analytical accuracy not stratified by clinically relevant subgroups', 'Human-factors validation gaps for the applicator', 'Cybersecurity documentation below current guidance level'] },
  rtf: { title: 'RTF (Refuse-to-Accept) triggers', rate: 'checklist', items: ['Missing predicate comparison table (§807.87)', 'Incomplete performance testing summary', 'Truthful & accuracy statement absent'] },
  ema: { title: 'EMA Day-120/180 question patterns', rate: '—', items: ['Not applicable to 510(k) — shown for a parallel EU IVDR/CE route', 'Analytical performance vs. state of the art', 'Clinical evidence for intended purpose'] },
  adcomm: { title: 'Advisory Committee risk', rate: 'low', items: ['CGM 510(k)s rarely convene a panel', 'Panel risk rises for novel ML-driven dosing claims'] },
};

/** Map severity to chip tone class. */
export function severityTone(s: string): string {
  return s === 'high' ? 'warn' : s === 'medium' ? 'ai' : 'idle';
}
