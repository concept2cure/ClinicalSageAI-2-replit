/**
 * Biopharma kit fixtures — SAMPLE DATA ONLY (Phase 10.2).
 *
 * Verbatim port of ui_kits/biopharma/data.jsx. Surfaces consume live
 * endpoints first (the established `live ?? fixture` pattern); anything
 * rendered from this module carries a visible "Sample data" pill so the
 * fixture is never mistaken for tenant data. Per-surface backend wiring
 * (predicted HAQs, section gates) is a moat-phase deliverable
 * (docs/legacy/PHASE_10_2_INSTALL.md §6) — until then these are the reference shapes.
 *
 * @module client/src/concept2cure/biopharma/data/fixtures
 */

export interface FixtureModule {
  id: string;
  path: string;
  label: string;
  readiness: number;
  status: string;
  sections: number;
  done: number;
}

export interface FixtureFdaInteraction {
  kind: string;
  date: string;
  topic: string;
  status: string;
  resolution: string;
  priorRef: string | null;
  due: string | null;
  haqRefId: string | null;
  confidence?: number;
}

export interface FixtureContradiction {
  id: string;
  sev: 'warn' | 'err';
  title: string;
  desc: string;
  where: string[];
  owner: string;
}

export interface FixtureBlocker {
  id: string;
  sev: 'warn' | 'err';
  who: string;
  label: string;
  due: string;
  section: string;
}

/* ───── IND fixtures (reference deep-dive). HAQs + informal interactions in
   one stream; `status: 'predicted'` rows are Moat #2 pre-submission HAQ
   simulator shapes — UI only until the moat phase wires the backend. ───── */
