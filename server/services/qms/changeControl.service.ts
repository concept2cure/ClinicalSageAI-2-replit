/**
 * QMS change-control service.
 *
 * Org-scoped raw-SQL service over qms_change_controls + qms_change_links
 * (migration 20260724_qms_change_control_store.sql) — the governed change
 * management ICH Q10 §3.2.3 and EU GMP Annex 15 require, and 21 CFR 820.30/
 * 820.70 + ISO 13485 §7 expect for devices.
 *
 * The controlled lifecycle is a state machine (CHANGE_TRANSITIONS); illegal
 * transitions throw InvalidChangeTransitionError. Approval is not made here:
 * it is an electronic signature, written only by approveQmsChangeSigned
 * (change-approval-signature.ts), which also enforces that the approver is not
 * the proposer. Every transition
 * stamps the relevant actor + timestamp on the row; the route layer writes the
 * 21 CFR Part 11 audit entry.
 *
 * @module server/services/qms/changeControl.service
 */

import { pool } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';
import { queryRowsClient } from '../../db/queryRowsClient';

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
/** Approval is a signed act; see approveQmsChangeSigned. Nothing was written. */
export class ChangeApprovalRequiresSignatureError extends Error {
  readonly code = 'CHANGE_APPROVAL_REQUIRES_SIGNATURE';
  constructor() {
    super(
      'Approving a change is an electronic signature: it needs the approver\'s password and second factor. ' +
        'Approve it on the change in the Quality register (POST /api/mdx/qms/changes/:id/approve). Nothing was changed.',
    );
    this.name = 'ChangeApprovalRequiresSignatureError';
  }
}


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
  /** The project (regulatory_programs.id) the change belongs to, or null for the organization's (20261029l). */
  program_id: string | null;
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
  removed_at?: string | null;
  removed_by?: number | null;
  removal_reason?: string | null;
}

/** A link that names no record of this organisation in the register its type names (MR-12 Stage 8). */
export class ChangeLinkRefusedError extends Error {
  readonly code = 'CHANGE_LINK_TARGET_NOT_FOUND';
}

// ─── Register ────────────────────────────────────────────────────────────────

/**
 * Raise a change. The one writer of the register, for the route and AnA's
 * qms_change_create alike.
 *
 * `programId` is the project the change belongs to (P-60, 2026-10-29;
 * migrations/20261029l): a product's design changes are that product's
 * (21 CFR 820.30(j), ISO 13485 §7.3.10), and its Engineering screen reads them
 * by this column. The caller has already asked whether the organization owns
 * it (admitBodyProject, over admitProject, on the route; the registry wrapper's
 * foreignProgramRefusal for the tool); the same-organization key holds every
 * other writer to that.
 * Absent, the change is the organization's, as every change was before.
 */
export async function createChange(orgId: number, p: {
  changeNumber: string; title: string; description?: string | null;
  changeType?: string; classification?: string; riskLevel?: string | null;
  reason?: string | null; impactAssessment?: string | null; implementationPlan?: string | null;
  targetImplementationDate?: string | null; qmsDocumentId?: number | null;
  proposedBy?: number | null; metadata?: Record<string, unknown> | null;
  programId?: string | null;
}, client: RequestSqlClient = pool): Promise<ChangeControlRow> {
  const { rows } = await queryRowsClient(client).query<ChangeControlRow>(
    `INSERT INTO qms_change_controls (
       organization_id, change_number, title, description, change_type, classification,
       risk_level, reason, impact_assessment, implementation_plan,
       target_implementation_date, qms_document_id, proposed_by, metadata, program_id
     ) VALUES ($1,$2,$3,$4,COALESCE($5,'other'),COALESCE($6,'minor'),
               $7,$8,$9,$10,$11,$12,$13,COALESCE($14::jsonb,'{}'::jsonb),$15)
     RETURNING *`,
    [
      orgId, p.changeNumber, p.title, p.description ?? null,
      p.changeType ?? null, p.classification ?? null, p.riskLevel ?? null,
      p.reason ?? null, p.impactAssessment ?? null, p.implementationPlan ?? null,
      p.targetImplementationDate ?? null, p.qmsDocumentId ?? null, p.proposedBy ?? null,
      p.metadata ? JSON.stringify(p.metadata) : null, p.programId || null,
    ],
  );
  return rows[0];
}

/**
 * The stages in which a change's implementation is not finished: it is late
 * when its target implementation date has passed in any of them. Verification
 * means implementation is done (transitionChange stamps implemented_at on the
 * way in); closed, rejected and cancelled are over.
 *
 * QA walk 2026-10-08 (J8): the register's "Overdue · Past target date" tile
 * counted approved and in-implementation rows only, so a proposed change and a
 * change still under assessment, both past their target, were "on schedule";
 * and the row flags were computed in the browser against a hard-coded
 * '2026-07-24'. One predicate now serves the tile and the rows, judged against
 * the database's CURRENT_DATE.
 */
