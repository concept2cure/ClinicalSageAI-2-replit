/* ═══════════════════════════════════════════════════════════════════
   Workbench data — content for the Phase 3+ cross-program surfaces:
   Tasks, Vault, Validation Center, Submission Center, Templates,
   Analytics, Memory, Admin.

   Everything here mirrors the real RIM data model in concept2cure-v2
   (`server/rim/*`). Status vocab is shared with program-level surfaces:
     idle · active · blocked · complete · review · draft
   ═══════════════════════════════════════════════════════════════════ */

/* ───── Tasks ───── */
window.TASKS_COLUMNS = [
  { id: 'todo',     label: 'To do',        tone: 'default' },
  { id: 'doing',    label: 'In progress',  tone: 'active' },
  { id: 'review',   label: 'In review',    tone: 'review' },
  { id: 'blocked',  label: 'Blocked',      tone: 'blocked' },
  { id: 'done',     label: 'Done',         tone: 'complete' },
];

window.TASKS = [
  { id: 'T-4821', col: 'blocked', prog: 'OR-801', sect: '§11', title: 'Rewrite biocompat paragraph — blocker CE-01', assignee: 'SM', due: '2 days', tone: 'err',  label: 'Blocker · eSTAR', kind: 'edit',   esig: false, comments: 4 },
  { id: 'T-4820', col: 'review',  prog: 'OR-801', sect: '§14', title: 'Peer review — biocompatibility report',       assignee: 'LT', due: '3 days', tone: 'warn', label: 'Peer review',    kind: 'review', esig: true,  comments: 2 },
  { id: 'T-4818', col: 'review',  prog: 'CV-330', sect: '§Clinical', title: 'DSMB charter sign-off',                  assignee: 'MW', due: '5 days', tone: 'warn', label: 'E-signature',    kind: 'sign',   esig: true,  comments: 7 },
  { id: 'T-4817', col: 'doing',   prog: 'OR-801', sect: '§11', title: 'Close comment thread on SE table',             assignee: 'SM', due: 'today',  tone: 'err',  label: 'Comment',        kind: 'edit',   esig: false, comments: 3 },
  { id: 'T-4816', col: 'doing',   prog: 'IV-415', sect: 'CER',  title: 'Adjudicate 3 FAERS events — lead dislodgement', assignee: 'AM', due: '4 days', tone: 'warn', label: 'Adjudication',   kind: 'review', esig: false, comments: 5 },
  { id: 'T-4815', col: 'doing',   prog: 'DX-102', sect: '§17', title: 'Analytical sensitivity validation — 14 analytes', assignee: 'PS', due: '1 wk',   tone: 'warn', label: 'Test data',      kind: 'edit',   esig: false, comments: 1 },
  { id: 'T-4812', col: 'todo',    prog: 'OR-902', sect: '§03', title: 'Final cover-letter sign-off',                  assignee: 'SM', due: '4 days', tone: 'err',  label: 'Submit-gate',    kind: 'sign',   esig: true,  comments: 0 },
  { id: 'T-4811', col: 'todo',    prog: 'BX-204', sect: 'Predicate', title: 'Reconcile K221847 performance mismatch',  assignee: 'JC', due: '1 wk',   tone: 'warn', label: 'Reg analysis',   kind: 'review', esig: false, comments: 2 },
  { id: 'T-4810', col: 'todo',    prog: 'RX-340', sect: 'Predicate', title: 'Shortlist 2 strongest K-matches',         assignee: 'LT', due: '2 wk',   tone: 'ok',   label: 'Research',       kind: 'review', esig: false, comments: 0 },
  { id: 'T-4805', col: 'done',    prog: 'OR-801', sect: '§10', title: 'Update device description for anodize change', assignee: 'SM', due: 'yesterday', tone: 'ok', label: 'Closed',          kind: 'edit',   esig: false, comments: 2 },
  { id: 'T-4803', col: 'done',    prog: 'OR-801', sect: '§06', title: 'Truthful and accuracy attestation',            assignee: 'JC', due: '2d ago',  tone: 'ok',   label: 'Closed',          kind: 'sign',   esig: true,  comments: 0 },
];

