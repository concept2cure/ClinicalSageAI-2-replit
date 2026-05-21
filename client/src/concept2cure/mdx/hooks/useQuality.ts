/**
 * useQuality — live data adapter for the Quality system surface.
 *
 * Calls `GET /api/mdx/quality`. Endpoint defaults to 'both' mode in the
 * dataMode registry (expectedLiveBy 2026-09-15).
 */

import { useFetchJson } from './useFetchJson';
import {
  QMS_FINDINGS,
  QMS_KPIS,
  QMS_SUPPLIERS,
  QMS_TRAINING,
} from '../data/quality';

type FindingRow = (typeof QMS_FINDINGS)[number];
type TrainingRow = (typeof QMS_TRAINING)[number];
type SupplierRow = (typeof QMS_SUPPLIERS)[number];
type KpiRow = (typeof QMS_KPIS)[number];

interface QualityPayload {
  data: {
    findings: FindingRow[];
    training: TrainingRow[];
    suppliers: SupplierRow[];
    kpis: KpiRow[];
  };
}

export interface UseQualityResult {
  findings: FindingRow[] | null;
  training: TrainingRow[] | null;
  suppliers: SupplierRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useQuality(): UseQualityResult {
  const { data, loading, error, refresh } =
    useFetchJson<QualityPayload>('/api/mdx/quality');
  return {
    findings: data?.data.findings ?? null,
    training: data?.data.training ?? null,
    suppliers: data?.data.suppliers ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
