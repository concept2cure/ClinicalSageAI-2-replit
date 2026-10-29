/**
 * A nonconformance's disposition, as a signed decision (2026-10-29).
 *
 * 21 CFR 820.90(b)(1): the disposition of nonconforming product is documented,
 * with the justification for use as is and the signature of the person who
 * authorized it. The disposition was a PATCH any editor could send, with an
 * optional rationale and an audit row beside it, and a second PATCH overwrote
 * it. It is now written only inside the platform's one signing ceremony
 * (routes/governed-signed-act.ts). The signer gives a password, a meaning
 * (approval or responsibility) and a reason, which is recorded as the
 * disposition's rationale. A record already dispositioned refuses: a signed
 * disposition is not overwritten. `pending` is the open state, never a decision.
 *
 * @module server/services/qms/nonconformance-disposition
 */

/** The decisions a disposition can sign; `pending` (the open state) is not one. */
export const NC_DISPOSITION_DECISIONS = ['use_as_is', 'rework', 'regrade', 'scrap', 'return_to_supplier'] as const;
export type NcDispositionDecision = (typeof NC_DISPOSITION_DECISIONS)[number];

export const NC_DISPOSITION_CODE_STATUS: Readonly<Record<string, number>> = { NC_NOT_FOUND: 404, NC_ALREADY_DISPOSITIONED: 409 };

export class NcDispositionRefused extends Error {
  constructor(readonly code: 'NC_NOT_FOUND' | 'NC_ALREADY_DISPOSITIONED', message: string) { super(message); }
}

interface SqlClient { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }

/** On the signing transaction: set the disposition of an open record, or refuse. */
export async function recordNcDisposition(
  client: SqlClient, organizationId: number, id: number, disposition: NcDispositionDecision, rationale: string,
): Promise<Record<string, unknown>> {
  const { rows } = await client.query(`UPDATE qms_nonconforming_products
        SET disposition = $3, disposition_rationale = $4, disposition_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND (disposition IS NULL OR disposition = 'pending')
      RETURNING *`, [id, organizationId, disposition, rationale]);
  if (rows.length === 1) return rows[0];
  const existing = await client.query(
    `SELECT disposition FROM qms_nonconforming_products WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
  if (existing.rows.length === 0) throw new NcDispositionRefused('NC_NOT_FOUND', 'That nonconformance is not in this organization. Nothing was signed.');
  throw new NcDispositionRefused('NC_ALREADY_DISPOSITIONED',
    `This nonconformance is already dispositioned (${String(existing.rows[0].disposition)}). A signed disposition is not changed. Nothing was signed.`);
}
