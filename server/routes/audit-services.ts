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

const router = Router();

function requireOrgId(req: Request, res: Response): number | null {
  const orgId = (req as any).user?.organizationId;
  if (!orgId) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

// Lazy-import services to avoid startup crashes if deps are missing
async function getSvc<T>(path: string): Promise<T> {
  return (await import(path)) as T;
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
    const { generateFigure } = await getSvc<any>('../services/figureGenerationService.js');
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
    console.error('[AuditServices] Figure generation failed:', error);
    res.status(500).json({ error: error.message || 'Figure generation failed' });
  }
});

/**
 * POST /api/audit-services/figures/auto-insert
 * Auto-detect and insert appropriate figures into a document.
 */
router.post('/figures/auto-insert', async (req: Request, res: Response) => {
  try {
    const { autoInsertFigures } = await getSvc<any>('../services/figureGenerationService.js');
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
    console.error('[AuditServices] Auto figure insert failed:', error);
    res.status(500).json({ error: error.message || 'Auto figure insert failed' });
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
    const { PDFConverter } = await getSvc<any>('../services/documentExportService.js');
    const converter = new PDFConverter();
    const { projectId, title, options } = req.body;
    const user = (req as any).user;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const result = await converter.generatePDF(
      projectId,
      user?.organizationId,
      title || 'Document Export',
      options || {}
    );

    res.json({ success: true, export: result });
  } catch (error: any) {
    console.error('[AuditServices] PDF export failed:', error);
    res.status(500).json({ error: error.message || 'PDF export failed' });
  }
});

/**
 * POST /api/audit-services/export/ectd
 * Assemble an eCTD XML backbone package.
 */
router.post('/export/ectd', async (req: Request, res: Response) => {
  try {
    const { ECTDExportPackager } = await getSvc<any>('../services/documentExportService.js');
    const packager = new ECTDExportPackager();
    const { projectId, applicationNumber, sequenceNumber, region, lifecycle } = req.body;
    const user = (req as any).user;

    if (!projectId || !applicationNumber) {
      return res.status(400).json({ error: 'projectId and applicationNumber are required' });
    }

    const result = await packager.assembleECTDPackage(projectId, user?.organizationId, {
      applicationNumber,
      sequenceNumber: sequenceNumber || '0000',
      region: region || 'us',
      lifecycleOperations: lifecycle || {},
    });

    res.json({ success: true, ectdPackage: result });
  } catch (error: any) {
    console.error('[AuditServices] eCTD export failed:', error);
    res.status(500).json({ error: error.message || 'eCTD export failed' });
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
    const svc = await getSvc<any>('../services/sentenceTraceabilityService.js');
    const { documentId, content, projectId, sources } = req.body;
    const user = (req as any).user;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const sentences = svc.detectSentences(content);
    const traceLinks = await svc.mapSentencesToSources(
      sentences,
      sources || [],
      documentId || 'inline',
      user?.organizationId
    );

    res.json({ success: true, sentences: sentences.length, traceLinks });
  } catch (error: any) {
    console.error('[AuditServices] Traceability mapping failed:', error);
    res.status(500).json({ error: error.message || 'Traceability mapping failed' });
  }
});

/**
 * POST /api/audit-services/traceability/click-through
 * Resolve a click at a character offset to source evidence.
 */
router.post('/traceability/click-through', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/sentenceTraceabilityService.js');
    const { content, charOffset, sources } = req.body;

    if (!content || charOffset === undefined) {
      return res.status(400).json({ error: 'content and charOffset are required' });
    }

    const sentences = svc.detectSentences(content);
    const traceLinks = await svc.mapSentencesToSources(
      sentences,
      sources || [],
      'click-through',
      (req as any).user?.organizationId
    );
    const result = svc.resolveClickThrough(charOffset, sentences, traceLinks);

    res.json({ success: true, clickThrough: result });
  } catch (error: any) {
    console.error('[AuditServices] Click-through failed:', error);
    res.status(500).json({ error: error.message || 'Click-through resolution failed' });
  }
});

/**
 * POST /api/audit-services/traceability/report
 * Generate a full traceability report for a document.
 */
