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

/* ─── Pathway sub-tab data contract (consumed by surfaces/pathway/*) ────────
 *
 * Ported from `ui_kits/mdx/data-pathway-tabs.jsx`. These back the
 * Audit / Correspondence / Approvals / Files sub-tabs and the DossierDrawer.
 * Shapes are intentionally permissive — the kit treats these rows loosely and
 * the in-memory dossier store synthesises live rows of the same shape. */

/** Pathway keys that carry a full sub-tab bundle. */
export type PathwayKey = 'k510' | 'pma' | 'cer' | 'ivd';

/** A single audit-trail row. Seed rows carry a hash/prev chain; live rows
 *  synthesised by the dossier store carry `live: true`. */
export interface AuditEvent {
  id: string;
  when: string;
  kind: AuditKind;
  actor: string;
  role?: string;
  target: string;
  target_id?: string | number;
  ip?: string;
  sig?: string;
  signature?: string;
  signed?: boolean;
  body?: string;
  diff?: string;
  file?: string;
  reason?: string;
  hash?: string;
  prev?: string;
  /** Real per-row integrity for live rows: 'sealed' (chain link + HMAC seal),
   *  'chained', or 'unchained' — a row that reached the audit table outside the
   *  chain writer and therefore is not tamper-evident. Absent on fixtures,
   *  which carry a synthesized chain and make no integrity claim. */
  chain?: 'sealed' | 'chained' | 'unchained';
  /** False when the chain predecessor exists but is not this tenant's to show
   *  (the audit_logs chain is global across tenants). Distinguishes "no
   *  predecessor available" from "no predecessor". */
  prevAvailable?: boolean;
  live?: boolean;
}

export interface CorrespondenceRef {
  section: string | number;
  label: string;
}

export interface CorrespondenceTriage {
  ana: string;
  priority: 'high' | 'med' | 'low';
  owner: string;
  tasks: number;
}

/** An agency / notified-body letter or query. */
export interface Correspondence {
  id: string;
  kind: string;
  channel: string;
  from: string;
  received: string;
  due?: string;
  status: 'open' | 'in_review' | 'closed';
  ai?: boolean;
  subject: string;
  summary: string;
  refs: CorrespondenceRef[];
  triage?: CorrespondenceTriage;
  to?: string;
  body?: string;
  preview?: string;
}

/** A workflow task awaiting (or carrying) a Part 11 e-signature. */
export interface Approval {
  id: string;
  stage: 'review' | 'qa' | 'medical' | 'regulatory';
  target: string;
  target_id?: string | number;
  target_kind?: string;
  requested: string;
  requested_by: string;
  signer: string;
  role: string;
  status: 'pending' | 'signed';
  due?: string;
  signed_at?: string;
  meaning?: string;
  /**
   * Document and revision this approval covers. Both are required to
   * apply a 21 CFR Part 11 signature (§11.50(a) — the signature must
   * identify what was signed), so the approval card disables signing
   * when either is missing rather than pinning a signature to a guessed
   * revision.
   */
  document_id?: number;
  version_id?: number;
  /** workflow_approvals row id, for advancing the workflow after signing. */
  approval_id?: number;
  /** Loose fields the Files-tree approval preview reads opportunistically. */
  label?: string;
  requestor?: string;
  signers?: string[];
  refs?: CorrespondenceRef[];
}

/**
 * The sample content a pathway's sub-tabs may fall back to in explicit sample
 * mode. Correspondence only, deliberately: the `audit` and `approvals` bundles
 * were a synthesized Part 11 hash-chain and a set of fabricated signed
 * approvals, and they are gone (see data/pathwayTabs.ts). Their absence from
 * this type is the enforcement — `sample={fixtures.audit}` no longer compiles.
 */
export interface PathwayTabsBundle {
  correspondence: Correspondence[];
  corrLabel: string;
}

export type PathwayTabsData = Record<PathwayKey, PathwayTabsBundle>;

/** A dossier section the drawer / panes can route to. */
export interface SectionTarget {
  id: string | number;
  label: string;
}

/* ─── In-memory dossier store node shapes (store/dossierStore.ts) ─────────── */

export interface DossierAttachment {
  name: string;
  size: number;
  kind: string;
  who: string;
  when: string;
  source?: string;
  live?: boolean;
}

export interface DossierSectionMeta {
  sectionId?: string | number;
  label?: string;
  status?: string;
  version?: number;
  lastEdited?: string;
  lastEditor?: string;
  signers?: string[];
  blocker?: boolean | null;
}

/** A node in the in-memory file system. Files carry a body or meta; dirs
 *  (attachment folders) carry a files list. */
export interface DossierNode {
  kind: 'file' | 'dir';
  body?: string;
  size?: number;
  when?: string;
  who?: string;
  meta?: DossierSectionMeta;
  files?: DossierAttachment[];
}

export interface DossierDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  node?: DossierNode;
}
