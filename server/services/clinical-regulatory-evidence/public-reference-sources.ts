/** Public source-document reads over the existing CRE spine (D2).
 *
 * What already exists: evidence-spine.service owns cre_evidence_sources; the
 * Data Room migration retains extracted_text; AnA's evidence tool reads studies,
 * findings, outcomes and lessons. This extends that read path to explicitly
 * public reference documents. It creates no store, findings, training set or
 * tenant evidence. Catalog discovery is distinct from integrity-checked text.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool } from '../../db';

const SHA256 = /^[0-9a-f]{64}$/;
const ORIGINAL_DIRECTORY = 'server/data/public-csr-reference/originals';
const PAGE_SEPARATOR = '\n\f\n';
const MAX_ORIGINAL_BYTES = 256 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 64 * 1024 * 1024;
const MAX_RETURN_CHARACTERS = 16000;
const MAX_RETURN_PAGES = 4;

const httpsUrl = z.string().max(4096).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, 'An HTTPS source URL is required');
const digest = z.string().regex(SHA256);
const retentionSchema = z.object({
  status: z.literal('retained'), artifactPath: z.string().max(300), sha256: digest,
  bytes: z.number().int().positive().max(MAX_ORIGINAL_BYTES),
});
const extractionSchema = z.object({
  status: z.literal('extracted_unreviewed'), textSha256: digest,
  pages: z.array(z.object({ page: z.number().int().positive(), start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(), sha256: digest,
    extractionMethod: z.string().min(1).max(200).optional(),
    reviewStatus: z.enum(['extracted_unreviewed', 'ocr_unreviewed', 'unreviewed']).optional() })).min(1).max(10000),
  pageCount: z.number().int().positive().max(10000),
});
// The catalog permits absent retention/extraction. The text reader requires both.
const referenceSchema = z.object({
  schemaVersion: z.literal(1), documentClass: z.string().min(1).max(100),
  studyFamily: z.string().min(1).max(300), evidenceRole: z.literal('external_reference'),
  clientStudyEvidence: z.literal(false), trainingApproved: z.literal(false),
  permittedUse: z.object({ retrieval: z.enum(['allowed', 'review_required', 'restricted']),
    basis: z.string().min(1).max(4000), sourceUrl: httpsUrl }),
  retention: retentionSchema.nullish(), extraction: extractionSchema.nullish(),
  fit: z.object({ targetStudyId: z.string().min(1).max(100), rationale: z.string().min(1).max(4000),
    limitations: z.array(z.string().min(1).max(2000)).max(30) }).optional(),
});
type PublicReference = z.infer<typeof referenceSchema>;
type Retention = z.infer<typeof retentionSchema>;

export const publicReferenceToolInputSchema = z.object({
  indication: z.string().trim().min(1).max(300).optional(),
  phase: z.string().trim().min(1).max(60).optional(),
  query: z.string().trim().min(1).max(300).optional(),
  entity_types: z.array(z.enum(['studies', 'findings', 'outcomes', 'lessons', 'sources'])).max(5).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  source_offset: z.number().int().min(0).max(100000).optional(),
  source_id: z.number().int().positive().max(2147483647).optional(),
  page_start: z.number().int().positive().max(10000).optional(),
  page_end: z.number().int().positive().max(10000).optional(),
}).strict().superRefine((input, context) => {
  if (input.source_id === undefined && (input.page_start !== undefined || input.page_end !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'source_id is required for page reads' });
  }
  const start = input.page_start ?? 1;
  const end = input.page_end ?? start;
  if (end < start || end - start >= MAX_RETURN_PAGES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Request one to four consecutive pages' });
  }
});

export class PublicReferenceReadError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'PublicReferenceReadError'; }
}
interface SqlExecutor { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }
export interface PublicReferenceReadDependencies {
  executor?: SqlExecutor;
  /** Test seam; production always checks the deployed original bytes. */
  verifyOriginal?: (retention: Retention) => Promise<void>;
}
interface SourceRow {
  id: number; source_type: string; title: string | null; sponsor: string | null;
  product: string | null; indication: string | null; phase: string | null;
  source_record_identifier: string | null; trial_registry_identifier: string | null;
  official_url: string | null; stored_artifact_ref: string | null; checksum: string | null;
  archive_member: string | null;
  ingestion_status: string; extraction_status: string; public_reference: unknown;
  extracted_text?: string | null;
}
function requireOrganization(organizationId: number): void {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new PublicReferenceReadError('ORGANIZATION_REQUIRED', 'An organization is required to read public references.');
  }
}
function hash(text: string | Buffer): string { return createHash('sha256').update(text).digest('hex'); }
function escapedLike(value: string): string { return `%${value.replace(/[\\%_]/g, '\\$&')}%`; }
function referenceOf(row: SourceRow): PublicReference | null {
  const parsed = referenceSchema.safeParse(row.public_reference);
  return parsed.success && httpsUrl.safeParse(row.official_url).success ? parsed.data : null;
}
function summary(row: SourceRow, reference: PublicReference) {
  return {
    sourceId: Number(row.id), sourceType: row.source_type, title: row.title,
    sponsor: row.sponsor, product: row.product, indication: row.indication, phase: row.phase,
    sourceRecordIdentifier: row.source_record_identifier, trialRegistryIdentifier: row.trial_registry_identifier,
    officialUrl: row.official_url, archiveMember: row.archive_member,
    documentClass: reference.documentClass, studyFamily: reference.studyFamily,
    evidenceRole: reference.evidenceRole, clientStudyEvidence: false, trainingApproved: false,
    permittedUse: reference.permittedUse,
    retentionStatus: reference.retention ? 'recorded_retained' : 'not_retained',
    extractionStatus: reference.extraction?.status ?? 'not_extracted',
    pageCount: reference.extraction?.pageCount ?? null,
    sourceSha256: row.checksum,
    contentAccess: reference.permittedUse.retrieval !== 'allowed' ? reference.permittedUse.retrieval
      : reference.retention && reference.extraction ? 'requires_integrity_check' : 'not_retained_and_extracted',
    ...(reference.fit ? { fit: reference.fit } : {}),
  };
}

