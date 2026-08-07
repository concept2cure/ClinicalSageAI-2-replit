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
import { type DataState } from '../lib/dataState';
import { isRecord, shapeMismatch, toRowsState } from '../lib/payloadShape';
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

  /*
   * `data?.data.devices` — the `?.` covered the envelope and nothing inside it.
   * Any 200 whose body is not `{ data: { … } }` (an error body, a bare array, a
   * scalar, `{}`) left `data.data` undefined, and reading `.devices` off it threw
   * during render, so the surface reported itself broken instead of reporting a
   * response it couldn't read. A body that isn't the envelope is a failed load,
   * and every panel already renders that state through DataGate.
   */
  const panels = isRecord(data) && isRecord(data.data) ? data.data : null;
  const failed = error ?? (data != null && panels === null ? shapeMismatch(url) : null);

  /* Per panel: absent still means idle (a payload that omits one panel keeps the
     other four), but present-and-not-a-list is the shape failure that used to
     surface as a `.map` crash inside the table. */
  const state = <T,>(rows: unknown): DataState<T[]> =>
    toRowsState<T>(rows, loading, failed, { source: url });

  return {
    devices: state<DeviceRow>(panels?.devices),
    labels: state<LabelRow>(panels?.labels),
    symbols: state<SymbolRow>(panels?.symbols),
    issues: state<IssueRow>(panels?.issues),
    mri: state<MriRow>(panels?.mri),
    scope: data?.meta?.scope ?? 'organization',
    loading,
    error: failed,
    refresh,
  };
}
