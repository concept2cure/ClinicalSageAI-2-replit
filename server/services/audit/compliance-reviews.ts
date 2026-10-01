/**
 * Periodic review records — the audit-trail review (P1-25; EU GMP Annex 11 §9,
 * FDA data-integrity guidance 2018 Q7, finding DP-21) and the user access
 * review (P1-43; POLICY-AC-002 §4a) — as one governed record (ADR-0014 §8).
 *
 * A reviewer drafts the record (the period, what was in scope, the outcome
 * and the decisions), then signs it through the platform's one signing
 * ceremony (routes/governed-signed-act.ts signGovernedAct): target
 * `compliance-review:<id>`, meaning `review`. `signReviewAct` is the domain
 * write that ceremony runs on its transaction: it fixes the content hash and
 * marks the row signed; the ceremony then writes the `sign` ledger pair and the
 * electronic signature, whose manifest carries the content hash (act.contentHash).
 * The database refuses a row becoming signed without that signature in the
 * same transaction, records the signature id at COMMIT, and refuses any later
 * change or deletion (migrations/20261001_compliance_review_records.sql).
 *
 * Decisions:
 *   access review       one line per account: user id, role, keep | reduce |
 *                       remove, the role a reduce leaves, and the change that
 *                       carried a reduce or remove out.
 *   audit-trail review  the findings, each with what was done about it.
 *
 * What a review must be before it is recorded, and again, on the record as it
 * then is and under its row lock, before it is signed (assertReviewable; fix
 * round DP-69, 2026-10-01):
 *   the period    ended no more than three months ago (a review of an older
 *                 period would be overdue the day it is signed), and starts no
 *                 later than the day after the last signed review of its kind
 *                 ended, so no days go unreviewed;
 *   the run       the sealed report run the review names (export id and data
 *                 hash) is one this organisation made, of the matching report:
 *                 the user access review, or the audit trail integrity
 *                 attestation (its compliance.report_run audit row);
 *   the lines     checked against current roles and memberships: a keep names
 *                 a member with the role the member holds; a reduce names the
 *                 role now in effect; a remove names an account whose removal
 *                 from this organisation was recorded (member_removed, or SCIM
 *                 deprovisioning) or a member whose account is deactivated.
 *                 A reduce or remove is recorded once it has been carried out
 *                 (POLICY-AC-002 §4a);
 *   completeness  every account that holds an owner, admin, manager or
 *                 platform role now has a line (readMembers, privilegedOf: the
 *                 report's own list). The list as of the period end is a subset
 *                 of it: a membership row is only ever removed, and both read
 *                 current roles.
 *
 * Every number here is from SQL or a hash; nothing is composed by a model.
 *
 * @module server/services/audit/compliance-reviews
 */
import { z } from 'zod';
import type { PoolClient } from 'pg';

import { writeChainedAuditRow } from '../auditService';
import { sha256CanonicalJson } from '../part11/signature-persistence';
import { REVIEW_SOURCE_REPORT } from '../../../shared/constants/compliance-review';
import { MEMBER_REMOVED } from '../tenant/membership-change';
import { findReport, REPORT_RESOURCE_TYPE, REPORT_RUN_ACTION } from './compliance-reports/catalog';
import { privilegedOf, readMembers } from './compliance-reports/queries/access-review';
import { latestSignedReview, nextDueSql, REVIEW_KINDS, type LatestReview, type ReviewKind } from './compliance-reports/queries/review-record';
import { actorJoin, isoUtc } from './compliance-reports/queries/section';
import type { SqlClient } from './compliance-reports/types';

export const REVIEW_MEANING = 'review';
export const REVIEW_TARGET_PREFIX = 'compliance-review';
export const REVIEW_DRAFTED_ACTION = 'compliance.review_drafted';
export const REVIEW_KIND_LABEL: Readonly<Record<ReviewKind, string>> = { access: 'access review', audit_trail: 'audit trail review' };

/** A coded refusal; the routes answer it with REVIEW_REFUSAL_STATUS[code]. */
export class ReviewRefusal extends Error {
  constructor(
    readonly code: keyof typeof REVIEW_REFUSAL_STATUS,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ReviewRefusal';
  }
}
export const REVIEW_REFUSAL_STATUS = {
  REVIEW_NOT_FOUND: 404,
  REVIEW_NOT_REVIEWER: 403,
  REVIEW_ALREADY_SIGNED: 409,
  REVIEW_INCOMPLETE: 409,
  REVIEW_PERIOD_STALE: 409,
  REVIEW_PERIOD_GAP: 409,
  REVIEW_LINE_MISMATCH: 409,
  REVIEW_REPORT_NOT_FOUND: 409,
  REVIEW_RECORD_INVALID: 409,
} as const;

