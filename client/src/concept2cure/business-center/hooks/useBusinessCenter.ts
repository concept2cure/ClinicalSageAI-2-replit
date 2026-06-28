/**
 * Business Center data hooks.
 *
 * Reads reuse the shared `useFetchJson` infrastructure (cancellable, auth
 * headers attached) from the MDX module. Mutations go through `apiRequest`
 * (attaches Bearer + x-organization-id) and return a typed {ok, error} result
 * so surfaces can refresh on success.
 */

import { useCallback } from 'react';
import { useFetchJson } from '../../mdx/hooks/useFetchJson';
import { apiRequest } from '@/lib/queryClient';
import type {
  ExecutiveSummaryPayload,
  CostAccountingPayload,
  CostRatesPayload,
  TierPricingPayload,
  MeteringCoveragePayload,
  AccessPayload,
} from '../types';

const BASE = '/api/admin/business';

export function useExecutiveSummary() {
  return useFetchJson<ExecutiveSummaryPayload>(`${BASE}/executive-summary`);
}

export function useCostAccounting() {
  return useFetchJson<CostAccountingPayload>(`${BASE}/cost-accounting`);
}

export function useCostRates() {
  return useFetchJson<CostRatesPayload>(`${BASE}/cost-rates`);
}

export function useTierPricing() {
  return useFetchJson<TierPricingPayload>(`${BASE}/tier-pricing`);
}

export function useMeteringCoverage(days?: number) {
  const suffix = days != null ? `?days=${days}` : '';
  return useFetchJson<MeteringCoveragePayload>(`${BASE}/metering-coverage${suffix}`);
}

export function useAccess() {
  return useFetchJson<AccessPayload>(`${BASE}/access`);
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

async function patch(url: string, body: unknown): Promise<MutationResult> {
  try {
    const res = await apiRequest('PATCH', url, body);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, error: b.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

/** Update the unit cost (in cents) for a metered feature. Reason required. */
export function useCostRateMutation() {
  return useCallback(
    (costKey: string, unitCostCents: number, reason: string): Promise<MutationResult> =>
      patch(`${BASE}/cost-rates/${encodeURIComponent(costKey)}`, { unitCostCents, reason }),
    []
  );
}

/** Update the monthly / per-seat price (in cents) for a tier. Reason required. */
export function useTierPricingMutation() {
  return useCallback(
    (
      tier: string,
      monthlyPriceCents: number,
      perSeatCents: number,
      reason: string
    ): Promise<MutationResult> =>
      patch(`${BASE}/tier-pricing/${encodeURIComponent(tier)}`, {
        monthlyPriceCents,
        perSeatCents,
        reason,
      }),
    []
  );
}
