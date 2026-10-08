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
import { findTextFacts, matchStudy, readProgramFacts, type ProgramFacts, type TextFacts } from './catalog-facts.js';
import { profileDataset, type DatasetProfile } from './dataset-profile.js';

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

/** What the catalog records a capture IS (S3): every value by rule, with where it came from. */
export interface CatalogFacts {
  program: ProgramFacts | null;
  text: TextFacts;
  study: { studyRef: number | null; candidates: Array<{ id: number; studyId: string; protocolId: string }> };
  datasetProfile: DatasetProfile | null;
}

/**
 * The catalog facts of a capture: the project's own record, the text rules
 * (catalog-facts.ts), the one study of this project the document names, and
 * the structure of a tabular file or define.xml (dataset-profile.ts).
 */
export async function buildCatalogFacts(
  exec: Exec,
  orgId: number,
  programId: string | null,
  input: { text: string | null; bytes?: Buffer | null; fileName: string; mimeType: string },
): Promise<CatalogFacts> {
  const text = findTextFacts(input.text);
  const program = programId ? await readProgramFacts(exec, orgId, programId) : null;
  const study = programId && program ? await matchStudy(exec, orgId, programId, text) : { studyRef: null, candidates: [] };
  const datasetProfile = input.bytes ? await profileDataset(input.bytes, input.fileName, input.mimeType) : null;
  return { program, text, study, datasetProfile };
}

/** The catalog facts as the record keeps them: the evidence for each, and the profile. */
function factsMetadata(f: CatalogFacts | undefined): Record<string, unknown> {
  if (!f) return {};
  return {
    catalogEvidence: {
      registryIds: f.text.registryIds,
      protocolNumber: f.text.protocolNumber,
      documentDate: f.text.documentDate,
      dataCutDate: f.text.dataCutDate,
      study: f.study.candidates.length > 0 ? { matched: f.study.studyRef, candidates: f.study.candidates } : null,
      inheritedFromProject: f.program ? Object.keys(f.program).filter(k => f.program?.[k as keyof ProgramFacts]) : [],
      rules: 'catalog-facts v1',
    },
    ...(f.text.dataCutDate ? { dataCutDate: f.text.dataCutDate.value } : {}),
    ...(f.datasetProfile ? { datasetProfile: f.datasetProfile } : {}),
  };
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

/** extraction_status, extracted_text, char_count, page_count. */
function textValues(extracted: ExtractedCapture): unknown[] {
  const text = extracted.text;
  return [text ? 'extracted' : 'failed', text, text ? text.length : 0, extracted.pageCount];
}

/** How the capture was read and versioned, merged into its provenance. */
function processingProvenance(extracted: ExtractedCapture, description: CaptureDescription | undefined, processedBy: string) {
  return {
    extractionMethod: extracted.method,
    extractionWords: extracted.words,
    ...(extracted.error ? { extractionError: extracted.error } : {}),
    processedBy,
    ...(description ? { versionDeclaration: { ...description.versionDetermination.declaration, determinedBy: processedBy } } : {}),
  };
}

/** product … study_ref, in the UPDATE's order; null where nothing was found. */
function factValues(facts: CatalogFacts | undefined): unknown[] {
  const pf = facts?.program;
  const v = (x: string | number | null | undefined) => x ?? null;
  return [
    v(pf?.product), v(pf?.indication), v(pf?.phase), v(pf?.applicationType), v(pf?.applicationNumber), v(pf?.agency),
    v(facts?.text.registryIds[0]?.value), v(facts?.text.documentDate?.value), v(facts?.study.studyRef),
  ];
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
  p: { extracted: ExtractedCapture; description?: CaptureDescription; facts?: CatalogFacts; processedBy: string },
): Promise<boolean> {
  const { extracted, description, facts } = p;
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
        -- What it IS (S3): filled only where empty, never overwritten by a re-read.
        product = COALESCE(product, $10), indication = COALESCE(indication, $11), phase = COALESCE(phase, $12),
        application_type = COALESCE(application_type, $13), application_number = COALESCE(application_number, $14),
        agency = COALESCE(agency, $15), trial_registry_identifier = COALESCE(trial_registry_identifier, $16),
        document_date = COALESCE(document_date, $17::date), study_ref = COALESCE(study_ref, $18),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND source_type = 'client_document' AND deleted_at IS NULL`,
    [sourceId, orgId, ...textValues(extracted), description?.versionDetermination.version ?? null,
      JSON.stringify(processingProvenance(extracted, description, p.processedBy)),
      JSON.stringify({ ...(description?.dossier ? { dossier: description.dossier } : {}), ...factsMetadata(facts) }),
      ...factValues(facts)],
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
    const facts = await buildCatalogFacts(pool, orgId, input.programId, { text: extracted.text, bytes: input.bytes, fileName: input.fileName, mimeType: input.mimeType });
    const ok = await recordSourceProcessing(pool, orgId, sourceId, { extracted, description, facts, processedBy: input.processedBy });
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
