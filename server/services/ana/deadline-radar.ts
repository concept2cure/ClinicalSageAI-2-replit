/**
 * Regulatory Deadline Radar — backing service for the AnA `regulatory_deadline_radar` tool.
 *
 * Aggregates an organization's regulatory obligations/commitments (the
 * `regulatory_obligations` table) into a prioritized "what's overdue / due soon /
 * upcoming" view so AnA can proactively surface time-critical regulatory work.
 *
 * The date-bucketing (`bucketObligations`) is a pure function so it can be unit
 * tested without a database; `getDeadlineRadar` is the thin DB-scoped wrapper.
 * Deterministic — no LLM, no fabrication.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { regulatoryObligations } from '../../../shared/schema';

/** Terminal statuses that are not "open" work and are excluded by default. */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export interface ObligationLike {
  id: number;
  title: string | null;
  agency: string | null;
  obligationType: string | null;
  category: string | null;
  regulatoryPathway: string | null;
  priority: string | null;
  status: string | null;
  dueDate: Date | string | null;
  legalBasis: string | null;
  consequenceOfNonCompliance: string | null;
}

export type DeadlineBucket = 'overdue' | 'due_soon' | 'upcoming';

export interface RadarItem {
  id: number;
  title: string | null;
  agency: string | null;
  obligationType: string | null;
  category: string | null;
  regulatoryPathway: string | null;
  priority: string | null;
  status: string | null;
  dueDate: string;
  daysUntilDue: number;
  bucket: DeadlineBucket;
  legalBasis: string | null;
  consequenceOfNonCompliance: string | null;
}

export interface RadarResult {
  windowDays: number;
  summary: { overdue: number; due_soon: number; upcoming: number; total: number };
  items: RadarItem[];
}

