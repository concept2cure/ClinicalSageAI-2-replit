/**
 * Since-Last-Visit — AnA's "here's what changed while you were away" delta.
 *
 * Re-engagement UX: when a user returns, instead of re-greeting them with the
 * full standing picture (session briefing), surface only what is NEW since their
 * last visit — newly-overdue deadlines, newly-opened blockers / contradiction
 * findings, and recently-recorded decisions. The client supplies its own
 * `since` (last-visit timestamp), so this needs no new persistence.
 *
 * Honest scope: this reports what APPEARED since `since`. It deliberately does
 * NOT claim items "resolved since" your last visit — that would require a stored
 * prior snapshot we don't keep; only currently-live items are observable here.
 *
 * The summarizer + renderer are pure (unit-testable, no DB/IO); the gatherer is
 * the thin org-scoped wrapper. Deterministic — only tracked, real items surface.
 */

import type { RadarResult, RadarItem } from './deadline-radar.js';
import { getDeadlineRadar } from './deadline-radar.js';
import { getOpenBlockersForOrg, type OpenBlocker } from './risk-watch.js';
import { getOpenContradictionsForOrg, type OpenContradiction } from './contradiction-watch.js';

export interface SinceLastVisitInput {
  /** The user's last-visit timestamp (ISO string or Date). */
  since: string | Date;
  radar: RadarResult;
  blockers: OpenBlocker[];
  contradictions: OpenContradiction[];
}

export interface SinceLastVisitSummary {
  /** Echoed normalized since (ISO), or '' when the input was unparseable. */
  since: string;
  newlyOverdue: Array<{ title: string; agency: string | null; dueDate: string; daysUntilDue: number }>;
  newBlockers: Array<{ title: string; severity: string }>;
  newContradictions: Array<{ title: string; severity: string; blocksPromotion: boolean }>;
  counts: { newlyOverdue: number; newBlockers: number; newContradictions: number; total: number };
}

/** Parse a timestamp to epoch ms, or null when unparseable. */
function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

const EMPTY_SUMMARY: SinceLastVisitSummary = {
  since: '',
  newlyOverdue: [],
  newBlockers: [],
  newContradictions: [],
  counts: { newlyOverdue: 0, newBlockers: 0, newContradictions: 0, total: 0 },
};

/**
 * Pure: compute what is new since `since`. An obligation is "newly overdue" when
 * it is currently overdue AND its due date fell after `since` (i.e. it crossed
 * the line while the user was away); blockers / contradictions are "new" when
 * their createdAt is after `since`. Fail-closed: an unparseable `since` yields an
 * empty delta (we never flood the user by treating everything as new).
 */
export function summarizeSinceLastVisit(
  input: SinceLastVisitInput,
  now: Date = new Date()
): SinceLastVisitSummary {
  const sinceMs = toMs(input.since);
  if (sinceMs == null) return {
    since: '',
    newlyOverdue: [],
    newBlockers: [],
    newContradictions: [],
    counts: { newlyOverdue: 0, newBlockers: 0, newContradictions: 0, total: 0 },
  };
  const nowMs = now.getTime();

  const newlyOverdue = input.radar.items
    .filter((i: RadarItem) => {
      if (i.bucket !== 'overdue') return false;
      const dueMs = toMs(i.dueDate);
      // Crossed into overdue during the away window: since < dueDate <= now.
      return dueMs != null && dueMs > sinceMs && dueMs <= nowMs;
    })
    .map(i => ({
      title: i.title ?? 'Untitled obligation',
      agency: i.agency,
      dueDate: i.dueDate,
      daysUntilDue: i.daysUntilDue,
    }));

  const newBlockers = input.blockers
    .filter(b => {
      const ms = toMs(b.createdAt ?? null);
      return ms != null && ms > sinceMs;
    })
    .map(b => ({ title: b.title, severity: (b.severity ?? 'medium').toLowerCase() }));

  const newContradictions = input.contradictions
    .filter(c => {
      const ms = toMs(c.createdAt);
      return ms != null && ms > sinceMs;
    })
    .map(c => ({
      title: c.title,
      severity: (c.severity ?? 'medium').toLowerCase(),
      blocksPromotion: c.blocksPromotion,
    }));

  const total = newlyOverdue.length + newBlockers.length + newContradictions.length;
  return {
    since: new Date(sinceMs).toISOString(),
    newlyOverdue,
    newBlockers,
    newContradictions,
    counts: {
      newlyOverdue: newlyOverdue.length,
      newBlockers: newBlockers.length,
      newContradictions: newContradictions.length,
      total,
    },
  };
}

/**
 * Pure: render a compact "since you were last here" context block. Returns ''
 * when nothing changed, so callers can append unconditionally.
 */
export function buildSinceLastVisitBlock(
  input: SinceLastVisitInput,
  opts: { maxItems?: number; now?: Date } = {}
): string {
  const summary = summarizeSinceLastVisit(input, opts.now);
  if (summary.counts.total === 0) return '';
  const maxItems = opts.maxItems && opts.maxItems > 0 ? opts.maxItems : 5;

  const lines: string[] = [
    '<since_last_visit note="Briefly tell the user what changed since they were last here, then continue. Surface only what is listed here; do not invent items. This is what APPEARED while away — it is not a claim about what was resolved.">',
  ];
  if (summary.newlyOverdue.length) {
    lines.push(`Newly overdue (${summary.newlyOverdue.length}):`);
    for (const d of summary.newlyOverdue.slice(0, maxItems)) {
      const agency = d.agency ? `[${d.agency}] ` : '';
      lines.push(`- ${agency}${d.title} (${Math.abs(d.daysUntilDue)}d overdue)`);
    }
  }
  if (summary.newBlockers.length) {
    lines.push(`New risks/blockers (${summary.newBlockers.length}):`);
    for (const b of summary.newBlockers.slice(0, maxItems)) lines.push(`- [${b.severity}] ${b.title}`);
  }
  if (summary.newContradictions.length) {
    lines.push(`New contradictions (${summary.newContradictions.length}):`);
    for (const c of summary.newContradictions.slice(0, maxItems)) {
      lines.push(`- [${c.severity}] ${c.title}${c.blocksPromotion ? ' — blocks promotion' : ''}`);
    }
  }
  lines.push('</since_last_visit>');
  return lines.join('\n');
}

/**
 * Org-scoped gatherer: pull the live signals and compute the delta vs `since`.
 * Each source is fail-soft (already resilient) so a single failure can't break
 * the briefing. Always org-scoped via the underlying fetchers.
 */
export async function getSinceLastVisit(opts: {
  organizationId: number;
  since: string | Date;
  now?: Date;
}): Promise<{ summary: SinceLastVisitSummary; block: string }> {
  let radar: RadarResult = {
    windowDays: 30,
    summary: { overdue: 0, due_soon: 0, upcoming: 0, total: 0 },
    items: [],
  };
  try {
    radar = await getDeadlineRadar({ organizationId: opts.organizationId });
  } catch {
    // Fail-soft: a deadline lookup failure must not break the delta.
  }
  const [blockers, contradictions] = await Promise.all([
    getOpenBlockersForOrg(opts.organizationId, 50).catch(() => [] as OpenBlocker[]),
    getOpenContradictionsForOrg(opts.organizationId, 50).catch(() => [] as OpenContradiction[]),
  ]);

  const input: SinceLastVisitInput = { since: opts.since, radar, blockers, contradictions };
  return {
    summary: summarizeSinceLastVisit(input, opts.now),
    block: buildSinceLastVisitBlock(input, { now: opts.now }),
  };
}
