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

import { useFetchJson, type ReadFailure } from './useFetchJson';
import { type DataState } from '../lib/dataState';
import { isRecord, shapeMismatch, toRowsState } from '../lib/payloadShape';
import type {
  UdiDeviceRow,
  UdiIssueRow,
  UdiLabelRow,
  UdiMriRow,
  UdiSymbolRow,
} from '../data/udi';

export type DeviceRow = UdiDeviceRow;
export type LabelRow = UdiLabelRow;
export type SymbolRow = UdiSymbolRow;
export type IssueRow = UdiIssueRow;
export type MriRow = UdiMriRow;

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
  /** What the failed read was (readFailureFor). Null for a body it could not
   *  read, which is a failed read with no status to classify. */
  failure: ReadFailure | null;
  refresh: () => void;
}

/**
 * @param programId The open project. Every panel is that project's. Null reads
 *                  nothing (idle).
 *
 * This read used to default to the organization-wide summary, and its one
 * caller never passed a project, so the project's UDI screen showed every
 * project's labels and UDI records under the project's title (D2, 2026-10-29;
 * the map's `device-udi` row, slice 20). There is no unscoped read left.
 */
export function useUdi(programId: string | null): UseUdiResult {
  const url = programId
    ? `/api/mdx/udi/summary?program_id=${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, failure, refresh } = useFetchJson<UdiPayload>(url);

  /*
   * `data?.data.devices` — the `?.` covered the envelope and nothing inside it.
   * Any 200 whose body is not `{ data: { … } }` (an error body, a bare array, a
   * scalar, `{}`) left `data.data` undefined, and reading `.devices` off it threw
   * during render, so the surface reported itself broken instead of reporting a
   * response it couldn't read. A body that isn't the envelope is a failed load,
   * and every panel already renders that state through DataGate.
   */
  const source = url ?? '/api/mdx/udi/summary';
  const panels = isRecord(data) && isRecord(data.data) ? data.data : null;
  const failed = error ?? (data != null && panels === null ? shapeMismatch(source) : null);

  /* Per panel: absent still means idle (a payload that omits one panel keeps the
     other four), but present-and-not-a-list is the shape failure that used to
     surface as a `.map` crash inside the table. */
  const state = <T,>(rows: unknown): DataState<T[]> =>
    toRowsState<T>(rows, loading, failed, { source, idleReason: url ? undefined : 'No project is open.' });

  return {
    devices: state<DeviceRow>(panels?.devices),
    labels: state<LabelRow>(panels?.labels),
    symbols: state<SymbolRow>(panels?.symbols),
    issues: state<IssueRow>(panels?.issues),
    mri: state<MriRow>(panels?.mri),
    scope: data?.meta?.scope ?? 'organization',
    loading,
    error: failed,
    failure: error ? failure : null,
    refresh,
  };
}
