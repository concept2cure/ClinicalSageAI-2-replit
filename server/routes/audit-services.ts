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

import { createScopedLogger } from '../utils/logger.js';
import { serverError } from '../lib/api-response';

const logger = createScopedLogger('audit-services');

const router = Router();

// Lazy-import services to avoid startup crashes if deps are missing
async function getSvc<T>(loader: () => Promise<unknown>): Promise<T> {
  return (await loader()) as T;
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
    const { generateFigure } = await getSvc<any>(() => import('../services/figureGenerationService.js'));
    const { projectId, figureType, title, dataSource, options } = req.body;
    const user = (req as any).user;

    if (!projectId || !figureType) {
      return res.status(400).json({ error: 'projectId and figureType are required' });
    }

    const result = await generateFigure({
      projectId,
      figureType,
      title: title || `${figureType} Figure`,
      dataSource,
      options,
      organizationId: user?.organizationId,
      userId: user?.id || user?.userId || 0,
    });

    res.json({ success: true, figure: result });
  } catch (error: any) {
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
    const { autoInsertFigures } = await getSvc<any>(() => import('../services/figureGenerationService.js'));
    const { projectId, sectionType, content } = req.body;
    const user = (req as any).user;

    if (!projectId || !content) {
      return res.status(400).json({ error: 'projectId and content are required' });
    }

    const result = await autoInsertFigures(
      projectId,
      sectionType || 'general',
      content,
      user?.organizationId,
      user?.id || user?.userId || 0
    );

    res.json({ success: true, figures: result });
  } catch (error: any) {
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

/**
 * POST /api/audit-services/export/ectd
 * Assemble an eCTD package from the canonical submission spine (submissions →
 * ectd_sequences → submission_leaves) via the ONE canonical generator,
 * `ectd/assemble-from-core`. `projectId` is the canonical submissions.id; a
 * submission with no sequence or placed leaves is an honest 404/refusal, never
 * a placeholder package.
 */
router.post('/export/ectd', async (req: Request, res: Response) => {
  try {
    const { assembleSubmissionEctd } = await getSvc<any>(() => import('../services/ectd/assemble-from-core.js'));
    const { validateEctdPackage } = await getSvc<any>(() =>
      import('../services/submission-gateways/ectd-structural-validator.js'));
    const { projectId, applicationNumber, sequenceNumber, region, validateAfter } = req.body;
    const user = (req as any).user;

    if (!projectId || !applicationNumber) {
      return res.status(400).json({ error: 'projectId and applicationNumber are required' });
    }

    const result = await assembleSubmissionEctd({
      submissionId: Number(projectId),
      organizationId: Number(user?.organizationId),
      userId: Number(user?.id || user?.userId || 0),
      applicationNumber,
      sequenceNumber: sequenceNumber || undefined,
      // Cross-check only: the sequence's recorded region is authoritative and a
      // contradicting request is refused, never silently honored.
      region: region || undefined,
    });

    const validation = validateAfter === false ? null : await validateEctdPackage(result.buffer);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Export-Format', 'ectd');
    res.setHeader('X-ECTD-Total-Modules', String(result.stats.totalModules));
    res.setHeader('X-ECTD-Total-Files', String(result.stats.totalFiles));
    res.setHeader('X-ECTD-Generated-At', result.stats.generatedAt);
    // Surface submission-completeness here too (parity with /api/ectd/export) so
    // any caller of this export path can see how much of the dossier could not
    // be materialized, not just the module/file counts.
    if (result.stats.completeness) {
      res.setHeader('X-ECTD-Completeness-Pct', String(result.stats.completeness.completenessPct));
      res.setHeader('X-ECTD-Incomplete-Leaves', String(result.stats.completeness.placeholderLeaves));
      res.setHeader('X-ECTD-Submission-Complete', String(result.stats.completeness.complete));
    }
    res.setHeader('X-ECTD-Index-XML-Path', 'index.xml');
    // The canonical packager nests the regional backbone under m1/<code>/.
    const coreRegion = String(result.region || '').toLowerCase();
    const regionCode = ['eu', 'ema'].includes(coreRegion) ? 'eu'
      : ['jp', 'pmda'].includes(coreRegion) ? 'jp'
      : 'us';
    res.setHeader('X-ECTD-Regional-XML-Path', `m1/${regionCode}/${regionCode}-regional.xml`);
    res.setHeader('X-ECTD-Sequence', result.sequenceNumber);
    if (validation) {
      res.setHeader('X-ECTD-Valid', String(validation.valid));
      res.setHeader('X-ECTD-Validation-Errors', String(validation.errors.length));
    }
    return res.send(result.buffer);
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('eCTD export failed', { err: msg });
    // A submission/sequence that does not exist in the caller's org is a 404,
    // not a server failure.
    if (/not found/i.test(msg)) {
      return res.status(404).json({ error: msg });
    }
    res.status(500).json({ error: msg || 'eCTD export failed' });
  }
});

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
    const svc = await getSvc<any>(() => import('../services/keywordExtractionService.js'));
    const { content, linkSources } = req.body;
    const user = (req as any).user;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const keywords = await svc.extractKeywords(content, user?.organizationId, {
      linkSources: linkSources !== false,
    });

    res.json({ success: true, keywords });
  } catch (error: any) {
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
    const svc = await getSvc<any>(() => import('../services/keywordExtractionService.js'));
    const { documents } = req.body;
    const user = (req as any).user;

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'documents array is required' });
    }

    const result = await svc.checkKeywordConsistency(
      documents.map((d: any) => ({
        id: d.id || crypto.randomUUID(),
        title: d.title || 'Untitled',
        content: d.content,
      })),
      user?.organizationId
    );

    res.json({ success: true, consistency: result });
  } catch (error: any) {
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
    const svc = await getSvc<any>(() => import('../services/autoExtractionPipeline.js'));
    const { fileId, fileName, fileSize, projectId, priority } = req.body ?? {};
    const user = (req as any).user;

    if (!fileId || !fileName) {
      return res.status(400).json({ error: 'fileId and fileName are required' });
    }
    // Tenant comes from the authenticated context, never the body, and its
    // absence is a refusal rather than an extraction attributed to org 0.
    const organizationId = Number(user?.organizationId);
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const jobId = await svc.queueExtraction(
      String(fileId),
      String(fileName),
      Number.isFinite(Number(fileSize)) ? Number(fileSize) : 0,
      Number(projectId) || 0,
      organizationId,
      Number(user?.id ?? user?.userId) || 0,
      { priority: Number(priority) || 5 },
    );

    res.json({ success: true, jobId });
  } catch (error: any) {
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
    const svc = await getSvc<any>(() => import('../services/autoExtractionPipeline.js'));
    const job = svc.getExtractionStatus(String(req.params.jobId));

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ success: true, job });
  } catch (error: any) {
    return serverError(res, logger, 'loading status', error);
  }
});

/**
 * GET /api/audit-services/extraction/project/:projectId
 * List all extraction jobs for a project.
 */
router.get('/extraction/project/:projectId', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>(() => import('../services/autoExtractionPipeline.js'));
    const jobs = svc.getProjectExtractionJobs(parseInt(String(req.params.projectId)));
    res.json({ success: true, jobs });
  } catch (error: any) {
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
