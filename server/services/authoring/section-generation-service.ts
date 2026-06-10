/**
 * Authoring — section generation (spec §6.3)
 *
 * Drafts a CTD summary/overview section from source evidence via the AI gateway,
 * STREAMING tokens to the caller, and persists the result as a governed draft
 * artifact (a coauthor_documents row) — never loose chat text. RAG-grounded:
 * the prompt requires a citation per claim and surfaces ungrounded points rather
 * than inventing them.
 *
 * Tenant-scoped from the caller's organizationId; the AI call is audited.
 *
 * @module server/services/authoring/section-generation-service
 */

import { promises as fs } from 'fs';
import path from 'path';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { submissions, coauthorDocuments } from '../../../shared/schema';
import { getGateway } from '../ai-gateway';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('section-generation-service');
const PROMPTS_DIR = path.join(__dirname, '..', 'ai-gateway', 'prompts');

export class AuthoringError extends Error {
  constructor(public code: 'NOT_FOUND' | 'PROVIDER_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'AuthoringError';
  }
}

export interface GenerateSectionParams {
  submissionId: number;
  sectionCode: string;
  evidence: Array<{ id: string; source: string; text: string }>;
  productContext?: string;
}

export interface GenerateSectionResult {
  documentId: number;
  sectionCode: string;
  body: string;
  citations: Array<{ claim: string; evidenceId: string }>;
  ungrounded: string[];
}

let prompt: string | null = null;
async function loadPrompt(): Promise<string> {
  if (prompt) return prompt;
  prompt = await fs.readFile(path.join(PROMPTS_DIR, 'section-generation', 'v1.0.md'), 'utf8');
  return prompt;
}

/** Split the streamed content into the markdown body and the trailing JSON. */
function splitBodyAndTrailer(content: string): { body: string; citations: GenerateSectionResult['citations']; ungrounded: string[] } {
  const fence = content.lastIndexOf('```json');
  if (fence === -1) return { body: content.trim(), citations: [], ungrounded: [] };
  const body = content.slice(0, fence).trim();
  const json = content.slice(fence).replace(/^```json/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(json);
    return {
      body,
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      ungrounded: Array.isArray(parsed.ungrounded) ? parsed.ungrounded : [],
    };
  } catch {
    return { body: content.trim(), citations: [], ungrounded: [] };
  }
}

/**
 * Generate a section draft. `onChunk` receives streamed text as it arrives; the
 * persisted governed draft and citations are returned when complete.
 */
export async function generateSection(
  params: GenerateSectionParams,
  ctx: { organizationId: number; userId: number },
  onChunk?: (text: string) => void
): Promise<GenerateSectionResult> {
  const [submission] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.id, params.submissionId), eq(submissions.organizationId, ctx.organizationId), isNull(submissions.deletedAt)))
    .limit(1);
  if (!submission) throw new AuthoringError('NOT_FOUND', 'Submission not found for this organization.');

  const systemPrompt = await loadPrompt();
  let content: string;
  try {
    const response = await getGateway().route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ sectionCode: params.sectionCode, evidence: params.evidence, productContext: params.productContext }) },
      ],
      temperature: 0.3,
      maxTokens: 8000,
      promptVersion: 'section-generation@v1.0',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      callerModule: 'section-generation-service',
      metadata: { task: 'section-generation', submissionId: params.submissionId, sectionCode: params.sectionCode },
      stream: Boolean(onChunk),
      onStream: onChunk ? (chunk, meta) => { if (!meta || meta.type === 'text') onChunk(chunk); } : undefined,
    });
    content = response.content;
  } catch (err) {
    throw new AuthoringError('PROVIDER_UNAVAILABLE', `The AI request could not be completed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { body, citations, ungrounded } = splitBodyAndTrailer(content);

  // Persist as a governed draft artifact (never loose chat text).
  const [doc] = await db
    .insert(coauthorDocuments)
    .values({
      organizationId: ctx.organizationId,
      title: `${params.sectionCode} draft`,
      content: body,
      status: 'draft',
      createdBy: String(ctx.userId),
      moduleNumber: params.sectionCode,
      metadata: { authoring: { promptVersion: 'section-generation@v1.0', citations, ungrounded, submissionId: params.submissionId } },
    })
    .returning({ id: coauthorDocuments.id });

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'AI_GENERATE',
    resourceType: 'document',
    resourceId: doc.id,
    details: { task: 'section-generation', promptVersion: 'section-generation@v1.0', submissionId: params.submissionId, sectionCode: params.sectionCode, citations: citations.length, ungrounded: ungrounded.length },
  });

  logger.info('Generated section draft', { documentId: doc.id, sectionCode: params.sectionCode, organizationId: ctx.organizationId });
  return { documentId: doc.id, sectionCode: params.sectionCode, body, citations, ungrounded };
}

export default { generateSection, AuthoringError };
