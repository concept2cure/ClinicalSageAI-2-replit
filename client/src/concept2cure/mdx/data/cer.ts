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

// ─── CerWorkbench fixtures ─────────────────────────────────────────────
// Referenced by CerWorkbench.jsx but not present in any kit data file. These
// shapes were inferred from the component's usage in CerWorkbench.jsx.
// Replace with real data when the kit ships them.

export type GsprStatus = 'conform' | 'partial' | 'gap' | 'na';
export type GsprChapter = 'I' | 'II' | 'III';

export interface GsprRow {
  id: string;
  ch: GsprChapter;
  title: string;
  status: GsprStatus;
  evidence: string;
  note?: string;
}

export const CER_GSPR: GsprRow[] = [
  // Chapter I — General
  { id: '1',  ch: 'I', title: 'Devices shall achieve their intended performance', status: 'conform', evidence: 'CER §5 — clinical performance', note: '' },
  { id: '2',  ch: 'I', title: 'Risk reduction as far as possible', status: 'conform', evidence: 'RMF-IV415 v3.1 · ISO 14971', note: '' },
  { id: '3',  ch: 'I', title: 'Risk management system through the lifecycle', status: 'conform', evidence: 'RMF-IV415 v3.1', note: '' },
  { id: '4',  ch: 'I', title: 'Risk control measures hierarchy', status: 'conform', evidence: 'RMF-IV415 §6', note: '' },
  { id: '5',  ch: 'I', title: 'Reduce risks related to use error', status: 'partial', evidence: 'IFU-IV415 v2 · usability summary', note: 'IFU usability summary references summative study still in draft.' },
  { id: '6',  ch: 'I', title: 'Lifetime of the device', status: 'conform', evidence: 'Stability summary STB-IV415-2025', note: '' },
  { id: '7',  ch: 'I', title: 'Storage and transport conditions', status: 'conform', evidence: 'IFU §4 + STB-IV415-2025', note: '' },
  { id: '8',  ch: 'I', title: 'Side effects acceptable in relation to benefit', status: 'partial', evidence: 'CER §6 risk-benefit', note: 'Two adjudications open; refresh on close.' },
  { id: '9',  ch: 'I', title: 'Devices not for medical purpose (Annex XVI)', status: 'na', evidence: '—', note: 'Not applicable — IV-415 is a CDx with medical purpose.' },
  // Chapter II — Design and manufacture
  { id: '10', ch: 'II', title: 'Chemical, physical and biological properties', status: 'conform', evidence: 'ISO 10993-1 evaluation', note: '' },
  { id: '11', ch: 'II', title: 'Infection and microbial contamination', status: 'na', evidence: '—', note: 'Cartridge supplied non-sterile per intended use.' },
  { id: '12', ch: 'II', title: 'Devices in combination with substances', status: 'na', evidence: '—', note: '' },
  { id: '13', ch: 'II', title: 'Biological origin substances', status: 'na', evidence: '—', note: '' },
  { id: '14', ch: 'II', title: 'Construction and interaction with environment', status: 'conform', evidence: 'IFU-IV415 §3 · environmental conditions', note: '' },
  { id: '15', ch: 'II', title: 'Devices with diagnostic or measuring function', status: 'conform', evidence: 'CER §5 analytical performance', note: '' },
  { id: '16', ch: 'II', title: 'Protection against radiation', status: 'na', evidence: '—', note: 'Non-radiating device.' },
  { id: '17', ch: 'II', title: 'Electronic programmable systems and software', status: 'partial', evidence: 'IEC 62304 lifecycle summary', note: 'SBOM update pending; expected within 14 days.' },
  { id: '18', ch: 'II', title: 'Active devices and devices connected to them', status: 'conform', evidence: 'IEC 60601-1 verification', note: '' },
  { id: '19', ch: 'II', title: 'Particular requirements for active implantable devices', status: 'na', evidence: '—', note: '' },
  { id: '20', ch: 'II', title: 'Protection against mechanical and thermal risks', status: 'conform', evidence: 'Bench summary BNH-IV415', note: '' },
  // Chapter III — Information supplied
  { id: '21', ch: 'III', title: 'Information on the label', status: 'gap', evidence: 'Labeling draft v0.6', note: 'GSPR §21 requires symbols per ISO 15223-1; current draft missing two symbols. Resolve before NB review.' },
  { id: '22', ch: 'III', title: 'Information in the IFU', status: 'partial', evidence: 'IFU-IV415 v2', note: 'IFU describes intended user but does not yet enumerate post-market reporting channels.' },
  { id: '23', ch: 'III', title: 'Patient information leaflet', status: 'na', evidence: '—', note: 'Not applicable — professional-use device.' },
];

