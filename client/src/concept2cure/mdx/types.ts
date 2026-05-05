/**
 * MDX type barrel.
 *
 * Re-exports the canonical interfaces already declared inline in `data/*.ts`,
 * plus the shapes pulled verbatim from the design-system kit drop on
 * 2026-05-04 (`data-submissions.jsx`, `data-pathway-tabs.jsx`,
 * `data-correspondence-detail.jsx`, `dossier-store.jsx` — all under
 * `design-system/ui_kits/mdx/`).
 *
 * Field names mirror the kit's data fixtures exactly. If you're tempted to
 * rename one, update the kit first.
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

/* ─── Submissions — `data-submissions.jsx` ──────────────────────────
   Three primitives compose into the Submission Center contract:
     1. SUBMISSION_TYPES      (closed enum, swappable build shape)
     2. SUBMISSION_GATEWAYS   (closed enum, swappable receipt shape)
     3. SUBMISSIONS_V2 + SUBMISSIONS_DETAIL (filings in flight)
   The 7-stage pipeline is universal; what swaps per type is the
   contents of each stage (build outline, validator profile, package
   format, gateway protocol, receipt fields, AIC log entries).
   ──────────────────────────────────────────────────────────────────── */

/** Top-level workstream filter. Pinned at the topbar in the Submission Center. */
export type SubmissionWorkstream = 'mdx' | 'biotech' | 'pharma' | 'cro';

/** Closed enum from `SUBMISSION_TYPES` in `data-submissions.jsx`. */
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

/** Closed enum from `SUBMISSION_GATEWAYS`. v1 ships full receipt detail
 *  for `fda-esg`, `ema-cesp`, `eu-eudamed`, `hc-cesg`; the rest render as
 *  available targets with a "Receipt format pending" placeholder. */
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

/** Universal 7-stage pipeline. */
export type SubmissionStage =
  | 'build'
  | 'validate'
  | 'sign'
  | 'package'
  | 'transmit'
  | 'receipt'
  | 'aic';

export type SubmissionStatus = 'active' | 'blocked' | 'complete';
export type SubmissionTone = '' | 'ok' | 'warn' | 'err';
export type SubmissionCoverState = 'draft' | 'review' | 'signed';

/** Row shape from `SUBMISSIONS_V2`. */
export interface Submission {
  id: string;
  workstream: SubmissionWorkstream;
  type: SubmissionType;
  gateway: SubmissionGateway;
  prog: string;          // program code, e.g. 'BX-204'
  progTitle: string;     // human-readable program title
  title: string;         // submission title
  stage: SubmissionStage;
  status: SubmissionStatus;
  targetAt: string;      // free-form target window — 'Q2 2026' | '14 days · 2026-05-15'
  sentAt: string | null;
  files: number;
  bytes: string;         // pre-formatted ('142 MB', '4.8 GB')
  gate: { errs: number; warns: number; ok: number };
  cover: SubmissionCoverState;
  esig: boolean;
  owner: string;
  tone: SubmissionTone;
  preview?: boolean;     // greyed-out cross-workstream rows
}

/** Build outline row — eSTAR section, eCTD module, CER section, etc. */
export interface SubmissionBuildSection {
  id: string | number;
  label: string;
  status: 'complete' | 'review' | 'draft' | 'na' | 'empty' | 'blocked';
  files: number;
}

export interface SubmissionBuild {
  shape: SubmissionBuildShape;
  label: string;
  sections: SubmissionBuildSection[];
  totalFiles: number;
  totalBytes: string;
}

export interface SubmissionValidationSection {
  id: string | number;
  label: string;
  errs: number;
  warns: number;
  ok: number;
  blocker?: string;
}

export interface SubmissionValidation {
  profile: string;
  runAt: string;
  errors: number;
  warnings: number;
  pass: number;
  sections: SubmissionValidationSection[];
}

export type SubmissionSignerStatus = 'queued' | 'pending' | 'signed' | 'rejected';

export interface SubmissionSigner {
  who: string;
  role: string;
  when: string | null;
  status: SubmissionSignerStatus;
  audit: string;          // audit id, '—' when not yet signed
}

export interface SubmissionSignatures {
  mode: string;
  signers: SubmissionSigner[];
}

export interface SubmissionPackageContent {
  name: string;
  bytes: string;
}

export interface SubmissionPackage {
  shape: string;
  filename: string;
  size: string;
  checksum: string;
  contents: SubmissionPackageContent[];
}

export interface SubmissionTransmit {
  gatewayLabel: string;
  mode: string;
  to: string;
  readyToSend: boolean;
  sentAt?: string;
  sentBy?: string;
}

