/**
 * Protocol-portfolio deterministic analytics (Capability C2C-16)
 *
 * Pure, DB-free, LLM-free: expiration bucketing and continuing-review state
 * across IACUC protocols and IRB submissions — the analytics that power
 * "managing many protocols" at once. Reuses the canonical review-cadence helpers
 * (IACUC de novo 3-year + annual continuing review, PHS Policy IV.C.5; IRB
 * full-board annual continuing review, 45 CFR 46.109) so the portfolio never
 * contradicts the per-protocol logic. `today` is injected for testability.
 *
 * @module server/services/protocols/protocol-portfolio-logic
 */

import { approvalReviewStatus } from '../iacuc/iacuc-logic';
import { lifecycleStatus } from '../irb/lifecycle';
import type { IrbReviewType } from '../../../shared/schema/irb';

/** ISO date (YYYY-MM-DD) → epoch days, or null. Pure, timezone-free. */
function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

export type Committee = 'iacuc' | 'irb';

export type ExpirationBucket = 'expired' | 'due_30' | 'due_90' | 'current' | 'undated';

/**
 * Bucket an approval's expiration date by urgency (mirrors grants
 * deadlineUrgency). A protocol with no expiration date is `undated`; one whose
 * expiration has passed (today on or after expiration) is `expired`; otherwise
 * `due_30` / `due_90` by days remaining, else `current`. Pure.
 */
export function expirationBucket(expirationDate: string | null | undefined, today: string): ExpirationBucket {
  const exp = toDays(expirationDate);
  const now = toDays(today);
  if (exp == null || now == null) return 'undated';
  if (exp <= now) return 'expired';
  const days = exp - now;
  if (days <= 30) return 'due_30';
  if (days <= 90) return 'due_90';
  return 'current';
}

export interface PortfolioProtocolRow {
  id: number;
  protocol_number: string;
  title: string;
  status: string;
  approval_date: string | null;
  expiration_date: string | null;
  /** IACUC review type (designated_member_review / full_committee_review). */
  review_type?: string | null;
  /** IACUC USDA pain category. */
  pain_category?: string | null;
  /** IRB risk level (minimal / greater_than_minimal). */
  risk_level?: string | null;
}

export interface ContinuingReviewState {
  /** The expiration on record; else the computed one (IACUC approval + 3 years, IRB full-board approval + 1 year); else null. */
  expirationDate: string | null;
  /** Where `expirationDate` came from, so a reader knows what it is trusting. */
  expirationSource: 'recorded' | 'computed' | 'none';
  /** Whether that date has passed; null when there is no date. */
  expired: boolean | null;
  /** IACUC annual continuing review is due within the approval period; null without an approval date. Always false for IRB, whose continuing review falls at the expiration. */
  annualReviewDue: boolean | null;
  /** Whether continuing review applies: always for IACUC; IRB full board only, null when no review type is recorded. */
  continuingReviewRequired: boolean | null;
  citation: string;
}

const IACUC_CITATION = 'PHS Policy IV.C.5 — de novo review every 3 years + annual continuing review';
const IRB_CITATION = '45 CFR 46.109 — full-board continuing review at intervals not exceeding one year';

/**
 * Continuing-review / expiration state for one protocol. Delegates to the
 * canonical per-domain helpers: `approvalReviewStatus` for IACUC (3-year de
 * novo + annual, PHS Policy IV.C.5) and `lifecycleStatus` for IRB (full-board
 * annual, 45 CFR 46.109). Both prefer the expiration on record and label a
 * computed one 'computed'. Pure.
 *
 * 2026-10-15: the computed date was preferred over the recorded one, so an
 * approval the committee set to lapse early read as current until the computed
 * date; and the deprecated two-boolean helpers reported an undated IACUC
 * approval as "no annual review due" and an IRB submission with no review type
 * as "continuing review not required".
 */
export function continuingReviewState(committee: Committee, row: PortfolioProtocolRow, today: string): ContinuingReviewState {
  if (committee === 'iacuc') {
    const s = approvalReviewStatus(row.approval_date, today, row.expiration_date);
    return {
      expirationDate: s.expirationDate,
      expirationSource: s.expirationSource,
      expired: s.expired,
      annualReviewDue: s.annualReviewDue,
      continuingReviewRequired: true,
      citation: IACUC_CITATION,
    };
  }
  const s = lifecycleStatus({
    status: row.status,
    reviewType: (row.review_type ?? null) as IrbReviewType | null,
    approvalDate: row.approval_date,
    expirationDate: row.expiration_date,
    today,
  });
  return {
    expirationDate: s.expirationDate,
    expirationSource: s.expirationSource,
    expired: s.expirationDate ? expirationBucket(s.expirationDate, today) === 'expired' : null,
    annualReviewDue: false,
    continuingReviewRequired: s.continuingReview === 'unknown' ? null : s.continuingReview === 'required',
    citation: IRB_CITATION,
  };
}

