/**
 * The program twin and the project-context reads for Concept2Cure — the
 * program twin, artifact verification, change impact, the CMC data kept in
 * project metadata, and the full project context and transform context AnA
 * is given. The ninth domain carved out of routes/concept2cure.ts (ledger
 * L53, slice 11), mounted at the same prefix ahead of it with the same
 * middleware chain; the handlers moved verbatim.
 *
 * @module server/routes/c2c/program-twin
 */

import { Router, type Request, type Response } from 'express';
import { concept2cureArtifacts, concept2cureProvenanceEvents, concept2cureReviewComments, concept2cureSignatures, projectTasks, projects } from '../../../shared/schema';
import { db } from '../../db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  logConcept2cureError,
  paramStr,
  sendError,
  sendSuccess,
} from './shared';
import { verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-program-twin');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);


/**
 * GET /api/concept2cure/projects/:projectId/program-twin
 * Aggregates project state across dossier, evidence, template, governance,
 * and readiness dimensions. Returns a unified program model.
 * All values labeled as deterministic, heuristic, or inferred.
 */
router.get('/projects/:projectId/program-twin', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // Fetch all artifacts
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const artifactIds = allArtifacts.map(a => a.id);

    // Fetch provenance events
    let provenanceEvents: any[] = [];
    if (artifactIds.length > 0) {
      provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            inArray(concept2cureProvenanceEvents.artifactId, artifactIds),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );
    }

    // Fetch signatures
    let signatures: any[] = [];
    if (artifactIds.length > 0) {
      signatures = await db
        .select()
        .from(concept2cureSignatures)
        .where(inArray(concept2cureSignatures.artifactId, artifactIds));
    }

    // Fetch review comments
    let reviewComments: any[] = [];
    if (artifactIds.length > 0) {
      reviewComments = await db
        .select()
        .from(concept2cureReviewComments)
        .where(inArray(concept2cureReviewComments.artifactId, artifactIds));
    }

    // ── Dossier state ──
    const totalArtifacts = allArtifacts.length;
    const draftCount = allArtifacts.filter(a => (a.status || 'draft') === 'draft').length;
    const reviewCount = allArtifacts.filter(a => (a.status || '') === 'review').length;
    const approvedCount = allArtifacts.filter(a => (a.status || '') === 'approved').length;
    const lockedCount = allArtifacts.filter(a => (a.status || '') === 'locked').length;
    const placedCount = allArtifacts.filter(a => !!a.ctdSection).length;
    const unplacedCount = totalArtifacts - placedCount;

    // Per-module breakdown
    const moduleBreakdown: Record<
      string,
      { total: number; draft: number; review: number; approved: number; locked: number }
    > = {};
    for (const art of allArtifacts) {
      const section = art.ctdSection || '_unplaced';
      const mod = section === '_unplaced' ? '_unplaced' : section.split('.')[0];
      const moduleKey = `Module ${mod}`;
      if (!moduleBreakdown[moduleKey]) {
        moduleBreakdown[moduleKey] = { total: 0, draft: 0, review: 0, approved: 0, locked: 0 };
      }
      const mb = moduleBreakdown[moduleKey];
      mb.total++;
      const s = (art.status || 'draft').toLowerCase();
      if (s === 'approved') mb.approved++;
      else if (s === 'locked') mb.locked++;
      else if (s === 'review') mb.review++;
      else mb.draft++;
    }

    // ── Evidence state ──
    const sourceInputEvents = provenanceEvents.filter(e => e.eventType === 'source_input');
    const generationEvents = provenanceEvents.filter(e => e.eventType === 'generation');
    const evidenceBackedIds = new Set(sourceInputEvents.map(e => e.artifactId));
    const precedentBackedIds = new Set(generationEvents.map(e => e.artifactId));
    const evidenceBackedCount = evidenceBackedIds.size;
    const precedentBackedCount = precedentBackedIds.size;
    const noEvidenceCount = totalArtifacts - evidenceBackedIds.size;
    const noEvidenceArtifacts = allArtifacts
      .filter(a => !evidenceBackedIds.has(a.id))
      .map(a => ({ id: a.artifactId, title: a.title, ctdSection: a.ctdSection }));

    // ── Template state ──
    const withTemplate = allArtifacts.filter(a => !!a.templateId);
    const withoutTemplate = allArtifacts.filter(a => !a.templateId);

    // ── Governance state ──
    const signedArtifactIds = new Set(signatures.map(s => s.artifactId));
    const unresolvedComments = reviewComments.filter(c => !c.resolvedAt);
    const placementEvents = provenanceEvents.filter(e => e.eventType === 'placement');

    // ── Readiness (heuristic) ──
    const authoringReadiness =
      totalArtifacts > 0
        ? Math.round(((approvedCount + lockedCount + reviewCount) / totalArtifacts) * 100)
        : 0;
    const reviewReadiness =
      totalArtifacts > 0 ? Math.round(((approvedCount + lockedCount) / totalArtifacts) * 100) : 0;
    const submissionReadiness =
      totalArtifacts > 0 ? Math.round((lockedCount / totalArtifacts) * 100) : 0;

    // ── Problems list ──
    const problems: {
      severity: 'error' | 'warning' | 'info';
      message: string;
      artifactId?: string;
      ctdSection?: string;
    }[] = [];
    if (unplacedCount > 0) {
      problems.push({
        severity: 'warning',
        message: `${unplacedCount} artifact(s) not placed in dossier`,
      });
    }
    if (noEvidenceCount > 0) {
      problems.push({
        severity: 'warning',
        message: `${noEvidenceCount} artifact(s) have no evidence linkage`,
      });
    }
    if (unresolvedComments.length > 0) {
      problems.push({
        severity: 'error',
        message: `${unresolvedComments.length} unresolved review comment(s)`,
      });
    }
    if (withoutTemplate.length > 0) {
      problems.push({
        severity: 'info',
        message: `${withoutTemplate.length} artifact(s) created without template`,
      });
    }

    return sendSuccess(res, {
      confidence: 'deterministic',
      dossier: {
        confidence: 'deterministic',
        totalArtifacts,
        draftCount,
        reviewCount,
        approvedCount,
        lockedCount,
        placedCount,
        unplacedCount,
        moduleBreakdown,
      },
      evidence: {
        confidence: 'inferred',
        evidenceBackedCount,
        precedentBackedCount,
        noEvidenceCount,
        totalSourceInputEvents: sourceInputEvents.length,
        totalGenerationEvents: generationEvents.length,
        noEvidenceArtifacts: noEvidenceArtifacts.slice(0, 20),
      },
      template: {
        confidence: 'deterministic',
        withTemplateCount: withTemplate.length,
        withoutTemplateCount: withoutTemplate.length,
      },
      governance: {
        confidence: 'deterministic',
        signatureCount: signatures.length,
        signedArtifactCount: signedArtifactIds.size,
        unresolvedCommentCount: unresolvedComments.length,
        placementEventCount: placementEvents.length,
      },
      readiness: {
        confidence: 'heuristic',
        authoringReadiness,
        reviewReadiness,
        submissionReadiness,
      },
      problems,
    });
  } catch (error: any) {
    logConcept2cureError('program-twin', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to compute program twin');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/verification
 * Runs verification checks on a single artifact against placement, template,
 * evidence, and governance expectations.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/verification',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const projectDbId = parseInt(paramStr(req.params.projectId), 10);
      if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

      // Find the artifact
      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.projectId, projectDbId),
            eq(concept2cureArtifacts.organizationId, organizationId),
            eq(concept2cureArtifacts.artifactId, paramStr(req.params.artifactId))
          )
        );

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Fetch related data
      const provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            eq(concept2cureProvenanceEvents.artifactId, artifact.id),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );

      const sigs = await db
        .select()
        .from(concept2cureSignatures)
        .where(eq(concept2cureSignatures.artifactId, artifact.id));

      const comments = await db
        .select()
        .from(concept2cureReviewComments)
        .where(eq(concept2cureReviewComments.artifactId, artifact.id));

      // ── Placement verification ──
      const placementFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      if (!artifact.ctdSection) {
        placementFindings.push({
          status: 'fail',
          message: 'Artifact not placed in dossier',
          confidence: 'deterministic',
        });
      } else {
        placementFindings.push({
          status: 'pass',
          message: `Placed in CTD section ${artifact.ctdSection}`,
          confidence: 'deterministic',
        });
      }

      // ── Template verification ──
      const templateFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      if (!artifact.templateId) {
        templateFindings.push({
          status: 'caution',
          message: 'No template assigned — structure unverifiable',
          confidence: 'deterministic',
        });
      } else {
        templateFindings.push({
          status: 'pass',
          message: `Template: ${artifact.templateId}`,
          confidence: 'deterministic',
        });
        // Check content against expected subsections (heuristic: h1/h2 heading scan)
        const content = artifact.content || '';
        const headings = (content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/gi) || []).map(h =>
          h
            .replace(/<[^>]+>/g, '')
            .trim()
            .toLowerCase()
        );
        templateFindings.push({
          status: headings.length > 0 ? 'pass' : 'caution',
          message: `${headings.length} section heading(s) found in content`,
          confidence: 'heuristic',
        });
      }

      // ── Evidence verification ──
      const evidenceFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      const sourceInputs = provenanceEvents.filter(e => e.eventType === 'source_input');
      const generations = provenanceEvents.filter(e => e.eventType === 'generation');
      if (sourceInputs.length === 0 && generations.length === 0) {
        evidenceFindings.push({
          status: 'caution',
          message: 'No evidence or precedent events linked',
          confidence: 'inferred',
        });
      } else {
        if (sourceInputs.length > 0) {
          evidenceFindings.push({
            status: 'pass',
            message: `${sourceInputs.length} source input event(s)`,
            confidence: 'inferred',
          });
        }
        if (generations.length > 0) {
          evidenceFindings.push({
            status: 'pass',
            message: `${generations.length} generation event(s)`,
            confidence: 'inferred',
          });
        }
      }

      // ── Governance verification ──
      const govFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      const status = (artifact.status || 'draft').toLowerCase();
      govFindings.push({
        status: 'pass',
        message: `Status: ${status}`,
        confidence: 'deterministic',
      });
      if (sigs.length > 0) {
        govFindings.push({
          status: 'pass',
          message: `${sigs.length} signature(s)`,
          confidence: 'deterministic',
        });
      } else {
        govFindings.push({
          status: status === 'locked' ? 'caution' : 'pass',
          message: 'No signatures',
          confidence: 'deterministic',
        });
      }
      const unresolvedComments = comments.filter(c => !c.resolvedAt);
      if (unresolvedComments.length > 0) {
        govFindings.push({
          status: 'fail',
          message: `${unresolvedComments.length} unresolved review comment(s)`,
          confidence: 'deterministic',
        });
      }
      if (artifact.contentHash) {
        govFindings.push({
          status: 'pass',
          message: 'Content hash present (integrity chain active)',
          confidence: 'deterministic',
        });
      } else {
        govFindings.push({
          status: 'caution',
          message: 'No content hash — integrity unverifiable',
          confidence: 'deterministic',
        });
      }

      // ── Overall score ──
      const allFindings = [
        ...placementFindings,
        ...templateFindings,
        ...evidenceFindings,
        ...govFindings,
      ];
      const failCount = allFindings.filter(f => f.status === 'fail').length;
      const cautionCount = allFindings.filter(f => f.status === 'caution').length;
      const passCount = allFindings.filter(f => f.status === 'pass').length;
      const total = allFindings.length;
      const overallStatus: 'pass' | 'caution' | 'fail' =
        failCount > 0 ? 'fail' : cautionCount > 0 ? 'caution' : 'pass';
      const score = total > 0 ? Math.round((passCount / total) * 100) : 0;

      // ── Recommended actions ──
      const recommendedActions: string[] = [];
      if (!artifact.ctdSection) recommendedActions.push('Place artifact in a CTD section');
      if (!artifact.templateId) recommendedActions.push('Assign a template for structure guidance');
      if (sourceInputs.length === 0) recommendedActions.push('Link evidence sources');
      if (unresolvedComments.length > 0)
        recommendedActions.push('Resolve outstanding review comments');
      if (!artifact.contentHash) recommendedActions.push('Save to generate integrity hash');
      if (sigs.length === 0 && (status === 'approved' || status === 'locked')) {
        recommendedActions.push('Add electronic signature for compliance');
      }

      return sendSuccess(res, {
        artifactId: artifact.artifactId,
        title: artifact.title,
        overallStatus,
        score,
        placement: { findings: placementFindings },
        templateConformance: { findings: templateFindings },
        evidenceSupport: { findings: evidenceFindings },
        governance: { findings: govFindings },
        findings: allFindings,
        recommendedActions,
      });
    } catch (error: any) {
      logConcept2cureError('artifact-verification', error, {
        projectId: paramStr(req.params.projectId),
        artifactId: paramStr(req.params.artifactId),
      });
      return sendError(res, 500, 'Failed to run verification');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/change-impact
 * Computes downstream impact for a proposed change scenario.
 * Query params: scenarioType, artifactId, targetSection, targetStatus
 */
router.get('/projects/:projectId/change-impact', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const scenarioType = (req.query.scenarioType as string) || 'section_move';
    const artifactId = req.query.artifactId as string;
    const targetSection = req.query.targetSection as string;
    const targetStatus = req.query.targetStatus as string;

    // Fetch all artifacts for context
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const impacts: {
      type: string;
      severity: 'high' | 'medium' | 'low';
      message: string;
      affectedArtifactId?: string;
      confidence: string;
    }[] = [];

    if (scenarioType === 'section_move' && artifactId && targetSection) {
      const art = allArtifacts.find(a => a.artifactId === artifactId);
      if (art) {
        // Affected: other artifacts in same section
        const sameSectionArts = allArtifacts.filter(
          a => a.ctdSection === art.ctdSection && a.artifactId !== artifactId
        );
        if (sameSectionArts.length > 0) {
          impacts.push({
            type: 'dossier',
            severity: 'medium',
            message: `${sameSectionArts.length} artifact(s) remain in section ${art.ctdSection}`,
            confidence: 'deterministic',
          });
        }
        // Check if target section already has artifacts
        const targetArts = allArtifacts.filter(a => a.ctdSection === targetSection);
        if (targetArts.length > 0) {
          impacts.push({
            type: 'dossier',
            severity: 'low',
            message: `Target section ${targetSection} already has ${targetArts.length} artifact(s)`,
            confidence: 'deterministic',
          });
        }
        // If artifact is approved/locked, warn about governance
        if (art.status === 'approved' || art.status === 'locked') {
          impacts.push({
            type: 'governance',
            severity: 'high',
            message: `Moving ${art.status} artifact requires governance review`,
            confidence: 'deterministic',
          });
        }
      }
    }

    if (scenarioType === 'status_change' && artifactId && targetStatus) {
      const art = allArtifacts.find(a => a.artifactId === artifactId);
      if (art) {
        const currentStatus = (art.status || 'draft').toLowerCase();
        if (targetStatus === 'locked' && currentStatus !== 'approved') {
          impacts.push({
            type: 'governance',
            severity: 'high',
            message: 'Locking requires approved status first',
            confidence: 'deterministic',
          });
        }
        if (
          targetStatus === 'draft' &&
          (currentStatus === 'approved' || currentStatus === 'locked')
        ) {
          impacts.push({
            type: 'governance',
            severity: 'high',
            message: `Reverting from ${currentStatus} to draft invalidates signatures`,
            confidence: 'deterministic',
          });
        }
      }
    }

    if (scenarioType === 'template_switch' && artifactId) {
      impacts.push({
        type: 'template',
        severity: 'medium',
        message: 'Template switch may invalidate existing subsection structure',
        confidence: 'heuristic',
      });
    }

    if (scenarioType === 'evidence_change' && artifactId) {
      impacts.push({
        type: 'evidence',
        severity: 'medium',
        message: 'Evidence source changes may affect provenance chain',
        confidence: 'heuristic',
      });
    }

    return sendSuccess(res, {
      scenarioType,
      artifactId: artifactId || null,
      impacts,
      affectedCount: impacts.length,
    });
  } catch (error: any) {
    logConcept2cureError('change-impact', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to compute change impact');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CMC DATA ENDPOINTS — Unified with concept2cure projects
// Stores CMC data (Drug Substance, Drug Product) in project.metadata
// ═══════════════════════════════════════════════════════════════════════════════

const cmcDataSchema = z.object({
  drugSubstance: z
    .object({
      substanceName: z.string().optional(),
      inn: z.string().optional(),
      cas: z.string().optional(),
      molecularFormula: z.string().optional(),
      molecularWeight: z.string().optional(),
      manufacturingRoute: z.string().optional(),
      structureDescription: z.string().optional(),
      polymorph: z.string().optional(),
      solubility: z.string().optional(),
      meltingPoint: z.string().optional(),
      hygroscopicity: z.string().optional(),
    })
    .optional(),
  drugProduct: z
    .object({
      productName: z.string().optional(),
      dosageForm: z.string().optional(),
      routeOfAdmin: z.string().optional(),
      strength: z.string().optional(),
      containerClosure: z.string().optional(),
      composition: z.string().optional(),
      excipients: z.string().optional(),
      overages: z.string().optional(),
      shelfLife: z.string().optional(),
      storageConditions: z.string().optional(),
    })
    .optional(),
  specifications: z.array(z.any()).optional(),
  stabilityStudies: z.array(z.any()).optional(),
  impurities: z.array(z.any()).optional(),
});

// GET CMC data for a project
router.get('/projects/:projectId/cmc', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 404, 'Project not found');

    const metadata = (project.metadata as Record<string, any>) || {};
    return sendSuccess(res, {
      drugSubstance: metadata.cmcDrugSubstance || null,
      drugProduct: metadata.cmcDrugProduct || null,
      specifications: metadata.cmcSpecifications || [],
      stabilityStudies: metadata.cmcStabilityStudies || [],
      impurities: metadata.cmcImpurities || [],
      lastUpdated: metadata.cmcLastUpdated || null,
    });
  } catch (error) {
    logger.error('Failed to get CMC data', { error });
    return sendError(res, 500, 'Failed to get CMC data');
  }
});

