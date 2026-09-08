/* Medical Device and Diagnostics workstream — all content in one place.
   The MDX kit lands when a user clicks "Medical Device and Diagnostics"
   from the home rail. Three surfaces: Overview, 510(k), PMA, CER. */

/* ───── Domain-scoped nav v2 (15 items · 4 tiers) ─────
   Mirrors concept2cure-v2 `zen-app-constants.ts`. Preserves MDX_NAV_ITEMS
   below for legacy callers; Shell.jsx prefers MDX_NAV_V2 when present. */
window.MDX_NAV_GROUPS = [
  { id: 'workstream',   label: 'Workstream' },   // Programs by pathway
  { id: 'workbench',    label: 'Workbench'  },   // Cross-program work
  { id: 'intelligence', label: 'Intelligence' }, // Read-only reports + memory
  { id: 'system',       label: '' },             // Back-to-modules, admin
];

window.MDX_NAV_V2 = [
  /* Workstream — where you do program-level work. */
  { id: 'overview',     label: 'Overview',             icon: 'grid',         group: 'workstream' },
  { id: 'k510',         label: '510(k) Submissions',   icon: 'file',         group: 'workstream' },
  { id: 'pma',          label: 'PMA Submissions',      icon: 'shieldCheck',  group: 'workstream' },
  { id: 'cer',          label: 'CER Generator',        icon: 'microscope',   group: 'workstream' },
  { id: 'predicate',    label: 'Precedent Intelligence',icon: 'scale',       group: 'workstream' },

  /* Workbench — cross-program work surfaces. Tasks / Vault / Validation /
     Submissions / Templates are all new tiles shipping in Phase 3+. */
  { id: 'tasks',        label: 'Tasks and Reviews',    icon: 'clipboardList',group: 'workbench' },
  { id: 'vault',        label: 'Document Vault',       icon: 'vault',        group: 'workbench' },
  { id: 'validation',   label: 'Validation Center',    icon: 'shieldAlert',  group: 'workbench' },
  { id: 'submissions',  label: 'Submission Center',    icon: 'rocket',       group: 'workbench' },
  { id: 'templates',    label: 'Templates',            icon: 'template',     group: 'workbench' },

  /* Intelligence — read-only reporting + cross-cutting memory. */
  { id: 'analytics',    label: 'Analytics',            icon: 'barChart3',    group: 'intelligence' },
  { id: 'memory',       label: 'Claude Memory',        icon: 'database',     group: 'intelligence' },

  /* System — admin + the only link that exits the workstream. */
  { id: 'admin',        label: 'Admin and Access',     icon: 'userCheck',    group: 'system' },
  { id: 'back',         label: 'Back to all modules',  icon: 'arrowLeft',    group: 'system', href: '../home/index.html' },
];

/* ───── Domain-scoped nav (legacy; superseded by MDX_NAV_V2) ───── */
window.MDX_NAV_ITEMS = [
  { id: 'overview',   label: 'Overview',              icon: 'grid',       group: 'workstream' },
  { id: 'k510',       label: '510(k) Submissions',    icon: 'file',       group: 'workstream' },
  { id: 'pma',        label: 'PMA Submissions',       icon: 'shieldCheck',group: 'workstream' },
  { id: 'cer',        label: 'CER Generator',         icon: 'microscope', group: 'workstream' },
  { id: 'predicate',  label: 'Precedent Intelligence',icon: 'scale',      group: 'workstream' },
  { id: 'engineering',label: 'Device Engineering',    icon: 'wrench',     group: 'workstream' },
  { id: 'udi',        label: 'UDI and Labeling',      icon: 'tag',        group: 'workstream' },
  { id: 'postmarket', label: 'Post-market Vigilance', icon: 'alertCircle',group: 'workstream' },

  { id: 'vault',      label: 'Device Vault',          icon: 'vault',      group: 'work' },
  { id: 'tasking',    label: 'Tasks',                 icon: 'checkCircle',group: 'work' },

  { id: 'back',       label: 'Back to all modules',   icon: 'arrowLeft',  group: 'system', href: '../home/index.html' },
];

/* Rail items that are intentionally stubbed out pending their own design phase.
   The rail still renders them (so the workstream feels whole), but clicking them
   lands on the InDesignSurface empty state — no dead buttons, no placeholder pages. */
window.MDX_STUBS = {
  engineering: {
    title: 'Device engineering',
    icon:  'wrench',
    desc:  'Risk management (ISO 14971), biocompatibility, cybersecurity premarket submissions, and design controls traceability.',
    phase: 'Phase 4',
  },
  udi: {
    title: 'UDI and labeling',
    icon:  'tag',
    desc:  'UDI issuance, GUDID submission, labeling harmonization across regions, MRI-conditional statements.',
    phase: 'Phase 4',
  },
  postmarket: {
    title: 'Post-market vigilance',
    icon:  'alertCircle',
    desc:  'MDR tracking, trending adverse events, PMS plan execution, and notified-body reporting.',
    phase: 'Phase 4',
  },

  /* Workbench tier — Tasks / Vault / Validation / Submissions / Templates all ship in Phase 3,
     rendered by dedicated surfaces in Workbench.jsx. No stubs here. */

  /* Intelligence tier */
  analytics: {
    title: 'Analytics',
    icon:  'barChart3',
    desc:  'Portfolio-wide metrics — cycle times, readiness trends, reviewer velocity, blocker root causes. Read-only.',
    phase: 'Phase 4',
  },
  memory: {
    title: 'Claude memory',
    icon:  'database',
    desc:  'Your organization\u2019s shared Claude context — style guides, approved language, past review learnings. Pinned to every conversation.',
    phase: 'Phase 4',
  },

  /* System */
  admin: {
    title: 'Admin and access',
    icon:  'userCheck',
    desc:  'Org members, roles, program-level access grants, SSO, audit log. Required for any production rollout.',
    phase: 'Phase 4',
  },
};