router.post('/traceability/report', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/sentenceTraceabilityService.js');
    const { content, documentId, sources } = req.body;
    const user = (req as any).user;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const sentences = svc.detectSentences(content);
    const traceLinks = await svc.mapSentencesToSources(
      sentences,
      sources || [],
      documentId || 'report',
      user?.organizationId
    );
    const report = svc.generateTraceabilityReport(documentId || 'report', sentences, traceLinks);

    res.json({ success: true, report });
  } catch (error: any) {
    console.error('[AuditServices] Traceability report failed:', error);
    res.status(500).json({ error: error.message || 'Traceability report generation failed' });
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
    const svc = await getSvc<any>('../services/keywordExtractionService.js');
    const { content, projectId, linkSources } = req.body;
    const user = (req as any).user;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const keywords = await svc.extractKeywords(content, user?.organizationId, {
      linkSources: linkSources !== false,
    });

    res.json({ success: true, keywords });
  } catch (error: any) {
    console.error('[AuditServices] Keyword extraction failed:', error);
    res.status(500).json({ error: error.message || 'Keyword extraction failed' });
  }
});

/**
 * POST /api/audit-services/keywords/consistency
 * Check keyword consistency across multiple documents.
 */
router.post('/keywords/consistency', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/keywordExtractionService.js');
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
    console.error('[AuditServices] Keyword consistency check failed:', error);
    res.status(500).json({ error: error.message || 'Keyword consistency check failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-EXTRACTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/audit-services/extraction/queue
 * Queue a file for automatic extraction.
 */
router.post('/extraction/queue', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/autoExtractionPipeline.js');
    const { fileName, fileContent, fileType, projectId, priority } = req.body;
    const user = (req as any).user;

    if (!fileName || !fileContent) {
      return res.status(400).json({ error: 'fileName and fileContent are required' });
    }

    const jobId = await svc.queueExtraction({
      fileName,
      fileContent,
      fileType,
      projectId: projectId || 0,
      organizationId: user?.organizationId,
      userId: user?.id || user?.userId || 0,
      priority: priority || 5,
    });

    res.json({ success: true, jobId });
  } catch (error: any) {
    console.error('[AuditServices] Extraction queue failed:', error);
    res.status(500).json({ error: error.message || 'Extraction queue failed' });
  }
});

/**
 * GET /api/audit-services/extraction/status/:jobId
 * Check extraction job status.
 */
router.get('/extraction/status/:jobId', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/autoExtractionPipeline.js');
    const job = svc.getExtractionStatus(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ success: true, job });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Status check failed' });
  }
});

/**
 * GET /api/audit-services/extraction/project/:projectId
 * List all extraction jobs for a project.
 */
router.get('/extraction/project/:projectId', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/autoExtractionPipeline.js');
    const jobs = svc.getProjectExtractionJobs(parseInt(req.params.projectId));
    res.json({ success: true, jobs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Job listing failed' });
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
    const svc = await getSvc<any>('../services/confidenceScoringEngine.js');
    const { evidenceId } = req.body;
    const user = (req as any).user;

    if (!evidenceId) {
      return res.status(400).json({ error: 'evidenceId is required' });
    }

    const score = await svc.computeEvidenceConfidence(evidenceId, user?.organizationId);

    res.json({ success: true, score });
  } catch (error: any) {
    console.error('[AuditServices] Confidence computation failed:', error);
    res.status(500).json({ error: error.message || 'Confidence computation failed' });
  }
});

/**
 * POST /api/audit-services/confidence/batch
 * Batch-compute confidence scores for all evidence in org.
 */
router.post('/confidence/batch', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/confidenceScoringEngine.js');
    const { limit, onlyUnscored } = req.body;
    const user = (req as any).user;

    const result = await svc.batchComputeConfidence(user?.organizationId, {
      limit: limit || 500,
      onlyUnscored: onlyUnscored !== false,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[AuditServices] Batch confidence failed:', error);
    res.status(500).json({ error: error.message || 'Batch confidence computation failed' });
  }
});

/**
 * POST /api/audit-services/verification/verify-claim
 * Verify a single claim against source evidence.
 */
router.post('/verification/verify-claim', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/confidenceScoringEngine.js');
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
    console.error('[AuditServices] Claim verification failed:', error);
    res.status(500).json({ error: error.message || 'Claim verification failed' });
  }
});

/**
 * POST /api/audit-services/verification/batch-verify
 * Batch-verify all claims in a document.
 */
router.post('/verification/batch-verify', async (req: Request, res: Response) => {
  try {
    const svc = await getSvc<any>('../services/confidenceScoringEngine.js');
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
    console.error('[AuditServices] Batch verification failed:', error);
    res.status(500).json({ error: error.message || 'Batch verification failed' });
  }
});

export default router;
