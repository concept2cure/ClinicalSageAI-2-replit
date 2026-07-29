import React from 'react';

/* ── Types ── */

export interface ProjHierarchy {
  depth: number;
  label: string;
  kind: string;
}

export interface ProjProgram {
  id: string;
  title: string;
  productName: string;
  productType: string;
  submissionType: string;
  region: string;
  clientType: string;
  ta: string;
  indication: string;
  lead: string;
  status: string;
  priority: string;
  type: string;
  riskLevel: string;
  completion: number;
  due: string;
  dueTone: string;
  retrievalMode: string;
  tokenEst: string;
  knowledgeTokens: number;
  hierarchy: ProjHierarchy[];
  desc: string;
}

export interface ProjIntelligence {
  readinessStatus: string;
  currentBlockers: string[];
  importantDecisions: string[];
  unresolvedRisks: string[];
  nextRecommendedActions: string[];
}

export interface ProjMemory {
  visibility: string;
  updated: string;
  body: string;
}

export interface ProjInstructions {
  updated: string;
  body: string;
}

export interface PyramidPhase {
  n: number;
  name: string;
  status: string;
  done: number;
  total: number;
  critical: boolean;
  gate?: string;
}

export interface ProjPyramid {
  pathway: string;
  label: string;
  phases: PyramidPhase[];
}

export interface ScheduleGoal {
  t: string;
  status: string;
  when: string;
}

export interface ProjSchedule {
  generatedByAna: boolean;
  confidence: number;
  updated: string;
  basis: string;
  goals: ScheduleGoal[];
}

export interface ProjTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  module: string;
  assignee: string;
  due: string;
  ctq: boolean;
  critical: boolean;
  phase: number;
  dependsOn: string[];
  blockedReason?: string;
}

export interface ProjBoard {
  orgTotal: number;
  byStatus: null;
}

export interface ReadinessFinding {
  rule: string;
  kind: string;
  severity: string;
  status: string;
}

export interface ProjReadiness {
  score: number;
  isReady: boolean;
  blockerCount: number;
  rulesBased: ReadinessFinding[];
  validation: ReadinessFinding[];
  aiInferred: ReadinessFinding[];
}

export interface LinkedModule {
  m: string;
  t: string;
  done: number;
  risk?: boolean;
}

export interface ProjFile {
  name: string;
  type: string;
  module: string;
  section: string;
  dtype: string;
  status: string;
  conf: number | null;
}

export interface ProjConversation {
  t: string;
  when: string;
  n: number;
}

export interface ProjTeamMember {
  role: string;
  name: string;
  sig: string;
}

export interface ProjActivity {
  who: string;
  what: string;
  when: string;
}

export interface ProjH {
  program: ProjProgram;
  intelligence: ProjIntelligence;
  memory: ProjMemory;
  instructions: ProjInstructions;
  pyramid: ProjPyramid;
  schedule: ProjSchedule;
  tasks: ProjTask[];
  board: ProjBoard;
  readiness: ProjReadiness;
  linkedModules: LinkedModule[];
  files: ProjFile[];
  capacity: number;
  conversations: ProjConversation[];
  team: ProjTeamMember[];
  activity: ProjActivity[];
}

export interface PvNode {
  id: string;
  label?: string;
  icon?: string;
  name?: string;
  type?: string;
  status?: string;
  ver?: string;
  author?: string;
  updated?: string;
  size?: string;
  esig?: boolean;
  children?: PvNode[];
}

export interface ProjMeetingQuestion {
  num: number;
  text: string;
  sponsorPos: string;
  agencyResp: string | null;
  agreed: boolean;
}

export interface ProjCommitment {
  type: string;
  desc: string;
  status: string;
  due: string;
  basis: string;
}

export interface ProjMeeting {
  id: string;
  interactionType: string;
  type: string;
  agency: string;
  date: string;
  status: string;
  attendees: string[];
  topic: string;
  outcome: string | null;
  briefingBook: string | null;
  documents: string[];
  questions: ProjMeetingQuestion[];
  commitments: ProjCommitment[];
}

export interface ProjPortfolioEntry {
  id: string;
  title: string;
  ws: string;
  code: string;
  stage: string;
  readiness: number;
  status: string;
  lead: string;
  blocker: string | null;
  due: string;
  activity: string;
}

export interface NpTeamMember {
  name: string;
  role: string;
}

export interface LifecycleStage {
  id: string;
  label: string;
  icon: string;
  blurb: string;
}

export interface StageTool {
  id: string;
  label: string;
  desc: string;
  icon: string;
}

/* ── PROJH ── */

