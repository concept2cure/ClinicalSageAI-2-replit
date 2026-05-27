/**
 * Phase 7 · Q-Sub (Pre-Submission) briefing-document workspace data.
 *
 * Ported from design-system/ui_kits/mdx/data/qsub.js.
 * Closed-enum values only — demo rows omitted for production.
 * Wire shape: GET /api/mdx/qsub/:qsubId
 */

import type { KitDocument, KitDocFramework } from '../components/DocumentsPanel';

export interface QsubKpi {
  label: string;
  metric: string;
  unit?: string;
  meta: string;
  tone?: 'ok' | 'warn' | 'err';
}

export interface QsubType {
  id: 'pre-sub' | 'study-risk' | 'submission-issue' | 'pccp';
  label: string;
  desc: string;
}

export interface QsubSection {
  id: string;
  label: string;
  required: boolean;
  hint: string;
}

export interface QsubOpen {
  id: string;
  program: string;
  type: QsubType['id'];
  title: string;
  status: 'drafting' | 'awaiting-FDA' | 'feedback-received' | 'closed';
  submittedAt: string | null;
  feedbackAt: string | null;
  reviewer: string;
  cycleAge: string;
  questionCount: number;
  accepted: number;
  modified: number;
  declined: number;
}

export interface QsubCorrespondence {
  id: string;
  qsub: string;
  when: string;
  from: 'FDA' | 'C2C' | 'AnA';
  kind: 'feedback' | 'submission' | 'draft' | 'ack';
  body: string;
}

export const QSUB_KPIS: QsubKpi[] = [
  { label: 'Q-Subs open',          metric: '3',    meta: 'BX-204 (Q2) · IV-415 (Q1) · CV-IH401' },
  { label: 'Pending FDA response', metric: '1',    meta: 'IV-415 — 38d in cycle',                  tone: 'warn' },
  { label: 'Median cycle time',    metric: '74',   unit: 'd', meta: 'Pre-Sub request → feedback' },
  { label: 'Win rate (last 8)',    metric: '7/8',  meta: 'FDA agreed with proposed approach',      tone: 'ok' },
];

export const QSUB_TYPES: QsubType[] = [
  { id: 'pre-sub',          label: 'Pre-Sub',  desc: 'Standard pre-submission briefing request' },
  { id: 'study-risk',       label: 'Study Risk', desc: 'Significant-risk determination' },
  { id: 'submission-issue', label: 'Issue',    desc: 'Specific issue during active review' },
  { id: 'pccp',             label: 'PCCP',     desc: 'Predetermined Change Control Plan (AI/ML)' },
];

export const QSUB_SECTIONS: QsubSection[] = [
  { id: 'background',  label: 'Background',         required: true,  hint: 'Device · indication · context · related submissions' },
  { id: 'device',      label: 'Device description', required: true,  hint: 'Technological characteristics · operating principle · differences from predicate' },
  { id: 'questions',   label: 'Specific questions', required: true,  hint: 'Numbered. Each question stands alone and has a yes/no or scope answer.' },
  { id: 'rationale',   label: 'Supporting data',    required: true,  hint: 'Evidence the question is well-formed. Include preliminary results, plans, references.' },
  { id: 'summary',     label: 'Summary',            required: true,  hint: 'Restates the device + the asks · 1 page maximum' },
  { id: 'attachments', label: 'Attachments',        required: false, hint: 'IB, protocol drafts, predicate searches, prior FDA correspondence' },
];

export const QSUB_OPEN: QsubOpen[] = [
  { id: 'Q26-0042', program: 'BX-204',   type: 'pre-sub', title: 'BX-204 predicate selection — request for FDA concurrence',        status: 'drafting',          submittedAt: null,          feedbackAt: null,          reviewer: 'JC', cycleAge: '12d in draft',    questionCount: 4, accepted: 0, modified: 0, declined: 0 },
  { id: 'Q26-0041', program: 'IV-415',   type: 'pccp',    title: 'IV-415 PCCP — Pre-Sub for AI-enabled CDx adaptive algorithm',     status: 'awaiting-FDA',      submittedAt: '2026-04-06',  feedbackAt: null,          reviewer: 'AM', cycleAge: '38d in cycle',    questionCount: 6, accepted: 0, modified: 0, declined: 0 },
  { id: 'Q26-0040', program: 'CV-IH401', type: 'pre-sub', title: 'CV-IH401 De Novo classification — FDA concurrence on risk class', status: 'feedback-received', submittedAt: '2025-12-04',  feedbackAt: '2026-02-22',  reviewer: 'PS', cycleAge: 'feedback 4d ago', questionCount: 3, accepted: 3, modified: 0, declined: 0 },
];

