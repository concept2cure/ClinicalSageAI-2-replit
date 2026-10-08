/**
 * The one processing step for a Data Room capture (D2, Data Room catalog S2;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * A capture (`cre_evidence_sources`, source_type 'client_document') arrives
 * three ways: a chat or Data Room upload (routes/chat/upload.ts), an adopt of
 * a conversation file (POST /api/c2c/projects/:id/adopt), and a spreadsheet
 * edit AnA saves as a new file (saveDerivedUpload). Only the upload read the
 * file. The other two recorded `extraction_status: 'pending'`, and nothing
 * ever read them: they were in the Data Room, unread, unclassified,
 * unversioned and unsearchable, forever.
 *
 * Every path now goes through here. Everything is deterministic and needs no
 * key:
 *   - describeCapture: the dossier proposal (the classifier the Vault ingest
 *     runs) and the declared version (read off the document, never counted);
 *   - extractCapture: the text, by the platform's extractor;
 *   - recordSourceProcessing: one UPDATE of the derived columns only. The
 *     checksum, scope and capturer stay as the capture wrote them (the VR-16
 *     guard holds them);
 *   - processPendingSources: the sweep for what was captured before this
 *     existed. It is resumable and bounded, and names what it could not read.
 *
 * Derived data is not the record: a re-read may replace it. The record is the
 * original bytes' checksum, which nothing here touches.
 */
import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { determineSourceVersion, type SourceVersionDetermination } from './source-version.js';

const logger = createScopedLogger('data-room-processing');

type Exec = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

/** What the extractor read from a capture's bytes. */
export interface ExtractedCapture {
  /** Null when nothing readable came out: a failure, never an empty success. */
  text: string | null;
  method: string | null;
  pageCount: number | null;
  words: number;
  /** Why there is no text, when there is none. */
  error?: string;
}

/** The deterministic description of a capture: where it likely belongs, and what version it declares. */
export interface CaptureDescription {
  dossier: Record<string, unknown> | null;
  versionDetermination: SourceVersionDetermination;
}