/* ───── Overview: active programs ─────
   Status vocabulary (shared across strip, grid, program pills):
   - idle       : not yet started
   - active     : in progress, on track
   - blocked    : in progress, needs attention
   - complete   : finished
*/
window.MDX_PROGRAMS = [
  { id: 'bx204', title: 'BX-204 Continuous Glucose Monitor',  code: 'Class II · 510(k)',   pathway: 'k510', stage: 'Substantial Equivalence',      stageIdx: 4, readiness: 72, status: 'active',  lead: 'Jordan Chen',   owners: ['JC','RA','SM'],      nextBlocker: 'Predicate K221847 performance data mismatch',        dueLabel: 'FDA filing · 41 days',      dueTone: 'warn', lastActivity: '2h ago',  meta: '7 predicates screened · 3 candidate · 1 selected' },
  { id: 'dx102', title: 'DX-102 IVD Cartridge',               code: 'Class II · De Novo',   pathway: 'k510', stage: 'Performance Testing',          stageIdx: 3, readiness: 48, status: 'blocked', lead: 'Priya Shah',    owners: ['PS','LT'],           nextBlocker: 'Analytical sensitivity validation incomplete',       dueLabel: 'Pre-sub · 18 days',         dueTone: 'err',  lastActivity: '5h ago',  meta: '14 analytes · ISO 17511 traceability · 3 reader sites' },
  { id: 'cv330', title: 'CV-330 Implantable Monitor',         code: 'Class III · PMA',      pathway: 'pma',  stage: 'Pivotal Trial Enrollment',     stageIdx: 5, readiness: 61, status: 'active',  lead: 'Marcus Webb',   owners: ['MW','JC','AK','RN'], nextBlocker: 'DSMB charter pending CRO sign-off',                  dueLabel: 'PMA filing · Q3 2026',      dueTone: 'ok',   lastActivity: '1d ago',  meta: '412 of 680 enrolled · 14 sites · 3 countries' },
  { id: 'iv415', title: 'IV-415 Companion Diagnostic',        code: 'Class III · PMA',      pathway: 'cer',  stage: 'Clinical Evaluation Report',   stageIdx: 2, readiness: 34, status: 'blocked', lead: 'Ana Müller',    owners: ['AM','JC'],           nextBlocker: 'FAERS signal adjudication — 3 events under review',  dueLabel: 'EU MDR · notified body Q1', dueTone: 'warn', lastActivity: '3h ago',  meta: 'EU MDR Article 61 · 1,842 literature hits · 47 FAERS signals' },
  { id: 'or801', title: 'OR-801 Orthopedic Screw System',     code: 'Class II · 510(k)',    pathway: 'k510', stage: 'Assemble eSTAR',               stageIdx: 5, readiness: 84, status: 'active',  lead: 'Sofia Marchetti',owners: ['SM','LT','JC'],     nextBlocker: 'Biocompatibility report pending supplier signature',  dueLabel: 'FDA filing · 22 days',      dueTone: 'warn', lastActivity: '30m ago', meta: '4 predicates · eSTAR 18/20 complete' },
  { id: 'nm512', title: 'NM-512 Neuromodulation Lead',        code: 'Class III · PMA',      pathway: 'pma',  stage: 'Manufacturing validation',     stageIdx: 3, readiness: 55, status: 'active',  lead: 'Ravi Nair',     owners: ['RN','AK','MW'],      nextBlocker: 'QS audit finding 21 CFR 820.50 — supplier controls', dueLabel: 'PMA filing · Q2 2027',      dueTone: 'ok',   lastActivity: '2d ago',  meta: 'QS Regulation · 3 facilities · 1 open finding' },
  { id: 'rx340', title: 'RX-340 Surgical Stapler',            code: 'Class II · 510(k)',    pathway: 'k510', stage: 'Predicate search',             stageIdx: 2, readiness: 28, status: 'active',  lead: 'Linh Tran',     owners: ['LT','PS'],           nextBlocker: 'Identify viable K-numbers with comparable firing force', dueLabel: 'FDA filing · Q4 2026',     dueTone: 'ok',   lastActivity: '4h ago',  meta: '18 candidates · 2 strong matches so far' },
  { id: 'dx221', title: 'DX-221 Point-of-care Hematology',    code: 'Class II · De Novo',   pathway: 'k510', stage: 'Classify',                     stageIdx: 1, readiness: 12, status: 'idle',    lead: 'Priya Shah',    owners: ['PS'],                nextBlocker: 'Intended-use statement pending clinical review',     dueLabel: 'Pre-sub · Q1 2026',         dueTone: 'ok',   lastActivity: '6d ago',  meta: 'Product code confirmed · De Novo pathway selected' },
  { id: 'pm660', title: 'PM-660 Patient Monitor — software',  code: 'Class II · SaMD',      pathway: 'k510', stage: 'Performance Testing',          stageIdx: 3, readiness: 67, status: 'active',  lead: 'Ana Müller',    owners: ['AM','RN'],           nextBlocker: 'Cybersecurity SBOM not final',                       dueLabel: 'FDA filing · 68 days',      dueTone: 'warn', lastActivity: '1h ago',  meta: 'IEC 62304 Class C · 11 CVEs under review' },
  { id: 'cv410', title: 'CV-410 Catheter — Lead extension',   code: 'Class III · PMA-S',    pathway: 'pma',  stage: 'Labeling',                     stageIdx: 5, readiness: 78, status: 'active',  lead: 'Marcus Webb',   owners: ['MW','SM'],           nextBlocker: 'MRI-conditional statement language with notified body', dueLabel: 'PMA-S · 95 days',         dueTone: 'warn', lastActivity: '8h ago',  meta: 'Supplement to CV-330 · labeling v2.4' },
  { id: 'iv208', title: 'IV-208 Tumor Marker Assay',          code: 'Class III · PMA',      pathway: 'cer',  stage: 'Clinical data summary',        stageIdx: 3, readiness: 51, status: 'active',  lead: 'Jordan Chen',   owners: ['JC','AM','RA'],      nextBlocker: 'Real-world evidence from 2 EU registries pending',   dueLabel: 'EU MDR · Q2 2026',          dueTone: 'ok',   lastActivity: '5h ago',  meta: 'Article 61 · 2,104 literature hits' },
  { id: 'or902', title: 'OR-902 Spinal Implant',              code: 'Class II · 510(k)',    pathway: 'k510', stage: 'Submit',                       stageIdx: 6, readiness: 98, status: 'active',  lead: 'Sofia Marchetti',owners: ['SM','LT'],          nextBlocker: 'Final cover-letter sign-off',                        dueLabel: 'FDA filing · 4 days',       dueTone: 'warn', lastActivity: '22m ago', meta: 'eSTAR validated · all 20 sections pass' },
  { id: 'nm240', title: 'NM-240 DBS Programmer',              code: 'Class II · 510(k)',    pathway: 'k510', stage: 'Intake',                       stageIdx: 0, readiness: 4,  status: 'idle',    lead: 'Ravi Nair',     owners: ['RN'],                nextBlocker: 'Device specification pending engineering sign-off',  dueLabel: 'Pre-sub · Q2 2026',         dueTone: 'ok',   lastActivity: '1w ago',  meta: 'Kick-off pending' },
  { id: 'cv117', title: 'CV-117 ECG Patch',                   code: 'Class II · 510(k)',    pathway: 'k510', stage: 'Cleared',                      stageIdx: 7, readiness: 100,status: 'complete',lead: 'Marcus Webb',   owners: ['MW','AK'],           nextBlocker: null,                                                 dueLabel: 'Cleared · Feb 2026',        dueTone: 'ok',   lastActivity: '2w ago',  meta: 'K254481 · 87-day review cycle' },
];