export const FIXTURE_IND = {
  modules: [
    { id: 'm1', path: 'M1', label: 'Administrative', readiness: 92, status: 'review',   sections: 8,  done: 7 },
    { id: 'm2', path: 'M2', label: 'Summaries',      readiness: 68, status: 'drafted',  sections: 6,  done: 4 },
    { id: 'm3', path: 'M3', label: 'CMC',            readiness: 71, status: 'review',   sections: 12, done: 8 },
    { id: 'm4', path: 'M4', label: 'Nonclinical',    readiness: 84, status: 'approved', sections: 9,  done: 8 },
    { id: 'm5', path: 'M5', label: 'Clinical',       readiness: 48, status: 'drafted',  sections: 14, done: 6 },
  ] as FixtureModule[],
  fdaInteractions: [
    { kind: 'HAQ · predicted', date: 'Predicted', topic: 'CMC: comparability protocol for forthcoming DS supplier change', status: 'predicted', resolution: 'AnA suggests pre-empting · response draftable now', priorRef: 'Predicted from BLA 761987 D60 LoQ', due: 'Pre-submission', haqRefId: 'PRED-CMC-01', confidence: 0.86 },
    { kind: 'HAQ · predicted', date: 'Predicted', topic: 'Statistical: handling of subjects switching arms in BX204-301', status: 'predicted', resolution: 'AnA pre-drafted response anchored on SAP v3 §9.4', priorRef: 'Predicted from EMEA/H/C/005612 D80 LoQ', due: 'Pre-submission', haqRefId: 'PRED-STAT-01', confidence: 0.72 },
    { kind: 'HAQ · predicted', date: 'Predicted', topic: 'Pediatric: rationale for 12-17 age range exclusion in pivotal', status: 'predicted', resolution: 'AnA proposes citing PIP modification + Type C 2026-02-04', priorRef: 'Predicted from 4 prior oncology pediatric LoQs', due: 'Pre-submission', haqRefId: 'PRED-PED-01', confidence: 0.91 },
    { kind: 'Type B · Pre-IND',  date: '2025-11-12', topic: 'Nonclinical package adequacy',             status: 'closed',    resolution: 'FDA aligned on tox package',                priorRef: 'IND 178902 §4.2.3', due: null,     haqRefId: null },
    { kind: 'Type C',            date: '2026-02-04', topic: 'Pediatric extrapolation framework',        status: 'closed',    resolution: 'Bridging supported',                        priorRef: 'PSP-204',           due: null,     haqRefId: null },
    { kind: 'HAQ · CMC',         date: '2026-04-22', topic: 'CMC stability trend at 18 months',         status: 'drafting',  resolution: 'AnA drafted v0.3 · awaiting reviewer',      priorRef: 'IND §3.2.S.7.3',    due: '5 days', haqRefId: 'HAQ-2026-04-22-A' },
    { kind: 'HAQ · clinical',    date: '2026-04-22', topic: 'Adverse event narrative — subj 014-008',   status: 'open',      resolution: '14-day response window · day 9',            priorRef: 'CSR-201 §10.4',     due: '5 days', haqRefId: 'HAQ-2026-04-22-B' },
    { kind: 'HAQ · nonclinical', date: '2026-04-22', topic: 'Genotoxicity follow-up rationale',         status: 'open',      resolution: 'Source: 13-week tox; AnA suggests bridging', priorRef: 'IND §2.6.5',        due: '5 days', haqRefId: 'HAQ-2026-04-22-C' },
    { kind: 'Safety report',     date: '2026-05-08', topic: 'SUSAR · BX115-202 subject 014-008',        status: 'submitted', resolution: '7-day expedited filed',                     priorRef: null,                due: null,     haqRefId: null },
  ] as FixtureFdaInteraction[],
  contradictions: [
    { id: 'c1', sev: 'warn', title: 'Stability prediction conflict',
      desc: 'Module 3.2.P.8 cites a 24-month shelf life; Phase II protocol BX115-202 assumes 18-month supply window.',
      where: ['M3 §3.2.P.8.3', 'Protocol BX115-202 §6.4'], owner: 'AR' },
    { id: 'c2', sev: 'err', title: 'Exposure-response narrative',
      desc: 'Module 2.7.2 PK/PD discussion uses pre-amendment dose; Module 2.5 efficacy section cites post-amendment exposure.',
      where: ['M2 §2.5.4', 'M2 §2.7.2'], owner: 'BK' },
  ] as FixtureContradiction[],
  blockers: [
    { id: 'b1', sev: 'err',  who: 'AR', label: 'Drug substance stability — 24-month projection',  due: 'Day 9 of 14',  section: 'M3 §3.2.S.7.3' },
    { id: 'b2', sev: 'warn', who: 'BK', label: 'Statistical analysis plan — interim dataset cut', due: 'Wed · 2 days', section: 'M5 §5.3.5.1' },
    { id: 'b3', sev: 'warn', who: 'TP', label: 'Pediatric assessment waiver justification',       due: 'Next Thu',     section: 'M1 §1.9' },
  ] as FixtureBlocker[],
};

/* ───── NDA fixtures ───── */
export const FIXTURE_NDA = {
  modules: [
    { id: 'm1', path: 'M1', label: 'Administrative',      readiness: 95,  status: 'approved', sections: 18, done: 17 },
    { id: 'm2', path: 'M2', label: 'CTD summaries',       readiness: 81,  status: 'review',   sections: 7,  done: 6 },
    { id: 'm3', path: 'M3', label: 'CMC',                 readiness: 88,  status: 'review',   sections: 24, done: 21 },
    { id: 'm4', path: 'M4', label: 'Nonclinical reports', readiness: 100, status: 'approved', sections: 16, done: 16 },
    { id: 'm5', path: 'M5', label: 'Clinical reports',    readiness: 74,  status: 'drafted',  sections: 38, done: 27 },
  ] as FixtureModule[],
  pivotalStudies: [
    { id: 'BX204-201', phase: 'II',  n: 184, primary: 'ORR 38.6% (95% CI 31.5–46.0)', status: 'final',   csr: 'CSR-201 v2.0' },
    { id: 'BX204-101', phase: 'I',   n: 42,  primary: 'RP2D 12 mg/kg q3w',            status: 'final',   csr: 'CSR-101 v1.0' },
    { id: 'BX204-301', phase: 'III', n: 612, primary: 'OS hazard ratio 0.62',         status: 'topline', csr: 'CSR-301 v0.2' },
  ],
  reviewClock: {
    filed: '2026-06-04 (planned)', accepted: 'pending', day60: '2026-08-03', day74: '2026-08-17',
    midcycle: '2026-12-15', day120: '2026-10-02', advisoryCmte: 'TBD', pdufa: '2027-04-04',
  },
};

