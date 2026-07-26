/**
 * useUdi — live adapter for the UDI surface.
 *
 * Calls `GET /api/mdx/udi/summary`, which assembles the five panels the
 * surface renders (devices, labels, symbols, issues, MRI) from the
 * udi_records and labeling_* tables.
 *
 * The hook previously called `GET /api/mdx/udi` — the flat record list —
 * and read `data.devices`, `data.labels` and so on off an array. All
 * five resolved to `undefined`, and the surface substituted design-kit
 * fixtures, so a tenant with no UDI records at all saw five fully
 * populated devices with published GUDID states.
 *
 * Every panel is returned as a `DataState`, so the surface has to say
 * which of loading / idle / error / empty / ready it is showing.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';
import type {
  UDI_DEVICES,
  UDI_ISSUES,
  UDI_LABELS,
  UDI_MRI,
  UDI_SYMBOLS,
} from '../data/udi';

export type DeviceRow = (typeof UDI_DEVICES)[number];
export type LabelRow = (typeof UDI_LABELS)[number];
export type SymbolRow = (typeof UDI_SYMBOLS)[number];
export type IssueRow = (typeof UDI_ISSUES)[number];
export type MriRow = (typeof UDI_MRI)[number];

interface UdiPayload {
  data: {
    devices: DeviceRow[];
    labels: LabelRow[];
    symbols: SymbolRow[];
    issues: IssueRow[];
    mri: MriRow[];
  };
  meta?: { scope?: 'program' | 'organization' };
}

export interface UseUdiResult {
  devices: DataState<DeviceRow[]>;
  labels: DataState<LabelRow[]>;
  symbols: DataState<SymbolRow[]>;
  issues: DataState<IssueRow[]>;
  mri: DataState<MriRow[]>;
  /** Whether the payload was narrowed to one program or spans the org. */
  scope: 'program' | 'organization';
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId Narrows every panel to one program. Pass null for the
 *                  organization-wide view — UDI is commonly managed
 *                  across the whole portfolio rather than per submission.
 */
export function useUdi(programId?: string | null): UseUdiResult {
  const url = programId
    ? `/api/mdx/udi/summary?program_id=${encodeURIComponent(programId)}`
    : '/api/mdx/udi/summary';
  const { data, loading, error, refresh } = useFetchJson<UdiPayload>(url);

  const state = <T,>(rows: T | undefined): DataState<T> =>
    toDataState(rows ?? null, loading, error);

  return {
    devices: state(data?.data.devices),
    labels: state(data?.data.labels),
    symbols: state(data?.data.symbols),
    issues: state(data?.data.issues),
    mri: state(data?.data.mri),
    scope: data?.meta?.scope ?? 'organization',
    loading,
    error,
    refresh,
  };
}
