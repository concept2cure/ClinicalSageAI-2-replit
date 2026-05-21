/**
 * Phase 6 · Laboratory-Developed Test (LDT) compliance.
 *
 * FDA 2024 LDT rule (May 2024) brings LDTs under FDA oversight in
 * 4 phases through May 2028. Each phase adds new requirements; labs
 * must track which of their LDTs are in which phase and complete
 * phase-specific deliverables (MDR reporting, 510(k) filing, etc.).
 *
 * Wire shape: GET /api/mdx/ldt
 */

/* FDA 2024 LDT rule — the 4 phases */
export const LDT_PHASES = [
  { id: 'P1', label: 'Phase 1 — MDR + correction reporting', start: '2025-05', end: '2026-05', deliverables: 'MDR per 21 CFR 803, correction/removal per 803.30' },
  { id: 'P2', label: 'Phase 2 — registration + listing',     start: '2026-05', end: '2027-05', deliverables: 'Establishment registration + device listing per 21 CFR 807' },
  { id: 'P3', label: 'Phase 3 — QS + labeling',              start: '2027-05', end: '2028-05', deliverables: 'Quality system (21 CFR 820) + labeling (21 CFR 809)' },
  { id: 'P4', label: 'Phase 4 — premarket review',           start: '2028-05', end: 'ongoing', deliverables: 'Premarket review (510(k) / De Novo / PMA as classified)' },
];

export const LDT_KPIS = [
  { label: 'LDTs in portfolio',  metric: '8',  meta: '4 high-risk · 3 moderate · 1 low' },
  { label: 'In premarket (P4)',  metric: '1',  meta: 'CV-IH401 — De Novo filed Q2 2026' },
  { label: 'Enforcement disc.',  metric: '2',  meta: 'Pre-2024 grandfathered · low-risk',  tone: 'ok' },
  { label: 'Next phase deadline',metric: 'May 2026', meta: 'P2 registration · 8 LDTs to list', tone: 'warn' },
];

/* LDT inventory — per lab, per test */
export const LDT_INVENTORY = [
  { id: 'CV-IH401', lab: 'Central reference lab', name: 'Heart failure biomarker IH panel',     risk: 'high',   phase: 'P4', grandfathered: false, plan: '510(k) Q3 2026', mdrCount: 0, lastMdr: '—' },
  { id: 'ON-IH102', lab: 'Central reference lab', name: 'Oncology IHC stain — HER2 reflex',     risk: 'high',   phase: 'P3', grandfathered: false, plan: 'QS implementation Q4 2026', mdrCount: 1, lastMdr: '2026-03-14' },
  { id: 'GE-NGS-1', lab: 'Genomics lab',          name: 'Hereditary cancer NGS panel',           risk: 'high',   phase: 'P2', grandfathered: false, plan: 'Establishment listed Q2 2026', mdrCount: 0, lastMdr: '—' },
  { id: 'GE-NGS-2', lab: 'Genomics lab',          name: 'Tumor-mutation burden panel',           risk: 'high',   phase: 'P2', grandfathered: false, plan: 'Establishment listed Q2 2026', mdrCount: 0, lastMdr: '—' },
  { id: 'BB-FX001', lab: 'Blood bank',            name: 'Factor V Leiden molecular',             risk: 'med',    phase: 'P2', grandfathered: false, plan: 'Listed Q2 2026', mdrCount: 0, lastMdr: '—' },
  { id: 'BB-FX002', lab: 'Blood bank',            name: 'Coagulation panel (legacy)',            risk: 'med',    phase: 'EDX', grandfathered: true,  plan: 'Enforcement discretion · pre-2024', mdrCount: 0, lastMdr: '—' },
  { id: 'TX-PG-01', lab: 'Toxicology',            name: 'Pharmacogenomic panel CYP2D6/CYP2C19',  risk: 'med',    phase: 'P2', grandfathered: false, plan: 'Listed Q2 2026', mdrCount: 0, lastMdr: '—' },
  { id: 'TX-LD-01', lab: 'Toxicology',            name: 'Therapeutic-drug monitoring panel',     risk: 'low',    phase: 'EDX', grandfathered: true,  plan: 'Enforcement discretion · pre-2024', mdrCount: 0, lastMdr: '—' },
];