/* ── The draft a reviewer sends ─────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isCalendarDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}
const date = z.string().refine(isCalendarDate, 'a calendar date, YYYY-MM-DD');
const text = (max: number) => z.string().trim().min(1).max(max);

const RUN_EXPORT_ID = 'a review names the report run it read (its export id)';
const RUN_DATA_HASH = 'a review names the report run it read (its data hash, 64 hex characters)';
const scope = z
  .object({
    description: text(2000),
    reportExportId: z.string({ required_error: RUN_EXPORT_ID }).trim().min(1, RUN_EXPORT_ID).max(200),
    reportDataHash: z.string({ required_error: RUN_DATA_HASH }).regex(/^[0-9a-f]{64}$/, RUN_DATA_HASH),
  })
  .strict();

const accessDecision = z
  .object({
    userId: z.number().int().positive(),
    role: text(64),
    decision: z.enum(['keep', 'reduce', 'remove']),
    reducedTo: text(64).optional(),
    changeReference: text(500).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.decision === 'reduce' && !d.reducedTo) ctx.addIssue({ code: 'custom', message: 'a reduce names the role it leaves', path: ['reducedTo'] });
    if (d.decision === 'reduce' && d.reducedTo && d.reducedTo.toLowerCase() === d.role.toLowerCase()) {
      ctx.addIssue({ code: 'custom', message: 'a reduce leaves a different role than the one reviewed', path: ['reducedTo'] });
    }
    if (d.decision !== 'reduce' && d.reducedTo) ctx.addIssue({ code: 'custom', message: 'only a reduce names a role', path: ['reducedTo'] });
    if (d.decision !== 'keep' && !d.changeReference) {
      ctx.addIssue({ code: 'custom', message: 'a reduce or remove names the change that carried it out', path: ['changeReference'] });
    }
  });

const finding = z.object({ finding: text(2000), action: text(2000), changeReference: text(500).optional() }).strict();

const common = { periodStart: date, periodEnd: date, scope, outcome: text(4000) };

export const reviewDraftSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('access'), ...common, decisions: z.array(accessDecision).min(1).max(5000) }).strict(),
    z.object({ kind: z.literal('audit_trail'), ...common, decisions: z.array(finding).max(500) }).strict(),
  ])
  .superRefine((d, ctx) => {
    if (d.periodEnd < d.periodStart) ctx.addIssue({ code: 'custom', message: 'the period ends before it starts', path: ['periodEnd'] });
    if (d.periodEnd > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: 'custom', message: 'a review covers a period that has happened', path: ['periodEnd'] });
    }
    if (d.kind === 'access') {
      const ids = d.decisions.map((x) => x.userId);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'one line per account', path: ['decisions'] });
    }
  });
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

/* ── The record ─────────────────────────────────────────────────────────── */

/** The stored columns the content hash covers, as read (dates as YYYY-MM-DD text). */
export interface ReviewContent {
  id: number | string;
  organization_id: number | string;
  kind: string;
  period_start: string;
  period_end: string;
  scope: unknown;
  outcome: string;
  decisions: unknown;
  reviewer_user_id: number | string;
}

/**
 * The record's content hash: sha256 over the canonical JSON (keys sorted,
 * signature-persistence.ts sha256CanonicalJson) of exactly these members. An
 * inspector re-derives it from the stored row; the signature's manifest names it.
 */
export function reviewContentHash(r: ReviewContent): string {
  return sha256CanonicalJson({
    version: 1,
    id: Number(r.id),
    organizationId: Number(r.organization_id),
    kind: r.kind,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    scope: r.scope,
    outcome: r.outcome,
    decisions: r.decisions,
    reviewerUserId: Number(r.reviewer_user_id),
  });
}

const RECORD_COLUMNS = `r.id, r.organization_id, r.kind,
       to_char(r.period_start, 'YYYY-MM-DD') AS period_start, to_char(r.period_end, 'YYYY-MM-DD') AS period_end,
       r.scope, r.outcome, r.decisions, r.reviewer_user_id, r.status, r.signature_id, r.content_hash,
       ${isoUtc('r.created_at')} AS created_at, ${isoUtc('r.signed_at')} AS signed_at`;

