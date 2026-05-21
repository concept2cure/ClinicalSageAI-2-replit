/**
 * useLdt — live data adapter for the LDT compliance surface.
 *
 * Calls `GET /api/mdx/ldt` (cross-program). Endpoint defaults to
 * 'fixture' mode (expectedLiveBy 2026-10-15 — schema keeps evolving
 * with the FDA 2024 rule rollout through 2028).
 */

import { useFetchJson } from './useFetchJson';
import {
  LDT_INVENTORY,
  LDT_KPIS,
  LDT_MILESTONES,
  LDT_PHASES,
} from '../data/ldt';

type PhaseRow = (typeof LDT_PHASES)[number];
type InventoryRow = (typeof LDT_INVENTORY)[number];
type MilestoneRow = (typeof LDT_MILESTONES)[number];
type KpiRow = (typeof LDT_KPIS)[number];

interface LdtPayload {
  data: {
    phases: PhaseRow[];
    inventory: InventoryRow[];
    milestones: MilestoneRow[];
    kpis: KpiRow[];
  };
}

export interface UseLdtResult {
  phases: PhaseRow[] | null;
  inventory: InventoryRow[] | null;
  milestones: MilestoneRow[] | null;
  kpis: KpiRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLdt(): UseLdtResult {
  const { data, loading, error, refresh } = useFetchJson<LdtPayload>('/api/mdx/ldt');
  return {
    phases: data?.data.phases ?? null,
    inventory: data?.data.inventory ?? null,
    milestones: data?.data.milestones ?? null,
    kpis: data?.data.kpis ?? null,
    loading,
    error,
    refresh,
  };
}
