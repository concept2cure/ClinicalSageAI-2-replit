/**
 * Change control — typed model, controlled-lifecycle definition, the change
 * document/form family, and fixtures.
 *
 * The surface renders `live ?? fixture` (see changeHooks.ts): live data comes
 * from /api/mdx/qms/changes/*; these fixtures keep the register + flowchart
 * populated during load and on error. Aligned to ICH Q10 §3.2.3 (change
 * management) and EU GMP Annex 15 (change control), with the QMS document family
 * used for the change-control procedure and change-request form.
 *
 * @module client/src/concept2cure/quality/changeData
 */

import { formatDate } from './data';
import type { LearningReviewView } from './qmsApproval';

export type ChangeState =
  | 'proposed'
  | 'under_assessment'
  | 'approved'
  | 'rejected'
  | 'in_implementation'
  | 'verification'
  | 'closed'
  | 'cancelled';

export type ChangeType =
  | 'document' | 'process' | 'equipment' | 'material' | 'supplier'
  | 'method' | 'facility' | 'computer_system' | 'specification' | 'other';

export type Classification = 'minor' | 'major' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';
export type LinkType =
  | 'deviation' | 'capa' | 'validation' | 'document' | 'sop' | 'supplier' | 'risk' | 'other';
export type Relationship = 'triggered_by' | 'addresses' | 'requires' | 'impacts' | 'references';

export interface ChangeLink {
  id: number;
  changeId: number;
  linkType: LinkType;
  linkedRef: string;
  linkedLabel: string | null;
  relationship: Relationship;
  note: string | null;
}

export interface ChangeControl {
  id: number;
  changeNumber: string;
  title: string;
  description: string | null;
  changeType: ChangeType;
  classification: Classification;
  riskLevel: RiskLevel | null;
  status: ChangeState;
  reason: string | null;
  /** Who raised it (`proposed_by`); null when the row carries none. The server refuses their approval. */
  proposedBy?: number | null;
  /** The impact assessment and implementation plan (`impact_assessment`, `implementation_plan`). With the title,
   *  description, type, classification, risk, reason and target date they are what the approval signs. */
  impactAssessment?: string | null;
  implementationPlan?: string | null;
  /** The digest of the content as read (`content_digest`). The approval sends it, and the server signs only that
   *  content: a change edited since it was read is refused. Null when the row carries none; then it is not signed. */
  contentDigest?: string | null;
  targetImplementationDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  links?: ChangeLink[];
  /** The server's verdict (GET /api/mdx/qms/changes `implementation_overdue`):
   *  past its target implementation date with implementation unfinished,
   *  judged against the database's date. Absent when the row carries none. */
  implementationOverdue?: boolean;
  /** The lifecycle moves the server allows from this change's state
   *  (GET /api/mdx/qms/changes `next_states`, changeControl.service
   *  CHANGE_TRANSITIONS). 'approved' among them is reached only through the
   *  signed approve route. Absent when the row carries none, and then no move
   *  is offered: the browser does not keep its own copy of the state machine. */
  nextStates?: ChangeState[];
  learningReview?: LearningReviewView | { unavailable: true } | null;
}

export interface ChangeSummary {
  total: number;
  open: number;
  awaitingApproval: number;
  inImplementation: number;
  awaitingVerification: number;
  closed: number;
  overdueImplementation: number;
  byStatus: Record<string, number>;
}

/**
 * The change log's figures from its rows, by the server's definitions (changeControl.service.ts changeControlSummary):
 * open is every state but closed, rejected and cancelled. The summary route reads the whole organisation and takes no
 * project, so a log scoped to a project counts its own rows (C14).
 */
export function summaryOfChanges(changes: ChangeControl[]): ChangeSummary {
  const byStatus: Record<string, number> = {};
  for (const c of changes) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const terminal = (byStatus.closed ?? 0) + (byStatus.rejected ?? 0) + (byStatus.cancelled ?? 0);
  return {
    total: changes.length,
    open: changes.length - terminal,
    awaitingApproval: byStatus.under_assessment ?? 0,
    inImplementation: byStatus.in_implementation ?? 0,
    awaitingVerification: byStatus.verification ?? 0,
    closed: byStatus.closed ?? 0,
    overdueImplementation: changes.filter((c) => c.implementationOverdue === true).length,
    byStatus,
  };
}

/* ─── Labels + tone maps ───────────────────────────────────────── */