// ─── Equivalence ──────────────────────────────────────────────────────

export interface EquivDevice {
  id: string;
  label: string;
  vendor: string;
  year?: string;
  cleared?: string;
}

export const CER_EQUIV_DEVICES: EquivDevice[] = [
  { id: 'subj', label: 'IV-415 Companion Diagnostic',  vendor: 'Concept2Cure',     year: '2026' },
  { id: 'eqA',  label: 'PrecisionPath CDx 3.0',        vendor: 'PathLabs Inc.',   cleared: 'CE 2022' },
  { id: 'eqB',  label: 'AccuMatch EGFR Panel',         vendor: 'AccuDx Bio',      cleared: 'CE 2023' },
];

export type EquivVerdict = 'equivalent' | 'similar' | 'different';
export type EquivDimension = 'Technical' | 'Biological' | 'Clinical';

export interface EquivRow {
  dim: EquivDimension;
  crit: string;
  verdicts: Record<string, EquivVerdict>;
  notes: Record<string, string>;
}

export const CER_EQUIV_MATRIX: EquivRow[] = [
  { dim: 'Technical', crit: 'Detection chemistry',
    verdicts: { eqA: 'equivalent', eqB: 'similar' },
    notes:    { eqA: 'Same RT-PCR amplification chemistry; oligo design overlaps.', eqB: 'Hybridization-based; performance comparable on shared variants.' } },
  { dim: 'Technical', crit: 'Variant scope',
    verdicts: { eqA: 'similar', eqB: 'different' },
    notes:    { eqA: 'IV-415 detects 28 variants vs 26; two added EGFR variants must be characterized in §5.1.', eqB: '18-variant panel; not co-extensive.' } },
  { dim: 'Technical', crit: 'Specimen type',
    verdicts: { eqA: 'equivalent', eqB: 'equivalent' },
    notes:    { eqA: 'FFPE tumor block, both.', eqB: 'FFPE tumor block, both.' } },
  { dim: 'Technical', crit: 'Reader / instrument platform',
    verdicts: { eqA: 'similar', eqB: 'different' },
    notes:    { eqA: 'Different reader; analytical performance demonstrated equivalent on bridging study.', eqB: 'Proprietary closed platform — bridging study not feasible.' } },
  { dim: 'Biological', crit: 'Patient indication',
    verdicts: { eqA: 'equivalent', eqB: 'equivalent' },
    notes:    { eqA: 'NSCLC, EGFR-driven.', eqB: 'NSCLC, EGFR-driven.' } },
  { dim: 'Biological', crit: 'Therapy linkage',
    verdicts: { eqA: 'equivalent', eqB: 'similar' },
    notes:    { eqA: 'Both linked to TKI eligibility decisions.', eqB: 'Linked to first-line TKI; off-label expansion not covered.' } },
  { dim: 'Clinical', crit: 'Intended clinical performance',
    verdicts: { eqA: 'equivalent', eqB: 'similar' },
    notes:    { eqA: 'Both target ≥ 95% sensitivity.', eqB: 'Comparable but with different reference standard.' } },
  { dim: 'Clinical', crit: 'Target population',
    verdicts: { eqA: 'equivalent', eqB: 'equivalent' },
    notes:    { eqA: 'Adults with metastatic NSCLC.', eqB: 'Adults with metastatic NSCLC.' } },
  { dim: 'Clinical', crit: 'PMS evidence depth',
    verdicts: { eqA: 'similar', eqB: 'different' },
    notes:    { eqA: 'PrecisionPath has 24-mo PMCF; IV-415 has 6-mo interim only.', eqB: 'Limited public PMS evidence.' } },
];

