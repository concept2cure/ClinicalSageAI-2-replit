/**
 * The one read of what a commitment's fulfilment signature binds (P-40,
 * 2026-10-19).
 *
 * Two places compute commitmentFulfilmentDigest: the content binder, at the
 * moment of signing (part11/governed-target-binders.ts), and the list read,
 * every time a fulfilment is shown with "the signature matches the record"
 * (commitment-fulfilment.ts, commitmentsForViewer). If each wrote its own SQL,
 * a difference in a join or a date format would report a signature as not
 * matching a record nobody changed. So both call this, and the digest input
 * comes from one statement:
 *   - dates as their own yyyy-mm-dd text (node-pg reads a DATE as a local
 *     midnight, which a server east or west of UTC turns into another day);
 *   - the sequence joined in this organisation, without a deleted_at filter,
 *     because its id, number and submission are its identity and a later
 *     removal does not change what was signed (the list says it was removed).
 *
 * Takes the caller's client only: no pool, so it runs on the signing
 * transaction and on the request's tenant-pinned connection alike.
 *
 * @module server/services/ha-interactions/fulfilment-record
 */
import type { CommitmentFulfilmentContent } from './ha-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface CommitmentFulfilmentRecord {
  status: string;
  /** fulfilment_recorded_at is set: this fulfilment was recorded with its recorder. */
  recorded: boolean;
  content: CommitmentFulfilmentContent;
}

const intOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const textOrNull = (v: unknown): string | null => (v == null ? null : String(v));

/** The digest input of each commitment named, keyed by id; absent when not readable in this organisation. */
export async function readCommitmentFulfilmentContent(
  client: Queryable,
  orgId: number,
  ids: number[],
): Promise<Map<number, CommitmentFulfilmentRecord>> {
  const out = new Map<number, CommitmentFulfilmentRecord>();
  if (ids.length === 0) return out;
  const { rows } = await client.query(
    `SELECT rc.id, rc.commitment_type, rc.description, rc.regulatory_basis,
            to_char(rc.due_date, 'YYYY-MM-DD') AS due_date,
            to_char(rc.fulfilled_date, 'YYYY-MM-DD') AS fulfilled_date,
            rc.status, rc.fulfilment_recorded_at IS NOT NULL AS recorded,
            rc.fulfilment_sequence_id, s.sequence_number, s.submission_id AS sequence_submission_id,
            rc.fulfilment_vault_document_id::text AS fulfilment_vault_document_id, rc.fulfilment_vault_sha256
       FROM regulatory_commitments rc
       LEFT JOIN ectd_sequences s
         ON s.id = rc.fulfilment_sequence_id AND s.organization_id = rc.organization_id
      WHERE rc.organization_id = $1 AND rc.id = ANY($2::int[])`,
    [orgId, ids],
  );
  for (const r of rows) {
    const id = Number(r.id);
    out.set(id, {
      status: String(r.status),
      recorded: r.recorded === true,
      content: {
        commitmentId: id,
        commitmentType: String(r.commitment_type),
        description: String(r.description),
        regulatoryBasis: textOrNull(r.regulatory_basis),
        dueDate: textOrNull(r.due_date),
        fulfilledDate: textOrNull(r.fulfilled_date),
        sequenceId: intOrNull(r.fulfilment_sequence_id),
        sequenceNumber: textOrNull(r.sequence_number),
        submissionId: intOrNull(r.sequence_submission_id),
        vaultDocumentId: textOrNull(r.fulfilment_vault_document_id),
        vaultSha256: textOrNull(r.fulfilment_vault_sha256),
      },
    });
  }
  return out;
}
