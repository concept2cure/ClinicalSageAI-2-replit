/**
 * useSubmissions + useSubmissionDetail — Submission Center pane data,
 * read straight from the kit-shaped backend adapter.
 *
 * Endpoints (server/routes/mdx-submissions.routes.ts):
 *   GET /api/mdx/submissions[?projectId=N&workstream=mdx&type=510k]
 *   GET /api/mdx/submissions/:packageId
 *
 * The server side does the readiness/audit/owner joins and returns the
 * exact `Submission` / `SubmissionDetail` shapes from
 * client/src/concept2cure/mdx/types.ts. Panes drop their fixtures and
 * read these directly — no client-side stitching.
 *
 * Backed today: SUBMISSIONS_V2 list view (kit-shaped), SubmissionDetail
 * build outline + validation + readiness-derived stage/status. Pending
 * follow-ups: signatures (workflow_approvals join), receipt (transmission
 * tables), aic chain (audit-trail filtered by entity_type='submission').
 * The hook contract is final; future server enrichment fills in the
 * empty arrays without changing the React API.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  Submission,
  SubmissionDetail,
  SubmissionType,
  SubmissionWorkstream,
} from '../types';

interface ListPayload {
  data: Submission[];
}

interface DetailPayload {
  data: SubmissionDetail & Submission;
}

export interface UseSubmissionsOptions {
  /** Filter to submissions on a specific project (DB id, not program code). */
  projectId?: number;
  /** Filter to a workstream (mdx / biotech / pharma / cro). */
  workstream?: SubmissionWorkstream;
  /** Filter to a specific submission type (e.g. '510k'). */
  type?: SubmissionType;
}

export interface UseSubmissionsResult {
  submissions: Submission[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSubmissions(opts: UseSubmissionsOptions = {}): UseSubmissionsResult {
  const [state, setState] = useState<{
    submissions: Submission[] | null;
    loading: boolean;
    error: string | null;
  }>({ submissions: null, loading: false, error: null });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t: number) => t + 1), []);

  const { projectId, workstream, type } = opts;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const params = new URLSearchParams();
    if (projectId !== undefined)  params.set('projectId', String(projectId));
    if (workstream)               params.set('workstream', workstream);
    if (type)                     params.set('type', type);

    const url = params.toString() ? `/api/mdx/submissions?${params}` : '/api/mdx/submissions';
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as ListPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ submissions: payload.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load submissions',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, workstream, type, tick]);

  return { ...state, refresh };
}

export interface UseSubmissionDetailResult {
  /** Full kit-shaped detail, or null while loading / on miss. */
  detail: (SubmissionDetail & Submission) | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSubmissionDetail(submissionId: string | null): UseSubmissionDetailResult {
  const [state, setState] = useState<{
    detail: (SubmissionDetail & Submission) | null;
    loading: boolean;
    error: string | null;
  }>({ detail: null, loading: false, error: null });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t: number) => t + 1), []);

  useEffect(() => {
    if (!submissionId) {
      setState({ detail: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(`/api/mdx/submissions/${encodeURIComponent(submissionId)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as DetailPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ detail: payload.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load submission detail',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [submissionId, tick]);

  return { ...state, refresh };
}
