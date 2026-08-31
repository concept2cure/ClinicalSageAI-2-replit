/**
 * Submission Center FIXTURES — ported verbatim from the kit's
 * submission-center.jsx (design_handoff_c2c_v2_ui_replacement).
 *
 * The WORKSPACE nav is driven by the real contract SUBMISSION_WORKSPACES
 * (@shared/types/submission-ui) in the component — not from here. These are
 * the status/enum display maps (mirroring shared/types/submission-constants)
 * and the sample program data (bound to BX-204), rendered ONLY behind the
 * SampleTag pill; live GET /api/submissions overrides the portfolio list.
 *
 * GENERATED from the kit surface — edit the kit first, then re-port.
 */

export interface Choice { v: string; l: string }
export interface ToneMap { l: string; t: string }
export interface ScSequence { seq: string; type: string; status: string; region: string; leaves: number; updated: string }
export interface ScLeaf { path: string; title: string; op: string; module: string }
export interface ScFinding { id: string; rule: string; severity: string; status: string; loc: string; msg: string }
export interface ScShadow { id: string; severity: string; msg: string; ref: string }
export interface ScCrossRegion { region: string; item: string; status: string; note: string }

/** One spelling per region, matching the server's primaryRegion enum — the
 *  store already writes 'eu' and 'jp' (never their agency aliases), so those
 *  aliases are deliberately not offered as second spellings of the same
 *  market. Extended past fda/eu/jp so a non-US submission can be OPENED, not
 *  only displayed — the global-markets half of the product's mandate. */
export const SC_REGIONS = [
  { v: 'fda', l: 'FDA (US)' },
  { v: 'eu', l: 'EU (EMA)' },
  { v: 'jp', l: 'PMDA (Japan)' },
  { v: 'ca', l: 'Health Canada' },
  { v: 'uk', l: 'MHRA (UK)' },
  { v: 'ch', l: 'Swissmedic' },
  { v: 'au', l: 'TGA (Australia)' },
  { v: 'cn', l: 'NMPA (China)' },
  { v: 'br', l: 'ANVISA (Brazil)' },
  { v: 'in', l: 'CDSCO (India)' },
  { v: 'kr', l: 'MFDS (Korea)' },
  { v: 'sg', l: 'HSA (Singapore)' },
];

export const SC_APPTYPES = [
  { v: 'ind', l: 'IND' },
  { v: 'nda', l: 'NDA' },
  { v: 'bla', l: 'BLA' },
  { v: 'anda', l: 'ANDA' },
  { v: 'maa', l: 'MAA' },
  { v: '510k', l: '510(k)' },
  { v: 'de_novo', l: 'De Novo' },
  { v: 'pma', l: 'PMA' },
  { v: 'cta', l: 'CTA' },
];

export const SC_PATHWAYS = [
  { v: 'ectd_v322', l: 'eCTD v3.2.2' },
  { v: 'ectd_v40', l: 'eCTD v4.0 (RPS)' },
  { v: 'estar', l: 'eSTAR' },
  { v: 'mdr', l: 'EU MDR tech doc' },
  { v: 'ivdr', l: 'EU IVDR tech doc' },
  { v: 'ctis', l: 'CTIS' },
];

const SC_SEQ_STATUS_RAW = {
  draft: { l: 'Draft', t: 'idle' },
  assembling: { l: 'Assembling', t: 'ai' },
  validated: { l: 'Validated', t: 'ok' },
  frozen: { l: 'Frozen', t: 'ai' },
  dispatched: { l: 'Dispatched', t: 'ok' },
};

const SC_TRANSITIONS_RAW = {
  draft: ['assembling'],
  assembling: ['validated', 'draft'],
  validated: ['frozen', 'assembling'],
  frozen: ['dispatched'],
  dispatched: [],
};

const SC_LIFECYCLE_OPS_RAW = {
  new: { l: 'New', t: 'ok' },
  replace: { l: 'Replace', t: 'ai' },
  append: { l: 'Append', t: 'idle' },
  delete: { l: 'Delete', t: 'warn' },
};

const SC_FIND_SEV_RAW = {
  critical: { l: 'Critical', t: 'warn' },
  major: { l: 'Major', t: 'warn' },
  minor: { l: 'Minor', t: 'ai' },
  info: { l: 'Info', t: 'idle' },
};

const SC_FIND_STATUS_RAW = {
  open: { l: 'Open', t: 'warn' },
  accepted: { l: 'Accepted', t: 'idle' },
  fixed: { l: 'Fixed', t: 'ok' },
  waived: { l: 'Waived', t: 'idle' },
};

export const SC_LENSES = [
  { v: 'fda_filing', l: 'FDA filing review' },
  { v: 'ema_d120', l: 'EMA Day-120 LoQ' },
  { v: 'pmda', l: 'PMDA review' },
  { v: 'nb_mdr', l: 'Notified Body (MDR)' },
  { v: 'nb_ivdr', l: 'Notified Body (IVDR)' },
];

