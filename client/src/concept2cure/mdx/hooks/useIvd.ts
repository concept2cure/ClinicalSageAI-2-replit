/**
 * useIvd — live data adapter for the IVD pathway surface.
 *
 * Calls `GET /api/mdx/ivd/:programId`. Endpoint defaults to 'fixture'
 * mode (expectedLiveBy 2026-11-01).
 */

import { useFetchJson } from './useFetchJson';
import {
  IVD_ANALYTICAL,
  IVD_CLINICAL,
  IVD_KPIS,
  IVD_REFMATS,
} from '../data/ivd';

type AnalyticalRow = (typeof IVD_ANALYTICAL)[number];
type ClinicalRow = (typeof IVD_CLINICAL)[number];
type RefmatRow = (typeof IVD_REFMATS)[number];
type KpiRow = (typeof IVD_KPIS)[number];

interface IvdPayload {
  data: {
    analytical: AnalyticalRow[];
    clinical: ClinicalRow[];
    refmats: RefmatRow[];
    kpis: KpiRow[];
  };
}

export interface UseIvdResult {
  analytical: AnalyticalRow[] | null;
  clinical: ClinicalRow[] | null;
  refmats: RefmatRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIvd(programId: string | null): UseIvdResult {
  const url = programId ? `/api/mdx/ivd/${encodeURIComponent(programId)}` : null;
  const { data, loading, error, refresh } = useFetchJson<IvdPayload>(url);
  return {
    analytical: data?.data.analytical ?? null,
    clinical: data?.data.clinical ?? null,
    refmats: data?.data.refmats ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
