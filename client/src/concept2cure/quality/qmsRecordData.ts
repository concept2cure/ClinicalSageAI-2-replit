/**
 * Quality records — nonconformances, suppliers, internal audits and management
 * reviews: their server rows, labels and writes.
 *
 * The routes were built with the device QMS (server/routes/mdx-qms.ts, tables
 * from migrations/20260511_qms_and_labeling.sql) and every write already records
 * its §11.10(e) audit row. Until 2026-10-29 no screen called them and the launch
 * scope refused them in production (launch-scope-api.ts, "HIDDEN APP"). Decision
 * P-48 admits them to the QMS app; QmsRecords.tsx is the screen. CAPA joins
 * them from its own routes (server/routes/capa-mdr.ts): a CAPA belongs to a
 * project, and its moves are the server's (shared/constants/capa-lifecycle.ts).
 *
 * @module client/src/concept2cure/quality/qmsRecordData
 */

import type { CapaState } from '@shared/schema/capa-mdr';
import { CAPA_TRANSITIONS } from '@shared/constants/capa-lifecycle';
import { capaWrite, qmsWrite } from './qmsWrites';

export type QmsRecordTab = 'capa' | 'nonconforming' | 'suppliers' | 'audits' | 'reviews';

/** Server rows as the list routes return them (`SELECT *`, snake_case). */
export interface NonconformanceRow {
  id: number;
  nc_number: string;
  device_name: string | null;
  lot_or_serial: string | null;
  source: string | null;
  description: string;
  disposition: string | null;
  disposition_rationale: string | null;
  disposition_at: string | null;
  detected_at: string | null;
  capa_linked: boolean | null;
}

export interface SupplierRow {
  id: number;
  supplier_name: string;
  supplier_code: string | null;
  scope: string | null;
  criticality: string;
  approval_status: string;
  approval_date: string | null;
  reapproval_date: string | null;
  last_audit_date: string | null;
  next_audit_date: string | null;
  iso_certifications: string[] | null;
}

export interface InternalAuditRow {
  id: number;
  audit_number: string;
  scope: string;
  audit_standard: string | null;
  planned_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  major_findings: number | null;
  minor_findings: number | null;
  observations: number | null;
}

export interface ManagementReviewRow {
  id: number;
  review_date: string;
  period: string;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  open_action_count: number | null;
  closed_action_count: number | null;
}

/** A CAPA as GET /api/capa-mdr/capa returns it (drizzle, camelCase). */
export interface CapaRow {
  id: string;
  programId: string;
  capaCode: string;
  title: string;
  type: string;
  source: string;
  riskLevel: string;
  state: CapaState;
  targetCloseDate: string | null;
  problemStatement: string | null;
  closedAt: string | null;
  /** The records it was raised from, as { kind, id, label } (shared/schema/capa-mdr.ts). */
  sourceRefs: CapaSourceRef[] | null;
}

export interface CapaSourceRef { kind: string; id: string; label: string }

/* shared/schema/capa-mdr.ts CAPA_TYPES, CAPA_SOURCES, RISK_LEVELS, CAPA_STATES,
   ACTION_TYPES; the state record is typed by CapaState so it cannot drift. */
export const CAPA_TYPE_LABEL: Record<string, string> = { corrective: 'Corrective', preventive: 'Preventive', both: 'Corrective and preventive' };
export const CAPA_SOURCE_LABEL: Record<string, string> = {
  nonconformance: 'Nonconformance', internal_audit: 'Internal audit', external_audit: 'External audit',
  inspection_finding: 'Inspection finding', complaint: 'Complaint', supplier: 'Supplier',
  management_review: 'Management review', risk_review: 'Risk review', trend_signal: 'Trend', mdr: 'MDR', other: 'Other',
};
export const RISK_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const CAPA_STATE_LABEL: Record<CapaState, string> = {
  open: 'Open',
  investigation: 'Investigation',
  action_planned: 'Action planned',
  action_implemented: 'Action implemented',
  effectiveness_check: 'Effectiveness check',
  closed_effective: 'Closed, effective',
  closed_not_effective: 'Closed, not effective',
  escalated: 'Escalated',
};
export const CAPA_ACTION_TYPE_LABEL: Record<string, string> = {
  containment: 'Containment', corrective: 'Corrective', preventive: 'Preventive', training: 'Training',
  document_change: 'Document change', process_change: 'Process change', supplier_action: 'Supplier action',
  communication: 'Communication', verification: 'Verification', other: 'Other',
};
/** The moves the server accepts from this CAPA's state. */
export const capaMoves = (r: CapaRow): readonly CapaState[] => CAPA_TRANSITIONS[r.state] ?? [];
export const isCapaClosed = (r: CapaRow) => r.state === 'closed_effective' || r.state === 'closed_not_effective';

