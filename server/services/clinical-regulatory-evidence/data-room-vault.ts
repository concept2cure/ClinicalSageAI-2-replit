/**
 * The Vault's files in the data catalog (S2, 2026-11-11).
 *
 * The plan's data room is "the project's catalog of everything": items get in by upload, from AnA's
 * paperclip, from Vault, and from study-conduct capture (ONE_DESIGN_PLAN §1). The catalog read
 * (data-room-search.ts) listed captures only, so a project whose documents and study data were filed
 * straight into its Vault showed a catalog of Quality records and nothing else. This reads the Vault's
 * current documents of the catalog's projects beside the captures, under the same narrowings, organized
 * by the same facets and graded by the same engine (data-room-grade.ts) from the facts the Vault records.
 *
 * It is a read. No capture is written and no source identity changes: whether every Vault version
 * becomes a data-room source (LX-03 of LINEAGE_END_TO_END_PLAN_2026-09-25.md) stays the founder's decision.
 * A Vault document whose bytes are a current capture of the same project is left out here: the catalog
 * lists that capture, which already says it is filed in Vault.
 *
 * The projects are the caller's: catalogProgramIds (data-room-search.ts), the person's verified accessible
 * projects of the open project's sponsor. Never a project the request names.
 */
import { pool } from '../../db';
import { vaultBinaryAvailableSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from '../vault/vault-version-family.js';
import { gradeCapture, profiledTables, type DataRoomGradeFacts, type StoredGrade } from './data-room-grade.js';
import { profileDataset, profileFormat, type DatasetProfile } from './dataset-profile.js';
import { logger } from '../../utils/logger.js';
import type { CatalogFacet, CatalogFacets, DataRoomQuery } from './data-room-search.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** A current Vault document as the catalog lists it. */
export interface VaultCatalogDocument {
  documentId: string;
  projectId: string;
  projectName: string | null;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  version: string | null;
  createdAt: string | null;
  checksum: string | null;
  folder: string | null;
  folderLabel: string | null;
  ctdSection: string | null;
  evidenceKind: string | null;
  placementStatus: string | null;
  originalFileAvailable: boolean;
  textAvailable: boolean;
  /** What a dataset holds, from its profile: each table's name, CDISC standard and class, columns and rows. Null for a document that is not a profiled dataset. */
  dataset: { format: string | null; tableCount: number; tables: Array<{ name: string; standard: string | null; domain: string | null; columns: number; rows: number }> } | null;
  grade: StoredGrade;
}

export interface VaultCatalogPage {
  /** Every Vault document matching the narrowings, not only this page of them (the catalog's own limit and offset). */
  total: number;
  documents: VaultCatalogDocument[];
  facets: Pick<CatalogFacets, 'project' | 'kind' | 'ctd' | 'folder'>;
}

const EMPTY: VaultCatalogPage = { total: 0, documents: [], facets: { project: [], kind: [], ctd: [], folder: [] } };
const DATASET_FILE = /\.(xpt|sas7bdat)$/i;
/** A dataset this size or smaller is profiled when the catalog first lists it; a larger one says its structure was not read. */
const PROFILE_MAX_BYTES = 128 * 1024 * 1024;
/** Profiles made per catalog read: each reads a file's bytes, so a page of new datasets fills in over a few reads. */
const PROFILES_PER_READ = 2;
export const VAULT_CATALOG_LIMIT = 200;

/** The grade's facts for a Vault document, each one the Vault's own record. */
export function vaultGradeFacts(r: Record<string, any>): DataRoomGradeFacts {
  const tables = profiledTables({ datasetProfile: r.dataset_profile });
  return {
    checksum: r.content_hash ?? null,
    capturedBy: r.created_by == null ? null : Number(r.created_by),
    origin: 'vault_filing',
    originalFileAvailable: r.original_file_available !== false,
    isCurrent: true,
    dataEligible: true,
    // A withdrawn document is not listed (vaultDataEligibleSql); a kept one whose file was removed shows in originalFileAvailable.
    disposition: null,
    extractionStatus: typeof r.processing_status === 'string' ? r.processing_status.toLowerCase() : null,
    textAvailable: r.text_available === true,
    extractionPartial: false,
    filed: true,
    fixity: r.verdict ?? null,
    catalogState: r.catalog_state ?? null,
    // The profile the catalog made of these bytes (below), exactly as a capture carries one.
    datasetTables: tables,
    nativeLifecycle: null,
    ...(!tables?.length && DATASET_FILE.test(String(r.file_name ?? '')) ? { datasetUnprofiled: true as const } : {}),
  };
}

const orNull = <T>(v: T | null | undefined): T | null => v ?? null;
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);
const numberOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** What the document is called: its title, else its file, else its code. */
function titleOf(r: Record<string, any>): string {
  return String(r.document_title || r.title || r.file_name || r.document_code || 'Untitled Vault document');
}