export const STATE_LABEL: Record<ChangeState, string> = {
  proposed: 'Proposed',
  under_assessment: 'Under assessment',
  approved: 'Approved',
  rejected: 'Rejected',
  in_implementation: 'In implementation',
  verification: 'Verification',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** D0's chip tone for a change's state (.rd-chip, C8): closed is ok, rejected err, cancelled dim, the rest neutral,
    as the SOP register's effective, retired and in-flight states are. */
export type StateTone = 'ok' | 'err' | 'dim' | null;
export const STATE_TONE: Record<ChangeState, StateTone> = {
  proposed: null,
  under_assessment: null,
  approved: null,
  in_implementation: null,
  verification: null,
  closed: 'ok',
  rejected: 'err',
  cancelled: 'dim',
};

export const CHANGE_TYPE_LABEL: Record<ChangeType, string> = {
  document: 'Document',
  process: 'Process',
  equipment: 'Equipment',
  material: 'Material',
  supplier: 'Supplier',
  method: 'Analytical method',
  facility: 'Facility',
  computer_system: 'Computer system',
  specification: 'Specification',
  other: 'Other',
};

/** A change's risk level, in words (C9). */
export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** The states in which a change's assessment can be edited: the server's CHANGE_EDITABLE_STATES
 *  (changeControl.service.ts). From approval on, it is what the approval signed. */
export const ASSESSABLE_STATES: readonly ChangeState[] = ['proposed', 'under_assessment'];

/** Whether a link can still be added to or removed from a change: the server's rule (changeControl.service.ts addLink,
 *  removeLink), every state but closed, cancelled and rejected. */
export const takesLinks = (c: { status: ChangeState }): boolean => !['closed', 'cancelled', 'rejected'].includes(c.status);

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
};
/** D0's chip tone for a classification (C8): critical err, major warn. Minor is neutral: green would read as "fine". */
export const CLASSIFICATION_TONE: Record<Classification, 'warn' | 'err' | null> = {
  minor: null,
  major: 'warn',
  critical: 'err',
};

export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  deviation: 'Deviation',
  capa: 'CAPA',
  validation: 'Validation',
  document: 'Document',
  sop: 'SOP',
  supplier: 'Supplier',
  risk: 'Risk',
  other: 'Other',
};

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  triggered_by: 'Triggered by',
  addresses: 'Addresses',
  requires: 'Requires',
  impacts: 'Impacts',
  references: 'References',
};

/* ─── The controlled change-control lifecycle (flowchart backbone) ─────
   The main path an approved change follows, ICH Q10 / Annex 15. `rejected`
   and `cancelled` are off-ramps rendered separately. Each step carries the
   short "what happens here" the flowchart labels under the node. */

export interface FlowStep {
  key: ChangeState;
  label: string;
  blurb: string;
}

export const FLOW_STEPS: FlowStep[] = [
  { key: 'proposed',          label: 'Proposed',          blurb: 'Change request raised' },
  { key: 'under_assessment',  label: 'Under assessment',  blurb: 'Impact & risk assessed' },
  { key: 'approved',          label: 'Approved',          blurb: 'Independent approval' },
  { key: 'in_implementation', label: 'In implementation', blurb: 'Actions executed' },
  { key: 'verification',      label: 'Verification',      blurb: 'Effectiveness checked' },
  { key: 'closed',            label: 'Closed',            blurb: 'Change record closed' },
];

/* REMOVED 2026-10-17: CHANGE_FORMS, a client copy of three change-control
   entries "mirroring" server/services/qms/sopTemplates.ts. One of the three,
   the impact-assessment form, had no server template at all, and every card
   only handed AnA a create prompt. The change-control gallery now renders the
   server's own library entries (GET /api/mdx/qms/templates, keys in
   CHANGE_FORM_TEMPLATE_KEYS) and creates through POST /api/mdx/qms/documents.
   The impact assessment itself is a field of the change record
   (PATCH /api/mdx/qms/changes/:id `impactAssessment`), not a separate form. */
export const CHANGE_FORM_TEMPLATE_KEYS: readonly string[] = ['change_request_form', 'change_control_sop'];

/* REMOVED 2026-10-14: FIXTURE_CHANGES and FIXTURE_SUMMARY, an example change
   log (CC-2026-014 "Sterile filter supplier change", a 5,000 L scale-up, a LIMS
   migration …) shown under sample mode. The tests that drive the log with rows
   carry their own, in __tests__/changeRows.ts. */

/** Count how many changes sit at each lifecycle step — the flowchart's live
 *  load, derived from the register's own rows. */
export function deriveStageCounts(changes: ChangeControl[]): Record<ChangeState, number> {
  const counts = {
    proposed: 0, under_assessment: 0, approved: 0, rejected: 0,
    in_implementation: 0, verification: 0, closed: 0, cancelled: 0,
  } as Record<ChangeState, number>;
  for (const c of changes) counts[c.status] = (counts[c.status] ?? 0) + 1;
  return counts;
}

/**
 * True when the server says the change is past its target implementation date
 * with implementation unfinished. The browser does not judge it: until
 * 2026-10-08 this compared against a hard-coded '2026-07-24' and only for
 * approved or in-implementation rows, so on the day of the QA walk a proposed
 * change and an approved one, both past target, carried no flag (J8). The
 * server's predicate is the one the Overdue tile counts with
 * (server/services/qms/changeControl.service.ts IMPLEMENTATION_OVERDUE_SQL).
 */
export function isImplementationOverdue(c: ChangeControl): boolean {
  return c.implementationOverdue === true;
}

export { formatDate };
