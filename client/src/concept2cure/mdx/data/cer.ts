/**
 * CER (basic surface) fixtures — ported verbatim from data.jsx.
 *
 * The full 7-tab CerWorkbench is not present in this kit drop; the basic
 * surface uses these three datasets only (signals, literature, export plan).
 */

export type SignalSource = 'FAERS' | 'MAUDE' | 'PubMed' | 'Eudamed';
export type SignalSeverity = 'serious' | 'non-serious';
export type SignalStatus = 'included' | 'excluded' | 'review';
export type CerSectionStatus = 'complete' | 'review' | 'draft' | 'empty';

export interface CerSignal {
  id: string;
  source: SignalSource;
  severity: SignalSeverity;
  event: string;
  count: number;
  onset: string;
  assess: string;
  status: SignalStatus;
  reason?: string;
}

export interface LiteratureBucket {
  year: string;
  hits: number;
}

export interface CerSection {
  id: string;
  label: string;
  status: CerSectionStatus;
}

export const CER_SIGNALS: CerSignal[] = [
  { id: 'FR-8812', source: 'FAERS',   severity: 'serious',     event: 'Implant site infection',           count: 14, onset: '12 mo', assess: 'Causality assessed · device-related', status: 'included' },
  { id: 'FR-8809', source: 'FAERS',   severity: 'serious',     event: 'Lead dislodgement',                count: 3,  onset: '3 mo',  assess: 'Under adjudication',                  status: 'review' },
  { id: 'FR-8802', source: 'FAERS',   severity: 'non-serious', event: 'Skin irritation at adhesive site', count: 28, onset: '2 wk',  assess: 'Expected · labeling covers',          status: 'included' },
  { id: 'FR-8784', source: 'MAUDE',   severity: 'serious',     event: 'Battery failure',                  count: 2,  onset: '18 mo', assess: 'Root cause · supplier CAPA',          status: 'excluded', reason: 'Non-representative lot' },
  { id: 'LIT-2241',source: 'PubMed',  severity: 'serious',     event: 'Late-stage pacing threshold rise', count: 6,  onset: '24 mo', assess: 'Literature · 2 cohort studies',       status: 'included' },
  { id: 'LIT-2203',source: 'PubMed',  severity: 'non-serious', event: 'Patient-reported discomfort',      count: 91, onset: '1 mo',  assess: 'Literature · 5 survey studies',       status: 'included' },
  { id: 'EU-4412', source: 'Eudamed', severity: 'serious',     event: 'Thromboembolic event',             count: 4,  onset: '9 mo',  assess: 'EU real-world · 3 countries',         status: 'review' },
];

export const CER_LITERATURE: LiteratureBucket[] = [
  { year: '2025', hits: 412 },
  { year: '2024', hits: 684 },
  { year: '2023', hits: 521 },
  { year: '2022', hits: 389 },
  { year: '2021', hits: 218 },
  { year: '2020', hits: 102 },
];

export const CER_EXPORT: CerSection[] = [
  { id: 'scope',    label: 'Scope and device description',   status: 'complete' },
  { id: 'state',    label: 'State-of-the-art analysis',      status: 'complete' },
  { id: 'clinical', label: 'Clinical data summary',          status: 'draft' },
  { id: 'safety',   label: 'Safety and risk-benefit',        status: 'review' },
  { id: 'pms',      label: 'Post-market surveillance plan',  status: 'draft' },
  { id: 'conclu',   label: 'Conclusion and recommendations', status: 'empty' },
];