window.MDX_HEALTH = [
  { label: 'Active programs',    metric: '14', meta: '9 510(k) · 4 PMA · 1 cleared' },
  { label: 'Average readiness',  metric: '56', unit: '%', bar: { pct: 56, tone: 'warn' }, meta: 'Down 3 pts vs last week' },
  { label: 'FDA review cycle',   metric: '87', unit: 'd', meta: 'Current cohort · median' },
  { label: 'Blockers open',      metric: '4',  meta: '2 DX-102 · 1 IV-415 · 1 NM-512', tone: 'err' },
];

/* ───── 510(k) 7-stage pipeline ───── */
window.K510_STAGES = [
  { id: 'intake',     label: 'Intake',              meta: 'Device spec · intended use' },
  { id: 'classify',   label: 'Classify',            meta: 'Product code · pathway' },
  { id: 'predicate',  label: 'Predicate search',    meta: 'Precedent intelligence' },
  { id: 'testing',    label: 'Performance testing', meta: 'Bench · analytical · clinical' },
  { id: 'se',         label: 'Substantial equivalence', meta: 'SE matrix · differences' },
  { id: 'assemble',   label: 'Assemble eSTAR',      meta: '20 sections · validation' },
  { id: 'submit',     label: 'Submit',              meta: 'eSTAR + cover letter' },
];

/* Predicate search results for BX-204 */
window.K510_PREDICATES = [
  { k: 'K221847', name: 'Dexcom G7 CGM System',                 holder: 'Dexcom, Inc.',              cleared: '2022-12-08', class: 'II', code: 'MDS', match: 94, status: 'selected',  diffs: 3 },
  { k: 'K213163', name: 'FreeStyle Libre 3 Glucose Monitor',    holder: 'Abbott Diabetes Care',      cleared: '2022-05-17', class: 'II', code: 'MDS', match: 88, status: 'candidate', diffs: 5 },
  { k: 'K201715', name: 'Medtronic Guardian Connect',           holder: 'Medtronic MiniMed, Inc.',   cleared: '2020-09-22', class: 'II', code: 'MDS', match: 71, status: 'reviewed',  diffs: 9 },
  { k: 'K193536', name: 'Senseonics Eversense E3',              holder: 'Senseonics, Inc.',          cleared: '2022-02-11', class: 'II', code: 'MDS', match: 66, status: 'reviewed',  diffs: 11 },
  { k: 'K182764', name: 'Dexcom G6 CGM System',                 holder: 'Dexcom, Inc.',              cleared: '2018-11-06', class: 'II', code: 'MDS', match: 62, status: 'rejected',  diffs: 14 },
  { k: 'K162625', name: 'Medtronic Enlite Sensor',              holder: 'Medtronic MiniMed, Inc.',   cleared: '2016-08-30', class: 'II', code: 'MDS', match: 54, status: 'rejected',  diffs: 18 },
];

