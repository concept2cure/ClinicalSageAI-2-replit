import type { TrainingSqlClient } from './training';
import type { QmsDocumentRow } from './document-approval-signature';
import { verifiedTrainingReceipt } from './training-content';
import { readQmsTrainingReleaseContext } from './current-release-approval';
import { readInForceReleases } from './in-force-release';
import { ACCOUNT_STATUS_ACTIVE } from '../account-standing';
import { QMS_TRAINABLE_DOCUMENT_TYPES, type QmsTrainingAcknowledgement } from '../../../shared/qms/training';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The verified current receipts of the active roster, per release in force: the
 * exact released version and digest, unexpired, attested by the member. Coverage
 * and expiry are both read from this, so they never disagree about who is current.
 */
async function readCurrentReceipts(client: TrainingSqlClient, organizationId: number, now: Date) {
  const roster = await client.query(
    `SELECT ou.user_id FROM organization_users ou JOIN users u ON u.id = ou.user_id
       JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.organization_id = $1 AND u.status = $2 AND o.status = $2`,
    [organizationId, ACCOUNT_STATUS_ACTIVE],
  );
  const members = new Set(roster.rows.map(row => Number(row.user_id)));
  // The documents in force, including those whose successor is being drafted:
  // the signed predecessor is what members are trained on (in-force-release.ts).
  const candidates = await client.query(
    `SELECT * FROM qms_documents WHERE organization_id = $1 AND deleted_at IS NULL
      AND status IN ('effective', 'draft', 'in_review') AND doc_type = ANY($2::text[]) ORDER BY doc_number LIMIT 200`,
    [organizationId, QMS_TRAINABLE_DOCUMENT_TYPES],
  );
  const today = now.toISOString().slice(0, 10);
  const inForce = await readInForceReleases(client, organizationId, candidates.rows as unknown as QmsDocumentRow[]);
  const documents = [...inForce.values()].map(entry => entry.release)
    .filter(release => !release.effective_date || String(release.effective_date instanceof Date
      ? release.effective_date.toISOString() : release.effective_date).slice(0, 10) <= today)
    .sort((a, b) => String(a.doc_number).localeCompare(String(b.doc_number)));
  // A receipt counts only for the exact version and digest in force; that match is made below, per release.
  const records = await client.query(
    `SELECT t.* FROM qms_training_records t
      WHERE t.organization_id = $1 AND t.document_id = ANY($2::int[])
        AND t.acknowledgment_method = 'attestation' AND t.trainer_id IS NULL AND t.quiz_score IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > $3::timestamptz)`,
    [organizationId, documents.map(release => release.id), now.toISOString()],
  );
  const receipts = records.rows.map(row => verifiedTrainingReceipt(row, now)).filter(row => row !== null);
  const releases = [];
  for (const raw of documents) {
    const document = raw as QmsDocumentRow;
    const { context } = await readQmsTrainingReleaseContext(client, document, now);
    const matching: QmsTrainingAcknowledgement[] = context.eligible ? receipts.filter(receipt => members.has(receipt.userId) &&
      receipt.documentId === document.id && receipt.documentVersion === document.version && receipt.contentDigest === context.contentDigest) : [];
    releases.push({ document, context, matching });
  }
  return { members, releases };
}

/** Roster coverage is distinct active current members, exact released version and digest. */
export async function readQmsTrainingCompliance(client: TrainingSqlClient, organizationId: number, now = new Date()) {
  const { members, releases } = await readCurrentReceipts(client, organizationId, now);
  return releases.map(({ document, context, matching }) => ({
    id: document.id, doc_number: document.doc_number, title: document.title,
    document_version: document.version, content_digest: context.contentDigest,
    eligible: context.eligible, unavailable_reason: context.unavailableReason,
    current: new Set(matching.map(row => row.userId)).size, of: members.size,
    last_cycle: matching.map(row => row.acknowledgedAt).sort().at(-1) ?? null,
  }));
}

export interface QmsTrainingExpiry {
  userId: number;
  userName: string | null;
  documentId: number;
  docNumber: string;
  title: string;
  documentVersion: string;
  /** When the member's training on this release lapses: the latest expiry among their current receipts. */
  expiresAt: string;
  daysLeft: number;
}

/**
 * Each active member whose training on a release in force lapses within
 * `withinDays`: who must train again, on what, and by when (G10). A member is
 * current until the latest expiry among their current receipts, so a renewal
 * replaces the receipt it renews, and a receipt with no expiry means no lapse.
 * A member already lapsed has no current receipt; coverage counts them as not
 * trained, and they are not listed here.
 */
export async function readQmsTrainingExpiring(
  client: TrainingSqlClient, organizationId: number, withinDays: number, now = new Date(),
): Promise<QmsTrainingExpiry[]> {
  const { releases } = await readCurrentReceipts(client, organizationId, now);
  const horizon = now.getTime() + withinDays * DAY_MS;
  const out: Array<Omit<QmsTrainingExpiry, 'userName'>> = [];
  for (const { document, matching } of releases) {
    const lapse = new Map<number, string | null>();
    for (const r of matching) {
      const was = lapse.get(r.userId);
      if (was === null) continue;
      lapse.set(r.userId, r.expiresAt == null ? null : (was === undefined || r.expiresAt > was ? r.expiresAt : was));
    }
    for (const [userId, expiresAt] of lapse) {
      if (expiresAt === null || new Date(expiresAt).getTime() > horizon) continue;
      out.push({
        userId, documentId: Number(document.id), docNumber: String(document.doc_number),
        title: String(document.title), documentVersion: String(document.version), expiresAt,
        daysLeft: Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS),
      });
    }
  }
  if (out.length === 0) return [];
  // Names only for the people listed; coverage reads no name.
  const named = await client.query(`SELECT id, name FROM users WHERE id = ANY($1::int[])`, [[...new Set(out.map(r => r.userId))]]);
  const names = new Map(named.rows.map(row => [Number(row.id), typeof row.name === 'string' ? row.name : null]));
  return out.map(r => ({ ...r, userName: names.get(r.userId) ?? null }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.docNumber.localeCompare(b.docNumber));
}
