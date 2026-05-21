/**
 * useIvdr — live data adapter for the EU IVDR surface.
 *
 * Calls `GET /api/mdx/ivdr/:programId`. Endpoint defaults to 'fixture'
 * mode (expectedLiveBy 2026-11-15).
 */

import { useFetchJson } from './useFetchJson';
import {
  IVDR_CLASSES,
  IVDR_KPIS,
  IVDR_NB_TIMELINE,
  IVDR_RULES,
} from '../data/ivdr';

type RuleRow = (typeof IVDR_RULES)[number];
type ClassRow = (typeof IVDR_CLASSES)[number];
type TimelineRow = (typeof IVDR_NB_TIMELINE)[number];
type KpiRow = (typeof IVDR_KPIS)[number];

interface IvdrPayload {
  data: {
    rules: RuleRow[];
    classes: ClassRow[];
    nbTimeline: TimelineRow[];
    kpis: KpiRow[];
  };
}

export interface UseIvdrResult {
  rules: RuleRow[] | null;
  classes: ClassRow[] | null;
  nbTimeline: TimelineRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIvdr(programId: string | null): UseIvdrResult {
  const url = programId ? `/api/mdx/ivdr/${encodeURIComponent(programId)}` : null;
  const { data, loading, error, refresh } = useFetchJson<IvdrPayload>(url);
  return {
    rules: data?.data.rules ?? null,
    classes: data?.data.classes ?? null,
    nbTimeline: data?.data.nbTimeline ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
