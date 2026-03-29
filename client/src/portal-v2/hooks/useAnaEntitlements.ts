import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createCorrelationId } from '@/lib/correlation';

interface EntitlementsResponse {
  success: boolean;
  result?: {
    enabledModuleIds?: string[];
    disabledModuleIds?: string[];
    generatedAt?: string;
  };
}

export function isModuleEnabledByEntitlements(
  moduleId: string,
  hasEntitlementPayload: boolean,
  enabledModuleIds: string[]
): boolean {
  if (!hasEntitlementPayload) return true; // fail-open before entitlement payload is available
  return enabledModuleIds.includes(moduleId); // fail-closed once payload exists
}

export function useAnaEntitlements() {
  const query = useQuery({
    queryKey: ['ana-platform-entitlements'],
    queryFn: async () => {
      const res = await fetch('/api/ana/platform/entitlements', {
        credentials: 'include',
        headers: {
          'x-correlation-id': createCorrelationId('ana_entitlements'),
          'x-source-surface': 'portal_navigation',
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch entitlements (${res.status})`);
      }
      return (await res.json()) as EntitlementsResponse;
    },
    retry: 1,
    staleTime: 60_000,
  });

  const enabledModuleIds = useMemo(
    () => query.data?.result?.enabledModuleIds || [],
    [query.data?.result?.enabledModuleIds]
  );

  const disabledModuleIds = useMemo(
    () => query.data?.result?.disabledModuleIds || [],
    [query.data?.result?.disabledModuleIds]
  );

  const hasEntitlementPayload = useMemo(() => {
    if (!query.data || query.data.success !== true) return false;
    return Boolean(query.data.result);
  }, [query.data]);

  return {
    ...query,
    enabledModuleIds,
    disabledModuleIds,
    hasEntitlementPayload,
  };
}
