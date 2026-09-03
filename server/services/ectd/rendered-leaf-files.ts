/**
 * Retained bytes for a server-rendered filing document.
 *
 * ── The defect this closes (LIFE-01) ─────────────────────────────────────────
 * The IND lifecycle filing routes rendered the 312.32 safety report and the
 * 312.33 annual report to PDF, computed an md5 over those bytes, attached the
 * md5 to the leaf, and discarded the bytes. The leaf carried no
 * document_table/document_id, so `materializeLeafSources` skipped it before
 * resolution: every filed lifecycle sequence assembled with ZERO leaf files and
 * the dispatch gate flagged each leaf UNRESOLVED_DOCUMENT — a permanent block.
 * A sponsor could "file" a 15-day safety report and hold a sequence that could
 * never be transmitted.
 *
 * This module is the one place that turns rendered bytes into something a leaf
 * can point at: the bytes go to the storage provider (the only tenant boundary
 * for object bytes, which sit outside RLS), and a `rendered_leaf_files` row
 * records the handle and the digests. `leafSourceFor()` returns exactly the
 * fields `upsertLeaf` needs, so no caller has to know the table name.
 *
 * Compensation: if the row insert fails after the bytes are stored, the stored
 * object is deleted before the error propagates — the same pattern the
 * attachments write path uses. An orphaned object with no row is invisible to
 * every reader and would never be cleaned up.
 *
 * @module server/services/ectd/rendered-leaf-files
 */

import { createHash } from 'crypto';
import { db } from '../../db';
import { renderedLeafFiles } from '../../../shared/schema/submissions';
import { getStorageProvider } from '../storage';

/** Which renderer produced the bytes. */
export type RenderedLeafSourceKind =
  | 'ind_safety_report'
  | 'e2b_r3_icsr'
  | 'ind_annual_report'
  | 'ind_letter_of_authorization';

export interface StoreRenderedLeafFileInput {
  organizationId: number;
  userId?: number | null;
  bytes: Buffer;
  mime: string;
  fileName: string;
  renderedFrom: RenderedLeafSourceKind;
  /** The CTD section the bytes were rendered for (e.g. 'm1.13'), when known. */
  sectionCode?: string | null;
}

export interface StoredRenderedLeafFile {
  id: number;
  md5: string;
  sha256: string;
  vaultVersionId: string;
}

/** The leaf fields a stored render supplies — the shape `upsertLeaf` accepts. */
export interface RenderedLeafSource {
  documentTable: 'rendered_leaf_files';
  documentId: number;
  checksum: string;
}

/** The storage bucket path rendered filing documents are stored under. */
const RENDERED_LEAF_PROJECT = 'rendered-leaves';

/**
 * Store rendered bytes and record them, returning the leaf source to place.
 *
 * Refuses empty bytes: a zero-length render is a failed render, and a leaf
 * pointing at nothing is worse than an unresolved one because it looks placed.
 */
export async function storeRenderedLeafFile(
  input: StoreRenderedLeafFileInput,
): Promise<StoredRenderedLeafFile> {
  if (!input.bytes || input.bytes.length === 0) {
    throw new Error('storeRenderedLeafFile: refusing to store zero-length render');
  }
  const md5 = createHash('md5').update(input.bytes).digest('hex');
  const storage = getStorageProvider();
  const put = await storage.put({
    orgId: input.organizationId,
    projectId: RENDERED_LEAF_PROJECT,
    filename: input.fileName,
    bytes: input.bytes,
    mime: input.mime,
    metadata: {
      renderedFrom: input.renderedFrom,
      ...(input.sectionCode ? { sectionCode: input.sectionCode } : {}),
    },
  });

  try {
    const [row] = await db
      .insert(renderedLeafFiles)
      .values({
        organizationId: input.organizationId,
        vaultVersionId: put.vaultVersionId,
        sha256: put.sha256,
        md5,
        mime: input.mime,
        byteSize: input.bytes.length,
        fileName: input.fileName,
        renderedFrom: input.renderedFrom,
        sectionCode: input.sectionCode ?? null,
        createdBy: input.userId ?? null,
      })
      .returning({ id: renderedLeafFiles.id });
    return { id: row.id, md5, sha256: put.sha256, vaultVersionId: put.vaultVersionId };
  } catch (err) {
    // The row is the only thing that makes the object findable. Without it the
    // bytes are unreachable litter, so remove them before failing.
    try {
      await storage.delete(put.vaultVersionId, input.organizationId);
    } catch {
      /* the original failure is the one worth reporting */
    }
    throw err;
  }
}

/** The leaf source for a stored render — what `upsertLeaf` needs to point at it. */
export function leafSourceFor(stored: StoredRenderedLeafFile): RenderedLeafSource {
  return { documentTable: 'rendered_leaf_files', documentId: stored.id, checksum: stored.md5 };
}

export default { storeRenderedLeafFile, leafSourceFor };