/* ───── Pediatric fixtures (PIP/PSP) ───── */
export const FIXTURE_PEDIATRIC = {
  plans: [
    { id: 'pip-420', kind: 'EMA PIP',  product: 'BX-420', status: 'agreed',    ageRange: '2–17',  deferrals: 2, waivers: 1, milestones: 8, due: 'Trial readout · Q1 2027' },
    { id: 'psp-204', kind: 'FDA iPSP', product: 'BX-204', status: 'submitted', ageRange: '12–17', deferrals: 1, waivers: 0, milestones: 5, due: 'PREA · post-approval Y2' },
    { id: 'pip-301', kind: 'EMA PIP',  product: 'BX-301', status: 'in draft',  ageRange: '0–17',  deferrals: 0, waivers: 1, milestones: 6, due: 'CHMP advice · Q3 2026' },
    { id: 'psp-115', kind: 'FDA iPSP', product: 'BX-115', status: 'in draft',  ageRange: '6–17',  deferrals: 0, waivers: 0, milestones: 4, due: 'Pre-IND meeting · 28 days' },
  ],
  prea: {
    waiversFiled: 1,
    deferralsActive: 3,
    openMilestones: 7,
    upcoming: [
      { product: 'BX-204', ms: 'Adolescent PK substudy — interim',       due: 'Aug 2026' },
      { product: 'BX-420', ms: 'Juvenile tox study report — final',      due: 'Oct 2026' },
      { product: 'BX-301', ms: 'Cohort C enrollment — first patient in', due: 'Nov 2026' },
    ],
  },
};

/* ───── Pharmacovigilance fixtures (PSUR cycle + signals) ───── */
export const FIXTURE_PV = {
  signals: [
    { id: 's1', product: 'BX-099', term: 'Immune-mediated pneumonitis', count: 27, prr: 4.2, status: 'evaluating', owner: 'TP', age: '3 days' },
    { id: 's2', product: 'BX-099', term: 'Infusion reaction grade ≥3',  count: 8,  prr: 2.1, status: 'monitoring', owner: 'TP', age: '11 days' },
    { id: 's3', product: 'BX-204', term: 'Hepatic enzyme elevation',    count: 14, prr: 1.8, status: 'monitoring', owner: 'JC', age: '6 days' },
  ],
  psurs: [
    { product: 'BX-099', cycle: 'PSUR 2026-Q2',  dueAgency: 'EMA · day +60', writtenBy: 'AnA', reviewers: ['TP', 'MS'], status: 'drafting' },
    { product: 'BX-099', cycle: 'PBRER 2026-H1', dueAgency: 'FDA · day +60', writtenBy: 'AnA', reviewers: ['TP', 'MS'], status: 'queued' },
  ],
};