/* SE matrix rows — comparing BX-204 to selected predicate */
window.K510_SE_ROWS = [
  { attr: 'Intended use',         subject: 'Continuous glucose monitoring for diabetes management', predicate: 'Continuous glucose monitoring for diabetes management', verdict: 'same' },
  { attr: 'Indications for use',  subject: 'Adults and children ≥ 7 years with diabetes',           predicate: 'Adults and children ≥ 2 years with diabetes',            verdict: 'different', note: 'Narrower age range' },
  { attr: 'Technology',           subject: 'Electrochemical enzyme sensor',                         predicate: 'Electrochemical enzyme sensor',                          verdict: 'same' },
  { attr: 'Wear duration',        subject: '14 days',                                               predicate: '10 days',                                                verdict: 'different', note: 'Extended wear — additional biocompatibility' },
  { attr: 'MARD accuracy',        subject: '8.2%',                                                  predicate: '8.7%',                                                   verdict: 'equivalent' },
  { attr: 'Calibration',          subject: 'Factory calibrated',                                    predicate: 'Factory calibrated',                                     verdict: 'same' },
  { attr: 'Warm-up period',       subject: '30 minutes',                                            predicate: '30 minutes',                                             verdict: 'same' },
  { attr: 'Data transmission',    subject: 'BLE to phone · 5 min intervals',                        predicate: 'BLE to phone · 5 min intervals',                         verdict: 'same' },
  { attr: 'Alerts',               subject: 'Urgent low, high, predictive low',                      predicate: 'Urgent low, high',                                       verdict: 'different', note: 'Added predictive algorithm' },
  { attr: 'Biocompatibility',     subject: 'ISO 10993-1 · -5 · -10 · -11',                          predicate: 'ISO 10993-1 · -5 · -10',                                 verdict: 'equivalent', note: 'Added -11 for 14-day wear' },
];

/* eSTAR checklist */
window.K510_ESTAR = [
  { id: 1,  label: 'Medical Device User Fee Cover Sheet',             status: 'complete' },
  { id: 2,  label: 'CDRH Premarket Review Submission Cover Sheet',    status: 'complete' },
  { id: 3,  label: '510(k) Cover Letter',                             status: 'draft' },
  { id: 4,  label: 'Indications for Use Statement',                   status: 'complete' },
  { id: 5,  label: '510(k) Summary',                                  status: 'draft' },
  { id: 6,  label: 'Truthful and Accuracy Statement',                 status: 'complete' },
  { id: 7,  label: 'Class III Summary and Certification',             status: 'na' },
  { id: 8,  label: 'Financial Certification or Disclosure',           status: 'complete' },
  { id: 9,  label: 'Declarations of Conformity',                      status: 'complete' },
  { id: 10, label: 'Device Description',                              status: 'draft' },
  { id: 11, label: 'Substantial Equivalence Discussion',              status: 'draft' },
  { id: 12, label: 'Proposed Labeling',                               status: 'review' },
  { id: 13, label: 'Sterilization and Shelf Life',                    status: 'complete' },
  { id: 14, label: 'Biocompatibility',                                status: 'review' },
  { id: 15, label: 'Software',                                        status: 'draft' },
  { id: 16, label: 'Electromagnetic Compatibility',                   status: 'complete' },
  { id: 17, label: 'Performance Testing — Bench',                     status: 'review' },
  { id: 18, label: 'Performance Testing — Animal',                    status: 'na' },
  { id: 19, label: 'Performance Testing — Clinical',                  status: 'draft', blocker: true },
  { id: 20, label: 'References',                                      status: 'complete' },
];

/* ───── PMA 10-phase workflow ─────
   Uses shared status vocab (idle/active/blocked/complete).
   PMA is *parallel* — multiple phases run concurrently during the
   IDE→PMA window — so the grid layout is the correct metaphor, not
   a linear strip. */
window.PMA_PHASES = [
  { id: 'presub',   label: 'Pre-submission',           pct: 100, status: 'complete' },
  { id: 'preclin',  label: 'Preclinical',              pct: 100, status: 'complete' },
  { id: 'ide',      label: 'IDE approval',             pct: 100, status: 'complete' },
  { id: 'mfg',      label: 'Manufacturing validation', pct: 85,  status: 'active'   },
  { id: 'pivotal',  label: 'Pivotal trial',            pct: 61,  status: 'active'   },
  { id: 'labeling', label: 'Labeling',                 pct: 40,  status: 'active'   },
  { id: 'module',   label: 'Module assembly',          pct: 25,  status: 'blocked'  },
  { id: 'panel',    label: 'Advisory panel',           pct: 0,   status: 'idle'     },
  { id: 'approval', label: 'Approval',                 pct: 0,   status: 'idle'     },
  { id: 'postapp',  label: 'Post-approval studies',    pct: 0,   status: 'idle'     },
];

window.PMA_MODULES = [
  { id: 'preclinical',  label: 'Preclinical',     docs: 47, status: 'complete', desc: 'Bench, animal, biocompatibility per ISO 14708-1' },
  { id: 'clinical',     label: 'Clinical',        docs: 23, status: 'active',   desc: 'CV-330 IDE pivotal — 412/680 enrolled · 14 sites' },
  { id: 'manufacturing',label: 'Manufacturing',   docs: 31, status: 'review',   desc: 'QS Regulation 21 CFR 820 · 3 facilities under audit' },
  { id: 'labeling',     label: 'Labeling',        docs: 12, status: 'draft',    desc: 'Professional labeling · MRI conditional statements' },
  { id: 'stats',        label: 'Statistical',     docs: 8,  status: 'review',   desc: 'SAP v2.4 · interim analysis plan · Bayesian borrowing' },
  { id: 'financial',    label: 'Financial',       docs: 14, status: 'complete', desc: 'Investigator disclosures · user-fee cover sheets' },
];

