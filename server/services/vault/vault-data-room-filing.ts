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
  | { sourceId: number; outcome: 'refused'; code: string; message: string };

export type DataRoomFileResult =
  | { ok: true; complete: boolean; items: DataRoomFileItem[] }
  | { ok: false; status: number; code: string; message: string };

export interface DataRoomFileInput {
  organizationId: number;
  userId: number | null;
  programId: string;
  sourceIds: unknown;
  ipAddress?: string;
  userAgent?: string;
}

const refused = (sourceId: number, code: string, message: string): DataRoomFileItem => ({
  sourceId, outcome: 'refused', code, message,
});

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

/** File one source that is not yet in the Vault. Never throws. */
async function fileOne(input: DataRoomFileInput, src: SourceUpload): Promise<DataRoomFileItem> {
  try {
    const title = (src.title ?? '').replace(/\.[^.]+$/, '').trim() || `Source ${src.id}`;
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
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    if (!result.ok) return refused(src.id, result.code, result.message);
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
): Promise<DataRoomFileItem> {
  const refusal = sourceRefusal(input, id, src);
  if (refusal || !src) return refusal as DataRoomFileItem;
  const already = src.checksum ? filedAs.get(src.checksum.trim()) : undefined;
  if (already) return { sourceId: id, outcome: 'already_filed', ...already };
  const item = await fileOne(input, src);
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
  for (const id of ids) items.push(await decideOne(input, id, sources.get(id), filedAs));
  return { ok: true, complete: items.every((i) => i.outcome !== 'refused'), items };
}
