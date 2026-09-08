/**
 * Retention of the delivered official FDA eSTAR.
 *
 * The `/official` route produced the bytes CDRH ingests, hashed them,
 * base64-encoded them into an HTTP response — and kept nothing.
 * `510k-estar-routes.ts` stored the export's INPUTS; `governedExportConsequence`
 * computed `delivered_artifact_sha256` over an output it then discarded. A
 * sponsor asking "what exactly did we file" had the platform's word for it and
 * no artifact behind it, which is the gap
 * `docs/reports/device-market-readiness-2026-09-07.md` §5 records under "Part 11
 * on the governed export".
 *
 * ── The one ingest ──
 * The bytes go into the governed corpus through `ingestVaultDocument` and
 * nothing else. That function is deliberately the only way a document enters
 * `vault.documents`, because a second path would be a second answer to "what
 * does it mean for a document to enter the governed corpus" — free to diverge
 * on the Part 11 audit row, the placement proposal, the catalog tier or the
 * passage index. So this module supplies arguments; it does not store anything
 * itself.
 *
 * ── Immutable, by content ──
 * `vault.documents` is unique on (program_id, document_code, version) and its
 * upsert refuses to overwrite a row whose `content_hash` differs. Versioning by
 * the delivered SHA-256 turns that into exactly the property this artifact
 * needs: re-exporting IDENTICAL bytes is idempotent (same row, re-proposed
 * placement), and DIFFERENT bytes are a new version rather than a replacement.
 * The version is the caller's own `delivered_artifact_sha256`, truncated — the
 * two are checkable against each other by eye.
 *
 * ── Failure is not a footnote ──
 * A retention that did not happen throws. Reporting `retained: false` beside a
 * delivered submission PDF would reproduce the exact gap this module closes,
 * with a label on it. The one honest `retained: false` is structural: an export
 * anchored to a legacy `fda510k_projects` row has no program uuid, so there is
 * no program vault to retain into — that is a fact about the data, said plainly.
 *
 * @module server/services/pathway-engines/estar/estar-artifact-retention
 */

import { createHash } from 'node:crypto';

import { pool } from '../../../db';
import { ingestVaultDocument } from '../../vault/vault-ingest.service';

/** Thrown when the delivered eSTAR could not be retained. The route turns this
 *  into a failed export: the file is not handed over. */
export class EstarRetentionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EstarRetentionError';
    this.code = code;
  }
}

export interface RetainOfficialEstarInput {
  organizationId: number;
  userId: number | null;
  /** The program spine uuid. Null ⇒ a legacy project with no program vault. */
  programUuid: string | null;
  /** The eSTAR descriptor the PDF was filled from, e.g. '510k-device'. */
  descriptorId: string;
  title: string;
  filename: string;
  pdfBytes: Buffer;
  ctdSection?: string;
}

export type EstarRetentionReport =
  | {
      retained: true;
      documentId: string;
      documentCode: string;
      version: string;
      /** SHA-256 of the retained bytes — the same hash the export returns. */
      contentHash: string;
      folderId: string | null;
      placementStatus: string;
    }
  | { retained: false; reason: string };

/** The document_code prefix every retained eSTAR carries (see retainOfficialEstar). */
export const RETAINED_ESTAR_CODE_PREFIX = 'eSTAR-';

export interface RetainedEstarArtifact {
  documentId: string;
  programId: string;
  documentCode: string;
  version: string;
  contentHash: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

/**
 * The org's retained official eSTARs, newest first.
 *
 * A filing is signed against ONE of these, so the operator has to be able to
 * see which ones exist — you cannot knowingly sign a binding you cannot choose.
 * Org-scoped by the same predicate the filing write re-checks, so this list can
 * never offer an artifact the signature would then refuse.
 */
export async function listRetainedEstarArtifacts(
  organizationId: number,
  limit = 50,
): Promise<RetainedEstarArtifact[]> {
  const { rows } = await pool.query(
    `SELECT id, program_id, document_code, version, content_hash, file_name, file_size, created_at
       FROM vault.documents
      WHERE organization_id = $1
        AND document_code LIKE $2
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $3`,
    [organizationId, `${RETAINED_ESTAR_CODE_PREFIX}%`, limit],
  );
  return rows.map((r: Record<string, unknown>) => ({
    documentId: String(r.id),
    programId: String(r.program_id),
    documentCode: String(r.document_code),
    version: String(r.version),
    contentHash: String(r.content_hash),
    fileName: String(r.file_name),
    fileSize: Number(r.file_size),
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export const NO_PROGRAM_VAULT_REASON =
  'This export is anchored to a legacy 510(k) project, which has no program vault. ' +
  'The delivered file is audited by its SHA-256 but not retained.';

/**
 * Retain the delivered official eSTAR in the program's governed vault.
 *
 * Must be called inside the acting organization's tenant scope, which the
 * request middleware establishes — the same requirement `ingestVaultDocument`
 * documents for every caller.
 *
 * @throws {EstarRetentionError} when a retention that should have happened did
 *   not. The caller must not deliver the file.
 */
export async function retainOfficialEstar(
  input: RetainOfficialEstarInput,
): Promise<EstarRetentionReport> {
  if (!input.programUuid) return { retained: false, reason: NO_PROGRAM_VAULT_REASON };

  const contentHash = createHash('sha256').update(input.pdfBytes).digest('hex');
  const documentCode = `eSTAR-${input.descriptorId}`;
  const version = `sha256-${contentHash.slice(0, 16)}`;

  const result = await ingestVaultDocument({
    organizationId: input.organizationId,
    userId: input.userId,
    programId: input.programUuid,
    documentCode,
    documentTitle: input.title,
    // The vault's own kind for an assembled submission package. Free text in
    // the column; the HTTP ingest's enum is a route-level constraint on what a
    // person may choose, not on what the platform files.
    documentType: 'SUBMISSION',
    version,
    classification: 'CONFIDENTIAL',
    ...(input.ctdSection ? { ctdSection: input.ctdSection } : {}),
    fileBuffer: input.pdfBytes,
    fileName: input.filename,
    mimeType: 'application/pdf',
    // No folderId: the filing classifier PROPOSES a placement ('suggested').
    // Naming one here would record 'confirmed' — that a person chose it — and
    // nobody did.
    origin: 'platform-generated',
  });

  if (!result.ok) {
    throw new EstarRetentionError(
      result.code,
      `The official eSTAR could not be retained (${result.code}): ${result.message}`,
    );
  }

  // The retained row must describe the bytes that were handed over. A row whose
  // content_hash is something else is what the vault's own ingest calls "a
  // record that lies", and it is worse here: the mismatch would sit under a
  // version derived from the delivered hash, so both values would look right
  // in isolation.
  if (result.document.contentHash !== contentHash) {
    throw new EstarRetentionError(
      'RETAINED_HASH_MISMATCH',
      'The vault stored a different hash than the delivered eSTAR ' +
        `(delivered ${contentHash}, stored ${result.document.contentHash}).`,
    );
  }

  return {
    retained: true,
    documentId: result.document.id,
    documentCode,
    version,
    contentHash: result.document.contentHash,
    folderId: result.filing.folderId,
    placementStatus: result.filing.placementStatus,
  };
}
