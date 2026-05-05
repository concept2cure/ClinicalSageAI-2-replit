/**
 * useCorrespondence + useCorrespondenceDetail — fetch real correspondence
 * (RTAs / AI-Holds / Day-100 / NB Q&A) from c2c_correspondence and adapt
 * to the kit's `Correspondence` and `CorrespondenceDetail` shapes.
 *
 * Endpoints (server/routes/regulatory-correspondence.ts):
 *   GET /api/regulatory-correspondence/correspondence?projectId=N
 *   GET /api/regulatory-correspondence/correspondence/:correspondenceId
 *
 * The list endpoint returns rows from c2c_correspondence; the detail
 * endpoint also returns the linked `c2c_correspondence_issues` (which
 * map to the kit's deficiency decomposition) and `c2c_response_packages`
 * (which map onto the AnA-drafted response).
 *
 * Shape gap (backend → kit): the backend status enum is richer
 * (`new` | `triaged` | `in_progress` | `responded` | `closed`); we collapse
 * to the kit's three states (`open` | `in_review` | `closed`).
 * `triage.priority` is derived from `urgency`. `triage.ana` is a stub
 * (the orchestrator can fill this on the server-side row when AnA has
 * triaged). `triage.tasks` counts pending issues for that correspondence.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  Correspondence,
  CorrespondenceDetail,
  CorrespondenceDeficiency,
  CorrespondencePriority,
  CorrespondenceStatus,
} from '../types';

interface ServerCorrespondenceRow {
  id: string;
  organization_id: number;
  project_id: number;
  submission_id: string;
  direction: 'inbound' | 'outbound';
  source_channel: string;
  communication_type: string;
  subject: string;
  sender: string | null;
  recipients: unknown;
  received_at: string | null;
  sent_at: string | null;
  due_date: string | null;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  response_required: boolean;
  status: 'new' | 'triaged' | 'in_progress' | 'responded' | 'closed';
  source_message_id: string | null;
  parser_metadata: Record<string, unknown>;
  attachment_refs: unknown[];
  parsed_text: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface ServerCorrespondenceIssue {
  id: string;
  correspondence_id: string;
  category: string;
  subcategory: string | null;
  severity: 'minor' | 'major' | 'critical';
  blocker: boolean;
  response_required: boolean;
  source_excerpt: string | null;
  confidence: string | null;
  human_review_status: 'pending' | 'reviewed' | 'rejected';
  due_date: string | null;
  mapped_ctd_sections: Array<{ section: string | number; label: string }>;
  mapped_artifact_ids: unknown[];
  owner_user_id: number | null;
  resolution_status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
}

interface ListPayload {
  data: ServerCorrespondenceRow[];
}

interface DetailPayload {
  data: ServerCorrespondenceRow;
  issues: ServerCorrespondenceIssue[];
  responsePackages: unknown[];
}

function statusToKit(status: ServerCorrespondenceRow['status']): CorrespondenceStatus {
  if (status === 'closed' || status === 'responded') return 'closed';
  if (status === 'triaged' || status === 'in_progress') return 'in_review';
  return 'open';
}

function urgencyToPriority(urgency: ServerCorrespondenceRow['urgency']): CorrespondencePriority {
  if (urgency === 'critical' || urgency === 'high') return 'high';
  if (urgency === 'low')                            return 'low';
  return 'med';
}

function rowToKit(row: ServerCorrespondenceRow, issueCount: number = 0): Correspondence {
  return {
    id:       row.id,
    kind:     row.communication_type,
    channel:  row.source_channel,
    from:     row.sender ?? '—',
    received: row.received_at ?? row.created_at,
    due:      row.due_date ?? '',
    status:   statusToKit(row.status),
    ai:       Boolean(
      row.parser_metadata && typeof row.parser_metadata === 'object'
        ? (row.parser_metadata as { ana_triaged?: boolean }).ana_triaged
        : false,
    ),
    subject:  row.subject,
    summary:  row.summary ?? '',
    refs:     [],
    triage: {
      ana:      'Pending triage',
      priority: urgencyToPriority(row.urgency),
      owner:    '—',
      tasks:    issueCount,
    },
  };
}

function severityToKit(s: ServerCorrespondenceIssue['severity']): CorrespondenceDeficiency['severity'] {
  if (s === 'critical') return 'critical';
  if (s === 'major')    return 'major';
  return 'minor';
}

function issueToDeficiency(issue: ServerCorrespondenceIssue, n: number): CorrespondenceDeficiency {
  return {
    id:       issue.id,
    n,
    title:    issue.subcategory ?? issue.category,
    body:     issue.source_excerpt ?? '',
    refs:     issue.mapped_ctd_sections ?? [],
    regs:     [],
    severity: severityToKit(issue.severity),
    complete: issue.resolution_status === 'resolved' || issue.resolution_status === 'closed',
  };
}

export interface UseCorrespondenceResult {
  items: Correspondence[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCorrespondence(projectId: number | null): UseCorrespondenceResult {
  const [state, setState] = useState<{
    items: Correspondence[] | null;
    loading: boolean;
    error: string | null;
  }>({ items: null, loading: false, error: null });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (projectId === null) {
      setState({ items: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const url = `/api/regulatory-correspondence/correspondence?projectId=${projectId}`;
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
        const items = payload.data.map((r) => rowToKit(r));
        setState({ items, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load correspondence',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, tick]);

  return { ...state, refresh };
}

export interface UseCorrespondenceDetailResult {
  detail: CorrespondenceDetail | null;
  /** Light-weight row representation, useful as a header alongside the detail. */
  row: Correspondence | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * useCorrespondenceDetail — adapts the detail endpoint into the kit's
 * CorrespondenceDetail. Note: the kit's `letter.body[]` paragraph array
 * is reconstructed from `parsed_text` (split on blank lines). When the
 * backend grows a structured `letter_body` JSON column, swap this in.
 */
export function useCorrespondenceDetail(correspondenceId: string | null): UseCorrespondenceDetailResult {
  const [state, setState] = useState<{
    detail: CorrespondenceDetail | null;
    row: Correspondence | null;
    loading: boolean;
    error: string | null;
  }>({ detail: null, row: null, loading: false, error: null });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!correspondenceId) {
      setState({ detail: null, row: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(`/api/regulatory-correspondence/correspondence/${encodeURIComponent(correspondenceId)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as DetailPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        const row = rowToKit(payload.data, payload.issues.length);
        const bodyParas = (payload.data.parsed_text ?? '')
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        const detail: CorrespondenceDetail = {
          letter: {
            from_name:   payload.data.sender ?? '—',
            from_title:  '',
            from_office: payload.data.source_channel,
            ref:         payload.data.source_message_id ?? row.id,
            our_ref:     '',
            dated:       payload.data.received_at?.slice(0, 10) ?? '',
            received_at: payload.data.received_at ?? payload.data.created_at,
            via:         payload.data.source_channel,
            body:        bodyParas,
            signature: {
              sign_off: '',
              name:     payload.data.sender ?? '',
              title:    '',
            },
          },
          deficiencies: payload.issues.map((issue, i) => issueToDeficiency(issue, i + 1)),
          draft: { status: 'unstarted' },
        };
        setState({ detail, row, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load correspondence detail',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [correspondenceId, tick]);

  return { ...state, refresh };
}
