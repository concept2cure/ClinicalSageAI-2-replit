/**
 * useProgramExtras — fetches the four per-program sidecar feeds for
 * ProjectHome:
 *   activity     /api/regulatory-programs/:id/activity        (audit_logs)
 *   milestones   /api/regulatory-programs/:id/milestones      (derived from
 *                                                              q-sub meetings,
 *                                                              section
 *                                                              completion,
 *                                                              and program
 *                                                              status/phase)
 *   rimRecs      /api/regulatory-programs/:id/rim-recommendations
 *                                                              (derived from
 *                                                              dossier state)
 *   changeImpact /api/regulatory-programs/:id/change-impact   (audit_logs +
 *                                                              section
 *                                                              cross-refs)
 *
 * One hook → four parallel fetches; cancels on unmount or program-id
 * change. Each feed surfaces independently so a single failure doesn't
 * blank the whole panel.
 */

import { useEffect, useState } from 'react';

export interface ActivityEvent {
  id: string;
  when: string;            /* ISO */
  who: string;
  what: string;
  action: string;
  changedFields: string[];
}

export interface ProgramMilestone {
  id: string;
  label: string;
  date: string;
  state: 'complete' | 'active' | 'idle';
}

export interface RimRecommendation {
  id: string;
  body: string;
  kind: 'mapping' | 'cross-ref' | 'consistency' | 'standards';
  impact: 'low' | 'med' | 'high';
}

export interface ChangeImpactEntry {
  id: string;
  who: string;
  when: string;
  what: string;
  affects: string[];
}

interface Payload<T> { data: T[] }

function relativeWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleDateString();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export interface UseProgramExtrasResult {
  activity:     ActivityEvent[]      | null;
  milestones:   ProgramMilestone[]   | null;
  rimRecs:      RimRecommendation[]  | null;
  changeImpact: ChangeImpactEntry[]  | null;
  loading: boolean;
  error: string | null;
  /** Activity rows with humanized "when" strings (e.g. "32m"). */
  activityFormatted: ActivityEvent[] | null;
  /** Change-impact rows with humanized "when" strings. */
  changeImpactFormatted: ChangeImpactEntry[] | null;
}

export function useProgramExtras(programId: string | null): UseProgramExtrasResult {
  const [state, setState] = useState<{
    activity:     ActivityEvent[]      | null;
    milestones:   ProgramMilestone[]   | null;
    rimRecs:      RimRecommendation[]  | null;
    changeImpact: ChangeImpactEntry[]  | null;
    loading: boolean;
    error: string | null;
  }>({
    activity: null, milestones: null, rimRecs: null, changeImpact: null,
    loading: false, error: null,
  });

  useEffect(() => {
    if (!programId) {
      setState({ activity: null, milestones: null, rimRecs: null, changeImpact: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const base = `/api/regulatory-programs/${encodeURIComponent(programId)}`;
    const fetchJson = async <T,>(path: string): Promise<T | null> => {
      try {
        const res = await fetch(base + path, { credentials: 'include' });
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        return null;
      }
    };

    Promise.all([
      fetchJson<Payload<ActivityEvent>>('/activity?limit=20'),
      fetchJson<Payload<ProgramMilestone>>('/milestones'),
      fetchJson<Payload<RimRecommendation>>('/rim-recommendations'),
      fetchJson<Payload<ChangeImpactEntry>>('/change-impact'),
    ]).then(([act, ms, recs, ci]) => {
      if (cancelled) return;
      setState({
        activity:     act?.data  ?? null,
        milestones:   ms?.data   ?? null,
        rimRecs:      recs?.data ?? null,
        changeImpact: ci?.data   ?? null,
        loading: false,
        error: null,
      });
    });

    return () => { cancelled = true; };
  }, [programId]);

  return {
    ...state,
    activityFormatted: state.activity
      ? state.activity.map((e) => ({ ...e, when: relativeWhen(e.when) }))
      : null,
    changeImpactFormatted: state.changeImpact
      ? state.changeImpact.map((e) => ({ ...e, when: relativeWhen(e.when) }))
      : null,
  };
}
