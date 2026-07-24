/**
 * QMS change-control service.
 *
 * Org-scoped raw-SQL service over qms_change_controls + qms_change_links
 * (migration 20260724_qms_change_control_store.sql) — the governed change
 * management ICH Q10 §3.2.3 and EU GMP Annex 15 require, and 21 CFR 820.30/
 * 820.70 + ISO 13485 §7 expect for devices.
 *
 * The controlled lifecycle is a state machine (CHANGE_TRANSITIONS); illegal
 * transitions throw InvalidChangeTransitionError. Approval enforces segregation
 * of duties (the approver must differ from the proposer). Every transition
 * stamps the relevant actor + timestamp on the row; the route layer writes the
 * 21 CFR Part 11 audit entry.
 *
 * @module server/services/qms/changeControl.service
 */

import { pool } from '../../db';

// ─── enums ──────────────────────────────────────────────────────────────────
export const CHANGE_TYPES = [
  'document', 'process', 'equipment', 'material', 'supplier',
  'method', 'facility', 'computer_system', 'specification', 'other',
] as const;
export const CHANGE_CLASSIFICATIONS = ['minor', 'major', 'critical'] as const;
export const CHANGE_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const CHANGE_STATES = [
  'proposed', 'under_assessment', 'approved', 'rejected',
  'in_implementation', 'verification', 'closed', 'cancelled',
] as const;
export const LINK_TYPES = [
  'deviation', 'capa', 'validation', 'document', 'sop', 'supplier', 'risk', 'other',
] as const;
export const LINK_RELATIONSHIPS = [
  'triggered_by', 'addresses', 'requires', 'impacts', 'references',
] as const;

export type ChangeState = (typeof CHANGE_STATES)[number];

/**
 * The controlled change-control lifecycle. Aligned to ICH Q10 / Annex 15:
 * a change is proposed, assessed for impact, approved (or rejected),
 * implemented, verified for effectiveness, then closed. Any live state may be
 * cancelled; rejected/closed/cancelled are terminal.
 */
export const CHANGE_TRANSITIONS: Record<ChangeState, ChangeState[]> = {
  proposed: ['under_assessment', 'cancelled'],
  under_assessment: ['approved', 'rejected', 'cancelled'],
  approved: ['in_implementation', 'cancelled'],
  rejected: [],
  in_implementation: ['verification', 'cancelled'],
  verification: ['closed', 'in_implementation'],
  closed: [],
  cancelled: [],
};

export class InvalidChangeTransitionError extends Error {}
export class SegregationOfDutiesError extends Error {}