/** Metadata discovery only. No source text/snippets are returned, even when allowed. */
export async function searchPublicReferenceSources(organizationId: number, input: {
  query?: string; indication?: string; phase?: string; limit?: number; offset?: number;
}, executor: SqlExecutor = pool) {
  requireOrganization(organizationId);
  const validated = publicReferenceToolInputSchema.parse({ query: input.query, indication: input.indication,
    phase: input.phase, limit: input.limit, source_offset: input.offset });
  const limit = validated.limit ?? 25;
  const offset = validated.source_offset ?? 0;
  // Literal SQL keeps every input in a fixed bind slot. Source visibility alone
  // never promotes client evidence to global evidence.
  const result = await executor.query(`SELECT s.id, s.source_type, s.title, s.sponsor, s.product, s.indication, s.phase,
      s.source_record_identifier, s.trial_registry_identifier, s.official_url, s.stored_artifact_ref,
      s.checksum, s.ingestion_status, s.extraction_status, s.metadata->'publicReference' AS public_reference,
      s.provenance->>'archiveMember' AS archive_member
    FROM cre_evidence_sources s
    WHERE s.organization_id IS NULL AND s.visibility_class = 'global_public'
      AND s.client_program_id IS NULL AND s.client_workspace_id IS NULL
      AND s.is_current = TRUE AND s.deleted_at IS NULL
      AND s.source_type IN ('csr','protocol','sap','fda_crl','fda_review_memo','fda_approval_package','trial_registry','publication')
      AND s.metadata->'publicReference'->>'schemaVersion' = '1'
      AND s.metadata->'publicReference'->>'evidenceRole' = 'external_reference'
      AND s.metadata->'publicReference'->'clientStudyEvidence' = 'false'::jsonb
      AND s.metadata->'publicReference'->'trainingApproved' = 'false'::jsonb
      AND ($1::text IS NULL OR s.indication ILIKE $1 ESCAPE '\\')
      AND ($2::text IS NULL OR s.phase = $2)
      AND ($3::text IS NULL OR concat_ws(' ', s.title, s.sponsor, s.product, s.indication, s.source_record_identifier,
      s.trial_registry_identifier, s.source_type, s.metadata->'publicReference'->>'documentClass',
      s.metadata->'publicReference'->>'studyFamily', s.metadata->'publicReference'->'fit'->>'targetStudyId',
      s.metadata->'publicReference'->'fit'->>'rationale', s.metadata->'publicReference'->'fit'->'limitations')
      ILIKE $3 ESCAPE '\\')
    ORDER BY s.id ASC LIMIT $4 OFFSET $5`,
  [validated.indication ? escapedLike(validated.indication) : null, validated.phase ?? null,
    validated.query ? escapedLike(validated.query) : null, limit + 1, offset]);
  const rows = result.rows as SourceRow[];
  const pageRows = rows.slice(0, limit);
  const sources = pageRows.flatMap(row => {
    const reference = referenceOf(row); return reference ? [summary(row, reference)] : [];
  });
  const hasMore = rows.length > limit;
  return { sources, offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null,
    excludedInvalidManifests: pageRows.length - sources.length,
    note: 'Public source catalog metadata. Text requires a separate integrity-checked page read. External examples are not client study results.' };
}