// ─── PMS / PMCF ───────────────────────────────────────────────────────

export interface PmsKpi {
  label: string;
  value: string;
  delta?: string;
  foot: string;
  tone?: 'good' | 'warn' | 'bad';
}

export const CER_PMS_KPIS: PmsKpi[] = [
  { label: 'Open complaints',     value: '12',  delta: ' / 47', foot: '47 received last 35 days · 12 still open', tone: 'warn' },
  { label: 'Severity index',      value: '0.72',                foot: 'Lower is better · trending up vs prior month', tone: 'warn' },
  { label: 'Mean time to triage', value: '2.4', delta: ' d',    foot: '24-hour target on serious events',           tone: 'good' },
  { label: 'PMCF coverage',       value: '64',  delta: '%',     foot: 'Fraction of indications under active follow-up', tone: 'good' },
];

export type ComplaintSeverity = 'serious' | 'non-serious';
export type ComplaintStatus = 'open' | 'in-review' | 'closed';

export interface ComplaintRow {
  code: string;
  category: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  owner: string;
  received: string;
  source: string;
}

export const CER_PMS_COMPLAINTS: ComplaintRow[] = [
  { code: 'CMP-3104', category: 'Lead dislodgement',     severity: 'serious',     status: 'open',      owner: 'A. Romero', received: 'Apr 24', source: 'FAERS' },
  { code: 'CMP-3098', category: 'Sensor read variance',   severity: 'non-serious', status: 'in-review', owner: 'M. Patel',  received: 'Apr 22', source: 'Field' },
  { code: 'CMP-3091', category: 'Battery longevity',      severity: 'non-serious', status: 'open',      owner: 'A. Romero', received: 'Apr 19', source: 'MAUDE' },
  { code: 'CMP-3082', category: 'Implant site reaction',  severity: 'serious',     status: 'in-review', owner: 'L. Tran',   received: 'Apr 14', source: 'Eudamed' },
  { code: 'CMP-3071', category: 'IFU clarity',            severity: 'non-serious', status: 'closed',    owner: 'J. Chen',   received: 'Apr 09', source: 'Distributor' },
];

export interface PmcfStudy {
  id: string;
  kind: string;
  status: 'enrolling' | 'follow-up' | 'closed';
  primary: string;
  site: string;
  through: string;
  n: number;
  target: number;
}

export const CER_PMCF_STUDIES: PmcfStudy[] = [
  { id: 'PMCF-2024-A', kind: 'Real-world cohort',   status: 'enrolling', primary: 'Detection sensitivity at 24 mo', site: '14 EU sites', through: '2026 Q3', n: 412, target: 600 },
  { id: 'PMCF-2024-B', kind: 'Registry · Eudamed',   status: 'follow-up', primary: 'Late-stage adverse events',     site: '7 EU member states', through: '2027 Q1', n: 1840, target: 2400 },
  { id: 'PMCF-2025-C', kind: 'Vendor survey',        status: 'enrolling', primary: 'IFU adherence metrics',         site: 'Multi-region',       through: '2026 Q2', n:  86, target: 200 },
];

export interface PmsTimelineRow {
  label: string;
  when: string;
  status: 'complete' | 'review' | 'draft' | 'empty';
}

export const CER_PMS_TIMELINE: PmsTimelineRow[] = [
  { label: 'PMS Plan v2.1',                  when: 'Locked Jan 2026',     status: 'complete' },
  { label: 'PSUR Q4 2025',                   when: 'Submitted Jan 31',    status: 'complete' },
  { label: 'PSUR Q1 2026',                   when: 'Due Mar 31',          status: 'draft' },
  { label: 'Trend report — lead dislodgement', when: 'Due Article 88 14d', status: 'review' },
  { label: 'PMCF interim — 2024-A',           when: 'Due Q3 2026',         status: 'empty' },
  { label: 'Annual NB review packet',          when: 'Due Q4 2026',         status: 'empty' },
];