window.TASKS_METRICS = [
  { label: 'Open across portfolio', metric: '47', meta: '11 blockers · 9 in review' },
  { label: 'Due this week',          metric: '14', meta: 'OR-801 and OR-902 account for 9' },
  { label: 'Awaiting my action',     metric: '6',  meta: '3 reviews · 2 e-sig · 1 blocker', tone: 'warn' },
  { label: 'Cycle time median',      metric: '2.4',unit: 'd', meta: 'Down 0.3d vs last month' },
];

/* ───── Vault ───── */
window.VAULT_FOLDERS = [
  { id: 'root',   label: 'All programs',        count: 1842, active: true },
  { id: 'or801',  label: 'OR-801 Screw',         count: 284 },
  { id: 'cv330',  label: 'CV-330 Monitor',       count: 412 },
  { id: 'bx204',  label: 'BX-204 CGM',           count: 318 },
  { id: 'dx102',  label: 'DX-102 IVD',           count: 176 },
  { id: 'iv415',  label: 'IV-415 CoDx',          count: 241 },
  { id: 'shared', label: 'Shared · Templates',   count: 62 },
  { id: 'corresp',label: 'Regulatory correspondence', count: 89 },
];

window.VAULT_FILTERS = [
  { id: 'all',     label: 'All types' },
  { id: 'report',  label: 'Test reports' },
  { id: 'cert',    label: 'Certificates' },
  { id: 'label',   label: 'Labeling' },
  { id: 'code',    label: 'Software / SBOM' },
  { id: 'supplier',label: 'Supplier docs' },
  { id: 'resp',    label: 'FDA correspondence' },
];

window.VAULT_FILES = [
  { id: 'f1',  name: 'TR-OR801-009 · Pull-out force, axial',          kind: 'report',  type: 'pdf',  size: '4.2 MB',  prog: 'OR-801', ver: 'v3.2', versions: 3, status: 'final',       updated: '30 min ago',  author: 'S. Marchetti', linked: 4, esig: true,  hash: 'a91e…4f02' },
  { id: 'f2',  name: 'Biocompat -11 systemic toxicity · final',        kind: 'report',  type: 'pdf',  size: '2.8 MB',  prog: 'OR-801', ver: 'v2.0', versions: 2, status: 'review',      updated: '2h ago',     author: 'L. Tran',       linked: 3, esig: false, hash: 'b742…19cc', blocker: true },
  { id: 'f3',  name: 'ENG-OR801 rev D · drawing package',             kind: 'code',    type: 'zip',  size: '18.4 MB', prog: 'OR-801', ver: 'rev D', versions: 5, status: 'final',       updated: 'yesterday',  author: 'Eng team',       linked: 7, esig: true,  hash: 'c0d8…7791' },
  { id: 'f4',  name: 'Proposed labeling · Instructions for use',       kind: 'label',   type: 'docx', size: '3.1 MB',  prog: 'OR-801', ver: 'v1.4', versions: 4, status: 'review',      updated: '3h ago',     author: 'S. Marchetti',   linked: 2, esig: false, hash: 'd111…22aa' },
  { id: 'f5',  name: 'FDA 510(k) cover letter — OR-801',               kind: 'cert',    type: 'docx', size: '0.4 MB',  prog: 'OR-801', ver: 'v0.3', versions: 3, status: 'draft',       updated: '5h ago',     author: 'S. Marchetti',   linked: 1, esig: false, hash: 'e9b1…5140' },
  { id: 'f6',  name: 'Supplier cert · Ti-6Al-4V ELI lot 22K',          kind: 'supplier',type: 'pdf',  size: '0.9 MB',  prog: 'OR-801', ver: 'v1.0', versions: 1, status: 'final',       updated: '1d ago',     author: 'Supplier',      linked: 2, esig: true,  hash: 'f212…0094' },
  { id: 'f7',  name: 'FDA response · pre-submission Q319-2024',        kind: 'resp',    type: 'pdf',  size: '1.2 MB',  prog: 'OR-801', ver: 'v1.0', versions: 1, status: 'final',       updated: '2w ago',     author: 'FDA',           linked: 0, esig: true,  hash: '77ac…b102' },
  { id: 'f8',  name: 'SBOM · PM-660 patient monitor firmware 2.1',     kind: 'code',    type: 'json', size: '0.2 MB',  prog: 'PM-660', ver: 'v2.1', versions: 6, status: 'review',      updated: '1h ago',     author: 'A. Müller',      linked: 1, esig: false, hash: '18aa…6671' },
  { id: 'f9',  name: 'DSMB charter · CV-330 pivotal',                 kind: 'cert',    type: 'docx', size: '0.7 MB',  prog: 'CV-330', ver: 'v1.2', versions: 2, status: 'review',      updated: '4h ago',     author: 'CRO',            linked: 3, esig: false, hash: '3cc1…2278' },
  { id: 'f10', name: 'FAERS export · IV-415 · Q1-2026',               kind: 'report',  type: 'csv',  size: '0.3 MB',  prog: 'IV-415', ver: 'v1.0', versions: 1, status: 'final',       updated: '6h ago',     author: 'A. Müller',      linked: 2, esig: false, hash: '4fa0…9091' },
  { id: 'f11', name: 'Analytical sensitivity · DX-102 · 14 analytes',  kind: 'report',  type: 'xlsx', size: '1.1 MB',  prog: 'DX-102', ver: 'v0.4', versions: 4, status: 'draft',       updated: '8h ago',     author: 'P. Shah',        linked: 1, esig: false, hash: '8e22…1b33' },
  { id: 'f12', name: 'Gamma sterilization validation summary',         kind: 'report',  type: 'pdf',  size: '3.4 MB',  prog: 'OR-801', ver: 'v2.0', versions: 2, status: 'final',       updated: '1w ago',     author: 'Contract lab',  linked: 2, esig: true,  hash: 'c199…0e44' },
];

