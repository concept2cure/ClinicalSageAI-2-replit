/**
 * A sequence's history, as the ledger records it: the submission's own rows
 * (who created it, and when) and every placement in the sequence, removed ones
 * included, newest first, with the server's verdict on the tenant chain.
 *
 * Filing-spine design review, open item 3 (2026-10-15): creation was recorded
 * (SUBMISSION_CREATED) and never shown, and the Builder showed no leaf history
 * (who placed it, when, what it replaced). Both are already rows of the one
 * ledger; this reads them through its one per-record reader
 * (readRecordAuditHistory), as the Vault's document history does, and adds no
 * second audit SQL. The caller has already admitted the sequence
 * (readSubmissionSequenceForRequest); the read is re-checked against that
 * admission before it is returned.
 *
 * Each leaf entry is named by the section its leaf was placed at, read from the
 * leaf record, never from the audit payload.
 *
 * @module server/services/submission-service/submission-history-read
 */
import type { PoolClient } from 'pg';
import type { RequestSqlClient } from '../../db/requestDb';
import { readRecordAuditHistory, type AuditLedgerChainVerdict } from '../../routes/audit-trail-ledger.routes';
import { requireSubmissionReadStillCurrent, type AdmittedSubmissionSequence } from './submission-request-read';

/** The most entries one read returns; a longer history says it was cut. */
export const SUBMISSION_HISTORY_WINDOW = 200;

export interface SubmissionHistoryEntry {
  id: string;
  event: string;
  /** The section a placement entry was recorded against; null for the submission's own rows. */
  section: string | null;
  actor: string;
  at: string;
  when: string;
  hash: string;
  seq: number | null;
  reason: string | null;
}

export interface SubmissionHistory {
  entries: SubmissionHistoryEntry[];
  chain: AuditLedgerChainVerdict;
  truncated: boolean;
}

export async function readSubmissionHistoryForRequest(
  q: RequestSqlClient,
  admitted: AdmittedSubmissionSequence,
): Promise<SubmissionHistory> {
  const leaves = await q.query(
    `SELECT l.id::text AS id, l.section_code FROM submission_leaves l
      WHERE l.sequence_id = $1 AND l.organization_id = $2`,
    [admitted.sequenceId, admitted.organizationId],
  );
  const sectionOf = new Map(leaves.rows.map((r) => [`submission_leaf:${String(r.id)}`, String(r.section_code)]));
  const history = await readRecordAuditHistory(q as Pick<PoolClient, 'query'>, admitted.organizationId, {
    tableName: 'submission',
    recordId: String(admitted.submissionId),
    limit: SUBMISSION_HISTORY_WINDOW + 1,
    also: [{ tableName: 'submission_leaf', recordId: [...sectionOf.keys()].map((k) => k.slice('submission_leaf:'.length)) }],
  });
  await requireSubmissionReadStillCurrent(q, admitted);
  const entries = history.data.slice(0, SUBMISSION_HISTORY_WINDOW).map((e) => ({
    id: e.id,
    event: e.event,
    section: sectionOf.get(e.target) ?? null,
    actor: e.actor,
    at: e.at,
    when: e.when,
    hash: e.hash,
    seq: e.seq,
    reason: e.reason,
  }));
  return { entries, chain: history.meta.chain, truncated: history.data.length > SUBMISSION_HISTORY_WINDOW };
}