export interface ReviewView {
  id: number;
  kind: ReviewKind;
  periodStart: string;
  periodEnd: string;
  scope: Record<string, unknown>;
  outcome: string;
  decisions: Record<string, unknown>[];
  reviewerUserId: number;
  reviewerName: string | null;
  status: 'draft' | 'signed';
  signatureId: number | null;
  contentHash: string | null;
  createdAt: string;
  signedAt: string | null;
}

function viewOf(r: Record<string, unknown>): ReviewView {
  return {
    id: Number(r.id),
    kind: r.kind as ReviewKind,
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    scope: (r.scope ?? {}) as Record<string, unknown>,
    outcome: String(r.outcome),
    decisions: (r.decisions ?? []) as Record<string, unknown>[],
    reviewerUserId: Number(r.reviewer_user_id),
    reviewerName: r.reviewer_name == null ? null : String(r.reviewer_name),
    status: r.status === 'signed' ? 'signed' : 'draft',
    signatureId: r.signature_id == null ? null : Number(r.signature_id),
    contentHash: r.content_hash == null ? null : String(r.content_hash),
    createdAt: String(r.created_at),
    signedAt: r.signed_at == null ? null : String(r.signed_at),
  };
}

/* ── What a review must be, at drafting and again at signing (DP-69) ───── */

type Stage = 'draft' | 'sign';
const NOTHING: Readonly<Record<Stage, string>> = { draft: 'Nothing was recorded.', sign: 'Nothing was signed.' };

/** Every membership that exists now, whenever it was made: readMembers' bound read as "now and before". */
const CURRENT_MEMBERSHIPS = 'infinity';

/** The audit_events row SCIM deprovisioning writes (routes/scim.ts auditScim, removeMembership). */
const SCIM_DEACTIVATED = 'scim.user.deactivated';

const PERIOD_SQL = `
WITH prev AS (
  SELECT max(r.period_end) AS period_end
    FROM compliance_review_records r
   WHERE r.organization_id = $2 AND r.kind = $3 AND r.status = 'signed')
SELECT to_char(${nextDueSql('$1::date')}, 'YYYY-MM-DD') AS due,
       ${nextDueSql('$1::date')} < (now() AT TIME ZONE 'UTC')::date AS stale,
       to_char(prev.period_end, 'YYYY-MM-DD') AS previous_end,
       to_char(prev.period_end + 1, 'YYYY-MM-DD') AS next_start,
       COALESCE($4::date > prev.period_end + 1, false) AS gap
  FROM prev`;

/** The period ended no more than three months ago, and leaves no days unreviewed after the last signed review. */
async function assertPeriod(client: SqlClient, orgId: number, d: ReviewDraft, stage: Stage): Promise<void> {
  const { rows } = await client.query(PERIOD_SQL, [d.periodEnd, orgId, d.kind, d.periodStart]);
  const p = rows[0] as { due: string; stale: boolean; previous_end: string | null; next_start: string | null; gap: boolean };
  if (p.stale) {
    throw new ReviewRefusal(
      'REVIEW_PERIOD_STALE',
      `The period ends on ${d.periodEnd}. A review is due again three months after the period it covered ends, so the next review after this one would have been due by ${p.due}, and this one would be overdue once signed. Record a review of a period that ended within the last three months. ${NOTHING[stage]}`,
    );
  }
  if (p.gap) {
    throw new ReviewRefusal(
      'REVIEW_PERIOD_GAP',
      `The last signed ${REVIEW_KIND_LABEL[d.kind]} covered up to ${p.previous_end}, and this one starts on ${d.periodStart}, which leaves days no review covered. Start it on or before ${p.next_start}. ${NOTHING[stage]}`,
    );
  }
}

const RUN_SQL = `
SELECT 1
  FROM audit_logs a
 WHERE a.tenant_id = $1
   AND a.action = $2
   AND a.table_name = $3
   AND a.record_id = $4
   AND a.new_values->>'exportId' = $5
   AND a.new_values->>'dataHash' = $6
 LIMIT 1`;

/** The run the review names is one this organisation made, of the report this kind reads, with that data hash. */
async function assertReportRun(client: SqlClient, orgId: number, d: ReviewDraft, stage: Stage): Promise<void> {
  const reportId = REVIEW_SOURCE_REPORT[d.kind];
  const title = (findReport(reportId)?.title ?? reportId).toLowerCase();
  const { reportExportId, reportDataHash } = d.scope;
  const { rows } = await client.query(RUN_SQL, [orgId, REPORT_RUN_ACTION, REPORT_RESOURCE_TYPE, reportId, reportExportId, reportDataHash]);
  if (rows.length === 0) {
    throw new ReviewRefusal(
      'REVIEW_REPORT_NOT_FOUND',
      `This organisation has no record of a ${title} run with export id ${reportExportId} and that data hash. A ${REVIEW_KIND_LABEL[d.kind]} names the ${title} run it read. ${NOTHING[stage]}`,
    );
  }
}