/** The profile as the catalog row says it: the first few tables, never the column list. */
function datasetSummary(profile: unknown): VaultCatalogDocument['dataset'] {
  const p = profile && typeof profile === 'object' ? profile as Record<string, any> : null;
  const tables = list<Record<string, any>>(p?.tables);
  if (!p || tables.length === 0) return null;
  return {
    format: typeof p.format === 'string' ? p.format : null,
    tableCount: Number(p.tableCount ?? tables.length),
    tables: tables.slice(0, 5).map((t) => ({
      name: String(t.name ?? ''), standard: orNull(t.cdisc?.standard), domain: orNull(t.cdisc?.domain),
      columns: Number(t.columnCount ?? 0), rows: Number(t.rowCount ?? 0),
    })),
  };
}

function shape(r: Record<string, any>, nameFolder: FolderNamer, gradedAt: string): VaultCatalogDocument {
  const g = gradeCapture(vaultGradeFacts(r));
  const folder: string | null = orNull(r.folder_id);
  return {
    documentId: String(r.id),
    projectId: String(r.program_id),
    projectName: orNull(r.project_name),
    title: titleOf(r),
    fileName: orNull(r.file_name),
    mimeType: orNull(r.mime_type),
    fileSize: numberOrNull(r.file_size),
    version: orNull(r.version),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    checksum: orNull(r.content_hash),
    folder,
    folderLabel: folder && nameFolder(String(r.program_id), folder),
    ctdSection: orNull(r.ctd_section),
    evidenceKind: orNull(r.evidence_kind),
    placementStatus: orNull(r.placement_status),
    originalFileAvailable: r.original_file_available !== false,
    textAvailable: r.text_available === true,
    dataset: datasetSummary(r.dataset_profile),
    grade: { grade: g.grade, score: g.score, basis: g.basis, cap: g.cap, engine: g.engine, gradedAt },
  };
}

type FolderNamer = (programId: string | null, folder: string) => string;

/**
 * A folder key as the Vault names it: in the project's own Vault view (a drug project's "Module 5" is not a device
 * project's folder), or, for a facet across projects, in the first of the catalog's views that names it.
 */
async function folderNamer(orgId: number, programIds: string[]): Promise<FolderNamer> {
  const { folderLabel, resolveVaultView } = await import('../vault/vault-filing.service.js');
  const views = new Map<string, Awaited<ReturnType<typeof resolveVaultView>>>();
  for (const id of programIds) {
    try { views.set(id, await resolveVaultView(id, orgId)); } catch { /* an unresolved view leaves the key as its own name */ }
  }
  const named = (view: Awaited<ReturnType<typeof resolveVaultView>> | undefined, folder: string) => (view ? folderLabel(view, folder) : '');
  return (programId, folder) => {
    const own = programId ? named(views.get(programId.toLowerCase()), folder) : '';
    return own || [...views.values()].map((view) => named(view, folder)).find(Boolean) || folder;
  };
}

/** The facet rows as the catalog names them. */
function facetsOf(rows: Array<{ facet: string; value: string; label: string | null; n: number }>, nameFolder: FolderNamer): VaultCatalogPage['facets'] {
  const facets: VaultCatalogPage['facets'] = { project: [], kind: [], ctd: [], folder: [] };
  for (const r of rows) {
    const label = r.facet === 'folder' ? nameFolder(null, r.value) : r.label ?? r.value;
    (facets as Record<string, CatalogFacet[]>)[r.facet]?.push({ value: r.value, label, count: Number(r.n) });
  }
  return facets;
}

/**
 * The Vault's current documents of the catalog's projects under the catalog's narrowings. A narrowing a
 * Vault document cannot answer (a study, how far a capture was read) matches none of them, never all.
 */
