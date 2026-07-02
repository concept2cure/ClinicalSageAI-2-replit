/**
 * Workbench fixtures — Tasks, Validation Center, Submission Center,
 * Templates. Ported verbatim from data-workbench.jsx.
 * Vault fixtures live in data/vault.ts next to surfaces/VaultSurface.tsx.
 */

export type TaskCol = 'todo' | 'doing' | 'review' | 'blocked' | 'done';
export type Tone = 'ok' | 'warn' | 'err' | 'default' | 'active' | 'review' | 'blocked' | 'complete';

export interface TaskColumn {
  id: TaskCol;
  label: string;
  tone: Tone;
}

export interface Task {
  id: string;
  col: TaskCol;
  prog: string;
  sect: string;
  title: string;
  assignee: string;
  due: string;
  tone: Tone;
  label: string;
  kind: 'edit' | 'review' | 'sign';
  esig: boolean;
  comments: number;
}

export interface TaskMetric {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: Tone;
}

export const TASKS_COLUMNS: TaskColumn[] = [
  { id: 'todo',     label: 'To do',       tone: 'default' },
  { id: 'doing',    label: 'In progress', tone: 'active' },
  { id: 'review',   label: 'In review',   tone: 'review' },
  { id: 'blocked',  label: 'Blocked',     tone: 'blocked' },
  { id: 'done',     label: 'Done',        tone: 'complete' },
];

export const TASKS: Task[] = [
  { id: 'T-4821', col: 'blocked', prog: 'OR-801', sect: '§11',        title: 'Rewrite biocompat paragraph — blocker CE-01',          assignee: 'SM', due: '2 days',    tone: 'err',  label: 'Blocker · eSTAR', kind: 'edit',   esig: false, comments: 4 },
  { id: 'T-4820', col: 'review',  prog: 'OR-801', sect: '§14',        title: 'Peer review — biocompatibility report',                assignee: 'LT', due: '3 days',    tone: 'warn', label: 'Peer review',     kind: 'review', esig: true,  comments: 2 },
  { id: 'T-4818', col: 'review',  prog: 'CV-330', sect: '§Clinical',  title: 'DSMB charter sign-off',                                assignee: 'MW', due: '5 days',    tone: 'warn', label: 'E-signature',     kind: 'sign',   esig: true,  comments: 7 },
  { id: 'T-4817', col: 'doing',   prog: 'OR-801', sect: '§11',        title: 'Close comment thread on SE table',                     assignee: 'SM', due: 'today',     tone: 'err',  label: 'Comment',         kind: 'edit',   esig: false, comments: 3 },
  { id: 'T-4816', col: 'doing',   prog: 'IV-415', sect: 'CER',        title: 'Adjudicate 3 FAERS events — lead dislodgement',        assignee: 'AM', due: '4 days',    tone: 'warn', label: 'Adjudication',    kind: 'review', esig: false, comments: 5 },
  { id: 'T-4815', col: 'doing',   prog: 'DX-102', sect: '§17',        title: 'Analytical sensitivity validation — 14 analytes',      assignee: 'PS', due: '1 wk',      tone: 'warn', label: 'Test data',       kind: 'edit',   esig: false, comments: 1 },
  { id: 'T-4812', col: 'todo',    prog: 'OR-902', sect: '§03',        title: 'Final cover-letter sign-off',                          assignee: 'SM', due: '4 days',    tone: 'err',  label: 'Submit-gate',     kind: 'sign',   esig: true,  comments: 0 },
  { id: 'T-4811', col: 'todo',    prog: 'BX-204', sect: 'Predicate',  title: 'Reconcile K221847 performance mismatch',               assignee: 'JC', due: '1 wk',      tone: 'warn', label: 'Reg analysis',    kind: 'review', esig: false, comments: 2 },
  { id: 'T-4810', col: 'todo',    prog: 'RX-340', sect: 'Predicate',  title: 'Shortlist 2 strongest K-matches',                      assignee: 'LT', due: '2 wk',      tone: 'ok',   label: 'Research',        kind: 'review', esig: false, comments: 0 },
  { id: 'T-4805', col: 'done',    prog: 'OR-801', sect: '§10',        title: 'Update device description for anodize change',         assignee: 'SM', due: 'yesterday', tone: 'ok',   label: 'Closed',          kind: 'edit',   esig: false, comments: 2 },
  { id: 'T-4803', col: 'done',    prog: 'OR-801', sect: '§06',        title: 'Truthful and accuracy attestation',                    assignee: 'JC', due: '2d ago',    tone: 'ok',   label: 'Closed',          kind: 'sign',   esig: true,  comments: 0 },
];

