/**
 * Ingestion Service (Phase 1, WO-1.4)
 *
 * Turns an uploaded document into structured submission intelligence:
 *   - classifyDocument:  document -> CTD leaf proposal (document-classify task)
 *   - extractStructure:  document -> structure + claims + sources, seeding
 *                        evidence_links (document-extract task)
 *
 * RECONCILE (RECONCILE.md, WO-1.0):
 *   - The canonical document table is `coauthor_documents` (integer PK, public,
 *     eCTD-aware). Documents are referenced from leaves/evidence POLYMORPHICALLY
 *     (documentTable + documentId), so all rows here set documentTable to
 *     'coauthor_documents'.
 *   - All LLM access goes through the AI gateway (`getGateway().route`). There is
 *     no `aiGateway.generate({task})`; we tag the logical task via promptVersion
 *     + metadata and load the versioned prompt template from disk. No prompt
 *     text is inlined here.
 *   - Audit is `auditService.logAction(...)` (default export), action
 *     'AI_GENERATE', per the iron audit rule.
 *
 * TENANT ISOLATION: every read filters by the caller's organizationId (resolved
 * from the authenticated session by the route, never from the request body).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db';
import {
  coauthorDocuments,
  submissions,
  submissionLeaves,
  ectdSequences,
  submissionEvidenceLinks,
} from '../../../shared/schema';
import { getGateway } from '../ai-gateway';
import {
  GatewayPolicyError,
  GatewayNoProviderError,
  GatewayAllProvidersFailedError,
} from '../ai-gateway/gateway';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { PROMPTS_DIR } from '../ai-gateway/prompts-dir';

const logger = createScopedLogger('ingestion-service');

const CANONICAL_DOCUMENT_TABLE = 'coauthor_documents';

// ── Standardized error surface (never leak raw provider errors) ───────────────

export type IngestionErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_AI_RESPONSE'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TOKEN_LIMIT_EXCEEDED';

export class IngestionError extends Error {
  constructor(
    public code: IngestionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

// ── Result shapes (mirror the prompt templates' JSON schemas) ─────────────────

export interface ClassificationResult {
  sectionCode: string | null;
  ctdModule: number | null;
  granularity: string | null;
  documentType: string | null;
  confidence: number;
  rationale: string;
  /** How much of the document the answer is actually based on. */
  readCoverage?: DocumentReadCoverage;
}

export interface ExtractionResult {
  structure: Array<{ level: number; heading: string }>;
  extractedClaims: Array<{ text: string; locator: string | null }>;
  referencedSources: string[];
  /** How much of the document the answer is actually based on. */
  readCoverage?: DocumentReadCoverage;
}

// ── How much of the document was actually read ───────────────────────────────

/**
 * The most text one ingestion request sends to the model.
 *
 * This was an inline `slice(0, 60000)` at two call sites and nothing said it
 * had happened. A 400-page submission document was classified, and had its
 * structure and claims extracted, from roughly its first fifteen pages — and
 * the result came back indistinguishable from one drawn from the whole file.
 * A section that appears only after the bound is not absent from the document;
 * it is absent from what was read, and a regulated ingestion pipeline may not
 * blur those two.
 */
export const MAX_INGESTION_DOCUMENT_CHARS = 60_000;

/**
 * How far back from the bound a sentence or paragraph boundary is worth
 * looking for. Beyond this the boundary search would cost more of the budget
 * than a clean cut is worth, so the hard bound wins.
 */
const BOUNDARY_SEARCH_WINDOW = 2_000;

export interface DocumentReadCoverage {
  /** Characters actually sent to the model. */
  charsRead: number;
  /** Characters the document has. */
  totalChars: number;
  /** True when charsRead < totalChars. */
  truncated: boolean;
  /** charsRead / totalChars as a whole percentage. 100 when nothing was cut. */
  percentRead: number;
}

export interface BoundedDocumentText extends DocumentReadCoverage {
  /** The prefix to send. Never longer than MAX_INGESTION_DOCUMENT_CHARS. */
  text: string;
}