export const IMPLEMENTATION_UNFINISHED_STATES = ['proposed', 'under_assessment', 'approved', 'in_implementation'] as const;
const IMPLEMENTATION_OVERDUE_SQL =
  `(status IN (${IMPLEMENTATION_UNFINISHED_STATES.map((s) => `'${s}'`).join(',')})` +
  ` AND target_implementation_date IS NOT NULL AND target_implementation_date < CURRENT_DATE)`;

/** A register row with the server-computed overdue flag. */
export type ChangeControlListRow = ChangeControlRow & { implementation_overdue: boolean };

export async function listChanges(orgId: number, opts: { status?: string; changeType?: string } = {}, client: RequestSqlClient = pool): Promise<ChangeControlListRow[]> {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (opts.status) { args.push(opts.status); where += ` AND status = $${args.length}`; }
  if (opts.changeType) { args.push(opts.changeType); where += ` AND change_type = $${args.length}`; }
  const { rows } = await queryRowsClient(client).query<ChangeControlListRow>(
    `SELECT *, ${IMPLEMENTATION_OVERDUE_SQL} AS implementation_overdue
       FROM qms_change_controls WHERE ${where} ORDER BY created_at DESC`,
    args,
  );
  return rows;
}

/** The lifecycle moves CHANGE_TRANSITIONS allows from a state (approval among them: it is the signed route). */
export function nextStatesOf(status: string): ChangeState[] {
  return CHANGE_TRANSITIONS[status as ChangeState] ?? [];
}

export async function getChange(orgId: number, id: number, client: RequestSqlClient = pool): Promise<ChangeControlRow | null> {
  const { rows } = await queryRowsClient(client).query<ChangeControlRow>(
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
}, client: RequestSqlClient = pool): Promise<ChangeControlRow | null> {
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
  if (sets.length === 0) return getChange(orgId, id, client);
  args.push(id, orgId);
  const { rows } = await queryRowsClient(client).query<ChangeControlRow>(
    `UPDATE qms_change_controls SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
      RETURNING *`,
    args,
  );
  return rows[0] ?? null;
}

/**
 * Advance a change through the controlled lifecycle. Validates the transition
 * against CHANGE_TRANSITIONS and stamps the relevant actor + timestamp for the
 * target state. Approval is not a transition this function makes.
 *
 * Throws InvalidChangeTransitionError for an illegal move and
 * ChangeApprovalRequiresSignatureError for 'approved'.
 */
export async function transitionChange(orgId: number, id: number, to: ChangeState, actor: {
  userId?: number | null; effectivenessReview?: string | null;
}, client: RequestSqlClient = pool): Promise<(ChangeControlRow & { from_status: ChangeState }) | null> {
  const change = await getChange(orgId, id, client);
  if (!change) return null;
  const from = change.status as ChangeState;
  const allowed = CHANGE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidChangeTransitionError(`Cannot move change from ${from} to ${to}`);
  }
  /* Approval is an electronic signature (21 CFR 11.50; ICH Q10 §3.2.3), and
     this function cannot take one: it re-verifies nobody and writes no
     signature row. It used to stamp approved_by / approved_at here, checked
     only for segregation of duties, for the HTTP route and for the AnA tool
     qms_change_transition alike (security review 2026-09-24, DP-31). The one
     writer of an approval is now approveQmsChangeSigned
     (change-approval-signature.ts), behind POST /api/mdx/qms/changes/:id/approve,
     which also carries the segregation-of-duties check. Refused here, after the
     legality check so an illegal move is still named as one, so no caller of
     this function can approve. */
  if (to === 'approved') {
    throw new ChangeApprovalRequiresSignatureError();
  }

  // State-specific stamps.
  const sets: string[] = ['status = $1', 'updated_at = now()'];
  const args: unknown[] = [to];
  const add = (col: string, val: unknown) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  switch (to) {
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
  const { rows } = await queryRowsClient(client).query<ChangeControlRow>(
    `UPDATE qms_change_controls SET ${sets.join(', ')}
      WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
      RETURNING *`,
    args,
  );
  // The state it left, for the audit row of the move (the row returned is the new one).
  return rows[0] ? { ...rows[0], from_status: from } : null;
}

/** Soft-delete a change (and, via ON DELETE CASCADE on hard-delete only, its
 *  links — soft-delete keeps links for the audit trail). */
export async function deleteChange(orgId: number, id: number, client: RequestSqlClient = pool): Promise<boolean> {
  const { rows } = await queryRowsClient(client).query(
    `UPDATE qms_change_controls SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id`,
    [id, orgId],
  );
  return rows.length > 0;
}

// ─── Cross-references (changes ↔ deviations / CAPAs / validation / docs) ──────

export async function listLinks(orgId: number, changeId: number, client: RequestSqlClient = pool): Promise<ChangeLinkRow[]> {
  const { rows } = await queryRowsClient(client).query<ChangeLinkRow>(
    `SELECT * FROM qms_change_links WHERE organization_id = $1 AND change_id = $2 AND removed_at IS NULL ORDER BY created_at ASC`,
    [orgId, changeId],
  );
  return rows;
}