export const TASKS_METRICS: TaskMetric[] = [
  { label: 'Open across portfolio', metric: '47',  meta: '11 blockers · 9 in review' },
  { label: 'Due this week',         metric: '14',  meta: 'OR-801 and OR-902 account for 9' },
  { label: 'Awaiting my action',    metric: '6',   meta: '3 reviews · 2 e-sig · 1 blocker', tone: 'warn' },
  { label: 'Cycle time median',     metric: '2.4', unit: 'd', meta: 'Down 0.3d vs last month' },
];

// ── Validation Center ────────────────────────────────────────────────────

export interface ValidationSummary { label: string; metric: string; unit?: string; meta: string; tone?: Tone }
export interface ValidationProgram { id: string; code: string; title: string; pathway: string; errs: number; warns: number; ok: number; status: 'blocked' | 'active' | 'complete'; readiness: number }
export interface ValidationRule { id: string; prog: string; sect: string; severity: 'err' | 'warn' | 'ok'; category: string; msg: string; since: string }

export const VALIDATION_SUMMARY: ValidationSummary[] = [
  { label: 'Blockers',       metric: '3',   meta: 'OR-801 §11 · DX-102 §17 · CV-330 Clinical', tone: 'err' },
  { label: 'Warnings',       metric: '18',  meta: 'Across 6 active programs',                  tone: 'warn' },
  { label: 'Rules passing',  metric: '214', meta: '92% of required-field coverage',            tone: 'ok' },
  { label: 'Programs ready', metric: '2',   unit: '/ 14', meta: 'OR-902 and CV-117 pass all gates' },
];

export const VALIDATION_PROGRAMS: ValidationProgram[] = [
  { id: 'or801', code: 'OR-801', title: 'Screw system',         pathway: '510(k)',  errs: 1, warns: 4, ok: 15, status: 'blocked',  readiness: 84 },
  { id: 'or902', code: 'OR-902', title: 'Spinal implant',       pathway: '510(k)',  errs: 0, warns: 0, ok: 20, status: 'complete', readiness: 98 },
  { id: 'cv330', code: 'CV-330', title: 'Implantable monitor',  pathway: 'PMA',     errs: 1, warns: 3, ok: 12, status: 'blocked',  readiness: 61 },
  { id: 'bx204', code: 'BX-204', title: 'CGM',                  pathway: '510(k)',  errs: 0, warns: 5, ok: 15, status: 'active',   readiness: 72 },
  { id: 'dx102', code: 'DX-102', title: 'IVD cartridge',        pathway: 'De Novo', errs: 1, warns: 3, ok: 14, status: 'blocked',  readiness: 48 },
  { id: 'iv415', code: 'IV-415', title: 'Companion diagnostic', pathway: 'CER',     errs: 0, warns: 3, ok: 9,  status: 'active',   readiness: 34 },
  { id: 'pm660', code: 'PM-660', title: 'Patient monitor SW',   pathway: '510(k)',  errs: 0, warns: 2, ok: 18, status: 'active',   readiness: 67 },
  { id: 'cv117', code: 'CV-117', title: 'ECG patch',            pathway: '510(k)',  errs: 0, warns: 0, ok: 20, status: 'complete', readiness: 100 },
];

