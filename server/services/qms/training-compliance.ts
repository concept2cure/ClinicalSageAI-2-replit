import type { TrainingSqlClient } from './training';
import type { QmsDocumentRow } from './document-approval-signature';
import { verifiedTrainingReceipt } from './training-content';
import { readQmsTrainingReleaseContext } from './current-release-approval';
import { readInForceReleases } from './in-force-release';
import { readQmsTrainingAssignees, type QmsDocumentAssignees } from './training-assignment';
import { QMS_TRAINABLE_DOCUMENT_TYPES, type QmsTrainingAcknowledgement } from '../../../shared/qms/training';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The verified current receipts per release in force: the exact released
 * version and digest, unexpired, attested by the person. Each release carries
 * who is assigned to it (P-49, the one resolver in training-assignment.ts):
 * coverage and expiry count those people, and both read this, so they never
 * disagree about who is current. Until MR-12 Stage 4 slice 3 the denominator
 * was the organization's whole active roster.
 */
async function readCurrentReceipts(client: TrainingSqlClient, organizationId: number, now: Date) {
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
  const assigned = await readQmsTrainingAssignees(client, organizationId, documents.map(release => Number(release.id)));
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
    const coverage: QmsDocumentAssignees = assigned.get(Number(document.id)) ?? { assignmentRows: 0, assignees: [] };
    const people = new Set(coverage.assignees.map(a => a.userId));
    // Every valid receipt of this exact release, then those of the people assigned to it.
    const released: QmsTrainingAcknowledgement[] = context.eligible ? receipts.filter(receipt =>
      receipt.documentId === document.id && receipt.documentVersion === document.version && receipt.contentDigest === context.contentDigest) : [];
    releases.push({ document, context, coverage, people, released, matching: released.filter(receipt => people.has(receipt.userId)) });
  }
  return { releases };
}

/**
 * Whether a document is assigned: to nobody (`not_assigned`), to roles or
 * people none of whom is active now (`no_active_assignees`), or `assigned`.
 * Only an assigned document has a figure: a document assigned to nobody never
 * reads 0 of N.
 */
export type QmsTrainingAssignmentState = 'assigned' | 'not_assigned' | 'no_active_assignees';

export interface QmsTrainingComplianceRow {
  id: number; doc_number: string; title: string;
  document_version: string; content_digest: string | null;
  eligible: boolean; unavailable_reason: string | null;
  assignment: QmsTrainingAssignmentState;
  /** The distinct people assigned who hold a current receipt of the release in force; null unless assigned. */
  current: number | null;
  /** The distinct active people assigned; null unless assigned. */
  of: number | null;
  last_cycle: string | null;
  /** The viewer's own line: whether they are assigned, and whether their receipt of the release in force counts now. */
  me: { assigned: boolean; countsNow: boolean } | null;
}

const assignmentState = (c: QmsDocumentAssignees): QmsTrainingAssignmentState =>
  (c.assignmentRows === 0 ? 'not_assigned' : c.assignees.length === 0 ? 'no_active_assignees' : 'assigned');

/**
 * Coverage of the people assigned to each document (P-49): distinct people
 * assigned with a current receipt of the exact released version and digest,
 * over the distinct active people assigned. `viewerId` adds their own line.
 */
export async function readQmsTrainingCompliance(
  client: TrainingSqlClient, organizationId: number, now = new Date(), viewerId: number | null = null,
): Promise<QmsTrainingComplianceRow[]> {
  const { releases } = await readCurrentReceipts(client, organizationId, now);
  return releases.map(({ document, context, coverage, people, released, matching }) => {
    const assignment = assignmentState(coverage);
    const counted = assignment === 'assigned';
    return {
      id: Number(document.id), doc_number: String(document.doc_number), title: String(document.title),
      document_version: String(document.version), content_digest: context.contentDigest,
      eligible: context.eligible, unavailable_reason: context.unavailableReason,
      assignment,
      current: counted ? new Set(matching.map(row => row.userId)).size : null,
      of: counted ? coverage.assignees.length : null,
      last_cycle: matching.map(row => row.acknowledgedAt).sort().at(-1) ?? null,
      me: viewerId === null ? null : { assigned: people.has(viewerId), countsNow: released.some(row => row.userId === viewerId) },
    };
  });
}

/**
 * The register's one training figure, computed here and not on the client:
 * how many documents are assigned, to nobody, or to nobody active; how many
 * assigned ones cannot be read; and the mean coverage over the assigned,
 * readable documents with someone assigned. null when there are none, which is
 * "nothing assessed", never 0%.
 */
export function summarizeQmsTrainingCompliance(rows: readonly QmsTrainingComplianceRow[]) {
  const assigned = rows.filter(r => r.assignment === 'assigned');
  const assessed = assigned.filter(r => r.eligible && r.current !== null && r.of !== null && r.of > 0);
  const mean = assessed.reduce((sum, r) => sum + (r.current as number) / (r.of as number), 0) / (assessed.length || 1);
  return {
    documents: rows.length,
    assigned: assigned.length,
    notAssigned: rows.filter(r => r.assignment === 'not_assigned').length,
    noActiveAssignees: rows.filter(r => r.assignment === 'no_active_assignees').length,
    unavailable: assigned.filter(r => !r.eligible).length,
    averageCurrentPct: assessed.length ? Math.round(mean * 100) : null,
  };
}

