/**
 * Submission Center fixtures — ported verbatim from
 * `design-system/ui_kits/mdx/data-submissions.jsx`.
 *
 * The Submission Center is workstream-agnostic. Every regulatory filing across
 * every Concept2Cure.RI workstream funnels through one surface — MDX (510(k),
 * PMA, CER), Biotech (IND, BLA), Pharma (NDA, MAA, supplements), CRO (IDE,
 * study filings) — to every agency gateway (FDA ESG, EMA CESP, EUDAMED, Health
 * Canada CESG, plus a roadmap of PMDA, MHRA, NMPA, MFDS, TGA, ANVISA, WHO).
 *
 * Three primitives compose the contract:
 *   1. SUBMISSION_TYPES      — what kind of dossier
 *   2. SUBMISSION_GATEWAYS   — agency endpoints + receipt shapes
 *   3. SUBMISSIONS_V2        — actual filings in flight, joining the two
 *
 * The 7-stage pipeline (SUBMISSION_PIPELINE_V2) is universal. What swaps per type
 * is the contents of each stage (build outline, validator profile, package
 * format, gateway protocol, receipt fields, AIC log entries).
 *
 * Adding a new submission type or agency in the future is a data change here,
 * not a UI change.
 */

import type {
  Submission,
  SubmissionDetail,
  SubmissionGateway,
  SubmissionGatewayDef,
  SubmissionStage,
  SubmissionType,
  SubmissionTypeDef,
  SubmissionWorkstream,
} from '../types';

/** Top-level workstream filter — pinned at the topbar. The `'all'` row sits
 *  alongside the four real workstreams in the chip rail. */
export interface SubmissionWorkstreamDef {
  id: SubmissionWorkstream | 'all';
  label: string;
  tone: '' | SubmissionWorkstream;
  short?: string;
  preview?: boolean;
}

export const SUBMISSION_WORKSTREAMS: SubmissionWorkstreamDef[] = [
  { id: 'all',     label: 'All workstreams',     tone: '' },
  { id: 'mdx',     label: 'Medical Device & Dx', tone: 'mdx',     short: 'MDX' },
  { id: 'biotech', label: 'Biotech',             tone: 'biotech', short: 'BIO',    preview: true },
  { id: 'pharma',  label: 'Pharma',              tone: 'pharma',  short: 'PHARMA', preview: true },
  { id: 'cro',     label: 'CRO',                 tone: 'cro',     short: 'CRO',    preview: true },
];

/** Closed list of submission types. Each carries a `shape` that the Build tab
 *  uses to render the right outline (eSTAR sections vs eCTD modules vs EUDAMED
 *  actor file vs CER section list). */
export const SUBMISSION_TYPES: SubmissionTypeDef[] = [
  /* MDX — shipped */
  { id: '510k',      workstream: 'mdx',     label: '510(k)',         shape: 'estar',    desc: 'FDA Premarket Notification, traditional/abbreviated/special' },
  { id: 'denovo',    workstream: 'mdx',     label: 'De Novo',        shape: 'estar',    desc: 'FDA novel-device classification request' },
  { id: 'pma',       workstream: 'mdx',     label: 'PMA',            shape: 'ectd-pma', desc: 'FDA Premarket Approval — modular' },
  { id: 'pma-s',     workstream: 'mdx',     label: 'PMA Supplement', shape: 'ectd-pma', desc: '180-day, real-time, special, panel-track' },
  { id: 'cer',       workstream: 'mdx',     label: 'CER · NB',       shape: 'cer',      desc: 'EU MDR Article 61 clinical evaluation report' },
  { id: 'eudamed',   workstream: 'mdx',     label: 'EUDAMED Reg.',   shape: 'eudamed',  desc: 'Actor + UDI-DI + clinical investigation registration' },

  /* Biotech — shipped (with preview chip in seed list) */
  { id: 'ind',       workstream: 'biotech', label: 'IND',            shape: 'ectd',     desc: 'Investigational New Drug application' },
  { id: 'bla',       workstream: 'biotech', label: 'BLA',            shape: 'ectd',     desc: 'Biologics License Application — 351(a) / 351(k)' },
  { id: 'ind-amend', workstream: 'biotech', label: 'IND Amendment',  shape: 'ectd',     desc: 'Protocol amendment, safety report, info amendment' },

  /* Pharma — shipped (with preview chip) */
  { id: 'nda',       workstream: 'pharma',  label: 'NDA',            shape: 'ectd',     desc: 'New Drug Application — 505(b)(1) / 505(b)(2)' },
  { id: 'anda',      workstream: 'pharma',  label: 'ANDA',           shape: 'ectd',     desc: 'Abbreviated New Drug Application — generics' },
  { id: 'maa',       workstream: 'pharma',  label: 'MAA',            shape: 'ectd',     desc: 'EU Marketing Authorisation Application — centralised' },
  { id: 'jnda',      workstream: 'pharma',  label: 'J-NDA',          shape: 'ectd',     desc: 'PMDA Japanese New Drug Application' },

  /* CRO — shipped */
  { id: 'ide',       workstream: 'cro',     label: 'IDE',            shape: 'ide',      desc: 'Investigational Device Exemption' },
  { id: 'ctd-cta',   workstream: 'cro',     label: 'CTA',            shape: 'ectd',     desc: 'Clinical Trial Application — EU CTR / Health Canada' },
];

