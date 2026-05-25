/**
 * useConversations — live data adapter for the AnA conversation history.
 *
 * Installs the kit surface against the real endpoint
 * `GET /api/mdx/ana/threads` (server/routes/mdx-ana-memory.ts), which lists
 * chat_threads rows. Maps each thread → the kit ConvRow. `filters` is the
 * closed UI filter registry; `kpis` is derived analytics with no backend
 * yet, so it stays null (surface renders its empty state).
 */

import { useFetchJson } from './useFetchJson';
import {
  CONVERSATIONS,
  CONV_FILTERS,
  CONV_KPIS,
} from '../data/conversations';

type ConvRow = (typeof CONVERSATIONS)[number];
type FilterRow = (typeof CONV_FILTERS)[number];
type KpiRow = (typeof CONV_KPIS)[number];

export interface ConversationsFilters {
  program?: string;
  pinned?: boolean;
  q?: string;
}

/** Row shape from chat_threads (ana/threads list route). */
interface ServerThreadRow {
  id: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

/** Server envelope: ok(res, rows) → { data: rows }. */
interface ConversationsPayload {
  data: ServerThreadRow[];
}

function adaptConversations(rows: ServerThreadRow[]): ConvRow[] {
  return rows.map((t) => {
    const m = t.metadata ?? {};
    return {
      id: t.id,
      program: String(m.program ?? m.programId ?? ''),
      surface: String(m.surface ?? ''),
      topic: t.title ?? '',
      turns: Number(m.turns ?? 0),
      lastActive: t.updated_at ?? '',
      participants: Array.isArray(m.participants) ? (m.participants as string[]) : [],
      pinned: Boolean(m.pinned),
      draftedDocs: Number(m.draftedDocs ?? 0),
      summary: String(m.summary ?? ''),
    } as ConvRow;
  });
}

export interface UseConversationsResult {
  conversations: ConvRow[] | null;
  filters: FilterRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useConversations(
  filters: ConversationsFilters = {},
): UseConversationsResult {
  const params = new URLSearchParams();
  if (filters.program) params.set('program_id', filters.program);
  if (filters.pinned) params.set('pinned', 'true');
  const qs = params.toString();
  const url = `/api/mdx/ana/threads${qs ? `?${qs}` : ''}`;
  const { data, loading, error, refresh } =
    useFetchJson<ConversationsPayload>(url);
  return {
    conversations: data ? adaptConversations(data.data ?? []) : null,
    filters: data ? CONV_FILTERS.slice() : null,
    kpis: null,
    loading,
    error,
    refresh,
  };
}
