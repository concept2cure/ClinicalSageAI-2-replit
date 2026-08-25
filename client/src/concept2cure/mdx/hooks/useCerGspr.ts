/**
 * useCerGspr — the GSPR (Annex I) conformity data for the CER workbench,
 * consuming server/routes/gspr-postmarket.ts:
 *
 *   GET /api/gspr/catalog?regulation=MDR|IVDR          the clause catalog
 *   GET /api/gspr/programs/:id/mappings                per-program decisions
 *   GET /api/gspr/programs/:id/coverage?regulation=…   deterministic gap report
 *
 * The matrix row set is the CATALOG joined with the program's mappings —
 * a clause with no mapping renders as `unmapped`, which is real information
 * (the org has not decided applicability), never a fabricated status. The
 * coverage report is the server's own deterministic verdict; nothing is
 * recomputed or embellished client-side.
 */

import { useFetchJson } from './useFetchJson';

export type GsprRegulation = 'MDR' | 'IVDR';

export interface GsprCatalogRequirement {
  id: string;
  regulation: GsprRegulation;
  annex: string;
  chapter: string | null;
  clause: string;
  title: string;
}

export interface GsprMappingPair {
  mapping: {
    requirementId: string;
    applicability?: string | null;
    conformanceStatus?: string | null;
    primaryEvidenceId?: string | null;
    rationale?: string | null;
    notes?: string | null;
  };
  requirement: { id: string };
}

export type GsprRowStatus = 'applies' | 'not_applicable' | 'partial' | 'tbd' | 'unmapped';

export interface GsprMatrixRow {
  requirementId: string;
  chapter: string;
  clause: string;
  title: string;
  status: GsprRowStatus;
  conformance: string | null;
  hasEvidence: boolean;
  note: string | null;
}

export interface GsprFinding {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  requirementId: string;
  clause: string;
  title: string;
  message: string;
}

export interface GsprCoverageReport {
  programId: string;
  regulation: GsprRegulation;
  totalApplicable: number;
  mappedApplies: number;
  mappedNotApplicable: number;
  mappedPartial: number;
  mappedTbd: number;
  unmapped: number;
  conformantCount: number;
  nonConformantCount: number;
  needsEvidenceCount: number;
  findings: GsprFinding[];
  coveragePercent: number;
  passesGate: boolean;
}

const VALID_STATUSES: ReadonlySet<string> = new Set(['applies', 'not_applicable', 'partial', 'tbd']);

/**
 * Pure: join the catalog with the program's mapping decisions into matrix
 * rows. Every catalog clause appears exactly once; a clause without a mapping
 * (or with an unrecognized applicability value) is `unmapped` — undecided is
 * reported as undecided. Null inputs → null (source unresolved), so the
 * surface can distinguish "not loaded" from "no requirements".
 */
export function mergeGsprRows(
  catalog: GsprCatalogRequirement[] | null,
  mappings: GsprMappingPair[] | null,
): GsprMatrixRow[] | null {
  if (catalog === null) return null;
  const byRequirement = new Map<string, GsprMappingPair['mapping']>();
  for (const pair of mappings ?? []) {
    const id = pair?.mapping?.requirementId ?? pair?.requirement?.id;
    if (id) byRequirement.set(id, pair.mapping);
  }
  return catalog.map((req) => {
    const m = byRequirement.get(req.id);
    const rawStatus = (m?.applicability ?? '').trim();
    const status: GsprRowStatus = VALID_STATUSES.has(rawStatus)
      ? (rawStatus as GsprRowStatus)
      : 'unmapped';
    return {
      requirementId: req.id,
      chapter: req.chapter ?? '—',
      clause: req.clause,
      title: req.title,
      status,
      conformance: m?.conformanceStatus ?? null,
      hasEvidence: !!m?.primaryEvidenceId,
      note: m?.rationale ?? m?.notes ?? null,
    };
  });
}

/** Group matrix rows by chapter, preserving catalog order. */
export function groupGsprRowsByChapter(rows: GsprMatrixRow[]): Array<{ chapter: string; rows: GsprMatrixRow[] }> {
  const out: Array<{ chapter: string; rows: GsprMatrixRow[] }> = [];
  let current: { chapter: string; rows: GsprMatrixRow[] } | null = null;
  for (const row of rows) {
    if (!current || current.chapter !== row.chapter) {
      current = { chapter: row.chapter, rows: [] };
      out.push(current);
    }
    current.rows.push(row);
  }
  return out;
}

interface CatalogPayload {
  regulation: string;
  requirements: GsprCatalogRequirement[];
  count: number;
}

interface MappingsPayload {
  programId: string;
  mappings: GsprMappingPair[];
  count: number;
}

export interface UseCerGsprResult {
  /** Catalog ⋈ mappings; null until the catalog resolves. */
  rows: GsprMatrixRow[] | null;
  /** The server's deterministic coverage/gap report; null until resolved. */
  coverage: GsprCoverageReport | null;
  loading: boolean;
  /** First error across the three feeds (each degrades independently). */
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch catalog + program mappings + coverage in parallel. Pass a null
 * programId to load the catalog alone (mappings/coverage stay idle) — the
 * matrix then shows every clause as unmapped for an unselected program.
 */
export function useCerGspr(programId: string | null, regulation: GsprRegulation): UseCerGsprResult {
  const reg = encodeURIComponent(regulation);
  const catalog = useFetchJson<CatalogPayload>(`/api/gspr/catalog?regulation=${reg}`);
  const mappings = useFetchJson<MappingsPayload>(
    programId ? `/api/gspr/programs/${encodeURIComponent(programId)}/mappings` : null,
  );
  const coverage = useFetchJson<GsprCoverageReport>(
    programId
      ? `/api/gspr/programs/${encodeURIComponent(programId)}/coverage?regulation=${reg}`
      : null,
  );

  const rows = mergeGsprRows(
    catalog.data?.requirements ?? null,
    mappings.data?.mappings ?? null,
  );

  return {
    rows,
    coverage: coverage.data ?? null,
    loading: catalog.loading || mappings.loading || coverage.loading,
    error: catalog.error ?? mappings.error ?? coverage.error ?? null,
    refresh: () => {
      catalog.refresh();
      mappings.refresh();
      coverage.refresh();
    },
  };
}
