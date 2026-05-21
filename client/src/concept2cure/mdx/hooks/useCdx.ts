/**
 * useCdx — live data adapter for the Companion diagnostic surface.
 *
 * Calls `GET /api/mdx/cdx/:programId`. Endpoint defaults to 'fixture'
 * mode (expectedLiveBy 2026-12-01).
 */

import { useFetchJson } from './useFetchJson';
import {
  CDX_CONCORDANCE,
  CDX_KPIS,
  CDX_TIMELINE,
  CDX_XREF,
} from '../data/cdx';

type TimelineRow = (typeof CDX_TIMELINE)[number];
type ConcordanceRow = (typeof CDX_CONCORDANCE)[number];
type XrefRow = (typeof CDX_XREF)[number];
type KpiRow = (typeof CDX_KPIS)[number];

interface CdxPayload {
  data: {
    timeline: TimelineRow[];
    concordance: ConcordanceRow[];
    xref: XrefRow[];
    kpis: KpiRow[];
  };
}

export interface UseCdxResult {
  timeline: TimelineRow[] | null;
  concordance: ConcordanceRow[] | null;
  xref: XrefRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCdx(programId: string | null): UseCdxResult {
  const url = programId ? `/api/mdx/cdx/${encodeURIComponent(programId)}` : null;
  const { data, loading, error, refresh } = useFetchJson<CdxPayload>(url);
  return {
    timeline: data?.data.timeline ?? null,
    concordance: data?.data.concordance ?? null,
    xref: data?.data.xref ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
