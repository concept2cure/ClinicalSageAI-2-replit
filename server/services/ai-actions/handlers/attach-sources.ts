/**
 * Attach Sources to Document Handler
 *
 * Links source references (citations, evidence, regulatory references)
 * to a document for provenance and traceability.
 *
 * Phase 1: Metadata-based source attachment on unified documents.
 * Phase 2: Wire into sentenceTraceabilityService for sentence-level linking.
 */

import { eq } from 'drizzle-orm';
import { unifiedDocuments } from '../../../../shared/schema/unified_workflow';
import { concept2cureArtifacts } from '../../../../shared/schema';
import { registerActionHandler } from '../action-registry';
import { fetchDocument, fetchArtifact } from '../shared-utils';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

interface SourceReference {
  sourceId: string;
  sourceType: 'trial_data' | 'regulatory_guidance' | 'literature' | 'internal_data' | 'file';
  title: string;
  url?: string;
  citation?: string;
  confidence?: number;
}

const handler: AIActionHandler = {
  actionType: 'attach_sources_to_document',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    if (!request.targetId) {
      errors.push({ code: 'MISSING_TARGET', message: 'targetId is required' });
    }
    if (!request.payload?.sources || !Array.isArray(request.payload.sources)) {
      errors.push({
        code: 'MISSING_SOURCES',
        message: 'payload.sources is required — array of source references',
      });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    const db = ctx.db as any;
    const sources = request.payload!.sources as SourceReference[];
    const targetId = request.targetId!;

    // Determine if target is artifact or document
    if (request.targetType === 'artifact') {
      return attachToArtifact(db, targetId, sources, request, ctx);
    }

    return attachToDocument(db, Number(targetId), sources, request, ctx);
  },
};

async function attachToDocument(
  db: any,
  documentId: number,
  sources: SourceReference[],
  request: AIActionRequest,
  ctx: AIActionExecutionContext
): Promise<AIActionResponse> {
  const doc = await fetchDocument(db, documentId, ctx.user.organizationId);

  const existingSources = ((doc.metadata as any)?.sources as SourceReference[]) || [];
  const mergedSources = deduplicateSources([...existingSources, ...sources]);

  await db
    .update(unifiedDocuments)
    .set({
      metadata: {
        ...(doc.metadata || {}),
        sources: mergedSources,
        lastSourcesUpdatedAt: new Date().toISOString(),
        lastSourcesUpdatedBy: ctx.user.userId,
      },
      updatedAt: new Date(),
    })
    .where(eq(unifiedDocuments.id, documentId));

  return {
    success: true,
    actionType: 'attach_sources_to_document',
    status: 'completed',
    result: {
      documentId,
      sourcesAttached: sources.length,
      totalSources: mergedSources.length,
      newSources: mergedSources.length - existingSources.length,
    },
    createdObjects: [],
    updatedObjects: [
      { type: 'document', id: documentId, title: doc.title, status: doc.status },
    ],
    warnings: [],
    errors: [],
    provenance: {
      actionId: ctx.actionId,
      timestamp: new Date().toISOString(),
      userId: ctx.user.userId,
      organizationId: ctx.user.organizationId,
      projectId: request.projectId,
      sourceSurface: request.sourceSurface,
    },
    nextSuggestedActions: [
      {
        actionType: 'run_validation',
        label: 'Validate citations',
        description: 'Run validation to verify source coverage',
        payload: { targetId: documentId, targetType: 'document' },
      },
    ],
  };
}

async function attachToArtifact(
  db: any,
  targetId: string | number,
  sources: SourceReference[],
  request: AIActionRequest,
  ctx: AIActionExecutionContext
): Promise<AIActionResponse> {
  const artifact = await fetchArtifact(db, targetId, ctx.user.organizationId);

  const existingSources = ((artifact.metadata as any)?.sources as SourceReference[]) || [];
  const mergedSources = deduplicateSources([...existingSources, ...sources]);

  await db
    .update(concept2cureArtifacts)
    .set({
      metadata: {
        ...(artifact.metadata as Record<string, unknown> || {}),
        sources: mergedSources,
        lastSourcesUpdatedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(concept2cureArtifacts.id, artifact.id));

  return {
    success: true,
    actionType: 'attach_sources_to_document',
    status: 'completed',
    result: {
      artifactId: artifact.id,
      sourcesAttached: sources.length,
      totalSources: mergedSources.length,
    },
    createdObjects: [],
    updatedObjects: [
      { type: 'artifact', id: artifact.id, title: artifact.title, status: artifact.status },
    ],
    warnings: [],
    errors: [],
    provenance: {
      actionId: ctx.actionId,
      timestamp: new Date().toISOString(),
      userId: ctx.user.userId,
      organizationId: ctx.user.organizationId,
      projectId: request.projectId,
      sourceSurface: request.sourceSurface,
    },
    nextSuggestedActions: [],
  };
}

function deduplicateSources(sources: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.sourceId || `${s.sourceType}:${s.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

registerActionHandler(handler);
