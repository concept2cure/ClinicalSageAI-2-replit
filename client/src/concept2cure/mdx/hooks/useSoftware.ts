/**
 * useSoftware — live adapter for the IEC 62304 software-lifecycle surface.
 *
 * `/api/mdx/software` (lifecycle items) and `/api/mdx/software-summary/
 * :programId` (a required-deliverable completeness matrix) were built for
 * "Surface 6 of the beta" and had no client consumer — one of the three
 * differentiators the platform review names (CDx, CLIA, IEC 62304
 * software), built, tenant-scoped and invisible
 * (docs/MDX_SURFACE_COVERAGE_FINDING.md).
 *
 * Both are project-scoped on `program_id` (the canonical
 * regulatory_programs key). Every panel is a DataState: no project → idle;
 * a project with no software items → its honest empty / zeros, never a
 * fabricated completeness score. A completeness figure is exactly the kind
 * of claim a submission decision rests on, so it must not be simulated.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';
import { isRecord, shapeMismatch } from '../lib/payloadShape';

/** The IEC 62304 / FDA-2023-guidance deliverable kinds. */
export type ItemKind =
  | 'srs' | 'sds' | 'arch' | 'unit_test' | 'integration_test' | 'system_test'
  | 'release_note' | 'anomaly_log' | 'ots_list' | 'sbom' | 'pentest'
  | 'threat_model' | 'risk_control' | 'use_error' | 'cybersecurity_label';

export const KIND_LABEL: Record<string, string> = {
  srs: 'Software requirements (SRS)',
  sds: 'Software design (SDS)',
  arch: 'Architecture',
  unit_test: 'Unit test',
  integration_test: 'Integration test',
  system_test: 'System test',
  release_note: 'Release note',
  anomaly_log: 'Anomaly log',
  ots_list: 'OTS / SOUP list',
  sbom: 'SBOM',
  pentest: 'Penetration test',
  threat_model: 'Threat model',
  risk_control: 'Risk control',
  use_error: 'Use-error analysis',
  cybersecurity_label: 'Cybersecurity label',
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

/* ─── List items ─────────────────────────────────────────────────── */

interface RawItem {
  id: number;
  item_kind: string;
  title: string;
  identifier: string | null;
  doc_level: string | null;
  safety_class: string | null;
  status: string;
  updated_at: string | null;
  [k: string]: unknown;
}

export interface SoftwareItem {
  id: number;
  itemKind: string;
  title: string;
  identifier: string | null;
  docLevel: string | null;
  safetyClass: string | null;
  status: string;
  updatedAt: string | null;
}

export function adaptItem(r: RawItem): SoftwareItem {
  return {
    id: Number(r.id),
    itemKind: String(r.item_kind ?? ''),
    title: String(r.title ?? ''),
    identifier: r.identifier ?? null,
    docLevel: r.doc_level ?? null,
    safetyClass: r.safety_class ?? null,
    status: String(r.status ?? 'draft'),
    updatedAt: r.updated_at ?? null,
  };
}

/* ─── Completeness summary ───────────────────────────────────────── */

export interface DeliverableRow {
  kind: string;
  required: boolean;
  present: boolean;
  approved: boolean;
}

export interface SoftwareSummary {
  docLevel: 'basic' | 'enhanced';
  completion: number;
  required: number;
  approved: number;
  matrix: DeliverableRow[];
}

interface ListPayload {
  data: RawItem[];
  meta?: { count?: number };
}
interface SummaryPayload {
  data: SoftwareSummary;
}

export interface UseSoftwareResult {
  items: DataState<SoftwareItem[]>;
  summary: DataState<SoftwareSummary>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId The project's regulatory_programs.id (UUID), or null
 *                  for no project in context — the summary is per-project,
 *                  so without one there is nothing to score.
 */
export function useSoftware(programId: string | null): UseSoftwareResult {
  const listUrl = programId
    ? `/api/mdx/software?program_id=${encodeURIComponent(programId)}`
    : '/api/mdx/software';
  const summaryUrl = programId
    ? `/api/mdx/software-summary/${encodeURIComponent(programId)}`
    : null;

  const list = useFetchJson<ListPayload>(listUrl);
  const sum = useFetchJson<SummaryPayload>(summaryUrl);

  /*
   * `list.data?.data ? list.data.data.map(...)` — the truthiness test proved a
   * `data` field existed, not that it held rows. `{ data: {} }` and any 200 whose
   * envelope carries a scalar passed it and threw at `.map` during render, so a
   * response we couldn't read reported itself as a broken surface. A non-list
   * payload is a failed load, which `items` already renders through DataGate.
   */
  const rows = Array.isArray(list.data?.data) ? list.data.data : null;
  const listFailed =
    list.error ?? (list.data != null && rows === null ? shapeMismatch(listUrl) : null);
  const items = rows ? rows.map(adaptItem) : null;
  /* Same on the summary side: the completeness score is an object, and a list or
     a scalar arriving there would be handed to the panel as though it were one. */
  const summary = isRecord(sum.data?.data) ? (sum.data.data as SoftwareSummary) : null;
  const sumFailed =
    sum.error ??
    (sum.data != null && sum.data.data != null && summary === null
      ? shapeMismatch(summaryUrl ?? '')
      : null);

  return {
    items: toDataState(items, list.loading, listFailed),
    summary: toDataState(summary, sum.loading, sumFailed, {
      idleReason: 'Select a project to see its IEC 62304 deliverable completeness.',
    }),
    loading: list.loading || sum.loading,
    error: listFailed ?? sumFailed,
    refresh: () => {
      list.refresh();
      sum.refresh();
    },
  };
}
