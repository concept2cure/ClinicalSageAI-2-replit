/**
 * useNotifications — live data adapter for the Notifications inbox.
 *
 * Calls `GET /api/mdx/notifications?...` with unread/kind filter params.
 * Endpoint defaults to 'both' mode in the dataMode registry (expectedLiveBy
 * 2026-08-01).
 */

import { useFetchJson } from './useFetchJson';
import { NOTIFS, NOTIF_KINDS, NOTIF_KPIS } from '../data/notifications';

type NotifRow = (typeof NOTIFS)[number];
type KindRow = (typeof NOTIF_KINDS)[number];
type KpiRow = (typeof NOTIF_KPIS)[number];

export interface NotificationsFilters {
  unread?: boolean;
  kind?: string;
}

interface NotificationsPayload {
  data: {
    notifications: NotifRow[];
    kinds: KindRow[];
    kpis: KpiRow[];
  };
}

export interface UseNotificationsResult {
  notifications: NotifRow[] | null;
  kinds: KindRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useNotifications(
  filters: NotificationsFilters = {},
): UseNotificationsResult {
  const params = new URLSearchParams();
  if (filters.unread) params.set('unread', '1');
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  const qs = params.toString();
  const url = `/api/mdx/notifications${qs ? `?${qs}` : ''}`;
  const { data, loading, error, refresh } =
    useFetchJson<NotificationsPayload>(url);
  return {
    notifications: data?.data.notifications ?? null,
    kinds: data?.data.kinds ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
