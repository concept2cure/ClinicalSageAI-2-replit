/**
 * Horizon Digest — the weekly, one-screen, no-touch artifact.
 *
 * The product owner does not manage the pipeline; they glance at this. It rolls
 * a scan's results into a single summary: what could not be read, how much was
 * ingested, how much auto-promoted, and what is queued for review (the part that
 * needs a human). Only a scan that read every due source and distilled every
 * item may say there is nothing to do.
 */

import type { PromotionDecision } from './promotion-policy.js';
import type { KnowledgeCard } from './knowledge-card.js';

export interface ScanRecord {
  card: KnowledgeCard;
  decision: PromotionDecision;
  reason: string;
}

/** How much of what was due this scan actually read. Required, so a caller cannot omit its failures. */
export interface ScanCoverage {
  /** Sources due this run, read or not. */
  sourcesDue: number;
  /** Due sources that could not be read, with the reason. */
  unreadSources: Array<{ sourceId: string; error: string }>;
  /** Items harvested from the sources that were read. */
  itemsHarvested: number;
  /** Harvested items the distiller could not process, with the reason. */
  undistilledItems: Array<{ sourceId: string; url: string; reason: string }>;
}

export interface HorizonDigest {
  generatedAt: string;
  /** False when a due source could not be read or an item could not be distilled. */
  complete: boolean;
  totals: {
    ingested: number;
    autoPromoted: number;
    review: number;
    quarantined: number;
    /** Due sources that were read. */
    sourcesScanned: number;
    /** Due sources that could not be read (named in `unreadSources`). */
    sourcesUnread: number;
    itemsHarvested: number;
    /** Harvested items that could not be distilled (named in `undistilledItems`). */
    itemsUndistilled: number;
  };
  unreadSources: ScanCoverage['unreadSources'];
  undistilledItems: ScanCoverage['undistilledItems'];
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

export function buildHorizonDigest(records: ScanRecord[], coverage: ScanCoverage, now: Date = new Date()): HorizonDigest {
  const { sourcesDue, unreadSources, itemsHarvested, undistilledItems } = coverage;
  const sourcesScanned = sourcesDue - unreadSources.length;
  const complete = unreadSources.length === 0 && undistilledItems.length === 0;
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
  lines.push(`_${now.toISOString().slice(0, 10)} · ${sourcesScanned} of ${sourcesDue} due source(s) read_`);
  lines.push('');

  // 2026-10-15: a scan whose every fetch or model call failed printed
  // "0 change(s) ingested" and "Nothing needs your attention this week". What
  // could not be read is now named first, and the all-clear needs a complete scan.
  if (unreadSources.length > 0) {
    lines.push(
      `⚠️ **${unreadSources.length} of ${sourcesDue} source(s) could not be read.** ` +
        'Nothing from them is counted below; the next run retries them.',
    );
    for (const u of unreadSources) lines.push(`- ${u.sourceId}: ${u.error}`);
    lines.push('');
  }
  if (undistilledItems.length > 0) {
    lines.push(
      `⚠️ **${undistilledItems.length} of ${itemsHarvested} harvested item(s) could not be distilled.** ` +
        'They are not counted below; the next run retries their sources.',
    );
    for (const u of undistilledItems) lines.push(`- ${u.sourceId}: ${u.reason} (${u.url})`);
    lines.push('');
  }

  lines.push(
    `**${records.length} change(s) ingested** — ${autoPromoted.length} auto-promoted, ` +
      `${review.length} need your review, ${quarantined.length} quarantined.`,
  );
  lines.push('');

  if (review.length === 0 && complete) {
    lines.push('✅ **Nothing needs your attention this week.** All updates were auto-promoted or held safely.');
  } else if (review.length === 0) {
    lines.push(
      '**No change from the sources that were read needs review.** This scan is incomplete (see above), so it is not an all-clear.',
    );
  } else {
    lines.push(`## Needs your review (${review.length})`);
    for (const r of review) {
      const code = r.card.standardCode ? ` ${r.card.standardCode}` : '';
      lines.push(
        `- **${r.card.body}${code}** — ${r.card.title} ` +
          `_(${r.card.changeKind}, ${r.card.jurisdictions.join('/')}, model-reported conf ${r.card.confidence.toFixed(2)})_`,
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
    complete,
    totals: {
      ingested: records.length,
      autoPromoted: autoPromoted.length,
      review: review.length,
      quarantined: quarantined.length,
      sourcesScanned,
      sourcesUnread: unreadSources.length,
      itemsHarvested,
      itemsUndistilled: undistilledItems.length,
    },
    unreadSources,
    undistilledItems,
    reviewQueue,
    markdown: lines.join('\n'),
  };
}