export const PROJH: ProjH = {
  program: {
    id: 'bx204', title: 'BX-204 — NDA 212345', productName: 'BX-204', productType: 'biologic',
    submissionType: 'NDA', region: 'FDA · CDER', clientType: 'Pharma', ta: 'Oncology',
    indication: 'Advanced RTK-X–overexpressing solid tumors', lead: 'Jordan Chen',
    status: 'active', priority: 'critical', type: 'regulatory', riskLevel: 'high',
    completion: 64, due: 'FDA · rolling NDA · Q3 2026', dueTone: 'warn',
    retrievalMode: 'retrieval', tokenEst: '1.84M', knowledgeTokens: 1840000,
    hierarchy: [
      { depth: 0, label: 'Oncology Portfolio', kind: 'Program' },
      { depth: 1, label: 'BX-204 NDA', kind: 'Project' },
      { depth: 2, label: 'BX204-201 (pivotal)', kind: 'Study' },
    ],
    desc: 'Humanized IgG1κ mAb (anti–RTK-X) seeking accelerated approval. Pivotal BX204-201 reads ORR; rolling NDA to FDA OND. Module 3 CMC comparability gates the freeze.',
  },
  intelligence: {
    readinessStatus: 'At risk — 1 blocker on the critical path',
    currentBlockers: [
      'ISS (5.3.5.3) not yet compiled — gates the Module 2 safety summary',
      'Module 3 comparability protocol (pre/post process change) unreconciled',
    ],
    importantDecisions: [
      'Accelerated-approval basis = ORR from locked BX204-201',
      'Rolling sequence: Nonclinical → Clinical → CMC last',
    ],
    unresolvedRisks: [
      'Pre/post process-change comparability may demand additional lots',
      'Confirmatory BX204-301 enrollment pace',
    ],
    nextRecommendedActions: [
      'Compile ISS from CSR-201 + -102',
      'Lock ADaM datasets for -201',
      'Reconcile M3 comparability protocol',
    ],
  },
  memory: {
    visibility: 'Project team', updated: '4 hours ago',
    body: 'Purpose & context — BX-204 is a humanized IgG1κ monoclonal antibody (anti–RTK-X) pursuing accelerated approval under NDA 212345 for advanced RTK-X–overexpressing solid tumors. Pivotal trial BX204-201 reads ORR as the primary endpoint (accelerated-approval basis), DoR supportive. Strategy: rolling NDA to FDA OND; Module 3 CMC comparability (pre/post process change) is the gating risk to freeze. Confirmatory BX204-301 enrolling. Commercial target: approval Q3 2026.',
  },
  instructions: {
    updated: '2 days ago',
    body: 'Author to ICH CTD granularity and the FDA eCTD module map. Every efficacy claim must cite the LOCKED CSR-201 dataset — never re-derive a statistic. Use the program glossary for endpoint nomenclature (ORR, DoR, PFS). Module 2 summaries reconcile to their Module 5 source; Module 3 traces to the comparability protocol. Require dual-review (Reg + Medical) and a 21 CFR §11 e-signature before any section is frozen. Tone: declarative, agency-idiomatic — no promotional language.',
  },
  pyramid: { pathway: 'NDA', label: 'NDA · 7-phase pyramid', phases: [
    { n: 1, name: 'Program planning & strategy', status: 'completed', done: 6, total: 6, critical: false },
    { n: 2, name: 'Module 3 — CMC & comparability', status: 'in-progress', done: 7, total: 14, critical: true, gate: 'Comparability gates freeze' },
    { n: 3, name: 'Module 4 — Nonclinical', status: 'completed', done: 9, total: 10, critical: false },
    { n: 4, name: 'Module 5 — Clinical & CSR (SDTM/ADaM)', status: 'in-progress', done: 11, total: 18, critical: true },
    { n: 5, name: 'Module 2 — CTD summaries', status: 'in-progress', done: 8, total: 12, critical: false },
    { n: 6, name: 'Module 1 — Administrative & labeling', status: 'pending', done: 3, total: 9, critical: false },
    { n: 7, name: 'QA · eCTD compile · validate · dispatch', status: 'pending', done: 0, total: 7, critical: true, gate: 'eValidator 0 errors to dispatch' },
  ] },
  schedule: {
    generatedByAna: true, confidence: 0.86, updated: '6h ago',
    basis: 'Schedule derived from the NDA pyramid critical path and the locked CSR-201 read. M3 comparability is the gating path; ISS compilation is the near-term constraint.',
    goals: [
      { t: 'Module 3 comparability locked', status: 'at_risk', when: 'Q2 2026' },
      { t: 'ISS compiled & validated', status: 'active', when: 'Q2 2026' },
      { t: 'Rolling NDA — clinical components submitted', status: 'active', when: 'Q3 2026' },
      { t: 'eCTD final sequence dispatched (ESG)', status: 'active', when: 'Q3 2026' },
    ],
  },
  tasks: [
    { id: 'T-204-31', name: 'Reconcile Module 3 comparability protocol (pre/post change)', status: 'in-progress', priority: 'urgent', module: 'CMC', assignee: 'M. Webb', due: 'in 3 days', ctq: true, critical: true, phase: 2, dependsOn: [] },
    { id: 'T-204-32', name: 'Author 3.2.S.4 Control of Drug Substance', status: 'review', priority: 'high', module: 'CMC', assignee: 'M. Webb', due: 'in 5 days', ctq: true, critical: true, phase: 2, dependsOn: ['T-204-31'] },
    { id: 'T-204-38', name: 'Lock ADaM datasets for BX204-201', status: 'in-progress', priority: 'high', module: 'Protocol Design', assignee: 'R. Nair', due: 'in 2 days', ctq: true, critical: true, phase: 4, dependsOn: [] },
    { id: 'T-204-40', name: 'Compile Integrated Summary of Safety (ISS) from CSR-201 + -102', status: 'todo', priority: 'urgent', module: 'eCTD', assignee: 'A. Müller', due: 'in 6 days', ctq: true, critical: true, phase: 4, dependsOn: ['T-204-38'] },
    { id: 'T-204-22', name: 'Reconcile 2.5.4 efficacy claim to locked CSR-201', status: 'review', priority: 'high', module: 'eCTD', assignee: 'J. Chen', due: 'in 1 day', ctq: true, critical: false, phase: 5, dependsOn: [] },
    { id: 'T-204-41', name: 'Draft 2.7.4 Summary of Clinical Safety', status: 'todo', priority: 'high', module: 'eCTD', assignee: 'A. Müller', due: 'in 8 days', ctq: false, critical: false, phase: 5, dependsOn: ['T-204-40'] },
    { id: 'T-204-12', name: 'Convert draft labeling to SPL format', status: 'todo', priority: 'medium', module: 'IND', assignee: 'J. Chen', due: 'in 12 days', ctq: false, critical: false, phase: 6, dependsOn: [] },
    { id: 'T-204-50', name: 'Update environmental assessment (1.12.14)', status: 'todo', priority: 'low', module: 'IND', assignee: 'J. Chen', due: 'in 10 days', ctq: false, critical: false, phase: 6, dependsOn: [] },
    { id: 'T-204-09', name: 'QA review — Form FDA 356h cross-references', status: 'todo', priority: 'medium', module: 'eCTD', assignee: 'Unassigned', due: 'in 14 days', ctq: false, critical: false, phase: 7, dependsOn: ['T-204-40', 'T-204-41'] },
    { id: 'T-204-05', name: 'eValidator pass — Module 4 nonclinical', status: 'done', priority: 'medium', module: 'eCTD', assignee: 'R. Nair', due: 'done', ctq: false, critical: false, phase: 3, dependsOn: [] },
    { id: 'T-204-44', name: 'Pediatric Study Plan §1.9 final', status: 'blocked', priority: 'low', module: 'IND', assignee: 'J. Chen', due: 'blocked', ctq: false, critical: false, phase: 6, dependsOn: ['T-204-12'], blockedReason: 'Awaiting SPL labeling' },
  ],
  board: { orgTotal: 142, byStatus: null },
  readiness: {
    score: 64, isReady: false, blockerCount: 1,
    rulesBased: [
      { rule: 'Module 5 ISS present', kind: 'required_item', severity: 'blocker', status: 'fail' },
      { rule: 'Module 2 summaries reconcile to Module 5', kind: 'cross_reference', severity: 'warning', status: 'warn' },
      { rule: 'eCTD granularity & lifecycle ops', kind: 'validation_check', severity: 'advisory', status: 'pass' },
    ],
    validation: [
      { rule: 'eValidator — Module 3 spec hyperlinks', kind: 'validation_check', severity: 'warning', status: 'warn' },
      { rule: 'PDF/UA + bookmarks (Lorenz)', kind: 'completeness_check', severity: 'advisory', status: 'pass' },
    ],
    aiInferred: [
      { rule: '2.7.4 missing 15-day SUSAR reconciliation', kind: 'quality_gate', severity: 'warning', status: 'warn' },
      { rule: '§2.5.4 efficacy claim not yet traced to locked dataset', kind: 'cross_reference', severity: 'advisory', status: 'warn' },
    ],
  },
  linkedModules: [
    { m: 'cmc', t: 'CMC', done: 48, risk: true }, { m: 'csr', t: 'CSR', done: 58 },
    { m: 'ectd', t: 'eCTD', done: 64 }, { m: 'vault', t: 'Vault', done: 100 },
    { m: 'regulatory_intelligence', t: 'Reg Intelligence', done: 72 },
    { m: 'faers', t: 'FAERS / Safety', done: 66 }, { m: 'analytics', t: 'Analytics', done: 54 },
    { m: 'risk', t: 'Risk', done: 40 },
  ],
  files: [
    { name: '2.5 Clinical Overview.docx', type: 'docx', module: 'M2', section: '2.5', dtype: 'summary', status: 'validated', conf: 0.92 },
    { name: 'CSR — BX204-201.pdf', type: 'pdf', module: 'M5', section: '5.3.5.1', dtype: 'study report', status: 'validated', conf: 0.95 },
    { name: '2.7.3 Summary of Clinical Efficacy.docx', type: 'docx', module: 'M2', section: '2.7.3', dtype: 'summary', status: 'extracted', conf: 0.88 },
    { name: '3.2.S.4 Control of Drug Substance.docx', type: 'docx', module: 'M3', section: '3.2.S.4', dtype: 'specification', status: 'processing', conf: null },
    { name: 'Form FDA 356h.pdf', type: 'pdf', module: 'M1', section: '1.1', dtype: 'cover letter', status: 'validated', conf: null },
    { name: '2.6.4 Pharmacokinetics Written Summary.docx', type: 'docx', module: 'M2', section: '2.6.4', dtype: 'summary', status: 'extracted', conf: 0.81 },
    { name: '3.2.P.5 Control of Drug Product.docx', type: 'docx', module: 'M3', section: '3.2.P.5', dtype: 'specification', status: 'uploaded', conf: null },
    { name: 'Pediatric Study Plan.pdf', type: 'pdf', module: 'M1', section: '1.9', dtype: 'summary', status: 'validated', conf: null },
  ],
  capacity: 61,
  conversations: [
    { t: 'Strengthen §2.5.4 efficacy claim vs CSR-201', when: '2h ago', n: 14 },
    { t: 'ISS strategy — pooling BX204-201 + -102', when: 'Yesterday', n: 8 },
    { t: 'Module 3 comparability gap before freeze', when: 'Jun 11', n: 6 },
    { t: 'Draft Pediatric Study Plan §1.9', when: 'Jun 9', n: 4 },
  ],
  team: [
    { role: 'Reg lead', name: 'Jordan Chen', sig: 'signed' },
    { role: 'Medical', name: 'Ana Müller', sig: 'signed' },
    { role: 'CMC', name: 'Marcus Webb', sig: 'pending' },
    { role: 'Biostat', name: 'Raj Nair', sig: 'signed' },
  ],
  activity: [
    { who: 'AnA', what: 'drafted §2.5.5 Overview of safety', when: '8 m' },
    { who: 'You', what: 'linked CSR-201 §7.4 to §2.7.3', when: '40 m' },
    { who: 'M. Webb', what: 'flagged M3 comparability gap', when: '2 h' },
    { who: 'System', what: 'eValidator — 1 blocker, 4 warnings', when: '3 h' },
  ],
};

