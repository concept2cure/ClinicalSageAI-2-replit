/**
 * CMC specifications — the faithful, reversible mapping between the persisted
 * `quality_specifications` row (server/api/cmc/specificationRoutes.ts, table
 * columns: material_type / material_name / acceptance_criteria / test_methods /
 * regulatory_basis / justification / approval_status) and the UI's per-attribute
 * spec-row display contract (attr / material / method / release / shelf / ich /
 * st). The backend stores the acceptance criteria, method and regulatory basis
 * as jsonb; the UI renders a release limit, a shelf-life limit, an analytical
 * method and an ICH reference. This module is the single documented convention
 * that carries values across that shape gap, in BOTH directions, so a spec
 * created in the UI reads back identically. Pure and framework-free so the
 * mapping is unit-tested in isolation (cmcSpecMapping.test.ts).
 *
 * Convention:
 *   material_name       ↔ attr   (the quality attribute is the spec's subject)
 *   material_type       ↔ material ('Drug substance' | 'Drug product')
 *   test_methods.method ↔ method  (analytical method, e.g. SE-HPLC)
 *   acceptance_criteria.release / .shelf ↔ release / shelf (limits)
 *   regulatory_basis.ich ↔ ich    (e.g. ICH Q6B)
 *   justification       ↔ justification
 *   approval_status     ↔ st      (draft | review | approved | reject)
 */

/** The display row the specifications table renders. */
export interface CmcSpecRow {
  id: number;
  attr: string;
  material: string;
  method: string;
  release: string;
  shelf: string;
  ich: string;
  st: string;
  noMethod?: boolean;
  _new?: boolean;
}

/** A raw `quality_specifications` row as returned by GET (SELECT *). jsonb
 *  columns arrive parsed from `pg`, but a legacy row may hold a JSON string —
 *  parseJson tolerates both, and a bare string is treated as the leaf value. */
export interface QualitySpecApiRow {
  id: number | string;
  project_id?: string | null;
  material_type?: string | null;
  material_name?: string | null;
  acceptance_criteria?: unknown;
  test_methods?: unknown;
  regulatory_basis?: unknown;
  justification?: string | null;
  approval_status?: string | null;
}

/** Body for POST /api/cmc/specifications (createSpecSchema). */
export interface CmcSpecCreateBody {
  projectId?: string;
  materialType: string;
  materialName: string;
  acceptanceCriteria: { release: string; shelf: string };
  testMethods: { method: string };
  regulatoryBasis: { ich: string };
  justification?: string;
  approvalStatus: string;
}

/** Body for PUT /api/cmc/specifications/:id (updateSpecSchema — approval_status
 *  is intentionally omitted; approval is only via the governed /approve path). */
export type CmcSpecUpdateBody = Omit<CmcSpecCreateBody, 'projectId' | 'approvalStatus'>;

/** Tolerantly resolve a jsonb column to an object: pass objects through, parse
 *  JSON strings, and never throw on malformed input. */
function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* not JSON — fall through to empty */
    }
  }
  return {};
}

/** Read a string field from a parsed jsonb object, null-safe (never fabricates). */
function str(o: Record<string, unknown>, key: string): string {
  const val = o[key];
  return typeof val === 'string' ? val : val == null ? '' : String(val);
}

/** quality_specifications row → the display row. Absent columns map to '' — an
 *  empty limit or method is rendered honestly, never invented. */
export function specRowFromApi(row: QualitySpecApiRow): CmcSpecRow {
  const criteria = asObject(row.acceptance_criteria);
  const methods = asObject(row.test_methods);
  const basis = asObject(row.regulatory_basis);
  const method = str(methods, 'method');
  return {
    id: typeof row.id === 'number' ? row.id : Number(row.id),
    attr: row.material_name ?? '',
    material: row.material_type ?? '',
    method,
    release: str(criteria, 'release'),
    shelf: str(criteria, 'shelf'),
    ich: str(basis, 'ich'),
    st: row.approval_status ?? 'draft',
    noMethod: !method,
  };
}

/** Map a whole GET payload's rows to display rows, tolerant of a non-array. */
export function specRowsFromApi(rows: readonly QualitySpecApiRow[] | null | undefined): CmcSpecRow[] {
  return Array.isArray(rows) ? rows.map(specRowFromApi) : [];
}

/** C2CForm values → create body. `st` is constrained to draft/review here;
 *  'approved' can only be reached through the governed approve endpoint. */
export function specCreateBody(
  v: Record<string, string>,
  projectId?: string,
): CmcSpecCreateBody {
  const body: CmcSpecCreateBody = {
    materialType: v.material || 'Drug substance',
    materialName: v.attr || '',
    acceptanceCriteria: { release: v.release || '', shelf: v.shelf || '' },
    testMethods: { method: v.method || '' },
    regulatoryBasis: { ich: v.ich || '' },
    justification: v.justification || undefined,
    approvalStatus: v.st === 'review' ? 'review' : 'draft',
  };
  if (projectId) body.projectId = projectId;
  return body;
}

/** C2CForm values → update body (no projectId, no approvalStatus). */
export function specUpdateBody(v: Record<string, string>): CmcSpecUpdateBody {
  return {
    materialType: v.material || 'Drug substance',
    materialName: v.attr || '',
    acceptanceCriteria: { release: v.release || '', shelf: v.shelf || '' },
    testMethods: { method: v.method || '' },
    regulatoryBasis: { ich: v.ich || '' },
    justification: v.justification || undefined,
  };
}

/** A `project_id` is a UUID in the schema; only pass through a well-formed one
 *  so the list GET and create body never send a numeric/legacy id the backend
 *  would reject. Returns undefined for anything that isn't a UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function asProjectUuid(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  const t = id.trim();
  return UUID_RE.test(t) ? t : undefined;
}