/** Only this deployed directory and checksum-named PDFs can ever be opened. */
export async function verifyPublicReferenceOriginal(retention: Retention): Promise<void> {
  const expectedPath = `${ORIGINAL_DIRECTORY}/${retention.sha256}.pdf`;
  if (retention.artifactPath !== expectedPath) throw new PublicReferenceReadError('ORIGINAL_PATH_INVALID', 'The retained original has an invalid reference.');
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const root = await realpath(path.resolve(process.cwd(), ORIGINAL_DIRECTORY));
    const candidate = await realpath(path.resolve(process.cwd(), expectedPath));
    if (path.dirname(candidate) !== root || path.basename(candidate) !== `${retention.sha256}.pdf`) {
      throw new PublicReferenceReadError('ORIGINAL_PATH_INVALID', 'The retained original has an invalid reference.');
    }
    file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== retention.bytes || stat.size > MAX_ORIGINAL_BYTES) {
      throw new PublicReferenceReadError('ORIGINAL_INTEGRITY_FAILED', 'Retained original byte length differs from the recorded identity.');
    }
    await verifyOriginalStream(file, retention);
  } catch (error) {
    if (error instanceof PublicReferenceReadError) throw error;
    throw new PublicReferenceReadError('ORIGINAL_UNAVAILABLE', 'The retained original could not be verified. No report text was returned.');
  } finally { await file?.close().catch(() => undefined); }
}

async function verifyOriginalStream(file: FileHandle, retention: Retention): Promise<void> {
  const hashState = createHash('sha256');
  let size = 0;
  let header = Buffer.alloc(0);
  for await (const chunk of file.createReadStream({ autoClose: false })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > retention.bytes) throw new PublicReferenceReadError('ORIGINAL_INTEGRITY_FAILED', 'Retained original changed during verification.');
    if (header.length < 5) header = Buffer.concat([header, bytes]).subarray(0, 5);
    hashState.update(bytes);
  }
  if (size !== retention.bytes || header.toString('ascii') !== '%PDF-' || hashState.digest('hex') !== retention.sha256) {
    throw new PublicReferenceReadError('ORIGINAL_INTEGRITY_FAILED', 'Retained original does not match its PDF identity and checksum.');
  }
}

