/**
 * @fileoverview Unified routes for audit-gap remediation services
 * @module server/routes/audit-services
 * @version 1.0.0
 *
 * Exposes REST endpoints for:
 * - Figure generation (figureGenerationService)
 * - Document export — PDF + eCTD XML (documentExportService)
 * - Sentence-level traceability (sentenceTraceabilityService)
 * - Keyword extraction (keywordExtractionService)
 * - Auto-extraction pipeline (autoExtractionPipeline)
 * - Confidence scoring & data verification (confidenceScoringEngine)
 */

import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { z } from 'zod';
import { requireProjectAdmission, ProjectAdmissionRefusal } from './c2c/project-access';
import { requestConnectable } from '../db/requestDb';
import { setAuditRowHeaders, combineAuditRowOutcomes } from '../services/audit/audit-write-outcome';

import { createScopedLogger } from '../utils/logger.js';
import { serverError } from '../lib/api-response';
import { requireAuthedOrgId } from '../utils/authedOrgId.js';

const logger = createScopedLogger('audit-services');

/** The signed-in user's id, or null — never a stand-in 0. */
function sessionUserId(req: Request): number | null {
  const user = (req as any).user;
  const id = Number(user?.id ?? user?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const router = Router();

// Lazy-import services to avoid startup crashes if deps are missing
async function getSvc<T>(loader: () => Promise<unknown>): Promise<T> {
  return (await loader()) as T;
}

const positiveProjectId = z.number().int().positive();
const figureRequestSchema = z.object({
  projectId: positiveProjectId,
  figureType: z.enum(['bar_chart','line_chart','scatter_plot','kaplan_meier','forest_plot','waterfall_plot',
    'consort_flow','process_flow','org_chart','gantt_chart','pie_chart','box_plot','heatmap','dose_response',
    'pk_concentration','stability_trend','comparison_table','decision_tree','custom']),
  title: z.string().min(1).max(500), description: z.string().max(10000).default(''),
  targetSection: z.string().max(100).optional(), sourceDataRefs: z.array(z.string().regex(/^[1-9]\d*$/)).max(100).optional(),
  rawData: z.array(z.record(z.unknown())).max(10000).optional(),
  preferences: z.object({ style:z.enum(['clinical','regulatory','presentation']).optional(),
    colorScheme:z.enum(['default','grayscale','high-contrast']).optional(), format:z.enum(['mermaid','chartjs','svg']).optional() }).optional(),
});
function contentError(error: unknown, res: Response): boolean {
  // Keep content services lazy at startup; only their bounded public refusal
  // contract is admitted here, never a database/provider error message.
  if (error instanceof Error && error.name==='KeywordInputRefusal' && 'status' in error && 'code' in error
    && typeof error.status==='number' && [404,409,503].includes(error.status) && typeof error.code==='string'
    && ['KEYWORD_SOURCE_NOT_FOUND','KEYWORD_SOURCE_CHANGED','KEYWORD_SOURCE_UNAVAILABLE','KEYWORD_LINKAGE_UNAVAILABLE','KEYWORD_HISTORY_UNAVAILABLE'].includes(error.code)) {
    res.status(error.status).json({error:error.message,code:error.code});return true;
  }
  if (error instanceof ProjectAdmissionRefusal) { res.status(error.status).json({ error: error.message, code: error.code }); return true; }
  if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid content request', details:error.flatten().fieldErrors }); return true; }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIGURE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/figures/generate
 * Generate a figure from data + specification.
 */
router.post('/figures/generate', async (req: Request, res: Response) => {
  try {
    const userId = sessionUserId(req);
    if (userId == null) return res.status(401).json({ error: 'A signed-in user is required' });
    const { generateFigure } = await import('../services/figureGenerationService.js');
    const body = figureRequestSchema.parse(req.body);
    const project = await requireProjectAdmission(req, String(body.projectId), true);
    const result = await generateFigure({ ...body, projectId: project.id,
      organizationId: project.organizationId, userId }, requestConnectable(req));
    if (!result.success) return res.status(result.storage?.status === 'unconfirmed' ? 503 : 422).json({ success:false, figure: result });
    res.json({ success: true, figure: result, meta: result.meta });
  } catch (error: any) {
    if (contentError(error, res)) return;
    logger.error('Figure generation failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'generating figures', error);
  }
});

/**
 * POST /api/audit-services/figures/auto-insert
 * Auto-detect and insert appropriate figures into a document.
 */
router.post('/figures/auto-insert', async (req: Request, res: Response) => {
  try {
    const userId = sessionUserId(req);
    if (userId == null) return res.status(401).json({ error: 'A signed-in user is required' });
    const { autoInsertFigures } = await import('../services/figureGenerationService.js');
    const body = z.object({ projectId:positiveProjectId, sectionCode:z.string().trim().min(1).max(100),
      content:z.string().min(1).max(100000) }).parse({ ...req.body, sectionCode:req.body?.sectionCode ?? req.body?.sectionType });
    const project = await requireProjectAdmission(req, String(body.projectId), true);
    const figures = await autoInsertFigures({ projectId:project.id, organizationId:project.organizationId,
      userId, sectionCode:body.sectionCode, sectionContent:body.content }, requestConnectable(req));
    const outcomes = figures.flatMap(result => result.meta ? [result.meta.auditTrail] : []);
    const meta = outcomes.length ? { auditTrail:combineAuditRowOutcomes(outcomes[0], ...outcomes.slice(1)) } : undefined;
    res.status(figures.some(result => !result.success) ? 422 : 200).json({ success:figures.every(result => result.success), figures, meta });
  } catch (error: any) {
    if (contentError(error, res)) return;
    logger.error('Auto figure insert failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving auto insert', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/export/pdf
 * Generate a PDF from a project/document.
 */
router.post('/export/pdf', async (req: Request, res: Response) => {
  try {
    const { generatePDF } = await getSvc<any>(() => import('../services/documentExportService.js'));
    const { projectId, title, options } = req.body;
    const user = (req as any).user;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const result = await generatePDF({
      projectId: Number(projectId),
      organizationId: Number(user?.organizationId),
      userId: Number(user?.id || user?.userId || 0),
      ...(options || {}),
    });

    if (!result.success) {
      return res.status(422).json({ success: false, error: result.error || 'PDF export failed' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${title ? String(title).replace(/\s+/g, '_') : result.filename}"`
    );
    res.setHeader('X-Export-Format', 'pdf');
    res.setHeader('X-Export-Page-Count', String(result.pageCount));
    return res.send(result.buffer);
  } catch (error: any) {
    logger.error('PDF export failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving PDF', error);
  }
});

/*
 * POST /api/audit-services/export/ectd was deleted on 2026-09-24. The one eCTD
 * export is POST /api/ectd/export/:submissionId (server/routes/ectd-export.ts),
 * over the same assembler; tests/unit/ectd-export-routes.test.ts, "the
 * canonical export", pins that it is reachable and that it refuses what this
 * endpoint shipped.
 *
 * This endpoint ran the structural validator and then sent the zip with 200
 * regardless, putting the verdict only in an X-ECTD-Valid header, which a
 * caller saving the download never reads. It also bypassed the export review
 * gate and the governed export record, and returned raw error text in its 500s.
 * It had no caller in the client, the scripts or the tests.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SENTENCE-LEVEL TRACEABILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/traceability/map
 * Map sentences in a document to their source evidence.
 */
router.post('/traceability/map', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/sentenceTraceabilityService.js'));
    const { documentId, content, projectId, persist = true } = req.body;
    const user = (req as any).user;
    const organizationId = Number(user?.organizationId);

    if (!content || !projectId || !organizationId) {
      return res.status(400).json({ error: 'content, projectId, and auth context are required' });
    }

    const sentences = svc.detectSentences(content);
    const traceLinks = await svc.mapSentencesToSources(
      sentences,
      Number(projectId),
      organizationId
    );

    let persisted = null;
    if (persist !== false && traceLinks.length > 0) {
      persisted = await svc.persistTraceLinks(
        traceLinks,
        Number(projectId),
        organizationId,
        String(documentId || `inline-${crypto.randomUUID().slice(0, 8)}`)
      );
    }

    return res.json({ success: true, sentences: sentences.length, traceLinks, persisted });
  } catch (error: any) {
    logger.error('Traceability mapping failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving map', error);
  }
});

/**
 * POST /api/audit-services/traceability/click-through
 * Resolve a click at a character offset to source evidence.
 */
router.post('/traceability/click-through', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/sentenceTraceabilityService.js'));
    const { content, charOffset, projectId } = req.body;
    const user = (req as any).user;
    const organizationId = Number(user?.organizationId);

    if (!content || charOffset === undefined || !projectId || !organizationId) {
      return res
        .status(400)
        .json({ error: 'content, charOffset, projectId, and auth context are required' });
    }

    const result = await svc.resolveClickThrough(
      String(content),
      Number(charOffset),
      Number(projectId),
      organizationId
    );

    return res.json({ success: true, clickThrough: result });
  } catch (error: any) {
    logger.error('Click-through failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving click through', error);
  }
});

/**
 * POST /api/audit-services/traceability/report
 * Generate a full traceability report for a document.
 */
router.post('/traceability/report', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/sentenceTraceabilityService.js'));
    const { content, documentId, projectId } = req.body;
    const user = (req as any).user;
    const organizationId = Number(user?.organizationId);

    if (!content || !projectId || !organizationId) {
      return res.status(400).json({ error: 'content, projectId, and auth context are required' });
    }

    const report = await svc.generateTraceabilityReport(
      String(documentId || `report-${crypto.randomUUID().slice(0, 8)}`),
      String(content),
      Number(projectId),
      organizationId
    );

    return res.json({ success: true, report });
  } catch (error: any) {
    logger.error('Traceability report failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving report', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/keywords/extract
 * Extract structured keywords from a document.
 */
router.post('/keywords/extract', async (req: Request, res: Response) => {
  try {
    const svc = await import('../services/keywordExtractionService.js');
    const body = z.object({ content:z.string().min(1).max(1000000), documentId:z.string().min(1).max(200),
      projectId:positiveProjectId, linkSources:z.boolean().optional(), sectionCode:z.string().max(100).optional(),
      maxKeywords:z.number().int().min(1).max(100).optional() }).parse(req.body);
    const project = await requireProjectAdmission(req, String(body.projectId), false);
    const keywords = await svc.extractKeywords(body.content, body.documentId, project.id, project.organizationId,
      { linkSources:body.linkSources, sectionCode:body.sectionCode, maxKeywords:body.maxKeywords,
        userId:Number(req.user?.id ?? req.user?.userId) });
    res.json({ success: true, keywords, meta:keywords.meta });
  } catch (error: any) {
    if (contentError(error, res)) return;
    logger.error('Keyword extraction failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving extract', error);
  }
});

/**
 * POST /api/audit-services/keywords/consistency
 * Check keyword consistency across multiple documents.
 */
router.post('/keywords/consistency', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    if (sessionUserId(req) == null) return res.status(401).json({ error: 'A signed-in user is required' });
    const { documents } = z.object({ documents:z.array(z.object({
      id:z.string().trim().min(1).max(200), title:z.string().max(500).optional(),
      content:z.string().max(1000000),
    })).min(2).max(100) }).parse(req.body);
    // This comparison uses only the supplied texts. It reads no stored source
    // and makes no assertion about a private document's identity or availability.
    const svc = await import('../services/keywordExtractionService.js');
    const result = await svc.checkKeywordConsistency(documents);
    res.json({ success:true, consistency:result });
  } catch (error: any) {
    if (contentError(error, res)) return;
    logger.error('Keyword consistency check failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving consistency', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-EXTRACTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/extraction/queue
 * Queue a stored artifact for automatic extraction.
 *
 * HISTORY (2026-08-14). This route returned 500 on EVERY call. `queueExtraction`
 * is positional — `(fileId, fileName, fileSize, projectId, organizationId,
 * userId, options)` — and this passed it a single object, so `fileName` arrived
 * undefined and `detectFileType(fileName)` threw on `.split`. It is the
 * pipeline's only entry point and has no other caller, so the pipeline could
 * not run at all.
 *
 * The body contract was wrong as well as the call: it demanded `fileContent`,
 * which the pipeline has no parameter for and never reads. Extraction resolves
 * its source text by artifact id (`concept2cure_artifacts.artifact_id`), so the
 * route now takes `fileId`.
 *
 * Repaired in the SAME change as the fabrication in `extractText`, on purpose.
 * That function used to answer with an invented placeholder string when it
 * could not read the source, which the caller then hashed and stored as a
 * governed `category:'extracted'` artifact. Fixing this route on its own would
 * have switched on a pipeline that writes fabricated content as evidence — the
 * bug being latent was the only thing preventing it.
 */
router.post('/extraction/queue', async (req: Request, res: Response) => {
  try {
    const svc = await import('../services/autoExtractionPipeline.js');
    const body = z.object({ fileId:z.string().min(1).max(200),fileName:z.string().min(1).max(500),
      fileSize:z.number().int().nonnegative(),projectId:positiveProjectId,priority:z.number().int().min(1).max(100).optional() }).parse(req.body);
    const project = await requireProjectAdmission(req, String(body.projectId), true);
    const job = await svc.queueExtraction(body.fileId, body.fileName, body.fileSize, project.id,
      project.organizationId, Number(req.user?.id ?? req.user?.userId), { priority:body.priority,
        beforeProcess:async()=>{await requireProjectAdmission(req,String(project.id),true);} });
    res.json({ success:true, jobId:job.id, job, meta:job.meta, persistence:'process-local' });
  } catch (error: any) {
    if (contentError(error, res)) return;
    logger.error('Extraction queue failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving queue', error);
  }
});

/**
 * GET /api/audit-services/extraction/status/:jobId
 * Check extraction job status.
 */
router.get('/extraction/status/:jobId', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;

    const svc = await import('../services/autoExtractionPipeline.js');
    // Scoped to the caller's organization: a job owned by another tenant 404s
    // exactly like one that does not exist, so this cannot be used to probe
    // for job ids.
    const job = svc.getExtractionStatus(String(req.params.jobId), guard.orgId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await requireProjectAdmission(req, String(job.projectId), false);
    setAuditRowHeaders(res, job.meta?.auditTrail);
    res.json({ success: true, job, meta:job.meta, persistence:'process-local' });
  } catch (error: any) {
    if (contentError(error, res)) return;
    return serverError(res, logger, 'loading status', error);
  }
});

/**
 * GET /api/audit-services/extraction/project/:projectId
 * List all extraction jobs for a project.
 */
router.get('/extraction/project/:projectId', async (req: Request, res: Response) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;

    const svc = await import('../services/autoExtractionPipeline.js');
    // A project must be admitted before exposing any process-local job content.
    const project = await requireProjectAdmission(req, String(req.params.projectId), false);
    const jobs = svc.getProjectExtractionJobs(project.id, guard.orgId);
    const outcomes = jobs.flatMap(job => job.meta ? [job.meta.auditTrail] : []);
    const meta = outcomes.length ? { auditTrail:combineAuditRowOutcomes(outcomes[0], ...outcomes.slice(1)) } : undefined;
    setAuditRowHeaders(res, meta?.auditTrail);
    res.json({ success: true, jobs, meta, persistence:'process-local' });
  } catch (error: any) {
    if (contentError(error, res)) return;
    return serverError(res, logger, 'loading project', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE SCORING & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/confidence/compute
 * Auto-compute confidence score for an evidence object.
 */
router.post('/confidence/compute', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/confidenceScoringEngine.js'));
    const { evidenceId } = req.body;
    const user = (req as any).user;

    if (!evidenceId) {
      return res.status(400).json({ error: 'evidenceId is required' });
    }

    const score = await svc.computeEvidenceConfidence(evidenceId, user?.organizationId);

    res.json({ success: true, score });
  } catch (error: any) {
    logger.error('Confidence computation failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving compute', error);
  }
});

/**
 * POST /api/audit-services/confidence/batch
 * Batch-compute confidence scores for all evidence in org.
 */
router.post('/confidence/batch', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/confidenceScoringEngine.js'));
    const { limit, onlyUnscored } = req.body;
    const user = (req as any).user;

    const result = await svc.batchComputeConfidence(user?.organizationId, {
      limit: limit || 500,
      onlyUnscored: onlyUnscored !== false,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Batch confidence failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving batch', error);
  }
});

/**
 * POST /api/audit-services/verification/verify-claim
 * Verify a single claim against source evidence.
 */
router.post('/verification/verify-claim', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/confidenceScoringEngine.js'));
    const { claimText, sourceEvidenceIds, options } = req.body;
    const user = (req as any).user;

    if (!claimText) {
      return res.status(400).json({ error: 'claimText is required' });
    }

    const result = await svc.verifyClaim(
      claimText,
      sourceEvidenceIds || [],
      user?.organizationId,
      options || {}
    );

    res.json({ success: true, verification: result });
  } catch (error: any) {
    logger.error('Claim verification failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving verify claim', error);
  }
});

/**
 * POST /api/audit-services/verification/batch-verify
 * Batch-verify all claims in a document.
 */
router.post('/verification/batch-verify', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/confidenceScoringEngine.js'));
    const { content, projectId } = req.body;
    const user = (req as any).user;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await svc.batchVerifyDocument(
      content,
      projectId || 0,
      user?.organizationId
    );

    res.json({ success: true, verification: result });
  } catch (error: any) {
    logger.error('Batch verification failed', { err: error instanceof Error ? error.message : String(error) });
    return serverError(res, logger, 'saving batch verify', error);
  }
});

export default router;
