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

/* SC_SEQUENCES_RAW / SC_FINDINGS_RAW / SC_SHADOW_RAW / SC_CROSSREGION_RAW are
   deleted (2026-09-25, honest-state lens). They were the kit's sample sequences,
   findings, shadow-review notes and cross-region rows; nothing in client/src
   imported them. Same policy as the note above: a dead sample programme is one
   import away from being live again, so it goes rather than sits. The Sc*
   interfaces stay — they are the row shapes the live surfaces type against. */

export const SC_SEQ_STATUS: Record<string, ToneMap> = SC_SEQ_STATUS_RAW;
export const SC_TRANSITIONS: Record<string, string[]> = SC_TRANSITIONS_RAW;
export const SC_LIFECYCLE_OPS: Record<string, ToneMap> = SC_LIFECYCLE_OPS_RAW;
export const SC_FIND_SEV: Record<string, ToneMap> = SC_FIND_SEV_RAW;
export const SC_FIND_STATUS: Record<string, ToneMap> = SC_FIND_STATUS_RAW;
