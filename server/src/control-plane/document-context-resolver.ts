/**
 * Document Context Resolver
 *
 * Resolves the governed context for any document/artifact mutation.
 * Takes raw request parameters and enriches them into a complete GovernedDocumentContext.
 *
 * This is the entry point for the governed document decision fabric.
 * Every governed mutation must resolve its context before evaluation.
 */

import { randomUUID } from 'crypto';

// Import from shared types - the canonical vocabulary
import type {
  GovernedDocumentContext,
  GovernedMutationIntent,
} from '../../../shared/types/governed-document-fabric';

export const DOCUMENT_CONTEXT_RESOLVER_VERSION = '1.0.0';

/**
 * Raw input for context resolution - what callers provide
 */
export interface ContextResolutionInput {
  // Required
  organizationId: string;
  projectId: string;
  actorId: string;
  intendedAction: GovernedMutationIntent;

  // Optional enrichment
  artifactId?: string;
  artifactVersionId?: string;
  documentType?: string;
  regulatorBody?: string;
  submissionType?: string;
  ctdSection?: string;
  moduleCode?: string;
  sectionCode?: string;
  dossierId?: string;
  clientTrack?: string;
  workspaceTarget?: string;
  originSurface?: string;
  currentLifecycleStatus?: string;
  currentPlacement?: string;
  intendedPlacementTarget?: string;
  actorRole?: string;
}

/**
 * Result of context resolution
 */
export interface ContextResolutionResult {
  resolved: boolean;
  context: GovernedDocumentContext;
  missingFields: string[];
  warnings: string[];
}

/**
 * Fields required for each mutation intent
 */
const REQUIRED_FIELDS_BY_INTENT: Record<GovernedMutationIntent, string[]> = {
  create: ['organizationId', 'projectId', 'actorId', 'documentType'],
  update: ['organizationId', 'projectId', 'actorId', 'artifactId'],
  place: ['organizationId', 'projectId', 'actorId', 'artifactId', 'intendedPlacementTarget'],
  relocate: ['organizationId', 'projectId', 'actorId', 'artifactId', 'currentPlacement', 'intendedPlacementTarget'],
  promote: ['organizationId', 'projectId', 'actorId', 'artifactId'],
  approve: ['organizationId', 'projectId', 'actorId', 'artifactId', 'currentLifecycleStatus'],
  lock: ['organizationId', 'projectId', 'actorId', 'artifactId', 'currentLifecycleStatus'],
  export: ['organizationId', 'projectId', 'actorId', 'artifactId'],
  publish: ['organizationId', 'projectId', 'actorId', 'artifactId'],
  dispatch: ['organizationId', 'projectId', 'actorId'],
  archive: ['organizationId', 'projectId', 'actorId', 'artifactId'],
  rollback: ['organizationId', 'projectId', 'actorId', 'artifactId', 'artifactVersionId'],
  compile: ['organizationId', 'projectId', 'actorId'],
  refresh: ['organizationId', 'projectId', 'actorId', 'artifactId'],
};

/**
 * Resolve governed document context from raw input.
 * Validates required fields based on intended action.
 * Returns structured context with missing field warnings.
 */
export function resolveDocumentContext(input: ContextResolutionInput): ContextResolutionResult {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  // Determine required fields for this intent
  const requiredFields = REQUIRED_FIELDS_BY_INTENT[input.intendedAction] || ['organizationId', 'projectId', 'actorId'];

  // Check for missing required fields
  const missingFields: string[] = [];
  for (const field of requiredFields) {
    const value = (input as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === '') {
      missingFields.push(field);
    }
  }

  // Generate warnings for useful-but-missing optional fields
  const warnings: string[] = [];
  if (!input.regulatorBody) {
    warnings.push('No regulator body specified — regulatory context binding will be incomplete');
  }
  if (!input.submissionType && ['export', 'publish', 'dispatch'].includes(input.intendedAction)) {
    warnings.push('No submission type specified for export/publish/dispatch — gating may be restrictive');
  }
  if (!input.ctdSection && ['place', 'relocate', 'export'].includes(input.intendedAction)) {
    warnings.push('No CTD section specified — placement authority will require resolution');
  }

  const context: GovernedDocumentContext = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    artifactId: input.artifactId,
    artifactVersionId: input.artifactVersionId,
    documentType: input.documentType,
    regulatorBody: input.regulatorBody,
    submissionType: input.submissionType,
    ctdSection: input.ctdSection,
    moduleCode: input.moduleCode,
    sectionCode: input.sectionCode,
    dossierId: input.dossierId,
    clientTrack: input.clientTrack,
    workspaceTarget: input.workspaceTarget,
    originSurface: input.originSurface,
    currentLifecycleStatus: input.currentLifecycleStatus,
    currentPlacement: input.currentPlacement,
    intendedAction: input.intendedAction,
    intendedPlacementTarget: input.intendedPlacementTarget,
    actorId: input.actorId,
    actorRole: input.actorRole,
    requestId,
    timestamp,
  };

  return {
    resolved: missingFields.length === 0,
    context,
    missingFields,
    warnings,
  };
}

/**
 * Check if context has sufficient regulatory binding for gating decisions
 */
export function hasRegulatoryBinding(context: GovernedDocumentContext): boolean {
  return Boolean(context.regulatorBody && context.submissionType);
}

/**
 * Check if context has placement information
 */
export function hasPlacementContext(context: GovernedDocumentContext): boolean {
  return Boolean(context.ctdSection || context.currentPlacement || context.intendedPlacementTarget);
}

/**
 * Check if context has sufficient artifact identity
 */
export function hasArtifactIdentity(context: GovernedDocumentContext): boolean {
  return Boolean(context.artifactId);
}