window.PMA_TRIAL_METRICS = [
  { label: 'Enrolled',          metric: '412', unit: '/ 680', bar: { pct: 60.6, tone: 'warn' }, meta: 'Behind plan by 3 weeks' },
  { label: 'Active sites',      metric: '14',                                                   meta: 'Target 15 · 1 site pending IRB' },
  { label: 'Primary endpoint',  metric: '94',  unit: '% sensitivity',                           meta: 'Pre-specified ≥ 90%' },
  { label: 'Adverse events',    metric: '47',  meta: '3 serious · 2 device-related under adjudication', tone: 'err' },
];

/* ───── CER Generator ───── */
window.CER_SIGNALS = [
  { id: 'FR-8812', source: 'FAERS',    severity: 'serious',     event: 'Implant site infection',            count: 14, onset: '12 mo', assess: 'Causality assessed · device-related', status: 'included' },
  { id: 'FR-8809', source: 'FAERS',    severity: 'serious',     event: 'Lead dislodgement',                 count: 3,  onset: '3 mo',  assess: 'Under adjudication', status: 'review' },
  { id: 'FR-8802', source: 'FAERS',    severity: 'non-serious', event: 'Skin irritation at adhesive site',  count: 28, onset: '2 wk',  assess: 'Expected · labeling covers', status: 'included' },
  { id: 'FR-8784', source: 'MAUDE',    severity: 'serious',     event: 'Battery failure',                   count: 2,  onset: '18 mo', assess: 'Root cause · supplier CAPA', status: 'excluded', reason: 'Non-representative lot' },
  { id: 'LIT-2241',source: 'PubMed',   severity: 'serious',     event: 'Late-stage pacing threshold rise',  count: 6,  onset: '24 mo', assess: 'Literature · 2 cohort studies', status: 'included' },
  { id: 'LIT-2203',source: 'PubMed',   severity: 'non-serious', event: 'Patient-reported discomfort',       count: 91, onset: '1 mo',  assess: 'Literature · 5 survey studies', status: 'included' },
  { id: 'EU-4412', source: 'Eudamed',  severity: 'serious',     event: 'Thromboembolic event',              count: 4,  onset: '9 mo',  assess: 'EU real-world · 3 countries', status: 'review' },
];

window.CER_LITERATURE = [
  { year: '2025', hits: 412 },
  { year: '2024', hits: 684 },
  { year: '2023', hits: 521 },
  { year: '2022', hits: 389 },
  { year: '2021', hits: 218 },
  { year: '2020', hits: 102 },
];

window.CER_EXPORT = [
  { id: 'scope',    label: 'Scope and device description',       status: 'complete' },
  { id: 'state',    label: 'State-of-the-art analysis',          status: 'complete' },
  { id: 'clinical', label: 'Clinical data summary',              status: 'draft' },
  { id: 'safety',   label: 'Safety and risk-benefit',            status: 'review' },
  { id: 'pms',      label: 'Post-market surveillance plan',      status: 'draft' },
  { id: 'conclu',   label: 'Conclusion and recommendations',     status: 'empty' },
];

/* ───── Predicate Intelligence (shared across pathways) ───── */
window.PI_QUERIES = [
  { q: 'CGM sensor 14-day wear',     hits: 47,  saved: true },
  { q: 'IVD cartridge 14 analytes',  hits: 23,  saved: true },
  { q: 'Implantable cardiac monitor',hits: 182, saved: false },
  { q: 'Software as medical device', hits: 419, saved: false },
];

/* ───── AnA modes ─────
   Modes are intent, not models. The gateway maps each mode to a Claude model:
     standard       → Claude Sonnet 4.5   (chat, predicate reasoning)
     deep-research  → Claude Opus 4.5     (drafting, SE narrative, CER generation)
     nano-banana    → Claude Haiku 4.5    (autocomplete, classification, inline)
   Users never see the model names in the UI — they pick intent, and we show the
   resolved model as metadata only (small text, next to the mode chip).
   Contract mirrors AnaPersistentPanel.tsx in concept2cure-v2. */
window.ANA_MODES = [
  { id: 'standard',      label: 'Standard',      model: 'Sonnet 4.5', desc: 'Chat, reasoning, quick answers' },
  { id: 'deep-research', label: 'Deep research', model: 'Opus 4.5',   desc: 'Drafting, multi-step analysis, long-form' },
  { id: 'nano-banana',   label: 'Nano-banana',   model: 'Haiku 4.5',  desc: 'Autocomplete, inline, classification' },
];

/* ───── RIM tools AnA can call via the gateway ─────
   Every tool resolves through `server/services/ai-gateway/` — the UI never calls
   Anthropic directly. Names match the tool definitions registered server-side.
   Grouped for the command bar's "/tool" picker. */
