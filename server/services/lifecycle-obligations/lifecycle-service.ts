/**
 * Lifecycle Obligation service (Capability C2C-11)
 *
 * Tenant-scoped transaction functions over lifecycle_obligations /
 * lifecycle_obligation_events. Creating a periodic obligation (with a recurrence
 * cadence) generates the next dated occurrences via the cadence engine. Mutations
 * run inside the caller's transaction with the governed-action ledger.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/lifecycle-obligations/lifecycle-service
 */

import { pool } from '../../db';
import { generateOccurrences } from './lifecycle-logic';
import type { ObligationType, ObligationRegion } from '../../../shared/schema/lifecycle';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class LifecycleError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

export interface ObligationInput {
  obligationType: ObligationType;
  region: ObligationRegion;
  title: string;
  classification?: string | null;
  productId?: number | null;
  submissionId?: number | null;
  dueDate?: string | null;
  recurrenceMonths?: number | null;
  /** For periodic obligations, the anchor date to generate occurrences from. */
  anchorDate?: string | null;
  occurrencesToGenerate?: number;
}

/**
 * Create an obligation. For a periodic obligation with a recurrence cadence and
 * an anchor date, generate the next N dated occurrences so the calendar is
 * populated immediately.
 */
export async function createObligationTx(client: Queryable, orgId: number, userId: number, input: ObligationInput): Promise<{ id: number; occurrencesCreated: number }> {
  const { rows } = await client.query(
    `INSERT INTO lifecycle_obligations
       (organization_id, product_id, submission_id, obligation_type, region, classification, title, status, due_date, recurrence_months, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'planned',$8,$9,$10) RETURNING id`,
    [orgId, input.productId ?? null, input.submissionId ?? null, input.obligationType, input.region, input.classification ?? null, input.title, input.dueDate ?? null, input.recurrenceMonths ?? null, userId],
  );
  const id = Number(rows[0].id);

  let occurrencesCreated = 0;
  if (input.obligationType === 'periodic_report' && input.recurrenceMonths && input.recurrenceMonths > 0 && input.anchorDate) {
    const occ = generateOccurrences(input.anchorDate, input.recurrenceMonths, Math.min(input.occurrencesToGenerate ?? 4, 24));
    for (const o of occ) {
      await client.query(
        `INSERT INTO lifecycle_obligation_events (organization_id, obligation_id, period_start, period_end, due_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
        [orgId, id, o.periodStart, o.periodEnd, o.dueDate, userId],
      );
      occurrencesCreated++;
    }
  }
  return { id, occurrencesCreated };
}

const OBLIGATION_STATUSES = ['planned', 'in_preparation', 'submitted', 'approved', 'rejected', 'overdue', 'closed'];
export async function setObligationStatusTx(client: Queryable, orgId: number, id: number, status: string, submittedDate?: string | null): Promise<void> {
  if (!OBLIGATION_STATUSES.includes(status)) throw new LifecycleError('BAD_INPUT', `Invalid status "${status}".`);
  const r = await client.query(
    `UPDATE lifecycle_obligations SET status = $3, submitted_date = COALESCE($4, submitted_date), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, status === 'submitted' ? (submittedDate ?? new Date().toISOString().slice(0, 10)) : submittedDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new LifecycleError('NOT_FOUND', 'Obligation not found for this organization.');
}

const EVENT_STATUSES = ['pending', 'in_preparation', 'submitted', 'approved', 'overdue'];
export async function setEventStatusTx(client: Queryable, orgId: number, eventId: number, status: string, submittedDate?: string | null): Promise<void> {
  if (!EVENT_STATUSES.includes(status)) throw new LifecycleError('BAD_INPUT', `Invalid status "${status}".`);
  const r = await client.query(
    `UPDATE lifecycle_obligation_events SET status = $3, submitted_date = COALESCE($4, submitted_date), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [eventId, orgId, status, status === 'submitted' ? (submittedDate ?? new Date().toISOString().slice(0, 10)) : submittedDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new LifecycleError('NOT_FOUND', 'Event not found for this organization.');
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listObligations(orgId: number, productId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, product_id, submission_id, obligation_type, region, classification, title, status, due_date, recurrence_months
               FROM lifecycle_obligations WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (productId != null) { params.push(productId); sql += ` AND product_id = $2`; }
  sql += ` ORDER BY due_date ASC NULLS LAST, id`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function listCalendar(orgId: number): Promise<Array<{ dueDate: string | null; status: string; kind: 'obligation' | 'event' }>> {
  const obl = await pool.query(`SELECT due_date, status FROM lifecycle_obligations WHERE organization_id = $1 AND deleted_at IS NULL`, [orgId]);
  const evt = await pool.query(`SELECT due_date, status FROM lifecycle_obligation_events WHERE organization_id = $1 AND deleted_at IS NULL`, [orgId]);
  return [
    ...obl.rows.map((r) => ({ dueDate: r.due_date, status: r.status, kind: 'obligation' as const })),
    ...evt.rows.map((r) => ({ dueDate: r.due_date, status: r.status, kind: 'event' as const })),
  ];
}

export async function listEvents(orgId: number, obligationId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, period_start, period_end, due_date, status, submitted_date FROM lifecycle_obligation_events
      WHERE obligation_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY due_date`,
    [obligationId, orgId],
  );
  return rows;
}