/* ───── JNDA (Japan) fixtures ───── */
export const FIXTURE_JNDA = {
  pmdaClock: {
    consultation: '2025-10-14',
    application: '2026-08-01 (planned)',
    day85: '2026-10-25',
    day120: '2027-01-29',
    pmdaTarget: '2027-08-01',
    chuiyaku: '2027-11-15',
  },
  bridgingStudies: [
    { id: 'BX204-JP-001', kind: 'Japanese PK',    n: 24,  status: 'enrolling', site: 'Tokyo · Osaka' },
    { id: 'BX204-201',    kind: 'Global pivotal', n: 184, status: 'final',     site: '14 countries · Japan 22 subj' },
  ],
  consultations: [
    { kind: 'PMDA consultation', date: '2024-11-12', topic: 'Bridging strategy',                       status: 'closed', resolution: 'PMDA aligned on Japan PK + global efficacy' },
    { kind: 'Document consult',  date: '2025-08-04', topic: 'MAH transfer / Yakuji-ho compliance',     status: 'closed', resolution: 'Local responsible person designated' },
    { kind: 'Pre-NDA consult',   date: '2026-04-18', topic: 'CMC bridging — Japan release tests',      status: 'open',   resolution: '60-day response due' },
  ],
};

/* ───── Lifecycle management fixtures (post-approval changes) ───── */
export const FIXTURE_LIFECYCLE = {
  supplements: [
    { id: 'sNDA-211990-001', kind: 'sNDA · Prior Approval',  product: 'BX-099', subject: 'Pediatric indication extension',           status: 'filed',    agency: 'FDA',  filed: '2026-03-04', due: 'PDUFA 2026-09-04' },
    { id: 'sNDA-211990-002', kind: 'sNDA · CBE-30',          product: 'BX-099', subject: 'Manufacturing site addition (DS)',         status: 'filed',    agency: 'FDA',  filed: '2026-04-22', due: 'Effective 2026-05-22' },
    { id: 'EU-VAR-006012-1', kind: 'Type II variation',      product: 'BX-099', subject: 'Specification change — host cell protein', status: 'review',   agency: 'EMA',  filed: '2026-02-11', due: 'CHMP day 60' },
    { id: 'EU-VAR-006012-2', kind: 'Type IB variation',      product: 'BX-099', subject: 'Container closure update',                 status: 'drafting', agency: 'EMA',  filed: null,         due: 'Target 2026-06' },
    { id: 'JP-VAR-2024-3',   kind: 'Partial change · Japan', product: 'BX-099', subject: 'Manufacturer change',                      status: 'review',   agency: 'PMDA', filed: '2026-01-15', due: 'PMDA day 60' },
  ],
  cmcChangeControl: [
    { id: 'cc-101', area: 'Drug substance',  risk: 'high',   title: 'Bioreactor scale-up 2,000L → 5,000L', programs: ['BX-099', 'BX-204'], status: 'evaluating' },
    { id: 'cc-102', area: 'Drug product',    risk: 'medium', title: 'Stopper supplier switch',             programs: ['BX-099'],           status: 'planned' },
    { id: 'cc-103', area: 'Specifications',  risk: 'low',    title: 'Tighten aggregate spec',              programs: ['BX-099'],           status: 'implemented' },
  ],
  renewals: [
    { product: 'BX-099', authority: 'FDA',  next: 'PADER · 2026-09-30',   interval: 'Annual' },
    { product: 'BX-099', authority: 'EMA',  next: 'Renewal · 2030-02-14', interval: '5-year' },
    { product: 'BX-099', authority: 'PMDA', next: 'Re-exam · 2032-02-14', interval: '8-year' },
  ],
};