/* Phase milestone tracker per LDT — drives the timeline view */
export const LDT_MILESTONES = [
  { ldt: 'CV-IH401', ms: 'Risk classification confirmed', date: '2025-08-12', state: 'complete' },
  { ldt: 'CV-IH401', ms: 'De Novo Pre-Sub submitted',     date: '2025-12-04', state: 'complete' },
  { ldt: 'CV-IH401', ms: 'De Novo submission target',     date: '2026-09-30', state: 'in-progress' },
  { ldt: 'ON-IH102', ms: 'MDR-1 filed (HER2 stain miscall)', date: '2026-03-14', state: 'complete' },
  { ldt: 'ON-IH102', ms: 'QS gap assessment',             date: '2026-06-15', state: 'in-progress' },
  { ldt: 'GE-NGS-1', ms: 'Establishment registration',    date: '2026-04-30', state: 'complete' },
  { ldt: 'GE-NGS-1', ms: 'Device listing',                date: '2026-05-12', state: 'scheduled' },
  { ldt: 'BB-FX002', ms: 'Enforcement discretion confirmed',date:'2025-09-22',state: 'complete' },
];

export const LDT_DOC_FRAMEWORKS = [
  { id: 'p1',   label: 'Phase 1', desc: 'MDR + correction reporting' },
  { id: 'p2',   label: 'Phase 2', desc: 'Registration + listing' },
  { id: 'p3',   label: 'Phase 3', desc: 'QS + labeling' },
  { id: 'p4',   label: 'Phase 4', desc: 'Premarket review' },
  { id: 'edx',  label: 'Enforcement disc.', desc: 'Grandfathered LDTs' },
];

export const LDT_DOCUMENTS = [
  { id: 'doc-ldt-policy',  framework: 'p1',  type: 'LDT compliance policy', title: 'Org LDT compliance policy — FDA 2024 rule phased compliance', ver: 'v1.4', status: 'ready', completion: 100, blocker: false, owner: 'JC', reviewers: ['MW', 'PS'], lastEdit: '14d ago', esigRequired: true, esigState: 'signed', signedBy: 'JC · 2026-04-30', sections: 12, sectionsComplete: 12, editor: 'engineering' },
  { id: 'doc-ldt-mdr-sop', framework: 'p1',  type: 'MDR SOP for LDTs', title: 'SOP-803-LDT — MDR reporting for laboratory-developed tests', ver: 'v1.2', status: 'review', completion: 92, blocker: false, owner: 'JC', reviewers: ['MW'], lastEdit: '4d ago', esigRequired: true, esigState: 'pending', sections: 6, sectionsComplete: 6, editor: 'engineering' },
  { id: 'doc-ldt-reg-pkg', framework: 'p2',  type: 'Registration + listing packet', title: 'FDA establishment registration + 8 LDT device listings', ver: 'v0.9', status: 'review', completion: 86, blocker: false, owner: 'JC', reviewers: ['PS'], lastEdit: '2d ago', esigRequired: true, esigState: 'pending', sections: 14, sectionsComplete: 12, editor: 'data-submission' },
  { id: 'doc-ldt-qs-gap',  framework: 'p3',  type: 'QS gap assessment', title: 'Phase 3 QS gap assessment — 6 LDTs scoped', ver: 'v0.4', status: 'draft', completion: 38, blocker: false, owner: 'JC', reviewers: [], lastEdit: '8h ago', esigRequired: true, esigState: 'na', sections: 18, sectionsComplete: 7, editor: 'engineering' },
  { id: 'doc-ldt-cv401-dn',framework: 'p4',  type: 'De Novo submission packet', title: 'CV-IH401 De Novo classification request — heart failure biomarker', ver: 'v0.6', status: 'draft', completion: 48, blocker: true, owner: 'PS', reviewers: ['JC'], lastEdit: '1d ago', esigRequired: true, esigState: 'na', sections: 22, sectionsComplete: 10, blockerNote: 'Awaiting analytical performance package signoff before De Novo can be transmitted', editor: 'engineering' },
  { id: 'doc-ldt-edx-bf2', framework: 'edx', type: 'Enforcement-discretion memo', title: 'BB-FX002 enforcement-discretion eligibility memo · pre-2024 grandfathering', ver: 'v1.0', status: 'locked', completion: 100, blocker: false, owner: 'JC', reviewers: ['MW'], lastEdit: '2025-09-22', esigRequired: true, esigState: 'signed', signedBy: 'JC · 2025-09-22', sections: 4, sectionsComplete: 4, editor: 'engineering' },
];

