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

/* ─── Fixtures ─────────────────────────────────────────────────── */

export const FIXTURE_CHANGES: ChangeControl[] = [
  {
    id: 1, changeNumber: 'CC-2026-014', title: 'Sterile filter supplier change (0.22 µm)',
    description: 'Qualify a second-source 0.22 µm sterilising-grade filter for the aseptic fill line.',
    changeType: 'supplier', classification: 'critical', riskLevel: 'high', status: 'under_assessment',
    reason: 'Single-source supply risk on the primary sterilising filter.',
    targetImplementationDate: '2026-09-15', createdAt: '2026-06-28', updatedAt: '2026-07-10',
    links: [
      { id: 11, changeId: 1, linkType: 'deviation', linkedRef: 'DEV-2026-041', linkedLabel: 'Filter integrity test excursion', relationship: 'triggered_by', note: null },
      { id: 12, changeId: 1, linkType: 'validation', linkedRef: 'VP-7', linkedLabel: 'Sterilising-filtration validation', relationship: 'requires', note: null },
      { id: 13, changeId: 1, linkType: 'supplier', linkedRef: 'SUP-118', linkedLabel: 'Second-source filter vendor', relationship: 'impacts', note: null },
    ],
  },
  {
    id: 2, changeNumber: 'CC-2026-012', title: 'Bioreactor scale-up 2,000 → 5,000 L',
    description: 'Scale the drug-substance process from 2,000 L to 5,000 L at the commercial site.',
    changeType: 'process', classification: 'major', riskLevel: 'high', status: 'in_implementation',
    reason: 'Commercial demand exceeds current batch output.',
    targetImplementationDate: '2026-07-05', createdAt: '2026-05-30', updatedAt: '2026-07-01',
    links: [
      { id: 21, changeId: 2, linkType: 'validation', linkedRef: 'VP-22', linkedLabel: 'Process performance qualification', relationship: 'requires', note: null },
      { id: 22, changeId: 2, linkType: 'capa', linkedRef: 'CAPA-88', linkedLabel: 'Yield trend below target', relationship: 'addresses', note: null },
    ],
  },
  {
    id: 3, changeNumber: 'CC-2026-009', title: 'Update SOP-820-50 supplier controls',
    description: 'Revise the supplier-controls procedure to add the risk-based re-qualification cadence.',
    changeType: 'document', classification: 'minor', riskLevel: 'low', status: 'verification',
    reason: 'Internal audit finding A-2026-03.',
    targetImplementationDate: '2026-06-20', createdAt: '2026-05-12', updatedAt: '2026-06-22',
    links: [
      { id: 31, changeId: 3, linkType: 'sop', linkedRef: 'SOP-820-50', linkedLabel: 'Supplier controls procedure', relationship: 'impacts', note: null },
      { id: 32, changeId: 3, linkType: 'capa', linkedRef: 'CAPA-79', linkedLabel: 'Audit finding A-2026-03', relationship: 'addresses', note: null },
    ],
  },
  {
    id: 4, changeNumber: 'CC-2026-006', title: 'Migrate LIMS to validated cloud instance',
    description: 'Move the laboratory information system to the validated cloud environment.',
    changeType: 'computer_system', classification: 'major', riskLevel: 'medium', status: 'approved',
    reason: 'End-of-life on the on-premise LIMS server.',
    targetImplementationDate: '2026-10-01', createdAt: '2026-06-15', updatedAt: '2026-07-08',
    links: [
      { id: 41, changeId: 4, linkType: 'validation', linkedRef: 'VP-31', linkedLabel: 'CSV — LIMS cloud qualification', relationship: 'requires', note: null },
    ],
  },
  {
    id: 5, changeNumber: 'CC-2026-002', title: 'Tighten aggregation release limit (SE-HPLC)',
    description: 'Reduce the drug-substance aggregation release limit from ≤2.0% to ≤1.5%.',
    changeType: 'specification', classification: 'minor', riskLevel: 'low', status: 'closed',
    reason: 'Process capability supports a tighter limit.',
    targetImplementationDate: '2026-04-10', createdAt: '2026-03-01', updatedAt: '2026-04-12',
    links: [
      { id: 51, changeId: 5, linkType: 'document', linkedRef: 'SPEC-DS-01', linkedLabel: 'Drug-substance specification', relationship: 'impacts', note: null },
    ],
  },
  {
    id: 6, changeNumber: 'CC-2026-001', title: 'New incoming-inspection gauge (WI-014)',
    description: 'Introduce a calibrated digital gauge for the dimensional incoming check.',
    changeType: 'equipment', classification: 'minor', riskLevel: 'low', status: 'proposed',
    reason: 'Improve measurement repeatability at incoming inspection.',
    targetImplementationDate: '2026-08-30', createdAt: '2026-07-18', updatedAt: '2026-07-18',
    links: [],
  },
];

export const FIXTURE_SUMMARY: ChangeSummary = {
  total: 6,
  open: 5,
  awaitingApproval: 1,
  inImplementation: 1,
  awaitingVerification: 1,
  closed: 1,
  overdueImplementation: 1,
  byStatus: {
    proposed: 1,
    under_assessment: 1,
    approved: 1,
    in_implementation: 1,
    verification: 1,
    closed: 1,
  },
};

/** Count how many changes sit at each lifecycle step — the flowchart's live
 *  load. Used as the fixture fallback for the per-stage pipeline counts. */
export function deriveStageCounts(changes: ChangeControl[]): Record<ChangeState, number> {
  const counts = {
    proposed: 0, under_assessment: 0, approved: 0, rejected: 0,
    in_implementation: 0, verification: 0, closed: 0, cancelled: 0,
  } as Record<ChangeState, number>;
  for (const c of changes) counts[c.status] = (counts[c.status] ?? 0) + 1;
  return counts;
}

/** True when an in-flight change is past its target implementation date. */
export function isImplementationOverdue(c: ChangeControl, today = '2026-07-24'): boolean {
  if (!c.targetImplementationDate) return false;
  if (c.status !== 'approved' && c.status !== 'in_implementation') return false;
  return String(c.targetImplementationDate).slice(0, 10) < today;
}

export { formatDate };
