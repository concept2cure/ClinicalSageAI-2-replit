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