/* The server's enums (mdx-qms.ts CRITICALITY, SUPPLIER_STATUS, AUDIT_STATUS,
   DISPOSITION), in the order a person reads them. */
export const NC_SOURCE_LABEL: Record<string, string> = {
  in_process: 'In-process',
  final_inspection: 'Release testing',
  complaint: 'Complaint',
  audit: 'Audit',
  supplier: 'Supplier',
};
export const DISPOSITION_LABEL: Record<string, string> = {
  pending: 'Pending',
  use_as_is: 'Use as is',
  rework: 'Rework',
  regrade: 'Regrade',
  scrap: 'Scrap',
  return_to_supplier: 'Return to supplier',
};
export const CRITICALITY_LABEL: Record<string, string> = { critical: 'Critical', major: 'Major', minor: 'Minor' };
export const SUPPLIER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  conditional: 'Conditional',
  revoked: 'Revoked',
};
export const AUDIT_STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Null when the nonconformance has no decision yet; 'pending' is not one. */
export const isUndispositioned = (r: NonconformanceRow) => !r.disposition || r.disposition === 'pending';

/** A date (YYYY-MM-DD) before today on this device's calendar. */
export const isPast = (date: string | null, today: string) => !!date && date.slice(0, 10) < today;

/** The free-text summary a review's inputs or outputs carry (what this screen records). */
export const reviewText = (v: Record<string, unknown> | null, key: 'summary' | 'decisions') =>
  typeof v?.[key] === 'string' ? (v[key] as string) : '';

/** Drop empty strings so an untouched optional field is not sent (the server's
 *  date fields refuse ''). */
function compact(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined && v !== '') body[k] = v;
  return body;
}

export const createNonconformance = (v: {
  ncNumber: string; description: string; deviceName?: string; lotOrSerial?: string; source?: string;
}) => qmsWrite<NonconformanceRow>('POST', 'nonconforming', compact(v));

export const dispositionNonconformance = (id: number, v: { disposition: string; dispositionRationale: string }) =>
  qmsWrite<NonconformanceRow>('PATCH', `nonconforming/${id}/disposition`, compact(v));

export const createSupplier = (v: {
  supplierName: string; criticality: string; supplierCode?: string; scope?: string; approvalStatus?: string;
  approvalDate?: string; nextAuditDate?: string; reapprovalDate?: string;
}) => qmsWrite<SupplierRow>('POST', 'suppliers', compact(v));

export const updateSupplier = (id: number, v: {
  approvalStatus?: string; approvalDate?: string; lastAuditDate?: string; nextAuditDate?: string; reapprovalDate?: string;
}) => qmsWrite<SupplierRow>('PATCH', `suppliers/${id}`, compact(v));

export const createInternalAudit = (v: { auditNumber: string; scope: string; auditStandard?: string; plannedDate?: string }) =>
  qmsWrite<InternalAuditRow>('POST', 'internal-audits', compact(v));

export const updateInternalAudit = (id: number, v: {
  status?: string; startedAt?: string; completedAt?: string;
  majorFindings?: number; minorFindings?: number; observations?: number;
}) => qmsWrite<InternalAuditRow>('PATCH', `internal-audits/${id}`, compact(v));

export const createManagementReview = (v: { reviewDate: string; period: string; inputs: string; outputs: string }) =>
  qmsWrite<ManagementReviewRow>('POST', 'management-reviews', {
    reviewDate: v.reviewDate,
    period: v.period,
    ...(v.inputs ? { inputs: { summary: v.inputs } } : {}),
    ...(v.outputs ? { outputs: { decisions: v.outputs } } : {}),
  });

export const createCapa = (v: {
  programId: string; title: string; type: string; source: string; riskLevel?: string;
  targetCloseDate?: string; problemStatement?: string; sourceRefs?: CapaSourceRef[];
}) => capaWrite<CapaRow>('capa', compact(v));

export const transitionCapa = (id: string, v: { to: CapaState; reason: string; effectiveness?: string }) =>
  capaWrite<CapaRow>(`capa/${id}/transition`, {
    to: v.to,
    reason: v.reason,
    ...(v.effectiveness ? { effectivenessCheckResult: { summary: v.effectiveness } } : {}),
  });

export const addCapaAction = (id: string, v: { type: string; description: string; owner?: string; dueDate?: string }) =>
  capaWrite<{ id: string; n: number }>(`capa/${id}/actions`, compact(v));