/* SC_SUBMISSIONS_RAW / SC_SUBMISSIONS are deleted.
   They were the kit's sample portfolio — 'BX-204' (NDA 212345, MAA) and
   'BX-301' (BLA, FDA) — and they were the last thing in the client still
   carrying the BX-301 identity as data. The Submission Center was migrated to
   GET /api/submissions some time ago and stopped importing them; nothing else
   ever did, including the tests. A dead sample programme is one import away from
   being live again, so it goes rather than sits. */

export const SC_SEQUENCES_RAW = [
  {
    seq: '0000',
    type: 'original',
    status: 'validated',
    region: 'fda',
    leaves: 342,
    updated: '2 days ago',
  },
  {
    seq: '0001',
    type: 'amendment',
    status: 'assembling',
    region: 'fda',
    leaves: 18,
    updated: '4 hr ago',
  },
];

export const SC_LEAVES = [
  { path: 'm1/us/1.1', title: 'Form FDA 356h', op: 'new', module: '1' },
  { path: 'm2/2.5', title: 'Clinical Overview', op: 'replace', module: '2' },
  { path: 'm3/3.2.s.4.4', title: 'Comparability protocol', op: 'new', module: '3' },
  { path: 'm5/5.3.5.1', title: 'ISS — integrated safety', op: 'append', module: '5' },
  { path: 'm1/us/1.14.1', title: 'Draft labeling (superseded)', op: 'delete', module: '1' },
];

export const SC_FINDINGS_RAW = [
  {
    id: 'V-01',
    rule: 'define.xml — ADaM ADTTE dataset',
    severity: 'critical',
    status: 'open',
    loc: 'm5/datasets/adam',
    msg: 'Referenced dataset not present in the sequence; blocks technical validation.',
  },
  {
    id: 'V-02',
    rule: 'STF study-tagging — CSR-201',
    severity: 'major',
    status: 'open',
    loc: 'm5/5.3.5.1',
    msg: 'Study tagging file missing a leaf reference for the pivotal CSR.',
  },
  {
    id: 'V-03',
    rule: 'Hyperlink integrity',
    severity: 'minor',
    status: 'fixed',
    loc: 'm2/2.5',
    msg: '2 of 214 cross-document links unresolved (now repaired).',
  },
  {
    id: 'V-04',
    rule: 'PDF version / fonts embedded',
    severity: 'info',
    status: 'accepted',
    loc: 'm3',
    msg: '3 PDFs use PDF 1.7; acceptable for FDA eCTD.',
  },
];

export const SC_SHADOW_RAW = [
  {
    id: 'S-01',
    severity: 'critical',
    msg: '§2.5 efficacy claim (ORR 38.6%) not reconciled with the locked CSR-201 dataset — a filing reviewer would issue an IR.',
    ref: 'm2/2.5',
  },
  {
    id: 'S-02',
    severity: 'major',
    msg: 'Pediatric plan rationale for the 12–17 exclusion is thin vs. recent oncology precedent.',
    ref: 'm1/1.9',
  },
  {
    id: 'S-03',
    severity: 'minor',
    msg: 'Nonclinical genotoxicity bridge would benefit from an explicit weight-of-evidence paragraph.',
    ref: 'm2/2.6.5',
  },
];

export const SC_CROSSREGION_RAW = [
  {
    region: 'eu',
    item: 'Module 1 regional — EU application form + SPC/PL',
    status: 'gap',
    note: 'FDA 356h has no EU equivalent; SmPC/PL not started.',
  },
  {
    region: 'eu',
    item: 'GMP certificates / manufacturer authorisations',
    status: 'gap',
    note: 'EU requires QP declaration; not in the FDA sequence.',
  },
  {
    region: 'jp',
    item: 'Japanese translations (Module 1 + labeling)',
    status: 'gap',
    note: 'Not started; PMDA requires Japanese.',
  },
  {
    region: 'eu',
    item: 'Module 2–5 scientific content',
    status: 'reuse',
    note: 'Reusable from the FDA sequence with regional wrappers.',
  },
];
export const SC_SEQUENCES: ScSequence[] = SC_SEQUENCES_RAW;
export const SC_FINDINGS: ScFinding[] = SC_FINDINGS_RAW;
export const SC_SHADOW: ScShadow[] = SC_SHADOW_RAW;
export const SC_CROSSREGION: ScCrossRegion[] = SC_CROSSREGION_RAW;

export const SC_SEQ_STATUS: Record<string, ToneMap> = SC_SEQ_STATUS_RAW;
export const SC_TRANSITIONS: Record<string, string[]> = SC_TRANSITIONS_RAW;
export const SC_LIFECYCLE_OPS: Record<string, ToneMap> = SC_LIFECYCLE_OPS_RAW;
export const SC_FIND_SEV: Record<string, ToneMap> = SC_FIND_SEV_RAW;
export const SC_FIND_STATUS: Record<string, ToneMap> = SC_FIND_STATUS_RAW;
