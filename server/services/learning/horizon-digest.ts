/**
 * Horizon Digest — the weekly, one-screen, no-touch artifact.
 *
 * The product owner does not manage the pipeline; they glance at this. It rolls
 * a scan's results into a single summary: how much was ingested, how much
 * auto-promoted, and — the only part that needs a human — what is queued for
 * review. If the review list is empty, there is nothing to do.
 */

import type { PromotionDecision } from './promotion-policy.js';
import type { KnowledgeCard } from './knowledge-card.js';

export interface ScanRecord {
  card: KnowledgeCard;
  decision: PromotionDecision;
  reason: string;
}

export interface HorizonDigest {
  generatedAt: string;
  totals: {
    ingested: number;
    autoPromoted: number;
    review: number;
    quarantined: number;
    sourcesScanned: number;
  };
  /** The only items a human needs to look at. */
  reviewQueue: Array<{
    id: string;
    body: string;
    standardCode?: string;
    title: string;
    changeKind: string;
    jurisdictions: string[];
    confidence: number;
    reason: string;
    url: string;
  }>;
  markdown: string;
}

export function buildHorizonDigest(records: ScanRecord[], sourcesScanned: number, now: Date = new Date()): HorizonDigest {
  const autoPromoted = records.filter(r => r.decision === 'auto_promote');
  const review = records.filter(r => r.decision === 'review');
  const quarantined = records.filter(r => r.decision === 'quarantine');

  const reviewQueue = review.map(r => ({
    id: r.card.id,
    body: r.card.body,
    standardCode: r.card.standardCode,
    title: r.card.title,
    changeKind: r.card.changeKind,
    jurisdictions: r.card.jurisdictions,
    confidence: r.card.confidence,
    reason: r.reason,
    url: r.card.url,
  }));

  const lines: string[] = [];
  lines.push(`# AnA Regulatory Horizon — Weekly Digest`);
  lines.push(`_${now.toISOString().slice(0, 10)} · ${sourcesScanned} source(s) scanned_`);
  lines.push('');
  lines.push(
    `**${records.length} change(s) ingested** — ${autoPromoted.length} auto-promoted, ` +
      `${review.length} need your review, ${quarantined.length} quarantined.`,
  );
  lines.push('');

  if (review.length === 0) {
    lines.push('✅ **Nothing needs your attention this week.** All updates were auto-promoted or held safely.');
  } else {
    lines.push(`## Needs your review (${review.length})`);
    for (const r of review) {
      const code = r.card.standardCode ? ` ${r.card.standardCode}` : '';
      lines.push(
        `- **${r.card.body}${code}** — ${r.card.title} ` +
          `_(${r.card.changeKind}, ${r.card.jurisdictions.join('/')}, conf ${r.card.confidence.toFixed(2)})_`,
      );
      lines.push(`  ${r.reason}`);
      lines.push(`  ${r.card.url}`);
    }
  }

  if (autoPromoted.length > 0) {
    lines.push('');
    lines.push(`## Auto-promoted (${autoPromoted.length})`);
    for (const r of autoPromoted) {
      const code = r.card.standardCode ? ` ${r.card.standardCode}` : '';
      lines.push(`- ${r.card.body}${code} — ${r.card.title} _(${r.card.changeKind})_`);
    }
  }

  return {
    generatedAt: now.toISOString(),
    totals: {
      ingested: records.length,
      autoPromoted: autoPromoted.length,
      review: review.length,
      quarantined: quarantined.length,
      sourcesScanned,
    },
    reviewQueue,
    markdown: lines.join('\n'),
  };
}
