/**
 * Phase 6 · EU IVDR (Regulation 2017/746) — separate from EU MDR.
 *
 * Class A / B / C / D risk classification per Annex VIII. Performance
 * Evaluation Report (PER) — distinct from CER. Notified-body engagement
 * required for Class B+. EUDAMED IVD module (separate from EUDAMED
 * device module). Companion-diagnostic + drug cross-reference.
 *
 * Wire shape: GET /api/mdx/ivdr/:programId
 */

(() => {

const IVDR_CLASSES = [
  { id: 'A', label: 'Class A', desc: 'Lowest risk — non-sterile lab products' },
  { id: 'B', label: 'Class B', desc: 'Self-testing devices (non-cardiac/non-genetic), reagents for clinical-chemistry tests' },
  { id: 'C', label: 'Class C', desc: 'Most companion diagnostics, infectious-disease screening, genetic testing' },
  { id: 'D', label: 'Class D', desc: 'Highest risk — transmissible-agent detection (HIV, HCV, HBV)' },
];

const IVDR_KPIS = [
  { label: 'Risk classification',  metric: 'Class C', meta: 'Per Annex VIII Rule 3 — companion diagnostic', tone: 'warn' },
  { label: 'PER completion',       metric: '64', unit: '%', meta: 'Performance Evaluation Report — 4 of 7 sections',  tone: 'warn' },
  { label: 'Notified body',        metric: 'BSI',  meta: 'Engaged · technical-doc review Q3' },
  { label: 'EUDAMED IVD',          metric: 'Draft', meta: 'Submission file not yet locked',                tone: 'warn' },
];

/* Annex VIII classification trace — which rule lands us at Class C */
const IVDR_RULES = [
  { rule: 'Rule 1', appliesTo: 'Devices for detection of transmissible agents in blood/tissues/cells', verdict: 'no',  classWouldBe: 'D' },
  { rule: 'Rule 2', appliesTo: 'Blood-grouping or tissue-typing devices',                              verdict: 'no',  classWouldBe: 'C/D' },
  { rule: 'Rule 3', appliesTo: 'Devices intended for cancer screening / staging / companion diagnostic',verdict: 'yes',classWouldBe: 'C', selected: true },
  { rule: 'Rule 4', appliesTo: 'Self-testing devices (non-cardiac, non-genetic)',                       verdict: 'no',  classWouldBe: 'B' },
  { rule: 'Rule 5', appliesTo: 'Default rule for everything not covered above',                        verdict: 'no',  classWouldBe: 'A' },
];

/* Notified-body engagement milestones */
const IVDR_NB_TIMELINE = [
  { ms: 'Application submitted',  date: '2026-02-12', state: 'complete' },
  { ms: 'Technical doc review',   date: '2026-08-18', state: 'in-progress' },
  { ms: 'On-site QMS audit',      date: '2026-10-04', state: 'scheduled' },
  { ms: 'Performance review',     date: '2026-11-12', state: 'idle' },
  { ms: 'Certificate decision',   date: '2027-01-22', state: 'idle' },
];

window.IVDR_CLASSES = IVDR_CLASSES;
window.IVDR_KPIS = IVDR_KPIS;
window.IVDR_RULES = IVDR_RULES;
window.IVDR_NB_TIMELINE = IVDR_NB_TIMELINE;

const IVDR_DOC_FRAMEWORKS = [
  { id: 'per',     label: 'PER',           desc: 'Performance Evaluation Report' },
  { id: 'class',   label: 'Annex VIII',    desc: 'Risk classification' },
  { id: 'nb',      label: 'Notified body', desc: 'Application + audits' },
  { id: 'eudamed', label: 'EUDAMED IVD',   desc: 'EU submission module' },
  { id: 'cdx',     label: 'CDx X-ref',     desc: 'Companion diagnostic alignment' },
];

const IVDR_DOCUMENTS = [
  { id: 'doc-ivdr-per', framework: 'per', type: 'Performance Evaluation Report (PER)', title: 'IV-415 Performance Evaluation Report — EU IVDR Art. 56', ver: 'v0.7', status: 'draft', completion: 64, blocker: true, owner: 'AM', reviewers: ['JC'], lastEdit: '3h ago', esigRequired: true, esigState: 'na', sections: 7, sectionsComplete: 4, blockerNote: 'Awaiting clinical-performance final from CP-004 (n=280 cohort study)', editor: 'engineering' },
  { id: 'doc-ivdr-class', framework: 'class', type: 'Risk classification', title: 'IV-415 Annex VIII risk classification — Rule 3 → Class C', ver: 'v1.2', status: 'ready', completion: 100, blocker: false, owner: 'AM', reviewers: ['JC'], lastEdit: '14d ago', esigRequired: true, esigState: 'signed', signedBy: 'AM · 2026-05-01', sections: 1, sectionsComplete: 1, editor: 'engineering' },
  { id: 'doc-ivdr-nb-app', framework: 'nb', type: 'Notified body application', title: 'BSI application packet — IV-415 Class C IVD', ver: 'v1.4', status: 'locked', completion: 100, blocker: false, owner: 'AM', reviewers: ['JC'], lastEdit: '2026-02-12', esigRequired: true, esigState: 'signed', signedBy: 'AM · 2026-02-10', sections: 22, sectionsComplete: 22, editor: 'engineering' },
  { id: 'doc-ivdr-nb-tdoc', framework: 'nb', type: 'Technical documentation', title: 'IV-415 technical documentation — EU IVDR Annex II/III', ver: 'v1.6', status: 'review', completion: 91, blocker: false, owner: 'AM', reviewers: ['JC', 'AK'], lastEdit: '1d ago', esigRequired: true, esigState: 'pending', sections: 18, sectionsComplete: 16, openComments: 5, editor: 'engineering' },
  { id: 'doc-ivdr-eudamed', framework: 'eudamed', type: 'EUDAMED IVD module submission', title: 'EUDAMED IVD module submission — IV-415', ver: 'v0.4', status: 'draft', completion: 32, blocker: true, owner: 'AM', reviewers: [], lastEdit: '8h ago', esigRequired: true, esigState: 'na', sections: 38, sectionsComplete: 12, blockerNote: 'EUDAMED IVD module open for submissions but PER must be approved first', editor: 'data-submission' },
  { id: 'doc-ivdr-cdx-align', framework: 'cdx', type: 'Companion diagnostic alignment', title: 'IV-415 CDx alignment with KEYTRUDA-9 NDA labeling', ver: 'v1.0', status: 'review', completion: 88, blocker: false, owner: 'AM', reviewers: ['JC', 'MW'], lastEdit: '4h ago', esigRequired: true, esigState: 'pending', sections: 5, sectionsComplete: 5, editor: 'engineering' },
];

window.IVDR_DOC_FRAMEWORKS = IVDR_DOC_FRAMEWORKS;
window.IVDR_DOCUMENTS = IVDR_DOCUMENTS;

})();