export interface BucketOptions {
  now?: Date;
  windowDays?: number;
  includeCompleted?: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure: bucket dated obligations into overdue / due_soon / upcoming and sort by
 * urgency (most overdue first). Obligations with no due date are omitted (they
 * are not deadlines). Terminal-status items are omitted unless includeCompleted.
 */
export function bucketObligations(rows: ObligationLike[], opts: BucketOptions = {}): RadarResult {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : 30;
  const includeCompleted = opts.includeCompleted === true;

  const items: RadarItem[] = rows
    .filter(r => includeCompleted || !TERMINAL_STATUSES.has((r.status ?? '').toLowerCase()))
    .filter(r => r.dueDate != null)
    .map(r => {
      const due = r.dueDate instanceof Date ? r.dueDate : new Date(r.dueDate as string);
      const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / MS_PER_DAY);
      const bucket: DeadlineBucket =
        daysUntilDue < 0 ? 'overdue' : daysUntilDue <= windowDays ? 'due_soon' : 'upcoming';
      return {
        id: r.id,
        title: r.title,
        agency: r.agency,
        obligationType: r.obligationType,
        category: r.category,
        regulatoryPathway: r.regulatoryPathway,
        priority: r.priority,
        status: r.status,
        dueDate: due.toISOString(),
        daysUntilDue,
        bucket,
        legalBasis: r.legalBasis,
        consequenceOfNonCompliance: r.consequenceOfNonCompliance,
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const summary = {
    overdue: items.filter(i => i.bucket === 'overdue').length,
    due_soon: items.filter(i => i.bucket === 'due_soon').length,
    upcoming: items.filter(i => i.bucket === 'upcoming').length,
    total: items.length,
  };

  return { windowDays, summary, items };
}

// Short-TTL cache of the raw obligation rows per org/workspace. The radar runs
// on AnA's time-to-first-token path on (nearly) every chat turn; obligations
// change slowly, so caching the rows for a few seconds removes a DB round-trip
// from the hot path on back-to-back turns. Bucketing stays per-call, so callers
// with different windowDays/includeCompleted still get correct results.
const RADAR_ROW_CACHE_TTL_MS = 30_000;
const radarRowCache = new Map<string, { rows: ObligationLike[]; ts: number }>();

/** Test/maintenance hook: clear the radar row cache. */
export function __clearDeadlineRadarCache(): void {
  radarRowCache.clear();
}

async function fetchObligationRows(
  organizationId: number,
  clientWorkspaceId?: number
): Promise<ObligationLike[]> {
  const key = `${organizationId}:${clientWorkspaceId ?? ''}`;
  const cached = radarRowCache.get(key);
  if (cached && Date.now() - cached.ts < RADAR_ROW_CACHE_TTL_MS) {
    return cached.rows;
  }
  const rows = (await db
    .select({
      id: regulatoryObligations.id,
      title: regulatoryObligations.title,
      agency: regulatoryObligations.agency,
      obligationType: regulatoryObligations.obligationType,
      category: regulatoryObligations.category,
      regulatoryPathway: regulatoryObligations.regulatoryPathway,
      priority: regulatoryObligations.priority,
      status: regulatoryObligations.status,
      dueDate: regulatoryObligations.dueDate,
      legalBasis: regulatoryObligations.legalBasis,
      consequenceOfNonCompliance: regulatoryObligations.consequenceOfNonCompliance,
    })
    .from(regulatoryObligations)
    .where(
      and(
        eq(regulatoryObligations.organizationId, organizationId),
        clientWorkspaceId ? eq(regulatoryObligations.clientWorkspaceId, clientWorkspaceId) : undefined
      )
    )) as ObligationLike[];
  radarRowCache.set(key, { rows, ts: Date.now() });
  return rows;
}

/**
 * DB-scoped: fetch an organization's regulatory obligations and bucket them.
 * Always tenant-scoped by organizationId (and clientWorkspaceId when provided).
 * Rows are cached briefly (see RADAR_ROW_CACHE_TTL_MS) to keep AnA's first-token
 * latency low on back-to-back turns; bucketing is always recomputed per call.
 */
export async function getDeadlineRadar(opts: {
  organizationId: number;
  clientWorkspaceId?: number;
  windowDays?: number;
  includeCompleted?: boolean;
}): Promise<RadarResult> {
  const rows = await fetchObligationRows(opts.organizationId, opts.clientWorkspaceId);
  return bucketObligations(rows, {
    windowDays: opts.windowDays,
    includeCompleted: opts.includeCompleted,
  });
}

/**
 * Pure: render a compact system-prompt context block from a radar result,
 * limited to OVERDUE + DUE_SOON items (the ones worth proactively surfacing).
 * Returns '' when there is nothing pressing, so callers can append unconditionally.
 */
export function buildDeadlineRadarBlock(radar: RadarResult, opts: { maxItems?: number } = {}): string {
  const maxItems = opts.maxItems && opts.maxItems > 0 ? opts.maxItems : 8;
  const overdue = radar.items.filter(i => i.bucket === 'overdue');
  const dueSoon = radar.items.filter(i => i.bucket === 'due_soon');
  if (overdue.length === 0 && dueSoon.length === 0) return '';

  const fmt = (i: RadarItem): string => {
    const agency = i.agency ? `[${i.agency}] ` : '';
    const when =
      i.daysUntilDue < 0
        ? `${Math.abs(i.daysUntilDue)}d overdue`
        : `due in ${i.daysUntilDue}d`;
    const prio = i.priority ? `, priority: ${i.priority}` : '';
    const consequence = i.consequenceOfNonCompliance
      ? ` — consequence: ${i.consequenceOfNonCompliance}`
      : '';
    return `- ${agency}${i.title ?? 'Untitled obligation'} (${when}${prio})${consequence}`;
  };

  const lines: string[] = [
    '<regulatory_deadlines note="Proactively surface OVERDUE and CRITICAL DUE-SOON items in one calm line before the rest of your answer. These are tracked obligations — do not invent dates; if the user asks for more, call regulatory_deadline_radar.">',
  ];
  if (overdue.length > 0) {
    lines.push(`OVERDUE (${overdue.length}):`);
    lines.push(...overdue.slice(0, maxItems).map(fmt));
  }
  if (dueSoon.length > 0) {
    lines.push(`DUE SOON within ${radar.windowDays}d (${dueSoon.length}):`);
    lines.push(...dueSoon.slice(0, maxItems).map(fmt));
  }
  lines.push('</regulatory_deadlines>');
  return lines.join('\n');
}
