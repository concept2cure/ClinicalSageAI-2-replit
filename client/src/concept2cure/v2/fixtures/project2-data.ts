/**
 * Fixture data for Document Authoring + Dossier Map surfaces
 * (kit app/project2-data.jsx).
 */

/* ---- Types ---- */

export interface DocProgram {
  // Every field is null-able: the backend derives them from scoped rows and
  // returns null rather than fabricating a value when a source is absent.
  title: string | null;
  code: string | null;
  section: string | null;
  readiness: number | null;
  due: string | null;
}

export interface DocTreeItem {
  id: string;
  num: string;
  label: string;
  status: string;
  active?: boolean;
  blocker?: boolean;
}

export interface DocTreeVolume {
  vol: string;
  items: DocTreeItem[];
}

export interface BlockSpan {
  t?: string;
  cite?: string;
}

export interface BlockFlag {
  sev: string;
  msg: string;
}

export interface BlockProv {
  source: string;
  model: string;
  audit: string;
}

export interface DocBlock {
  id: string;
  kind: string;
  text?: string;
  conf?: number;
  prov?: BlockProv;
  spans?: BlockSpan[];
  flag?: BlockFlag;
}

export interface DocComment {
  id: string;
  block: string;
  author: string;
  role: string;
  when: string;
  ai: boolean;
  body: string;
}

export interface DossierModule {
  m: string;
  label: string;
  pct: number;
  tone: string;
  sections: string[];
}

/* ---- Status tone map ---- */

export const STATUS_TONE: Record<string, string> = {
  complete: 'ok',
  review: 'warn',
  draft: 'idle',
  active: 'ai',
  ok: 'ok',
  warn: 'warn',
};

/* ---- Document authoring (editor) ---- */

export const DOC_PROGRAM: DocProgram = {
  title: 'NDA 212345 — oncology biologic',
  code: 'eCTD · Module 2',
  section: '2.5 Clinical Overview',
  readiness: 71,
  due: 'FDA filing · Q3 2026',
};

export const DOC_TREE: DocTreeVolume[] = [
  {
    vol: 'Module 2 — Summaries',
    items: [
      { id: 'm21', num: '2.1', label: 'CTD table of contents', status: 'complete' },
      { id: 'm23', num: '2.3', label: 'Quality overall summary', status: 'review' },
      { id: 'm25', num: '2.5', label: 'Clinical overview', status: 'draft', active: true, blocker: true },
      { id: 'm27', num: '2.7', label: 'Clinical summary', status: 'draft' },
    ],
  },
  {
    vol: 'Module 5 — Clinical',
    items: [
      { id: 'm531', num: '5.3.1', label: 'Biopharmaceutic studies', status: 'complete' },
      { id: 'm535', num: '5.3.5', label: 'Efficacy & safety studies', status: 'review' },
    ],
  },
];

export const DOC_BLOCKS_INIT: DocBlock[] = [
  { id: 'b1', kind: 'h2', text: '2.5.1 Product development rationale' },
  {
    id: 'b2',
    kind: 'p',
    conf: 0.94,
    prov: { source: 'Target product profile · TPP v3.2', model: 'Maximum', audit: 'AUD-7741' },
    spans: [
      { t: 'BX-204 is a humanized IgG1κ monoclonal antibody targeting receptor tyrosine kinase X (RTK-X), developed for advanced or metastatic RTK-X–overexpressing solid tumors. The clinical development program is designed to support accelerated approval under ' },
      { cite: '21 CFR 314.500' },
      { t: '.' },
    ],
  },
  { id: 'b3', kind: 'h2', text: '2.5.4 Overview of efficacy' },
  {
    id: 'b4',
    kind: 'p',
    conf: 0.72,
    flag: { sev: 'warn', msg: 'ORR confidence interval cites CSR-201 §7.1 — verify the table is locked before filing.' },
    prov: { source: 'CSR-201 · pivotal Phase II', model: 'Maximum', audit: 'AUD-7742' },
    spans: [
      { t: 'The confirmed objective response rate of 38.6% (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25%, derived from an indication-matched pooled historical control of 412 patients across five sponsor-independent datasets ' },
      { cite: 'CSR-201' },
      { t: '.' },
    ],
  },
  {
    id: 'b5',
    kind: 'p',
    conf: 0.58,
    flag: { sev: 'err', msg: 'Bridging claim implies completed population-PK justification; Module 2.7.2 shows that analysis as "in progress". AnA drafted safer phrasing — see comments.' },
    prov: { source: 'Drafted from bridging strategy memo', model: 'Maximum', audit: 'AUD-7743' },
    spans: [
      { t: 'Population-pharmacokinetic analysis establishes exposure equivalence between the bridging and pivotal formulations, supporting the efficacy read-across per ' },
      { cite: 'FDA 2023 bridging guidance' },
      { t: '.' },
    ],
  },
  { id: 'b6', kind: 'h2', text: '2.5.6 Benefit-risk conclusions' },
  {
    id: 'b7',
    kind: 'p',
    conf: 0.88,
    prov: { source: 'Drafted from §2.5.1–2.5.5', model: 'Maximum', audit: 'AUD-7744' },
    spans: [
      { t: 'The magnitude and durability of response, together with a manageable safety profile, support a favorable benefit-risk assessment for the proposed indication in a population with limited therapeutic options.' },
    ],
  },
];

export const DOC_COMMENTS: DocComment[] = [
  {
    id: 'c1',
    block: 'b5',
    author: 'Ana Müller',
    role: 'Clinical',
    when: '1 h ago',
    ai: false,
    body: 'Pop-PK is not locked — soften to "is being established" and cross-ref 2.7.2.',
  },
  {
    id: 'c2',
    block: 'b5',
    author: 'AnA',
    role: 'Maximum',
    when: '1 h ago',
    ai: true,
    body: 'Suggested: "Population-PK analysis (Module 2.7.2, in progress) is expected to establish exposure equivalence…". Apply?',
  },
];

/* ---- Draft text for streaming simulation ---- */

export const DRAFT_TEXT =
  '2.5.6 — Benefit-risk conclusions. The totality of efficacy and safety evidence supports a favorable benefit-risk profile for BX-204 in the proposed indication. The confirmed objective response rate of 38.6% (95% CI 31.5–46.0), the durability of responses, and a manageable, well-characterized safety profile together outweigh the residual risks, which are addressable through routine pharmacovigilance and labeling. No new safety signals were identified that would alter this assessment.';

/* ---- Dossier map ---- */

export const DOSSIER: DossierModule[] = [
  { m: '1', label: 'Administrative & prescribing', pct: 92, tone: 'ok', sections: ['1.1 Forms', '1.3 Labeling', '1.14 Meeting'] },
  { m: '2', label: 'CTD summaries', pct: 64, tone: 'warn', sections: ['2.3 QOS', '2.4 Nonclinical', '2.5 Clinical', '2.7 Summary'] },
  { m: '3', label: 'Quality', pct: 58, tone: 'warn', sections: ['3.2.S Substance', '3.2.P Product', '3.2.R Regional'] },
  { m: '4', label: 'Nonclinical reports', pct: 100, tone: 'ok', sections: ['4.2.1 Pharmacology', '4.2.3 Toxicology'] },
  { m: '5', label: 'Clinical reports', pct: 71, tone: 'warn', sections: ['5.3.1 Biopharm', '5.3.5 Efficacy/safety'] },
];
