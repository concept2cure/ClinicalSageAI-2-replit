/**
 * The two sources a project's knowledge base draws on — connected apps
 * (list, connect, disconnect) and uploaded documents (upload with extraction
 * and embedding, delete, activation in the AI context window). Ledger L53,
 * slice 14: moved verbatim out of routes/concept2cure.ts with the upload
 * middleware, MIME allow-list and filename/token helpers only these handlers
 * use; mounted at the same prefix ahead of the main router with the same
 * middleware chain, dynamic service imports re-pointed one directory up.
 *
 * @module server/routes/c2c/knowledge-sources
 */

import { Router, type Request, type Response } from 'express';
import { concept2cureArtifactVersions, concept2cureArtifacts, projects } from '../../../shared/schema';
import { db, pool } from '../../db';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import { resolveGovernedContext } from '../../services/concept2cure/governedDocumentContractService';
import { ingestContextualChunks } from '../../services/projects/contextual-ingest.js';
import { extractUploadedText } from '../../services/projects/extract-text.js';
import { refreshProjectRetrievalMode } from '../../services/projects/retrieval-mode.js';
import * as crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  type ConnectedAppRecord,
  type ProjectKnowledge,
  type UploadedDocument,
  calculateContentHash,
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  normalizeConnectedApps,
  normalizeKnowledge,
  paramStr,
  sanitizeContent,
  sendError,
  sendSuccess,
} from './shared';
import { normalizeProjectSettings } from './project-access';

const logger = createScopedLogger('concept2cure-knowledge-sources');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const allowedKnowledgeMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'document');
  return base.replace(/[^\w.\-() ]+/g, '_');
}

function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes * 0.25);
}

/**
 * Known app IDs — server-side allowlist prevents arbitrary injection.
 *
 * Contains the 20 canonical catalog IDs (post-convergence) plus 9 legacy IDs
 * preserved for back-compat with stored project app connections, saved nav
 * targets, and external action handlers. Legacy IDs are normalized to their
 * canonical equivalents on the client side.
 */
const KNOWN_APP_IDS = new Set([
  // ── Strategy & Research ──
  'deep-research',
  'precedent-intelligence',
  'device-strategy',
  // ── Submission Authoring ──
  'medical-device',
  'ind-authoring',
  'cmc',
  'safety-narrative',
  'report-engine',
  // ── Intelligence & Analysis ──
  'regulatory-intelligence',
  'csr-intelligence',
  'biostatistics',
  'protocol-designer',
  'cortex-prime',
  'foresight-ai',
  'predicate-intelligence',
  // ── Quality & Lifecycle ──
  'device-engineering',
  'dossier-navigator',
  'ectd-navigator',
  'document-vault',
  'sop-management',
  'capa-management',
  'post-market',
  'inspection-readiness',
  // ── Legacy IDs (back-compat) ──
  'cmc-platform',         // → cmc
  'csr-builder',          // → csr-intelligence
  '510k-workspace',       // → medical-device
  'pma-workspace',        // → medical-device
  'cer-generator',        // → medical-device
  'device-pathway',       // → device-strategy
  'q-submission',         // → device-strategy
  'predicate-finder',     // → device-strategy
  'risk-management',      // → device-engineering
  'samd-cybersecurity',   // → device-engineering
  'human-factors',        // → device-engineering
  'biocompatibility',     // → device-engineering
  // ── Pre-existing IDs not in current catalog (preserved) ──
  'compliance-monitor',
  'evidence-engine',
]);

const MAX_CONNECTED_APPS = 20;

const connectAppSchema = z.object({
  appId: z.string().min(1).max(80),
  memoryRole: z.string().max(1000).optional(),
});

/** Build the aggregated memory context string from all active connected apps */
function buildAppMemoryContext(apps: ConnectedAppRecord[]): string {
  return apps
    .filter(a => a.status === 'active' && a.memoryRole)
    .map(a => a.memoryRole)
    .join('\n');
}

