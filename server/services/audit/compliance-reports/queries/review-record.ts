/**
 * The latest signed periodic review of one kind, and whether it is overdue —
 * as a section of the report it belongs to (ADR-0014 §8):
 *
 *   the user access review           names the latest signed access review (P1-43)
 *   the audit trail integrity        names the latest signed audit-trail review (P1-25)
 *   attestation
 *
 * The record is public.compliance_review_records
 * (migrations/20261001_compliance_review_records.sql), written and signed
 * through server/services/audit/compliance-reviews.ts. GET /api/audit/reviews
 * states the same thing from the same query (latestSignedReview), so the
 * report and the screen cannot disagree.
 *
 * Overdue: a review is due each quarter (POLICY-AC-002 §4a; POLICY-IS-001
 * §3a). The clock runs from the period a review covered, not from the day it
 * was signed (DP-69, 2026-10-01): the next review is due three months after
 * the end of that period (nextDueSql), the latest review is the one that
 * covers the most recent period, and it is overdue once the report's date is
 * past that due date. Signing a review of an old or a one-day period
 * therefore does not make the organisation current. With none, the section
 * says "No … review recorded" and carries no date at all: a date is never
 * made up.
 *
 * @module server/services/audit/compliance-reports/queries/review-record
 */
import type { ReviewKind } from '../../../../../shared/constants/compliance-review';
import type { RunContext, SectionDef, SectionResult, SqlClient } from '../types';
import { actorJoin, columns, isoUtc } from './section';

export type { ReviewKind };
export const REVIEW_KINDS: readonly ReviewKind[] = ['audit_trail', 'access'];

/** How often a review is due. Stated in the section note and in both policies. */
export const REVIEW_INTERVAL = '3 months';

/**
 * The date the next review is due, after a review whose period ended on the
 * SQL date `periodEnd`: three calendar months later (PostgreSQL month
 * arithmetic, so 30 November gives 28 or 29 February). The one definition: the
 * report section and the status read it here, and the record refuses a period
 * that would already be past it (services/audit/compliance-reviews.ts).
 */
export function nextDueSql(periodEnd: string): string {
  return `((${periodEnd}) + interval '${REVIEW_INTERVAL}')::date`;
}

export const NO_REVIEW: Readonly<Record<ReviewKind, string>> = {
  access: 'No access review recorded',
  audit_trail: 'No audit trail review recorded',
};

export interface LatestReviewFacts {
  id: number;
  periodStart: string;
  periodEnd: string;
  outcome: string;
  decisionCount: number;
  reviewerUserId: number;
  reviewerName: string | null;
  signedAt: string;
  signatureId: number | null;
  contentHash: string;
  nextDue: string;
}

export interface LatestReview {
  kind: ReviewKind;
  state: 'none' | 'current' | 'overdue';
  latest: LatestReviewFacts | null;
}

/*
 * $1 organisation, $2 kind, $3 the end of the report's date (an instant,
 * exclusive). Signed before that end; the latest is the one covering the most
 * recent period. Overdue once $3 is past the whole of its due date (UTC).
 */
const LATEST_SQL = `
SELECT r.id,
       to_char(r.period_start, 'YYYY-MM-DD') AS period_start,
       to_char(r.period_end, 'YYYY-MM-DD') AS period_end,
       r.outcome,
       jsonb_array_length(r.decisions) AS decision_count,
       r.reviewer_user_id,
       rv.name AS reviewer_name,
       ${isoUtc('r.signed_at')} AS signed_at,
       r.signature_id,
       r.content_hash,
       to_char(${nextDueSql('r.period_end')}, 'YYYY-MM-DD') AS next_due,
       ((${nextDueSql('r.period_end')} + 1)::timestamp AT TIME ZONE 'UTC') < $3::timestamptz AS overdue
  FROM compliance_review_records r
  ${actorJoin('r.reviewer_user_id', 'rv')}
 WHERE r.organization_id = $1
   AND r.kind = $2
   AND r.status = 'signed'
   AND r.signed_at < $3::timestamptz
 ORDER BY r.period_end DESC, r.signed_at DESC, r.id DESC
 LIMIT 1`;

