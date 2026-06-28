/**
 * useGatewayStatus — read the per-org configuration status of every submission
 * gateway (FDA ESG, EMA CESP / EUDAMED, PMDA, Health Canada CESG).
 *
 * Backs the Admin → "Submission gateways" section so an administrator can see,
 * at a glance, which agency endpoints are credentialed and which are still inert
 * pending environment configuration. Read-only; the backend
 * (GET /api/mdx/gateways) reports `configured` from each gateway's isConfigured()
 * check without ever exposing the credentials themselves.
 */

import { useFetchJson } from './useFetchJson';

export interface GatewayStatusRow {
  region: string;
  gateway: string;
  transport: string;
  configured: boolean;
  environment: string;
}

export interface UseGatewayStatusResult {
  rows: GatewayStatusRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGatewayStatus(
  environment: 'staging' | 'production' = 'production',
): UseGatewayStatusResult {
  // Canonical { data } envelope from server/lib/api-response.
  const url = `/api/mdx/gateways?environment=${encodeURIComponent(environment)}`;
  const { data, loading, error, refresh } = useFetchJson<{ data: GatewayStatusRow[] }>(url);
  return { rows: data?.data ?? null, loading, error, refresh };
}
