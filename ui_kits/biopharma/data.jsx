(() => {
/* Biopharma kit — data fixtures
 * ─────────────────────────────────────────────────────────────────
 * Mirrors the MDX kit's data layout so the same shell + chassis
 * components render against either domain. Window globals follow
 * the MDX naming (MDX_NAV_GROUPS, MDX_NAV_V2, MDX_PROGRAMS) — the
 * shell reads those names, so re-assigning them here is the cleanest
 * cross-domain swap. In v2 these lift to:
 *   client/src/concept2cure/biopharma/data/{nav,programs}.ts
 * and the rail/topbar/tabbar take `domain="biopharma"` as a prop
 * that picks which dataset to read.
 */

const BIOPHARMA_NAV_GROUPS = [
  { id: 'workstream',   label: 'Workstream' },
  { id: 'lifecycle',    label: 'Lifecycle' },
  { id: 'workbench',    label: 'Workbench' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'system',       label: '' },
];

const BIOPHARMA_NAV_V2 = [
  // Workstream — biopharma pathways
  { id: 'overview',    label: 'Overview',                   icon: 'grid',         group: 'workstream' },
  { id: 'ind',         label: 'IND / CTA',                  icon: 'flask',        group: 'workstream' },
  { id: 'nda',         label: 'NDA · 505(b)',               icon: 'file',         group: 'workstream' },
  { id: 'bla',         label: 'BLA · 351(a)',               icon: 'atom',         group: 'workstream' },
  { id: 'maa',         label: 'MAA · EU centralized',       icon: 'globe',        group: 'workstream' },
  { id: 'jnda',        label: 'JNDA · Japan',               icon: 'shieldCheck',  group: 'workstream' },
  { id: 'precedent',   label: 'Precedent intelligence',     icon: 'scale',        group: 'workstream' },

  // Lifecycle — biopharma-specific lifecycle surfaces
  { id: 'lifecycle',   label: 'Lifecycle management',       icon: 'history',      group: 'lifecycle' },
  { id: 'cmc',         label: 'CMC · Module 3',             icon: 'beaker',       group: 'lifecycle' },
  { id: 'clinical',    label: 'Clinical operations',        icon: 'users',        group: 'lifecycle' },
  { id: 'pharmacov',   label: 'Pharmacovigilance · PSUR',   icon: 'alertCircle',  group: 'lifecycle' },
  { id: 'pediatric',   label: 'Pediatric · PIP / PSP',      icon: 'shieldCheck',  group: 'lifecycle' },
  { id: 'orphan',      label: 'Orphan and rare',            icon: 'sparkles',     group: 'lifecycle' },
  { id: 'meetings',    label: 'Agency meetings',            icon: 'chat',         group: 'lifecycle' },
  { id: 'biostat',     label: 'Biostatistics',              icon: 'sigma',        group: 'lifecycle' },

  // Workbench — shared chassis with MDX (reuses MDX components in v2)
  { id: 'tasks',       label: 'Tasks and reviews',          icon: 'clipboardList', group: 'workbench' },
  { id: 'ana-review',  label: 'AnA review queue',           icon: 'sparkles',      group: 'workbench' },
  { id: 'vault',       label: 'Document vault',             icon: 'vault',         group: 'workbench' },
  { id: 'validation',  label: 'Validation center',          icon: 'shieldAlert',   group: 'workbench' },
  { id: 'submissions', label: 'Submission center',          icon: 'rocket',        group: 'workbench' },
  { id: 'qsub',        label: 'Type B/C · Pre-NDA briefing',icon: 'chat',          group: 'workbench' },
  { id: 'templates',   label: 'Templates',                  icon: 'template',      group: 'workbench' },

  // Intelligence
  { id: 'analytics',     label: 'Analytics',               icon: 'barChart3', group: 'intelligence' },
  { id: 'memory',        label: 'AnA memory',              icon: 'database',  group: 'intelligence' },
  { id: 'conversations', label: 'AnA conversations',       icon: 'chat',      group: 'intelligence' },

  // System
  { id: 'search',        label: 'Global search',           icon: 'search',    group: 'system' },
  { id: 'notifications', label: 'Notifications',           icon: 'bell',      group: 'system' },
  { id: 'audit',         label: 'Audit log',               icon: 'shield',    group: 'system' },
  { id: 'onboarding',    label: 'Onboarding',              icon: 'upload',    group: 'system' },
  { id: 'admin',         label: 'Admin and access',        icon: 'userCheck', group: 'system' },
];

/* ───── Programs — biopharma portfolio ───── */
const BIOPHARMA_PROGRAMS = [
  { id: 'bx204', title: 'BX-204',          code: 'mAb · oncology',          pathway: 'nda', stage: 'NDA filing',                stageIdx: 5, readiness: 87, status: 'active',   lead: 'Jordan Chen',     owners: ['JC','AR','BK','MS'], nextBlocker: 'Module 2.7 clinical summary — reviewer feedback open', dueLabel: 'FDA NDA · 41 days',     dueTone: 'warn', lastActivity: '2h ago',  meta: 'NDA 212345 · accelerated approval pathway · §505(b)(1)' },
  { id: 'bx301', title: 'BX-301',          code: 'CAR-T · hematology',      pathway: 'bla', stage: 'BLA assembly',              stageIdx: 4, readiness: 64, status: 'active',   lead: 'Theo Park',       owners: ['TP','BK','MS'],      nextBlocker: 'Stability data trend — 21 months OOS pending review',  dueLabel: 'FDA BLA · Q3 2026',     dueTone: 'ok',   lastActivity: '5h ago',  meta: 'BLA 401223 · breakthrough designation · §351(a)' },
  { id: 'bx115', title: 'BX-115',          code: 'small mol · CNS',         pathway: 'ind', stage: 'Phase II open-label',       stageIdx: 3, readiness: 52, status: 'active',   lead: 'Alex Reyes',      owners: ['AR','BK','TP'],      nextBlocker: 'IND amendment · protocol BX115-202 revision pending',  dueLabel: 'IND amend · 14 days',   dueTone: 'err',  lastActivity: '1h ago',  meta: 'IND 178902 · NME · §312.30 amendment cycle' },
  { id: 'bx420', title: 'BX-420',          code: 'biologic · pediatric',    pathway: 'maa', stage: 'EMA scientific advice',     stageIdx: 2, readiness: 38, status: 'blocked',  lead: 'Marina Stein',    owners: ['MS','JC','AR'],      nextBlocker: 'PIP modification — paediatric population scope change', dueLabel: 'CHMP day 80 · 92 days', dueTone: 'warn', lastActivity: '6h ago',  meta: 'MAA · EMEA/H/C/006012 · pediatric inv. plan EMEA-P-001' },
  { id: 'bx099', title: 'BX-099',          code: 'mAb · autoimmune',        pathway: 'nda', stage: 'Approved',                  stageIdx: 7, readiness: 100,status: 'complete', lead: 'Jordan Chen',     owners: ['JC','MS'],           nextBlocker: null,                                                    dueLabel: 'Approved · Feb 2026',   dueTone: 'ok',   lastActivity: '3w ago',  meta: 'NDA 211990 · launched · PSUR cycle Q2 2026' },
  { id: 'bx256', title: 'BX-256',          code: 'gene tx · ophthalmology', pathway: 'ind', stage: 'Pre-IND meeting',           stageIdx: 1, readiness: 24, status: 'active',   lead: 'Theo Park',       owners: ['TP','AR'],           nextBlocker: 'FDA Type B meeting prep · pediatric strategy section',  dueLabel: 'Pre-IND · 28 days',     dueTone: 'warn', lastActivity: '30m ago', meta: 'PIND 167002 · rare disease · orphan designation pending' },
  { id: 'bx502', title: 'BX-502',          code: 'biosimilar · oncology',   pathway: 'bla', stage: 'Comparability filing',      stageIdx: 4, readiness: 71, status: 'active',   lead: 'Alex Reyes',      owners: ['AR','BK'],           nextBlocker: 'Analytical similarity Tier 1 — 2 attrs OOS',           dueLabel: 'BLA · Q4 2026',         dueTone: 'ok',   lastActivity: '2d ago',  meta: '351(k) biosimilar · 12 analytical attributes · 3 clinical' },
];

/* ───── Recent activity (workstream-aware) ───── */
const BIOPHARMA_RECENT = [
  { kind: 'draft',  who: 'AnA',         what: 'NDA §2.5 clinical overview',         where: 'BX-204',  pill: 'Drafting',    tone: 'info', when: '2 min ago' },
  { kind: 'review', who: 'M. Stein',    what: 'CMC §3.2.S drug substance section', where: 'BX-301',  pill: 'Reviewed',    tone: 'ok',   when: '18 min ago' },
  { kind: 'block',  who: 'FDA review',  what: 'IND amendment IIR pending',          where: 'BX-115',  pill: '2 gaps',      tone: 'err',  when: '1 hour ago' },
  { kind: 'meet',   who: 'EMA · CHMP',  what: 'Day 80 list of questions received', where: 'BX-420',  pill: '14 LoQ',      tone: 'warn', when: '3 hours ago' },
  { kind: 'pv',     who: 'PV system',   what: 'FAERS signal threshold crossed',     where: 'BX-099',  pill: 'Signal',      tone: 'warn', when: 'yesterday' },
  { kind: 'submit', who: 'J. Chen',     what: 'IND submission · Q1-026',           where: 'BX-256',  pill: 'In transit',  tone: 'info', when: 'yesterday' },
];

/* ───── IND fixtures (the hero deep-dive) ───── */
const BIOPHARMA_IND = {
  modules: [
    { id: 'm1',  path: 'M1',      label: 'Administrative',         readiness: 92, status: 'review',    sections: 8,  done: 7 },
    { id: 'm2',  path: 'M2',      label: 'Summaries',              readiness: 68, status: 'drafted',   sections: 6,  done: 4 },
    { id: 'm3',  path: 'M3',      label: 'CMC',                    readiness: 71, status: 'review',    sections: 12, done: 8 },
    { id: 'm4',  path: 'M4',      label: 'Nonclinical',            readiness: 84, status: 'approved',  sections: 9,  done: 8 },
    { id: 'm5',  path: 'M5',      label: 'Clinical',               readiness: 48, status: 'drafted',   sections: 14, done: 6 },
  ],
  /* HAQs and informal interactions live in one stream — Weave treats HAQs as
     a separate product surface; we fold them into the same FDA-interaction
     queue here. Each row carries an haqRefId when it originated as a Health
     Authority Question, plus the prior-submission link AnA uses to draft.
     Moat #2 — Pre-submission HAQ simulator — adds `status: 'predicted'`
     rows: HAQs AnA expects the agency to raise, scored by likelihood and
     anchored to the historical decision corpus they were predicted from. */
  fdaInteractions: [
    /* Predicted HAQs (Moat #2) — surfaced BEFORE the agency raises them.
       Each carries a confidence + a "predicted from" anchor (prior FDA
       decision, similar product code, or analog reviewer panel). */
    { kind: 'HAQ · predicted', date: 'Predicted',  topic: 'CMC: comparability protocol for forthcoming DS supplier change', status: 'predicted', resolution: 'AnA suggests pre-empting · response draftable now', priorRef: 'Predicted from BLA 761987 D60 LoQ', due: 'Pre-submission', haqRefId: 'PRED-CMC-01', confidence: 0.86 },
    { kind: 'HAQ · predicted', date: 'Predicted',  topic: 'Statistical: handling of subjects switching arms in BX204-301',  status: 'predicted', resolution: 'AnA pre-drafted response anchored on SAP v3 §9.4', priorRef: 'Predicted from EMEA/H/C/005612 D80 LoQ', due: 'Pre-submission', haqRefId: 'PRED-STAT-01', confidence: 0.72 },
    { kind: 'HAQ · predicted', date: 'Predicted',  topic: 'Pediatric: rationale for 12-17 age range exclusion in pivotal',  status: 'predicted', resolution: 'AnA proposes citing PIP modification + Type C 2026-02-04', priorRef: 'Predicted from 4 prior oncology pediatric LoQs', due: 'Pre-submission', haqRefId: 'PRED-PED-01', confidence: 0.91 },

    /* Actual (inbound) HAQs */
    { kind: 'Type B · Pre-IND',  date: '2025-11-12', topic: 'Nonclinical package adequacy',         status: 'closed',    resolution: 'FDA aligned on tox package',                       priorRef: 'IND 178902 §4.2.3',  due: null,        haqRefId: null },
    { kind: 'Type C',            date: '2026-02-04', topic: 'Pediatric extrapolation framework',   status: 'closed',    resolution: 'Bridging supported',                                priorRef: 'PSP-204',            due: null,        haqRefId: null },
    { kind: 'HAQ · CMC',         date: '2026-04-22', topic: 'CMC stability trend at 18 months',    status: 'drafting',  resolution: 'AnA drafted v0.3 · awaiting reviewer',              priorRef: 'IND §3.2.S.7.3',     due: '5 days',    haqRefId: 'HAQ-2026-04-22-A' },
    { kind: 'HAQ · clinical',    date: '2026-04-22', topic: 'Adverse event narrative — subj 014-008', status: 'open',   resolution: '14-day response window · day 9',                    priorRef: 'CSR-201 §10.4',      due: '5 days',    haqRefId: 'HAQ-2026-04-22-B' },
    { kind: 'HAQ · nonclinical', date: '2026-04-22', topic: 'Genotoxicity follow-up rationale',    status: 'open',      resolution: 'Source: 13-week tox; AnA suggests bridging',         priorRef: 'IND §2.6.5',         due: '5 days',    haqRefId: 'HAQ-2026-04-22-C' },
    { kind: 'Safety report',     date: '2026-05-08', topic: 'SUSAR · BX115-202 subject 014-008',   status: 'submitted', resolution: '7-day expedited filed',                              priorRef: null,                 due: null,        haqRefId: null },
  ],
  contradictions: [
    { id: 'c1', sev: 'warn',  title: 'Stability prediction conflict',
      desc: 'Module 3.2.P.8 cites a 24-month shelf life; Phase II protocol BX115-202 assumes 18-month supply window.',
      where: ['M3 §3.2.P.8.3', 'Protocol BX115-202 §6.4'], owner: 'AR' },
    { id: 'c2', sev: 'err',   title: 'Exposure-response narrative',
      desc: 'Module 2.7.2 PK/PD discussion uses pre-amendment dose; Module 2.5 efficacy section cites post-amendment exposure.',
      where: ['M2 §2.5.4', 'M2 §2.7.2'], owner: 'BK' },
  ],
  blockers: [
    { id: 'b1', sev: 'err',  who: 'AR', label: 'Drug substance stability — 24-month projection',  due: 'Day 9 of 14',     section: 'M3 §3.2.S.7.3' },
    { id: 'b2', sev: 'warn', who: 'BK', label: 'Statistical analysis plan — interim dataset cut', due: 'Wed · 2 days',    section: 'M5 §5.3.5.1' },
    { id: 'b3', sev: 'warn', who: 'TP', label: 'Pediatric assessment waiver justification',       due: 'Next Thu',        section: 'M1 §1.9' },
  ],
};

/* ───── NDA fixtures ───── */
const BIOPHARMA_NDA = {
  modules: [
    { id: 'm1', path: 'M1', label: 'Administrative',    readiness: 95, status: 'approved', sections: 18, done: 17 },
    { id: 'm2', path: 'M2', label: 'CTD summaries',     readiness: 81, status: 'review',   sections: 7,  done: 6 },
    { id: 'm3', path: 'M3', label: 'CMC',               readiness: 88, status: 'review',   sections: 24, done: 21 },
    { id: 'm4', path: 'M4', label: 'Nonclinical reports',readiness:100,status: 'approved', sections: 16, done: 16 },
    { id: 'm5', path: 'M5', label: 'Clinical reports',  readiness: 74, status: 'drafted',  sections: 38, done: 27 },
  ],
  pivotalStudies: [
    { id: 'BX204-201', phase: 'II', n: 184,  primary: 'ORR 38.6% (95% CI 31.5–46.0)',  status: 'final',   csr: 'CSR-201 v2.0' },
    { id: 'BX204-101', phase: 'I',  n: 42,   primary: 'RP2D 12 mg/kg q3w',              status: 'final',   csr: 'CSR-101 v1.0' },
    { id: 'BX204-301', phase: 'III',n: 612,  primary: 'OS hazard ratio 0.62',          status: 'topline', csr: 'CSR-301 v0.2' },
  ],
  reviewClock: {
    filed: '2026-06-04 (planned)', accepted: 'pending', day60: '2026-08-03', day74: '2026-08-17',
    midcycle: '2026-12-15', day120: '2026-10-02', advisoryCmte: 'TBD', pdufa: '2027-04-04',
  },
};

/* ───── Pediatric fixtures (PIP/PSP) ───── */
const BIOPHARMA_PEDIATRIC = {
  plans: [
    { id: 'pip-420', kind: 'EMA PIP',   product: 'BX-420', status: 'agreed',     ageRange: '2–17',  deferrals: 2, waivers: 1, milestones: 8, due: 'Trial readout · Q1 2027' },
    { id: 'psp-204', kind: 'FDA iPSP',  product: 'BX-204', status: 'submitted',  ageRange: '12–17', deferrals: 1, waivers: 0, milestones: 5, due: 'PREA · post-approval Y2' },
    { id: 'pip-301', kind: 'EMA PIP',   product: 'BX-301', status: 'in draft',   ageRange: '0–17',  deferrals: 0, waivers: 1, milestones: 6, due: 'CHMP advice · Q3 2026' },
    { id: 'psp-115', kind: 'FDA iPSP',  product: 'BX-115', status: 'in draft',   ageRange: '6–17',  deferrals: 0, waivers: 0, milestones: 4, due: 'Pre-IND meeting · 28 days' },
  ],
  prea: {
    waiversFiled: 1, deferralsActive: 3, openMilestones: 7,
    upcoming: [
      { product: 'BX-204',  ms: 'Adolescent PK substudy — interim',       due: 'Aug 2026' },
      { product: 'BX-420',  ms: 'Juvenile tox study report — final',      due: 'Oct 2026' },
      { product: 'BX-301',  ms: 'Cohort C enrollment — first patient in', due: 'Nov 2026' },
    ],
  },
};

/* ───── Pharmacovigilance fixtures (PSUR cycle + signals) ───── */
const BIOPHARMA_PV = {
  signals: [
    { id: 's1', product: 'BX-099', term: 'Immune-mediated pneumonitis', count: 27, prr: 4.2,  status: 'evaluating', owner: 'TP', age: '3 days' },
    { id: 's2', product: 'BX-099', term: 'Infusion reaction grade ≥3',  count: 8,  prr: 2.1,  status: 'monitoring', owner: 'TP', age: '11 days' },
    { id: 's3', product: 'BX-204', term: 'Hepatic enzyme elevation',    count: 14, prr: 1.8,  status: 'monitoring', owner: 'JC', age: '6 days' },
  ],
  psurs: [
    { product: 'BX-099', cycle: 'PSUR 2026-Q2', dueAgency: 'EMA · day +60', writtenBy: 'AnA', reviewers: ['TP','MS'], status: 'drafting' },
    { product: 'BX-099', cycle: 'PBRER 2026-H1',dueAgency: 'FDA · day +60', writtenBy: 'AnA', reviewers: ['TP','MS'], status: 'queued' },
  ],
};

/* ───── JNDA (Japan) fixtures ───── */
const BIOPHARMA_JNDA = {
  pmdaClock: {
    consultation: '2025-10-14',
    application:  '2026-08-01 (planned)',
    day85:        '2026-10-25',
    day120:       '2027-01-29',
    pmdaTarget:   '2027-08-01',
    chuiyaku:     '2027-11-15',
  },
  bridgingStudies: [
    { id: 'BX204-JP-001', kind: 'Japanese PK',   n: 24,  status: 'enrolling', site: 'Tokyo · Osaka' },
    { id: 'BX204-201',    kind: 'Global pivotal',n: 184, status: 'final',     site: '14 countries · Japan 22 subj' },
  ],
  consultations: [
    { kind: 'PMDA consultation', date: '2024-11-12', topic: 'Bridging strategy', status: 'closed',  resolution: 'PMDA aligned on Japan PK + global efficacy' },
    { kind: 'Document consult',  date: '2025-08-04', topic: 'MAH transfer / Yakuji-ho compliance', status: 'closed', resolution: 'Local responsible person designated' },
    { kind: 'Pre-NDA consult',   date: '2026-04-18', topic: 'CMC bridging — Japan release tests',  status: 'open',   resolution: '60-day response due' },
  ],
  programs: ['BX-204', 'BX-099'],
};

/* ───── Lifecycle management fixtures (post-approval changes) ───── */
const BIOPHARMA_LIFECYCLE = {
  supplements: [
    { id: 'sNDA-211990-001', kind: 'sNDA · Prior Approval',   product: 'BX-099', subject: 'Pediatric indication extension', status: 'filed',    agency: 'FDA',  filed: '2026-03-04', due: 'PDUFA 2026-09-04' },
    { id: 'sNDA-211990-002', kind: 'sNDA · CBE-30',           product: 'BX-099', subject: 'Manufacturing site addition (DS)', status: 'filed',  agency: 'FDA',  filed: '2026-04-22', due: 'Effective 2026-05-22' },
    { id: 'EU-VAR-006012-1', kind: 'Type II variation',       product: 'BX-099', subject: 'Specification change — host cell protein',  status: 'review',  agency: 'EMA',  filed: '2026-02-11', due: 'CHMP day 60' },
    { id: 'EU-VAR-006012-2', kind: 'Type IB variation',       product: 'BX-099', subject: 'Container closure update',         status: 'drafting',agency: 'EMA',  filed: null,         due: 'Target 2026-06' },
    { id: 'JP-VAR-2024-3',   kind: 'Partial change · Japan',  product: 'BX-099', subject: 'Manufacturer change',              status: 'review',  agency: 'PMDA', filed: '2026-01-15', due: 'PMDA day 60' },
  ],
  cmcChangeControl: [
    { id: 'cc-101', area: 'Drug substance', risk: 'high',   title: 'Bioreactor scale-up 2,000L → 5,000L', programs: ['BX-099', 'BX-204'], status: 'evaluating' },
    { id: 'cc-102', area: 'Drug product',   risk: 'medium', title: 'Stopper supplier switch',             programs: ['BX-099'],          status: 'planned'    },
    { id: 'cc-103', area: 'Specifications', risk: 'low',    title: 'Tighten aggregate spec',              programs: ['BX-099'],          status: 'implemented'},
  ],
  renewals: [
    { product: 'BX-099', authority: 'FDA',  next: 'PADER · 2026-09-30', interval: 'Annual' },
    { product: 'BX-099', authority: 'EMA',  next: 'Renewal · 2030-02-14', interval: '5-year' },
    { product: 'BX-099', authority: 'PMDA', next: 'Re-exam · 2032-02-14', interval: '8-year' },
  ],
};

/* ───── Orphan and rare disease fixtures ───── */
const BIOPHARMA_ORPHAN = {
  designations: [
    { product: 'BX-256', indication: 'RPE65-mediated dystrophy',  agency: 'FDA',  status: 'designated',  date: '2024-08-12', prevalence: '~3,000 US patients',      benefits: ['7-yr exclusivity','PDUFA waiver','Tax credit'] },
    { product: 'BX-256', indication: 'RPE65-mediated dystrophy',  agency: 'EMA',  status: 'designated',  date: '2024-11-04', prevalence: '<5 per 10k EU',           benefits: ['10-yr exclusivity','Protocol assistance','Fee reduction'] },
    { product: 'BX-301', indication: 'Relapsed multiple myeloma', agency: 'FDA',  status: 'requested',   date: '2026-03-22', prevalence: '<200k US patients',       benefits: ['Pending'] },
    { product: 'BX-420', indication: 'Pediatric biologic',        agency: 'PMDA', status: 'designated',  date: '2025-05-01', prevalence: '~4,200 Japan patients',   benefits: ['Re-exam 10-yr','Priority review'] },
    { product: 'BX-115', indication: 'CNS · rare seizure',        agency: 'FDA',  status: 'planned',     date: null,         prevalence: '~7,500 US patients',      benefits: ['Pre-submission'] },
  ],
  rpdGrants: [
    { product: 'BX-256', kind: 'Rare Pediatric Disease',     status: 'received',       voucherValue: '$100M+', notes: 'Voucher issued at approval, sold 2024' },
    { product: 'BX-420', kind: 'NIH rare disease grant',     status: 'awarded',        voucherValue: '$2.4M',  notes: '4-yr funded · year 2' },
  ],
  patientAdvocacy: [
    { org: 'RPE65 Foundation',          product: 'BX-256', engagement: 'Steering committee · Q monthly' },
    { org: 'Multiple Myeloma Research', product: 'BX-301', engagement: 'CAB · biannual' },
    { org: 'Childhood Neurology Net',   product: 'BX-115', engagement: 'Early dialogue' },
  ],
};

/* ───── Agency meetings fixtures ───── */
const BIOPHARMA_MEETINGS = {
  upcoming: [
    { id: 'mtg-014', kind: 'FDA · Type C',     product: 'BX-115', date: '2026-06-08', topic: 'CMC stability strategy',         status: 'briefing-due',  briefingDue: '2026-05-25', briefingPct: 60, owner: 'AR' },
    { id: 'mtg-015', kind: 'EMA · SciAdv',     product: 'BX-420', date: '2026-07-14', topic: 'PIP modification scope',         status: 'briefing-due',  briefingDue: '2026-06-23', briefingPct: 30, owner: 'MS' },
    { id: 'mtg-016', kind: 'PMDA · Pre-NDA',   product: 'BX-204', date: '2026-08-22', topic: 'Bridging strategy alignment',    status: 'scheduled',     briefingDue: '2026-07-25', briefingPct: 0,  owner: 'JC' },
    { id: 'mtg-017', kind: 'FDA · Type B',     product: 'BX-256', date: '2026-09-09', topic: 'Pre-IND alignment',              status: 'requested',     briefingDue: null,         briefingPct: 0,  owner: 'TP' },
  ],
  recent: [
    { id: 'mtg-009', kind: 'FDA · Type B',     product: 'BX-115', date: '2025-11-12', topic: 'Nonclinical package adequacy',   outcome: 'aligned',     minutes: 'received · 2025-12-04' },
    { id: 'mtg-010', kind: 'FDA · Type C',     product: 'BX-204', date: '2026-02-04', topic: 'Pediatric extrapolation',        outcome: 'aligned',     minutes: 'received · 2026-02-28' },
    { id: 'mtg-011', kind: 'EMA · SciAdv',     product: 'BX-420', date: '2026-03-19', topic: 'PIP scope',                      outcome: 'partial',     minutes: 'received · 2026-04-11' },
    { id: 'mtg-012', kind: 'PMDA · DocConsult',product: 'BX-204', date: '2026-04-18', topic: 'CMC bridging',                   outcome: 'open',        minutes: 'pending' },
  ],
  briefingBooks: [
    { meetingId: 'mtg-014', sections: 6, drafted: 4, reviewed: 2, finalized: 0 },
    { meetingId: 'mtg-015', sections: 5, drafted: 2, reviewed: 0, finalized: 0 },
    { meetingId: 'mtg-016', sections: 8, drafted: 0, reviewed: 0, finalized: 0 },
  ],
};

/* ───── AnA suggestions per surface ───── */
const BIOPHARMA_SUGGESTIONS = {
  overview:  ['Find biopharma precedents for breakthrough designation', 'Generate cross-portfolio readiness report', 'Flag filing risks for the next 90 days'],
  ind:       ['Draft IND amendment · BX-115 protocol revision', 'Open SUSAR 7-day form', 'Check Module 3 stability narrative'],
  nda:       ['Strengthen NDA §2.5 against FDA 2023 oncology bridging guidance', 'Draft FDA Q-Sub for Type B', 'Run NDA readiness diagnostic'],
  bla:       ['Compare BX-502 to RP3 reference', 'Run Tier 1 analytical similarity check', 'Draft 351(k) bridging strategy'],
  maa:       ['Pull EU MDR Annex II ⇄ ICH M4 crosswalk for §3.2.P', 'Generate CHMP day 120 response pack',  'Compare PSP and PIP scopes'],
  jnda:      ['Pull PMDA bridging precedent for oncology', 'Compare Japan PK to global pool', 'Draft Yakuji-ho compliance checklist'],
  lifecycle: ['Compare CMC change-control across BX-099 and BX-204', 'Draft Type II variation against EMA guidance', 'Open every supplement filed in last 90 days'],
  orphan:    ['Find orphan precedents in RPE65 dystrophy', 'Draft FDA orphan application narrative', 'Pull every RPD voucher transaction 2022-2025'],
  meetings:  ['Generate Type C briefing book outline · BX-115', 'Pull every aligned FDA outcome 2024-2026', 'Cross-reference past minutes for stability strategy'],
  cmc:       ['Reconcile drug substance specs across CSR-201 and §3.2.S.4.1', 'Pull stability trend at 24 months', 'Generate process performance summary'],
  pharmacov: ['Adjudicate pneumonitis signal · BX-099', 'Draft PSUR §15 risk evaluation', 'Cross-reference EudraVigilance + FAERS'],
  pediatric: ['Draft PSP rationale for adolescent extrapolation', 'Compare PIP modifications across BX-420 and BX-301', 'Surface every PIP milestone due in 90 days'],
  precedent: ['Find 5 closest precedents to BX-204 ORR threshold', 'Pull all accelerated approvals 2022–2025 for solid tumors', 'Cluster by mechanism of action'],
};

/* ───── Domain header info ───── */
const BIOPHARMA_DOMAIN = {
  id:       'biopharma',
  label:    'Biotech and Pharma',
  brand:    '8 active programs · NDA · BLA · MAA · IND',
  pathways: ['IND', 'NDA', 'BLA', 'MAA', 'CTA'],
};

/* ───── Client-type configurations (Option C — one shell, three tenants)
 * Tenant types drive: rail filter, tab filter, Overview content, AnA dock
 * suggestion scope. Set in v2 from `organizations.client_type` and pinned
 * into the AnA dock's module context. Kit harness exposes a switcher so
 * reviewers can preview all three. */
const CLIENT_TYPES = {
  medtech: {
    label: 'Medical device and diagnostics',
    domainLabel: 'Medical Device and Diagnostics',
    /* Which biopharma surfaces this tenant sees. (Medtech tenants use the
     * MDX kit for their primary domain; this entry exists so the chassis
     * stays generic. Empty workstream means "use MDX kit instead.") */
    workstream:  [],
    lifecycle:   [],
    redirectTo:  '../mdx/index.html',
    overview: {
      greetingState: 'Two 510(k) submissions in review, three IVDR audits in flight, and post-market signals queued.',
      starters: [
        '30-second status on each device for the 9 AM standup',
        'Triage every open MDR across the portfolio',
        'What overnight from FDA, EU Notified Body, MHRA?',
        'Show me every blocker on the 510(k) pipeline',
      ],
    },
  },
  biotech: {
    label: 'Biotech',
    domainLabel: 'Biotech',
    /* Biotech-specific: biologics (BLA), gene/cell therapy (ATMP), heavy
     * orphan/rare focus, breakthrough designations, fewer NDAs. */
    workstream: ['overview', 'ind', 'bla', 'maa', 'jnda', 'precedent'],
    lifecycle:  ['cmc', 'clinical', 'pharmacov', 'pediatric', 'orphan', 'meetings', 'biostat'],
    overview: {
      greetingState: 'BX-301 BLA assembly · 64% ready. BX-256 gene therapy pre-IND in 28 days. BX-420 PIP modification pending CHMP advice.',
      starters: [
        'Open BLA 401223 — show comparability gap with new DS supplier',
        'Status of every orphan designation across portfolio',
        'Prep the BX-256 pre-IND briefing book',
        'What FDA breakthrough designations could BX-115 qualify for?',
      ],
    },
  },
  pharma: {
    label: 'Pharma',
    domainLabel: 'Pharma',
    /* Pharma-specific: small molecules (NDA), generic/biosimilar variations,
     * heavy lifecycle (PSUR, supplements, label updates), large portfolios. */
    workstream: ['overview', 'ind', 'nda', 'maa', 'jnda', 'lifecycle', 'precedent'],
    lifecycle:  ['cmc', 'clinical', 'pharmacov', 'pediatric', 'biostat', 'meetings'],
    overview: {
      greetingState: 'NDA 212345 (BX-204) · 41 days to PDUFA. Two PSUR cycles open. CMC supplement for BX-099 filed yesterday.',
      starters: [
        '30-second status on each program for the 9 AM CMO standup',
        'Why is BX-204 readiness stuck at 87%?',
        'List every CMC change-control in flight across portfolio',
        'Compile the PSUR §15 risk-evaluation update for BX-099',
      ],
    },
  },
};

const HERE_LABEL = {
  overview:     'Overview',
  ind:          'IND / CTA',
  nda:          'NDA · 505(b)',
  bla:          'BLA · 351(a)',
  maa:          'MAA · EU centralized',
  jnda:         'JNDA · Japan',
  precedent:    'Precedent intelligence',
  lifecycle:    'Lifecycle management',
  cmc:          'CMC · Module 3',
  clinical:     'Clinical operations',
  pharmacov:    'Pharmacovigilance · PSUR',
  pediatric:    'Pediatric · PIP / PSP',
  orphan:       'Orphan and rare',
  meetings:     'Agency meetings',
  biostat:      'Biostatistics',
  tasks:        'Tasks and reviews',
  'ana-review': 'AnA review queue',
  vault:        'Document vault',
  validation:   'Validation center',
  submissions:  'Submission center',
  qsub:         'Type B/C briefing',
  templates:    'Templates',
  analytics:    'Analytics',
  memory:       'AnA memory',
  conversations:'AnA conversations',
  search:       'Global search',
  notifications:'Notifications',
  audit:        'Audit log',
  onboarding:   'Onboarding',
  admin:        'Admin and access',
};

/* Re-export under both biopharma-prefixed names AND the MDX names
   that shell.jsx already reads. shell.jsx in v2 becomes domain-aware
   and takes a prop instead — this kit emulates that via the swap. */
window.BIOPHARMA_NAV_GROUPS = BIOPHARMA_NAV_GROUPS;
window.BIOPHARMA_NAV_V2     = BIOPHARMA_NAV_V2;
window.BIOPHARMA_PROGRAMS   = BIOPHARMA_PROGRAMS;
window.BIOPHARMA_RECENT     = BIOPHARMA_RECENT;
window.BIOPHARMA_IND        = BIOPHARMA_IND;
window.BIOPHARMA_NDA        = BIOPHARMA_NDA;
window.BIOPHARMA_PEDIATRIC  = BIOPHARMA_PEDIATRIC;
window.BIOPHARMA_PV         = BIOPHARMA_PV;
window.BIOPHARMA_JNDA       = BIOPHARMA_JNDA;
window.BIOPHARMA_LIFECYCLE  = BIOPHARMA_LIFECYCLE;
window.BIOPHARMA_ORPHAN     = BIOPHARMA_ORPHAN;
window.BIOPHARMA_MEETINGS   = BIOPHARMA_MEETINGS;
window.BIOPHARMA_SUGGESTIONS= BIOPHARMA_SUGGESTIONS;
window.BIOPHARMA_DOMAIN     = BIOPHARMA_DOMAIN;
window.CLIENT_TYPES         = CLIENT_TYPES;
window.HERE_LABEL_BIOPHARMA = HERE_LABEL;

/* Alias to MDX names so the lifted shell renders without modification. */
window.MDX_NAV_GROUPS = BIOPHARMA_NAV_GROUPS;
window.MDX_NAV_V2     = BIOPHARMA_NAV_V2;
window.MDX_PROGRAMS   = BIOPHARMA_PROGRAMS;

})();
