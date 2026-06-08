/**
 * audit/regulatedDeletion — fail-closed audit primitive for deleting regulated
 * records (21 CFR Part 11 §11.10(e)).
 *
 * Writes a single hash-chained `audit_logs` row recording the deletion of a
 * regulated record, INCLUDING a full pre-image snapshot of the row in
 * `old_values`. Because the snapshot lives in the immutable, tamper-evident
 * chain, the record content remains retrievable after the row is removed from
 * the live table (§11.10(c) retrievability), and the deletion is attributed and
 * reason-stamped (§11.10(e), §11.10(k)).
 *
 * Contract: the caller passes a DB client that is ALREADY inside an open
 * transaction, calls this BEFORE issuing the DELETE, and performs the DELETE on
 * the SAME client/transaction. This function throws on any failure, so an audit
 * write failure rolls back the transaction and the delete never commits
 * (fail-closed). It intentionally does NOT depend on the c2c typed-target
 * resolver, so it works for any regulated table.
 *
 * Reuses the same chain serialization as `recordGovernedAction` /
 * `computeAuditChain`, so the audit_logs chain stays valid across writers.
 */

import { randomUUID } from 'crypto';
import { computeAuditChain, hashPayload, type PoolClient } from './chain';

export interface RegulatedDeletionParams {
  /** SQL table name of the regulated record, e.g. 'ind_applications'. */
  table: string;
  /** Primary key of the record being deleted. */
  recordId: string | number;
  /** Owning tenant/org id — `audit_logs.tenant_id` is NOT NULL. */
  tenantId: number;
  /** Acting user id, or null when the actor is a system/admin token. */
  actorId: number | null;
  /** Human reason for the deletion (truncated to a sane length). */
  reason: string;
  /** Full pre-image of the row, retained in the immutable trail. */
  snapshot: Record<string, unknown> | null;
}

export interface RegulatedDeletionResult {
  auditId: string;
  sha256Chain: string;
}

const MAX_REASON = 500;

export async function logRegulatedDeletion(
  client: PoolClient,
  params: RegulatedDeletionParams
): Promise<RegulatedDeletionResult> {
  const { table, recordId, tenantId, actorId } = params;

  if (!Number.isFinite(tenantId)) {
    // Fail closed: without a tenant we cannot attribute the deletion.
    throw new Error('logRegulatedDeletion: a numeric tenantId is required for the audit trail');
  }

  const reason = (params.reason || 'Regulated record deleted').slice(0, MAX_REASON);
  const recordIdStr = String(recordId);
  const auditId = randomUUID();
  const occurredAt = new Date().toISOString();
  const action = `regulated.delete.${table}`;
  const target = `${table}:${recordIdStr}`;
  const snapshot = params.snapshot ?? null;

  const payload = { table, recordId: recordIdStr, reason, deletedBy: actorId, snapshot };
  const payloadHash = hashPayload(payload);

  // Locks the audit-chain tail (SELECT … FOR UPDATE) inside the caller's txn.
  const sha256Chain = await computeAuditChain(client, {
    action,
    actor_id: actorId,
    target,
    payload_hash: payloadHash,
    occurred_at: occurredAt,
  });

  await client.query(
    `INSERT INTO audit_logs
       (id, tenant_id, user_id, action, table_name, record_id,
        actor_id, target, target_type, target_id, reason, payload_hash,
        old_values, sha256_chain, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      auditId,
      tenantId,
      actorId,
      action,
      table,
      recordIdStr,
      actorId,
      target,
      table,
      recordIdStr,
      reason,
      payloadHash,
      snapshot ? JSON.stringify(snapshot) : null,
      sha256Chain,
      occurredAt,
    ]
  );

  return { auditId, sha256Chain };
}