function retentionMatches(row: SourceRow, retention: Retention): boolean {
  return row.ingestion_status === 'ingested' && row.extraction_status === 'extracted'
    && retention.sha256 === row.checksum
    && retention.artifactPath === `${ORIGINAL_DIRECTORY}/${retention.sha256}.pdf`
    && row.stored_artifact_ref === `repository:${retention.artifactPath}`;
}
function assertExtraction(row: SourceRow, reference: PublicReference): asserts reference is PublicReference & {
  retention: Retention; extraction: z.infer<typeof extractionSchema>;
} {
  const retention = reference.retention;
  const extraction = reference.extraction;
  const text = row.extracted_text;
  if (!retention || !extraction || !retentionMatches(row, retention)
      || typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARACTERS
      || hash(text) !== extraction.textSha256 || extraction.pages.length !== extraction.pageCount) {
    throw new PublicReferenceReadError('SOURCE_INTEGRITY_FAILED', 'The source retention and extraction identities could not be verified.');
  }
  assertMappedPages(text, extraction);
}
function assertMappedPages(text: string, extraction: z.infer<typeof extractionSchema>): void {
  let previousEnd = 0;
  for (let index = 0; index < extraction.pages.length; index++) {
    const page = extraction.pages[index];
    const expectedStart = index === 0 ? 0 : previousEnd + PAGE_SEPARATOR.length;
    if (page.page !== index + 1 || page.start !== expectedStart || page.end < page.start || page.end > text.length
        || (index > 0 && text.slice(previousEnd, page.start) !== PAGE_SEPARATOR)
        || hash(text.slice(page.start, page.end)) !== page.sha256) {
      throw new PublicReferenceReadError('PAGE_INTEGRITY_FAILED', 'The page boundaries or page checksum could not be verified.');
    }
    previousEnd = page.end;
  }
  if (previousEnd !== text.length) throw new PublicReferenceReadError('PAGE_INTEGRITY_FAILED', 'The extraction has unmapped text.');
}

function pageWindow(row: SourceRow, extraction: z.infer<typeof extractionSchema>, firstPage: number, lastPage: number) {
  let remaining = MAX_RETURN_CHARACTERS;
  const pages = [];
  for (const page of extraction.pages.slice(firstPage - 1, lastPage)) {
    if (remaining <= 0) break;
    const fullText = row.extracted_text!.slice(page.start, page.end);
    let text = fullText.slice(0, remaining);
    // Never split a Unicode surrogate pair at the response character bound.
    if (text.length < fullText.length && /[\uD800-\uDBFF]/.test(text.slice(-1))) text = text.slice(0, -1);
    remaining -= text.length;
    const citation = new URL(row.official_url!);
    // FDA publishes some records as ZIP bundles. A #page fragment on that URL
    // is not a PDF citation: name its exact archive member and retained bytes.
    if (!row.archive_member) citation.hash = `page=${page.page}`;
    pages.push({ page: page.page, text, sourceStart: page.start, sourceEnd: page.end,
      returnedEnd: page.start + text.length, truncated: text.length < fullText.length,
      pageSha256: page.sha256, returnedTextSha256: hash(text), citationUrl: citation.toString(),
      citation: { url: citation.toString(), archiveMember: row.archive_member, pdfPage: page.page,
        retainedArtifactRef: row.stored_artifact_ref, sourceSha256: row.checksum },
      extractionMethod: page.extractionMethod ?? 'not_recorded', reviewStatus: page.reviewStatus ?? 'unreviewed' });
  }
  return pages;
}

