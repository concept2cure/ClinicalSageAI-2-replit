/**
 * Phase 6 · Companion diagnostic (CDx) co-development.
 *
 * Paired drug-device approvals where the drug's NDA/BLA and the device's
 * PMA/510(k) progress in lockstep. FDA + EMA both review. CDx label must
 * align with the drug's approved label (test name, manufacturer, IVD vs
 * LDT statement).
 *
 * Wire shape: GET /api/mdx/cdx/:programId
 */

export const CDX_KPIS = [
  { label: 'Paired drug',          metric: 'KEYTRUDA-9', meta: 'Pembrolizumab analog · NDA 219842',     },
  { label: 'Concordance vs CTA',   metric: '94', unit: '%', meta: 'vs original clinical-trial assay (CDR-2401)', tone: 'ok' },
  { label: 'Joint approval target',metric: 'Q1 2027', meta: 'FDA + EMA paired · 14-month runway',          },
  { label: 'Label alignment',      metric: 'In review', meta: 'Drug label v2.4 → IVD label v1.6 cross-ref',  tone: 'warn' },
];

/* Joint drug + device approval timeline — paired milestones */
export const CDX_TIMELINE = [
  { ms: 'CDx scientific advice (FDA + EMA)',       drugDate: '2024-04-12', deviceDate: '2024-04-12', state: 'complete' },
  { ms: 'Pivotal trial — biomarker arm enroll',    drugDate: '2025-06-30', deviceDate: '2025-06-30', state: 'complete' },
  { ms: 'Concordance study (CDx vs CTA)',          drugDate: '—',          deviceDate: '2025-11-12', state: 'complete' },
  { ms: 'Drug NDA submission',                     drugDate: '2026-03-04', deviceDate: '—',          state: 'complete' },
  { ms: 'IVD PMA submission',                      drugDate: '—',          deviceDate: '2026-03-04', state: 'in-progress' },
  { ms: 'FDA paired filing review (90d)',          drugDate: '2026-04-01', deviceDate: '2026-04-01', state: 'in-progress' },
  { ms: 'EMA paired CHMP opinion',                 drugDate: '2026-09-15', deviceDate: '2026-09-15', state: 'scheduled' },
  { ms: 'Drug NDA approval target',                drugDate: '2027-01-22', deviceDate: '—',          state: 'idle' },
  { ms: 'IVD PMA approval target',                 drugDate: '—',          deviceDate: '2027-01-22', state: 'idle' },
  { ms: 'EU paired authorization',                 drugDate: '2027-02-15', deviceDate: '2027-02-15', state: 'idle' },
];

/* Concordance study — biomarker-positive rates across CDx vs original CTA */
export const CDX_CONCORDANCE = [
  { population: 'All subjects (n=412)',         cdxPos: 184, ctaPos: 178, ppa: 96.6, npa: 97.3, opa: 96.9 },
  { population: 'Solid tumor (n=298)',          cdxPos: 132, ctaPos: 128, ppa: 96.9, npa: 97.6, opa: 97.0 },
  { population: 'Hematologic (n=114)',          cdxPos: 52,  ctaPos: 50,  ppa: 96.0, npa: 96.9, opa: 96.5 },
  { population: 'High-prevalence subset (n=86)',cdxPos: 41,  ctaPos: 39,  ppa: 95.1, npa: 97.8, opa: 96.5 },
];

/* Cross-reference matrix — NDA/BLA + PMA/510(k) document alignment */
export const CDX_XREF = [
  { drug: 'KEYTRUDA-9 NDA 219842 Module 2.5',  device: 'IV-415 PMA P26-0042 Volume 3', alignment: 'aligned',  lastSync: '4d ago', issues: 0 },
  { drug: 'KEYTRUDA-9 NDA Module 2.7.3',       device: 'IV-415 PMA Volume 7 (clinical)',alignment: 'aligned',  lastSync: '4d ago', issues: 0 },
  { drug: 'KEYTRUDA-9 Drug label §INDICATIONS',device: 'IV-415 IFU §1 Intended Use',    alignment: 'review',   lastSync: '8h ago', issues: 1 },
  { drug: 'KEYTRUDA-9 Drug label §SELECTION',  device: 'IV-415 IFU §3 Test Result Interpretation', alignment: 'review', lastSync: '6h ago', issues: 2 },
  { drug: 'KEYTRUDA-9 Drug label §CDx statement',device:'IV-415 IFU §10 CDx statement',alignment: 'misaligned', lastSync: '1h ago', issues: 1 },
];

export const CDX_DOC_FRAMEWORKS = [
  { id: 'joint',  label: 'Joint plan',   desc: 'Drug + device co-dev plan' },
  { id: 'concord',label: 'Concordance',  desc: 'CDx vs CTA studies' },
  { id: 'xref',   label: 'Cross-ref',    desc: 'NDA/BLA ↔ PMA/510(k) alignment' },
  { id: 'label',  label: 'Labeling',     desc: 'Drug label alignment' },
];

export const CDX_DOCUMENTS = [
  { id: 'doc-cdx-jdp', framework: 'joint', type: 'Joint development plan', title: 'KEYTRUDA-9 + IV-415 joint co-development plan (FDA + EMA)', ver: 'v3.2', status: 'locked', completion: 100, blocker: false, owner: 'JC', reviewers: ['MW', 'AM'], lastEdit: '2024-04-12', esigRequired: true, esigState: 'signed', signedBy: 'JC · 2024-04-12', sections: 14, sectionsComplete: 14, editor: 'engineering' },
  { id: 'doc-cdx-concord', framework: 'concord', type: 'Concordance study report', title: 'CDR-2401 concordance — IV-415 CDx vs original clinical-trial assay', ver: 'v1.0', status: 'locked', completion: 100, blocker: false, owner: 'PS', reviewers: ['JC', 'MW'], lastEdit: '2025-11-12', esigRequired: true, esigState: 'signed', signedBy: 'PS · 2025-11-10', sections: 8, sectionsComplete: 8, editor: 'engineering' },
  { id: 'doc-cdx-pma-xref', framework: 'xref', type: 'NDA ↔ PMA cross-reference', title: 'KEYTRUDA-9 NDA 219842 ↔ IV-415 PMA P26-0042 cross-reference matrix', ver: 'v1.4', status: 'review', completion: 88, blocker: false, owner: 'AM', reviewers: ['JC', 'MW'], lastEdit: '4h ago', esigRequired: true, esigState: 'pending', sections: 12, sectionsComplete: 11, openComments: 3, editor: 'engineering' },
  { id: 'doc-cdx-label-align', framework: 'label', type: 'Drug label alignment', title: 'KEYTRUDA-9 drug label ↔ IV-415 IFU alignment', ver: 'v0.9', status: 'draft', completion: 62, blocker: true, owner: 'AM', reviewers: ['MW'], lastEdit: '1h ago', esigRequired: true, esigState: 'na', sections: 5, sectionsComplete: 3, blockerNote: 'Drug §CDx statement says "FDA-approved IVD" — our IFU still says "in-development". Resolve before NDA approval.', editor: 'engineering' },
  { id: 'doc-cdx-ema', framework: 'joint', type: 'EMA CHMP submission', title: 'IV-415 + KEYTRUDA-9 paired CHMP submission (CHMP/2026/0042)', ver: 'v0.6', status: 'draft', completion: 44, blocker: false, owner: 'AM', reviewers: ['JC'], lastEdit: '2d ago', esigRequired: true, esigState: 'na', sections: 18, sectionsComplete: 8, editor: 'engineering' },
];

