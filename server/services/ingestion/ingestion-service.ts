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

const logger = createScopedLogger('ingestion-service');

const CANONICAL_DOCUMENT_TABLE = 'coauthor_documents';
const PROMPTS_DIR = path.join(__dirname, '..', 'ai-gateway', 'prompts');

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
}

export interface ExtractionResult {
  structure: Array<{ level: number; heading: string }>;
  extractedClaims: Array<{ text: string; locator: string | null }>;
  referencedSources: string[];
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
  const systemPrompt = await loadPrompt('document-classify', 'v1.0');
  const userPayload = JSON.stringify({
    documentText: documentText.slice(0, 60000),
    fileName: doc.title,
    mimeType: 'text/html',
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
  const systemPrompt = await loadPrompt('document-extract', 'v1.0');
  const userPayload = JSON.stringify({
    documentText: documentText.slice(0, 60000),
    sectionCode,
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
  return result;
}

export default { classifyDocument, extractStructure, IngestionError };