export async function listVaultForCatalog(orgId: number, p: DataRoomQuery, q: Queryable = pool): Promise<VaultCatalogPage> {
  const programIds = Array.isArray(p.programIds) ? p.programIds.map((id) => id.toLowerCase()) : [];
  if (programIds.length === 0 || p.study || p.status) return EMPTY;
  // tenant-isolation-safe: d is bound to the organization and to the caller's verified projects; every join carries the organization.
  const { rows } = await q.query(
    `WITH m AS (
       SELECT d.id, d.program_id, rp.name AS project_name, d.document_title, d.title, d.file_name, d.document_code,
              d.mime_type, d.file_size, d.version, btrim(d.content_hash) AS content_hash, d.created_by, d.created_at,
              d.folder_id, d.ctd_section, d.evidence_kind, d.placement_status, d.processing_status::text AS processing_status,
              (d.extracted_text IS NOT NULL AND btrim(d.extracted_text) <> '') AS text_available,
              ${vaultBinaryAvailableSql('d')} AS original_file_available,
              c.catalog_state, c.dataset_profile, (c.document_id IS NOT NULL) AS cataloged,
              d.storage_version_id, d.storage_provider, d.s3_key
         FROM vault.documents d
         JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1 AND rp.deleted_at IS NULL
         LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
        WHERE d.organization_id = $1 AND d.deleted_at IS NULL
          AND ${vaultDataEligibleSql('d')} AND NOT ${supersededSql('d')}
          AND d.program_id::text = ANY($2::text[])
          AND ($3::text IS NULL OR d.program_id::text = $3)
          AND ($4::text IS NULL OR d.evidence_kind = $4)
          AND ($5::text IS NULL OR d.ctd_section = $5 OR d.ctd_section LIKE $5 || '.%')
          AND ($6::text IS NULL OR d.folder_id = $6)
          AND ($7::date IS NULL OR d.created_at >= $7::date)
          AND ($8::date IS NULL OR d.created_at < ($8::date + 1))
          AND ($9::text IS NULL OR vault.document_search_vector(COALESCE(d.document_title, d.title, d.file_name), NULL::text, left(d.extracted_text, 900000))
                 @@ websearch_to_tsquery('english', $9))
          AND NOT EXISTS (
            SELECT 1 FROM cre_evidence_sources s
             WHERE s.organization_id = d.organization_id AND s.client_program_id = d.program_id
               AND s.source_type = 'client_document' AND s.deleted_at IS NULL AND s.is_current IS NOT FALSE
               AND btrim(s.checksum) = btrim(d.content_hash))
     )
     SELECT (SELECT count(*)::int FROM m) AS total,
            (SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
               SELECT m.*, fx.verdict
                 FROM m
                 LEFT JOIN LATERAL (
                   SELECT a.new_values->>'verdict' AS verdict FROM audit_logs a
                    WHERE a.action = 'vault.document.fixity' AND a.record_id = m.id::text AND a.tenant_id = $1
                    ORDER BY a.occurred_at DESC LIMIT 1
                 ) fx ON TRUE
                ORDER BY m.created_at DESC, m.id
                LIMIT $10 OFFSET $11) x) AS documents,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('facet', f.facet, 'value', f.value, 'label', f.label, 'n', f.n)
                                       ORDER BY f.facet, f.n DESC, f.value), '[]'::jsonb)
               FROM (SELECT v.facet, v.value, max(v.label) AS label, count(*)::int AS n
                       FROM m
                      CROSS JOIN LATERAL (VALUES
                        ('project', m.program_id::text, m.project_name),
                        ('kind', m.evidence_kind, NULL),
                        ('ctd', m.ctd_section, NULL),
                        ('folder', m.folder_id, NULL)
                      ) AS v(facet, value, label)
                      WHERE v.value IS NOT NULL AND v.value <> ''
                      GROUP BY v.facet, v.value) f) AS facets`,
    [orgId, programIds, ...[p.project, p.kind, p.ctd, p.folder, p.from, p.to, p.q].map(orNull),
      Math.min(p.limit ?? VAULT_CATALOG_LIMIT, VAULT_CATALOG_LIMIT), p.offset ?? 0],
  );
  const row = rows[0] ?? {};
  await profileListedDatasets(orgId, list<Record<string, any>>(row.documents), q);
  return vaultPage(row, programIds, await folderNamer(orgId, programIds));
}


function vaultPage(row: Record<string, any>, programIds: string[], nameFolder: FolderNamer): VaultCatalogPage {
  const listed = list<Record<string, any>>(row.documents);
  if (listed.some((d) => !programIds.includes(String(d.program_id).toLowerCase()))) {
    throw new Error('The Vault catalog read returned a document outside its admitted projects.');
  }
  const gradedAt = new Date().toISOString();
  return { total: Number(row.total ?? 0), documents: listed.map((d) => shape(d, nameFolder, gradedAt)), facets: facetsOf(list(row.facets), nameFolder) };
}

