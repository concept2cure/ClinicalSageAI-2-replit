/**
 * AI Action Shared Utilities
 *
 * Common helpers used across multiple action handlers.
 * Eliminates duplication of artifact/document resolution, content fetching,
 * and ID normalization patterns.
 */

import { eq, and } from 'drizzle-orm';
import { concept2cureArtifacts } from '../../../shared/schema';
import { unifiedDocuments, workflowDocumentVersions } from '../../../shared/schema/unified_workflow';
import { AIActionHandlerError } from '../../../shared/types/ai-actions';

// ---------------------------------------------------------------------------
// ID Resolution
// ---------------------------------------------------------------------------

/**
 * Determine if a targetId is numeric (DB serial) or a string (external artifactId).
 */
export function isNumericId(targetId: string | number): boolean {
  return typeof targetId === 'number' || /^\d+$/.test(String(targetId));
}

/**
 * Build artifact WHERE clause with organization scoping.
 */
export function artifactWhereClause(targetId: string | number, organizationId: number) {
  return and(
    isNumericId(targetId)
      ? eq(concept2cureArtifacts.id, Number(targetId))
      : eq(concept2cureArtifacts.artifactId, String(targetId)),
    eq(concept2cureArtifacts.organizationId, organizationId)
  );
}

// ---------------------------------------------------------------------------
// Entity Fetching
// ---------------------------------------------------------------------------

/**
 * Fetch an artifact by ID or external artifactId, scoped to organization.
 * Throws AIActionHandlerError if not found.
 */
export async function fetchArtifact(
  db: any,
  targetId: string | number,
  organizationId: number,
  throwIfNotFound = true
): Promise<any | null> {
  // Try numeric ID first
  let results;
  if (isNumericId(targetId)) {
    results = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.id, Number(targetId)),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      )
      .limit(1);
  }

  // Fall back to external artifactId
  if (!results || results.length === 0) {
    results = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.artifactId, String(targetId)),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      )
      .limit(1);
  }

  const artifact = results?.[0] || null;
  if (!artifact && throwIfNotFound) {
    throw new AIActionHandlerError(
      'ARTIFACT_NOT_FOUND',
      `Artifact ${targetId} not found`,
      404
    );
  }
  return artifact;
}

/**
 * Fetch a unified document by ID, scoped to organization.
 * Throws AIActionHandlerError if not found.
 */
