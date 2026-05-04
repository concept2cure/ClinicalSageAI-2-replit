/**
 * MDX type barrel.
 *
 * Re-exports the canonical interfaces already declared inline in `data/*.ts`,
 * and forward-declares the new shapes referenced in
 * `PROJECT_PLAN_PHASE_2.md` / `MDX_BETA_ANSWERS.md` so v2 surfaces can compile
 * against the contract before the kit files (`data-pathway-tabs.jsx`,
 * `data-correspondence-detail.jsx`, `data-submissions.jsx`,
 * `dossier-store.jsx`) sync into `design-system/ui_kits/mdx/`.
 *
 * Every forward-declared interface is marked TBD. Replace with the kit's
 * actual shape on sync.
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

/* ─── Forward declarations ─────────────────────────────────────────
   TBD — confirm with design-system Claude when the corresponding
   kit file ships. Field names mirror the strategic message
   (workstream + type + gateway + state machine; AIC hash chain;
   pathway sub-tabs).
   ────────────────────────────────────────────────────────────────── */

/** TBD — `data-submissions.jsx`. */
export type SubmissionWorkstream = 'k510' | 'pma' | 'cer';

/** TBD — `data-submissions.jsx`. */
export type SubmissionType = string;

/** TBD — `data-submissions.jsx`. Real today: `fda-esg`. Shaped: `cesp` | `eudamed` | `cesg`. Roadmap: 7 more. */
export type SubmissionGateway =
  | 'fda-esg'
  | 'cesp'
  | 'eudamed'
  | 'cesg'
  | string;

/** TBD — `data-submissions.jsx`. The 7-stage universal pipeline. */
export type SubmissionStage =
  | 'build'
  | 'validate'
  | 'sign'
  | 'package'
  | 'transmit'
  | 'receipt'
  | 'aic';

/** TBD — `data-submissions.jsx`. */
export interface Submission {
  id: string;
  programId: string;
  workstream: SubmissionWorkstream;
  type: SubmissionType;
  gateway: SubmissionGateway;
  stage: SubmissionStage;
  createdAt: string;
  updatedAt: string;
}

/** TBD — `data-pathway-tabs.jsx`. AIC chain entry: prev_hash → event_json → sha-256(prev || event). */
export interface AuditEvent {
  id: string;
  prevHash: string | null;
  hash: string;
  actor: string;
  action: string;
  target: string;
  reason?: string;
  payload: Record<string, unknown>;
  at: string;
}

/** TBD — `data-correspondence-detail.jsx`. */
export interface Correspondence {
  id: string;
  direction: 'inbound' | 'outbound';
  agency: string;
  subject: string;
  receivedAt: string;
  body?: string;
  attachments?: string[];
}

/** TBD — `data-pathway-tabs.jsx`. */
export interface Approval {
  id: string;
  documentPath: string;
  signer: string;
  role: string;
  status: 'pending' | 'signed' | 'rejected';
  reason?: string;
  signedAt?: string;
}

/** TBD — `dossier-store.jsx`. In-memory filesystem entry: path → content + meta. */
export interface DossierEntry {
  path: string;
  body: string;
  attachments: string[];
  meta: Record<string, unknown>;
}