/** A profile with no tables: the bytes were read and are not a dataset this profiler reads. Stored so they are read once. */
const NOT_A_DATASET = { format: null, tables: [], tableCount: 0, profiledBy: 'dataset-profile v1' as const };

/** Whether a listed document is a dataset file the catalog has not profiled yet, small enough to read now. */
function awaitsProfile(d: Record<string, any>): boolean {
  if (d.dataset_profile || d.cataloged !== true || !d.file_name) return false;
  if (Number(d.file_size ?? 0) > PROFILE_MAX_BYTES) return false;
  return profileFormat(String(d.file_name), String(d.mime_type ?? '')) !== null;
}

/**
 * The profile of one Vault document's bytes, read through the Vault's own verified read (the recorded SHA-256 is
 * checked before a byte is trusted); null when the bytes cannot be read now.
 */
async function profileOf(orgId: number, d: Record<string, any>): Promise<DatasetProfile | typeof NOT_A_DATASET | null> {
  const { readVerifiedVaultBytes } = await import('../../routes/c2c/project-vault.js');
  const read = await readVerifiedVaultBytes({ storageVersionId: d.storage_version_id, storageKey: d.s3_key,
    organizationId: orgId, storageProvider: d.storage_provider }, d.content_hash, String(d.id));
  if (!read.ok) return null;
  return await profileDataset(read.bytes, String(d.file_name), String(d.mime_type ?? '')) ?? NOT_A_DATASET;
}

/**
 * Profile the listed datasets that have no profile yet (a few per read), and store each on the Vault's catalog record
 * of that content, so it is made once. A dataset filed in the Vault is then graded for CDISC conformance exactly as a
 * captured one is. A failure leaves the document listed with "its structure has not been read here": never a guess.
 */
async function profileListedDatasets(orgId: number, listed: Array<Record<string, any>>, q: Queryable): Promise<void> {
  for (const d of listed.filter(awaitsProfile).slice(0, PROFILES_PER_READ)) {
    try {
      const profile = await profileOf(orgId, d);
      if (!profile) continue;
      // tenant-isolation-safe: the row is the listed document's own catalog record, bound to its content hash and the organization.
      await q.query(
        `UPDATE vault.document_catalog c SET dataset_profile = $1::jsonb, dataset_profiled_at = now()
          WHERE c.document_id = $2::uuid AND btrim(c.content_hash) = $3 AND c.dataset_profile IS NULL
            AND EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = c.document_id AND d.organization_id = $4)`,
        [JSON.stringify(profile), d.id, d.content_hash, orgId],
      );
      d.dataset_profile = profile;
    } catch (err) {
      logger.warn('[data-catalog] a Vault dataset could not be profiled', { documentId: String(d.id), err: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** The catalog's facets over captures and Vault documents together: one count per value. */
export function mergeCatalogFacets(captures: CatalogFacets, vault: VaultCatalogPage['facets']): CatalogFacets {
  const merged: CatalogFacets = { ...captures };
  for (const key of ['project', 'kind', 'ctd', 'folder'] as const) {
    const byValue = new Map(captures[key].map((f) => [f.value, { ...f }]));
    for (const f of vault[key]) {
      const have = byValue.get(f.value);
      if (have) have.count += f.count; else byValue.set(f.value, { ...f });
    }
    merged[key] = [...byValue.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return merged;
}

/**
 * A Vault document a project may use from the catalog, or why not: it must be a current, eligible document
 * of one of the caller's catalog projects. One answer for absent and inaccessible.
 */
export async function vaultDocumentForUse(orgId: number, programIds: string[], documentId: string, q: Queryable = pool):
Promise<{ ok: true; title: string } | { ok: false; status: 404 | 409; code: string; message: string }> {
  // tenant-isolation-safe: bound to the organization and the caller's verified projects.
  const { rows } = await q.query(
    `SELECT COALESCE(d.document_title, d.title, d.file_name, d.document_code) AS title, ${supersededSql('d')} AS superseded
       FROM vault.documents d
      WHERE d.id = $1::uuid AND d.organization_id = $2 AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}
        AND d.program_id::text = ANY($3::text[])`,
    [documentId, orgId, programIds.map((id) => id.toLowerCase())],
  );
  const doc = rows[0];
  if (!doc) return { ok: false, status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'No Vault document with this id is in your data catalog for this project.' };
  if (doc.superseded === true) return { ok: false, status: 409, code: 'DOCUMENT_SUPERSEDED', message: 'A later version replaced this document. Use the current one.' };
  return { ok: true, title: String(doc.title ?? 'Vault document') };
}
