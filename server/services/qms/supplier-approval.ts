/**
 * A supplier's approval standing, as a signed decision (2026-10-29).
 *
 * Approving, conditionally approving or revoking a supplier is a quality
 * decision (21 CFR 820.50; ISO 13485 §7.4.1). It was a field any editor could
 * PATCH with an audit row beside it, or set at creation. It is now written only
 * inside the platform's one signing ceremony (routes/governed-signed-act.ts),
 * with the signer's password, a meaning (approval or responsibility) and a
 * reason. A new supplier is recorded as pending, the PATCH refuses the
 * standing, and a decision that would not change it is refused. Approving or
 * conditionally approving dates the approval on the day it is signed.
 *
 * @module server/services/qms/supplier-approval
 */

/** The standings a signature can set; `pending` is where a supplier starts. */
export const SUPPLIER_APPROVAL_DECISIONS = ['approved', 'conditional', 'revoked'] as const;
export type SupplierApprovalDecision = (typeof SUPPLIER_APPROVAL_DECISIONS)[number];

export const SUPPLIER_APPROVAL_CODE_STATUS: Readonly<Record<string, number>> = { SUPPLIER_NOT_FOUND: 404, SUPPLIER_STANDING_UNCHANGED: 409 };

export class SupplierApprovalRefused extends Error {
  constructor(readonly code: 'SUPPLIER_NOT_FOUND' | 'SUPPLIER_STANDING_UNCHANGED', message: string) { super(message); }
}

interface SqlClient { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }

/** On the signing transaction: set the supplier's standing, or refuse. */
export async function recordSupplierApproval(
  client: SqlClient, organizationId: number, id: number, decision: SupplierApprovalDecision,
): Promise<Record<string, unknown>> {
  const { rows } = await client.query(`UPDATE qms_suppliers
        SET approval_status = $3::text,
            approval_date = CASE WHEN $3::text IN ('approved', 'conditional') THEN CURRENT_DATE ELSE approval_date END,
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND approval_status IS DISTINCT FROM $3::text
      RETURNING *`, [id, organizationId, decision]);
  if (rows.length === 1) return rows[0];
  const existing = await client.query(
    `SELECT approval_status FROM qms_suppliers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, organizationId]);
  if (existing.rows.length === 0) throw new SupplierApprovalRefused('SUPPLIER_NOT_FOUND', 'That supplier is not in this organization. Nothing was signed.');
  throw new SupplierApprovalRefused('SUPPLIER_STANDING_UNCHANGED', `This supplier is already ${decision}. Nothing was signed.`);
}