export interface ChangeControlRow {
  id: number;
  organization_id: number;
  change_number: string;
  title: string;
  description: string | null;
  change_type: string;
  classification: string;
  risk_level: string | null;
  status: string;
  reason: string | null;
  impact_assessment: string | null;
  implementation_plan: string | null;
  proposed_by: number | null;
  assessed_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  target_implementation_date: string | null;
  implemented_at: string | null;
  verified_by: number | null;
  verified_at: string | null;
  effectiveness_review: string | null;
  closed_at: string | null;
  qms_document_id: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeLinkRow {
  id: number;
  organization_id: number;
  change_id: number;
  link_type: string;
  linked_ref: string;
  linked_label: string | null;
  linked_id: number | null;
  relationship: string;
  note: string | null;
  created_by: number | null;
  created_at: string;
}

// ─── Register ────────────────────────────────────────────────────────────────

export async function createChange(orgId: number, p: {
  changeNumber: string; title: string; description?: string | null;
  changeType?: string; classification?: string; riskLevel?: string | null;
  reason?: string | null; impactAssessment?: string | null; implementationPlan?: string | null;
  targetImplementationDate?: string | null; qmsDocumentId?: number | null;
  proposedBy?: number | null; metadata?: Record<string, unknown> | null;
}): Promise<ChangeControlRow> {
  const { rows } = await pool.query<ChangeControlRow>(
    `INSERT INTO qms_change_controls (
       organization_id, change_number, title, description, change_type, classification,
       risk_level, reason, impact_assessment, implementation_plan,
       target_implementation_date, qms_document_id, proposed_by, metadata
     ) VALUES ($1,$2,$3,$4,COALESCE($5,'other'),COALESCE($6,'minor'),
               $7,$8,$9,$10,$11,$12,$13,COALESCE($14::jsonb,'{}'::jsonb))
     RETURNING *`,
    [
      orgId, p.changeNumber, p.title, p.description ?? null,
      p.changeType ?? null, p.classification ?? null, p.riskLevel ?? null,
      p.reason ?? null, p.impactAssessment ?? null, p.implementationPlan ?? null,
      p.targetImplementationDate ?? null, p.qmsDocumentId ?? null, p.proposedBy ?? null,
      p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
  return rows[0];
}

export async function listChanges(orgId: number, opts: { status?: string; changeType?: string } = {}): Promise<ChangeControlRow[]> {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (opts.status) { args.push(opts.status); where += ` AND status = $${args.length}`; }
  if (opts.changeType) { args.push(opts.changeType); where += ` AND change_type = $${args.length}`; }
  const { rows } = await pool.query<ChangeControlRow>(
    `SELECT * FROM qms_change_controls WHERE ${where} ORDER BY created_at DESC`,
    args,
  );
  return rows;
}

export async function getChange(orgId: number, id: number): Promise<ChangeControlRow | null> {
  const { rows } = await pool.query<ChangeControlRow>(
    `SELECT * FROM qms_change_controls WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

export async function updateChange(orgId: number, id: number, p: {
  title?: string; description?: string | null; changeType?: string; classification?: string;
  riskLevel?: string | null; reason?: string | null; impactAssessment?: string | null;
  implementationPlan?: string | null; targetImplementationDate?: string | null;
  qmsDocumentId?: number | null; assessedBy?: number | null;
}): Promise<ChangeControlRow | null> {
  // Build a COALESCE-guarded partial update (only provided fields change).
  const sets: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, val: unknown) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  if (p.title !== undefined) add('title', p.title);
  if (p.description !== undefined) add('description', p.description);
  if (p.changeType !== undefined) add('change_type', p.changeType);
  if (p.classification !== undefined) add('classification', p.classification);
  if (p.riskLevel !== undefined) add('risk_level', p.riskLevel);
  if (p.reason !== undefined) add('reason', p.reason);
  if (p.impactAssessment !== undefined) add('impact_assessment', p.impactAssessment);
  if (p.implementationPlan !== undefined) add('implementation_plan', p.implementationPlan);
  if (p.targetImplementationDate !== undefined) add('target_implementation_date', p.targetImplementationDate);
  if (p.qmsDocumentId !== undefined) add('qms_document_id', p.qmsDocumentId);
  if (p.assessedBy !== undefined) add('assessed_by', p.assessedBy);
  if (sets.length === 0) return getChange(orgId, id);
  args.push(id, orgId);
  const { rows } = await pool.query<ChangeControlRow>(
    `UPDATE qms_change_controls SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
      RETURNING *`,
    args,
  );
  return rows[0] ?? null;
}

/**
 * Advance a change through the controlled lifecycle. Validates the transition
 * against CHANGE_TRANSITIONS, enforces segregation of duties on approval, and
 * stamps the relevant actor + timestamp for the target state.
 *
 * Throws InvalidChangeTransitionError for an illegal move and
 * SegregationOfDutiesError when the approver equals the proposer.
 */
export async function transitionChange(orgId: number, id: number, to: ChangeState, actor: {
  userId?: number | null; effectivenessReview?: string | null;
}): Promise<ChangeControlRow | null> {
  const change = await getChange(orgId, id);
  if (!change) return null;
  const from = change.status as ChangeState;
  const allowed = CHANGE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidChangeTransitionError(`Cannot move change from ${from} to ${to}`);
  }
  // Segregation of duties: the approver must not be the proposer (ICH Q10 /
  // Part 11 independent review).
  if (to === 'approved' && actor.userId != null && change.proposed_by != null
      && Number(actor.userId) === Number(change.proposed_by)) {
    throw new SegregationOfDutiesError('The approver must differ from the person who proposed the change.');
  }

  // State-specific stamps.
  const sets: string[] = ['status = $1', 'updated_at = now()'];
  const args: unknown[] = [to];
  const add = (col: string, val: unknown) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  switch (to) {
    case 'approved':
      add('approved_by', actor.userId ?? null);
      sets.push('approved_at = now()');
      break;
    case 'verification':
      // Entering verification means implementation is complete.
      sets.push('implemented_at = COALESCE(implemented_at, now())');
      break;
    case 'closed':
      add('verified_by', actor.userId ?? null);
      sets.push('verified_at = now()', 'closed_at = now()');
      if (actor.effectivenessReview != null) add('effectiveness_review', actor.effectivenessReview);
      break;
    default:
      break;
  }
  args.push(id, orgId);
  const { rows } = await pool.query<ChangeControlRow>(
    `UPDATE qms_change_controls SET ${sets.join(', ')}
      WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
      RETURNING *`,
    args,
  );
  return rows[0] ?? null;
}

/** Soft-delete a change (and, via ON DELETE CASCADE on hard-delete only, its
 *  links — soft-delete keeps links for the audit trail). */
export async function deleteChange(orgId: number, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE qms_change_controls SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Cross-references (changes ↔ deviations / CAPAs / validation / docs) ──────

export async function listLinks(orgId: number, changeId: number): Promise<ChangeLinkRow[]> {
  const { rows } = await pool.query<ChangeLinkRow>(
    `SELECT * FROM qms_change_links WHERE organization_id = $1 AND change_id = $2 ORDER BY created_at ASC`,
    [orgId, changeId],
  );
  return rows;
}

export async function addLink(orgId: number, changeId: number, p: {
  linkType: string; linkedRef: string; linkedLabel?: string | null; linkedId?: number | null;
  relationship?: string; note?: string | null; createdBy?: number | null;
}): Promise<ChangeLinkRow> {
  const { rows } = await pool.query<ChangeLinkRow>(
    `INSERT INTO qms_change_links (
       organization_id, change_id, link_type, linked_ref, linked_label, linked_id, relationship, note, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'references'),$8,$9)
     RETURNING *`,
    [
      orgId, changeId, p.linkType, p.linkedRef, p.linkedLabel ?? null, p.linkedId ?? null,
      p.relationship ?? null, p.note ?? null, p.createdBy ?? null,
    ],
  );
  return rows[0];
}

export async function removeLink(orgId: number, changeId: number, linkId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM qms_change_links WHERE id = $1 AND change_id = $2 AND organization_id = $3`,
    [linkId, changeId, orgId],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Register summary (KPIs for the Change Control surface) ───────────────────

export interface ChangeControlSummary {
  total: number;
  open: number;                 // anything not closed/rejected/cancelled
  awaitingApproval: number;     // under_assessment
  inImplementation: number;
  awaitingVerification: number; // verification
  closed: number;
  overdueImplementation: number; // approved/in_implementation past target date
  byStatus: Record<string, number>;
}

export async function changeControlSummary(orgId: number): Promise<ChangeControlSummary> {
  const { rows } = await pool.query<{ status: string; n: string; overdue: string }>(
    `SELECT status,
            COUNT(*) AS n,
            COUNT(*) FILTER (
              WHERE status IN ('approved','in_implementation')
                AND target_implementation_date IS NOT NULL
                AND target_implementation_date < CURRENT_DATE
            ) AS overdue
       FROM qms_change_controls
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY status`,
    [orgId],
  );
  const byStatus: Record<string, number> = {};
  let total = 0, overdueImplementation = 0;
  for (const r of rows) {
    const n = Number(r.n);
    byStatus[r.status] = n;
    total += n;
    overdueImplementation += Number(r.overdue);
  }
  const terminal = (byStatus.closed ?? 0) + (byStatus.rejected ?? 0) + (byStatus.cancelled ?? 0);
  return {
    total,
    open: total - terminal,
    awaitingApproval: byStatus.under_assessment ?? 0,
    inImplementation: byStatus.in_implementation ?? 0,
    awaitingVerification: byStatus.verification ?? 0,
    closed: byStatus.closed ?? 0,
    overdueImplementation,
    byStatus,
  };
}
