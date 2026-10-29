/**
 * A periodic review of a controlled document: a signed act on the version in
 * force (gap 5.2; docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md;
 * 21 CFR 820.40, ISO 13485 §4.2.4).
 *
 * ── Why it is a signature and not an UPDATE ──────────────────────────────────
 * `next_review_date` is part of what the approval signed
 * (computeQmsDocumentContentDigest). Writing a new date onto the effective row
 * would break the binding of the signature that put it in force. So the
 * review writes nothing to qms_documents.
 *
 * What it records instead, through the platform's one ceremony
 * (routes/governed-signed-act.ts signGovernedAct: target `qms-document:<id>`,
 * meaning `review`):
 *   - the `sign` ledger pair, and one electronic signature bound to the
 *     release's content digest (the `qms-document` binder,
 *     part11/governed-target-binders.ts);
 *   - the signature's manifest names exactly what was reviewed and what was
 *     decided (`act`, below).
 *
 * ── What it may review ───────────────────────────────────────────────────────
 * Only an effective document whose approval signature still stands
 * (readCurrentQmsReleaseApproval, the check training admission makes): a
 * review cannot attest a release nobody's standing approval put in force. A
 * document under revision is refused: the revision's approval sets its next
 * review. A draft with nothing in force, and a retired document, have nothing
 * to review.
 *
 * ── Reading it back ──────────────────────────────────────────────────────────
 * `readQmsPeriodicReviews` takes the latest standing review signature per
 * document (isSignatureWithdrawn) and counts it only when it reviewed the
 * release in force: the same version, approval time and content digest. A new
 * version, once approved, starts from its own row date. `nextReviewDue` is
 * what every reader of "when is this due" uses.
 *
 * RULE 2: every date and verdict here is computed from the record; no model is called.
 *
 * @module server/services/qms/periodic-review
 */
import { z } from 'zod';
import { computeQmsDocumentContentDigest, type QmsDocumentRow } from './document-approval-signature';
import { readInForceReleases, type InForceRelease, type InForceSqlClient } from './in-force-release';
import { readCurrentQmsReleaseApproval } from './current-release-approval';
import { isSignatureWithdrawn } from '../part11/signature-persistence';

export const QMS_PERIODIC_REVIEW_KIND = 'qms-periodic-review';
export const QMS_PERIODIC_REVIEW_OUTCOMES = ['current', 'revision-required'] as const;
export type QmsPeriodicReviewOutcome = (typeof QMS_PERIODIC_REVIEW_OUTCOMES)[number];

/**
 * The longest a review may schedule the next one: five years. The earliest is
 * today, in UTC: the register offers the day after the reviewer's own today,
 * which is never before the UTC day in any time zone.
 */
const MAX_DAYS_AHEAD = 5 * 366;

const isoDay = (value: unknown): string | null =>
  value == null || value === '' ? null : (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
const isoTime = (value: unknown): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

/** The review's own fields, beside the signature components the ceremony parses. */
export const qmsPeriodicReviewBody = z.object({
  outcome: z.enum(QMS_PERIODIC_REVIEW_OUTCOMES),
  nextReviewDate: z.string().date().optional(),
}).superRefine((body, ctx) => {
  if (body.outcome !== 'current') return;
  if (!body.nextReviewDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nextReviewDate'], message: 'A document that remains current needs its next review date.' });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const latest = new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
  if (body.nextReviewDate < today) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nextReviewDate'], message: 'The next review date cannot be in the past.' });
  } else if (body.nextReviewDate > latest) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nextReviewDate'], message: 'The next review date must be within five years.' });
  }
});
export type QmsPeriodicReviewInput = z.infer<typeof qmsPeriodicReviewBody>;

export class QmsPeriodicReviewRefused extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** The refusal codes and their statuses, for the signing ceremony. */
export const QMS_PERIODIC_REVIEW_CODE_STATUS: Readonly<Record<string, number>> = {
  QMS_REVIEW_NOT_FOUND: 404,
  QMS_REVIEW_UNDER_REVISION: 409,
  QMS_REVIEW_NOT_EFFECTIVE: 409,
  QMS_REVIEW_APPROVAL_NOT_STANDING: 409,
};