/** Agency endpoints. v1 ships full receipt detail for `fda-esg`, `ema-cesp`,
 *  `eu-eudamed`, `hc-cesg`; the rest render as available targets with a
 *  "Receipt format pending" placeholder. */
export const SUBMISSION_GATEWAYS: SubmissionGatewayDef[] = [
  /* Full v1 */
  { id: 'fda-esg',     agency: 'FDA',           region: 'US',     label: 'FDA ESG',     shape: 'esg',     v1: true,
    desc: 'Electronic Submissions Gateway · WebTrader / AS2',
    receiptFields: ['Core ID', 'ACK1', 'ACK2', 'ACK3'],
    accepts: ['510k', 'denovo', 'pma', 'pma-s', 'ind', 'ind-amend', 'bla', 'nda', 'anda', 'ide'] },

  { id: 'ema-cesp',    agency: 'EMA',           region: 'EU',     label: 'EMA CESP',    shape: 'cesp',    v1: true,
    desc: 'Common European Submission Portal',
    receiptFields: ['Delivery file', 'Notification', 'Validation report'],
    accepts: ['maa', 'ind', 'bla', 'ctd-cta'] },

  { id: 'eu-eudamed',  agency: 'EU Commission', region: 'EU',     label: 'EUDAMED',     shape: 'eudamed', v1: true,
    desc: 'EU MDR / IVDR actor & UDI database',
    receiptFields: ['Actor ID', 'UDI-DI', 'SRN', 'Audit ID'],
    accepts: ['eudamed', 'cer'] },

  { id: 'hc-cesg',     agency: 'Health Canada', region: 'CA',     label: 'Health Canada CESG', shape: 'cesg', v1: true,
    desc: 'Common Electronic Submissions Gateway',
    receiptFields: ['Submission ID', 'Acknowledgement letter'],
    accepts: ['nda', 'anda', 'ind', '510k', 'denovo', 'ctd-cta'] },

  /* v2 — Receipt format pending */
  { id: 'pmda-gw',     agency: 'PMDA',          region: 'JP',     label: 'PMDA Gateway',  shape: 'pmda',   v1: false,
    desc: 'Pharmaceuticals & Medical Devices Agency · Japan',
    accepts: ['jnda', '510k', 'pma', 'ide'] },
  { id: 'mhra-gw',     agency: 'MHRA',          region: 'UK',     label: 'MHRA Gateway',  shape: 'mhra',   v1: false,
    desc: 'Medicines & Healthcare products Regulatory Agency · UK',
    accepts: ['maa', '510k', 'ind', 'bla', 'nda'] },
  { id: 'nmpa-portal', agency: 'NMPA',          region: 'CN',     label: 'NMPA Portal',   shape: 'nmpa',   v1: false,
    desc: 'National Medical Products Administration · China',
    accepts: ['nda', '510k', 'pma', 'ind', 'bla'] },
  { id: 'mfds-portal', agency: 'MFDS',          region: 'KR',     label: 'MFDS Portal',   shape: 'mfds',   v1: false,
    desc: 'Ministry of Food & Drug Safety · Korea',
    accepts: ['nda', '510k', 'pma'] },
  { id: 'tga-trams',   agency: 'TGA',           region: 'AU',     label: 'TGA TRAMS',     shape: 'tga',    v1: false,
    desc: 'Therapeutic Goods Administration · Australia',
    accepts: ['nda', '510k', 'pma', 'ind'] },
  { id: 'anvisa-peticionamento', agency: 'ANVISA', region: 'BR',  label: 'ANVISA Peticionamento', shape: 'anvisa', v1: false,
    desc: 'Agência Nacional de Vigilância Sanitária · Brazil',
    accepts: ['nda', '510k', 'pma'] },
  { id: 'who-prequal', agency: 'WHO',           region: 'GLOBAL', label: 'WHO Prequalification', shape: 'who', v1: false,
    desc: 'WHO Prequalification programme',
    accepts: ['bla', 'nda'] },
];

/** Universal 7-stage pipeline. Same for every submission type. */
export interface SubmissionPipelineStage {
  id: SubmissionStage;
  label: string;
  desc: string;
}

export const SUBMISSION_PIPELINE_V2: SubmissionPipelineStage[] = [
  { id: 'build',    label: 'Build',    desc: 'Assemble dossier from live editor + vault' },
  { id: 'validate', label: 'Validate', desc: 'Run agency rule profile · resolve blockers' },
  { id: 'sign',     label: 'Sign',     desc: 'Route for review · Part 11 e-signatures' },
  { id: 'package',  label: 'Package',  desc: 'Generate gateway-shaped bundle (eCTD / eSTAR / EUDAMED XML)' },
  { id: 'transmit', label: 'Transmit', desc: 'Submit to gateway · capture transport receipt' },
  { id: 'receipt',  label: 'Receipt',  desc: 'Acknowledgements (ACK1/2/3 · CESP NPN · EUDAMED ID)' },
  { id: 'aic',      label: 'AIC log',  desc: 'Authoritative immutable copy · hash-chain entry' },
];

/** Submissions in flight. MDX-rich + a few preview rows for Biotech / Pharma
 *  to telegraph the platform story. */
