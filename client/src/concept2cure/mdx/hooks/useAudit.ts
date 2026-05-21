/**
 * useAudit — live data adapter for the Audit log surface.
 *
 * Calls `GET /api/mdx/audit?...` with filter params. Endpoint defaults
 * to 'both' mode in the dataMode registry (expectedLiveBy 2026-07-15) —
 * try live, fall back to fixture so the surface still renders during
 * partial-availability windows.
 */

import { useFetchJson } from './useFetchJson';
import {
  AUDIT_ACTIONS,
  AUDIT_EVENTS,
  AUDIT_KPIS,
  AUDIT_RESOURCES,
} from '../data/audit';

type EventRow = (typeof AUDIT_EVENTS)[number];
type ActionRow = (typeof AUDIT_ACTIONS)[number];
type ResourceRow = (typeof AUDIT_RESOURCES)[number];
type KpiRow = (typeof AUDIT_KPIS)[number];

export interface AuditFilters {
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  resource?: string;
  query?: string;
}

interface AuditPayload {
  data: {
    events: EventRow[];
    actions: ActionRow[];
    resources: ResourceRow[];
    kpis: KpiRow[];
  };
}

export interface UseAuditResult {
  events: EventRow[] | null;
  actions: ActionRow[] | null;
  resources: ResourceRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAudit(filters: AuditFilters = {}): UseAuditResult {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const url = `/api/mdx/audit${qs ? `?${qs}` : ''}`;
  const { data, loading, error, refresh } = useFetchJson<AuditPayload>(url);
  return {
    events: data?.data.events ?? null,
    actions: data?.data.actions ?? null,
    resources: data?.data.resources ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
