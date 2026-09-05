/**
 * Live agent activity — the tenant-facing view over AnA's background work.
 *
 * Long-running agent work (deep investigations) outlives the chat turn that
 * started it; this surfaces what is active, stalled, or recently finished so a
 * UI can render a live panel (GET /api/ana-ri/agent-activity) AND AnA can
 * proactively surface it on a greeting ("your investigation on X finished").
 *
 * Council runs (Drafter→Statistician→Critic→Synthesizer) execute synchronously
 * inside a chat turn — they complete before the reply, so there is nothing
 * "in flight" to show between turns; investigations are the background surface.
 *
 * The summarizer + block builder are pure (unit-tested); the getter is fail-soft.
 *
 * @module server/services/ana/agent-activity
 */

import {
  listRecentInvestigations,
  isInvestigationStale,
  describeInvestigationStatus,
  type InvestigationRow,
} from './deep-investigation.js';

/** A completed run older than this is no longer "recent" for the summary. */
export const RECENTLY_COMPLETED_WINDOW_MS = 24 * 60 * 60_000;

export interface AgentActivityItem {
  id: string;
  question: string;
  /** Honest status (stalled runs reported as such, never eternal "running"). */
  status: string;
  toolCalls: number;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
}

export interface AgentActivitySummary {
  /** Running/queued and NOT stalled. */
  activeCount: number;
  /** Running/queued but orphaned by a restart (heartbeat cold). */
  stalledCount: number;
  /** Completed within RECENTLY_COMPLETED_WINDOW_MS. */
  recentlyCompletedCount: number;
  /** The rows themselves (bounded by the caller's fetch), most recent first. */
  items: AgentActivityItem[];
}

function isActive(row: InvestigationRow, now: Date): boolean {
  return (row.status === 'running' || row.status === 'queued') && !isInvestigationStale(row, now);
}

function completedRecently(row: InvestigationRow, now: Date): boolean {
  if (row.status !== 'completed' || !row.completed_at) return false;
  const t = new Date(row.completed_at).getTime();
  return Number.isFinite(t) && now.getTime() - t <= RECENTLY_COMPLETED_WINDOW_MS;
}

/**
 * Summarize investigation rows into a live-activity view. Pure.
 */
export function summarizeAgentActivity(
  rows: InvestigationRow[],
  now: Date = new Date(),
): AgentActivitySummary {
  let activeCount = 0;
  let stalledCount = 0;
  let recentlyCompletedCount = 0;
  const items: AgentActivityItem[] = [];

  for (const row of rows) {
    if (isActive(row, now)) activeCount += 1;
    else if (isInvestigationStale(row, now)) stalledCount += 1;
    if (completedRecently(row, now)) recentlyCompletedCount += 1;

    items.push({
      id: row.id,
      question: row.question.length > 140 ? `${row.question.slice(0, 140)}…` : row.question,
      status: describeInvestigationStatus(row, now),
      toolCalls: row.tool_call_count,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    });
  }

  return { activeCount, stalledCount, recentlyCompletedCount, items };
}

/**
 * Proactive greeting block: surface background work AnA is doing (or just
 * finished) so a returning user hears about it without asking. Returns '' when
 * there is nothing active or freshly finished, so it never clutters a greeting.
 * Pure.
 */
export function buildAgentActivityPromptBlock(summary: AgentActivitySummary): string {
  if (summary.activeCount === 0 && summary.recentlyCompletedCount === 0) return '';

  const parts: string[] = [];
  if (summary.activeCount > 0) {
    parts.push(
      `${summary.activeCount} background deep investigation${summary.activeCount === 1 ? ' is' : 's are'} still running`,
    );
  }
  if (summary.recentlyCompletedCount > 0) {
    parts.push(
      `${summary.recentlyCompletedCount} finished recently and ${summary.recentlyCompletedCount === 1 ? 'its' : 'their'} research memo is ready`,
    );
  }

  return (
    `\n\n## Background AI work in progress\n\n` +
    `${parts.join('; ')}. If a finished investigation bears on what they came for, surface it and offer ` +
    `the findings; if they ask how it is going, report the honest status. Pull the detail with ` +
    `check_deep_investigation.`
  );
}

/**
 * Load the tenant's live agent-activity summary. THROWS on a failed read —
 * this is what the live panel route calls, and a panel must be able to tell
 * "nothing is running" from "the read failed". An empty summary here is a
 * positive claim the database made, never a stand-in for an error.
 */
export async function loadAgentActivity(organizationId: number): Promise<AgentActivitySummary> {
  const rows = await listRecentInvestigations(organizationId, 8);
  return summarizeAgentActivity(rows);
}

/**
 * The greeting path's view: fail-soft, returns an empty summary on any error
 * so a broken investigations table never blocks a chat turn. Only for the
 * proactive prompt block — a route rendering a queue to a person uses
 * {@link loadAgentActivity} so its failure is a failure.
 */
export async function getAgentActivity(organizationId: number): Promise<AgentActivitySummary> {
  try {
    return await loadAgentActivity(organizationId);
  } catch {
    return { activeCount: 0, stalledCount: 0, recentlyCompletedCount: 0, items: [] };
  }
}