type AccessLine = Extract<ReviewDraft, { kind: 'access' }>['decisions'][number];
export type LineProblemKind = 'not_member' | 'role' | 'reduce_not_carried_out' | 'remove_not_carried_out' | 'removal_role';
export interface LineProblem {
  userId: number;
  problem: LineProblemKind;
  /** The role the member holds now. */
  holds?: string;
  /** The role the account held when its removal was recorded. */
  held?: string;
}

function lineProblemText(p: LineProblem, line: AccessLine): string {
  switch (p.problem) {
    case 'not_member':
      return line.decision === 'remove'
        ? `user ${p.userId} is not a member of this organisation, and no removal of that account from it is recorded`
        : `user ${p.userId} is not a member of this organisation`;
    case 'role':
      return `user ${p.userId} holds ${p.holds}, not ${line.role}`;
    case 'reduce_not_carried_out':
      return `user ${p.userId} still holds ${p.holds}; a reduce is recorded once the new role is in effect`;
    case 'remove_not_carried_out':
      return `user ${p.userId} is still an active member; a remove is recorded once it has been carried out`;
    case 'removal_role':
      return `user ${p.userId} held ${p.held} when removed, not ${line.role}`;
  }
}

const REMOVALS_SQL = `
SELECT d.user_id,
       (SELECT lower(a.new_values->>'previousRole')
          FROM audit_logs a
         WHERE a.tenant_id = $1
           AND a.action = $3
           AND a.table_name = 'organization_users'
           AND a.record_id = d.user_id::text
         ORDER BY a.occurred_at DESC
         LIMIT 1) AS removed_role,
       EXISTS (SELECT 1
                 FROM audit_events e
                WHERE e.organization_id = $1
                  AND e.event_type = $4
                  AND e.entity_type = 'scim_user'
                  AND e.entity_id = d.user_id) AS scim_removed
  FROM unnest($2::int[]) AS d(user_id)`;

/** For accounts that are not members: whether this organisation recorded removing them, and the role then held. */
async function recordedRemovals(client: SqlClient, orgId: number, userIds: number[]): Promise<Map<number, { role: string | null }>> {
  const out = new Map<number, { role: string | null }>();
  if (userIds.length === 0) return out;
  const { rows } = await client.query(REMOVALS_SQL, [orgId, userIds, MEMBER_REMOVED, SCIM_DEACTIVATED]);
  for (const r of rows) {
    if (r.removed_role != null) out.set(Number(r.user_id), { role: String(r.removed_role) });
    else if (r.scim_removed === true) out.set(Number(r.user_id), { role: null });
  }
  return out;
}

/** A line for an account that is not a member now: only a remove, of an account whose removal is recorded. */
function absentLineProblem(l: AccessLine, removal: { role: string | null } | undefined): LineProblem | null {
  if (l.decision !== 'remove' || !removal) return { userId: l.userId, problem: 'not_member' };
  if (removal.role !== null && removal.role !== l.role.toLowerCase()) return { userId: l.userId, problem: 'removal_role', held: removal.role };
  return null;
}

/** A line for a current member: the role it states is the one held, and a reduce or remove has been carried out. */
function memberLineProblem(l: AccessLine, m: Record<string, unknown>): LineProblem | null {
  const stated = l.role.toLowerCase();
  const holds = String(m.org_role ?? '').toLowerCase();
  if (l.decision === 'reduce') {
    if (holds === String(l.reducedTo).toLowerCase()) return null;
    return { userId: l.userId, problem: holds === stated ? 'reduce_not_carried_out' : 'role', holds };
  }
  if (holds !== stated) return { userId: l.userId, problem: 'role', holds };
  // A remove of someone still a member has been carried out only when the account is deactivated.
  if (l.decision === 'remove' && String(m.account_status ?? '').toLowerCase() === 'active') {
    return { userId: l.userId, problem: 'remove_not_carried_out' };
  }
  return null;
}