/** Read an admitted public original's exact extracted pages, never client results. */
export async function readPublicReferencePages(organizationId: number, input: {
  sourceId: number; pageStart?: number; pageEnd?: number;
}, dependencies: PublicReferenceReadDependencies = {}) {
  requireOrganization(organizationId);
  const validated = publicReferenceToolInputSchema.parse({ source_id: input.sourceId,
    page_start: input.pageStart, page_end: input.pageEnd });
  const sourceId = validated.source_id!;
  const firstPage = validated.page_start ?? 1;
  const lastPage = validated.page_end ?? firstPage;
  const executor = dependencies.executor ?? pool;
  const result = await executor.query(`SELECT s.id, s.source_type, s.title, s.sponsor, s.product, s.indication, s.phase,
      s.source_record_identifier, s.trial_registry_identifier, s.official_url, s.stored_artifact_ref,
      s.checksum, s.ingestion_status, s.extraction_status, s.metadata->'publicReference' AS public_reference,
      s.provenance->>'archiveMember' AS archive_member, s.extracted_text
    FROM cre_evidence_sources s
    WHERE s.organization_id IS NULL AND s.visibility_class = 'global_public'
      AND s.client_program_id IS NULL AND s.client_workspace_id IS NULL
      AND s.is_current = TRUE AND s.deleted_at IS NULL
      AND s.source_type IN ('csr','protocol','sap','fda_crl','fda_review_memo','fda_approval_package','trial_registry','publication')
      AND s.metadata->'publicReference'->>'schemaVersion' = '1'
      AND s.metadata->'publicReference'->>'evidenceRole' = 'external_reference'
      AND s.metadata->'publicReference'->'clientStudyEvidence' = 'false'::jsonb
      AND s.metadata->'publicReference'->'trainingApproved' = 'false'::jsonb
      AND s.id = $1`, [sourceId]);
  if (result.rows.length !== 1) throw new PublicReferenceReadError('SOURCE_UNAVAILABLE', 'Public reference source unavailable.');
  const row = result.rows[0] as SourceRow;
  const reference = referenceOf(row);
  if (!reference) throw new PublicReferenceReadError('SOURCE_MANIFEST_INVALID', 'Public reference identity is incomplete.');
  if (reference.permittedUse.retrieval !== 'allowed') {
    throw new PublicReferenceReadError('SOURCE_USE_NOT_ALLOWED', 'This source is cataloged, but its permitted-use review does not allow report-text retrieval.');
  }
  assertExtraction(row, reference);
  if (lastPage > reference.extraction.pageCount) throw new PublicReferenceReadError('PAGE_OUT_OF_RANGE', 'The requested page is outside this source.');
  await (dependencies.verifyOriginal ?? verifyPublicReferenceOriginal)(reference.retention);
  // Verification reads disk asynchronously; a source retired or changed during it
  // must not be returned under its earlier admission decision.
  const current = await executor.query(`SELECT s.id FROM cre_evidence_sources s
    WHERE s.organization_id IS NULL AND s.visibility_class = 'global_public'
      AND s.client_program_id IS NULL AND s.client_workspace_id IS NULL
      AND s.is_current = TRUE AND s.deleted_at IS NULL
      AND s.source_type IN ('csr','protocol','sap','fda_crl','fda_review_memo','fda_approval_package','trial_registry','publication')
      AND s.metadata->'publicReference'->>'schemaVersion' = '1'
      AND s.metadata->'publicReference'->>'evidenceRole' = 'external_reference'
      AND s.metadata->'publicReference'->'clientStudyEvidence' = 'false'::jsonb
      AND s.metadata->'publicReference'->'trainingApproved' = 'false'::jsonb
      AND s.id = $1 AND s.checksum = $2 AND s.stored_artifact_ref = $3
      AND s.extracted_text = $4 AND s.metadata->'publicReference' = $5::jsonb
      AND s.provenance->>'archiveMember' IS NOT DISTINCT FROM $6::text
      AND s.official_url = $7 AND s.source_type = $8
      AND s.ingestion_status = 'ingested' AND s.extraction_status = 'extracted'`,
  [sourceId, row.checksum, row.stored_artifact_ref, row.extracted_text, JSON.stringify(row.public_reference),
    row.archive_member, row.official_url, row.source_type]);
  if (current.rows.length !== 1) throw new PublicReferenceReadError('SOURCE_CHANGED', 'The public source changed during verification. No report text was returned.');
  const pages = pageWindow(row, reference.extraction, firstPage, lastPage);
  return { ...summary(row, reference), retentionStatus: 'original_verified', contentAccess: 'allowed',
    retainedArtifactRef: row.stored_artifact_ref, sourceSha256: reference.retention.sha256,
    textSha256: reference.extraction.textSha256, extractionStatus: 'extracted_unreviewed',
    requestedPages: { start: firstPage, end: lastPage }, pages,
    truncated: pages.some(page => page.truncated) || pages.length < lastPage - firstPage + 1,
    omittedPages: lastPage - firstPage + 1 - pages.length,
    note: 'External reference evidence. Extraction is unreviewed; verify the cited original page before relying on a clinical claim. These are not the client study results, and training is not approved.' };
}
