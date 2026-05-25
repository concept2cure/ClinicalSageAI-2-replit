/**
 * useQuality — installs the Quality system surface against the live QMS
 * endpoints (server/routes/mdx-qms.ts). The kit's single payload maps to
 * three real routes:
 *   - findings   ← GET /api/mdx/qms/nonconforming (qms_nonconforming_products)
 *   - suppliers  ← GET /api/mdx/qms/suppliers      (qms_suppliers)
 *   - training   ← needs a per-SOP rollup the raw /qms/training endpoint
 *                  doesn't provide (it returns per-user acks). Null until a
 *                  rollup endpoint exists.
 *   - kpis       ← derived dashboard metrics, no backend yet → null.
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

interface ServerEnvelope<T> { data: T[]; }

interface NcRow {
  id: string; nc_number: string | null; source: string | null;
  description: string | null; disposition: string | null;
  detected_by: string | null; capa_linked: string | null;
  metadata: Record<string, unknown> | null;
}
interface SupplierServerRow {
  id: string; supplier_name: string | null; criticality: string | null;
  approval_status: string | null; last_audit_date: string | null;
  metadata: Record<string, unknown> | null;
}

function adaptFindings(rows: NcRow[]): FindingRow[] {
  return rows.map((r) => ({
    id: r.nc_number ?? r.id,
    severity: String((r.metadata ?? {}).severity ?? 'med'),
    source: r.source ?? 'internal',
    clause: r.description ?? '',
    state: r.disposition ?? 'investigating',
    age: '',
    owner: r.detected_by ?? '',
    linked: r.capa_linked ?? '—',
  })) as FindingRow[];
}

function adaptSuppliers(rows: SupplierServerRow[]): SupplierRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.supplier_name ?? '',
    risk: r.criticality ?? 'med',
    state: r.approval_status ?? '',
    last: r.last_audit_date ?? '',
    findings: Number((r.metadata ?? {}).findings ?? 0),
  })) as SupplierRow[];
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
  const nc = useFetchJson<ServerEnvelope<NcRow>>('/api/mdx/qms/nonconforming');
  const sup = useFetchJson<ServerEnvelope<SupplierServerRow>>('/api/mdx/qms/suppliers');
  const refresh = () => { nc.refresh(); sup.refresh(); };
  return {
    findings: nc.data ? adaptFindings(nc.data.data ?? []) : null,
    suppliers: sup.data ? adaptSuppliers(sup.data.data ?? []) : null,
    training: null,
    kpis: null,
    loading: nc.loading || sup.loading,
    error: nc.error ?? sup.error,
    refresh,
  };
}
