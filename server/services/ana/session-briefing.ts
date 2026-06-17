/**
 * Session Briefing — backing service for AnA's proactive "where your program
 * stands" reconciliation, surfaced both as a session-start context block and via
 * the `get_session_briefing` tool.
 *
 * Reconciles the current situation from already-tracked, deterministic sources:
 * regulatory deadlines (the deadline radar) and recent formal decisions (the
 * decision-lifecycle service). The renderer (`buildSessionBriefingBlock`) is a
 * pure function so it can be unit tested without a database. No LLM, no
 * fabrication — only items that actually exist are surfaced.
 */

import { getDeadlineRadar, type RadarResult } from './deadline-radar.js';
import { decisionLifecycleService } from '../decision-lifecycle-service.js';

export interface BriefDecision {
  id: string;
  summary: string;
  status: string;
  kind: string;
  createdAt?: string;
}

export interface SessionBriefingData {
  deadlines: RadarResult;
  decisions: BriefDecision[];
}

export interface BriefingRenderOptions {
  maxDeadlines?: number;
  maxDecisions?: number;
}

/**
 * Pure: render the session-start briefing block. Returns '' when there is
 * nothing material to surface (no overdue/due-soon deadlines and no recent
 * decisions), so callers can append unconditionally.
 */
export function buildSessionBriefingBlock(
  data: SessionBriefingData,
  opts: BriefingRenderOptions = {}
): string {
  const maxDeadlines = opts.maxDeadlines && opts.maxDeadlines > 0 ? opts.maxDeadlines : 5;
  const maxDecisions = opts.maxDecisions && opts.maxDecisions > 0 ? opts.maxDecisions : 5;

  const overdue = data.deadlines.items.filter(i => i.bucket === 'overdue');
  const dueSoon = data.deadlines.items.filter(i => i.bucket === 'due_soon');
  const hasDeadlines = overdue.length > 0 || dueSoon.length > 0;
  const hasDecisions = data.decisions.length > 0;

  if (!hasDeadlines && !hasDecisions) return '';

  const lines: string[] = [
    '<session_briefing note="Open with a brief, calm reconciliation of where the program stands — deadlines first, then recent decisions — then ask what they want to tackle. Surface only what is listed here; never invent items or dates. For detail, call regulatory_deadline_radar or get_session_briefing.">',
  ];

  if (hasDeadlines) {
    const parts: string[] = [];
    if (overdue.length) parts.push(`${overdue.length} overdue`);
    if (dueSoon.length) parts.push(`${dueSoon.length} due soon`);
    lines.push(`Deadlines: ${parts.join(', ')}.`);
    for (const i of [...overdue, ...dueSoon].slice(0, maxDeadlines)) {
      const agency = i.agency ? `[${i.agency}] ` : '';
      const when = i.daysUntilDue < 0 ? `${Math.abs(i.daysUntilDue)}d overdue` : `due in ${i.daysUntilDue}d`;
      lines.push(`- ${agency}${i.title ?? 'Untitled obligation'} (${when})`);
    }
  }

  if (hasDecisions) {
    lines.push(`Recent decisions (${data.decisions.length}):`);
    for (const d of data.decisions.slice(0, maxDecisions)) {
      const when = d.createdAt ? ` — ${d.createdAt.slice(0, 10)}` : '';
      const title = d.summary ? d.summary.slice(0, 160) : d.kind;
      lines.push(`- [${d.status}] ${title}${when}`);
    }
  }

  lines.push('</session_briefing>');
  return lines.join('\n');
}

/**
 * Gather the briefing data (deadlines + recent decisions) and render the block.
 * Deadlines are org-scoped and fail-soft; decisions are project-scoped (skipped
 * when no project is in context). Returns both the structured data (for the
 * tool) and the rendered block (for prompt injection).
 */
export async function getSessionBriefing(opts: {
  organizationId: number;
  projectId?: number | string | null;
  decisionLimit?: number;
  windowDays?: number;
}): Promise<{ data: SessionBriefingData; block: string }> {
  let deadlines: RadarResult = { windowDays: opts.windowDays ?? 30, summary: { overdue: 0, due_soon: 0, upcoming: 0, total: 0 }, items: [] };
  try {
    deadlines = await getDeadlineRadar({ organizationId: opts.organizationId, windowDays: opts.windowDays });
  } catch {
    // Fail-soft: a deadline lookup failure must not break the briefing.
  }

  let decisions: BriefDecision[] = [];
  if (opts.projectId != null && String(opts.projectId).length > 0) {
    try {
      const ctx = decisionLifecycleService.getDecisionContext(String(opts.projectId), {
        limit: opts.decisionLimit ?? 5,
      });
      decisions = ctx.map(({ decision }) => ({
        id: decision.id,
        summary: decision.summary,
        status: decision.status,
        kind: decision.kind,
        createdAt: (decision as { createdAt?: string }).createdAt,
      }));
    } catch {
      // Fail-soft: decision context is optional enrichment.
    }
  }

  const data: SessionBriefingData = { deadlines, decisions };
  return { data, block: buildSessionBriefingBlock(data) };
}
