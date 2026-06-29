/**
 * Protocol Budget service (Capability C2C-22)
 *
 * Tenant-scoped: add per-subject budget line items, set the study budget params
 * (one row per document, upsert), and read the computed budget + feasibility
 * summary. Mutations run inside the caller's transaction with the governed-action
 * ledger.
 *
 * @module server/services/protocol-budget/protocol-budget-service
 */

import { pool } from '../../db';
import { computeProtocolBudget, type ProtocolBudgetSummary } from './protocol-budget-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolBudgetError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolBudgetError';
  }
}

const CATEGORIES = ['personnel', 'procedure', 'lab', 'imaging', 'overhead', 'equipment', 'patient_stipend', 'other'];
const PAYERS = ['sponsor', 'institution', 'other'];

export async function addBudgetItemTx(client: Queryable, orgId: number, userId: number, protocolDocumentId: number, input: { category?: string; description: string; unitCost: number; quantityPerSubject?: number; payer?: string }): Promise<{ id: number }> {
  if (input.category && !CATEGORIES.includes(input.category)) throw new ProtocolBudgetError('BAD_INPUT', `Invalid category "${input.category}".`);
  if (input.payer && !PAYERS.includes(input.payer)) throw new ProtocolBudgetError('BAD_INPUT', `Invalid payer "${input.payer}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_budget_items (organization_id, protocol_document_id, category, description, unit_cost, quantity_per_subject, payer, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orgId, protocolDocumentId, input.category ?? 'other', input.description, input.unitCost, input.quantityPerSubject ?? 1, input.payer ?? 'sponsor', userId],
  );
  return { id: Number(rows[0].id) };
}

export async function setBudgetParamsTx(client: Queryable, orgId: number, userId: number, protocolDocumentId: number, input: { targetEnrollment?: number; sponsorPaymentPerSubject?: number | null; indirectRatePct?: number | null }): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO protocol_budget_params (organization_id, protocol_document_id, target_enrollment, sponsor_payment_per_subject, indirect_rate_pct, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (protocol_document_id) DO UPDATE SET
        target_enrollment = COALESCE($3, protocol_budget_params.target_enrollment),
        sponsor_payment_per_subject = $4,
        indirect_rate_pct = $5,
        updated_at = now()
     RETURNING id`,
    [orgId, protocolDocumentId, input.targetEnrollment ?? 0, input.sponsorPaymentPerSubject ?? null, input.indirectRatePct ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function getBudgetSummary(orgId: number, protocolDocumentId: number): Promise<ProtocolBudgetSummary & { items: any[] }> {
  const items = await pool.query(
    `SELECT id, category, description, unit_cost, quantity_per_subject, payer FROM protocol_budget_items
      WHERE organization_id = $1 AND protocol_document_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [orgId, protocolDocumentId],
  );
  const p = await pool.query(`SELECT target_enrollment, sponsor_payment_per_subject, indirect_rate_pct FROM protocol_budget_params WHERE organization_id = $1 AND protocol_document_id = $2 LIMIT 1`, [orgId, protocolDocumentId]);
  const params = p.rows[0] ?? {};
  const summary = computeProtocolBudget(
    items.rows.map((r) => ({ category: r.category, unitCost: Number(r.unit_cost), quantityPerSubject: Number(r.quantity_per_subject), payer: r.payer })),
    {
      targetEnrollment: params.target_enrollment != null ? Number(params.target_enrollment) : 0,
      sponsorPaymentPerSubject: params.sponsor_payment_per_subject != null ? Number(params.sponsor_payment_per_subject) : null,
      indirectRatePct: params.indirect_rate_pct != null ? Number(params.indirect_rate_pct) : null,
    },
  );
  return { ...summary, items: items.rows };
}
