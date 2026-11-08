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
import type { RequestSqlClient } from '../../db/requestDb';
import { admitAnaProjectScope, readActiveAnaActorRole, AnaProjectScopeError } from './project-scope-admission';
import { readProjectObjectiveMonitor, projectMonitorForTeam } from '../projects/schedule-of-events/service';
import { readRunCoordination } from './run-events';
import { readProjectTeamSnapshot, type ProjectTeamSnapshot } from '../../../shared/ana/turn-timeline';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { isLiveRunStatus, STALE_AFTER_MS } from './run-status';

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

/** Project-readable, receipt-verified worker metadata. Peer briefs, reports and private preferences never enter this projection. */
export async function loadProjectTeamActivity(client: RequestSqlClient, input: {
  organizationId: number; userId: number; projectRef: string; runId?: string;
}): Promise<ProjectTeamSnapshot> {
  input={...input};
  await readActiveAnaActorRole(client,input);
  const admitted = await admitAnaProjectScope(client,{organizationId: input.organizationId,userId: input.userId,projectRef: input.projectRef});
  if (admitted.projectId === null || !admitted.projectRef) throw new AnaProjectScopeError(400,'ANA_PROJECT_SCOPE_INVALID','Choose a project for its team activity.');
  const refs = [...new Set([String(admitted.projectId),admitted.programId,admitted.projectRef].filter((ref): ref is string => ref !== null))];
  const runs = await client.query(`SELECT id,status,heartbeat_at FROM ana_runs WHERE organization_id=$1 AND project_id=ANY($2::text[])
    AND ($3::text IS NULL OR id::text=$3) ORDER BY created_at DESC,id DESC LIMIT 33`,[input.organizationId,refs,input.runId ?? null]);
  if (input.runId && runs.rows.length !== 1) throw new AnaProjectScopeError(404,'ANA_PROJECT_NOT_FOUND','That run is not available in this project.');
  const workers: ProjectTeamSnapshot['workers'] = [];
  const receipts: string[] = [];
  let currentParents = true;
  for (const run of runs.rows.slice(0,32)) {
    if (typeof run.id !== 'string' || !run.id) throw new Error('The project run identity could not be verified.');
    const board = await readRunCoordination(client,{runId: run.id,organizationId: input.organizationId,userId: input.userId,
      projectId: admitted.projectId,...(admitted.programId ? {programId: admitted.programId} : {})});
    const parentState = teamParentState(run);
    workers.push(...board.workers.map(worker => ({...worker,parentState})));
    if (!currentParentWorkers(parentState,board.workers)) currentParents=false;
    receipts.push(...board.receipts.map(receipt => receipt.eventHash));
  }
  await readActiveAnaActorRole(client,input);
  await assertTeamProjectCurrent(client,input,admitted);
  const monitor = await readProjectObjectiveMonitor(input.organizationId,admitted.projectId,{actorUserId:input.userId,executor:client});
  await assertTeamProjectCurrent(client,input,admitted);
  const snapshot = readProjectTeamSnapshot({ organizationId: input.organizationId,projectId: admitted.projectId,projectRef: admitted.projectRef,
    asOf: new Date().toISOString(),cursor: receipts.length ? createHash('sha256').update(stableStringify(receipts)).digest('hex') : null,
    complete: teamActivityComplete(runs.rows.length,workers.length,monitor.state,currentParents),goal: monitor.goal,workers: workers.slice(0,128),
    projectMonitor: projectMonitorForTeam(monitor) });
  if (!snapshot) throw new Error('The project team snapshot could not be verified.');
  return snapshot;
}

async function assertTeamProjectCurrent(client:RequestSqlClient,input:{organizationId:number;userId:number;projectRef:string},
  admitted:Awaited<ReturnType<typeof admitAnaProjectScope>>):Promise<void> {
  const after=await admitAnaProjectScope(client,input);
  if (after.projectId!==admitted.projectId || after.programId!==admitted.programId) throw new AnaProjectScopeError(403,'ANA_PROJECT_ACCESS_DENIED','The project relationship changed. Refresh its team activity.');
}

function currentParentWorkers(parent:string,workers:ProjectTeamSnapshot['workers']):boolean {
  return parent==='running' || !workers.some(worker=>['assigned','started','checking','waiting'].includes(worker.phase));
}
function teamActivityComplete(runCount:number,workerCount:number,monitorState:string,currentParents:boolean):boolean {
  return runCount<=32 && workerCount<=128 && monitorState==='current' && currentParents;
}
function teamParentState(run: Record<string,unknown>): NonNullable<ProjectTeamSnapshot['workers'][number]['parentState']> {
  const status=run.status;
  if (status!=='running' && status!=='paused' && status!=='awaiting_approval' && status!=='finished' && status!=='cancelled' && status!=='failed') return 'stale';
  if (isLiveRunStatus(status)) {
    const beat=new Date(String(run.heartbeat_at)).getTime();
    if (!Number.isFinite(beat) || Date.now()-beat>STALE_AFTER_MS) return 'stale';
  }
  return status;
}