export interface PortfolioBucketCounts {
  total: number;
  expired: number;
  due_30: number;
  due_90: number;
  current: number;
  undated: number;
}

export interface ProtocolAttentionItem {
  committee: Committee;
  id: number;
  protocolNumber: string;
  title: string;
  status: string;
  bucket: ExpirationBucket;
  expirationDate: string | null;
  /** 'recorded' (the date on record), 'computed' (derived from the approval date) or 'none'. */
  expirationSource: ContinuingReviewState['expirationSource'];
  /** Days until expiration (negative when already expired); null when undated. */
  daysRemaining: number | null;
  annualReviewDue: boolean | null;
  citation: string;
}

export interface PortfolioSummary {
  today: string;
  counts: { iacuc: PortfolioBucketCounts; irb: PortfolioBucketCounts; combined: PortfolioBucketCounts };
  /** Protocols already past their expiration (continuing review overdue). */
  overdue: ProtocolAttentionItem[];
  /** Protocols expiring within 90 days (due_30 + due_90). */
  expiringSoon: ProtocolAttentionItem[];
  /** Combined, prioritized list: expired first, then due_30, then due_90; ascending by daysRemaining. */
  needsAttention: ProtocolAttentionItem[];
}

function emptyCounts(): PortfolioBucketCounts {
  return { total: 0, expired: 0, due_30: 0, due_90: 0, current: 0, undated: 0 };
}

function buildItem(committee: Committee, row: PortfolioProtocolRow, today: string): ProtocolAttentionItem {
  const crState = continuingReviewState(committee, row, today);
  const bucket = expirationBucket(crState.expirationDate, today);
  const exp = toDays(crState.expirationDate);
  const now = toDays(today);
  const daysRemaining = exp != null && now != null ? exp - now : null;
  return {
    committee,
    id: row.id,
    protocolNumber: row.protocol_number,
    title: row.title,
    status: row.status,
    bucket,
    expirationDate: crState.expirationDate,
    expirationSource: crState.expirationSource,
    daysRemaining,
    annualReviewDue: crState.annualReviewDue,
    citation: crState.citation,
  };
}

const BUCKET_PRIORITY: Record<ExpirationBucket, number> = { expired: 0, due_30: 1, due_90: 2, current: 3, undated: 4 };

/**
 * Summarize an org's protocol portfolio: per-committee and combined counts by
 * expiration bucket, the overdue and expiring-soon lists, and a single
 * prioritized "needs attention" list (expired → due_30 → due_90, ascending by
 * days remaining). Each item carries its regulatory citation. Pure.
 */
export function summarizePortfolio(
  iacucRows: PortfolioProtocolRow[],
  irbRows: PortfolioProtocolRow[],
  today: string,
): PortfolioSummary {
  const counts = { iacuc: emptyCounts(), irb: emptyCounts(), combined: emptyCounts() };
  const items: ProtocolAttentionItem[] = [];

  const ingest = (committee: Committee, rows: PortfolioProtocolRow[], c: PortfolioBucketCounts) => {
    for (const row of rows) {
      const item = buildItem(committee, row, today);
      c.total += 1;
      c[item.bucket] += 1;
      counts.combined.total += 1;
      counts.combined[item.bucket] += 1;
      items.push(item);
    }
  };
  ingest('iacuc', iacucRows, counts.iacuc);
  ingest('irb', irbRows, counts.irb);

  const overdue = items.filter((i) => i.bucket === 'expired');
  const expiringSoon = items.filter((i) => i.bucket === 'due_30' || i.bucket === 'due_90');

  const needsAttention = items
    .filter((i) => i.bucket === 'expired' || i.bucket === 'due_30' || i.bucket === 'due_90')
    .sort((a, b) => {
      const byBucket = BUCKET_PRIORITY[a.bucket] - BUCKET_PRIORITY[b.bucket];
      if (byBucket !== 0) return byBucket;
      const da = a.daysRemaining ?? Number.POSITIVE_INFINITY;
      const db = b.daysRemaining ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.id - b.id;
    });

  return { today, counts, overdue, expiringSoon, needsAttention };
}
