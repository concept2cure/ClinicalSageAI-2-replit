/**
 * Protocol Milestones service (Capability C2C-20b)
 *
 * Tenant-scoped: add milestones to a protocol document, transition status (stamping
 * the actual date when met), and read the deterministic timeline summary. Mutations
 * run inside the caller's transaction with the governed-action ledger.
 *
 * @module server/services/protocol-milestones/protocol-milestones-service
 */

import { pool } from '../../db';
import { summarizeTimeline, type TimelineSummary } from './protocol-milestones-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolMilestoneError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolMilestoneError';
  }
}

const TYPES = ['protocol_approval', 'irb_submission', 'site_activation', 'first_subject', 'last_subject', 'enrollment_complete', 'database_lock', 'csr', 'closeout', 'other'];
const STATUSES = ['planned', 'in_progress', 'met', 'missed', 'cancelled'];

export async function addMilestoneTx(client: Queryable, orgId: number, userId: number, protocolDocumentId: number, input: { name: string; milestoneType?: string; targetDate?: string | null; notes?: string | null }): Promise<{ id: number }> {
  if (input.milestoneType && !TYPES.includes(input.milestoneType)) throw new ProtocolMilestoneError('BAD_INPUT', `Invalid milestone_type "${input.milestoneType}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_milestones (organization_id, protocol_document_id, name, milestone_type, target_date, status, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,'planned',$6,$7) RETURNING id`,
    [orgId, protocolDocumentId, input.name, input.milestoneType ?? 'other', input.targetDate ?? null, input.notes ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function setMilestoneStatusTx(client: Queryable, orgId: number, milestoneId: number, status: string, actualDate?: string | null): Promise<void> {
  if (!STATUSES.includes(status)) throw new ProtocolMilestoneError('BAD_INPUT', `Invalid status "${status}".`);
  const stamps = status === 'met';
  const r = await client.query(
    `UPDATE protocol_milestones SET status = $3, actual_date = ${stamps ? 'COALESCE($4, actual_date, CURRENT_DATE)' : '$4'}, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [milestoneId, orgId, status, actualDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new ProtocolMilestoneError('NOT_FOUND', 'Milestone not found for this organization.');
}

export async function listMilestones(orgId: number, protocolDocumentId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, name, milestone_type, target_date, actual_date, status, notes FROM protocol_milestones
      WHERE organization_id = $1 AND protocol_document_id = $2 AND deleted_at IS NULL ORDER BY target_date NULLS LAST, id`,
    [orgId, protocolDocumentId],
  );
  return rows;
}

export async function getTimeline(orgId: number, protocolDocumentId: number, today?: string): Promise<TimelineSummary> {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT id, name, milestone_type, target_date::text AS target_date, status FROM protocol_milestones
      WHERE organization_id = $1 AND protocol_document_id = $2 AND deleted_at IS NULL`,
    [orgId, protocolDocumentId],
  );
  return summarizeTimeline(rows.map((r) => ({ id: r.id, name: r.name, milestoneType: r.milestone_type, targetDate: r.target_date, status: r.status })), day);
}
