/* Specialist tier fixture data -- precedent, biostatistics, report engine,
   safety/PV, deep research, labeling, risk. Ported from kit specialist-data.jsx. */

export { RISK_ENUMS, RISK_ROWS } from './risk-data';
export type { RiskRow, RiskControl, RiskEnums } from './risk-data';
export {
  LABEL_SECTIONS, LABEL_CHECKS, LABEL_SYMBOLS, LABEL_UDI,
  LABEL_WARNINGS, LABEL_DOC, LABEL_ENUMS, LABEL_TRANSLATIONS,
} from './labeling-data';
export type {
  LabelSection, LabelCheck, LabelSymbol, LabelUdi,
  LabelWarning, LabelDoc, LabelEnums, LabelTranslation,
} from './labeling-data';

/* 21 CFR Part 11 e-signature meanings (full server-side enum). */
export const ESIGN_MEANINGS: string[] = [
  'AUTHOR', 'REVIEWER', 'APPROVER', 'VERIFIER', 'WITNESS',
  'RESPONSIBLE_PARTY', 'QUALITY_APPROVAL', 'REGULATORY_APPROVAL',
  'CLINICAL_APPROVAL', 'TECHNICAL_APPROVAL',
];

/* ---- Precedent intelligence ---- */

export interface PrecedentQuery {
  q: string;
  hits: number;
  agency: string;
}

export interface PrecedentResult {
  k: string;
  name: string;
  holder: string;
  decision: string;
  cycle: number;
  year: number;
  match: number;
}

export interface PrecedentRationale {
  title: string;
  pedigree: string;
  points: string[];
  cites: string[];
}

export const PI_SAVED: PrecedentQuery[] = [
  { q: 'CGM sensor · 14-day wear', hits: 47, agency: 'FDA' },
  { q: 'IVD cartridge · 14 analytes', hits: 23, agency: 'FDA' },
  { q: 'Implantable cardiac monitor', hits: 182, agency: 'FDA/EMA' },
  { q: 'SaMD Class II · CDS', hits: 419, agency: 'FDA' },
];

export const PI_RESULTS: PrecedentResult[] = [
  { k: 'K221847', name: 'Dexcom G7 CGM System', holder: 'Dexcom', decision: 'SE', cycle: 124, year: 2022, match: 94 },
  { k: 'K213163', name: 'FreeStyle Libre 3', holder: 'Abbott', decision: 'SE', cycle: 131, year: 2022, match: 88 },
  { k: 'DEN200051', name: 'Eversense E3 (De Novo)', holder: 'Senseonics', decision: 'Granted', cycle: 198, year: 2022, match: 71 },
  { k: 'K201715', name: 'Guardian Connect', holder: 'Medtronic', decision: 'SE', cycle: 142, year: 2020, match: 66 },
];

export const PI_RATIONALE: PrecedentRationale = {
  title: 'K221847 · decision rationale',
  pedigree: 'deterministic_registry',
  points: [
    'Cleared SE on the basis of equivalent intended use and electrochemical enzyme sensing technology.',
    'Additional ISO 10993-11 testing required for extended (10-day) wear — set the precedent for 14-day claims.',
    'Reviewer requested accuracy sub-analysis by age band (7–17 vs ≥18) — recurring across 12 of 14 CGM clearances.',
  ],
  cites: ['K221847 Decision Summary', 'FDA 2023 CGM guidance'],
};

/* ---- Biostatistics ---- */

export interface BiostatTool {
  id: string;
  icon: string;
  label: string;
  desc: string;
  kind: string;
}

export interface BiostatSap {
  id: string;
  study: string;
  endpoint: string;
  design: string;
  status: string;
  power: string;
}

export const BIOSTAT_TOOLS: BiostatTool[] = [
  { id: 'sap', icon: 'fileText', label: 'Statistical analysis plan', desc: 'ICH E9(R1) estimand-aligned SAP with endpoints, populations, multiplicity.', kind: 'generate' },
  { id: 'power', icon: 'sigma', label: 'Sample size & power', desc: 'Superiority, non-inferiority, equivalence; parallel/crossover/adaptive.', kind: 'compute' },
  { id: 'tlf', icon: 'barChart', label: 'TLF shells', desc: 'Tables, listings & figures shells mapped to the SAP.', kind: 'generate' },
  { id: 'adaptive', icon: 'workflow', label: 'Adaptive design', desc: 'Group-sequential, sample-size re-estimation, Bayesian borrowing.', kind: 'generate' },
  { id: 'idmc', icon: 'checkCircle', label: 'IDMC / DSMB', desc: 'Charter elements, interim analysis timing, stopping rules.', kind: 'generate' },
];

export const BIOSTAT_SAPS: BiostatSap[] = [
  { id: 'SAP-BX204', study: 'BX204-201 · Phase II', endpoint: 'Confirmed ORR (BICR)', design: 'Single-arm', status: 'review', power: '90% @ ORR 25%→38%' },
  { id: 'SAP-CV330', study: 'CV330-PIV · Pivotal', endpoint: 'Sensitivity vs truth std', design: 'Parallel', status: 'draft', power: '94% sensitivity, n=680' },
  { id: 'SAP-IV208', study: 'IV208 · CDx bridging', endpoint: 'PPA / NPA', design: 'Concordance', status: 'approved', power: '95% PPA, 2-sided 95% CI' },
];

