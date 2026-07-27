/**
 * useClientReview — live adapter for the Client Review Room zone
 * (work order MDX-CLIENT-01).
 *
 * Calls `GET /api/mdx/client-review`, the read-first, client-scoped view
 * over unified_tasks. The server returns ONLY tasks whose client_visibility
 * is one of CLIENT_REVIEW_STATES (client_action_required | client_visible |
 * authority_ready), enforced by a SQL whitelist — `internal` work never
 * reaches this payload, so nothing this hook exposes can leak strategy.
 *
 * Each visibility state is returned as its own `DataState`, so the zone
 * must declare which of loading / idle / error / empty / ready it renders
 * per group. There is deliberately no fixture fallback: an unreachable
 * endpoint or a tenant with no classified tasks reads as exactly that.
 *
 * `scope` reports tenancy honestly (per the engineering-surface convention):
 * unified_tasks has no program uuid column yet, so without a `projectId`
 * filter the room is organization-wide and the zone labels it accordingly.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';
import type {
  ClientReviewGroups,
  ClientReviewState,
} from '@shared/client-visibility';

/** Curated client-safe row shape returned by the endpoint (timestamps are
 *  ISO strings over the wire). Mirrors the projection in
 *  server/routes/mdx-client-review.ts. */
export interface ClientReviewTask {
  taskId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  progress: number | null;
  taskType: string | null;
  moduleType: string;
  projectId: number | null;
  lifecyclePhase: string | null;
  market: string | null;
  filingType: string | null;
  clientVisibility: ClientReviewState;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export type ClientReviewScope = 'project' | 'organization';

interface ClientReviewPayload {
  data: {
    groups: ClientReviewGroups<ClientReviewTask>;
    counts: Record<ClientReviewState, number>;
    total: number;
  };
  meta?: {
    scope?: ClientReviewScope;
    projectId?: number | null;
    programId?: string | null;
  };
}

export interface UseClientReviewOptions {
  /** Narrow the room to one project (unified_tasks.project_id). */
  projectId?: number | null;
  /** Echoed through for kit-surface parity; see the route's scope note. */
  programId?: string | null;
  /** Pass false to hold the fetch (renders as idle). Defaults to true —
   *  the room is org-scoped, so it needs no selected program to load. */
  enabled?: boolean;
}

export interface UseClientReviewResult {
  /** Tasks the client owes an input on (signature, data, decision). */
  actionRequired: DataState<ClientReviewTask[]>;
  /** Tasks shared with the client for awareness/review. */
  visible: DataState<ClientReviewTask[]>;
  /** Agreed-final tasks queued for the health authority. */
  authorityReady: DataState<ClientReviewTask[]>;
  /** Per-state counts; zeros until the payload resolves. */
  counts: Record<ClientReviewState, number>;
  total: number;
  /** Honest tenancy of the room; 'organization' until reported otherwise. */
  scope: ClientReviewScope;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const IDLE = 'Client review is paused for this view.';

const ZERO_COUNTS: Record<ClientReviewState, number> = {
  client_action_required: 0,
  client_visible: 0,
  authority_ready: 0,
};

export function useClientReview(
  opts: UseClientReviewOptions = {},
): UseClientReviewResult {
  const { projectId, programId, enabled = true } = opts;

  const params = new URLSearchParams();
  if (projectId != null) params.set('project_id', String(projectId));
  if (programId != null) params.set('programId', programId);
  const qs = params.toString();
  const url = enabled ? `/api/mdx/client-review${qs ? `?${qs}` : ''}` : null;

  const { data, loading, error, refresh } = useFetchJson<ClientReviewPayload>(url);

  const state = (rows: ClientReviewTask[] | undefined): DataState<ClientReviewTask[]> =>
    toDataState(rows ?? null, loading, error, { idleReason: IDLE });

  return {
    actionRequired: state(data?.data.groups.client_action_required),
    visible: state(data?.data.groups.client_visible),
    authorityReady: state(data?.data.groups.authority_ready),
    counts: data?.data.counts ?? ZERO_COUNTS,
    total: data?.data.total ?? 0,
    scope: data?.meta?.scope ?? 'organization',
    loading,
    error,
    refresh,
  };
}
