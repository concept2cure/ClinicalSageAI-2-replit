/**
 * The data room's "File into Vault" (VR-11, row D2).
 *
 * The capture lane dead-ended. A captured source reached 'filed' only when
 * someone re-uploaded identical bytes on the Vault page, and AnA's filing tool
 * is refused while ana.document_catalog is off. Here a person picks captured
 * sources and files them. Each one goes through the ONE upload-to-Vault
 * orchestration (fileUploadIntoVault, shared with AnA's tool) and so through
 * the governed ingest, in its own transaction. Nothing is confirmed by a
 * machine: without a folder the person named, the classifier proposes one and
 * the document lands suggested or unfiled.
 *
 * Every requested source gets its own answer, in the order asked:
 *   filed          — a new Vault document, with where it landed;
 *   already_filed  — its bytes are already in this program's Vault, as which version;
 *   refused        — with the reason, and nothing stored for it.
 * One refusal does not undo another item's filing, and `complete` is false
 * whenever any item was refused, so a partial batch never reads as done.
 *
 * "Filed" is the data room's own definition: the capture's checksum is in the
 * program's Vault (readFiledAs, the same join the data room's stage reads).
 */
import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { programInOrganization } from '../c2c/program-access';
import { readSourceUploads, sourceIdList, type SourceUpload } from '../clinical-regulatory-evidence/evidence-spine.service.js';
import { currentVersionLateral, supersededSql } from './vault-version-family.js';
import { capturedBinaryAvailableSql, capturedDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { fileUploadIntoVault } from './vault-file-upload-to-vault.js';

const logger = createScopedLogger('vault-data-room-filing');

/** At most this many sources per request: each is a full ingest (scan, extract, classify). */
export const DATA_ROOM_FILE_LIMIT = 25;

/** What a captured file's bytes are in the Vault: which document, as which version, and what replaced it. */
export interface FiledAs {
  documentId: string;
  version: string | null;
  supersededBy: string | null;
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * For each checksum already in the program's Vault, the earliest document
 * holding those bytes, its version and, when a later version replaced it, the
 * family's current version (VR-16). Every version of the program counts.
 */
export async function readFiledAs(
  q: Queryable,
  programId: string,
  organizationId: number,
  checksums: string[],
): Promise<Map<string, FiledAs>> {
  const out = new Map<string, FiledAs>();
  if (checksums.length === 0) return out;
  const { rows } = await q.query(
    `SELECT DISTINCT ON (d.content_hash) d.content_hash, d.id, d.version,
            ${supersededSql('d')} AS superseded, cv.current_version
       FROM vault.documents d
       ${currentVersionLateral('d')}
      WHERE d.program_id = $1 AND d.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM regulatory_programs rp
           WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL
        )
        AND d.content_hash = ANY($3::text[])
      ORDER BY d.content_hash, d.created_at`,
    [programId, organizationId, checksums],
  );
  for (const r of rows as Array<{ content_hash: string | null; id: string; version: string | null; superseded: boolean; current_version: string | null }>) {
    if (!r.content_hash) continue;
    out.set(String(r.content_hash).trim(), {
      documentId: String(r.id),
      version: r.version ?? null,
      supersededBy: r.superseded ? (r.current_version ?? null) : null,
    });
  }
  return out;
}

/** A data room's pipeline counts, over the whole project. */
export interface DataRoomStageCounts { captured: number; classified: number; filed: number; needsReview: number }

/**
 * The data room's stage counts over EVERY current source of the project, not a
 * page of them (Data Room catalog S2, 2026-10-08). The lane counted the 200 rows
 * it read, so a room of 250 reported 200 captured and called it a floor. Same
 * definitions as the lane's rows: a source is filed when its bytes are in this
 * program's Vault (readFiledAs's join), classified when filed or the classifier
 * proposed a folder, needs review when classified with no folder and not filed;
 * only data-eligible sources whose original file is available are counted.
 */
export async function countDataRoomStages(q: Queryable, programId: string, organizationId: number): Promise<DataRoomStageCounts> {
  const { rows } = await q.query(
    `SELECT count(*)::int AS captured,
            count(*) FILTER (WHERE filed)::int AS filed,
            count(*) FILTER (WHERE filed OR folder IS NOT NULL)::int AS classified,
            count(*) FILTER (WHERE NOT filed AND folder IS NULL AND has_dossier)::int AS needs_review
       FROM (
         SELECT jsonb_typeof(s.metadata->'dossier') = 'object' AS has_dossier,
                NULLIF(s.metadata->'dossier'->>'suggestedFolder', '') AS folder,
                EXISTS (
                  SELECT 1 FROM vault.documents d
                   WHERE d.program_id = $1 AND d.deleted_at IS NULL AND d.content_hash = trim(s.checksum)
                ) AS filed
           FROM cre_evidence_sources s
          WHERE s.organization_id = $2 AND s.client_program_id = $1
            AND s.source_type = 'client_document' AND s.deleted_at IS NULL AND s.is_current IS NOT FALSE
            AND ${capturedDataEligibleSql('s')} AND ${capturedBinaryAvailableSql('s')}
       ) x`,
    [programId, organizationId],
  );
  const r = rows[0] ?? {};
  return { captured: r.captured ?? 0, classified: r.classified ?? 0, filed: r.filed ?? 0, needsReview: r.needs_review ?? 0 };
}

export type DataRoomFileItem =
  | {
      sourceId: number;
      outcome: 'filed';
      documentId: string;
      version: string;
      placementStatus: string;
      folderLabel: string | null;
      needsReview: boolean;
    }
  | { sourceId: number; outcome: 'already_filed'; documentId: string; version: string | null; supersededBy: string | null }
  | {
      sourceId: number;
      outcome: 'refused';
      code: string;
      message: string;
      /** VERSION_CONTENT_CONFLICT: the current version this file can be added to as its next version (QA-2026-10-08). */
      headDocumentId?: string;
      headVersion?: string;
    };

export type DataRoomFileResult =
  | { ok: true; complete: boolean; items: DataRoomFileItem[] }
  | { ok: false; status: number; code: string; message: string };

export interface DataRoomFileInput {
  organizationId: number;
  userId: number | null;
  programId: string;
  sourceIds: unknown;
  /**
   * Sources the person chose to add as the next version of a named document,
   * as `{ "<sourceId>": "<documentId>" }` (QA-2026-10-08). Parsed by checkInTargets.
   */
  newVersionOf?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

const refused = (sourceId: number, code: string, message: string): DataRoomFileItem => ({
  sourceId, outcome: 'refused', code, message,
});

/** A refusal from the ingest, keeping the document a conflicting file can be added to, when there is one. */
const refusedBy = (sourceId: number, r: { code: string; message: string; headDocumentId?: string; headVersion?: string }): DataRoomFileItem => ({
  sourceId, outcome: 'refused', code: r.code, message: r.message,
  ...(r.headDocumentId ? { headDocumentId: r.headDocumentId, headVersion: r.headVersion } : {}),
});

/**
 * The document each named source is added to as its next version. A key that
 * names no requested source is ignored. Anything else that is not a document
 * id is null: the whole request is refused, so a check-in never falls back to
 * a new document the person did not choose. Nothing is read or filed for it.
 */
export function checkInTargets(raw: unknown, ids: number[]): Map<number, string> | null {
  const out = new Map<number, string>();
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key);
    if (!ids.includes(id)) continue;
    if (typeof value !== 'string' || value.length === 0) return null;
    out.set(id, value);
  }
  return out;
}

/** Why this source cannot be filed from this project, before any byte is read; null when it can. */
function sourceRefusal(input: DataRoomFileInput, id: number, src: SourceUpload | undefined): DataRoomFileItem | null {
  // Another organization's source, another project's, or no such source: one
  // answer, so an id never confirms that something exists elsewhere.
  if (!src || src.organizationId !== input.organizationId || src.clientProgramId !== input.programId
      || src.sourceType !== 'client_document') {
    return refused(id, 'NOT_FOUND', 'No captured file with this id is in this project’s data room.');
  }
  if (!src.isCurrent) {
    return refused(id, 'SOURCE_SUPERSEDED', 'A later capture replaced this file. File the current one.');
  }
  if (!src.fileUploadId) {
    return refused(id, 'NO_STORED_FILE', 'This source has no stored file to file into the Vault.');
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The title of the document a captured file is added to as a new version. The
 * file's own title is derived from its name, so a check-in keeps the document's
 * title instead (QA-2026-10-08). Null when that document is not in this program
 * and organization; the ingest then refuses the check-in, naming no document.
 */
async function headTitle(programId: string, organizationId: number, documentId: string): Promise<string | null> {
  if (!UUID_RE.test(documentId)) return null;
  const { rows } = await pool.query(
    `SELECT document_title FROM vault.documents
      WHERE id = $1::uuid AND program_id = $2::uuid AND organization_id = $3 AND deleted_at IS NULL`,
    [documentId, programId, organizationId],
  );
  return (rows[0]?.document_title as string | null | undefined) ?? null;
}

/** File one source that is not yet in the Vault. Never throws. */
async function fileOne(input: DataRoomFileInput, src: SourceUpload, supersedesDocumentId?: string): Promise<DataRoomFileItem> {
  try {
    const derivedTitle = (src.title ?? '').replace(/\.[^.]+$/, '').trim() || `Source ${src.id}`;
    const title = supersedesDocumentId
      ? (await headTitle(input.programId, input.organizationId, supersedesDocumentId)) ?? derivedTitle
      : derivedTitle;
    const result = await fileUploadIntoVault({
      organizationId: input.organizationId,
      userId: input.userId,
      programId: input.programId,
      fileId: src.fileUploadId as string,
      documentTitle: title,
      // The data room records no document type, and a file name is not grounds
      // for one; recorded as OTHER, as a Vault upload without a choice is.
      documentType: 'OTHER',
      capturedChecksum: src.checksum,
      dataRoomSourceId: src.id,
      supersedesDocumentId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    if (!result.ok) return refusedBy(src.id, result);
    if (result.reupload) {
      return { sourceId: src.id, outcome: 'already_filed', documentId: result.document.id, version: result.document.version, supersededBy: null };
    }
    return {
      sourceId: src.id,
      outcome: 'filed',
      documentId: result.document.id,
      version: result.document.version,
      placementStatus: result.filing.placementStatus,
      folderLabel: result.filing.folderLabel,
      needsReview: result.filing.needsReview,
    };
  } catch (err) {
    logger.error('data room filing failed for one source', {
      sourceId: src.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return refused(src.id, 'FILING_FAILED', 'This file could not be filed. Nothing was recorded for it.');
  }
}

/** Decide one source: refuse it, report it already filed, or file it. */
async function decideOne(
  input: DataRoomFileInput,
  id: number,
  src: SourceUpload | undefined,
  filedAs: Map<string, FiledAs>,
  supersedesDocumentId?: string,
): Promise<DataRoomFileItem> {
  const refusal = sourceRefusal(input, id, src);
  if (refusal || !src) return refusal as DataRoomFileItem;
  const already = src.checksum ? filedAs.get(src.checksum.trim()) : undefined;
  if (already) return { sourceId: id, outcome: 'already_filed', ...already };
  const item = await fileOne(input, src, supersedesDocumentId);
  // Two captures of the same bytes in one batch: the second is the first's document.
  if (item.outcome === 'filed' && src.checksum) {
    filedAs.set(src.checksum.trim(), { documentId: item.documentId, version: item.version, supersededBy: null });
  }
  return item;
}

/** File the chosen data-room sources into the program's Vault, one answer per source. */
export async function fileDataRoomSources(input: DataRoomFileInput): Promise<DataRoomFileResult> {
  const ids = Array.from(new Set(sourceIdList(input.sourceIds)));
  if (ids.length === 0 || ids.length > DATA_ROOM_FILE_LIMIT) {
    return {
      ok: false, status: 400, code: 'INVALID_SOURCES',
      message: `Choose between 1 and ${DATA_ROOM_FILE_LIMIT} captured files to file.`,
    };
  }
  // Refused before any source is read: a malformed target must not fall back to a new document.
  const targets = checkInTargets(input.newVersionOf, ids);
  if (!targets) {
    return {
      ok: false, status: 400, code: 'INVALID_VERSION_TARGET',
      message: 'A file can only be added as a new version of a document named by its id. Nothing was filed.',
    };
  }
  if (!(await programInOrganization(pool, input.programId, input.organizationId))) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Project not found.' };
  }

  const sources = new Map((await readSourceUploads(input.organizationId, ids)).map((s) => [s.id, s]));
  const checksums = Array.from(sources.values())
    .map((s) => s.checksum?.trim())
    .filter((h): h is string => Boolean(h));
  const filedAs = await readFiledAs(pool, input.programId, input.organizationId, checksums);

  // One at a time, each its own transaction inside the ingest: a refusal or a
  // failure on one source leaves every other source's outcome as it is.
  const items: DataRoomFileItem[] = [];
  for (const id of ids) items.push(await decideOne(input, id, sources.get(id), filedAs, targets.get(id)));
  return { ok: true, complete: items.every((i) => i.outcome !== 'refused'), items };
}
