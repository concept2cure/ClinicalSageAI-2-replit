/**
 * Risk Watch — backing service for AnA's continuous risk surfacing.
 *
 * Reads a project's OPEN blockers (the c2c_blockers store written by the
 * contradiction engine, dispatch gates, and the correspondence operating layer)
 * and renders them, severity-first, so AnA can flag live risk proactively (in
 * the session briefing) and on demand (the scan_project_risks tool).
 *
 * The renderer (`buildRiskWatchBlock`) and the sorter are pure for offline unit
 * testing; `getOpenBlockers` is the thin DB-scoped wrapper. Deterministic — no
 * LLM, no fabrication; only persisted, open blockers are surfaced.
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db';
import { c2cBlockers } from '../../../shared/schema';

export interface OpenBlocker {
  blockerId: string;
  blockerType: string;
  severity: string;
  title: string;
  description: string | null;
  nextAction: string | null;
  ownerFunction: string | null;
  createdAt: Date | string | null;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Pure: stable severity-first ordering (critical → low), then newest first. */
export function sortBlockersBySeverity(blockers: OpenBlocker[]): OpenBlocker[] {
  return [...blockers].sort((a, b) => {
    const ra = SEVERITY_RANK[(a.severity ?? '').toLowerCase()] ?? 9;
    const rb = SEVERITY_RANK[(b.severity ?? '').toLowerCase()] ?? 9;
    if (ra !== rb) return ra - rb;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

/** Pure: count blockers by severity bucket. */
export function summarizeBlockers(blockers: OpenBlocker[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
} {
  const out = { critical: 0, high: 0, medium: 0, low: 0, total: blockers.length };
  for (const b of blockers) {
    const s = (b.severity ?? '').toLowerCase();
    if (s === 'critical') out.critical++;
    else if (s === 'high') out.high++;
    else if (s === 'medium') out.medium++;
    else if (s === 'low') out.low++;
  }
  return out;
}

/**
 * Pure: render a compact risk-watch block (severity-first), capped. Returns ''
 * when there are no open blockers, so callers can append unconditionally.
 */
export function buildRiskWatchBlock(blockers: OpenBlocker[], opts: { maxItems?: number } = {}): string {
  if (blockers.length === 0) return '';
  const maxItems = opts.maxItems && opts.maxItems > 0 ? opts.maxItems : 8;
  const sorted = sortBlockersBySeverity(blockers);
  const s = summarizeBlockers(blockers);
  const counts = [
    s.critical ? `${s.critical} critical` : '',
    s.high ? `${s.high} high` : '',
    s.medium ? `${s.medium} medium` : '',
    s.low ? `${s.low} low` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const lines: string[] = [
    '<open_risks note="Proactively flag CRITICAL/HIGH open blockers before they bite; lead with them. These are tracked, persisted blockers — do not invent risks. For the full list call scan_project_risks.">',
    `Open blockers: ${counts}.`,
  ];
  for (const b of sorted.slice(0, maxItems)) {
    const sev = (b.severity ?? 'medium').toLowerCase();
    const owner = b.ownerFunction ? ` (owner: ${b.ownerFunction})` : '';
    const action = b.nextAction ? ` — next: ${b.nextAction}` : '';
    lines.push(`- [${sev}] ${b.title}${owner}${action}`);
  }
  lines.push('</open_risks>');
  return lines.join('\n');
}

/**
 * DB-scoped: fetch a project's OPEN blockers, severity-sorted. Always scoped by
 * org + project.
 */
export async function getOpenBlockers(opts: {
  organizationId: number;
  projectId: number;
  limit?: number;
}): Promise<OpenBlocker[]> {
  const rows = await db
    .select({
      blockerId: c2cBlockers.blockerId,
      blockerType: c2cBlockers.blockerType,
      severity: c2cBlockers.severity,
      title: c2cBlockers.title,
      description: c2cBlockers.description,
      nextAction: c2cBlockers.nextAction,
      ownerFunction: c2cBlockers.ownerFunction,
      createdAt: c2cBlockers.createdAt,
    })
    .from(c2cBlockers)
    .where(
      and(
        eq(c2cBlockers.orgId, opts.organizationId),
        eq(c2cBlockers.projectId, opts.projectId),
        eq(c2cBlockers.status, 'open')
      )
    )
    .orderBy(desc(c2cBlockers.createdAt));

  const sorted = sortBlockersBySeverity(rows as OpenBlocker[]);
  return opts.limit && opts.limit > 0 ? sorted.slice(0, opts.limit) : sorted;
}
