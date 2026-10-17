/** Read-only scientific verification behind the existing canonical catalog facade.
 * Canonical query primitives are injected, so this helper adds no runtime cycle. */
import { createHash } from 'node:crypto';
import { admitCatalogActor, CatalogAdmissionError } from './document-catalog-admission.js';
import { assertCatalogWriteAllowed, validateSourceFactBatch, verifySourceFactCandidate, type SpanCoverageReport } from './document-catalog-core.js';
import type { CatalogDocumentRow } from './document-catalog.service.js';
import type { CatalogFactReason, CatalogFactVerification } from '../../../shared/ana/catalog-facts.js';

interface PreviewDependencies {
  connect(): Promise<import('pg').PoolClient>;
  isCatalogEnabled: typeof import('./document-catalog.service.js').isDocumentCatalogEnabled;
  loadDocument: typeof import('./document-catalog-document.js').loadDocumentForAdmittedScope;
  getCoverage: typeof import('./document-catalog.service.js').getReadCoverage;
}

/** Prototype source verification is never enabled by the legacy catalog flag. */
export function isSourceFactPreviewEnabled(): boolean {
  return process.env.ANA_CATALOG_SOURCE_FACT_PREVIEW === '1';
}

const supportedMethods = new Set(['utf8', 'pdf-text', 'pdf-ocr', 'image-ocr', 'docx', 'xlsx', 'stored']);
function readableSource(doc: CatalogDocumentRow | null, organizationId: number):
  | { ok: false; code: string; refusal: string }
  | { ok: true; document: CatalogDocumentRow; text: string; method: string } {
  if (!doc || doc.organizationId !== organizationId) return { ok: false, code: 'SOURCE_UNAVAILABLE', refusal: 'The current eligible document could not be admitted in this project.' };
  if (!/^[a-f0-9]{64}$/.test(doc.contentHash) || !doc.catalog || doc.catalog.contentHash !== doc.contentHash) {
    return { ok: false, code: 'SOURCE_VERSION_CHANGED', refusal: 'The exact source and recorded extraction identities do not agree.' };
  }
  const text = doc.extractedText, method = doc.catalog.extractionMethod;
  if (doc.catalog.status === 'extraction_failed' || typeof text !== 'string' || text.trim().length === 0 || !method || !supportedMethods.has(method)) {
    return { ok: false, code: 'SOURCE_EXTRACTION_UNAVAILABLE', refusal: 'A supported, nonempty recorded extraction is required for source verification.' };
  }
  return { ok: true, document: doc, text, method };
}

export interface SourceFactPreviewResult {
  ok: boolean;
  mode: 'verification_preview';
  persisted: false;
  reviewState: 'not_recorded';
  scientificQualification: 'unassessed';
  code?: string;
  refusal?: string;
  reasons?: CatalogFactReason[];
  coverage?: SpanCoverageReport;
  source?: { documentId: string; contentHash: string; extractedTextSha256: string; originalFileAvailable: boolean };
  results?: CatalogFactVerification[];
  message?: string;
}

/** A read-only diagnostic, using the same canonical current membership/project
 * admission as catalog writes. Read receipts remain aggregate byte-bound spans;
 * they do not establish extraction-specific or actor-specific delivery. */
export interface SourceFactPreviewArgs {
  documentId: string;
  organizationId: number;
  userId: number | null;
  programId: string;
  candidates: unknown;
}

export async function runSourceFactPreview(args: SourceFactPreviewArgs, deps: PreviewDependencies): Promise<SourceFactPreviewResult> {
  const envelope = { mode: 'verification_preview' as const, persisted: false as const, reviewState: 'not_recorded' as const, scientificQualification: 'unassessed' as const };
  const refuse = (code: string, refusal: string, extra: Partial<SourceFactPreviewResult> = {}): SourceFactPreviewResult => ({ ...envelope, ok: false, code, refusal, ...extra });
  if (!isSourceFactPreviewEnabled()) return refuse('SOURCE_FACT_PREVIEW_DISABLED', 'Source-fact verification previews are not enabled.');
  // Copy candidates before the first await. They cannot change while access is
  // checked or select an alternate source through a late mutation.
  const validated = validateSourceFactBatch(args.candidates);
  if (!validated.ok) return refuse(validated.code, 'The fact candidates have an unsupported or invalid schema.', { reasons: validated.reasons });
  const { documentId, organizationId, userId, programId } = args;
  if (!(await deps.isCatalogEnabled(organizationId))) return refuse('CATALOG_DISABLED', 'The document catalog is not enabled.');
  const client = await deps.connect();
  let began = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
    began = true;
    await admitCatalogActor(client, { organizationId, userId, programId }, { write: true, hold: false });
    const doc = await deps.loadDocument(documentId, organizationId, { includeText: true, executor: client, programId, currentOnly: true });
    const readable = readableSource(doc, organizationId);
    if (!readable.ok) return refuse(readable.code, readable.refusal);
    const { document, text, method } = readable;
    const extractedTextSha256 = createHash('sha256').update(text).digest('hex');
    const coverage = await deps.getCoverage(document.id, document.contentHash, text.length, client);
    const gate = assertCatalogWriteAllowed(coverage, null, text);
    if (!gate.allowed) return refuse('SOURCE_NOT_FULLY_READ', gate.reason ?? 'Read the entire source before requesting verification.', { coverage });
    const extractionCaveat = method === 'pdf-ocr' || method === 'image-ocr' ? 'ocr' as const : method === 'xlsx' ? 'unsupported_language_or_layout' as const : undefined;
    const results = validated.candidates.map(candidate => verifySourceFactCandidate(candidate, { documentId: document.id, contentHash: document.contentHash, extractedText: text, extractedTextSha256, ...(extractionCaveat ? { extractionCaveat } : {}) }));
    // Read-only transactions cannot hold membership/policy rows. Recheck the
    // actual current actor and private project after all source-dependent work
    // before handing any derived source facts back to the caller.
    await admitCatalogActor(client, { organizationId, userId, programId }, { write: true, hold: false });
    // No partial batch is promoted to source-bound when any anchor/value fails.
    if (results.some(result => !result.ok)) return refuse('SOURCE_FACT_BINDING_FAILED', 'One or more candidates do not bind to the exact source text. No facts were saved.', { results, coverage });
    await client.query('COMMIT');
    began = false;
    return {
      ...envelope, ok: true, results, coverage,
      source: { documentId: document.id, contentHash: document.contentHash, extractedTextSha256, originalFileAvailable: document.originalFileAvailable !== false },
      message: 'Read-only source verification preview. Context checks are reported separately; scientific qualification and review have not been established. No facts or catalog description were saved. Read coverage uses aggregate byte-bound receipts.',
    };
  } catch (error) {
    if (error instanceof CatalogAdmissionError) return refuse(error.code, error.message);
    throw error;
  } finally {
    try { if (began) await client.query('ROLLBACK'); }
    finally { client.release(); }
  }
}