/** ESG receipt — Core ID + ACK1/2/3. */
export interface SubmissionReceiptAck {
  received: string;
  status: 'received' | 'pending' | 'rejected';
  detail: string;
}

export interface SubmissionReceiptEsg {
  shape: 'esg';
  coreId: string | null;
  ack1: SubmissionReceiptAck | null;
  ack2: SubmissionReceiptAck | null;
  ack3: SubmissionReceiptAck | null;
  kNumber?: string;
  decision?: { date: string; outcome: string; cycleDays: number };
}

export interface SubmissionReceiptEudamed {
  shape: 'eudamed';
  actorId: string | null;
  udiDi: string | null;
  srn: string | null;
  auditId: string | null;
}

export type SubmissionReceipt =
  | SubmissionReceiptEsg
  | SubmissionReceiptEudamed
  | { shape: SubmissionReceiptShape; [key: string]: unknown };

/** AIC chain — hash-linked immutable record. Same schema for every
 *  submission regardless of agency or workstream. The real chain runs
 *  sha-256(prev_hash || event_json); the kit truncates to 6 chars for
 *  inline display. */
export interface SubmissionAicEntry {
  seq: number;
  when: string;
  actor: string;
  event: string;
  hash: string;
  prev: string;
}

export interface SubmissionActivity {
  when: string;
  who: string;
  what: string;
}

export interface SubmissionDetail {
  summary: string;
  preview?: boolean;
  build: SubmissionBuild;
  validation: SubmissionValidation;
  signatures: SubmissionSignatures;
  package: SubmissionPackage;
  transmit: SubmissionTransmit;
  receipt: SubmissionReceipt;
  aic: SubmissionAicEntry[];
  activity: SubmissionActivity[];
}

/* ─── Audit trail — `data-pathway-tabs.jsx` ─────────────────────────
   21 CFR Part 11 §11.10(e). The hash chain runs prev → event → hash;
   the kit's chain helper synthesizes 8-char prefixes for visual
   verification. Real backend hashes are full sha-256.
   ──────────────────────────────────────────────────────────────────── */

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

/** Row from K510_AUDIT / PMA_AUDIT / CER_AUDIT. */
export interface AuditEvent {
  id: string;
  when: string;                    // ISO 8601
  kind: AuditKind;
  actor: string;
  role: string;
  target: string;                  // human-readable target descriptor
  target_id?: string | number;
  ip: string;
  hash: string;                    // synthesized prefix in fixtures, full sha-256 from API
  prev: string;
  /* Optional payload fields — present per kind: */
  sig?: string;                    // 'sign'
  signed?: boolean;                // 'sign'
  body?: string;                   // 'comment'
  file?: string;                   // 'attach' / 'export'
  diff?: string;                   // 'section.edit' (e.g. '+412 / −38')
  reason?: string;                 // 'section.unlock'
  live?: boolean;                  // dossier-store sets this on synthetic events
}

/* ─── Correspondence — `data-pathway-tabs.jsx` + `data-correspondence-detail.jsx`
   Pathway-specific kinds:
     510(k):  RTA · AI-Hold · Interactive Review
     PMA:     Day-100 · Major Deficiency · Approvable Letter
     CER:     NB Q&A · NB Major NC · NB Minor NC
   The detail map (`CORRESP_DETAIL`) attaches by row id and carries
   the full letter body, deficiency decomposition, and AnA-drafted
   response.
   ──────────────────────────────────────────────────────────────────── */

export type CorrespondenceStatus = 'open' | 'in_review' | 'closed';
export type CorrespondencePriority = 'low' | 'med' | 'high';

export interface CorrespondenceRef {
  section: number | string;
  label: string;
}

export interface CorrespondenceTriage {
  ana: string;
  priority: CorrespondencePriority;
  owner: string;
  tasks: number;
}

/** Row from K510_CORRESP / PMA_CORRESP / CER_CORRESP. */
export interface Correspondence {
  id: string;
  kind: string;                    // pathway-specific — see comment above
  channel: string;                 // 'CDRH eSTAR' | 'TEAM-NB portal' | …
  from: string;                    // 'CDRH' | 'TÜV SÜD' | …
  received: string;                // ISO 8601
  due: string;                     // YYYY-MM-DD
  status: CorrespondenceStatus;
  ai: boolean;                     // AnA auto-triaged
  subject: string;
  summary: string;
  refs: CorrespondenceRef[];
  triage: CorrespondenceTriage;
}