window.ANA_TOOLS = [
  { id: 'search_predicates',    group: 'Precedent',   label: 'Search predicates',        desc: 'Predicate device corpus by class, product code, intended use' },
  { id: 'get_se_matrix',        group: 'Precedent',   label: 'Substantial equivalence',  desc: 'Subject vs. predicate comparison matrix' },
  { id: 'search_precedents',    group: 'Precedent',   label: 'Search precedents',        desc: 'Cross-agency regulatory decisions' },
  { id: 'search_literature',    group: 'Evidence',    label: 'Search literature',        desc: 'PubMed / Embase / Cochrane corpus' },
  { id: 'search_adverse',       group: 'Evidence',    label: 'Adverse events',           desc: 'FAERS / MAUDE signal query' },
  { id: 'get_program_status',   group: 'Program',     label: 'Program status',           desc: 'Readiness, next blocker, open deficiencies' },
  { id: 'get_rim_signals',      group: 'Program',     label: 'RIM signals',              desc: 'Deficiency / reviewer-trigger signals' },
  { id: 'run_judgment',         group: 'Program',     label: 'Judgment framework',       desc: '6-model scoring on an artifact' },
  { id: 'get_evidence_chain',   group: 'Program',     label: 'Evidence chain',           desc: 'Confidence trace for a claim' },
  { id: 'suggest_next_action',  group: 'Program',     label: 'Suggest next action',      desc: 'Recommendation engine' },
  { id: 'draft_section',        group: 'Authoring',   label: 'Draft section',            desc: 'Governed authoring — 510(k), CER, PMA' },
  { id: 'create_artifact',      group: 'Authoring',   label: 'Create artifact',          desc: 'Editor wire-up' },
];

/* ───── AnA dock suggestions (context-aware) ───── */
window.MDX_SUGGESTIONS = {
  overview:   ['Find device-code precedents', 'Generate readiness report', 'Flag filing risks'],
  k510:       ['Find more CGM predicates', 'Draft SE discussion', 'Check eSTAR validation'],
  pma:        ['Summarize enrollment gap', 'Draft DSMB charter', 'Pull pivotal precedents'],
  cer:        ['Run FAERS signal scan', 'Adjudicate lead dislodgement', 'Draft Article 61 section'],
  predicate:  ['Compare K221847 vs subject', 'Find predicates for CGM',    'Cluster by product code'],
  engineering:['ISO 14971 risk review',    'Cybersecurity premarket',     'Biocompatibility for 14-day'],
  udi:        ['Generate UDI for BX-204',  'Labeling MRI statements',     'Multi-language harmonization'],
  postmarket: ['This week signals',         'Open MDRs',                   'Trending adverse events'],
  editor:     ['Draft this section from predicate', 'Check claim against evidence', 'Rewrite for FDA tone'],
};

/* ═══════════════════════════════════════════════════════════════════
   510(k) Module Editor — OR-801 Orthopedic Screw System
   ═══════════════════════════════════════════════════════════════════
   Pattern: Cursor-style 3-pane. Sections tree · doc editor · Claude chat.
   Every block carries confidence (for gutter color), provenance (model,
   source, audit ID), and optional validation flags (eSTAR required-field
   rules, claim-evidence mismatches). Comments are pinned to block IDs.

   Section status vocab (reused from eSTAR checklist):
     complete · review · draft · na · empty
*/

window.EDITOR_PROGRAM = {
  id: 'or801',
  title: 'OR-801 Orthopedic Screw System',
  code: 'Class II · 510(k)',
  productCode: 'HWC',
  regulation: '21 CFR 888.3040',
  predicate:  'K213992 — Stryker VariAx 2 Compression Screw',
  lead: 'Sofia Marchetti',
  dueLabel: 'FDA filing · 22 days',
  readiness: 84,
};

/* Section tree — 20 eSTAR sections organized by the 5 FDA-defined volumes.
   Matches K510_ESTAR 1:1 (same ids, statuses) but adds volume grouping so
   the tree has hierarchy. Volume headers come from 21 CFR 807.87 + eSTAR PDF. */
window.EDITOR_SECTIONS = [
  { volume: 'Administrative',
    items: [
      { id: 1,  num: '§01', label: 'User fee cover sheet',             status: 'complete', required: true,  words: 180 },
      { id: 2,  num: '§02', label: 'CDRH submission cover sheet',      status: 'complete', required: true,  words: 420 },
      { id: 3,  num: '§03', label: '510(k) cover letter',              status: 'draft',    required: true,  words: 640 },
      { id: 4,  num: '§04', label: 'Indications for use statement',    status: 'complete', required: true,  words: 210 },
      { id: 5,  num: '§05', label: '510(k) summary',                   status: 'draft',    required: true,  words: 1840 },
      { id: 6,  num: '§06', label: 'Truthful and accuracy statement',  status: 'complete', required: true,  words: 150 },
      { id: 7,  num: '§07', label: 'Class III summary and certification', status: 'na',    required: false, words: 0 },
      { id: 8,  num: '§08', label: 'Financial certification',          status: 'complete', required: true,  words: 220 },
      { id: 9,  num: '§09', label: 'Declarations of conformity',       status: 'complete', required: true,  words: 1120 },
    ]
  },
  { volume: 'Device description',
    items: [
      { id: 10, num: '§10', label: 'Device description',               status: 'draft',    required: true,  words: 2840, active: true },
      { id: 11, num: '§11', label: 'Substantial equivalence discussion', status: 'draft',  required: true,  words: 3210, blocker: true },
      { id: 12, num: '§12', label: 'Proposed labeling',                status: 'review',   required: true,  words: 1960 },
    ]
  },
  { volume: 'Performance data',
    items: [
      { id: 13, num: '§13', label: 'Sterilization and shelf life',     status: 'complete', required: true,  words: 840 },
      { id: 14, num: '§14', label: 'Biocompatibility',                 status: 'review',   required: true,  words: 1410 },
      { id: 15, num: '§15', label: 'Software',                         status: 'draft',    required: false, words: 680 },
      { id: 16, num: '§16', label: 'Electromagnetic compatibility',    status: 'complete', required: false, words: 520 },
      { id: 17, num: '§17', label: 'Performance testing — bench',      status: 'review',   required: true,  words: 4120 },
      { id: 18, num: '§18', label: 'Performance testing — animal',     status: 'na',       required: false, words: 0 },
      { id: 19, num: '§19', label: 'Performance testing — clinical',   status: 'draft',    required: true,  words: 3840, blocker: true },
    ]
  },
  { volume: 'Closing',
    items: [
      { id: 20, num: '§20', label: 'References',                       status: 'complete', required: true,  words: 720 },
    ]
  },
];