// SAVE CMC data for a project
router.put('/projects/:projectId/cmc', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const parsed = cmcDataSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, `Invalid CMC data: ${parsed.error.message}`);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 404, 'Project not found');

    const existingMetadata = (project.metadata as Record<string, any>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      cmcDrugSubstance: parsed.data.drugSubstance || existingMetadata.cmcDrugSubstance,
      cmcDrugProduct: parsed.data.drugProduct || existingMetadata.cmcDrugProduct,
      cmcSpecifications: parsed.data.specifications || existingMetadata.cmcSpecifications || [],
      cmcStabilityStudies:
        parsed.data.stabilityStudies || existingMetadata.cmcStabilityStudies || [],
      cmcImpurities: parsed.data.impurities || existingMetadata.cmcImpurities || [],
      cmcLastUpdated: new Date().toISOString(),
    };

    await db.update(projects).set({ metadata: updatedMetadata }).where(eq(projects.id, projectId));

    return sendSuccess(res, { saved: true, lastUpdated: updatedMetadata.cmcLastUpdated });
  } catch (error) {
    logger.error('Failed to save CMC data', { error });
    return sendError(res, 500, 'Failed to save CMC data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT CONTEXT ENDPOINT — Full context for AnA/Cortex AI
// Returns project details + tasks + CMC data + knowledge for AI context injection
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/projects/:projectId/context', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 404, 'Project not found');

    // Fetch tasks (limit to recent 50 — only 10 are returned to client)
    const tasks = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(desc(projectTasks.createdAt))
      .limit(50);

    // Build task summary
    const taskSummary = {
      total: tasks.length,
      completed: tasks.filter(t => (t as any).status === 'done').length,
      inProgress: tasks.filter(t => (t as any).status === 'in-progress').length,
      blocked: tasks.filter(t => (t as any).status === 'blocked').length,
      overdue: tasks.filter(t => {
        const dueDate = (t as any).dueDate;
        return dueDate && new Date(dueDate) < new Date() && (t as any).status !== 'done';
      }).length,
    };

    // Extract CMC data from metadata
    const metadata = (project.metadata as Record<string, any>) || {};
    const settings = (project.settings as Record<string, any>) || {};

    // Extract knowledge/custom instructions
    const knowledge = settings.knowledge || {};

    return sendSuccess(res, {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        type: project.type,
        status: project.status,
        priority: project.priority,
        progress: project.progress,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        riskLevel: project.riskLevel,
        tags: project.tags,
      },
      tasks: {
        summary: taskSummary,
        recent: tasks.slice(0, 10).map(t => ({
          id: (t as any).id,
          name: (t as any).name,
          status: (t as any).status,
          priority: (t as any).priority,
          dueDate: (t as any).dueDate,
        })),
      },
      cmc: {
        drugSubstance: metadata.cmcDrugSubstance || null,
        drugProduct: metadata.cmcDrugProduct || null,
        hasSpecifications: (metadata.cmcSpecifications || []).length > 0,
        hasStabilityStudies: (metadata.cmcStabilityStudies || []).length > 0,
        hasImpurities: (metadata.cmcImpurities || []).length > 0,
      },
      knowledge: {
        customInstructions: knowledge.customInstructions || null,
        documentCount: (knowledge.documents || []).length,
      },
    });
  } catch (error) {
    logger.error('Failed to get project context', { error });
    return sendError(res, 500, 'Failed to get project context');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/transform-context
 * Returns the context needed for the Regulatory Transform Canvas:
 * source docs, evidence counts, precedent counts, CTD targets, templates, and project context.
 */
router.get('/projects/:projectId/transform-context', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // Fetch project
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectDbId), eq(projects.organizationId, organizationId)));

    if (!project) return sendError(res, 404, 'Project not found');

    // Fetch artifacts
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    // Fetch provenance
    const artifactIds = allArtifacts.map(a => a.id);
    let provenanceEvents: any[] = [];
    if (artifactIds.length > 0) {
      provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            inArray(concept2cureProvenanceEvents.artifactId, artifactIds),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );
    }

    const sourceInputs = provenanceEvents.filter(e => e.eventType === 'source_input').length;
    const generations = provenanceEvents.filter(e => e.eventType === 'generation').length;

    // Distinct CTD sections with artifacts
    const ctdSections = [
      ...new Set(allArtifacts.filter(a => a.ctdSection).map(a => a.ctdSection!)),
    ].sort();

    // Template usage
    const templateIds = [
      ...new Set(allArtifacts.filter(a => a.templateId).map(a => a.templateId!)),
    ];

    return sendSuccess(res, {
      project: {
        id: project.id,
        name: project.name,
        submissionType: (project.metadata as Record<string, any> | null)?.submissionType ?? null,
        sponsor: project.sponsors?.[0] ?? null,
        indication: project.therapeuticArea,
        region: (project.metadata as Record<string, any> | null)?.regulatoryRegion ?? null,
      },
      artifacts: {
        total: allArtifacts.length,
        byStatus: {
          draft: allArtifacts.filter(a => (a.status || 'draft') === 'draft').length,
          review: allArtifacts.filter(a => a.status === 'review').length,
          approved: allArtifacts.filter(a => a.status === 'approved').length,
          locked: allArtifacts.filter(a => a.status === 'locked').length,
        },
      },
      evidence: {
        sourceInputCount: sourceInputs,
        generationCount: generations,
        confidence: 'inferred',
      },
      ctdSections,
      templateIds,
    });
  } catch (error: any) {
    logConcept2cureError('transform-context', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to load transform context');
  }
});

export default router;