window.VAULT_VERSIONS = [
  { v: 'v3.2', when: '30 min ago',  author: 'S. Marchetti', note: 'Replaced cover page per reviewer · corrected n=30 → n=30 per diameter', status: 'final' },
  { v: 'v3.1', when: '6 hours ago', author: 'Claude · Opus 4.5', note: 'AI-drafted revision — TOC regeneration', status: 'superseded' },
  { v: 'v3.0', when: 'yesterday',   author: 'S. Marchetti', note: 'Incorporated peer review feedback from L. Tran',     status: 'superseded' },
];

/* ───── Validation Center ───── */
window.VALIDATION_SUMMARY = [
  { label: 'Blockers',      metric: '3',  meta: 'OR-801 §11 · DX-102 §17 · CV-330 Clinical', tone: 'err' },
  { label: 'Warnings',      metric: '18', meta: 'Across 6 active programs',                   tone: 'warn' },
  { label: 'Rules passing', metric: '214',meta: '92% of required-field coverage',             tone: 'ok' },
  { label: 'Programs ready', metric: '2', unit: '/ 14', meta: 'OR-902 and CV-117 pass all gates' },
];

window.VALIDATION_PROGRAMS = [
  { id: 'or801', code: 'OR-801', title: 'Screw system',           pathway: '510(k)', errs: 1, warns: 4, ok: 15, status: 'blocked',  readiness: 84 },
  { id: 'or902', code: 'OR-902', title: 'Spinal implant',         pathway: '510(k)', errs: 0, warns: 0, ok: 20, status: 'complete', readiness: 98 },
  { id: 'cv330', code: 'CV-330', title: 'Implantable monitor',     pathway: 'PMA',   errs: 1, warns: 3, ok: 12, status: 'blocked',  readiness: 61 },
  { id: 'bx204', code: 'BX-204', title: 'CGM',                    pathway: '510(k)', errs: 0, warns: 5, ok: 15, status: 'active',   readiness: 72 },
  { id: 'dx102', code: 'DX-102', title: 'IVD cartridge',           pathway: 'De Novo',errs: 1, warns: 3, ok: 14, status: 'blocked',  readiness: 48 },
  { id: 'iv415', code: 'IV-415', title: 'Companion diagnostic',    pathway: 'CER',    errs: 0, warns: 3, ok: 9,  status: 'active',   readiness: 34 },
  { id: 'pm660', code: 'PM-660', title: 'Patient monitor SW',      pathway: '510(k)', errs: 0, warns: 2, ok: 18, status: 'active',   readiness: 67 },
  { id: 'cv117', code: 'CV-117', title: 'ECG patch',              pathway: '510(k)', errs: 0, warns: 0, ok: 20, status: 'complete', readiness: 100 },
];