/* Section 11 — Substantial equivalence discussion. This is THE hero content.
   Each block has id/kind/text/confidence/prov/flags. Blocks can be 'h2', 'p',
   'table', 'callout'. 'flags' are validation issues surfaced inline. */
window.EDITOR_CONTENT_11 = {
  id: 11,
  num: '§11',
  label: 'Substantial equivalence discussion',
  status: 'draft',
  masthead: [
    { lbl: 'Predicate',      val: 'K213992 · Stryker VariAx 2' },
    { lbl: 'Product code',   val: 'HWC' },
    { lbl: 'Regulation',     val: '21 CFR 888.3040' },
    { lbl: 'Last edited',    val: '30 minutes ago · S. Marchetti' },
  ],
  blocks: [
    { id: 'b1', kind: 'p', confidence: 0.94,
      prov: { source: 'Subject device specification · DSP-OR801-v3.2', model: 'Opus 4.5', audit: 'AUD-8841', foot: 'Drafted from device spec §2.1' },
      spans: [
        { t: 'The OR-801 Orthopedic Screw System is substantially equivalent to the legally marketed predicate device, ' },
        { cite: 'K213992' },
        { t: ', the Stryker VariAx 2 Compression Screw System. Both devices are classified as Class II under ' },
        { cite: '21 CFR 888.3040' },
        { t: ' and share the product code HWC. The subject and predicate devices have the same intended use and identical indications for use.' },
      ],
    },
    { id: 'b2', kind: 'h2', text: 'Intended use comparison' },
    { id: 'b3', kind: 'p', confidence: 0.97,
      prov: { source: 'FDA 510(k) Summary · K213992', model: 'Sonnet 4.5', audit: 'AUD-8842', foot: 'Verified against predicate summary' },
      spans: [
        { t: 'The OR-801 is indicated for fixation of fractures, osteotomies, and arthrodeses of small bones and small bone fragments in the foot, ankle, hand, and wrist. This indication statement is identical in scope to the predicate (' },
        { cite: 'K213992, §IV' },
        { t: '), with no expansion to new anatomical sites, patient populations, or clinical conditions.' },
      ],
    },
    { id: 'b4', kind: 'h2', text: 'Technological characteristics' },
    { id: 'b5', kind: 'p', confidence: 0.88,
      prov: { source: 'Engineering drawing package · ENG-OR801 rev D', model: 'Opus 4.5', audit: 'AUD-8843', foot: 'Cross-referenced with predicate drawings where public' },
      spans: [
        { t: 'Both devices are cannulated, self-drilling, self-tapping headless compression screws machined from Ti-6Al-4V ELI per ASTM F136. The OR-801 is available in diameters of 2.5, 3.0, 3.5, and 4.0 mm and lengths of 10 to 40 mm in 2 mm increments, bracketing the predicate’s 2.5–4.0 mm diameter and 10–40 mm length range. Thread pitch, drive interface (hexalobular T8), and cannulation diameter are equivalent.' },
      ],
    },
    { id: 'b6', kind: 'table',
      confidence: 0.91,
      prov: { source: 'SE matrix · K510_SE_ROWS', model: 'Sonnet 4.5', audit: 'AUD-8844', foot: 'Generated from SE matrix' },
      headers: ['Characteristic', 'Subject · OR-801', 'Predicate · K213992', 'Verdict'],
      rows: [
        ['Material',           'Ti-6Al-4V ELI per ASTM F136', 'Ti-6Al-4V ELI per ASTM F136',   'same' ],
        ['Diameter range',     '2.5–4.0 mm',                  '2.5–4.0 mm',                     'same' ],
        ['Length range',       '10–40 mm',                    '10–40 mm',                       'same' ],
        ['Thread design',      'Variable pitch compression',  'Variable pitch compression',     'same' ],
        ['Drive interface',    'Hexalobular T8',              'Hexalobular T8',                 'same' ],
        ['Cannulation',        '1.1 mm',                      '1.1 mm',                         'same' ],
        ['Surface finish',     'Anodized Type II (gold)',     'Anodized Type II (blue)',        'equivalent' ],
        ['Sterilization',      'Gamma 25–40 kGy',             'Gamma 25–40 kGy',                'same' ],
        ['Shelf life',         '5 years',                     '5 years',                        'same' ],
      ],
    },
    { id: 'b7', kind: 'h2', text: 'Performance data' },
    { id: 'b8', kind: 'p', confidence: 0.72,
      flags: [{ kind: 'claim-evidence', severity: 'warn', msg: 'Pull-out force claim cites TR-OR801-009 but that report is not yet attached to §17.' }],
      prov: { source: 'Drafted from bench test protocol', model: 'Opus 4.5', audit: 'AUD-8845', foot: 'Awaiting report attachment' },
      spans: [
        { t: 'Bench performance testing per ASTM F543 demonstrates equivalent axial pull-out strength (mean 1,842 N ± 140, n = 30 per diameter) to the predicate (1,780 N ± 165, n = 30). Torsional yield strength, insertion torque, and driver-engagement fatigue were evaluated per ' },
        { cite: 'ASTM F543' },
        { t: ' and ' },
        { cite: 'ISO 6475' },
        { t: '. Full reports are provided in §17 Performance testing — bench.' },
      ],
    },
    { id: 'b9', kind: 'p', confidence: 0.58,
      flags: [
        { kind: 'claim-evidence', severity: 'err', msg: 'Biocompatibility claim implies completed -11 testing; §14 shows report status “review”. Claude suggested a safer phrasing — see comments.' },
      ],
      prov: { source: 'Drafted from biocompat test plan', model: 'Opus 4.5', audit: 'AUD-8846', foot: 'Blocker — see §14 status' },
      spans: [
        { t: 'Biocompatibility was established per ISO 10993-1 with testing of cytotoxicity (-5), sensitization (-10), and acute systemic toxicity (-11). Results meet or exceed the predicate profile, and no new or additional biological risks are introduced.' },
      ],
    },
    { id: 'b10', kind: 'h2', text: 'Conclusion' },
    { id: 'b11', kind: 'p', confidence: 0.86,
      prov: { source: 'Drafted from §11 blocks 1–9', model: 'Opus 4.5', audit: 'AUD-8847', foot: 'Stock closing — review for device-specific risk language' },
      spans: [
        { t: 'The OR-801 Orthopedic Screw System has the same intended use, the same indications for use, and the same technological characteristics as the predicate device. Any differences in physical dimensions, surface treatment, and manufacturing process do not raise new questions of safety or effectiveness. Bench performance, biocompatibility, and sterilization data support the conclusion that the OR-801 is substantially equivalent to ' },
        { cite: 'K213992' },
        { t: '.' },
      ],
    },
  ],
};

