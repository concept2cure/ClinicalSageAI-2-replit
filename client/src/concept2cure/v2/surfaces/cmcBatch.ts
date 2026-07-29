/**
 * CMC batch records — the faithful, reversible mapping between the persisted
 * `cmc_batch_records` row (server/api/cmc/batchRecordRoutes.ts) and the UI's
 * batch-disposition display row. As with specifications, the backend stores
 * yield and deviations as jsonb while the UI renders a numeric yield percent
 * and an open-deviation count; this module is the single documented convention
 * that crosses that gap in both directions. Pure and framework-free so it is
 * unit-tested in isolation (cmcBatchMapping.test.ts).
 *
 * Convention:
 *   batch_number  ↔ id      (the human batch number is the display id)
 *   id (db)       → dbId    (the numeric primary key; needed to address
 *                            PUT /:id and the governed POST /:id/release)
 *   product_name  ↔ stage   ('Drug substance' | 'Drug product')
 *   yield_data.percent ↔ yield  (numeric %)
 *   deviations (array | {open}) ↔ dev  (open-deviation count)
 *   status        ↔ st      (released/approved → 'released'; rejected →
 *                            'rejected'; anything else → 'pending')
 */

/** The display row the batch-disposition table renders. */
export interface CmcBatch {
  id: string;
  stage: string;
  yield: number;
  dev: number;
  st: string;
  /** Numeric primary key — the address for PUT/release. Absent on optimistic-only rows. */
  dbId?: number;
  _new?: boolean;
}

/** A raw `cmc_batch_records` row as returned by GET (SELECT *). */
export interface BatchApiRow {
  id: number | string;
  project_id?: string | null;
  batch_number?: string | null;
  product_name?: string | null;
  status?: string | null;
  yield_data?: unknown;
  deviations?: unknown;
}

/** Body for POST /api/cmc/batch-records (createBatchSchema). */
export interface BatchCreateBody {
  projectId?: string;
  batchNumber: string;
  productName: string;
  status: string;
  yieldData: { percent: number };
  deviations: { open: number };
}

/** Body for POST /api/cmc/batch-records/:id/release (releaseSchema). */
export interface BatchReleaseBody {
  releaseTesting: Record<string, unknown>;
  releasedBy: string;
  decision: 'approved' | 'rejected' | 'conditional';
  reason: string;
  reauth: { password?: string; totp?: string };
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
  }
  return {};
}

/** Coerce an unknown jsonb leaf to a finite number, else 0 (never NaN). */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Read the yield percent from the yield_data jsonb, tolerant of key variants. */
function yieldPercent(yieldData: unknown): number {
  const o = asObject(yieldData);
  return num(o.percent ?? o.yield ?? o.yieldPercent);
}

/** Read the open-deviation count: an array's length, or an object's open/count. */
function deviationCount(deviations: unknown): number {
  if (Array.isArray(deviations)) return deviations.length;
  const o = asObject(deviations);
  return num(o.open ?? o.count ?? o.openCount);
}

/** Normalize a persisted status to the display disposition. The server can set
 *  released / rejected / conditional-release / pending-review; order matters so
 *  'conditional-release' is read as conditional, not released. */
export function batchDisposition(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (/rejected/.test(s)) return 'rejected';
  if (/conditional/.test(s)) return 'conditional';
  if (/released|approved/.test(s)) return 'released';
  return 'pending';
}

/** cmc_batch_records row → display row (null-safe, nothing fabricated). */
export function batchRowFromApi(row: BatchApiRow): CmcBatch {
  return {
    dbId: typeof row.id === 'number' ? row.id : Number(row.id),
    id: row.batch_number ?? String(row.id),
    stage: row.product_name ?? '',
    yield: yieldPercent(row.yield_data),
    dev: deviationCount(row.deviations),
    st: batchDisposition(row.status),
  };
}

export function batchRowsFromApi(rows: readonly BatchApiRow[] | null | undefined): CmcBatch[] {
  return Array.isArray(rows) ? rows.map(batchRowFromApi) : [];
}

/** C2CForm values → create body. `productName` is required by the backend; the
 *  form's stage is the only descriptor, so it is carried there faithfully. */
export function batchCreateBody(v: Record<string, string>, projectId?: string): BatchCreateBody {
  const body: BatchCreateBody = {
    batchNumber: v.id || '',
    productName: v.stage || 'Drug substance',
    status: 'in-progress',
    yieldData: { percent: num(v.yield) },
    deviations: { open: num(v.dev) },
  };
  if (projectId) body.projectId = projectId;
  return body;
}

/** Release-form values → governed release body. Decision defaults to approved;
 *  releaseTesting is sent as an empty object when the UI carries no test grid
 *  (the server treats an empty grid as no failing tests). */
export function batchReleaseBody(
  v: Record<string, string>,
  releasedBy: string,
): BatchReleaseBody {
  const decision =
    v.decision === 'rejected' || v.decision === 'conditional' ? v.decision : 'approved';
  return {
    releaseTesting: {},
    releasedBy: releasedBy || 'unknown',
    decision,
    reason: v.reason || '',
    reauth: { password: v.password || undefined, totp: v.totp || undefined },
  };
}