window.VALIDATION_RULES = [
  { id: 'CE-01',     prog: 'OR-801', sect: '§11', severity: 'err',  category: 'Claim-evidence', msg: 'Biocompat claim references §14 evidence with status "review" — not yet locked.',                              since: '2h ago' },
  { id: 'eSTAR-11.2',prog: 'CV-330', sect: 'Clinical', severity: 'err', category: 'Required field', msg: 'Primary endpoint power calculation not attached. Rule eSTAR §VII-11.2 requires signed SAP.',                 since: '1d ago' },
  { id: 'eSTAR-17.4',prog: 'DX-102', sect: '§17', severity: 'err',  category: 'Required field', msg: 'Analytical sensitivity table missing 3 of 14 analyte rows (thyroxine, cortisol, troponin-I).',                   since: '4h ago' },
  { id: 'CE-02',     prog: 'OR-801', sect: '§11', severity: 'warn', category: 'Claim-evidence', msg: 'Pull-out force claim cites TR-OR801-009 — attachment missing in §17.',                                            since: '5h ago' },
  { id: 'DR-07',     prog: 'OR-801', sect: '§03', severity: 'warn', category: 'Drafting',       msg: 'Cover letter word count (640) below typical FDA submission threshold (~800).',                                     since: '5h ago' },
  { id: 'VR-22',     prog: 'BX-204', sect: 'Predicate', severity: 'warn', category: 'Predicate', msg: 'K221847 performance data shows MARD delta > 0.5% — needs rationale in §11.',                                      since: '2d ago' },
  { id: 'eSTAR-12.1',prog: 'CV-330', sect: 'Labeling',  severity: 'warn', category: 'Labeling',  msg: 'MRI-conditional statement language not yet aligned with notified body draft.',                                    since: '3d ago' },
  { id: 'UDI-04',    prog: 'PM-660', sect: 'Labeling',  severity: 'warn', category: 'UDI',       msg: 'DI-level GUDID record missing 2 required DI-PI attributes (lot, manufacture date).',                              since: '1d ago' },
];

/* ───── Submission Center ───── */
window.SUBMISSION_PIPELINE = [
  { id: 'package',   label: 'Package',       desc: 'eSTAR export · attachments'  },
  { id: 'validate',  label: 'Validate',      desc: 'Required-field · claims'     },
  { id: 'sign',      label: 'Cover + sign',  desc: 'Cover letter · e-signature'  },
  { id: 'transmit',  label: 'Transmit',      desc: 'FDA ESG · notified body'     },
  { id: 'ack',       label: 'Acknowledgement',desc: 'Receipt · review clock'     },
  { id: 'review',    label: 'Review',        desc: 'Substantive · deficiency'    },
  { id: 'decision',  label: 'Decision',      desc: 'Cleared · approved'          },
];