/* Detail (CORRESP_DETAIL[rowId]) — full agency letter, deficiency
   decomposition, and AnA-drafted response. */

export interface CorrespondenceLetterSignature {
  sign_off: string;
  name: string;
  title: string;
  cc?: string[];
}

export interface CorrespondenceLetter {
  from_name: string;
  from_title: string;
  from_office: string;
  ref: string;
  our_ref: string;
  dated: string;
  received_at: string;
  via: string;
  body: string[];
  signature: CorrespondenceLetterSignature;
}

export type DeficiencySeverity = 'major' | 'minor' | 'critical';

export interface CorrespondenceDeficiency {
  id: string;
  n: number;
  title: string;
  body: string;
  refs: CorrespondenceRef[];
  regs: { ref: string; title: string }[];
  severity: DeficiencySeverity;
  complete?: boolean;
}

export type DraftStatus = 'unstarted' | 'drafted' | 'in_review' | 'approved' | 'sent';

export interface DraftReviewer {
  role: string;
  name: string;
  status: 'queued' | 'pending' | 'signed' | 'rejected';
  signed_at?: string;
}

export interface DraftDeficiency {
  id: string;
  response: string;
  evidence?: string[];
  updates?: string[];
}

export interface CorrespondenceDraft {
  status: DraftStatus;
  generated_at: string;
  generated_by: 'AnA';
  intro: string;
  deficiencies: DraftDeficiency[];
  closing: string;
  reviewers: DraftReviewer[];
}

export interface CorrespondenceDetail {
  letter: CorrespondenceLetter;
  deficiencies: CorrespondenceDeficiency[];
  draft: CorrespondenceDraft;
}

/* ─── Approvals — `data-pathway-tabs.jsx` ───────────────────────────
   Workflow tasks awaiting Part 11 e-sign. Pathway-agnostic shape;
   each row references an artifact + the approval workflow stage.
   ──────────────────────────────────────────────────────────────────── */

export type ApprovalStage = 'review' | 'qa' | 'medical' | 'regulatory';
export type ApprovalStatus = 'pending' | 'queued' | 'signed' | 'rejected';
export type ApprovalTargetKind = 'Section' | 'Submission';

export interface Approval {
  id: string;
  stage: ApprovalStage;
  target: string;                  // human-readable target descriptor
  target_id?: string | number;
  target_kind: ApprovalTargetKind;
  requested: string;               // ISO 8601
  requested_by: string;
  signer: string;
  role: string;
  status: ApprovalStatus;
  signed_at?: string;
  due?: string;                    // YYYY-MM-DD
  meaning: string;                 // single-line explanation of what the sig means
}

/* ─── Pathway tabs bundle ──────────────────────────────────────────── */

export interface PathwayTabsBundle {
  audit: AuditEvent[];
  correspondence: Correspondence[];
  approvals: Approval[];
  corrLabel: string;               // e.g. 'RTA / AI-Hold' | 'Day-100' | 'NB Q&A'
}

/* ─── Dossier store — `dossier-store.jsx` ───────────────────────────
   In-memory filesystem backing every dossier surface. Real backend
   storage uses the same path scheme; the hooks (`useFileNode`,
   `useSection`) are the read API for components.

   Path scheme:
     Files/Dossier/<program-label>/<sectionFolder>/body.md
     Files/Dossier/<program-label>/<sectionFolder>/meta.json
     Files/Dossier/<program-label>/<sectionFolder>/attachments
   ──────────────────────────────────────────────────────────────────── */

export type AttachmentKind = 'pdf' | 'doc' | 'csv' | 'xls' | 'img' | 'code' | 'file';

export interface AttachmentFile {
  name: string;
  size: number;
  kind: AttachmentKind | string;
  who: string;
  when: string;                    // ISO 8601
  source: string;
  live?: boolean;
}

export interface DossierBodyFile {
  kind: 'file';
  body: string;                    // markdown
  size: number;
  when: string;
  who: string;
}

export interface DossierMetaFile {
  kind: 'file';
  meta: {
    sectionId: string | number;
    label: string;
    status: string;
    version: number;
    lastEdited: string;
    lastEditor: string;
    signers?: string[];
    blocker?: string | null;
    [key: string]: unknown;
  };
}

export interface DossierAttachmentDir {
  kind: 'dir';
  files: AttachmentFile[];
}

export type DossierEntry = DossierBodyFile | DossierMetaFile | DossierAttachmentDir;

export interface DossierSectionView {
  body: string;
  meta: DossierMetaFile['meta'];
  attachments: AttachmentFile[];
  folder: string;
}
