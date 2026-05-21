/**
 * useUdi — live data adapter for the UDI surface.
 *
 * Calls `GET /api/mdx/udi` (cross-program — UDI is per-tenant, not
 * per-program). Endpoint not yet implemented; surface stays in
 * `defaultMode: 'fixture'` until 2026-09-15 per the dataMode registry.
 * Returns null arrays on 404/error so the surface falls back to fixture.
 */

import { useFetchJson } from './useFetchJson';
import {
  UDI_DEVICES,
  UDI_ISSUES,
  UDI_LABELS,
  UDI_MRI,
  UDI_SYMBOLS,
} from '../data/udi';

type DeviceRow = (typeof UDI_DEVICES)[number];
type LabelRow = (typeof UDI_LABELS)[number];
type SymbolRow = (typeof UDI_SYMBOLS)[number];
type IssueRow = (typeof UDI_ISSUES)[number];
type MriRow = (typeof UDI_MRI)[number];

interface UdiPayload {
  data: {
    devices: DeviceRow[];
    labels: LabelRow[];
    symbols: SymbolRow[];
    issues: IssueRow[];
    mri: MriRow[];
  };
}

export interface UseUdiResult {
  devices: DeviceRow[] | null;
  labels: LabelRow[] | null;
  symbols: SymbolRow[] | null;
  issues: IssueRow[] | null;
  mri: MriRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useUdi(): UseUdiResult {
  const { data, loading, error, refresh } = useFetchJson<UdiPayload>('/api/mdx/udi');
  return {
    devices: data?.data.devices ?? null,
    labels: data?.data.labels ?? null,
    symbols: data?.data.symbols ?? null,
    issues: data?.data.issues ?? null,
    mri: data?.data.mri ?? null,
    loading,
    error,
    refresh,
  };
}
