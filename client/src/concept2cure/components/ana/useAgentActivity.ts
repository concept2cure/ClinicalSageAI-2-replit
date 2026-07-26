/**
 * useAgentActivity — client side of the live agent surface.
 *
 * AnA's deep investigations run in the background and outlive the chat turn
 * that started them (see server/services/ana/deep-investigation.ts). This hook
 * polls GET /api/ana-ri/agent-activity so the home screen can show a returning
 * user what AnA is working on — or just finished — without them having to ask.
 * The org is resolved server-side from the session, so the request carries only
 * auth headers.
 *
 * Fail-soft by construction: any error leaves the last good snapshot in place
 * and the card simply hides when there is nothing to surface. Polling pauses
 * when the tab is hidden and when `enabled` is false (e.g. off the home view),
 * so it never hammers the network.
 *
 * The render gate {@link hasSurfacedActivity} mirrors the server's greeting
 * gate (buildAgentActivityPromptBlock): active or recently-finished work is
 * worth surfacing; a lone stalled run is not.
 *
 * @module client/src/concept2cure/components/ana/useAgentActivity
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuthHeaders } from '../../../utils/authToken';

/** One background run, as surfaced to the UI. Mirrors the server AgentActivityItem. */
export interface AgentActivityItem {
  id: string;
  question: string;
  /** Honest status string (a stalled run says so, never an eternal "running"). */
  status: string;
  toolCalls: number;
  startedAt: string | null;
  completedAt: string | null;
}

/** The live-activity snapshot. Mirrors the server AgentActivitySummary. */
export interface AgentActivitySummary {
  activeCount: number;
  stalledCount: number;
  recentlyCompletedCount: number;
  items: AgentActivityItem[];
}

export const EMPTY_ACTIVITY: AgentActivitySummary = {
  activeCount: 0,
  stalledCount: 0,
  recentlyCompletedCount: 0,
  items: [],
};

/** How often to poll while the card is enabled and the tab is visible. */
export const AGENT_ACTIVITY_POLL_MS = 20_000;

/**
 * Is there anything worth surfacing to the user? True when work is active or
 * finished recently — a lone stalled run alone is not announced. Pure; mirrors
 * the server greeting gate so the visual card and the spoken greeting agree.
 */
export function hasSurfacedActivity(summary: AgentActivitySummary | null | undefined): boolean {
  if (!summary) return false;
  return summary.activeCount > 0 || summary.recentlyCompletedCount > 0;
}

/** Coerce an unknown payload into a safe summary (never throws). Pure. */
export function normalizeActivity(raw: unknown): AgentActivitySummary {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    activeCount: Number(r.activeCount) || 0,
    stalledCount: Number(r.stalledCount) || 0,
    recentlyCompletedCount: Number(r.recentlyCompletedCount) || 0,
    items: items.map((it) => {
      const i = (it ?? {}) as Record<string, unknown>;
      return {
        id: String(i.id ?? ''),
        question: String(i.question ?? ''),
        status: String(i.status ?? ''),
        toolCalls: Number(i.toolCalls) || 0,
        startedAt: i.startedAt != null ? String(i.startedAt) : null,
        completedAt: i.completedAt != null ? String(i.completedAt) : null,
      };
    }),
  };
}

export interface UseAgentActivityOptions {
  /** Poll only while true (e.g. on the home view). Defaults to true. */
  enabled?: boolean;
  /** Override the poll interval (ms). Defaults to {@link AGENT_ACTIVITY_POLL_MS}. */
  intervalMs?: number;
}

export interface UseAgentActivityReturn {
  summary: AgentActivitySummary;
  /** True until the first fetch resolves (so the card can stay quiet on load). */
  loading: boolean;
  error: string | null;
  /** Force an immediate refetch (e.g. after the user starts an investigation). */
  refresh: () => void;
}

/**
 * Poll the live agent-activity surface. Returns the latest snapshot plus a
 * manual `refresh`. Fail-soft: keeps the last snapshot on error.
 */
export function useAgentActivity(options: UseAgentActivityOptions = {}): UseAgentActivityReturn {
  const { enabled = true, intervalMs = AGENT_ACTIVITY_POLL_MS } = options;
  const [summary, setSummary] = useState<AgentActivitySummary>(EMPTY_ACTIVITY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards against a late response from a prior fetch overwriting a newer one.
  const reqSeq = useRef(0);

  const fetchOnce = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const res = await fetch('/api/ana-ri/agent-activity', {
        method: 'GET',
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (seq !== reqSeq.current) return; // superseded
      if (!res.ok) {
        setError((payload?.error?.message as string) || (payload?.error as string) || `HTTP ${res.status}`);
        return;
      }
      setError(null);
      setSummary(normalizeActivity(payload?.data ?? payload));
    } catch (e: any) {
      if (seq !== reqSeq.current) return;
      setError(e?.message || 'Request failed');
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    void fetchOnce();
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        void fetchOnce();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();

    // Refetch immediately when the tab becomes visible again.
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) void fetchOnce();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, intervalMs, fetchOnce]);

  return { summary, loading, error, refresh: fetchOnce };
}
