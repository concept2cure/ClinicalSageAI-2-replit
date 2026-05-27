/**
 * audit/chain — SHA-256 hash-chain computation for audit_logs.
 *
 * Every new audit_logs row gets a sha256_chain value that commits it into an
 * append-only chain. The chain makes silent tampering detectable: any edit to
 * a prior row breaks all subsequent links.
 *
 * Algorithm: sha256(JSON.stringify({ action, actor_id, target, payload_hash,
 *   occurred_at, previous: prev_sha256_chain }))
 *
 * The caller MUST hold the most-recent-row lock (SELECT FOR UPDATE) before
 * calling this function so concurrent writes don't fork the chain.
 *
 * 21 CFR Part 11 §11.10(e) compliance: integrity of audit records.
 */

import { createHash } from 'crypto';

export interface ChainRow {
  action:       string;
  actor_id:     number | null;
  target:       string | null;
  payload_hash: string | null;
  occurred_at:  string | Date;
}

export interface PoolClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Compute the sha256_chain value for the next audit_logs row.
 *
 * @param client - A pool client that is already inside the caller's transaction.
 *                 The SELECT FOR UPDATE is issued here; the caller must not
 *                 release the transaction until after the INSERT.
 * @param row    - The row about to be inserted (id not yet assigned).
 */
export async function computeAuditChain(
  client: PoolClient,
  row: ChainRow,
): Promise<string> {
  const prev = await client.query(
    `SELECT sha256_chain FROM audit_logs WHERE sha256_chain IS NOT NULL
     ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE`,
  );

  const previousHash: string = (prev.rows[0]?.sha256_chain as string | undefined) ?? '0'.repeat(64);

  const canonical = JSON.stringify({
    action:       row.action,
    actor_id:     row.actor_id,
    target:       row.target,
    payload_hash: row.payload_hash,
    occurred_at:  row.occurred_at instanceof Date
      ? row.occurred_at.toISOString()
      : row.occurred_at,
    previous:     previousHash,
  });

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * SHA-256 hash of an arbitrary payload object. Used to fill payload_hash
 * before calling computeAuditChain.
 */
export function hashPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
}