/** Each line against the organisation's current roles and memberships; the problems, in line order. */
async function lineProblems(client: SqlClient, orgId: number, members: Record<string, unknown>[], lines: AccessLine[]): Promise<LineProblem[]> {
  const byId = new Map(members.map((m) => [Number(m.user_id), m]));
  const removals = await recordedRemovals(
    client,
    orgId,
    lines.filter((l) => l.decision === 'remove' && !byId.has(l.userId)).map((l) => l.userId),
  );
  const problems: LineProblem[] = [];
  for (const l of lines) {
    const m = byId.get(l.userId);
    const p = m ? memberLineProblem(l, m) : absentLineProblem(l, removals.get(l.userId));
    if (p) problems.push(p);
  }
  return problems;
}

/**
 * The lines against current roles and memberships, then completeness: every
 * account that holds a privileged role now has a line. Removed accounts are
 * not on that list, so a remove that has been carried out needs no line to
 * stay complete.
 */
async function assertAccessLines(client: SqlClient, orgId: number, lines: AccessLine[], stage: Stage): Promise<void> {
  const members = await readMembers(client, orgId, CURRENT_MEMBERSHIPS);
  if (members.truncated) {
    throw new ReviewRefusal('REVIEW_INCOMPLETE', `The member list is longer than one review can carry, so it could not be checked. ${NOTHING[stage]}`);
  }
  const problems = await lineProblems(client, orgId, members.rows, lines);
  if (problems.length > 0) {
    const byUser = new Map(lines.map((l) => [l.userId, l]));
    const shown = problems.slice(0, 5).map((p) => lineProblemText(p, byUser.get(p.userId)!));
    const more = problems.length > shown.length ? `; and ${problems.length - shown.length} more` : '';
    throw new ReviewRefusal(
      'REVIEW_LINE_MISMATCH',
      `${problems.length} decision line${problems.length === 1 ? ' does' : 's do'} not match this organisation's current roles and memberships: ${shown.join('; ')}${more}. ${NOTHING[stage]}`,
      { lines: problems },
    );
  }
  const decided = new Set(lines.map((l) => l.userId));
  const missing = privilegedOf(members.rows)
    .map((m) => Number(m.user_id))
    .filter((id) => !decided.has(id));
  if (missing.length > 0) {
    throw new ReviewRefusal(
      'REVIEW_INCOMPLETE',
      `${missing.length} privileged account${missing.length === 1 ? ' has' : 's have'} no decision: ${missing.slice(0, 10).map((id) => `user ${id}`).join(', ')}${missing.length > 10 ? ', and more' : ''}. Every account that holds an owner, admin, manager or platform role now, by current roles and memberships, needs one. ${NOTHING[stage]}`,
      { missingUserIds: missing },
    );
  }
}

/** Everything a review must be before it is recorded, and again before it is signed. */
async function assertReviewable(client: SqlClient, orgId: number, d: ReviewDraft, stage: Stage): Promise<void> {
  await assertPeriod(client, orgId, d, stage);
  await assertReportRun(client, orgId, d, stage);
  if (d.kind === 'access') await assertAccessLines(client, orgId, d.decisions, stage);
}

export interface DraftContext {
  orgId: number;
  userId: number;
  ipAddress?: string;
  userAgent?: string;
}

