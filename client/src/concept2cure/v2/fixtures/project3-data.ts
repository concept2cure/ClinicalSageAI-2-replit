/**
 * Fixture data for Project3 surfaces: Biopharma (BLA/CTD), CSR workflow,
 * Regulatory workspace (kit app/project3-data.jsx).
 */

/* ---- Types ---- */

export interface BioProgram {
  title: string;
  code: string;
  stage: string;
  readiness: number;
  due: string;
}

export interface BioPhase {
  id: string;
  label: string;
  pct: number;
  status: string;
}

export interface BioModule {
  code: string;
  label: string;
  pct: number;
  status: string;
  docs: number;
}

export interface SimilarityRow {
  attr: string;
  method: string;
  result: string;
  verdict: string;
}

export interface ComparabilityRow {
  lot: string;
  scope: string;
  status: string;
  tone: string;
}

export interface Immunogenicity {
  adaRate: string;
  nabRate: string;
  assay: string;
  impact: string;
}

export interface BioBla {
  similarity: SimilarityRow[];
  comparability: ComparabilityRow[];
  immunogenicity: Immunogenicity;
}

export interface CsrProgram {
  title: string;
  code: string;
  readiness: number;
}

export interface CsrSection {
  num: string;
  label: string;
  status: string;
  blocker?: boolean;
}

export interface RwTreeItem {
  id: string;
  num: string;
  label: string;
  status: string;
  active?: boolean;
}

export interface RwIntelItem {
  k: string;
  v: string;
}

/* ---- Status tone map ---- */

export const STATUS_TONE: Record<string, string> = {
  complete: 'ok',
  review: 'warn',
  draft: 'idle',
  active: 'ai',
  idle: 'idle',
};

/* ---- Biopharma (BLA / CTD) ---- */

export const BIO_PROGRAM: BioProgram = {
  title: 'ACME-BIO-001 — anti-RTKX biologic',
  code: 'Class · BLA (351(a))',
  stage: 'CTD assembly',
  readiness: 58,
  due: 'BLA filing · Q4 2026',
};

export const BIO_PHASES: BioPhase[] = [
  { id: 'target', label: 'Target validation', pct: 100, status: 'complete' },
  { id: 'preclin', label: 'Preclinical', pct: 100, status: 'complete' },
  { id: 'ind', label: 'IND open', pct: 100, status: 'complete' },
  { id: 'ph1', label: 'Phase 1', pct: 100, status: 'complete' },
  { id: 'ph2', label: 'Phase 2', pct: 100, status: 'complete' },
  { id: 'ph3', label: 'Phase 3', pct: 72, status: 'active' },
  { id: 'cmc', label: 'CMC / process', pct: 64, status: 'active' },
  { id: 'ctd', label: 'CTD assembly', pct: 40, status: 'active' },
  { id: 'bla', label: 'BLA filing', pct: 0, status: 'idle' },
  { id: 'review', label: 'FDA review', pct: 0, status: 'idle' },
];

export const BIO_MODULES: BioModule[] = [
  { code: 'M1', label: 'Administrative', pct: 80, status: 'review', docs: 24 },
  { code: 'M2', label: 'CTD summaries', pct: 55, status: 'active', docs: 18 },
  { code: 'M3', label: 'Quality (CMC)', pct: 48, status: 'active', docs: 62 },
  { code: 'M4', label: 'Nonclinical', pct: 92, status: 'complete', docs: 41 },
  { code: 'M5', label: 'Clinical', pct: 60, status: 'active', docs: 88 },
];

export const BIO_BLA: BioBla = {
  similarity: [
    { attr: 'Primary sequence', method: 'LC-MS peptide map', result: '100% match', verdict: 'ok' },
    { attr: 'Charge variants', method: 'icIEF', result: 'Within 90% CI', verdict: 'ok' },
    { attr: 'N-glycan profile', method: 'HILIC-FLR', result: 'Afucosylation +1.8%', verdict: 'warn' },
    { attr: 'Aggregates (HMW)', method: 'SEC-MALS', result: '≤ 1.2%', verdict: 'ok' },
    { attr: 'Potency (ADCC)', method: 'Reporter bioassay', result: '92–108% RP', verdict: 'ok' },
  ],
  comparability: [
    { lot: 'Process A → B', scope: 'Site transfer', status: 'Comparable', tone: 'ok' },
    { lot: 'Scale 200L → 2000L', scope: 'Scale-up', status: 'Comparable', tone: 'ok' },
    { lot: 'Formulation v2', scope: 'Excipient change', status: 'Under review', tone: 'warn' },
  ],
  immunogenicity: {
    adaRate: '4.1%',
    nabRate: '1.2%',
    assay: '3-tier (screen · confirm · titer)',
    impact: 'No PK/efficacy impact observed',
  },
};

/* ---- CSR workflow (ICH E3) ---- */

export const CSR_PROGRAM: CsrProgram = {
  title: 'BX204-201 Clinical Study Report',
  code: 'ICH E3',
  readiness: 46,
};

export const CSR_SECTIONS: CsrSection[] = [
  { num: '1–3', label: 'Title, synopsis, TOC', status: 'complete' },
  { num: '9', label: 'Investigational plan', status: 'complete' },
  { num: '10', label: 'Study patients', status: 'review' },
  { num: '11', label: 'Efficacy evaluation', status: 'draft', blocker: true },
  { num: '12', label: 'Safety evaluation', status: 'draft' },
  { num: '14', label: 'Tables, figures, graphs', status: 'review' },
  { num: '16', label: 'Appendices', status: 'draft' },
];

/* ---- Regulatory workspace (generic 3-pane substrate) ---- */

export const RW_TREE: RwTreeItem[] = [
  { id: 'r1', num: '2.5', label: 'Clinical overview', status: 'draft', active: true },
  { id: 'r2', num: '2.7', label: 'Clinical summary', status: 'draft' },
  { id: 'r3', num: '3.2.S', label: 'Drug substance', status: 'review' },
  { id: 'r4', num: '3.2.P', label: 'Drug product', status: 'draft' },
  { id: 'r5', num: '5.3.5', label: 'Efficacy & safety', status: 'complete' },
];

export const RW_INTEL: RwIntelItem[] = [
  { k: 'Linked evidence', v: '12 sources · 4 unlinked claims' },
  { k: 'Open comments', v: '3 · 1 from AnA' },
  { k: 'Readiness', v: '71% · 2 blockers' },
];