export interface QmsTrainingExpiry {
  userId: number;
  userName: string | null;
  documentId: number;
  docNumber: string;
  title: string;
  documentVersion: string;
  /** When the member's training on this release lapses, or lapsed: the latest expiry among their receipts. */
  expiresAt: string;
  daysLeft: number;
  /** True when it has lapsed: the member has no current receipt, and their last one on this release expired. */
  lapsed: boolean;
}

type Release = Awaited<ReturnType<typeof readCurrentReceipts>>['releases'][number];

/**
 * The expired receipts on the documents in force, each verified as it stood the
 * moment before it expired: the same receipt rule as coverage, at the receipt's
 * own time. Read only for expiry; coverage counts a lapsed member as not trained.
 */
async function readLapsedReceipts(client: TrainingSqlClient, organizationId: number, documentIds: number[], now: Date) {
  if (documentIds.length === 0) return [];
  const { rows } = await client.query(
    `SELECT t.* FROM qms_training_records t
      WHERE t.organization_id = $1 AND t.document_id = ANY($2::int[])
        AND t.acknowledgment_method = 'attestation' AND t.trainer_id IS NULL AND t.quiz_score IS NULL
        AND t.expires_at IS NOT NULL AND t.expires_at <= $3::timestamptz`,
    [organizationId, documentIds, now.toISOString()],
  );
  return rows.map(row => verifiedTrainingReceipt(row, new Date(new Date(row.expires_at as string | Date).getTime() - 1)))
    .filter(row => row !== null);
}

/** The latest expiry per member among these receipts; null when one never expires. */
function latestExpiry(receipts: QmsTrainingAcknowledgement[]): Map<number, string | null> {
  const lapse = new Map<number, string | null>();
  for (const r of receipts) {
    const was = lapse.get(r.userId);
    if (was === null) continue;
    lapse.set(r.userId, r.expiresAt == null ? null : (was === undefined || r.expiresAt > was ? r.expiresAt : was));
  }
  return lapse;
}

/** A release's lapsing people (current, inside the window) and lapsed people (no current receipt), among those assigned. */
function releaseExpiry(release: Release, lapsedReceipts: QmsTrainingAcknowledgement[], now: Date, horizon: number) {
  const { document, context, matching, people: members } = release;
  const current = latestExpiry(matching);
  const ofRelease = lapsedReceipts.filter(r => members.has(r.userId) && !current.has(r.userId) && context.eligible &&
    r.documentId === document.id && r.documentVersion === document.version && r.contentDigest === context.contentDigest);
  const rows: Array<Omit<QmsTrainingExpiry, 'userName'>> = [];
  const push = (userId: number, expiresAt: string, lapsed: boolean) => rows.push({
    userId, documentId: Number(document.id), docNumber: String(document.doc_number),
    title: String(document.title), documentVersion: String(document.version), expiresAt,
    daysLeft: Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS), lapsed,
  });
  for (const [userId, expiresAt] of current) {
    if (expiresAt !== null && new Date(expiresAt).getTime() <= horizon) push(userId, expiresAt, false);
  }
  for (const [userId, expiresAt] of latestExpiry(ofRelease)) if (expiresAt !== null) push(userId, expiresAt, true);
  return rows;
}

/**
 * Each person assigned (P-49) whose training on a release in force has lapsed, or
 * lapses within `withinDays`: who must train again, on what, and by when (G10). A member
 * is current until the latest expiry among their current receipts, so a renewal
 * replaces the receipt it renews, and a receipt with no expiry means no lapse. A
 * member has lapsed when they hold no current receipt and their last receipt on
 * the exact release in force, verified while it ran, has expired. Training on a
 * superseded version is not a lapse: it is training not yet done on the new one,
 * which coverage counts.
 */
export async function readQmsTrainingExpiring(
  client: TrainingSqlClient, organizationId: number, withinDays: number, now = new Date(),
): Promise<QmsTrainingExpiry[]> {
  const { releases } = await readCurrentReceipts(client, organizationId, now);
  const lapsedReceipts = await readLapsedReceipts(client, organizationId, releases.map(r => Number(r.document.id)), now);
  const horizon = now.getTime() + withinDays * DAY_MS;
  const out = releases.flatMap(release => releaseExpiry(release, lapsedReceipts, now, horizon));
  if (out.length === 0) return [];
  // Names only for the people listed, and only as this organization's members
  // (every one is: the resolver counts active members only); coverage reads no name.
  const named = await client.query(
    `SELECT u.id, u.name FROM users u
       JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $2
      WHERE u.id = ANY($1::int[])`,
    [[...new Set(out.map(r => r.userId))], organizationId],
  );
  const names = new Map(named.rows.map(row => [Number(row.id), typeof row.name === 'string' ? row.name : null]));
  return out.map(r => ({ ...r, userName: names.get(r.userId) ?? null }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.docNumber.localeCompare(b.docNumber));
}