/* Comments — pinned to specific block IDs. Rendered in right-rail + inline gutter. */
window.EDITOR_COMMENTS = [
  { id: 'c1', blockId: 'b9', author: 'Linh Tran', role: 'Reg Affairs', when: '2h ago', resolved: false,
    body: 'Biocompat report for -11 is still out for internal review — can we soften this to “testing conducted per…” and move the conclusion to §14?' },
  { id: 'c2', blockId: 'b9', author: 'Claude', role: 'Opus 4.5', when: '2h ago', resolved: false, ai: true,
    body: 'Suggested rewrite: “Biocompatibility testing per ISO 10993-1 included cytotoxicity (-5) and sensitization (-10); acute systemic toxicity (-11) testing is complete and the final report is under internal quality review (see §14).” Apply?',
    suggest: { blockId: 'b9', text: 'Biocompatibility testing per ISO 10993-1 included cytotoxicity (-5) and sensitization (-10); acute systemic toxicity (-11) testing is complete and the final report is under internal quality review (see §14). Results meet or exceed the predicate profile, and no new or additional biological risks are introduced.' } },
  { id: 'c3', blockId: 'b8', author: 'Jordan Chen', role: 'Lead', when: 'yesterday', resolved: true,
    body: 'Pull-out numbers look right. Make sure TR-OR801-009 attaches before we lock §17.' },
  { id: 'c4', blockId: 'b6', author: 'Sofia Marchetti', role: 'Author', when: '3d ago', resolved: true,
    body: 'Anodizing color differs from predicate (gold vs blue). Confirmed with reviewer — cosmetic only, no SE impact.' },
];

/* Validation panel — eSTAR required-field rules surfaced at the section level.
   Drives the editor's top-right "Validation" popover. */
window.EDITOR_VALIDATION_11 = [
  { id: 'v1', severity: 'err',  rule: 'CE-01', msg: 'Claim in ¶ 9 references §14 evidence that is not yet locked (status = review).', blockId: 'b9' },
  { id: 'v2', severity: 'warn', rule: 'CE-02', msg: 'Claim in ¶ 8 cites TR-OR801-009 — attachment missing in §17.', blockId: 'b8' },
  { id: 'v3', severity: 'ok',   rule: 'eSTAR-11.1', msg: 'Predicate K-number cited in first paragraph.' },
  { id: 'v4', severity: 'ok',   rule: 'eSTAR-11.2', msg: 'Product code and regulation cited.' },
  { id: 'v5', severity: 'ok',   rule: 'eSTAR-11.3', msg: 'SE matrix present with ≥ 6 characteristics.' },
  { id: 'v6', severity: 'ok',   rule: 'eSTAR-11.4', msg: 'Conclusion paragraph references predicate K-number.' },
];

/* Claude conversation seed — shown in right rail when editor first opens.
   Mode defaults to Opus 4.5 because this is authoring, not lookup. */
window.EDITOR_SEED_MESSAGES = [
  { role: 'ana', mode: 'deep-research', when: '2h ago',
    body: 'Reading §11 Substantial equivalence. I flagged two claim-evidence mismatches. Want me to walk through the blocker in ¶ 9?' },
];

/* Quick actions — context-aware, shown above the Claude input in the editor. */
window.EDITOR_QUICK = [
  { id: 'q1', label: 'Draft from selected predicate', tool: 'draft_section' },
  { id: 'q2', label: 'Check claim against §17 evidence', tool: 'get_evidence_chain' },
  { id: 'q3', label: 'Rewrite for FDA tone', tool: 'draft_section' },
  { id: 'q4', label: 'Run §11 validation',   tool: 'get_rim_signals' },
];