/* ── Vault tree ── */

export const PV_TREE: PvNode[] = [
  { id: 'm1', label: 'Module 1 — Administrative & Regional', icon: 'folder', children: [
    { id: 'm1.1', label: '1.1 Forms (FDA 356h / 1571)', children: [
      { id: 'd-m1.1-1', name: 'Form FDA 356h.pdf', type: 'pdf', status: 'approved', ver: 'v1.2', author: 'J. Chen', updated: '3 d ago', size: '210 KB', esig: true },
      { id: 'd-m1.1-2', name: 'Form FDA 1571.pdf', type: 'pdf', status: 'draft', ver: 'v0.3', author: 'J. Chen', updated: '1 d ago', size: '180 KB', esig: false },
    ] },
    { id: 'm1.2', label: '1.2 Cover letter', children: [
      { id: 'd-m1.2-1', name: 'Cover letter — NDA 212345.docx', type: 'docx', status: 'approved', ver: 'v2.0', author: 'J. Chen', updated: '5 d ago', size: '95 KB', esig: true },
    ] },
    { id: 'm1.3', label: '1.3 Administrative information', children: [
      { id: 'd-m1.3-1', name: 'Field copy certification.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'J. Chen', updated: '2 wk ago', size: '42 KB', esig: true },
      { id: 'd-m1.3-2', name: 'Patent information.pdf', type: 'pdf', status: 'draft', ver: 'v0.1', author: 'J. Chen', updated: '4 d ago', size: '68 KB', esig: false },
    ] },
    { id: 'm1.9', label: '1.9 Pediatric Study Plan', children: [
      { id: 'd-m1.9-1', name: 'Pediatric Study Plan.pdf', type: 'pdf', status: 'validated', ver: 'v1.0', author: 'J. Chen', updated: 'Jun 9', size: '320 KB', esig: true },
    ] },
    { id: 'm1.14', label: '1.14 Labeling', children: [
      { id: 'd-m1.14-1', name: 'Draft labeling — package insert.docx', type: 'docx', status: 'draft', ver: 'v0.2', author: 'L. Tran', updated: '2 d ago', size: '185 KB', esig: false },
      { id: 'd-m1.14-2', name: 'Medication guide.docx', type: 'docx', status: 'draft', ver: 'v0.1', author: 'L. Tran', updated: '3 d ago', size: '92 KB', esig: false },
    ] },
  ] },
  { id: 'm2', label: 'Module 2 — CTD Summaries', icon: 'folder', children: [
    { id: 'm2.2', label: '2.2 Introduction', children: [
      { id: 'd-m2.2-1', name: 'CTD Introduction.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'J. Chen', updated: '1 wk ago', size: '48 KB', esig: true },
    ] },
    { id: 'm2.3', label: '2.3 Quality Overall Summary', children: [
      { id: 'd-m2.3-1', name: 'Quality Overall Summary.docx', type: 'docx', status: 'review', ver: 'v0.8', author: 'M. Webb', updated: '12 h ago', size: '1.4 MB', esig: false },
    ] },
    { id: 'm2.4', label: '2.4 Nonclinical Overview', children: [
      { id: 'd-m2.4-1', name: 'Nonclinical Overview.docx', type: 'docx', status: 'approved', ver: 'v1.1', author: 'A. Müller', updated: '5 d ago', size: '890 KB', esig: true },
    ] },
    { id: 'm2.5', label: '2.5 Clinical Overview', children: [
      { id: 'd-m2.5-1', name: '2.5 Clinical Overview.docx', type: 'docx', status: 'validated', ver: 'v0.9', author: 'A. Müller', updated: '4 h ago', size: '2.1 MB', esig: false },
      { id: 'd-m2.5-2', name: '2.5.4 Efficacy discussion — tracked changes.docx', type: 'docx', status: 'review', ver: 'v0.6', author: 'AnA · Maximum', updated: '2 h ago', size: '380 KB', esig: false },
    ] },
    { id: 'm2.6', label: '2.6 Nonclinical Summaries', children: [
      { id: 'd-m2.6-1', name: '2.6.2 Pharmacology Written Summary.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '1 wk ago', size: '620 KB', esig: true },
      { id: 'd-m2.6-2', name: '2.6.4 PK Written Summary.docx', type: 'docx', status: 'extracted', ver: 'v0.7', author: 'A. Müller', updated: '8 h ago', size: '540 KB', esig: false },
      { id: 'd-m2.6-3', name: '2.6.6 Toxicology Written Summary.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '6 d ago', size: '780 KB', esig: true },
    ] },
    { id: 'm2.7', label: '2.7 Clinical Summaries', children: [
      { id: 'd-m2.7-1', name: '2.7.1 Summary of Biopharmaceutic Studies.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'R. Nair', updated: '1 wk ago', size: '410 KB', esig: true },
      { id: 'd-m2.7-2', name: '2.7.2 Summary of Clinical Pharmacology.docx', type: 'docx', status: 'review', ver: 'v0.5', author: 'R. Nair', updated: '1 d ago', size: '680 KB', esig: false },
      { id: 'd-m2.7-3', name: '2.7.3 Summary of Clinical Efficacy.docx', type: 'docx', status: 'extracted', ver: 'v0.4', author: 'A. Müller', updated: '8 h ago', size: '1.2 MB', esig: false },
      { id: 'd-m2.7-4', name: '2.7.4 Summary of Clinical Safety.docx', type: 'docx', status: 'draft', ver: 'v0.1', author: 'Unassigned', updated: '—', size: '—', esig: false },
    ] },
  ] },
  { id: 'm3', label: 'Module 3 — Quality (CMC)', icon: 'folder', children: [
    { id: 'm3.2s', label: '3.2.S Drug Substance', children: [
      { id: 'd-m3s-1', name: '3.2.S.1 General Information.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'M. Webb', updated: '2 wk ago', size: '180 KB', esig: true },
      { id: 'd-m3s-2', name: '3.2.S.2 Manufacture.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'M. Webb', updated: '2 wk ago', size: '2.8 MB', esig: true },
      { id: 'd-m3s-3', name: '3.2.S.3 Characterisation.docx', type: 'docx', status: 'review', ver: 'v0.9', author: 'M. Webb', updated: '3 d ago', size: '4.2 MB', esig: false },
      { id: 'd-m3s-4', name: '3.2.S.4 Control of Drug Substance.docx', type: 'docx', status: 'processing', ver: 'v0.3', author: 'M. Webb', updated: 'in progress', size: '1.6 MB', esig: false },
      { id: 'd-m3s-5', name: '3.2.S.7 Stability.docx', type: 'docx', status: 'approved', ver: 'v2.0', author: 'M. Webb', updated: '1 wk ago', size: '3.1 MB', esig: true },
    ] },
    { id: 'm3.2p', label: '3.2.P Drug Product', children: [
      { id: 'd-m3p-1', name: '3.2.P.1 Description and Composition.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'M. Webb', updated: '2 wk ago', size: '320 KB', esig: true },
      { id: 'd-m3p-2', name: '3.2.P.2 Pharmaceutical Development.docx', type: 'docx', status: 'approved', ver: 'v1.1', author: 'M. Webb', updated: '10 d ago', size: '5.4 MB', esig: true },
      { id: 'd-m3p-3', name: '3.2.P.3 Manufacture.docx', type: 'docx', status: 'review', ver: 'v0.8', author: 'M. Webb', updated: '2 d ago', size: '2.9 MB', esig: false },
      { id: 'd-m3p-4', name: '3.2.P.5 Control of Drug Product.docx', type: 'docx', status: 'uploaded', ver: 'v0.1', author: 'M. Webb', updated: 'today', size: '1.1 MB', esig: false },
      { id: 'd-m3p-5', name: '3.2.P.8 Stability.docx', type: 'docx', status: 'approved', ver: 'v1.0', author: 'M. Webb', updated: '1 wk ago', size: '2.6 MB', esig: true },
    ] },
    { id: 'm3.comp', label: 'Comparability Protocol', children: [
      { id: 'd-m3c-1', name: 'Comparability Protocol — pre/post process change.docx', type: 'docx', status: 'draft', ver: 'v0.4', author: 'M. Webb', updated: '3 d ago', size: '890 KB', esig: false },
    ] },
  ] },
  { id: 'm4', label: 'Module 4 — Nonclinical', icon: 'folder', children: [
    { id: 'm4.2.1', label: '4.2.1 Pharmacology', children: [
      { id: 'd-m4-1', name: 'Primary pharmacodynamics report.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '3 wk ago', size: '8.4 MB', esig: true },
      { id: 'd-m4-2', name: 'Secondary pharmacology & safety pharmacology.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '3 wk ago', size: '4.2 MB', esig: true },
    ] },
    { id: 'm4.2.2', label: '4.2.2 Pharmacokinetics', children: [
      { id: 'd-m4-3', name: 'ADME studies.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'R. Nair', updated: '3 wk ago', size: '6.1 MB', esig: true },
    ] },
    { id: 'm4.2.3', label: '4.2.3 Toxicology', children: [
      { id: 'd-m4-4', name: 'Single-dose toxicity.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '4 wk ago', size: '3.8 MB', esig: true },
      { id: 'd-m4-5', name: 'Repeat-dose toxicity — 26-week GLP.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '4 wk ago', size: '12.4 MB', esig: true },
      { id: 'd-m4-6', name: 'Reproductive toxicity.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '4 wk ago', size: '5.9 MB', esig: true },
    ] },
  ] },
  { id: 'm5', label: 'Module 5 — Clinical', icon: 'folder', children: [
    { id: 'm5.3.1', label: '5.3.1 BA / BE Studies', children: [
      { id: 'd-m5-1', name: 'BA study report — BX204-101.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'R. Nair', updated: '2 wk ago', size: '4.8 MB', esig: true },
    ] },
    { id: 'm5.3.3', label: '5.3.3 PK/PD Studies', children: [
      { id: 'd-m5-2', name: 'Pop-PK analysis report.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'R. Nair', updated: '2 wk ago', size: '3.2 MB', esig: true },
      { id: 'd-m5-3', name: 'Exposure-response analysis.pdf', type: 'pdf', status: 'review', ver: 'v0.9', author: 'R. Nair', updated: '5 d ago', size: '2.8 MB', esig: false },
    ] },
    { id: 'm5.3.5', label: '5.3.5 Efficacy & Safety (CSR)', children: [
      { id: 'd-m5-4', name: 'CSR — BX204-201 (pivotal).pdf', type: 'pdf', status: 'validated', ver: 'v1.0', author: 'A. Müller', updated: '1 wk ago', size: '48.2 MB', esig: true },
      { id: 'd-m5-5', name: 'CSR — BX204-102 (dose-finding).pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '3 wk ago', size: '22.6 MB', esig: true },
      { id: 'd-m5-6', name: 'ISS (Integrated Summary of Safety).docx', type: 'docx', status: 'draft', ver: 'v0.0', author: 'Unassigned', updated: '—', size: '—', esig: false },
      { id: 'd-m5-7', name: 'ISE (Integrated Summary of Efficacy).docx', type: 'docx', status: 'draft', ver: 'v0.1', author: 'A. Müller', updated: '2 d ago', size: '1.8 MB', esig: false },
    ] },
    { id: 'm5.3.6', label: '5.3.6 Post-Marketing', children: [] },
    { id: 'm5.4', label: '5.4 Literature References', children: [
      { id: 'd-m5-8', name: 'FDA 2023 accelerated approval guidance.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'J. Chen', updated: '1 mo ago', size: '1.2 MB', esig: false },
      { id: 'd-m5-9', name: 'RTK-X landscape review — ASCO 2025.pdf', type: 'pdf', status: 'approved', ver: 'v1.0', author: 'A. Müller', updated: '3 wk ago', size: '890 KB', esig: false },
    ] },
  ] },
  { id: 'ev', label: 'Evidence & Source Data', icon: 'folder', children: [
    { id: 'ev.csr', label: 'CSR Datasets', children: [
      { id: 'd-ev-1', name: 'CSR-201 SDTM dataset.zip', type: 'zip', status: 'validated', ver: 'v1.0', author: 'R. Nair', updated: '2 wk ago', size: '142 MB', esig: true },
      { id: 'd-ev-2', name: 'CSR-201 ADaM dataset.zip', type: 'zip', status: 'processing', ver: 'v0.9', author: 'R. Nair', updated: 'in progress', size: '98 MB', esig: false },
      { id: 'd-ev-3', name: 'CSR-102 SDTM dataset.zip', type: 'zip', status: 'validated', ver: 'v1.0', author: 'R. Nair', updated: '3 wk ago', size: '86 MB', esig: true },
    ] },
    { id: 'ev.sap', label: 'Statistical Analysis Plans', children: [
      { id: 'd-ev-4', name: 'SAP — BX204-201 v3.pdf', type: 'pdf', status: 'approved', ver: 'v3.0', author: 'R. Nair', updated: '1 mo ago', size: '2.4 MB', esig: true },
      { id: 'd-ev-5', name: 'SAP — BX204-102 v2.pdf', type: 'pdf', status: 'approved', ver: 'v2.0', author: 'R. Nair', updated: '2 mo ago', size: '1.8 MB', esig: true },
    ] },
    { id: 'ev.tpp', label: 'Target Product Profile', children: [
      { id: 'd-ev-6', name: 'TPP v3.2 — BX-204.docx', type: 'docx', status: 'approved', ver: 'v3.2', author: 'J. Chen', updated: '2 wk ago', size: '420 KB', esig: true },
    ] },
  ] },
];

function flattenPvTree(nodes: PvNode[]): PvNode[] {
  const out: PvNode[] = [];
  for (const n of nodes) {
    if (n.children) out.push(...flattenPvTree(n.children));
    else if (n.name) out.push(n);
  }
  return out;
}

export const pvAllDocs = flattenPvTree(PV_TREE);
export const pvStats = {
  total: pvAllDocs.length,
  approved: pvAllDocs.filter(d => d.status === 'approved').length,
  review: pvAllDocs.filter(d => d.status === 'review').length,
  draft: pvAllDocs.filter(d => d.status === 'draft').length,
  esig: pvAllDocs.filter(d => d.esig).length,
};

/* ── Meetings ── */

export const PROJ_MEETINGS: ProjMeeting[] = [
  { id: 'MTG-001', interactionType: 'pre_nda', type: 'Pre-NDA', agency: 'FDA · CDER', date: '2026-04-15', status: 'completed', attendees: ['J. Chen', 'A. Müller', 'R. Nair'],
    topic: 'Pre-NDA meeting for BX-204 accelerated approval pathway',
    outcome: 'FDA agreed to single pivotal trial design; confirmed accelerated approval eligibility based on ORR endpoint.',
    briefingBook: 'Briefing book v3.pdf', documents: ['Briefing book v3.pdf', 'Meeting request letter.pdf', 'FDA official minutes.pdf'],
    questions: [
      { num: 1, text: 'Will FDA accept a single-arm pivotal trial with ORR as the primary endpoint for accelerated approval?', sponsorPos: 'Single-arm is appropriate given unmet medical need and absence of an active comparator.', agencyResp: 'FDA confirmed accelerated approval eligibility based on ORR. Confirmatory trial post-approval required.', agreed: true },
      { num: 2, text: 'Is the pre-specified historical control ORR of 25% acceptable?', sponsorPos: 'Historical control derived from 5 pooled registry datasets (2018–2023).', agencyResp: 'Acceptable. Sponsor should provide pooling rationale and sensitivity analysis in Module 2.7.1.', agreed: true },
    ],
    commitments: [
      { type: 'pmc', desc: 'Confirmatory overall survival data from BX204-301 randomised trial', status: 'open', due: '2028-03-31', basis: 'FDAAA 505(o)(3)' },
    ],
  },
  { id: 'MTG-002', interactionType: 'type_b', type: 'Type B', agency: 'FDA · CDER', date: '2026-05-20', status: 'completed', attendees: ['J. Chen', 'M. Webb'],
    topic: 'CMC comparability strategy discussion — pre/post manufacturing change',
    outcome: 'FDA acceptable with comparability protocol; no additional clinical bridging study required.',
    briefingBook: 'CMC briefing document.pdf', documents: ['CMC briefing document.pdf', 'Meeting minutes.pdf'],
    questions: [
      { num: 1, text: 'Is the proposed comparability protocol for the manufacturing process change acceptable without an additional clinical bridging study?', sponsorPos: 'Pre- and post-change product demonstrate equivalent biophysical and functional characteristics.', agencyResp: 'Acceptable with comparability protocol. No additional clinical bridging study required.', agreed: true },
    ],
    commitments: [
      { type: 'meeting_commitment', desc: 'Submit updated Module 3 comparability data package within 90 days of meeting', status: 'in_progress', due: '2026-08-20', basis: 'Meeting minutes MTG-002' },
    ],
  },
  { id: 'MTG-003', interactionType: 'scientific_advice', type: 'Scientific advice', agency: 'EMA · CHMP', date: '2026-07-10', status: 'scheduled', attendees: ['J. Chen', 'A. Müller'],
    topic: 'Scientific advice — EU marketing authorization strategy for BX-204', outcome: null,
    briefingBook: 'Briefing book draft.docx', documents: ['Briefing book draft.docx', 'EMA submission form.pdf'],
    questions: [
      { num: 1, text: 'Is the clinical evidence package sufficient for an EU MAA given that the pivotal trial was US-based?', sponsorPos: 'Bridging through EU-site subset data and PK bridging study (BX204-104).', agencyResp: null, agreed: false },
      { num: 2, text: 'What RMP routine risk minimisation measures are required?', sponsorPos: 'Patient alert card (hepatotoxicity monitoring) + HCP educational material.', agencyResp: null, agreed: false },
    ],
    commitments: [],
  },
  { id: 'MTG-004', interactionType: 'type_a', type: 'Type A', agency: 'FDA · CDER', date: '2026-08-01', status: 'requested', attendees: ['J. Chen'],
    topic: 'Dispute resolution — Module 3 comparability hold', outcome: null, briefingBook: null, documents: ['Meeting request.pdf'],
    questions: [
      { num: 1, text: 'Does the Module 3 comparability data submitted in response to the CMC information request resolve the hold?', sponsorPos: 'Yes — comparability bridging study (CP-204) fully characterises pre/post changes.', agencyResp: null, agreed: false },
    ],
    commitments: [],
  },
  { id: 'MTG-005', interactionType: 'pre_ind', type: 'Pre-IND consultation', agency: 'PMDA', date: '2026-09-15', status: 'planned', attendees: ['J. Chen', 'A. Müller', 'R. Nair'],
    topic: 'PMDA consultation for Japan NDA filing strategy', outcome: null, briefingBook: null, documents: [], questions: [], commitments: [],
  },
];

export const MTG_TONE: Record<string, string> = { completed: 'ok', scheduled: 'ai', requested: 'warn', planned: 'idle', cancelled: 'err' };
export const MTG_ICON: Record<string, string> = { completed: 'checkCircle', scheduled: 'calendar', requested: 'clock', planned: 'calendar', cancelled: 'x' };

/* ── Lifecycle ── */

export const PJ_LIFECYCLE: LifecycleStage[] = [
  { id: 'plan', label: 'Plan', icon: 'calendar', blurb: 'Strategy, precedent, agency meetings & timeline' },
  { id: 'evidence', label: 'Evidence', icon: 'search', blurb: 'Vault, RAG search & claim↔evidence linking' },
  { id: 'author', label: 'Author', icon: 'penLine', blurb: 'Draft eCTD sections with AnA, track changes' },
  { id: 'review', label: 'Review', icon: 'checkCircle', blurb: 'Review, approve & e-sign' },
  { id: 'submit', label: 'Submit', icon: 'rocket', blurb: 'Assemble eCTD, validate & transmit' },
  { id: 'respond', label: 'Respond', icon: 'messageCircle', blurb: 'Health-authority questions & responses' },
  { id: 'lifecycle', label: 'Lifecycle', icon: 'globe', blurb: 'Registrations, variations, market access & PV' },
];

export const PJ_STAGE_NEXT: Record<string, string> = {
  plan: 'Type B meeting briefing book due in 12 days',
  evidence: '3 claims in §2.5 still need a linked source',
  author: '§2.5 Clinical Overview at 72% — 2 contradictions to resolve',
  review: '4 sections awaiting your review & e-signature',
  submit: 'eCTD validation: 2 errors to clear before transmit',
  respond: 'FDA Day-74 information request — 6 questions open',
  lifecycle: '2 markets due for renewal this quarter',
};

export const PJ_STAGE_TOOLS: Record<string, StageTool[]> = {
  plan: [
    { id: 'global-ri', label: 'Regulatory intelligence', desc: 'Pathways, precedent & global landscape', icon: 'globe' },
    { id: 'precedent-intelligence', label: 'Precedent intelligence', desc: 'Approved analogues in this therapeutic area', icon: 'scale' },
    { id: 'agency-meetings', label: 'Agency meetings', desc: 'Briefing books, questions & minutes', icon: 'calendar' },
  ],
  respond: [
    { id: 'haq-manager', label: 'HA questions', desc: 'Track & respond to deficiency letters', icon: 'messageCircle' },
    { id: 'global-ri', label: 'Precedent responses', desc: 'How analogues answered similar questions', icon: 'globe' },
    { id: 'document-authoring', label: 'Response authoring', desc: 'Draft governed responses with AnA', icon: 'penLine' },
  ],
  lifecycle: [
    { id: 'registrations', label: 'Registrations', desc: 'Market registrations & variations', icon: 'globe' },
    { id: 'market-access', label: 'Market access', desc: 'Pricing, reimbursement & HTA', icon: 'barChart' },
    { id: 'safety-narrative', label: 'Pharmacovigilance', desc: 'Safety narratives & signal detection', icon: 'shieldCheck' },
  ],
};

/* ── Portfolio ── */

export const PROJECTS: ProjPortfolioEntry[] = [
  { id: 'or902', title: 'OR-902 Spinal Implant', ws: 'MDX', code: 'Class II · 510(k)', stage: 'Submit', readiness: 98, status: 'active', lead: 'S. Marchetti', blocker: null, due: 'FDA · 4 days', activity: '22 m ago' },
  { id: 'bx204', title: 'BX-204 Continuous Glucose Monitor', ws: 'MDX', code: 'Class II · 510(k)', stage: 'Substantial equivalence', readiness: 72, status: 'active', lead: 'J. Chen', blocker: 'Predicate K221847 performance mismatch', due: 'FDA · 41 days', activity: '2 h ago' },
  { id: 'iv415', title: 'IV-415 Companion Diagnostic', ws: 'MDX', code: 'Class III · CER', stage: 'Clinical evaluation', readiness: 34, status: 'blocked', lead: 'A. Müller', blocker: 'FAERS signal adjudication — 3 events', due: 'EU MDR · Q1', activity: '3 h ago' },
  { id: 'nda212', title: 'NDA 212345 — oncology biologic', ws: 'Pharma', code: 'NDA', stage: 'CTD assembly', readiness: 64, status: 'active', lead: 'J. Chen', blocker: null, due: 'FDA · Q3 2026', activity: '1 h ago' },
  { id: 'biobla', title: 'ACME-BIO-001 anti-RTKX biologic', ws: 'Biotech', code: 'BLA 351(a)', stage: 'Phase 3', readiness: 58, status: 'active', lead: 'M. Webb', blocker: null, due: 'BLA · Q4 2026', activity: '5 h ago' },
  { id: 'ind776', title: 'IND 776 first-in-human', ws: 'Biotech', code: 'IND', stage: 'Safe to proceed', readiness: 100, status: 'complete', lead: 'R. Nair', blocker: null, due: 'Cleared', activity: '2 d ago' },
  { id: 'maa118', title: 'MAA-118 centralized procedure', ws: 'Pharma', code: 'MAA', stage: 'Transmit', readiness: 88, status: 'active', lead: 'A. Müller', blocker: null, due: 'EMA · sent', activity: '6 h ago' },
  { id: 'cv330', title: 'CV-330 Implantable Monitor', ws: 'MDX', code: 'Class III · PMA', stage: 'Pivotal trial', readiness: 61, status: 'active', lead: 'M. Webb', blocker: 'DSMB charter pending CRO sign-off', due: 'PMA · Q3 2026', activity: '1 d ago' },
];

export const WS_TONE: Record<string, string> = { MDX: 'ai', Biotech: 'ok', Pharma: 'warn', CRO: 'idle' };

export const NP_TEAMS: NpTeamMember[] = [
  { name: 'Jordan Chen', role: 'Reg Lead' }, { name: 'Ana Müller', role: 'Medical' },
  { name: 'Marcus Webb', role: 'CMC' }, { name: 'Raj Nair', role: 'Biostatistics' },
  { name: 'Priya Shah', role: 'Quality' }, { name: 'Linh Tran', role: 'Labeling' },
  { name: 'David Kapoor', role: 'Generics' }, { name: 'Kim Lindström', role: 'EU MDR' },
];

/* ── Tone / label maps ── */

export const TASK_TONE: Record<string, string> = { todo: 'idle', 'in-progress': 'acc', review: 'warn', done: 'ok', blocked: 'err' };
export const TASK_LABEL: Record<string, string> = { todo: 'To do', 'in-progress': 'In progress', review: 'In review', done: 'Done', blocked: 'Blocked' };
export const PRI_TONE: Record<string, string> = { urgent: 'err', high: 'warn', medium: 'acc', low: 'idle' };
export const PHASE_TONE: Record<string, string> = { completed: 'ok', 'in-progress': 'acc', pending: 'idle', blocked: 'err' };
export const GOAL_TONE: Record<string, string> = { achieved: 'ok', active: 'acc', at_risk: 'warn', revised: 'idle', dropped: 'idle' };
export const FIND_TONE: Record<string, string> = { pass: 'ok', warn: 'warn', fail: 'err' };

export const KANBAN_COLS = ['todo', 'in-progress', 'review', 'done', 'blocked'] as const;

export const TASK_TONE2: Record<string, string> = { todo: 'idle', 'in-progress': 'ai', review: 'warn', done: 'ok', blocked: 'err' };
export const TASK_LABEL2: Record<string, string> = { todo: 'To do', 'in-progress': 'In progress', review: 'In review', done: 'Done', blocked: 'Blocked' };
export const PRI_TONE2: Record<string, string> = { urgent: 'err', high: 'warn', medium: 'idle', low: 'idle' };

export const PV_TYPE_BG: Record<string, string> = { pdf: 'var(--error)', docx: 'var(--ai)', xlsx: 'var(--success)', zip: 'var(--accent-200)', xml: 'var(--warning)' };

export const STAT_ORDER = ['todo', 'in-progress', 'review', 'done', 'blocked'] as const;

/* ── Helpers ── */

export function pjInitials(n: string): string {
  return (n || '').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
}

export function fileTone(s: string): string {
  if (s === 'validated' || s === 'approved') return 'ok';
  if (s === 'extracted') return 'acc';
  if (s === 'review' || s === 'processing') return 'warn';
  if (s === 'draft' || s === 'uploaded') return 'idle';
  if (s === 'error') return 'err';
  return 'idle';
}

export function Ring({ value, size = 128, stroke = 11 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-200)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-100)" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text-100)', fontFamily: 'var(--font-sans)' }}>{value}%</text>
    </svg>
  );
}
