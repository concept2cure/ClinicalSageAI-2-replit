/**
 * MDX type barrel.
 *
 * Re-exports the canonical interfaces declared inline in `data/*.ts`,
 * plus the closed-enum types that are consumed today by the kit data
 * registries (`data/submissions.ts`, `data/pathwayTabs.ts`).
 *
 * Anything else from the kit's contract — full Submission row shape,
 * AuditEvent shape, Correspondence/CorrespondenceDetail, Approval,
 * DossierSectionView, etc. — lands here in the same PR as the pane
 * that consumes it. We don't pre-declare types ahead of consumers
 * (it leaves dead code in the bundle and drifts from the kit before
 * anyone notices).
 */

export type {
  Program,
  ProgramStatus,
  ProgramPathway,
  DueTone,
} from './data/programs';

export type {
  K510Stage,
  Predicate,
  PredicateStatus,
  SeRow,
  EstarRow,
  EstarStatus,
} from './data/k510';

export type { AnaMode } from './data/nav';

/* ─── Closed-enum types consumed by data/submissions.ts ─────────────────── */

/** Top-level workstream filter pinned at the Submission Center topbar. */
export type SubmissionWorkstream = 'mdx' | 'biotech' | 'pharma' | 'cro';

/** Closed list of submission types — see `SUBMISSION_TYPES` in data/submissions.ts. */
export type SubmissionType =
  | '510k'
  | 'denovo'
  | 'pma'
  | 'pma-s'
  | 'cer'
  | 'eudamed'
  | 'ind'
  | 'bla'
  | 'ind-amend'
  | 'nda'
  | 'anda'
  | 'maa'
  | 'jnda'
  | 'ide'
  | 'ctd-cta';

/** Build-outline shape selected by the submission type. */
export type SubmissionBuildShape =
  | 'estar'
  | 'ectd'
  | 'ectd-pma'
  | 'cer'
  | 'eudamed'
  | 'ide';

export interface SubmissionTypeDef {
  id: SubmissionType;
  workstream: SubmissionWorkstream;
  label: string;
  shape: SubmissionBuildShape;
  desc: string;
}

/** Closed list of agency gateways — see `SUBMISSION_GATEWAYS` in data/submissions.ts.
 *  v1 ships full receipt detail for `fda-esg`, `ema-cesp`, `eu-eudamed`, `hc-cesg`. */
export type SubmissionGateway =
  | 'fda-esg'
  | 'ema-cesp'
  | 'eu-eudamed'
  | 'hc-cesg'
  | 'pmda-gw'
  | 'mhra-gw'
  | 'nmpa-portal'
  | 'mfds-portal'
  | 'tga-trams'
  | 'anvisa-peticionamento'
  | 'who-prequal';

/** Receipt shape selected by the gateway. */
export type SubmissionReceiptShape =
  | 'esg'
  | 'cesp'
  | 'eudamed'
  | 'cesg'
  | 'pmda'
  | 'mhra'
  | 'nmpa'
  | 'mfds'
  | 'tga'
  | 'anvisa'
  | 'who';

export interface SubmissionGatewayDef {
  id: SubmissionGateway;
  agency: string;
  region: string;
  label: string;
  shape: SubmissionReceiptShape;
  v1: boolean;
  desc: string;
  receiptFields?: string[];
  accepts: SubmissionType[];
}

/** Universal 7-stage submission pipeline. */
export type SubmissionStage =
  | 'build'
  | 'validate'
  | 'sign'
  | 'package'
  | 'transmit'
  | 'receipt'
  | 'aic';

/* ─── Closed-enum types consumed by data/pathwayTabs.ts ─────────────────── */

export type AuditKind =
  | 'section.edit'
  | 'section.lock'
  | 'section.unlock'
  | 'review.start'
  | 'review.complete'
  | 'sign'
  | 'comment'
  | 'attach'
  | 'export'
  | 'access';

export type AuditTone = 'neutral' | 'warn' | 'success' | 'accent';

export interface AuditKindMeta {
  label: string;
  tone: AuditTone;
}