/** The latest signed review of `kind` on or before `endIso`, and whether it is overdue then. */
export async function latestSignedReview(client: SqlClient, orgId: number, kind: ReviewKind, endIso: string): Promise<LatestReview> {
  const { rows } = await client.query(LATEST_SQL, [orgId, kind, endIso]);
  const r = rows[0];
  if (!r) return { kind, state: 'none', latest: null };
  return {
    kind,
    state: r.overdue === true ? 'overdue' : 'current',
    latest: {
      id: Number(r.id),
      periodStart: String(r.period_start),
      periodEnd: String(r.period_end),
      outcome: String(r.outcome),
      decisionCount: Number(r.decision_count),
      reviewerUserId: Number(r.reviewer_user_id),
      reviewerName: r.reviewer_name == null ? null : String(r.reviewer_name),
      signedAt: String(r.signed_at),
      signatureId: r.signature_id == null ? null : Number(r.signature_id),
      contentHash: String(r.content_hash),
      nextDue: String(r.next_due),
    },
  };
}

function reviewColumns(kind: ReviewKind) {
  return columns([
    ['review_status', 'Review status'],
    ['review_id', 'Review record'],
    ['period_start', 'Reviewed from'],
    ['period_end', 'Reviewed to'],
    ['outcome', 'Outcome'],
    ['decision_count', kind === 'access' ? 'Decisions' : 'Findings'],
    ['reviewer_user_id', 'Reviewer id'],
    ['reviewer_name', 'Reviewer'],
    ['signed_at', 'Signed'],
    ['signature_id', 'Signature'],
    ['content_hash', 'Content hash (SHA-256)'],
    ['next_due', 'Next review due'],
  ]);
}

/** The section a report declares for its review record. */
export function reviewSectionDef(kind: ReviewKind): SectionDef {
  return {
    key: 'review',
    title: kind === 'access' ? 'Access review record' : 'Audit trail review record',
    columns: reviewColumns(kind),
  };
}

const POLICY: Readonly<Record<ReviewKind, string>> = { access: 'POLICY-AC-002 §4a', audit_trail: 'POLICY-IS-001 §3a' };

/** The one-row section: the latest signed review as of the report's date, or the statement that there is none. */
export async function reviewSection(ctx: RunContext, kind: ReviewKind): Promise<SectionResult> {
  const { state, latest } = await latestSignedReview(ctx.client, ctx.orgId, kind, ctx.bounds.end);
  const rule = `A review is due each quarter (${POLICY[kind]}): the next one is due three months after the end of the period the last one covered. The review shown is the latest signed one, the one covering the most recent period; it is overdue once the report date is past that due date.`;
  const where =
    kind === 'access'
      ? 'Each decision, one per account, with the change that carried it out, is in the review record itself. The decisions were checked against current roles and memberships when the review was recorded and again when it was signed; a role on a past date is not reconstructed, so a past role was not checked.'
      : 'Each finding, and what was done about it, is in the review record itself, with the integrity attestation run it names.';
  const row = latest
    ? {
        review_status: state === 'overdue' ? 'Overdue' : 'Current',
        review_id: latest.id,
        period_start: latest.periodStart,
        period_end: latest.periodEnd,
        outcome: latest.outcome,
        decision_count: latest.decisionCount,
        reviewer_user_id: latest.reviewerUserId,
        reviewer_name: latest.reviewerName,
        signed_at: latest.signedAt,
        signature_id: latest.signatureId,
        content_hash: latest.contentHash,
        next_due: latest.nextDue,
      }
    : {
        review_status: NO_REVIEW[kind],
        review_id: null,
        period_start: null,
        period_end: null,
        outcome: null,
        decision_count: null,
        reviewer_user_id: null,
        reviewer_name: null,
        signed_at: null,
        signature_id: null,
        content_hash: null,
        next_due: null,
      };
  return { rows: [row], truncated: false, notes: [rule, where, 'Times are UTC.'] };
}