/**
 * Bound a document to what one request can carry, and report what that cost.
 *
 * The cut prefers the last paragraph break, then the last sentence end, within
 * BOUNDARY_SEARCH_WINDOW of the bound: handing the model a sentence that stops
 * mid-clause and asking it to classify the document is a worse input than one
 * ending cleanly, and costs at most a few hundred characters of a 60,000
 * character budget. It never returns more than the bound.
 *
 * The figures are computed HERE, from the text, and are never taken from the
 * model — a coverage number a model reports about its own reading is not
 * evidence of anything.
 */
export function boundDocumentText(documentText: string): BoundedDocumentText {
  const source = typeof documentText === 'string' ? documentText : '';
  const totalChars = source.length;
  if (totalChars <= MAX_INGESTION_DOCUMENT_CHARS) {
    return { text: source, charsRead: totalChars, totalChars, truncated: false, percentRead: 100 };
  }

  const hard = source.slice(0, MAX_INGESTION_DOCUMENT_CHARS);
  const floor = MAX_INGESTION_DOCUMENT_CHARS - BOUNDARY_SEARCH_WINDOW;
  let cut = MAX_INGESTION_DOCUMENT_CHARS;

  const paragraph = hard.lastIndexOf('\n\n');
  if (paragraph >= floor) {
    cut = paragraph;
  } else {
    // The last sentence terminator followed by whitespace — so "Fig. 2" and
    // "0.05" are not mistaken for sentence ends.
    const sentence = /[.!?]["')\]]?\s/g;
    let last = -1;
    for (let m = sentence.exec(hard); m !== null; m = sentence.exec(hard)) {
      last = m.index + m[0].length;
    }
    if (last >= floor) cut = last;
  }

  const text = source.slice(0, cut);
  const charsRead = text.length;
  return {
    text,
    charsRead,
    totalChars,
    truncated: true,
    // Floored: a document 99.6% read must not round to "100%".
    percentRead: Math.floor((charsRead / totalChars) * 100),
  };
}

/** The sentence a caller shows when only part of a document was read. */
export function describeReadCoverage(c: DocumentReadCoverage): string | null {
  if (!c.truncated) return null;
  const n = (v: number) => v.toLocaleString('en-US');
  return (
    `Only the first ${n(c.charsRead)} of ${n(c.totalChars)} characters (${c.percentRead}%) ` +
    'were read. Anything later in the document was not seen, so an item missing ' +
    'from this result may simply be past that point.'
  );
}

// ── Prompt loading (versioned templates on disk; cached) ──────────────────────

const promptCache = new Map<string, string>();

async function loadPrompt(task: string, version: string): Promise<string> {
  const key = `${task}@${version}`;
  const cached = promptCache.get(key);
  if (cached) return cached;
  const file = path.join(PROMPTS_DIR, task, `${version}.md`);
  const content = await fs.readFile(file, 'utf8');
  promptCache.set(key, content);
  return content;
}

// ── Gateway error mapping ─────────────────────────────────────────────────────

function mapGatewayError(err: unknown): IngestionError {
  if (err instanceof GatewayNoProviderError) {
    return new IngestionError('PROVIDER_UNAVAILABLE', 'No AI provider is available to handle this request.');
  }
  if (err instanceof GatewayPolicyError) {
    return new IngestionError('PROVIDER_UNAVAILABLE', 'This request was blocked by AI gateway policy.');
  }
  if (err instanceof GatewayAllProvidersFailedError) {
    const msg = err.message || '';
    if (/429|rate.?limit/i.test(msg)) {
      return new IngestionError('RATE_LIMITED', 'The AI provider is rate limiting requests. Try again shortly.');
    }
    if (/token|context length|max.?tokens/i.test(msg)) {
      return new IngestionError('TOKEN_LIMIT_EXCEEDED', 'The document is too large for a single AI request.');
    }
    return new IngestionError('PROVIDER_UNAVAILABLE', 'The AI provider is temporarily unavailable.');
  }
  if (err instanceof IngestionError) return err;
  return new IngestionError('PROVIDER_UNAVAILABLE', 'The AI request could not be completed.');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Load a coauthor document, enforcing tenant ownership. Throws on miss. */
async function loadOwnedDocument(documentId: number, organizationId: number) {
  const [doc] = await db
    .select()
    .from(coauthorDocuments)
    .where(
      and(
        eq(coauthorDocuments.id, documentId),
        eq(coauthorDocuments.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!doc) {
    throw new IngestionError('NOT_FOUND', 'Document not found for this organization.');
  }
  return doc;
}

function parseJsonResponse<T>(raw: string): T {
  // Tolerate accidental code fences while still requiring valid JSON.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new IngestionError('INVALID_AI_RESPONSE', 'The AI response was not valid JSON.');
  }
}

// ── classifyDocument ──────────────────────────────────────────────────────────

export async function classifyDocument(params: {
  documentId: number;
  userId: number;
  organizationId: number;
  sequenceId?: number;
}): Promise<ClassificationResult> {
  const { documentId, userId, organizationId, sequenceId } = params;

  const doc = await loadOwnedDocument(documentId, organizationId);

  const documentText = stripHtml(doc.content) || doc.title;
  // Bounded, and the bound is REPORTED (see boundDocumentText): a
  // classification drawn from the first fifteen pages of a 400-page document
  // must not be returned looking like one drawn from all of it.
  const bounded = boundDocumentText(documentText);
  const systemPrompt = await loadPrompt('document-classify', 'v1.0');
  const userPayload = JSON.stringify({
    documentText: bounded.text,
    fileName: doc.title,
    mimeType: 'text/html',
    // The model is told too, so it does not describe a partial read as though
    // it had seen the whole file.
    ...(bounded.truncated
      ? { documentTextTruncated: true, documentTextCoverage: describeReadCoverage(bounded) }
      : {}),
  });

  let result: ClassificationResult;
  try {
    const response = await getGateway().route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 1024,
      promptVersion: 'document-classify@v1.0',
      organizationId,
      userId,
      callerModule: 'ingestion-service',
      metadata: { task: 'document-classify', documentId },
    });
    result = parseJsonResponse<ClassificationResult>(response.content);
  } catch (err) {
    throw mapGatewayError(err);
  }

  // Persist the proposal onto the document (sectionCode -> moduleNumber, full
  // proposal into metadata) — only adopt a section code we are confident in.
  const existingMeta = (doc.metadata as Record<string, unknown> | null) ?? {};
  const adoptSection = Boolean(result.sectionCode) && result.confidence >= 0.5;
  await db
    .update(coauthorDocuments)
    .set({
      metadata: { ...existingMeta, classification: result },
      updatedAt: new Date(),
      ...(adoptSection ? { moduleNumber: result.sectionCode as string } : {}),
    })
    .where(
      and(
        eq(coauthorDocuments.id, documentId),
        eq(coauthorDocuments.organizationId, organizationId)
      )
    );

  // When a target sequence is supplied (and owned), draft a leaf placement.
  if (sequenceId && result.sectionCode) {
    const [seq] = await db
      .select()
      .from(ectdSequences)
      .where(
        and(
          eq(ectdSequences.id, sequenceId),
          eq(ectdSequences.organizationId, organizationId),
          isNull(ectdSequences.deletedAt)
        )
      )
      .limit(1);
    if (seq) {
      await db.insert(submissionLeaves).values({
        sequenceId,
        sectionCode: result.sectionCode,
        title: doc.title,
        granularity: result.granularity ?? null,
        lifecycleOp: 'new',
        documentTable: CANONICAL_DOCUMENT_TABLE,
        documentId,
        documentType: result.documentType ?? null,
        organizationId,
        createdBy: userId,
      });
    }
  }

  await auditService.logAction({
    organizationId,
    userId,
    action: 'AI_GENERATE',
    resourceType: 'document',
    resourceId: documentId,
    details: {
      task: 'document-classify',
      promptVersion: 'document-classify@v1.0',
      sectionCode: result.sectionCode,
      confidence: result.confidence,
      sequenceId: sequenceId ?? null,
    },
  });

  logger.info('Classified document', { documentId, organizationId, sectionCode: result.sectionCode });
  // Computed here, from the text — never taken from the model. A coverage
  // figure a model reports about its own reading is not evidence of anything.
  result.readCoverage = {
    charsRead: bounded.charsRead,
    totalChars: bounded.totalChars,
    truncated: bounded.truncated,
    percentRead: bounded.percentRead,
  };
  return result;
}

// ── extractStructure ──────────────────────────────────────────────────────────

export async function extractStructure(params: {
  documentId: number;
  sectionCode: string;
  submissionId: number;
  userId: number;
  organizationId: number;
}): Promise<ExtractionResult> {
  const { documentId, sectionCode, submissionId, userId, organizationId } = params;

  const doc = await loadOwnedDocument(documentId, organizationId);

  // Provenance links require a submission context — verify tenant ownership.
  const [submission] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.organizationId, organizationId),
        isNull(submissions.deletedAt)
      )
    )
    .limit(1);
  if (!submission) {
    throw new IngestionError('NOT_FOUND', 'Submission not found for this organization.');
  }

  const documentText = stripHtml(doc.content) || doc.title;
  // Same bound, same reporting. A heading or a claim that appears only after
  // it is missing from what was READ, which is not the same fact as missing
  // from the document — and only one of them is this result's to state.
  const bounded = boundDocumentText(documentText);
  const systemPrompt = await loadPrompt('document-extract', 'v1.0');
  const userPayload = JSON.stringify({
    documentText: bounded.text,
    sectionCode,
    ...(bounded.truncated
      ? { documentTextTruncated: true, documentTextCoverage: describeReadCoverage(bounded) }
      : {}),
  });

  let result: ExtractionResult;
  try {
    const response = await getGateway().route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 4096,
      promptVersion: 'document-extract@v1.0',
      organizationId,
      userId,
      callerModule: 'ingestion-service',
      metadata: { task: 'document-extract', documentId, submissionId },
    });
    result = parseJsonResponse<ExtractionResult>(response.content);
  } catch (err) {
    throw mapGatewayError(err);
  }

  const claims = Array.isArray(result.extractedClaims) ? result.extractedClaims : [];

  // Persist the extraction onto the document metadata.
  const existingMeta = (doc.metadata as Record<string, unknown> | null) ?? {};
  await db
    .update(coauthorDocuments)
    .set({
      metadata: { ...existingMeta, extraction: { ...result, sectionCode } },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coauthorDocuments.id, documentId),
        eq(coauthorDocuments.organizationId, organizationId)
      )
    );

  // Seed a provenance edge: the target section derives_from this source document.
  // confidence = fraction of extracted claims that carry a locator (a coarse
  // grounding signal), null when there are no claims.
  const located = claims.filter(c => c && c.locator).length;
  const confidence = claims.length > 0 ? located / claims.length : null;
  await db.insert(submissionEvidenceLinks).values({
    submissionId,
    targetSectionCode: sectionCode,
    sourceDocumentTable: CANONICAL_DOCUMENT_TABLE,
    sourceDocumentId: documentId,
    sourceLocator: `${claims.length} claim(s), ${result.referencedSources?.length ?? 0} source(s)`,
    direction: 'derives_from',
    confidence,
    organizationId,
    createdBy: userId,
  });

  await auditService.logAction({
    organizationId,
    userId,
    action: 'AI_GENERATE',
    resourceType: 'document',
    resourceId: documentId,
    details: {
      task: 'document-extract',
      promptVersion: 'document-extract@v1.0',
      submissionId,
      sectionCode,
      claimCount: claims.length,
      sourceCount: result.referencedSources?.length ?? 0,
    },
  });

  logger.info('Extracted document structure', { documentId, organizationId, submissionId, claims: claims.length });
  // Computed here, from the text — never taken from the model. A coverage
  // figure a model reports about its own reading is not evidence of anything.
  result.readCoverage = {
    charsRead: bounded.charsRead,
    totalChars: bounded.totalChars,
    truncated: bounded.truncated,
    percentRead: bounded.percentRead,
  };
  return result;
}

export default { classifyDocument, extractStructure, IngestionError };
