/**
 * useScheduleOfEvents — data hook for AnA's regulatory-aware project schedule.
 *
 * Reads the plan + milestones + goals + revisions + health for a project and
 * exposes the AnA-driven operations (generate, amend, proactive review, reset
 * goals). Mirrors the fetch conventions of the other project data hooks
 * (getAuthHeaders + credentials:'include', /api/concept2cure/projects/:id/...).
 */
import { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';

export type ScheduleStatus =
  | 'not_started'
  | 'in_progress'
  | 'at_risk'
  | 'completed'
  | 'slipped'
  | 'blocked';

export type OverallScheduleStatus = 'on_track' | 'at_risk' | 'off_track';

export interface SchedulePlan {
  id: number;
  status: string;
  projectType: string | null;
  regulatoryFramework: string | null;
  basisSummary: string | null;
  anaSummary: string | null;
  confidence: string | null;
  version: number;
  baselineDate: string | null;
  targetDate: string | null;
  generatedByAna: boolean;
  lastReviewedByAnaAt: string | null;
  lastAmendedAt: string | null;
  updatedAt: string | null;
}

export interface ScheduleMilestone {
  id: number;
  key: string;
  title: string;
  description: string | null;
  category: string;
  status: ScheduleStatus;
  baselineDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  progress: number;
  isCritical: boolean;
  regulatoryBasis: string | null;
  ownerRole: string | null;
  dependsOn: string[];
  sortOrder: number;
  anaRationale: string | null;
  slipDays: number | null;
}

export interface ScheduleGoal {
  id: number;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: string;
  priority: string;
  metric: string | null;
  currentContext: string | null;
  anaRationale: string | null;
  lastResetByAnaAt: string | null;
}

export interface ScheduleRevision {
  id: number;
  revisionType: string;
  summary: string;
  detail: unknown;
  triggeredBy: string | null;
  createdByAna: boolean;
  createdAt: string;
}

export interface ScheduleHealth {
  assessedAt: string;
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  slipped: number;
  overallStatus: OverallScheduleStatus;
  summary: string;
  milestones: Array<{
    key: string;
    title: string;
    previousStatus: ScheduleStatus;
    nextStatus: ScheduleStatus;
    slipDays: number | null;
    changed: boolean;
    isCritical: boolean;
    reason: string;
  }>;
}

export interface ScheduleOfEvents {
  plan: SchedulePlan | null;
  milestones: ScheduleMilestone[];
  goals: ScheduleGoal[];
  revisions: ScheduleRevision[];
  health: ScheduleHealth;
}

export interface GoalInput {
  title: string;
  description?: string;
  target_date?: string;
  priority?: string;
  metric?: string;
}

export interface GenerateInput {
  project_type?: string;
  target_date?: string;
  baseline_date?: string;
  goals?: GoalInput[];
}

function base(projectId: string): string {
  return `/api/concept2cure/projects/${encodeURIComponent(projectId)}/schedule-of-events`;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface UseScheduleOfEventsReturn {
  data: ScheduleOfEvents | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refetch: () => void;
  generate: (input?: GenerateInput) => Promise<void>;
  amend: (milestoneKey: string, patch: { status?: ScheduleStatus; new_target_date?: string; progress?: number; note?: string }) => Promise<void>;
  review: () => Promise<void>;
  resetGoals: (goals: GoalInput[], rationale: string) => Promise<void>;
}

export function useScheduleOfEvents(projectId: string): UseScheduleOfEventsReturn {
  const [data, setData] = useState<ScheduleOfEvents | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base(projectId), { headers: getAuthHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ScheduleOfEvents);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedule');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const run = useCallback(
    async (fn: () => Promise<any>) => {
      setBusy(true);
      setError(null);
      try {
        const body = await fn();
        // Mutating endpoints return { schedule } or the view directly.
        if (body && typeof body === 'object') {
          if (body.schedule) setData(body.schedule as ScheduleOfEvents);
          else if (body.plan !== undefined) setData(body as ScheduleOfEvents);
          else await load();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Operation failed');
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const generate = useCallback(
    (input?: GenerateInput) => run(() => postJson(`${base(projectId)}/generate`, input ?? {})),
    [projectId, run],
  );
  const amend = useCallback(
    (milestoneKey: string, patch: { status?: ScheduleStatus; new_target_date?: string; progress?: number; note?: string }) =>
      run(() => postJson(`${base(projectId)}/amend`, { milestone_key: milestoneKey, ...patch })),
    [projectId, run],
  );
  const review = useCallback(() => run(() => postJson(`${base(projectId)}/review`, { apply: true })), [projectId, run]);
  const resetGoals = useCallback(
    (goals: GoalInput[], rationale: string) => run(() => postJson(`${base(projectId)}/goals/reset`, { goals, rationale })),
    [projectId, run],
  );

  return { data, loading, busy, error, refetch: load, generate, amend, review, resetGoals };
}
