/**
 * useTriageQueue — the postmarket "what needs attention now" feed.
 *
 * Reads `GET /api/capa-mdr/triage`, which merges open complaints, MDR
 * events and CAPA records into one list ordered by regulatory urgency:
 * overdue first, then by days-to-due ascending, then most recent.
 *
 * ## Why this exists
 *
 * The vigilance surface was reading a thin `/api/mdx/postmarket`
 * aggregate over two tables, and rendering its reporting clocks from
 * fixtures. Meanwhile this service — complaints, MDR reportability, CAPA
 * actions, vigilance history, and a real due-date computation — was
 * fully built and consumed by nothing.
 *
 * That gap matters more here than on other surfaces. MDR reporting
 * windows are statutory (FDA 5-day and 30-day; EU MDR Article 87
 * 15-day), so an invented clock is not a cosmetic placeholder — it is a
 * countdown to a missed legal obligation, displayed as though it were
 * real.
 *
 * The server computes `overdue` and `daysToDue` against its own clock,
 * and this hook does not recompute them. A browser with a skewed clock
 * must not be able to move a regulatory deadline.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

/** One item in the merged triage queue. Mirrors TriageQueueItem. */
export interface TriageItem {
  kind: 'complaint' | 'mdr' | 'capa';
  id: string;
  programId: string;
  /** Human-facing identifier (complaint / MDR / CAPA code). */
  code: string;
  title: string;
  state: string;
  riskOrSeverity: string | null;
  receivedOrOpenedAt: string;
  /** Statutory or planned due date, ISO. Null when the kind has none. */
  dueAt: string | null;
  /** Server-computed. Negative once past due. */
  daysToDue: number | null;
  /** Server-computed. Never derived in the browser. */
  overdue: boolean;
}

interface TriagePayload {
  items: TriageItem[];
  count: number;
}

export interface UseTriageQueueResult {
  items: DataState<TriageItem[]>;
  /** Overdue items, already ordered first by the server. */
  overdue: TriageItem[];
  /** Items due within `soonDays`, excluding those already overdue. */
  dueSoon: TriageItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface UseTriageQueueOptions {
  /** Narrow to one program. Omit for the whole portfolio. */
  programId?: string | null;
  /** Include closed items too. Defaults to open-only. */
  includeClosed?: boolean;
  /** Threshold for the "due soon" bucket. Defaults to 7 days. */
  soonDays?: number;
}

export function useTriageQueue(opts: UseTriageQueueOptions = {}): UseTriageQueueResult {
  const { programId, includeClosed = false, soonDays = 7 } = opts;

  const params = new URLSearchParams();
  if (programId) params.set('program_id', programId);
  if (includeClosed) params.set('open_only', 'false');
  const qs = params.toString();

  const { data, loading, error, refresh } = useFetchJson<TriagePayload>(
    `/api/capa-mdr/triage${qs ? `?${qs}` : ''}`,
  );

  const items = toDataState(data?.items ?? null, loading, error);
  const rows = data?.items ?? [];

  return {
    items,
    overdue: rows.filter((i) => i.overdue),
    /* `daysToDue` can be negative on an item the server has not marked
       overdue (a CAPA past its target date but already closed), so the
       lower bound is explicit rather than assumed. */
    dueSoon: rows.filter(
      (i) => !i.overdue && i.daysToDue !== null && i.daysToDue >= 0 && i.daysToDue <= soonDays,
    ),
    loading,
    error,
    refresh,
  };
}
