import type { TrainingSqlClient } from './training';
import type { QmsDocumentRow } from './document-approval-signature';
import { verifiedTrainingReceipt } from './training-content';
import { readQmsTrainingReleaseContext } from './current-release-approval';
import { readInForceReleases } from './in-force-release';
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
  // The documents in force, including those whose successor is being drafted:
  // the signed predecessor is what members are trained on (in-force-release.ts).
  const candidates = await client.query(
    `SELECT * FROM qms_documents WHERE organization_id = $1 AND deleted_at IS NULL
      AND status IN ('effective', 'draft', 'in_review') AND doc_type = ANY($2::text[]) ORDER BY doc_number LIMIT 200`,
    [organizationId, QMS_TRAINABLE_DOCUMENT_TYPES],
  );
  const today = now.toISOString().slice(0, 10);
  const inForce = await readInForceReleases(client, organizationId, candidates.rows as unknown as QmsDocumentRow[]);
  const documents = { rows: [...inForce.values()].map(entry => entry.release)
    .filter(release => !release.effective_date || String(release.effective_date instanceof Date
      ? release.effective_date.toISOString() : release.effective_date).slice(0, 10) <= today)
    .sort((a, b) => String(a.doc_number).localeCompare(String(b.doc_number))) };
  // A receipt counts only for the exact version and digest in force; that match is made below, per release.
  const records = await client.query(
    `SELECT t.* FROM qms_training_records t
      WHERE t.organization_id = $1 AND t.document_id = ANY($2::int[])
        AND t.acknowledgment_method = 'attestation' AND t.trainer_id IS NULL AND t.quiz_score IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > $3::timestamptz)`,
    [organizationId, documents.rows.map(release => release.id), now.toISOString()],
  );
  const receipts = records.rows.map(row => verifiedTrainingReceipt(row, now)).filter(row => row !== null);
  const result = [];
  for (const raw of documents.rows) {
    const document = raw as QmsDocumentRow;
    const { context } = await readQmsTrainingReleaseContext(client, document, now);
    const matching = context.eligible ? receipts.filter(receipt => activeMembers.has(receipt.userId) &&
      receipt.documentId === document.id && receipt.documentVersion === document.version && receipt.contentDigest === context.contentDigest) : [];
    const latest = matching.map(row => row.acknowledgedAt).sort().at(-1) ?? null;
    result.push({ id: document.id, doc_number: document.doc_number, title: document.title,
      document_version: document.version, content_digest: context.contentDigest,
      eligible: context.eligible, unavailable_reason: context.unavailableReason,
      current: new Set(matching.map(row => row.userId)).size, of: activeMembers.size, last_cycle: latest });
  }
  return result;
}