/* ---- Report engine ---- */

export interface SealedReport {
  id: string;
  title: string;
  kind: string;
  sealed: string;
  by: string;
  atoms: number;
  seal: string;
  status: string;
}

export interface ReportAtom {
  id: string;
  claim: string;
  conf: number;
  src: string;
}

export const REPORTS: SealedReport[] = [
  { id: 'RPT-4471', title: 'Portfolio readiness — June 2026', kind: 'Readiness', sealed: '2026-06-15 09:02', by: 'J. Chen', atoms: 42, seal: 'sha256:9f21…c4', status: 'sealed' },
  { id: 'RPT-4458', title: '510(k) precedent likelihood — BX-204', kind: 'Precedent model', sealed: '2026-06-12 14:30', by: 'AnA · Maximum', atoms: 67, seal: 'sha256:2b80…a1', status: 'sealed' },
  { id: 'RPT-4440', title: 'CRL/RTF risk scan — Q2 cohort', kind: 'Risk', sealed: '2026-06-08 11:15', by: 'AnA · Maximum', atoms: 118, seal: 'sha256:77ce…9d', status: 'sealed' },
  { id: 'RPT-4429', title: 'Timeline forecast — NDA 212345', kind: 'Forecast', sealed: '—', by: 'J. Chen', atoms: 0, seal: 'pending', status: 'draft' },
];

export const REPORT_ATOMS: ReportAtom[] = [
  { id: 'atom-1', claim: 'Average first-cycle review for CGM 510(k) is 124 days', conf: 0.94, src: '14 cleared K-numbers (2020–2024)' },
  { id: 'atom-2', claim: '78% of CGM first-rounds cite accuracy-by-age sub-analysis', conf: 0.87, src: 'FDA decision summaries' },
  { id: 'atom-3', claim: 'ISO 10993-11 required for ≥14-day wear', conf: 0.92, src: 'guidance + predicate set' },
];

/* ---- Safety narrative / PV ---- */

export interface PvSignal {
  id: string;
  event: string;
  source: string;
  n: number;
  window: string;
  state: string;
  tone: string;
}

export interface PvNarrative {
  id: string;
  subj: string;
  seriousness: string;
  status: string;
  due: string;
}

export const PV_SIGNALS: PvSignal[] = [
  { id: 'SIG-2241', event: 'Lead dislodgement', source: 'FAERS', n: 3, window: '30d', state: 'investigation', tone: 'warn' },
  { id: 'SIG-2203', event: 'Implant-site infection', source: 'FAERS', n: 14, window: '12mo', state: 'assessed', tone: 'ai' },
  { id: 'SIG-2188', event: 'Battery early depletion', source: 'MAUDE', n: 2, window: '18mo', state: 'capa', tone: 'idle' },
  { id: 'SIG-2174', event: 'Thromboembolic event', source: 'EUDAMED', n: 4, window: '9mo', state: 'reportable', tone: 'err' },
];

export const PV_NARRATIVES: PvNarrative[] = [
  { id: 'ICSR-8841', subj: '72M, implant-site infection', seriousness: 'Serious', status: 'draft', due: 'Day 15' },
  { id: 'ICSR-8839', subj: '64F, lead dislodgement', seriousness: 'Serious', status: 'review', due: 'Day 7' },
  { id: 'ICSR-8832', subj: '58M, skin irritation', seriousness: 'Non-serious', status: 'submitted', due: '—' },
];

export const PV_STATES: string[] = ['detected', 'triage', 'investigation', 'assessed', 'reportable', 'capa', 'closed'];

/* ---- Deep research ---- */

export interface DeepResearchJob {
  id: string;
  q: string;
  state: string;
  model: string;
  sources: number;
  started: string;
  pct: number;
}

export const DR_JOBS: DeepResearchJob[] = [
  { id: 'DR-118', q: 'EU MDR Article 61 literature thresholds across notified bodies', state: 'running', model: 'Maximum', sources: 42, started: '4 min ago', pct: 62 },
  { id: 'DR-114', q: 'CGM 14-day wear — global clearance precedent & required testing', state: 'complete', model: 'Maximum', sources: 88, started: '2 h ago', pct: 100 },
  { id: 'DR-109', q: 'Companion diagnostic co-approval timelines FDA vs EMA', state: 'complete', model: 'Maximum', sources: 54, started: 'yesterday', pct: 100 },
  { id: 'DR-102', q: 'Bayesian borrowing acceptance in PMA pivotal trials', state: 'queued', model: 'Maximum', sources: 0, started: '—', pct: 0 },
];

export const DR_STATES: Record<string, string> = { queued: 'idle', running: 'ai', complete: 'ok', failed: 'err' };

/* ---- Risk KPIs (not in risk-data.ts) ---- */

export interface RiskKpi {
  l: string;
  v: string;
  t?: string;
}

export const RISK_KPIS: RiskKpi[] = [
  { l: 'Hazards identified', v: '24' },
  { l: 'Residual acceptable', v: '21 / 24', t: 'ok' },
  { l: 'Open evaluations', v: '3', t: 'warn' },
  { l: 'Benefit-risk', v: 'Favorable', t: 'ok' },
];