export const VALIDATION_RULES: ValidationRule[] = [
  { id: 'CE-01',     prog: 'OR-801', sect: '§11',      severity: 'err',  category: 'Claim-evidence', msg: 'Biocompat claim references §14 evidence with status "review" — not yet locked.',                              since: '2h ago' },
  { id: 'eSTAR-11.2',prog: 'CV-330', sect: 'Clinical', severity: 'err',  category: 'Required field', msg: 'Primary endpoint power calculation not attached. Rule eSTAR §VII-11.2 requires signed SAP.',                  since: '1d ago' },
  { id: 'eSTAR-17.4',prog: 'DX-102', sect: '§17',      severity: 'err',  category: 'Required field', msg: 'Analytical sensitivity table missing 3 of 14 analyte rows (thyroxine, cortisol, troponin-I).',                since: '4h ago' },
  { id: 'CE-02',     prog: 'OR-801', sect: '§11',      severity: 'warn', category: 'Claim-evidence', msg: 'Pull-out force claim cites TR-OR801-009 — attachment missing in §17.',                                          since: '5h ago' },
  { id: 'DR-07',     prog: 'OR-801', sect: '§03',      severity: 'warn', category: 'Drafting',       msg: 'Cover letter word count (640) below typical FDA submission threshold (~800).',                                  since: '5h ago' },
  { id: 'VR-22',     prog: 'BX-204', sect: 'Predicate',severity: 'warn', category: 'Predicate',      msg: 'K221847 performance data shows MARD delta > 0.5% — needs rationale in §11.',                                    since: '2d ago' },
  { id: 'eSTAR-12.1',prog: 'CV-330', sect: 'Labeling', severity: 'warn', category: 'Labeling',       msg: 'MRI-conditional statement language not yet aligned with notified body draft.',                                  since: '3d ago' },
  { id: 'UDI-04',    prog: 'PM-660', sect: 'Labeling', severity: 'warn', category: 'UDI',            msg: 'DI-level GUDID record missing 2 required DI-PI attributes (lot, manufacture date).',                            since: '1d ago' },
];

// ── Submission Center ────────────────────────────────────────────────────

export interface SubmissionStage { id: string; label: string; desc: string }
export interface SubmissionLogEntry { when: string; who: string; what: string }
export interface Submission {
  id: string;
  prog: string;
  pathway: string;
  stage: string;
  status: 'active' | 'blocked' | 'complete';
  title: string;
  target: string;
  bytes: string;
  files: number;
  cover: 'signed' | 'draft';
  esig: boolean;
  transmitAt: string | null;
  targetAt: string;
  tone: Tone;
  gate: { errs: number; warns: number; ok: number };
  log: SubmissionLogEntry[];
}

export const SUBMISSION_PIPELINE: SubmissionStage[] = [
  { id: 'package',   label: 'Package',         desc: 'eSTAR export · attachments' },
  { id: 'validate',  label: 'Validate',        desc: 'Required-field · claims' },
  { id: 'sign',      label: 'Cover + sign',    desc: 'Cover letter · e-signature' },
  { id: 'transmit',  label: 'Transmit',        desc: 'FDA ESG · notified body' },
  { id: 'ack',       label: 'Acknowledgement', desc: 'Receipt · review clock' },
  { id: 'review',    label: 'Review',          desc: 'Substantive · deficiency' },
  { id: 'decision',  label: 'Decision',        desc: 'Cleared · approved' },
];

