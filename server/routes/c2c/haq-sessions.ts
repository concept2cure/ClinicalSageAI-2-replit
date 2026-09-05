/**
 * HAQ (health authority question) session persistence for Concept2Cure
 * projects — the HAQ Manager's session state, saved as JSON on a
 * haq_session artifact and read back by the same surface, plus the pending
 * reviews list. The eighth domain carved out of routes/concept2cure.ts
 * (ledger L53, slice 10), mounted at the same prefix ahead of it with the
 * same middleware chain; the handlers moved verbatim.
 *
 * The lineage-save gate declares this file NOT_PROSE: the session content
 * is an opaque questions array the client round-trips, export is refused
 * by its governed contract, and no packager or other reader resolves it
 * into a document.
 *
 * @module server/routes/c2c/haq-sessions
 */

import { Router, type Request, type Response } from 'express';
import { concept2cureArtifacts, concept2cureReviewAssignments } from '../../../shared/schema';
import { type GovernedDocumentActionContract } from '../../../shared/types/document-contract';
import { db } from '../../db';
import { resolveGovernedContext } from '../../services/concept2cure/governedDocumentContractService';
import * as crypto from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logConcept2cureError,
  sendError,
  sendSuccess,
} from './shared';
import { verifyProjectAccess } from './project-access';

const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);


/**
 * PUT /api/concept2cure/projects/:projectId/haq-session
 * Persist a HAQ (Health Authority Question) session to the database.
 * Stores as a JSON artifact so it survives beyond sessionStorage.
 */