export const SUBMISSIONS_V2: Submission[] = [
  /* ───── MDX · 510(k) ───── */
  {
    id: 'sub-or902-510k', workstream: 'mdx', type: '510k', gateway: 'fda-esg',
    prog: 'OR-902', progTitle: 'OR-902 Spinal Implant',
    title: 'OR-902 Spinal Implant — final eSTAR',
    stage: 'transmit', status: 'active',
    targetAt: '4 days · 2026-04-29', sentAt: null,
    files: 48, bytes: '142 MB',
    gate: { errs: 0, warns: 0, ok: 20 },
    cover: 'signed', esig: true, owner: 'S. Marchetti', tone: 'warn',
  },
  {
    id: 'sub-bx204-510k', workstream: 'mdx', type: '510k', gateway: 'fda-esg',
    prog: 'BX-204', progTitle: 'BX-204 Continuous Glucose Monitor',
    title: 'BX-204 CGM — pre-submission bundle',
    stage: 'build', status: 'active',
    targetAt: '41 days · 2026-06-04', sentAt: null,
    files: 24, bytes: '62 MB',
    gate: { errs: 0, warns: 5, ok: 15 },
    cover: 'draft', esig: false, owner: 'J. Chen', tone: '',
  },
  {
    id: 'sub-or801-510k', workstream: 'mdx', type: '510k', gateway: 'fda-esg',
    prog: 'OR-801', progTitle: 'OR-801 Pedicle Screw System',
    title: 'OR-801 Screw System — Q1 filing',
    stage: 'validate', status: 'blocked',
    targetAt: '22 days · 2026-05-15', sentAt: null,
    files: 41, bytes: '98 MB',
    gate: { errs: 1, warns: 4, ok: 15 },
    cover: 'draft', esig: false, owner: 'S. Marchetti', tone: 'err',
  },

  /* ───── MDX · PMA ───── */
  {
    id: 'sub-cv330-pma', workstream: 'mdx', type: 'pma', gateway: 'fda-esg',
    prog: 'CV-330', progTitle: 'CV-330 Implantable Cardiac Monitor',
    title: 'CV-330 PMA · Module 5 clinical (CSR + ISS + ISE)',
    stage: 'sign', status: 'active',
    targetAt: '67 days · 2026-06-30', sentAt: null,
    files: 312, bytes: '4.8 GB',
    gate: { errs: 0, warns: 7, ok: 41 },
    cover: 'review', esig: false, owner: 'M. Webb', tone: 'warn',
  },
  {
    id: 'sub-cv410-pmas', workstream: 'mdx', type: 'pma-s', gateway: 'fda-esg',
    prog: 'CV-410', progTitle: 'CV-410 Catheter — Lead extension',
    title: 'CV-410 PMA-S · 180-day labeling change',
    stage: 'package', status: 'active',
    targetAt: '95 days · 2026-07-28', sentAt: null,
    files: 38, bytes: '218 MB',
    gate: { errs: 0, warns: 2, ok: 14 },
    cover: 'signed', esig: true, owner: 'M. Webb', tone: 'ok',
  },

  /* ───── MDX · CER (EUDAMED + Notified Body) ───── */
  {
    id: 'sub-iv415-cer', workstream: 'mdx', type: 'cer', gateway: 'eu-eudamed',
    prog: 'IV-415', progTitle: 'IV-415 Companion Diagnostic',
    title: 'IV-415 CER · Notified Body 0123 (TÜV) bundle',
    stage: 'build', status: 'active',
    targetAt: 'Q1 2026', sentAt: null,
    files: 52, bytes: '88 MB',
    gate: { errs: 0, warns: 3, ok: 9 },
    cover: 'draft', esig: false, owner: 'A. Müller', tone: 'warn',
  },
  {
    id: 'sub-iv208-cer', workstream: 'mdx', type: 'cer', gateway: 'eu-eudamed',
    prog: 'IV-208', progTitle: 'IV-208 Tumor Marker Assay',
    title: 'IV-208 CER · Article 61 — Q2 EUDAMED',
    stage: 'build', status: 'active',
    targetAt: 'Q2 2026', sentAt: null,
    files: 34, bytes: '54 MB',
    gate: { errs: 0, warns: 8, ok: 6 },
    cover: 'draft', esig: false, owner: 'J. Chen', tone: '',
  },

  /* ───── MDX · cleared (historical) ───── */
  {
    id: 'sub-cv117-510k-done', workstream: 'mdx', type: '510k', gateway: 'fda-esg',
    prog: 'CV-117', progTitle: 'CV-117 ECG Patch',
    title: 'CV-117 ECG Patch · K254481 (cleared)',
    stage: 'aic', status: 'complete',
    targetAt: '—', sentAt: 'Feb 03 · ACK3 Feb 03',
    files: 37, bytes: '76 MB',
    gate: { errs: 0, warns: 0, ok: 20 },
    cover: 'signed', esig: true, owner: 'M. Webb', tone: 'ok',
  },

  /* ───── BIOTECH (preview) ───── */
  {
    id: 'sub-mdb521-ind', workstream: 'biotech', type: 'ind', gateway: 'fda-esg',
    prog: 'MDB-521', progTitle: 'MDB-521 — anti-CD19 CAR-T',
    title: 'MDB-521 IND · initial filing (M1–M5)',
    stage: 'validate', status: 'active',
    targetAt: '14 days', sentAt: null,
    files: 1842, bytes: '38.4 GB',
    gate: { errs: 0, warns: 12, ok: 187 },
    cover: 'review', esig: false, owner: '—', tone: 'warn', preview: true,
  },
  {
    id: 'sub-mdb340-bla', workstream: 'biotech', type: 'bla', gateway: 'fda-esg',
    prog: 'MDB-340', progTitle: 'MDB-340 — recombinant Factor IX',
    title: 'MDB-340 BLA · 351(a) initial',
    stage: 'build', status: 'active',
    targetAt: 'Q4 2026', sentAt: null,
    files: 2918, bytes: '61.2 GB',
    gate: { errs: 0, warns: 0, ok: 0 },
    cover: 'draft', esig: false, owner: '—', tone: '', preview: true,
  },

  /* ───── PHARMA (preview) ───── */
  {
    id: 'sub-px118-maa', workstream: 'pharma', type: 'maa', gateway: 'ema-cesp',
    prog: 'PX-118', progTitle: 'PX-118 — JAK1 selective',
    title: 'PX-118 MAA · centralised (Day-180 response)',
    stage: 'sign', status: 'active',
    targetAt: '8 days', sentAt: null,
    files: 482, bytes: '7.1 GB',
    gate: { errs: 0, warns: 3, ok: 64 },
    cover: 'review', esig: false, owner: '—', tone: 'warn', preview: true,
  },
];

