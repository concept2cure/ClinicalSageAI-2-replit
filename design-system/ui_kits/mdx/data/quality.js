/**
 * Quality system (QMS) — Phase 5
 *
 * 21 CFR 820 → QMSR (when finalized) · ISO 13485 · ISO 14971 management.
 * The org's regulatory home: management review, doc control, training,
 * internal audits, supplier controls, non-conforming product, CAPA links.
 *
 * Wire shape: GET /api/mdx/quality
 */

(() => {

const QMS_KPIS = [
  { label: 'Open findings',       metric: '7',  meta: '2 internal · 4 supplier · 1 notified-body',     tone: 'warn' },
  { label: 'Training compliance', metric: '94', unit: '%', meta: '44 of 47 members current',           tone: 'ok' },
  { label: 'Supplier qual.',      metric: '23', meta: '21 approved · 2 conditional · 0 unapproved' },
  { label: 'Next mgmt review',    metric: 'Q3', meta: 'Sept 2026 · 11 input items queued' },
];

const QMS_DOC_FRAMEWORKS = [
  { id: 'mr',       label: 'Mgmt review',  desc: 'Annual management review' },
  { id: 'doc',      label: 'Doc control',  desc: 'Controlled docs + SOPs' },
  { id: 'train',    label: 'Training',     desc: 'Procedure training records' },
  { id: 'audit',    label: 'Audit',        desc: 'Internal + notified body' },
  { id: 'supplier', label: 'Supplier',     desc: 'Quality agreements · approvals' },
];

const QMS_DOCUMENTS = [
  { id: 'qms-mr-2025',    framework: 'mr',       type: 'Management review',         title: 'Annual management review 2025 — output minutes',          ver: 'v1.2', status: 'locked',  completion: 100, blocker: false, owner: 'JC', reviewers: ['MW'], lastEdit: '2026-04-30', esigRequired: true,  esigState: 'signed',  signedBy: 'JC · 2026-04-30', sections: 12, sectionsComplete: 12, editor: 'engineering' },
  { id: 'qms-mr-2026',    framework: 'mr',       type: 'Management review',         title: 'Q3 2026 management review (auto-drafting)',                ver: 'v0.3', status: 'draft',   completion: 28,  blocker: false, owner: 'system', reviewers: ['JC'], lastEdit: '1d ago',     esigRequired: true,  esigState: 'na', sections: 12, sectionsComplete: 3, editor: 'engineering' },
  { id: 'qms-sop-820-50', framework: 'doc',      type: 'SOP — supplier controls',   title: 'SOP-820-50 supplier controls procedure',                   ver: 'v3.1', status: 'review',  completion: 92,  blocker: false, owner: 'SM', reviewers: ['JC'], lastEdit: '5d ago',     esigRequired: true,  esigState: 'pending', sections: 8, sectionsComplete: 8, openComments: 2, editor: 'engineering' },
  { id: 'qms-train-2026q2',framework:'train',    type: 'Training record',           title: 'Q2 2026 procedure training cycle — 44 members',            ver: 'v1.0', status: 'ready',   completion: 100, blocker: false, owner: 'JC', reviewers: [],     lastEdit: '11d ago',    esigRequired: true,  esigState: 'signed',  signedBy: 'JC · 2026-05-02', sections: 1, sectionsComplete: 1, editor: 'engineering' },
  { id: 'qms-audit-2026', framework: 'audit',    type: 'Internal audit report',     title: '2026 internal QMS audit · all clauses',                    ver: 'v0.8', status: 'draft',   completion: 64,  blocker: true,  owner: 'JC', reviewers: [],     lastEdit: '3d ago',     esigRequired: true,  esigState: 'na', sections: 28, sectionsComplete: 18, blockerNote: 'Supplier controls finding awaiting CAPA-0215 verification', editor: 'engineering' },
  { id: 'qms-sup-agr',    framework: 'supplier', type: 'Supplier quality agreement',title: 'Plant 5 enclosure supplier — quality agreement',           ver: 'v1.4', status: 'review',  completion: 88,  blocker: false, owner: 'SM', reviewers: ['JC'], lastEdit: '8d ago',     esigRequired: true,  esigState: 'pending', sections: 9, sectionsComplete: 9, editor: 'engineering' },
];

const QMS_FINDINGS = [
  { id: 'F-2026-04', severity: 'med',  source: 'internal', clause: '21 CFR 820.50 supplier controls', state: 'capa-open',  age: '21d', owner: 'SM', linked: 'CAPA-0215' },
  { id: 'F-2026-03', severity: 'low',  source: 'internal', clause: 'ISO 13485 §7.5.6 process validation', state: 'investigating', age: '14d', owner: 'AK', linked: '—' },
  { id: 'F-2026-02', severity: 'high', source: 'nb',       clause: 'EU MDR Annex IX QMS audit',     state: 'capa-open',     age: '38d', owner: 'JC', linked: 'CAPA-0211' },
  { id: 'F-2026-01', severity: 'med',  source: 'supplier', clause: '21 CFR 820.50(a) qualification',state: 'capa-open',     age: '54d', owner: 'SM', linked: 'CAPA-0215' },
  { id: 'F-2025-09', severity: 'low',  source: 'internal', clause: 'ISO 13485 §7.4 purchasing',     state: 'closed',        age: '88d', owner: 'SM', linked: '—' },
];

const QMS_TRAINING = [
  { sop: 'SOP-820-30 design controls',  current: 44, of: 47, lastCycle: '2026-04-15' },
  { sop: 'SOP-820-50 supplier controls',current: 43, of: 47, lastCycle: '2026-04-22' },
  { sop: 'SOP-820-100 CAPA',            current: 47, of: 47, lastCycle: '2026-03-30' },
  { sop: 'SOP-820-200 servicing',       current: 38, of: 47, lastCycle: '2026-02-18' },
  { sop: 'SOP-803 MDR reporting',       current: 47, of: 47, lastCycle: '2026-04-01' },
];

const QMS_SUPPLIERS = [
  { id: 's-001', name: 'Plant 2 enclosure (legacy)', risk: 'med', state: 'phasing-out', last: '2025-11', findings: 1 },
  { id: 's-002', name: 'Plant 5 enclosure',          risk: 'med', state: 'conditional', last: '2026-03', findings: 0 },
  { id: 's-003', name: 'Adhesive Rev D supplier',    risk: 'low', state: 'approved',    last: '2026-04', findings: 0 },
  { id: 's-004', name: 'PCBA fab (CV-330)',          risk: 'high',state: 'approved',    last: '2026-02', findings: 1 },
  { id: 's-005', name: 'BLE module OEM',             risk: 'med', state: 'approved',    last: '2025-12', findings: 0 },
];

window.QMS_KPIS = QMS_KPIS;
window.QMS_DOC_FRAMEWORKS = QMS_DOC_FRAMEWORKS;
window.QMS_DOCUMENTS = QMS_DOCUMENTS;
window.QMS_FINDINGS = QMS_FINDINGS;
window.QMS_TRAINING = QMS_TRAINING;
window.QMS_SUPPLIERS = QMS_SUPPLIERS;

})();