export const SUBMISSIONS: Submission[] = [
  { id: 's1', prog: 'OR-902', pathway: '510(k)', stage: 'transmit', status: 'active',   title: 'OR-902 Spinal implant — final eSTAR',         target: 'FDA · ESG',     bytes: '142 MB', files: 48, cover: 'signed', esig: true,  transmitAt: null,           targetAt: '4 days', tone: 'warn',
    gate: { errs: 0, warns: 0, ok: 20 }, log: [
      { when: '22 min ago', who: 'S. Marchetti',        what: 'Cover letter e-signed (AUD-9104)' },
      { when: '1h ago',     who: 'Validation Center',    what: 'All 20 eSTAR sections pass — ready to transmit' },
      { when: '2h ago',     who: 'Claude · Sonnet 4.5',  what: 'Drafted 510(k) summary revision · 2 edits' },
    ]},
  { id: 's2', prog: 'OR-801', pathway: '510(k)', stage: 'validate', status: 'blocked',  title: 'OR-801 Screw system — Q1 filing',              target: 'FDA · ESG',     bytes: '98 MB',  files: 41, cover: 'draft',  esig: false, transmitAt: null,           targetAt: '22 days', tone: 'warn',
    gate: { errs: 1, warns: 4, ok: 15 }, log: [
      { when: 'Just now',   who: 'Validation Center', what: 'Blocker CE-01 in §11 · biocompat evidence not locked' },
      { when: '3h ago',     who: 'L. Tran',           what: 'Biocompat -11 report sent for internal review' },
      { when: 'Yesterday',  who: 'S. Marchetti',      what: 'eSTAR package snapshot (41 files)' },
    ]},
  { id: 's3', prog: 'CV-117', pathway: '510(k)', stage: 'decision', status: 'complete', title: 'CV-117 ECG patch · K254481',                   target: 'FDA · ESG',     bytes: '76 MB',  files: 37, cover: 'signed', esig: true,  transmitAt: 'Feb 3, 2026',  targetAt: '—', tone: 'ok',
    gate: { errs: 0, warns: 0, ok: 20 }, log: [
      { when: 'Feb 14',     who: 'FDA',     what: 'CLEARED · K254481 · 87-day cycle' },
      { when: 'Feb 3',      who: 'FDA',     what: 'Acknowledgement received · review clock started' },
      { when: 'Feb 3',      who: 'M. Webb', what: 'Transmitted via ESG · receipt 254481-rcpt' },
    ]},
  { id: 's4', prog: 'BX-204', pathway: '510(k)', stage: 'package',  status: 'active',   title: 'BX-204 CGM — pre-submission bundle',           target: 'FDA · ESG',     bytes: '62 MB',  files: 24, cover: 'draft',  esig: false, transmitAt: null,           targetAt: '41 days', tone: 'ok',
    gate: { errs: 0, warns: 5, ok: 15 }, log: [
      { when: '5h ago',     who: 'J. Chen',           what: 'SE matrix finalized for K221847' },
      { when: '2d ago',     who: 'Claude · Opus 4.5', what: 'Drafted §11 substantial equivalence' },
    ]},
  { id: 's5', prog: 'IV-415', pathway: 'EU MDR',  stage: 'package',  status: 'active',  title: 'IV-415 CoDx · notified body bundle',           target: 'NB 0123 · TÜV', bytes: '88 MB',  files: 52, cover: 'draft',  esig: false, transmitAt: null,           targetAt: 'Q1', tone: 'warn',
    gate: { errs: 0, warns: 3, ok: 9 }, log: [
      { when: '3h ago',     who: 'A. Müller',         what: 'FAERS signal export attached' },
      { when: 'Yesterday',  who: 'Claude · Opus 4.5', what: 'Article 61 section · draft v2' },
    ]},
];

// ── Templates ────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  uses: number;
  owner: string;
  updated: string;
  tags: string[];
}

export const TEMPLATES: Template[] = [
  { id: 't1', name: '510(k) summary — Class II implant',  uses: 42, owner: 'Reg Affairs', updated: '2 weeks ago', tags: ['510(k)', 'implant', 'Class II'] },
  { id: 't2', name: 'SE discussion skeleton',             uses: 67, owner: 'Reg Affairs', updated: '1 month ago', tags: ['510(k)', '§11'] },
  { id: 't3', name: 'CER — EU MDR Article 61',            uses: 19, owner: 'Clinical',    updated: '3 weeks ago', tags: ['CER', 'EU MDR'] },
  { id: 't4', name: 'Biocompatibility summary',           uses: 28, owner: 'Quality',     updated: '5 days ago',  tags: ['biocompat', '§14'] },
  { id: 't5', name: 'DSMB charter',                       uses: 11, owner: 'Clinical',    updated: '2 months ago',tags: ['PMA', 'clinical'] },
  { id: 't6', name: 'Cybersecurity premarket submission', uses: 15, owner: 'Software',    updated: '1 month ago', tags: ['SaMD', 'cyber'] },
];
