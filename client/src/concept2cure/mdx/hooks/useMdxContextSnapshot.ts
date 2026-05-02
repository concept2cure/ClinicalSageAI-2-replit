/**
 * useMdxContextSnapshot — pulls the read-only MDX context snapshot
 * from /api/ana/mdx-context-snapshot whenever the active surface or
 * program changes. Fail-soft: any fetch failure just leaves the
 * snapshot null so the AnA rail degrades to chat-only.
 *
 * Used by App.tsx to feed the AnA rail's alerts strip + onboarding
 * milestone hint. The same payload backs AnA's system prompt server-
 * side, so the rail and the chat are guaranteed to see the same
 * universe.
 */

import * as React from 'react';

export interface MdxAlert {
  id: string;
  kind: string;
  severity: 'info' | 'warn' | 'critical';
  organizationId: number;
  programId?: string;
  message: string;
  suggestedTool?: string;
  suggestedSurface?: string;
  detail: Record<string, unknown>;
}

export interface MdxOnboardingMilestone {
  id: string;
  label: string;
  nextStep: string;
  workflowId?: string;
}

export interface MdxContextSnapshot {
  organizationId: number;
  activeNav: string | null;
  activeProgramCode: string | null;
  surface: { key: string; label: string; status: string } | null;
  milestone: MdxOnboardingMilestone | null;
  alerts: MdxAlert[];
  workflowsRelevant: Array<{ id: string; label: string; objective: string }>;
  toolsRelevant: Array<{ name: string; description: string; proposeWhen: string }>;
  tenantExtraNotes: string | null;
}

interface UseMdxContextSnapshotInput {
  activeNav: string | null;
  activeProgramCode: string | null;
  /** Refresh interval in ms. Default 60_000. Set to 0 to disable polling. */
  pollMs?: number;
}

export function useMdxContextSnapshot({
  activeNav,
  activeProgramCode,
  pollMs = 60_000,
}: UseMdxContextSnapshotInput): {
  snapshot: MdxContextSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = React.useState<MdxContextSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reqIdRef = React.useRef(0);

  const fetchSnapshot = React.useCallback(async () => {
    if (!activeNav) {
      setSnapshot(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ activeNav });
      if (activeProgramCode) params.set('activeProgramCode', activeProgramCode);
      const res = await fetch(`/api/ana/mdx-context-snapshot?${params.toString()}`, {
        credentials: 'include',
      });
      if (myReq !== reqIdRef.current) return; // a newer request is in flight
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as MdxContextSnapshot;
      setSnapshot(body);
    } catch (err) {
      if (myReq !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [activeNav, activeProgramCode]);

  React.useEffect(() => {
    fetchSnapshot();
    if (pollMs > 0) {
      const id = setInterval(fetchSnapshot, pollMs);
      return () => clearInterval(id);
    }
  }, [fetchSnapshot, pollMs]);

  return { snapshot, loading, error, refresh: fetchSnapshot };
}