/** Read the bytes with the platform's extractor. Never throws. */
export async function extractCapture(bytes: Buffer, mimeType: string, fileName: string): Promise<ExtractedCapture> {
  try {
    const { extractDocumentText } = await import('../ocr/index.js');
    const extracted = await extractDocumentText(bytes, mimeType, fileName);
    const text = extracted.text?.trim() ? extracted.text : null;
    if (!text) return { text: null, method: extracted.method ?? null, pageCount: null, words: 0, error: 'No text could be read from the file.' };
    return {
      text,
      method: extracted.method,
      pageCount: extracted.pageSpans?.length ?? null,
      words: text.trim().split(/\s+/).length,
    };
  } catch (err) {
    return { text: null, method: null, pageCount: null, words: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The dossier proposal and the declared version. The proposal is the same
 * classifier the Vault ingest runs, stamped as a suggestion; filing stays a
 * governed act. A classifier failure leaves no dossier, never a failed capture.
 */
export async function describeCapture(
  orgId: number,
  programId: string | null,
  input: { fileName: string; mimeType: string; text: string | null },
): Promise<CaptureDescription> {
  let dossier: Record<string, unknown> | null = null;
  try {
    const { classifyForFiling, resolveVaultView, resolveOrgVaultView } = await import('../vault/vault-filing.service.js');
    const view = programId ? await resolveVaultView(programId, orgId) : await resolveOrgVaultView(orgId);
    const c = classifyForFiling({ fileName: input.fileName, title: input.fileName, mimeType: input.mimeType, extractedText: input.text, view });
    dossier = {
      view, evidenceKind: c.evidenceKind, suggestedFolder: c.folderId, ctdSection: c.ctdSection,
      confidence: c.confidence, needsReview: c.needsReview, rationale: c.rationale,
    };
  } catch (err) {
    logger.warn('Data Room classification failed (non-fatal)', { err: err instanceof Error ? err.message : String(err) });
  }
  // A filename placeholder is not document text: pass null when nothing was read.
  const versionDetermination = determineSourceVersion({ documentText: input.text, fileName: input.fileName });
  return { dossier, versionDetermination };
}

/**
 * Write what processing found onto the capture: the derived columns only,
 * scoped to the organization. `version` is written only where the capture has
 * none, so a declared version is never overwritten by a re-read.
 */
export async function recordSourceProcessing(
  exec: Exec,
  orgId: number,
  sourceId: number,
  p: { extracted: ExtractedCapture; description?: CaptureDescription; processedBy: string },
): Promise<boolean> {
  const { extracted, description } = p;
  const provenance = {
    extractionMethod: extracted.method,
    extractionWords: extracted.words,
    ...(extracted.error ? { extractionError: extracted.error } : {}),
    processedBy: p.processedBy,
    ...(description ? { versionDeclaration: { ...description.versionDetermination.declaration, determinedBy: p.processedBy } } : {}),
  };
  const metadata = description?.dossier ? { dossier: description.dossier } : {};
  const { rowCount } = await exec.query(
    `UPDATE cre_evidence_sources SET
        extraction_status = $3,
        extracted_text = $4,
        char_count = $5,
        page_count = $6,
        text_extracted_at = NOW(),
        version = COALESCE(version, $7),
        provenance = COALESCE(provenance, '{}'::jsonb) || $8::jsonb,
        metadata = COALESCE(metadata, '{}'::jsonb) || $9::jsonb,
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND source_type = 'client_document' AND deleted_at IS NULL`,
    [
      sourceId, orgId, extracted.text ? 'extracted' : 'failed', extracted.text,
      extracted.text ? extracted.text.length : 0, extracted.pageCount,
      description?.versionDetermination.version ?? null, JSON.stringify(provenance), JSON.stringify(metadata),
    ],
  );
  return (rowCount ?? 0) === 1;
}

/**
 * Process one capture from its bytes: read, describe, record. Called after
 * the capture commits; never throws, because the capture is the record and
 * stands without its derived text. A failure is logged and left 'pending' for
 * the sweep.
 */
export async function processCapturedSource(
  orgId: number,
  sourceId: number,
  input: { bytes: Buffer; fileName: string; mimeType: string; programId: string | null; processedBy: string },
): Promise<{ ok: boolean; extracted?: ExtractedCapture }> {
  try {
    const extracted = await extractCapture(input.bytes, input.mimeType, input.fileName);
    const description = await describeCapture(orgId, input.programId, { fileName: input.fileName, mimeType: input.mimeType, text: extracted.text });
    const ok = await recordSourceProcessing(pool, orgId, sourceId, { extracted, description, processedBy: input.processedBy });
    return { ok, extracted };
  } catch (err) {
    logger.warn('Data Room capture not processed; left pending for the sweep', {
      sourceId, err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}

export interface PendingSweepReport {
  examined: number;
  processed: number;
  /** Captures whose bytes could not be read, each with its reason. */
  unreadable: Array<{ sourceId: number; reason: string }>;
  dryRun: boolean;
}

/**
 * Process the organization's captures still marked 'pending', oldest first.
 * Bounded per run; resumable (a processed capture leaves the set); dry-run
 * unless applied. The bytes are read through the one verified loader, so a
 * file whose stored bytes no longer match their digest is refused, not read.
 */
export async function processPendingSources(
  orgId: number,
  opts: { apply?: boolean; limit?: number; exec?: Exec } = {},
): Promise<PendingSweepReport> {
  const exec = opts.exec ?? (pool as unknown as Exec);
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
  const { rows } = await exec.query(
    `SELECT id, title, client_program_id, provenance->>'fileUploadId' AS file_upload_id,
            metadata->>'mimeType' AS mime_type
       FROM cre_evidence_sources
      WHERE organization_id = $1 AND source_type = 'client_document'
        AND extraction_status = 'pending' AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT $2`,
    [orgId, limit],
  );
  const report: PendingSweepReport = { examined: rows.length, processed: 0, unreadable: [], dryRun: opts.apply !== true };
  if (opts.apply !== true) return report;
  const { loadUploadedFile } = await import('../ana/uploaded-file-access.js');
  for (const r of rows) {
    const sourceId = Number(r.id);
    if (!r.file_upload_id) {
      report.unreadable.push({ sourceId, reason: 'The capture names no stored file to read.' });
      continue;
    }
    try {
      const file = await loadUploadedFile(String(r.file_upload_id), orgId);
      const done = await processCapturedSource(orgId, sourceId, {
        bytes: file.buffer, fileName: r.title ?? file.fileName, mimeType: r.mime_type ?? file.mimeType,
        programId: r.client_program_id ?? null, processedBy: 'data-room pending sweep',
      });
      if (done.ok) report.processed += 1;
      else report.unreadable.push({ sourceId, reason: 'Processing did not complete; see the log.' });
    } catch (err) {
      report.unreadable.push({ sourceId, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}