/** Write the draft and its chained audit row on the caller's tenant-stamped transaction. */
export async function createReviewDraft(client: PoolClient, ctx: DraftContext, draft: ReviewDraft): Promise<ReviewView> {
  await assertReviewable(client, ctx.orgId, draft, 'draft');
  // tenant-isolation-safe: written for the session's organisation only; RLS WITH CHECK refuses any other.
  const { rows } = await client.query(
    `INSERT INTO compliance_review_records AS r (organization_id, kind, period_start, period_end, scope, outcome, decisions, reviewer_user_id)
     VALUES ($1, $2, $3::date, $4::date, $5::jsonb, $6, $7::jsonb, $8)
     RETURNING ${RECORD_COLUMNS}`,
    [ctx.orgId, draft.kind, draft.periodStart, draft.periodEnd, JSON.stringify(draft.scope), draft.outcome, JSON.stringify(draft.decisions), ctx.userId],
  );
  const view = viewOf(rows[0]);
  await writeChainedAuditRow(
    client,
    {
      action: REVIEW_DRAFTED_ACTION,
      userId: ctx.userId,
      resourceType: 'compliance_review',
      resourceId: String(view.id),
      details: {
        kind: view.kind,
        periodStart: view.periodStart,
        periodEnd: view.periodEnd,
        lines: view.decisions.length,
        description: `Drafted ${REVIEW_KIND_LABEL[view.kind]} ${view.id} for ${view.periodStart} to ${view.periodEnd}`,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
    ctx.orgId,
    String(view.id),
  );
  return view;
}

/**
 * The draft as stored, read back through the same schema a new draft passes.
 * A draft is a working record until it is signed, so it is checked as it is
 * now, not as it was when drafted.
 */
function storedDraft(row: ReviewContent): ReviewDraft {
  const parsed = reviewDraftSchema.safeParse({
    kind: row.kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    scope: row.scope,
    outcome: row.outcome,
    decisions: row.decisions,
  });
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`).slice(0, 5);
  throw new ReviewRefusal('REVIEW_RECORD_INVALID', `This draft does not meet the rules a review is recorded under: ${issues.join('; ')}. Record a new review. Nothing was signed.`);
}

/**
 * The domain write signGovernedAct runs for `POST /api/audit/reviews/:id/sign`:
 * lock the draft, check it again as it now is (assertReviewable, against the
 * organisation as it is at the signing instant), fix its content hash and mark
 * it signed. The ceremony then writes the signature over `payload.contentHash`,
 * on this transaction; the database records the signature id at COMMIT.
 */
export function signReviewAct(reviewId: number) {
  return async (client: PoolClient, orgId: number, userId: number) => {
    const { rows } = await client.query(
      `SELECT ${RECORD_COLUMNS} FROM compliance_review_records r WHERE r.id = $1 AND r.organization_id = $2 FOR UPDATE`,
      [reviewId, orgId],
    );
    const row = rows[0] as (ReviewContent & { status: string }) | undefined;
    if (!row) throw new ReviewRefusal('REVIEW_NOT_FOUND', 'There is no review record with that number in this organisation. Nothing was signed.');
    if (row.status === 'signed') {
      throw new ReviewRefusal('REVIEW_ALREADY_SIGNED', 'This review is already signed, and a signed review is not changed. Record a new one. Nothing was signed.');
    }
    if (Number(row.reviewer_user_id) !== userId) {
      throw new ReviewRefusal('REVIEW_NOT_REVIEWER', 'A review is signed by the reviewer who recorded it. Nothing was signed.');
    }
    await assertReviewable(client, orgId, storedDraft(row), 'sign');
    const contentHash = reviewContentHash(row);
    await client.query(
      `UPDATE compliance_review_records SET status = 'signed', content_hash = $2, signed_at = now() WHERE id = $1 AND organization_id = $3`,
      [reviewId, contentHash, orgId],
    );
    const facts = { reviewId, kind: row.kind, periodStart: row.period_start, periodEnd: row.period_end, contentHash };
    return {
      target: `${REVIEW_TARGET_PREFIX}:${reviewId}`,
      payload: facts,
      body: { success: true, review: { id: reviewId, kind: row.kind, status: 'signed', periodStart: row.period_start, periodEnd: row.period_end, contentHash } },
    };
  };
}

/* ── Reads ──────────────────────────────────────────────────────────────── */

const LIST_SQL = `
SELECT ${RECORD_COLUMNS}, rv.name AS reviewer_name
  FROM compliance_review_records r
  ${actorJoin('r.reviewer_user_id', 'rv')}
 WHERE r.organization_id = $1
 ORDER BY r.created_at DESC, r.id DESC
 LIMIT 200`;

/** This organisation's review records, newest first (at most 200). */
export async function listReviews(client: SqlClient, orgId: number): Promise<ReviewView[]> {
  const { rows } = await client.query(LIST_SQL, [orgId]);
  return rows.map(viewOf);
}

/** One record of this organisation, or null. */
export async function findReview(client: SqlClient, orgId: number, id: number): Promise<ReviewView | null> {
  const { rows } = await client.query(
    `SELECT ${RECORD_COLUMNS}, rv.name AS reviewer_name
       FROM compliance_review_records r
       ${actorJoin('r.reviewer_user_id', 'rv')}
      WHERE r.organization_id = $1 AND r.id = $2`,
    [orgId, id],
  );
  return rows[0] ? viewOf(rows[0]) : null;
}

/** The latest signed review of each kind now, and whether it is overdue: the query the reports state. */
export async function reviewStatus(client: SqlClient, orgId: number, nowIso: string): Promise<Record<ReviewKind, LatestReview>> {
  const out = {} as Record<ReviewKind, LatestReview>;
  for (const kind of REVIEW_KINDS) out[kind] = await latestSignedReview(client, orgId, kind, nowIso);
  return out;
}