export const QSUB_CORRESPONDENCE: QsubCorrespondence[] = [
  { id: 'cor-09', qsub: 'Q26-0040', when: '2026-02-22', from: 'FDA', kind: 'feedback',   body: 'Agreed with proposed risk classification. De Novo pathway concurrence confirmed for CV-IH401 heart-failure biomarker panel. See CDRH cover letter dated 2026-02-22.' },
  { id: 'cor-08', qsub: 'Q26-0040', when: '2025-12-04', from: 'C2C', kind: 'submission', body: 'Pre-Sub submitted via ESG. 3 specific questions on De Novo classification + post-market evidence expectations.' },
  { id: 'cor-07', qsub: 'Q26-0042', when: '8h ago',     from: 'AnA', kind: 'draft',      body: 'Draft v0.4 ready — predicate matrix table inserted with K221847, K252712, K243088. Question 3 (rapid-drop hysteresis difference) needs clinical-team sign-off on the "minor" classification.' },
  { id: 'cor-06', qsub: 'Q26-0041', when: '2026-04-06', from: 'C2C', kind: 'submission', body: 'Pre-Sub submitted via ESG. PCCP scope, validation criteria for adaptive thresholds, performance gate, change-management framework — 6 specific questions.' },
];

export const QSUB_DOC_FRAMEWORKS: KitDocFramework[] = [
  { id: 'briefing',   label: 'Briefing doc',  desc: 'Standard Q-Sub structure' },
  { id: 'response',   label: 'FDA response',  desc: 'Feedback + acknowledgments' },
  { id: 'attachment', label: 'Attachment',    desc: 'Protocol drafts, IB excerpts' },
];

export const QSUB_DOCUMENTS: KitDocument[] = [
  { id: 'doc-qsub-bx204',      framework: 'briefing',  type: 'Pre-Sub briefing document', title: 'BX-204 Pre-Sub Q26-0042 — predicate selection',             ver: 'v0.4', status: 'draft',  completion: 62,  blocker: false, owner: 'JC',  reviewers: ['MW'], lastEdit: '8h ago',    esigRequired: true,  esigState: 'na',     sections: 6, sectionsComplete: 4 },
  { id: 'doc-qsub-iv415',      framework: 'briefing',  type: 'Pre-Sub briefing document', title: 'IV-415 Pre-Sub Q26-0041 — PCCP for AI-enabled CDx',         ver: 'v1.2', status: 'locked', completion: 100, blocker: false, owner: 'AM',  reviewers: ['JC'], lastEdit: '2026-04-06', esigRequired: true, esigState: 'signed', signedBy: 'AM · 2026-04-05', sections: 6, sectionsComplete: 6 },
  { id: 'doc-qsub-cv401',      framework: 'briefing',  type: 'Pre-Sub briefing document', title: 'CV-IH401 Pre-Sub Q26-0040 — De Novo classification',        ver: 'v1.0', status: 'locked', completion: 100, blocker: false, owner: 'PS',  reviewers: ['JC'], lastEdit: '2025-12-04', esigRequired: true, esigState: 'signed', signedBy: 'PS · 2025-12-04', sections: 6, sectionsComplete: 6 },
  { id: 'doc-qsub-cv401-resp', framework: 'response',  type: 'FDA Pre-Sub feedback',       title: 'CDRH feedback — CV-IH401 De Novo concurrence',              ver: 'v1.0', status: 'locked', completion: 100, blocker: false, owner: 'FDA', reviewers: [],     lastEdit: '2026-02-22', esigRequired: false, esigState: 'na',                              sections: 1, sectionsComplete: 1 },
];