/** Per-submission detail. Build outline (type-shaped), validation summary by
 *  section, signers, packaging, transmit + receipt (gateway-shaped), and AIC
 *  log entries with hash chain. Keyed by submission id. */
export const SUBMISSIONS_DETAIL: Record<string, SubmissionDetail> = {
  /* ───────────────────────────────────────────────
     OR-902 · 510(k) · ready to transmit (the demo flagship)
     ─────────────────────────────────────────────── */
  'sub-or902-510k': {
    summary: 'OR-902 Spinal Implant 510(k). Predicate K191822, with K221603 as reference. eSTAR validation green across all 20 sections, cover letter e-signed, ready for ESG transmission. Target April 29.',
    build: {
      shape: 'estar',
      label: 'eSTAR · 20 sections',
      sections: [
        { id: 1,  label: 'User Fee Cover Sheet',          status: 'complete', files: 1 },
        { id: 4,  label: 'Indications for Use',           status: 'complete', files: 1 },
        { id: 5,  label: '510(k) Summary',                status: 'complete', files: 1 },
        { id: 6,  label: 'Truthful & Accuracy Statement', status: 'complete', files: 1 },
        { id: 10, label: 'Device Description',            status: 'complete', files: 4 },
        { id: 11, label: 'Substantial Equivalence',       status: 'complete', files: 3 },
        { id: 14, label: 'Biocompatibility',              status: 'complete', files: 8 },
        { id: 15, label: 'Software',                      status: 'na',       files: 0 },
        { id: 17, label: 'Performance — Bench',           status: 'complete', files: 12 },
        { id: 19, label: 'Performance — Clinical',        status: 'na',       files: 0 },
        { id: 20, label: 'References',                    status: 'complete', files: 18 },
      ],
      totalFiles: 48,
      totalBytes: '142 MB',
    },
    validation: {
      profile:  'eSTAR Validator · FDA CDRH 2024-Q4 ruleset',
      runAt:    '12 minutes ago',
      errors:   0,
      warnings: 0,
      pass:     20,
      sections: [
        { id: 11, label: '§11 Substantial Equivalence', errs: 0, warns: 0, ok: 4 },
        { id: 14, label: '§14 Biocompatibility',         errs: 0, warns: 0, ok: 6 },
        { id: 17, label: '§17 Bench Performance',        errs: 0, warns: 0, ok: 5 },
      ],
    },
    signatures: {
      mode: '21 CFR Part 11 · sequential review then sign',
      signers: [
        { who: 'L. Tran',      role: 'RA Director',  when: '14:32 · today', status: 'signed', audit: 'AUD-9101' },
        { who: 'S. Marchetti', role: 'Program Lead', when: '15:08 · today', status: 'signed', audit: 'AUD-9104' },
        { who: 'J. Chen',      role: 'Submitter',    when: '15:11 · today', status: 'signed', audit: 'AUD-9106' },
      ],
    },
    package: {
      shape:    'eSTAR ZIP',
      filename: 'OR-902_K-pending_eSTAR.zip',
      size:     '142 MB',
      checksum: 'sha-256 · a4f1…02e7',
      contents: [
        { name: 'eSTAR.pdf',              bytes: '8.4 MB' },
        { name: '§14 Biocompat appendix', bytes: '54 MB · 8 files' },
        { name: '§17 Bench performance',  bytes: '79 MB · 12 files' },
        { name: '§20 References',         bytes: '0.6 MB · 18 files' },
      ],
    },
    transmit: {
      gatewayLabel: 'FDA ESG · WebTrader',
      mode:         'AS2 · ESG production',
      to:           'CDRH OHT6 · Orthopedic',
      readyToSend:  true,
    },
    receipt: { shape: 'esg', coreId: null, ack1: null, ack2: null, ack3: null },
    aic: [],
    activity: [
      { when: '15:11',     who: 'J. Chen',           what: 'Signature complete · ready to transmit' },
      { when: '15:08',     who: 'S. Marchetti',      what: 'E-signed cover letter · AUD-9104' },
      { when: '14:32',     who: 'L. Tran',           what: 'E-signed cover letter · AUD-9101' },
      { when: '14:18',     who: 'Validation Center', what: 'eSTAR · 20/20 pass · 0 err · 0 warn' },
      { when: '12:02',     who: 'AnA · Sonnet 4.5',  what: 'Generated 510(k) summary draft · 2 edits' },
      { when: 'Yesterday', who: 'S. Marchetti',      what: 'Closed CE-01 §17 — bench fatigue data locked' },
    ],
  },

  /* ───────────────────────────────────────────────
     OR-801 · 510(k) · blocked at validate
     ─────────────────────────────────────────────── */
  'sub-or801-510k': {
    summary: 'OR-801 Pedicle Screw System 510(k). Validation blocked by 1 error (§19 clinical performance — biocompat -11 supplier signature outstanding). Target May 15.',
    build: {
      shape: 'estar',
      label: 'eSTAR · 20 sections',
      sections: [
        { id: 1,  label: 'User Fee Cover Sheet',     status: 'complete', files: 1 },
        { id: 5,  label: '510(k) Summary',           status: 'draft',    files: 1 },
        { id: 10, label: 'Device Description',       status: 'review',   files: 3 },
        { id: 11, label: 'Substantial Equivalence',  status: 'review',   files: 2 },
        { id: 14, label: 'Biocompatibility',         status: 'draft',    files: 4 },
        { id: 19, label: 'Performance — Clinical',   status: 'blocked',  files: 1 },
      ],
      totalFiles: 41,
      totalBytes: '98 MB',
    },
    validation: {
      profile:  'eSTAR Validator · FDA CDRH 2024-Q4 ruleset',
      runAt:    '3 hours ago',
      errors:   1,
      warnings: 4,
      pass:     15,
      sections: [
        { id: 11, label: '§11 Substantial Equivalence', errs: 0, warns: 1, ok: 3 },
        { id: 14, label: '§14 Biocompatibility',         errs: 0, warns: 2, ok: 4 },
        { id: 19, label: '§19 Clinical',                 errs: 1, warns: 1, ok: 1, blocker: 'CE-01 · biocompat -11 supplier signature missing' },
      ],
    },
    signatures: {
      mode: '21 CFR Part 11 · awaiting validation pass',
      signers: [
        { who: 'L. Tran',      role: 'RA Director',  when: null, status: 'queued', audit: '—' },
        { who: 'S. Marchetti', role: 'Program Lead', when: null, status: 'queued', audit: '—' },
      ],
    },
    package:  { shape: 'eSTAR ZIP', filename: 'OR-801_eSTAR.zip', size: '98 MB', checksum: 'pending', contents: [] },
    transmit: { gatewayLabel: 'FDA ESG · WebTrader', mode: 'AS2 · ESG production', to: 'CDRH OHT6 · Orthopedic', readyToSend: false },
    receipt:  { shape: 'esg', coreId: null, ack1: null, ack2: null, ack3: null },
    aic: [],
    activity: [
      { when: 'Just now',  who: 'Validation Center', what: 'CE-01 · §19 blocker · biocompat -11 supplier sig outstanding' },
      { when: '3h ago',    who: 'L. Tran',           what: 'Biocompat -11 report sent for internal review' },
      { when: 'Yesterday', who: 'S. Marchetti',      what: 'eSTAR package snapshot · 41 files' },
    ],
  },

  /* ───────────────────────────────────────────────
     CV-117 · cleared (historical) — full receipt + AIC chain
     ─────────────────────────────────────────────── */
  'sub-cv117-510k-done': {
    summary: 'CV-117 ECG Patch 510(k). Cleared K254481 February 14 · 87-day review cycle. Receipt and AIC log preserved for inspection.',
    build: {
      shape: 'estar',
      label: 'eSTAR · 20 sections (sealed)',
      sections: [
        { id: 1,  label: 'User Fee Cover Sheet',          status: 'complete', files: 1 },
        { id: 5,  label: '510(k) Summary',                status: 'complete', files: 1 },
        { id: 10, label: 'Device Description',            status: 'complete', files: 4 },
        { id: 11, label: 'Substantial Equivalence',       status: 'complete', files: 3 },
        { id: 14, label: 'Biocompatibility',              status: 'complete', files: 5 },
        { id: 17, label: 'Performance — Bench',           status: 'complete', files: 9 },
        { id: 20, label: 'References',                    status: 'complete', files: 14 },
      ],
      totalFiles: 37,
      totalBytes: '76 MB',
    },
    validation: {
      profile:  'eSTAR Validator · FDA CDRH 2025-Q4 ruleset (sealed)',
      runAt:    'Feb 02, 2026',
      errors:   0,
      warnings: 0,
      pass:     20,
      sections: [],
    },
    signatures: {
      mode: '21 CFR Part 11 · all signed',
      signers: [
        { who: 'L. Tran',   role: 'RA Director',  when: 'Feb 02 · 11:14', status: 'signed', audit: 'AUD-8801' },
        { who: 'M. Webb',   role: 'Program Lead', when: 'Feb 02 · 11:31', status: 'signed', audit: 'AUD-8804' },
        { who: 'A. Khoury', role: 'CMO',          when: 'Feb 02 · 14:02', status: 'signed', audit: 'AUD-8809' },
      ],
    },
    package: {
      shape:    'eSTAR ZIP',
      filename: 'CV-117_K254481_eSTAR.zip',
      size:     '76 MB',
      checksum: 'sha-256 · b8e2…41a9',
      contents: [
        { name: 'eSTAR.pdf',              bytes: '6.1 MB' },
        { name: '§14 Biocompat appendix', bytes: '22 MB · 5 files' },
        { name: '§17 Bench performance',  bytes: '47 MB · 9 files' },
      ],
    },
    transmit: {
      gatewayLabel: 'FDA ESG · WebTrader',
      mode:         'AS2 · ESG production',
      to:           'CDRH OHT2 · Cardiac',
      readyToSend:  false,
      sentAt:       'Feb 03, 2026 · 09:14 EST',
      sentBy:       'M. Webb',
    },
    receipt: {
      shape:   'esg',
      coreId:  'CORE-2026-014482',
      ack1:    { received: 'Feb 03 · 09:14:32', status: 'received', detail: 'ESG transport receipt · MDN' },
      ack2:    { received: 'Feb 03 · 09:18:11', status: 'received', detail: 'CDRH Center receipt · package validated' },
      ack3:    { received: 'Feb 03 · 11:42:08', status: 'received', detail: 'K-number assigned · K254481' },
      kNumber: 'K254481',
      decision: { date: 'Feb 14, 2026', outcome: 'Cleared', cycleDays: 87 },
    },
    /* Hash-linked immutable entries. Real chain runs sha-256(prev_hash || event_json).
       Truncated to 6 chars for inline display. */
    aic: [
      { seq: 8, when: 'Feb 14 · 16:02', actor: 'FDA · CDRH', event: 'Decision · CLEARED · K254481',         hash: 'f8c41a', prev: '7e2d91' },
      { seq: 7, when: 'Feb 03 · 11:42', actor: 'FDA · ESG',  event: 'ACK3 received · K-number assigned',     hash: '7e2d91', prev: '6b14ac' },
      { seq: 6, when: 'Feb 03 · 09:18', actor: 'FDA · ESG',  event: 'ACK2 received · package validated',     hash: '6b14ac', prev: '5a09f3' },
      { seq: 5, when: 'Feb 03 · 09:14', actor: 'FDA · ESG',  event: 'ACK1 received · transport receipt',     hash: '5a09f3', prev: '4f72b8' },
      { seq: 4, when: 'Feb 03 · 09:14', actor: 'M. Webb',    event: 'Transmitted via ESG · 76 MB',           hash: '4f72b8', prev: '3c1e4d' },
      { seq: 3, when: 'Feb 02 · 14:02', actor: 'A. Khoury',  event: 'E-signature · CMO · AUD-8809',          hash: '3c1e4d', prev: '2b8472' },
      { seq: 2, when: 'Feb 02 · 11:31', actor: 'M. Webb',    event: 'E-signature · Program Lead · AUD-8804', hash: '2b8472', prev: '1a06d5' },
      { seq: 1, when: 'Feb 02 · 11:14', actor: 'L. Tran',    event: 'E-signature · RA Director · AUD-8801',  hash: '1a06d5', prev: '000000' },
    ],
    activity: [
      { when: 'Feb 14', who: 'FDA',     what: 'CLEARED · K254481 · 87-day cycle' },
      { when: 'Feb 03', who: 'FDA',     what: 'Acknowledgement (ACK3) · K-number assigned' },
      { when: 'Feb 03', who: 'M. Webb', what: 'Transmitted via ESG · 76 MB · 37 files' },
    ],
  },

  /* ───────────────────────────────────────────────
     CV-330 · PMA · sign stage (eCTD-shape demo)
     ─────────────────────────────────────────────── */
  'sub-cv330-pma': {
    summary: 'CV-330 PMA Module 5 clinical bundle. CSR + ISS + ISE + risk-benefit synthesis. Five-signer review chain in flight, target June 30.',
    build: {
      shape: 'ectd-pma',
      label: 'PMA · Modules 1–5',
      sections: [
        { id: 'm1', label: 'Module 1 · Administrative', status: 'complete', files: 22 },
        { id: 'm2', label: 'Module 2 · Summaries',      status: 'review',   files: 14 },
        { id: 'm3', label: 'Module 3 · Manufacturing',  status: 'complete', files: 87 },
        { id: 'm4', label: 'Module 4 · Preclinical',    status: 'complete', files: 64 },
        { id: 'm5', label: 'Module 5 · Clinical',       status: 'review',   files: 125 },
      ],
      totalFiles: 312,
      totalBytes: '4.8 GB',
    },
    validation: {
      profile:  'eCTD Validator · FDA PMA profile · 2024-Q4',
      runAt:    '6 hours ago',
      errors:   0,
      warnings: 7,
      pass:     41,
      sections: [
        { id: 'm2', label: 'M2 · Summaries', errs: 0, warns: 2, ok: 12 },
        { id: 'm5', label: 'M5 · Clinical',  errs: 0, warns: 5, ok: 18 },
      ],
    },
    signatures: {
      mode: '21 CFR Part 11 · sequential, 5-signer chain',
      signers: [
        { who: 'A. Khoury', role: 'CMO',                 when: 'Today · 09:21', status: 'signed',  audit: 'AUD-9301' },
        { who: 'R. Nair',   role: 'Clinical Lead',       when: 'Today · 11:04', status: 'signed',  audit: 'AUD-9304' },
        { who: 'M. Webb',   role: 'Program Lead',        when: null,            status: 'pending', audit: '—' },
        { who: 'L. Tran',   role: 'RA Director',         when: null,            status: 'queued',  audit: '—' },
        { who: 'C. Diaz',   role: 'CEO · official sig',  when: null,            status: 'queued',  audit: '—' },
      ],
    },
    package:  { shape: 'eCTD ZIP', filename: 'CV-330_PMA_M5_eCTD.zip', size: '4.8 GB', checksum: 'pending', contents: [] },
    transmit: { gatewayLabel: 'FDA ESG · WebTrader', mode: 'AS2 · ESG production', to: 'CDRH OHT2 · Cardiac', readyToSend: false },
    receipt:  { shape: 'esg', coreId: null, ack1: null, ack2: null, ack3: null },
    aic: [],
    activity: [
      { when: '11:04',  who: 'R. Nair',           what: 'E-signature · Clinical Lead · AUD-9304' },
      { when: '09:21',  who: 'A. Khoury',         what: 'E-signature · CMO · AUD-9301' },
      { when: '6h ago', who: 'Validation Center', what: 'eCTD validator · 7 warns (M2/M5) · 0 err · 41 pass' },
    ],
  },

  /* ───────────────────────────────────────────────
     IV-415 · CER · NB bundle (EUDAMED-shape demo)
     ─────────────────────────────────────────────── */
  'sub-iv415-cer': {
    summary: 'IV-415 Companion Diagnostic CER under EU MDR Article 61. Notified Body 0123 (TÜV) bundle plus EUDAMED actor + UDI-DI registration. In build.',
    build: {
      shape: 'cer',
      label: 'CER + EUDAMED · 8 sections',
      sections: [
        { id: 's1', label: '§1 Scope and device description', status: 'complete', files: 4 },
        { id: 's2', label: '§2 State-of-the-art analysis',    status: 'complete', files: 8 },
        { id: 's3', label: '§3 Clinical data summary',        status: 'draft',    files: 12 },
        { id: 's4', label: '§4 Safety and risk-benefit',      status: 'review',   files: 7 },
        { id: 's5', label: '§5 PMS plan (Annex III)',         status: 'draft',    files: 5 },
        { id: 's6', label: '§6 Conclusion',                   status: 'empty',    files: 0 },
        { id: 'eu', label: 'EUDAMED actor file',              status: 'review',   files: 11 },
        { id: 'ud', label: 'UDI-DI registration',             status: 'complete', files: 5 },
      ],
      totalFiles: 52,
      totalBytes: '88 MB',
    },
    validation: {
      profile:  'EUDAMED Validator · MDR 2017/745 · Annex I + Article 61',
      runAt:    '3 hours ago',
      errors:   0,
      warnings: 3,
      pass:     9,
      sections: [
        { id: 'gspr',  label: 'GSPR Annex I',         errs: 0, warns: 1, ok: 21 },
        { id: 'art61', label: 'Article 61 evidence',  errs: 0, warns: 2, ok: 6 },
      ],
    },
    signatures: {
      mode: 'EU MDR · QPRC + RA + Notified Body',
      signers: [
        { who: 'A. Müller',  role: 'Clinical Lead',     when: null, status: 'queued', audit: '—' },
        { who: 'L. Tran',    role: 'RA Director',       when: null, status: 'queued', audit: '—' },
        { who: 'R. Hofmann', role: 'PRRC (Article 15)', when: null, status: 'queued', audit: '—' },
      ],
    },
    package:  { shape: 'EUDAMED XML + NB ZIP', filename: 'IV-415_CER_NB0123.zip', size: '88 MB', checksum: 'pending', contents: [] },
    transmit: { gatewayLabel: 'EUDAMED · EU Commission', mode: 'EUDAMED API + NB direct', to: 'NB 0123 · TÜV SÜD', readyToSend: false },
    receipt:  { shape: 'eudamed', actorId: null, udiDi: null, srn: null, auditId: null },
    aic: [],
    activity: [
      { when: '3h ago',    who: 'A. Müller',         what: 'FAERS signal export attached to §4' },
      { when: 'Yesterday', who: 'AnA · Opus 4.5',    what: 'Article 61 §3 · draft v2 generated from literature' },
    ],
  },

  /* ───────────────────────────────────────────────
     MDB-521 · IND · biotech preview (eCTD-shape, ESG)
     ─────────────────────────────────────────────── */
  'sub-mdb521-ind': {
    summary: 'MDB-521 anti-CD19 CAR-T initial IND filing. eCTD M1–M5, FDA ESG submission. Validation complete with 12 warnings, awaiting clinical-lead and CMO signatures.',
    preview: true,
    build: {
      shape: 'ectd',
      label: 'IND · Modules 1–5',
      sections: [
        { id: 'm1', label: 'Module 1 · Administrative',    status: 'complete', files: 38 },
        { id: 'm2', label: 'Module 2 · Summaries',         status: 'complete', files: 28 },
        { id: 'm3', label: 'Module 3 · CMC',               status: 'review',   files: 412 },
        { id: 'm4', label: 'Module 4 · Pharm/Tox',         status: 'complete', files: 247 },
        { id: 'm5', label: 'Module 5 · Clinical Protocol', status: 'review',   files: 1117 },
      ],
      totalFiles: 1842,
      totalBytes: '38.4 GB',
    },
    validation: {
      profile:  'eCTD Validator · FDA IND profile · 2024-Q4',
      runAt:    '1 day ago',
      errors:   0,
      warnings: 12,
      pass:     187,
      sections: [
        { id: 'm3', label: 'M3 · CMC',      errs: 0, warns: 8, ok: 64 },
        { id: 'm5', label: 'M5 · Protocol', errs: 0, warns: 4, ok: 22 },
      ],
    },
    signatures: {
      mode: '21 CFR Part 11 · 4-signer chain',
      signers: [
        { who: '—', role: 'Clinical Lead', when: null, status: 'queued', audit: '—' },
        { who: '—', role: 'CMC Lead',      when: null, status: 'queued', audit: '—' },
        { who: '—', role: 'CMO',           when: null, status: 'queued', audit: '—' },
        { who: '—', role: 'Sponsor',       when: null, status: 'queued', audit: '—' },
      ],
    },
    package:  { shape: 'eCTD ZIP', filename: 'MDB-521_IND_initial.zip', size: '38.4 GB', checksum: 'pending', contents: [] },
    transmit: { gatewayLabel: 'FDA ESG · WebTrader', mode: 'AS2 · ESG production', to: 'CDER · OND', readyToSend: false },
    receipt:  { shape: 'esg', coreId: null, ack1: null, ack2: null, ack3: null },
    aic: [],
    activity: [
      { when: '1d ago', who: 'Validation Center', what: 'eCTD validator · 12 warns (M3 + M5) · 0 err · 187 pass' },
    ],
  },

  /* ───────────────────────────────────────────────
     PX-118 · MAA · pharma preview (CESP-shape demo)
     ─────────────────────────────────────────────── */
  'sub-px118-maa': {
    summary: 'PX-118 JAK1-selective MAA · centralised procedure Day-180 List of Outstanding Issues response. CESP delivery, target 8 days.',
    preview: true,
    build: {
      shape: 'ectd',
      label: 'MAA · Day-180 response (M1, M2, M5)',
      sections: [
        { id: 'm1', label: 'M1 · EU regional',         status: 'complete', files: 41 },
        { id: 'm2', label: 'M2 · Updated summaries',   status: 'review',   files: 18 },
        { id: 'm5', label: 'M5 · Additional analyses', status: 'review',   files: 423 },
      ],
      totalFiles: 482,
      totalBytes: '7.1 GB',
    },
    validation: {
      profile:  'EU eCTD Validator · MAA · v4.0',
      runAt:    '2 days ago',
      errors:   0,
      warnings: 3,
      pass:     64,
      sections: [],
    },
    signatures: {
      mode: 'EU MAH · QPPV + RA',
      signers: [
        { who: '—', role: 'QPPV',        when: null, status: 'queued', audit: '—' },
        { who: '—', role: 'RA Director', when: null, status: 'queued', audit: '—' },
      ],
    },
    package:  { shape: 'EU eCTD · CESP delivery', filename: 'PX-118_MAA_Day180.zip', size: '7.1 GB', checksum: 'pending', contents: [] },
    transmit: { gatewayLabel: 'EMA CESP', mode: 'CESP delivery · EMA gateway', to: 'EMA · CHMP rapporteur', readyToSend: false },
    receipt:  { shape: 'cesp', deliveryId: null, validation: null, notification: null },
    aic: [],
    activity: [
      { when: '2d ago', who: 'Validation Center', what: 'EU eCTD · 3 warns · 0 err · 64 pass' },
    ],
  },
};

/* ─── Lookup helpers — convenience accessors over the type registries.
   Saves consumers from re-deriving the same `Array.find` over and over. */

const SUBMISSION_TYPE_BY_ID = new Map<SubmissionType, SubmissionTypeDef>(
  SUBMISSION_TYPES.map((t) => [t.id, t]),
);
const SUBMISSION_GATEWAY_BY_ID = new Map<SubmissionGateway, SubmissionGatewayDef>(
  SUBMISSION_GATEWAYS.map((g) => [g.id, g]),
);

export function getSubmissionType(id: SubmissionType): SubmissionTypeDef | undefined {
  return SUBMISSION_TYPE_BY_ID.get(id);
}

export function getSubmissionGateway(id: SubmissionGateway): SubmissionGatewayDef | undefined {
  return SUBMISSION_GATEWAY_BY_ID.get(id);
}

export function getSubmissionDetail(id: string): SubmissionDetail | undefined {
  return SUBMISSIONS_DETAIL[id];
}