/* ───── Orphan and rare disease fixtures ───── */
export const FIXTURE_ORPHAN = {
  designations: [
    { product: 'BX-256', indication: 'RPE65-mediated dystrophy',  agency: 'FDA',  status: 'designated', date: '2024-08-12', prevalence: '~3,000 US patients',    benefits: ['7-yr exclusivity', 'PDUFA waiver', 'Tax credit'] },
    { product: 'BX-256', indication: 'RPE65-mediated dystrophy',  agency: 'EMA',  status: 'designated', date: '2024-11-04', prevalence: '<5 per 10k EU',         benefits: ['10-yr exclusivity', 'Protocol assistance', 'Fee reduction'] },
    { product: 'BX-301', indication: 'Relapsed multiple myeloma', agency: 'FDA',  status: 'requested',  date: '2026-03-22', prevalence: '<200k US patients',     benefits: ['Pending'] },
    { product: 'BX-420', indication: 'Pediatric biologic',        agency: 'PMDA', status: 'designated', date: '2025-05-01', prevalence: '~4,200 Japan patients', benefits: ['Re-exam 10-yr', 'Priority review'] },
    { product: 'BX-115', indication: 'CNS · rare seizure',        agency: 'FDA',  status: 'planned',    date: null,         prevalence: '~7,500 US patients',    benefits: ['Pre-submission'] },
  ],
  rpdGrants: [
    { product: 'BX-256', kind: 'Rare Pediatric Disease', status: 'received', voucherValue: '$100M+', notes: 'Voucher issued at approval, sold 2024' },
    { product: 'BX-420', kind: 'NIH rare disease grant', status: 'awarded',  voucherValue: '$2.4M',  notes: '4-yr funded · year 2' },
  ],
  patientAdvocacy: [
    { org: 'RPE65 Foundation',          product: 'BX-256', engagement: 'Steering committee · Q monthly' },
    { org: 'Multiple Myeloma Research', product: 'BX-301', engagement: 'CAB · biannual' },
    { org: 'Childhood Neurology Net',   product: 'BX-115', engagement: 'Early dialogue' },
  ],
};

/* ───── Agency meetings fixtures ───── */
export const FIXTURE_MEETINGS = {
  upcoming: [
    { id: 'mtg-014', kind: 'FDA · Type C',   product: 'BX-115', date: '2026-06-08', topic: 'CMC stability strategy',      status: 'briefing-due', briefingDue: '2026-05-25', briefingPct: 60, owner: 'AR' },
    { id: 'mtg-015', kind: 'EMA · SciAdv',   product: 'BX-420', date: '2026-07-14', topic: 'PIP modification scope',      status: 'briefing-due', briefingDue: '2026-06-23', briefingPct: 30, owner: 'MS' },
    { id: 'mtg-016', kind: 'PMDA · Pre-NDA', product: 'BX-204', date: '2026-08-22', topic: 'Bridging strategy alignment', status: 'scheduled',    briefingDue: '2026-07-25', briefingPct: 0,  owner: 'JC' },
    { id: 'mtg-017', kind: 'FDA · Type B',   product: 'BX-256', date: '2026-09-09', topic: 'Pre-IND alignment',           status: 'requested',    briefingDue: null,         briefingPct: 0,  owner: 'TP' },
  ],
  recent: [
    { id: 'mtg-009', kind: 'FDA · Type B',      product: 'BX-115', date: '2025-11-12', topic: 'Nonclinical package adequacy', outcome: 'aligned', minutes: 'received · 2025-12-04' },
    { id: 'mtg-010', kind: 'FDA · Type C',      product: 'BX-204', date: '2026-02-04', topic: 'Pediatric extrapolation',      outcome: 'aligned', minutes: 'received · 2026-02-28' },
    { id: 'mtg-011', kind: 'EMA · SciAdv',      product: 'BX-420', date: '2026-03-19', topic: 'PIP scope',                    outcome: 'partial', minutes: 'received · 2026-04-11' },
    { id: 'mtg-012', kind: 'PMDA · DocConsult', product: 'BX-204', date: '2026-04-18', topic: 'CMC bridging',                 outcome: 'open',    minutes: 'pending' },
  ],
  briefingBooks: [
    { meetingId: 'mtg-014', sections: 6, drafted: 4, reviewed: 2, finalized: 0 },
    { meetingId: 'mtg-015', sections: 5, drafted: 2, reviewed: 0, finalized: 0 },
    { meetingId: 'mtg-016', sections: 8, drafted: 0, reviewed: 0, finalized: 0 },
  ],
};