window.SUBMISSIONS = [
  { id: 's1', prog: 'OR-902', pathway: '510(k)', stage: 'transmit',
    status: 'active', title: 'OR-902 Spinal implant — final eSTAR', target: 'FDA · ESG',
    bytes: '142 MB', files: 48, cover: 'signed', esig: true,
    transmitAt: null, targetAt: '4 days', tone: 'warn',
    gate: { errs: 0, warns: 0, ok: 20 }, log: [
      { when: '22 min ago', who: 'S. Marchetti',        what: 'Cover letter e-signed (AUD-9104)' },
      { when: '1h ago',     who: 'Validation Center',    what: 'All 20 eSTAR sections pass — ready to transmit' },
      { when: '2h ago',     who: 'Claude · Sonnet 4.5',  what: 'Drafted 510(k) summary revision · 2 edits' },
    ]
  },
  { id: 's2', prog: 'OR-801', pathway: '510(k)', stage: 'validate',
    status: 'blocked', title: 'OR-801 Screw system — Q1 filing', target: 'FDA · ESG',
    bytes: '98 MB',  files: 41, cover: 'draft',  esig: false,
    transmitAt: null, targetAt: '22 days', tone: 'warn',
    gate: { errs: 1, warns: 4, ok: 15 }, log: [
      { when: 'Just now',   who: 'Validation Center', what: 'Blocker CE-01 in §11 · biocompat evidence not locked' },
      { when: '3h ago',     who: 'L. Tran',           what: 'Biocompat -11 report sent for internal review' },
      { when: 'Yesterday',  who: 'S. Marchetti',      what: 'eSTAR package snapshot (41 files)' },
    ]
  },
  { id: 's3', prog: 'CV-117', pathway: '510(k)', stage: 'decision',
    status: 'complete', title: 'CV-117 ECG patch · K254481', target: 'FDA · ESG',
    bytes: '76 MB',  files: 37, cover: 'signed', esig: true,
    transmitAt: 'Feb 3, 2026', targetAt: '—', tone: 'ok',
    gate: { errs: 0, warns: 0, ok: 20 }, log: [
      { when: 'Feb 14',     who: 'FDA',               what: 'CLEARED · K254481 · 87-day cycle' },
      { when: 'Feb 3',      who: 'FDA',               what: 'Acknowledgement received · review clock started' },
      { when: 'Feb 3',      who: 'M. Webb',           what: 'Transmitted via ESG · receipt 254481-rcpt' },
    ]
  },
  { id: 's4', prog: 'BX-204', pathway: '510(k)', stage: 'package',
    status: 'active', title: 'BX-204 CGM — pre-submission bundle', target: 'FDA · ESG',
    bytes: '62 MB',  files: 24, cover: 'draft',  esig: false,
    transmitAt: null, targetAt: '41 days', tone: 'ok',
    gate: { errs: 0, warns: 5, ok: 15 }, log: [
      { when: '5h ago',     who: 'J. Chen',           what: 'SE matrix finalized for K221847' },
      { when: '2d ago',     who: 'Claude · Opus 4.5', what: 'Drafted §11 substantial equivalence' },
    ]
  },
  { id: 's5', prog: 'IV-415', pathway: 'EU MDR',   stage: 'package',
    status: 'active', title: 'IV-415 CoDx · notified body bundle', target: 'NB 0123 · TÜV',
    bytes: '88 MB',  files: 52, cover: 'draft',  esig: false,
    transmitAt: null, targetAt: 'Q1', tone: 'warn',
    gate: { errs: 0, warns: 3, ok: 9 }, log: [
      { when: '3h ago',     who: 'A. Müller',         what: 'FAERS signal export attached' },
      { when: 'Yesterday',  who: 'Claude · Opus 4.5', what: 'Article 61 section · draft v2' },
    ]
  },
];

/* ───── Templates (lite index) ───── */
window.TEMPLATES = [
  { id: 't1', name: '510(k) summary — Class II implant',   uses: 42, owner: 'Reg Affairs',  updated: '2 weeks ago', tags: ['510(k)', 'implant', 'Class II'] },
  { id: 't2', name: 'SE discussion skeleton',              uses: 67, owner: 'Reg Affairs',  updated: '1 month ago', tags: ['510(k)', '§11'] },
  { id: 't3', name: 'CER — EU MDR Article 61',             uses: 19, owner: 'Clinical',     updated: '3 weeks ago', tags: ['CER', 'EU MDR'] },
  { id: 't4', name: 'Biocompatibility summary',            uses: 28, owner: 'Quality',      updated: '5 days ago',  tags: ['biocompat', '§14'] },
  { id: 't5', name: 'DSMB charter',                        uses: 11, owner: 'Clinical',     updated: '2 months ago', tags: ['PMA', 'clinical'] },
  { id: 't6', name: 'Cybersecurity premarket submission',  uses: 15, owner: 'Software',     updated: '1 month ago',  tags: ['SaMD', 'cyber'] },
];

Object.assign(window, {
  TASKS_COLUMNS: window.TASKS_COLUMNS,
  TASKS: window.TASKS,
  TASKS_METRICS: window.TASKS_METRICS,
  VAULT_FOLDERS: window.VAULT_FOLDERS,
  VAULT_FILTERS: window.VAULT_FILTERS,
  VAULT_FILES: window.VAULT_FILES,
  VAULT_VERSIONS: window.VAULT_VERSIONS,
  VALIDATION_SUMMARY: window.VALIDATION_SUMMARY,
  VALIDATION_PROGRAMS: window.VALIDATION_PROGRAMS,
  VALIDATION_RULES: window.VALIDATION_RULES,
  SUBMISSION_PIPELINE: window.SUBMISSION_PIPELINE,
  SUBMISSIONS: window.SUBMISSIONS,
  TEMPLATES: window.TEMPLATES,
});
