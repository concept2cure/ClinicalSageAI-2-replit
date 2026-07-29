/**
 * Documents the Post-market vigilance surface produces.
 *
 * Every signal eventually rolls up to a regulatory submission: an MDR
 * (FDA 21 CFR 803 Form 3500A), a 15-day report (EU MDR Art. 87), an FSCA
 * record, an FSN (field-safety notice) for clinicians, a CAPA record
 * (root cause → action → verification), and the periodic safety update
 * reports (PSUR for EU MDR, PMSR for non-EU).
 *
 * Wire shape: GET /api/mdx/postmarket/documents
 */

export const PV_DOC_FRAMEWORKS = [
  { id: 'mdr-fda',  label: '21 CFR 803',    desc: 'FDA Medical Device Reporting' },
  { id: 'mdr-eu',   label: 'EU MDR Art. 87',desc: 'Serious incident reporting' },
  { id: 'capa',     label: '21 CFR 820.100',desc: 'CAPA / corrective action' },
  { id: 'fsca',     label: 'FSCA / FSN',    desc: 'Field safety corrective action' },
  { id: 'psur',     label: 'EU MDR PSUR',   desc: 'Periodic safety update' },
];

export const PV_DOCUMENTS = [
  {
    id: 'doc-mdr-0091', framework: 'mdr-fda',
    type: 'MDR — 5-day report',
    title: 'CV-330 malfunction — battery EOL alarm silent at 11 mo',
    ver: 'draft', status: 'draft', completion: 62, blocker: true,
    owner: 'MW', reviewers: [], lastEdit: '4h ago',
    esigRequired: true, esigState: 'na', dueIn: '23h',
    sections: 18, sectionsComplete: 11, blockerNote: 'FDA 5-day clock — 23h remaining. Awaiting device-history file pull.',
    editor: 'mdr-3500a',
  },
  {
    id: 'doc-mdr-0090', framework: 'mdr-fda',
    type: 'MDR — 30-day report',
    title: 'BX-204 serious injury — severe hypoglycemia, no alarm',
    ver: 'draft', status: 'review', completion: 88, blocker: false,
    owner: 'JC', reviewers: ['MW', 'AK'], lastEdit: '6h ago',
    esigRequired: true, esigState: 'pending', dueIn: '18d',
    sections: 18, sectionsComplete: 16, openComments: 4,
    editor: 'mdr-3500a',
  },
  {
    id: 'doc-mdr-0089', framework: 'mdr-eu',
    type: '15-day serious-incident report',
    title: 'BX-204 EUDAMED serious-incident report (paired with MDR-0090)',
    ver: 'draft', status: 'review', completion: 81, blocker: false,
    owner: 'AM', reviewers: ['JC'], lastEdit: '1d ago',
    esigRequired: true, esigState: 'pending', dueIn: '7d',
    sections: 22, sectionsComplete: 18,
    editor: 'mdr-3500a',
  },
  {
    id: 'doc-mdr-0088', framework: 'mdr-eu',
    type: 'Trend report',
    title: 'OR-801 trend — screw head stripping (cluster of 7 over 21d)',
    ver: 'v1.0', status: 'locked', completion: 100, blocker: false,
    owner: 'SM', reviewers: ['JC'], lastEdit: '2026-04-22',
    esigRequired: true, esigState: 'signed', signedBy: 'SM · 2026-04-22',
    sections: 12, sectionsComplete: 12,
    editor: 'mdr-3500a',
  },
  {
    id: 'doc-capa-0218', framework: 'capa',
    type: 'CAPA record',
    title: 'CAPA-0218 — Sensor lift-off in users >85kg (adhesive Rev D)',
    ver: 'v2.1', status: 'review', completion: 78, blocker: false,
    owner: 'AK', reviewers: ['JC'], lastEdit: '2d ago',
    esigRequired: true, esigState: 'pending',
    sections: 6, sectionsComplete: 5, openComments: 7,
    editor: 'capa',
  },
  {
    id: 'doc-capa-0217', framework: 'capa',
    type: 'CAPA record',
    title: 'CAPA-0217 — CV-330 battery EOL alarm (firmware OTA + field correction)',
    ver: 'v0.7', status: 'draft', completion: 38, blocker: true,
    owner: 'MW', reviewers: [], lastEdit: '5h ago',
    esigRequired: true, esigState: 'na',
    sections: 6, sectionsComplete: 2, blockerNote: 'Root-cause investigation incomplete · 60d SLA',
    editor: 'capa',
  },
  {
    id: 'doc-capa-0216', framework: 'capa',
    type: 'CAPA record',
    title: 'CAPA-0216 — BX-204 rapid-drop algorithm false-positive review',
    ver: 'v1.4', status: 'review', completion: 71, blocker: false,
    owner: 'JC', reviewers: ['AK'], lastEdit: '1d ago',
    esigRequired: true, esigState: 'pending',
    sections: 6, sectionsComplete: 4, openComments: 3,
    editor: 'capa',
  },
  {
    id: 'doc-fsca-2026-03', framework: 'fsca',
    type: 'FSCA — field correction',
    title: 'OR-801 FSCA — supplier change (Plant 2 → Plant 5)',
    ver: 'v1.0', status: 'review', completion: 92, blocker: false,
    owner: 'SM', reviewers: ['JC', 'MW'], lastEdit: '3d ago',
    esigRequired: true, esigState: 'pending',
    sections: 8, sectionsComplete: 8,
    editor: 'fsca',
  },
  {
    id: 'doc-fsn-2026-03', framework: 'fsca',
    type: 'FSN — field safety notice',
    title: 'OR-801 FSN — clinician notification for torque-tool compatibility',
    ver: 'v0.6', status: 'draft', completion: 54, blocker: false,
    owner: 'SM', reviewers: [], lastEdit: '12h ago',
    esigRequired: true, esigState: 'na',
    sections: 4, sectionsComplete: 2,
    editor: 'fsn',
  },
  {
    id: 'doc-psur-bx204-2025', framework: 'psur',
    type: 'PSUR — annual',
    title: 'BX-204 PSUR — EU MDR annual (period 2025-05 → 2026-04)',
    ver: 'v0.9', status: 'review', completion: 86, blocker: false,
    owner: 'JC', reviewers: ['AM', 'MW'], lastEdit: '8d ago',
    esigRequired: true, esigState: 'pending',
    sections: 14, sectionsComplete: 12, openComments: 5,
    editor: 'psur',
  },
  {
    id: 'doc-psur-cv330-2025', framework: 'psur',
    type: 'PSUR — annual',
    title: 'CV-330 PSUR — EU MDR annual (period 2025-04 → 2026-03)',
    ver: 'v1.2', status: 'locked', completion: 100, blocker: false,
    owner: 'MW', reviewers: ['JC'], lastEdit: '2026-04-22',
    esigRequired: true, esigState: 'signed', signedBy: 'MW · 2026-04-22',
    sections: 14, sectionsComplete: 14,
    editor: 'psur',
  },
  {
    id: 'doc-pms-plan-bx204', framework: 'psur',
    type: 'PMS plan',
    title: 'BX-204 PMS plan — Q3 review cycle',
    ver: 'v2.0', status: 'ready', completion: 100, blocker: false,
    owner: 'JC', reviewers: ['AM'], lastEdit: '11d ago',
    esigRequired: true, esigState: 'signed', signedBy: 'JC · 2026-05-03',
    sections: 9, sectionsComplete: 9,
    editor: 'pms-plan',
  },
];

