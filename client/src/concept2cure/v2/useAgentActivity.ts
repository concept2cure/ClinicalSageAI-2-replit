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

function activityCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function activityTime(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function coerceActivityItem(raw: unknown): AgentActivityItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id || typeof item.question !== 'string' || typeof item.status !== 'string' ||
      !activityCount(item.toolCalls) || !activityTime(item.startedAt) || !activityTime(item.completedAt)) return null;
  return { id: item.id, question: item.question, status: item.status, toolCalls: item.toolCalls,
    startedAt: item.startedAt, completedAt: item.completedAt };
}

function coerceSummary(raw: unknown): AgentActivitySummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!activityCount(r.activeCount) || !activityCount(r.stalledCount) || !activityCount(r.recentlyCompletedCount) || !Array.isArray(r.items)) return null;
  const items: AgentActivityItem[] = [];
  for (const rawItem of r.items) {
    const item = coerceActivityItem(rawItem);
    if (!item) return null;
    items.push(item);
  }
  return { activeCount: r.activeCount, stalledCount: r.stalledCount, recentlyCompletedCount: r.recentlyCompletedCount, items };
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
  const session = useAuthoringReadSession(authService.getUser());
  const scopeKey = `${session.actor}:${session.key}`;
  const [read, setRead] = React.useState<{ owner: string; state: AgentActivityState; summary: AgentActivitySummary | null; readAt: number | null } | null>(null);
  const [epoch, setEpoch] = React.useState(0);
  const refresh = React.useCallback(() => setEpoch((n) => n + 1), []);
  const generation = React.useMemo(() => ({ session, enabled, epoch, wakeKey }), [session, enabled, epoch, wakeKey]);
  const owner = React.useRef(generation); owner.current = generation;
  const inFlight = React.useRef<{ session: typeof session; promise: Promise<void> } | null>(null);

  React.useEffect(() => {
    if (!enabled || !session.sameRevision()) return;
    let active = true;
    const held = () => active && owner.current === generation && session.sameRevision();
    const readSummary = () => {
      if (!held() || inFlight.current?.session === session) return;
      const flight = { session, promise: Promise.resolve() };
      inFlight.current = flight;
      flight.promise = Promise.resolve().then(async () => {
        if (!held()) return;
        try {
          const [organizationId, userId] = session.actor.split(':').map(Number);
          const headers = capturedActorHeaders({ organizationId, userId });
          if (!held()) return;
          setRead(previous => previous?.owner === scopeKey && previous.state === 'ready' ? previous
            : { owner: scopeKey, state: 'loading', summary: null, readAt: null });
          const res = await apiCall<{ success?: boolean; data?: unknown }>('GET', '/api/ana-ri/agent-activity', undefined, held, headers);
          if (!held()) return;
          const summary = res?.ok && res.body?.success === true ? coerceSummary(res.body.data) : null;
          setRead({ owner: scopeKey, state: summary ? 'ready' : 'error', summary, readAt: summary ? Date.now() : null });
        } catch { if (held()) setRead({ owner: scopeKey, state: 'error', summary: null, readAt: null }); }
      }).finally(() => { if (inFlight.current === flight) inFlight.current = null; });
    };
    // Refreshes supersede old responses, but wait for that account's pending
    // request to settle instead of starting overlapping polls.
    const pending = inFlight.current;
    if (pending?.session === session) void pending.promise.then(readSummary);
    else readSummary();
    const timer = setInterval(readSummary, AGENT_ACTIVITY_POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [enabled, generation, scopeKey, session]);

  const owned = enabled && session.sameRevision() && read?.owner === scopeKey ? read : null;
  return { state: !enabled ? 'idle' : owned?.state ?? 'loading', summary: owned?.summary ?? null, readAt: owned?.readAt ?? null, refresh };
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

function measuredWorkerEstimate(worker: WorkerSnapshot): WorkerSnapshot['estimate'] {
  if (!worker.estimate || worker.phase !== 'checking' || worker.outcome !== null || worker.basis !== 'deterministic_checks' ||
      worker.parentState !== undefined && worker.parentState !== 'running' || worker.completed === null || worker.total === null ||
      worker.total <= worker.completed || worker.estimate.sampleCount < 3 || worker.estimate.sampleCount > worker.completed) return null;
  return worker.estimate;
}

function remainingCheckEstimate(worker: WorkerSnapshot, now: number) {
  const estimate = measuredWorkerEstimate(worker);
  if (!estimate) return null;
  const elapsed = now - Date.parse(estimate.at);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= estimate.upperMs) return null;
  return { lowerMs: Math.max(0, estimate.lowerMs - elapsed), upperMs: estimate.upperMs - elapsed, sampleCount: estimate.sampleCount };
}

/** The text and its live clock share the same current measurement window. */
export function workerEstimateAvailable(worker: WorkerSnapshot, now = Date.now()): boolean {
  return remainingCheckEstimate(worker, now) !== null;
}

export function workerEstimate(worker: WorkerSnapshot, now = Date.now()): string {
  const estimate = remainingCheckEstimate(worker, now);
  if (!estimate) return 'Completion estimate unavailable.';
  const { lowerMs, upperMs } = estimate;
  const unit = upperMs < 60_000 ? 'second' : 'minute', scale = unit === 'second' ? 1000 : 60_000;
  const lower = Math.floor(lowerMs / scale), upper = Math.ceil(upperMs / scale);
  const range = upperMs < 1000 ? 'estimated under a second' : lower === 0 ? `estimated up to ${upper} ${unit}${upper === 1 ? '' : 's'}`
    : `approximately ${lower}${lower === upper ? '' : `–${upper}`} ${unit}${upper === 1 ? '' : 's'}`;
  return `Remaining checks: ${range}, based on ${estimate.sampleCount} observed checks. Overall completion time is not estimated.`;
}
