/**
 * AnA's background work queue, as the server reports it.
 *
 * A deep investigation outlives the chat turn that started it, so the live
 * turn's progress record cannot show it. The server has kept a tenant-scoped
 * summary of those runs — active, stalled (orphaned by a restart, heartbeat
 * cold), recently finished — behind `GET /api/ana-ri/agent-activity` since the
 * investigations shipped, and nothing on the client read it. This hook does,
 * on a slow poll while a panel is showing it, so the queue a client sees is
 * the queue that exists.
 *
 * Fail closed, never fabricate: a failed read is reported as `error`, not as
 * an empty queue. "Nothing is running" is a claim the server has to make.
 *
 * @module client/src/concept2cure/v2/useAgentActivity
 */

import React from 'react';

import { apiCall } from './apiCall';
import { authService } from '@/services/portal/authService';
import { capturedActorHeaders } from '@/utils/authToken';
import { useAuthoringReadSession } from './editor/authoringCurrentRead';
import { readProjectTeamSnapshot, type ProjectTeamSnapshot, type WorkerSnapshot } from '@shared/ana/turn-timeline';

export interface AgentActivityItem {
  id: string;
  question: string;
  /** The server's honest status sentence (a stalled run is reported stalled). */
  status: string;
  toolCalls: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AgentActivitySummary {
  activeCount: number;
  stalledCount: number;
  recentlyCompletedCount: number;
  items: AgentActivityItem[];
}

export type AgentActivityState = 'idle' | 'loading' | 'ready' | 'error';

export interface AgentActivityView {
  state: AgentActivityState;
  summary: AgentActivitySummary | null;
  /** Client clock of the last successful read, for the "as of" line. */
  readAt: number | null;
  refresh: () => void;
}

/** Slow on purpose: investigations take minutes, and the panel is not a dashboard. */
export const AGENT_ACTIVITY_POLL_MS = 20_000;

function coerceSummary(raw: unknown): AgentActivitySummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    activeCount: typeof r.activeCount === 'number' ? r.activeCount : 0,
    stalledCount: typeof r.stalledCount === 'number' ? r.stalledCount : 0,
    recentlyCompletedCount: typeof r.recentlyCompletedCount === 'number' ? r.recentlyCompletedCount : 0,
    items: items
      .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === 'object')
      .map((it) => ({
        id: String(it.id ?? ''),
        question: typeof it.question === 'string' ? it.question : '',
        status: typeof it.status === 'string' ? it.status : '',
        toolCalls: typeof it.toolCalls === 'number' ? it.toolCalls : 0,
        startedAt: typeof it.startedAt === 'string' ? it.startedAt : null,
        completedAt: typeof it.completedAt === 'string' ? it.completedAt : null,
      })),
  };
}

/**
 * @param enabled  Poll only while something is showing the result. A hidden
 *                 panel must not keep a request loop alive.
 * @param wakeKey  Any value whose change should trigger an immediate re-read —
 *                 the shell passes the streaming flag so the queue refreshes
 *                 the moment a turn ends, when an investigation may have been
 *                 started or finished by it.
 */
export function useAgentActivity(enabled: boolean, wakeKey?: unknown): AgentActivityView {
  const [state, setState] = React.useState<AgentActivityState>('idle');
  const [summary, setSummary] = React.useState<AgentActivitySummary | null>(null);
  const [readAt, setReadAt] = React.useState<number | null>(null);
  const [epoch, setEpoch] = React.useState(0);
  const refresh = React.useCallback(() => setEpoch((n) => n + 1), []);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = async () => {
      setState((s) => (s === 'ready' ? s : 'loading'));
      const res = await apiCall<{ success?: boolean; data?: unknown }>('GET', '/api/ana-ri/agent-activity');
      if (cancelled) return;
      const parsed = res.ok && res.body?.success ? coerceSummary(res.body.data) : null;
      if (!parsed) {
        setState('error');
        return;
      }
      setSummary(parsed);
      setReadAt(Date.now());
      setState('ready');
    };
    void read();
    const timer = setInterval(() => void read(), AGENT_ACTIVITY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, epoch, wakeKey]);

  return { state, summary, readAt, refresh };
}

export interface ProjectTeamView {
  state: AgentActivityState;
  snapshot: ProjectTeamSnapshot | null;
  open: boolean;
  panelId: string;
  toggle(): void;
  refresh(): void;
}

/** A browser preference never carries a goal, a worker or an account selector. */
export function normalizeTeamProjectRef(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const ref = String(value);
  if (/^[1-9]\d*$/.test(ref) && Number.isSafeInteger(Number(ref))) return ref;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ref) ? ref.toLowerCase() : null;
}

function teamOwnedBy(snapshot: ProjectTeamSnapshot, actor: string, project: string): boolean {
  const [organization] = actor.split(':');
  return snapshot.organizationId === Number(organization) && snapshot.projectRef === project &&
    (!/^[1-9]\d*$/.test(project) || snapshot.projectId === Number(project));
}

export function uniqueTeamWorkers(workers: WorkerSnapshot[]): WorkerSnapshot[] | null {
  const latest = new Map<string, WorkerSnapshot>();
  for (const worker of workers) {
    const key = `${worker.parent}:${worker.worker}`, prior = latest.get(key);
    if (prior?.revision === worker.revision && JSON.stringify(prior) !== JSON.stringify(worker)) return null;
    if (!prior || worker.revision > prior.revision) latest.set(key, worker);
  }
  return [...latest.values()];
}

