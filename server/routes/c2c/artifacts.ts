/**
 * Artifacts for Concept2Cure projects — the governed document artifacts and
 * everything that hangs off one: versions, placement, signatures, snapshots,
 * provenance, the audit/compliance report and its export, status and lock
 * transitions, integrity verification, rollback, review comments, reviewer
 * assignment and review decisions, and the vault registration. The sixth
 * domain carved out of routes/concept2cure.ts (ledger L53, slice 8), mounted
 * at the same prefix ahead of it with the same middleware chain; the
 * handlers moved verbatim with the helpers only they use (the provenance
 * emitter, the signature hash, the two schemas, the artifact reader).
 *
 * @module server/routes/c2c/artifacts
 */

import { Router, type Request, type Response } from 'express';
import { concept2cureArtifactVersions, concept2cureArtifacts, concept2cureConversations, concept2cureNotifications, concept2cureProvenanceEvents, concept2cureReviewAssignments, concept2cureReviewComments, concept2cureReviewDecisions, concept2cureSignatures, concept2cureSubmissionSnapshots, organizationUsers, projects, users } from '../../../shared/schema';
import { type GovernedDocumentActionContract } from '../../../shared/types/document-contract';
import { db, pool } from '../../db';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import { queryableFromDrizzle } from '../../db/drizzle-queryable';
import { guardDemoContent, guardEmptyContent } from '../../middleware/documentLoopGuards';
import { cacheResponse } from '../../middleware/enterprise-performance';
import { enforceAuthorLineage } from '../../services/clinical-regulatory-evidence/lineage-gate';
import { resolveGovernedContext } from '../../services/concept2cure/governedDocumentContractService';
import { createTraceId, emitTraceEvent } from '../../services/generation-guard.js';
import { interceptArtifactChange, interceptFeedback } from '../../services/intelligence/rim-interceptors.js';
import { evaluateAndInterceptGovernedDocument } from '../../src/control-plane/governed-document-evaluator';
import * as crypto from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  type Artifact,
  calculateContentHash,
  concept2cureRateLimiter,
  getClientIp,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  logConcept2cureError,
  paramStr,
  sanitizeContent,
  sanitizeObject,
  sendError,
  sendSuccess,
  verifyIntegrityChain,
} from './shared';
import { verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-artifacts');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

/* ── Helpers this domain owns ─────────────────────────────────────────────── */

function calculateSignatureHash(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Emit a provenance event for an artifact.
 * Append-only — events are never modified or deleted.
 */
async function emitProvenanceEvent(params: {
  artifactDbId: number;
  artifactVersionId?: number;
  organizationId: number;
  eventType: string;
  eventAction: string;
  actorId?: number;
  actorName?: string;
  actorEmail?: string;
  details?: Record<string, unknown>;
  sourceArtifactId?: number;
  sourceDescription?: string;
  backendRoute?: string;
  backendService?: string;
  ipAddress?: string;
}) {
  try {
    const eventId = `prov_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureProvenanceEvents).values({
      eventId,
      artifactId: params.artifactDbId,
      artifactVersionId: params.artifactVersionId || null,
      organizationId: params.organizationId,
      eventType: params.eventType,
      eventAction: params.eventAction,
      actorId: params.actorId || null,
      actorName: params.actorName || null,
      actorEmail: params.actorEmail || null,
      details: params.details || {},
      sourceArtifactId: params.sourceArtifactId || null,
      sourceDescription: params.sourceDescription || null,
      backendRoute: params.backendRoute || null,
      backendService: params.backendService || null,
      ipAddress: params.ipAddress || null,
    });
    return eventId;
  } catch (err: any) {
    logger.warn('Failed to emit provenance event', { error: err.message, ...params });
    return null;
  }
}

const createArtifactSchema = z.object({
  conversationId: z.string().optional(),
  type: z.string().min(1).max(50),
  category: z.enum(['document', 'interactive', 'visualization', 'source', 'evidence']),
  title: z.string().min(1, 'Title required').max(200),
  content: z.string().min(1, 'Content must not be empty').max(1000000, 'Content too large'), // 1MB max, no empty
  templateId: z.string().min(1).max(200).optional(),
  ctdSection: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
  clientTrack: z.enum(['biotech', 'device', 'diagnostics']).optional(),
  submissionProgram: z.enum(['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr', 'general_ri']).optional(),
  persona: z
    .enum(['regulatory', 'medical_writer', 'cmc', 'clinical', 'qa', 'executive', 'cro'])
    .optional(),
  regulatorScope: z.enum(['fda', 'ema', 'mhra', 'hc', 'pmda', 'multi']).optional(),
  evidenceMode: z
    .enum(['csr', 'literature', 'predicate', 'cmc_source', 'test_data', 'mixed'])
    .optional(),
  documentClass: z
    .enum([
      'strategy_memo',
      'evidence_memo',
      'section_draft',
      'module3_output',
      'submission_component',
      'audit_report',
      'comparator_summary',
      'risk_benefit',
      'protocol_rationale',
      'regional_differences',
      'safety_evidence_brief',
      'endpoint_justification',
    ])
    .optional(),
  readinessGate: z
    .enum(['exploratory', 'internal_review', 'submission_candidate', 'inspection_ready'])
    .optional(),
  approvalPathType: z
    .enum(['single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required'])
    .optional(),
  recommendationSource: z
    .enum([
      'ana_ri',
      'cmc_builder',
      'cerv2_510k',
      'cerv2_pma',
      'cerv2_cer',
      'ectd_compiler',
      'ind_autodraft',
      'report_engine',
    ])
    .optional(),
  originSurface: z
    .enum([
      'ri_copilot',
      'ectd_coauthor',
      'ind_workspace',
      'cmc_workspace',
      'cerv2_device',
      'editor_panel',
      'api_route',
      'import_pipeline',
      'system',
      'project_workspace_shell',
      'ai_orchestrator',
    ])
    .optional(),
  workspaceTarget: z.enum(['project', 'dossier', 'vault']).optional(),
  dossierContainerId: z.string().optional(),
  artifactContainerId: z.string().optional(),
  regulatorIntent: z
    .enum([
      'submission_authoring',
      'evidence_analysis',
      'strategy',
      'comparison',
      'qa_review',
      'inspection_support',
    ])
    .optional(),
});

const createSignatureSchema = z.object({
  signatureType: z.string().min(1).max(50).optional(),
  signaturePurpose: z.string().min(1).max(500),
  signatureMeaning: z.string().max(500).optional(),
  authenticationMethod: z.string().min(1).max(50),
  secondFactorVerified: z.boolean().optional(),
  signatureManifest: z.record(z.any()).optional(),
  version: z.number().int().min(1).optional(),
});

async function getArtifactsFromDb(projectId: number, organizationId: number): Promise<Artifact[]> {
  const dbArtifacts = await db
    .select()
    .from(concept2cureArtifacts)
    .where(
      and(
        eq(concept2cureArtifacts.projectId, projectId),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    )
    .orderBy(desc(concept2cureArtifacts.updatedAt));

  if (dbArtifacts.length === 0) {
    return [];
  }

  const artifactIds = dbArtifacts.map(art => art.id);
  const dbVersions = await db
    .select({
      artifactId: concept2cureArtifactVersions.artifactId,
      version: concept2cureArtifactVersions.version,
      content: concept2cureArtifactVersions.content,
      createdAt: concept2cureArtifactVersions.createdAt,
    })
    .from(concept2cureArtifactVersions)
    .where(inArray(concept2cureArtifactVersions.artifactId, artifactIds))
    .orderBy(concept2cureArtifactVersions.version);

  const versionsByArtifactId = new Map<
    number,
    { version: number; content: string; createdAt: Date }[]
  >();
  for (const version of dbVersions) {
    const list = versionsByArtifactId.get(version.artifactId) || [];
    list.push({
      version: version.version,
      content: version.content,
      createdAt: version.createdAt,
    });
    versionsByArtifactId.set(version.artifactId, list);
  }

  return dbArtifacts.map(art => ({
    id: art.artifactId,
    projectId: `proj_${art.projectId}`,
    conversationId: art.conversationId?.toString(),
    type: art.type,
    category: art.category as Artifact['category'],
    title: art.title,
    content: art.content,
    version: art.version,
    versions: versionsByArtifactId.get(art.id) || [],
    metadata: art.metadata as Record<string, unknown>,
    status: art.status || 'draft',
    ctdSection: art.ctdSection,
    templateId: art.templateId,
    contentHash: art.contentHash,
    approvedVersionId: art.approvedVersionId,
    publishedVersionId: art.publishedVersionId,
    publishedAt: art.publishedAt,
    lockedAt: art.lockedAt,
    createdAt: art.createdAt,
    updatedAt: art.updatedAt,
  }));
}


/**
 * GET /api/concept2cure/artifacts
 * Returns all artifacts across all projects for the organization (gallery view).
 * Includes project name for display in the cross-project artifacts gallery.
 */
router.get(
  '/artifacts',
  // Organization prefix comes from cacheResponse; see /projects above.
  cacheResponse({ ttl: 60_000, keyGenerator: () => 'artifacts' }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);

      const allArtifacts = await db
        .select({
          artifactId: concept2cureArtifacts.artifactId,
          projectId: concept2cureArtifacts.projectId,
          type: concept2cureArtifacts.type,
          category: concept2cureArtifacts.category,
          title: concept2cureArtifacts.title,
          status: concept2cureArtifacts.status,
          ctdSection: concept2cureArtifacts.ctdSection,
          version: concept2cureArtifacts.version,
          createdAt: concept2cureArtifacts.createdAt,
          updatedAt: concept2cureArtifacts.updatedAt,
          projectName: projects.name,
        })
        .from(concept2cureArtifacts)
        .leftJoin(projects, eq(concept2cureArtifacts.projectId, projects.id))
        .where(eq(concept2cureArtifacts.organizationId, organizationId))
        .orderBy(desc(concept2cureArtifacts.updatedAt))
        .limit(200);

      const result = allArtifacts.map(a => ({
        id: a.artifactId,
        projectId: `proj_${a.projectId}`,
        title: a.title,
        type: a.type,
        category: a.category,
        status: a.status || 'draft',
        ctdSection: a.ctdSection,
        version: a.version,
        projectName: a.projectName || 'Unknown Project',
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }));

      return sendSuccess(res, result);
    } catch (error: any) {
      logger.error('Failed to fetch all artifacts', { error: error.message });
      return sendError(res, 500, 'Failed to fetch artifacts');
    }
  }
);

/**
 * GET /api/concept2cure/projects/all/artifacts-summary
 * Returns artifact count summary across all projects for the organization.
 */
router.get('/projects/all/artifacts-summary', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const allArtifacts = await db
      .select({
        status: concept2cureArtifacts.status,
      })
      .from(concept2cureArtifacts)
      .where(eq(concept2cureArtifacts.organizationId, organizationId));

    const total = allArtifacts.length;
    const draft = allArtifacts.filter(a => a.status === 'draft').length;
    const review = allArtifacts.filter(a => a.status === 'review').length;
    const approved = allArtifacts.filter(
      a => a.status === 'approved' || a.status === 'locked'
    ).length;

    return sendSuccess(res, { total, draft, review, approved });
  } catch (error: any) {
    logger.error('Failed to fetch artifacts summary', { error: error.message });
    return sendError(res, 500, 'Failed to fetch artifacts summary');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/artifacts
 * List all artifacts for a project (database-backed).
 */
router.get('/projects/:projectId/artifacts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const numericProjectId = parseIntegerProjectId(req.params.projectId);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess || numericProjectId === null) {
      return sendError(res, 404, 'Project not found');
    }

    const artifacts = await getArtifactsFromDb(numericProjectId, organizationId);
    return sendSuccess(res, artifacts);
  } catch (error: any) {
    logger.error('Failed to fetch artifacts', { error: error.message });
    return sendError(res, 500, 'Failed to fetch artifacts');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/artifacts
 * Create a new artifact (database-backed with version control).
 */
router.post(
  '/projects/:projectId/artifacts',
  guardEmptyContent,
  guardDemoContent,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const numericProjectId = parseIntegerProjectId(req.params.projectId);

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess || numericProjectId === null) {
        return sendError(res, 404, 'Project not found');
      }

      const data = createArtifactSchema.parse(req.body);

      // Sanitize content
      const sanitizedContent = sanitizeContent(data.content);
      const sanitizedTitle = sanitizeContent(data.title);
      const sourceArtifactIds = Array.isArray(data.metadata?.sourceArtifactIds)
        ? [
            ...new Set(
              data.metadata.sourceArtifactIds.filter(
                (id): id is string => typeof id === 'string' && id.trim().length > 0
              )
            ),
          ]
        : [];
      const sourceArtifacts = sourceArtifactIds.length
        ? await db
            .select({
              artifactId: concept2cureArtifacts.artifactId,
              title: concept2cureArtifacts.title,
            })
            .from(concept2cureArtifacts)
            .where(
              and(
                eq(concept2cureArtifacts.organizationId, organizationId),
                eq(concept2cureArtifacts.projectId, numericProjectId),
                inArray(concept2cureArtifacts.artifactId, sourceArtifactIds)
              )
            )
        : [];
      if (sourceArtifacts.length !== sourceArtifactIds.length) {
        const foundIds = new Set(sourceArtifacts.map(source => source.artifactId));
        return sendError(
          res,
          400,
          'One or more source evidence artifacts were not found in this project',
          { missingSourceArtifactIds: sourceArtifactIds.filter(id => !foundIds.has(id)) },
          'SOURCE_EVIDENCE_NOT_FOUND'
        );
      }
      // Persist the VALIDATED deduped citation list, never the raw caller
      // array. The artifacts-center listing renders json_array_length over
      // metadata.sourceArtifactIds as "N cited sources"; storing the raw
      // array would let ['a','a','',42] (with only 'a' existing) surface as
      // 4 cited sources — fabricated governance metadata.
      const metadataWithValidatedSources = data.metadata
        ? {
            ...data.metadata,
            ...('sourceArtifactIds' in data.metadata ? { sourceArtifactIds } : {}),
          }
        : undefined;
      const governedResolution = resolveGovernedContext({
        req,
        projectId: numericProjectId,
        artifactId: null,
        documentType: data.type,
        generationMode: data.metadata?.generationMethod === 'ai' ? 'ai_generated' : 'manual',
        lifecycleStatus: 'draft',
        originSurface: data.originSurface,
        clientTrack: data.clientTrack,
        submissionProgram: data.submissionProgram,
        persona: data.persona,
        regulatorScope: data.regulatorScope,
        evidenceMode: data.evidenceMode,
        documentClass: data.documentClass,
        readinessGate: data.readinessGate,
        approvalPathType: data.approvalPathType,
        recommendationSource: data.recommendationSource,
        workspaceTarget: data.workspaceTarget,
        dossierContainerId: data.dossierContainerId,
        artifactContainerId: data.artifactContainerId,
        regulatorIntent: data.regulatorIntent,
        placementContainerId:
          (data.metadata?.containerId as string | undefined) ||
          data.dossierContainerId ||
          data.artifactContainerId,
        provider: (data.metadata?.provider as string | undefined) || undefined,
        model: (data.metadata?.model as string | undefined) || undefined,
        title: sanitizedTitle,
        content: sanitizedContent,
        ctdSection: data.ctdSection || null,
        sourceRefs: Array.isArray(data.metadata?.sourceRefs)
          ? (data.metadata?.sourceRefs as string[])
          : undefined,
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!governedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: governedResolution.validation.errors,
            warnings: governedResolution.validation.warnings,
            resolved: governedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const contentHash = calculateContentHash(sanitizedContent);
      const artifactId = `artifact_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Find conversation DB ID if provided
      let conversationDbId: number | null = null;
      if (data.conversationId) {
        const [conv] = await db
          .select({ id: concept2cureConversations.id })
          .from(concept2cureConversations)
          .where(
            and(
              eq(concept2cureConversations.conversationId, data.conversationId),
              eq(concept2cureConversations.organizationId, organizationId)
            )
          )
          .limit(1);
        if (conv) conversationDbId = conv.id;
      }

      // Insert artifact into database
      const ctdSection =
        data.ctdSection ||
        ((data.metadata as Record<string, unknown>)?.ctdSection as string | undefined);
      const [newDbArtifact] = await db
        .insert(concept2cureArtifacts)
        .values({
          organizationId,
          projectId: numericProjectId,
          conversationId: conversationDbId,
          artifactId,
          type: data.type,
          category: data.category,
          title: sanitizedTitle,
          content: sanitizedContent,
          contentHash,
          version: 1,
          templateId: data.templateId || null,
          metadata: {
            // The validated variant, not raw data.metadata: the persisted row
            // is what the artifacts-center listing counts citations from.
            ...(metadataWithValidatedSources || {}),
            harness: {
              clientTrack: governedResolution.contract.clientTrack,
              submissionProgram: governedResolution.contract.submissionProgram,
              persona: governedResolution.contract.persona,
              regulatorScope: governedResolution.contract.regulatorScope,
              documentClass: governedResolution.contract.documentClass,
              readinessGate: governedResolution.contract.readinessGate,
              workspaceTarget: governedResolution.contract.workspaceTarget,
              originSurface: governedResolution.contract.originSurface,
              recommendationSource: governedResolution.contract.recommendationSource,
              regulatorIntent: governedResolution.contract.regulatorIntent,
              gateChecks: governedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: governedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: governedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          ctdSection: data.ctdSection || null,
          createdById: userId,
          ...(ctdSection ? { ctdSection } : {}),
        })
        .returning();

      // Insert first version
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: newDbArtifact.id,
        version: 1,
        content: sanitizedContent,
        contentHash,
        createdById: userId,
      });

      const newArtifact: Artifact = {
        id: artifactId,
        projectId: paramStr(req.params.projectId),
        conversationId: data.conversationId,
        type: data.type,
        category: data.category,
        title: sanitizedTitle,
        content: sanitizedContent,
        ctdSection: data.ctdSection || null,
        version: 1,
        versions: [{ version: 1, content: sanitizedContent, createdAt: newDbArtifact.createdAt }],
        metadata: metadataWithValidatedSources,
        createdAt: newDbArtifact.createdAt,
        updatedAt: newDbArtifact.updatedAt,
      };

      // Log audit entry with content hash
      await logAuditEntry(req, 'CREATE', 'artifact', artifactId, null, {
        projectId: paramStr(req.params.projectId),
        type: newArtifact.type,
        title: newArtifact.title,
        templateId: data.templateId || null,
        contentLength: sanitizedContent.length,
        contentHash,
      });

      // Emit provenance: document creation event
      await emitProvenanceEvent({
        artifactDbId: newDbArtifact.id,
        organizationId,
        eventType: 'generation',
        eventAction: data.metadata?.generationMethod === 'ai' ? 'ai_generate' : 'human_create',
        actorId: userId,
        actorName: (req as any).userName || req.userEmail,
        actorEmail: req.userEmail,
        details: {
          title: sanitizedTitle,
          type: data.type,
          category: data.category,
          templateId: data.templateId || null,
          contentLength: sanitizedContent.length,
          contentHash,
          ctdSection: ctdSection || null,
          conversationId: data.conversationId || null,
          sourceArtifactIds,
        },
        sourceDescription: data.conversationId
          ? `Created from conversation ${data.conversationId}`
          : 'Manual document creation',
        backendRoute: 'POST /api/concept2cure/projects/:projectId/artifacts',
        backendService: 'concept2cure',
        ipAddress: getClientIp(req),
      });

      // RIM: capture artifact creation signal (non-blocking)
      interceptArtifactChange({
        organizationId,
        projectId: parseInt(paramStr(req.params.projectId), 10),
        userId,
        artifactId,
        artifactVersionId: newDbArtifact.id?.toString(),
        sectionCode: ctdSection || undefined,
        changeType: 'create',
        title: sanitizedTitle,
        contentLength: sanitizedContent.length,
        source: data.metadata?.generationMethod === 'ai' ? 'lumen_cortex' : 'manual',
        content: sanitizedContent,
      });

      // Data Lineage: record source→artifact lineage (non-blocking)
      try {
        const { recordLineage } = await import('../../services/data-lineage-service');
        if (data.conversationId) {
          recordLineage({
            organizationId,
            projectId: numericProjectId,
            sourceObjectType: 'conversation',
            sourceObjectId: data.conversationId,
            sourceTitle: `Conversation ${data.conversationId}`,
            targetObjectType: 'artifact',
            targetObjectId: artifactId,
            targetTitle: sanitizedTitle,
            targetField: ctdSection || undefined,
            linkageType:
              data.metadata?.generationMethod === 'ai' ? 'generated_from' : 'derived_from',
            transformationType:
              data.metadata?.generationMethod === 'ai' ? 'ai_generation' : 'manual_edit',
            createdById: userId,
            metadata: { contentHash, version: 1 },
          }).catch((err: unknown) => {
            logger.warn('Failed to record artifact lineage (conversation -> artifact)', {
              artifactId,
              conversationId: data.conversationId,
              err: err instanceof Error ? err.message : String(err),
            });
          });
        }
        for (const source of sourceArtifacts) {
          recordLineage({
            organizationId,
            projectId: numericProjectId,
            sourceObjectType: 'artifact',
            sourceObjectId: source.artifactId,
            sourceTitle: source.title,
            targetObjectType: 'artifact',
            targetObjectId: artifactId,
            targetTitle: sanitizedTitle,
            targetField: ctdSection || undefined,
            linkageType: 'cited_by',
            transformationType: 'manual_reference',
            createdById: userId,
            metadata: { contentHash, version: 1 },
          }).catch((err: unknown) => {
            logger.warn('Failed to record artifact lineage (evidence artifact -> draft artifact)', {
              artifactId,
              sourceArtifactId: source.artifactId,
              err: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } catch {
        /* non-blocking */
      }

      // Emit generation trace: artifact_created
      const traceId =
        ((data.metadata as Record<string, unknown>)?.traceId as string) || createTraceId();
      emitTraceEvent({
        traceId,
        timestamp: new Date().toISOString(),
        event: 'artifact_created',
        sourceSystem:
          ((data.metadata as Record<string, unknown>)?.sourceSystem as any) || 'document_builder',
        projectId: numericProjectId,
        artifactId,
        userId,
        metadata: {
          documentType: data.type,
          ctdSection: ctdSection || null,
          contentLength: sanitizedContent.length,
          generationMethod:
            (data.metadata as Record<string, unknown>)?.generationMethod || 'unknown',
        },
      });

      // ── AUTO-EMBED: Insert into lumen_data_atoms + generate embedding ────
      // All artifacts become searchable evidence for AI source traceability
      try {
        const plainText = sanitizedContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (plainText.length > 40) {
          const atomResult = await pool.query(
            `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'artifact', $2, $3, $4, $5, $6, 0.85, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
            [
              organizationId,
              artifactId,
              data.category === 'source' ? 'source_document' : 'authored_document',
              sanitizedTitle,
              plainText.substring(0, 16000),
              `{${data.category},${data.type}${ctdSection ? `,${ctdSection}` : ''}}`,
            ]
          );
          if (atomResult.rows.length > 0) {
            const atomId = atomResult.rows[0].id;
            const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
            const embeddingService = getEmbeddingService(pool);
            await embeddingService.embedAtom(atomId);
          }
        }
      } catch (embedErr: any) {
        // Non-fatal �� artifact created successfully, embedding can be retried
        logger.warn('Auto-embedding failed for new artifact', {
          artifactId,
          error: embedErr.message,
        });
      }

      logger.info('Created artifact', { projectId: req.params.projectId, artifactId });
      return sendSuccess(res.status(201), newArtifact);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
      }
      logConcept2cureError('create artifact', error, { projectId: req.params.projectId });
      return sendError(res, 500, 'Failed to create artifact');
    }
  }
);

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId
 * Update an artifact (creates new version for 21 CFR Part 11 compliance - database-backed).
 */
router.put('/projects/:projectId/artifacts/:artifactId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    const { content, title, ctdSection } = req.body;

    // Find artifact in database
    const [dbArtifact] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!dbArtifact) {
      return sendError(res, 404, 'Artifact not found');
    }

    // P1: Lock Enforcement — locked documents cannot be edited
    if (dbArtifact.status === 'locked') {
      return sendError(
        res,
        423,
        'Document is locked. Change status to draft or review before editing.'
      );
    }

    // P6: Optimistic Concurrency — reject stale writes
    const { expectedVersion } = req.body;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      if (Number(expectedVersion) !== dbArtifact.version) {
        return res.status(409).json({
          success: false,
          error: {
            message: 'Conflict: document was modified by another user',
            code: 'VERSION_CONFLICT',
            details: {
              clientVersion: Number(expectedVersion),
              serverVersion: dbArtifact.version,
            },
          },
        });
      }
    }

    // Capture previous state for audit trail
    const previousState = {
      content: dbArtifact.content,
      title: dbArtifact.title,
      version: dbArtifact.version,
      contentHash: dbArtifact.contentHash,
    };

    // Sanitize inputs
    const sanitizedContent = content ? sanitizeContent(content) : null;
    const sanitizedTitle = title ? sanitizeContent(title) : null;

    let newVersion = dbArtifact.version;
    let newContent = dbArtifact.content;
    let newContentHash = dbArtifact.contentHash;
    let newTitle = dbArtifact.title;

    // Create new version if content changed (21 CFR Part 11 version control)
    if (sanitizedContent && sanitizedContent !== dbArtifact.content) {
      newVersion = dbArtifact.version + 1;
      newContent = sanitizedContent;
      newContentHash = calculateContentHash(sanitizedContent);

      // The version row is written inside the transaction below, beside the
      // content it records and the lineage that attributes it (ledger L160).
    }

    if (sanitizedTitle) {
      newTitle = sanitizedTitle;
    }

    // Update ctdSection if provided
    const newCtdSection = ctdSection !== undefined ? ctdSection : dbArtifact.ctdSection;

    const updateGovernedResolution = resolveGovernedContext({
      req,
      projectId: dbArtifact.projectId,
      artifactId: dbArtifact.id,
      documentType: dbArtifact.type,
      generationMode: 'amendment',
      lifecycleStatus:
        (dbArtifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
      title: newTitle || dbArtifact.title,
      content: newContent || dbArtifact.content || '',
      ctdSection: newCtdSection,
      sourceRefs: [`artifact:${dbArtifact.artifactId}`],
      exportAllowed: ['approved', 'locked', 'published'].includes(String(dbArtifact.status || '')),
      eventType: 'artifact.updated',
    });
    if (!updateGovernedResolution.validation.valid) {
      return sendError(
        res,
        400,
        'Governed document contract validation failed',
        {
          errors: updateGovernedResolution.validation.errors,
          warnings: updateGovernedResolution.validation.warnings,
          resolved: updateGovernedResolution.resolved,
        },
        'GOVERNED_CONTRACT_INVALID'
      );
    }

    const existingMetadata =
      dbArtifact.metadata && typeof dbArtifact.metadata === 'object'
        ? (dbArtifact.metadata as Record<string, unknown>)
        : {};
    const existingHarness =
      existingMetadata.harness && typeof existingMetadata.harness === 'object'
        ? (existingMetadata.harness as Record<string, unknown>)
        : {};

    /* Version row, content and lineage commit together or not at all (ledger
       L160). The version row used to be inserted before the governed-contract
       validation, so a rejected edit left an orphan version behind; and the
       edited text carried no lineage at all. */
    const contentChanged = newVersion > dbArtifact.version;
    const updatedArtifact = await db.transaction(async (tx) => {
      if (contentChanged) {
        await tx.insert(concept2cureArtifactVersions).values({
          organizationId,
          artifactId: dbArtifact.id,
          version: newVersion,
          content: newContent ?? '',
          // Recomputed rather than trusted: the hash column is NOT NULL and
          // the running value is typed nullable outside the branch that set it.
          contentHash: newContentHash ?? calculateContentHash(newContent ?? ''),
          createdById: userId,
        });
      }
      const [row] = await tx
        .update(concept2cureArtifacts)
      .set({
        title: newTitle,
        content: newContent,
        contentHash: newContentHash,
        version: newVersion,
        ctdSection: newCtdSection,
        metadata: {
          ...existingMetadata,
          harness: {
            ...existingHarness,
            clientTrack: updateGovernedResolution.contract.clientTrack,
            submissionProgram: updateGovernedResolution.contract.submissionProgram,
            persona: updateGovernedResolution.contract.persona,
            regulatorScope: updateGovernedResolution.contract.regulatorScope,
            documentClass: updateGovernedResolution.contract.documentClass,
            readinessGate: updateGovernedResolution.contract.readinessGate,
            workspaceTarget: updateGovernedResolution.contract.workspaceTarget,
            originSurface: updateGovernedResolution.contract.originSurface,
            recommendationSource: updateGovernedResolution.contract.recommendationSource,
            regulatorIntent: updateGovernedResolution.contract.regulatorIntent,
            gateChecks: updateGovernedResolution.contract.exportEligibility.gateChecks,
            blockingReasons: updateGovernedResolution.contract.exportEligibility.blockingReasons,
            readinessOutcome: updateGovernedResolution.contract.exportEligibility.readinessOutcome,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(concept2cureArtifacts.id, dbArtifact.id))
      .returning();
      if (contentChanged) {
        /* Every clause of the edited text is the editing person's assertion;
           a gap rolls the edit back. A title-only edit touches no prose. */
        const client = queryableFromDrizzle(tx);
        await enforceAuthorLineage(
          client,
          organizationId,
          { documentTable: 'concept2cure_artifacts', documentId: String(dbArtifact.id) },
          newContent ?? '',
          String(userId),
        );
      }
      return row;
    });

    // Get all versions for response
    const versions = await db
      .select()
      .from(concept2cureArtifactVersions)
      .where(eq(concept2cureArtifactVersions.artifactId, dbArtifact.id))
      .orderBy(concept2cureArtifactVersions.version);

    const artifact: Artifact = {
      id: updatedArtifact.artifactId,
      projectId: paramStr(req.params.projectId),
      conversationId: dbArtifact.conversationId?.toString(),
      type: updatedArtifact.type,
      category: updatedArtifact.category as Artifact['category'],
      title: updatedArtifact.title,
      content: updatedArtifact.content,
      ctdSection: updatedArtifact.ctdSection || null,
      version: updatedArtifact.version,
      versions: versions.map(v => ({
        version: v.version,
        content: v.content,
        createdAt: v.createdAt,
      })),
      metadata: updatedArtifact.metadata as Record<string, unknown>,
      status: updatedArtifact.status || 'draft',
      createdAt: updatedArtifact.createdAt,
      updatedAt: updatedArtifact.updatedAt,
    };

    // Log audit entry
    await logAuditEntry(req, 'UPDATE', 'artifact', req.params.artifactId, previousState, {
      content: artifact.content,
      title: artifact.title,
      version: artifact.version,
      contentHash: newContentHash,
    });

    // Emit provenance: edit event
    if (newVersion > dbArtifact.version) {
      await emitProvenanceEvent({
        artifactDbId: dbArtifact.id,
        organizationId,
        eventType: 'edit',
        eventAction: 'human_edit',
        actorId: userId,
        actorName: (req as any).userName || req.userEmail,
        actorEmail: req.userEmail,
        details: {
          fromVersion: dbArtifact.version,
          toVersion: newVersion,
          previousHash: dbArtifact.contentHash,
          newHash: newContentHash,
          titleChanged: sanitizedTitle ? sanitizedTitle !== dbArtifact.title : false,
          contentChanged: true,
        },
        sourceDescription: `Updated from v${dbArtifact.version} to v${newVersion}`,
        backendRoute: 'PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId',
        backendService: 'concept2cure',
        ipAddress: getClientIp(req),
      });
    }

    // RIM: capture artifact update signal (non-blocking)
    interceptArtifactChange({
      organizationId,
      projectId: parseInt(paramStr(req.params.projectId), 10),
      userId,
      artifactId: paramStr(req.params.artifactId),
      artifactVersionId: dbArtifact.id?.toString(),
      sectionCode: newCtdSection || undefined,
      changeType: 'update',
      title: newTitle,
      contentLength: newContent?.length ?? 0,
      source: 'manual',
      content: sanitizedContent || undefined,
    });

    // ── RE-EMBED on content change for Data Room searchability ────────
    if (newVersion > dbArtifact.version && sanitizedContent) {
      try {
        const plainText = sanitizedContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (plainText.length > 40) {
          const atomResult = await pool.query(
            `UPDATE lumen_data_atoms
             SET content = $1, title = $2, updated_at = NOW()
             WHERE source_type = 'artifact' AND source_id = $3
             RETURNING id`,
            [plainText.substring(0, 16000), newTitle, updatedArtifact.artifactId]
          );
          if (atomResult.rows.length > 0) {
            const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
            const embeddingService = getEmbeddingService(pool);
            await embeddingService.embedAtom(atomResult.rows[0].id, true);
          }
        }
      } catch (embedErr: any) {
        logger.warn('Re-embedding failed on update (non-fatal)', { error: embedErr.message });
      }
    }

    logger.info('Updated artifact', {
      artifactId: paramStr(req.params.artifactId),
      version: artifact.version,
    });
    return sendSuccess(res, artifact);
  } catch (error: any) {
    logConcept2cureError('update artifact', error, { artifactId: req.params.artifactId });
    return sendError(res, 500, 'Failed to update artifact');
  }
});

/**
 * POST /api/concept2cure/vault/register-artifact
 * Register an artifact in the vault for governed document management.
 */
router.post('/vault/register-artifact', async (req: Request, res: Response) => {
  try {
    getOrganizationId(req); // tenant context required; the read below is not org-keyed
    const { artifactId, projectId, title, ctdSection, documentType } = req.body;

    if (!artifactId || !title) {
      return sendError(res, 400, 'artifactId and title are required');
    }

    // Log the vault registration for audit trail
    await logAuditEntry(req, 'CREATE', 'vault_registration', artifactId, null, {
      projectId,
      title,
      ctdSection,
      documentType,
      registeredFrom: 'concept2cure_copilot',
    });

    logger.info('Registered artifact in vault', { artifactId, projectId, ctdSection });
    return sendSuccess(res, { registered: true, artifactId, ctdSection });
  } catch (error: any) {
    logger.error('Failed to register artifact in vault', { error: error.message });
    return sendError(res, 500, 'Failed to register artifact in vault');
  }
});

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/placement
 * Governed placement / relocation of an artifact within the CTD hierarchy.
 * Records a provenance event for the audit trail.
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/placement',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);

      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const { operation, toSection, reason } = req.body;

      // Validate required fields
      if (!operation || !toSection || !reason) {
        return sendError(res, 400, 'Missing required fields: operation, toSection, reason');
      }
      if (!['reclassify', 'place', 'relocate'].includes(operation)) {
        return sendError(res, 400, 'Invalid operation. Must be: reclassify, place, or relocate');
      }
      if (typeof reason !== 'string' || reason.trim().length < 5) {
        return sendError(res, 400, 'Reason must be at least 5 characters');
      }
      if (typeof toSection !== 'string' || !/^[\dA-Z]+(\.[\dA-Z]+)*$/i.test(toSection)) {
        return sendError(res, 400, 'Invalid CTD section format (expected e.g. 3.2.S.1)');
      }

      // Find the artifact
      const [dbArtifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!dbArtifact) {
        return sendError(res, 404, 'Artifact not found');
      }

      // Server-side placement enforcement — authoritative lock guard.
      // Client gates via ModeCapabilities.canRelocate; this is the server backup.
      if (dbArtifact.status === 'locked') {
        return sendError(res, 423, 'Document is locked. Unlock before changing placement.');
      }

      const previousSection = dbArtifact.ctdSection || null;

      const placementGovernedResolution = resolveGovernedContext({
        req,
        projectId: dbArtifact.projectId,
        artifactId: dbArtifact.id,
        documentType: dbArtifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (dbArtifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        title: dbArtifact.title,
        content: dbArtifact.content || '',
        ctdSection: toSection,
        sourceRefs: [`artifact:${dbArtifact.artifactId}`],
        exportAllowed: ['approved', 'locked', 'published'].includes(
          String(dbArtifact.status || '')
        ),
        eventType: 'artifact.updated',
      });
      if (!placementGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: placementGovernedResolution.validation.errors,
            warnings: placementGovernedResolution.validation.warnings,
            resolved: placementGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const existingMetadata =
        dbArtifact.metadata && typeof dbArtifact.metadata === 'object'
          ? (dbArtifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};

      // Update ctdSection on the artifact
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          ctdSection: toSection,
          updatedAt: new Date(),
          metadata: {
            ...existingMetadata,
            harness: {
              ...existingHarness,
              clientTrack: placementGovernedResolution.contract.clientTrack,
              submissionProgram: placementGovernedResolution.contract.submissionProgram,
              persona: placementGovernedResolution.contract.persona,
              regulatorScope: placementGovernedResolution.contract.regulatorScope,
              documentClass: placementGovernedResolution.contract.documentClass,
              readinessGate: placementGovernedResolution.contract.readinessGate,
              workspaceTarget: placementGovernedResolution.contract.workspaceTarget,
              originSurface: placementGovernedResolution.contract.originSurface,
              recommendationSource: placementGovernedResolution.contract.recommendationSource,
              regulatorIntent: placementGovernedResolution.contract.regulatorIntent,
              gateChecks: placementGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons:
                placementGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome:
                placementGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(eq(concept2cureArtifacts.id, dbArtifact.id))
        .returning();

      // Log audit entry
      await logAuditEntry(
        req,
        'UPDATE',
        'artifact',
        req.params.artifactId,
        { ctdSection: previousSection },
        { ctdSection: toSection, operation, reason }
      );

      // Emit provenance event for the placement operation
      await emitProvenanceEvent({
        artifactDbId: dbArtifact.id,
        organizationId,
        eventType: 'placement',
        eventAction: operation,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail,
        actorEmail: req.userEmail,
        details: {
          operation,
          fromSection: previousSection,
          toSection,
          reason: reason.trim(),
          title: dbArtifact.title,
        },
        sourceDescription: `${operation}: ${
          previousSection || '(unassigned)'
        } → ${toSection} — ${reason.trim()}`,
        backendRoute: 'PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/placement',
        backendService: 'concept2cure',
        ipAddress: getClientIp(req),
      });

      logger.info('Artifact placement updated', {
        artifactId: paramStr(req.params.artifactId),
        operation,
        from: previousSection,
        to: toSection,
      });

      // === Governed Document Decision Fabric evaluation ===
      let governedFabric;
      try {
        const fabricResult = evaluateAndInterceptGovernedDocument({
          context: {
            organizationId: String(organizationId),
            projectId: String(dbArtifact.projectId),
            actorId: String(userId),
            intendedAction: operation === 'relocate' ? 'relocate' : 'place',
            artifactId: dbArtifact.artifactId,
            documentType: dbArtifact.type || undefined,
            ctdSection: toSection,
            currentPlacement: previousSection || undefined,
            intendedPlacementTarget: toSection,
            originSurface: 'concept2cure',
            currentLifecycleStatus: dbArtifact.status || 'draft',
          },
          documentState: {
            hasContent: Boolean(dbArtifact.content),
            hasEvidence: false,
            hasBeenReviewed: dbArtifact.status === 'review' || dbArtifact.status === 'approved',
            hasApproval: dbArtifact.status === 'approved' || dbArtifact.status === 'locked',
            hasPlacement: Boolean(toSection),
            placementValid: true,
            hasProvenance: true,
            unresolvedContradictionCount: 0,
            criticalContradictionCount: 0,
          },
        });
        governedFabric = {
          decisionId: fabricResult.decisionReference.decisionId,
          outcome: fabricResult.decisionReference.outcome,
          readiness: fabricResult.evaluation.readiness.level,
          readinessScore: fabricResult.evaluation.readiness.score,
          placementOutcome: fabricResult.evaluation.placement.outcome,
          blockerCount: fabricResult.evaluation.decision.blockerCount,
          warningCount: fabricResult.evaluation.decision.warningCount,
          consequenceCount: fabricResult.evaluation.decision.consequenceCount,
        };
      } catch {
        governedFabric = { outcome: 'degraded', error: 'Fabric evaluation unavailable' };
      }

      return sendSuccess(res, {
        id: updated.artifactId,
        ctdSection: updated.ctdSection,
        operation,
        previousSection,
        governedFabric,
      });
    } catch (error: any) {
      logConcept2cureError('artifact placement', error, {
        artifactId: paramStr(req.params.artifactId),
      });
      return sendError(res, 500, 'Failed to update placement');
    }
  }
);


/**
 * GET /api/concept2cure/projects/:projectId/dossier-metrics
 * Returns per-CTD-section aggregation: artifact counts, status breakdown,
 * completion percentage, template coverage, and evidence linkage.
 * Computed from real artifact + provenance data only. No synthetic rollups.
 */
router.get(
  '/projects/:projectId/dossier-metrics',
  cacheResponse({
    ttl: 90_000,
    // Organization prefix comes from cacheResponse; see /projects above.
    keyGenerator: req => `dossier-metrics:${req.params.projectId}`,
  }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      // Get project DB id
      const projectDbIdStr = paramStr(req.params.projectId);
      const projectDbId = parseInt(projectDbIdStr, 10);
      if (isNaN(projectDbId)) {
        return sendError(res, 400, 'Invalid project ID');
      }

      // Fetch all artifacts for project
      const allArtifacts = await db
        .select({
          id: concept2cureArtifacts.id,
          artifactId: concept2cureArtifacts.artifactId,
          ctdSection: concept2cureArtifacts.ctdSection,
          status: concept2cureArtifacts.status,
          templateId: concept2cureArtifacts.templateId,
          type: concept2cureArtifacts.type,
        })
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.projectId, projectDbId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        );

      // Fetch provenance events related to evidence (source_input events)
      const artifactIds = allArtifacts.map(a => a.id);
      let evidenceEvents: { artifactId: number; eventType: string; eventAction: string }[] = [];
      if (artifactIds.length > 0) {
        evidenceEvents = await db
          .select({
            artifactId: concept2cureProvenanceEvents.artifactId,
            eventType: concept2cureProvenanceEvents.eventType,
            eventAction: concept2cureProvenanceEvents.eventAction,
          })
          .from(concept2cureProvenanceEvents)
          .where(
            and(
              inArray(concept2cureProvenanceEvents.artifactId, artifactIds),
              eq(concept2cureProvenanceEvents.organizationId, organizationId)
            )
          );
      }

      // Build per-artifact evidence map
      const artifactEvidenceMap = new Map<number, { sourceInputs: number; generations: number }>();
      for (const ev of evidenceEvents) {
        const entry = artifactEvidenceMap.get(ev.artifactId) || { sourceInputs: 0, generations: 0 };
        if (ev.eventType === 'source_input') entry.sourceInputs++;
        if (ev.eventType === 'generation') entry.generations++;
        artifactEvidenceMap.set(ev.artifactId, entry);
      }

      // Aggregate per CTD section
      const sectionMetrics: Record<
        string,
        {
          artifactCount: number;
          draftCount: number;
          reviewCount: number;
          approvedCount: number;
          lockedCount: number;
          templateCoverageAvailable: boolean;
          evidenceCount: number;
          precedentCount: number;
        }
      > = {};

      for (const art of allArtifacts) {
        const section = art.ctdSection || '_unplaced';
        if (!sectionMetrics[section]) {
          sectionMetrics[section] = {
            artifactCount: 0,
            draftCount: 0,
            reviewCount: 0,
            approvedCount: 0,
            lockedCount: 0,
            templateCoverageAvailable: false,
            evidenceCount: 0,
            precedentCount: 0,
          };
        }
        const m = sectionMetrics[section];
        m.artifactCount++;
        const s = (art.status || 'draft').toLowerCase();
        if (s === 'approved') m.approvedCount++;
        else if (s === 'locked' || s === 'published') m.lockedCount++;
        else if (s === 'review' || s === 'under_review') m.reviewCount++;
        else m.draftCount++;
        if (art.templateId) m.templateCoverageAvailable = true;
        const evidence = artifactEvidenceMap.get(art.id);
        if (evidence) {
          m.evidenceCount += evidence.sourceInputs;
          m.precedentCount += evidence.generations;
        }
      }

      // Compute completion per section
      const result: Record<
        string,
        {
          artifactCount: number;
          draftCount: number;
          reviewCount: number;
          approvedCount: number;
          lockedCount: number;
          completionPercent: number;
          templateCoverageAvailable: boolean;
          evidenceCount: number;
          precedentCount: number;
        }
      > = {};

      for (const [section, m] of Object.entries(sectionMetrics)) {
        let completionPercent = 0;
        if (m.artifactCount > 0) {
          // Weighted: locked=100, approved=85, review=60, draft=30
          const weighted =
            m.lockedCount * 100 + m.approvedCount * 85 + m.reviewCount * 60 + m.draftCount * 30;
          completionPercent = Math.round(weighted / m.artifactCount);
        }
        result[section] = { ...m, completionPercent };
      }

      return sendSuccess(res, result);
    } catch (error: any) {
      logConcept2cureError('dossier-metrics', error, { projectId: req.params.projectId });
      return sendError(res, 500, 'Failed to compute dossier metrics');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures
 * Create an electronic signature for an artifact version (21 CFR Part 11).
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/signatures',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);

      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      // ── Signing role check ────────────────────────────────────────
      const signerRole = (req.userRole || 'user').toLowerCase();
      const canSign = ['admin', 'approver', 'reviewer'].includes(signerRole);
      if (!canSign) {
        return sendError(res, 403, 'Your role does not permit electronic signatures');
      }

      const data = createSignatureSchema.parse(req.body);

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) {
        return sendError(res, 404, 'Artifact not found');
      }

      const targetVersion = data.version ?? artifact.version;
      const [versionRow] = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(
          and(
            eq(concept2cureArtifactVersions.artifactId, artifact.id),
            eq(concept2cureArtifactVersions.version, targetVersion)
          )
        )
        .limit(1);

      if (!versionRow) {
        return sendError(res, 404, 'Artifact version not found');
      }

      const signedAt = new Date();
      const signatureId = `sig_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const signatureType = data.signatureType ?? 'approval';
      const signaturePurpose = sanitizeContent(data.signaturePurpose);
      const signatureMeaning = data.signatureMeaning
        ? sanitizeContent(data.signatureMeaning)
        : null;
      const signatureManifest = data.signatureManifest
        ? sanitizeObject(data.signatureManifest)
        : null;

      const signatureHash = calculateSignatureHash({
        signatureId,
        artifactId: artifact.artifactId,
        version: targetVersion,
        contentHash: versionRow.contentHash,
        signerId: userId,
        signatureType,
        signaturePurpose,
        signatureMeaning,
        signedAt: signedAt.toISOString(),
      });

      const signerName = (req as any).userName || req.userEmail || 'unknown';
      const signerEmail = req.userEmail || 'unknown';

      const [signature] = await db
        .insert(concept2cureSignatures)
        .values({
          organizationId,
          signatureId,
          artifactId: artifact.id,
          artifactVersionId: versionRow.id,
          signatureType,
          signaturePurpose,
          signatureMeaning,
          signerId: userId,
          signerName,
          signerEmail,
          signerRole: req.userRole || 'user',
          authenticationMethod: data.authenticationMethod,
          authenticationTimestamp: signedAt,
          secondFactorVerified: data.secondFactorVerified ?? false,
          signatureHash,
          signatureManifest,
          ipAddress: getClientIp(req),
          deviceInfo: null,
          status: 'active',
          signedAt,
        })
        .returning();

      await logAuditEntry(req, 'CREATE', 'signature', signatureId, null, {
        artifactId: paramStr(req.params.artifactId),
        version: targetVersion,
        signatureType,
        signaturePurpose,
        signatureHash,
      });

      res.status(201);
      return sendSuccess(res, {
        id: signature.signatureId,
        artifactId: paramStr(req.params.artifactId),
        version: targetVersion,
        signatureType,
        signaturePurpose,
        signatureMeaning,
        signerId: userId,
        signerName,
        signerEmail,
        signedAt: signature.signedAt,
        signatureHash,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation failed', error.errors);
      }
      logConcept2cureError('create signature', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to create signature');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures
 * List electronic signatures for an artifact (21 CFR Part 11).
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/signatures',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const signatures = await db
        .select({
          signatureId: concept2cureSignatures.signatureId,
          signatureType: concept2cureSignatures.signatureType,
          signaturePurpose: concept2cureSignatures.signaturePurpose,
          signatureMeaning: concept2cureSignatures.signatureMeaning,
          signerName: concept2cureSignatures.signerName,
          signerEmail: concept2cureSignatures.signerEmail,
          signerRole: concept2cureSignatures.signerRole,
          signedAt: concept2cureSignatures.signedAt,
          signatureHash: concept2cureSignatures.signatureHash,
          status: concept2cureSignatures.status,
        })
        .from(concept2cureSignatures)
        .where(
          and(
            eq(concept2cureSignatures.artifactId, artifact.id),
            eq(concept2cureSignatures.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureSignatures.signedAt);

      return sendSuccess(res, signatures);
    } catch (error: any) {
      logConcept2cureError('list signatures', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list signatures');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/snapshots
 * List immutable submission/export snapshots for an artifact.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/snapshots',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const snapshots = await db
        .select({
          snapshotId: concept2cureSubmissionSnapshots.snapshotId,
          versionId: concept2cureSubmissionSnapshots.versionId,
          approvedVersionId: concept2cureSubmissionSnapshots.approvedVersionId,
          publishedVersionId: concept2cureSubmissionSnapshots.publishedVersionId,
          contentHash: concept2cureSubmissionSnapshots.contentHash,
          exportHash: concept2cureSubmissionSnapshots.exportHash,
          title: concept2cureSubmissionSnapshots.title,
          ctdSection: concept2cureSubmissionSnapshots.ctdSection,
          filename: concept2cureSubmissionSnapshots.filename,
          fileSize: concept2cureSubmissionSnapshots.fileSize,
          actionType: concept2cureSubmissionSnapshots.actionType,
          actorName: concept2cureSubmissionSnapshots.actorName,
          actorRole: concept2cureSubmissionSnapshots.actorRole,
          attestationText: concept2cureSubmissionSnapshots.attestationText,
          signatureMeaning: concept2cureSubmissionSnapshots.signatureMeaning,
          createdAt: concept2cureSubmissionSnapshots.createdAt,
        })
        .from(concept2cureSubmissionSnapshots)
        .where(
          and(
            eq(concept2cureSubmissionSnapshots.artifactId, artifact.id),
            eq(concept2cureSubmissionSnapshots.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureSubmissionSnapshots.createdAt);

      return sendSuccess(res, snapshots);
    } catch (error: any) {
      logConcept2cureError('list snapshots', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list snapshots');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT PROVENANCE API
// Full provenance, auditability, and compliance traceability for any artifact
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/provenance
 *
 * Returns comprehensive provenance data for an artifact, aggregated across:
 *   1. Document Identity (from artifacts table)
 *   2. Source Inputs (from provenance_events where eventType = 'source_input')
 *   3. Generation Lineage (from provenance_events where eventType = 'generation')
 *   4. Review / Edit History (from artifact_versions + provenance_events)
 *   5. Compliance / Security Metadata (from artifacts + signatures + provenance_events)
 *   6. Submission / Placement Context (from provenance_events where eventType = 'placement')
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/provenance',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      // 1. Get artifact
      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) {
        return sendError(res, 404, 'Artifact not found');
      }

      // 2-5: Parallel sub-queries with graceful fallback per table
      const safeQuery = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
        try {
          return await fn();
        } catch (e: any) {
          logger.warn(`provenance sub-query "${label}" failed: ${e.message}`);
          return fallback;
        }
      };

      const [versions, signatures, provenanceEvents, projectRow] = await Promise.all([
        safeQuery(
          'versions',
          () =>
            db
              .select()
              .from(concept2cureArtifactVersions)
              .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
              .orderBy(desc(concept2cureArtifactVersions.version)),
          []
        ),
        safeQuery(
          'signatures',
          () =>
            db
              .select()
              .from(concept2cureSignatures)
              .where(
                and(
                  eq(concept2cureSignatures.artifactId, artifact.id),
                  eq(concept2cureSignatures.organizationId, organizationId)
                )
              )
              .orderBy(desc(concept2cureSignatures.signedAt)),
          []
        ),
        safeQuery(
          'provenance_events',
          () =>
            db
              .select()
              .from(concept2cureProvenanceEvents)
              .where(
                and(
                  eq(concept2cureProvenanceEvents.artifactId, artifact.id),
                  eq(concept2cureProvenanceEvents.organizationId, organizationId)
                )
              )
              .orderBy(desc(concept2cureProvenanceEvents.createdAt)),
          []
        ),
        safeQuery(
          'project',
          () =>
            db
              .select({ id: projects.id, name: projects.name })
              .from(projects)
              .where(eq(projects.id, artifact.projectId))
              .limit(1)
              .then(rows => rows[0] || null),
          null
        ),
      ]);

      const project = projectRow;

      // Categorize provenance events
      const sourceInputs = provenanceEvents.filter(e => e.eventType === 'source_input');
      const generationEvents = provenanceEvents.filter(e => e.eventType === 'generation');
      const transformationEvents = provenanceEvents.filter(e => e.eventType === 'transformation');
      const exportEvents = provenanceEvents.filter(e => e.eventType === 'export');
      const placementEvents = provenanceEvents.filter(e => e.eventType === 'placement');

      // Build the 6-section provenance response
      const provenance = {
        // Section 1: Document Identity
        identity: {
          artifactId: artifact.artifactId,
          title: artifact.title,
          type: artifact.type,
          category: artifact.category,
          ctdSection: artifact.ctdSection,
          templateId: artifact.templateId,
          version: artifact.version,
          status: artifact.status,
          projectId: artifact.projectId,
          projectName: project?.name || null,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
          createdById: artifact.createdById,
        },

        // Section 2: Source Inputs
        sourceInputs: sourceInputs.map(e => ({
          eventId: e.eventId,
          action: e.eventAction,
          description: e.sourceDescription,
          details: e.details,
          sourceArtifactId: e.sourceArtifactId,
          timestamp: e.createdAt,
        })),

        // Section 3: Generation Lineage
        generationLineage: {
          events: generationEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            description: e.sourceDescription,
            details: e.details,
            backendRoute: e.backendRoute,
            backendService: e.backendService,
            actorId: e.actorId,
            actorName: e.actorName,
            timestamp: e.createdAt,
          })),
          transformations: transformationEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            description: e.sourceDescription,
            details: e.details,
            timestamp: e.createdAt,
          })),
        },

        // Section 4: Review / Edit History
        editHistory: {
          versions: versions.map(v => ({
            version: v.version,
            contentHash: v.contentHash,
            changeDescription: v.changeDescription,
            createdById: v.createdById,
            createdAt: v.createdAt,
          })),
          totalVersions: versions.length,
          currentVersion: artifact.version,
        },

        // Section 5: Compliance / Security Metadata
        compliance: {
          contentHash: artifact.contentHash,
          versionChain: versions.map(v => ({
            version: v.version,
            hash: v.contentHash,
            timestamp: v.createdAt,
          })),
          lockStatus: {
            isLocked: artifact.status === 'locked',
            lockedAt: artifact.lockedAt,
            lockedById: artifact.lockedById,
          },
          signatures: signatures.map(s => ({
            signatureId: s.signatureId,
            type: s.signatureType,
            purpose: s.signaturePurpose,
            meaning: s.signatureMeaning,
            signerName: s.signerName,
            signerEmail: s.signerEmail,
            signerRole: s.signerRole,
            signedAt: s.signedAt,
            authenticationMethod: s.authenticationMethod,
            secondFactorVerified: s.secondFactorVerified,
          })),
          exportEvents: exportEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            details: e.details,
            actorName: e.actorName,
            timestamp: e.createdAt,
          })),
        },

        // Section 6: Submission / Placement Context
        placement: {
          projectId: artifact.projectId,
          projectName: project?.name || null,
          ctdSection: artifact.ctdSection,
          artifactId: artifact.artifactId,
          events: placementEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            description: e.sourceDescription,
            details: e.details,
            timestamp: e.createdAt,
          })),
        },
      };

      return sendSuccess(res, provenance);
    } catch (error: any) {
      logConcept2cureError('get provenance', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to fetch provenance data');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// VERSION COMPARE API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/versions
 * Returns all versions with full content for compare operations.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/versions',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version));

      return sendSuccess(res, {
        artifactId: artifact.artifactId,
        title: artifact.title,
        currentVersion: artifact.version,
        versions: versions.map(v => ({
          id: v.id,
          version: v.version,
          content: v.content,
          contentHash: v.contentHash,
          changeDescription: v.changeDescription,
          createdById: v.createdById,
          createdAt: v.createdAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('get versions', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to fetch versions');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT / COMPLIANCE REPORT API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/audit-report
 * Generates an inspection-ready audit/compliance report for a document.
 * Query params: ?mode=summary|detailed (default: summary)
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/audit-report',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const mode = (req.query.mode as string) === 'detailed' ? 'detailed' : 'summary';

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Gather all data
      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version));

      const signatures = await db
        .select()
        .from(concept2cureSignatures)
        .where(
          and(
            eq(concept2cureSignatures.artifactId, artifact.id),
            eq(concept2cureSignatures.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureSignatures.signedAt));

      const provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            eq(concept2cureProvenanceEvents.artifactId, artifact.id),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureProvenanceEvents.createdAt);

      const [project] = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, artifact.projectId))
        .limit(1);

      // Emit export provenance event
      await emitProvenanceEvent({
        artifactDbId: artifact.id,
        organizationId,
        eventType: 'export',
        eventAction: 'audit_report_export',
        actorId: getUserId(req),
        actorName: (req as any).user?.email || 'system',
        details: { mode, format: 'json' },
        backendRoute: req.originalUrl,
        backendService: 'concept2cure',
        ipAddress: req.ip,
      });

      // Build report
      const generatedAt = new Date().toISOString();
      const report: Record<string, unknown> = {
        reportType:
          mode === 'detailed' ? 'Inspection-Ready Audit Report' : 'Document Intelligence Report',
        generatedAt,
        standard: '21 CFR Part 11 · ICH M8 eCTD v4.0',

        documentIdentity: {
          title: artifact.title,
          artifactId: artifact.artifactId,
          type: artifact.type,
          category: artifact.category,
          ctdSection: artifact.ctdSection || 'Not assigned',
          currentVersion: artifact.version,
          status: artifact.status,
          project: project?.name || `Project #${artifact.projectId}`,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        },

        integrityVerification: {
          currentHash: artifact.contentHash,
          algorithm: 'SHA-256',
          hashChain: versions.map(v => ({
            version: v.version,
            hash: v.contentHash,
            timestamp: v.createdAt,
          })),
          ...(() => {
            const verification = verifyIntegrityChain(artifact, versions);
            return {
              // Scope travels with the verdict. This block is emitted under a
              // 21 CFR Part 11 heading and directly above sourceLineage; without
              // it, "chainIntact: true" reads as a statement about the source
              // documents listed below, which this check never touches.
              scope: verification.scope,
              sourceDocumentBytesVerified: verification.sourceDocumentBytesVerified,
              chainIntact: verification.chainIntact,
              currentHashVerified: verification.currentHashVerified,
              failureReason: verification.failureReason,
            };
          })(),
        },

        versionTimeline: versions.map(v => ({
          version: v.version,
          hash: v.contentHash,
          changeDescription: v.changeDescription || 'Initial version',
          createdAt: v.createdAt,
          createdById: v.createdById,
        })),

        sourceLineage: provenanceEvents
          .filter(e => e.eventType === 'source_input')
          .map(e => ({
            action: e.eventAction,
            description: e.sourceDescription,
            timestamp: e.createdAt,
            actor: e.actorName,
          })),

        generationLineage: provenanceEvents
          .filter(e => e.eventType === 'generation')
          .map(e => ({
            action: e.eventAction,
            description: e.sourceDescription,
            backendRoute: e.backendRoute,
            backendService: e.backendService,
            actor: e.actorName,
            actorType: e.actorName?.includes('system') ? 'system' : 'user',
            timestamp: e.createdAt,
          })),

        reviewSignatureSummary: {
          totalSignatures: signatures.length,
          signatures: signatures.map(s => ({
            signer: s.signerName,
            email: s.signerEmail,
            role: s.signerRole,
            purpose: s.signaturePurpose,
            meaning: s.signatureMeaning,
            method: s.authenticationMethod,
            twoFactorVerified: s.secondFactorVerified,
            signedAt: s.signedAt,
          })),
        },

        exportHistory: provenanceEvents
          .filter(e => e.eventType === 'export')
          .map(e => ({
            action: e.eventAction,
            actor: e.actorName,
            timestamp: e.createdAt,
            details: e.details,
          })),

        placementContext: {
          project: project?.name || `Project #${artifact.projectId}`,
          ctdSection: artifact.ctdSection,
          artifactId: artifact.artifactId,
          lockStatus: artifact.status === 'locked' ? 'Locked' : 'Unlocked',
          lockedAt: artifact.lockedAt,
        },
      };

      // In detailed mode, add full event timeline
      if (mode === 'detailed') {
        report.fullEventTimeline = provenanceEvents.map(e => ({
          eventId: e.eventId,
          eventType: e.eventType,
          action: e.eventAction,
          actor: e.actorName,
          actorEmail: e.actorEmail,
          description: e.sourceDescription,
          backendRoute: e.backendRoute,
          backendService: e.backendService,
          ipAddress: e.ipAddress,
          details: e.details,
          timestamp: e.createdAt,
        }));
      }

      return sendSuccess(res, report);
    } catch (error: any) {
      logConcept2cureError('audit report', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to generate audit report');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT REPORT EXPORT AS ARTIFACT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/audit-report/export
 * Generates the audit report and saves it as a new artifact (inspection-ready).
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/audit-report/export',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Build the audit report data directly (same as GET audit-report endpoint)
      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version));

      const signatures = await db
        .select()
        .from(concept2cureSignatures)
        .where(
          and(
            eq(concept2cureSignatures.artifactId, artifact.id),
            eq(concept2cureSignatures.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureSignatures.signedAt));

      const provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            eq(concept2cureProvenanceEvents.artifactId, artifact.id),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureProvenanceEvents.createdAt);

      const [project] = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, artifact.projectId))
        .limit(1);

      const reportData = {
        reportType: 'Inspection-Ready Audit Report (Exported)',
        generatedAt: new Date().toISOString(),
        standard: '21 CFR Part 11 · ICH M8 eCTD v4.0',
        documentIdentity: {
          title: artifact.title,
          artifactId: artifact.artifactId,
          type: artifact.type,
          category: artifact.category,
          ctdSection: artifact.ctdSection || 'Not assigned',
          currentVersion: artifact.version,
          status: artifact.status,
          project: project?.name || `Project #${artifact.projectId}`,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        },
        integrityVerification: {
          currentHash: artifact.contentHash,
          algorithm: 'SHA-256',
          hashChain: versions.map((v: any) => ({
            version: v.version,
            hash: v.contentHash,
            timestamp: v.createdAt,
          })),
          ...(() => {
            const verification = verifyIntegrityChain(artifact, versions);
            return {
              // Scope travels with the verdict. This block is emitted under a
              // 21 CFR Part 11 heading and directly above sourceLineage; without
              // it, "chainIntact: true" reads as a statement about the source
              // documents listed below, which this check never touches.
              scope: verification.scope,
              sourceDocumentBytesVerified: verification.sourceDocumentBytesVerified,
              chainIntact: verification.chainIntact,
              currentHashVerified: verification.currentHashVerified,
              failureReason: verification.failureReason,
            };
          })(),
        },
        versionTimeline: versions.map((v: any) => ({
          version: v.version,
          hash: v.contentHash,
          changeDescription: v.changeDescription || 'Initial version',
          createdAt: v.createdAt,
        })),
        signatureSummary: {
          totalSignatures: signatures.length,
          signatures: signatures.map((s: any) => ({
            signer: s.signerName,
            purpose: s.signaturePurpose,
            method: s.authenticationMethod,
            signedAt: s.signedAt,
          })),
        },
        totalProvenanceEvents: provenanceEvents.length,
      };

      // Create a new artifact containing the audit report
      const exportArtifactId = `audit_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const reportContent = JSON.stringify(reportData, null, 2);
      const contentHash = crypto.createHash('sha256').update(reportContent).digest('hex');
      const now = new Date();
      const sourceArtifactMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const sourceHarness =
        sourceArtifactMetadata.harness && typeof sourceArtifactMetadata.harness === 'object'
          ? (sourceArtifactMetadata.harness as Record<string, unknown>)
          : {};
      const auditGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: null,
        documentType: 'audit_report',
        generationMode: 'ai_assisted',
        lifecycleStatus: 'locked',
        originSurface: 'api_route',
        clientTrack:
          sourceHarness.clientTrack === 'device'
            ? 'device'
            : sourceHarness.clientTrack === 'diagnostics'
            ? 'diagnostics'
            : 'biotech',
        submissionProgram:
          sourceHarness.submissionProgram === 'ind' ||
          sourceHarness.submissionProgram === 'ectd' ||
          sourceHarness.submissionProgram === '510k' ||
          sourceHarness.submissionProgram === 'pma' ||
          sourceHarness.submissionProgram === 'cer' ||
          sourceHarness.submissionProgram === 'ivdr'
            ? (sourceHarness.submissionProgram as GovernedDocumentActionContract['submissionProgram'])
            : 'general_ri',
        persona: sourceHarness.persona === 'qa' ? 'qa' : 'regulatory',
        regulatorScope:
          sourceHarness.regulatorScope === 'ema' ||
          sourceHarness.regulatorScope === 'mhra' ||
          sourceHarness.regulatorScope === 'hc' ||
          sourceHarness.regulatorScope === 'pmda' ||
          sourceHarness.regulatorScope === 'multi'
            ? (sourceHarness.regulatorScope as GovernedDocumentActionContract['regulatorScope'])
            : 'fda',
        evidenceMode: 'mixed',
        documentClass: 'audit_report',
        readinessGate: 'inspection_ready',
        approvalPathType: 'qa_lock',
        recommendationSource: 'report_engine',
        workspaceTarget: 'vault',
        artifactContainerId: exportArtifactId,
        placementContainerId: exportArtifactId,
        regulatorIntent: 'inspection_support',
        title: `Audit Report — ${artifact.title} — ${now.toISOString().split('T')[0]}`,
        content: reportContent,
        ctdSection: artifact.ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        provider: 'concept2cure',
        model: 'audit-export-v1',
        exportAllowed: true,
        eventType: 'artifact.created',
      });
      if (!auditGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: auditGovernedResolution.validation.errors,
            warnings: auditGovernedResolution.validation.warnings,
            resolved: auditGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const [exportedArtifact] = await db
        .insert(concept2cureArtifacts)
        .values({
          organizationId,
          projectId: artifact.projectId,
          artifactId: exportArtifactId,
          title: `Audit Report — ${artifact.title} — ${now.toISOString().split('T')[0]}`,
          content: reportContent,
          type: 'audit_report',
          category: 'compliance',
          version: 1,
          status: 'locked',
          contentHash,
          createdById: userId,
          ctdSection: artifact.ctdSection,
          lockedAt: now,
          lockedById: userId,
          metadata: {
            sourceArtifactId: artifact.artifactId,
            harness: {
              clientTrack: auditGovernedResolution.contract.clientTrack,
              submissionProgram: auditGovernedResolution.contract.submissionProgram,
              persona: auditGovernedResolution.contract.persona,
              regulatorScope: auditGovernedResolution.contract.regulatorScope,
              documentClass: auditGovernedResolution.contract.documentClass,
              readinessGate: auditGovernedResolution.contract.readinessGate,
              workspaceTarget: auditGovernedResolution.contract.workspaceTarget,
              originSurface: auditGovernedResolution.contract.originSurface,
              recommendationSource: auditGovernedResolution.contract.recommendationSource,
              regulatorIntent: auditGovernedResolution.contract.regulatorIntent,
              gateChecks: auditGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: auditGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: auditGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .returning();

      // Insert v1 into versions table
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: exportedArtifact.id,
        version: 1,
        content: reportContent,
        contentHash,
        changeDescription: `Audit report exported from ${artifact.title}`,
        createdById: userId,
      });

      // Log provenance on the ORIGINAL artifact
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'export',
        eventAction: 'audit_report_export',
        sourceDescription: `Audit report exported as artifact ${exportArtifactId}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/audit-report/export`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          exportedArtifactId: exportArtifactId,
          reportMode: 'detailed',
          sourceArtifactVersion: artifact.version,
        },
      });

      await logAuditEntry(req, 'CREATE', 'audit_report_export', exportArtifactId, null, {
        sourceArtifactId: paramStr(req.params.artifactId),
        exportedArtifactId: exportArtifactId,
      });

      res.status(201);
      return sendSuccess(res, {
        exportedArtifactId: exportArtifactId,
        title: exportedArtifact.title,
        id: exportedArtifact.id,
        status: 'locked',
        message: 'Audit report exported as inspection-ready artifact',
      });
    } catch (error: any) {
      logConcept2cureError('audit report export', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to export audit report');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ARTIFACT STATUS / LOCK MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/status
 * Change artifact status with workflow enforcement.
 *
 * Valid transitions:
 *   draft   → review
 *   review  → approved | draft (regression — requires reason)
 *   approved → locked  | review (regression — requires reason)
 *   locked  → draft    (regression — requires reason)
 *
 * Role-based enforcement:
 *   author / user : draft → review only
 *   reviewer      : review → approved, review → draft
 *   approver / admin : approved → locked, locked → draft, rollback, publish
 *
 * Body: { status: string, reason?: string }
 */

// ── Role-based permission map for status transitions ───────────────────
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'draft→review',
    'review→approved',
    'review→draft',
    'approved→locked',
    'approved→review',
    'locked→draft',
  ],
  approver: [
    'draft→review',
    'review→approved',
    'review→draft',
    'approved→locked',
    'approved→review',
    'locked→draft',
  ],
  reviewer: ['draft→review', 'review→approved', 'review→draft', 'approved→review'],
  author: ['draft→review'],
  user: ['draft→review'],
  viewer: [],
};

const ROLLBACK_ROLES = ['admin', 'approver', 'reviewer'];

/**
 * GET /api/concept2cure/user/permissions
 * Returns the current user's governance permissions based on their role.
 */
router.get('/user/permissions', async (req: Request, res: Response) => {
  try {
    const userRole = (req.userRole || 'user').toLowerCase();
    const allowedTransitions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['user'];
    const canRollback = ROLLBACK_ROLES.includes(userRole);
    const canSign = ['admin', 'approver', 'reviewer'].includes(userRole);
    const canExport = ['admin', 'approver', 'reviewer', 'author', 'user'].includes(userRole);

    return sendSuccess(res, {
      role: userRole,
      allowedTransitions,
      canRollback,
      canSign,
      canExport,
    });
  } catch {
    return sendError(res, 500, 'Failed to fetch permissions');
  }
});

router.put(
  '/projects/:projectId/artifacts/:artifactId/status',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { status, reason, attestation } = req.body;
      const validStatuses = ['draft', 'review', 'approved', 'locked'];
      if (!status || !validStatuses.includes(status)) {
        return sendError(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // ── Attestation required for approve and lock/publish ────────────
      const requiresAttestation = status === 'approved' || status === 'locked';
      if (requiresAttestation) {
        if (
          !attestation ||
          typeof attestation !== 'object' ||
          !attestation.meaning ||
          !attestation.attestationText
        ) {
          return sendError(
            res,
            400,
            `Attestation is required for ${status}. Must include: meaning (e.g. "Approved", "Released"), attestationText (acknowledgement of intent)`
          );
        }
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const previousStatus = artifact.status || 'draft';

      // ── Role-based permission check ──────────────────────────────────
      const transitionKey = `${previousStatus}→${status}`;
      const allowedTransitions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['user'];
      if (!allowedTransitions.includes(transitionKey)) {
        return sendError(
          res,
          403,
          `Role "${userRole}" is not permitted to perform transition: ${transitionKey}. ` +
            `Allowed transitions for your role: ${allowedTransitions.join(', ') || 'none'}`
        );
      }

      // ── Transition validation ────────────────────────────────────────
      const VALID_TRANSITIONS: Record<string, string[]> = {
        draft: ['review'],
        review: ['approved', 'draft'],
        approved: ['locked', 'review'],
        locked: ['draft'],
      };

      const allowed = VALID_TRANSITIONS[previousStatus] || [];
      if (!allowed.includes(status)) {
        return sendError(
          res,
          400,
          `Invalid transition: ${previousStatus} → ${status}. Allowed: ${allowed.join(', ')}`
        );
      }

      // ── Regression requires reason ───────────────────────────────────
      const REGRESSIONS: Record<string, string[]> = {
        review: ['draft'],
        approved: ['review'],
        locked: ['draft'],
      };
      const regressions = REGRESSIONS[previousStatus] || [];
      if (regressions.includes(status)) {
        if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
          return sendError(
            res,
            400,
            'Reason is required (min 5 characters) when regressing document status'
          );
        }
      }

      // ── Contradiction governance gate ───────────────────────────────
      // Hard block promotion if unresolved contradictions with blocks_promotion authority
      if (status === 'approved' || status === 'locked') {
        try {
          const { contradictionEngineService } = await import(
            '../../services/contradiction-engine-service'
          );
          const { blocked, blockingFindings, warningFindings } =
            await contradictionEngineService.checkPromotionBlocked(
              organizationId,
              Number(req.params.projectId),
              artifact.id
            );
          if (blocked) {
            return sendError(
              res,
              409,
              `Promotion blocked by ${blockingFindings.length} unresolved contradiction finding(s). Resolve contradictions before promoting.`,
              {
                blockingFindings: blockingFindings.map(f => ({
                  id: f.id,
                  title: f.title,
                  severity: f.severity,
                  contradictionType: f.contradictionType,
                  authorityState: f.authorityState,
                })),
                warningFindings: warningFindings.map(f => ({
                  id: f.id,
                  title: f.title,
                  severity: f.severity,
                })),
              }
            );
          }
        } catch (contradictionError) {
          // Log but don't block on contradiction check failure (table may not exist yet)
          console.warn(
            'Contradiction check skipped:',
            contradictionError instanceof Error ? contradictionError.message : contradictionError
          );
        }
      }

      // ── P12: Review quorum gate ─────────────────────────────────────
      // Block review → approved if reviewers are assigned but not all approved.
      // Withdrawn assignments are excluded from the quorum check.
      if (previousStatus === 'review' && status === 'approved') {
        const roundAssignments = await db
          .select()
          .from(concept2cureReviewAssignments)
          .where(
            and(
              eq(concept2cureReviewAssignments.artifactId, artifact.id),
              eq(concept2cureReviewAssignments.organizationId, organizationId)
            )
          )
          .orderBy(desc(concept2cureReviewAssignments.reviewRound));

        if (roundAssignments.length > 0) {
          const latestRound = roundAssignments[0].reviewRound;
          // Exclude withdrawn assignments from quorum
          const activeAssignments = roundAssignments.filter(
            a => a.reviewRound === latestRound && a.status !== 'withdrawn'
          );

          if (activeAssignments.length === 0) {
            // All were withdrawn — no quorum to enforce, allow approval
          } else {
            const pendingReviews = activeAssignments.filter(a => a.status !== 'completed');

            if (pendingReviews.length > 0) {
              return sendError(
                res,
                400,
                `Cannot approve: ${pendingReviews.length} of ${activeAssignments.length} reviewers have not yet submitted their decision`
              );
            }

            // All completed — verify all decisions are "approve"
            const roundDecisions = await db
              .select()
              .from(concept2cureReviewDecisions)
              .where(
                and(
                  eq(concept2cureReviewDecisions.artifactId, artifact.id),
                  eq(concept2cureReviewDecisions.reviewRound, latestRound),
                  eq(concept2cureReviewDecisions.organizationId, organizationId)
                )
              );

            const nonApprovals = roundDecisions.filter(d => d.decision !== 'approve');
            if (nonApprovals.length > 0) {
              return sendError(
                res,
                400,
                `Cannot approve: ${
                  nonApprovals.length
                } reviewer(s) did not approve (decisions: ${nonApprovals
                  .map(d => d.decision)
                  .join(', ')})`
              );
            }
          }
        }
      }

      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date(),
      };
      if (status === 'approved') {
        updateData.approvedVersionId = artifact.version;
      }
      if (status === 'locked') {
        updateData.lockedAt = new Date();
        updateData.lockedById = userId;
        updateData.publishedVersionId = artifact.version;
        updateData.publishedAt = new Date();
      }
      if (previousStatus === 'locked' && status === 'draft') {
        updateData.lockedAt = null;
        updateData.lockedById = null;
      }
      const statusGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        documentType: artifact.type,
        generationMode: 'amendment',
        lifecycleStatus: (status === 'review'
          ? 'in_review'
          : status === 'locked'
          ? 'locked'
          : status === 'approved'
          ? 'approved'
          : 'draft') as GovernedDocumentActionContract['lifecycleStatus'],
        title: artifact.title,
        content: artifact.content || '',
        ctdSection: artifact.ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        readinessGate: status === 'locked' ? 'submission_candidate' : undefined,
        exportAllowed: ['approved', 'locked'].includes(status),
        eventType: 'artifact.updated',
      });
      if (!statusGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: statusGovernedResolution.validation.errors,
            warnings: statusGovernedResolution.validation.warnings,
            resolved: statusGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const existingMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};
      updateData.metadata = {
        ...existingMetadata,
        harness: {
          ...existingHarness,
          clientTrack: statusGovernedResolution.contract.clientTrack,
          submissionProgram: statusGovernedResolution.contract.submissionProgram,
          persona: statusGovernedResolution.contract.persona,
          regulatorScope: statusGovernedResolution.contract.regulatorScope,
          documentClass: statusGovernedResolution.contract.documentClass,
          readinessGate: statusGovernedResolution.contract.readinessGate,
          workspaceTarget: statusGovernedResolution.contract.workspaceTarget,
          originSurface: statusGovernedResolution.contract.originSurface,
          recommendationSource: statusGovernedResolution.contract.recommendationSource,
          regulatorIntent: statusGovernedResolution.contract.regulatorIntent,
          gateChecks: statusGovernedResolution.contract.exportEligibility.gateChecks,
          blockingReasons: statusGovernedResolution.contract.exportEligibility.blockingReasons,
          readinessOutcome: statusGovernedResolution.contract.exportEligibility.readinessOutcome,
        },
      };

      const [updated] = await db
        .update(concept2cureArtifacts)
        .set(updateData)
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();

      const signerName = (req as any).userName || req.userEmail || 'unknown';
      const signerEmail = req.userEmail || 'unknown';

      // ── Create attestation signature for approve/lock ────────────────
      let signatureRecord = null;
      if (requiresAttestation && attestation) {
        const signedAt = new Date();
        const signatureId = `sig_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const signaturePurpose =
          status === 'approved' ? 'approval_attestation' : 'publish_attestation';

        // Find version record for signature linkage
        const [versionRow] = await db
          .select()
          .from(concept2cureArtifactVersions)
          .where(
            and(
              eq(concept2cureArtifactVersions.artifactId, artifact.id),
              eq(concept2cureArtifactVersions.version, artifact.version)
            )
          )
          .limit(1);

        if (versionRow) {
          const signatureHash = crypto
            .createHash('sha256')
            .update(
              JSON.stringify({
                signatureId,
                artifactId: artifact.artifactId,
                version: artifact.version,
                contentHash: versionRow.contentHash,
                signerId: userId,
                signaturePurpose,
                signatureMeaning: attestation.meaning,
                signedAt: signedAt.toISOString(),
              })
            )
            .digest('hex');

          const [sig] = await db
            .insert(concept2cureSignatures)
            .values({
              organizationId,
              signatureId,
              artifactId: artifact.id,
              artifactVersionId: versionRow.id,
              signatureType: status === 'approved' ? 'approval' : 'publish',
              signaturePurpose,
              signatureMeaning: attestation.meaning,
              signerId: userId,
              signerName,
              signerEmail,
              signerRole: userRole,
              authenticationMethod: 'session_jwt',
              authenticationTimestamp: signedAt,
              secondFactorVerified: false,
              signatureHash,
              signatureManifest: {
                attestationText: attestation.attestationText,
                reason: attestation.reason || reason || null,
                previousStatus,
                newStatus: status,
              },
              ipAddress: getClientIp(req),
              deviceInfo: null,
              status: 'active',
              signedAt,
            })
            .returning();

          signatureRecord = {
            signatureId: sig.signatureId,
            signatureType: sig.signatureType,
            signatureMeaning: sig.signatureMeaning,
            signerName: sig.signerName,
            signerRole: sig.signerRole,
            signedAt: sig.signedAt,
            signatureHash: sig.signatureHash,
          };

          await logAuditEntry(req, 'SIGN', 'signature', signatureId, null, {
            artifactId: paramStr(req.params.artifactId),
            version: artifact.version,
            signatureType: sig.signatureType,
            signaturePurpose,
            signatureMeaning: attestation.meaning,
            attestationText: attestation.attestationText,
          });
        }
      }

      // ── Create submission snapshot for lock/publish ──────────────────
      let snapshotRecord = null;
      if (status === 'locked') {
        const snapshotId = `snap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const [snapshot] = await db
          .insert(concept2cureSubmissionSnapshots)
          .values({
            snapshotId,
            artifactId: artifact.id,
            organizationId,
            versionId: artifact.version,
            approvedVersionId: artifact.approvedVersionId ?? artifact.version,
            publishedVersionId: artifact.version,
            contentHash: artifact.contentHash || '',
            title: artifact.title,
            ctdSection: artifact.ctdSection,
            templateId: artifact.templateId,
            actionType: 'publish',
            actorId: userId,
            actorName: signerName,
            actorEmail: signerEmail,
            actorRole: userRole,
            attestationText: attestation?.attestationText || null,
            signatureMeaning: attestation?.meaning || null,
            metadata: {
              previousStatus,
              newStatus: status,
              reason: reason || null,
              signatureId: signatureRecord?.signatureId || null,
            },
          })
          .returning();

        snapshotRecord = {
          snapshotId: snapshot.snapshotId,
          versionId: snapshot.versionId,
          contentHash: snapshot.contentHash,
          actionType: snapshot.actionType,
          actorName: snapshot.actorName,
          createdAt: snapshot.createdAt,
        };
      }

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: requiresAttestation ? 'approval' : 'status_change',
        eventAction: `status_${status}`,
        sourceDescription: `Status changed from ${previousStatus} to ${status}${
          attestation?.meaning ? ` (${attestation.meaning})` : ''
        }`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/status`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          previousStatus,
          newStatus: status,
          reason: reason || null,
          attestation: attestation
            ? {
                meaning: attestation.meaning,
                attestationText: attestation.attestationText,
                signerName: (req as any).userName || req.userEmail || 'unknown',
                signerRole: userRole,
              }
            : null,
          signatureId: signatureRecord?.signatureId || null,
          snapshotId: snapshotRecord?.snapshotId || null,
        },
      });

      await logAuditEntry(
        req,
        requiresAttestation ? 'APPROVE' : 'UPDATE',
        'artifact_status',
        req.params.artifactId,
        null,
        {
          previousStatus,
          newStatus: status,
          reason: reason || null,
          attestation: attestation || null,
          signatureId: signatureRecord?.signatureId || null,
          snapshotId: snapshotRecord?.snapshotId || null,
        }
      );

      // RIM: capture status change as feedback signal (non-blocking)
      const feedbackMap: Record<string, 'accepted' | 'rejected'> = {
        approved: 'accepted',
        locked: 'accepted',
        draft: 'rejected', // regression = rejection of current state
      };
      const feedbackType = feedbackMap[status];
      if (feedbackType) {
        interceptFeedback({
          organizationId,
          projectId: parseInt(paramStr(req.params.projectId), 10),
          userId,
          artifactId: paramStr(req.params.artifactId),
          artifactVersionId: artifact.id?.toString(),
          sectionCode: artifact.ctdSection || undefined,
          feedbackType,
        });
      }

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        status: updated.status,
        previousStatus,
        lockedAt: updated.lockedAt,
        approvedVersionId: updated.approvedVersionId,
        publishedVersionId: updated.publishedVersionId,
        publishedAt: updated.publishedAt,
        enforcedRole: userRole,
        signature: signatureRecord,
        snapshot: snapshotRecord,
      });
    } catch (error: any) {
      logConcept2cureError('update artifact status', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to update artifact status');
    }
  }
);

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/ctd-section
 * Assign or update the CTD section placement for an artifact.
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/ctd-section',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { ctdSection } = req.body;
      if (!ctdSection || typeof ctdSection !== 'string') {
        return sendError(res, 400, 'ctdSection is required');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Lock enforcement — cannot modify locked documents
      if (artifact.status === 'locked') {
        return sendError(
          res,
          423,
          'Document is locked. Change status to draft or review before modifying CTD section.'
        );
      }

      const previousSection = artifact.ctdSection;
      const ctdSectionGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        documentType: artifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (artifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        title: artifact.title,
        content: artifact.content || '',
        ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        exportAllowed: ['approved', 'locked', 'published'].includes(String(artifact.status || '')),
        eventType: 'artifact.updated',
      });
      if (!ctdSectionGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: ctdSectionGovernedResolution.validation.errors,
            warnings: ctdSectionGovernedResolution.validation.warnings,
            resolved: ctdSectionGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const existingMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          ctdSection,
          updatedAt: new Date(),
          metadata: {
            ...existingMetadata,
            harness: {
              ...existingHarness,
              clientTrack: ctdSectionGovernedResolution.contract.clientTrack,
              submissionProgram: ctdSectionGovernedResolution.contract.submissionProgram,
              persona: ctdSectionGovernedResolution.contract.persona,
              regulatorScope: ctdSectionGovernedResolution.contract.regulatorScope,
              documentClass: ctdSectionGovernedResolution.contract.documentClass,
              readinessGate: ctdSectionGovernedResolution.contract.readinessGate,
              workspaceTarget: ctdSectionGovernedResolution.contract.workspaceTarget,
              originSurface: ctdSectionGovernedResolution.contract.originSurface,
              recommendationSource: ctdSectionGovernedResolution.contract.recommendationSource,
              regulatorIntent: ctdSectionGovernedResolution.contract.regulatorIntent,
              gateChecks: ctdSectionGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons:
                ctdSectionGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome:
                ctdSectionGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'placement',
        eventAction: 'ctd_section_assign',
        sourceDescription: previousSection
          ? `CTD section changed from ${previousSection} to ${ctdSection}`
          : `Placed in CTD section ${ctdSection}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/ctd-section`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { previousSection, newSection: ctdSection },
      });

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        ctdSection: updated.ctdSection,
        previousSection,
      });
    } catch (error: any) {
      logConcept2cureError('update ctd section', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to update CTD section');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P3: INTEGRITY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/verify-integrity
 * Recompute SHA-256 hashes for every version and the current artifact content.
 * Returns real verification results — no hardcoded trust.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/verify-integrity',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(concept2cureArtifactVersions.version);

      const verification = verifyIntegrityChain(artifact, versions);

      await logAuditEntry(req, 'READ', 'artifact', req.params.artifactId, null, {
        action: 'integrity_verification',
        chainIntact: verification.chainIntact,
      });

      return sendSuccess(res, {
        artifactId: artifact.artifactId,
        title: artifact.title,
        currentVersion: artifact.version,
        algorithm: 'SHA-256',
        // Was `verified`. A bare "verified: true" beside "algorithm: SHA-256"
        // names no subject, and the subject is the point: this establishes that
        // the STORED record is self-consistent, not that the document it came
        // from is intact. Renamed rather than kept as an alias — nothing in the
        // client or the test suite reads it, so there is no reason to keep the
        // ambiguous name alive.
        storedRecordSelfConsistent: verification.chainIntact,
        scope: verification.scope,
        sourceDocumentBytesVerified: verification.sourceDocumentBytesVerified,
        currentHashVerified: verification.currentHashVerified,
        computedHash: verification.computedHash,
        storedHash: verification.storedHash,
        chainIntact: verification.chainIntact,
        failureReason: verification.failureReason,
        versionDetails: verification.versionDetails,
        verifiedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logConcept2cureError('verify integrity', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to verify integrity');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P4: VERSION ROLLBACK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/rollback
 * Roll back to a previous version by creating a NEW version (v N+1) with old content.
 * Never mutates history — fully auditable.
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/rollback',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      // ── Role check: only reviewer, approver, admin can rollback ──────
      if (!ROLLBACK_ROLES.includes(userRole)) {
        return sendError(
          res,
          403,
          `Role "${userRole}" is not permitted to rollback. Requires: ${ROLLBACK_ROLES.join(', ')}`
        );
      }

      const { targetVersion } = req.body;
      if (!targetVersion || typeof targetVersion !== 'number' || targetVersion < 1) {
        return sendError(res, 400, 'targetVersion is required and must be a positive integer');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Lock enforcement
      if (artifact.status === 'locked') {
        return sendError(
          res,
          423,
          'Document is locked. Change status to draft or review before rolling back.'
        );
      }

      if (targetVersion >= artifact.version) {
        return sendError(
          res,
          400,
          `Cannot roll back to version ${targetVersion} — current version is ${artifact.version}`
        );
      }

      // Fetch the target version content
      const [targetVer] = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(
          and(
            eq(concept2cureArtifactVersions.artifactId, artifact.id),
            eq(concept2cureArtifactVersions.version, targetVersion)
          )
        )
        .limit(1);

      if (!targetVer) {
        return sendError(res, 404, `Version ${targetVersion} not found`);
      }

      // Create new version N+1 with the old content (immutable history)
      const newVersion = artifact.version + 1;
      const newContentHash = calculateContentHash(targetVer.content);

      const rollbackGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        documentType: artifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (artifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        title: artifact.title,
        content: targetVer.content || '',
        ctdSection: artifact.ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        exportAllowed: ['approved', 'locked', 'published'].includes(String(artifact.status || '')),
        eventType: 'artifact.updated',
      });
      if (!rollbackGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: rollbackGovernedResolution.validation.errors,
            warnings: rollbackGovernedResolution.validation.warnings,
            resolved: rollbackGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const existingMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};

      /* The version row, the content and its lineage commit together or not at
         all (ledger L160). The version row used to be inserted BEFORE the
         governed-contract validation, so a rejected rollback left an orphan
         version behind; and the restored text carried no lineage at all. */
      const updated = await db.transaction(async (tx) => {
        await tx.insert(concept2cureArtifactVersions).values({
          organizationId,
          artifactId: artifact.id,
          version: newVersion,
          content: targetVer.content,
          contentHash: newContentHash,
          changeDescription: `Rolled back to version ${targetVersion}`,
          createdById: userId,
        });
      // Update the artifact to the rolled-back content
        const [row] = await tx
          .update(concept2cureArtifacts)
        .set({
          content: targetVer.content,
          contentHash: newContentHash,
          version: newVersion,
          metadata: {
            ...existingMetadata,
            harness: {
              ...existingHarness,
              clientTrack: rollbackGovernedResolution.contract.clientTrack,
              submissionProgram: rollbackGovernedResolution.contract.submissionProgram,
              persona: rollbackGovernedResolution.contract.persona,
              regulatorScope: rollbackGovernedResolution.contract.regulatorScope,
              documentClass: rollbackGovernedResolution.contract.documentClass,
              readinessGate: rollbackGovernedResolution.contract.readinessGate,
              workspaceTarget: rollbackGovernedResolution.contract.workspaceTarget,
              originSurface: rollbackGovernedResolution.contract.originSurface,
              recommendationSource: rollbackGovernedResolution.contract.recommendationSource,
              regulatorIntent: rollbackGovernedResolution.contract.regulatorIntent,
              gateChecks: rollbackGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons:
                rollbackGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome:
                rollbackGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();
        /* Every clause of the restored text is recorded as the assertion of the
           person who chose to restore it; a gap rolls the rollback back. */
        const client = queryableFromDrizzle(tx);
        await enforceAuthorLineage(
          client,
          organizationId,
          { documentTable: 'concept2cure_artifacts', documentId: String(artifact.id) },
          targetVer.content ?? '',
          String(userId),
        );
        return row;
      });

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'rollback',
        eventAction: 'version_rollback',
        sourceDescription: `Rolled back from v${artifact.version} to v${targetVersion} content (created as v${newVersion})`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/rollback`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          rolledBackFromVersion: artifact.version,
          targetVersion,
          newVersion,
          previousHash: artifact.contentHash,
          newHash: newContentHash,
        },
      });

      await logAuditEntry(
        req,
        'UPDATE',
        'artifact',
        req.params.artifactId,
        {
          version: artifact.version,
          contentHash: artifact.contentHash,
        },
        {
          version: newVersion,
          contentHash: newContentHash,
          rollbackTargetVersion: targetVersion,
        }
      );

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        previousVersion: artifact.version,
        targetVersion,
        newVersion,
        contentHash: newContentHash,
        message: `Rolled back to version ${targetVersion} content (now version ${newVersion})`,
      });
    } catch (error: any) {
      logConcept2cureError('rollback artifact', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to rollback artifact');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P5: REVIEW COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/comments
 * Add a review comment on an artifact at a specific version.
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/comments',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { comment } = req.body;
      if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
        return sendError(res, 400, 'comment is required');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const commentId = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const sanitizedComment = sanitizeContent(comment.trim());

      const [inserted] = await db
        .insert(concept2cureReviewComments)
        .values({
          commentId,
          artifactId: artifact.id,
          organizationId,
          version: artifact.version,
          status: 'open',
          comment: sanitizedComment,
          userId,
          userName: (req as any).userName || req.userEmail || 'unknown',
        })
        .returning();

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'review_comment_added',
        sourceDescription: `Review comment added at version ${artifact.version}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/comments`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { commentId, version: artifact.version },
      });

      await logAuditEntry(req, 'CREATE', 'review_comment', commentId, null, {
        artifactId: paramStr(req.params.artifactId),
        version: artifact.version,
        comment: sanitizedComment,
      });

      return sendSuccess(res, {
        commentId: inserted.commentId,
        artifactId: paramStr(req.params.artifactId),
        version: inserted.version,
        status: inserted.status,
        comment: inserted.comment,
        userName: inserted.userName,
        createdAt: inserted.createdAt,
      });
    } catch (error: any) {
      logConcept2cureError('add review comment', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to add review comment');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/comments
 * List all review comments for an artifact.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/comments',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const comments = await db
        .select()
        .from(concept2cureReviewComments)
        .where(
          and(
            eq(concept2cureReviewComments.artifactId, artifact.id),
            eq(concept2cureReviewComments.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureReviewComments.createdAt));

      return sendSuccess(res, {
        artifactId: paramStr(req.params.artifactId),
        totalComments: comments.length,
        openComments: comments.filter(c => c.status === 'open').length,
        comments: comments.map(c => ({
          commentId: c.commentId,
          version: c.version,
          status: c.status,
          comment: c.comment,
          userName: c.userName,
          createdAt: c.createdAt,
          resolvedAt: c.resolvedAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list review comments', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list review comments');
    }
  }
);

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/comments/:commentId/resolve
 * Resolve a review comment.
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/comments/:commentId/resolve',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [comment] = await db
        .select()
        .from(concept2cureReviewComments)
        .where(
          and(
            eq(concept2cureReviewComments.commentId, paramStr(req.params.commentId)),
            eq(concept2cureReviewComments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!comment) return sendError(res, 404, 'Comment not found');
      if (comment.status === 'resolved') {
        return sendError(res, 400, 'Comment is already resolved');
      }

      const [updated] = await db
        .update(concept2cureReviewComments)
        .set({
          status: 'resolved',
          resolvedById: userId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(concept2cureReviewComments.id, comment.id))
        .returning();

      await logAuditEntry(
        req,
        'UPDATE',
        'review_comment',
        req.params.commentId,
        {
          status: 'open',
        },
        {
          status: 'resolved',
          resolvedById: userId,
        }
      );

      return sendSuccess(res, {
        commentId: updated.commentId,
        status: updated.status,
        resolvedAt: updated.resolvedAt,
      });
    } catch (error: any) {
      logConcept2cureError('resolve review comment', error, { commentId: req.params.commentId });
      return sendError(res, 500, 'Failed to resolve comment');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P12: MULTI-USER REVIEW OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers
 * Assign one or more reviewers to an artifact for the current review round.
 * Only admin/approver/reviewer roles can assign reviewers.
 * Body: { reviewerIds: number[], dueDate?: string, notes?: string }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/reviewers',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      if (!['admin', 'approver', 'reviewer'].includes(userRole)) {
        return sendError(res, 403, 'Only admin, approver, or reviewer can assign reviewers');
      }

      const { reviewerIds, dueDate, notes } = req.body;
      if (!Array.isArray(reviewerIds) || reviewerIds.length === 0) {
        return sendError(res, 400, 'reviewerIds must be a non-empty array of user IDs');
      }

      // Validate all IDs are numeric
      const numericIds = reviewerIds.map(Number);
      if (numericIds.some(isNaN)) {
        return sendError(res, 400, 'All reviewer IDs must be valid numbers');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Artifact must be in 'review' status to assign reviewers
      if (artifact.status !== 'review') {
        return sendError(
          res,
          400,
          `Cannot assign reviewers: artifact is in '${artifact.status}' status (must be 'review')`
        );
      }

      // Determine the current review round (max existing round, or 1 if none)
      const existingAssignments = await db
        .select({ reviewRound: concept2cureReviewAssignments.reviewRound })
        .from(concept2cureReviewAssignments)
        .where(eq(concept2cureReviewAssignments.artifactId, artifact.id))
        .orderBy(desc(concept2cureReviewAssignments.reviewRound))
        .limit(1);

      const reviewRound = existingAssignments.length > 0 ? existingAssignments[0].reviewRound : 1;

      // Verify all reviewer IDs belong to the same organization
      const validReviewers = await db
        .select({ userId: organizationUsers.userId, role: organizationUsers.role })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            inArray(organizationUsers.userId, numericIds)
          )
        );

      const validIds = new Set(validReviewers.map(r => r.userId));
      const invalidIds = numericIds.filter((id: number) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return sendError(res, 400, `Users not in organization: ${invalidIds.join(', ')}`);
      }

      // Self-review prevention: artifact author cannot be assigned as reviewer
      if (artifact.createdById) {
        if (numericIds.includes(artifact.createdById)) {
          return sendError(
            res,
            400,
            'The artifact author cannot be assigned as their own reviewer (GxP separation of duties)'
          );
        }
      }

      const parsedDueDate = dueDate ? new Date(dueDate) : null;

      // Batch insert all reviewer assignments in one query
      const allValues = numericIds.map(reviewerId => ({
        assignmentId: `asgn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        artifactId: artifact.id,
        organizationId,
        reviewerId,
        assignedById: userId,
        reviewRound,
        status: 'pending' as const,
        dueDate: parsedDueDate,
        notes: notes ? sanitizeContent(notes) : null,
      }));

      const inserted = await db
        .insert(concept2cureReviewAssignments)
        .values(allValues)
        .onConflictDoNothing()
        .returning();

      const results = numericIds.map(reviewerId => {
        const row = inserted.find(r => r.reviewerId === reviewerId);
        if (row) {
          return {
            assignmentId: row.assignmentId,
            reviewerId: row.reviewerId,
            status: row.status,
            reviewRound: row.reviewRound,
          };
        }
        return { reviewerId, status: 'already_assigned', reviewRound };
      });

      // Log provenance for assignment
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'reviewer_assigned',
        sourceDescription: `Assigned ${numericIds.length} reviewer(s) for round ${reviewRound}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/reviewers`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          reviewerIds: numericIds,
          reviewRound,
          dueDate: parsedDueDate,
          assignmentCount: results.filter(r => r.status !== 'already_assigned').length,
        },
      });

      await logAuditEntry(req, 'CREATE', 'review_assignment', req.params.artifactId, null, {
        reviewerIds: numericIds,
        reviewRound,
        dueDate: parsedDueDate,
      });

      return sendSuccess(res, {
        artifactId: paramStr(req.params.artifactId),
        reviewRound,
        assignments: results,
      });
    } catch (error: any) {
      logConcept2cureError('assign reviewers', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to assign reviewers');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers
 * List all review assignments for an artifact (all rounds).
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/reviewers',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const assignments = await db
        .select({
          id: concept2cureReviewAssignments.id,
          assignmentId: concept2cureReviewAssignments.assignmentId,
          reviewerId: concept2cureReviewAssignments.reviewerId,
          reviewerName: users.name,
          reviewerEmail: users.email,
          reviewRound: concept2cureReviewAssignments.reviewRound,
          status: concept2cureReviewAssignments.status,
          dueDate: concept2cureReviewAssignments.dueDate,
          notes: concept2cureReviewAssignments.notes,
          createdAt: concept2cureReviewAssignments.createdAt,
        })
        .from(concept2cureReviewAssignments)
        .innerJoin(users, eq(users.id, concept2cureReviewAssignments.reviewerId))
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .orderBy(
          desc(concept2cureReviewAssignments.reviewRound),
          concept2cureReviewAssignments.createdAt
        );

      // Load decisions for each assignment
      const assignmentIds = assignments.map(a => a.id);
      const decisions =
        assignmentIds.length > 0
          ? await db
              .select()
              .from(concept2cureReviewDecisions)
              .where(inArray(concept2cureReviewDecisions.assignmentId, assignmentIds))
          : [];

      const decisionsByAssignment = new Map<number, (typeof decisions)[0]>();
      for (const d of decisions) {
        decisionsByAssignment.set(d.assignmentId, d);
      }

      return sendSuccess(res, {
        artifactId: paramStr(req.params.artifactId),
        totalAssignments: assignments.length,
        assignments: assignments.map(a => ({
          assignmentId: a.assignmentId,
          reviewerId: a.reviewerId,
          reviewerName: a.reviewerName,
          reviewerEmail: a.reviewerEmail,
          reviewRound: a.reviewRound,
          status: a.status,
          dueDate: a.dueDate,
          notes: a.notes,
          createdAt: a.createdAt,
          decision: decisionsByAssignment.get(a.id)
            ? {
                decisionId: decisionsByAssignment.get(a.id)!.decisionId,
                decision: decisionsByAssignment.get(a.id)!.decision,
                comment: decisionsByAssignment.get(a.id)!.comment,
                versionReviewed: decisionsByAssignment.get(a.id)!.versionReviewed,
                createdAt: decisionsByAssignment.get(a.id)!.createdAt,
              }
            : null,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list reviewers', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list reviewers');
    }
  }
);

/**
 * DELETE /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId
 * Withdraw a reviewer assignment. Only admin/approver can withdraw, and only if no decision submitted.
 */
router.delete(
  '/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      if (!['admin', 'approver'].includes(userRole)) {
        return sendError(res, 403, 'Only admin or approver can withdraw reviewer assignments');
      }

      const [assignment] = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.assignmentId, paramStr(req.params.assignmentId)),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!assignment) return sendError(res, 404, 'Assignment not found');

      // Validate the assignment belongs to the artifact in the URL
      const [withdrawArtifact] = await db
        .select({ id: concept2cureArtifacts.id })
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!withdrawArtifact || assignment.artifactId !== withdrawArtifact.id) {
        return sendError(res, 404, 'Assignment not found for this artifact');
      }

      if (assignment.status === 'completed') {
        return sendError(
          res,
          400,
          'Cannot withdraw a completed assignment — reviewer has already submitted a decision'
        );
      }

      if (assignment.status === 'withdrawn') {
        return sendError(res, 400, 'Assignment is already withdrawn');
      }

      await db
        .update(concept2cureReviewAssignments)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(eq(concept2cureReviewAssignments.id, assignment.id));

      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: assignment.artifactId,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'reviewer_withdrawn',
        sourceDescription: `Reviewer ${assignment.reviewerId} withdrawn from round ${assignment.reviewRound}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/reviewers/${req.params.assignmentId}`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { assignmentId: req.params.assignmentId, reviewerId: assignment.reviewerId },
      });

      await logAuditEntry(req, 'UPDATE', 'review_assignment', req.params.assignmentId, null, {
        action: 'withdrawn',
        reviewerId: assignment.reviewerId,
        reviewRound: assignment.reviewRound,
      });

      return sendSuccess(res, {
        assignmentId: paramStr(req.params.assignmentId),
        status: 'withdrawn',
        reviewerId: assignment.reviewerId,
      });
    } catch (error: any) {
      logConcept2cureError('withdraw reviewer', error, { assignmentId: req.params.assignmentId });
      return sendError(res, 500, 'Failed to withdraw reviewer');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/team
 * List organization team members who can be assigned as reviewers.
 * Returns users in the same organization as the project.
 */
router.get('/projects/:projectId/team', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    // Get all users in this organization
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: organizationUsers.role,
        title: users.title,
        department: users.department,
        avatar: users.avatar,
        status: users.status,
      })
      .from(organizationUsers)
      .innerJoin(users, eq(organizationUsers.userId, users.id))
      .where(and(eq(organizationUsers.organizationId, organizationId), eq(users.status, 'active')))
      .orderBy(users.name);

    return sendSuccess(
      res,
      members.map(m => ({
        id: String(m.id),
        userId: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        title: m.title,
        department: m.department,
        avatar: m.avatar,
      }))
    );
  } catch (error: any) {
    logConcept2cureError('get team members', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to fetch team members');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId/remind
 * Send a reminder to a reviewer about their pending review.
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId/remind',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      // Get the assignment
      const [assignment] = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.assignmentId, paramStr(req.params.assignmentId)),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!assignment) {
        return sendError(res, 404, 'Assignment not found');
      }

      if (assignment.status === 'completed' || assignment.status === 'withdrawn') {
        return sendError(res, 400, `Cannot remind — assignment is ${assignment.status}`);
      }

      // Create a notification for the reviewer
      await db.insert(concept2cureNotifications).values({
        notificationId: `notif_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        orgId: organizationId,
        recipientUserId: assignment.reviewerId,
        actorUserId: userId,
        notificationType: 'due_soon',
        title: 'Review Reminder',
        body: `You have a pending review for artifact ${req.params.artifactId}. Please complete your review.`,
        severity: 'warning',
        status: 'unread',
        artifactId: Number(req.params.artifactId) || undefined,
        projectId: Number(req.params.projectId) || undefined,
      });

      // Log audit entry
      await logAuditEntry(req, 'UPDATE', 'review_assignment', req.params.assignmentId, null, {
        action: 'reminder_sent',
        reviewerId: assignment.reviewerId,
      });

      return sendSuccess(res, {
        assignmentId: paramStr(req.params.assignmentId),
        reminded: true,
        reviewerId: assignment.reviewerId,
      });
    } catch (error: any) {
      logConcept2cureError('send review reminder', error, {
        assignmentId: paramStr(req.params.assignmentId),
      });
      return sendError(res, 500, 'Failed to send reminder');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviews/submit
 * Submit a formal review decision for the current review round.
 * Body: { decision: 'approve'|'request_changes'|'reject', comment?: string }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/reviews/submit',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { decision, comment } = req.body;
      const validDecisions = ['approve', 'request_changes', 'reject'];
      if (!decision || !validDecisions.includes(decision)) {
        return sendError(res, 400, `decision must be one of: ${validDecisions.join(', ')}`);
      }

      // Cap comment length
      if (comment && typeof comment === 'string' && comment.length > 5000) {
        return sendError(res, 400, 'Comment must not exceed 5000 characters');
      }

      // Only reviewer/approver/admin can submit decisions
      if (!['reviewer', 'approver', 'admin'].includes(userRole)) {
        return sendError(res, 403, 'Only reviewer, approver, or admin can submit review decisions');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');
      if (artifact.status !== 'review') {
        return sendError(res, 400, 'Artifact must be in review status to submit a decision');
      }

      // Self-review prevention: author cannot review their own artifact
      if (artifact.createdById && artifact.createdById === userId) {
        return sendError(
          res,
          403,
          'You cannot review an artifact you authored (GxP separation of duties)'
        );
      }

      // Find this user's pending assignment for the current round
      const [assignment] = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.reviewerId, userId),
            eq(concept2cureReviewAssignments.organizationId, organizationId),
            inArray(concept2cureReviewAssignments.status, ['pending', 'in_progress'])
          )
        )
        .orderBy(desc(concept2cureReviewAssignments.reviewRound))
        .limit(1);

      if (!assignment) {
        return sendError(res, 403, 'You are not assigned as a reviewer for this artifact');
      }

      // Check for duplicate decision
      const [existingDecision] = await db
        .select()
        .from(concept2cureReviewDecisions)
        .where(eq(concept2cureReviewDecisions.assignmentId, assignment.id))
        .limit(1);

      if (existingDecision) {
        return sendError(res, 409, 'You have already submitted a decision for this review round');
      }

      const decisionId = `dec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const sanitizedComment = comment ? sanitizeContent(comment.trim()) : null;

      const [inserted] = await db
        .insert(concept2cureReviewDecisions)
        .values({
          decisionId,
          assignmentId: assignment.id,
          artifactId: artifact.id,
          organizationId,
          reviewerId: userId,
          reviewRound: assignment.reviewRound,
          decision,
          comment: sanitizedComment,
          versionReviewed: artifact.version,
        })
        .returning();

      // Update assignment status
      await db
        .update(concept2cureReviewAssignments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(concept2cureReviewAssignments.id, assignment.id));

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: `review_decision_${decision}`,
        sourceDescription: `Reviewer submitted decision: ${decision} (round ${assignment.reviewRound})`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/reviews/submit`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          decisionId,
          decision,
          reviewRound: assignment.reviewRound,
          versionReviewed: artifact.version,
        },
      });

      await logAuditEntry(req, 'CREATE', 'review_decision', decisionId, null, {
        artifactId: paramStr(req.params.artifactId),
        decision,
        reviewRound: assignment.reviewRound,
        versionReviewed: artifact.version,
      });

      // Check if all reviewers in this round have completed
      const roundAssignments = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.reviewRound, assignment.reviewRound),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        );

      // Exclude withdrawn assignments from round summary (consistent with quorum gate)
      const activeAssignments = roundAssignments.filter(a => a.status !== 'withdrawn');
      const activeReviewerIds = new Set(activeAssignments.map(a => a.reviewerId));
      const totalAssigned = activeAssignments.length;
      const completedCount = activeAssignments.filter(a => a.status === 'completed').length;
      const allApproved =
        totalAssigned > 0 &&
        completedCount === totalAssigned &&
        (
          await db
            .select()
            .from(concept2cureReviewDecisions)
            .where(
              and(
                eq(concept2cureReviewDecisions.artifactId, artifact.id),
                eq(concept2cureReviewDecisions.reviewRound, assignment.reviewRound),
                eq(concept2cureReviewDecisions.organizationId, organizationId)
              )
            )
        )
          .filter(d => activeReviewerIds.has(d.reviewerId))
          .every(d => d.decision === 'approve');

      return sendSuccess(res, {
        decisionId: inserted.decisionId,
        decision: inserted.decision,
        reviewRound: inserted.reviewRound,
        versionReviewed: inserted.versionReviewed,
        roundSummary: {
          totalAssigned,
          completedCount,
          pendingCount: totalAssigned - completedCount,
          allApproved,
          readyForApproval: allApproved && completedCount === totalAssigned,
        },
      });
    } catch (error: any) {
      logConcept2cureError('submit review decision', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to submit review decision');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviews/status
 * Get the review status for an artifact: assignments, decisions, quorum progress.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/reviews/status',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId)),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Get all assignments for the latest round
      const allAssignments = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureReviewAssignments.reviewRound));

      if (allAssignments.length === 0) {
        return sendSuccess(res, {
          artifactId: paramStr(req.params.artifactId),
          artifactStatus: artifact.status,
          hasReviewers: false,
          currentRound: 0,
          reviewers: [],
          readyForApproval: false,
        });
      }

      const currentRound = allAssignments[0].reviewRound;
      const roundAssignments = allAssignments.filter(a => a.reviewRound === currentRound);
      const activeAssignments = roundAssignments.filter(a => a.status !== 'withdrawn');

      // Get decisions for the current round
      const decisions = await db
        .select()
        .from(concept2cureReviewDecisions)
        .where(
          and(
            eq(concept2cureReviewDecisions.artifactId, artifact.id),
            eq(concept2cureReviewDecisions.reviewRound, currentRound),
            eq(concept2cureReviewDecisions.organizationId, organizationId)
          )
        );

      const decisionMap = new Map(decisions.map(d => [d.reviewerId, d]));

      // Get reviewer details
      const reviewerIds = roundAssignments.map(a => a.reviewerId);
      const reviewerDetails =
        reviewerIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, reviewerIds))
          : [];
      const reviewerMap = new Map(reviewerDetails.map(u => [u.id, u]));

      const totalAssigned = activeAssignments.length;
      const completedCount = activeAssignments.filter(a => a.status === 'completed').length;
      // Filter decisions to only active (non-withdrawn) reviewers
      const activeReviewerIds = new Set(activeAssignments.map(a => a.reviewerId));
      const activeDecisions = decisions.filter(d => activeReviewerIds.has(d.reviewerId));
      const allApproved =
        totalAssigned > 0 &&
        completedCount === totalAssigned &&
        activeDecisions.length === totalAssigned &&
        activeDecisions.every(d => d.decision === 'approve');

      return sendSuccess(res, {
        artifactId: paramStr(req.params.artifactId),
        artifactStatus: artifact.status,
        hasReviewers: true,
        currentRound,
        totalAssigned,
        completedCount,
        pendingCount: totalAssigned - completedCount,
        allApproved,
        readyForApproval: allApproved,
        reviewers: roundAssignments.map(a => {
          const reviewer = reviewerMap.get(a.reviewerId);
          const dec = decisionMap.get(a.reviewerId);
          return {
            assignmentId: a.assignmentId,
            reviewerId: a.reviewerId,
            reviewerName: reviewer?.name || 'Unknown',
            reviewerEmail: reviewer?.email || '',
            status: a.status,
            dueDate: a.dueDate,
            decision: dec
              ? {
                  decision: dec.decision,
                  comment: dec.comment,
                  versionReviewed: dec.versionReviewed,
                  createdAt: dec.createdAt,
                }
              : null,
          };
        }),
      });
    } catch (error: any) {
      logConcept2cureError('review status', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to fetch review status');
    }
  }
);

export default router;
