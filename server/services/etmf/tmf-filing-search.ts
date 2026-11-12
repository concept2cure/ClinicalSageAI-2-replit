/**
 * The trial master file part of AnA's document search (search_all_documents): the live filings of the studies of the
 * projects a caller was already admitted to, found by one statement. Split out of tmf-artifact-persistence.ts
 * (2026-11-12, eTMF convergence E4 step 2, docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md §4.3), in its folder:
 * it reads the same deployed store and names a document by the same rule as `listTmfArtifacts`.
 *
 * @module server/services/etmf/tmf-filing-search
 */
import { pool } from '../../db';
import { getTmfReferenceModel } from './tmf-completeness';

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asTextOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const asIntOrNull = (value: unknown): number | null => (value == null ? null : Number(value));
const asDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const trimmedOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** code → the artifact's catalog name and its zone's name, from the reference model. */
const ARTIFACT_CATALOG: ReadonlyMap<string, { name: string; zoneName: string }> = (() => {
  const m = new Map<string, { name: string; zoneName: string }>();
  for (const zone of getTmfReferenceModel()) {
    for (const a of zone.artifacts) m.set(a.code, { name: a.name, zoneName: zone.name });
  }
  return m;
})();

/** A live filing found by a search across the studies of the projects a caller was admitted to. */
export interface TmfFilingSearchHit {
  /** The filing's id (tmf_artifact_filings.id). */
  id: string;
  /** The study it is filed for: the study's own id string, the trial a route names. */
  studyId: string;
  studyTitle: string;
  /** The study's project (regulatory_programs.id). */
  programId: string;
  artifactCode: string;
  /** The artifact's catalog name; a code the catalog does not hold is shown as itself, never renamed. */
  artifactName: string;
  zoneNumber: number | null;
  /** The zone's catalog name; null for a code the catalog does not hold. */
  zoneName: string | null;
  /** The document it is filed against when that is a live document of the study's project; null otherwise. */
  document: { id: string; title: string | null } | null;
  filedAt: Date;
}

export interface TmfFilingSearchInput {
  organizationId: number;
  /**
   * The projects (regulatory_programs.id) the caller has ALREADY been admitted
   * to by the current project policy (getCurrentAccessibleProgramScope, the
   * list form of the rule requireCurrentProgramAccess applies to one study).
   * This read admits nobody: it is held to these ids in SQL, and to live
   * projects of the organization. An empty list reads nothing.
   */
  admittedProgramIds: readonly string[];
  /** Matched without regard to case as part of an artifact's catalog name or code, or of the filed document's title. */
  query: string;
  limit: number;
}

/** The catalog codes whose name or code holds the text (lower case). A code is also read with its underscores as spaces. */
function artifactCodesHolding(needle: string): string[] {
  const codes: string[] = [];
  for (const [code, { name }] of ARTIFACT_CATALOG) {
    const lower = code.toLowerCase();
    if (lower.includes(needle) || lower.replace(/_/g, ' ').includes(needle) || name.toLowerCase().includes(needle)) codes.push(code);
  }
  return codes;
}

function searchHitFromRow(row: Record<string, unknown>): TmfFilingSearchHit {
  const artifactCode = String(row.artifact_code);
  const catalog = ARTIFACT_CATALOG.get(artifactCode);
  const documentId = asTextOrNull(row.document_id);
  return {
    id: String(row.id),
    studyId: text(row.study_id),
    studyTitle: text(row.protocol_title),
    programId: text(row.program_id),
    artifactCode,
    artifactName: catalog?.name ?? artifactCode,
    zoneNumber: asIntOrNull(row.zone_number),
    zoneName: catalog?.zoneName ?? null,
    document: documentId === null
      ? null
      : { id: documentId, title: trimmedOrNull(row.document_title) ?? trimmedOrNull(row.file_name) },
    filedAt: asDate(row.filed_at),
  };
}

/**
 * Search the live filings of the studies of the projects a caller was admitted
 * to (eTMF convergence slice E4, step 2: the trial master file part of AnA's
 * document search). One statement. A filing is a hit when the text is part of
 * its artifact's catalog name or code, or of the title of the document it is
 * filed against (the title the list gives: document_title, or file_name when
 * the title is blank).
 *
 * Never a removed filing, a declaration that a record does not apply (it names
 * no document, P-124 item 5), a filing with no study, a study with no project
 * or a deleted project's. The document is named only when it is a live document
 * of the study's own project, as `listTmfArtifacts` names it. A failed read
 * throws: it says nothing about what is filed.
 */
export async function searchTmfFilings(input: TmfFilingSearchInput): Promise<TmfFilingSearchHit[]> {
  const needle = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
  const programIds = [...new Set(input.admittedProgramIds.map((id) => String(id).trim().toLowerCase()).filter(Boolean))];
  if (!needle || programIds.length === 0) return [];
  const limit = Number.isFinite(input.limit) ? Math.min(50, Math.max(1, Math.round(input.limit))) : 15;
  const titlePattern = `%${needle.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  // The document a filing references is the id after 'vault://' (8 characters), as vaultIdOf reads it.
  // tenant-isolation-safe: f is bound to the organization; the study, the project and the document are held to f's.
  const { rows } = await pool.query(
    `SELECT f.id::text AS id, f.artifact_code, f.zone_number, f.filed_at,
            s.study_id, s.protocol_title, s.program_id::text AS program_id,
            d.id::text AS document_id, d.document_title, d.file_name
       FROM tmf_artifact_filings f
       JOIN cdisc_prm_studies s
         ON s.id = f.study_ref AND s.tenant_id = f.organization_id
       JOIN regulatory_programs rp
         ON rp.id = s.program_id AND rp.organization_id = f.organization_id AND rp.deleted_at IS NULL
       LEFT JOIN vault.documents d
         ON f.document_ref LIKE 'vault://%'
        AND d.id::text = btrim(substr(f.document_ref, 9))
        AND d.organization_id = f.organization_id
        AND d.program_id = s.program_id
        AND d.deleted_at IS NULL
      WHERE f.organization_id = $1
        AND f.removed_at IS NULL
        AND f.not_applicable_reason IS NULL
        AND s.program_id::text = ANY($2::text[])
        AND (f.artifact_code = ANY($3::text[])
             OR COALESCE(NULLIF(btrim(d.document_title), ''), NULLIF(btrim(d.file_name), '')) ILIKE $4)
      ORDER BY f.updated_at DESC, f.id
      LIMIT $5`,
    [input.organizationId, programIds, artifactCodesHolding(needle), titlePattern, limit],
  );
  return (rows as Array<Record<string, unknown>>).map(searchHitFromRow);
}
