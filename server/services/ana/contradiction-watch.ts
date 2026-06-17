/**
 * Contradiction Watch — surfaces the contradiction engine's OPEN (unresolved)
 * findings proactively, the way risk-watch surfaces open blockers.
 *
 * The persisted contradiction engine (contradiction_findings) detects assumption
 * drift, decision/action inconsistency, cross-jurisdictional divergence, etc., and
 * assigns each finding a severity + authority state (advisory → blocks_promotion).
 * Until a *consequence* is executed, an unresolved finding never becomes a
 * c2c_blocker, so risk-watch can't see it. That left genuinely live contradictions
 * — including ones that BLOCK PROMOTION — invisible unless someone explicitly
 * called the scan/search API. This module closes that gap: it reads unresolved
 * findings org-wide and renders them so AnA can fold them into the proactive
 * digest and (optionally) the chat context.
 *
 * The renderer, sorter, and summarizer are pure for offline unit testing;
 * `getOpenContradictionsForOrg` is the thin DB-scoped wrapper. Deterministic — no
 * LLM, no fabrication; only persisted, unresolved findings are surfaced.
 */

import {
  contradictionEngineService,
  type Severity,
  type ReviewState,
} from '../contradiction-engine-service.js';

/**
 * Review states that mean a finding is no longer live. Mirrors the engine's own
 * "still open" definition (review_state NOT IN these); anything else —
 * unresolved, under_review, reviewed — is surfaced, since a finding someone is
 * actively reviewing is still a live contradiction.
 */
const CLOSED_REVIEW_STATES: ReadonlySet<ReviewState> = new Set<ReviewState>([
  'approved_resolution',
  'superseded',
]);

export interface OpenContradiction {
  id: string;
  title: string;
  severity: Severity;
  contradictionType: string;
  authorityState: string;
  projectId: number | null;
  createdAt: string | null;
  /** True when the finding's authority state blocks promotion (hardest signal). */
  blocksPromotion: boolean;
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Pure: stable severity-first ordering (critical → low), then newest first. */
export function sortContradictionsBySeverity(items: OpenContradiction[]): OpenContradiction[] {
  return [...items].sort((a, b) => {
    const ra = SEVERITY_RANK[(a.severity ?? '').toLowerCase()] ?? 9;
    const rb = SEVERITY_RANK[(b.severity ?? '').toLowerCase()] ?? 9;
    if (ra !== rb) return ra - rb;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

/** Pure: count contradictions by severity bucket, plus how many block promotion. */
export function summarizeContradictions(items: OpenContradiction[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
  blocksPromotion: number;
  total: number;
} {
  const out = { critical: 0, high: 0, medium: 0, low: 0, blocksPromotion: 0, total: items.length };
  for (const c of items) {
    const s = (c.severity ?? '').toLowerCase();
    if (s === 'critical') out.critical++;
    else if (s === 'high') out.high++;
    else if (s === 'medium') out.medium++;
    else if (s === 'low') out.low++;
    if (c.blocksPromotion) out.blocksPromotion++;
  }
  return out;
}

/**
 * Pure: render a compact contradiction-watch block (severity-first), capped.
 * Returns '' when there are no open contradictions, so callers can append
 * unconditionally.
 */
export function buildContradictionWatchBlock(
  items: OpenContradiction[],
  opts: { maxItems?: number } = {}
): string {
  if (items.length === 0) return '';
  const maxItems = opts.maxItems && opts.maxItems > 0 ? opts.maxItems : 8;
  const sorted = sortContradictionsBySeverity(items);
  const s = summarizeContradictions(items);
  const counts = [
    s.critical ? `${s.critical} critical` : '',
    s.high ? `${s.high} high` : '',
    s.medium ? `${s.medium} medium` : '',
    s.low ? `${s.low} low` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const lines: string[] = [
    '<open_contradictions note="Unresolved contradiction-engine findings. Lead with anything that BLOCKS PROMOTION or is critical/high before advising next steps; these are persisted, detected findings — do not invent contradictions. For the full list call the contradiction search/scan API.">',
    `Open contradictions: ${counts}${s.blocksPromotion ? ` (${s.blocksPromotion} block promotion)` : ''}.`,
  ];
  for (const c of sorted.slice(0, maxItems)) {
    const sev = (c.severity ?? 'medium').toLowerCase();
    const block = c.blocksPromotion ? ' — BLOCKS PROMOTION' : '';
    lines.push(`- [${sev}] ${c.title} (${c.contradictionType})${block}`);
  }
  lines.push('</open_contradictions>');
  return lines.join('\n');
}

/**
 * DB-scoped: fetch the org's OPEN contradiction findings (everything except
 * approved_resolution / superseded), severity-sorted, capped to `limit`. Always
 * org-scoped via {@link contradictionEngineService.searchFindings}.
 *
 * searchFindings only supports single-value review-state equality, so we fetch a
 * generous window (severity-ordered) and exclude closed states in-process. The
 * window is several times the requested cap so closed findings can't crowd out
 * live ones before the cap is applied.
 *
 * Resilient by design: this is an additive proactive signal, so a missing table
 * or query error yields [] rather than breaking the digest / chat prefetch.
 */
export async function getOpenContradictionsForOrg(
  organizationId: number,
  limit?: number
): Promise<OpenContradiction[]> {
  const cap = limit && limit > 0 ? limit : 20;
  try {
    const findings = await contradictionEngineService.searchFindings({
      organizationId,
      limit: Math.min(cap * 4, 200),
    });
    const mapped: OpenContradiction[] = findings
      .filter(f => !CLOSED_REVIEW_STATES.has(f.reviewState))
      .map(f => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        contradictionType: f.contradictionType,
        authorityState: f.authorityState,
        projectId: f.projectId,
        createdAt: f.createdAt,
        blocksPromotion: f.authorityState === 'blocks_promotion',
      }));
    return sortContradictionsBySeverity(mapped).slice(0, cap);
  } catch {
    return [];
  }
}