/** Merge appContext into the project settings.knowledge object */
function syncKnowledgeAppContext(
  settings: Record<string, unknown>,
  appContext: string
): Record<string, unknown> {
  const knowledge =
    settings.knowledge && typeof settings.knowledge === 'object'
      ? { ...(settings.knowledge as Record<string, unknown>) }
      : {};
  knowledge.appContext = appContext;
  return { ...settings, knowledge };
}

/**
 * GET /api/concept2cure/projects/:projectId/apps
 * List apps connected to this project with metadata.
 */
router.get('/projects/:projectId/apps', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const apps = normalizeConnectedApps(settings);
    return sendSuccess(res, {
      apps,
      totalConnected: apps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project apps', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project apps');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/apps
 * Connect an app to the project. Validates against known catalog, stores connection,
 * and initializes app's memory role in the project context for AnA.
 */
router.post('/projects/:projectId/apps', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const body = connectAppSchema.parse(req.body);
    const { appId } = body;

    // Validate against known catalog
    if (!KNOWN_APP_IDS.has(appId)) {
      return sendError(res, 400, `Unknown app ID: ${appId}`, undefined, 'UNKNOWN_APP');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const apps = normalizeConnectedApps(settings);

    // Prevent duplicate connections
    if (apps.some(a => a.appId === appId)) {
      return sendError(res, 409, 'App is already connected to this project');
    }

    // Enforce max connected apps
    if (apps.length >= MAX_CONNECTED_APPS) {
      return sendError(
        res,
        400,
        `Maximum of ${MAX_CONNECTED_APPS} connected apps reached. Disconnect one first.`
      );
    }

    // Sanitize memoryRole if provided
    const sanitizedRole = body.memoryRole ? sanitizeContent(body.memoryRole) : undefined;

    const newApp: ConnectedAppRecord = {
      appId,
      connectedAt: new Date().toISOString(),
      status: 'active',
      ...(sanitizedRole ? { memoryRole: sanitizedRole } : {}),
    };

    const updatedApps = [...apps, newApp];
    let updatedSettings: Record<string, unknown> = { ...settings, connectedApps: updatedApps };

    // Rebuild and sync aggregated memory context
    const appContext = buildAppMemoryContext(updatedApps);
    updatedSettings = syncKnowledgeAppContext(updatedSettings, appContext);

    const [updatedProject] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updatedProject);

    logger.info('App connected to project', {
      projectId: numericId,
      appId,
      totalConnected: updatedApps.length,
    });

    return sendSuccess(res, {
      app: newApp,
      totalConnected: updatedApps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to connect app to project', { error: error.message });
    return sendError(res, 500, 'Failed to connect app to project');
  }
});

/**
 * DELETE /api/concept2cure/projects/:projectId/apps/:appId
 * Disconnect an app from the project. Removes its memory role from context.
 */
router.delete('/projects/:projectId/apps/:appId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const { appId } = req.params;
    if (!appId || typeof appId !== 'string') {
      return sendError(res, 400, 'appId is required');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const apps = normalizeConnectedApps(settings);
    const removedApp = apps.find(a => a.appId === appId);

    if (!removedApp) {
      return sendError(res, 404, 'App not found in project connections');
    }

    const updatedApps = apps.filter(a => a.appId !== appId);
    let updatedSettings: Record<string, unknown> = { ...settings, connectedApps: updatedApps };

    // Rebuild and sync aggregated memory context (removes this app's role)
    const appContext = buildAppMemoryContext(updatedApps);
    updatedSettings = syncKnowledgeAppContext(updatedSettings, appContext);

    const [updatedProject] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updatedProject);

    logger.info('App disconnected from project', {
      projectId: numericId,
      appId,
      totalConnected: updatedApps.length,
    });

    return sendSuccess(res, {
      disconnected: appId,
      totalConnected: updatedApps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    logger.error('Failed to disconnect app from project', { error: error.message });
    return sendError(res, 500, 'Failed to disconnect app from project');
  }
});

/**
 * POST /api/concept2cure/documents/upload
 * Upload a document and attach to project knowledge.
 */
router.post(
  '/documents/upload',
  knowledgeUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const projectIdRaw = req.body.projectId as string | undefined;
      const file = req.file;

      if (!projectIdRaw) {
        return sendError(res, 400, 'Project ID is required');
      }

      const numericId = parseIntegerProjectId(projectIdRaw);
      if (numericId === null) {
        return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
      }

      if (!file) {
        return sendError(res, 400, 'File is required');
      }

      if (!allowedKnowledgeMimeTypes.has(file.mimetype)) {
        return sendError(res, 400, `Unsupported file type: ${file.mimetype}`);
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
        .limit(1);

      if (!project) {
        return sendError(res, 404, 'Project not found');
      }

      const safeOriginalName = sanitizeFilename(file.originalname);
      const extension = safeOriginalName.split('.').pop()?.toLowerCase() || 'unknown';
      const uploadedAt = new Date();
      const documentId = `doc_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const tokenCount = estimateTokensFromBytes(file.size);

      // ── DOSSIER-AWARE CLASSIFICATION (Phase 1 — Module 3 Workflow Convergence) ──
      // These fields allow callers to classify uploads by dossier module, CTD section,
      // source type, and whether the file feeds Module 3 source extraction.
      // All fields are optional — generic uploads still work without classification.
      const dossierClassification = {
        submissionTrack: req.body.submissionTrack || null,       // IND | NDA | BLA | 510K | PMA | SOP | CER | general
        moduleCode: req.body.moduleCode || null,                 // 1 | 2 | 3 | 4 | 5
        ctdSection: req.body.ctdSection || null,                 // e.g. 3.2.S.4, 3.2.P.8
        documentFamily: req.body.documentFamily || null,         // spec | method | stability | batch | narrative | sop | ref_std | etc.
        sourceType: req.body.sourceType || null,                 // maps to CmcSourceType for Module 3
        tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags]) : [],
        feedsModule3: req.body.feedsModule3 === 'true' || req.body.feedsModule3 === true,
        sourceProcessingMode: req.body.sourceProcessingMode || 'artifact_only', // artifact_only | artifact_plus_source_object
      };

      // Extract real text from PDF/DOCX (and pass through plain text) so binary
      // uploads are searchable in retrieval and the in-context corpus; fall back
      // to a placeholder when extraction yields nothing.
      const extracted = await extractUploadedText(file.buffer, file.mimetype, safeOriginalName);
      const extractedText =
        extracted && extracted.length > 0
          ? extracted
          : `[${file.mimetype} document ${safeOriginalName}]`;

      const document: UploadedDocument = {
        id: documentId,
        name: safeOriginalName,
        type: extension,
        size: file.size,
        uploadedAt: uploadedAt.toISOString(),
        tokenCount,
        status: 'processed',
      };

      // ── CONVERGENCE: create governed source artifact before mutating project knowledge ──
      const userId = getUserId(req);
      const artifactId = `artifact_upload_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const contentForArtifact =
        extractedText && extractedText.length > 10
          ? extractedText
          : `[Uploaded file: ${safeOriginalName}] (${file.mimetype}, ${file.size} bytes)`;
      const contentHash = calculateContentHash(contentForArtifact);
      const uploadGovernedResolution = resolveGovernedContext({
        req,
        projectId: numericId,
        artifactId: null,
        documentType: 'source_document',
        generationMode: 'imported',
        lifecycleStatus: 'draft',
        originSurface: 'import_pipeline',
        clientTrack:
          req.body?.clientTrack === 'device'
            ? 'device'
            : req.body?.clientTrack === 'diagnostics'
            ? 'diagnostics'
            : 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'evidence_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'evidence_analysis',
        placementContainerId: String(numericId),
        title: safeOriginalName,
        content: contentForArtifact,
        sourceRefs: [`upload:${documentId}`],
        provider: 'upload_pipeline',
        model: 'import_handler',
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!uploadGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: uploadGovernedResolution.validation.errors,
            warnings: uploadGovernedResolution.validation.warnings,
            resolved: uploadGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const [newArtifact] = await db
        .insert(concept2cureArtifacts)
        .values({
          organizationId,
          projectId: numericId,
          artifactId,
          type: 'source_document',
          category: 'source',
          title: safeOriginalName,
          content: contentForArtifact,
          contentHash,
          version: 1,
          ctdSection: dossierClassification.ctdSection || undefined,
          metadata: {
            originalName: safeOriginalName,
            mimeType: file.mimetype,
            fileSize: file.size,
            extension,
            tokenCount,
            uploadSource: 'knowledge_upload',
            knowledgeDocumentId: documentId,
            dossierClassification,
            harness: {
              clientTrack: uploadGovernedResolution.contract.clientTrack,
              submissionProgram: uploadGovernedResolution.contract.submissionProgram,
              persona: uploadGovernedResolution.contract.persona,
              regulatorScope: uploadGovernedResolution.contract.regulatorScope,
              documentClass: uploadGovernedResolution.contract.documentClass,
              readinessGate: uploadGovernedResolution.contract.readinessGate,
              workspaceTarget: uploadGovernedResolution.contract.workspaceTarget,
              originSurface: uploadGovernedResolution.contract.originSurface,
              recommendationSource: uploadGovernedResolution.contract.recommendationSource,
              regulatorIntent: uploadGovernedResolution.contract.regulatorIntent,
              gateChecks: uploadGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: uploadGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome:
                uploadGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          createdById: userId,
        })
        .returning();

      // Version entry
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: newArtifact.id,
        version: 1,
        content: contentForArtifact,
        contentHash,
        createdById: userId,
      });

      const artifactRecord: { id: number; artifactId: string } = { id: newArtifact.id, artifactId };

      // ── AUTO-EMBED: Insert into lumen_data_atoms + generate embedding ──
      try {
        const atomResult = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'data_room_upload', $2, 'source_document', $3, $4, $5, 0.9, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            organizationId,
            artifactId,
            safeOriginalName,
            contentForArtifact.substring(0, 16000),
            `{source,upload,${extension}${dossierClassification.ctdSection ? `,${dossierClassification.ctdSection}` : ''}${dossierClassification.sourceType ? `,${dossierClassification.sourceType}` : ''}${dossierClassification.feedsModule3 ? ',module3_source' : ''}}`,
          ]
        );
        if (atomResult.rows.length > 0) {
          const atomId = atomResult.rows[0].id;
          const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
          const embeddingService = getEmbeddingService(pool);
          await embeddingService.embedAtom(atomId);
          logger.info('Source document auto-embedded for retrieval', { artifactId, atomId });
        }
      } catch (embedErr: any) {
        logger.warn('Auto-embedding failed (non-fatal)', { error: embedErr.message });
      }

      // ── A3 contextual-retrieval ingest (dark-launched) ──
      // When enabled, also store contextualized chunk atoms (chunk + a per-chunk
      // situating context generated via the gateway) for finer-grained
      // retrieval. Off by default — the per-chunk gateway calls cost tokens, so
      // validate cost/quality before enabling. Fire-and-forget so it never
      // blocks the upload response; additive to the whole-document atom above.
      if (
        process.env.PROJECT_CONTEXTUAL_INGEST_ENABLED === 'true' &&
        extractedText &&
        extractedText.length > 200
      ) {
        void ingestContextualChunks({
          artifactId,
          organizationId,
          title: safeOriginalName,
          text: extractedText,
          ctdSection: dossierClassification.ctdSection,
        });
      }

      // ── Record dossier classification provenance ──
      if (dossierClassification.ctdSection || dossierClassification.feedsModule3) {
        try {
          await pool.query(
            `INSERT INTO concept2cure_provenance_events
               (organization_id, artifact_id, artifact_version_id, event_type, event_action, actor_id, details, backend_route, backend_service)
             VALUES ($1, $2, NULL, 'source_input', 'dossier_classify', $3, $4::jsonb, '/documents/upload', 'upload_pipeline')`,
            [
              organizationId,
              newArtifact.id,
              userId,
              JSON.stringify({
                classification: dossierClassification,
                fileName: safeOriginalName,
                documentId,
              }),
            ]
          );
        } catch (provErr: any) {
          logger.warn('Dossier classification provenance event failed (non-fatal)', { error: provErr.message });
        }
      }

      // ── AUTO-MAP: If feedsModule3, create/update cmc_source_object from uploaded artifact ──
      if (dossierClassification.feedsModule3 && dossierClassification.sourceType) {
        try {
          const { classifyAndMapArtifactToSource } = await import('../../services/module3-convergence-service');
          await classifyAndMapArtifactToSource(organizationId, projectIdRaw, artifactId, {
            submissionTrack: (dossierClassification.submissionTrack || 'general') as any,
            dossierModule: dossierClassification.moduleCode,
            ctdSection: dossierClassification.ctdSection,
            sourceType: dossierClassification.sourceType as any,
            useAsModule3Source: true,
            tags: dossierClassification.tags || [],
          });
          logger.info('Auto-mapped uploaded artifact to Module 3 source object', {
            artifactId,
            sourceType: dossierClassification.sourceType,
            ctdSection: dossierClassification.ctdSection,
          });
        } catch (mapErr: any) {
          logger.warn('Module 3 source mapping failed (non-fatal)', { error: mapErr.message });
        }
      }

      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      const updatedKnowledge: ProjectKnowledge = {
        ...knowledge,
        documents: [...knowledge.documents, document],
        customInstructions: knowledge.customInstructions,
        context: knowledge.context,
      };

      const updatedSettings = {
        ...settings,
        customInstructions: updatedKnowledge.customInstructions,
        knowledge: updatedKnowledge,
      };

      const [updated] = await db
        .update(projects)
        .set({ settings: updatedSettings, updatedAt: new Date() })
        .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
        .returning();

      await logAuditEntry(req, 'UPDATE', 'project', projectIdRaw, project, updated);

      // A2: the corpus grew with this upload — recompute the retrieval mode
      // (fire-and-forget; never blocks the upload response).
      void refreshProjectRetrievalMode(numericId, organizationId);

      res.status(201);
      return sendSuccess(res, {
        document,
        extractedText,
        tokenCount,
        artifact: artifactRecord,
      });
    } catch (error: any) {
      logger.error('Failed to upload knowledge document', { error: error.message });
      return sendError(res, 500, 'Failed to upload knowledge document');
    }
  }
);

/**
 * DELETE /api/concept2cure/documents/:documentId
 * Remove a document from project knowledge.
 */
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = req.params.documentId;

    const dbProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.actualEndDate)));

    const target = dbProjects.find(project => {
      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      return knowledge.documents.some(doc => doc.id === documentId);
    });

    if (!target) {
      return sendError(res, 404, 'Document not found');
    }

    const settings = normalizeProjectSettings(target.settings);
    const knowledge = normalizeKnowledge(settings);
    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      documents: knowledge.documents.filter(doc => doc.id !== documentId),
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, target.id), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${target.id}`, target, updated);

    return sendSuccess(res, { deleted: true, documentId });
  } catch (error: any) {
    logger.error('Failed to delete knowledge document', { error: error.message });
    return sendError(res, 500, 'Failed to delete knowledge document');
  }
});

/**
 * PATCH /api/concept2cure/documents/:documentId/activation
 * Toggle a document's active state in the AI context window (E7).
 * Body: { isActive: boolean }
 */
router.patch('/documents/:documentId/activation', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = req.params.documentId;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return sendError(res, 400, 'isActive must be a boolean');
    }

    const dbProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.actualEndDate)));

    const target = dbProjects.find(project => {
      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      return knowledge.documents.some(doc => doc.id === documentId);
    });

    if (!target) {
      return sendError(res, 404, 'Document not found');
    }

    const settings = normalizeProjectSettings(target.settings);
    const knowledge = normalizeKnowledge(settings);
    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      documents: knowledge.documents.map(doc =>
        doc.id === documentId ? { ...doc, isActive } : doc
      ),
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, target.id), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${target.id}`, target, updated);

    return sendSuccess(res, { documentId, isActive });
  } catch (error: any) {
    logger.error('Failed to toggle document activation', { error: error.message });
    return sendError(res, 500, 'Failed to toggle document activation');
  }
});

export default router;
