/**
 * Master Administration data hooks.
 *
 * Reads reuse the shared `useFetchJson` infrastructure (cancellable, auth
 * headers attached) from the MDX module. Mutations go through `apiRequest`
 * (attaches Bearer + x-organization-id) and return a typed result so surfaces
 * can refresh on success.
 */

import { useCallback } from 'react';
import { useFetchJson } from '../../mdx/hooks/useFetchJson';
import { apiRequest } from '@/lib/queryClient';
import type {
  OverviewPayload,
  TenantRow,
  TenantDetailPayload,
  PlatformUser,
  ModuleEntitlement,
  SystemHealthPayload,
  AuditPayload,
  StatusValue,
} from '../types';

const BASE = '/api/admin/master';

export function useOverview() {
  return useFetchJson<OverviewPayload>(`${BASE}/overview`);
}

export function useTenants(params: { q?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return useFetchJson<{ tenants: TenantRow[] }>(`${BASE}/tenants${suffix}`);
}

export function useTenantDetail(id: number | null) {
  return useFetchJson<TenantDetailPayload>(id != null ? `${BASE}/tenants/${id}` : null);
}

export function useUsers(params: { q?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return useFetchJson<{ users: PlatformUser[] }>(`${BASE}/users${suffix}`);
}

export function useEntitlements() {
  return useFetchJson<{ modules: ModuleEntitlement[] }>(`${BASE}/entitlements`);
}

export function useSystemHealth() {
  return useFetchJson<SystemHealthPayload>(`${BASE}/system-health`);
}

export function useAudit(params: { tenantId?: number; action?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.tenantId != null) qs.set('tenantId', String(params.tenantId));
  if (params.action) qs.set('action', params.action);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return useFetchJson<AuditPayload>(`${BASE}/audit${suffix}`);
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

/** Suspend / reactivate a tenant. Returns ok=false with a message on failure. */
export function useTenantStatusMutation() {
  return useCallback(
    async (id: number, status: StatusValue, reason: string): Promise<MutationResult> => {
      try {
        const res = await apiRequest('PATCH', `${BASE}/tenants/${id}/status`, { status, reason });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body.error || `HTTP ${res.status}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
      }
    },
    []
  );
}

/** Suspend / reactivate a platform user. */
export function useUserStatusMutation() {
  return useCallback(
    async (id: number, status: StatusValue, reason: string): Promise<MutationResult> => {
      try {
        const res = await apiRequest('PATCH', `${BASE}/users/${id}/status`, { status, reason });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body.error || `HTTP ${res.status}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
      }
    },
    []
  );
}
