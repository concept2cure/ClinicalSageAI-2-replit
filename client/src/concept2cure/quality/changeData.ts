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
  targetImplementationDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  links?: ChangeLink[];
  /** The server's verdict (GET /api/mdx/qms/changes `implementation_overdue`):
   *  past its target implementation date with implementation unfinished,
   *  judged against the database's date. Absent when the row carries none. */
  implementationOverdue?: boolean;
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

export type StateTone = 'draft' | 'review' | 'effective' | 'muted' | 'err';
export const STATE_TONE: Record<ChangeState, StateTone> = {
  proposed: 'draft',
  under_assessment: 'review',
  approved: 'review',
  in_implementation: 'review',
  verification: 'review',
  closed: 'effective',
  rejected: 'err',
  cancelled: 'muted',
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

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
};
export const CLASSIFICATION_TONE: Record<Classification, 'ok' | 'warn' | 'err'> = {
  minor: 'ok',
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

/** Icon key (in ./icons `I`) used to represent each link target. */
export const LINK_TYPE_ICON: Record<LinkType, string> = {
  deviation: 'alertTriangle',
  capa: 'clipboardCheck',
  validation: 'beaker',
  document: 'fileText',
  sop: 'fileText',
  supplier: 'users',
  risk: 'shieldCheck',
  other: 'link',
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

/* ─── Change-control document / form family ──────────────────────────
   The controlled documents and forms the module provides for change control —
   surfaced as build cards (each hands AnA a create prompt). Mirrors the server
   catalog additions in server/services/qms/sopTemplates.ts. */

export interface ChangeForm {
  key: string;
  label: string;
  numberPrefix: string;
  description: string;
}

export const CHANGE_FORMS: ChangeForm[] = [
  {
    key: 'change_request_form',
    label: 'Change-request form',
    numberPrefix: 'CC-',
    description: 'The controlled form to raise a change: description, justification, risk classification, impact assessment, implementation plan, independent approval and effectiveness verification.',
  },
  {
    key: 'change_control_sop',
    label: 'Change-control procedure',
    numberPrefix: 'SOP-CC-',
    description: 'The SOP that governs how change requests are raised, assessed, approved, implemented and verified — aligned to ICH Q10 and EU GMP Annex 15.',
  },
  {
    key: 'impact_assessment_form',
    label: 'Impact-assessment form',
    numberPrefix: 'CC-IA-',
    description: 'The structured impact assessment: effect on product, process, equipment, validation state, linked deviations / CAPAs and regulatory filings.',
  },
];

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