router.put('/projects/:projectId/haq-session', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return sendError(res, 400, 'questions must be an array');
    }

    // Check for existing HAQ session artifact
    const [existing] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, Number(req.params.projectId)),
          eq(concept2cureArtifacts.organizationId, organizationId),
          eq(concept2cureArtifacts.type, 'haq_session')
        )
      )
      .limit(1);

    if (existing) {
      const haqUpdateResolution = resolveGovernedContext({
        req,
        projectId: Number(req.params.projectId),
        artifactId: existing.id,
        documentType: 'haq_session',
        generationMode: 'amendment',
        lifecycleStatus:
          (existing.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        originSurface: 'project_workspace_shell',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'strategy_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'strategy',
        placementContainerId: String(req.params.projectId),
        title: 'HAQ Session',
        content: JSON.stringify({ questions }),
        sourceRefs: [`haq_session:${existing.artifactId}`],
        provider: 'concept2cure',
        model: 'haq-session-manager',
        exportAllowed: false,
        eventType: 'artifact.updated',
      });
      if (!haqUpdateResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: haqUpdateResolution.validation.errors,
            warnings: haqUpdateResolution.validation.warnings,
            resolved: haqUpdateResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      // Update existing session
      const existingMetadata =
        existing.metadata && typeof existing.metadata === 'object'
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};
      await db
        .update(concept2cureArtifacts)
        .set({
          content: JSON.stringify({ questions }),
          updatedAt: new Date(),
          metadata: {
            ...existingMetadata,
            questionCount: questions.length,
            harness: {
              ...existingHarness,
              clientTrack: haqUpdateResolution.contract.clientTrack,
              submissionProgram: haqUpdateResolution.contract.submissionProgram,
              persona: haqUpdateResolution.contract.persona,
              regulatorScope: haqUpdateResolution.contract.regulatorScope,
              documentClass: haqUpdateResolution.contract.documentClass,
              readinessGate: haqUpdateResolution.contract.readinessGate,
              workspaceTarget: haqUpdateResolution.contract.workspaceTarget,
              originSurface: haqUpdateResolution.contract.originSurface,
              recommendationSource: haqUpdateResolution.contract.recommendationSource,
              regulatorIntent: haqUpdateResolution.contract.regulatorIntent,
              gateChecks: haqUpdateResolution.contract.exportEligibility.gateChecks,
              blockingReasons: haqUpdateResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: haqUpdateResolution.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(eq(concept2cureArtifacts.id, existing.id));

      return sendSuccess(res, {
        artifactId: existing.artifactId,
        updated: true,
        questionCount: questions.length,
      });
    } else {
      // Create new HAQ session artifact
      const artifactId = `haq_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const haqCreateResolution = resolveGovernedContext({
        req,
        projectId: Number(req.params.projectId),
        artifactId: null,
        documentType: 'haq_session',
        generationMode: 'manual',
        lifecycleStatus: 'draft',
        originSurface: 'project_workspace_shell',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'strategy_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'strategy',
        placementContainerId: String(req.params.projectId),
        title: 'HAQ Session',
        content: JSON.stringify({ questions }),
        sourceRefs: [`haq_session:${artifactId}`],
        provider: 'concept2cure',
        model: 'haq-session-manager',
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!haqCreateResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: haqCreateResolution.validation.errors,
            warnings: haqCreateResolution.validation.warnings,
            resolved: haqCreateResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      await db.insert(concept2cureArtifacts).values({
        artifactId,
        projectId: Number(req.params.projectId),
        organizationId,
        createdById: userId,
        title: 'HAQ Session',
        type: 'haq_session',
        category: 'data',
        content: JSON.stringify({ questions }),
        status: 'draft',
        version: 1,
        metadata: {
          questionCount: questions.length,
          sourceSystem: 'haq_manager',
          harness: {
            clientTrack: haqCreateResolution.contract.clientTrack,
            submissionProgram: haqCreateResolution.contract.submissionProgram,
            persona: haqCreateResolution.contract.persona,
            regulatorScope: haqCreateResolution.contract.regulatorScope,
            documentClass: haqCreateResolution.contract.documentClass,
            readinessGate: haqCreateResolution.contract.readinessGate,
            workspaceTarget: haqCreateResolution.contract.workspaceTarget,
            originSurface: haqCreateResolution.contract.originSurface,
            recommendationSource: haqCreateResolution.contract.recommendationSource,
            regulatorIntent: haqCreateResolution.contract.regulatorIntent,
            gateChecks: haqCreateResolution.contract.exportEligibility.gateChecks,
            blockingReasons: haqCreateResolution.contract.exportEligibility.blockingReasons,
            readinessOutcome: haqCreateResolution.contract.exportEligibility.readinessOutcome,
          },
        },
      });

      return sendSuccess(res, { artifactId, created: true, questionCount: questions.length });
    }
  } catch (error: any) {
    logConcept2cureError('save HAQ session', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to save HAQ session');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/haq-session
 * Load the most recent HAQ session for a project.
 */
router.get('/projects/:projectId/haq-session', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const [session] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, Number(req.params.projectId)),
          eq(concept2cureArtifacts.organizationId, organizationId),
          eq(concept2cureArtifacts.type, 'haq_session')
        )
      )
      .orderBy(desc(concept2cureArtifacts.updatedAt))
      .limit(1);

    if (!session) {
      return sendSuccess(res, { questions: [] });
    }

    try {
      const parsed = JSON.parse(session.content || '{}');
      return sendSuccess(res, {
        questions: parsed.questions || [],
        artifactId: session.artifactId,
      });
    } catch {
      return sendSuccess(res, { questions: [] });
    }
  } catch (error: any) {
    logConcept2cureError('load HAQ session', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to load HAQ session');
  }
});

/**
 * GET /api/concept2cure/reviews/pending
 * Reviewer dashboard: list all pending review assignments for the current user.
 */
router.get('/reviews/pending', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const pendingAssignments = await db
      .select({
        assignmentId: concept2cureReviewAssignments.assignmentId,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        artifactStatus: concept2cureArtifacts.status,
        artifactVersion: concept2cureArtifacts.version,
        reviewRound: concept2cureReviewAssignments.reviewRound,
        status: concept2cureReviewAssignments.status,
        dueDate: concept2cureReviewAssignments.dueDate,
        notes: concept2cureReviewAssignments.notes,
        createdAt: concept2cureReviewAssignments.createdAt,
        projectId: concept2cureArtifacts.projectId,
      })
      .from(concept2cureReviewAssignments)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewAssignments.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewAssignments.reviewerId, userId),
          eq(concept2cureReviewAssignments.organizationId, organizationId),
          inArray(concept2cureReviewAssignments.status, ['pending', 'in_progress']),
          eq(concept2cureArtifacts.status, 'review')
        )
      )
      .orderBy(concept2cureReviewAssignments.dueDate, concept2cureReviewAssignments.createdAt);

    return sendSuccess(res, {
      totalPending: pendingAssignments.length,
      assignments: pendingAssignments.map(a => ({
        assignmentId: a.assignmentId,
        artifactId: a.artifactId,
        artifactTitle: a.artifactTitle,
        artifactStatus: a.artifactStatus,
        artifactVersion: a.artifactVersion,
        projectId: a.projectId,
        reviewRound: a.reviewRound,
        status: a.status,
        dueDate: a.dueDate,
        notes: a.notes,
        createdAt: a.createdAt,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('pending reviews', error);
    return sendError(res, 500, 'Failed to fetch pending reviews');
  }
});

export default router;