export async function fetchDocument(
  db: any,
  documentId: number,
  organizationId: number,
  throwIfNotFound = true
): Promise<any | null> {
  const [doc] = await db
    .select()
    .from(unifiedDocuments)
    .where(
      and(
        eq(unifiedDocuments.id, documentId),
        eq(unifiedDocuments.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!doc && throwIfNotFound) {
    throw new AIActionHandlerError(
      'DOCUMENT_NOT_FOUND',
      `Document ${documentId} not found`,
      404
    );
  }
  return doc || null;
}

// ---------------------------------------------------------------------------
// Content Fetching (for validation/refinement)
// ---------------------------------------------------------------------------

export interface FetchedContent {
  content: string;
  title: string;
  documentType: string | undefined;
}

/**
 * Fetch content from an artifact or document for validation/processing.
 * Supports inline content override via payload.content.
 */
export async function fetchContentForProcessing(
  db: any,
  targetType: string,
  targetId: string | number | null,
  organizationId: number,
  payload: Record<string, unknown>
): Promise<FetchedContent> {
  // Allow inline content override for ad-hoc operations
  if (payload.content && typeof payload.content === 'string') {
    return {
      content: payload.content,
      title: (payload.title as string) || 'Inline content',
      documentType: payload.documentType as string | undefined,
    };
  }

  if (!targetId) {
    throw new AIActionHandlerError('MISSING_TARGET', 'targetId required when payload.content not provided', 400);
  }

  if (targetType === 'artifact') {
    const artifact = await fetchArtifact(db, targetId, organizationId);
    return {
      content: artifact.content || '',
      title: artifact.title,
      documentType: (payload.documentType as string) || artifact.type,
    };
  }

  if (targetType === 'document') {
    const doc = await fetchDocument(db, Number(targetId), organizationId);
    // Document content may be in metadata.content or in the latest version
    let content = (doc.metadata as any)?.content || '';
    if (!content) {
      // Try fetching from latest version
      const [version] = await db
        .select()
        .from(workflowDocumentVersions)
        .where(
          and(
            eq(workflowDocumentVersions.documentId, doc.id),
            eq(workflowDocumentVersions.version, doc.latestVersion || 1)
          )
        )
        .limit(1);
      if (version?.content) {
        content = typeof version.content === 'string' ? version.content : JSON.stringify(version.content);
      }
    }
    return {
      content,
      title: doc.title,
      documentType: (payload.documentType as string) || doc.documentType,
    };
  }

  throw new AIActionHandlerError('INVALID_TARGET_TYPE', `Unsupported target type: ${targetType}`, 400);
}

// ---------------------------------------------------------------------------
// Enum Validation
// ---------------------------------------------------------------------------

const VALID_DOCUMENT_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived', 'rejected'];
const VALID_MODULE_TYPES = ['cmc', 'cer', 'study', 'ectd', '510k', 'vault'];
const VALID_ACTION_TYPES = [
  'create_document_from_artifact', 'promote_artifact', 'save_document_version',
  'run_validation', 'route_document_to_module', 'export_document',
  'attach_sources_to_document', 'refine_with_validation',
];
const VALID_SOURCE_SURFACES = [
  'global_panel', 'contextual_rail', 'inline_action', 'command_palette',
  'workflow_trigger', 'chat_action', 'api',
];

export function isValidDocumentStatus(status: string): boolean {
  return VALID_DOCUMENT_STATUSES.includes(status);
}

export function isValidModuleType(moduleType: string): boolean {
  return VALID_MODULE_TYPES.includes(moduleType);
}

export function isValidActionType(actionType: string): boolean {
  return VALID_ACTION_TYPES.includes(actionType);
}

export function isValidSourceSurface(surface: string): boolean {
  return VALID_SOURCE_SURFACES.includes(surface);
}

// ---------------------------------------------------------------------------
// Permission Checking
// ---------------------------------------------------------------------------

/** Action → required permission mapping. */
const ACTION_PERMISSIONS: Record<string, { resource: string; action: string; minRoles?: string[] }> = {
  'promote_artifact':             { resource: 'documents', action: 'create', minRoles: ['editor', 'admin'] },
  'create_document_from_artifact': { resource: 'documents', action: 'create', minRoles: ['editor', 'admin'] },
  'save_document_version':        { resource: 'documents', action: 'update', minRoles: ['editor', 'admin'] },
  'run_validation':               { resource: 'documents', action: 'read',   minRoles: ['viewer', 'editor', 'admin'] },
  'refine_with_validation':       { resource: 'documents', action: 'update', minRoles: ['editor', 'admin'] },
  'route_document_to_module':     { resource: 'documents', action: 'update', minRoles: ['editor', 'admin'] },
  'export_document':              { resource: 'documents', action: 'read',   minRoles: ['viewer', 'editor', 'admin'] },
  'attach_sources_to_document':   { resource: 'documents', action: 'update', minRoles: ['editor', 'admin'] },
};

/**
 * Check if a user's role is permitted to execute a given action type.
 * Returns null if permitted, or an error message if denied.
 */
export function checkActionPermission(actionType: string, userRole?: string): string | null {
  const perm = ACTION_PERMISSIONS[actionType];
  if (!perm) return null; // Unknown actions handled by the registry (UNKNOWN_ACTION)

  // Admin always allowed
  if (userRole === 'admin' || userRole === 'super_admin') return null;

  // Check role against allowed roles
  if (perm.minRoles && userRole && !perm.minRoles.includes(userRole)) {
    return `Role '${userRole}' is not permitted to execute '${actionType}'. Required: ${perm.minRoles.join(', ')}`;
  }

  return null;
}
