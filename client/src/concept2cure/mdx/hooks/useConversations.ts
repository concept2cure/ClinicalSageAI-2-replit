/**
 * useConversations — live data adapter for the AnA conversation history.
 *
 * Calls `GET /api/mdx/conversations?...`. Endpoint not yet wired;
 * surface falls back to fixture.
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

interface ConversationsPayload {
  data: {
    conversations: ConvRow[];
    filters: FilterRow[];
    kpis: KpiRow[];
  };
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
  if (filters.program) params.set('program', filters.program);
  if (filters.pinned) params.set('pinned', '1');
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  const url = `/api/mdx/conversations${qs ? `?${qs}` : ''}`;
  const { data, loading, error, refresh } =
    useFetchJson<ConversationsPayload>(url);
  return {
    conversations: data?.data.conversations ?? null,
    filters: data?.data.filters ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
