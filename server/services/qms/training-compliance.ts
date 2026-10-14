import type { TrainingSqlClient } from './training';
import type { QmsDocumentRow } from './document-approval-signature';
import { describeQmsTrainingDocument, verifiedTrainingReceipt } from './training-content';
import { ACCOUNT_STATUS_ACTIVE } from '../account-standing';
import { QMS_TRAINABLE_DOCUMENT_TYPES } from '../../../shared/qms/training';

/** Roster coverage is distinct active current members, exact released version and digest. */
export async function readQmsTrainingCompliance(client: TrainingSqlClient, organizationId: number, now = new Date()) {
  const roster = await client.query(
    `SELECT ou.user_id FROM organization_users ou JOIN users u ON u.id = ou.user_id
       JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.organization_id = $1 AND u.status = $2 AND o.status = $2`,
    [organizationId, ACCOUNT_STATUS_ACTIVE],
  );
  const activeMembers = new Set(roster.rows.map(row => Number(row.user_id)));
  const documents = await client.query(
    `SELECT * FROM qms_documents WHERE organization_id = $1 AND deleted_at IS NULL
      AND status = 'effective' AND doc_type = ANY($2::text[])
      AND (effective_date IS NULL OR effective_date <= $3::date) ORDER BY doc_number LIMIT 200`,
    [organizationId, QMS_TRAINABLE_DOCUMENT_TYPES, now.toISOString().slice(0, 10)],
  );
  const records = await client.query(
    `SELECT t.* FROM qms_training_records t JOIN qms_documents d
       ON d.id = t.document_id AND d.organization_id = t.organization_id
      WHERE t.organization_id = $1 AND t.document_version = d.version
        AND t.metadata->>'contentDigest' = d.metadata->'approval'->>'contentDigest'
        AND t.acknowledgment_method = 'attestation' AND t.trainer_id IS NULL AND t.quiz_score IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > $2::timestamptz)`,
    [organizationId, now.toISOString()],
  );
  const receipts = records.rows.map(row => verifiedTrainingReceipt(row, now)).filter(row => row !== null);
  return documents.rows.map(raw => {
    const document = raw as QmsDocumentRow;
    const context = describeQmsTrainingDocument(document, now);
    const matching = context.eligible ? receipts.filter(receipt => activeMembers.has(receipt.userId) &&
      receipt.documentId === document.id && receipt.documentVersion === document.version && receipt.contentDigest === context.contentDigest) : [];
    const latest = matching.map(row => row.acknowledgedAt).sort().at(-1) ?? null;
    return { id: document.id, doc_number: document.doc_number, title: document.title,
      document_version: document.version, content_digest: context.contentDigest,
      eligible: context.eligible, unavailable_reason: context.unavailableReason,
      current: new Set(matching.map(row => row.userId)).size, of: activeMembers.size, last_cycle: latest };
  });
}