/** What the signature's manifest records: the version reviewed, its content, and the decision. */
export interface QmsPeriodicReviewAct {
  kind: typeof QMS_PERIODIC_REVIEW_KIND;
  documentId: number;
  docNumber: string;
  version: string;
  approvedAt: string | null;
  contentDigest: string;
  outcome: QmsPeriodicReviewOutcome;
  nextReviewDate: string | null;
  /** The date the approval signed, on the row; a review never changes it. */
  previousNextReviewDate: string | null;
  /** When the version was due as the reviewer saw it: after its last standing review, or the signed date. */
  previousNextReviewDue: string | null;
}

/** What the domain write recorded, and the row it reviewed (for the task that follows it). */
export interface QmsPeriodicReviewRecorded {
  act: QmsPeriodicReviewAct;
  document: QmsDocumentRow;
}

/**
 * The domain write the ceremony runs on its transaction. It locks the row, so
 * a revision or approval cannot interleave, and refuses anything but an
 * effective document. It writes nothing to the row: the act is the signature.
 */
export async function recordQmsPeriodicReview(
  client: InForceSqlClient,
  orgId: number,
  documentId: number,
  input: QmsPeriodicReviewInput,
): Promise<QmsPeriodicReviewRecorded> {
  const { rows } = await client.query(
    `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [documentId, orgId],
  );
  const row = rows[0] as QmsDocumentRow | undefined;
  if (!row) throw new QmsPeriodicReviewRefused('QMS_REVIEW_NOT_FOUND', 'That controlled document was not found. Reload the register. Nothing was signed.');
  refuseUnlessEffective(row);
  const approval = await readCurrentQmsReleaseApproval(client, row, { lock: true });
  if (approval.state !== 'valid') {
    throw new QmsPeriodicReviewRefused('QMS_REVIEW_APPROVAL_NOT_STANDING',
      `The approval of ${row.doc_number} v${String(row.version)} does not stand (${approval.state}), so a review cannot attest it. Nothing was signed.`);
  }
  const before = await readQmsPeriodicReviews(client, orgId, new Map([[Number(row.id), { release: row, underRevision: false }]]));
  return { document: row, act: {
    kind: QMS_PERIODIC_REVIEW_KIND,
    documentId: Number(row.id),
    docNumber: String(row.doc_number),
    version: String(row.version),
    approvedAt: isoTime(row.approved_at),
    contentDigest: computeQmsDocumentContentDigest(row),
    outcome: input.outcome,
    nextReviewDate: input.outcome === 'current' ? input.nextReviewDate ?? null : null,
    previousNextReviewDate: isoDay(row.next_review_date),
    previousNextReviewDue: nextReviewDue(row, before.get(Number(row.id))),
  } };
}

function refuseUnlessEffective(row: QmsDocumentRow): void {
  if (row.status === 'effective') return;
  const revising = (row.metadata as { lastRevision?: unknown } | null)?.lastRevision;
  if ((row.status === 'draft' || row.status === 'in_review') && revising) {
    throw new QmsPeriodicReviewRefused('QMS_REVIEW_UNDER_REVISION',
      `A revision of ${row.doc_number} is open, so it cannot be reviewed. Approving the revision sets the next review date. Nothing was signed.`);
  }
  throw new QmsPeriodicReviewRefused('QMS_REVIEW_NOT_EFFECTIVE',
    `${row.doc_number} is ${String(row.status).replace(/_/g, ' ')}, so it has no version in force to review. Nothing was signed.`);
}

/** The last counted review of a document's version in force, as the register shows it. */
export interface QmsPeriodicReview {
  signatureId: number;
  reviewedAt: string;
  reviewerId: number;
  reviewerName: string | null;
  /** The reason the reviewer signed with: for "revision required", what needs revising. */
  reason: string | null;
  outcome: QmsPeriodicReviewOutcome;
  /** The date the reviewer set; null when a revision is required. */
  nextReviewDate: string | null;
  /** When the document is next due: the reviewer's date, or the row's when a revision is required. */
  nextDue: string | null;
  version: string;
}

function asAct(value: unknown): QmsPeriodicReviewAct | null {
  if (!value || typeof value !== 'object') return null;
  const act = value as Partial<QmsPeriodicReviewAct>;
  return act.kind === QMS_PERIODIC_REVIEW_KIND && typeof act.version === 'string' && typeof act.contentDigest === 'string'
    && (act.outcome === 'current' || act.outcome === 'revision-required') ? act as QmsPeriodicReviewAct : null;
}

/** Whether a review's act is of this release: the same version, approval time and content. */
function reviewsRelease(act: QmsPeriodicReviewAct, release: QmsDocumentRow): boolean {
  return act.version === String(release.version)
    && act.approvedAt === isoTime(release.approved_at)
    && act.contentDigest === computeQmsDocumentContentDigest(release);
}

export interface QmsPeriodicReviewReadOptions {
  /** Only reviews signed before this instant (an as-of report's end of day). */
  signedBefore?: string;
}

/**
 * The last standing review of each release in force, by document id. One
 * query. A document whose latest standing review is of another version, or
 * that has none, is absent: its row date governs. The reviewer is the name
 * the signature manifested (§11.50), as the register report shows approvals.
 */
export async function readQmsPeriodicReviews(
  client: InForceSqlClient,
  orgId: number,
  releases: ReadonlyMap<number, InForceRelease>,
  options: QmsPeriodicReviewReadOptions = {},
): Promise<Map<number, QmsPeriodicReview>> {
  const out = new Map<number, QmsPeriodicReview>();
  if (!releases.size) return out;
  const targets = [...releases.keys()].map((id) => `qms-document:${id}`);
  // signed_at is UTC wall-clock time without a zone (persistGovernedSignSignature).
  const { rows } = await client.query(
    `SELECT s.id, s.signed_target, s.signer_id, s.signer_name, s.signature_purpose, s.superseded_by, s.is_valid, s.verification_status,
            to_char(COALESCE(s.signed_at, s.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reviewed_at,
            s.signature_manifest::jsonb -> 'act' AS act
       FROM electronic_signatures s
      WHERE s.organization_id = $1 AND s.signed_target = ANY($2::text[]) AND s.signature_meaning = 'review'
        AND s.signature_manifest::jsonb -> 'act' ->> 'kind' = $3
        AND ($4::timestamptz IS NULL OR s.signed_at < ($4::timestamptz AT TIME ZONE 'UTC'))
      ORDER BY s.signed_target, s.id DESC`,
    [orgId, targets, QMS_PERIODIC_REVIEW_KIND, options.signedBefore ?? null],
  );
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const target = String(r.signed_target);
    if (!latest.has(target) && !isSignatureWithdrawn(r)) latest.set(target, r);
  }
  for (const [id, entry] of releases) {
    const r = latest.get(`qms-document:${id}`);
    const act = r ? asAct(r.act) : null;
    if (!r || !act || !reviewsRelease(act, entry.release)) continue;
    const rowDue = isoDay(entry.release.next_review_date);
    out.set(id, {
      signatureId: Number(r.id),
      reviewedAt: String(r.reviewed_at),
      reviewerId: Number(r.signer_id),
      reviewerName: r.signer_name == null ? null : String(r.signer_name),
      reason: r.signature_purpose == null ? null : String(r.signature_purpose),
      outcome: act.outcome,
      nextReviewDate: act.nextReviewDate,
      nextDue: act.outcome === 'current' ? act.nextReviewDate : rowDue,
      version: act.version,
    });
  }
  return out;
}

/** When a release is next due for review: its last counted review's date, or its own. */
export function nextReviewDue(release: QmsDocumentRow, review: QmsPeriodicReview | undefined): string | null {
  return review ? review.nextDue : isoDay(release.next_review_date);
}

/** The version in force, its last counted review, and when each row is next due. */
export interface QmsReviewSchedule {
  inForce: Map<number, InForceRelease>;
  reviews: Map<number, QmsPeriodicReview>;
  /** The in-force version's next review, or, with nothing in force, the row's own date. */
  dueOf(row: QmsDocumentRow): string | null;
}

/**
 * What every "when is this due" reader resolves through (review-due,
 * readiness, the register list): the version in force (in-force-release.ts)
 * and its last counted review. Two queries at most.
 */
export async function readQmsReviewSchedule(
  client: InForceSqlClient,
  orgId: number,
  rows: readonly QmsDocumentRow[],
  options: QmsPeriodicReviewReadOptions = {},
): Promise<QmsReviewSchedule> {
  const inForce = await readInForceReleases(client, orgId, rows);
  const reviews = await readQmsPeriodicReviews(client, orgId, inForce, options);
  return {
    inForce,
    reviews,
    dueOf(row) {
      const entry = inForce.get(Number(row.id));
      return entry ? nextReviewDue(entry.release, reviews.get(Number(row.id))) : isoDay(row.next_review_date);
    },
  };
}
