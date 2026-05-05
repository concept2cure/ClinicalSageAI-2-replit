/**
 * Submission Center closed enums + type registries.
 * Ported from `design-system/ui_kits/mdx/data-submissions.jsx`.
 *
 * @kit-registry-no-consumer-yet
 * Remove the marker above when the kit's Submission Center pane lands and
 * imports SUBMISSION_TYPES / SUBMISSION_GATEWAYS / SUBMISSION_PIPELINE_V2.
 * Until then this file is exempt from the orphan-import check
 * (scripts/check-mdx-orphans.sh) on the grounds that closed-enum registries
 * are real product taxonomy, not dead seed data.
 *
 * The kit's data fixture also includes hand-crafted demo rows
 * (SUBMISSIONS_V2, SUBMISSIONS_DETAIL). Those are NOT ported here —
 * paying clients consume real submissions from /api/submission-ops/*
 * via @tanstack/react-query hooks (see useSubmissionOps.ts). When the
 * kit's Submission Center pane lands, build a kit-shape selector
 * (Submission, SubmissionDetail in ../types) over the existing react-query
 * hooks; do not re-introduce demo rows in the bundle.
 *
 * Kept in this module: closed enums + type registries that are real
 * product taxonomy and consumed by selectors / displays / dropdowns:
 *   - SUBMISSION_WORKSTREAMS  — top-level filter chips
 *   - SUBMISSION_TYPES        — closed list of submission type definitions
 *   - SUBMISSION_GATEWAYS     — closed list of agency gateway definitions
 *   - SUBMISSION_PIPELINE_V2  — universal 7-stage pipeline labels
 */

import type {
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

/* ─── Lookup helpers — convenience accessors over the registries.
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