/** Monitoring continues while its presentation is hidden. Every read is
 * captured to the current account and project, including late JSON parsing. */
export function useProjectTeam(projectRef: unknown, conversation: string, wakeKey?: unknown): ProjectTeamView {
  const session = useAuthoringReadSession(authService.getUser());
  const project = normalizeTeamProjectRef(projectRef), panelId = React.useId();
  const scopeKey = `${session.actor}:${session.key}:${project ?? ''}`;
  const presentationKey = `${scopeKey}:${conversation}`;
  const owner = React.useRef({ session, project }); owner.current = { session, project };
  const [read, setRead] = React.useState<{ owner: string; state: AgentActivityState; snapshot: ProjectTeamSnapshot | null } | null>(null);
  const [openFor, setOpenFor] = React.useState<string | null>(null);
  const [epoch, refreshEpoch] = React.useState(0);
  const refresh = React.useCallback(() => refreshEpoch(n => n + 1), []);
  const current = () => owner.current.session === session && owner.current.project === project && session.sameRevision();
  React.useEffect(() => {
    if (!project || !session.sameRevision()) return;
    let active = true, busy = false;
    let lastTime = 0;
    const held = () => active && owner.current.session === session && owner.current.project === project && session.sameRevision();
    const readSnapshot = async () => {
      if (busy || !held()) return;
      busy = true;
      try {
        const [organizationId, userId] = session.actor.split(':').map(Number);
        const headers = capturedActorHeaders({ organizationId, userId });
        const response = await apiCall<{ success?: boolean; data?: unknown }>('GET',
          `/api/ana-ri/agent-activity?view=team&project_ref=${encodeURIComponent(project)}`, undefined, held, headers);
        if (!held()) return;
        const snapshot = response?.ok && response.body?.success === true ? readProjectTeamSnapshot(response.body.data) : null;
        const workers = snapshot && uniqueTeamWorkers(snapshot.workers);
        if (!snapshot || !workers || !teamOwnedBy(snapshot, session.actor, project) || Date.parse(snapshot.asOf) < lastTime) {
          setRead({ owner: scopeKey, state: 'error', snapshot: null }); return;
        }
        lastTime = Date.parse(snapshot.asOf);
        setRead({ owner: scopeKey, state: 'ready', snapshot: { ...snapshot, workers } });
      } catch { if (held()) setRead({ owner: scopeKey, state: 'error', snapshot: null }); }
      finally { busy = false; }
    };
    void readSnapshot();
    const timer = setInterval(() => void readSnapshot(), AGENT_ACTIVITY_POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [project, session, scopeKey, epoch, wakeKey]);
  const owned = current() && read?.owner === scopeKey ? read : null;
  return { state: !project ? 'idle' : owned?.state ?? 'loading', snapshot: owned?.snapshot ?? null,
    open: current() && openFor === presentationKey, panelId, refresh,
    toggle: () => { if (current()) setOpenFor(value => value === presentationKey ? null : presentationKey); } };
}

function recordedWorkerState(worker: WorkerSnapshot): string {
  if (worker.outcome && worker.outcome !== 'completed') return ({ failed: 'Failed', cancelled: 'Cancelled', incomplete: 'Incomplete' })[worker.outcome];
  if (worker.parentDisposition !== 'pending') return ({ accepted_as_proposal: 'Proposal accepted', rework: 'Changes requested', rejected: 'Rejected' })[worker.parentDisposition];
  return ({ assigned: 'Queued', started: 'Working', checking: 'Checking', waiting: 'Waiting', reported: 'Awaiting AnA review', held: 'Blocked', stopped: 'Stopped' })[worker.phase];
}

export function workerState(worker: WorkerSnapshot): string {
  const state = recordedWorkerState(worker);
  if (!worker.parentState || worker.parentState === 'running') return state;
  const parent = { paused: 'paused', awaiting_approval: 'awaiting approval', finished: 'finished', cancelled: 'cancelled', failed: 'failed', stale: 'state is stale' }[worker.parentState];
  return `Last recorded: ${state} · parent ${parent}`;
}

/** Counts describe the declared measurement unit, never project readiness. */
export function workerMeasurement(worker: WorkerSnapshot): { text: string; percentage: number | null } {
  const unit = worker.basis === 'deterministic_checks' ? 'checks' : 'steps';
  if (worker.completed === null || worker.basis === null) return { text: 'Progress has not been measured.', percentage: null };
  const stopped = worker.phase === 'stopped' || worker.outcome !== null && worker.outcome !== 'completed' ||
    worker.parentState === 'cancelled' || worker.parentState === 'failed' || worker.parentState === 'stale';
  const total = worker.total;
  const measured = worker.basis === 'deterministic_checks' && total !== null && total > 0;
  return { text: worker.total === null ? `${worker.completed} ${unit} recorded · total unknown` : `${worker.completed}/${worker.total} ${unit} recorded`,
    percentage: measured && !stopped && total !== null ? Math.floor(100 * worker.completed / total) : null };
}

export function workerEstimate(worker: WorkerSnapshot): string {
  if (!worker.estimate || worker.phase !== 'checking' || worker.outcome !== null ||
      worker.parentState !== undefined && worker.parentState !== 'running') return 'Completion estimate unavailable.';
  const estimate = worker.estimate;
  const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
  return `Remaining checks: approximately ${minutes(estimate.lowerMs)}–${minutes(estimate.upperMs)} minutes, based on ${estimate.sampleCount} observed checks. Overall completion time is not estimated.`;
}