/**
 * The links of every listed change in ONE org-scoped query, keyed by change id
 * (a change with none is absent). The register read returned no links at all,
 * so every change showed 0 and "No linked records yet" (QA walk 2026-10-08).
 */
export async function listLinksForChanges(orgId: number, changeIds: number[], client: RequestSqlClient = pool): Promise<Map<number, ChangeLinkRow[]>> {
  const out = new Map<number, ChangeLinkRow[]>();
  if (changeIds.length === 0) return out;
  const { rows } = await queryRowsClient(client).query<ChangeLinkRow>(
    `SELECT * FROM qms_change_links WHERE organization_id = $1 AND change_id = ANY($2::int[]) AND removed_at IS NULL
      ORDER BY change_id, created_at ASC, id ASC`,
    [orgId, changeIds],
  );
  for (const r of rows) {
    const key = Number(r.change_id);
    out.set(key, [...(out.get(key) ?? []), r]);
  }
  return out;
}

/*
 * The register each record type is held in, and the read that finds one of this
 * organisation's records by its reference (MR-12 Stage 8, CAT2-25). A link to a
 * deviation, a CAPA or a supplier must name one; a document link that carries
 * its id must name this organisation's document. Other types (validation, risk,
 * other) keep the typed reference: the platform holds no register for them.
 */
const LINK_TARGET_BY_REF: Partial<Record<string, string>> = {
  deviation: `SELECT 1 FROM qc_deviations WHERE organization_id = $1 AND deviation_number = $2 LIMIT 1`,
  capa: `SELECT 1 FROM capa_records c JOIN regulatory_programs p ON p.id::text = c.program_id
          WHERE p.organization_id = $1 AND c.capa_code = $2 LIMIT 1`,
  supplier: `SELECT 1 FROM qms_suppliers WHERE organization_id = $1 AND deleted_at IS NULL
              AND (supplier_code = $2 OR supplier_name = $2) LIMIT 1`,
};
const DOCUMENT_BY_ID = `SELECT 1 FROM qms_documents WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1`;

async function refuseUnresolvedTarget(client: RequestSqlClient, orgId: number, p: { linkType: string; linkedRef: string; linkedId?: number | null }): Promise<void> {
  const q = queryRowsClient(client);
  const byRef = LINK_TARGET_BY_REF[p.linkType];
  if (byRef && (await q.query(byRef, [orgId, p.linkedRef])).rows.length === 0) {
    throw new ChangeLinkRefusedError(`No ${p.linkType} ${p.linkedRef} is recorded in this organisation. Link a record from its register. Nothing was linked.`);
  }
  if ((p.linkType === 'document' || p.linkType === 'sop') && p.linkedId != null
      && (await q.query(DOCUMENT_BY_ID, [orgId, p.linkedId])).rows.length === 0) {
    throw new ChangeLinkRefusedError(`Controlled document ${p.linkedId} is not in this organisation. Nothing was linked.`);
  }
}

export async function addLink(orgId: number, changeId: number, p: {
  linkType: string; linkedRef: string; linkedLabel?: string | null; linkedId?: number | null;
  relationship?: string; note?: string | null; createdBy?: number | null;
}, client: RequestSqlClient = pool): Promise<ChangeLinkRow> {
  await refuseUnresolvedTarget(client, orgId, p);
  const { rows } = await queryRowsClient(client).query<ChangeLinkRow>(
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

/**
 * Remove a link: it is kept, stamped with who removed it, when and why, and no
 * reader lists it again (MR-12 Stage 8). False when it is not a standing link
 * of this change.
 */
export async function removeLink(orgId: number, changeId: number, linkId: number,
  removal: { removedBy: number; reason: string }, client: RequestSqlClient = pool): Promise<boolean> {
  const { rows } = await queryRowsClient(client).query(
    `UPDATE qms_change_links SET removed_at = NOW(), removed_by = $4, removal_reason = $5
      WHERE id = $1 AND change_id = $2 AND organization_id = $3 AND removed_at IS NULL RETURNING id`,
    [linkId, changeId, orgId, removal.removedBy, removal.reason],
  );
  return rows.length > 0;
}

// ─── Register summary (KPIs for the Change Control surface) ───────────────────

export interface ChangeControlSummary {
  total: number;
  open: number;                 // anything not closed/rejected/cancelled
  awaitingApproval: number;     // under_assessment
  inImplementation: number;
  awaitingVerification: number; // verification
  closed: number;
  overdueImplementation: number; // past target date, implementation unfinished (IMPLEMENTATION_UNFINISHED_STATES)
  byStatus: Record<string, number>;
}

export async function changeControlSummary(orgId: number, client: RequestSqlClient = pool): Promise<ChangeControlSummary> {
  const { rows } = await queryRowsClient(client).query<{ status: string; n: string; overdue: string }>(
    `SELECT status,
            COUNT(*) AS n,
            COUNT(*) FILTER (WHERE ${IMPLEMENTATION_OVERDUE_SQL}) AS overdue
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
