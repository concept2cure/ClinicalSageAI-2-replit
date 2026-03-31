import type { Request } from 'express';
import {
  type GenerationGuardResult,
  type GovernedDocumentActionContract,
  validateGovernedDocumentActionContract,
} from '../../../shared/types/document-contract';

export type GovernedMutationContext = {
  req: Request;
  projectId: number;
  artifactId: number | null;
  documentType: string;
  generationMode: GovernedDocumentActionContract['generationMode'];
  lifecycleStatus: GovernedDocumentActionContract['lifecycleStatus'];
  title: string;
  content: string;
  ctdSection?: string | null;
  sourceRefs?: string[];
  exportAllowed?: boolean;
  eventType: GovernedDocumentActionContract['auditEventPayload']['eventType'];
};

export function validateGovernedArtifactMutation(
  context: GovernedMutationContext
): GenerationGuardResult {
  const now = new Date().toISOString();
  const actorId = context.req.userId || context.req.userEmail || 'unknown';
  const traceId = context.req.body?.metadata?.traceId as string | undefined;

  const contract: GovernedDocumentActionContract = {
    projectId: context.projectId,
    artifactId: context.artifactId,
    documentType: context.documentType,
    originSurface: 'api_route',
    generationMode: context.generationMode,
    lifecycleStatus: context.lifecycleStatus,
    editorPayload: {
      title: context.title,
      content: context.content,
      ctdSection: context.ctdSection || undefined,
    },
    placementTarget: {
      workspace: 'project',
      containerId: String(context.projectId),
      sectionKey: context.ctdSection || undefined,
    },
    provenancePayload: {
      generatedAt: now,
      generatedBy: actorId,
      runId: traceId,
      sourceRefs: context.sourceRefs,
    },
    auditEventPayload: {
      eventType: context.eventType,
      actorId,
      actorRole: context.req.userRole || undefined,
      at: now,
    },
    exportEligibility: {
      allowed: context.exportAllowed ?? false,
      reason: context.exportAllowed ? 'Explicitly marked by workflow' : 'Default deny until lifecycle gates pass',
    },
  };

  return validateGovernedDocumentActionContract(contract);
}
